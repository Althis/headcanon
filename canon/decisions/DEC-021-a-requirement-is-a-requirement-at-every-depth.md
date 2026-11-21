---
id: DEC-021
title: "A requirement is a requirement at every depth: a parent is verified by its children when they entail it, and by a check of its own when they do not"
state: assumed
date: 2026-11-04
intents: [REQ-3.3, REQ-6.7]
---

# A requirement is a requirement at every depth: a parent is verified by its children when they entail it, and by a check of its own when they do not

## Intent

The word requirement means the same thing at every depth of the tree: a claim that must hold, verified at its level. A leaf is verified by its own `## Check`. A parent is verified by its children when the cut's entailment check showed that they together say what the parent says; when they do not, the parent keeps a `## Check` of its own with its `kind`, the integration check. Being a leaf is a moment in the cutting, not a kind of node, so no second node type exists for parents, as DEC-013 holds. An open-ended check is a goal rather than a requirement: the cut goes to binary or numeric leaves where the artifacts allow, and a leaf stays open-ended only when the user accepts it. A requirement's title reads as a claim; a capability's names a subject.

## Assumptions

- The user asked whether only leaves are requirements in the strict sense and parents should be called something else, since a requirement is binary; the answer given was that decomposed requirements stay requirements in requirements engineering as practised (ISO 29148, INCOSE), verified at their own level, that a leaf is a moment rather than a nature in a lazily filled tree, and that the gap was the parent's own verification, not its name. The user took the answer and asked for the changes; their words do not state the decision, so it is assumed (model assumption)

## Open

- 2026-11-04: settled when the user reviews it, with the first branch that keeps an integration check as the case to judge it on.

## Amended

- 2026-11-16, by DEC-025: the requirement is the leaf, its Intent its one requirement, a parent satisfied when all children are, with a stable id beside the positional one.
