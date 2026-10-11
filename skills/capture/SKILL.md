---
name: capture
description: "Turn what this conversation has established into a canon change request. Collects the human's exact words as stated items, the agent's interpretations as assumed, unknowns as open and disagreements as contested, then proposes create, update and delete operations for the human to approve before any file changes. Use after a requirements discussion, before implementing, or whenever intent was discussed and the canon does not yet reflect it."
when_to_use: "Intent was discussed in this session and the canon does not reflect it yet; before starting implementation of something new; the human asks to record, capture or update requirements."
---

# Capture intent from the conversation

`HC` below means: `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`.

## 1. Read the current canon

Run `HC summary` to see the tree and `HC check` for its state. Read the nodes the conversation touched. Do not propose a create for something that exists; propose an update.

## 2. Sort what was said

Go through the conversation since the last capture and sort every piece of intent into one of four bins:

- **Stated**: the human's own words. Copy them exactly, including typos. Note where they said it.
- **Assumed**: your reading of what they meant, or a detail you decided because nothing above it forbids it. Say which human statement it rests on.
- **Open**: something a decision will depend on that nobody has settled.
- **Contested**: something the human and you disagree about. Record both positions.

A single human sentence often yields one stated item and several assumed ones. Keep them apart.

## 3. Write the change request

List the operations, one per line:

- `create <ID>`: a full node. Choose the ID from the parent's next free number. Front-matter: `id`, `parent`, `title`, `state`, `source`, and when known `kind` (`binary`, `numeric`, `open-ended`), `steps` (journey steps this serves), `files` (code that will implement it). Body sections: `## Stated` with the verbatim quote and `Source:` line, `## Intent` (your reading; mark it `[assumed]` when the node is stated), `## Not this`, `## Assumptions` as a list where each item ends with `(model assumption)`, `## Open` for known unknowns.
- `update <ID>`: only the fields and sections that change, plus one line of reason. Appending a new stated quote to a node is an update.
- `delete <ID>`: a retirement, with a reason. The file stays; its `state` and a `## Retired` section record why.
- Glossary terms are `create TERM-<slug>` / `update TERM-<slug>` in the root README.
- Decisions made in the conversation are `create DEC-NNN`, with `intents` linking the nodes they serve and, if the decision came from a caught divergence, `origin: misread | obstacle | side-effect`.

Before showing the request, judge every created or updated requirement against the principles in the root README (`## Principles`, `PRN-n` entries). For each one that drifts from a principle, add a line to the request naming the principle and why, and offer the human the choice: amend the requirement, amend the principle (an intent change in its own right), or reject the item. Drift is never applied silently.

Show the whole request to the human. Ask them to approve, amend or drop items. A node whose state you set to `stated` must contain their quote; if you cannot quote, it is `assumed`.

## 4. Apply only after an explicit yes

Words that mean agreement ("yes", "approved", "go ahead", "that's right") let you write the files. "Looks fine", silence, or moving on do not. If they approve some items and not others, apply only those.

Write the files, run `HC check`, fix errors, run `HC summary` and show the affected branch.

## 5. Commit

Use `/headcanon:commit`. The message carries `Intent:` for the nodes served, one `Intent-Change:` per operation, `Decision:` per decision added, and `Approved-By:` with the human's git user.name when they approved in this conversation.

## Rules

- Never upgrade a status. A stated item stays stated; an assumed item becomes resolved only through `/headcanon:review` or the human's explicit words in this conversation, which you then quote under `## Resolution`.
- Never fill a gap silently. If you proceeded on an interpretation earlier in the session, it must appear here as assumed.
- An assumption that several decisions now rest on is a reason to ask, not to proceed.
