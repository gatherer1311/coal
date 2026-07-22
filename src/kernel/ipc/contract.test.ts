// src/kernel/ipc/contract.test.ts
import { describe, expect, test } from "vitest";
import { IPC } from "./contract";

describe("IPC contract (design §3 typed channels)", () => {
  test("channel names are namespaced under coal: and unique", () => {
    const values = Object.values(IPC);
    expect(values.every((c) => c.startsWith("coal:"))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  test("exposes the expected channel set", () => {
    expect(IPC).toEqual({
      fileOpen: "coal:file.open",
      fileSave: "coal:file.save",
      docSetDirty: "coal:doc.setDirty",
      docOpened: "coal:doc.opened",
      appQuit: "coal:app.quit",
      menuCommand: "coal:menu.command",
    });
  });
});
