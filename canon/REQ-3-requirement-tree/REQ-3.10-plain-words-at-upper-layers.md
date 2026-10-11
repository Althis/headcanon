---
id: REQ-3.10
parent: REQ-3
title: "The upper layers of the tree are written in plain words"
state: stated
source: "The Valley adopt session, 2026-10-11"
files: [skills/adopt/SKILL.md, packages/canon/src/rules.ts]
---

# The upper layers of the tree are written in plain words

## Stated

> The language for this is too complicated. What is a statechart? What is combat states with parallel regions? These requirements, specially the top-level ones in the tree should be easy to understand.

Source: The Valley adopt session, 2026-10-11, rejecting a proposed top-level requirement about combat.

## Intent [assumed]

Domains and capabilities are readable by someone who has never seen the code or the design documents. Mechanisms, models and technical vocabulary belong in the requirements below them, and only where the glossary defines the terms used. The brief's own example, "new users get productive without help", is the register for the top of the tree.

## Assumptions

- "Top-level ones" is read as the domain and capability layers, since both exist to be understood before anything is refined. (model assumption)
- A term from the glossary is plain enough at any layer, because the glossary is where the human defined it. (model assumption)
