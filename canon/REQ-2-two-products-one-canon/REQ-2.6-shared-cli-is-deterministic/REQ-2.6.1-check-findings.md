---
id: REQ-2.6.1
parent: REQ-2.6
title: "What the check command counts as a problem"
state: assumed
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/check.ts]
---

# What the check command counts as a problem

## Intent

`headcanon check` reports findings at three levels. Errors are broken structure the canon cannot be read through: a duplicate ID, a parent that does not exist, a link from a node, step or decision to an ID that does not exist. Warnings need a decision from the human: a file without an id, a dotted ID whose parent does not match, a listed file missing from the repository, a contested node or section, an assumed node that two or more decisions rest on, a journey with no step table, a step linked to nothing, a decision serving no intent, an unknown origin value, and a branch where unconfirmed nodes outnumber confirmed ones. Notes are things to know: open questions, unconfirmed decisions, a journey without a graph. The command exits non-zero only on errors.

## Not this

Judging whether an intent is well written, or whether the code honors it. Both need a model and belong to Writ (REQ-9).

## Assumptions

- Two decisions resting on one assumption is the threshold for the "assumption carrying many decisions" signal from REQ-5.4. (model assumption)
- Only errors fail the command, so warnings never block a commit hook that calls it. (model assumption)
- A node without `kind` is counted as "not yet measurable" in statistics but is not a finding, per DEC-005. (model assumption)
