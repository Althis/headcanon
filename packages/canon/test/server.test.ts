import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCanon, serveUi } from "../src/index.js";

const MINI = fileURLToPath(new URL("./fixtures/mini/", import.meta.url));

describe("viewer session endpoints [REQ-12.1.7]", () => {
  let dir: string;
  let base: string;
  let close: () => void;
  const get = (p: string) => fetch(base + p).then((r) => r.json() as Promise<Record<string, unknown>>);
  const send = (p: string, body: unknown, method = "POST") => fetch(base + p, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "headcanon-server-"));
    cpSync(MINI, join(dir, "canon"), { recursive: true });
    const served = await serveUi({ canonDir: join(dir, "canon"), port: 0 });
    base = served.url.replace(/\/$/, "");
    close = served.close;
  });
  afterAll(() => {
    close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("asks, shows, answers and hands the answer to a waiter", async () => {
    const asked = await send("/api/ask", { question: "Premise (1 of 5): what it is.\n\nDraft: \"A thing that uses a Widget.\" [1]\n\nSources: [1] README.md:1", header: "Premise", nodeId: "REQ-1", terms: [{ term: "Widget", definition: "a small part" }], options: [{ label: "Approve as written", description: "The Widget stays. [1]" }, { label: "Drop" }] });
    const id = asked.body["questionId"] as string;
    expect(id).toBeTruthy();
    const s = await get("/api/session");
    const q = s["question"] as Record<string, unknown>;
    expect(q["id"]).toBe(id);
    expect(String(q["html"])).toContain('class="jargon" data-term="Widget"');
    // Footnote markers carry their source as a tooltip; the Sources line itself is not shown.
    expect(String(q["html"])).toContain('<sup class="fn" title="README.md:1">[1]</sup>');
    expect(String(q["html"])).not.toContain("Sources:");
    // An option's description gets the same treatment, since list drafts live in the options.
    const opt = (q["options"] as Array<Record<string, string>>)[0]!;
    expect(opt["html"]).toContain('class="jargon" data-term="Widget"');
    expect(opt["html"]).toContain('title="README.md:1"');
    expect((s["focus"] as Record<string, unknown>)["id"]).toBeUndefined();
    const pending = await get(`/api/wait?id=${id}&timeout=1`);
    expect(pending["pending"]).toBe(true);
    const ans = await send("/api/answer", { questionId: id, selected: ["Approve as written"], other: "", terms: [{ term: "Widget", decision: "keep" }] });
    expect(ans.status).toBe(200);
    const got = await get(`/api/wait?id=${id}&timeout=1`);
    expect((got["answer"] as Record<string, unknown>)["selected"]).toEqual(["Approve as written"]);
    expect((await get("/api/session"))["question"]).toBeNull();
    expect((await get("/api/wait?id=nope&timeout=1"))["unknown"]).toBe(true);
  });

  it("approves, rewrites and deletes nodes from the page, lets the session speak, and waits for changes", async () => {
    const before = (await get("/api/changes"))["cursor"] as number;
    const approved = await send("/api/node/REQ-2/approve", {});
    expect(approved.status).toBe(200);
    expect(loadCanon(join(dir, "canon")).nodes["REQ-2"]?.state).toBe("resolved");
    const edited = await send("/api/node/REQ-2", { title: "Billing just works", intent: "Every invoice is paid without a reminder." }, "PUT");
    expect(edited.status).toBe(200);
    const n = loadCanon(join(dir, "canon")).nodes["REQ-2"]!;
    expect(n.title).toBe("Billing just works");
    expect(n.state).toBe("stated");
    expect(n.body).toContain("> Every invoice is paid without a reminder.");
    const said = await send("/api/say", { text: "Rewrote the parent to match.", nodeId: "REQ-2" });
    expect(said.status).toBe(200);
    // A waiter sees the next entry as soon as it arrives.
    const waiting = fetch(`${base}/api/changes?since=${(await get("/api/changes"))["cursor"]}&timeout=5`).then((r) => r.json() as Promise<{ entries: Array<{ kind: string }> }>);
    await new Promise((r) => setTimeout(r, 100));
    await send("/api/finish", {});
    const woke = await waiting;
    expect(woke.entries.map((e) => e.kind)).toEqual(["finish-request"]);
    const deleted = await fetch(`${base}/api/node/REQ-1.2`, { method: "DELETE" }).then((r) => r.json() as Promise<{ removed: string[] }>);
    expect(deleted.removed).toEqual(["REQ-1.2"]);
    expect(existsSync(join(dir, "canon", "REQ-1-onboarding", "REQ-1.2-orphan.md"))).toBe(false);
    const kinds = ((await get(`/api/changes?since=${before}`))["entries"] as Array<{ kind: string }>).map((e) => e.kind);
    expect(kinds).toEqual(["node-approved", "node-edited", "say", "finish-request", "node-deleted"]);
  });

  it("approves, rewrites and deletes a principle in the root README from the page", async () => {
    expect(loadCanon(join(dir, "canon")).principles.map((p) => p.state)).toEqual(["stated", "assumed"]);
    const before = (await get("/api/changes"))["cursor"] as number;
    expect((await send("/api/node/PRN-2/approve", {})).status).toBe(200);
    expect(loadCanon(join(dir, "canon")).principles.find((p) => p.id === "PRN-2")?.state).toBe("resolved");
    expect((await send("/api/node/PRN-1", { title: "Keep every original", intent: "Nothing imported is ever thrown away." }, "PUT")).status).toBe(200);
    const p = loadCanon(join(dir, "canon")).principles.find((x) => x.id === "PRN-1")!;
    expect([p.title, p.state, p.statement]).toEqual(["Keep every original", "stated", "Nothing imported is ever thrown away."]);
    expect((await send("/api/node/PRN-2", {}, "DELETE")).status).toBe(200);
    expect(loadCanon(join(dir, "canon")).principles.map((x) => x.id)).toEqual(["PRN-1"]);
    const kinds = ((await get(`/api/changes?since=${before}`))["entries"] as Array<{ kind: string }>).map((e) => e.kind);
    expect(kinds).toEqual(["node-approved", "node-edited", "node-deleted"]);
  });

  it("lists every queued question for the Issues panel", async () => {
    const a = (await send("/api/ask", { header: "Parsing", question: "Which stands?", options: [{ label: "A" }, { label: "B" }] })).body["questionId"] as string;
    const b = (await send("/api/ask", { header: "Billing", nodeId: "REQ-2", question: "Retry how?", options: [{ label: "Daily" }] })).body["questionId"] as string;
    const s = await get("/api/session");
    const mine = (s["queue"] as Array<{ id: string; header: string; nodeId?: string }>).filter((q) => q.id === a || q.id === b);
    expect(mine.map((q) => [q.id, q.header, q.nodeId ?? null])).toEqual([[a, "Parsing", null], [b, "Billing", "REQ-2"]]);
    await send("/api/answer", { questionId: a, selected: ["A"] });
    await send("/api/answer", { questionId: b, selected: ["Daily"] });
    expect(((await get("/api/session"))["queue"] as Array<{ id: string }>).some((q) => q.id === a || q.id === b)).toBe(false);
  });

  it("approves, rewrites and deletes a glossary term from the page", async () => {
    const before = (await get("/api/changes"))["cursor"] as number;
    expect((await send("/api/node/TERM-skip/approve", {})).status).toBe(200);
    expect(loadCanon(join(dir, "canon")).terms.find((t) => t.id === "TERM-skip")?.state).toBe("resolved");
    expect((await send("/api/node/TERM-widget", { title: "widget", intent: "A small part of a machine." }, "PUT")).status).toBe(200);
    expect(loadCanon(join(dir, "canon")).terms.find((t) => t.id === "TERM-widget")?.definition).toBe("A small part of a machine.");
    expect((await send("/api/node/TERM-skip", {}, "DELETE")).status).toBe(200);
    expect(loadCanon(join(dir, "canon")).terms.map((t) => t.id)).toEqual(["TERM-widget"]);
    const kinds = ((await get(`/api/changes?since=${before}`))["entries"] as Array<{ kind: string }>).map((e) => e.kind);
    expect(kinds).toEqual(["node-approved", "node-edited", "node-deleted"]);
  });

  it("enshrines a kept term, records a message and a refine request, and reports them as changes", async () => {
    const before = (await get("/api/changes"))["cursor"] as number;
    const kept = await send("/api/term", { term: "Widget", definition: "a small part", decision: "keep" });
    expect(kept.body["id"]).toBe("TERM-widget");
    expect(loadCanon(join(dir, "canon")).terms.map((t) => t.id)).toContain("TERM-widget");
    await send("/api/message", { text: "please go deeper on REQ-1" });
    await send("/api/message", { text: "what does this mean?", nodeId: "REQ-1", quote: "productive without help" });
    await send("/api/conflict", { id: "REQ-1", choice: "keep" });
    await send("/api/refine", { id: "REQ-1" });
    const changes = await get(`/api/changes?since=${before}`);
    const entries = changes["entries"] as Array<Record<string, unknown>>;
    expect(entries.map((e) => e["kind"])).toEqual(["term-enshrined", "message", "message", "edit-conflict", "refine-request"]);
    expect(entries[3]).toMatchObject({ kind: "edit-conflict", id: "REQ-1" });
    expect(entries[2]).toMatchObject({ kind: "message", id: "REQ-1", quote: "productive without help", text: "what does this mean?" });
  });

  it("edits a node and creates a child, turning a leaf parent into a folder", async () => {
    const raw = await get("/api/node/REQ-1.1/raw");
    expect(String(raw["text"])).toContain("id: REQ-1.1");
    const bad = await send("/api/node/REQ-1.1", { text: String(raw["text"]).replace("id: REQ-1.1", "id: REQ-9") }, "PUT");
    expect(bad.status).toBe(400);
    const edited = await send("/api/node/REQ-1.1", { text: String(raw["text"]).replace("Sign-up takes under 60 seconds", "Sign-up takes under 30 seconds") }, "PUT");
    expect(edited.status).toBe(200);
    expect(loadCanon(join(dir, "canon")).nodes["REQ-1.1"]?.title).toBe("Sign-up takes under 30 seconds");

    const created = await send("/api/node", { parent: "REQ-1.1", title: "Email is optional", intent: "A player may sign up without an email address." });
    expect(created.status).toBe(200);
    expect(created.body["id"]).toBe("REQ-1.1.1");
    const canon = loadCanon(join(dir, "canon"));
    expect(canon.nodes["REQ-1.1.1"]?.parent).toBe("REQ-1.1");
    expect(canon.nodes["REQ-1.1.1"]?.state).toBe("stated");
    expect(canon.nodes["REQ-1.1.1"]?.layer).toBe("requirement");
    expect(existsSync(join(dir, "canon", "REQ-1-onboarding", "REQ-1.1-fast-signup", "README.md"))).toBe(true);
    expect(readFileSync(join(dir, "canon", "REQ-1-onboarding", "REQ-1.1-fast-signup", "README.md"), "utf8")).toContain("id: REQ-1.1");
    const top = await send("/api/node", { title: "Billing is fair" });
    expect(top.body["id"]).toBe("REQ-3");
  });
});
