---
id: REQ-9.7
parent: REQ-9
title: "A hash of a node's Intent and Check pins its tests; a changed hash marks them stale"
state: assumed
source: "docs/design-brief-v0.md:92"
---

# A hash of a node's Intent and Check pins its tests; a changed hash marks them stale

## Proposed in brief

> A hash of the intent package pins its tests; a changed hash marks them stale

Source: docs/design-brief-v0.md:92

## Intent

Each recorded test carries a hash of its node's Intent and Check as they read when the test was written. A node reworded since then marks its tests stale: a stale test is not run, counts as failing, and is written again in the tests step of the next round (DEC-026).

