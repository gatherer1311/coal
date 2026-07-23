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

test("a native menu command is ignored while the palette is open", async () => {
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

    // Open the palette on a CLEAN, unedited buffer, then simulate a native menu
    // click by sending the real menu-command IPC channel straight at the
    // window's webContents (bypassing the renderer keymap entirely, the way
    // Electron's Menu.click handlers do).
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();

    await app.evaluate(({ BrowserWindow }, channel) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error("no window");
      win.webContents.send(channel, "core.app.quit");
    }, "coal:menu.command");

    // If the onMenuCommand guard were missing, "core.app.quit" would run
    // underneath the overlay and close the (non-dirty) window — so a still-open
    // palette on a still-open app is exactly the regression signal.
    await window.waitForTimeout(300);
    expect(app.windows().length).toBe(1);
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
