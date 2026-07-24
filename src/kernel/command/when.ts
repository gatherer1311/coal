// src/kernel/command/when.ts
import type { Context } from "./context";

/** A parsed `when` expression over context names (design §5). */
export type WhenExpr =
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "not"; readonly expr: WhenExpr }
  | { readonly kind: "and"; readonly left: WhenExpr; readonly right: WhenExpr }
  | { readonly kind: "or"; readonly left: WhenExpr; readonly right: WhenExpr };

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }
    if (c === "(" || c === ")" || c === "!") {
      tokens.push(c);
      i += 1;
      continue;
    }
    if (c === "&" && input[i + 1] === "&") {
      tokens.push("&&");
      i += 2;
      continue;
    }
    if (c === "|" && input[i + 1] === "|") {
      tokens.push("||");
      i += 2;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9]/.test(input[j]!)) j += 1;
      tokens.push(input.slice(i, j));
      i = j;
      continue;
    }
    throw new Error(`invalid character in when expression: ${c}`);
  }
  return tokens;
}

/** Parse a `when` string to an AST. Throws on any syntax error (design §5). */
export function parseWhen(input: string): WhenExpr {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const take = (): string | undefined => tokens[pos++];

  const parseOr = (): WhenExpr => {
    let left = parseAnd();
    while (peek() === "||") {
      take();
      left = { kind: "or", left, right: parseAnd() };
    }
    return left;
  };
  const parseAnd = (): WhenExpr => {
    let left = parseUnary();
    while (peek() === "&&") {
      take();
      left = { kind: "and", left, right: parseUnary() };
    }
    return left;
  };
  const parseUnary = (): WhenExpr => {
    if (peek() === "!") {
      take();
      return { kind: "not", expr: parseUnary() };
    }
    return parsePrimary();
  };
  const parsePrimary = (): WhenExpr => {
    const t = take();
    if (t === "(") {
      const inner = parseOr();
      if (take() !== ")") throw new Error("expected )");
      return inner;
    }
    if (t === undefined || t === ")" || t === "&&" || t === "||" || t === "!") {
      throw new Error(`unexpected token in when: ${t ?? "end of input"}`);
    }
    return { kind: "name", name: t };
  };

  const expr = parseOr();
  if (pos !== tokens.length) throw new Error("trailing tokens in when expression");
  return expr;
}

/** Evaluate a parsed expression against the current contexts. */
export function evaluateWhen(expr: WhenExpr, ctx: Context): boolean {
  switch (expr.kind) {
    case "name":
      return ctx.isActive(expr.name);
    case "not":
      return !evaluateWhen(expr.expr, ctx);
    case "and":
      return evaluateWhen(expr.left, ctx) && evaluateWhen(expr.right, ctx);
    case "or":
      return evaluateWhen(expr.left, ctx) || evaluateWhen(expr.right, ctx);
  }
}

/** Convenience: an undefined or blank `when` is always satisfied (design §4.3). */
export function matchesWhen(when: string | undefined, ctx: Context): boolean {
  if (when === undefined || when.trim() === "") return true;
  return evaluateWhen(parseWhen(when), ctx);
}
