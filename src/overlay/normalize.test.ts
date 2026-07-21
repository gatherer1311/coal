import { describe, expect, test } from "vitest";
import { NORM_VERSION, canonicalize, extractPayload, normHash, normalize } from "./normalize";

describe("extractPayload — Stage A, kind-aware (SPEC 13.11)", () => {
  test("paragraph is taken as-is", () => {
    expect(extractPayload("Hello world", "paragraph")).toBe("Hello world");
  });

  test("list item strips a '-' bullet marker", () => {
    expect(extractPayload("- Buy milk", "list-item")).toBe("Buy milk");
  });

  test("list item strips a '*' bullet marker", () => {
    expect(extractPayload("* Buy milk", "list-item")).toBe("Buy milk");
  });

  test("list item strips a '+' bullet marker", () => {
    expect(extractPayload("+ Buy milk", "list-item")).toBe("Buy milk");
  });

  test("list item strips an ordered '1.' marker", () => {
    expect(extractPayload("1. Buy milk", "list-item")).toBe("Buy milk");
  });

  test("list item strips a multi-digit ordered marker", () => {
    expect(extractPayload("10. Buy milk", "list-item")).toBe("Buy milk");
  });

  test("list item strips leading indentation together with the marker", () => {
    expect(extractPayload("   - Buy milk", "list-item")).toBe("Buy milk");
  });

  test("blockquote strips a leading '> ' on each line", () => {
    expect(extractPayload("> line one\n> line two", "blockquote")).toBe("line one\nline two");
  });

  test("blockquote strips a bare '>' with no following space", () => {
    expect(extractPayload(">quoted", "blockquote")).toBe("quoted");
  });

  test("code fence drops the fence delimiters and info string, keeping the body", () => {
    expect(extractPayload("```js\nconst x = 1;\nconst y = 2;\n```", "code-fence")).toBe(
      "const x = 1;\nconst y = 2;",
    );
  });

  test("code fence with no info string keeps the body", () => {
    expect(extractPayload("```\nbody\n```", "code-fence")).toBe("body");
  });
});

describe("canonicalize — Stage B, frozen (SPEC 13.11)", () => {
  test("lowercases (locale-invariant case-fold)", () => {
    expect(canonicalize("HeLLo")).toBe("hello");
  });

  test("collapses interior whitespace runs to a single space and trims the ends", () => {
    expect(canonicalize("  a   b\t\tc  ")).toBe("a b c");
  });

  test("collapses newlines within a block into single spaces", () => {
    expect(canonicalize("a\n\nb")).toBe("a b");
  });

  test("normalizes CRLF and CR line endings", () => {
    expect(canonicalize("a\r\nb")).toBe(canonicalize("a\nb"));
    expect(canonicalize("a\rb")).toBe(canonicalize("a\nb"));
  });

  test("folds curly single quotes (U+2018/U+2019) to a straight apostrophe", () => {
    expect(canonicalize("don’t")).toBe("don't");
    expect(canonicalize("‘x’")).toBe("'x'");
  });

  test("folds curly double quotes (U+201C/U+201D) to straight quotes", () => {
    expect(canonicalize("“hi”")).toBe('"hi"');
  });

  test("folds en dash (U+2013) and em dash (U+2014) to a hyphen", () => {
    expect(canonicalize("a–b")).toBe("a-b");
    expect(canonicalize("a—b")).toBe("a-b");
  });

  test("folds a horizontal ellipsis (U+2026) to three dots", () => {
    expect(canonicalize("wait…")).toBe("wait...");
  });

  test("folds nbsp (U+00A0) and other Unicode spaces (e.g. U+2003) to a normal space", () => {
    expect(canonicalize("a b")).toBe("a b");
    expect(canonicalize("a b")).toBe("a b");
  });

  test("applies NFC (composes a decomposed sequence)", () => {
    // "cafe" + combining acute (U+0301) must equal precomposed "café"
    expect(canonicalize("café")).toBe(canonicalize("café"));
    expect(canonicalize("café")).toBe("café");
  });

  test("uses NFC, never NFKC (does not fold the 'fi' ligature U+FB01)", () => {
    expect(canonicalize("ﬁle")).toContain("ﬁ");
    expect(canonicalize("ﬁle")).not.toBe("file");
  });

  test("preserves inline markup (lexical, parser-free)", () => {
    expect(canonicalize("**Bold** and [a](b)")).toBe("**bold** and [a](b)");
  });
});

describe("normalize + normHash (SPEC 13.11 / 13.13)", () => {
  test("normalize composes Stage A then Stage B", () => {
    expect(normalize("-  HeLLo   World ", "list-item")).toBe("hello world");
  });

  test("normHash is a 128-bit (32 hex char) truncated SHA-256", () => {
    expect(normHash("hello", "paragraph")).toMatch(/^[0-9a-f]{32}$/);
  });

  test("typographically-different but rendering-equivalent text hashes equal", () => {
    expect(normHash("don’t “stop”…", "paragraph")).toBe(normHash('don\'t "stop"...', "paragraph"));
  });

  test("visibly-different text hashes differently", () => {
    expect(normHash("alpha", "paragraph")).not.toBe(normHash("beta", "paragraph"));
  });

  test("NORM_VERSION is stamped", () => {
    expect(NORM_VERSION).toBe("1");
  });
});
