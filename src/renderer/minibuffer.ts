import { QuickPickModel } from "../kernel/minibuffer/quickPick";
import type { QuickPickItem, QuickPickOptions, RankedItem } from "../kernel/minibuffer/types";

const STYLE_ID = "coal-minibuffer-style";
const CSS = `
.coal-minibuffer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: none; flex-direction: column;
  font: 13px/1.5 monospace; background: #1b1b1b; color: #e8e8e8;
  border-top: 1px solid #333;
}
.coal-minibuffer.open { display: flex; }
.coal-mb-list { list-style: none; margin: 0; padding: 0; max-height: 40vh; overflow-y: auto; }
.coal-mb-item { display: flex; justify-content: space-between; padding: 2px 8px; }
.coal-mb-item.selected { background: #2f5d3a; }
.coal-mb-match { font-weight: bold; color: #9be29b; }
.coal-mb-desc { opacity: 0.6; margin-left: 1em; }
.coal-mb-empty { padding: 2px 8px; opacity: 0.6; }
.coal-mb-input-row { display: flex; align-items: center; padding: 2px 8px; border-top: 1px solid #333; }
.coal-mb-prompt { margin-right: 6px; opacity: 0.8; }
.coal-mb-input { flex: 1; background: transparent; border: none; color: inherit; font: inherit; outline: none; }
`;

/**
 * The bottom-docked command minibuffer (design §3). Renders a QuickPickModel as a
 * native overlay; keyboard-driven; captures its own keys while open so they do not
 * leak to the editor or the window-global handler.
 */
export class Minibuffer {
  readonly #root: HTMLDivElement;
  readonly #list: HTMLUListElement;
  readonly #promptEl: HTMLSpanElement;
  readonly #input: HTMLInputElement;
  #open = false;
  #model: QuickPickModel | null = null;
  #resolve: ((item: QuickPickItem | undefined) => void) | null = null;
  #prevFocus: Element | null = null;

  constructor(host: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.#root = document.createElement("div");
    this.#root.className = "coal-minibuffer";
    this.#list = document.createElement("ul");
    this.#list.className = "coal-mb-list";

    const row = document.createElement("div");
    row.className = "coal-mb-input-row";
    this.#promptEl = document.createElement("span");
    this.#promptEl.className = "coal-mb-prompt";
    this.#input = document.createElement("input");
    this.#input.className = "coal-mb-input";
    this.#input.type = "text";
    row.append(this.#promptEl, this.#input);

    this.#root.append(this.#list, row);
    host.appendChild(this.#root);

    this.#input.addEventListener("input", () => {
      this.#model?.setQuery(this.#input.value);
      this.#render();
    });
    this.#input.addEventListener("keydown", (e) => this.#onKeydown(e));
  }

  isOpen(): boolean {
    return this.#open;
  }

  quickPick(
    items: QuickPickItem[],
    opts: QuickPickOptions = {},
  ): Promise<QuickPickItem | undefined> {
    this.#model = new QuickPickModel(items);
    this.#prevFocus = document.activeElement;
    this.#promptEl.textContent = opts.prompt ?? ">";
    this.#input.value = "";
    this.#input.placeholder = opts.placeholder ?? "";
    this.#render();
    this.#root.classList.add("open");
    this.#open = true;
    this.#input.focus();
    return new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  #onKeydown(e: KeyboardEvent): void {
    if (!this.#open || e.isComposing) return;
    const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
    const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");

    if (e.key === "Enter") {
      this.#finish(this.#model?.selected());
    } else if (e.key === "Escape") {
      this.#finish(undefined);
    } else if (down) {
      this.#model?.moveDown();
      this.#render();
    } else if (up) {
      this.#model?.moveUp();
      this.#render();
    } else {
      return; // ordinary typing flows into the input (fires the 'input' listener)
    }
    e.preventDefault();
    e.stopPropagation();
  }

  #finish(item: QuickPickItem | undefined): void {
    this.#root.classList.remove("open");
    this.#open = false;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#model = null;
    if (this.#prevFocus instanceof HTMLElement) this.#prevFocus.focus();
    resolve?.(item);
  }

  #render(): void {
    const results = this.#model?.results ?? [];
    const selected = this.#model?.selectedIndex ?? 0;
    this.#list.textContent = "";

    if (results.length === 0) {
      const empty = document.createElement("li");
      empty.className = "coal-mb-empty";
      empty.textContent = "No matching commands";
      this.#list.appendChild(empty);
      return;
    }

    results.forEach((r, i) => this.#list.appendChild(this.#renderItem(r, i === selected)));
  }

  #renderItem(r: RankedItem, isSelected: boolean): HTMLLIElement {
    const li = document.createElement("li");
    li.className = isSelected ? "coal-mb-item selected" : "coal-mb-item";

    const label = document.createElement("span");
    const positions = new Set(r.positions);
    for (let i = 0; i < r.item.label.length; i++) {
      const span = document.createElement("span");
      span.textContent = r.item.label[i]!;
      if (positions.has(i)) span.className = "coal-mb-match";
      label.appendChild(span);
    }
    li.appendChild(label);

    if (r.item.description) {
      const desc = document.createElement("span");
      desc.className = "coal-mb-desc";
      desc.textContent = r.item.description;
      li.appendChild(desc);
    }
    return li;
  }
}
