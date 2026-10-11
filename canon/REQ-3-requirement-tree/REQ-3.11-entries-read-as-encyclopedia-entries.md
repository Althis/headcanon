---
id: REQ-3.11
parent: REQ-3
title: "Every canon entry reads as a dictionary or encyclopedia entry, complete without the conversation"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/rules.ts, skills/adopt/SKILL.md, skills/adopt/reference.md, skills/capture/SKILL.md, skills/review/SKILL.md]
---

# Every canon entry reads as a dictionary or encyclopedia entry, complete without the conversation

## Stated

> Instead of changing the correction behaviour, make the rule better represent what these definitions should be: they should contain concise and to the point information about something IS. They should not include correction information, and they should not include NOTs. They should be like an entry in a dictionary or encyclopedia, made to be read without context of any other conversation. They form the project's Bible. For this definition, give examples of what to not do and why they are incorrect. Do not tailor the examples for TheValley.

Source: Claude Code session, 2026-10-11.

> Once again you over-corrected. Remove the last sentence please.

Source: The Valley adopt session, 2026-10-11, after the agent wrote the human's explanation of a correction into the non-goal being corrected.

## Intent [assumed]

An entry is any text the canon holds as the definition of something: a node's intent, a glossary definition, a principle, a non-goal. It is read later by someone who was not in the conversation that produced it, so it says what the thing is, concisely, and nothing else. It carries no history of how it was corrected, no reasons, no "not" clauses, no reference to drafts or replies, and one concept only. Exclusions live in a Not this section, where a reader meets them as exclusions. Reasons live in decision records. History lives in git.

The rule replaces a rule about how the agent handles corrections: the entry is the unit that must be right, and a correction is handled correctly when the resulting entry still reads this way. The adopt skill's reference file carries seven wrong examples, each with the reason it is wrong and the entry as it should be, written for an invented product so that no test project's answers appear in the skill.

## Not this [assumed]

Stripping the Stated section. A verbatim quote of wording the human typed is provenance, kept beside the entry, and it is the one place the conversation is allowed to show.

## Assumptions

- "Definitions" in the human's words covers every entry type, since non-goals, principles and intents are read the same way. (model assumption)
- A correction typed as an instruction is applied and not recorded in the node; only typed wording is quoted. This narrows REQ-5.3.1, where an earlier note had the correction quoted. (model assumption)
