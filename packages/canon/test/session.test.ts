import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionState } from "../src/index.js";

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
});
