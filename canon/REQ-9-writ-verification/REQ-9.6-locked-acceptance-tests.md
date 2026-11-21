---
id: REQ-9.6
parent: REQ-9
title: "Acceptance tests are locked: the agent can run them but not edit them"
state: assumed
source: "docs/design-brief-v0.md:91"
---

# Acceptance tests are locked: the agent can run them but not edit them

## Proposed in brief

> Acceptance tests are locked: the agent can run them but not edit them

Source: docs/design-brief-v0.md:91

## Intent

An implementation agent runs the accepted tests and edits none of them: each accepted test carries the fingerprint of its file, and a test whose file was changed or is gone counts as failing. A test the agent believes wrong is an issue for the human (DEC-026).

