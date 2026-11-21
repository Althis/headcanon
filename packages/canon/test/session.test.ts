import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionState, isHumanEntry, type FeedKind } from "../src/session.js";

describe("session state [REQ-12.1.7]", () => {
  it("queues questions, shows the head, and resolves waiters on answer", async () => {
    const s = new SessionState();
    const q1 = s.ask({ question: "First?", header: "A", nodeId: "REQ-1" });
    const q2 = s.ask({ question: "Second?", options: [{ label: "x" }], multiSelect: true });
    expect(s.current()?.id).toBe(q1.id);
    expect(s.pendingCount()).toBe(2);
    // a question no longer moves the view: the page lists it under Issues and the human opens it
    expect(s.focus().id).toBeUndefined();
    expect(q1.options.map((o) => o.label)).toEqual(["Approve as written", "Drop"]);
    expect(q2.multiSelect).toBe(true);

    const waiting = s.waitFor(q1.id, 5000);
    expect(await s.waitFor(q1.id, 10)).toBeUndefined();
    expect(s.answer({ questionId: q1.id, selected: ["Approve as written"], other: "", terms: [] })).toBe(true);
    const a = await waiting;
    expect(a?.selected).toEqual(["Approve as written"]);
    expect(s.current()?.id).toBe(q2.id);
    expect(await s.waitFor(q1.id, 10)).toEqual(a);
    expect(await s.waitFor("nope", 10)).toBeNull();
    expect(s.answer({ questionId: "nope", selected: [], other: "", terms: [] })).toBe(false);
  });

  it("keeps a feed with a cursor", () => {
    const s = new SessionState();
    const c0 = s.changes().cursor;
    s.push("message", { text: "hello" });
    s.push("refine-request", { id: "REQ-2" });
    const all = s.changes(c0);
    expect(all.entries.map((e) => e.kind)).toEqual(["message", "refine-request"]);
    expect(s.changes(all.cursor).entries).toEqual([]);
    expect(all.entries[1]?.id).toBe("REQ-2");
  });
  it("keeps the queue in its file, so a session restarted mid-adoption shows the same issues", () => {
    const store = join(mkdtempSync(join(tmpdir(), "headcanon-q-")), "questions.json");
    const a = new SessionState(store);
    const q = a.ask({ question: "Kept?", header: "Keep", nodeId: "REQ-1", options: [{ label: "yes" }] });
    a.ask({ question: "Also kept?", header: "Also" });
    const b = new SessionState(store);
    expect(b.queued().map((x) => x.header)).toEqual(["Keep", "Also"]);
    expect(b.current()?.id).toBe(q.id);
    b.answer({ questionId: q.id, selected: ["yes"], other: "", terms: [] });
    expect(new SessionState(store).queued().map((x) => x.header)).toEqual(["Also"]);
  });
  it("reads the file back before it writes, so a queue an operation rewrote is never overwritten by a stale one", () => {
    /** Another process rewrote the store: the question on `from` now names `to`, as a move or a merge does. */
    const rewrite = (store: string, from: string, to: string) => {
      const saved = JSON.parse(readFileSync(store, "utf8")) as { queue: Array<{ nodeId?: string }> };
      for (const q of saved.queue) if (q.nodeId === from) q.nodeId = to;
      writeFileSync(store, JSON.stringify(saved, null, 2));
      // the other process wrote later than this one; the clock is moved rather than waited for
      const later = Date.now() / 1000 + 2;
      utimesSync(store, later, later);
    };
    const nodeIds = (store: string) => (JSON.parse(readFileSync(store, "utf8")) as { queue: Array<{ nodeId?: string }> }).queue.map((q) => q.nodeId);
    const store = join(mkdtempSync(join(tmpdir(), "headcanon-q-")), "questions.json");
    const s = new SessionState(store);
    s.ask({ question: "Where?", header: "Draft", nodeId: "REQ-1.1" });
    rewrite(store, "REQ-1.1", "REQ-2.1");
    s.ask({ question: "And this?", header: "Other", nodeId: "REQ-3" });
    expect(s.queued().map((q) => q.nodeId)).toEqual(["REQ-2.1", "REQ-3"]);
    expect(nodeIds(store)).toEqual(["REQ-2.1", "REQ-3"]);
    // a withdrawal and an answer read the file first too
    rewrite(store, "REQ-3", "REQ-9");
    expect(s.supersede("REQ-9", "the human rewrote the box")).toBe(1);
    expect(nodeIds(store)).toEqual(["REQ-2.1"]);
    const [left] = s.queued();
    rewrite(store, "REQ-2.1", "REQ-2.2");
    expect(s.answer({ questionId: left!.id, selected: ["Drop"], other: "", terms: [] })).toBe(true);
    expect(s.changes().entries.find((e) => e.kind === "answer")?.id).toBe("REQ-2.2");
    expect(nodeIds(store)).toEqual([]);
  });
  it("an issue has a kind and a why; a contradiction carries no default options", () => {
    const s = new SessionState();
    const q = s.ask({ kind: "contradiction", nodeId: "REQ-2", question: "Which stands?", why: "Billing depends on it." });
    expect([q.kind, q.why, q.header, q.options]).toEqual(["contradiction", "Billing depends on it.", "Contradiction", []]);
    expect(s.queued()[0]).toMatchObject({ kind: "contradiction", nodeId: "REQ-2" });
    expect(s.ask({ question: "Plain?" }).kind).toBe("question");
  });
  it("keeps one question per box: a newer ask replaces the pending one, and a rewrite withdraws it, waking the waiter", async () => {
    const s = new SessionState();
    const a = s.ask({ nodeId: "REQ-9", question: "First?", header: "Draft" });
    const waited = s.waitFor(a.id, 1000);
    const b = s.ask({ nodeId: "REQ-9", question: "Second?", header: "Draft" });
    expect(s.queued().map((q) => q.id)).toEqual([b.id]);
    expect((await waited)?.other).toBe("superseded: a newer question on the same box");
    expect(s.supersede("REQ-9", "the human rewrote the box")).toBe(1);
    expect(s.queued()).toEqual([]);
    expect(s.changes().entries.filter((e) => e.kind === "question-superseded").map((e) => e.id)).toEqual(["REQ-9", "REQ-9"]);
  });
  it("a box that could not be built is an issue of its own kind, with its agent's choices only, its author and whether it blocks", () => {
    const s = new SessionState();
    const q = s.ask({ kind: "impossible", nodeId: "REQ-2.1", question: "The month cannot be closed twice and reopened once.", by: " implementer-REQ-2.1 ", blocks: true });
    expect([q.kind, q.header, q.options, q.by, q.blocks]).toEqual(["impossible", "Could not be built", [], "implementer-REQ-2.1", true]);
    expect(s.queued()[0]).toMatchObject({ kind: "impossible", nodeId: "REQ-2.1", by: "implementer-REQ-2.1", blocks: true });
    const given = s.ask({ kind: "impossible", nodeId: "REQ-2.2", question: "Which way out?", options: [{ label: "Drop the check" }, { label: "Reword the box" }] });
    expect(given.options.map((o) => o.label)).toEqual(["Drop the check", "Reword the box"]);
    // the session's own question says neither; an unknown kind is a plain question
    const plain = s.ask({ question: "Plain?", by: "  " });
    expect("by" in plain || "blocks" in plain).toBe(false);
    expect(s.ask({ question: "Odd?", kind: "riddle" as never }).kind).toBe("question");
  });
  it("keeps the questions of different authors on one box side by side; a newer one replaces only its own author's", async () => {
    const s = new SessionState();
    const session = s.ask({ nodeId: "REQ-3", question: "Which rule stands?", header: "Draft" });
    const builder = s.ask({ nodeId: "REQ-3", question: "No statement balances.", kind: "impossible", by: "implementer-REQ-3", blocks: true });
    const other = s.ask({ nodeId: "REQ-3", question: "Is a month a calendar month?", by: "tester-REQ-3" });
    expect(s.queued().map((q) => q.id)).toEqual([session.id, builder.id, other.id]);
    const waited = s.waitFor(builder.id, 1000);
    const again = s.ask({ nodeId: "REQ-3", question: "Still no statement balances.", kind: "impossible", by: "implementer-REQ-3", blocks: true });
    expect(s.queued().map((q) => q.id)).toEqual([session.id, other.id, again.id]);
    expect((await waited)?.other).toBe("superseded: a newer question on the same box");
    // the session's newer question replaces the session's own, and no agent's
    const second = s.ask({ nodeId: "REQ-3", question: "Which rule stands now?", header: "Draft" });
    expect(s.queued().map((q) => q.id)).toEqual([other.id, again.id, second.id]);
    // one author's are withdrawn alone; the human's rewrite withdraws all that is left
    expect(s.supersede("REQ-3", "its agent settled it", (q) => q.by === "tester-REQ-3")).toBe(1);
    expect(s.queued().map((q) => q.id)).toEqual([again.id, second.id]);
    expect(s.supersede("REQ-3", "the human rewrote the box")).toBe(2);
  });
  it("keeps both authors' questions in the file, so both survive a restart", () => {
    const store = join(mkdtempSync(join(tmpdir(), "headcanon-q-")), "questions.json");
    const a = new SessionState(store);
    a.ask({ nodeId: "REQ-3", question: "Which rule stands?", header: "Draft" });
    a.ask({ nodeId: "REQ-3", question: "No statement balances.", kind: "impossible", by: "implementer-REQ-3", blocks: true });
    const b = new SessionState(store);
    expect(b.queuedFull().map((q) => [q.nodeId, q.kind, q.by ?? null, q.blocks ?? false])).toEqual([["REQ-3", "question", null, false], ["REQ-3", "impossible", "implementer-REQ-3", true]]);
    // after the restart the same rule holds: the agent's newer question replaces its own and leaves the session's
    b.ask({ nodeId: "REQ-3", question: "Entries of two months cannot share a statement.", kind: "impossible", by: "implementer-REQ-3", blocks: true });
    expect(new SessionState(store).queuedFull().map((q) => q.question)).toEqual(["Which rule stands?", "Entries of two months cannot share a statement."]);
  });
  it("reads a question another process wrote into the file with fewer fields, and drops one with no id or text", () => {
    const store = join(mkdtempSync(join(tmpdir(), "headcanon-q-")), "questions.json");
    writeFileSync(store, JSON.stringify({ queue: [{ id: "g1", question: "The month does not close.", kind: "impossible", nodeId: "REQ-4", by: "implementer-REQ-4", blocks: true }, { question: "No id." }, null, { id: "g2" }] }));
    const s = new SessionState(store);
    expect(s.queuedFull()).toHaveLength(1);
    expect(s.current()).toMatchObject({ id: "g1", kind: "impossible", header: "Could not be built", options: [], terms: [], multiSelect: false, by: "implementer-REQ-4", blocks: true });
    // one filed while the viewer runs joins the queue at the next read, beside what is there
    const mine = s.ask({ nodeId: "REQ-4", question: "Close how?" });
    const saved = JSON.parse(readFileSync(store, "utf8")) as { queue: unknown[] };
    saved.queue.push({ id: "g3", question: "The statement is empty.", kind: "impossible", nodeId: "REQ-4", by: "implementer-REQ-4.1" });
    writeFileSync(store, JSON.stringify(saved));
    const later = Date.now() / 1000 + 2;
    utimesSync(store, later, later);
    s.refresh();
    expect(s.queued().map((q) => q.id)).toEqual(["g1", mine.id, "g3"]);
  });
  it("the answer to an issue names its author and whether it blocked, so the session knows whose box may go on", () => {
    const s = new SessionState();
    const q = s.ask({ nodeId: "REQ-5", question: "Which way out?", kind: "impossible", by: "implementer-REQ-5", blocks: true, options: [{ label: "Reword the box" }] });
    s.answer({ questionId: q.id, selected: ["Reword the box"], other: "", terms: [] });
    expect(s.changes().entries.at(-1)).toMatchObject({ kind: "answer", id: "REQ-5", by: "implementer-REQ-5", blocks: true });
    const plain = s.ask({ nodeId: "REQ-5", question: "Plain?" });
    s.answer({ questionId: plain.id, selected: ["Drop"], other: "", terms: [] });
    const e = s.changes().entries.at(-1)!;
    expect("by" in e || "blocks" in e).toBe(false);
  });
  it("what the human asks of a build and decides on a slice are their entries, and each wakes a waiting session", async () => {
    const kinds: FeedKind[] = ["implement-request", "run-stop", "run-continue", "slice-approved", "slice-discarded", "slice-sent-back"];
    for (const kind of kinds) {
      const s = new SessionState();
      const waiting = s.waitChanges(s.changes().cursor, 2000, isHumanEntry);
      // the session's own line does not end the wait; the human's entry does
      s.push("say", { text: "Building." });
      s.push(kind, { id: "REQ-2.1 REQ-2.2", text: "all" });
      const woke = await waiting;
      expect(woke.entries.map((e) => e.kind)).toEqual(["say", kind]);
      expect(isHumanEntry(woke.entries[1]!)).toBe(true);
      expect(woke.entries[1]).toMatchObject({ id: "REQ-2.1 REQ-2.2", text: "all" });
    }
  });
  it("a say that needs the human now keeps its attention flag, which the page chimes for", () => {
    const s = new SessionState();
    expect(s.push("say", { text: "Three boxes wait on you.", to: "human", attention: true }).attention).toBe(true);
    expect("attention" in s.push("say", { text: "Reading is done." })).toBe(false);
  });
});
