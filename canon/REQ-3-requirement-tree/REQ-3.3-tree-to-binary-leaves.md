---
id: REQ-3.3
parent: REQ-3
title: "Requirements form a tree, refined down to binary-measurable leaves"
state: stated
source: "docs/design-brief-v0.md:61; Claude Code session, 2026-10-18"
files: [packages/canon/src/next.ts, packages/canon/src/check.ts, skills/refine/SKILL.md]
---

# Requirements form a tree, refined down to binary-measurable leaves

## Stated

> Requirements form a tree, refined down to binary-measurable leaves

Source: docs/design-brief-v0.md:61

> The end goal of this step still needs to be re-stated: that is to get a graph down so that every leaf is defined enough as to become a binary test. [...] I expect the requirement 1.2.2 Limits in The Valley to have at least 20-40 children under it, but the human could look only up until Limits, and only go further down if something seems wrong, or if they have an interest to do so.

> A win is if the system can successfully reduce unspoken assumptions during the implementation step. That means that whenever the model finally goes to write the code, they shouldn't need to make assumptions, or if they need (which very specific library to use), they can easily document them, and later on those nodes can be contested.

Source: Claude Code session, 2026-10-18, after the sixth adopt run. docs/design-brief-v0.md:272 names the agent being unable to write a binary test for a leaf as the earliest sign that it does not understand what is wanted.

## Intent [assumed]

A leaf is deep enough when its goal is binary: present or absent, or a number reached or not. A node that is not binary yet is simply not a leaf yet, and shows as untested rather than failing.

A leaf carries its contract: a `kind`, binary, numeric or open-ended, and a `## Check` sentence in glossary terms saying what is observed and what counts as yes, which measure, or who judges. The check is written when it can be written without a choice the canon does not make; such a choice is a child of the node instead. A node with neither children nor a kind is a leaf still to cut, and the check and the session context count those.

