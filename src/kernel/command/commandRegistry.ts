import type { Disposable } from "./disposable";
import type { Command, CommandContext } from "./types";

/**
 * The single place every kernel action lives, and the one `executeCommand`
 * choke point keys / menu / (later) minibuffer all route through (design §6).
 */
export class CommandRegistry {
  #commands = new Map<string, Command>();

  registerCommand(command: Command): Disposable {
    if (this.#commands.has(command.id)) {
      throw new Error(`command already registered: ${command.id}`);
    }
    this.#commands.set(command.id, command);
    return {
      dispose: () => {
        if (this.#commands.get(command.id) === command) {
          this.#commands.delete(command.id);
        }
      },
    };
  }

  hasCommand(id: string): boolean {
    return this.#commands.has(id);
  }

  getCommand(id: string): Command | undefined {
    return this.#commands.get(id);
  }

  getCommands(): Command[] {
    return [...this.#commands.values()];
  }

  async executeCommand(id: string, ctx: CommandContext): Promise<void> {
    const command = this.#commands.get(id);
    if (!command) {
      throw new Error(`unknown command: ${id}`);
    }
    if (command.isEnabled && !command.isEnabled(ctx)) {
      return;
    }
    await command.run(ctx);
  }
}
