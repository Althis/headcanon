---
id: REQ-2.6
parent: REQ-2
title: "The shared canon CLI never calls a model"
state: resolved
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src]
---

# The shared canon CLI never calls a model

## Intent

The layer under both products is the file format plus a small CLI with check, summary and render commands. It parses files, validates IDs and links, and renders views. HeadCanon's intelligence is Claude Code itself, through skills and subagents. Writ's intelligence is the Anthropic API with the user's key.

## Not this

Contradiction and glossary-conflict checks. Those need a model and belong to Writ.

## Resolution

> For 10 I think you are correct, it is deterministic.

Claude Code session, replying to the question of whether the shared CLI ever calls a model. Resolved 2026-10-11.

