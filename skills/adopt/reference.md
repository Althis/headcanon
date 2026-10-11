# Adopt: reference

Formats the adopt skill writes. Use the Write tool, one file per call; shell heredocs fail on quoting.

## Contents

1. Root README
2. Requirement node
3. Adoption scope decision
4. Question shapes

## 1. Root README (`canon/README.md`)

```markdown
---
id: ROOT
title: "<Project> canon"
state: stated | resolved
source: "conversation, <date>"
---

# <Project> canon

<One paragraph: what this folder is; seeded by /headcanon:adopt on <date>.>

## Stated
> <the human's typed words, verbatim, one blockquote per statement>
Source: conversation, <date>

## Intent
<approved drafts for what it is and the purpose>

## Resolution
<option chosen and date, when approved as written>

## Not this
- <non-goal> (source)

## Principles
**PRN-1 <Title>**: <statement>. Source: <path:lines or conversation, date>

## Glossary [assumed]
**<term>** (`TERM-<slug>`): <definition>
```

`state` is `stated` when the purpose was typed by the human, `resolved` when approved as written. Remove `[assumed]` from the Glossary heading only when every term was approved.

## 2. Requirement node

A node with children is a folder: `canon/REQ-1-<slug>/README.md`. A leaf is a file: `canon/REQ-1-<slug>/REQ-1.1-<slug>.md`. Slugs are short and lowercase.

```markdown
---
id: REQ-1.2
parent: REQ-1
title: "Plain-language title"
state: stated | resolved | assumed | open | contested
source: "path:lines, or: conversation, <date>, or: archetype"
kind: binary            # only when the node is already a yes-or-no check
---

# Plain-language title

## Stated
> <verbatim typed words, when any>
Source: conversation, <date>

## Intent [assumed]
<one or two sentences; drop "[assumed]" from the heading when the node is not stated>

## Resolution
<option chosen and date, when approved as written>

## Not this
<when an artifact or the human made one clear>

## Assumptions
- <what you decided> (model assumption)

## Open
- <date>: <what would settle it>
```

An open domain or capability is a node whose `state` is `open` and whose title is the question, for example "How are duplicate transactions detected?".

## 3. Adoption scope decision (`canon/decisions/DEC-001-adoption-scope.md`)

```markdown
---
id: DEC-001
title: "What adoption left out of the canon"
state: resolved
date: <date>
intents: [ROOT, REQ-1, REQ-2]
---

# What adoption left out of the canon

## Dropped threads
- <thread> (<path:lines>): <the human's reason>
- <artifact> entirely: <the human's reason>
```

## 4. Question shapes

Single draft:

```json
{"questions":[{"header":"<Step>","question":"<STEP>. Draft:\n\n\"<draft>\"\n\nSource: <source>. To correct or rewrite, type in Other.","multiSelect":false,
  "options":[{"label":"Approve as written","description":"Enters as resolved."},{"label":"Drop","description":"Left out; recorded in DEC-001 if it came from an artifact."}]}]}
```

List first pass:

```json
{"questions":[{"header":"<Step>","question":"<STEP>. Select every item that is right as written; each unselected item is asked about next, one at a time.","multiSelect":true,
  "options":[{"label":"<ID or term> <title>","description":"<one line>. (<source>)"}]}]}
```

Keep four options or fewer per question; split longer lists across questions in the same call.
