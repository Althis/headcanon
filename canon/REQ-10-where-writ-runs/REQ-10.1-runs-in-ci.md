---
id: REQ-10.1
parent: REQ-10
title: "Writ runs in CI, outside the agent's session"
state: stated
source: "docs/design-brief-v0.md:101"
---

# Writ runs in CI, outside the agent's session

## Stated

> Writ runs in CI, outside the agent's session

Source: docs/design-brief-v0.md:101

## Intent [assumed]

A check run inside the agent's own session is not independent of it. In CI the agent cannot influence the result, and changes made without Claude get checked too.

