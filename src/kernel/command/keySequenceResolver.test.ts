import { describe, expect, test } from "vitest";
import { KeySequenceResolver } from "./keySequenceResolver";
import { KeybindingRegistry } from "./keybindingRegistry";
import { ContextRegistry } from "./context";

function make(bindings: { keys: string; command: string; when?: string }[]) {
  const keys = new KeybindingRegistry();
  keys.setBindings(bindings);
  const contexts = new ContextRegistry();
  return { resolver: new KeySequenceResolver(keys, contexts), contexts };
}

describe("KeySequenceResolver (design §4.3)", () => {
  test("a single complete chord dispatches immediately", () => {
    const { resolver } = make([{ keys: "Ctrl-Shift-p", command: "core.command.execute" }]);
    expect(resolver.press("Ctrl-Shift-p")).toEqual({
      kind: "dispatch",
      command: "core.command.execute",
      sequence: "Ctrl-Shift-p",
    });
  });

  test("a multi-stroke prefix stays pending, then dispatches", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    const first = resolver.press("Ctrl-x");
    expect(first.kind).toBe("pending");
    expect(resolver.isPending).toBe(true);
    expect(resolver.press("Ctrl-s")).toMatchObject({ kind: "dispatch", command: "core.file.save" });
    expect(resolver.isPending).toBe(false);
  });

  test("a lone unmatched chord falls through to the editor", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    expect(resolver.press("a")).toEqual({ kind: "fallthrough", chord: "a" });
  });

  test("a mid-sequence dead-end aborts as unbound and resets", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    resolver.press("Ctrl-x");
    expect(resolver.press("z")).toEqual({ kind: "unbound", sequence: "Ctrl-x z" });
    expect(resolver.isPending).toBe(false);
  });

  test("a scoped binding beats an unscoped one for the same sequence", () => {
    const { resolver, contexts } = make([
      { keys: "Ctrl-n", command: "global.next" },
      { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
    ]);
    contexts.set("minibufferOpen", true);
    expect(resolver.press("Ctrl-n")).toMatchObject({ command: "core.minibuffer.next" });
  });

  test("reset clears a pending sequence", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    resolver.press("Ctrl-x");
    resolver.reset();
    expect(resolver.isPending).toBe(false);
  });
});
