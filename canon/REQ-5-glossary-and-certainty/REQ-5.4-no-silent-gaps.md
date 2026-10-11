---
id: REQ-5.4
parent: REQ-5
title: "The agent never fills a gap silently"
state: assumed
source: "docs/design-brief-v0.md:190"
---

# The agent never fills a gap silently

## Proposed in brief

> The agent is responsible for keeping this map honest. It never fills a gap silently: proceeding on an interpretation creates a visible assumed entry. Open items are resolved when a decision depends on them, and an assumption carrying many decisions is a signal to ask.

Source: docs/design-brief-v0.md:190

## Intent

Proceeding on an interpretation creates a visible assumed entry. Open items are resolved when a decision depends on them. An assumption carrying many decisions is a signal to ask.

