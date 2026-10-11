import { randomUUID } from "node:crypto";

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

export interface AskRequest {
  question: string;
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
  question: string;
  header: string;
  options: AskOption[];
  multiSelect: boolean;
  nodeId: string | undefined;
  terms: TermGuess[];
  notice: string | undefined;
}

export type FeedKind = "answer" | "message" | "refine-request" | "node-edited" | "node-created" | "term-enshrined" | "term-dropped";

export interface FeedEntry {
  seq: number;
  at: string;
  kind: FeedKind;
  id?: string;
  text?: string;
  path?: string;
}

export const DEFAULT_OPTIONS: AskOption[] = [
  { label: "Approve as written", description: "Enters as resolved." },
  { label: "Drop", description: "Left out." },
];

export class SessionState {
  private queue: PendingQuestion[] = [];
  private answers = new Map<string, AskAnswer>();
  private waiters = new Map<string, Array<(a: AskAnswer) => void>>();
  private feed: FeedEntry[] = [];
  private seq = 0;
  private focusId: string | undefined;
  private focusSeq = 0;

  /** Queue a question. The head of the queue is what the page shows. */
  ask(req: AskRequest): PendingQuestion {
    const q: PendingQuestion = {
      id: randomUUID().slice(0, 8),
      askedAt: new Date().toISOString(),
      question: req.question,
      header: req.header ?? "Question",
      options: req.options && req.options.length ? req.options : DEFAULT_OPTIONS,
      multiSelect: req.multiSelect ?? false,
      nodeId: req.nodeId,
      terms: req.terms ?? [],
      notice: req.notice,
    };
    this.queue.push(q);
    // Focus follows the question on screen: the head of the queue, not the last one queued.
    if (req.nodeId && this.queue.length === 1) this.setFocus(req.nodeId);
    return q;
  }

  current(): PendingQuestion | undefined {
    return this.queue[0];
  }

  pendingCount(): number {
    return this.queue.length;
  }

  find(id: string): PendingQuestion | undefined {
    return this.queue.find((q) => q.id === id);
  }

  /** Record the human's answer; resolves every waiter on that question. */
  answer(partial: Omit<AskAnswer, "answeredAt">): boolean {
    const i = this.queue.findIndex((q) => q.id === partial.questionId);
    if (i < 0) return false;
    const [q] = this.queue.splice(i, 1);
    const ans: AskAnswer = { ...partial, answeredAt: new Date().toISOString() };
    this.answers.set(ans.questionId, ans);
    this.push("answer", { id: q?.nodeId, text: `${q?.header}: ${ans.selected.join(", ")}${ans.other ? ` / ${ans.other}` : ""}` });
    for (const w of this.waiters.get(ans.questionId) ?? []) w(ans);
    this.waiters.delete(ans.questionId);
    const next = this.queue[0];
    if (i === 0 && next?.nodeId) this.setFocus(next.nodeId);
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

  setFocus(id: string): void {
    this.focusId = id;
    this.focusSeq++;
  }

  focus(): { id: string | undefined; seq: number } {
    return { id: this.focusId, seq: this.focusSeq };
  }

  push(kind: FeedKind, data: { id?: string | undefined; text?: string | undefined; path?: string | undefined } = {}): FeedEntry {
    const e: FeedEntry = { seq: ++this.seq, at: new Date().toISOString(), kind };
    if (data.id) e.id = data.id;
    if (data.text) e.text = data.text;
    if (data.path) e.path = data.path;
    this.feed.push(e);
    if (this.feed.length > 500) this.feed.splice(0, this.feed.length - 500);
    return e;
  }

  /** Feed entries after `since`; the cursor to pass next time is `cursor`. */
  changes(since = 0): { cursor: number; entries: FeedEntry[] } {
    return { cursor: this.seq, entries: this.feed.filter((e) => e.seq > since) };
  }
}
