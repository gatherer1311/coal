import { describe, expect, test } from "vitest";
import { composeKeymap, findUnresolvedBindings } from "./composeKeymap";
import type { Keybinding } from "./types";

const defaults: Keybinding[] = [
  { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
  { keys: "Ctrl-x Ctrl-c", command: "core.app.quit" },
  { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
];

describe("composeKeymap (design §5 precedence)", () => {
  test("no user entries returns the defaults unchanged, no diagnostics", () => {
    expect(composeKeymap(defaults, [])).toEqual({ bindings: defaults, diagnostics: [] });
  });

  test("a user bind for the same (keys, when) replaces the default silently", () => {
    const { bindings, diagnostics } = composeKeymap(defaults, [
      { keys: "Ctrl-x Ctrl-s", command: "core.config.reload" },
    ]);
    expect(diagnostics).toEqual([]);
    expect(bindings.find((b) => b.keys === "Ctrl-x Ctrl-s")?.command).toBe("core.config.reload");
    expect(bindings.filter((b) => b.keys === "Ctrl-x Ctrl-s")).toHaveLength(1);
  });

  test("an unbind removes the matching default", () => {
    const { bindings } = composeKeymap(defaults, [{ keys: "Ctrl-x Ctrl-c", unbind: true }]);
    expect(bindings.find((b) => b.keys === "Ctrl-x Ctrl-c")).toBeUndefined();
  });

  test("a same-(keys, when) binding scoped differently coexists", () => {
    const { bindings, diagnostics } = composeKeymap(defaults, [
      { keys: "Ctrl-n", command: "core.file.open" },
    ]);
    // one unscoped (new) + one minibufferOpen-scoped (default) both present
    expect(bindings.filter((b) => b.keys === "Ctrl-n")).toHaveLength(2);
    expect(diagnostics).toEqual([]);
  });

  test("two user binds for the same (keys, when), different command, are a conflict (last wins)", () => {
    const { bindings, diagnostics } = composeKeymap(defaults, [
      { keys: "Ctrl-c a", command: "core.file.open" },
      { keys: "Ctrl-c a", command: "core.file.save" },
    ]);
    expect(bindings.find((b) => b.keys === "Ctrl-c a")?.command).toBe("core.file.save");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "Ctrl-c a", kind: "binding-conflict" });
  });

  test("binding both a prefix and its extension is a conflict; the prefix wins", () => {
    const { bindings, diagnostics } = composeKeymap(
      [],
      [
        { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
        { keys: "Ctrl-x Ctrl-s Ctrl-x", command: "core.app.quit" },
      ],
    );
    expect(bindings.map((b) => b.keys)).toEqual(["Ctrl-x Ctrl-s"]); // extension dropped
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "Ctrl-x Ctrl-s Ctrl-x", kind: "binding-conflict" });
  });
});

describe("findUnresolvedBindings (design §11/§14)", () => {
  test("flags a binding whose command is not registered", () => {
    const diagnostics = findUnresolvedBindings(
      [
        { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
        { keys: "Ctrl-z", command: "core.does.not.exist" },
      ],
      new Set(["core.file.save"]),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "Ctrl-z", kind: "unresolvable-command" });
  });
});
