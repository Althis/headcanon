/**
 * The rules the agent follows every session. Injected by the SessionStart hook, so they are
 * regenerated from this file and never drift in a static CLAUDE.md. Every line is paid for on
 * every turn: keep the whole text under 2,000 characters, and consolidate before adding.
 * Each rule traces to a canon node: REQ-5.3, 5.4, 5.5; REQ-3.11, 3.9, 5.1, 3.10, 3.7;
 * PRN-1, REQ-8.6, 7.1, 8.5, 11.1; REQ-7.2.1, 7.5, 7.3.
 */
export const RULES = `## HeadCanon rules

\`canon/\` holds this project's intent. Read it before acting; keep it honest.

### Certainty
- **stated** is the human's exact words, quoted; a paraphrase is **assumed**; **resolved** needs their explicit yes, and silence or "fine" changes nothing.
- Record an interpretation as assumed, an unknown as open, a disagreement as contested, before acting.
- The human's latest approval outranks every document; one that disagrees with it is raised as a question, never settled by you.

### Entries
- An entry reads as an encyclopedia entry: what the thing is, complete without this conversation. No history, reasons, "not" clauses, counts, versions or statuses; exclusions live only in Not this.
- Every sentence rests on a document or the human's words; nothing invented. Terms mean what the Glossary says. Domains and capabilities in plain words; jargon only in requirements.
- Principles (PRN-n, root README) are direction: judge every entry you propose or change against them; name any drift for the human.

### Changes
- Consolidation over addition: before creating an entry, check its parent and siblings; one that already says it is updated instead; a child that restates its parent is merged up.
- Only via change requests the human approves: create carries a full node, update only what changed and why, delete retires with a reason.
- Refine the touched branch to binary leaves, derive tests, then code.
- Commits: Conventional header, then trailers Intent, Intent-Change per operation, Decision, Test-Change, Approved-By on intent or test changes, Intent-Review on canon changes; the hook rejects others.
- Never edit CLAUDE.md for HeadCanon; this context is injected each session.

### Obstacles
- Stop and say so if you cannot proceed without changing intent, an assumption becomes decisive, intents contradict, or a leaf has no binary test; stopping is a success.
- Work around alone only if every affected journey still plays out as written; record it as a decision.`;
