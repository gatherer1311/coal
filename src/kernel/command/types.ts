/** The narrow view commands get of the active editor (design §6). */
export interface EditorFacade {
  getText(): string;
  setText(text: string): void;
  isDirty(): boolean;
  /** Reset the dirty flag after a successful save. */
  markClean(): void;
  focus(): void;
}

/** Passed to every command run/enablement check. `editor` is null when none is active. */
export interface CommandContext {
  readonly editor: EditorFacade | null;
}

export interface Command {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
  run(ctx: CommandContext): void | Promise<void>;
  isEnabled?(ctx: CommandContext): boolean;
}

/** A key -> command-id association. `when` is stored now, evaluated later (design §6). */
export interface Keybinding {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}
