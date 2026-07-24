// src/renderer/minibuffer.browser.test.ts
import { describe, expect, test } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { Minibuffer } from "./minibuffer";
import type { QuickPickItem } from "../kernel/minibuffer/types";

const items: QuickPickItem[] = [
  { id: "core.file.open", label: "Open File…" },
  { id: "core.file.save", label: "Save", keyHint: "Ctrl-x Ctrl-s" },
  { id: "core.app.quit", label: "Quit" },
];

function mount(): { host: HTMLElement; mb: Minibuffer } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return { host, mb: new Minibuffer(host) };
}

describe("Minibuffer (design §3/§7/§8)", () => {
  test("type to filter, accept() resolves the selected item", async () => {
    const { host, mb } = mount();
    const pick = mb.quickPick(items, { prompt: ">", placeholder: "Run a command" });
    expect(mb.isOpen()).toBe(true);
    await userEvent.keyboard("save");
    mb.accept();
    expect((await pick)?.id).toBe("core.file.save");
    expect(mb.isOpen()).toBe(false);
    host.remove();
  });

  test("cancel() resolves undefined and closes", async () => {
    const { host, mb } = mount();
    const pick = mb.quickPick(items);
    mb.cancel();
    expect(await pick).toBeUndefined();
    host.remove();
  });

  test("next() moves the selection before accepting", async () => {
    const { host, mb } = mount();
    const pick = mb.quickPick(items); // [Open File…, Save, Quit], selected 0
    mb.next(); // -> Save
    mb.accept();
    expect((await pick)?.id).toBe("core.file.save");
    host.remove();
  });

  test("a row renders its keyHint", async () => {
    const { host, mb } = mount();
    void mb.quickPick(items);
    expect(host.querySelector(".coal-mb-keyhint")?.textContent).toBe("Ctrl-x Ctrl-s");
    host.remove();
  });

  test("onDidChangeOpen reports open then close", async () => {
    const { host, mb } = mount();
    const seen: boolean[] = [];
    mb.onDidChangeOpen((open) => seen.push(open));
    const pick = mb.quickPick(items);
    mb.cancel();
    await pick;
    expect(seen).toEqual([true, false]);
    host.remove();
  });

  test("readKeySequence captures a single chord and resolves it", async () => {
    const { host, mb } = mount();
    const seq = mb.readKeySequence();
    await userEvent.keyboard("{Control>}s{/Control}"); // Ctrl-s
    expect(await seq).toBe("Ctrl-s");
    host.remove();
  });

  test("readKeySequence continues while continueWhile is true", async () => {
    const { host, mb } = mount();
    const seq = mb.readKeySequence({ continueWhile: (s) => s === "Ctrl-x" });
    await userEvent.keyboard("{Control>}x{/Control}"); // Ctrl-x -> continue
    await userEvent.keyboard("{Control>}s{/Control}"); // Ctrl-s -> stop
    expect(await seq).toBe("Ctrl-x Ctrl-s");
    host.remove();
  });
});
