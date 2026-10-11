---
id: REQ-3.14
parent: REQ-3
title: "How is a branch cut?"
state: open
layer: requirement
source: "Claude Code session, 2026-10-11"
---

# How is a branch cut?

## Stated

> This research still didn't turn up a solution for us on how to cut branches. We will work on this on the next turn while you do some implementation work for me remotely.

Source: Claude Code session, 2026-10-11.

## Open

- 2026-10-11: the frameworks researched prescribe completeness and the handling of overlap, but none prescribes how to choose the dimension along which a node decomposes. The agent's proposal, a named dimension per parent that the human approves before any children, is a format for recording the choice, not a rule for making it. What would settle this: a procedure the refine skill can follow to propose a cut, and a way to tell a good cut from a bad one.
