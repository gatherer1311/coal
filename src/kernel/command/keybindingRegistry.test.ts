import { describe, expect, test } from "vitest";
import { KeybindingRegistry } from "./keybindingRegistry";

describe("KeybindingRegistry (design §6 keys decoupled from commands)", () => {
  test("registers bindings and returns them in registration order", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.registerKeybinding({ keys: "Ctrl-o", command: "core.file.open" });
    expect(registry.getBindings().map((b) => b.command)).toEqual([
      "core.file.save",
      "core.file.open",
    ]);
  });

  test("getBindingsForKeys filters by exact key string", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.registerKeybinding({ keys: "Ctrl-o", command: "core.file.open" });
    expect(registry.getBindingsForKeys("Ctrl-s")).toEqual([
      { keys: "Ctrl-s", command: "core.file.save" },
    ]);
  });

  test("disposing a binding removes it", () => {
    const registry = new KeybindingRegistry();
    const d = registry.registerKeybinding({ keys: "Ctrl-q", command: "core.app.quit" });
    d.dispose();
    expect(registry.getBindings()).toEqual([]);
  });

  test("getBindings returns a snapshot that does not mutate the registry", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.getBindings().pop();
    expect(registry.getBindings()).toHaveLength(1);
  });
});
