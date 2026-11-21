import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCanon, serveUi } from "../src/index.js";
import { loadRun, saveRun, type Run, type Slice } from "../src/runs.js";
import { resultsPath, saveManifest, type TestEntry } from "../src/testing.js";

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

  it("reports a canon revision that changes with any edit on disk, however it was made", async () => {
    const a = (await get("/api/session"))["rev"] as string;
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect((await get("/api/session"))["rev"]).toBe(a);
    const file = join(dir, "canon", "REQ-2-billing.md");
    writeFileSync(file, readFileSync(file, "utf8") + "\nEdited on disk, not through the page.\n");
    expect((await get("/api/session"))["rev"]).not.toBe(a);
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
    // approving PRN-2 settles every principle, so the gate opens by itself right there: no list approval to press
    expect(kinds).toEqual(["node-approved", "principles-approved", "node-edited", "node-deleted"]);
  });

  it("lists every queued question for the Issues panel", async () => {
    const a = (await send("/api/ask", { header: "Parsing", question: "Which stands?", options: [{ label: "A" }, { label: "B" }] })).body["questionId"] as string;
    const b = (await send("/api/ask", { header: "Billing", nodeId: "REQ-2", question: "Retry how?", options: [{ label: "Daily" }] })).body["questionId"] as string;
    const s = await get("/api/session");
    const mine = (s["queue"] as Array<{ id: string; header: string; nodeId?: string; question?: string }>).filter((q) => q.id === a || q.id === b);
    expect(mine.map((q) => [q.id, q.header, q.nodeId ?? null])).toEqual([[a, "Parsing", null], [b, "Billing", "REQ-2"]]);
    // every queued question travels whole, so the panel can show and answer any of them, not only the head
    expect(mine.map((q) => q.question)).toEqual(["Which stands?", "Retry how?"]);
    await send("/api/answer", { questionId: a, selected: ["A"] });
    await send("/api/answer", { questionId: b, selected: ["Daily"] });
    expect(((await get("/api/session"))["queue"] as Array<{ id: string }>).some((q) => q.id === a || q.id === b)).toBe(false);
  });

  it("settling an issue with the human's words drops the section it came from", async () => {
    await send("/api/node/REQ-2", { text: "---\nid: REQ-2\ntitle: \"Billing works\"\nstate: contested\n---\n\n# Billing works\n\n## Intent\n\nOld.\n\n## Contested\n\nTwo readings.\n\n- A (docs/a.md:1).\n- B (docs/b.md:2).\n" }, "PUT");
    expect(loadCanon(join(dir, "canon")).nodes["REQ-2"]?.state).toBe("contested");
    await send("/api/node/REQ-2", { intent: "A.", resolve: "contested" }, "PUT");
    const raw = (await get("/api/node/REQ-2/raw"))["text"] as string;
    expect(raw).not.toContain("## Contested");
    expect(loadCanon(join(dir, "canon")).nodes["REQ-2"]?.state).toBe("stated");
    expect(raw).toContain("> A.");
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
    await send("/api/say", { text: "Which of the two stands?", nodeId: "REQ-1", to: "human" });
    await send("/api/refine", { id: "REQ-1" });
    const changes = await get(`/api/changes?since=${before}`);
    const entries = changes["entries"] as Array<Record<string, unknown>>;
    expect(entries.map((e) => e["kind"])).toEqual(["term-enshrined", "message", "message", "edit-conflict", "say", "refine-request"]);
    expect(entries[3]).toMatchObject({ kind: "edit-conflict", id: "REQ-1" });
    expect(entries[4]).toMatchObject({ kind: "say", to: "human" });
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
  it("withdraws a box's pending question when the human rewrites it, and tells a live session from a dead one", async () => {
    const q = (await send("/api/ask", { nodeId: "REQ-1.1", question: "Still open?", header: "Draft" })).body["questionId"] as string;
    expect(((await get("/api/session"))["queue"] as Array<{ id: string }>).some((x) => x.id === q)).toBe(true);
    expect((await send("/api/node/REQ-1.1", { intent: "Signing up takes one step." }, "PUT")).status).toBe(200);
    expect(((await get("/api/session"))["queue"] as Array<{ id: string }>).some((x) => x.id === q)).toBe(false);
    expect(((await get(`/api/wait?id=${q}&timeout=1`))["answer"] as { other: string }).other).toMatch(/^superseded:/);
    const before = (await get("/api/session"))["agentSeenAgo"];
    await fetch(base + "/api/session", { headers: { "x-headcanon-agent": "mcp" } });
    expect(typeof (await get("/api/session"))["agentSeenAgo"]).toBe("number");
    expect(before === null || typeof before === "number").toBe(true);
  });
  it("withdraws a box's questions at the session's word", async () => {
    const q = (await send("/api/ask", { nodeId: "REQ-2", question: "Decided after all?", header: "Draft" })).body["questionId"] as string;
    expect((await send("/api/withdraw", { nodeId: "REQ-2", reason: "decided by precedence" })).body["withdrawn"]).toBe(1);
    expect(((await get("/api/session"))["queue"] as Array<{ id: string }>).some((x) => x.id === q)).toBe(false);
    expect((await send("/api/withdraw", {})).status).toBe(400);
  });
  it("keeps what the session says it is doing, for the page's live status", async () => {
    expect((await send("/api/say", { text: "Cutting two boxes.", doing: ["cutting REQ-1.1", "verifying REQ-2"] })).status).toBe(200);
    const d = (await get("/api/session"))["doing"] as { items: string[]; at: string };
    expect(d.items).toEqual(["cutting REQ-1.1", "verifying REQ-2"]);
    expect(typeof d.at).toBe("string");
  });
  it("answers the marks, the tests and the run outside a repository, where none of their stores exists", async () => {
    expect(await get("/api/run")).toEqual({ run: null, listening: false });
    expect(((await get("/api/marks"))["counts"] as { tested: number }).tested).toBe(0);
    expect(await get("/api/tests?id=REQ-2")).toEqual({ tests: [] });
    const s = await get("/api/session");
    expect([String(s["marksRev"]), String(s["runRev"])].every((x) => /^[0-9a-f]{12}$/.test(x))).toBe(true);
    expect((await get("/api/status"))["run"]).toBeNull();
    expect((await send("/api/slice/approve", { box: "REQ-2" })).body).toEqual({ ok: false, error: "The canon is not inside a git repository, so there is no run to decide on." });
  });
});

describe("marks, tests and the run through the viewer [REQ-12.1.7]", () => {
  let dir: string;
  let canonDir: string;
  let gitDir: string;
  let base: string;
  let close: () => void;
  const get = (p: string) => fetch(base + p).then((r) => r.json() as Promise<Record<string, unknown>>);
  const send = (p: string, body: unknown) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));
  const start = async () => {
    const served = await serveUi({ canonDir, port: 0 });
    base = served.url.replace(/\/$/, "");
    close = served.close;
  };
  const onBox = async (id: string) => ((await get("/api/session"))["queue"] as Array<Record<string, unknown>>).filter((q) => q["nodeId"] === id);
  const entriesSince = async (cursor: number) => (await get(`/api/changes?since=${cursor}`))["entries"] as Array<Record<string, unknown>>;

  // a repository of its own, so the stores under its git directory exist: the queue, the results, the runs
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "headcanon-run-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    canonDir = join(dir, "canon");
    cpSync(MINI, canonDir, { recursive: true });
    gitDir = join(dir, ".git");
    await start();
  });
  afterAll(() => {
    close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the questions of two authors on one box, and both survive a restart of the viewer", async () => {
    const mine = (await send("/api/ask", { nodeId: "REQ-1.1", question: "Which limit stands?", header: "Draft" })).body["questionId"] as string;
    const theirs = (await send("/api/ask", { nodeId: "REQ-1.1", kind: "impossible", question: "Sign-up cannot end in one step.", by: "implementer-REQ-1.1", blocks: true })).body["questionId"] as string;
    expect((await onBox("REQ-1.1")).map((q) => q["id"])).toEqual([mine, theirs]);
    expect(existsSync(join(gitDir, "headcanon", "questions.json"))).toBe(true);
    close();
    await start();
    const kept = await onBox("REQ-1.1");
    expect(kept.map((q) => q["id"])).toEqual([mine, theirs]);
    expect(kept[1]).toMatchObject({ kind: "impossible", by: "implementer-REQ-1.1", blocks: true, options: [], header: "Could not be built" });
    expect("by" in kept[0]!).toBe(false);
    // the agent's newer question replaces its own and leaves the session's
    const newer = (await send("/api/ask", { nodeId: "REQ-1.1", kind: "impossible", question: "Sign-up needs a second step.", by: "implementer-REQ-1.1", blocks: true })).body["questionId"] as string;
    expect((await onBox("REQ-1.1")).map((q) => q["id"])).toEqual([mine, newer]);
    // a withdrawal under a name takes that author's only; the answer says whose issue it was
    expect((await send("/api/withdraw", { nodeId: "REQ-1.1", by: "tester-REQ-1" })).body["withdrawn"]).toBe(0);
    const before = (await get("/api/changes"))["cursor"] as number;
    expect((await send("/api/answer", { questionId: newer, selected: [], other: "Two steps are fine." })).status).toBe(200);
    expect((await entriesSince(before))[0]).toMatchObject({ kind: "answer", id: "REQ-1.1", by: "implementer-REQ-1.1", blocks: true });
    expect((await send("/api/withdraw", { nodeId: "REQ-1.1" })).body["withdrawn"]).toBe(1);
    expect(await onBox("REQ-1.1")).toEqual([]);
  });

  it("hands an implement request, a stop and a continue to the session, and says whether one is listening", async () => {
    const before = (await get("/api/changes"))["cursor"] as number;
    expect((await send("/api/implement", { ids: ["REQ-1", "REQ-2", "REQ-1"] })).body).toEqual({ ok: true, listening: false });
    expect((await send("/api/implement", { ids: ["REQ-1.1"], single: true })).body).toEqual({ ok: true, listening: false });
    // nothing selected is every box: the entry names none
    expect((await send("/api/implement", { ids: [] })).status).toBe(200);
    // an id that is no box is refused, never dropped: dropping it would widen the scope to everything
    const unknown = await send("/api/implement", { ids: ["REQ-1", "REQ-99"] });
    expect([unknown.status, unknown.body["ok"], String(unknown.body["error"])]).toEqual([400, false, "no such box: REQ-99"]);
    expect((await send("/api/implement", { ids: ["REQ-1", "REQ-2"], single: true })).status).toBe(400);
    expect((await send("/api/implement", {})).status).toBe(400);
    expect((await send("/api/run/stop", {})).body["ok"]).toBe(true);
    expect((await send("/api/run/continue", {})).body["ok"]).toBe(true);
    const entries = await entriesSince(before);
    expect(entries.map((e) => [e["kind"], e["id"] ?? null, e["text"]])).toEqual([
      ["implement-request", "REQ-1 REQ-2", "all"],
      ["implement-request", "REQ-1.1", "single"],
      ["implement-request", null, "all"],
      ["run-stop", null, "The human asked to stop the run."],
      ["run-continue", null, "The human asked to continue the run."],
    ]);
    // a session waiting on the feed is listening, and the request wakes it
    const cursor = (await get("/api/changes"))["cursor"] as number;
    const waiting = fetch(`${base}/api/changes?since=${cursor}&timeout=5&wake=human`).then((r) => r.json() as Promise<{ entries: Array<{ kind: string; id?: string }> }>);
    await new Promise((r) => setTimeout(r, 150));
    expect((await get("/api/run"))["listening"]).toBe(true);
    expect((await send("/api/implement", { ids: ["ROOT"] })).body).toEqual({ ok: true, listening: true });
    expect((await waiting).entries.map((e) => `${e.kind}:${e.id}`)).toEqual(["implement-request:ROOT"]);
  });

  it("answers empty where no test and no run was recorded, and refuses a decision with the reason", async () => {
    const marks = await get("/api/marks");
    expect(String(marks["rev"])).toMatch(/^[0-9a-f]{12}$/);
    const measurable = Object.values(loadCanon(canonDir).nodes).filter((n) => n.kind && n.state !== "draft").length;
    expect(marks["counts"]).toMatchObject({ outOfSync: 0, tested: 0, measurable });
    expect(Object.keys(marks["counts"] as object).sort()).toEqual(["measurable", "notBuilt", "outOfSync", "tested"]);
    expect(typeof marks["marks"]).toBe("object");
    expect(await get("/api/tests?id=REQ-1.1")).toEqual({ tests: [] });
    expect(await get("/api/tests?id=REQ-99")).toEqual({ tests: [] });
    expect((await fetch(`${base}/api/tests`)).status).toBe(400);
    expect(await get("/api/run")).toEqual({ run: null, listening: false });
    expect((await get("/api/status"))["run"]).toBeNull();
    for (const action of ["approve", "discard", "send-back"]) {
      const r = await send(`/api/slice/${action}`, { box: "REQ-1.1", note: "Keep the email optional." });
      expect([r.status, r.body]).toEqual([200, { ok: false, error: "No run is waiting on your decision." }]);
      expect((await send(`/api/slice/${action}`, { note: "No box named." })).status).toBe(400);
    }
    expect((await send("/api/slice/send-back", { box: "REQ-1.1" })).body).toMatchObject({ ok: false, error: "note is required: say what to change" });
  });

  it("gives the page a revision for the marks and one for the run, each changing only with its own stores", async () => {
    const a = await get("/api/session");
    expect([String(a["marksRev"]), String(a["runRev"])].every((x) => /^[0-9a-f]{12}$/.test(x))).toBe(true);
    expect((await get("/api/marks"))["rev"]).toBe(a["marksRev"]);
    expect((await get("/api/session"))["marksRev"]).toBe(a["marksRev"]);
    // a test run writes its results beside the canon: the marks change, the canon does not
    mkdirSync(dirname(resultsPath(gitDir)), { recursive: true });
    writeFileSync(resultsPath(gitDir), JSON.stringify({ at: new Date().toISOString(), tree: "", results: [], runs: [] }));
    const b = await get("/api/session");
    expect(b["marksRev"]).not.toBe(a["marksRev"]);
    expect([b["rev"], b["runRev"]]).toEqual([a["rev"], a["runRev"]]);
    expect((await get("/api/marks"))["rev"]).toBe(b["marksRev"]);
    // the record of tests lives in the canon folder, so it moves both the canon's revision and the marks'
    writeFileSync(join(canonDir, "tests.json"), JSON.stringify({ runners: {}, tests: [] }));
    const c = await get("/api/session");
    expect(c["marksRev"]).not.toBe(b["marksRev"]);
    expect(c["rev"]).not.toBe(b["rev"]);
    expect(c["runRev"]).toBe(a["runRev"]);
    rmSync(join(canonDir, "tests.json"));
  });

  it("shows a box's recorded tests in plain words, each with its last outcome, from the stores of testing.ts", async () => {
    const file = join(canonDir, "REQ-1-onboarding", "REQ-1.1-fast-signup.md");
    writeFileSync(file, readFileSync(file, "utf8").replace(/id: REQ-1\.1(\r?\n)/, "id: REQ-1.1$1uid: u-11$1"));
    expect(loadCanon(canonDir).nodes["REQ-1.1"]?.uid).toBe("u-11");
    const entry = (title: string, extra: Partial<TestEntry> = {}): TestEntry => ({ box: "u-11", id: "REQ-1.1", runner: "unit", kind: "unit", file: "tests/signup.test.txt", title, description: "Signs up with a name alone and checks that it ends within the limit.", pin: "pin", status: "accepted", at: new Date().toISOString(), ...extra });
    saveManifest(canonDir, {
      runners: { unit: { kind: "unit", command: "run {files}", format: "junit" } },
      tests: [
        entry("sign-up is fast [hc:u-11]"),
        entry("first project, start to end [hc:u-11]", { kind: "e2e", file: "tests/first-project.txt", journey: "JRN-1", description: "Plays the first-project journey from the first screen to the first saved project." }),
        entry("another box [hc:u-2]", { box: "u-2", id: "REQ-2" }),
      ],
    });
    writeFileSync(resultsPath(gitDir), JSON.stringify({ at: new Date().toISOString(), tree: "t", results: [{ box: "u-11", title: "sign-up is fast [hc:u-11]", file: "tests/signup.test.txt", runner: "unit", outcome: "failed", message: "took 90 seconds" }], runs: [] }));
    expect(await get("/api/tests?id=REQ-1.1")).toEqual({ tests: [
      { description: "Signs up with a name alone and checks that it ends within the limit.", kind: "unit", file: "tests/signup.test.txt", runner: "unit", status: "accepted", outcome: "failed", message: "took 90 seconds" },
      { description: "Plays the first-project journey from the first screen to the first saved project.", kind: "e2e", file: "tests/first-project.txt", runner: "unit", status: "accepted", journey: "JRN-1" },
    ] });
    expect(await get("/api/tests?id=REQ-1")).toEqual({ tests: [] });
    // one box of the canon carries tests now
    expect(((await get("/api/marks"))["counts"] as { tested: number }).tested).toBe(1);
  });

  it("shows the run from the store of runs.ts and sends a slice back with the human's note", async () => {
    const slice = (box: string, uid: string, status: Slice["status"]): Slice => ({ box, uid, title: box, status, owes: [uid], attempts: 1, lastFailing: [], commits: [], issues: [] });
    const step = (name: Run["steps"][number]["name"], status: Run["steps"][number]["status"]) => ({ name, status });
    const run: Run = {
      id: "run-1", startedAt: new Date().toISOString(), scope: ["REQ-1", "REQ-2"], single: false, branch: "headcanon/build", base: "main", status: "review",
      steps: [step("prepare", "done"), step("readiness", "done"), step("tests", "done"), step("first-run", "done"), step("build", "running"), step("review", "waiting")],
      slices: [{ ...slice("REQ-1.1", "u-11", "review"), summary: "Sign-up now ends in one step." }, slice("REQ-2", "u-2", "building")],
    };
    const before = await get("/api/session");
    saveRun(gitDir, run);
    expect((await get("/api/session"))["runRev"]).not.toBe(before["runRev"]);
    const shown = (await get("/api/run"))["run"] as Run;
    expect([shown.id, shown.status, shown.slices.map((s) => `${s.box}:${s.status}`)]).toEqual(["run-1", "review", ["REQ-1.1:review", "REQ-2:building"]]);
    expect((await get("/api/status"))["run"]).toEqual({ id: "run-1", status: "review", step: "build" });
    // only a slice that waits on the human can be decided
    expect((await send("/api/slice/send-back", { box: "REQ-2", note: "Not yet." })).body).toEqual({ ok: false, error: "REQ-2 is not waiting on your decision: it is building." });
    expect((await send("/api/slice/approve", { box: "REQ-9" })).body).toEqual({ ok: false, error: "REQ-9 is not part of the run." });
    const cursor = (await get("/api/changes"))["cursor"] as number;
    expect((await send("/api/slice/send-back", { box: "REQ-1.1", note: " Keep the email optional. " })).body).toEqual({ ok: true });
    expect(loadRun(gitDir, "run-1")?.slices[0]).toMatchObject({ box: "REQ-1.1", status: "sent-back", note: "Keep the email optional." });
    expect(await entriesSince(cursor)).toMatchObject([{ kind: "slice-sent-back", id: "REQ-1.1", text: "Keep the email optional." }]);
    // decided once: the same slice no longer waits
    expect((await send("/api/slice/approve", { box: "REQ-1.1" })).body).toEqual({ ok: false, error: "REQ-1.1 is not waiting on your decision: it is sent-back." });
  });
});
