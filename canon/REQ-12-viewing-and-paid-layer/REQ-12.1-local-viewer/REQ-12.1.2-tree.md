---
id: REQ-12.1.2
parent: REQ-12.1
title: "Tree: the canon as a graph by default, the nested list on request, and a reading pane"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js, packages/canon/src/tree.ts]
---

# Tree: the canon as a graph by default, the nested list on request, and a reading pane

## Stated

> The full requirement tree

Source: Claude Code session, 2026-10-11, second bullet of the viewer request.

> Since it is no longer a tree, allow the user to still reach this list type of visualization, but default to a DAG visualization.

Source: Claude Code session, 2026-10-11, during the fifth adopt run, after the canon became a directed acyclic graph (DEC-014).

## Intent [assumed]

The view opens as a graph: each node a box coloured by its state, containment drawn as solid edges, and the typed links drawn as labelled edges, dashed for requires, dotted for relates, crossed for conflicts. With nothing selected the graph shows the top level and its children; with a node selected it shows that node's ancestors, siblings and children, every node linked to or from it, and their parents for context, so one branch is read at a time. Clicking a box selects that node. A toggle switches to the nested list, which keeps its search, state filters, flags and expand and collapse controls, and the choice is remembered in the browser. Selecting a node in either mode opens the reading pane with the node's verbatim quotes, its sections with their own state markers, its partition and links, its children, the decisions resting on it, the journey steps that link to it, and its findings. With nothing selected, the pane shows the same plain-text tree the agent sees.

## Not this

A layout that invents a third shape: the graph draws exactly the containment of the folders and the links in the front-matter, nothing inferred.

## Assumptions

- The graph is drawn with Mermaid, already loaded for journeys, so the viewer stays a static page with no build step. (model assumption)
- With nothing selected and more than about forty nodes at the first two levels, only the top level is drawn, with the count of hidden children on each box. (model assumption)
- In the list, top-level branches start expanded and deeper branches collapsed; a heading marker such as `## Not this [assumed]` renders as a badge; the reading pane strips the body's H1; filters and search combine with AND, and a non-matching ancestor is dimmed rather than hidden. (model assumption)
