// src/main/guards.test.ts
import { describe, expect, test } from "vitest";
import { isSaveRequest, isTrustedUrl } from "./guards";

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
