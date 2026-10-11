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

> Explain at this point also Premise, Principles, Domains, Capacities and Requirements at the top instead of the bottom, and in a more structured way. Humans are bad at blocks of text, so small bulletpoint lists are best when explaining sucessive  concepts like this.

Source: Claude Code session, 2026-10-11, on the second briefing text.

> Instead of doing everything in one message, please split the first message into an acknowledgement message, and then once you get agreement from the user move forward to the actual approval process.

> Please add the possibility to say "Remind me later during the /headcanon:review" as we had before.

Source: Claude Code session, 2026-10-11, during the fifth adopt run.

## Intent [assumed]

A draft the human selects in a multi-select becomes resolved: the agent's wording is the Intent, and the selection, with its date, is the Resolution. Items left unselected are asked about one at a time. The first question of an adopt run is a briefing written for someone who has never used HeadCanon, with a single option that starts the process: first what is happening (writing down what the project is for, re-read every session), then the five layers as a short bullet list (premise, principles, domains, capabilities, requirements, and the leftovers), then the three choices on every draft as a bullet list, then what ticking means in a list, then that nothing is saved before approval. The first draft, the premise, is the question after it. The exact text lives in the skill and is pasted verbatim. The question that closes a layer offers Nothing missing and Remind me later in review; the latter records the layer as open on the root README, where the review skill picks it up.

## Assumptions

- The briefing is a question with one option rather than a message, because a message between tool calls is skipped and because the human's answer is the agreement to proceed. (model assumption)
