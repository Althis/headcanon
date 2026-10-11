---
id: REQ-11.6.1
parent: REQ-11.6
title: "Selecting an item in a multi-select is approval, and the human is told so before adoption begins"
state: stated
source: "Claude Code session, 2026-10-11"
files: [skills/adopt/SKILL.md]
---

# Selecting an item in a multi-select is approval, and the human is told so before adoption begins

## Stated

> Selecting an item means it is approved. The human reviewed it and had no issues with it. The agent should also instruct the human on this behaviour when starting an "adopt" session, since supposedly the human hasn't used headcanon before when calling "adopt", so the behaviour of what checking an item means should be clearly stated to the human before we begin.

Source: Claude Code session, 2026-10-11, answering the question whether a multi-select counts as approval.

## Intent [assumed]

A draft the human selects in a multi-select becomes resolved: the agent's wording is the Intent, and the selection, with its date, is the Resolution. Items left unselected are asked about one at a time. Before the first question of an adopt run, the agent states the conventions in one short message: selecting means approved, leaving unselected means it will be asked about one by one, typing in Other corrects or rewrites, and only typed words become stated.

## Assumptions

- The briefing is one message, not a question, and comes right after the silent read, before the overview. (model assumption)
