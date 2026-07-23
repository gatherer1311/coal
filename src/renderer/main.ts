// src/renderer/main.ts
import { CommandRegistry } from "../kernel/command/commandRegistry";
import { KeybindingRegistry } from "../kernel/command/keybindingRegistry";
import { DisposableStore } from "../kernel/command/disposable";
import type { CommandContext } from "../kernel/command/types";
import { createEditor } from "./editor";
import { ConfigClient } from "./config";
import { Minibuffer } from "./minibuffer";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

let currentDocId: string | null = null;

// The bootstrap groups its registrations in a DisposableStore — the auto-disposal
// ledger dogfood (design §6). PR #1's renderer never tears down, so it is not disposed.
const store = new DisposableStore();
const commands = new CommandRegistry();
const keys = new KeybindingRegistry();
const editor = createEditor(root, (isDirty) => window.coal.doc.setDirty(isDirty));
const minibuffer = new Minibuffer(document.body);
const ctx: CommandContext = { editor: editor.facade };

const config = new ConfigClient(window.coal);
// Reflect the loaded keymap into the DOM — the reactive seam step 4's keymap
// layer consumes (unset shows as ""). Also the e2e's observable.
const reflectKeymap = (): void => {
  document.body.dataset["coalKeymap"] = config.settings.keymap ?? "";
};
config.onChange(reflectKeymap);
void config
  .init()
  .then(reflectKeymap)
  .catch((err) => console.error("config init failed:", err));

store.add(
  commands.registerCommand({
    id: "core.file.open",
    title: "Open File…",
    run: async () => {
      const result = await window.coal.file.open();
      if (result.canceled) return;
      if ("binary" in result) return; // skeleton: no binary presenter yet
      editor.facade.setText(result.doc.text);
      currentDocId = result.doc.id;
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.file.save",
    title: "Save",
    run: async (c) => {
      if (currentDocId === null || !c.editor) return;
      const res = await window.coal.file.save({ id: currentDocId, text: c.editor.getText() });
      if (res.ok) c.editor.markClean();
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.app.quit",
    title: "Quit",
    run: () => window.coal.app.quit(),
  }),
);

store.add(
  commands.registerCommand({
    id: "core.command.execute",
    title: "Run Command…",
    run: async (c) => {
      const items = commands
        .getCommands()
        .filter((cmd) => !cmd.isEnabled || cmd.isEnabled(c)) // only runnable commands (design §7)
        .map((cmd) => ({
          id: cmd.id,
          label: cmd.title,
          // exactOptionalPropertyTypes: only set description when present.
          ...(cmd.category !== undefined ? { description: cmd.category } : {}),
        }));
      const pick = await minibuffer.quickPick(items, {
        prompt: ">",
        placeholder: "Run a command",
      });
      if (pick) await commands.executeCommand(pick.id, c);
    },
  }),
);

// Opens settings.toml as a normal editor doc — a byte-exact fileService save
// path, separate from config.set's preserving patch. An open settings buffer is
// NOT refreshed by core.config.reload or external edits until live file-watching
// lands (a committed follow-up), so saving a stale buffer can overwrite newer
// on-disk content. Acceptable for now; revisit with live-watch.
store.add(
  commands.registerCommand({
    id: "core.config.open",
    title: "Open Settings (settings.toml)",
    run: async () => {
      const result = await window.coal.config.openInEditor();
      if (result.canceled) return;
      if ("binary" in result) return;
      editor.facade.setText(result.doc.text);
      currentDocId = result.doc.id;
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.config.reload",
    title: "Reload Settings",
    run: async () => {
      await config.reload();
    },
  }),
);

store.add(keys.registerKeybinding({ keys: "Ctrl-o", command: "core.file.open" }));
store.add(keys.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" }));
store.add(keys.registerKeybinding({ keys: "Ctrl-q", command: "core.app.quit" }));
store.add(keys.registerKeybinding({ keys: "Ctrl-Shift-p", command: "core.command.execute" }));

/** Run a command if it exists and is enabled; report whether it consumed the key. */
const dispatch = (commandId: string): boolean => {
  const command = commands.getCommand(commandId);
  if (!command) return false;
  if (command.isEnabled && !command.isEnabled(ctx)) return false;
  void commands.executeCommand(commandId, ctx).catch((err) => console.error(err));
  return true;
};

// In-editor keys: the CM6 keymap is generated from the registry.
editor.setBindings(keys.getBindings(), dispatch);

// App-global keys, so open/save/quit still fire when focus is outside the editor
// (design §6). CM6 calls preventDefault when it handles a key, so skip those.
window.addEventListener("keydown", (event) => {
  if (minibuffer.isOpen()) return; // the minibuffer captures its own keys while open
  if (event.defaultPrevented || event.isComposing) return;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  if (event.key.length === 1) parts.push(event.key.toLowerCase());
  for (const binding of keys.getBindingsForKeys(parts.join("-"))) {
    if (dispatch(binding.command)) {
      event.preventDefault();
      break;
    }
  }
});

// Files opened from the CLI / a second instance are pushed from main.
window.coal.onDocOpened((doc) => {
  editor.facade.setText(doc.text);
  currentDocId = doc.id;
});

// The quit dialog's "Save" asks us to save then quit. On success we mark clean
// (which clears main's dirty flag) and request quit; a failed save leaves the
// window open. Save is only offered when a doc backs the buffer, so currentDocId
// is set here.
window.coal.onSaveAndQuit(() => {
  void (async () => {
    try {
      if (currentDocId !== null && editor.facade.isDirty()) {
        const res = await window.coal.file.save({
          id: currentDocId,
          text: editor.facade.getText(),
        });
        if (!res.ok) return; // save failed — leave the window open
        editor.facade.markClean();
      }
      window.coal.app.quit();
    } catch (err) {
      // Never leave a rejected save-and-quit unhandled; stay open on error.
      console.error("save-and-quit failed:", err);
    }
  })();
});

window.coal.onMenuCommand((id) => {
  if (minibuffer.isOpen()) return; // the minibuffer owns input while open (design §8)
  dispatch(id);
});
editor.facade.focus();
