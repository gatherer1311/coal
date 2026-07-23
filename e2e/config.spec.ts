import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("settings.toml materializes on launch and reload reflects an external edit", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-cfg-e2e-"));
  const settings = join(userData, "settings.toml");

  const args = ["out/main/index.js", `--user-data-dir=${userData}`];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1; // never block on the unsaved dialog
    });

    // Materialized on first run, with no keymap set (reflected as "").
    await expect.poll(() => existsSync(settings)).toBe(true);
    await expect(window.locator("body")).toHaveAttribute("data-coal-keymap", "");
    expect(await readFile(settings, "utf-8")).toContain("# Coal");

    // Externally edit the file, then reload via the palette.
    await writeFile(settings, 'keymap = "vim"\n', "utf-8");
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Reload Settings");
    await window.keyboard.press("Enter");

    // The renderer's snapshot updated reactively.
    await expect(window.locator("body")).toHaveAttribute("data-coal-keymap", "vim");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("Open Settings opens settings.toml in the editor", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-cfg-e2e-"));
  const args = ["out/main/index.js", `--user-data-dir=${userData}`];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });

    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Open Settings");
    await window.keyboard.press("Enter");

    await expect(window.locator(".cm-content")).toContainText("Coal - user settings");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
