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

  // Playwright can't drive native GTK dialogs, so stub the open dialog in main.
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    // Never block on the unsaved-changes modal if a race leaves the doc dirty at close.
    dialog.showMessageBoxSync = () => 1; // "Don't Save"
  }, fixture);

  const window = await app.firstWindow();
  await window.locator(".cm-content").waitFor();
  await window.locator(".cm-content").click();

  await window.keyboard.press("Control+O");
  await expect(window.locator(".cm-content")).toContainText("hello");

  await window.keyboard.press("End");
  await window.keyboard.type(" world");
  await window.keyboard.press("Control+S");

  await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello world\n");

  await app.close();
  await rm(dir, { recursive: true, force: true });
});
