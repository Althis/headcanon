---
id: REQ-11.6
parent: REQ-11
title: "Adopting HeadCanon in an existing project starts from the repository's own artifacts"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md, packages/canon/src/init.ts]
---

# Adopting HeadCanon in an existing project starts from the repository's own artifacts

## Stated

> The AGENT that we are going to harness should do this, because that will simulate the situation where a user wants to add headcanon to their ongoing project, and that agent should have a skill or something like that to search the repository for ongoing requirements they can use to get a headstart in the requirement-elicitation task.

> The agent harnessed with the headcanon plugin should be given instructions to search the repo and collect those and work with the human in elicitation and review of  the old artifacts found when it started if a headcanon format document is not already found in the repo.

> The requirement's document was drafted from a Claude agent with my guidance, but the works should be considered assumed.

Source: Claude Code session, 2026-10-11, answers 2 and 5 about The Valley.

## Intent [assumed]

The `adopt` skill runs when a project has no canon. It inventories README, requirements, specification, roadmap and decision files, plus project instructions and test names, and asks the human to confirm each artifact's provenance. It then creates the skeleton with `headcanon init`, elicits the purpose, non-goals and glossary in the human's own words, and proposes a first-level tree as assumed nodes that cite their sources. Depth is added lazily later. Nothing from an existing document becomes stated unless the human wrote it themselves and says so.

## Not this [assumed]

Converting an existing requirements document wholesale into the tree. That would be the agent substituting a document for the human's intent, the first failure mode in REQ-1.1.

## Assumptions

- Provenance is decided per artifact by the human, with the agent's guess as a starting point; "agent-written with the human's guidance" counts as assumed. (model assumption)
- The first-level tree has between five and twelve branches, with at most one level of children at adoption time. (model assumption)
- Decision records found in the repository are proposed as DEC records, assumed, rather than copied or ignored. (model assumption)
