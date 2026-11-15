import type { Term } from "./types.js";

/**
 * The word lists the check runs over an entry's text (docs/research/2026-11-15-requirement-quality.md, section 8).
 * Closed classes the literature measured as precise enough to gate on are warnings, the rest notes; whole words,
 * case-insensitive, a trailing s or es forgiven; a word the glossary defines is never a hit, since a project may
 * give a suspect word a meaning of its own. A hit is a flag for the reviewer, who decides; the lists stay short on
 * purpose, because every false flag costs a correction round.
 */

export interface Family {
  /** The check code a hit is reported under; a review finding names it. */
  code: string;
  level: "warn" | "info";
  /** What the words do to a requirement, in one clause. */
  why: string;
  phrases: string[];
  /** Where the list comes from, with the precision the literature measured where it did. */
  sources: string;
  /** Only boxes of these layers are scanned; every layer when absent. */
  layers?: Array<"domain" | "capability" | "requirement">;
}

export const FAMILIES: Family[] = [
  {
    code: "subjective",
    level: "warn",
    why: "a judgement the reader cannot measure",
    phrases: ["user friendly", "user-friendly", "easy to use", "easy", "cost effective", "cost-effective", "simple", "efficient", "effective", "intuitive", "robust", "good", "bad", "proper", "suitable", "high-quality", "high quality", "adaptable", "extensible", "flexible", "fast", "quick", "reasonable", "readable", "considerable", "adequate", "appropriate", "state-of-the-art", "as possible", "better", "worse", "similar"],
    sources: "ISO 29148 5.2.7; Femmer 2017 F1, precision 0.96; Genova 2013; IEEE 830; Broccia 2024",
  },
  {
    code: "escape-clause",
    level: "warn",
    why: "a loophole that lets the obligation be skipped",
    phrases: ["if possible", "as far as possible", "where possible", "as much as possible", "as little as possible", "as appropriate", "if appropriate", "as applicable", "as required", "if required", "when required", "as necessary", "if necessary", "when necessary", "to the extent", "where feasible", "if practicable", "if practical", "optionally", "if needed"],
    sources: "ISO 29148 5.2.7; INCOSE GtWR R8; Femmer 2017 F3, precision 0.72; NASA ARM",
  },
  {
    code: "open-ended",
    level: "warn",
    why: "a set left open, so nothing bounds the obligation",
    phrases: ["including but not limited to", "but not limited to", "not limited to", "etc", "and so on", "as a minimum", "among others", "provide support", "provides support"],
    sources: "ISO 29148 5.2.7; INCOSE GtWR R9; Femmer 2017 F5, precision 0.70; Genova 2013",
  },
  {
    code: "vague",
    level: "warn",
    why: "a quantity or a quality left unmeasured",
    phrases: ["some", "several", "many", "few", "a lot of", "almost", "nearly", "approximately", "roughly", "usually", "generally", "typically", "normally", "often", "frequently", "sometimes", "rarely", "mostly", "significant", "significantly", "minimal", "sufficient", "sufficiently", "insufficient", "timely", "enough", "routine", "typical", "customary", "ancillary", "large", "small", "rapid", "rapidly", "quickly", "slowly", "soon"],
    sources: "ISO 29148 5.2.7; INCOSE GtWR R7; Femmer 2017 F2, precision 0.81; QuARS; RTEMS 5.1.4; Davis 1993",
  },
  {
    code: "placeholder",
    level: "warn",
    why: "a hole the author left to fill",
    phrases: ["tbd", "tbs", "tbr", "tbc", "tba", "todo", "fixme", "xxx", "???", "to be determined", "to be defined", "to be specified", "to be supplied", "to be decided", "to be completed"],
    sources: "ISO 29148 5.2.6; INCOSE GtWR C4; IEEE 830 4.3.3; Davis 1993",
  },
  {
    code: "hedge",
    level: "warn",
    why: "doubt written as prose; a doubtful entry is a draft, state open, with its question filed",
    phrases: ["probably", "possibly", "maybe", "perhaps", "might", "could", "presumably", "likely"],
    sources: "Berry, Kamsties and Krieger; Genova 2013; QuARS optionality",
  },
  {
    code: "purpose-clause",
    level: "warn",
    why: "a reason inside the entry; reasons live in decision records",
    phrases: ["in order to", "so that", "for the purpose of", "thus allowing", "because", "due to", "the reason"],
    sources: "INCOSE GtWR R20; Moreno 2020; the Entries rule",
  },
  {
    code: "and-or",
    level: "warn",
    why: "two readings in one connective",
    phrases: ["and/or"],
    sources: "ISO 29148 5.2.7; INCOSE GtWR R15; Berry, Kamsties and Krieger 7.4",
  },
  {
    code: "intent-modal",
    level: "info",
    why: "the Intent is indicative; the obligation is the slot, not a modal",
    phrases: ["shall", "should", "must", "ought to", "needs to", "we want"],
    sources: "Zave and Jackson 1997; Gleich 2010; the mood-by-slot resolution, research note 3.4",
  },
  {
    code: "comparative",
    level: "info",
    why: "a comparison or a superlative with no number to hold it to",
    phrases: ["best", "worst", "most", "least", "highest", "lowest", "fastest", "slowest", "greatest", "faster", "slower", "higher", "lower", "more", "less"],
    sources: "ISO 29148 5.2.7; Femmer 2017 F6 to F9, precision 0.49 and 0.48",
  },
  {
    code: "absolute",
    level: "info",
    why: "a universal that needs an enumerated set or an observation window",
    phrases: ["always", "never", "at all times", "24/7", "without restriction", "100%"],
    sources: "ISO 29148 5.2.7; INCOSE GtWR R26; Ferrari 2018",
  },
  {
    code: "vague-verb",
    level: "info",
    why: "a verb that names no observable action",
    phrases: ["support", "handle", "process", "manage", "track", "accommodate", "deal with"],
    sources: "INCOSE GtWR R3; Paska P9, precision 0.98 as the main verb; Berry, Kamsties and Krieger",
  },
  {
    code: "design-term",
    level: "info",
    why: "a mechanism in a box that names what, not how",
    phrases: ["button", "screen", "variable", "signal", "database", "table", "column", "api", "endpoint", "thread", "cache", "queue", "buffer", "framework", "library", "module", "class", "function"],
    sources: "Femmer 2017 T10; Genova 2013; Zave and Jackson machine-state pre-filter",
    layers: ["domain", "capability"],
  },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

const compiled = new Map<string, RegExp>();
function regexFor(f: Family): RegExp {
  let re = compiled.get(f.code);
  if (!re) {
    // longest phrase first so "easy to use" wins over "easy"; the boundary tolerates a trailing s or es
    const alts = [...f.phrases].sort((a, b) => b.length - a.length).map(escape).join("|");
    re = new RegExp(`(?<![A-Za-z0-9-])(?:${alts})(?:e?s)?(?![A-Za-z0-9-])`, "gi");
    compiled.set(f.code, re);
  }
  re.lastIndex = 0;
  return re;
}

export interface Hit {
  code: string;
  level: "warn" | "info";
  why: string;
  /** The distinct words found, as written. */
  words: string[];
}

/** Every family's hits in a text, a word the glossary defines left out. */
export function scanText(text: string, glossary: Term[] = [], layer?: "domain" | "capability" | "requirement"): Hit[] {
  const known = new Set(glossary.map((t) => t.term.toLowerCase()));
  const out: Hit[] = [];
  for (const f of FAMILIES) {
    if (f.layers && layer && !f.layers.includes(layer)) continue;
    const words = new Map<string, string>();
    for (const m of text.matchAll(regexFor(f))) {
      const w = m[0];
      const l = w.toLowerCase().replace(/(e?s)$/, "");
      if (known.has(w.toLowerCase()) || known.has(l)) continue;
      if (!words.has(l)) words.set(l, w);
    }
    if (words.size) out.push({ code: f.code, level: f.level, why: f.why, words: [...words.values()] });
  }
  return out;
}

/** Sentences of a passage, roughly: a terminal mark followed by a space and a capital, or the end. */
export function sentenceCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return (t.match(/[.!?](?=\s+[A-Z"(]|\s*$)/g) ?? []).length || 1;
}

/** A sentence that starts with a pronoun and a verb names nothing; the first such start, or undefined. */
export function pronounStart(text: string): string | undefined {
  return /(?:^|[.!?]\s+)((?:This|It|They|These|Those)\s+(?:is|are|was|were|has|have|means|does|do|will|can|must|should|holds|keeps))\b/.exec(text)?.[1];
}

/** A number that ends a clause names no unit and no thing; the first such number, or undefined. */
export function bareNumber(text: string): string | undefined {
  return /(?<![\w.])(\d+(?:\.\d+)?)(?=\s*(?:[.,;:)]|$))/m.exec(text)?.[1];
}
