// src/main/guards.test.ts
import { describe, expect, test } from "vitest";
import { isConfigSetRequest, isSaveRequest, isTrustedUrl } from "./guards";

describe("IPC guards (design §3 runtime validation)", () => {
  test("isSaveRequest accepts well-formed payloads only", () => {
    expect(isSaveRequest({ id: "doc-1", text: "x" })).toBe(true);
    expect(isSaveRequest({ id: "doc-1" })).toBe(false);
    expect(isSaveRequest({ id: 1, text: "x" })).toBe(false);
    expect(isSaveRequest(null)).toBe(false);
    expect(isSaveRequest("nope")).toBe(false);
  });

  test("isTrustedUrl matches only allowed origins", () => {
    const allowed = ["app://coal/", "http://localhost:5173/"];
    expect(isTrustedUrl("app://coal/index.html", allowed)).toBe(true);
    expect(isTrustedUrl("http://localhost:5173/index.html", allowed)).toBe(true);
    expect(isTrustedUrl("https://evil.example/", allowed)).toBe(false);
    expect(isTrustedUrl(undefined, allowed)).toBe(false);
  });
});

describe("isConfigSetRequest", () => {
  test("accepts a valid keymap patch", () => {
    expect(isConfigSetRequest({ patch: { keymap: "vim" } })).toBe(true);
  });

  test("accepts an empty patch", () => {
    expect(isConfigSetRequest({ patch: {} })).toBe(true);
  });

  test("rejects a non-object, a missing patch, and an out-of-range keymap", () => {
    expect(isConfigSetRequest(null)).toBe(false);
    expect(isConfigSetRequest({})).toBe(false);
    expect(isConfigSetRequest({ patch: { keymap: "kakoune" } })).toBe(false);
    expect(isConfigSetRequest({ patch: { keymap: 3 } })).toBe(false);
  });
});
