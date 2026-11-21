---
id: REQ-3.4
parent: REQ-3
title: "The tree is drafted whole by the session and reviewed lazily by the user: what matters most comes first, deeper details stay model assumptions"
state: stated
source: "docs/design-brief-v0.md:62; Claude Code session, 2026-10-18; Claude Code session, 2026-11-15"
files: [skills/adopt/SKILL.md, skills/attend/SKILL.md, agents/refiner.md, packages/canon/src/next.ts]
---

# The tree is drafted whole by the session and reviewed lazily by the user: what matters most comes first, deeper details stay model assumptions

## Stated

> The tree is filled lazily: gaps surface when relevant; deeper details may be marked model assumptions

Source: docs/design-brief-v0.md:62

> Human attendance doesn't end indefinitely, the model SHOULD request attendance at key points. This is the whole point of the model, it just shouldn't be all ahead of schedule. I agree that it was a misunderstanding and that this SHOULD be an ongoing process.

> If the DAG is split properly, that means that you wouldn't need to know information about requirements outside of your family to design stuff for your current branch.

Source: Claude Code session, 2026-10-18.

> The way it is right now the agent is getting busy doing things that are likely to be overwritten. We need a limit to the definition depth without confirmation. I know I told you that we needed a way for the system to define leaves ahead of the user approval, but doing it so far when the user might rewrite a top level entity means all the work was wasted. What we need instead is to define a formula to calculate definition depth. This formula should be conservative the higher the user is, say that until the domains are defined, we have something where the system would only define up to 2 levels down. Then each approved node increases the depth the system can go to.

Source: Claude Code session, 2026-10-18, after the seventh adopt run.

> Computers can work faster and longer, so I thought introducing detective sub-agents could help us resolve something fully before the human needs to confirm anything. [...] we should be the ones planning to make the most bang out of the human time buck possible.

> [...] the system should still prioritize approvals for the most impactful nodes in the UI even after the adoption process is done, so that the human can always choose to inspect the canon in fruitful ways whenever they want to spend time doing it.

Source: Claude Code session, 2026-11-15 (DEC-024).

## Intent [assumed]

Nothing has to be defined by the user ahead of time. The session drafts the tree to its leaves, every entry a model assumption until the user speaks, as long as it contradicts nothing above it; and the user's attention goes where an answer changes the most. The next command ranks the premise first, then the guessed nodes under approved ones by the nodes below them, whose path an approval validates and a rewrite invalidates, and every red node by what waits on it and what it hides; the list stands after adoption, and the command names the unapproved nodes on the path above a node for a user who chooses to validate them (DEC-024). Building waits on none of them: guessed and approved nodes are built alike, a red node alone is left out, and the user reviews what was built after the round (DEC-026).

Filling is continuous and local. A node is refined from its family: the chain above it, the root README with the map of domains and capabilities, its siblings' titles, what it requires and what requires it, and the threads in its scope. Two lookups reach the rest of the tree on demand, the context of any one node and a search of every node by its words (DEC-026); so the same work fits a canon of forty nodes and one of four thousand, and an implementation agent working in a branch holds only that family and what it looked up. The refining runs to the leaves before the user is asked anything, again where an answer re-opens a branch, and again where implementation touches one. The user is called at key points, the drafting done, a red node, a thread contradicting an approval, a build round ready for their decision, and otherwise left to their list.

## Not this [assumed]

A specification phase that costs the user hours before any work. The session's own drafting is machine time, unattended and resumable, and is not that phase.
