// src/kernel/io/types.ts

export type Encoding = "utf-8" | "utf-16le" | "utf-16be";
export type Eol = "lf" | "crlf";

/** Everything needed to reproduce a file's exact bytes after an edit (design §7). */
export interface DocMeta {
  readonly encoding: Encoding;
  readonly hasBom: boolean;
  readonly eol: Eol;
  readonly mixedEol: boolean;
  readonly finalNewline: boolean;
}

export type DecodeResult =
  | { readonly kind: "text"; readonly text: string; readonly meta: DocMeta }
  | { readonly kind: "binary" };
