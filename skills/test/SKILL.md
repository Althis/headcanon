---
name: test
description: "The method every kind of test shares: which boxes get a test, the kind chosen by what the Check observes, the journey recorded before an e2e test, the description a person who cannot read code understands, recording with HC tests, the repository left as found, and the Quality list every kind shares. What a good unit, integration, e2e or eval test is lives in that kind's own skill."
when_to_use: "The tester writes cases or test files for a capability; the reviewer gives its verdict on recorded tests; the human asks to test a box, or asks how a box is tested."
---

# Test: the method every kind shares

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`, run in the repository. A box's `uid`, in its front matter, is its stable id: it survives a move, and `HC context <id>` prints it with the box. Nothing here assumes a language, a runner or a kind of product; a tool is named only as an example of what a platform usually uses. Skill paths are from the plugin root.

## Which boxes get a test

- Each requirement that carries a Check: a leaf, or a parent that keeps a Check of its own.
- A capability carries no Check and gets no test. Where its children do not add up to what it promises, the missing child is proposed with its Check (a gap in the first pass; `HC op` create, recorded as a guess, in the second), and that child is tested.
- A flow across capabilities is a journey; an e2e test plays it.
- A Check only a person can judge stays a human judgment: no test.
- A red box, a draft or a contested one, waits on the person: no test until it is settled.
- `HC tests list <id>` shows what is recorded for a box and every box below it. Write what is missing, and again what is stale: a test whose box was reworded since.

## Choosing the kind

By what the Check observes, never by habit and never by what the project has most of.

| The Check observes | Kind | Its skill |
|---|---|---|
| a rule of the product, computed from inputs | unit | `skills/test-unit/SKILL.md` |
| several parts working together behind the surface | integration | `skills/test-integration/SKILL.md` |
| what a person, or a system that calls the product, does and sees from end to end | e2e, of a journey | `skills/test-e2e/SKILL.md` |
| a quality judged on examples and never decided exactly: the output of a model, a ranking, a text | eval, with a stated measure and threshold | `skills/test-eval/SKILL.md` |

- Read a kind's skill before the first test of that kind. Each has the same parts: "When this kind fits", "How to write it", "Quality list", "What the description on the card says", "Common failures".
- The kind observes what the Check names. A rule stays a unit test when a screen shows its result; a screen the Check names is not tested by calling the rule.
- Where two kinds observe the same Check, the smaller is right, unit before integration before e2e: it answers sooner and its failure points nearer the cause. "When this kind fits" in each skill settles a doubt.
- A kind beyond these four: "Other kinds", at the end.

## The case, in plain words first

Before any code, each case is written as **given** the state it starts from, **when** the one action or event, **then** what is observed and the value that counts as yes.

- Values, never kinds of value: "an entry of 40.00 dated 14 March 2026, in a March already closed", never "a valid entry".
- The cases a box needs are the ones its Check distinguishes: the yes, the other case where the condition does not hold, each bound at its edge. As many as that, no more.
- A value the box does not give is a gap. It is reported, never filled silently from what the code does.

## The journey before an e2e test

An e2e test plays a journey, and the journey is in the canon first, so the person sees it on the Journeys tab.

- Look for one that passes through the box: `HC context <box id>` lists the journeys that cite it, with the steps that do; `HC find "<words>"` searches journeys too. A journey is read whole from its file in the canon's `journeys` folder.
- None fits: record it as a guess, each step citing the boxes it exercises. The operation, inline or on stdin with `HC op - --by <you>`:
  `{"op":"journey","title":"Closing a month","steps":[{"label":"Close March","requirements":["REQ-2.3.1"],"given":"March 2026 holds two entries","does":"closes March","sees":"March shown as closed, its statement dated 31 March"}],"source":"<the boxes or the document the steps come from>","state":"assumed","why":"<the flow it tests>"}`
- One exists as a guess and lacks a step or its detail: the same operation with its `id` rewrites its steps. An approved journey is never rewritten: the test follows it as written, and what it lacks goes in the report.
- The test is written from the journey, step by step, with the tool the platform calls for: a browser playbook for a web app, a scripted session for a command line tool, calls over the wire for a service.
- The test's entry names its journey in `journey`; the page then shows the test on the steps it plays.

## The test file

- One file per box where the runner allows, so that a missing piece fails its own box and no other. Where the platform cannot load a file that names something not built yet, that file holds no other box's test.
- The title says the behaviour in the box's words and carries the box's uid: `refuses an entry dated inside a closed month [hc:k3m9pq]`.
- Read the code only to learn how to call things: names, arguments, how the product is started. Follow the project's own conventions and helpers.
- Every expected value comes from the box's Intent or Check. A value you had to take from the code, and a name you had to choose for something not built yet, is noted on the box: `{"op":"note","id":"<box id>","text":"the test takes <what> from <path:lines>; the box does not state it"}`. An approved box takes no note: say it in the report.
- A test written before the thing exists fails, and that is its right first answer. Never a skip or an expected-failure mark, never an expected value changed until the test passes.

## The description on the card

Written for a person who cannot read code. It says what is checked, in the box's words and with the test's own values, and how: what the test sets up, what it does, what it expects.

- Says it: "Checks that a closed month takes no new entry. It closes March 2026 holding two entries that total 120.00, tries to add an entry dated 14 March, and expects a refusal, with the total of March still 120.00."
- Does not: "Tests that closeMonth() throws ERR_CLOSED" (names from the code); "Checks that closing works" (no values, no how); "Verifies REQ-2.3.1" (an id in place of words).
- No name of a function, a file or a tool; glossary terms as the glossary defines them. What a description of each kind adds is in that kind's skill, under "What the description on the card says".

## Recording

1. **Each runner, once.** A runner is how one kind of test runs in this project: `HC tests runner <name> '{"kind":"unit","command":"<the project's test command> {files} <its option for a result file> {out}","format":"junit"}'`; with no JSON it lists the runners recorded. In `command`, `{files}` becomes the test files, `{out}` a result file outside the repository, `{titles}` a pattern of titles where the runner can filter by one. `format` is what the runner writes: `junit`, `vitest-json`, `playwright-json`, or `headcanon-json`, the shape any script can write: `{"tests":[{"title","file","outcome","message","ms"}]}` with `outcome` passed, failed, errored or skipped. `cwd` and `timeoutSec` are optional.
2. **A kind with no runner in the project** gets the one its platform usually uses: what the language or the framework ships with, before something to install. The choice is an assumption: a note on the capability naming the runner, why it fits and what else would, and a line in the report.
3. **Each test.** `HC tests add '[{"box":"<uid>","runner":"<name>","kind":"unit","file":"<path from the repository root>","title":"<the title, with [hc:<uid>]>","description":"<plain words>","journey":"<JRN id, for e2e>"}]' --by <you>`; `-` in place of the JSON reads it from stdin. Refused: an unknown uid, a title without `[hc:<uid>]`, a file that does not exist, a description that holds code or says too little, an e2e test that names no recorded journey. A test recorded again replaces its earlier entry and waits for review again.
4. **Run once.** `HC tests run <id> --all` proves that the tests load and run, and stores the result beside the canon. An id covers its box and every box below it; `--all` runs the tests not accepted yet. Failing is expected where the box is not built.
5. **The review.** The reviewer reads a box's tests against the box and records one verdict for them together: `HC tests review <uid> pass|fail --note "<what fails and what would pass>"`. A pass accepts them with the fingerprint of each file: from then on a changed or missing file counts as failing, and a reworded box makes its tests stale. A fail rejects them and comes back as a correction. After two corrections, a third fail leaves the box untested with the finding on its card.

## The repository is left as found

A test leaves the repository as it found it: what it creates it removes, on failure too; what it must change it copies first and changes the copy; what it writes goes outside the repository. `HC tests run` compares the repository before and after each runner and reports a run that changed it, naming the files.

## Quality list, every kind

Yes-or-no tests, in the shape of the Quality list that `HC format` prints. The tester applies the list of the test's kind and then these, before recording; the reviewer does the same for its verdict. A no on a line marked fatal fails the test. A finding names the check, what fails and what would pass.

| Check | Test | | Who | Sources |
|---|---|---|---|---|
| from-the-box | Does every expected value come from the box's Intent or Check, the ones the box does not give noted on it, and none copied from what the code does today? | fatal | reviewer | Barr et al. 2015, the oracle problem; Feathers 2004, characterization tests |
| plain-description | Would a person who cannot read code learn from the description what is checked and how? | fatal | reviewer; `HC tests add` refuses one that holds code | North 2006; Adzic 2011 |
| leaves-as-found | Is the repository after the run what it was before it? | fatal | `HC tests run` | Meszaros 2007, Fresh Fixture |
| carries-its-box | Does the title carry the uid of the one box whose Check the test decides? | fatal | `HC tests add` for the uid; reviewer for the box | DEC-025, the stable id |

The first two are the questions the reviewer asks of every test, whatever its kind. Everything else that makes a test good depends on its kind and is in that kind's list.

## Other kinds a project may need

Recorded with kind `other`, the description starting with the kind's name. Read the nearest skill and apply its Quality list, with the difference named here.

| Kind | The Check observes | Nearest skill | What differs |
|---|---|---|---|
| contract | that two parts agree on the shape of what passes between them | integration | each side is tested alone against the one written agreement, which the box states; neither side's test starts the other |
| property-based | a rule that holds for every input of a class | unit | the rule is checked on generated inputs; the seed is fixed and a failing input is reported, so a failure replays; the description names the rule and the class of inputs |
| performance | a time, a rate or a size against a bound | eval | the measure is a duration, a rate or a size, taken over repeated runs under a stated load on a stated machine; the verdict comes from the whole sample, never from one run |
| accessibility | that a person using a keyboard alone or an assistive tool completes a journey | e2e | the journey is played as that person plays it; automated rules decide a part (names, roles, contrast), and what they cannot decide stays a human judgment |
| security | that someone without the right is refused, or that hostile input does no harm | e2e | the actor is the one who must not succeed; the expected result is the refusal the box names; a pass proves that one refusal, never the absence of a weakness no box names |
| visual | that a surface looks as approved | e2e | the expected value is a stored image, which no box states: it counts once a person has approved the image, and until then the Check is a human judgment; the size, the fonts and the tolerance are fixed |
