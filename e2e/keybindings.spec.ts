import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function launch(userData: string) {
  const args = ["out/main/index.js", `--user-data-dir=${userData}`];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });
  const window = await app.firstWindow();
  await window.locator(".cm-content").waitFor();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1; // never block on the unsaved dialog
  });
  return { app, window };
}

test("a multi-stroke binding (Ctrl-x Ctrl-s) opens and saves byte-exact", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const dir = await mkdtemp(join(tmpdir(), "coal-kb-fix-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");

  const { app, window } = await launch(userData);
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, fixture);

    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+X"); // prefix
    await window.keyboard.press("Control+F"); // Ctrl-x Ctrl-f -> Open File
    await expect(window.locator(".cm-content")).toContainText("hello");

    await window.keyboard.press("End");
    await window.keyboard.type(" world");
    await window.keyboard.press("Control+X"); // prefix
    await window.keyboard.press("Control+S"); // Ctrl-x Ctrl-s -> Save

    await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello world\n");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("which-key lists continuations after a prefix; Ctrl-g aborts", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const { app, window } = await launch(userData);
  try {
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+X");
    await expect(window.locator(".coal-whichkey.open")).toBeVisible({ timeout: 3000 });
    await expect(window.locator(".coal-whichkey-row").first()).toBeVisible();
    await window.keyboard.press("Control+G"); // abort
    await expect(window.locator(".coal-whichkey.open")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("Describe Key reports the command a sequence resolves to", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const { app, window } = await launch(userData);
  try {
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+H"); // help prefix
    await window.keyboard.press("k"); // Ctrl-h k -> Describe Key (starts key capture)
    await window.keyboard.press("Control+X");
    await window.keyboard.press("Control+S"); // captured sequence Ctrl-x Ctrl-s
    await expect(window.locator(".coal-echo.open")).toContainText("core.file.save");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("Set Key writes a new binding into keybindings.toml and the key then works", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const dir = await mkdtemp(join(tmpdir(), "coal-kb-fix-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");
  const keybindingsPath = join(userData, "keybindings.toml");

  const { app, window } = await launch(userData);
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, fixture);

    // Open the fixture first (Ctrl-x Ctrl-f).
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+X");
    await window.keyboard.press("Control+F");
    await expect(window.locator(".cm-content")).toContainText("hello");

    // Set Key: capture Ctrl-b (not a default prefix, so it commits after one chord),
    // then bind it to Save.
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Set Key");
    await window.keyboard.press("Enter");
    await window.keyboard.press("Control+B"); // captured sequence
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Save");
    await window.keyboard.press("Enter");

    await expect.poll(async () => readFile(keybindingsPath, "utf-8")).toContain('keys = "Ctrl-b"');

    // The new binding is live: edit, then save via Ctrl-b. Click near the top-left
    // of the content (not its center) - .cm-content fills the whole editor pane, so
    // a center click lands past the last line and CodeMirror parks the caret at the
    // end of the document instead of on the "hello" line.
    await window.locator(".cm-content").click({ position: { x: 5, y: 5 } });
    await window.keyboard.press("End");
    await window.keyboard.type("!");
    await window.keyboard.press("Control+B");
    await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello!\n");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
