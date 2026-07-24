// src/renderer/main.ts
import { CommandRegistry } from "../kernel/command/commandRegistry";
import { KeybindingRegistry } from "../kernel/command/keybindingRegistry";
import { DisposableStore } from "../kernel/command/disposable";
import { ContextRegistry } from "../kernel/command/context";
import { KeySequenceResolver } from "../kernel/command/keySequenceResolver";
import { composeKeymap, findUnresolvedBindings } from "../kernel/command/composeKeymap";
import { DEFAULT_KEYMAP } from "../kernel/command/defaultKeymap";
import { matchesWhen } from "../kernel/command/when";
import { splitSequence } from "../kernel/command/keys";
import type { CommandContext, Keybinding } from "../kernel/command/types";
import { chordFromEvent } from "./keyInput";
import { createEditor } from "./editor";
import { ConfigClient } from "./config";
import { KeybindingsClient } from "./keybindings";
import { Minibuffer } from "./minibuffer";
import { WhichKey } from "./whichKey";
import { EchoArea } from "./echoArea";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

let currentDocId: string | null = null;

const store = new DisposableStore();
const commands = new CommandRegistry();
const keys = new KeybindingRegistry();
const contexts = new ContextRegistry();
const editor = createEditor(root, (isDirty) => window.coal.doc.setDirty(isDirty));
const minibuffer = new Minibuffer(document.body);
const whichKey = new WhichKey(document.body);
const echo = new EchoArea(document.body);
const ctx: CommandContext = { editor: editor.facade };

const config = new ConfigClient(window.coal);
const keybindings = new KeybindingsClient(window.coal);
const resolver = new KeySequenceResolver(keys, contexts);

const WHICHKEY_DELAY_MS = 400;
let whichKeyTimer: ReturnType<typeof setTimeout> | null = null;

/** Run a command if it exists and is enabled; report whether it consumed the key. */
const dispatch = (commandId: string): boolean => {
  const command = commands.getCommand(commandId);
  if (!command) return false;
  if (command.isEnabled && !command.isEnabled(ctx)) return false;
  void commands.executeCommand(commandId, ctx).catch((err) => console.error(err));
  return true;
};

const hideWhichKey = (): void => {
  if (whichKeyTimer !== null) {
    clearTimeout(whichKeyTimer);
    whichKeyTimer = null;
  }
  whichKey.hide();
};

const showWhichKey = (sequence: string, continuations: readonly Keybinding[]): void => {
  hideWhichKey();
  const consumed = splitSequence(sequence).length;
  whichKeyTimer = setTimeout(() => {
    const entries = continuations.map((binding) => {
      const command = commands.getCommand(binding.command);
      return {
        chord: splitSequence(binding.keys).slice(consumed).join(" "),
        title: command?.title ?? binding.command,
      };
    });
    whichKey.show(sequence, entries);
  }, WHICHKEY_DELAY_MS);
};

/** The current highest-precedence binding for a command in-context (design §8 where-is): among
 * the satisfied bindings, a scoped (`when`) binding outranks an unscoped one. */
const currentHint = (commandId: string): string | undefined =>
  keys
    .getBindingsForCommand(commandId)
    .filter((b) => matchesWhen(b.when, contexts))
    .sort((a, b) => (b.when ? 1 : 0) - (a.when ? 1 : 0))[0]?.keys;

/** Keep capturing a sequence while it is a live prefix of some binding. */
const continueWhilePrefix = (sequence: string): boolean =>
  keys.getCandidates(sequence, contexts).some((b) => b.keys !== sequence);

/** Compose the default + user keymap into the registry; surface problems (design §5/§11). */
const recompose = (): void => {
  const { bindings, diagnostics } = composeKeymap(DEFAULT_KEYMAP, keybindings.entries);
  keys.setBindings(bindings);
  const known = new Set(commands.getCommands().map((c) => c.id));
  const problems = [...diagnostics, ...findUnresolvedBindings(bindings, known)];
  for (const problem of problems) console.warn(`keybinding problem: ${problem.message}`);
  if (problems.length > 0)
    echo.message(`${problems.length} keybinding problem(s) - see keybindings.toml`);
};
keybindings.onChange(recompose);

// --- contexts (design §5) -------------------------------------------------
contexts.set("editorFocused", true);
minibuffer.onDidChangeOpen((open) => contexts.set("minibufferOpen", open));
editor.view.contentDOM.addEventListener("focus", () => contexts.set("editorFocused", true));
editor.view.contentDOM.addEventListener("blur", () => contexts.set("editorFocused", false));

// --- commands -------------------------------------------------------------
store.add(
  commands.registerCommand({
    id: "core.file.open",
    title: "Open File…",
    run: async () => {
      const result = await window.coal.file.open();
      if (result.canceled || "binary" in result) return;
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
        .filter((cmd) => !cmd.isEnabled || cmd.isEnabled(c))
        .map((cmd) => {
          const hint = currentHint(cmd.id);
          return {
            id: cmd.id,
            label: cmd.title,
            ...(cmd.category !== undefined ? { description: cmd.category } : {}),
            ...(hint !== undefined ? { keyHint: hint } : {}),
          };
        });
      const pick = await minibuffer.quickPick(items, { prompt: ">", placeholder: "Run a command" });
      if (pick) await commands.executeCommand(pick.id, c);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.abort",
    title: "Abort",
    description:
      "Cancel the pending key sequence, close the minibuffer, and clear messages (Emacs C-g).",
    run: () => {
      resolver.reset();
      hideWhichKey();
      echo.clear();
      if (minibuffer.isOpen()) minibuffer.cancel();
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.minibuffer.accept",
    title: "Minibuffer: Accept",
    run: () => minibuffer.accept(),
  }),
);
store.add(
  commands.registerCommand({
    id: "core.minibuffer.cancel",
    title: "Minibuffer: Cancel",
    run: () => minibuffer.cancel(),
  }),
);
store.add(
  commands.registerCommand({
    id: "core.minibuffer.next",
    title: "Minibuffer: Next",
    run: () => minibuffer.next(),
  }),
);
store.add(
  commands.registerCommand({
    id: "core.minibuffer.prev",
    title: "Minibuffer: Previous",
    run: () => minibuffer.prev(),
  }),
);

store.add(
  commands.registerCommand({
    id: "core.help.describe-key",
    title: "Describe Key…",
    description: "Capture a key sequence and report the command it resolves to in this context.",
    run: async () => {
      const sequence = await minibuffer.readKeySequence({
        prompt: "Describe key:",
        continueWhile: continueWhilePrefix,
      });
      if (!sequence) return;
      const match = keys
        .getCandidates(sequence, contexts)
        .filter((b) => b.keys === sequence)
        .sort((a, b) => (b.when ? 1 : 0) - (a.when ? 1 : 0))[0];
      if (!match) {
        echo.message(`${sequence} is not bound`);
        return;
      }
      const command = commands.getCommand(match.command);
      const detail = command?.description ?? command?.title ?? "";
      echo.message(`${sequence} runs ${match.command}${detail ? ` - ${detail}` : ""}`);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.help.describe-command",
    title: "Describe Command…",
    run: async () => {
      const items = commands.getCommands().map((cmd) => ({ id: cmd.id, label: cmd.title }));
      const pick = await minibuffer.quickPick(items, { prompt: "Describe command:" });
      if (!pick) return;
      const command = commands.getCommand(pick.id);
      const binds = keys.getBindingsForCommand(pick.id).map((b) => b.keys);
      const where = binds.length > 0 ? binds.join(", ") : "(unbound)";
      echo.message(
        `${pick.id} [${where}]${command?.description ? ` - ${command.description}` : ""}`,
      );
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.keys.bind",
    title: "Set Key…",
    description: "Capture a key sequence, choose the command it runs, and write keybindings.toml.",
    run: async () => {
      const sequence = await minibuffer.readKeySequence({
        prompt: "Set key:",
        placeholder: "Type the key sequence to bind",
        continueWhile: continueWhilePrefix,
      });
      if (!sequence) return;
      const items = commands.getCommands().map((cmd) => ({
        id: cmd.id,
        label: cmd.title,
        ...(cmd.category !== undefined ? { description: cmd.category } : {}),
      }));
      const pick = await minibuffer.quickPick(items, {
        prompt: "Bind to:",
        placeholder: "Choose a command",
      });
      if (!pick) return;
      const res = await keybindings.bind({ keys: sequence, command: pick.id });
      echo.message(res.ok ? `Bound ${sequence} -> ${pick.id}` : `Bind failed: ${res.error}`);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.keys.unbind",
    title: "Unset Key…",
    run: async () => {
      const sequence = await minibuffer.readKeySequence({
        prompt: "Unset key:",
        continueWhile: continueWhilePrefix,
      });
      if (!sequence) return;
      const res = await keybindings.unbind({ keys: sequence });
      echo.message(res.ok ? `Unbound ${sequence}` : `Unbind failed: ${res.error}`);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.config.open",
    title: "Open Settings (settings.toml)",
    run: async () => {
      const result = await window.coal.config.openInEditor();
      if (result.canceled || "binary" in result) return;
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

store.add(
  commands.registerCommand({
    id: "core.keybindings.open",
    title: "Open Keybindings (keybindings.toml)",
    run: async () => {
      const result = await window.coal.keybindings.openInEditor();
      if (result.canceled || "binary" in result) return;
      editor.facade.setText(result.doc.text);
      currentDocId = result.doc.id;
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.keybindings.reload",
    title: "Reload Keybindings",
    run: async () => {
      await keybindings.reload();
    },
  }),
);

// --- the resolver-fed input path (design §4.3/§10) ------------------------
// A capture-phase listener intercepts app-level chords BEFORE CM6 and the
// minibuffer input; a fallthrough (ordinary typing) is left for them to handle.
window.addEventListener(
  "keydown",
  (event) => {
    if (minibuffer.isCapturingKeys()) return; // readKeySequence owns input while capturing
    if (event.defaultPrevented || event.isComposing) return;
    const chord = chordFromEvent(event);
    if (chord === null) return; // a lone modifier

    // core.abort resets a pending sequence from any state (design §4.3 step 4).
    const abort = keys.getBindingsForCommand("core.abort")[0];
    if (resolver.isPending && abort && chord === abort.keys) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resolver.reset();
      dispatch("core.abort");
      return;
    }

    const result = resolver.press(chord);
    switch (result.kind) {
      case "dispatch":
        event.preventDefault();
        event.stopImmediatePropagation();
        hideWhichKey();
        dispatch(result.command);
        break;
      case "pending":
        event.preventDefault();
        event.stopImmediatePropagation();
        showWhichKey(result.sequence, result.continuations);
        break;
      case "unbound":
        event.preventDefault();
        event.stopImmediatePropagation();
        hideWhichKey();
        echo.message(`${result.sequence} is not bound`);
        break;
      case "fallthrough":
        hideWhichKey();
        break; // let CM6 / the minibuffer input handle ordinary typing
    }
  },
  true, // capture phase
);

// Native menu items dispatch command ids directly (design §6), ignored while the
// minibuffer owns input.
window.coal.onMenuCommand((id) => {
  if (minibuffer.isOpen()) return;
  dispatch(id);
});

// Files opened from the CLI / a second instance are pushed from main.
window.coal.onDocOpened((doc) => {
  editor.facade.setText(doc.text);
  currentDocId = doc.id;
});

// The quit dialog's "Save" asks us to save then quit.
window.coal.onSaveAndQuit(() => {
  void (async () => {
    try {
      if (currentDocId !== null && editor.facade.isDirty()) {
        const res = await window.coal.file.save({
          id: currentDocId,
          text: editor.facade.getText(),
        });
        if (!res.ok) return; // save failed - leave the window open
        editor.facade.markClean();
      }
      window.coal.app.quit();
    } catch (err) {
      console.error("save-and-quit failed:", err);
    }
  })();
});

// Boot: install the default keymap immediately, then layer user keybindings.
recompose();
void config.init().catch((err) => console.error("config init failed:", err));
void keybindings
  .init()
  .then(recompose)
  .catch((err) => console.error("keybindings init failed:", err));
editor.facade.focus();
