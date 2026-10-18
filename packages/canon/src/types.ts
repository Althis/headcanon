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

/** The three layers of the tree (REQ-6.7). One node type; the layer is a field, not an entity. */
export type Layer = "domain" | "capability" | "requirement";

export const LAYERS: readonly Layer[] = ["domain", "capability", "requirement"];

export function isLayer(v: unknown): v is Layer {
  return typeof v === "string" && (LAYERS as readonly string[]).includes(v);
}

/** A principle from the root README: `**PRN-n Title**` followed by its paragraph. */
export interface Principle {
  id: string;
  title: string;
  statement: string;
  source: string | undefined;
}

export interface ReqNode {
  id: string;
  parent: string | undefined;
  title: string;
  state: State;
  kind: string | undefined;
  /** From the `layer` field when present; otherwise inferred from depth and marked as such. */
  layer: Layer;
  layerExplicit: boolean;
  source: string | undefined;
  /** The question this node's children answer (REQ-3.14), written by refine when it cuts the node. */
  partition: string | undefined;
  /** Typed links to other nodes (DEC-014): what this bears on, what it pulls against, and whose concepts its definition uses (REQ-3.15). */
  relates: string[];
  conflicts: string[];
  requires: string[];
  steps: string[];
  /** Mock elements this node is seen in, written `MOCK-1#finish` (REQ-6.8). */
  mocks: string[];
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

/** One named part of a mock's picture (REQ-6.8): the `id` of a group in the SVG and the requirements it carries. */
export interface MockElement {
  id: string;
  label: string;
  state: State;
  requirements: string[];
}

/** A mock: a picture of one thing a person will see, and the table that binds its elements to requirements (REQ-6.8). */
export interface Mock {
  id: string;
  title: string;
  state: State;
  source: string | undefined;
  /** The picture, relative to the canon directory; the record's stem with `.svg` unless `image` says otherwise. */
  image: string;
  file: string;
  body: string;
  elements: MockElement[];
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
  /** The question the top-level nodes answer, when refine has cut the premise. */
  partition: string | undefined;
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
  mocks: Mock[];
  decisions: Decision[];
  terms: Term[];
  principles: Principle[];
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
