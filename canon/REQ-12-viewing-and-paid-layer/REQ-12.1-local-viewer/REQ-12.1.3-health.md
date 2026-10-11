---
id: REQ-12.1.3
parent: REQ-12.1
title: "Health: problematic branches and their children"
state: assumed
source: "Claude Code session, 2026-10-11"
files: [packages/canon/public/app.js, packages/canon/src/check.ts]
---

# Health: problematic branches and their children

## Stated

> problematic branches and children

Source: Claude Code session, 2026-10-11, third bullet of the viewer request.

## Intent

Branches are ranked by how much they need the human: errors first, then warnings, then the share of nodes that are assumed, open or contested. Each branch card shows its certainty mix, its findings, and an expandable list of its unconfirmed children, so the problematic children are visible under the branch that owns them. Below the cards, every finding is listed with level filters. What counts as a problem is defined once, in the check command, and described in REQ-2.6.1.

## Not this

A test results page. Health here is about the canon's own consistency and certainty, not whether the code passes.

## Assumptions

- "Problematic" is an ordering, not a threshold: there is no single bad/good verdict per branch, only a sort and the counts behind it. (model assumption)
- Errors and warnings show by default; notes are hidden until the human asks, since they are not actionable. (model assumption)
- A branch where unconfirmed nodes outnumber confirmed ones gets a warning of its own, so a branch can be flagged even with no broken links. (model assumption)
