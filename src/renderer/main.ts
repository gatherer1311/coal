// src/renderer/main.ts
import { CommandRegistry } from "../kernel/command/commandRegistry";
import { KeybindingRegistry } from "../kernel/command/keybindingRegistry";
import { DisposableStore } from "../kernel/command/disposable";
import type { CommandContext } from "../kernel/command/types";
import { createEditor } from "./editor";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

let currentDocId: string | null = null;

// The bootstrap groups its registrations in a DisposableStore — the auto-disposal
// ledger dogfood (design §6). PR #1's renderer never tears down, so it is not disposed.
const store = new DisposableStore();
const commands = new CommandRegistry();
const keys = new KeybindingRegistry();
const editor = createEditor(root, (isDirty) => window.coal.doc.setDirty(isDirty));
const ctx: CommandContext = { editor: editor.facade };

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

store.add(keys.registerKeybinding({ keys: "Ctrl-o", command: "core.file.open" }));
store.add(keys.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" }));
store.add(keys.registerKeybinding({ keys: "Ctrl-q", command: "core.app.quit" }));

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
    if (currentDocId !== null && editor.facade.isDirty()) {
      const res = await window.coal.file.save({ id: currentDocId, text: editor.facade.getText() });
      if (!res.ok) return;
      editor.facade.markClean();
    }
    window.coal.app.quit();
  })();
});

window.coal.onMenuCommand(dispatch);
editor.facade.focus();
