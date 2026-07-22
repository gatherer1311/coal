import { describe, expect, test } from "vitest";
import { DisposableStore } from "./disposable";

describe("DisposableStore (design §6 auto-disposal ledger)", () => {
  test("disposes tracked items in reverse order of addition", () => {
    const order: number[] = [];
    const store = new DisposableStore();
    store.add({ dispose: () => order.push(1) });
    store.add({ dispose: () => order.push(2) });
    store.dispose();
    expect(order).toEqual([2, 1]);
  });

  test("add returns the item and tracks its size", () => {
    const store = new DisposableStore();
    const d = store.add({ dispose: () => {} });
    expect(typeof d.dispose).toBe("function");
    expect(store.size).toBe(1);
  });

  test("dispose is idempotent — items are disposed exactly once", () => {
    let count = 0;
    const store = new DisposableStore();
    store.add({ dispose: () => count++ });
    store.dispose();
    store.dispose();
    expect(count).toBe(1);
  });

  test("items added after disposal are disposed immediately", () => {
    let disposed = false;
    const store = new DisposableStore();
    store.dispose();
    store.add({ dispose: () => (disposed = true) });
    expect(disposed).toBe(true);
    expect(store.size).toBe(0);
  });
});
