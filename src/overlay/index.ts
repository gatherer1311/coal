/**
 * The Overlay identity core (SPEC 13) — pure, framework-agnostic primitives:
 * the frozen normalizer (13.11), opaque id minting and the canonical JSON writer
 * (13.13), the 64-bit simhash (13.12), and the confidence resolver (13.12).
 */
export * from "./normalize";
export * from "./id";
export * from "./canonicalJson";
export * from "./simhash";
export * from "./neighbors";
export * from "./resolve";
