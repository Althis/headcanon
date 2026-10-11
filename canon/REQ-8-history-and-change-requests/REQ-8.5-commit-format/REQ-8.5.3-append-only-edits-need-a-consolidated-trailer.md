---
id: REQ-8.5.3
parent: REQ-8.5
title: "An edit that only adds lines to a rules, skill or canon file needs a Consolidated trailer"
state: stated
source: "Claude Code session, 2026-10-11"
files: [packages/canon/src/commit-msg.ts, skills/commit/SKILL.md]
---

# An edit that only adds lines to a rules, skill or canon file needs a Consolidated trailer

## Stated

> The behaviour you just had(appending instead of reviewing and consolidating suggestions) is also common for LLMs, please suggest a way to control that in the plugin

> Lets go with 2.

Source: Claude Code session, 2026-10-11, choosing among six options; option 2 was append detection in the commit hook.

## Intent [assumed]

The commit-msg check reads the staged diff. A modified file under `canon/` or `skills/`, or the rules source, whose diff adds lines and removes none is an append-only edit, the shape of the failure mode where feedback is added beside existing text instead of merged into it. Such a commit is rejected unless its message carries a `Consolidated:` trailer saying what was compared or merged. New files are exempt, because a new node is a legitimate pure addition. A trailer too short to say anything draws a warning.

The trailer is a conscious statement the human can read in the log; it does not prove a merge happened. Semantic duplication, the same idea written twice in new words, is left to a later reviewer.

## Assumptions

- The threshold is eight added lines, so a one-line fix passes without ceremony. (model assumption)
- The watched paths are fixed for now; a project that keeps its canon elsewhere needs the paths made configurable. (model assumption)
