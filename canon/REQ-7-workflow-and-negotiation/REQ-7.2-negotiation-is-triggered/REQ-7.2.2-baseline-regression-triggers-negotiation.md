---
id: REQ-7.2.2
parent: REQ-7.2
title: "A baseline regression found in the session triggers negotiation"
state: assumed
source: "docs/design-brief-v0.md:77"
---

# A baseline regression found in the session triggers negotiation

## Proposed in brief

> A baseline regression found in the session triggers negotiation

Source: docs/design-brief-v0.md:77

## Intent

A test that passed in the first run of a build round and fails now is a regression. The stop gate holds the implementation agent whose work caused it, and a test still failing at the end of the round is shown to the user, who decides (DEC-026).

