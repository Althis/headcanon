---
id: REQ-3.7
parent: REQ-3
title: "Principles are a layer above the tree: tested against requirements by a model judge, with drift needing the human's approval"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md, skills/capture/SKILL.md, packages/canon/src/rules.ts]
---

# Principles are a layer above the tree: tested against requirements by a model judge, with drift needing the human's approval

## Stated

> This is a bad "Requirement". While this is true for the intent, it is not something we can match with a test. It defines the difference between principles, intent, direction and something that can be truly verified. Please suggest a version of this requirement that is more directly verifiable in content and code.

Source: The Valley adopt session, 2026-10-11, answering the proposed top-level requirement "Tantalizing weight-gain content".

> Principles and directions should be tested, just not against code. They should be tested against requirements. When you come up with a project, these principles should be a layer that decides the direction for the project, and they are therefore negotiations with requirements. Since every requirement should have a test possible, these principles cannot fit it, but they should be checks the engine checks requirements against with an LLM judge to guarantee there is no drift, and if there is drift,  that the human approves it.

Source: Claude Code session, 2026-10-11, correcting the agent's reading that principles are never tested.

## Intent [assumed]

The canon has two layers. The tree holds requirements: goals that can be refined into leaves a test or a human answers yes or no, so every requirement node carries a **Verifiable when** line naming the checks that would show it met. Above the tree sit principles: the direction the project takes, such as tone, taste, values and ways of working. Principles live in the root README under a Principles section, each with an ID (`PRN-1`, `PRN-2`, …), a statement and a source.

Principles are tested against requirements, not code. Whenever a requirement is created or changed, a model judge checks it against the principles and reports, with a justification, whether it drifts from any of them. In the session, the agent does this when it proposes a change request and flags any tension before the human approves. In CI, Writ's intent check does it independently (REQ-9.18). Drift is a negotiation: the human either approves it, which is an intent change to the principle or the requirement recorded in the history, or rejects the change. A principle therefore never shows as untested; it shows as upheld or drifting.

## Not this [assumed]

Dropping direction from the canon, or proposing direction as a requirement node. Also not a deterministic check: judging a requirement against a principle needs a model, and the report must say why.

## Assumptions

- Principle IDs use the prefix `PRN` and live in the root README rather than in files of their own, since a project has few of them. (model assumption)
- The Verifiable when line is a body section, not front-matter, so a node can carry it before it has a `kind`. (model assumption)
- A statement with no conceivable check against content or code is a principle; a statement with a check that is merely hard today is a requirement whose leaves come later. (model assumption)
- Tooling for principles (parsing PRN entries, showing them in the viewer, the judge in Writ) follows in later changes; this node sets the format and the rule. (model assumption)
