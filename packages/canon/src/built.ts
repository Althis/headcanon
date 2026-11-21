/**
 * Where a node is built, and the two marks the page draws from it: not built, and out of sync with the code.
 * A node says where it is built with its code binds, or that it is not with a "not built" line; saying neither
 * is unstated, which the parcel gate refuses.
 */
import { sectionText } from "./check.js";
import type { Bind, Canon, ReqNode } from "./types.js";
import type { Outcome, TestManifest, TestResult, TestResults } from "./testing.js";

export type Built = "built" | "not-built" | "unstated";
export interface BuiltInfo { built: Built; implements: string[]; contributes: string[]; contradicts: string[]; note: string | undefined }

/** A bound unit is code unless it is a claim from the documents or the content. */
export const isCodeUnit = (unit: string): boolean => !unit.startsWith("claim:");

/** "not built" at the start of a line, after an optional bullet and any dates; the rest of the line is what exists instead. */
const NOT_BUILT = /^\s*(?:[-*]\s+)?(?:\d{4}-\d{2}-\d{2}:?\s+)*not built(?![\w-])[\s:;,.]*(.*)$/i;
/** Where the line is read: the format's section first, then the two older canons used. */
const NOT_BUILT_SECTIONS = ["Implemented by", "Open", "As built"];

/** The words after "not built" on the node's line; undefined when it carries no such line. */
function notBuiltNote(body: string): string | undefined {
  for (const heading of NOT_BUILT_SECTIONS)
    for (const line of sectionText(body, heading).split(/\r?\n/)) {
      const m = NOT_BUILT.exec(line);
      if (m) return m[1]!.trim();
    }
  return undefined;
}

/**
 * Code bound as implements decides first: the node is built, and a "not built" line beside it is stale. Then the
 * line: code that only contributes sits near the node without doing what it says, so the line stands. Code that
 * contributes with no line counts as built.
 */
export function builtOf(node: ReqNode): BuiltInfo {
  const units = (relation: Bind["relation"]) => node.binds.filter((b) => b.relation === relation && isCodeUnit(b.unit)).map((b) => b.unit);
  const implementing = units("implements"), contributing = units("contributes");
  const note = notBuiltNote(node.body);
  const built: Built = implementing.length ? "built" : note !== undefined ? "not-built" : contributing.length ? "built" : "unstated";
  return { built, implements: implementing, contributes: contributing, contradicts: units("contradicts"), note };
}

export type Mark = "not-built" | "out-of-sync";
export type Tested = "passing" | "failing" | "untested" | "stale";
export interface NodeMark { mark: Mark | undefined; built: Built; tested: Tested; failing: number; tests: number }

interface Tally { tests: number; passed: number; failing: number; stale: number }

/** A test that ran and did not pass, or could not be trusted to run: its file gone or changed since it was accepted. */
const FAILING: ReadonlySet<Outcome> = new Set<Outcome>(["failed", "errored", "missing", "changed"]);

/**
 * Per node uid, the outcome of each test that counts: the accepted tests of the manifest, each with its result when
 * one is recorded; with no manifest, the results as they are.
 */
function tallyByNode(results: TestResults | undefined, manifest: TestManifest | undefined): Map<string, Tally> {
  const recorded = new Map<string, TestResult[]>();
  for (const r of results?.results ?? []) (recorded.get(r.node) ?? recorded.set(r.node, []).get(r.node)!).push(r);
  const out = new Map<string, Tally>();
  const add = (node: string, outcome: Outcome) => {
    const t = out.get(node) ?? out.set(node, { tests: 0, passed: 0, failing: 0, stale: 0 }).get(node)!;
    t.tests++;
    if (outcome === "passed") t.passed++;
    else if (FAILING.has(outcome)) t.failing++;
    else if (outcome === "stale") t.stale++;
  };
  if (!manifest) {
    for (const [node, rs] of recorded) for (const r of rs) add(node, r.outcome);
    return out;
  }
  for (const t of manifest.tests) {
    if (t.status !== "accepted") continue;
    const rs = recorded.get(t.node) ?? [];
    const r = rs.find((x) => x.title === t.title && x.file === t.file) ?? rs.find((x) => x.title === t.title);
    add(t.node, r?.outcome ?? "not-run");
  }
  return out;
}

const NO_TESTS: Tally = { tests: 0, passed: 0, failing: 0, stale: 0 };

const testedOf = (t: Tally): Tested => (t.failing ? "failing" : t.stale ? "stale" : t.passed ? "passing" : "untested");

/** The mark of a node by its own check alone. A draft never gets one; a node with no kind is not measured. */
function ownMark(n: ReqNode, info: BuiltInfo, t: Tally): Mark | undefined {
  if (!n.kind || n.state === "draft") return undefined;
  if (info.contradicts.length) return "out-of-sync";
  // a passing test on a node said to be not built means the note is stale
  if (info.built === "not-built") return t.passed ? undefined : "not-built";
  if (info.built === "built" && t.failing) return "out-of-sync";
  return undefined;
}

/** What the nodes below one carry, counting those with a kind that are not drafts. */
interface Below { outOfSync: boolean; measured: number; notBuilt: number }

/**
 * The mark of every node, by id. A node with children takes out of sync from any node below, and not built when every
 * node below that carries a kind is; a parent that keeps a check of its own, built or passing, is not greyed by them.
 */
export function marksOf(canon: Canon, results?: TestResults, manifest?: TestManifest): Record<string, NodeMark> {
  const tallies = tallyByNode(results, manifest);
  const info: Record<string, BuiltInfo> = {}, tally: Record<string, Tally> = {}, own: Record<string, Mark | undefined> = {};
  for (const n of Object.values(canon.nodes)) {
    info[n.id] = builtOf(n);
    tally[n.id] = (n.uid ? tallies.get(n.uid) : undefined) ?? NO_TESTS;
    own[n.id] = ownMark(n, info[n.id]!, tally[n.id]!);
  }
  const memo = new Map<string, Below>();
  const below = (id: string): Below => {
    const hit = memo.get(id);
    if (hit) return hit;
    const sum: Below = { outOfSync: false, measured: 0, notBuilt: 0 };
    memo.set(id, sum); // set before the descent, so a loop in the parent fields ends
    for (const c of canon.nodes[id]?.children ?? []) {
      const child = canon.nodes[c];
      if (!child) continue;
      const under = below(c);
      sum.outOfSync ||= under.outOfSync;
      sum.measured += under.measured;
      sum.notBuilt += under.notBuilt;
      if (!child.kind || child.state === "draft") continue;
      sum.measured++;
      if (own[c] === "out-of-sync") sum.outOfSync = true;
      if (own[c] === "not-built") sum.notBuilt++;
    }
    return sum;
  };
  const out: Record<string, NodeMark> = {};
  for (const n of Object.values(canon.nodes)) {
    const i = info[n.id]!, t = tally[n.id]!;
    let mark = own[n.id];
    if (n.children.length && n.state !== "draft") {
      const under = below(n.id);
      const holds = Boolean(n.kind) && (i.built === "built" || t.passed > 0);
      if (mark === "out-of-sync" || under.outOfSync) mark = "out-of-sync";
      else if (!mark && !holds && under.measured > 0 && under.notBuilt === under.measured) mark = "not-built";
    }
    out[n.id] = { mark, built: i.built, tested: testedOf(t), failing: t.failing, tests: t.tests };
  }
  return out;
}
