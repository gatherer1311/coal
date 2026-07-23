// src/renderer/minibuffer.browser.test.ts
import { describe, expect, test } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { Minibuffer } from "./minibuffer";
import type { QuickPickItem } from "../kernel/minibuffer/types";

const items: QuickPickItem[] = [
  { id: "core.file.open", label: "Open File…" },
  { id: "core.file.save", label: "Save" },
  { id: "core.app.quit", label: "Quit" },
];

describe("Minibuffer (design §3 native overlay + quickPick)", () => {
  test("type to filter, Enter resolves the selected item", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items, { prompt: ">", placeholder: "Run a command" });
    expect(mb.isOpen()).toBe(true);

    await userEvent.keyboard("save");
    await userEvent.keyboard("{Enter}");

    expect((await pick)?.id).toBe("core.file.save");
    expect(mb.isOpen()).toBe(false);
    host.remove();
  });

  test("Escape resolves undefined and closes", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items);
    await userEvent.keyboard("{Escape}");

    expect(await pick).toBeUndefined();
    expect(mb.isOpen()).toBe(false);
    host.remove();
  });

  test("ArrowDown moves the selection before accepting", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items); // no query -> [Open File…, Save, Quit], selected 0
    await userEvent.keyboard("{ArrowDown}{Enter}"); // move to Save

    expect((await pick)?.id).toBe("core.file.save");
    host.remove();
  });

  test("a non-matching query shows the empty row and Enter is a no-op", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items);
    await userEvent.keyboard("zzzz");
    expect(host.querySelector(".coal-mb-item")).toBeNull();
    expect(host.querySelector(".coal-mb-empty")).not.toBeNull();

    await userEvent.keyboard("{Enter}"); // selected() is undefined -> resolves undefined
    expect(await pick).toBeUndefined();
    host.remove();
  });
});
