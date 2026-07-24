import { describe, expect, test } from "vitest";
import type { Context } from "./context";
import { KeybindingRegistry } from "./keybindingRegistry";

describe("KeybindingRegistry (design §6 keys decoupled from commands)", () => {
  test("registerKeybinding appends in registration order", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-x Ctrl-s", command: "core.file.save" });
    registry.registerKeybinding({ keys: "Ctrl-x Ctrl-o", command: "core.file.open" });
    const anyContext: Context = { isActive: () => false };
    expect(registry.getCandidates("Ctrl-x", anyContext).map((b) => b.command)).toEqual([
      "core.file.save",
      "core.file.open",
    ]);
  });

  test("disposing a binding removes it", () => {
    const registry = new KeybindingRegistry();
    const d = registry.registerKeybinding({ keys: "Ctrl-q", command: "core.app.quit" });
    d.dispose();
    expect(registry.getBindingsForCommand("core.app.quit")).toEqual([]);
  });

  test("setBindings replaces the whole table", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.setBindings([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    expect(registry.getBindingsForCommand("core.file.save")).toEqual([
      { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
    ]);
  });

  test("getBindingsForCommand is the reverse lookup (design §8)", () => {
    const registry = new KeybindingRegistry();
    registry.setBindings([
      { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
      { keys: "Ctrl-c s", command: "core.file.save" },
      { keys: "Ctrl-x Ctrl-f", command: "core.file.open" },
    ]);
    expect(registry.getBindingsForCommand("core.file.save").map((b) => b.keys)).toEqual([
      "Ctrl-x Ctrl-s",
      "Ctrl-c s",
    ]);
  });

  test("getCandidates filters by prefix and satisfied when (design §4.3)", () => {
    const registry = new KeybindingRegistry();
    registry.setBindings([
      { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
      { keys: "Ctrl-x Ctrl-f", command: "core.file.open" },
      { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
    ]);
    const editor: Context = { isActive: () => false };
    const mb: Context = { isActive: (n) => n === "minibufferOpen" };
    expect(registry.getCandidates("Ctrl-x", editor).map((b) => b.keys)).toEqual([
      "Ctrl-x Ctrl-s",
      "Ctrl-x Ctrl-f",
    ]);
    expect(registry.getCandidates("Ctrl-n", editor)).toEqual([]); // when unsatisfied
    expect(registry.getCandidates("Ctrl-n", mb).map((b) => b.command)).toEqual([
      "core.minibuffer.next",
    ]);
  });
});
