/**
 * The code tree (DEC-025): every function of a repository, the calls between them, and the clusters they form,
 * found by community detection on a weighted graph of calls, file order and shared vocabulary, level by level
 * until one cluster is the whole program. Nothing here is intent: it is the evidence the refiner binds to nodes.
 * The parser is TypeScript's own, syntax only, so the call graph is approximate and says so (`possible`).
 * Descriptions of units are written by the reader agents and kept beside the tree, never by this code.
 */
import ts from "typescript";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";

export interface FnUnit {
  id: string;
  name: string;
  file: string;
  lines: [number, number];
  exported: boolean;
  /** Calls resolved to a unit of the tree, and calls that only probably reach one (same name elsewhere). */
  calls: string[];
  possible: string[];
  unresolved: string[];
  tokens: string[];
  /** The cluster this function belongs to at each level, `level -> cluster id`. */
  cluster: Record<string, string>;
}

export interface Cluster {
  id: string;
  level: number;
  /** A hash of the member functions, stable across rebuilds while the members are. */
  key: string;
  members: string[];
  parent: string | undefined;
  children: string[];
  /** Functions in the cluster called from outside it, and functions outside called from inside. */
  entries: string[];
  exits: string[];
  cohesion: number;
  coupling: number;
  vocabulary: string[];
  reachable: boolean;
  size: number;
}

export interface CodeTree {
  builtAt: string;
  repo: string;
  files: string[];
  functions: Record<string, FnUnit>;
  clusters: Record<string, Cluster>;
  levels: number;
  /** The top-level clusters. */
  roots: string[];
  stats: { functions: number; calls: number; possible: number; unresolved: number; unreachable: number; clustersByLevel: number[] };
}

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "coverage", "out", ".next", ".turbo", "legacy", "test-results", "playwright-report", "worktrees"]);
const STOP = new Set("the and for with from this that these those into over under const let var function return true false null undefined string number boolean object array new import export default async await type interface props state value values data item items index key keys name names get set map filter reduce length push pop slice splice join split trim then catch error err result results args arg opts options param params node nodes list file path dir src lib util utils helper helpers test tests spec mock main".split(" "));

export interface BuildOptions {
  /** Extra directories to skip, relative to the repository. */
  skip?: string[];
  /** Files larger than this are skipped (bytes). */
  maxFileBytes?: number;
  /** The Louvain resolutions, finest first; the default is the one measured on The Valley and on this repository. */
  gammas?: number[];
  /** A level-1 cluster larger than this is parted on its own subgraph (the hub pile-up guard). */
  cap?: number;
}

/** Walk the repository for code files. */
function codeFiles(repo: string, opts: BuildOptions): string[] {
  const out: string[] = [];
  const skipRel = new Set((opts.skip ?? []).map((s) => s.replace(/\\/g, "/").replace(/\/$/, "")));
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e);
      const rel = relative(repo, p).replace(/\\/g, "/");
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (SKIP_DIR.has(e) || skipRel.has(rel)) continue; walk(p); }
      else if (CODE_EXT.has(extname(e)) && !/\.d\.ts$/.test(e) && st.size <= (opts.maxFileBytes ?? 600_000)) out.push(rel);
    }
  };
  walk(repo);
  return out.sort();
}

const tokensOf = (s: string): string[] => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9]+/g, " ").toLowerCase().split(" ").filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));

interface RawUnit { id: string; name: string; file: string; lines: [number, number]; exported: boolean; callNames: string[]; refNames: string[]; tokens: string[]; cls: string | undefined }
interface FileInfo {
  imports: Map<string, { module: string; imported: string }>; namespaces: Map<string, string>; units: RawUnit[];
  /** Top-level constants holding an instance, `const items = new ItemSystem()`: items -> ItemSystem. */
  instances: Map<string, string>;
  /** Class fields holding an instance, by class then field: `private body: BodySystem`, `this.body = new BodySystem()`. */
  fields: Map<string, Map<string, string>>;
  /** Variables whose actions were found inside a factory call, `const useStore = create((set, get) => ({ act() {} }))`: `get().act` reaches `useStore.act`. */
  stores: string[];
}

/** Parse one file: its units with the names they call, and its imports. */
function parseFile(repo: string, rel: string, files: Set<string>): FileInfo {
  const abs = join(repo, rel);
  const text = readFileSync(abs, "utf8");
  const kind = /\.(tsx|jsx)$/.test(rel) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(rel) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.ESNext, true, kind);
  const info: FileInfo = { imports: new Map(), namespaces: new Map(), units: [], instances: new Map(), fields: new Map(), stores: [] };
  const resolveModule = (spec: string): string | undefined => {
    if (!spec.startsWith(".") && !spec.startsWith("/")) return undefined;
    const base = resolve(dirname(abs), spec);
    for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", "/index.ts", "/index.tsx", "/index.js"]) {
      const cand = relative(repo, base.replace(/\.js$/, "") + suffix).replace(/\\/g, "/");
      if (files.has(cand)) return cand;
      const cand2 = relative(repo, base + suffix).replace(/\\/g, "/");
      if (files.has(cand2)) return cand2;
    }
    return undefined;
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const mod = resolveModule(st.moduleSpecifier.text); if (!mod) continue;
      const c = st.importClause; if (!c) continue;
      if (c.name) info.imports.set(c.name.text, { module: mod, imported: "default" });
      if (c.namedBindings) {
        if (ts.isNamespaceImport(c.namedBindings)) info.namespaces.set(c.namedBindings.name.text, mod);
        else for (const el of c.namedBindings.elements) info.imports.set(el.name.text, { module: mod, imported: (el.propertyName ?? el.name).text });
      }
    }
  }
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const exportedFlag = (n: ts.Node) => Boolean(ts.getCombinedModifierFlags(n as ts.Declaration) & ts.ModifierFlags.Export);
  // the callee as a dotted chain: `a.b`, `this.body.findPart`, `get().navigate`, `useStore.getState().navigate`; `()` marks a call in the chain
  const calleeName = (e: ts.Expression): string => {
    if (ts.isIdentifier(e)) return e.text;
    if (e.kind === ts.SyntaxKind.ThisKeyword) return "this";
    if (ts.isPropertyAccessExpression(e)) { const inner = calleeName(e.expression); return inner ? `${inner}.${e.name.text}` : `.${e.name.text}`; }
    if (ts.isCallExpression(e)) { const inner = calleeName(e.expression); return inner ? `${inner}()` : ""; }
    if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) return calleeName(e.expression);
    return "";
  };
  // bodies that became units of their own are not read again for the file's top-level code
  const claimed = new Set<ts.Node>();
  const collect = (roots: ts.Node[], name: string, skip?: Set<ts.Node>) => {
    const callNames: string[] = []; const refNames: string[] = []; const toks: string[] = tokensOf(name);
    const visit = (n: ts.Node) => {
      if (skip?.has(n)) return;
      if (ts.isCallExpression(n)) {
        // a curried factory, `create<T>()(...)`, is one callee: the inner call is pushed by the walk, the outer `create()` is not a name
        const callee = calleeName(n.expression);
        if (callee && !callee.endsWith("()")) callNames.push(callee);
      } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) callNames.push(`new:${n.expression.text}`);
      // a JSX tag renders a component: a call; a bare identifier passed around, a handler or a callback, is a probable one
      else if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName) && /^[A-Z]/.test(n.tagName.text)) callNames.push(n.tagName.text);
      else if (ts.isIdentifier(n) && n.parent && !ts.isPropertyAccessExpression(n.parent) && !(ts.isCallExpression(n.parent) && n.parent.expression === n) && !ts.isJsxAttribute(n.parent) && !ts.isPropertyAssignment(n.parent) && !ts.isBindingElement(n.parent) && !ts.isParameter(n.parent) && !ts.isTypeReferenceNode(n.parent)) refNames.push(n.text);
      // an action taken from a store or an instance by name is a probable call: `const { navigate } = useStore()`,
      // `useStore((s) => s.navigate)`; the names go in as references and resolve when they are unique methods
      if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)) for (const el of n.name.elements) if (ts.isIdentifier(el.name)) refNames.push((el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName : el.name).text);
      if (ts.isArrowFunction(n) && n.parameters.length === 1 && ts.isIdentifier(n.parameters[0]!.name) && ts.isPropertyAccessExpression(n.body) && ts.isIdentifier(n.body.expression) && n.body.expression.text === n.parameters[0]!.name.text) refNames.push(n.body.name.text);
      if (ts.isIdentifier(n)) toks.push(...tokensOf(n.text));
      ts.forEachChild(n, visit);
    };
    for (const r of roots) visit(r);
    const count = new Map<string, number>(); for (const t of toks) count.set(t, (count.get(t) ?? 0) + 1);
    const tokens = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t]) => t);
    return { callNames: [...new Set(callNames)], refNames: [...new Set(refNames)].filter((r) => !callNames.includes(r)), tokens };
  };
  const addUnit = (name: string, body: ts.Node, exported: boolean, cls: string | undefined) => {
    const c = collect([body], name);
    claimed.add(body);
    info.units.push({ id: `${rel}#${name}`, name, file: rel, lines: [lineOf(body.getStart(sf)), lineOf(body.getEnd())], exported, callNames: c.callNames, refNames: c.refNames, tokens: c.tokens, cls });
  };
  // the function-valued properties of an object literal are units `prefix.name`; a nested literal keeps the dotted prefix
  const addObjectUnits = (prefix: string, o: ts.ObjectLiteralExpression, ex: boolean, depth: number): number => {
    let count = 0;
    for (const p of o.properties) {
      const pn = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined; if (!pn) continue;
      if (ts.isMethodDeclaration(p)) { addUnit(`${prefix}.${pn}`, p, ex, prefix); count++; }
      else if (ts.isPropertyAssignment(p)) {
        if (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer)) { addUnit(`${prefix}.${pn}`, p.initializer, ex, prefix); count++; }
        else if (ts.isObjectLiteralExpression(p.initializer) && depth < 2) count += addObjectUnits(`${prefix}.${pn}`, p.initializer, ex, depth + 1);
      }
    }
    return count;
  };
  // the object literals a factory call is given, directly or returned by an arrow it is given: a store such as
  // `create((set, get) => ({ navigate: () => ... }))`, or a wrapped one, `devtools(persist((set, get) => ({ ... })))`
  const literalsInCall = (c: ts.CallExpression, depth: number): ts.ObjectLiteralExpression[] => {
    if (depth > 4) return [];
    const out: ts.ObjectLiteralExpression[] = [];
    const fromArg = (a: ts.Node) => {
      let e: ts.Node = a; while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) e = e.expression;
      if (ts.isObjectLiteralExpression(e)) out.push(e);
      else if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
        const b = e.body;
        if (ts.isBlock(b)) { for (const s of b.statements) if (ts.isReturnStatement(s) && s.expression) fromArg(s.expression); }
        else fromArg(b);
      } else if (ts.isCallExpression(e)) out.push(...literalsInCall(e, depth + 1));
    };
    for (const a of c.arguments) fromArg(a);
    if (ts.isCallExpression(c.expression)) out.push(...literalsInCall(c.expression, depth + 1));
    return out;
  };
  const visitTop = (n: ts.Node, cls: string | undefined, exportedCtx: boolean) => {
    if (ts.isFunctionDeclaration(n) && n.name) { addUnit(n.name.text, n, exportedFlag(n) || exportedCtx, undefined); return; }
    if (ts.isVariableStatement(n)) {
      const ex = exportedFlag(n) || exportedCtx;
      for (const d of n.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const v = d.name.text;
        if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) addUnit(v, d.initializer, ex, undefined);
        else if (ts.isObjectLiteralExpression(d.initializer)) addObjectUnits(v, d.initializer, ex, 0);
        else if (ts.isNewExpression(d.initializer) && ts.isIdentifier(d.initializer.expression)) info.instances.set(v, d.initializer.expression.text);
        else if (ts.isCallExpression(d.initializer)) {
          // a store or a module built by a factory: its actions are units `v.action`, and `get().action` reaches them
          let found = 0; for (const o of literalsInCall(d.initializer, 0)) found += addObjectUnits(v, o, ex, 0);
          if (found) info.stores.push(v);
        }
      }
      return;
    }
    if (ts.isClassDeclaration(n) && n.name) {
      const ex = exportedFlag(n) || exportedCtx;
      const fmap = info.fields.get(n.name.text) ?? info.fields.set(n.name.text, new Map()).get(n.name.text)!;
      const typeNameOf = (t: ts.TypeNode | undefined): string | undefined => t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) ? t.typeName.text : undefined;
      for (const m of n.members) {
        if ((ts.isMethodDeclaration(m) || ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) addUnit(`${n.name.text}.${m.name.text}`, m, ex, n.name.text);
        else if (ts.isConstructorDeclaration(m)) {
          addUnit(`${n.name.text}.constructor`, m, ex, n.name.text);
          // `constructor(private body: BodySystem)` and `this.body = new BodySystem()` both make `this.body` a BodySystem
          for (const prm of m.parameters) { const t = typeNameOf(prm.type); if (t && ts.isIdentifier(prm.name) && ts.canHaveModifiers(prm) && ts.getModifiers(prm)?.length) fmap.set(prm.name.text, t); }
          if (m.body) ts.forEachChild(m.body, function walk(x): void { if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(x.left) && x.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isNewExpression(x.right) && ts.isIdentifier(x.right.expression)) fmap.set(x.left.name.text, x.right.expression.text); ts.forEachChild(x, walk); });
        } else if (ts.isPropertyDeclaration(m) && ts.isIdentifier(m.name)) {
          const t = typeNameOf(m.type) ?? (m.initializer && ts.isNewExpression(m.initializer) && ts.isIdentifier(m.initializer.expression) ? m.initializer.expression.text : undefined);
          if (t) fmap.set(m.name.text, t);
        }
      }
      return;
    }
    if (ts.isExportAssignment(n) && (ts.isArrowFunction(n.expression) || ts.isFunctionExpression(n.expression))) { addUnit("default", n.expression, true, undefined); return; }
    if (ts.isModuleDeclaration(n) && n.body && ts.isModuleBlock(n.body)) { for (const s of n.body.statements) visitTop(s, cls, exportedFlag(n)); return; }
  };
  for (const st of sf.statements) visitTop(st, undefined, false);
  const isDecl = (st: ts.Statement) => ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isImportDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st) || ts.isModuleDeclaration(st) || (ts.isVariableStatement(st) && st.declarationList.declarations.every((d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)))) || (ts.isExportAssignment(st) && (ts.isArrowFunction(st.expression) || ts.isFunctionExpression(st.expression)));
  const top = sf.statements.filter((st) => !isDecl(st));
  if (top.length) {
    const c = collect(top, "<module>", claimed);
    if (c.callNames.length || c.refNames.length) info.units.push({ id: `${rel}#<module>`, name: "<module>", file: rel, lines: [1, lineOf(sf.getEnd())], exported: false, callNames: c.callNames, refNames: c.refNames, tokens: c.tokens, cls: undefined });
  }
  return info;
}

/** Louvain community detection with a resolution parameter; returns a community index per node. */
function louvain(n: number, adj: Map<number, number>[], gamma: number): number[] {
  const k = new Array<number>(n).fill(0); let m2 = 0;
  for (let i = 0; i < n; i++) for (const [j, w] of adj[i]!) { k[i]! += w; m2 += w; }
  if (m2 === 0) return Array.from({ length: n }, (_, i) => i);
  const comm = Array.from({ length: n }, (_, i) => i);
  const tot = [...k];
  let moved = true, rounds = 0;
  while (moved && rounds++ < 50) {
    moved = false;
    for (let i = 0; i < n; i++) {
      const ci = comm[i]!;
      const links = new Map<number, number>();
      for (const [j, w] of adj[i]!) if (j !== i) links.set(comm[j]!, (links.get(comm[j]!) ?? 0) + w);
      tot[ci]! -= k[i]!;
      let best = ci, bestGain = (links.get(ci) ?? 0) - (gamma * tot[ci]! * k[i]!) / m2;
      for (const [c, w] of links) { const gain = w - (gamma * tot[c]! * k[i]!) / m2; if (gain > bestGain + 1e-12) { bestGain = gain; best = c; } }
      tot[best]! += k[i]!;
      if (best !== ci) { comm[i] = best; moved = true; }
    }
  }
  const ids = new Map<number, number>();
  return comm.map((c) => { if (!ids.has(c)) ids.set(c, ids.size); return ids.get(c)!; });
}

/**
 * Louvain piles the callers of a hub into one community. A community above `cap` is clustered again on its own
 * subgraph at a sharper resolution, and by file when that still does not part it; the rest of the assignment is kept.
 */
function splitLarge(adj: Map<number, number>[], comm: number[], gamma: number, cap: number, files: string[]): number[] {
  const groups = new Map<number, number[]>(); comm.forEach((c, i) => (groups.get(c) ?? groups.set(c, []).get(c)!).push(i));
  const out = [...comm]; let next = Math.max(...comm, -1) + 1;
  for (const members of groups.values()) {
    if (members.length <= cap) continue;
    const idx = new Map(members.map((m, k) => [m, k] as const)); const sub: Map<number, number>[] = members.map(() => new Map());
    members.forEach((m, k) => { for (const [j, w] of adj[m]!) { const kj = idx.get(j); if (kj !== undefined) sub[k]!.set(kj, w); } });
    const largest = (c: number[]) => { const n = new Map<number, number>(); for (const x of c) n.set(x, (n.get(x) ?? 0) + 1); return Math.max(...n.values()); };
    let parts: number[] | undefined;
    for (let g = gamma * 1.5; g <= gamma * 8 && !parts; g *= 1.5) { const c = louvain(members.length, sub, g); if (Math.max(...c) > 0 && largest(c) <= Math.max(cap, Math.ceil(members.length / 2))) parts = c; }
    if (!parts) { const byFile = new Map<string, number>(); parts = members.map((m) => { const f = files[m]!; if (!byFile.has(f)) byFile.set(f, byFile.size); return byFile.get(f)!; }); if (Math.max(...parts) === 0) continue; }
    // a piece of one goes with the piece it is most linked to, so a split leaves no stray singletons
    const sizes = new Map<number, number>(); for (const p of parts) sizes.set(p, (sizes.get(p) ?? 0) + 1);
    members.forEach((m, k) => { if (sizes.get(parts![k]!) !== 1) return; const pull = new Map<number, number>(); for (const [j, w] of adj[m]!) { const kj = idx.get(j); if (kj !== undefined && kj !== k) pull.set(parts![kj]!, (pull.get(parts![kj]!) ?? 0) + w); } let best: number | undefined, bw = 0; for (const [p, w] of pull) if (w > bw) { bw = w; best = p; } if (best !== undefined) parts![k] = best; });
    const ids = new Map<number, number>();
    members.forEach((m, k) => { const p = parts![k]!; if (!ids.has(p)) ids.set(p, ids.size === 0 ? comm[m]! : next++); out[m] = ids.get(p)!; });
  }
  const renum = new Map<number, number>(); return out.map((c) => { if (!renum.has(c)) renum.set(c, renum.size); return renum.get(c)!; });
}

/** Aggregate a graph by a community assignment. */
function aggregate(adj: Map<number, number>[], comm: number[], count: number): Map<number, number>[] {
  const out: Map<number, number>[] = Array.from({ length: count }, () => new Map());
  adj.forEach((edges, i) => { for (const [j, w] of edges) { const a = comm[i]!, b = comm[j]!; out[a]!.set(b, (out[a]!.get(b) ?? 0) + w); } });
  return out;
}

/** Build the tree of one repository. Pure of side effects; `saveCodeTree` writes it. */
export function buildCodeTree(repo: string, opts: BuildOptions = {}): CodeTree {
  const files = codeFiles(repo, opts);
  const fileSet = new Set(files);
  const parsed = new Map<string, FileInfo>();
  for (const f of files) { try { parsed.set(f, parseFile(repo, f, fileSet)); } catch { /* a file the parser rejects is skipped, never fatal */ } }
  const units: RawUnit[] = []; for (const info of parsed.values()) units.push(...info.units);
  const byId = new Map(units.map((u, i) => [u.id, i] as const));
  const byName = new Map<string, number[]>(); const byMethod = new Map<string, number[]>();
  units.forEach((u, i) => { (byName.get(u.name) ?? byName.set(u.name, []).get(u.name)!).push(i); const m = u.name.includes(".") ? u.name.slice(u.name.lastIndexOf(".") + 1) : u.name; (byMethod.get(m) ?? byMethod.set(m, []).get(m)!).push(i); });
  const importedBy = new Map<string, number>(); for (const [f, info] of parsed) { for (const { module } of info.imports.values()) importedBy.set(module, (importedBy.get(module) ?? 0) + 1); for (const module of info.namespaces.values()) importedBy.set(module, (importedBy.get(module) ?? 0) + 1); void f; }
  // resolve calls
  const calls: number[][] = units.map(() => []), possible: number[][] = units.map(() => []), unresolved: string[][] = units.map(() => []);
  // a member of a class named in `file`: the class is declared there, imported there, or unique in the repository
  const classMember = (file: string, cls: string, member: string): number | undefined => {
    const direct = byId.get(`${file}#${cls}.${member}`); if (direct !== undefined) return direct;
    const imp = parsed.get(file)?.imports.get(cls); if (imp) return byId.get(`${imp.module}#${imp.imported}.${member}`);
    const c = byName.get(`${cls}.${member}`) ?? []; return c.length === 1 ? c[0] : undefined;
  };
  units.forEach((u, i) => {
    const info = parsed.get(u.file)!;
    for (const [raw, viaRef] of [...u.callNames.map((c) => [c, false] as const), ...u.refNames.map((c) => [c, true] as const)]) {
      const name = raw.startsWith("new:") ? `${raw.slice(4)}.constructor` : raw;
      let hit: number | undefined, sure = !viaRef;
      const local = (nm: string) => byId.get(`${u.file}#${nm}`);
      if (name.includes(".")) {
        // a store getter in the chain is transparent: `get().m` is this file's store, `useStore.getState().m` is that store
        const segs = name.split(".").filter((s) => !/^(getState|getStore)\(\)$/.test(s));
        const obj = segs[0]!, member = segs.slice(1).join(".");
        if (obj === "get()" || obj === "getState()") { for (const sv of info.stores) { hit = local(`${sv}.${member}`); if (hit !== undefined) break; } }
        else if (obj === "this" && u.cls) {
          if (segs.length === 2) hit = local(`${u.cls}.${member}`);
          else { const t = info.fields.get(u.cls)?.get(segs[1]!); if (t) hit = classMember(u.file, t, segs.slice(2).join(".")); }
        } else {
          const ns = info.namespaces.get(obj); const imp = info.imports.get(obj);
          if (ns) { hit = byId.get(`${ns}#${member}`); const inst = segs.length >= 3 ? parsed.get(ns)?.instances.get(segs[1]!) : undefined; if (hit === undefined && inst) hit = classMember(ns, inst, segs.slice(2).join(".")); }
          else if (imp) {
            hit = byId.get(`${imp.module}#${imp.imported}.${member}`) ?? byId.get(`${imp.module}#${member}`);
            // an imported instance, `items.getTemplate` where its module says `export const items = new ItemSystem()`
            const inst = parsed.get(imp.module)?.instances.get(imp.imported); if (hit === undefined && inst) hit = classMember(imp.module, inst, member);
          } else {
            hit = local(`${obj}.${member}`) ?? local(segs.join("."));
            const inst = info.instances.get(obj); if (hit === undefined && inst) hit = classMember(u.file, inst, member);
          }
        }
        const last = segs[segs.length - 1]!;
        if (hit === undefined && last !== "constructor" && !last.endsWith("()")) { const c = byMethod.get(last) ?? []; if (c.length === 1) { hit = c[0]; sure = false; } }
        if (hit === undefined && last === "constructor") { const c = byName.get(segs.join(".")) ?? []; if (c.length === 1) { hit = c[0]; sure = false; } }
      } else {
        const imp = info.imports.get(name);
        if (imp) hit = byId.get(`${imp.module}#${imp.imported}`) ?? (imp.imported === "default" ? byId.get(`${imp.module}#default`) : undefined);
        else hit = local(name);
        if (hit === undefined && !viaRef) { const c = byName.get(name) ?? []; if (c.length === 1 && c[0] !== i) { hit = c[0]; sure = false; } }
        // a bare name that is a unique method or store action: `const { navigate } = useStore(); navigate(id)`, a destructured instance method
        if (hit === undefined) { const c = byMethod.get(name) ?? []; if (c.length === 1 && c[0] !== i && units[c[0]!]!.name.includes(".")) { hit = c[0]; sure = false; } }
      }
      if (hit === undefined || hit === i) { if (hit === undefined && !viaRef) unresolved[i]!.push(raw); continue; }
      (sure ? calls : possible)[i]!.push(hit);
    }
  });
  // importing a module runs its top-level code: a call from the importer's module unit, kept apart from the graph's
  // call weight below, or the module units of a package cluster with each other instead of with their own files
  const importEdges: Array<[number, number]> = [];
  for (const [file, info] of parsed) {
    const from = byId.get(`${file}#<module>`); if (from === undefined) continue;
    for (const target of new Set([...[...info.imports.values()].map((x) => x.module), ...info.namespaces.values()])) { const to = byId.get(`${target}#<module>`); if (to !== undefined && to !== from) { calls[from]!.push(to); importEdges.push([from, to]); } }
  }
  const importEdgeSet = new Set(importEdges.map(([a, b]) => `${a}:${b}`));
  // the weighted graph: calls, file order, shared vocabulary
  const n = units.length;
  const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  const link = (a: number, b: number, w: number) => { if (a === b) return; adj[a]!.set(b, (adj[a]!.get(b) ?? 0) + w); adj[b]!.set(a, (adj[b]!.get(a) ?? 0) + w); };
  units.forEach((_, i) => { for (const j of new Set(calls[i])) link(i, j, importEdgeSet.has(`${i}:${j}`) ? 1 : 3); for (const j of new Set(possible[i])) link(i, j, 1); });
  const byFile = new Map<string, number[]>(); units.forEach((u, i) => (byFile.get(u.file) ?? byFile.set(u.file, []).get(u.file)!).push(i));
  for (const idx of byFile.values()) for (let k = 1; k < idx.length; k++) link(idx[k - 1]!, idx[k]!, 1);
  // a file's module unit holds its functions: it sits with them, not with the module units of the files it imports
  for (const idx of byFile.values()) { const mod = idx.find((i) => units[i]!.name === "<module>"); if (mod !== undefined) for (const i of idx) if (i !== mod) link(mod, i, 1); }
  const df = new Map<string, number[]>(); units.forEach((u, i) => { for (const t of u.tokens) (df.get(t) ?? df.set(t, []).get(t)!).push(i); });
  const common = new Set([...df].filter(([, v]) => v.length > Math.max(20, n * 0.3)).map(([t]) => t));
  const shared = new Map<number, Map<number, number>>();
  for (const [t, idx] of df) { if (common.has(t) || idx.length > 60) continue; for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) { const i = idx[a]!, j = idx[b]!; const row = shared.get(i) ?? shared.set(i, new Map()).get(i)!; row.set(j, (row.get(j) ?? 0) + 1); } }
  for (const [i, row] of shared) for (const [j, c] of row) { const ti = units[i]!.tokens.filter((t) => !common.has(t)).length, tj = units[j]!.tokens.filter((t) => !common.has(t)).length; if (c >= 2 && c / (ti + tj - c) >= 0.35) link(i, j, 1); }
  // levels of clusters
  const gammas = opts.gammas ?? [1.6, 1.0, 0.6, 0.35];
  const cap = opts.cap ?? 20;
  const membership: number[][] = []; // per level, community of each original unit
  let graph = adj, mapping = Array.from({ length: n }, (_, i) => i), prevCount = n;
  const fileOfUnit = units.map((u) => u.file);
  for (const gamma of gammas) {
    let comm = louvain(graph.length, graph, gamma);
    // the first level is where a hub piles its callers into one community; a community past the cap is parted on its own
    if (!membership.length) { comm = splitLarge(graph, comm, gamma, cap, fileOfUnit); comm = splitLarge(graph, comm, gamma, cap, fileOfUnit); }
    const count = Math.max(...comm, -1) + 1;
    const level = mapping.map((c) => comm[c]!);
    if (count === prevCount && membership.length) break;
    membership.push(level); mapping = level; prevCount = count;
    graph = aggregate(graph, comm, count);
    if (count === 1) break;
  }
  if (!membership.length) membership.push(new Array<number>(n).fill(0));
  // reachability: exported units of files nothing imports, and every unit of a test file, are entries
  const entriesSet = new Set<number>();
  const exportsOf = new Map<string, number>(); units.forEach((u) => { if (u.exported) exportsOf.set(u.file, (exportsOf.get(u.file) ?? 0) + 1); });
  units.forEach((u, i) => { const root = !importedBy.has(u.file); if ((u.name === "<module>" && root) || (u.exported && root) || (root && !exportsOf.has(u.file)) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(u.file) || /(^|\/)(main|index|cli|app)\.[cm]?[jt]sx?$/.test(u.file) && u.exported) entriesSet.add(i); });
  const reachable = new Array<boolean>(n).fill(false); const queue = [...entriesSet]; for (const e of queue) reachable[e] = true;
  // importing a module runs its top-level code: a reachable unit makes the module units of its file's imports reachable
  const moduleUnitsImportedBy = new Map<string, number[]>();
  for (const [file, info] of parsed) moduleUnitsImportedBy.set(file, [...new Set([...[...info.imports.values()].map((x) => x.module), ...info.namespaces.values()])].map((m) => byId.get(`${m}#<module>`)).filter((x): x is number => x !== undefined));
  while (queue.length) { const i = queue.pop()!; for (const j of [...calls[i]!, ...possible[i]!, ...(moduleUnitsImportedBy.get(units[i]!.file) ?? [])]) if (!reachable[j]) { reachable[j] = true; queue.push(j); } }
  // cluster records
  const clusters: Record<string, Cluster> = {};
  const fnClusters: Record<string, string>[] = units.map(() => ({}));
  const fnIdxOf = new Map<string, number[]>();
  const idsAt: string[][] = [];
  membership.forEach((level, li) => {
    const L = li + 1;
    const groups = new Map<number, number[]>(); level.forEach((c, i) => (groups.get(c) ?? groups.set(c, []).get(c)!).push(i));
    const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
    const ids: string[] = [];
    ordered.forEach((members, rank) => {
      const id = `c${L}-${rank + 1}`; ids.push(id);
      const set = new Set(members);
      let internal = 0, external = 0; const entries = new Set<string>(), exits = new Set<string>();
      for (const i of members) for (const [j, w] of adj[i]!) { if (set.has(j)) internal += w; else external += w; }
      for (const i of members) { for (const j of [...calls[i]!, ...possible[i]!]) if (!set.has(j)) exits.add(units[j]!.id); }
      units.forEach((_, i) => { if (set.has(i)) return; for (const j of [...calls[i]!, ...possible[i]!]) if (set.has(j)) entries.add(units[j]!.id); });
      const tc = new Map<string, number>(); for (const i of members) for (const t of units[i]!.tokens) if (!common.has(t)) tc.set(t, (tc.get(t) ?? 0) + 1);
      const key = createHash("sha1").update(members.map((i) => units[i]!.id).sort().join("\n")).digest("hex").slice(0, 10);
      const memberIds = L === 1 ? members.map((i) => units[i]!.id) : [...new Set(members.map((i) => fnClusters[i]![String(L - 1)]!))].sort();
      clusters[id] = { id, level: L, key, members: memberIds, parent: undefined, children: [], entries: [...entries].sort(), exits: [...exits].sort(), cohesion: internal + external ? +(internal / (internal + external)).toFixed(3) : 1, coupling: internal + external ? +(external / (internal + external)).toFixed(3) : 0, vocabulary: [...tc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t), reachable: members.some((i) => reachable[i]), size: members.length };
      for (const i of members) fnClusters[i]![String(L)] = id;
      fnIdxOf.set(id, members);
    });
    idsAt.push(ids);
  });
  for (let L = 2; L <= membership.length; L++) for (const id of idsAt[L - 1]!) for (const child of clusters[id]!.members) { clusters[child]!.parent = id; clusters[id]!.children.push(child); }
  // a level that merges nothing is no level: a cluster with one child is that child, and its functions skip the level
  for (let L = 2; L <= membership.length; L++) for (const id of idsAt[L - 1]!) {
    const c = clusters[id]!; if (c.members.length !== 1) continue;
    const child = clusters[c.members[0]!]!; const parent = c.parent ? clusters[c.parent] : undefined;
    child.parent = c.parent;
    if (parent) { parent.members = parent.members.map((m) => (m === id ? child.id : m)); parent.children = parent.children.map((m) => (m === id ? child.id : m)); }
    for (const i of fnIdxOf.get(id) ?? []) delete fnClusters[i]![String(L)];
    delete clusters[id];
  }
  // the standalone files, a config, a lone widget, one test, gather under one top cluster instead of each being a root
  const topLevel = Math.max(1, membership.length);
  const standalone = Object.values(clusters).filter((c) => !c.parent && c.size <= 3 && c.coupling === 0);
  if (standalone.length >= 2 && Object.values(clusters).some((c) => !c.parent && !standalone.includes(c))) {
    const id = `c${topLevel}-standalone`;
    const tc = new Map<string, number>(); for (const c of standalone) for (const t of c.vocabulary) tc.set(t, (tc.get(t) ?? 0) + 1);
    clusters[id] = { id, level: topLevel, key: createHash("sha1").update(standalone.map((c) => c.key).sort().join("\n")).digest("hex").slice(0, 10), members: standalone.map((c) => c.id), parent: undefined, children: standalone.map((c) => c.id), entries: [], exits: [], cohesion: 1, coupling: 0, vocabulary: [...tc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t), reachable: standalone.some((c) => c.reachable), size: standalone.reduce((x, c) => x + c.size, 0) };
    for (const c of standalone) c.parent = id;
  }
  const roots = Object.values(clusters).filter((c) => !c.parent).sort((a, b) => b.size - a.size || a.id.localeCompare(b.id)).map((c) => c.id);
  const functions: Record<string, FnUnit> = {};
  units.forEach((u, i) => { functions[u.id] = { id: u.id, name: u.name, file: u.file, lines: u.lines, exported: u.exported, calls: [...new Set(calls[i]!.map((j) => units[j]!.id))], possible: [...new Set(possible[i]!.map((j) => units[j]!.id))], unresolved: unresolved[i]!, tokens: u.tokens, cluster: fnClusters[i]! }; });
  const clustersByLevel = idsAt.map((_, li) => Object.values(clusters).filter((c) => c.level === li + 1).length);
  return {
    builtAt: new Date().toISOString(), repo, files, functions, clusters, levels: membership.length, roots,
    stats: { functions: n, calls: calls.reduce((x, c) => x + c.length, 0), possible: possible.reduce((x, c) => x + c.length, 0), unresolved: unresolved.reduce((x, c) => x + c.length, 0), unreachable: reachable.filter((r) => !r).length, clustersByLevel },
  };
}

/** Where the tree and its descriptions live: `<git dir>/headcanon/code/`. */
export const codeDir = (gitDir: string): string => join(gitDir, "headcanon", "code");

export function saveCodeTree(gitDir: string, tree: CodeTree): string {
  const dir = codeDir(gitDir); mkdirSync(dir, { recursive: true });
  const file = join(dir, "units.json"); writeFileSync(file, JSON.stringify(tree)); return file;
}

export function loadCodeTree(gitDir: string): CodeTree | undefined {
  const file = join(codeDir(gitDir), "units.json");
  if (!existsSync(file)) return undefined;
  try { return JSON.parse(readFileSync(file, "utf8")) as CodeTree; } catch { return undefined; }
}

/** Descriptions by unit id, written by the readers: `{ "<id>": { "text": "...", "at": "...", "by": "..." } }`. */
export type Descriptions = Record<string, { text: string; at: string; by?: string }>;
export function loadDescriptions(gitDir: string): Descriptions {
  const file = join(codeDir(gitDir), "descriptions.json");
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, "utf8")) as Descriptions; } catch { return {}; }
}
export function saveDescriptions(gitDir: string, d: Descriptions): void {
  mkdirSync(codeDir(gitDir), { recursive: true });
  writeFileSync(join(codeDir(gitDir), "descriptions.json"), JSON.stringify(d, null, 1));
}

/** The units of one level that have no description yet, with what a reader needs to write one, smallest first. */
export function describeTodo(tree: CodeTree, d: Descriptions, level: number, limit = 50): Array<{ id: string; level: number; file?: string; lines?: [number, number]; members: Array<{ id: string; text: string | undefined; file?: string | undefined; lines?: [number, number] | undefined }>; vocabulary?: string[] | undefined; entries?: string[] | undefined }> {
  const out: ReturnType<typeof describeTodo> = [];
  if (level === 0) {
    for (const f of Object.values(tree.functions)) if (!d[f.id]) out.push({ id: f.id, level: 0, file: f.file, lines: f.lines, members: [] });
    return out.sort((a, b) => a.file!.localeCompare(b.file!) || a.lines![0] - b.lines![0]).slice(0, limit);
  }
  for (const c of Object.values(tree.clusters)) {
    if (c.level !== level || d[c.id]) continue;
    const members = c.members.map((m) => level === 1 ? { id: m, text: d[m]?.text, file: tree.functions[m]?.file, lines: tree.functions[m]?.lines } : { id: m, text: d[m]?.text });
    out.push({ id: c.id, level, members, vocabulary: c.vocabulary, entries: c.entries });
  }
  return out.sort((a, b) => a.members.length - b.members.length).slice(0, limit);
}

/** One unit's record with its description and its children one level down, for the parcel and the lookup. */
export function expandUnit(tree: CodeTree, d: Descriptions, id: string): { id: string; kind: "cluster" | "function"; text: string | undefined; file?: string | undefined; lines?: [number, number] | undefined; children: Array<{ id: string; text: string | undefined; size?: number | undefined }>; size?: number | undefined; reachable?: boolean | undefined } | undefined {
  const c = tree.clusters[id];
  if (c) return { id, kind: "cluster", text: d[id]?.text, children: c.members.map((m) => ({ id: m, text: d[m]?.text, size: tree.clusters[m]?.size })), size: c.size, reachable: c.reachable };
  const f = tree.functions[id];
  if (f) return { id, kind: "function", text: d[id]?.text, file: f.file, lines: f.lines, children: [] };
  return undefined;
}

export const unitBasename = (id: string): string => basename(id.split("#")[0] ?? id);
