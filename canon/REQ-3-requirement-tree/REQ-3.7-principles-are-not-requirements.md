---
id: REQ-3.7
parent: REQ-3
title: "Principles are kept apart from requirements; every requirement names how it would be verified"
state: stated
source: "The Valley adopt session, 2026-10-11"
files: [skills/adopt/SKILL.md, packages/canon/src/rules.ts]
---

# Principles are kept apart from requirements; every requirement names how it would be verified

## Stated

> This is a bad "Requirement". While this is true for the intent, it is not something we can match with a test. It defines the difference between principles, intent, direction and something that can be truly verified. Please suggest a version of this requirement that is more directly verifiable in content and code.

Source: The Valley adopt session, 2026-10-11, answering the proposed top-level requirement "Tantalizing weight-gain content".

## Intent [assumed]

The tree holds requirements: goals that can be refined into leaves a test or a human answers yes or no. A top-level requirement may be broad (REQ-3.3 allows it), but it must be refinable, so every requirement node carries a **Verifiable when** line naming one or two concrete checks in content or code that would show it met. Direction that no check can confirm, such as tone, taste, values and ways of working, is a principle. Principles live in the root README under a Principles section, each with its source, and may be cited by requirements, but they are not nodes in the tree and never show as untested.

## Not this [assumed]

Dropping direction from the canon. Principles are intent too; they are recorded, just not as requirements.

## Assumptions

- The Verifiable when line is a body section, not front-matter, so a node can carry it before it has a `kind`. (model assumption)
- A statement with no conceivable check is a principle; a statement with a check that is merely hard today is a requirement whose leaves come later. (model assumption)
- The adopt skill sorts into the two kinds before drafting the tree, and the injected rules say so for every session. (model assumption)
