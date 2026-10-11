---
id: DEC-010
title: "Skills and the injected rules follow the published skill-authoring guidance, and the rules stay short"
state: assumed
date: 2026-10-11
intents: [REQ-11.2.1, REQ-11.1, REQ-11.6]
---

# Skills and the injected rules follow the published skill-authoring guidance, and the rules stay short

## Why

The injected session context had grown to 9,400 characters against Claude Code's 10,000 cap, and the adopt skill had grown by appending a fix per Valley run. The human asked for consolidation by known-good structure rather than more appending.

The structure adopted, from Anthropic's skill authoring best practices, the Claude Code skills and memory pages, and the prompting best practices:

- The skill opens with a checklist the agent copies and ticks, and every mandatory step has a stop condition ("only proceed when").
- Branches are named decision points with a default action, never "if you think it prudent". The open-domain gap procedure is two explicit questions.
- Each rule carries at most one clause of reason, so the agent generalizes it correctly without narrative.
- Reference material (file formats, question shapes) lives in a second file the skill points to, loaded on demand.
- Three short examples in `<example>` blocks show the register for a domain question, a handled correction and a glossary entry.
- The injected rules are grouped under four headers, one line per rule, under about 2,000 characters, because every line is paid for on every turn and the skills carry the procedures.

Rules are context, not enforcement; behavior that must happen stays in hooks (the commit-msg hook, and later the Stop and PreToolUse hooks).

## Consolidation trigger, added the same evening

The first consolidation was followed by five appends in one afternoon, and the human asked whether consolidation was happening regularly. It was not. The trigger is now explicit: the injected rules stay under 2,000 characters and the adopt skill under 130 lines, and either limit being crossed means consolidate before adding. The first pass of that evening reached 2,541 characters and 149 lines and was wrongly described as under the limits; a second pass the same evening moved the briefing block into the reference file and tightened every rule, bringing both under their limits with every instruction kept.
