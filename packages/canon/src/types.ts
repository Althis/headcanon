export type State = "stated" | "assumed" | "open" | "contested" | "resolved";

export const STATES: readonly State[] = ["stated", "assumed", "open", "contested", "resolved"];

export function isState(v: unknown): v is State {
  return typeof v === "string" && (STATES as readonly string[]).includes(v);
}

export interface Section {
  heading: string;
  /** A bracketed marker on the heading, e.g. `## Not this [assumed]`. */
  marker: State | undefined;
}

export interface ReqNode {
  id: string;
  parent: string | undefined;
  title: string;
  state: State;
  kind: string | undefined;
  source: string | undefined;
  steps: string[];
  files: string[];
  baseline: string | undefined;
  /** Path relative to the canon directory. */
  file: string;
  body: string;
  sections: Section[];
  children: string[];
  depth: number;
}

export interface JourneyStep {
  id: string;
  label: string;
  state: State;
  requirements: string[];
}

export interface Journey {
  id: string;
  title: string;
  state: State;
  source: string | undefined;
  file: string;
  body: string;
  mermaid: string | undefined;
  steps: JourneyStep[];
}

export interface Decision {
  id: string;
  title: string;
  state: State;
  date: string | undefined;
  intents: string[];
  origin: string | undefined;
  file: string;
  body: string;
}

export interface Term {
  id: string;
  term: string;
  definition: string;
}

export interface CanonRoot {
  title: string;
  state: State;
  file: string;
  body: string;
}

export interface Canon {
  /** Absolute canon directory. */
  dir: string;
  root: CanonRoot | undefined;
  nodes: Record<string, ReqNode>;
  /** Top-level requirement IDs in order. */
  roots: string[];
  journeys: Journey[];
  decisions: Decision[];
  terms: Term[];
  /** Markdown files that carried no usable id. */
  unparsed: string[];
  /** IDs seen more than once, with the files that claimed them. */
  duplicates: Record<string, string[]>;
}

export type Level = "error" | "warn" | "info";

export interface Finding {
  level: Level;
  code: string;
  message: string;
  /** The canon object the finding is about, when there is one. */
  id: string | undefined;
  file: string | undefined;
  /** Top-level requirement the finding falls under, when there is one. */
  branch: string | undefined;
}
