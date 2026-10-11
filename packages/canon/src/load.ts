import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseFrontMatter, parseGlossary, parseMermaid, parsePrinciples, parseSections, parseStepTable, str, strList } from "./parse.js";
import { isLayer, isState, type Canon, type Decision, type Journey, type Layer, type ReqNode, type State } from "./types.js";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

/** Numeric-aware ordering for IDs like REQ-1.10 vs REQ-1.2. */
export function compareIds(a: string, b: string): number {
  const pa = a.split(/[-./]/);
  const pb = b.split(/[-./]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x);
    const ny = Number(y);
    const c = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
    if (c !== 0) return c;
  }
  return 0;
}

function stateOf(v: unknown, fallback: State = "assumed"): State {
  return isState(v) ? v : fallback;
}

/** Read every Markdown file under `dir` and assemble the canon. Never throws on a bad file; see `unparsed`. */
export function loadCanon(dirInput: string): Canon {
  const dir = resolve(dirInput);
  const canon: Canon = {
    dir,
    root: undefined,
    nodes: {},
    roots: [],
    journeys: [],
    decisions: [],
    terms: [],
    principles: [],
    unparsed: [],
    duplicates: {},
  };
  const seen = new Map<string, string>();

  for (const abs of walk(dir).sort()) {
    const file = relative(dir, abs).split(sep).join("/");
    const { data, body } = parseFrontMatter(readFileSync(abs, "utf8"));
    const id = str(data["id"])?.trim();
    if (!id) {
      canon.unparsed.push(file);
      continue;
    }
    // Generated views carry id INDEX and are not canon objects.
    if (id === "INDEX") continue;
    const prev = seen.get(id);
    if (prev) {
      (canon.duplicates[id] ??= [prev]).push(file);
      continue;
    }
    seen.set(id, file);

    const title = str(data["title"]) ?? firstHeading(body) ?? id;
    if (id === "ROOT") {
      canon.root = { title, state: stateOf(data["state"], "stated"), partition: str(data["partition"]), file, body };
      canon.terms = parseGlossary(body);
      canon.principles = parsePrinciples(body);
    } else if (id.startsWith("REQ-")) {
      // A top-level node may say `parent: ROOT`; the root README is not a node, so that means no parent.
      const parentField = str(data["parent"])?.trim();
      const node: ReqNode = {
        id,
        parent: parentField && parentField !== "ROOT" ? parentField : undefined,
        title,
        state: stateOf(data["state"]),
        kind: str(data["kind"]),
        layer: isLayer(data["layer"]) ? data["layer"] : "requirement",
        layerExplicit: isLayer(data["layer"]),
        source: str(data["source"]),
        partition: str(data["partition"]),
        relates: strList(data["relates"]),
        conflicts: strList(data["conflicts"]),
        steps: strList(data["steps"]),
        files: strList(data["files"]),
        baseline: str(data["baseline"]),
        file,
        body,
        sections: parseSections(body),
        children: [],
        depth: 0,
      };
      canon.nodes[id] = node;
    } else if (id.startsWith("JRN-")) {
      const j: Journey = {
        id,
        title,
        state: stateOf(data["state"]),
        source: str(data["source"]),
        file,
        body,
        mermaid: parseMermaid(body),
        steps: parseStepTable(body),
      };
      canon.journeys.push(j);
    } else if (id.startsWith("DEC-")) {
      const d: Decision = {
        id,
        title,
        state: stateOf(data["state"]),
        date: str(data["date"]),
        intents: strList(data["intents"]),
        origin: str(data["origin"]),
        file,
        body,
      };
      canon.decisions.push(d);
    } else {
      canon.unparsed.push(file);
    }
  }

  // Tree links. A node whose parent is unknown is listed as a root so it stays visible;
  // the check reports the missing parent.
  for (const node of Object.values(canon.nodes)) {
    const parent = node.parent ? canon.nodes[node.parent] : undefined;
    if (parent) parent.children.push(node.id);
    else canon.roots.push(node.id);
  }
  for (const node of Object.values(canon.nodes)) node.children.sort(compareIds);
  canon.roots.sort(compareIds);
  const byDepth: Layer[] = ["domain", "capability", "requirement"];
  const setDepth = (id: string, depth: number) => {
    const n = canon.nodes[id];
    if (!n) return;
    n.depth = depth;
    // Without a layer field the layer is inferred from depth, for display only; checks use explicit layers.
    if (!n.layerExplicit) n.layer = byDepth[Math.min(depth, 2)]!;
    for (const c of n.children) setDepth(c, depth + 1);
  };
  for (const r of canon.roots) setDepth(r, 0);

  canon.journeys.sort((a, b) => compareIds(a.id, b.id));
  canon.decisions.sort((a, b) => compareIds(a.id, b.id));
  return canon;
}

function firstHeading(body: string): string | undefined {
  return /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
}

/** The top-level ancestor of a requirement. */
export function branchOf(canon: Canon, id: string): string | undefined {
  let cur = canon.nodes[id];
  if (!cur) return undefined;
  while (cur.parent && canon.nodes[cur.parent]) cur = canon.nodes[cur.parent]!;
  return cur.id;
}

/** Every descendant ID of `id`, depth-first. */
export function descendants(canon: Canon, id: string): string[] {
  const out: string[] = [];
  const visit = (x: string) => {
    for (const c of canon.nodes[x]?.children ?? []) {
      out.push(c);
      visit(c);
    }
  };
  visit(id);
  return out;
}
