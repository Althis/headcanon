---
id: DEC-014
title: "The canon is a directed acyclic graph: one home per node, typed links, lifting before linking"
state: resolved
date: 2026-10-11
intents: [REQ-3.12, REQ-8.6.1, REQ-4.2, REQ-6.1]
origin: misread
---

# The canon is a directed acyclic graph: one home per node, typed links, lifting before linking

## Resolution

> I agreed with everything you said: use acyclic graphs instead of pure trees, use established movement and insertion operations to define the rules for managing the graph.

Claude Code session, 2026-10-11.

## Why

The agent had asserted that a requirement tree keeps its siblings mutually exclusive and that the tree stays a tree. The human doubted it from experience and asked for research. The research, recorded in `docs/research/2026-10-11-exclusivity-in-requirement-hierarchies.md`, found that no requirements or goal framework maintains strict sibling exclusivity: KAOS is a directed acyclic graph by design, feature models add cross-tree constraints and their expressive variants are graphs, SysML keeps a containment tree and states that this precludes reuse, so it adds Copy and typed links, and the requirements tools keep a single-parent outline with many-to-many links. Exclusivity is a hard rule only in accounting trees, and even those legislate escape hatches. The assertion was a misreading of practice, which is the origin recorded here.

The canon therefore keeps what it had, a containment tree in which every node has one home and an ID that mirrors the home's path, and gains what practice adds: typed links between nodes, `relates` and `conflicts`, so that one idea lives in one place and is reachable from the others. When a sibling needs what another sibling has, the first move is to lift it to their lowest common ancestor; the second is a link; the third is a branch of its own for a cross-cutting outcome. Journeys remain the many-to-many layer for flows. The verifier flags unacknowledged overlap, the same idea in two places with no link, not overlap itself. This supersedes the sentence in DEC-013 that the tree stays a tree.

Managing the graph follows the operations the researched frameworks share, defined in REQ-8.6.1. What the research did not give is a rule for where a branch is cut; that is REQ-3.14, open.
