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
  test("load materializes settings.toml when absent; empty settings, no diagnostics", async () => {
    const svc = new ConfigService(dir);
    const snap = await svc.load();
    expect(existsSync(svc.path)).toBe(true);
    expect(snap).toEqual({ settings: {}, diagnostics: [] });
    expect(await readFile(svc.path, "utf-8")).toContain("# Coal");
  });

  test("a hand-added foreign key is reported unknown but preserved on disk", async () => {
    const svc = new ConfigService(dir);
    await writeFile(svc.path, "# mine\nfoo = 1\n", "utf-8");
    const snap = await svc.load();
    expect(snap.settings).toEqual({});
    expect(snap.diagnostics[0]).toMatchObject({ key: "foo", kind: "unknown-key" });
    expect(await readFile(svc.path, "utf-8")).toContain("foo = 1"); // never clobbered
  });

  test("reload re-reads an external edit and emits", async () => {
    const svc = new ConfigService(dir);
    await svc.load();
    let emitted = 0;
    svc.onDidChangeConfig(() => {
      emitted += 1;
    });
    await writeFile(svc.path, "bar = 2\n", "utf-8");
    const snap = await svc.reload();
    expect(snap.diagnostics.some((d) => d.key === "bar")).toBe(true);
    expect(emitted).toBe(1);
  });

  test("a malformed file loads to defaults + a parse-error diagnostic, file untouched", async () => {
    const svc = new ConfigService(dir);
    const bad = "not = = valid ][\n";
    await writeFile(svc.path, bad, "utf-8");
    const snap = await svc.load();
    expect(snap.settings).toEqual({});
    expect(snap.diagnostics[0]).toMatchObject({ kind: "parse-error" });
    expect(await readFile(svc.path, "utf-8")).toBe(bad);
  });
});
