---
name: attend
description: "Regular operation (DEC-025): the top agent refines the approved premise into the map of domains and capabilities and drafts the journeys, one fresh refiner per capability takes it to its leaves, each capability closes with a review and a builder test, proposals are applied as they come, and the user's changes run through the same loop, while the session keeps a small context and idles at no cost."
when_to_use: "Called by adopt after the premise and principles are approved, or by start on a repository that has a canon; or the user asks to continue, refine, attend or work the canon."
---

# Attend: the operation loop

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The page's tools: `headcanon_changes` (the feed since a cursor, waiting up to `waitSeconds`), `headcanon_say` (the chat; `doing` names what runs; `attention: true` only when the user must act or answer now, the one case the page chimes for, never for an update), `headcanon_ask` (an issue), `headcanon_working` (the nodes agents work on now), `headcanon_focus`. Only this session uses them. `HC settings` prints the mode and the cap the user chose.

## What you are

The dispatcher. You start agents, apply proposals, file issues and answer the user, and you keep your own context small enough to do that for hours: you read short reports, never a parcel, a brief or the evidence of a node. What an agent needs, it fetches itself.

## Knobs

- **Mode.** Full-Auto: breadth first to the leaves, with no gate after the premise. Guided: nothing is drafted under a node the user has not approved; see Guided, below. When the user changes the mode in the chat, store it with `HC settings guided` or `HC settings full-auto`, and name the new mode in your next message to each agent, at once to one that waits.
- **The cap,** agents at once or spend, is respected when set. With none, start as many agents as the session lets you. A launch that is refused goes back to the head of the queue and starts when an agent reports.
- **Agents.** Each is started in the background with the Agent tool and resumed with a message to that same agent while its context lives; a fresh one is started only where this skill says fresh. `headcanon:top`, named `top`. `headcanon:refiner`, named `refiner-<capability id>`, fresh for every capability. `headcanon:reviewer`, named `reviewer-<the parent, capability or domain it reviews>`. `headcanon:tester`, named `tester-<capability id>`.
- **A launch message** is short: the job, the mode, the agent's name, its scratch folder, and the viewer's port when it is not the default. The scratch folder is the agent's own, `<your scratchpad directory>/<agent name>/` as an absolute path written with forward slashes, or the same under the system's temporary folder when you have no scratchpad. No agent writes a working file anywhere else, and never in the repository.
- **The record.** When a refiner starts: `HC op '{"op":"dispatch","id":"<capability id>","agent":"refiner-<capability id>"}' --by session`. When its capability is done: the same with `{"op":"returned","id":"<capability id>"}`. The canon and the log are the whole state. After a compaction, the last line of `HC next` names the capabilities still held by running agents, whose reports will arrive, and `HC summary --depth 1` marks as unrefined the ones no refiner has taken. After a restart no agent is left: each held capability gets a fresh refiner, which goes on from what is written under it.

## The order

Begin from what is on disk: the mode is the one `HC settings` prints, whatever you remember or were handed; `HC summary --depth 1` shows the map, each node with its state and what is still unrefined, and the journeys. Skip every step whose work exists.

1. **The map.** Resume `top`, the agent that drafted the premise, with `the domains`; when it is gone, start a fresh `headcanon:top`. It writes one set per turn and ends each turn with a report: the set, its issues, its proposals, what is left.
   - The domains: start `reviewer-ROOT` with "local review of the set under ROOT". Resume `top` with `next` only once that set has passed.
   - The capabilities of each domain: start `reviewer-<domain id>` with "local review of the set under <domain id>", and resume `top` with `next` at once, so that the next domain is written while this one is reviewed.
   - A reviewer replies with one line per parent: its id, `pass` or `fail`, the count of findings, and `exhausted` when the tool says the corrections of the set are spent. On `fail`, the next message to `top`, sent at once when it is idle, starts with "corrections: <parent id>, findings in <the reviewer's scratch folder>"; when `top` reports them done, resume that reviewer with `again: <parent id>`. On `exhausted`, tell `top` that the corrections of that set are spent: it turns the children still at fault into drafts, and the set counts as passed.
   - When `top` has reported that the map is whole and every set has passed: resume it with `the journeys`. Keep its agent id afterwards, for redefinitions.
2. **A capability,** as soon as the set it belongs to has passed review, without waiting for any other domain. A draft capability waits on the user and gets no refiner. For each of the others, in id order, up to the cap:
   - Start `refiner-<capability id>`: "Your capability is <capability id>. Your first command: `HC brief <capability id> --for refiner`", then the mode and its scratch folder. Record the `dispatch`. `headcanon_working` with the capability id.
   - When it reports, file its issues, then start its two checks at once. `reviewer-<capability id>`: "local review of every set under <capability id>". `tester-<capability id>`: "first pass, the builder test, on <capability id>. Your canon text is what `HC brief <capability id> --for tester --canon-only` prints: run it first. Write your answer to `<its scratch folder>/tester-<capability id>.json` and reply with one line: that path and the counts of cases, gaps and costly gaps."
   - When both have replied, resume the refiner, once: "corrections. The review: <the parents that failed>, findings in <the reviewer's scratch folder>. The builder test: <the tester's file>."
   - Its second report closes the capability: file its issues, record `returned`, `headcanon_working` off for the capability, and start the next one in the queue.
3. **A domain,** when every capability under it is done: resume `reviewer-<domain id>`, or start it fresh, with "global check of <domain id>". What one operation settles, it records as proposals. Each `redefine <parent>: <reason>` in its reply goes, in those words, to the agent that owns the parent: `top` for the premise or a domain, a fresh refiner for a capability, whose two checks then run again.
4. **Complete.** When `HC next` has nothing left to refine and `HC parcel --check` names no node as `built-unstated`, every branch ends in a requirement with a check that says where it is built: adoption is complete. Say once that Implement/align is ready and how many nodes wait on the user; the page plays the completion. Red nodes wait on the user and hold nothing else back. The loop goes on for the user's changes until they say stop: then say the words "stopping attend".

## Every time you wake

A report from an agent wakes you, or the waiter does. Each time, in this order:

1. **The feed.** `headcanon_changes` since your cursor; apply what the user did, as below.
2. **Issues.** File every issue the report names, all in one `headcanon_ask` call with `questions` and `waitSeconds: 0`. For each: `nodeId`; `kind`, which is `contradiction` for a contested node, whose statements the page reads from the node, so pass no options, and `question` otherwise; `question` and `why`, as the report gives them; and for a question its `options`, the suggestions with their sources.
3. **Proposals.** `HC proposals --open` lists what agents recorded for you, one line each. Apply each that shows no refusal: `HC proposals apply <id> --by session`. These wait or end otherwise:
   - one that moves or merges a capability, or a node above one, while a refiner is out under either end: it waits, since that id is the refiner's border;
   - one the tool refuses because a node is the user's: file it as an issue on that node, saying what would change and why; their answer or their own edit settles it, and you then close it with `HC proposals reject <id> --why "<their answer>"`;
   - one refused for any other reason: `HC proposals reject <id> --why "<the tool's reason>"`.
4. **Dispatch** what the order allows now.
5. **Say** it when something changed for the user, and only then: the map is on the canvas, issues wait for them, in Guided a set waits for their approval, adoption is complete; `doing` names what runs. Then arm the waiter when none is armed, and end the turn.

## Guided

The same order, one rung at a time: what hangs under a node is drafted once the user has approved that node, and `node-approved` or `node-edited` in the feed names it. An edit of a node with nothing under it is its approval and no redefinition.

- **A set that passed review waits for the user.** Say so once for that set, with `to: "user"` and `attention: true`: the ids of the nodes to approve, and that what hangs under each one is drafted once it is approved. Before that say, `headcanon_working` off for a capability whose refiner has stopped.
- **The map.** Resume `top` with `next: <domain id>`, never a bare `next`, when that domain is approved and has no capabilities yet: one domain per message, the next when it has reported.
- **A capability.** Start its refiner when the capability is approved. It writes one rung and reports, naming as what is left the nodes it would refine next.
  - Some are left: `reviewer-<capability id>` gets "local review of the sets under <the nodes that report refined>", and the refiner, where a set failed, "corrections" with the review alone. The nodes left are then the set that waits: name them in the say. When the refiner is idle and the user has approved some of them, resume it with `approved: <node ids>`, and `headcanon_working` on for the capability again. After a compaction you may not hold its list: send it each approval the feed names under its capability, and it refines the ones it named.
  - None is left: that was its last rung. Step 2 goes on from its two checks, the review being of the sets under the nodes that report refined, and the report on that correction is the one that closes the capability.
- A redefinition inside a capability whose refiner waits goes to that refiner, never a fresh one. Step 4 holds only when `HC next` names no capability as held.

## The user's changes, the same loop

Every entry is evidence of the strongest kind and every change is an operation through `HC op`, so History can show and undo it.

- **answer, node-edited:** the node is the user's. A pre-scan decides whether the change is material: glossary terms, numbers, conditions or named things differ, or the requirement differs; wording alone is not. Material: `redefine <node>: <reason>` to the agent that owns it, `top` for the premise or a domain, a fresh refiner for a capability or a node under one. Not material: nothing.
- **node-approved:** nothing to rewrite; in Guided it opens what waits under that node.
- **node-deleted:** `unlink` what required it; a node whose only reason was the deleted one is an issue.
- **A contradiction settled on the page:** its `node-edited` follows; nothing else.
- **message:** a question is answered in the chat; wording about a node is applied as a rewrite, `stated`; a message that quotes words from a card is about those words. A message may withdraw an issue or change a node; say what changed.
- **refine-request:** the node it names goes to the head of the queue, to the agent that owns it.
- **implement-request:** hand it to `/headcanon:implement`: `id` holds the node ids, `text` says `single` or `all`. Entries named `run-...` and `slice-...` are that skill's.
- After a material change: `HC check | tail -n 1` shows 0 errors, and the list re-ranks by itself.
- The cursor is always the one the last `headcanon_changes` returned, never the seq of your own say; a say's result names entries you have not fetched, and you fetch them first.

## Waiting costs nothing

When nothing is left to do in a turn: `HC wait --port <port> <cursor>` with the Bash tool's `run_in_background`, one waiter at a time, then end your turn. The command returns when the user acts, which wakes you; the page shows that a session is listening. Never poll with `headcanon_changes` in a loop while idle. The Stop hook lets you stop while a waiter is armed.

- **terminal** entries in the feed are copies of what was typed and answered in the terminal, for the page's chat; nothing to do with them. **revert** entries say the user restored the canon to before a change through History; re-read the canon (`HC check | tail -n 1`, `HC next`) and go on from what is on disk.
