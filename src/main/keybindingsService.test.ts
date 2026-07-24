import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeybindingsService } from "./keybindingsService";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "coal-keys-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("KeybindingsService (design §7 keybindings.toml owner)", () => {
  test("load materializes keybindings.toml when absent; no entries, no diagnostics", async () => {
    const svc = new KeybindingsService(dir);
    const snap = await svc.load();
    expect(existsSync(svc.path)).toBe(true);
    expect(snap).toEqual({ entries: [], diagnostics: [] });
    expect(await readFile(svc.path, "utf-8")).toContain("# Coal - keybindings");
  });

  test("bind appends an entry that reloads into the snapshot, and emits", async () => {
    const svc = new KeybindingsService(dir);
    await svc.load();
    let emitted = 0;
    svc.onDidChange(() => {
      emitted += 1;
    });
    expect(await svc.bind("Ctrl-c s", "core.file.save")).toEqual({ ok: true });
    expect(emitted).toBe(1);
    expect(await readFile(svc.path, "utf-8")).toContain('keys = "Ctrl-c s"');
    const reloaded = await svc.reload();
    expect(reloaded.entries).toContainEqual({ keys: "Ctrl-c s", command: "core.file.save" });
  });

  test("unbind appends an unbind entry", async () => {
    const svc = new KeybindingsService(dir);
    await svc.load();
    await svc.unbind("Ctrl-x Ctrl-c");
    const snap = await svc.reload();
    expect(snap.entries).toContainEqual({ keys: "Ctrl-x Ctrl-c", unbind: true });
  });

  test("a malformed file loads to empty + a parse-error diagnostic, file untouched", async () => {
    const svc = new KeybindingsService(dir);
    const bad = "not = = valid ][\n";
    await writeFile(svc.path, bad, "utf-8");
    const snap = await svc.load();
    expect(snap.entries).toEqual([]);
    expect(snap.diagnostics[0]).toMatchObject({ kind: "parse-error" });
    expect(await readFile(svc.path, "utf-8")).toBe(bad);
  });
});
