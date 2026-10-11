import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "../snapshot.js";

const PUBLIC = fileURLToPath(new URL("../../public/", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface ServeOptions {
  canonDir: string;
  port: number;
  host?: string;
}

/**
 * A small static + JSON server. The snapshot is rebuilt on every request to /api/snapshot,
 * so edits to canon files show up on reload with no watcher and no cache to invalidate.
 */
export async function serveUi(opts: ServeOptions): Promise<{ url: string; close: () => void }> {
  const host = opts.host ?? "127.0.0.1";
  const server = createServer((req, res) => {
    try {
      route(req, res, opts.canonDir);
    } catch (e) {
      send(res, 500, "text/plain; charset=utf-8", e instanceof Error ? e.stack ?? e.message : String(e));
    }
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(opts.port, host, () => ok());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return { url: `http://${host}:${port}/`, close: () => server.close() };
}

function route(req: IncomingMessage, res: ServerResponse, canonDir: string) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/snapshot") {
    const snap = buildSnapshot(canonDir);
    return send(res, 200, "application/json; charset=utf-8", JSON.stringify(snap));
  }
  if (url.pathname === "/api/health") return send(res, 200, "application/json", JSON.stringify({ ok: true }));

  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
    // Client-side routes (#hash) never reach here; anything else unknown is a 404.
    return send(res, 404, "text/plain; charset=utf-8", `Not found: ${url.pathname}`);
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(file).pipe(res);
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
