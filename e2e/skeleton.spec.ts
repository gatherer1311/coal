import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("open -> edit -> save writes byte-exact changes -> quit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "coal-e2e-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");

  const args = ["out/main/index.js"];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();

    // Stub native dialogs only after the app is fully up — evaluating during the
    // startup navigation can hit a destroyed execution context. The stub is still
    // in place before Ctrl-x Ctrl-f triggers the open. Playwright can't drive GTK dialogs.
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      // Never block on the unsaved-changes modal if a race leaves the doc dirty at close.
      dialog.showMessageBoxSync = () => 1; // "Don't Save"
    }, fixture);

    await window.locator(".cm-content").click();

    await window.keyboard.press("Control+X"); // Ctrl-x Ctrl-f = core.file.open (Emacs find-file)
    await window.keyboard.press("Control+F");
    await expect(window.locator(".cm-content")).toContainText("hello");

    await window.keyboard.press("End");
    await window.keyboard.type(" world");
    await window.keyboard.press("Control+X"); // Ctrl-x Ctrl-s = core.file.save (Emacs save-buffer)
    await window.keyboard.press("Control+S");

    await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello world\n");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("opens a file passed as a CLI argument", async () => {
  const dir = await mkdtemp(join(tmpdir(), "coal-e2e-"));
  const fixture = join(dir, "cli.md");
  await writeFile(fixture, "from cli\n", "utf-8");
  const args = ["out/main/index.js", fixture];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });
  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0;
    });
    await expect(window.locator(".cm-content")).toContainText("from cli");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
