// src/kernel/io/detect.test.ts
import { describe, expect, test } from "vitest";
import { detectEncoding, detectEol, hasFinalNewline } from "./detect";

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);

describe("detectEncoding (design §7 BOM sniff + NUL heuristic)", () => {
  test("detects a UTF-8 BOM", () => {
    expect(detectEncoding(bytes(0xef, 0xbb, 0xbf, 0x41))).toEqual({
      encoding: "utf-8",
      hasBom: true,
    });
  });

  test("detects UTF-16 LE and BE BOMs", () => {
    expect(detectEncoding(bytes(0xff, 0xfe, 0x41, 0x00))).toEqual({
      encoding: "utf-16le",
      hasBom: true,
    });
    expect(detectEncoding(bytes(0xfe, 0xff, 0x00, 0x41))).toEqual({
      encoding: "utf-16be",
      hasBom: true,
    });
  });

  test("plain ASCII with no NULs is UTF-8 without a BOM", () => {
    expect(detectEncoding(bytes(0x41, 0x42, 0x43))).toEqual({ encoding: "utf-8", hasBom: false });
  });

  test("BOM-less UTF-16 ASCII is detected by NUL parity", () => {
    // "AB" in utf-16le: 41 00 42 00 (NULs at odd indices)
    expect(detectEncoding(bytes(0x41, 0x00, 0x42, 0x00))).toEqual({
      encoding: "utf-16le",
      hasBom: false,
    });
    // "AB" in utf-16be: 00 41 00 42 (NULs at even indices)
    expect(detectEncoding(bytes(0x00, 0x41, 0x00, 0x42))).toEqual({
      encoding: "utf-16be",
      hasBom: false,
    });
  });

  test("a sparse NUL among many non-NUL bytes is binary, not UTF-16", () => {
    // "hello\x00world" — one NUL, below the every-other-byte threshold.
    const b = bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64);
    expect(detectEncoding(b)).toBeNull();
  });

  test("empty input is UTF-8 without a BOM", () => {
    expect(detectEncoding(bytes())).toEqual({ encoding: "utf-8", hasBom: false });
  });
});

describe("detectEol / hasFinalNewline (design §7)", () => {
  test("classifies LF, CRLF, and mixed", () => {
    expect(detectEol("a\nb\nc")).toEqual({ eol: "lf", mixedEol: false });
    expect(detectEol("a\r\nb\r\nc")).toEqual({ eol: "crlf", mixedEol: false });
    expect(detectEol("a\r\nb\nc")).toEqual({ eol: "crlf", mixedEol: true });
  });

  test("no newlines defaults to LF, not mixed", () => {
    expect(detectEol("abc")).toEqual({ eol: "lf", mixedEol: false });
  });

  test("flags lone-CR (classic-Mac) as mixed so the save path surfaces it (#44)", () => {
    // Pure lone-CR: out of the LF/CRLF scope, so flag it as mixed rather than
    // silently normalizing \r -> \n on save.
    expect(detectEol("a\rb\rc")).toEqual({ eol: "lf", mixedEol: true });
    // CRLF content with a stray lone CR is also mixed.
    expect(detectEol("a\r\nb\rc")).toEqual({ eol: "crlf", mixedEol: true });
  });

  test("detects a trailing newline", () => {
    expect(hasFinalNewline("a\n")).toBe(true);
    expect(hasFinalNewline("a\r")).toBe(true);
    expect(hasFinalNewline("a")).toBe(false);
    expect(hasFinalNewline("")).toBe(false);
  });
});
