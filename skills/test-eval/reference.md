# Evals: reference

The sources behind the Quality list of the eval skill, where they differ, how a Check of each shape becomes an eval, and one worked example. The product in the example is invented.

## Contents

1. Sources, and the checks each supports
2. Where the sources differ, and what the skill takes
3. From a Check to a measure, examples, a grader and a threshold
4. Worked example: from a box to its eval and its description
5. An eval of the same box that fails the list

## 1. Sources, and the checks each supports

Opened on 2026-11-18:

| Source | Supports |
|---|---|
| Anthropic, "Define success criteria and build evaluations", Claude platform documentation, undated. https://platform.claude.com/docs/en/test-and-evaluate/develop-tests | stated-first (success criteria specific and measurable before the evals are built); covers-cases and like-real-use (examples that mirror the real spread of the task, with its edge cases); one-verdict (it lists among the edge cases those on which people themselves would not agree); cheapest-grader (the fastest, most reliable and most scalable method that decides: code first, a model for complex judgment, a person last); judge-tried (a model grader is tested for reliability before it is used at scale); judge-unswayed and pass-or-fail (detailed rubrics, an output such as correct or incorrect, reasoning before the verdict); step 4, a judge on another model than the one that wrote the output |
| OpenAI, "Evaluation best practices", API documentation, undated. https://developers.openai.com/api/docs/guides/evaluation-best-practices (platform.openai.com/docs/guides/evaluation-best-practices redirects there) | the order of the method (objective, data, measures, run, keep running); kept-apart (held-out data used only to measure); same-property (the anti-pattern of overly generic measures); like-real-use (data unlike production traffic named as biased design); judge-tried (calibrate the judge against human labels before scaling); judge-unswayed (position bias and verbosity bias); pass-or-fail (pairwise or pass and fail judgments for reliability); trials (the same input can give different outputs) |
| Hamel Husain, "Using LLM-as-a-Judge For Evaluation: A Complete Guide", 2024, revised 2026. https://hamel.dev/blog/posts/llm-judge/ | pass-or-fail (binary judgments with a written critique, since scales are hard to act on); judge-tried (labelled data split, the judge measured on a part used once after its instructions are frozen); both-rates (raw agreement misleads when failures are rare; the two rates reported apart); one-verdict (one person whose judgment counts); step 9 (the criteria settle while outputs are read) |
| Hamel Husain and Shreya Shankar, "AI Evals: Everything You Need to Know", 2026. https://hamel.dev/blog/posts/evals-faq/ | step 9 (reading failures and grouping them comes before any measure); pass-or-fail (points of a scale mean different things to different graders; parts of a quality get a binary check each); same-property (ready-made scores give false confidence); cheapest-grader (code where a rule can decide, a judge kept for what persists); judge-tried and both-rates; would-fail (an eval that everything passes says little); affordable (checks run at every change favour code over a judge) |
| Hamel Husain, "Your AI Product Needs Evals", 2024. https://hamel.dev/blog/posts/evals/ | cheapest-grader (assertions as the first level, run at every change); threshold-from-box (the pass rate asked for is a decision about the product, and need not be every case); judge-tried (agreement with a person tracked while the judge is written); both-rates; failures-readable and step 9 (nothing in the way of looking at each output) |
| Shankar, Zamfirescu-Pereira, Hartmann, Parameswaran and Arawjo, "Who Validates the Validators? Aligning LLM-Assisted Evaluation of LLM Outputs with Human Preferences", 2024. Abstract at https://arxiv.org/abs/2404.12272, text at https://arxiv.org/html/2404.12272 | judge-tried (a grader is itself checked against a person's grades on a sample; its alignment is read from two figures, the bad outputs it fails and the good ones it fails); both-rates; cheapest-grader (people preferred code for formats, counts and phrases, and could verify it more easily than a model's verdict); step 9 and the failure "the criteria move" (criteria drift: grading outputs changes the criteria); the cases where only a person can judge (alignment is a matter of the person's own preferences) |
| Ribeiro, Wu, Guestrin and Singh, "Beyond Accuracy: Behavioral Testing of NLP Models with CheckList", ACL 2020. Abstract at https://arxiv.org/abs/2005.04118, text at https://ar5iv.labs.arxiv.org/html/2005.04118 | covers-cases (simple cases with labels for each behaviour a capability needs); pairs (a change that must leave the prediction as it was, and a change that must move it a known way); pass-or-fail's ban on blends (accuracy on one held-out set overstates how well a model does; failures are reported per test); like-real-use |
| Evan Miller, "Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations", 2024. Abstract at https://arxiv.org/abs/2411.00640, text at https://arxiv.org/html/2411.00640; and its summary by Anthropic, "A statistical approach to model evaluations", 2024. https://www.anthropic.com/research/statistical-approach-to-model-evals | margin-shown (a standard error with every score; related questions counted by their group, or the margin comes out too narrow); trials and same-verdict (two sources of chance, which examples were drawn and what the model answers on one of them; the second shrinks with repeated answers); step 6, the product's own settings (lowering the randomness of the model to steady the score changes what is measured); step 3, as many examples as the threshold needs (the number is worked from the difference to be detected) |
| Grace, Hadfield, Olivares and De Jonghe, "Demystifying evals for AI agents", Anthropic Engineering, 2026. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents | the words example, trial and grader; right-kind (a grader in code breaks on the valid variations of an output and lacks nuance, where a model or a person can judge them: the mark of a quality that examples decide); failures-readable (the whole record of each trial is kept and read); trials (a task that passes once may fail the next time; all trials passing as the measure where the same result is promised; each trial from a clean state); both-sides (cases where a behaviour should occur and where it should not); one-verdict (two people who know the domain reach the same verdict on a task); step 4 (grade what was produced, not the path); judge-unswayed (a way out such as "Unknown"); judge-tried (model graders calibrated against people); would-fail (reference solutions; graders that cannot be passed without solving the task); step 9 (reading the records shows whether a failure is the product's or the grader's) |
| Zheng and others, "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", NeurIPS 2023. Abstract only, at https://arxiv.org/abs/2306.05685 | judge-unswayed and step 4 (a model that judges favours a position, a longer answer, and its own output) |

Known, not opened on that day:

| Source | Supports |
|---|---|
| Manning, Raghavan and Schütze, Introduction to Information Retrieval, Cambridge University Press, 2008, chapter 8. The book's site, nlp.stanford.edu/IR-book, reset the connection on each of three tries. | the measure of a ranking (where the relevant items land); both-rates (the share of the relevant found and the share of the found that is relevant, since plain accuracy says nothing where the relevant are rare); one-verdict (agreement between two judges measured beyond chance); kept-apart (settings tuned on one collection, results reported on another) |
| Hastie, Tibshirani and Friedman, The Elements of Statistical Learning, second edition, Springer, 2009, chapter 7. | kept-apart (data used to choose is never the data used to report; the part kept for reporting is used once) |
| Jacob Cohen, "A Coefficient of Agreement for Nominal Scales", Educational and Psychological Measurement 20(1), 1960. | one-verdict and both-rates (two graders agree by chance alone when one verdict is common, so raw agreement is not evidence) |

Tried and not read, so not cited from that address: the CheckList paper as a file at aclanthology.org, which came as bytes the reader could not open; it was read at the second address given above.

Checks that rest on HeadCanon's own rules more than on a source: threshold-from-box (every expected value comes from the box), honest-outcome (the result file is what the page and the gate read, and a run that could not be made is neither a pass nor a fail), and pinned, which no source opened states in these words: it is what same-verdict needs in order to be checked.

## 2. Where the sources differ, and what the skill takes

- **A scale or pass and fail.** Anthropic's documentation allows a judge to answer on a scale from one to five; Husain, and Husain and Shankar, ask for pass or fail only; OpenAI's guide prefers pass and fail or a comparison of two. The skill takes pass or fail: a box passes or fails, and a share of passes is a figure a person can read.
- **The judge's model.** Anthropic's documentation calls a different model from the one that wrote the output the usual good practice, and Zheng and others measured a judge's preference for its own output. Husain and Shankar hold that the same model is usually fine once the judge agrees with a person's labels. The skill asks for another model where the platform offers one, and in every case for the judge to be tried.
- **Many examples or good ones.** Anthropic's documentation prefers more examples graded automatically to fewer graded by hand. Husain starts from a few read closely. The skill names no count: as many as the threshold needs to be told from chance, each one read.
- **Who labels.** Every source wants a judge checked against a person's labels. HeadCanon's tester does not wait for the person, so the skill allows outputs built from the box, right and wrong by construction, and makes the description say that no person has labelled real outputs yet.

## 3. From a Check to a measure, examples, a grader and a threshold

| What the Check observes | Question about one output | Measure | Examples | Grader | Threshold |
|---|---|---|---|---|---|
| A text a model writes: "notes that agree with the statement are at least 95 in every 100" | Does this note agree with its statement? | share of notes that pass | months with their statements | code for what can be compared, a judge for what must be read | the Check's 95 in every 100 |
| A classifier: "of the bank lines that belong to Rent, at least 9 in 10 are proposed for Rent, and of those that do not, no more than 1 in 50 is" | Is the account proposed for this line the labelled one? | two shares: the Rent lines caught, the other lines wrongly proposed | bank lines, each labelled with its account by someone who keeps books | code: equality with the label | both bounds of the Check |
| A ranking: "a search for an entry by its description shows the entry among the first five results in at least 9 searches in 10" | Is the entry sought among the first five? | share of searches that pass | a ledger, and searches each with the entry it seeks | code: the place of the entry in the list | the Check's 9 in 10 |
| Open-ended, with a judge and an artefact named: "a reader who keeps books finds no term in the statement's notes that the glossary does not define" | Does this note use only defined terms? | share of notes that pass | statements with their notes, and the glossary | code where terms can be listed; else a judge with the glossary | every note, unless the box gives a share |
| Open-ended, a person named as judge: "the owner finds the statement pleasant to read" | none that two readers would answer alike | none | none | a person | no eval: a human judgment |

A Check with no measure or no bound ("the notes are mostly right") is not ready for an eval: the gap goes back to the box.

## 4. Worked example: from a box to its eval and its description

Ledgerline keeps books: entries, months, closing a month, statements. The glossary says a **statement** is a month's total for each account, and a **closing note** is the short text Ledgerline writes when a month is closed, saying in plain words what changed against the month before. Ledgerline has a language model write the closing note.

The box, as the tester receives it:

```markdown
---
id: REQ-6.3.2
parent: REQ-6.3
title: "The closing note agrees with the statement"
state: assumed
layer: requirement
kind: numeric
uid: p4t9wd
---

## Intent

The closing note of a month gives only amounts found in that month's statement, and says of each account it mentions whether its total rose or fell against the month before as the two statements show.

## Check

When the closing note is written for each month of an example set, at least 95 of every 100 notes give only amounts found in the month's statement and state every rise or fall as the two months' statements show it.
```

**The kind.** The note is written by a model: the same month can be told rightly in many wordings, two writings of one month differ, and the Check says how often the note must be right. No exact comparison of one result decides it. An eval.

**1 The question.** Two parts, so two questions about one note. A: is every amount in the note an amount of the month's statement? B: is every rise or fall the note states of an account the one the two statements show for that account? A note is right when both answers are yes.

**2 The measure, the threshold and the rule,** written before anything ran.

- Measure: the notes that are right, out of the notes written.
- Threshold: 95 in every 100, from the Check.
- Rule: each example month's note is written three times and each writing counts as a note; the eval passes when the notes that are right are at least 95 in every 100; a judge's "cannot tell" counts as not right.
- Gaps. The Check does not say how many times a month's note is written: three is the tester's choice, noted on the box. A note that says "Rent rose by 200.00" gives a difference, which is not in the statement: the tester takes the difference between an account's totals in the two months as allowed, and notes it. The box does not say what the note states for the first month of a ledger, which has no month before: no example of it, and the gap is reported.

**3 The examples.** Ledgerline's repository holds no real books, and real ones would be somebody's. The tester builds 60 months by hand, each as two statements, the month and the month before, along dimensions named from the box:

- how many accounts changed: one, a few, many;
- which way: rises only, falls only, both;
- the edge the words "rose or fell" leave: an account whose total is the same in both months, in 8 of the months. A note that says it rose is wrong;
- names that can be confused: an account Rent beside an account Rent deposit;
- pairs: two months alike but for one account whose change is turned from a rise into a fall, where the note must follow.

No example has an expected note. The facts to judge by are the two statements. With three writings each there are 180 notes, so the threshold is 171. The margin is worked over the 60 months, since three notes of one month are not three separate readings: near the threshold, about 6 in 100 either way. The months live in a plain file beside the test, with a line saying they were built by the tester from REQ-6.3.2 and must not be copied into Ledgerline.

**4 The graders.**

- A, code: every amount in the note, with separators and currency signs put aside, equals a total in the month's statement or the difference between an account's totals in the two statements.
- B, a judge: a second language model, other than the one Ledgerline writes with, given the two statements and the note and nothing else. Its instructions ask question B, say that a rise or fall stated of an account the statements do not hold, or of an account whose total did not change, is a no, give one note that is a yes and one that is a no, ask for the reasons first, then yes, no or cannot tell.

**5 The judge tried.** No person has labelled notes, so the tester builds them. For 10 months outside the 60: one right note each, written by hand, and two copies made wrong by one change each (a rise said as a fall; a rise said of a total that stayed the same; a change said of Rent deposit that belongs to Rent). That is 10 right notes and 20 wrong ones. The notes of 4 months serve while the instructions are written. The notes of the other 6 months, 6 right and 12 wrong, are kept aside and the judge is run on them once: it fails 12 of the 12 wrong notes and passes 6 of the 6 right ones. Eighteen notes say little about a judge, and built notes are plainer than real ones: the description says how far it was tried, and a note on the box asks the owner to label real notes. Had it failed one right note in six, no product could have reached 95 in 100 through it: it would have been rewritten and tried on fresh notes.

**6 and 7 The eval.** Written here in no language. It is a script the project's runner starts; a project in Python would usually write it as a plain script or under pytest, one in TypeScript as a script run by Node, and a project that already uses an eval tool would use that. The runner is recorded once:

```text
HC tests runner eval '{"kind":"eval","command":"<the command that starts the script> {files} <its option for the result file> {out}","format":"headcanon-json","timeoutSec":1800}'
```

```text
eval "the closing note agrees with the statement in at least 95 of every 100 notes [hc:p4t9wd]"
  examples  the 60 months of the example file: for each, the statement of the month and of the month before
  trials    Ledgerline writes each month's note 3 times, at its own settings, each time from a fresh ledger holding the two months
  grader A  code: every amount in the note is a total of the month's statement, or the difference of one account's two totals
  grader B  judge: "is every rise or fall the note states of an account the one the two statements show for that account?"
  right     a note is right when A is yes and B is yes
  measure   notes right, out of 180
  passed    at least 171
  errored   a note could not be written, or the judge gave no answer on a second try
  writes    the result file at the path the runner gives; every note with both verdicts and the judge's reasons to a file outside the repository
```

**8 See it pass, see it fail.** With Ledgerline's writer replaced by a stand-in that states each change from the statements in one fixed sentence, the eval gives 180 of 180 and passes. With the same stand-in saying fall for rise and rise for fall, it gives 0 of 180 and fails. With Ledgerline itself, two runs with nothing changed give 154 and 152 of 180: failed both times.

**9 The outputs read.** The 26 notes that failed the first run, and a sample of those that passed:

- 24 are the three notes of each of the 8 months that hold an account whose total stayed the same: every one says that account rose. The product's failure; it stays, and it is the finding.
- 1 names a change of Rent deposit as Rent. The product's; it stays.
- 1 was failed by grader A for writing 1,200 where the statement has 1200.00. The box leaves the writing of amounts free: the grader's fault. The separators are now put aside, the stand-in runs pass and fail as before, and the count becomes 155 of 180.

The result file after the correction:

```json
{"tests":[{"title":"the closing note agrees with the statement in at least 95 of every 100 notes [hc:p4t9wd]","file":"<the test file>","outcome":"failed","message":"155 of 180 notes right (86 in 100); the box asks for 171 (95 in 100). 60 months, 3 notes each; margin about 9 in 100 either way, worked over months. Months with a wrong note: 07, 12, 19, 23, 31, 38, 44, 52 (all 3 notes), 27 (1 note). Judge: <model and version>; examples: <version of the file>. Every note and verdict: <path outside the repository>","ms":412000}]}
```

The box shows as out of sync until the code is aligned. The threshold and the 8 months stay as they are.

**The description on the card,** recorded with the test as the test skill says:

```json
{"box":"p4t9wd","runner":"eval","kind":"eval","file":"<the test file>","title":"the closing note agrees with the statement in at least 95 of every 100 notes [hc:p4t9wd]","description":"Checks that the closing note of a month agrees with that month's statement. It has Ledgerline write the note for 60 example months built by hand: months where one account changed and where many did, rises, falls, totals that stayed the same, and accounts with similar names. Each note is written three times, 180 notes in all. A note is right when every amount in it is an amount of the statement or the difference between an account's totals in the two months, which is compared directly, and when every rise or fall it states is the one the two statements show, which a second language model reads and answers yes or no. It passes when at least 171 of the 180 notes are right, the 95 in every 100 the box asks for. A result near the bar can be off by about 6 in 100 either way. The second model was tried on 18 notes written by hand that it had not been shown: it failed all 12 made wrong on purpose and passed all 6 right ones; no person has yet labelled real notes for it. Each run asks Ledgerline's model 180 times and the second model up to 180 times."}
```

## 5. An eval of the same box that fails the list

```text
eval "closing notes are good"
  examples  5 months of the product's demonstration ledger; the notes it writes today are saved as the reference
  grader    judge, given the note only: "rate from 1 to 5 how accurate and helpful this note is"
  passed    the average is 4 or more, which is what the product averages today
description: "LLM judge eval of note quality, threshold 4.0"
```

The reviewer's findings, by check:

- same-property, fatal: the judge is asked about accuracy and helpfulness at large, and is not given the statement the note must agree with. What would pass: the two questions of section 4, with the statements in front of the grader.
- threshold-from-box, fatal: the bar is today's average and the reference is today's output; the box asks for 95 in every 100. What would pass: the Check's bound, and the statements as the facts to judge by.
- judge-tried, fatal: the judge was never run on notes of known verdict.
- would-fail, fatal: a note with a wrong amount cannot fail, since nothing compares it with the statement.
- stated-first, fatal: the bar was set after the product was run.
- pass-or-fail: a scale averaged into 4.0, blending two qualities.
- covers-cases and both-sides: five months of one ledger, none with a total that stayed the same.
- trials and margin-shown: one writing per month, no count and no margin in the result.
- The description uses the measure's jargon and says neither what is checked nor how, so the question every kind shares, whether a person who cannot read code learns what is checked and how, is also a no.

Verdict: fail.
