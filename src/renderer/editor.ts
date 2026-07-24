// src/renderer/editor.ts
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { EditorFacade } from "../kernel/command/types";

export interface EditorHandle {
  facade: EditorFacade;
  view: EditorView;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  onDirtyChange: (dirty: boolean) => void,
): EditorHandle {
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
    destroy: () => view.destroy(),
  };
}
