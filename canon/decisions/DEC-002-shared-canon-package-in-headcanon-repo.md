---
id: DEC-002
title: "The shared canon package lives in the headcanon repository"
state: resolved
date: 2026-10-11
intents: [REQ-2.6, REQ-2.7]
---

# The shared canon package lives in the headcanon repository

## Resolution

> For 10 I think you are correct, it is deterministic.

Claude Code session, 2026-10-11.

## Why [assumed]

With two repositories, the shared layer has to live in one. HeadCanon is first and uses it from day one, so it ships from there as an npm package under `packages/canon`, and Writ depends on that package.
