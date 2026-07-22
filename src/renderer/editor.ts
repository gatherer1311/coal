// src/renderer/editor.ts
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { EditorFacade, Keybinding } from "../kernel/command/types";

export interface EditorHandle {
  facade: EditorFacade;
  view: EditorView;
  setBindings(bindings: Keybinding[], dispatch: (commandId: string) => boolean): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  onDirtyChange: (dirty: boolean) => void,
): EditorHandle {
  const keymapCompartment = new Compartment();
  let dirty = false;
  let programmatic = false;

  const setDirty = (value: boolean): void => {
    if (dirty === value) return;
    dirty = value;
    onDirtyChange(value);
  };

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        keymapCompartment.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !programmatic) setDirty(true);
        }),
      ],
    }),
  });

  const facade: EditorFacade = {
    getText: () => view.state.doc.toString(),
    setText: (text: string) => {
      programmatic = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      programmatic = false;
      setDirty(false);
    },
    isDirty: () => dirty,
    markClean: () => setDirty(false),
    focus: () => view.focus(),
  };

  return {
    facade,
    view,
    setBindings: (bindings, dispatch) => {
      const appKeymap = Prec.high(
        keymap.of(
          bindings.map((binding) => ({
            key: binding.keys,
            preventDefault: true,
            // Consume the key only if dispatch ran a command; otherwise fall through.
            run: () => dispatch(binding.command),
          })),
        ),
      );
      view.dispatch({ effects: keymapCompartment.reconfigure(appKeymap) });
    },
    destroy: () => view.destroy(),
  };
}
