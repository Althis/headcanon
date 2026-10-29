---
id: REQ-3.4
parent: REQ-3
title: "The tree is filled lazily: gaps surface when relevant; deeper details may be marked model assumptions"
state: stated
source: "docs/design-brief-v0.md:62; Claude Code session, 2026-10-18"
files: [skills/adopt/SKILL.md, skills/attend/SKILL.md, agents/refiner.md, packages/canon/src/next.ts]
---

# The tree is filled lazily: gaps surface when relevant; deeper details may be marked model assumptions

## Stated

> The tree is filled lazily: gaps surface when relevant; deeper details may be marked model assumptions

Source: docs/design-brief-v0.md:62

> Human attendance doesn't end indefinitely, the model SHOULD request attendance at key points. This is the whole point of the model, it just shouldn't be all ahead of schedule. I agree that it was a misunderstanding and that this SHOULD be an ongoing process.

> If the DAG is split properly, that means that you wouldn't need to know information about requirements outside of your family to design stuff for your current branch.

Source: Claude Code session, 2026-10-18.

> The way it is right now the agent is getting busy doing things that are likely to be overwritten. We need a limit to the definition depth without confirmation. I know I told you that we needed a way for the system to define leaves ahead of the user approval, but doing it so far when the user might rewrite a top level entity means all the work was wasted. What we need instead is to define a formula to calculate definition depth. This formula should be conservative the higher the user is, say that until the domains are defined, we have something where the system would only define up to 2 levels down. Then each approved node increases the depth the system can go to.

Source: Claude Code session, 2026-10-18, after the seventh adopt run.

## Intent [assumed]

Nothing has to be defined ahead of time. The deeper in the tree, the more the model may decide itself, as long as it contradicts nothing above and is marked as a model assumption.

Filling is continuous and local. A node is cut from its family alone: the chain above it, the root README, its siblings' titles, what it requires and what requires it, and the threads in its scope; so the same work fits a canon of forty nodes and one of four thousand, and an implementer working in a branch holds only that family. The cutting goes on while the human reviews the top, after they finish until every leaf carries its check, and again where implementation touches a branch. The human is called at key points, a branch reaching its leaves, a red box, a thread contradicting an approval, and otherwise left to the top of the tree.

The draft runs ahead of approval by a bounded distance (DEC-018). A box is cut only when its children would lie no more than two levels below the deepest approved box on its path, the premise counting as level zero: before the premise is approved only the domains are drafted; with it, the capabilities; an approved domain lets its capabilities be cut into requirements, an approved capability lets its requirements be cut into leaves. Approval moves the frontier under that box and nowhere else, so a rewrite at the top wastes at most two levels of guesses. The next command applies the formula and reports what waits and which approval would release it.

## Not this [assumed]

A heavy upfront specification phase.

