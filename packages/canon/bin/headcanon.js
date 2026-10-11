#!/usr/bin/env node
// Launcher. Prefers the built CLI in dist/; in a source checkout without a build,
// falls back to running the TypeScript source through tsx.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/cli.js", import.meta.url);
const args = process.argv.slice(2);

if (existsSync(dist)) {
  const { main } = await import(dist.href);
  main(args).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    },
  );
} else {
  const src = new URL("../src/cli.ts", import.meta.url);
  const candidates = ["../node_modules/tsx/dist/cli.mjs", "../../../node_modules/tsx/dist/cli.mjs"].map((p) => new URL(p, import.meta.url));
  const tsx = candidates.find((u) => existsSync(u));
  if (!tsx) {
    console.error("HeadCanon CLI is not built and tsx is not installed. Run `npm install && npm run build` in the headcanon repository.");
    process.exit(2);
  }
  const r = spawnSync(process.execPath, [fileURLToPath(tsx), fileURLToPath(src), ...args], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
