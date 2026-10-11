import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkCommitMessage, gitAppendOnlyFiles } from "./commit-msg.js";
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { loadReviewRecord, stagedIntentDiff, storeReviewRecord, validateReviewRecord, type ReviewRecord } from "./review.js";
import { runMcp } from "./mcp.js";
import { detectTerms } from "./terms.js";
import { sessionContext } from "./context.js";
import { initCanon } from "./init.js";
import { loadCanon } from "./load.js";
import { renderMermaidIndex } from "./render.js";
import { buildSnapshot } from "./snapshot.js";
import { serveUi } from "./ui/server.js";

const HELP = `headcanon <command> [options]

Commands
  init           Create the canon skeleton and install the commit-msg hook in this repository.
  check          Validate the canon: structure, links, files and states that need a human. Exit 1 on errors.
  summary        Print the requirement tree as plain text.
  render         Write the Mermaid index (canon/INDEX.md by default).
  attention      What is waiting on the human: approvals, unmerged changes, open and contested items.
  commit-msg F   Validate the commit message in file F (used by the git hook). Exit 1 on errors.
  review-hash    Describe the staged canon diff: its hash and whether it needs a semantic review.
  review-record F  Store the finished review in F (JSON) for the staged canon diff. Exit 1 if invalid.
  session-start  Print the session context as a Claude Code SessionStart hook result.
  ui             Serve the local viewer.
  mcp            Serve the MCP tools for Claude Code over stdio (starts the viewer when none runs).
  terms          List candidate jargon in a draft (--text or stdin) that the glossary does not define.

Options
  --canon <dir>   Canon directory (default: ./canon, or $CLAUDE_PROJECT_DIR/canon for mcp)
  --port <n>      Port for ui and mcp (default: 4317)
  --no-open       For mcp: do not open the browser on the first question
  --text <draft>  For terms: the draft to scan
  --out <file>    Output file for render
  --json          Machine-readable output for check and attention
  --force         For init: replace a commit-msg hook HeadCanon did not install
  --depth <n>     For summary: deepest level to print
`;

/** The launcher the git hook and the plugin call; resolves from src/ and dist/ alike. */
const BIN = fileURLToPath(new URL("../bin/headcanon.js", import.meta.url));

interface Args {
  command: string | undefined;
  positional: string[];
  canon: string | undefined;
  port: number;
  out: string | undefined;
  json: boolean;
  force: boolean;
  depth: number | undefined;
  open: boolean;
  text: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { command: undefined, positional: [], canon: undefined, port: 4317, out: undefined, json: false, force: false, depth: undefined, open: true, text: undefined };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    const next = () => argv[++i];
    if (x === "--canon") a.canon = next();
    else if (x.startsWith("--canon=")) a.canon = x.slice(8);
    else if (x === "--port") a.port = Number(next() ?? a.port);
    else if (x.startsWith("--port=")) a.port = Number(x.slice(7));
    else if (x === "--out") a.out = next();
    else if (x.startsWith("--out=")) a.out = x.slice(6);
    else if (x === "--depth") a.depth = Number(next());
    else if (x.startsWith("--depth=")) a.depth = Number(x.slice(8));
    else if (x === "--json") a.json = true;
    else if (x === "--force") a.force = true;
    else if (x === "--no-open") a.open = false;
    else if (x === "--text") a.text = next();
    else if (x.startsWith("--text=")) a.text = x.slice(7);
    else if (x.startsWith("-")) process.stderr.write(`ignoring unknown option ${x}\n`);
    else if (!a.command) a.command = x;
    else a.positional.push(x);
  }
  return a;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  return new Promise((ok) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => ok(data));
    process.stdin.on("error", () => ok(data));
    setTimeout(() => ok(data), 2000).unref();
  });
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const out = (s: string) => process.stdout.write(s);
  const err = (s: string) => process.stderr.write(s);
  if (!args.command || args.command === "help" || argv.includes("--help")) {
    out(HELP);
    return 0;
  }

  // session-start must never break a session: it answers even without a canon, and never throws.
  if (args.command === "session-start") {
    let cwd = process.cwd();
    try {
      const input = JSON.parse((await readStdin()) || "{}") as { cwd?: string };
      if (input.cwd) cwd = input.cwd;
    } catch {
      /* no hook input */
    }
    if (process.env["CLAUDE_PROJECT_DIR"] && !argv.includes("--canon")) cwd = process.env["CLAUDE_PROJECT_DIR"];
    const canonDir = resolve(cwd, args.canon ?? "canon");
    let context: string;
    try {
      context = existsSync(canonDir) ? sessionContext(buildSnapshot(canonDir), canonDir) : sessionContext(undefined, canonDir);
    } catch (e) {
      context = `# HeadCanon\n\nThe canon at ${canonDir} could not be read: ${e instanceof Error ? e.message : String(e)}\nRun \`headcanon check\` and fix the file it names before relying on the canon.`;
    }
    out(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }) + "\n");
    return 0;
  }

  // mcp runs for the whole session; the canon is the project's, which Claude Code names in the environment.
  if (args.command === "mcp") {
    const projectDir = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
    const canonDir = resolve(args.canon ?? resolve(projectDir, "canon"));
    await runMcp({ canonDir, port: args.port, openBrowser: args.open });
    return 0;
  }

  if (args.command === "terms") {
    const draft = args.text ?? (await readStdin());
    const glossaryDir = resolve(args.canon ?? "canon");
    const glossary = existsSync(glossaryDir) ? loadCanon(glossaryDir).terms : [];
    const found = detectTerms(draft, glossary);
    out(args.json ? JSON.stringify(found) + "\n" : found.length ? found.join("\n") + "\n" : "");
    return 0;
  }

  if (args.command === "init") {
    const r = initCanon({ repoDir: process.cwd(), cliPath: BIN, force: args.force, ...(args.canon ? { canonDir: args.canon } : {}) });
    for (const c of r.created) out(`created ${c}\n`);
    for (const n of r.notes) out(`note: ${n}\n`);
    out(r.hookInstalled ? `commit-msg hook: ${r.hookPath}\n` : "commit-msg hook: not installed\n");
    out(`canon: ${r.canonDir}\nNext: run /headcanon:adopt in Claude Code, or write canon/README.md by hand.\n`);
    return 0;
  }

  const canonDir = resolve(args.canon ?? "canon");

  if (args.command === "commit-msg") {
    const file = args.positional[0];
    if (!file) {
      err("usage: headcanon commit-msg <message-file> [--canon dir]\n");
      return 2;
    }
    const canon = existsSync(canonDir) ? loadCanon(canonDir) : undefined;
    const repoRoot = repoRootOf(process.cwd()) ?? repoRootOf(dirnameOf(file));
    let review: import("./commit-msg.js").ReviewState | undefined;
    if (repoRoot) {
      const diff = stagedIntentDiff(repoRoot, canonPathspec(repoRoot, canonDir));
      const record = diff.required ? loadReviewRecord(repoRoot, diff.hash) : undefined;
      review = { diff, record, recordErrors: record ? validateReviewRecord(record, diff) : [] };
    }
    const r = checkCommitMessage(readFileSync(file, "utf8"), canon, { appendOnly: repoRoot ? gitAppendOnlyFiles(repoRoot) : [], ...(review ? { review } : {}) });
    for (const w of r.warnings) err(`warning: ${w}\n`);
    if (!r.ok) {
      err("HeadCanon rejected the commit message:\n");
      for (const e of r.errors) err(`  - ${e}\n`);
      err("\nFormat: Conventional Commits header, a blank line, prose, a blank line, then trailers:\n  Intent: REQ-1.2            (or: none (reason))\n  Intent-Change: update REQ-1.2\n  Approved-By: <git user.name> or pending (how approval happens)\n");
      if (!canon) err(`(no canon found at ${canonDir}; ids were not checked)\n`);
      return 1;
    }
    return 0;
  }

  if (args.command === "review-hash" || args.command === "review-record") {
    const repoRoot = repoRootOf(process.cwd());
    if (!repoRoot) {
      err("not a git repository\n");
      return 2;
    }
    const diff = stagedIntentDiff(repoRoot, canonPathspec(repoRoot, canonDir));
    if (args.command === "review-hash") {
      out(JSON.stringify(diff, null, 2) + "\n");
      return 0;
    }
    const file = args.positional[0];
    if (!file) {
      err("usage: headcanon review-record <review.json>\n");
      return 2;
    }
    let rec: ReviewRecord;
    try {
      rec = JSON.parse(readFileSync(file, "utf8")) as ReviewRecord;
    } catch (e) {
      err(`cannot read ${file}: ${e instanceof Error ? e.message : String(e)}\n`);
      return 2;
    }
    if (!rec.at) rec.at = new Date().toISOString();
    const problems = validateReviewRecord(rec, diff);
    if (problems.length) {
      err("The review record was not stored:\n");
      for (const p of problems) err(`  - ${p}\n`);
      return 1;
    }
    const path = storeReviewRecord(repoRoot, rec);
    out(`stored ${path}\n${rec.findings.length} finding(s), all resolved; ${diff.affectedParents.length} untouched parent(s) accounted for; add the trailer: Intent-Review: ${diff.hash}, ${rec.findings.length} finding(s)\n`);
    return 0;
  }

  if (!existsSync(canonDir)) {
    err(`No canon at ${canonDir}. Run \`headcanon init\`, or pass --canon <dir>.\n`);
    return 2;
  }

  switch (args.command) {
    case "check": {
      const snap = buildSnapshot(canonDir);
      if (args.json) out(JSON.stringify(snap.findings, null, 2) + "\n");
      else {
        for (const f of snap.findings) out(`${f.level.padEnd(5)} ${f.code.padEnd(20)} ${f.message}\n`);
        const { errors, warnings, infos, nodes } = snap.stats;
        out(`\n${nodes} requirements, ${errors} errors, ${warnings} warnings, ${infos} notes\n`);
      }
      return snap.stats.errors > 0 ? 1 : 0;
    }
    case "summary": {
      const snap = buildSnapshot(canonDir);
      const { renderTextTree } = await import("./tree.js");
      out((args.depth === undefined ? snap.textTree : renderTextTree(snap.canon, snap.findings, { maxDepth: args.depth })) + "\n");
      return 0;
    }
    case "render": {
      const snap = buildSnapshot(canonDir);
      const target = resolve(args.out ?? join(canonDir, "INDEX.md"));
      writeFileSync(target, renderMermaidIndex(snap.canon, snap.findings));
      out(`wrote ${target}\n`);
      return 0;
    }
    case "attention": {
      const snap = buildSnapshot(canonDir);
      const nodes = Object.values(snap.canon.nodes);
      const data = {
        pending: snap.git.pending.map((c) => ({ sha: c.short, subject: c.subject, changes: c.trailers["Intent-Change"] ?? [], approvedBy: c.trailers["Approved-By"] ?? [] })),
        unmerged: snap.git.unmerged.filter((c) => !snap.git.pending.includes(c)).map((c) => ({ sha: c.short, subject: c.subject, changes: c.trailers["Intent-Change"] ?? [] })),
        uncommitted: snap.git.uncommitted,
        errors: snap.findings.filter((f) => f.level === "error").map((f) => f.message),
        contested: nodes.filter((n) => n.state === "contested").map((n) => ({ id: n.id, title: n.title })),
        open: nodes.filter((n) => n.state === "open").map((n) => ({ id: n.id, title: n.title })),
        unconfirmedDecisions: snap.canon.decisions.filter((d) => d.state === "assumed").map((d) => ({ id: d.id, title: d.title, intents: d.intents })),
        assumed: nodes.filter((n) => n.state === "assumed").map((n) => ({ id: n.id, title: n.title, parent: n.parent })),
      };
      if (args.json) out(JSON.stringify(data, null, 2) + "\n");
      else {
        const section = (title: string, items: string[]) => out(`${title} (${items.length})\n${items.map((i) => `  ${i}`).join("\n")}${items.length ? "\n" : ""}\n`);
        section("Pending approvals", data.pending.map((p) => `${p.sha} ${p.subject} [${p.changes.length} changes]`));
        section("Unmerged intent changes", data.unmerged.map((p) => `${p.sha} ${p.subject} [${p.changes.length} changes]`));
        section("Uncommitted canon edits", data.uncommitted);
        section("Errors", data.errors);
        section("Contested", data.contested.map((n) => `${n.id} ${n.title}`));
        section("Open questions", data.open.map((n) => `${n.id} ${n.title}`));
        section("Decisions awaiting confirmation", data.unconfirmedDecisions.map((d) => `${d.id} ${d.title}`));
        section("Assumed requirements", data.assumed.map((n) => `${n.id} ${n.title}`));
      }
      return 0;
    }
    case "ui": {
      const { url } = await serveUi({ canonDir, port: args.port });
      out(`HeadCanon viewer at ${url}\nCanon: ${canonDir}\nPress Ctrl+C to stop.\n`);
      return await new Promise(() => {});
    }
    default:
      err(`Unknown command: ${args.command}\n\n${HELP}`);
      return 2;
  }
}

function dirnameOf(file: string): string {
  const abs = resolve(file);
  return abs.slice(0, Math.max(abs.lastIndexOf("/"), abs.lastIndexOf("\\")) || 1);
}

/** The work tree root for a directory, or undefined outside a repository (git hooks run at the root). */
function repoRootOf(dir: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

/** The canon directory as a git pathspec relative to the repository root. */
function canonPathspec(repoRoot: string, canonDir: string): string {
  const rel = relative(repoRoot, canonDir).split("\\").join("/");
  return rel && !rel.startsWith("..") ? rel : "canon";
}

// Run when invoked directly (node dist/cli.js, tsx src/cli.ts); bin/headcanon.js imports main instead.
const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entry && import.meta.url === entry) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    },
  );
}
