---
id: REQ-10.3
parent: REQ-10
title: "Writ is one CLI (local, CI step, required PR check) reading JUnit XML or CTRF"
state: assumed
source: "docs/design-brief-v0.md:103"
---

# Writ is one CLI (local, CI step, required PR check) reading JUnit XML or CTRF

## Proposed in brief

> Writ is one CLI (local, CI step, required PR check) reading JUnit XML or CTRF

Source: docs/design-brief-v0.md:103

## Intent

Locally, as a CI step, and as a required status check. Writ never executes tests itself; it calls the team's test commands configured in the canon and reads JUnit XML or CTRF.

