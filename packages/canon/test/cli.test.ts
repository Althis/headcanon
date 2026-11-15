import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { heldBoxes, lastAssistantText, main, stopDecision } from "../src/cli.js";

/** Run the CLI in-process, capturing what it writes. */
async function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const got = { out: "", err: "" };
  const spy = (stream: NodeJS.WriteStream, key: "out" | "err") => vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => { got[key] += String(chunk); return true; });
  const o = spy(process.stdout, "out");
  const e = spy(process.stderr, "err");
  try {
    const code = await main(argv);
    return { code, ...got };
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
}

/** A canon of two top-level guesses under a resolved premise. */
function canon(root: string): string {
  const dir = join(root, "canon");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), '---\nid: ROOT\ntitle: "Held canon"\nstate: resolved\n---\n\n# Held canon\n');
  for (const id of ["REQ-1", "REQ-4"]) writeFileSync(join(dir, `${id}-x.md`), `---\nid: ${id}\ntitle: "${id}"\nstate: assumed\n---\n\n# ${id}\n\n## Intent\n\nKnown.\n`);
  return dir;
}

describe("the stop hook's rule [REQ-11.1]", () => {
  // an unfinished adoption with the viewer up and the human's list still closed: the attend loop's usual state
  const live = { finished: false, viewerAnswers: true, gateOpen: false };

  it("allows the stop once the adoption is finished, or when no viewer answers", () => {
    expect(stopDecision({ ...live, finished: true }).decision).toBe("allow");
    expect(stopDecision({ ...live, viewerAnswers: false }).decision).toBe("allow");
  });

  it("blocks while the loop attends, with the reason that sends the session back to headcanon_changes", () => {
    const d = stopDecision(live);
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("call headcanon_changes again with waitSeconds 600");
    expect(d.reason).toContain("'stopping attend'");
  });

  it("reads the session's last words from the hook input, and from the transcript only when the input carries none", () => {
    expect(stopDecision({ ...live, lastAssistantMessage: "Stopping attend, as you asked." }).decision).toBe("allow");
    // the field is present and silent: the transcript is not consulted, whatever it says
    expect(stopDecision({ ...live, lastAssistantMessage: "Still attending.", transcriptTail: "stopping attend" }).decision).toBe("block");
    expect(stopDecision({ ...live, lastAssistantMessage: "", transcriptTail: "stopping attend" }).decision).toBe("block");
    expect(stopDecision({ ...live, transcriptTail: "I am stopping attend now." }).decision).toBe("allow");
    expect(stopDecision({ ...live, transcriptTail: "Next box." }).decision).toBe("block");
  });

  it("lets a session with a running subagent stop while the human's list is closed, and keeps it attending once the list is open", () => {
    const sub = [{ type: "subagent", status: "running" }];
    expect(stopDecision({ ...live, backgroundTasks: sub }).decision).toBe("allow");
    expect(stopDecision({ ...live, gateOpen: true, backgroundTasks: sub }).decision).toBe("block");
    expect(stopDecision({ ...live, backgroundTasks: [{ type: "shell", status: "running" }, { type: "subagent" }] }).decision).toBe("allow");
    expect(stopDecision({ ...live, backgroundTasks: [{ type: "shell", status: "running" }] }).decision).toBe("block");
    expect(stopDecision({ ...live, backgroundTasks: [] }).decision).toBe("block");
    expect(stopDecision({ ...live, backgroundTasks: undefined }).decision).toBe("block");
  });

  it("finds the last assistant text in a transcript, and nothing in a missing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "headcanon-transcript-"));
    const path = join(dir, "t.jsonl");
    const line = (type: string, content: unknown[]) => JSON.stringify({ type, message: { content } });
    writeFileSync(path, [line("assistant", [{ type: "text", text: "stopping attend" }]), line("user", [{ type: "text", text: "go on" }]), "not json", line("assistant", [{ type: "tool_use", name: "x" }, { type: "text", text: "Next box." }])].join("\n") + "\n");
    expect(lastAssistantText(path)).toBe("Next box.");
    expect(lastAssistantText(join(dir, "none.jsonl"))).toBeUndefined();
    expect(lastAssistantText(undefined)).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("next: the held boxes and the scope check [DEC-024]", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const fresh = () => { const root = mkdtempSync(join(tmpdir(), "headcanon-cli-")); roots.push(root); return root; };

  it("holds a box from its dispatch record until a later returned record names it, and never from a refused one", () => {
    const rec = (op: string, id?: string) => ({ request: id ? { op, id } : { op } });
    expect(heldBoxes([rec("dispatch", "REQ-4"), rec("dispatch", "REQ-1"), rec("returned", "REQ-4"), rec("dispatch", "REQ-4"), rec("link"), rec("dispatch", "REQ-2"), rec("returned", "REQ-2"), rec("returned", "REQ-7")])).toEqual(["REQ-1", "REQ-4"]);
    // a dispatch the log refused (an id outside the canon) handed nothing to anyone
    expect(heldBoxes([{ ok: false, request: { op: "dispatch", id: "REQ-9" } }, { ok: true, request: { op: "dispatch", id: "REQ-10" } }])).toEqual(["REQ-10"]);
    expect(heldBoxes([])).toEqual([]);
  });

  it("refuses an --under id that is not in the canon instead of printing an order that reads as nothing left", async () => {
    const dir = canon(fresh());
    const r = await run(["next", "--under", "REQ-9", "--canon", dir]);
    expect([r.code, r.out, r.err]).toEqual([1, "", "REQ-9 is not in the canon\n"]);
    expect((await run(["next", "--under", "ROOT", "--canon", dir])).code).toBe(0);
    const one = await run(["next", "--under", "REQ-1", "--canon", dir, "--json"]);
    expect(one.code).toBe(0);
    expect(JSON.parse(one.out)).toMatchObject({ next: { id: "REQ-1" }, frozen: 0, held: [] });
  });

  it("lists the held boxes from the repository's operations log, in JSON and in text", async () => {
    const root = fresh();
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
    const dir = canon(root);
    const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim();
    mkdirSync(join(gitDir, "headcanon"), { recursive: true });
    const records = [
      { at: "2026-11-15T10:00:00Z", by: "orchestrator", request: { op: "dispatch", id: "REQ-4" }, ok: true, changes: [] },
      { at: "2026-11-15T10:00:01Z", by: "orchestrator", request: { op: "dispatch", id: "REQ-1" }, ok: true, changes: [] },
      { at: "2026-11-15T10:05:00Z", by: "REQ-4", request: { op: "returned", id: "REQ-4" }, ok: true, changes: [] },
      { at: "2026-11-15T10:06:00Z", by: "orchestrator", request: { op: "dispatch", id: "REQ-4" }, ok: true, changes: [] },
    ];
    writeFileSync(join(gitDir, "headcanon", "ops.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const j = await run(["next", "--json", "--canon", dir]);
    expect(j.code).toBe(0);
    expect((JSON.parse(j.out) as { held: string[] }).held).toEqual(["REQ-1", "REQ-4"]);
    const t = await run(["next", "--canon", dir]);
    expect(t.out).toContain("Next to refine: REQ-1");
    expect(t.out).toContain("\nHeld by running agents: REQ-1, REQ-4.\n");
  });
});
