---
id: DEC-012
title: "Skill examples never come from the project the skill is being tested on"
state: assumed
date: 2026-10-11
intents: [REQ-11.4, REQ-11.6, REQ-11.2.1]
origin: side-effect
---

# Skill examples never come from the project the skill is being tested on

## Why

The consolidated adopt skill carried four examples written from The Valley: the three domains by name, the Effect and Trait glossary split, a correction about questline counts, and an inline sentence that a game with its own engine and editor needs content, engine and editor. The third Valley run then produced exactly those domains and a clean glossary, and the human noticed. Those results are not evidence of the skill working; the answers were in the prompt.

The examples were written from the freshest material to hand, which was the test project. That is a side effect of iterating on the skill and the test in the same day, not a misreading of intent, so the origin is side-effect. From now on every example in a skill uses an invented product (Ledgerline, a desktop app that turns bank statements into tax reports) or one the human supplied from outside the test, and a check before each test run greps the skills for the test project's name and vocabulary.

Run 3's overview, non-goals and question mechanics remain valid evidence; its glossary and domain steps do not, and the next run is the first real test of both.
