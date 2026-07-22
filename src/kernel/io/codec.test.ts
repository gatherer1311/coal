// src/kernel/io/codec.test.ts
import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { decode, encode } from "./codec";
import type { DocMeta } from "./types";

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
const eq = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

// Build a byte fixture from parts (design §7 golden corpus).
function fixture(opts: {
  encoding: "utf-8" | "utf-16le" | "utf-16be";
  bom: boolean;
  eol: "lf" | "crlf";
  text: string; // logical content using \n
  finalNewline: boolean;
}): Uint8Array {
  const meta: DocMeta = {
    encoding: opts.encoding,
    hasBom: opts.bom,
    eol: opts.eol,
    mixedEol: false,
    finalNewline: opts.finalNewline,
  };
  const body = opts.finalNewline ? opts.text + "\n" : opts.text;
  return encode(body, meta);
}

describe("codec decode/encode (design §7 byte-exact invariant)", () => {
  const encodings = ["utf-8", "utf-16le", "utf-16be"] as const;
  const eols = ["lf", "crlf"] as const;
  const asciiContents = ["", "hello", "a\nb\nc"];
  const richContents = [...asciiContents, "héllo — café ☕", "🎉x🎉"];

  for (const encoding of encodings) {
    for (const bom of [false, true]) {
      for (const eol of eols) {
        for (const finalNewline of [false, true]) {
          // BOM-less UTF-16 is only detectable from pervasive NULs (ASCII text);
          // exclude non-ASCII BOM-less UTF-16, which is out of scope (design §7).
          const contents = encoding !== "utf-8" && !bom ? asciiContents : richContents;
          for (const text of contents) {
            test(`round-trips ${encoding} bom=${bom} ${eol} nl=${finalNewline} ${JSON.stringify(text)}`, () => {
              const original = fixture({ encoding, bom, eol, text, finalNewline });
              const decoded = decode(original);
              expect(decoded.kind).toBe("text");
              if (decoded.kind !== "text") return;
              expect(eq(encode(decoded.text, decoded.meta), original)).toBe(true);
            });
          }
        }
      }
    }
  }

  test("decode normalizes CRLF to LF but records eol in meta", () => {
    const original = fixture({
      encoding: "utf-8",
      bom: false,
      eol: "crlf",
      text: "a\nb",
      finalNewline: false,
    });
    const decoded = decode(original);
    expect(decoded.kind).toBe("text");
    if (decoded.kind !== "text") return;
    expect(decoded.text).toBe("a\nb");
    expect(decoded.meta.eol).toBe("crlf");
  });

  test("classifies bytes with pervasive NULs on both parities as binary", () => {
    expect(decode(bytes(0x00, 0x00, 0x00, 0x00, 0x00, 0x00)).kind).toBe("binary");
  });

  test("pure ASCII stays UTF-8 (does not drift to UTF-16)", () => {
    const decoded = decode(bytes(0x41, 0x42, 0x43));
    expect(decoded.kind).toBe("text");
    if (decoded.kind !== "text") return;
    expect(decoded.meta.encoding).toBe("utf-8");
  });

  test("empty input decodes to empty UTF-8 text and re-encodes to zero bytes", () => {
    const decoded = decode(bytes());
    expect(decoded.kind).toBe("text");
    if (decoded.kind !== "text") return;
    expect(decoded.text).toBe("");
    expect(encode(decoded.text, decoded.meta).length).toBe(0);
  });

  test("decodes known literal bytes and re-encodes them identically (ground truth)", () => {
    const literals: Uint8Array[] = [
      bytes(0x61, 0x0a, 0x62), // "a\nb" utf-8 LF
      bytes(0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62), // utf-8 BOM, CRLF
      bytes(0xff, 0xfe, 0x41, 0x00), // utf-16le BOM "A"
      bytes(0xfe, 0xff, 0x00, 0x41), // utf-16be BOM "A"
      bytes(0x41, 0x00, 0x42, 0x00), // utf-16le no BOM "AB"
    ];
    for (const original of literals) {
      const decoded = decode(original);
      expect(decoded.kind).toBe("text");
      if (decoded.kind !== "text") continue;
      expect(eq(encode(decoded.text, decoded.meta), original)).toBe(true);
    }
  });

  test("adversarial singletons decode as text or are classified binary", () => {
    expect(decode(bytes(0x41)).kind).toBe("text"); // 1 byte "A"
    expect(decode(bytes(0xef, 0xbb, 0xbf)).kind).toBe("text"); // BOM only
    expect(decode(bytes(0x61, 0x0d)).kind).toBe("text"); // lone CR at EOF
    expect(decode(bytes(0xff)).kind).toBe("binary"); // invalid utf-8 lead byte
    expect(decode(bytes(0xe4, 0xb8)).kind).toBe("binary"); // truncated multibyte
  });

  test("property: decode recovers text and re-encodes to the exact input bytes", () => {
    // A safe alphabet: valid code points only, no NUL, no lone CR — the codec's
    // in-scope domain (design §7). UTF-16 pins a BOM (BOM-less UTF-16 needs NULs).
    const textArb = fc
      .array(fc.constantFrom("a", "Z", "1", " ", "\n", "é", "☕", "中", "🎉"))
      .map((cs) => cs.join(""));
    fc.assert(
      fc.property(
        textArb,
        fc.constantFrom<DocMeta["encoding"]>("utf-8", "utf-16le", "utf-16be"),
        fc.boolean(),
        fc.constantFrom<DocMeta["eol"]>("lf", "crlf"),
        (text, encoding, bomChoice, eol) => {
          const hasBom = encoding === "utf-8" ? bomChoice : true;
          const meta: DocMeta = {
            encoding,
            hasBom,
            eol,
            mixedEol: false,
            finalNewline: text.endsWith("\n"),
          };
          const original = encode(text, meta);
          const decoded = decode(original);
          expect(decoded.kind).toBe("text");
          if (decoded.kind !== "text") return;
          expect(decoded.text).toBe(text);
          expect(eq(encode(decoded.text, decoded.meta), original)).toBe(true);
        },
      ),
    );
  });

  test("property: decode is total over arbitrary bytes (never throws; classifies)", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (arr) => {
        const decoded = decode(Uint8Array.from(arr));
        expect(decoded.kind === "text" || decoded.kind === "binary").toBe(true);
        if (decoded.kind === "text" && !decoded.meta.mixedEol) {
          expect(() => encode(decoded.text, decoded.meta)).not.toThrow();
        }
      }),
    );
  });
});
