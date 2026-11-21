import { fileURLToPath } from "node:url";
import { builtOf } from "./built.js";
import { sectionText } from "./check.js";
import { OUTCOME_WORDS } from "./gate.js";
import { compareIds, descendants, loadCanon } from "./load.js";
import { gitDirOf } from "./ops.js";
import { BRIEF_MARKER, activeRun, flagsOf, loadRun, type CliCtx, type Run, type Slice } from "./runs.js";
import { loadManifest, loadResults, testsOf, type TestManifest, type TestResults } from "./testing.js";
import type { Canon, ReqNode, Term } from "./types.js";

/**
 * The one text an agent is started with, written from the canon for a reader that has nothing else. Every brief
 * of a canon begins with the same shared text, the premise, what the product is not, its principles and its map,
 * byte for byte, so the model's cache serves it to every agent after the first; what follows is the path to the
 * box and what the role needs. An implementer's brief carries one line before all of it, the run marker, by which
 * the stop gate finds what the agent owes.
 */

export type BriefRole = "implementer" | "tester" | "refiner";
export interface BriefOptions { for: BriefRole; runId?: string; canonOnly?: boolean; budget?: number; /** The viewer's port, written into the commands when it is not the default. */ port?: number }

const ROLES: readonly BriefRole[] = ["implementer", "tester", "refiner"];
/** Characters for what follows the shared text; the shared text is never cut, or it would stop being shared. */
const DEFAULT_BUDGET = 30_000;
const DEFAULT_PORT = 4317;
const BIN = fileURLToPath(new URL("../bin/headcanon.js", import.meta.url)).split("\\").join("/");

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();
const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s);
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const red = (n: ReqNode): boolean => n.state === "contested" || n.state === "draft";
/** A section as one line of prose: the quote marks of the person's own words and the lines that only cite where they came from are left out. */
const prose = (body: string, heading: string): string => oneLine(sectionText(body, heading).split(/\r?\n/).filter((l) => !/^\s*(?:>\s*)?Source:/i.test(l)).map((l) => l.replace(/^\s*>\s?/, "")).join("\n"));
const intentOf = (n: ReqNode): string => prose(n.body, "Intent") || prose(n.body, "Stated") || "(no Intent written)";
const stateWords = (n: ReqNode): string => (red(n) ? "waits on the person" : n.state === "assumed" ? "a guess" : "approved");
const section = (heading: string, lines: string[]): string => (lines.length ? `## ${heading}\n\n${lines.join("\n")}\n` : "");

/** The premise, what the product is not, the principles and the map: the same text for every box and every role of one canon. */
export function sharedText(canon: Canon): string {
  const root = canon.root;
  const body = root?.body ?? "";
  const premise = sectionText(body, "Intent") || sectionText(body, "Purpose") || sectionText(body, "Stated");
  const notThis = sectionText(body, "Not this");
  const map: string[] = [];
  for (const id of canon.roots) {
    const n = canon.nodes[id];
    if (!n) continue;
    map.push(`${n.id} ${n.title}`);
    if (n.layer === "domain") for (const c of n.children) { const k = canon.nodes[c]; if (k) map.push(`  ${k.id} ${k.title}`); }
  }
  return [
    `# ${root?.title ?? "The product"}\n\nWhat the product is. Every part of it is a box with an id, such as REQ-2.1.\n`,
    section("Premise", premise ? [premise] : []),
    section("Not this", notThis ? [notThis] : []),
    section("Principles", canon.principles.map((p) => `${p.id} ${p.title}: ${oneLine(p.statement)}`)),
    section("The map", map.length ? ["The domains of the product, each with its capabilities under it.", "", ...map] : []),
  ].filter(Boolean).join("\n");
}

/** The boxes above one, from the top down, each with its Intent. */
function pathLines(canon: Canon, n: ReqNode): string[] {
  const up: ReqNode[] = [];
  for (let p = n.parent ? canon.nodes[n.parent] : undefined; p; p = p.parent ? canon.nodes[p.parent] : undefined) up.unshift(p);
  return up.length ? up.map((p) => `${p.id} ${p.title} (${p.layer}): ${intentOf(p)}`) : ["It sits directly under the premise."];
}

/** A box as its heading, Intent and Check. */
function boxLines(n: ReqNode, opts: { uid: boolean; state: boolean }): string[] {
  const check = prose(n.body, "Check");
  return [
    `### ${n.id} ${n.title}${opts.uid && n.uid ? ` [hc:${n.uid}]` : ""}${opts.state ? ` (${stateWords(n)})` : ""}`,
    `Intent: ${intentOf(n)}`,
    ...(check ? [`Check${n.kind ? ` (${n.kind})` : ""}: ${check}`] : n.kind ? [`Check (${n.kind}): none written.`] : []),
  ];
}

function builtLine(n: ReqNode): string {
  const b = builtOf(n);
  const parts: string[] = [];
  if (b.built === "built") parts.push(`built in ${[...b.implements, ...b.contributes.map((u) => `${u} (contributes)`)].join(", ")}`);
  else if (b.built === "not-built") parts.push(`not built yet${b.note ? `: ${b.note}` : ""}`);
  else parts.push("the canon does not say");
  if (b.contradicts.length) parts.push(`code that does otherwise: ${b.contradicts.join(", ")}`);
  return `Where it is built: ${parts.join("; ")}.`;
}

function testLines(n: ReqNode, manifest: TestManifest, results: TestResults | undefined): string[] {
  const tests = n.uid ? testsOf(manifest, n.uid).filter((t) => t.status === "accepted") : [];
  if (!tests.length) return ["Tests: none recorded."];
  return ["Tests:", ...tests.map((t) => {
    const r = results?.results.find((x) => x.box === t.box && x.title === t.title);
    const last = r ? `${OUTCOME_WORDS[r.outcome] ?? r.outcome}${r.message && r.outcome !== "passed" ? `: ${clip(oneLine(r.message), 400)}` : ""}` : "not run yet";
    return `- ${oneLine(t.description)} (${t.kind} test, ${t.file}). Last run: ${last}`;
  })];
}

/** The boxes linked to any of `boxes`, in either direction, one line each with how. */
function linkedLines(canon: Canon, boxes: ReqNode[]): string[] {
  const own = new Set(boxes.map((b) => b.id));
  const how = new Map<string, string[]>();
  const add = (id: string, text: string) => { if (!own.has(id) && canon.nodes[id]) (how.get(id) ?? how.set(id, []).get(id)!).push(text); };
  const kinds = [["requires", "requires"], ["relates", "relates to"], ["conflicts", "pulls against"]] as const;
  for (const b of boxes) for (const [field, verb] of kinds) for (const to of b[field]) add(to, `${b.id} ${verb} it`);
  for (const o of Object.values(canon.nodes)) {
    if (own.has(o.id)) continue;
    for (const [field, verb] of kinds) for (const to of o[field]) if (own.has(to)) add(o.id, `it ${verb} ${to}`);
  }
  return [...how.keys()].sort(compareIds).map((id) => `${id} ${canon.nodes[id]!.title} (${[...new Set(how.get(id)!)].join("; ")}): ${intentOf(canon.nodes[id]!)}`);
}

/** The glossary terms a text uses, as whole words, plural or not. */
function termsUsed(canon: Canon, text: string): Term[] {
  const low = text.toLowerCase();
  return canon.terms.filter((t) => t.term.trim() !== "" && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t.term.trim().toLowerCase())}(?:s|es)?(?![\\p{L}\\p{N}])`, "u").test(low))
    .sort((a, b) => a.term.localeCompare(b.term));
}
const termLines = (canon: Canon, boxes: ReqNode[]): string[] =>
  termsUsed(canon, boxes.map((b) => `${b.title}\n${sectionText(b.body, "Intent")}\n${sectionText(b.body, "Check")}`).join("\n")).map((t) => `${t.term}: ${oneLine(t.definition)}`);

/** As many of the lines as fit in `room` characters, then one line saying how many were left out. */
function fit(lines: string[], room: number, more: (n: number) => string): string[] {
  const out: string[] = [];
  let used = 0;
  for (const l of lines) {
    if (used + l.length + 1 > room) break;
    out.push(l);
    used += l.length + 1;
  }
  return out.length < lines.length ? [...out, more(lines.length - out.length)] : out;
}

const hc = (port: number | undefined): string => `\`HC\` below stands for: node "${BIN}"${port !== undefined && port !== DEFAULT_PORT ? ` --port ${port}` : ""}`;
const LOOKUPS = [
  "- `HC context <box id>` prints a box whole, with its path, its neighbours and its links.",
  "- `HC find \"<words>\"` searches every box of the canon.",
  "- `HC code find \"<words>\"` searches the code by what each part does.",
];

function implementerRules(box: string, name: string, run: Run | undefined, port: number | undefined): string[] {
  const testCommand = run ? `HC tests run --run ${run.id}` : `HC tests run ${box}`;
  return [
    hc(port),
    "",
    "- You are free in how you build: which files, which design, in which order.",
    `- Your test command is \`${testCommand}\`. It runs the recorded tests of your boxes and stores the result.`,
    "- You may stop when the tests of your boxes pass, or when each box still failing has an issue you filed. A stop before that is sent back to you with what fails.",
    "- Commit only in the intent format: a header such as `feat(<area>): <what changed>`, an empty line, then the line `Intent: <box id>` naming the box the commit builds. One commit per box. Leave the tree clean: nothing uncommitted outside the canon folder. Never skip the commit hook.",
    "- When you had to decide something your boxes do not say, record it as an assumption, a guessed box under the box it concerns:",
    `  echo '{"op":"create","under":"<box id>","title":"<a claim>","intent":"<what must hold>","kind":"binary","check":"<what is observed and what counts as yes>"}' | HC op - --by ${name}`,
    "- When a box cannot be built as it is written, file an issue that blocks it, then go on with your other boxes:",
    `  echo '{"kind":"<kind>","nodeId":"<box id>","question":"<what the person must decide>","why":"<what you tried and what stands in the way>","options":[{"label":"<one way out>","description":"<what it would mean>"},{"label":"<another way out>","description":"<what it would mean>"}],"by":"${name}","blocks":true}' | HC ask -`,
    "  The kinds: `contradiction`, two things the canon says cannot both hold; `apocrypha`, the wording of the box itself is at fault; `undefined`, nothing in the canon or the evidence decides what the box needs; `disambiguation`, a word in the box can be read in more than one way; `impossible`, you tried and could not make it work. The options are the ways out you see; the person can always answer in their own words.",
    "- Never change a canon file or a recorded test by hand. A test you believe is wrong is an issue.",
    "- To read more of the canon or find code:",
    ...LOOKUPS.map((l) => `  ${l}`),
    "- End with a report in plain words: what you built and where, what you assumed, what you could not do.",
  ];
}

/** The boxes an implementer builds: what its slice owes, by stable id, when a run names it; else the box and what is under it. */
function implementerBoxes(canon: Canon, node: ReqNode, slice: Slice | undefined): ReqNode[] {
  const under = descendants(canon, node.id).map((id) => canon.nodes[id]!).filter((d) => !red(d));
  if (!slice) return [node, ...under];
  const owes = new Set(slice.owes);
  const owed = Object.values(canon.nodes).filter((n) => n.id !== node.id && n.uid !== undefined && owes.has(n.uid)).sort((a, b) => compareIds(a.id, b.id));
  return [node, ...owed];
}

/** The capability's own text, its headings turned into labels so they do not read as headings of the brief. */
function wholeBox(n: ReqNode): string[] {
  const facts = [`${n.layer}, ${stateWords(n)}`, n.partition ? `its children answer: ${n.partition}` : "", n.requires.length ? `requires ${n.requires.join(", ")}` : "", n.relates.length ? `relates to ${n.relates.join(", ")}` : "", n.conflicts.length ? `pulls against ${n.conflicts.join(", ")}` : ""].filter(Boolean);
  const body = n.body.split(/\r?\n/).filter((l) => !/^#\s/.test(l)).map((l) => l.replace(/^##\s+(.*?)\s*(?:\[[a-z]+\])?\s*$/, "$1:")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return [`### ${n.id} ${n.title} (${facts.join("; ")})`, body];
}

export function briefText(canonDir: string, id: string, opts: BriefOptions): string {
  const canon = loadCanon(canonDir);
  const node = canon.nodes[id];
  if (!node) throw new Error(`no box ${id} in the canon at ${canon.dir}`);
  const budget = opts.budget !== undefined && opts.budget > 0 ? opts.budget : DEFAULT_BUDGET;
  const shared = sharedText(canon);
  const parts: string[] = [];
  const used = () => parts.join("\n").length;
  const moreByLookup = (n: number) => `(${n} more left out for length: \`HC context ${id}\` shows them)`;
  const moreLeftOut = (n: number) => `(${n} more left out for length)`;

  if (opts.for === "implementer") {
    const gitDir = gitDirOf(canon.dir);
    const run = gitDir ? (opts.runId ? loadRun(gitDir, opts.runId) : activeRun(gitDir)) : undefined;
    if (opts.runId && !run) throw new Error(`no run ${opts.runId}`);
    const slice = run?.slices.find((s) => s.box === id);
    if (opts.runId && !slice) throw new Error(`run ${opts.runId} has no slice for ${id}`);
    const boxes = implementerBoxes(canon, node, slice);
    const manifest = loadManifest(canon.dir);
    const results = gitDir ? loadResults(gitDir) : undefined;
    const rules = implementerRules(id, slice?.agentName ?? `implementer-${id}`, slice ? run : undefined, opts.port);
    parts.push(section(`The path to ${id}`, pathLines(canon, node)));
    parts.push(section("Your boxes", ["You build these. Each carries a stable id in square brackets, and a test names its box by it.", "", ...boxes.flatMap((b) => [...boxLines(b, { uid: true, state: false }), builtLine(b), ...testLines(b, manifest, results), ""])]));
    const room = budget - used() - rules.join("\n").length;
    const linked = fit(linkedLines(canon, boxes), room / 2, moreByLookup);
    parts.push(section("Linked boxes", linked));
    parts.push(section("Terms", fit(termLines(canon, boxes), room - linked.join("\n").length, moreByLookup)));
    parts.push(section("How you work", rules));
    const text = [shared, ...parts.filter(Boolean)].join("\n");
    return slice && run ? `${BRIEF_MARKER} ${run.id} slice: ${slice.box}\n\n${text}` : text;
  }

  const under = descendants(canon, id).map((d) => canon.nodes[d]!);
  if (opts.for === "tester") {
    const canonOnly = opts.canonOnly === true;
    const boxes = [node, ...under];
    parts.push(section(`The path to ${id}`, pathLines(canon, node)));
    parts.push(section("The capability", boxLines(node, { uid: !canonOnly, state: true })));
    if (canonOnly) {
      parts.push(section("The boxes below it", under.flatMap((b) => [...boxLines(b, { uid: false, state: true }), ""])));
    } else {
      const gitDir = gitDirOf(canon.dir);
      const manifest = loadManifest(canon.dir);
      const results = gitDir ? loadResults(gitDir) : undefined;
      parts.push(section("The boxes below it", ["Each carries a stable id in square brackets; a test names its box by it.", "", ...under.flatMap((b) => [...boxLines(b, { uid: true, state: true }), builtLine(b), ...testLines(b, manifest, results), ""])]));
    }
    const room = budget - used();
    const linked = fit(linkedLines(canon, boxes), room / 2, canonOnly ? moreLeftOut : moreByLookup);
    parts.push(section("Linked boxes", linked));
    parts.push(section("Terms", fit(termLines(canon, boxes), room - linked.join("\n").length, canonOnly ? moreLeftOut : moreByLookup)));
    if (!canonOnly) parts.push(section("Lookups", [hc(opts.port), "", `Your name, for \`--by\`, is tester-${id}.`, ...LOOKUPS]));
    return [shared, ...parts.filter(Boolean)].join("\n");
  }

  // refiner
  const lookups = [hc(opts.port), "", `Your name, for \`--by\`, is refiner-${id}.`, ...LOOKUPS];
  parts.push(section(`The path to ${id}`, pathLines(canon, node)));
  parts.push(section("Your capability", wholeBox(node)));
  const written = under.map((b) => {
    const check = prose(b.body, "Check");
    const built = b.kind ? builtOf(b).built : undefined;
    return `${b.id} ${b.title} (${b.layer}, ${stateWords(b)}${b.kind ? `, ${b.kind}` : ""}${built ? `, ${built === "built" ? "built" : built === "not-built" ? "not built" : "does not say where it is built"}` : ""}): ${intentOf(b)}${check ? ` Check: ${check}` : ""}`;
  });
  parts.push(section("Already written below it", written.length ? fit(written, budget - used() - lookups.join("\n").length, moreByLookup) : ["Nothing yet."]));
  parts.push(section("Lookups", lookups));
  return [shared, ...parts.filter(Boolean)].join("\n");
}

const USAGE = `usage: headcanon brief <box id> --for implementer|tester|refiner [--run <run id>] [--canon-only] [--budget <characters>]
`;

export async function briefCli(rest: string[], ctx: CliCtx): Promise<number> {
  const { words, flags } = flagsOf(rest);
  const id = words[0];
  const role = flags["for"];
  if (!id || typeof role !== "string" || !ROLES.includes(role as BriefRole)) { ctx.err(USAGE); return 2; }
  const runId = typeof flags["run"] === "string" ? flags["run"] : undefined;
  const budget = typeof flags["budget"] === "string" && Number.isFinite(Number(flags["budget"])) ? Number(flags["budget"]) : undefined;
  try {
    if (role === "implementer" && !runId && !(ctx.gitDir && activeRun(ctx.gitDir)?.slices.some((s) => s.box === id))) {
      ctx.err(`brief: an implementer's brief begins with its run, and no active run holds ${id}. Start one with \`headcanon run start ${id}\`, or name it with --run.\n`);
      return 1;
    }
    const text = briefText(ctx.canonDir, id, { for: role as BriefRole, ...(runId ? { runId } : {}), ...(flags["canon-only"] === true ? { canonOnly: true } : {}), ...(budget !== undefined ? { budget } : {}), port: ctx.port });
    ctx.out(ctx.json || flags["json"] === true ? JSON.stringify({ id, for: role, text }) + "\n" : text.endsWith("\n") ? text : text + "\n");
    return 0;
  } catch (e) {
    ctx.err(`brief: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
