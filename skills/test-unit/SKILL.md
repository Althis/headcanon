---
name: test-unit
description: "What a good unit test of a node is: one rule of the product, decided exactly from its inputs, reached through the entry the product's own callers use, with every expected value written from the node; the method in order, the Quality list as yes-or-no tests from the literature, and the plain words its card carries."
when_to_use: "The tester writes a test for a node whose Check observes a rule computed from inputs; the reviewer gives pass or fail on such a test."
---

# Unit tests: one rule, decided from its inputs

Read by the tester, who writes the test from a node's Intent and Check, and by the reviewer, who gives pass or fail with the Quality list. Choosing among the kinds, runners and recording are in the test skill (`skills/test/SKILL.md`); the sources and a worked example are in `reference.md`. No runner or language is assumed: the project's own decides the syntax.

Words used here:

- The **rule** is what the node says must hold.
- The **entry** is the call through which the product's own code reaches the rule.
- A **stand-in** is anything put in the place of a real part for the test. A **fake** is a light working version, such as a store kept in memory. A **stub** hands back fixed inputs. A **mock** is told which calls to expect, so that the test can check them.

## When this kind fits

By what the Check observes:

- A result the product computes from inputs the Check can state: a value given back, the state after one action, a refusal. The same inputs give the same result every time, and the result is right or wrong exactly.
- Everything the rule needs can be handed to it inside one process: no network, no other program, no real clock, no store shared with other tests.
- Not this kind: parts working together behind the surface (integration); what a user does and sees from end to end (e2e, from a journey); a quality judged on examples with a measure and a threshold (eval); what only a user can judge (no test).
- A sign that it is another kind: the case cannot be told without "and then the other part receives", a screen, or a wait.

## How to write it

1. **State the rule.** From the node's Intent, Check, glossary terms and linked nodes, in one sentence: under which condition, which action, which result. This is the case of the first pass: given, when, then, with values.
2. **List the cases the rule has**, from the node's words alone: the condition holding; the condition failing; for each bound the node names, the value on it and the nearest value on each side; each class of input the rule treats differently. One test per case; as many as the rule has, no more.
3. **Write every expected value before reading any code**, as a literal worked by hand from the node. A value the node does not give is a gap: where the test cannot be written without it, take it from the code and note that on the node; otherwise leave the case out and report the gap. Never fill it silently from what the code returns.
4. **Find the entry.** Now read the code, only to learn how the product's own callers reach the rule, and call that. No private helper, no internal field, no door opened for the test.
5. **Arrange** what the rule needs, with the values that decide the result written in the test itself. Real parts when they run inside the process, quickly and the same every time; a fake when they do not; a stub only to hand the rule an input; the date, the seed of chance and the locale fixed.
6. **Act once, then assert the result**: the value given back or the state afterwards, all that the node promises and nothing it leaves free. Check that a call was made only when the call is itself the promise: something the product sends outside itself.
7. **Name it** as the behaviour in the node's words, so that a failure reads as a sentence about the product. Give each assertion a message with the case, the expected and the found.
8. **See it fail.**
   - Not built: it fails when run, which is the expected state.
   - Built and passing at first run: put a wrong expected value in, see the failure name the rule, put the right one back.
   - Built and failing: rule out a mistake in the arrangement or the entry. What remains is the code and the node disagreeing, a finding for the node; the expected value stays.
9. **Run it again**, alone and with the others: the same result, nothing left behind. Then write the description, apply the Quality list, and record the test as the test skill says.

## Quality list

Each is yes or no. The tester applies them before recording. The reviewer's verdict is `fail` when any check marked fatal is no, `pass` otherwise with the rest as notes; a finding names the check, what fails and what would pass. The sources of each check are in `reference.md`.

| Check | Test | |
|---|---|---|
| right-kind | Does the Check observe a rule decided exactly from inputs, with nothing outside one process needed to observe it? | fatal |
| same-property | Does each test assert what the Check says is observed, on the thing it names, under the condition it names? | fatal |
| would-fail | Would some test fail if the rule were broken in each plain way: the condition ignored, a bound moved by one step, a fixed answer given back whatever the input? | fatal |
| expected-from-node | Is every expected value a literal the node gives or a noted assumption, none computed in the test and none copied from what the code returns? | fatal |
| real-rule | Does the product's own code decide the result: nothing stands in for the rule, and no stand-in hands back the answer the assertion checks? | fatal |
| survives-rewrite | Would the test still pass after the code is rewritten with the rule kept: does it call only an entry the product's own callers use, and assert no internal step? | fatal |
| deterministic | Does it give the same result on every run with nothing changed: no real clock, unseeded chance, network or wait, no reliance on the machine's zone or locale? | fatal |
| isolated | Does it give the same result alone, with the others and in any order, and leave the repository and the machine as it found them? | fatal |
| cases-cover | Is each class of input the node treats differently tested, and no case tested twice? | |
| one-behaviour | Does each test hold one case: one action, one reason to fail, a name that needs no "and"? | |
| reads-cold | Can a reader tell from the test alone why the expected result follows, every value that decides it written there and none hidden in shared setup? | |
| straight-line | Is the test free of loops, conditions and arithmetic of its own, so that it is seen to be right by reading it? | |
| named-for-behaviour | Does the name say the condition and the result in the node's words, not the name of a function? | |
| failure-says-why | Would a failure, read without the code, say which case broke, what was expected and what was found? | |
| promised-only | Does it compare only what the node promises: no exact wording, order, format or extra field the node leaves free? | |
| stand-ins-needed | Is each stand-in there because the real part is outside the process, slow or not the same every time, and does it behave as the real part does for what the test uses? | |
| calls-only-promised | Where the test checks that a call was made, is the call something the node promises the product sends outside itself, checked only in the arguments the node names? | |
| quick | Does it finish fast enough to run at every change, with no wait written in? | |

## What the description on the card says

The reader owns the product and does not read code. From the description alone they know what is checked, how, and what a failure would mean for them.

- The rule first, in the node's words and the glossary's: "Checks that a month is not closed while one of its entries does not balance."
- Then how, as the example the test plays: what it sets up, with the values; what it asks the product to do; what it expects. "It sets up March 2026 with one entry of 100.00 against 99.99, asks to close the month, and expects a refusal that names that entry, with March still open."
- That the rule is tried directly, with nothing else of the product running. A stand-in is named by what it does for the reader: "the date is held at 31 March 2026, so the result is the same on any day."
- Several cases of one rule: the rule once, then one clause per case with its values.
- No name of a function, file, class, runner or kind of stand-in; no "asserts", "returns true", "throws", "mock". A refusal "is refused with"; a result "gives".
- The values are the test's own. A description that would fit a different test of the same node is too loose; one that names a value the test does not use is wrong.
- Where a reader would assume more than is checked, say what another test holds: "What the closing screen shows is checked in the journey Closing a month."
- One idea per sentence, present tense, sentence case, nothing said twice.

## Common failures

- **The expected value is what the code gives today.** The test then passes on whatever the code already does. Write the value from the node before reading the code.
- **The test repeats the rule's arithmetic** to get its expected value, and is wrong whenever the rule is. Work the value by hand and write the literal.
- **A stand-in decides the answer**: the rule itself is replaced, or a stub hands back what the assertion then checks. Let the product's code compute; stand-ins sit at the edge of the rule.
- **It asserts which internal parts were called**, in what order or how often. Any rewrite breaks it while a wrong result passes. Assert the result.
- **It calls a private helper** because the logic sits there. Call the entry the product's callers use; when no entry reaches the rule without other parts, go back to choosing the kind.
- **Only the case that works is tested.** A product that never refuses passes. Add the case where the condition fails, and each bound.
- **Several cases share one test**, and the first failure hides the rest. One case per test, each assertion with its message.
- **The values that decide the result sit in shared setup or a data file.** Write them in the test; keep helpers for what does not bear on the result.
- **It compares more than the node promises**: a whole record, the exact words of a message, the order of a list the node leaves free. Compare the promised parts.
- **It depends on the day, on chance, on a wait or on another test, or leaves files behind.** Fix the date and the seed, build fresh state, work in a temporary place and remove it.
- **Loops and conditions generate the cases.** Write each case out, or as literal rows where the runner offers a table of cases.
- **A failing test on a built node is edited until it passes.** The failure is the finding. Keep the expected value and report that the code and the node disagree.
- **The description is the code read aloud**: "asserts the closing function throws for the second fixture". Say the rule, the values and the result as the node would.
