// src/main/fileService.test.ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { chmod, lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileService } from "./fileService";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "coal-fs-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FileService (design §7 byte-exact save in main)", () => {
  test("open decodes a file and an unedited save writes identical bytes", async () => {
    const file = join(dir, "note.md");
    const original = Buffer.from("# Title\nbody\n", "utf-8");
    await writeFile(file, original);
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    expect(await svc.save(res.doc.id, res.doc.text)).toEqual({ ok: true });
    expect(Buffer.from(await readFile(file)).equals(original)).toBe(true);
  });

  test("saving edited text re-encodes and writes the new bytes", async () => {
    const file = join(dir, "note.md");
    await writeFile(file, Buffer.from("a\n", "utf-8"));
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "a\nb\n");
    expect(await readFile(file, "utf-8")).toBe("a\nb\n");
  });

  test("a CRLF file keeps CRLF after an edit (editor text is LF)", async () => {
    const file = join(dir, "crlf.md");
    await writeFile(file, Buffer.from("a\r\nb\r\n", "utf-8"));
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "a\nb\nc\n");
    expect(Buffer.from(await readFile(file)).equals(Buffer.from("a\r\nb\r\nc\r\n", "utf-8"))).toBe(
      true,
    );
  });

  test("openPath(null) cancels; binary files report binary", async () => {
    const svc = new FileService();
    expect(await svc.openPath(null)).toEqual({ canceled: true });
    const bin = join(dir, "b.bin");
    await writeFile(bin, Buffer.from([0, 0, 0, 0, 0, 0]));
    expect(await svc.openPath(bin)).toMatchObject({ canceled: false, binary: true });
  });

  test("saving an unknown doc id returns an error", async () => {
    const svc = new FileService();
    expect(await svc.save("doc-999", "x")).toEqual({ ok: false, error: "unknown doc: doc-999" });
  });

  test("an unedited save of a mixed-EOL file is byte-exact (pristine no-op, design §7)", async () => {
    const file = join(dir, "mixed.md");
    const original = Buffer.from("a\r\nb\nc\r\n", "utf-8"); // mixed CRLF + LF
    await writeFile(file, original);
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    expect(res.doc.meta.mixedEol).toBe(true);
    await svc.save(res.doc.id, res.doc.text); // unchanged text -> pristine bytes
    expect(Buffer.from(await readFile(file)).equals(original)).toBe(true);
  });

  test("preserves the file mode across an edited save", async () => {
    const file = join(dir, "mode.md");
    await writeFile(file, Buffer.from("x\n", "utf-8"));
    await chmod(file, 0o640);
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "y\n");
    expect((await stat(file)).mode & 0o777).toBe(0o640);
  });

  test("writes through a symlink to its target, preserving the link", async () => {
    const target = join(dir, "target.md");
    const link = join(dir, "link.md");
    await writeFile(target, Buffer.from("x\n", "utf-8"));
    await symlink(target, link);
    const svc = new FileService();
    const res = await svc.openPath(link);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "y\n");
    expect(await readFile(target, "utf-8")).toBe("y\n");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
  });
});
