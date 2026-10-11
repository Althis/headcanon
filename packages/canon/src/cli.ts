import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSnapshot } from "./snapshot.js";
import { serveUi } from "./ui/server.js";

const HELP = `headcanon <command> [options]

Commands
  check      Validate the canon: structure, links, files and states that need a human. Exit 1 on errors.
  summary    Print the requirement tree as plain text.
  ui         Serve the local viewer.

Options
  --canon <dir>   Canon directory (default: ./canon)
  --port <n>      Port for ui (default: 4317)
  --json          For check: print findings as JSON
`;

interface Args {
  command: string | undefined;
  canon: string;
  port: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { command: undefined, canon: "canon", port: 4317, json: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    if (x === "--canon") a.canon = argv[++i] ?? a.canon;
    else if (x.startsWith("--canon=")) a.canon = x.slice(8);
    else if (x === "--port") a.port = Number(argv[++i] ?? a.port);
    else if (x.startsWith("--port=")) a.port = Number(x.slice(7));
    else if (x === "--json") a.json = true;
    else if (!x.startsWith("-") && !a.command) a.command = x;
  }
  return a;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.command || args.command === "help" || argv.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  const canonDir = resolve(args.canon);
  if (!existsSync(canonDir)) {
    process.stderr.write(`No canon at ${canonDir}. Pass --canon <dir>.\n`);
    return 2;
  }

  switch (args.command) {
    case "check": {
      const snap = buildSnapshot(canonDir);
      if (args.json) {
        process.stdout.write(JSON.stringify(snap.findings, null, 2) + "\n");
      } else {
        for (const f of snap.findings) process.stdout.write(`${f.level.padEnd(5)} ${f.code.padEnd(20)} ${f.message}\n`);
        const { errors, warnings, infos, nodes } = snap.stats;
        process.stdout.write(`\n${nodes} requirements, ${errors} errors, ${warnings} warnings, ${infos} notes\n`);
      }
      return snap.stats.errors > 0 ? 1 : 0;
    }
    case "summary": {
      process.stdout.write(buildSnapshot(canonDir).textTree + "\n");
      return 0;
    }
    case "ui": {
      const { url } = await serveUi({ canonDir, port: args.port });
      process.stdout.write(`HeadCanon viewer at ${url}\nCanon: ${canonDir}\nPress Ctrl+C to stop.\n`);
      return await new Promise(() => {});
    }
    default:
      process.stderr.write(`Unknown command: ${args.command}\n\n${HELP}`);
      return 2;
  }
}

// Run when invoked directly (node dist/cli.js, tsx src/cli.ts); bin/headcanon.js imports main instead.
const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entry && import.meta.url === entry) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    },
  );
}
