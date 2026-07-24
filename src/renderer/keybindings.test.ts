import { describe, expect, test, vi } from "vitest";
import { KeybindingsClient } from "./keybindings";
import type { CoalApi } from "../kernel/ipc/contract";
import type { KeybindingsSnapshot } from "../kernel/config/keybindings/types";

function fakeApi(initial: KeybindingsSnapshot): {
  api: CoalApi;
  fire(s: KeybindingsSnapshot): void;
} {
  let handler: (s: KeybindingsSnapshot) => void = () => {};
  const api = {
    keybindings: {
      load: vi.fn(async () => initial),
      reload: vi.fn(async () => initial),
      bind: vi.fn(async () => ({ ok: true }) as const),
      unbind: vi.fn(async () => ({ ok: true }) as const),
      openInEditor: vi.fn(async () => ({ canceled: true }) as const),
    },
    onKeybindingsChanged: (h: (s: KeybindingsSnapshot) => void) => {
      handler = h;
      return () => {};
    },
  } as unknown as CoalApi;
  return { api, fire: (s) => handler(s) };
}

describe("KeybindingsClient (design §7 reactive replica)", () => {
  test("init loads entries", async () => {
    const { api } = fakeApi({
      entries: [{ keys: "Ctrl-c s", command: "core.file.save" }],
      diagnostics: [],
    });
    const client = new KeybindingsClient(api);
    await client.init();
    expect(client.entries).toEqual([{ keys: "Ctrl-c s", command: "core.file.save" }]);
  });

  test("a keybindings:changed push updates entries and notifies", async () => {
    const { api, fire } = fakeApi({ entries: [], diagnostics: [] });
    const client = new KeybindingsClient(api);
    await client.init();
    let fired = 0;
    client.onChange(() => {
      fired += 1;
    });
    fire({ entries: [{ keys: "Ctrl-x Ctrl-c", unbind: true }], diagnostics: [] });
    expect(client.entries).toEqual([{ keys: "Ctrl-x Ctrl-c", unbind: true }]);
    expect(fired).toBe(1);
  });
});
