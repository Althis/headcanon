---
id: DEC-013
title: "Capabilities are a layer of the one tree, not a separate entity"
state: resolved
date: 2026-10-11
intents: [REQ-6.7, REQ-3.8, REQ-3.3, REQ-4.2]
---

# Capabilities are a layer of the one tree, not a separate entity

## Resolution

> Very good analysis. I approve your decision. Please enshrine it.

Claude Code session, 2026-10-11.

## Why

A capability differs from an internal requirement in four ways, and three of them need only a tag. Its origin is the archetype rather than the artifacts, which is what makes coverage gaps detectable on day one. It is stable where requirements churn, which makes it the right unit for coverage reports. It is never tested directly, only covered through its requirements, which gives the check a different rule per layer. All three follow from knowing which nodes are capabilities, and a field gives that.

A separate entity, with its own IDs, schema and relations, would buy three things: a requirement serving several capabilities without being written twice; identity that survives a move, since re-homing becomes a field edit; and a clearer face for the reader, who sees "capability" rather than a requirement ID. It would cost a classification decision on every item, where a mistake is a retire plus a create; a tree that becomes a graph, breaking the folder mirror, the path IDs and clean roll-ups; and a second copy of every tool, from parser to viewer to verifier brief. Goal-oriented requirements engineering keeps one node kind and distinguishes leaves by responsibility; capability maps keep a separate layer only because the map outlives any one product. A single product's canon has nothing to share it with.

The brief already places many-to-many links in journeys, whose steps link to requirements at any level, and cross-cutting outcomes get their own branch. Two signals would reopen this decision: the verifier repeatedly finding the same requirement wanted under two capabilities, or the log showing capability moves frequent enough that retire-and-create fragments history. If they appear, the lighter design is a checklist, not a second tree: capabilities listed in each domain's README with their own IDs, requirements as the tree beneath the domain, each naming the capabilities it serves.

## Superseded in part

DEC-014, the same day: the sentence "the tree stays a tree" no longer holds. The canon is a directed acyclic graph with one home per node and typed links; the layer decision itself stands.
