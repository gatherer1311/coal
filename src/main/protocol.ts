// src/main/protocol.ts
import { net, protocol } from "electron";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";

const RENDERER_DIR = join(import.meta.dirname, "../renderer");
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

/** Register app:// as a privileged scheme. Must run before app is ready (design §3). */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Serve the built renderer from app:// with a strict CSP header. */
export function handleAppProtocol(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = normalize(join(RENDERER_DIR, rel));
    if (filePath !== RENDERER_DIR && !filePath.startsWith(RENDERER_DIR + sep)) {
      return new Response("forbidden", { status: 403 });
    }
    const res = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(res.headers);
    headers.set("Content-Security-Policy", CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}
