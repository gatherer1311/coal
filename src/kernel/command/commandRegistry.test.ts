import { describe, expect, test, vi } from "vitest";
import { CommandRegistry } from "./commandRegistry";
import type { CommandContext } from "./types";

const ctx: CommandContext = { editor: null };

describe("CommandRegistry (design §6 command spine)", () => {
  test("registers and executes a command through the choke point", async () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.registerCommand({ id: "core.demo", title: "Demo", run });
    await registry.executeCommand("core.demo", ctx);
    expect(run).toHaveBeenCalledWith(ctx);
  });

  test("throws when registering a duplicate id", () => {
    const registry = new CommandRegistry();
    registry.registerCommand({ id: "core.demo", title: "Demo", run: () => {} });
    expect(() =>
      registry.registerCommand({ id: "core.demo", title: "Dup", run: () => {} }),
    ).toThrow(/already registered: core\.demo/);
  });

  test("disposing a registration removes the command", () => {
    const registry = new CommandRegistry();
    const d = registry.registerCommand({ id: "core.demo", title: "Demo", run: () => {} });
    expect(registry.hasCommand("core.demo")).toBe(true);
    d.dispose();
    expect(registry.hasCommand("core.demo")).toBe(false);
  });

  test("executing an unknown command throws", async () => {
    const registry = new CommandRegistry();
    await expect(registry.executeCommand("core.missing", ctx)).rejects.toThrow(
      /unknown command: core\.missing/,
    );
  });

  test("a disabled command does not run", async () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.registerCommand({ id: "core.demo", title: "Demo", run, isEnabled: () => false });
    await registry.executeCommand("core.demo", ctx);
    expect(run).not.toHaveBeenCalled();
  });

  test("getCommands returns a snapshot that does not mutate the registry", () => {
    const registry = new CommandRegistry();
    registry.registerCommand({ id: "core.demo", title: "Demo", run: () => {} });
    const snapshot = registry.getCommands();
    snapshot.pop();
    expect(registry.getCommands()).toHaveLength(1);
  });

  test("registerCommand rejects an empty title (Law 1: minibuffer-addressable)", () => {
    const registry = new CommandRegistry();
    expect(() => registry.registerCommand({ id: "core.x", title: "", run: () => {} })).toThrow(
      /title must be non-empty/,
    );
  });
});
