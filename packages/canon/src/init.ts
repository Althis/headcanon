import { FORMAT_VERSION } from "./format.js";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface InitOptions {
  /** The project directory (a git repository). */
  repoDir: string;
  /** Canon directory, relative to the repo or absolute. Default: canon. */
  canonDir?: string;
  /** Absolute path of the headcanon launcher the git hook should run. */
  cliPath: string;
  /** Replace a commit-msg hook that HeadCanon did not install. */
  force?: boolean;
}

export interface InitResult {
  canonDir: string;
  created: string[];
  hookPath: string | undefined;
  hookInstalled: boolean;
  notes: string[];
}

const HOOK_MARK = "# headcanon-commit-msg";
const rel = (from: string, to: string) => relative(from, to).split("\\").join("/");

export function rootReadme(projectName: string, today: string): string {
  return `---
id: ROOT
title: "${projectName.replace(/"/g, "'")} canon"
state: open
source: "headcanon init, ${today}"
format: ${FORMAT_VERSION}
---

# ${projectName} canon

This folder is HeadCanon's record of intent for ${projectName}: the
requirement tree, user journeys, glossary and decision records, in files that
the agent reads every session and that GitHub renders as they are.

It was created empty by \`headcanon init\` on ${today}. Nothing in it is the
human's intent yet. The agent fills it through change requests the human
approves, starting with the purpose and glossary in the human's own words.

## Purpose [open]

Not yet stated.

## Not this [open]

Not yet stated.

## Glossary [open]

No terms yet. A term enters as assumed when the agent infers it and as stated
when the human defines it. A definition says what the term is, as a dictionary
entry does, and covers one concept. Format: \`**term** (\`TERM-slug\`): definition\`.
`;
}

/** Create the canon skeleton and install the commit-msg hook. Idempotent. */
export function initCanon(opts: InitOptions): InitResult {
  const repoDir = resolve(opts.repoDir);
  const canonDir = resolve(repoDir, opts.canonDir ?? "canon");
  const created: string[] = [];
  const notes: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const projectName = readProjectName(repoDir);

  if (!existsSync(canonDir)) {
    mkdirSync(canonDir, { recursive: true });
    created.push(rel(repoDir, canonDir));
  }
  const readme = join(canonDir, "README.md");
  if (!existsSync(readme)) {
    writeFileSync(readme, rootReadme(projectName, today));
    created.push(rel(repoDir, readme));
  } else {
    notes.push(`${rel(repoDir, readme)} already exists; left as is`);
  }
  for (const sub of ["journeys", "decisions"]) {
    const d = join(canonDir, sub);
    if (!existsSync(d)) {
      mkdirSync(d);
      writeFileSync(join(d, ".gitkeep"), "");
      created.push(rel(repoDir, join(d, ".gitkeep")));
    }
  }

  let hookPath: string | undefined;
  let hookInstalled = false;
  try {
    const hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: repoDir, encoding: "utf8" }).trim();
    hookPath = resolve(repoDir, hooksDir, "commit-msg");
    const script = hookScript(opts.cliPath, canonDir, repoDir);
    if (existsSync(hookPath)) {
      const current = readFileSync(hookPath, "utf8");
      if (current.includes(HOOK_MARK)) {
        if (current !== script) {
          writeFileSync(hookPath, script);
          notes.push("updated the HeadCanon commit-msg hook");
        } else notes.push("commit-msg hook already installed");
        hookInstalled = true;
      } else if (opts.force) {
        writeFileSync(hookPath + ".before-headcanon", current);
        writeFileSync(hookPath, script);
        notes.push(`replaced an existing commit-msg hook; the old one is saved as ${hookPath}.before-headcanon`);
        hookInstalled = true;
      } else {
        notes.push(`a commit-msg hook that HeadCanon did not install exists at ${hookPath}; rerun with --force to replace it (the old one is kept as a backup)`);
      }
    } else {
      mkdirSync(resolve(repoDir, hooksDir), { recursive: true });
      writeFileSync(hookPath, script);
      hookInstalled = true;
      created.push(rel(repoDir, hookPath));
    }
    if (hookInstalled) {
      try {
        chmodSync(hookPath, 0o755);
      } catch {
        /* Windows */
      }
    }
  } catch (e) {
    notes.push(`not a git repository, so no commit-msg hook was installed (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
  }

  return { canonDir, created, hookPath, hookInstalled, notes };
}

/**
 * The hook finds the canon, and a launcher that lives inside the repository, from the repository the
 * commit happens in, so a linked worktree or a moved checkout validates against its own canon.
 */
function hookScript(cliPath: string, canonDir: string, repoDir: string): string {
  const posix = (p: string) => resolve(p).replace(/\\/g, "/");
  const top = posix(repoDir);
  const inside = (p: string): string | undefined => {
    const abs = posix(p);
    return abs.toLowerCase().startsWith(top.toLowerCase() + "/") ? abs.slice(top.length + 1) : undefined;
  };
  const arg = (p: string) => {
    const r = inside(p);
    return r ? `"$TOP/${r}"` : `"${posix(p)}"`;
  };
  return `#!/bin/sh
${HOOK_MARK}
# Installed by HeadCanon. Validates the commit message against the canon:
# Conventional Commits header, an Intent trailer, and Approved-By on intent changes.
# Paths are taken from the repository the commit happens in, so a worktree checks its own canon.
# Reinstall with: headcanon init --force
TOP="$(git rev-parse --show-toplevel)"
exec node ${arg(cliPath)} commit-msg "$1" --canon ${arg(canonDir)}
`;
}

function readProjectName(repoDir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8")) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    /* no package.json */
  }
  return repoDir.split(/[\\/]/).filter(Boolean).pop() ?? "project";
}
