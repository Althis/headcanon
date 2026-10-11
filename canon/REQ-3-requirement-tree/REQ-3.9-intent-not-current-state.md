---
id: REQ-3.9
parent: REQ-3
title: "The canon records intent, never current state"
state: stated
source: "The Valley adopt session, 2026-10-11"
files: [skills/adopt/SKILL.md, packages/canon/src/rules.ts]
---

# The canon records intent, never current state

## Stated

> Don't keep current data on long-term canon. There is no need to mention the questlines that we have right now, otherwise it would become part of the definition and requirement for the game that we have exactly 15 questlines. The number of questlines is variable and can go up and down with development.

Source: The Valley adopt session, 2026-10-11, correcting a proposed top-level requirement that cited "15 questlines, 6 major".

## Intent [assumed]

Counts, versions, implementation status and descriptions of what exists today are facts that change with development. They never enter a canon node, because a node is read as a definition: a count written there becomes a requirement to have exactly that count. The node records the intent the fact serves ("the world has questlines that link to one another"); the fact itself lives in the code, the tests or a status document. Baselines (REQ-9.12) are the one place numbers belong, and they live in their own records, not in the node's intent.

## Not this [assumed]

Banning numbers that are intent, such as a performance budget the human set. A number is current state when it describes what is, and intent when it describes what must be.

## Assumptions

- Generalized from one correction about questline counts to all counts, versions and statuses. (model assumption)
- Applies to every layer of the tree and to decisions; a decision may cite the state it was made in, as context, not as intent. (model assumption)
