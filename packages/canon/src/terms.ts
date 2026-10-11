import type { Term } from "./types.js";

/**
 * Candidate jargon in a draft (REQ-12.1.6): code-formatted tokens, short quoted phrases,
 * capitalized words away from a sentence start, and camel or snake case tokens, minus what the
 * glossary defines. A heuristic: it finds the words the gate must ask about; it does not judge them.
 */

const COMMON = new Set(
  "I A An The This That These Those It If When Where Which What Who How Why And But Or For In On At To Of With From By As Is Are Was Were Be Not No Yes Step Draft Source Sources Approve Drop Other Premise Principle Principles Domain Domains Capability Capabilities Requirement Requirements Leftovers Tick Every Each Some All Any One Two Three Then So Here There Also Only Both Either Neither Because While After Before Until Since Although However Still Yet Merged Text Select Selected Unticked Keep Change Rewrite Nothing Missing Ask Later Intent Stated Resolved Assumed Open Contested Resolution Not Glossary Journeys Decisions"
    .split(/\s+/),
);

const strip = (w: string) => w.replace(/^[("'\[]+|[)"'\],.;:!?]+$/g, "");
const isCap = (w: string) => /^[A-Z][a-zA-Z0-9-]+$/.test(w) && !COMMON.has(w);

export function detectTerms(text: string, glossary: Term[] = []): string[] {
  const known = new Set(glossary.map((t) => t.term.toLowerCase()));
  const found = new Map<string, string>();
  const add = (raw: string) => {
    const c = raw.trim().replace(/[.,;:]+$/, "");
    if (c.length < 2 || c.length > 60) return;
    const l = c.toLowerCase();
    if (known.has(l) || known.has(l.replace(/s$/, "")) || known.has(l.replace(/ies$/, "y"))) return;
    if (/^(REQ|JRN|DEC|PRN|TERM|DS)-/.test(c) || /^\[\d+\]$/.test(c)) return;
    if (!found.has(l)) found.set(l, c);
  };

  for (const m of text.matchAll(/`([^`\n]{2,40})`/g)) add(m[1] ?? "");
  for (const m of text.matchAll(/"([^"\n]{2,40})"/g)) if ((m[1] ?? "").split(/\s+/).length <= 4) add(m[1] ?? "");

  for (const sentence of text.split(/(?<=[.!?:])\s+|\n+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    for (let i = 1; i < words.length; i++) {
      const w = strip(words[i] ?? "");
      if (!isCap(w)) continue;
      const seq = [w];
      let j = i;
      while (j + 1 < words.length) {
        const n = strip(words[j + 1] ?? "");
        if (!isCap(n)) break;
        seq.push(n);
        j++;
      }
      add(seq.join(" "));
      i = j;
    }
    for (const raw of words) {
      const c = strip(raw);
      if (/^[a-z]+[A-Z][A-Za-z0-9]+$/.test(c) || /^[a-z]+_[a-z_]+$/.test(c)) add(c);
    }
  }
  return [...found.values()];
}
