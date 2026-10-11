import YAML from "yaml";
import { isState, type JourneyStep, type Section, type State, type Term } from "./types.js";

export interface Parsed {
  data: Record<string, unknown>;
  body: string;
}

/** Split a Markdown file into YAML front-matter and body. Files without front-matter yield empty data. */
export function parseFrontMatter(text: string): Parsed {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  const raw = YAML.parse(m[1] ?? "");
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { data, body: m[2] ?? "" };
}

/** `## Heading [marker]` lines. The marker, when present, must be a certainty state. */
export function parseSections(body: string): Section[] {
  const out: Section[] = [];
  const re = /^##\s+(.+?)(?:\s*\[([a-z]+)\])?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const marker = m[2];
    out.push({ heading: (m[1] ?? "").trim(), marker: isState(marker) ? marker : undefined });
  }
  return out;
}

export function parseMermaid(body: string): string | undefined {
  const m = /```mermaid\r?\n([\s\S]*?)```/.exec(body);
  return m?.[1]?.trim();
}

/**
 * Journey step table: `| S1 Label | state | REQ-1, REQ-2 |`.
 * The brief's shape has two columns (step, requirements); a middle state column is optional.
 */
export function parseStepTable(body: string): JourneyStep[] {
  const steps: JourneyStep[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const first = cells[0] ?? "";
    const idm = /^(S\d+)\b\s*(.*)$/.exec(first);
    if (!idm) continue;
    const id = idm[1] ?? "";
    const label = (idm[2] ?? "").trim();
    let state: State = "assumed";
    let reqCell = "";
    if (cells.length >= 3) {
      const mid = cells[1] ?? "";
      if (isState(mid)) state = mid;
      reqCell = cells[2] ?? "";
    } else {
      reqCell = cells[1] ?? "";
    }
    const requirements = reqCell
      .split(",")
      .map((s) => s.trim())
      .map((s) => /^([A-Z]+-[\d.]+)/.exec(s)?.[1] ?? "")
      .filter(Boolean);
    steps.push({ id, label, state, requirements });
  }
  return steps;
}

/** Glossary lines of the form: **term** (`TERM-slug`): definition */
export function parseGlossary(body: string): Term[] {
  const terms: Term[] = [];
  const re = /^\*\*(.+?)\*\*\s*\(`(TERM-[^`]+)`\)\s*[:—-]\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    terms.push({ term: m[1] ?? "", id: m[2] ?? "", definition: (m[3] ?? "").trim() });
  }
  return terms;
}

/** Front-matter lists may be YAML arrays or comma-separated strings. */
export function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}
