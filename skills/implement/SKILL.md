---
name: implement
description: "Builds what the canon says and the code does not, for one node or for a whole canon: readiness, tests of the kind each node calls for, a first run that sets the marks, then implementation agents one at a time on the session's model, held only at their stop and at their commits; the user decides on every built node at the end."
when_to_use: "The feed carries an implement-request (the user pressed Implement this on a node, or Implement/align); or the user runs /headcanon:implement, with node ids or none, or asks to implement, build or align nodes of the canon."
argument-hint: "[node ids; none means every node]"
---

# Implement: build and align, one node or all of them

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`, run in the repository. The page's tools are this session's alone: `headcanon_changes` (the feed since a cursor), `headcanon_say` (the chat; `attention: true` only when the user must act now), `headcanon_ask` (an issue), `headcanon_working` (the nodes agents work on now). `HC settings` prints the cap on agents at once.

## What holds at every size

- **One sequence.** "Implement this" on one node and Implement/align on a whole canon run the same steps; only the scope differs.
- **A slice** is one node to build or to align, with the nodes below it. One implementation agent builds one slice.
- **Guessed and approved nodes are built alike.** Only red nodes, drafts and contested ones, are left out. They wait on the user and hold nothing else back.
- **Nobody waits for the user before the end.** Their decisions arrive through the feed: read it after every wait and after every agent's return.
- **The page says the steps.** Signal each one with `HC run step <name> running`, then `HC run step <name> done --note "<what was measured>"`; the run card shows it. A step with nothing to do is still marked done, or the run never shows its build as finished. Yours are `readiness`, `tests` and `first-run`; `prepare`, `build` and `review` follow by themselves.
- **You speak in the chat** when the run starts, when a round ends, and when a command refuses, with its reason and the way out. Short sentences, present tense, about their canon, ending with what they can do. A count you say is one a command printed.
- **The page follows the work.** `headcanon_working` with the capability or the node an agent has: on when it starts, off when it returns.
- **Your context stays small.** You dispatch, run commands and read reports. Agents read the canon and the code.

## The steps

1. **Scope and start.**
   - The scope is the node ids of the request: `id` of the `implement-request` entry, or what was typed after `/headcanon:implement`. No id means every node; `text` is `single` when one node was asked for. The page is open when the request came from it; otherwise `headcanon_open`, once.
   - What the user has not committed stays theirs. `HC run start` refuses while a tracked file outside the canon folder has uncommitted changes, since the build would sweep them up: say its reason and stop, so they commit it or set it aside. Untracked files of theirs are left alone and remembered.
   - `HC run start <ids> [--single]`. It moves to the build branch `headcanon/build`, commits the canon there when git does not hold it yet, creates the run with its slices, and prints the counts.
   - It refuses when a run is still active or when nothing in scope can be built. Say its reason and stop.
   - Say what will run: "Implementing Closing a month: <n> nodes to test, <n> to build, <n> to align. <n> wait on you and are left out."
2. **Readiness** (`readiness`): could a builder who has only the canon test and build each node, without inventing what others depend on?
   - It is asked of each capability whose text is new, or has changed since it was last tested: one that holds, in scope, a node with a Check and no accepted test, or a stale one. `HC tests list` shows what is recorded, for the whole canon or under one id.
   - For each, a `headcanon:tester` named `tester-<capability id>`, first pass. Its brief: the pass, the output of `HC brief <capability id> --for tester --canon-only`, and the nodes in scope when the scope is narrower than the capability. First passes write nothing, so they run together, up to the cap.
   - It answers with cases and gaps. The gaps go to the capability's refiner, a `headcanon:refiner` named `refiner-<capability id>`, briefed with the output of `HC brief <capability id> --for refiner` and the gaps. It closes each one in the canon through operations, as in adoption, review included.
   - A costly gap the evidence does not settle becomes a draft node: file its question with `headcanon_ask`, `waitSeconds: 0`. The rest become assumptions. There is no second round: a node still open is red and left out.
3. **Tests** (`tests`), for the same capabilities.
   - The tester's second pass: the same agent resumed, or a fresh one given its cases, with the brief printed again, since the text may have changed. It writes the test files, records each with a description in plain words, and runs them. One second pass at a time: a test run checks that the repository is left as it was found.
   - Then a `headcanon:reviewer` per capability, its brief naming each node with its recorded tests. It records a verdict per node with `HC tests review`. A fail goes back to the tester as a correction naming the node, the test and the finding.
   - After two corrections, a third fail leaves the node untested: remove the rejected test's file and, when the node has a slice, take it out of the build with `HC run slice <node> stopped --note "no accepted test"`.
   - `HC build tests <ids> --with=<path,path>` commits the accepted tests on the build branch, with the helpers and the runner's configuration the testers' reports name. `git status --short` then shows nothing new outside the canon folder.
4. **The first run** (`first-run`).
   - `HC tests run` runs every accepted test and stores the result beside the canon. The page now shows the marks: not built, out of sync.
   - A test it reports as stale has a node reworded since: steps 2 and 3 again for that capability, then this run again.
   - The baseline is the project's own tests as they pass today. Run the test command its documentation or configuration names, under a time limit, its report written outside the repository. Keep the command and the names of the passing tests in `baseline.json`, in the `headcanon` folder of the git directory. A project with no tests of its own has an empty baseline.
   - `HC run step first-run done` keeps the tests that pass today and settles the slices: a node that turned out fine leaves, a node the tests showed out of sync joins. `HC run status` lists them in build order.
5. **Build:** one implementation agent at a time, in the order `HC run status` lists, which follows the `requires` links. For each queued slice:
   - `HC run slice <node> building`.
   - Its brief is the output of `HC brief <node> --for implementer --run <run id>`, whole and unchanged, its first line first: the stop gate knows the agent by that line. Add `--port <port>` when the page is not on the default port, so that the agent's issues reach it. The user's note or answer, when there is one, goes after the brief.
   - Start a `headcanon:implementer` with the Agent tool, in the background, and name no model on the call: the agent type takes the session's model, and a model on the call would replace it.
   - `HC run slice <node> building --agent <agent id>` as soon as the call returns the id. Then arm the waiter (Rules) and end the turn.
   - When it returns: `HC run check <node>`. It runs the slice's tests again and reads its commits; its verdict counts, never the agent's word.
     - **pass:** the slice has passed. Put it before the user with what they read on its card: `HC run slice <node> review --summary "<what the product does now, and what was assumed, in plain words>"`. A slice left as passed is never shown to them.
     - **blocked:** what fails waits behind the agent's own issues. Go on.
     - **fail:** resume the same agent once, with `SendMessage` to its agent id and what the check printed. If it fails again, file one issue per node still failing, or on the slice's own node when no test fails and its commits or its tree do: `headcanon_ask` with `kind: "impossible"`, `nodeId` the node, `by` the agent's name (`implementer-<the slice's node>`), `blocks: true`, `waitSeconds: 0`, the question saying what was tried and what stands in the way, the ways out as options. Then `HC run slice <node> blocked`.
   - A slice that requires a node which did not pass is not started: `HC run slice <node> blocked --note "waits on <id>"`. It is `queued` again when that node passes.
6. **The user's decisions,** whenever the feed brings them:
   - `slice-approved`: the page has done it: the code is bound to the node and the canon committed under their name. Nothing to do.
   - `slice-discarded`: the page has reverted the slice's commits. `HC tests run <node>`, so that its mark follows.
   - `slice-sent-back`: `text` is their note. A fresh agent on that node as in step 5, the note after the brief.
   - `answer` that carries `blocks`: apply it to the canon as `/headcanon:attend` does for an answer. A node whose Intent or Check changed has stale tests: steps 2 and 3 for it first. Then a fresh agent on the slice its `by` names, the answer after the brief.
   - `run-stop`: let the agent that runs return, and check it. Start no other. `HC run stop`, then step 7.
   - `run-continue`: go on with the slices that are queued and with those whose issues were answered.
   - Any other entry: as `/headcanon:attend` handles it.
7. **The end of a round:** no slice is queued, sent back or building.
   - `HC build prepare` commits on the build branch what the round changed in the canon and no approval carried: the nodes readiness refined, the journeys, the notes.
   - `HC tests run` once more, then the project's own tests again, compared with the baseline.
   - Your closing text is the report, in short lines: what was built; what was aligned; what waits on the user, each with its issue; every test that passed in the first run or in the baseline and fails now; the commits with their intents (`git log <base>..headcanon/build`; `HC run status --json` names the base); the model each agent ran on, read from its transcript (the `model` of the messages in `agent-<agent id>.jsonl`, under `~/.claude/projects/`).
   - A slice whose check failed is reported as stopped with failing tests, never as built.
   - On the page, one say with `attention: true`: "The round is done. <n> nodes are built and wait for your decision on their cards: approve, send back or discard. <n> wait on your answers under Issues."
   - A node sent back or answered starts another round, which ends the same way. When every slice is decided: "Every node is decided. The work is on the branch `headcanon/build`, yours to merge." Then go back to what called you: `/headcanon:attend`'s loop, or waiting for the next request.

## Rules

- **Waiting.** While an agent works, or when nothing is left to do: `HC wait --port <port> --since <cursor>` with the Bash tool's `run_in_background`, then end the turn. An agent's return and the user's next action both wake you. Never poll.
- **One writer.** While an implementation agent or a tester's second pass runs, start no other agent that writes files and run no tests yourself. What the feed asks for meanwhile takes the next turn.
- **Git.** The work lives on `headcanon/build`, which the user merges. You never merge, push or leave that branch, and you commit no code: implementation agents commit code, `HC build tests` the tests, the page the canon when the user approves.
- **The gates are not yours to open.** An implementation agent stops only when its tests pass or its failing nodes wait behind its issues, and commits only in the intent format. You never weaken or change a recorded test, withdraw an agent's issue, or answer it for the user.
- **A gate can fail open.** A stop hook that crashes or times out lets the agent go. That is why `HC run check` follows every return.
- **Resume.** After a restart or a compaction, `HC run status` says where the run stands. Go on from the first step that is not done; check a slice still `building` whose agent is gone.
- **Any project.** Nothing here assumes a language, a runner or a kind of product. The testers record how this project runs its tests.
