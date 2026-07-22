// src/renderer/editor.browser.test.ts
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { createEditor } from "./editor";

describe("createEditor (design §6 keymap generated from the registry)", () => {
  test("façade get/set text and clean/dirty lifecycle", () => {
    const onDirty = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createEditor(host, onDirty);

    editor.facade.setText("hello");
    expect(editor.facade.getText()).toBe("hello");
    expect(editor.facade.isDirty()).toBe(false);

    editor.view.dispatch({ changes: { from: 5, insert: "!" } });
    expect(editor.facade.getText()).toBe("hello!");
    expect(editor.facade.isDirty()).toBe(true);
    expect(onDirty).toHaveBeenLastCalledWith(true);

    editor.facade.markClean();
    expect(editor.facade.isDirty()).toBe(false);
    expect(onDirty).toHaveBeenLastCalledWith(false);

    editor.destroy();
    host.remove();
  });

  test("a registered binding dispatches its command id on keypress", async () => {
    const dispatch = vi.fn(() => true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createEditor(host, () => {});
    editor.setBindings([{ keys: "Ctrl-s", command: "core.file.save" }], dispatch);
    editor.view.focus();

    await userEvent.keyboard("{Control>}s{/Control}");
    expect(dispatch).toHaveBeenCalledWith("core.file.save");

    editor.destroy();
    host.remove();
  });
});
