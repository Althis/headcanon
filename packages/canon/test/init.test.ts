import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initCanon, loadCanon } from "../src/index.js";

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
    expect(hook).toContain('node "C:/some where/bin/headcanon.js" commit-msg "$1"');
    const canon = loadCanon(r.canonDir);
    expect(canon.root?.title).toBe("valley-app canon");
    expect(canon.root?.state).toBe("open");
    expect(existsSync(join(r.canonDir, "journeys"))).toBe(true);
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
