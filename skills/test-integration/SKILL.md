---
name: test-integration
description: "What a good integration test is: one seam between parts of the product, crossed for real, the outcome observed on the far side, the same result on every run. The method in order, the Quality list as yes-or-no tests with the fatal ones marked, how the card describes the test in plain words, and the common failures. Sources and a worked example in reference.md."
when_to_use: "The tester writes a test for a box whose Check observes several parts working together behind the surface; the reviewer gives its verdict on a test recorded with the kind integration."
---

# Integration tests: one seam, crossed for real

How a test is chosen, written down and recorded is in `skills/test/SKILL.md`. This skill holds what is particular to an integration test. Its Quality list comes before the two questions every kind shares: the expected result comes from the box and not from the code, and a person who cannot read code learns from the description what is checked and how. Sources for each line of the list, and one worked example: `reference.md`.

Words used here:
- **seam**: the place where two parts meet and something crosses: the product's code and its store, a queue, a file, the clock, another service, or two modules of its own built apart.
- **stand-in**: anything that takes a real part's place in a test. A **fake** behaves (it keeps what it is given and answers from it); a **canned answer** returns what the test told it to return.

## When this kind fits

By what the Check observes, never by habit.

- The Check names something that crosses a seam and is observed behind the surface: saved and read back, sent and received, written in a form another part reads, kept or undone together, refused by the far side, answered late or not at all.
- Each side can be right alone and wrong together: a format, an order, a structure, a setting, a transaction. This kind finds that; a unit test cannot.
- Not this kind:
  - a rule decided from inputs alone, even where the same code also saves: the rule is a unit test, only the saving is tested here;
  - what a person does and sees from start to end: an e2e test of a journey;
  - a quality judged on examples: an eval.
- The sense is the narrow one: this product's parts across one seam. A test that needs the whole product up with every live service is an e2e test.

## How to write it

1. **Name the seam.** From the Intent and the Check, say in one sentence which parts meet and what crosses. One seam per test; a Check that names two gets a test for each.
2. **Make both sides real.** The product's own code, and the dependency itself: the kind the product runs on, in a private instance the test starts. Examples of a platform's usual choice: a throwaway container for a database server, a temporary folder for a file store, a local server for a service over the wire. What lies beyond the seam may be a stand-in.
3. **A stand-in on the seam only when the real part cannot be had:** others own it, it cannot run here, or it does not answer the same way twice. Then a fake before canned answers, built from the owner's published format or a recorded exchange; the card says what it stands for and what it was built from.
4. **Set it up as shipped.** The dependency takes its structure and settings from the product's own setup, never from a copy the test wrote.
5. **Build the start state from zero,** inside the test, under names no other test uses.
6. **Fix what varies:** the clock, random values, every generated id the test compares.
7. **Act once, through the entry the product itself uses** to reach the seam.
8. **Observe the outcome on the far side:** what the store holds, what was sent, what came back; read by a path apart from the one that wrote, after the write is final. Every expected value comes from the box.
9. **Cover the failing side the Check names:** the far side refuses, is slow, is absent, the work stops half way. Where the real part cannot be made to fail, a stand-in told to fail is the right tool for that case alone.
10. **Wait on what happens:** a signal, or a poll with a limit. Never a fixed pause.
11. **Clean up in a step that also runs on failure:** rows, files, processes, the private instance. The repository and the machine are as they were.
12. **Make a failure say where:** the seam, the expected, the seen. A dependency that could not start is a setup error carrying its name; it is never a skip and never a pass.

Then apply the Quality list, before recording.

## Quality list

Each check is yes or no. The tester applies them before recording; the reviewer applies them for the verdict. A no on a check marked fatal fails the test. Any other no goes in the note with what would make it a yes; a check that does not apply to this seam is said so, with why. A finding names the check.

| Check | Test | |
|---|---|---|
| right-kind | Does the Check observe parts working together behind the surface, so that neither a unit test nor a journey would decide it better? | |
| one-seam | Does the test exercise one named seam, and can a reader say which parts meet from its title and description? | |
| crosses-for-real | Is the part on each side of the seam the real one, or a stand-in named with its reason; is the thing asserted never a stand-in's own canned answer? | fatal |
| checks-the-check | Does the assertion observe what the Check names, so that the Check being false makes this test fail? | fatal |
| same-kind | Is the real dependency the kind the product runs on, not a lighter one that behaves otherwise? | |
| as-shipped | Does the dependency take its structure and settings from the product's own setup? | |
| stand-in-kept-true | Is each stand-in on the seam a fake built from the owner's published format, a recorded exchange or a contract test, and does the description say so? | |
| hermetic | Does the result depend on this repository alone: can nothing shared, live or owned by others (a shared environment, a production service, the public network) change it? | fatal |
| self-starting | Does the test start what it needs by itself, with no step done by hand first? | |
| own-state | Does it build its start state from zero and give the same result in any order, alone or beside the other tests? | fatal |
| fixed-inputs | Are the clock, the random values and the generated ids it compares fixed by the test? | |
| waits-on-events | Does it wait on a signal or a poll with a limit, with no fixed pause? | |
| through-the-entry | Does it act through the entry the product uses, reaching into no internals to make the case happen? | |
| far-side-outcome | Does it assert what the far side holds or returned, not only that a call was made? | |
| round-trip | Is what was written read back by a separate path after the write is final, never from the object or session that wrote it? | |
| failing-side | Is the failing side the Check names (refused, slow, absent, stopped half way) tested at this seam, here or in a sibling test? | |
| no-lower | Does it leave the rule's own cases to unit tests, keeping one case for each way the seam behaves? | |
| no-wider | Does it stop at the seam, without the surface a person uses and without a chain of further seams? | |
| only-what-is-fixed | Does it compare only what the Check fixes, leaving free what the box leaves free (ids, times of writing, order)? | |
| can-fail | Does every assertion run on every run, and does a dependency that cannot start fail the run with its name, never skip it? | fatal |
| says-where | Does a failure name the seam, the expected and the seen, with a failed setup told apart from a failed check? | |
| leaves-no-trace | Does it remove what it created, on failure too, leaving the repository and the machine as found? | fatal |

## What the description on the card says

The reader cannot read code. The description tells them what is checked and how, in the box's own words:

- which parts meet, named as the product names them, never as files, functions or tools;
- what exists before, with its values;
- what is done;
- what is looked at, where, and what counts as passing;
- what is real and what is a stand-in, and what the stand-in was built from.

Short sentences, present tense, no "I". No words of the trade: mock, stub, fixture, container, assert, endpoint, or a tool's name. Values the reader can hold against the box. As many sentences as there are parts to tell, no more.

- Says it: "Checks the ledger and its store together. A book holds two March entries and March is closed. The test tries to save a third entry dated in March. It passes when the save is refused and March, read again from the store, holds the same two entries. The store is a real one, started for this test and removed after it."
- Does not: "Integration test for closeMonth with a database container; asserts findByMonth returns 2 rows."

## Common failures

- **Everything is a stand-in.** The test proves its stand-ins agree with each other. Make both sides of the seam real.
- **A lighter store in place of the real kind.** It accepts what the real one refuses. Start a private instance of the kind the product runs on.
- **A shared environment or a live service.** The test fails for reasons outside the repository. Use a private instance; for a part others own, a fake built from their published format or a recorded exchange.
- **The assertion is "the call was made".** The far side may hold nothing. Assert what it holds or returned. A call is the outcome only when sending is all the Check names.
- **Read back from the writer's own memory.** The value never reached the store. Read by a separate path after the write is final.
- **The structure written by the test.** The product's own setup is never exercised. Use the product's setup.
- **A fixed pause to wait.** Slow when it works, wrong when it does not. Wait on the signal, or poll with a limit.
- **Leftovers:** rows, files, a process still running, a port still held. Give unique names, and clean up in a step that runs on failure.
- **Every case of the rule through the seam.** Slow, and the seam is tested again per case for nothing. One case for each way the seam behaves; the rule's cases are unit tests.
- **The test grows into a walk through the product.** A failure no longer says where. Cut at the seam; a person's path is a journey.
- **A whole answer compared letter by letter.** It breaks on what the box never fixed. Compare what the Check fixes.
- **A missing dependency turns into a skip.** A skip reads as nothing wrong. Fail the setup and name what is missing.
