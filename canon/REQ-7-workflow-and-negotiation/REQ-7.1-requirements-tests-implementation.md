---
id: REQ-7.1
parent: REQ-7
title: "Workflow runs requirements → tests → implementation"
state: stated
source: "docs/design-brief-v0.md:64"
---

# Workflow runs requirements → tests → implementation

## Stated

> Workflow runs requirements → tests → implementation

Source: docs/design-brief-v0.md:64

## Intent [assumed]

1. Refine requirements until the part being built has binary leaves. 2. Write the tests from those leaves and journeys, of the kind each check needs: unit, integration, end-to-end, eval. 3. An implementation agent builds one box at a time against its tests. 4. Report what was built against the intents and put it before the human, who approves, sends back or discards; what they approve goes up in a commit in the intent format with the changes to the canon. One box is the unit, and a round over a whole branch runs the same steps (JRN-2, DEC-026).

