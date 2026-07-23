import { describe, expect, test, vi } from "vitest";
import { ConfigClient } from "./config";
import type { CoalApi } from "../kernel/ipc/contract";
import type { ConfigSnapshot } from "../kernel/config/types";

function fakeApi(initial: ConfigSnapshot): {
  api: CoalApi;
  fireChange(s: ConfigSnapshot): void;
} {
  let changeHandler: (s: ConfigSnapshot) => void = () => {};
  const api = {
    config: {
      load: vi.fn(async () => initial),
      set: vi.fn(async () => ({ ok: true }) as const),
      reload: vi.fn(async () => initial),
      openInEditor: vi.fn(async () => ({ canceled: true }) as const),
    },
    onConfigChanged: (handler: (s: ConfigSnapshot) => void) => {
      changeHandler = handler;
      return () => {};
    },
  } as unknown as CoalApi;
  return { api, fireChange: (s) => changeHandler(s) };
}

describe("ConfigClient (design §6 reactive replica)", () => {
  test("init loads the snapshot into settings", async () => {
    const { api } = fakeApi({ settings: { keymap: "vim" }, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();
    expect(client.settings).toEqual({ keymap: "vim" });
  });

  test("a config:changed push updates settings and notifies subscribers", async () => {
    const { api, fireChange } = fakeApi({ settings: {}, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();

    const seen: ConfigSnapshot[] = [];
    client.onChange((s) => seen.push(s));

    fireChange({ settings: { keymap: "emacs" }, diagnostics: [] });
    expect(client.settings).toEqual({ keymap: "emacs" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.settings.keymap).toBe("emacs");
  });
});
