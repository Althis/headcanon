---
id: REQ-12.1.1
parent: REQ-12.1
title: "Overview: requirements at a glance"
state: assumed
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js]
---

# Overview: requirements at a glance

## Stated

> Requirements at a glance

Source: Claude Code session, 2026-10-11, first bullet of the viewer request.

## Intent

One screen answers "how settled is this canon?" without scrolling into any node. It shows the total number of requirements, the count and share of each certainty state, the number of errors, warnings and pending approvals, how many nodes are not yet measurable, and one row per top-level branch with a stacked bar of its certainty mix. Below that, a short list of the most pressing attention items and the canon's purpose text.

## Not this

A dashboard of code metrics. Every number here is about intent and its certainty, never about lines, coverage or velocity.

## Assumptions

- "At a glance" means counts and shares per certainty state; the agent chose state as the primary lens because the brief's whole model rests on it. (model assumption)
- A branch row shows a stacked bar rather than numbers so thirteen branches can be compared in one look. (model assumption)
- The sentence under the title ("N of M nodes are confirmed by the human") treats stated and resolved as confirmed, and assumed, open and contested as unconfirmed. (model assumption)
- Showing the canon's purpose text at the bottom of the overview keeps the root README visible without a separate page. (model assumption)
