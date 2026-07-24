import { describe, expect, test, vi } from "vitest";
import { ConfigClient } from "./config";
import type { CoalApi } from "../kernel/ipc/contract";
import type { ConfigSnapshot } from "../kernel/config/types";

function fakeApi(initial: ConfigSnapshot): { api: CoalApi; fireChange(s: ConfigSnapshot): void } {
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
    const { api } = fakeApi({ settings: {}, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();
    expect(client.settings).toEqual({});
  });

  test("a config:changed push notifies subscribers", async () => {
    const { api, fireChange } = fakeApi({ settings: {}, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();
    const seen: ConfigSnapshot[] = [];
    client.onChange((s) => seen.push(s));
    fireChange({ settings: {}, diagnostics: [{ key: "foo", kind: "unknown-key", message: "x" }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.diagnostics).toHaveLength(1);
  });

  test("a throwing subscriber does not stop later subscribers", async () => {
    const { api, fireChange } = fakeApi({ settings: {}, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();
    const seen: string[] = [];
    client.onChange(() => {
      throw new Error("boom");
    });
    client.onChange(() => {
      seen.push("second");
    });
    fireChange({ settings: {}, diagnostics: [] });
    expect(seen).toEqual(["second"]);
  });
});
