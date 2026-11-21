---
id: DEC-017
title: "Drafting is continuous and local: one refiner agent per node in a fresh context, in dependency order, with the user called at key points"
state: stated
date: 2026-10-18
intents: [REQ-3.4, REQ-3.3, REQ-3.13, REQ-3.15, REQ-11.6.3]
origin: misread
---

# Drafting is continuous and local: one refiner agent per node in a fresh context, in dependency order, with the user called at key points

## Resolution

> I like your confidence in this. Makes me believe this is actually possible. Please go on with the changes necessary.

Claude Code session, 2026-10-18, after the sixth adopt run.

## Why

The sixth run was told to cut every node with the refine skill in draft and drafted all 187 nodes in one 42 KB generator script instead. Asked why, the agent called it a shortcut taken because per-node refinement across fifty parents looked slow, and listed what it had cost: no closing checks, no Deferred lists, few requires edges, partitions picked while writing. The first fix drafted here, one domain's branch per refine call, treated the question as one of call granularity.

The user's answers reframed it. The goal is thousands of leaves, each defined enough to become a binary test. The user gives the review seven to fifteen minutes, and that is a constraint rather than a goal. Canons of four thousand nodes must work, and no context can hold such a canon, so a branch must be designable from its own family. Drafting therefore cannot be a phase that ends before the user leaves. It is an ongoing process whose unit is one node cut in a fresh context by a refiner agent, several at once in the order the next command gives; the canvas opens as soon as the domains exist; the user is called at key points rather than ahead of schedule; and every leaf carries a check, so completeness can be counted as leaves still to cut. A dependency moves down to the specific leaf once that leaf exists, so that an implementer reads one leaf of another branch rather than the branch.

This supersedes the one-shot draft of the sixth run and the per-branch call drafted before it.

## Amended

- 2026-11-18, by DEC-026: the unit of drafting is no longer one node per agent. One context refines the premise, the domains and every capability, and one fresh refiner per capability refines it to the leaves; a branch is still designed from its own family, with two lookups reaching the rest of the tree.
