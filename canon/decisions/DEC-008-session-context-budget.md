---
id: DEC-008
title: "The session context fits Claude Code's 10,000-character hook limit by shallowing the tree, never by dropping the rules"
state: assumed
date: 2026-10-11
intents: [REQ-11.1, REQ-6.2]
origin: obstacle
---

# The session context fits Claude Code's 10,000-character hook limit by shallowing the tree, never by dropping the rules

## Why

Claude Code caps the context a hook can add at 10,000 characters; over that, it writes the text to a file and hands the agent a path and a short preview, which defeats the purpose of a summary that is read every session. HeadCanon's own tree, 110 nodes, is about 11,000 characters on its own.

The context therefore has a fixed part that is always present (header, what waits on the human, the glossary with definitions trimmed, the rules) and a tree that degrades in steps: the full tree, then two levels, then one level, then a cut of the top level. Each step says how to see the rest with `headcanon summary`. This is a caught divergence of the obstacle kind: the brief's "text tree inside the agent" (REQ-6.2) cannot be injected whole past a few dozen nodes.
