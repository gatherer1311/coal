import { describe, expect, test } from "vitest";
import { ContextRegistry } from "./context";

describe("ContextRegistry (design §5)", () => {
  test("unset contexts are inactive; set flips them", () => {
    const r = new ContextRegistry();
    expect(r.isActive("minibufferOpen")).toBe(false);
    r.set("minibufferOpen", true);
    expect(r.isActive("minibufferOpen")).toBe(true);
  });

  test("onDidChange fires only on an actual change", () => {
    const r = new ContextRegistry();
    let fires = 0;
    r.onDidChange(() => {
      fires += 1;
    });
    r.set("editorFocused", true);
    r.set("editorFocused", true); // no-op, same value
    r.set("editorFocused", false);
    expect(fires).toBe(2);
  });

  test("setting a never-set context to false does not fire (already inactive)", () => {
    const r = new ContextRegistry();
    let fires = 0;
    r.onDidChange(() => {
      fires += 1;
    });
    r.set("x", false);
    expect(fires).toBe(0);
    expect(r.isActive("x")).toBe(false);
  });
});
