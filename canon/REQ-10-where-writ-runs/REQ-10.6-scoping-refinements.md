---
id: REQ-10.6
parent: REQ-10
title: "Links are many-to-many; unlinked changes are flagged; E2E and per-release runs stay unscoped"
state: assumed
source: "docs/design-brief-v0.md:107"
---

# Links are many-to-many; unlinked changes are flagged; E2E and per-release runs stay unscoped

## Proposed in brief

> Links are many-to-many; unlinked changes are flagged; E2E and per-release runs stay unscoped

Source: docs/design-brief-v0.md:107

## Intent

A changed file with no link is itself a finding: likely new work not documented in the canon. Scoping applies only to the expensive model-based checks.

