---
id: REQ-8.6
parent: REQ-8
title: "The agent changes the canon only through create, update and delete requests; a create carries a full node"
state: stated
source: "docs/design-brief-v0.md:84"
---

# The agent changes the canon only through create, update and delete requests; a create carries a full node

## Stated

> The agent changes the canon only through create, update and delete requests; a create carries a full node

Source: docs/design-brief-v0.md:84

## Intent [assumed]

Every change an agent makes to the canon is an operation the tool applies, checks and logs; no agent edits a canon file by hand. What an agent may apply depends on its role (DEC-026): a refiner writes inside its own capability and proposes what belongs elsewhere, which the session applies, asking the human when an approved box is involved; an implementation agent adds guessed child boxes marked as the builder's, live on the page at once, and issues, nothing else; a tester adds journeys, notes and guessed boxes under its capability.

