---
id: DEC-015
title: "Children are built by laddering, with the axis read off the set, never chosen first"
state: resolved
date: 2026-10-11
intents: [REQ-3.14, REQ-3.13, REQ-3.12]
origin: misread
---

# Children are built by laddering, with the axis read off the set, never chosen first

## Resolution

> This seems good. Can you then complete the Refine skill to enough specificity that we can test it as part of the adopt skill for the next test?

Claude Code session, 2026-10-11.

## Why

The agent first proposed that a node's dimension be chosen and approved before its children, then that the candidates be grouped into two or three alternative child sets and scored by rules. The human corrected both. The inference prompts are what reveal the possible dimensions, so choosing one first inverts the order of operations. An artifact's statement sits at an unknown depth below the node, so it is a hint that an upper level is missing, not a candidate child. Rules good enough to score alternative sets are good enough to build one set directly, with the axis chosen on the spot. Their question about a group of candidates sharing a second axis, why not unify the whole group under a new child and branch from there, became the facet child.

The construction recorded in REQ-3.14 is assembled from established practice rather than invented: laddering interviews and the KAOS "why" question on a goal give the ladder and its stop condition; Rasmussen's abstraction hierarchy gives the single level per layer, since each level is the how of the one above and the why of the one below; the KAOS refinement patterns, by milestone, case, part and agent, give the kinds of axis a set can have; IDEF0's conservation rule, that a function's children account for everything that enters and leaves it, gives the closing check; and Ranganathan's faceted classification gives the facet child in place of interleaved or alternative sets. Proportion stays advisory, as REQ-3.12 records.

This supersedes the assumption in REQ-3.12 that the dimension is approved before any children are proposed.
