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
  /** Longer doc string, shown by Describe Command (design §3/§8). */
  readonly description?: string;
  run(ctx: CommandContext): void | Promise<void>;
  isEnabled?(ctx: CommandContext): boolean;
}

/**
 * A key-sequence -> command-id association (design §4). `keys` is a canonical
 * space-joined chord sequence ("Ctrl-x Ctrl-s"); `when` is a boolean context
 * expression, evaluated at resolve time (design §5).
 */
export interface Keybinding {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}
