const STYLE_ID = "coal-echo-style";
const CSS = `
.coal-echo {
  position: fixed; left: 0; right: 0; bottom: 0; display: none;
  font: 12px/1.6 monospace; background: #101010; color: #cfe3ff;
  border-top: 1px solid #333; padding: 2px 8px; white-space: pre-wrap; z-index: 30;
}
.coal-echo.open { display: block; }
`;

/**
 * A minimized echo area (design §8, Emacs's echo area / *Help* buffer): a
 * transient bottom text surface for Describe-Key/Command output and the
 * "<sequence> is not bound" messages.
 */
export class EchoArea {
  readonly #root: HTMLDivElement;

  constructor(host: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.#root = document.createElement("div");
    this.#root.className = "coal-echo";
    host.appendChild(this.#root);
  }

  message(text: string): void {
    this.#root.textContent = text;
    this.#root.classList.add("open");
  }

  clear(): void {
    this.#root.textContent = "";
    this.#root.classList.remove("open");
  }

  get text(): string {
    return this.#root.textContent ?? "";
  }
}
