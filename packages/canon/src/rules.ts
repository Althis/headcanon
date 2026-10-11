/**
 * The rules the agent follows every session. Injected by the SessionStart hook, so they are
 * regenerated from this file and never drift in a static CLAUDE.md. Kept short on purpose:
 * every line here is paid for on every turn, and the skills carry the detailed procedures.
 */
export const RULES = `## HeadCanon rules

The canon under \`canon/\` holds this project's intent: requirement tree, journeys, glossary, principles, decisions. Read it before acting and keep it honest while you work.

### Certainty
- **stated** is the human's exact words, quoted. A paraphrase is **assumed**. (REQ-5.3.1)
- **resolved** only on the human's explicit yes; silence or "fine" leaves the state as it was. (REQ-5.3.2)
- Record every interpretation you act on as assumed, every unknown as open, every disagreement as contested, before proceeding. (REQ-5.4)
- Resolve ambiguous terms against the root README's Glossary; propose missing ones as assumed. A definition says what the term is and covers one concept. (REQ-5.1)

### Content
- Every entry reads as a dictionary or encyclopedia entry: concise, about what the thing is, complete for a reader who never saw this conversation. No correction history, no reasons, no "not" clauses; exclusions live only in a Not this section. The canon is the project's Bible. (REQ-3.11)
- Intent, never current state: counts, versions and statuses change, so they never enter a node. (REQ-3.9)
- Every clause cites an artifact or the human's words. Nothing invented.
- Domains and capabilities in plain words; mechanisms and jargon only in requirements. (REQ-3.10)
- Principles (\`PRN-n\` in the root README) are direction. Judge every requirement you propose or change against them and name any drift, because drift needs the human's approval. (REQ-3.7)

### Changing the canon
- Only through change requests the human approves: a create carries a full node, an update only what changed and why, a delete retires with a reason. (REQ-8.6, REQ-8.7)
- Refine the touched branch to binary leaves and derive tests before implementing. (REQ-7.1)
- Every commit: Conventional Commits header, then trailers Intent, Intent-Change per operation, Decision, Test-Change, and Approved-By on any intent or test change. The git commit-msg hook installed by \`headcanon init\` rejects the rest. (REQ-8.5)
- Do not edit CLAUDE.md for HeadCanon; this context is injected each session. (REQ-11.1)

### Obstacles
- Stop and say so when you cannot proceed without changing intent, when an assumption becomes decisive, when intents contradict, or when a leaf has no binary test. Stopping is a successful outcome. (REQ-7.2.1, REQ-7.5)
- Work around alone only when every affected journey still plays out as written, and record it as a decision. (REQ-7.3, REQ-7.4)

Skills: \`/headcanon:adopt\` (no canon yet), \`/headcanon:capture\` (conversation to change request), \`/headcanon:review\` (walk assumed and open items), \`/headcanon:commit\` (conforming message).`;
