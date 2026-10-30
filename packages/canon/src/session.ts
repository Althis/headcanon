import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The state the viewer keeps for a Claude Code session working through the page (REQ-12.1.7):
 * questions the session asked and the human has not answered, the node the session wants on
 * screen, and a feed of what the human did in the page that the session has not read yet.
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

/** An issue is the session's explicit request for help: a question, or a contradiction to settle. */
export type IssueKind = "question" | "contradiction";

export interface AskRequest {
  question: string;
  /** What kind of issue this is; a contradiction's statements come from the node's Contested section. */
  kind?: IssueKind;
  /** Why it matters, in one or two sentences, shown as the issue's summary. */
  why?: string;
  header?: string;
  options?: AskOption[];
  multiSelect?: boolean;
  nodeId?: string;
  terms?: TermGuess[];
  /** Something the human must know that is not part of the draft, shown apart from the question. */
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
}

export type FeedKind =
  | "answer"
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
  | "term-dropped";

export interface FeedEntry {
  seq: number;
  at: string;
  kind: FeedKind;
  id?: string;
  text?: string;
  path?: string;
  /** On a message: the passage the human highlighted in a node's card before writing. */
  quote?: string;
  /** On a say: "human" when the line asks something of them; otherwise it is a report for the history. */
  to?: string;
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
        const saved = JSON.parse(readFileSync(store, "utf8")) as { queue?: PendingQuestion[] };
        if (Array.isArray(saved.queue)) this.queue = saved.queue;
      } catch { /* a bad file is an empty queue */ }
    }
  }

  private save(): void {
    if (!this.store) return;
    try { mkdirSync(dirname(this.store), { recursive: true }); writeFileSync(this.store, JSON.stringify({ queue: this.queue }, null, 2)); } catch { /* the page works without the file */ }
  }

  /** Queue a question. The head of the queue is what the page shows. */
  ask(req: AskRequest): PendingQuestion {
    const q: PendingQuestion = {
      id: randomUUID().slice(0, 8),
      askedAt: new Date().toISOString(),
      kind: req.kind === "contradiction" ? "contradiction" : "question",
      why: req.why,
      question: req.question,
      header: req.header ?? (req.kind === "contradiction" ? "Contradiction" : "Question"),
      // a contradiction's choices are the node's statements, read by the page; the default pair is for drafts
      options: req.kind === "contradiction" ? req.options ?? [] : req.options && req.options.length ? req.options : DEFAULT_OPTIONS,
      multiSelect: req.multiSelect ?? false,
      nodeId: req.nodeId,
      terms: req.terms ?? [],
      notice: req.notice,
    };
    this.queue.push(q);
    this.save();
    return q;
  }

  current(): PendingQuestion | undefined {
    return this.queue[0];
  }

  pendingCount(): number {
    return this.queue.length;
  }

  /** Every queued question in brief, for the page's Issues panel. */
  queued(): Array<{ id: string; kind: IssueKind; header: string; nodeId: string | undefined; askedAt: string }> {
    return this.queue.map((q) => ({ id: q.id, kind: q.kind ?? "question", header: q.header, nodeId: q.nodeId, askedAt: q.askedAt }));
  }

  find(id: string): PendingQuestion | undefined {
    return this.queue.find((q) => q.id === id);
  }

  /** Record the human's answer; resolves every waiter on that question. */
  answer(partial: Omit<AskAnswer, "answeredAt">): boolean {
    const i = this.queue.findIndex((q) => q.id === partial.questionId);
    if (i < 0) return false;
    const [q] = this.queue.splice(i, 1);
    this.save();
    const ans: AskAnswer = { ...partial, answeredAt: new Date().toISOString() };
    this.answers.set(ans.questionId, ans);
    this.push("answer", { id: q?.nodeId, text: `${q?.header}: ${ans.selected.join(", ")}${ans.other ? ` / ${ans.other}` : ""}` });
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

  focus(): { id: string | undefined; seq: number; open: boolean } {
    return { id: this.focusId, seq: this.focusSeq, open: this.focusOpen };
  }

  push(kind: FeedKind, data: { id?: string | undefined; text?: string | undefined; path?: string | undefined; quote?: string | undefined; to?: string | undefined } = {}): FeedEntry {
    const e: FeedEntry = { seq: ++this.seq, at: new Date().toISOString(), kind };
    if (data.id) e.id = data.id;
    if (data.text) e.text = data.text;
    if (data.path) e.path = data.path;
    if (data.quote) e.quote = data.quote;
    if (data.to) e.to = data.to;
    this.feed.push(e);
    if (this.feed.length > 500) this.feed.splice(0, this.feed.length - 500);
    for (const w of this.changeWaiters.splice(0)) w();
    return e;
  }

  /** Feed entries after `since`; the cursor to pass next time is `cursor`. */
  changes(since = 0): { cursor: number; entries: FeedEntry[] } {
    return { cursor: this.seq, entries: this.feed.filter((e) => e.seq > since) };
  }

  /** The same, but waits up to `ms` for a first entry, so the session can attend the page without polling. */
  waitChanges(since: number, ms: number): Promise<{ cursor: number; entries: FeedEntry[] }> {
    const now = this.changes(since);
    if (now.entries.length || ms <= 0) return Promise.resolve(now);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const i = this.changeWaiters.indexOf(wake);
        if (i >= 0) this.changeWaiters.splice(i, 1);
        resolve(this.changes(since));
      }, ms);
      const wake = () => {
        clearTimeout(timer);
        resolve(this.changes(since));
      };
      this.changeWaiters.push(wake);
    });
  }
}
