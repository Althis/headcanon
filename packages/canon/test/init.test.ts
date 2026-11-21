import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FORMAT_VERSION, canonFormatVersion, checkCanon, initCanon, loadCanon, parseSections, rootReadme } from "../src/index.js";

describe("init [REQ-8.5, REQ-11.1]", () => {
  let repo: string;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "headcanon-init-"));
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "valley-app" }));
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("creates the skeleton and installs the commit-msg hook", () => {
    const r = initCanon({ repoDir: repo, cliPath: "C:/some where/bin/headcanon.js" });
    expect(r.created).toContain("canon/README.md");
    expect(r.hookInstalled).toBe(true);
    const hook = readFileSync(r.hookPath!, "utf8");
    expect(hook).toContain("# headcanon-commit-msg");
    expect(hook).toContain('node "C:/some where/bin/headcanon.js" commit-msg "$1" --canon "$TOP/canon"');
    expect(hook).toContain('TOP="$(git rev-parse --show-toplevel)"');
    const canon = loadCanon(r.canonDir);
    expect(canon.root?.title).toBe("valley-app canon");
    expect(canon.root?.state).toBe("draft");
    expect(existsSync(join(r.canonDir, "journeys"))).toBe(true);
  });

  it("writes the skeleton in the current format: a draft premise, no section marked open, nothing the check refuses", () => {
    const text = readFileSync(join(repo, "canon", "README.md"), "utf8");
    expect(text).toBe(rootReadme("valley-app", new Date().toISOString().slice(0, 10)));
    expect(text).toContain("\nstate: draft\n");
    expect(text).toContain(`\nformat: ${FORMAT_VERSION}\n`);
    expect(text).not.toMatch(/\[open\]|^state:\s*open/m);
    const canon = loadCanon(join(repo, "canon"));
    expect(canonFormatVersion(canon)).toBe(FORMAT_VERSION);
    // the premise's sections by the names the format gives them; only the glossary carries a marker, the default for its terms
    expect(parseSections(canon.root?.body ?? "").map((s) => `${s.heading}${s.marker ? ` [${s.marker}]` : ""}`)).toEqual(["Intent", "Not this", "Glossary [assumed]"]);
    expect(canon.terms).toEqual([]);
    expect(checkCanon(canon).filter((f) => f.level !== "info")).toEqual([]);
  });

  it("addresses a launcher inside the repository through the repository root, so a worktree's commit runs its own copy", () => {
    const r = initCanon({ repoDir: repo, cliPath: join(repo, "packages/canon/bin/headcanon.js"), force: true });
    const hook = readFileSync(r.hookPath!, "utf8");
    expect(hook).toContain('node "$TOP/packages/canon/bin/headcanon.js" commit-msg "$1" --canon "$TOP/canon"');
  });

  it("is idempotent and refuses to replace a foreign hook without --force", () => {
    const again = initCanon({ repoDir: repo, cliPath: "C:/some where/bin/headcanon.js" });
    expect(again.created).toEqual([]);
    expect(again.notes.join("\n")).toMatch(/already/);

    writeFileSync(again.hookPath!, "#!/bin/sh\necho someone else\n");
    const refused = initCanon({ repoDir: repo, cliPath: "x" });
    expect(refused.hookInstalled).toBe(false);
    expect(refused.notes.join("\n")).toMatch(/--force/);
    const forced = initCanon({ repoDir: repo, cliPath: "x", force: true });
    expect(forced.hookInstalled).toBe(true);
    expect(existsSync(forced.hookPath! + ".before-headcanon")).toBe(true);
  });
});
