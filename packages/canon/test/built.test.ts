import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { builtOf, isCodeUnit, marksOf } from "../src/built.js";
import { loadCanon } from "../src/load.js";
import { coverageFindings } from "../src/parcel.js";
import type { Canon } from "../src/types.js";
import type { Outcome, TestEntry, TestManifest, TestResults } from "../src/testing.js";

// Where a box is built and the marks drawn from it. The examples are Ledgerline's: entries, months, closing a month, statements.
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

interface Box { parent?: string; state?: string; kind?: string; uid?: string; binds?: string[]; sections?: string }
const box = (id: string, o: Box = {}) =>
  `---\nid: ${id}\n${o.parent ? `parent: ${o.parent}\n` : ""}title: "${id}"\nstate: ${o.state ?? "assumed"}\n${o.kind ? `kind: ${o.kind}\n` : ""}${o.uid ? `uid: ${o.uid}\n` : ""}${o.binds ? `binds: [${o.binds.map((b) => `"${b}"`).join(", ")}]\n` : ""}---\n\n# ${id}\n\n## Intent\n\nA closed month takes no new entry.\n${o.kind ? "\n## Check\n\nAn entry dated in a closed month is refused.\n" : ""}${o.sections ? `\n${o.sections}\n` : ""}`;

function canonDirOf(boxes: Record<string, Box>): string {
  const dir = join(mkdtempSync(join(tmpdir(), "headcanon-built-")), "canon");
  dirs.push(dirname(dir));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), '---\nid: ROOT\ntitle: "Ledgerline"\nstate: assumed\nformat: 4\n---\n\n# Ledgerline\n\n## Intent\n\nBooks a person can close.\n');
  for (const [id, o] of Object.entries(boxes)) writeFileSync(join(dir, `${id}.md`), box(id, o));
  return dir;
}
const canonOf = (boxes: Record<string, Box>): Canon => loadCanon(canonDirOf(boxes));
const one = (o: Box) => builtOf(canonOf({ "REQ-1": o }).nodes["REQ-1"]!);

const CLOSE = "implements src/ledger.ts#closeMonth";
const NOT_BUILT = "## Implemented by\n\n- not built: months are closed by hand in the statement";

const title = (uid: string, n = 1) => `refuses an entry in a closed month ${n} [hc:${uid}]`;
const entry = (uid: string, n = 1, status: TestEntry["status"] = "accepted"): TestEntry =>
  ({ box: uid, id: "", runner: "unit", kind: "unit", file: `test/${uid}.test.ts`, title: title(uid, n), description: "Closes a month, adds an entry dated inside it and expects a refusal.", pin: "p", status, at: "2026-11-18T00:00:00.000Z" });
const manifestOf = (...tests: TestEntry[]): TestManifest => ({ runners: {}, tests });
const resultsOf = (...rs: Array<[uid: string, outcome: Outcome, n?: number]>): TestResults =>
  ({ at: "2026-11-18T00:00:00.000Z", tree: "t", runs: [], results: rs.map(([uid, outcome, n]) => ({ box: uid, title: title(uid, n ?? 1), file: `test/${uid}.test.ts`, runner: "unit", outcome })) });

describe("builtOf: where a box says it is built", () => {
  it("tells a code unit from a claim", () => {
    expect(isCodeUnit("src/ledger.ts#closeMonth")).toBe(true);
    expect(isCodeUnit("c1-12")).toBe(true);
    expect(isCodeUnit("claim:221619d288")).toBe(false);
  });

  it("is built with a code unit bound as implements or as contributes, and lists code by relation without the claims", () => {
    const i = one({ kind: "binary", binds: [CLOSE, "contributes c1-12", "contributes claim:aa11", "contradicts src/ledger.ts#reopen", "contradicts claim:bb22"] });
    expect(i).toEqual({ built: "built", implements: ["src/ledger.ts#closeMonth"], contributes: ["c1-12"], contradicts: ["src/ledger.ts#reopen"], note: undefined });
    expect(one({ kind: "binary", binds: ["contributes c1-12"] }).built).toBe("built");
  });

  it("is not built by claims alone when a line says so, and unstated when none does", () => {
    expect(one({ kind: "binary", binds: ["implements claim:aa11"], sections: NOT_BUILT })).toMatchObject({ built: "not-built", note: "months are closed by hand in the statement" });
    expect(one({ kind: "binary", binds: ["implements claim:aa11"] })).toMatchObject({ built: "unstated", note: undefined });
    expect(one({ kind: "binary" }).built).toBe("unstated");
  });

  it.each([
    ["## Implemented by\n\nnot built", ""],
    ["## Implemented by\n\n- Not built yet", "yet"],
    ["## Implemented by\n\n- REQUIREMENTS.md:12-14 states it\n- not built: concept only", "concept only"],
    ["## Implemented by\n\n- 2026-11-17: not built per its concept.", "per its concept."],
    ["## Open\n\n- 2026-11-17: not built: the statement lists open months only", "the statement lists open months only"],
    ["## Open\n\n- 2026-11-17: 2026-11-17: not built; no export of a closed month", "no export of a closed month"],
    ["## Open [assumed]\n\n* not built: nothing reads the closing date", "nothing reads the closing date"],
  ])("reads the line %j", (sections, note) => {
    expect(one({ kind: "binary", sections })).toMatchObject({ built: "not-built", note });
  });

  it.each([
    ["## Implemented by\n\n- the export is not built: only the screen exists"],
    ["## Implemented by\n\n- not built-in rounding is used (src/ledger.ts:4-9)"],
    ["## Open\n\n- 2026-11-17: whether a closed month can be reopened"],
    ["## Not this\n\n- not built: a second ledger"],
  ])("does not read %j as a not built line", (sections) => {
    expect(one({ kind: "binary", sections }).built).toBe("unstated");
  });

  it("lets implementing code decide before the note, and the note before code that only contributes", () => {
    const note = "## Open\n\n- 2026-11-17: not built: the limit holds for one account only";
    expect(one({ kind: "binary", binds: [CLOSE], sections: note })).toMatchObject({ built: "built", note: "the limit holds for one account only" });
    expect(one({ kind: "binary", binds: ["contributes c2-30"], sections: note })).toMatchObject({ built: "not-built", note: "the limit holds for one account only" });
  });

  it("is unstated with code that only contradicts it", () => {
    expect(one({ kind: "binary", binds: ["contradicts src/ledger.ts#reopen"] })).toMatchObject({ built: "unstated", contradicts: ["src/ledger.ts#reopen"] });
  });
});

describe("marksOf: the marks of a box with a kind", () => {
  const canon = canonOf({
    "REQ-1": {},
    "REQ-1.1": { parent: "REQ-1", kind: "binary", uid: "built", binds: [CLOSE] },
    "REQ-1.2": { parent: "REQ-1", kind: "binary", uid: "absent", sections: NOT_BUILT },
    "REQ-1.3": { parent: "REQ-1", kind: "binary", uid: "silent" },
    "REQ-1.4": { parent: "REQ-1", kind: "binary", uid: "against", binds: [CLOSE, "contradicts src/ledger.ts#reopen"] },
    "REQ-1.5": { parent: "REQ-1", kind: "binary", uid: "question", state: "draft", sections: NOT_BUILT },
    "REQ-1.6": { parent: "REQ-1", kind: "binary", uid: "claimed", binds: ["contradicts claim:aa11", CLOSE] },
  });
  const all = manifestOf(entry("built"), entry("absent"), entry("silent"), entry("against"), entry("question"), entry("claimed"));

  it("marks from the canon alone when there are no tests: not built, and code that contradicts", () => {
    const m = marksOf(canon);
    expect(Object.keys(m).sort()).toEqual(Object.keys(canon.nodes).sort());
    expect(m["REQ-1.1"]).toEqual({ mark: undefined, built: "built", tested: "untested", failing: 0, tests: 0 });
    expect(m["REQ-1.2"]).toEqual({ mark: "not-built", built: "not-built", tested: "untested", failing: 0, tests: 0 });
    expect(m["REQ-1.3"]).toEqual({ mark: undefined, built: "unstated", tested: "untested", failing: 0, tests: 0 });
    expect(m["REQ-1.4"]!.mark).toBe("out-of-sync");
    expect(m["REQ-1.6"]!.mark).toBeUndefined(); // a claim against the box is a matter for the documents, not for the code
  });

  it("built and passing has no mark; built and failing is out of sync", () => {
    expect(marksOf(canon, resultsOf(["built", "passed"]), all)["REQ-1.1"]).toEqual({ mark: undefined, built: "built", tested: "passing", failing: 0, tests: 1 });
    expect(marksOf(canon, resultsOf(["built", "failed"]), all)["REQ-1.1"]).toEqual({ mark: "out-of-sync", built: "built", tested: "failing", failing: 1, tests: 1 });
  });

  it.each(["errored", "changed", "missing"] as const)("a built box whose accepted test is %s is out of sync", (outcome) => {
    expect(marksOf(canon, resultsOf(["built", outcome]), all)["REQ-1.1"]).toMatchObject({ mark: "out-of-sync", tested: "failing", failing: 1 });
  });

  it("one failing test among passing ones is enough", () => {
    const m = marksOf(canon, resultsOf(["built", "passed", 1], ["built", "failed", 2]), manifestOf(entry("built", 1), entry("built", 2)));
    expect(m["REQ-1.1"]).toEqual({ mark: "out-of-sync", built: "built", tested: "failing", failing: 1, tests: 2 });
  });

  it("a test whose box text changed is stale: it neither passes nor puts the box out of sync", () => {
    expect(marksOf(canon, resultsOf(["built", "stale"]), all)["REQ-1.1"]).toEqual({ mark: undefined, built: "built", tested: "stale", failing: 0, tests: 1 });
    expect(marksOf(canon, resultsOf(["absent", "stale"]), all)["REQ-1.2"]!.mark).toBe("not-built");
  });

  it("not built stays not built with a failing test, and loses the mark with a passing one: the note is stale", () => {
    expect(marksOf(canon, resultsOf(["absent", "failed"]), all)["REQ-1.2"]).toEqual({ mark: "not-built", built: "not-built", tested: "failing", failing: 1, tests: 1 });
    expect(marksOf(canon, resultsOf(["absent", "passed"]), all)["REQ-1.2"]).toEqual({ mark: undefined, built: "not-built", tested: "passing", failing: 0, tests: 1 });
  });

  it("an unstated box is not measured, whatever its tests say", () => {
    expect(marksOf(canon, resultsOf(["silent", "failed"]), all)["REQ-1.3"]).toMatchObject({ mark: undefined, built: "unstated", tested: "failing" });
  });

  it("code that contradicts the box is out of sync whatever the tests say", () => {
    expect(marksOf(canon, resultsOf(["against", "passed"]), all)["REQ-1.4"]).toMatchObject({ mark: "out-of-sync", tested: "passing" });
  });

  it("a draft never gets a mark", () => {
    expect(marksOf(canon, resultsOf(["question", "failed"]), all)["REQ-1.5"]).toMatchObject({ mark: undefined, built: "not-built", tested: "failing" });
  });

  it("counts accepted tests only; an accepted test with no result, skipped or not run is untested", () => {
    const results = resultsOf(["built", "failed", 1], ["built", "failed", 2], ["built", "skipped", 3], ["built", "not-run", 4]);
    const m = marksOf(canon, results, manifestOf(entry("built", 1, "proposed"), entry("built", 2, "rejected"), entry("built", 3), entry("built", 4), entry("built", 5)));
    expect(m["REQ-1.1"]).toEqual({ mark: undefined, built: "built", tested: "untested", failing: 0, tests: 3 });
  });

  it("with results and no manifest, takes the results as they are", () => {
    expect(marksOf(canon, resultsOf(["built", "failed"]))["REQ-1.1"]).toMatchObject({ mark: "out-of-sync", tests: 1, failing: 1 });
  });

  it("with a manifest and no results, every test is untested", () => {
    expect(marksOf(canon, undefined, all)["REQ-1.1"]).toEqual({ mark: undefined, built: "built", tested: "untested", failing: 0, tests: 1 });
  });
});

describe("marksOf: a box with children", () => {
  const canon = canonOf({
    "REQ-1": {},
    // every requirement below is not built; the draft and the box with no kind do not count
    "REQ-1.1": { parent: "REQ-1" },
    "REQ-1.1.1": { parent: "REQ-1.1", kind: "binary", uid: "a", sections: NOT_BUILT },
    "REQ-1.1.2": { parent: "REQ-1.1", kind: "numeric", uid: "b", sections: NOT_BUILT },
    "REQ-1.1.3": { parent: "REQ-1.1" },
    "REQ-1.1.4": { parent: "REQ-1.1", kind: "binary", state: "draft" },
    // one built, one not
    "REQ-1.2": { parent: "REQ-1" },
    "REQ-1.2.1": { parent: "REQ-1.2", kind: "binary", uid: "c", binds: [CLOSE] },
    "REQ-1.2.2": { parent: "REQ-1.2", kind: "binary", uid: "d", sections: NOT_BUILT },
    // nothing below carries a kind
    "REQ-1.3": { parent: "REQ-1" },
    "REQ-1.3.1": { parent: "REQ-1.3" },
    // a parent that keeps a check of its own
    "REQ-1.4": { parent: "REQ-1", kind: "binary", uid: "e", binds: [CLOSE] },
    "REQ-1.4.1": { parent: "REQ-1.4", kind: "binary", uid: "f", sections: NOT_BUILT },
    "REQ-1.5": { parent: "REQ-1", kind: "binary", uid: "g", sections: NOT_BUILT },
    "REQ-1.5.1": { parent: "REQ-1.5", kind: "binary", uid: "h", binds: [CLOSE] },
    "REQ-1.6": { parent: "REQ-1", kind: "binary", uid: "i" },
    "REQ-1.6.1": { parent: "REQ-1.6", kind: "binary", uid: "j", sections: NOT_BUILT },
    // a draft parent
    "REQ-1.7": { parent: "REQ-1", state: "draft" },
    "REQ-1.7.1": { parent: "REQ-1.7", kind: "binary", uid: "k", sections: NOT_BUILT },
  });

  it("is not built when every box below that carries a kind is, and there is one", () => {
    const m = marksOf(canon);
    expect(m["REQ-1.1"]!.mark).toBe("not-built");
    expect(m["REQ-1.2"]!.mark).toBeUndefined();
    expect(m["REQ-1.3"]!.mark).toBeUndefined();
    expect(m["REQ-1"]!.mark).toBeUndefined();
  });

  it("is out of sync when any box below is, at every depth above it", () => {
    const m = marksOf(canon, resultsOf(["c", "failed"]), manifestOf(entry("c")));
    expect(m["REQ-1.2.1"]!.mark).toBe("out-of-sync");
    expect(m["REQ-1.2"]!.mark).toBe("out-of-sync");
    expect(m["REQ-1"]!.mark).toBe("out-of-sync");
    expect(m["REQ-1.1"]!.mark).toBe("not-built");
    expect(m["REQ-1.2.2"]!.mark).toBe("not-built");
  });

  it("a parent that keeps a check takes its own mark first; built itself, it is not greyed by what is below", () => {
    const m = marksOf(canon);
    expect(m["REQ-1.4"]!.mark).toBeUndefined();
    expect(m["REQ-1.5"]!.mark).toBe("not-built");
    expect(m["REQ-1.6"]!.mark).toBe("not-built"); // it says nothing of its own, and all below it is not built
    const failing = marksOf(canon, resultsOf(["h", "failed"]), manifestOf(entry("h")));
    expect(failing["REQ-1.5"]!.mark).toBe("out-of-sync");
  });

  it("a draft parent gets no mark, and the boxes below it keep theirs", () => {
    const m = marksOf(canon);
    expect(m["REQ-1.7"]!.mark).toBeUndefined();
    expect(m["REQ-1.7.1"]!.mark).toBe("not-built");
  });
});

describe("coverageFindings: every requirement says where it is built", () => {
  const canon = canonOf({
    "REQ-1": {},
    "REQ-1.1": { parent: "REQ-1", binds: ["implements claim:aa11"] },
    "REQ-1.1.1": { parent: "REQ-1.1", kind: "binary", binds: [CLOSE] },
    "REQ-1.1.2": { parent: "REQ-1.1", kind: "binary", sections: NOT_BUILT },
    "REQ-1.1.3": { parent: "REQ-1.1", kind: "binary", binds: ["implements claim:aa11"] },
    "REQ-1.1.4": { parent: "REQ-1.1", kind: "binary", state: "draft" },
    "REQ-1.1.5": { parent: "REQ-1.1" },
    "REQ-1.2": { parent: "REQ-1" },
    "REQ-1.2.1": { parent: "REQ-1.2", kind: "numeric" },
  });

  it("refuses a set that leaves a requirement unstated, whether or not its parent has evidence bound", () => {
    const f = coverageFindings(canon, undefined);
    expect(f.map((x) => `${x.code}:${x.id}`)).toEqual(["built-unstated:REQ-1.1.3", "built-unstated:REQ-1.2.1"]);
    expect(f[0]).toMatchObject({ level: "warn", code: "built-unstated", id: "REQ-1.1.3" });
    expect(f[0]!.message).toContain("REQ-1.1.3");
    expect(f[0]!.message).toContain("not built");
  });

  it("keeps the finding for evidence the children leave unbound, on the parent, beside it", () => {
    const split = canonOf({
      "REQ-1": { binds: [CLOSE, "contributes c1-12"] },
      "REQ-1.1": { parent: "REQ-1", kind: "binary", binds: [CLOSE] },
      "REQ-1.2": { parent: "REQ-1", kind: "binary" },
    });
    const f = coverageFindings(split, undefined);
    expect(f.map((x) => `${x.code}:${x.id}`)).toEqual(["parcel-uncovered:REQ-1", "built-unstated:REQ-1.2"]);
    expect(f[0]!.message).toContain("1 of 2");
  });

  it("passes once each says where it is built or that it is not", () => {
    const stated = canonOf({
      "REQ-1": {},
      "REQ-1.1": { parent: "REQ-1", kind: "binary", binds: ["contributes c1-12"] },
      "REQ-1.2": { parent: "REQ-1", kind: "binary", sections: "## Open\n\n- 2026-11-17: not built: concept only" },
    });
    expect(coverageFindings(stated, undefined)).toEqual([]);
  });
});

describe("the snapshot carries the marks", () => {
  it("computes them from the canon alone outside a git repository and with no record of tests", async () => {
    const dir = canonDirOf({
      "REQ-1": {},
      "REQ-1.1": { parent: "REQ-1", kind: "binary", uid: "a", binds: [CLOSE] },
      "REQ-1.2": { parent: "REQ-1", kind: "binary", uid: "b", sections: NOT_BUILT },
      "REQ-1.3": { parent: "REQ-1", kind: "binary", uid: "c" },
    });
    const { buildSnapshot } = await import("../src/snapshot.js");
    const snap = buildSnapshot(dir);
    expect(snap.marks["REQ-1.1"]).toEqual({ mark: undefined, built: "built", tested: "untested", failing: 0, tests: 0 });
    expect(snap.marks["REQ-1.2"]!.mark).toBe("not-built");
    expect(snap.marks["REQ-1.3"]).toMatchObject({ mark: undefined, built: "unstated" });
    expect(snap.coverage).toEqual([]); // the unstated box is the gate's finding, not a parent with evidence left unbound
  });
});
