---
id: REQ-12.1.2
parent: REQ-12.1
title: "Tree: the full requirement tree with a reading pane"
state: assumed
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js, packages/canon/src/tree.ts]
---

# Tree: the full requirement tree with a reading pane

## Stated

> The full requirement tree

Source: Claude Code session, 2026-10-11, second bullet of the viewer request.

## Intent

Every requirement is reachable in one collapsible tree, in the order of its ID, with its state badge, its kind when it has one, and a flag when it carries non-informational findings. Search and state filters narrow the tree while keeping the ancestors of every match visible, so context is never lost. Selecting a node opens a reading pane with the node's verbatim quotes, its sections with their own state markers, its children, the decisions resting on it, the journey steps that link to it, and its findings. With nothing selected, the pane shows the same plain-text tree the agent sees.

## Not this

A graph or mind-map layout. The tree is a tree; the folder structure and the text tree are the same shape, and the viewer should not invent a third.

## Assumptions

- Top-level branches start expanded and deeper branches start collapsed, so the first view fits on one screen. (model assumption)
- A heading marker such as `## Not this [assumed]` renders as a badge on the heading, which is the viewer's reading of REQ-5.3.3. (model assumption)
- The reading pane strips the body's H1 because the title is already shown. (model assumption)
- Filters and search combine with AND, and a non-matching ancestor is dimmed rather than hidden. (model assumption)
