// src/renderer/editor.browser.test.ts
import { describe, expect, test, vi } from "vitest";
import { createEditor } from "./editor";

describe("createEditor (facade get/set text and dirty lifecycle)", () => {
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
});
