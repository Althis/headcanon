import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { approveNode, deletePrinciple, deleteTerm, dropSection, editNode, editPrinciple, editTerm, setPrincipleState, setTermState } from "../edits.js";
import { addGlossaryTerm } from "../glossary.js";
import { descendants, loadCanon } from "../load.js";
import { parseFrontMatter, str } from "../parse.js";
import { SessionState, type AskAnswer, type AskRequest, type PendingQuestion, type TermDecision } from "../session.js";
import { buildSnapshot } from "../snapshot.js";
import { isLayer, type Layer } from "../types.js";

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

export interface Served {
  url: string;
  port: number;
  session: SessionState;
  close: () => void;
}

/**
 * The viewer: static files, a JSON snapshot rebuilt from disk on every request, and the session
 * endpoints the page and the MCP server use (REQ-12.1.7). Edits made in the page write canon
 * files; the hook, the check and the verifier see them like any other change.
 */
/** The queue's file: under the repository's git directory, beside the review records; none outside a repository. */
function questionStore(canonDir: string): string | undefined {
  try {
    const dir = existsSync(canonDir) ? canonDir : dirname(canonDir);
    const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return gitDir ? join(gitDir, "headcanon", "questions.json") : undefined;
  } catch { return undefined; }
}
export async function serveUi(opts: ServeOptions): Promise<Served> {
  const host = opts.host ?? "127.0.0.1";
  const canonDir = resolve(opts.canonDir);
  const session = new SessionState(questionStore(canonDir));
  const server = createServer((req, res) => {
    route(req, res, canonDir, session).catch((e) => send(res, 500, "text/plain; charset=utf-8", e instanceof Error ? e.stack ?? e.message : String(e)));
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(opts.port, host, () => ok());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return { url: `http://${host}:${port}/`, port, session, close: () => server.close() };
}

async function route(req: IncomingMessage, res: ServerResponse, canonDir: string, session: SessionState): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const method = req.method ?? "GET";
  const json = (status: number, body: unknown) => send(res, status, "application/json; charset=utf-8", JSON.stringify(body));

  if (p === "/api/health") return json(200, { ok: true, canon: canonDir });
  if (p === "/api/snapshot") {
    const snap = buildSnapshot(canonDir);
    return send(res, 200, "application/json; charset=utf-8", JSON.stringify(snap));
  }

  // ---- session: what the page polls ----
  if (p === "/api/session" && method === "GET") {
    const q = session.current();
    return json(200, { question: q ? presentQuestion(q) : null, pending: session.pendingCount(), queue: session.queued(), focus: session.focus(), cursor: session.changes().cursor });
  }
  if (p === "/api/ask" && method === "POST") {
    const body = (await readJson(req)) as AskRequest;
    if (!body || typeof body.question !== "string") return json(400, { error: "question is required" });
    const q = session.ask(body);
    return json(200, { questionId: q.id });
  }
  if (p === "/api/wait" && method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    const timeout = Math.min(Number(url.searchParams.get("timeout") ?? 25), 25) * 1000;
    const r = await session.waitFor(id, timeout);
    if (r === null) return json(200, { unknown: true });
    return json(200, r ? { answer: r } : { pending: true });
  }
  if (p === "/api/answer" && method === "POST") {
    const body = (await readJson(req)) as Partial<AskAnswer>;
    if (!body?.questionId) return json(400, { error: "questionId is required" });
    const ok = session.answer({ questionId: body.questionId, selected: body.selected ?? [], other: body.other ?? "", terms: (body.terms ?? []) as TermDecision[] });
    return json(ok ? 200 : 404, { ok });
  }
  if (p === "/api/focus" && method === "POST") {
    const body = (await readJson(req)) as { id?: string; open?: boolean };
    if (!body?.id) return json(400, { error: "id is required" });
    session.setFocus(body.id, body.open === true);
    return json(200, { ok: true, focus: session.focus() });
  }
  if (p === "/api/changes" && method === "GET") {
    const since = Number(url.searchParams.get("since") ?? 0);
    const timeout = Math.min(Math.max(Number(url.searchParams.get("timeout") ?? 0), 0), 25);
    return json(200, await session.waitChanges(since, timeout * 1000));
  }
  if (p === "/api/message" && method === "POST") {
    const body = (await readJson(req)) as { text?: string; nodeId?: string; quote?: string };
    if (!body?.text?.trim()) return json(400, { error: "text is required" });
    return json(200, session.push("message", { text: body.text.trim(), id: body.nodeId, quote: body.quote?.trim() || undefined }));
  }
  // The session rewrote a box the human was writing in; the human chose, and the session hears which.
  if (p === "/api/conflict" && method === "POST") {
    const body = (await readJson(req)) as { id?: string; choice?: string };
    if (!body?.id) return json(400, { error: "id is required" });
    const keep = body.choice === "keep";
    return json(200, session.push("edit-conflict", { id: body.id, text: keep ? `${body.id}: the human keeps their own rewrite in progress over yours; leave the box until their words arrive` : `${body.id}: the human took your rewrite and dropped theirs` }));
  }
  // The session speaks to the human: a line in the page's chat, optionally about a node.
  if (p === "/api/say" && method === "POST") {
    const body = (await readJson(req)) as { text?: string; nodeId?: string };
    if (!body?.text?.trim()) return json(400, { error: "text is required" });
    return json(200, session.push("say", { text: body.text.trim(), id: body.nodeId }));
  }
  if (p === "/api/finish" && method === "POST") {
    return json(200, session.push("finish-request", { text: "The human asked to finish the adoption." }));
  }
  if (p === "/api/refine" && method === "POST") {
    const body = (await readJson(req)) as { id?: string; note?: string };
    if (!body?.id) return json(400, { error: "id is required" });
    return json(200, session.push("refine-request", { id: body.id, text: body.note?.trim() || `Define ${body.id} next.` }));
  }
  if (p === "/api/term" && method === "POST") {
    const body = (await readJson(req)) as { term?: string; definition?: string; decision?: "keep" | "drop"; replacement?: string };
    if (!body?.term || !body.decision) return json(400, { error: "term and decision are required" });
    if (body.decision === "keep") {
      const w = addGlossaryTerm(canonDir, body.term, body.definition ?? "");
      return json(200, { ok: true, ...w, feed: session.push("term-enshrined", { id: w.id, text: `${body.term}: ${body.definition ?? ""}`, path: "README.md" }) });
    }
    return json(200, { ok: true, feed: session.push("term-dropped", { text: `${body.term}${body.replacement ? ` → ${body.replacement}` : ""}` }) });
  }

  // ---- nodes: read raw, edit, approve, delete, create ----
  const nodeMatch = /^\/api\/node\/([^/]+)(\/raw|\/approve)?$/.exec(p);
  const today = () => new Date().toISOString().slice(0, 10);
  // A glossary term lives in the root README with its own marker; the page approves, rewrites and deletes it there.
  if (nodeMatch && nodeMatch[2] !== "/raw" && /^TERM-/.test(decodeURIComponent(nodeMatch[1] ?? ""))) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const readme = join(canonDir, "README.md");
    if (!existsSync(readme) || !loadCanon(canonDir).terms.some((t) => t.id === id)) return json(404, { error: "no such term" });
    const text = readFileSync(readme, "utf8");
    if (method === "POST" && nodeMatch[2] === "/approve") {
      writeFileSync(readme, setTermState(text, id, "resolved"));
      return json(200, { ok: true, path: "README.md", feed: session.push("node-approved", { id, path: "README.md", text: `${id} approved as written` }) });
    }
    if (method === "PUT") {
      const body = (await readJson(req)) as { title?: string; intent?: string };
      if (typeof body?.intent !== "string" || !body.intent.trim()) return json(400, { error: "intent is required" });
      writeFileSync(readme, editTerm(text, id, { term: body.title?.trim() || undefined, definition: body.intent }));
      return json(200, { ok: true, path: "README.md", feed: session.push("node-edited", { id, path: "README.md", text: `${id} rewritten: ${body.intent.trim().slice(0, 120)}` }) });
    }
    if (method === "DELETE") {
      writeFileSync(readme, deleteTerm(text, id));
      return json(200, { ok: true, removed: [id], feed: session.push("node-deleted", { id, path: "README.md", text: `${id} deleted in the page` }) });
    }
  }
  // A principle lives in the root README with its own marker; the page approves, rewrites and deletes it there.
  if (nodeMatch && nodeMatch[2] !== "/raw" && /^PRN-\d+$/.test(decodeURIComponent(nodeMatch[1] ?? ""))) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const readme = join(canonDir, "README.md");
    if (!existsSync(readme) || !loadCanon(canonDir).principles.some((x) => x.id === id)) return json(404, { error: "no such principle" });
    const text = readFileSync(readme, "utf8");
    if (method === "POST" && nodeMatch[2] === "/approve") {
      writeFileSync(readme, setPrincipleState(text, id, "resolved"));
      return json(200, { ok: true, path: "README.md", feed: session.push("node-approved", { id, path: "README.md", text: `${id} approved as written` }) });
    }
    if (method === "PUT") {
      const body = (await readJson(req)) as { title?: string; intent?: string };
      if (typeof body?.intent !== "string" || !body.intent.trim()) return json(400, { error: "intent is required" });
      writeFileSync(readme, editPrinciple(text, id, { title: body.title?.trim() || undefined, statement: body.intent }, today()));
      return json(200, { ok: true, path: "README.md", feed: session.push("node-edited", { id, path: "README.md", text: `${id} rewritten: ${body.intent.trim().slice(0, 120)}` }) });
    }
    if (method === "DELETE") {
      writeFileSync(readme, deletePrinciple(text, id));
      return json(200, { ok: true, removed: [id], feed: session.push("node-deleted", { id, path: "README.md", text: `${id} deleted in the page` }) });
    }
  }
  if (nodeMatch && method === "GET" && nodeMatch[2] === "/raw") {
    const file = fileOf(canonDir, decodeURIComponent(nodeMatch[1] ?? ""));
    if (!file) return json(404, { error: "no such node" });
    return json(200, { id: nodeMatch[1], path: file.rel, text: readFileSync(file.abs, "utf8") });
  }
  if (nodeMatch && method === "POST" && nodeMatch[2] === "/approve") {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const file = fileOf(canonDir, id);
    if (!file) return json(404, { error: "no such node" });
    writeFileSync(file.abs, approveNode(readFileSync(file.abs, "utf8"), today()));
    return json(200, { ok: true, path: file.rel, feed: session.push("node-approved", { id, path: file.rel, text: `${id} approved as written` }) });
  }
  if (nodeMatch && method === "PUT" && !nodeMatch[2]) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const file = fileOf(canonDir, id);
    if (!file) return json(404, { error: "no such node" });
    const body = (await readJson(req)) as { text?: string; title?: string; intent?: string; resolve?: string };
    if (typeof body?.text === "string") {
      const { data } = parseFrontMatter(body.text);
      if (str(data["id"])?.trim() !== id) return json(400, { error: `the front-matter id must stay ${id}` });
      writeFileSync(file.abs, body.text.endsWith("\n") ? body.text : body.text + "\n");
      return json(200, { ok: true, path: file.rel, feed: session.push("node-edited", { id, path: file.rel, text: "edited in the page" }) });
    }
    // Fields from the popup: the typed text is the human's wording, stated, and becomes the entry.
    if (typeof body?.intent !== "string" || !body.intent.trim()) return json(400, { error: "text or intent is required" });
    // settling an issue with these words also drops the section the issue came from
    let out = editNode(readFileSync(file.abs, "utf8"), { title: body.title?.trim() || undefined, intent: body.intent }, today());
    if (body.resolve === "open") out = dropSection(out, "Options");
    if (body.resolve === "contested") out = dropSection(out, "Contested");
    writeFileSync(file.abs, out);
    return json(200, { ok: true, path: file.rel, feed: session.push("node-edited", { id, path: file.rel, text: `${id} ${body.resolve ? "settled" : "rewritten"}: ${body.intent.trim().slice(0, 120)}` }) });
  }
  if (nodeMatch && method === "DELETE" && !nodeMatch[2]) {
    const id = decodeURIComponent(nodeMatch[1] ?? "");
    const file = fileOf(canonDir, id);
    if (!file) return json(404, { error: "no such node" });
    const canon = loadCanon(canonDir);
    const removed = [id, ...descendants(canon, id)];
    if (basename(file.abs) === "README.md") rmSync(dirname(file.abs), { recursive: true, force: true });
    else rmSync(file.abs, { force: true });
    return json(200, { ok: true, removed, feed: session.push("node-deleted", { id, path: file.rel, text: `${removed.join(", ")} deleted in the page` }) });
  }
  if (p === "/api/node" && method === "POST") {
    const body = (await readJson(req)) as { parent?: string; title?: string; intent?: string; layer?: string };
    if (!body?.title?.trim()) return json(400, { error: "title is required" });
    const r = createNode(canonDir, body.parent?.trim() || undefined, body.title.trim(), (body.intent ?? "").trim(), isLayer(body.layer) ? body.layer : undefined);
    if ("error" in r) return json(400, r);
    return json(200, { ...r, feed: session.push("node-created", { id: r.id, path: r.path, text: `${body.title.trim()} (created in the page)` }) });
  }

  // ---- static ----
  const rel = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, "text/plain; charset=utf-8", `Not found: ${p}`);
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(file).pipe(res);
}

/** The `Sources: [1] a, [2] b` line of a question, as a map from footnote number to source. */
export function parseSources(question: string): Map<string, string> {
  const out = new Map<string, string>();
  const line = /^Sources:\s*(.+)$/m.exec(question)?.[1];
  if (!line) return out;
  for (const m of line.matchAll(/\[(\d+)\]\s*([^[]+?)\s*(?=[,;.]?\s*\[\d+\]|[.]?\s*$)/g)) out.set(m[1]!, (m[2] ?? "").replace(/[,;]$/, "").trim());
  return out;
}

/** Replace text outside tags, leaving the HTML tags themselves alone. */
function mapText(html: string, fn: (text: string) => string): string {
  return html.split(/(<[^>]+>)/).map((seg) => (seg.startsWith("<") ? seg : fn(seg))).join("");
}

/**
 * The question as the page shows it: rendered HTML with each jargon term wrapped in a span, and
 * each footnote marker carrying its source as a tooltip instead of a Sources line at the end.
 */
function presentQuestion(q: PendingQuestion) {
  const sources = parseSources(q.question);
  const decorate = (input: string) => {
    let html = input;
    if (sources.size) {
      html = html.replace(/<p>Sources:[\s\S]*?<\/p>\s*/i, "");
      html = mapText(html, (text) => text.replace(/\[(\d+)\]/g, (m, n: string) => (sources.has(n) ? `<sup class="fn" title="${escapeAttr(sources.get(n)!)}">${m}</sup>` : m)));
    }
    for (const t of q.terms) {
      const re = new RegExp(`\\b(${t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
      html = mapText(html, (seg) => seg.replace(re, (m) => `<span class="jargon" data-term="${escapeAttr(t.term)}">${m}</span>`));
    }
    return html;
  };
  // An option's description is the item's draft; it gets the same tooltips and jargon marks as the body.
  const options = q.options.map((o) => ({ ...o, html: o.description ? decorate(marked.parseInline(o.description, { async: false }) as string) : "" }));
  return { ...q, options, html: decorate(marked.parse(q.question, { async: false }) as string) };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function fileOf(canonDir: string, id: string): { abs: string; rel: string } | undefined {
  const canon = loadCanon(canonDir);
  const rel = id === "ROOT" ? canon.root?.file : canon.nodes[id]?.file ?? canon.journeys.find((j) => j.id === id)?.file ?? canon.decisions.find((d) => d.id === id)?.file;
  if (!rel) return undefined;
  const abs = resolve(canonDir, rel);
  if (!abs.startsWith(resolve(canonDir))) return undefined;
  return { abs, rel };
}

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "node";
}

/** Create a child node file; a leaf parent becomes a folder with a README first. */
function createNode(canonDir: string, parentId: string | undefined, title: string, intent: string, layer: Layer | undefined): { id: string; path: string } | { error: string } {
  const canon = loadCanon(canonDir);
  let dir = canonDir;
  let id: string;
  let depth = 0;
  if (parentId) {
    const parent = canon.nodes[parentId];
    if (!parent) return { error: `no such parent ${parentId}` };
    const parentAbs = resolve(canonDir, parent.file);
    if (basename(parentAbs) !== "README.md") {
      const folder = parentAbs.replace(/\.md$/, "");
      mkdirSync(folder, { recursive: true });
      renameSync(parentAbs, join(folder, "README.md"));
      dir = folder;
    } else dir = dirname(parentAbs);
    const used = parent.children.map((c) => Number(c.slice(parentId.length + 1).split(".")[0])).filter((n) => Number.isFinite(n));
    id = `${parentId}.${(used.length ? Math.max(...used) : 0) + 1}`;
    depth = parent.depth + 1;
  } else {
    const used = canon.roots.map((r) => Number(r.replace(/^REQ-/, "").split(".")[0])).filter((n) => Number.isFinite(n));
    id = `REQ-${(used.length ? Math.max(...used) : 0) + 1}`;
  }
  const chosen: Layer = layer ?? (["domain", "capability", "requirement"][Math.min(depth, 2)] as Layer);
  const file = join(dir, `${id}-${slugOf(title)}.md`);
  const today = new Date().toISOString().slice(0, 10);
  const text = `---\nid: ${id}\n${parentId ? `parent: ${parentId}\n` : ""}title: "${title.replace(/"/g, "'")}"\nstate: stated\nlayer: ${chosen}\nsource: "created in the viewer, ${today}"\n---\n\n# ${title}\n\n## Stated\n\n> ${intent || title}\n\nSource: typed by the human in the viewer, ${today}\n`;
  writeFileSync(file, text);
  return { id, path: file.slice(resolve(canonDir).length + 1).split("\\").join("/") };
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, fail) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        ok(data ? JSON.parse(data) : {});
      } catch (e) {
        fail(e);
      }
    });
    req.on("error", fail);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
