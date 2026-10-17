/**
 * Text-level edits to a node file, used by the viewer when the human approves, rewrites or
 * retitles a node in the page (REQ-12.1.8). They work on the Markdown as written so that
 * everything the file already holds survives: only the named field or section changes.
 */

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Set one front-matter scalar, adding the line when it is missing. */
export function setField(text: string, key: string, value: string): string {
  const m = FM.exec(text);
  if (!m) return `---\n${key}: ${value}\n---\n\n${text}`;
  const lines = m[1]!.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i >= 0) lines[i] = `${key}: ${value}`;
  else lines.push(`${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n` + text.slice(m[0].length);
}

/** Replace the body of one `## Heading` section, or append the section when it is missing. */
export function upsertSection(text: string, heading: string, body: string): string {
  const re = new RegExp(`^(##[ \\t]+${heading}\\b[^\\n]*)\\n([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, "m");
  if (re.test(text)) return text.replace(re, (_m, head: string) => `${head}\n\n${body.trim()}\n\n`);
  return text.replace(/\s*$/, "\n\n") + `## ${heading}\n\n${body.trim()}\n`;
}

/** Drop a `[state]` marker from every section heading. */
export function clearMarkers(text: string): string {
  return text.replace(/^(##[ \t]+[^\n\[]+?)[ \t]*\[(stated|assumed|open|contested|resolved)\][ \t]*$/gm, "$1");
}

/** The human approved the node as it stands: resolved unless it was their own words already. */
export function approveNode(text: string, date: string): string {
  const state = /^state:\s*stated\s*$/m.test(text.split(/\r?\n---/)[0] ?? "") ? "stated" : "resolved";
  return upsertSection(clearMarkers(setField(text, "state", state)), "Resolution", `Approved in the viewer, ${date}.`);
}

/**
 * The human rewrote the node in their own words: the title, and the text that becomes both the
 * verbatim quote and the entry. Their wording is stated.
 */
export function editNode(text: string, edit: { title?: string | undefined; intent: string }, date: string): string {
  let out = setField(text, "state", "stated");
  if (edit.title) {
    out = setField(out, "title", `"${edit.title.replace(/"/g, "'")}"`);
    out = out.replace(/^#\s+.+$/m, `# ${edit.title}`);
  }
  out = clearMarkers(out);
  out = upsertSection(out, "Stated", `> ${edit.intent.trim().replace(/\n+/g, "\n> ")}\n\nSource: typed by the human in the viewer, ${date}`);
  out = upsertSection(out, "Intent", edit.intent.trim());
  return out;
}
