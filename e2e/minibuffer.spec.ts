import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("the command palette runs Save, writing byte-exact changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "coal-e2e-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");

  const args = ["out/main/index.js"];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();

    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      dialog.showMessageBoxSync = () => 1; // "Don't Save"
    }, fixture);

    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+O");
    await expect(window.locator(".cm-content")).toContainText("hello");

    // Edit, then save via the palette instead of Ctrl+S.
    await window.keyboard.press("End");
    await window.keyboard.type(" world");

    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Save");
    await window.keyboard.press("Enter");

    await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello world\n");
    await expect(window.locator(".coal-minibuffer.open")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
