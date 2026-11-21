---
id: REQ-9.14
parent: REQ-9
title: "Binary baselines, tolerance in the canon, drift tracking, approval as intent change"
state: stated
source: "docs/design-brief-v0.md:99"
---

# Binary baselines, tolerance in the canon, drift tracking, approval as intent change

## Stated

> Binary baselines, tolerance in the canon, drift tracking, approval as intent change

Source: docs/design-brief-v0.md:99

## Intent [assumed]

Binary requirements have the baseline "passing", so preservation is one rule: anything worse than its baseline needs approval. Writ compares against the last approved baseline and the original one to surface cumulative drift. Baselines live in the repo and change only through approved commits. In a session the first run of a build round stands in for the baseline: a test that passed then and fails now holds the implementation agent at its stop, and one still failing at the end of the round is reported to the human (DEC-026).

