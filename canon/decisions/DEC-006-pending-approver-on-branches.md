---
id: DEC-006
title: "Commits awaiting review carry `Approved-By: pending (...)`"
state: assumed
date: 2026-10-11
intents: [REQ-8.5.1, REQ-8.7]
origin: obstacle
---

# Commits awaiting review carry `Approved-By: pending (...)`

## Why

REQ-8.5.1 requires Approved-By on any Intent-Change, but a commit on a branch that is awaiting review has no approver yet, and the brief says a PR merge is the approval. Writing a real name there would be false. Until the rule is settled, the trailer carries `pending` plus how approval is being sought, and the merge to main supplies the approval. This gap surfaced while seeding this canon, and it is the first caught divergence: an obstacle, not a misreading.
