---
name: review
description: "Walk the canon's assumed, open and contested items with the human, one at a time, so each becomes resolved (with the human's words quoted), stays open, or is recorded as contested. Use when the human wants to review assumptions, settle open questions, or approve what the agent proposed; or when an assumed item has become decisive for the next step."
when_to_use: "The human asks to review, confirm or settle canon items; an assumed item is about to drive an implementation decision; the session context lists contested or open items."
argument-hint: "[REQ-id or branch to review, or 'all']"
---

# Review assumed, open and contested items

`HC` below means: `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`.

## 1. Build the list

Run `HC attention --json` and `HC summary`. Collect, in this order: contested items, open questions (open nodes and the `## Open` lines of the root README, where adoption parks a layer the human wanted to revisit), decisions with state assumed, then assumed requirements. If the human named a branch or ID, restrict to it. Tell the human how many items there are and ask how many they want to go through now; default to five.

## 2. One item at a time

For each item:

1. Show the node: ID, title, the current state, the quote it rests on (if any), your interpretation, and what depends on it (decisions, journey steps, children).
2. Ask one question that a yes or a no, or one sentence, can answer. For an assumed item: "Is this what you mean?" For an open item: the question itself. For a contested item: restate both positions and ask which stands, or whether a third does.
3. Wait for the answer. Do not batch several items into one question unless the human asked for speed.

## 3. Record the outcome

- **Explicit agreement** ("yes", "correct", "approved", "that's it"): set `state: resolved`, add `## Resolution` with the human's words quoted verbatim and the date. If they agreed with a correction, quote the correction under `## Stated` and keep your original reading under `## Intent [assumed]` only if it still adds something.
- **Correction without full agreement**: apply exactly what the correction names and show the result. The entry must still read as an encyclopedia entry for someone who never saw this conversation, so neither the correction nor its reasons enter the text. If they typed the wording itself, quote it as stated; otherwise keep `state: assumed` for whatever remains yours.
- **Disagreement**: set `state: contested`, add `## Contested` with both positions in two short paragraphs. Do not argue past one round; record and move on.
- **"Not now" or "I don't know"**: keep or set `state: open`, add a line under `## Open` with the date and what would settle it.
- **Tacit approval never counts.** If the human skips an item, says "fine" without engaging, or changes the subject, leave the state as it was.

Do not edit anything the human did not speak to.

## 4. Decisions that rest on changed intent

When a resolved or contested item changes meaning, list the decisions linked to it (`intents` in `canon/decisions/*.md`) and tell the human those decisions should be re-read. Do not re-decide them yourself.

## 5. Verify and commit

Run `HC check`, then `/headcanon:commit` with one `Intent-Change: update <ID>` per changed node and `Approved-By:` with the human's git user.name, since they approved in this conversation.

## 6. Report

Say how many items became resolved, how many stayed open, how many are contested, and what is left for next time.
