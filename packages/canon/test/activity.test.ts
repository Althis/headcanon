import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../src/index.js";

describe("what is being cut, from the disk: the premise [DEC-024]", () => {
  it("names ROOT while the root README was just written, and not once it has gone quiet", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "headcanon-activity-root-")), "canon");
    mkdirSync(dir, { recursive: true });
    const readme = join(dir, "README.md");
    writeFileSync(readme, '---\nid: ROOT\ntitle: "Activity canon"\nstate: assumed\n---\n\n# Activity canon\n');
    const fresh = buildSnapshot(dir);
    expect(fresh.activity["ROOT"]).toBeGreaterThanOrEqual(0);
    expect(fresh.activity["ROOT"]).toBeLessThanOrEqual(5);
    const tenMinutesAgo = Date.now() / 1000 - 600;
    utimesSync(readme, tenMinutesAgo, tenMinutesAgo);
    const quiet = buildSnapshot(dir);
    expect(quiet.activity).not.toHaveProperty("ROOT");
  });
});
