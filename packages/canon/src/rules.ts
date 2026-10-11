/**
 * The rules the agent follows every session. Injected by the SessionStart hook,
 * so they are regenerated from this file and never drift in a static CLAUDE.md.
 * Each rule names the canon node it comes from.
 */
export const RULES = `## HeadCanon rules

You are working in a project that keeps its intent in a canon: a tree of requirements, user journeys, a glossary and decision records under the canon directory. Read it before acting and keep it honest while you work.

1. **Stated means verbatim.** A stated item is the human's own words, quoted exactly from the conversation or a document they wrote. Never paraphrase into a stated item; a paraphrase is assumed. (REQ-5.3.1)
2. **Never upgrade a status yourself.** Only the human's explicit words move an item to resolved. Tacit approval, silence, or "looks fine" without a clear yes never counts. (REQ-5.3.2)
3. **Never fill a gap silently.** When you proceed on an interpretation, record it as an assumed item first. When you do not know, record an open item. When you and the human disagree, record it as contested. (REQ-5.4)
4. **Resolve the glossary.** When a request uses a term ambiguously, check the Glossary in the canon's root README. If the term is missing, propose a definition as assumed, or ask. A definition says what the term is, as a dictionary does, and covers one concept; a related concept gets its own entry. (REQ-5.1, REQ-5.1.1)
5. **The canon changes only through change requests.** Propose creates, updates and deletes; the human approves. A create carries a full node; an update carries only what changed and why; a delete retires a node with a reason and never erases it. (REQ-8.6, REQ-8.7)
6. **Stopping to raise an obstacle is a successful outcome.** When you hit something you cannot get around without changing intent, when an assumption becomes decisive, when two intents contradict, or when you cannot write a binary test for a leaf, stop and say so. Do not finish and hope. (REQ-7.2.1, REQ-7.5)
7. **Work around only when intent is preserved.** You may pass an obstacle alone if every affected journey still plays out as written. Record the workaround as a decision linked to the intent it serves. (REQ-7.3, REQ-7.4)
8. **Requirements, then tests, then code.** Before implementing, refine the touched branch until its leaves are binary, and derive tests from those leaves and journeys. A requirement, however broad, names how it would be verified. Direction is a principle: it lives in the root README with a PRN id, and every requirement you propose or change is judged against the principles; say so when one drifts, because drift needs the human's approval. (REQ-7.1, REQ-3.7)
9. **Every commit carries intent.** Conventional Commits header, then trailers: Intent (IDs or none with a reason), Intent-Change per operation, Decision, Test-Change, and Approved-By whenever intent or tests change. A git commit-msg hook, installed in the project by \`headcanon init\` (which the adopt skill runs), rejects anything else; this plugin itself registers only a SessionStart hook. (REQ-8.5, REQ-8.5.1, REQ-8.5.2)
10. **Do not edit CLAUDE.md on HeadCanon's behalf.** HeadCanon injects its own context each session; the project's CLAUDE.md belongs to the project. (REQ-11.1)

Skills: \`/headcanon:adopt\` when the project has no canon yet, \`/headcanon:capture\` to turn what the conversation established into a change request, \`/headcanon:review\` to walk assumed and open items with the human, \`/headcanon:commit\` to compose a conforming commit message.`;
