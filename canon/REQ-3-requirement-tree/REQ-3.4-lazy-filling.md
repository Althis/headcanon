---
id: REQ-3.4
parent: REQ-3
title: "The tree is filled lazily: gaps surface when relevant; deeper details may be marked model assumptions"
state: stated
source: "docs/design-brief-v0.md:62; Claude Code session, 2026-10-18"
files: [skills/adopt/SKILL.md, skills/attend/SKILL.md, agents/refiner.md]
---

# The tree is filled lazily: gaps surface when relevant; deeper details may be marked model assumptions

## Stated

> The tree is filled lazily: gaps surface when relevant; deeper details may be marked model assumptions

Source: docs/design-brief-v0.md:62

> Human attendance doesn't end indefinitely, the model SHOULD request attendance at key points. This is the whole point of the model, it just shouldn't be all ahead of schedule. I agree that it was a misunderstanding and that this SHOULD be an ongoing process.

> If the DAG is split properly, that means that you wouldn't need to know information about requirements outside of your family to design stuff for your current branch.

Source: Claude Code session, 2026-10-18.

## Intent [assumed]

Nothing has to be defined ahead of time. The deeper in the tree, the more the model may decide itself, as long as it contradicts nothing above and is marked as a model assumption.

Filling is continuous and local. A node is cut from its family alone: the chain above it, the root README, its siblings' titles, what it requires and what requires it, and the threads in its scope; so the same work fits a canon of forty nodes and one of four thousand, and an implementer working in a branch holds only that family. The cutting goes on while the human reviews the top, after they finish until every leaf carries its check, and again where implementation touches a branch. The human is called at key points, a branch reaching its leaves, a red box, a thread contradicting an approval, and otherwise left to the top of the tree.

## Not this [assumed]

A heavy upfront specification phase.

