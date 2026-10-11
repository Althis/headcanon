import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Writes a glossary entry into the root README's Glossary section (REQ-12.1.6). */

export function termId(term: string): string {
  return `TERM-${term.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export interface GlossaryWrite {
  id: string;
  file: string;
  created: boolean;
}

export function addGlossaryTerm(canonDir: string, term: string, definition: string): GlossaryWrite {
  const file = join(canonDir, "README.md");
  const id = termId(term);
  const line = `**${term.trim()}** (\`${id}\`): ${definition.trim().replace(/\s+/g, " ")}`;
  let text = existsSync(file) ? readFileSync(file, "utf8") : `---\nid: ROOT\ntitle: "Canon"\nstate: open\n---\n\n# Canon\n`;
  const lines = text.split(/\r?\n/);

  const existing = lines.findIndex((l) => new RegExp(`^\\*\\*${escapeRegExp(term.trim())}\\*\\*\\s*\\(`, "i").test(l));
  if (existing >= 0) {
    lines[existing] = line;
    writeFileSync(file, lines.join("\n"));
    return { id, file, created: false };
  }

  const head = lines.findIndex((l) => /^##\s+Glossary\b/.test(l));
  if (head < 0) {
    text = text.replace(/\s*$/, "\n") + `\n## Glossary [assumed]\n\n${line}\n`;
    writeFileSync(file, text);
    return { id, file, created: true };
  }
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  // Insert before the trailing blank lines of the section.
  let at = end;
  while (at > head + 1 && (lines[at - 1] ?? "").trim() === "") at--;
  lines.splice(at, 0, "", line);
  writeFileSync(file, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  return { id, file, created: true };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
