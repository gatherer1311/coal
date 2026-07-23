# Coal — Developer Guide

Architecture, internals, and how to extend Coal — plugins, themes, and contributing. If you
just want to *use* Coal, see [`../user/`](../user/).

> This guide grows as-we-go. Pages are added here as the architecture is built out.

Start with the authoritative design in [`../../SPEC.md`](../../SPEC.md).

## Contents

- [Kernel — the walking skeleton](kernel.md) — the minimal Electron + CodeMirror 6 core: process
  model, module map, the command spine, byte-exact IO, and the security posture (`SPEC.md` §8).
- [Overlay identity core](overlay-identity.md) — the pure normalizer / id / canonical-JSON /
  simhash / neighbors / resolver primitives behind stand-off identity (`SPEC.md` §13).
