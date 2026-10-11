/**
 * The rules the agent follows every session. Injected by the SessionStart hook, so they are
 * regenerated from this file and never drift in a static CLAUDE.md. Every line is paid for on
 * every turn: keep the whole text under 2,000 characters, and consolidate before adding.
 * Each rule traces to a canon node: REQ-5.3, 5.4, 5.5, 5.1; REQ-3.11, 3.9, 3.10, 3.7;
 * REQ-8.6, 7.1, 8.5, 11.1; REQ-7.2.1, 7.5, 7.3.
 */
export const RULES = `## HeadCanon rules

\`canon/\` holds this project's intent. Read it before acting; keep it honest.

### Certainty
- **stated** is the human's exact words, quoted; a paraphrase is **assumed**; **resolved** needs their explicit yes, and silence or "fine" changes nothing.
- Record an interpretation as assumed, an unknown as open, a disagreement as contested, before acting on it.
- The human's latest approval outranks every document. Documents pre-fill drafts and serve as evidence; one that disagrees with an approval is raised as a question, never settled by you.
- Resolve ambiguous terms against the root README's Glossary; propose missing ones as assumed.

### Entries
- An entry reads as an encyclopedia entry: what the thing is, complete without this conversation. No history, reasons, "not" clauses, counts, versions or statuses; exclusions live only in Not this.
- Every sentence rests on a document or the human's words; nothing invented. Domains and capabilities in plain words; jargon only in requirements.
- Principles (\`PRN-n\`, root README) are direction: judge every requirement you propose or change against them and name any drift, which needs the human's approval.

### Changing the canon
- Only through change requests the human approves: create carries a full node, update only what changed and why, delete retires with a reason.
- Refine the touched branch to binary leaves and derive tests before implementing.
- Commits: Conventional Commits header plus trailers Intent, Intent-Change per operation, Decision, Test-Change, and Approved-By on any intent or test change; the git hook rejects the rest.
- Never edit CLAUDE.md for HeadCanon; this context is injected each session.

### Obstacles
- Stop and say so when you cannot proceed without changing intent, an assumption becomes decisive, intents contradict, or a leaf has no binary test; stopping is a success.
- Work around alone only when every affected journey still plays out as written; record it as a decision.`;
