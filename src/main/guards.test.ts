// src/main/guards.test.ts
import { describe, expect, test } from "vitest";
import {
  isConfigSetRequest,
  isKeybindingBindRequest,
  isKeybindingUnbindRequest,
  isSaveRequest,
  isTrustedUrl,
} from "./guards";

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
  test("accepts an empty patch", () => {
    expect(isConfigSetRequest({ patch: {} })).toBe(true);
  });
  test("rejects a non-object, a missing patch, and any unknown key", () => {
    expect(isConfigSetRequest(null)).toBe(false);
    expect(isConfigSetRequest({})).toBe(false);
    expect(isConfigSetRequest({ patch: { anything: 1 } })).toBe(false);
  });
});

describe("isKeybindingBindRequest", () => {
  test("accepts keys + command, with optional when", () => {
    expect(isKeybindingBindRequest({ keys: "Ctrl-c s", command: "core.file.save" })).toBe(true);
    expect(
      isKeybindingBindRequest({
        keys: "Ctrl-n",
        command: "core.minibuffer.next",
        when: "minibufferOpen",
      }),
    ).toBe(true);
  });
  test("rejects a missing/empty field or a non-string when", () => {
    expect(isKeybindingBindRequest({ keys: "Ctrl-c s" })).toBe(false);
    expect(isKeybindingBindRequest({ keys: "", command: "core.file.save" })).toBe(false);
    expect(isKeybindingBindRequest({ keys: "Ctrl-c s", command: "core.file.save", when: 1 })).toBe(
      false,
    );
    expect(isKeybindingBindRequest(null)).toBe(false);
  });
});

describe("isKeybindingUnbindRequest", () => {
  test("accepts keys, with optional when", () => {
    expect(isKeybindingUnbindRequest({ keys: "Ctrl-x Ctrl-c" })).toBe(true);
    expect(isKeybindingUnbindRequest({ keys: "Ctrl-n", when: "minibufferOpen" })).toBe(true);
  });
  test("rejects a missing keys or a non-string when", () => {
    expect(isKeybindingUnbindRequest({})).toBe(false);
    expect(isKeybindingUnbindRequest({ keys: "Ctrl-x", when: 2 })).toBe(false);
  });
});
