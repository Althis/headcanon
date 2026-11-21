import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The state the viewer keeps for a Claude Code session working through the page (REQ-12.1.7):
 * questions the session asked and the user has not answered, the node the session wants on
 * screen, and a feed of what the user did in the page that the session has not read yet.
 * One instance lives in the HTTP server process; the MCP process reaches it over HTTP.
 */

export interface AskOption {
  label: string;
  description?: string;
}

export interface TermGuess {
  term: string;
  definition: string;
}

/**
 * An issue is an explicit request for help. A question; a contradiction to settle; the three other kinds the glossary
 * names (a disambiguation: a word that does not read one way; an apocrypha: wording that fails the quality tests; an
 * undefined: nothing in the evidence decides it); or a node an implementation agent could not make pass (impossible).
 */
export type IssueKind = "question" | "contradiction" | "disambiguation" | "apocrypha" | "undefined" | "impossible";

const ISSUE_KINDS: readonly IssueKind[] = ["question", "contradiction", "disambiguation", "apocrypha", "undefined", "impossible"];
const kindOf = (v: unknown): IssueKind => (ISSUE_KINDS.includes(v as IssueKind) ? (v as IssueKind) : "question");
const HEADERS: Record<IssueKind, string> = { question: "Question", contradiction: "Contradiction", disambiguation: "Unclear word", apocrypha: "Wording at fault", undefined: "Nothing decides it", impossible: "Could not be built" };
const authorOf = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);

export interface AskRequest {
  question: string;
  /** What kind of issue this is; a contradiction's statements come from the node's Contested section. */
  kind?: IssueKind;
  /** Who files it, by the name it works under (`implementer-REQ-2.1`); none is the session itself. */
  by?: string;
  /** True when the node cannot be built until the user settles this. */
  blocks?: boolean;
  /** Why it matters, in one or two sentences, shown as the issue's summary. */
  why?: string;
  header?: string;
  options?: AskOption[];
  multiSelect?: boolean;
  nodeId?: string;
  terms?: TermGuess[];
  /** Something the user must know that is not part of the draft, shown apart from the question. */
  notice?: string;
}

export interface TermDecision {
  term: string;
  decision: "keep" | "drop";
  definition?: string;
  replacement?: string;
}

export interface AskAnswer {
  questionId: string;
  selected: string[];
  other: string;
  terms: TermDecision[];
  answeredAt: string;
}

export interface PendingQuestion {
  id: string;
  askedAt: string;
  kind: IssueKind;
  why: string | undefined;
  question: string;
  header: string;
  options: AskOption[];
  multiSelect: boolean;
  nodeId: string | undefined;
  terms: TermGuess[];
  notice: string | undefined;
  by?: string;
  blocks?: boolean;
}

/** A question as the store holds it. Another process may have written it with fewer fields; one without an id or a text is dropped. */
function fromStore(raw: unknown): PendingQuestion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<PendingQuestion>;
  if (typeof r.id !== "string" || typeof r.question !== "string") return undefined;
  const kind = kindOf(r.kind), by = authorOf(r.by);
  return {
    id: r.id,
    askedAt: typeof r.askedAt === "string" ? r.askedAt : new Date().toISOString(),
    kind,
    why: typeof r.why === "string" ? r.why : undefined,
    question: r.question,
    header: typeof r.header === "string" ? r.header : HEADERS[kind],
    options: Array.isArray(r.options) ? r.options : [],
    multiSelect: r.multiSelect === true,
    nodeId: typeof r.nodeId === "string" ? r.nodeId : undefined,
    terms: Array.isArray(r.terms) ? r.terms : [],
    notice: typeof r.notice === "string" ? r.notice : undefined,
    ...(by ? { by } : {}),
    ...(r.blocks === true ? { blocks: true } : {}),
  };
}
const queueFrom = (saved: { queue?: unknown }): PendingQuestion[] | undefined =>
  Array.isArray(saved?.queue) ? saved.queue.map(fromStore).filter((q): q is PendingQuestion => q !== undefined) : undefined;

export type FeedKind =
  | "answer"
  | "question-superseded"
  | "message"
  | "edit-conflict"
  | "say"
  | "refine-request"
  | "finish-request"
  | "node-edited"
  | "node-created"
  | "node-approved"
  | "node-deleted"
  | "term-enshrined"
  | "term-dropped"
  | "onboarding"
  | "principles-approved"
  | "terminal"
  | "revert"
  | "implement-request"
  | "run-stop"
  | "run-continue"
  | "slice-approved"
  | "slice-discarded"
  | "slice-sent-back";

/** The kinds the session itself puts in the feed: its says, the terminal mirror of its words, the questions it withdrew. */
export const SESSION_MADE_KINDS: ReadonlySet<FeedKind> = new Set<FeedKind>(["say", "terminal", "question-superseded"]);
/** True for an entry the user made on the page: the only kind that should wake a waiting session. */
export const isUserEntry = (e: FeedEntry): boolean => !SESSION_MADE_KINDS.has(e.kind);

export interface FeedEntry {
  /** A say meant for the onboarding card rather than the chat. */
  intro?: boolean | undefined;
  /** A say that needs the user now, to act or to answer: the only say the page chimes for. */
  attention?: boolean | undefined;
  /** Who spoke, on a `terminal` entry: user or session. */
  role?: string | undefined;
  /** The onboarding's choices, on an `onboarding` entry. */
  mode?: string | undefined;
  cap?: string | undefined;
  seq: number;
  at: string;
  kind: FeedKind;
  id?: string;
  text?: string;
  path?: string;
  /** On a message: the passage the user highlighted in a node's card before writing. */
  quote?: string;
  /** On a say: "user" when the line asks something of them; otherwise it is a report for the history. */
  to?: string;
  /** On an answer: who filed the issue, and whether it held its node back from being built. */
  by?: string;
  blocks?: boolean;
}

export const DEFAULT_OPTIONS: AskOption[] = [
  { label: "Approve as written", description: "Enters as resolved." },
  { label: "Drop", description: "Left out." },
];

export class SessionState {
  /** Where the queue is kept between processes, when the viewer runs inside a repository. */
  private store: string | undefined;
  private queue: PendingQuestion[] = [];
  private answers = new Map<string, AskAnswer>();
  private waiters = new Map<string, Array<(a: AskAnswer) => void>>();
  private feed: FeedEntry[] = [];
  private seq = 0;
  private focusId: string | undefined;
  private focusSeq = 0;
  private focusOpen = false;
  private changeWaiters: Array<() => void> = [];

  constructor(store?: string) {
    this.store = store;
    // questions outlive the process: a session restarted mid-adoption shows the same issues
    if (store && existsSync(store)) {
      try {
        this.queue = queueFrom(JSON.parse(readFileSync(store, "utf8")) as { queue?: unknown }) ?? [];
      } catch { /* a bad file is an empty queue */ }
    }
  }

  private save(): void {
    if (!this.store) return;
    try { mkdirSync(dirname(this.store), { recursive: true }); writeFileSync(this.store, JSON.stringify({ queue: this.queue }, null, 2)); this.storeSeen = statSync(this.store).mtimeMs; } catch { /* the page works without the file */ }
  }

  private storeSeen = 0;

  /**
   * Another process may rewrite the store: an operation that moves or merges nodes renames the node ids of their
   * questions (`headcanon op`). The queue follows the file when it changed since this process last wrote it; every
   * method that reads or writes the queue refreshes first, so a stale queue never overwrites what an operation wrote.
   */
  refresh(): void {
    if (!this.store || !existsSync(this.store)) return;
    try {
      const mtime = statSync(this.store).mtimeMs;
      if (mtime === this.storeSeen) return;
      const saved = queueFrom(JSON.parse(readFileSync(this.store, "utf8")) as { queue?: unknown });
      if (saved) {
        const byId = new Map(saved.map((q) => [q.id, q]));
        // only ids and node ids come from the file; a question this process answered meanwhile stays answered
        this.queue = this.queue.filter((q) => byId.has(q.id)).map((q) => ({ ...q, nodeId: byId.get(q.id)!.nodeId }));
        for (const q of saved) if (!this.queue.some((x) => x.id === q.id) && !this.answers.has(q.id)) this.queue.push(q);
      }
      this.storeSeen = mtime;
    } catch { /* a torn file is read next time */ }
  }

  /** Queue a question. The head of the queue is what the page shows. */
  ask(req: AskRequest): PendingQuestion {
    // the file first: an operation may have renamed the node ids of the questions queued here
    this.refresh();
    const kind = kindOf(req.kind), by = authorOf(req.by);
    const q: PendingQuestion = {
      id: randomUUID().slice(0, 8),
      askedAt: new Date().toISOString(),
      kind,
      why: req.why,
      question: req.question,
      header: req.header ?? HEADERS[kind],
      // a contradiction's choices are the node's statements, read by the page; the default pair is for drafts; a node
      // that could not be built has only the choices its agent names
      options: kind === "question" ? (req.options && req.options.length ? req.options : DEFAULT_OPTIONS) : req.options ?? [],
      multiSelect: req.multiSelect ?? false,
      nodeId: req.nodeId,
      terms: req.terms ?? [],
      notice: req.notice,
      ...(by ? { by } : {}),
      ...(req.blocks === true ? { blocks: true } : {}),
    };
    // one question per node and author: a newer one replaces the one its own author left pending, never another's
    if (q.nodeId) this.supersede(q.nodeId, "a newer question on the same node", (x) => x.by === q.by);
    this.queue.push(q);
    this.save();
    return q;
  }

  /**
   * Withdraw the pending questions on a node: the user rewrote or deleted it, or a newer question replaced it.
   * `only` narrows it to some of them, such as one author's.
   */
  supersede(nodeId: string, reason: string, only: (q: PendingQuestion) => boolean = () => true): number {
    this.refresh();
    const stale = this.queue.filter((q) => q.nodeId === nodeId && only(q));
    for (const q of stale) {
      this.queue.splice(this.queue.indexOf(q), 1);
      const ans: AskAnswer = { questionId: q.id, selected: [], other: `superseded: ${reason}`, terms: [], answeredAt: new Date().toISOString() };
      this.answers.set(q.id, ans);
      this.push("question-superseded", { id: nodeId, text: `${q.header} on ${nodeId} withdrawn: ${reason}` });
      for (const w of this.waiters.get(q.id) ?? []) w(ans);
      this.waiters.delete(q.id);
    }
    if (stale.length) this.save();
    return stale.length;
  }

  current(): PendingQuestion | undefined {
    return this.queue[0];
  }

  pendingCount(): number {
    return this.queue.length;
  }

  /** Every queued question in brief, for the page's Issues panel. */
  queued(): Array<{ id: string; kind: IssueKind; header: string; nodeId: string | undefined; askedAt: string; by?: string; blocks?: boolean }> {
    return this.queue.map((q) => ({ id: q.id, kind: q.kind ?? "question", header: q.header, nodeId: q.nodeId, askedAt: q.askedAt, ...(q.by ? { by: q.by } : {}), ...(q.blocks ? { blocks: true } : {}) }));
  }

  /** The queue in full, for a page that lets any of them be answered. */
  queuedFull(): PendingQuestion[] {
    return [...this.queue];
  }

  find(id: string): PendingQuestion | undefined {
    return this.queue.find((q) => q.id === id);
  }

  /** Record the user's answer; resolves every waiter on that question. */
  answer(partial: Omit<AskAnswer, "answeredAt">): boolean {
    this.refresh();
    const i = this.queue.findIndex((q) => q.id === partial.questionId);
    if (i < 0) return false;
    const [q] = this.queue.splice(i, 1);
    this.save();
    const ans: AskAnswer = { ...partial, answeredAt: new Date().toISOString() };
    this.answers.set(ans.questionId, ans);
    this.push("answer", { id: q?.nodeId, text: `${q?.header}: ${ans.selected.join(", ")}${ans.other ? ` / ${ans.other}` : ""}`, by: q?.by, blocks: q?.blocks });
    for (const w of this.waiters.get(ans.questionId) ?? []) w(ans);
    this.waiters.delete(ans.questionId);
    return true;
  }

  /** The answer, waiting up to `ms` for it. Undefined when still pending, null when the id is unknown. */
  waitFor(id: string, ms: number): Promise<AskAnswer | undefined | null> {
    const done = this.answers.get(id);
    if (done) return Promise.resolve(done);
    if (!this.find(id)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const list = this.waiters.get(id) ?? [];
      const timer = setTimeout(() => {
        const l = this.waiters.get(id) ?? [];
        const k = l.indexOf(done2);
        if (k >= 0) l.splice(k, 1);
        resolve(undefined);
      }, ms);
      const done2 = (a: AskAnswer) => {
        clearTimeout(timer);
        resolve(a);
      };
      list.push(done2);
      this.waiters.set(id, list);
    });
  }

  /** Point the page at a node; `open` also opens it for reading and editing. */
  setFocus(id: string, open = false): void {
    this.focusId = id;
    this.focusOpen = open;
    this.focusSeq++;
  }

  /** What the session says it is running right now; the page shows it as its live status. */
  doing: { items: string[]; at: string } | undefined = undefined;
  /**
   * Where each worker is right now (DEC-025): the session signals the branches it holds, and every refiner signals the
   * one node it is on, so the page shows live positions, never a guess from file times. A worker's new signal replaces
   * its last; the session's own signals are a set, since it holds several domains at once.
   */
  private working = new Map<string, { at: number; by: string }>();
  setWorking(ids: string[], on: boolean, by = "session"): void {
    if (by !== "session") for (const [id, w] of [...this.working]) if (w.by === by) this.working.delete(id);
    // the session switching a branch off also clears the workers inside it: their report came back
    if (!on && by === "session") for (const [id, w] of [...this.working]) if (w.by !== "session" && ids.some((d) => id === d || id.startsWith(`${d}.`))) this.working.delete(id);
    for (const id of ids) { if (on) this.working.set(id, { at: Date.now(), by }); else this.working.delete(id); }
  }
  /**
   * How long a signal stands without being renewed. The session switches its own off, so it stands long. An agent
   * renews its position with every parcel and operation and never says when it is done, so a position it has not
   * renewed for a few minutes is that of an agent that finished: the page must not keep spinning there.
   */
  private fresh(w: { at: number; by: string }): boolean { return Date.now() - w.at <= (w.by === "session" ? 30 : 4) * 60_000; }
  workingIds(): string[] { return [...this.working].filter(([, w]) => this.fresh(w)).map(([id]) => id).sort(); }
  /** The workers and the nodes each holds, the session first. */
  workers(): Array<{ by: string; ids: string[]; at: string }> {
    const by = new Map<string, { ids: string[]; at: number }>();
    for (const [id, w] of this.working) { if (!this.fresh(w)) continue; const e = by.get(w.by) ?? by.set(w.by, { ids: [], at: 0 }).get(w.by)!; e.ids.push(id); e.at = Math.max(e.at, w.at); }
    return [...by].sort((a, b) => (a[0] === "session" ? -1 : b[0] === "session" ? 1 : a[0].localeCompare(b[0], undefined, { numeric: true }))).map(([name, e]) => ({ by: name, ids: e.ids.sort(), at: new Date(e.at).toISOString() }));
  }
  setDoing(items: string[]): void {
    this.doing = { items: items.map(String).filter(Boolean).slice(0, 12), at: new Date().toISOString() };
  }

  focus(): { id: string | undefined; seq: number; open: boolean } {
    return { id: this.focusId, seq: this.focusSeq, open: this.focusOpen };
  }

  push(kind: FeedKind, data: { id?: string | undefined; text?: string | undefined; path?: string | undefined; quote?: string | undefined; intro?: boolean | undefined; mode?: string | undefined; cap?: string | undefined; role?: string | undefined; to?: string | undefined; attention?: boolean | undefined; by?: string | undefined; blocks?: boolean | undefined } = {}): FeedEntry {
    const e: FeedEntry = { seq: ++this.seq, at: new Date().toISOString(), kind };
    if (data.id) e.id = data.id;
    if (data.text) e.text = data.text;
    if (data.path) e.path = data.path;
    if (data.quote) e.quote = data.quote;
    if (data.to) e.to = data.to;
    if (data.by) e.by = data.by;
    if (data.blocks) e.blocks = true;
    if (data.intro) e.intro = true;
    if (data.attention) e.attention = true;
    if (data.role) e.role = data.role;
    if (data.mode) e.mode = data.mode;
    if (data.cap) e.cap = data.cap;
    this.feed.push(e);
    if (this.feed.length > 500) this.feed.splice(0, this.feed.length - 500);
    for (const w of this.changeWaiters.splice(0)) w();
    return e;
  }

  /** Feed entries after `since`; the cursor to pass next time is `cursor`. */
  changes(since = 0): { cursor: number; entries: FeedEntry[] } {
    return { cursor: this.seq, entries: this.feed.filter((e) => e.seq > since) };
  }

  /**
   * The same, but waits up to `ms` for a first entry that `wakes`, so the session can attend the page without polling.
   * A session waiting for the user passes `isUserEntry`: its own says and the terminal mirror of its own words never
   * wake it (they did, and the session woke on its own echo every few seconds). What it gets back is still every entry
   * since the cursor, so nothing is lost; only the wake-up is selective.
   */
  waitChanges(since: number, ms: number, wakes: (e: FeedEntry) => boolean = () => true): Promise<{ cursor: number; entries: FeedEntry[] }> {
    const ready = () => { const r = this.changes(since); return r.entries.some(wakes) ? r : undefined; };
    const now = ready();
    if (now || ms <= 0) return Promise.resolve(now ?? this.changes(since));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const i = this.changeWaiters.indexOf(wake);
        if (i >= 0) this.changeWaiters.splice(i, 1);
        resolve(this.changes(since));
      }, ms);
      // a push calls every waiter once and drops it; one that is not woken by what arrived re-arms itself
      const wake = () => {
        const r = ready();
        if (!r) { this.changeWaiters.push(wake); return; }
        clearTimeout(timer);
        resolve(r);
      };
      this.changeWaiters.push(wake);
    });
  }
}
