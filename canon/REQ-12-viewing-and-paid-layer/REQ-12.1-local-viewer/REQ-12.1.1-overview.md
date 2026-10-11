---
id: REQ-12.1.1
parent: REQ-12.1
title: "Overview: requirements at a glance"
state: assumed
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js, packages/canon/src/snapshot.ts]
---

# Overview: requirements at a glance

## Stated

> Requirements at a glance

Source: Claude Code session, 2026-10-11, first bullet of the viewer request.

> Take the glossary out of the Purpose statement in the overview. Make "Needs your attention" a warning bar at the top of the page. Separate the tiles at the top of the overview by type because right now they are too confusing all bunched up together.

Source: Claude Code session, 2026-10-11, after the first review of the viewer.

## Intent

One screen answers "how settled is this canon?" without scrolling into any node. A warning bar at the very top says how many items need the human and names the blocking groups, and links to the Attention view; when nothing waits, the bar says so. Below the title, the tiles are grouped by type, each group with a label and a one-line hint: Requirements (total, measurable, not yet measurable), Certainty (one tile per state with its share), Findings (errors, warnings, notes), Approvals (pending, unmerged intent changes, uncommitted edits), and Other records (journeys, decisions, glossary terms). Then one row per top-level branch with a stacked bar of its certainty mix, and finally the canon's purpose text without its Glossary section, which has its own page.

## Not this

A dashboard of code metrics. Every number here is about intent and its certainty, never about lines, coverage or velocity.

## Assumptions

- The five tile groups and their membership are the agent's cut; the human asked for separation by type without naming the types. (model assumption)
- The warning bar counts the same blocking groups as the Attention tab badge: pending approvals, unmerged intent changes, uncommitted edits, broken links, contested items, open questions and unconfirmed decisions. (model assumption)
- The bar is amber when anything waits and green when nothing does, reusing the assumed and stated colors rather than adding new ones. (model assumption)
- A branch row shows a stacked bar rather than numbers so thirteen branches can be compared in one look. (model assumption)
- The sentence under the title ("N of M nodes are confirmed by the human") treats stated and resolved as confirmed, and assumed, open and contested as unconfirmed. (model assumption)
- The purpose text keeps the root's Stated, organization and Not this sections and drops only the Glossary. (model assumption)
