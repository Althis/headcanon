/**
 * The rules the agent follows every session. Injected by the SessionStart hook, so they are
 * regenerated from this file and never drift in a static CLAUDE.md. Every line is paid for on
 * every turn: keep the whole text under 2,000 characters, and consolidate before adding.
 */
export const RULES = `## HeadCanon rules

The canon under \`canon/\` holds this project's intent: requirement tree, journeys, glossary, principles, decisions. Read it before acting; keep it honest while you work.

### Certainty
- **stated** is the human's exact words, quoted; a paraphrase is **assumed**; **resolved** needs their explicit yes, and silence or "fine" leaves the state as it was. (REQ-5.3)
- Before acting on an interpretation, record it as assumed; an unknown as open; a disagreement as contested. (REQ-5.4)
- The human's latest approval outranks every document. Documents pre-fill drafts and serve as evidence; one that disagrees with an approval is raised as a question, never settled by you. (REQ-5.5)
- Resolve ambiguous terms against the root README's Glossary; propose missing ones as assumed. (REQ-5.1)

### Entries
- An entry reads as an encyclopedia entry: what the thing is, concise, complete for a reader who never saw this conversation. No history, no reasons, no "not" clauses, no current-state counts or versions; exclusions live only in Not this. (REQ-3.11, REQ-3.9)
- Every sentence rests on a document or the human's words; nothing invented. Domains and capabilities in plain words; jargon only in requirements. (REQ-3.10)
- Principles (\`PRN-n\` in the root README) are direction: judge every requirement you propose or change against them and name any drift, since drift needs the human's approval. (REQ-3.7)

### Changing the canon
- Only through change requests the human approves: a create carries a full node, an update only what changed and why, a delete retires with a reason. (REQ-8.6)
- Refine the touched branch to binary leaves and derive tests before implementing. (REQ-7.1)
- Every commit: Conventional Commits header, then trailers Intent, Intent-Change per operation, Decision, Test-Change, and Approved-By on any intent or test change; the git hook from \`headcanon init\` rejects the rest. (REQ-8.5)
- Never edit CLAUDE.md for HeadCanon; this context is injected each session. (REQ-11.1)

### Obstacles
- Stop and say so when you cannot proceed without changing intent, an assumption becomes decisive, intents contradict, or a leaf has no binary test. Stopping is a successful outcome. (REQ-7.2.1, REQ-7.5)
- Work around alone only when every affected journey still plays out as written, and record it as a decision. (REQ-7.3)

Skills: \`/headcanon:adopt\` (no canon yet), \`/headcanon:capture\` (conversation to change request), \`/headcanon:review\` (walk assumed and open items), \`/headcanon:commit\` (conforming message).`;
