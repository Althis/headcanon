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

> This text is confusing. [...] If this is the text the agent pastes to the user Verbatim you need to find a set that is easier as an explanation of what we are doing. Supposedly this is the user's first time using headcanon, so the explanation should be better.

Source: Claude Code session, 2026-10-11, on the first briefing text.

## Intent [assumed]

A draft the human selects in a multi-select becomes resolved: the agent's wording is the Intent, and the selection, with its date, is the Resolution. Items left unselected are asked about one at a time. The first question of an adopt run opens with a briefing written for someone who has never used HeadCanon: first what is happening (writing down what the project is for, re-read every session), then the three choices on every draft, then what ticking means in a list, then that nothing is saved before approval, then the order of the steps. The exact text lives in the skill and is pasted verbatim.

## Assumptions

- The briefing is one message, not a question, and comes right after the silent read, before the overview. (model assumption)
