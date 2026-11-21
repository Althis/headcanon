---
name: test-eval
description: "What a good eval of a box is: a quality judged on examples, put as one yes-or-no question about one output, then a measure, a set of examples, a grader and a threshold taken from the box, reported as pass or fail through a plain result file. The method in order, the Quality list as yes-or-no tests from the literature, the plain words its card carries, and when only a person can judge."
when_to_use: "The tester writes a test for a box whose Check observes a quality judged on examples rather than decided exactly: the output of a language model, a ranking, a classifier, a generated text; the reviewer gives pass or fail on such a test."
---

# Evals: a quality measured on examples

Read by the tester, who writes the test from a box's Intent and Check, and by the reviewer, who gives pass or fail with the Quality list. Choosing among the kinds, runners and recording are in the test skill (`skills/test/SKILL.md`); the sources and a worked example are in `reference.md`. No runner, language or model is assumed.

Words used here:

- An **example** is one input the product is given, with what is needed to judge its output: the right answer, or the facts the output must agree with.
- The **grader** gives each output a verdict, pass or fail. It is code that compares, or a **judge**: a language model that reads the output against written instructions.
- The **measure** is what is counted over the verdicts. The **threshold** is the value the measure must reach for the box to pass.
- A **trial** is one run of the product on one example. The **margin** is how far the measure could move by chance on a set of this size.

## When this kind fits

By what the Check observes:

- A quality of outputs that no exact comparison of one result decides: an output can be right in many forms, or the product is right most of the time by design, and the Check says how often or how well. The output of a language model, a ranking, a classifier, a generated text.
- A numeric Check of this sort names the measure, how it is taken and the bound. An open-ended one names what judges and which artefact, or a quantity, a direction and a target.
- A property every output must have and code can decide (it parses, it stays within a length) is still an eval when the output varies from run to run: the grader is code and the threshold is every example.
- Not this kind: a result decided exactly from its inputs (unit); parts working together behind the surface (integration); what an actor does and sees from end to end (e2e).
- Only a person can judge, and the box gets no test, when the Check names a person as the judge; when no instruction can be written that two readers who know the domain would apply to one output with the same verdict; or when the verdict of an example can neither be taken from the box nor built from it, so that the grader would hold the tester's own taste. The report says so with the reason. Never a test that only looks like a judgment.

## How to write it

1. **The question.** From the Intent, the Check and the glossary, put the quality as one yes-or-no question about one output, in the box's words: "is every amount in the note an amount of the month's statement?". A quality with several parts gets one question per part, and an output passes when every answer is yes.
2. **The measure, the threshold and the rule,** from the Check, before anything runs.
   - A quality every output should have: the share of examples that pass.
   - A classifier: two shares, never one figure of agreement, which hides a rare class. Of the cases that should be flagged, how many are; of those that should not, how many are left alone.
   - A ranking: where the right item lands, against the place the box names.
   - The rule says which value meets the threshold, how the trials of one example combine, and that a judge's "cannot tell" counts as a fail.
   - A measure or a threshold the box does not give is a gap: report it and write no eval until the box has one. Never set it at what the product scores today.
3. **The examples.**
   - Where they come from, best first: real inputs the project already holds, with whatever identifies a person removed; cases written with someone who knows the domain; cases generated along dimensions named from the box (the classes of input, the sizes, the conditions), each read before it is kept.
   - What they cover: the ordinary cases, in about the proportions the product meets; each edge the box names; cases where the behaviour must not happen beside those where it must; where the box implies them, pairs: a change to the input that must leave the result as it was, and one that must move it a known way.
   - Each carries its expected answer, or the facts to judge by, written from the box and never from the product's output. One that two people who know the domain would judge differently is left out and reported.
   - As many as the threshold needs to be told from chance, no more: the margin is worked and shown, and examples that share a source count as one group in it.
   - They live in a plain file beside the test, each with its source. None appears in what the product learns from: its instructions, its rules, its training data.
4. **The grader,** the cheapest that decides the question.
   - Code wherever code can decide: equality once what the box leaves free is put aside, membership in a set, a number in a range, a shape.
   - A judge for the rest. Its instructions ask the one question, say what counts as yes and as no with an example of each, ask for the reasons before the verdict, and leave "cannot tell" open. It is given what a person would need to judge, and nothing that says which version produced the output. Where it compares two outputs, their order is shuffled. Its model is another than the product's where the platform offers one, with name and settings fixed and recorded.
   - It grades what was produced, never the path taken to it.
5. **Try the judge before trusting it.** Take outputs whose verdict is known: labelled by a person where the project holds such labels; otherwise built from the box, a right output and copies made wrong by one change each. Keep a part aside, write the instructions with the rest, then run the judge once on the part kept aside. Report both shares: of the wrong ones, how many it failed; of the right ones, how many it passed. A judge that misses on either side is rewritten and tried on fresh cases, or the question goes back to code or to a person. A judge tried on built cases only: the description says so, and a note on the box asks for a person's labels.
6. **The runs.** The product runs with the settings it ships with. Where its output varies, each example gets more than one trial, combined as the rule says: all must pass where the box promises the same result every time. Each trial starts from a clean state.
7. **The result file.** The eval is a script the runner starts, recorded with the format `headcanon-json`. At `{out}` it writes `{"tests":[{"title":"…","file":"…","outcome":"…","message":"…","ms":0}]}`, one record per title that carries a box's uid.
   - `passed` or `failed` by the rule. `errored` when the eval could not be carried out (the model not reached, a judge with no answer): never a pass, a fail or a skip.
   - `message`: the measure, its value, the threshold, the count of examples and trials, the margin, which examples failed.
   - Every output with its verdict and the judge's reasons goes to a file outside the repository, named in the message.
8. **See it pass, and see it fail.** Hand the grader the reference answers: the eval passes. Hand it outputs made wrong on purpose: it fails. Run it again with nothing changed: the verdict is the same. A verdict that flips means too few examples or trials for a threshold this near the product's level, and is reported as that.
9. **Read the outputs.** After the first run read every failure and a sample of the passes. A failure is the product's, and stays as the finding; or the example's, corrected from the box; or the grader's, corrected, with the judge tried again. When reading shows that the quality needs a criterion the box does not state, that is a note on the box, never a silent change to the grader. Then the description, the Quality list, and recording as the test skill says.

## Quality list

Each is yes or no. The tester applies them before recording. The reviewer's verdict is `fail` when any check marked fatal is no, `pass` otherwise with the rest as notes; a finding names the check, what fails and what would pass. The sources of each check are in `reference.md`.

| Check | Test | |
|---|---|---|
| right-kind | Does the Check observe a quality over examples that no exact comparison of one result decides, put as a question two readers who know the domain would answer alike? | fatal |
| same-property | Does the grader's question say what the Check says, on the artefact it names, with no wider quality and no likeness to a reference text standing in for it? | fatal |
| stated-first | Were the measure, the threshold with what it counts, and the rule that gives pass or fail written before the first run? | fatal |
| threshold-from-box | Do the threshold and every example's expected answer come from the box or follow from it by construction, none read off what the product gives today? | fatal |
| would-fail | Does the eval pass on the reference answers and fail on outputs made wrong on purpose? | fatal |
| judge-tried | Where a model judges, was it run on outputs of known verdict that its instructions were not written from, with the share of wrong ones failed and of right ones passed both given? | fatal |
| kept-apart | Are the examples absent from everything the product learns from or is tuned on, and the cases the judge was tried on absent from its instructions? | fatal |
| same-verdict | Does a second run with nothing changed give the same pass or fail? | fatal |
| honest-outcome | Does the result file carry one outcome per box, by the stated rule, and `errored` when the eval could not be carried out? | fatal |
| covers-cases | Do the examples hold the ordinary cases, each edge the box names and each class of input the box treats differently? | |
| both-sides | Are there cases where the behaviour must not happen beside those where it must? | |
| pairs | Where the box implies them, are there pairs whose change must leave the result as it was, or move it one known way? | |
| like-real-use | Do the examples resemble what the product meets, each with its source recorded and each read before it was kept? | |
| one-verdict | Would two people who know the domain give each example the same verdict? | |
| cheapest-grader | Does code decide everything code can, with a judge only for the rest? | |
| pass-or-fail | Does each output end in pass or fail on one question, with no scale averaged into a score and no blend of several qualities? | |
| judge-unswayed | Does the judge reason before its verdict, have "cannot tell" open to it, see nothing that says which version it reads, and face a shuffled order where it compares? | |
| both-rates | For a classifier or a judge, are the share caught and the share wrongly flagged given apart? | |
| trials | Where the output varies between runs, is each example run more than once, at the product's own settings, each trial from a clean state? | |
| margin-shown | Does the message give the count of examples and trials and the margin, with examples that share a source counted as one group? | |
| pinned | Are the judge's model and settings and the version of the example set fixed and written in the result? | |
| failures-readable | Can a reader go from the result to each failed example: its input, the output, what was expected, why it failed? | |
| affordable | Are its time and its cost stated, and low enough for it to run at every build of the box? | |

## What the description on the card says

The reader owns the product and does not read code. From the description alone they know which quality is measured, on what, who or what judges, and what a pass does and does not tell them.

- The quality first, in the box's words and the glossary's: "Checks that the closing note of a month agrees with that month's statement."
- The examples: how many, what they are, where they come from, what they cover. "It has Ledgerline write the note for 60 example months built by hand: months where one account changed and where many did, rises, falls and totals that stayed the same."
- What judges, said by what it does: "the amounts are compared with the statement directly; a second language model reads each note beside the two statements and answers whether every rise or fall is the one they show."
- The bar, as a count: "It passes when at least 171 of the 180 notes are right, the 95 in every 100 the box asks for."
- What the result can tell: that it is a measurement on these examples, with its margin in plain words ("a result near the bar can be off by about 6 in 100 either way"), and how far the judge was tried ("it failed all 12 notes made wrong on purpose and passed all 6 right ones; no person has yet labelled real notes for it").
- Where each run asks a model, how many times it does.
- No "eval", "prompt", "rubric", "score", "threshold", "precision", "dataset"; no name of a file, a function or a tool. A share is "171 of 180", never "0.95".
- What the last run measured is not in the description: the page shows it from the result.
- One idea per sentence, present tense, sentence case, nothing said twice.

## Common failures

- **A ready-made score stands in for the box's quality**: likeness to a reference text, "helpfulness", "accuracy" with no question behind it. Write the question from the Check.
- **The threshold is what the product scores today.** The eval then passes on whatever exists. Take it from the box, or report the gap.
- **A scale from one to five, averaged.** Nobody can say what 3.8 means or what to fix. One question, pass or fail, with the reason.
- **The judge is trusted unseen.** Try it on outputs of known verdict it was not written from, and give both shares.
- **One figure of agreement on a rare class.** A grader that passes everything agrees nearly always. Give the share caught and the share wrongly flagged.
- **Only easy cases, or only cases where the behaviour should happen.** A product that always acts passes. Add each edge and the cases where it must not.
- **The examples reach the product**: copied into its instructions, or used to tune it until they pass. Keep them apart; an eval the product has seen measures memory.
- **One run decides on output that varies.** Run each example more than once and show the margin.
- **Failing examples are dropped, or the bar is lowered, until it passes.** The failure is the finding. Only an example or a grader shown wrong against the box is corrected.
- **The grader's criteria move after the outputs are read and the box does not.** Note on the box what the quality turned out to need.
- **The judge shares the product's blind spots**: the same model, shown which version it reads, swayed by length or by order. Another model where there is one, nothing about the version, shuffled order.
- **The eval could not run and says pass or skip**: no access to the model, a judge that timed out. Report `errored` with what was missing.
- **An exact rule is measured as a share of examples.** It costs more and says less. A result decided from its inputs is a unit test.
- **The description is the measure's jargon**: "judge score at or above 0.9 on the eval set". Say the quality, the examples, what judges, and the bar as a count.
