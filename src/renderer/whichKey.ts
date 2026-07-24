// src/renderer/whichKey.ts

const STYLE_ID = "coal-whichkey-style";
const CSS = `
.coal-whichkey {
  position: fixed; left: 0; right: 0; bottom: 0; display: none; flex-direction: column;
  font: 12px/1.5 monospace; background: #141414; color: #ddd; border-top: 1px solid #333;
  padding: 4px 8px; max-height: 40vh; overflow-y: auto; z-index: 20;
}
.coal-whichkey.open { display: flex; }
.coal-whichkey-pending { opacity: 0.7; margin-bottom: 2px; }
.coal-whichkey-row { display: flex; gap: 8px; }
.coal-whichkey-chord { color: #9be29b; min-width: 8em; }
`;

/** One continuation: the next chord + the command it (eventually) runs. */
export interface WhichKeyEntry {
  readonly chord: string;
  readonly title: string;
}

/** The bottom continuation panel shown while a prefix sequence is pending (design §8). */
export class WhichKey {
  readonly #root: HTMLDivElement;
  readonly #pending: HTMLDivElement;
  readonly #list: HTMLDivElement;

  constructor(host: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.#root = document.createElement("div");
    this.#root.className = "coal-whichkey";
    this.#pending = document.createElement("div");
    this.#pending.className = "coal-whichkey-pending";
    this.#list = document.createElement("div");
    this.#root.append(this.#pending, this.#list);
    host.appendChild(this.#root);
  }

  show(pending: string, entries: readonly WhichKeyEntry[]): void {
    this.#pending.textContent = `${pending} -`;
    this.#list.textContent = "";
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "coal-whichkey-row";
      const chord = document.createElement("span");
      chord.className = "coal-whichkey-chord";
      chord.textContent = entry.chord;
      const title = document.createElement("span");
      title.textContent = entry.title;
      row.append(chord, title);
      this.#list.appendChild(row);
    }
    this.#root.classList.add("open");
  }

  hide(): void {
    this.#root.classList.remove("open");
  }

  isOpen(): boolean {
    return this.#root.classList.contains("open");
  }
}
