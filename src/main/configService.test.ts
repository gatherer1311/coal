import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigService } from "./configService";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "coal-cfg-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ConfigService (design §3/§6/§9 global config layer)", () => {
  test("load materializes settings.toml when absent; keymap is unset, no diagnostics", async () => {
    const svc = new ConfigService(dir);
    const snap = await svc.load();
    expect(existsSync(svc.path)).toBe(true);
    expect(snap).toEqual({ settings: {}, diagnostics: [] });
  });

  test("set writes the keymap, preserving the template's comments", async () => {
    const svc = new ConfigService(dir);
    await svc.load();
    expect(await svc.set({ keymap: "vim" })).toEqual({ ok: true });
    const onDisk = await readFile(svc.path, "utf-8");
    expect(onDisk).toContain('keymap = "vim"');
    expect(onDisk).toContain("# Coal"); // a comment from the default template survives
  });

  test("set changes an existing value while preserving a hand comment and foreign keys", async () => {
    const svc = new ConfigService(dir);
    await writeFile(svc.path, '# mine\nkeymap = "emacs"\nfoo = 1\n', "utf-8");
    await svc.load();
    await svc.set({ keymap: "vim" });
    const onDisk = await readFile(svc.path, "utf-8");
    expect(onDisk).toContain("# mine");
    expect(onDisk).toContain("foo = 1");
    expect(onDisk).toContain('keymap = "vim"');
  });

  test("reload reflects an external edit and emits", async () => {
    const svc = new ConfigService(dir);
    await svc.load();
    let emitted = 0;
    svc.onDidChangeConfig(() => {
      emitted += 1;
    });
    await writeFile(svc.path, 'keymap = "vim"\n', "utf-8");
    const snap = await svc.reload();
    expect(snap.settings.keymap).toBe("vim");
    expect(emitted).toBe(1);
  });

  test("a malformed file loads to defaults + a parse-error diagnostic, file untouched", async () => {
    const svc = new ConfigService(dir);
    const bad = "not = = valid ][\n";
    await writeFile(svc.path, bad, "utf-8");
    const snap = await svc.load();
    expect(snap.settings).toEqual({});
    expect(snap.diagnostics[0]).toMatchObject({ kind: "parse-error" });
    expect(await readFile(svc.path, "utf-8")).toBe(bad); // never clobbered
  });

  test("set emits on success; load does not emit", async () => {
    const svc = new ConfigService(dir);
    let emitted = 0;
    svc.onDidChangeConfig(() => {
      emitted += 1;
    });
    await svc.load();
    expect(emitted).toBe(0);
    await svc.set({ keymap: "emacs" });
    expect(emitted).toBe(1);
  });
});
