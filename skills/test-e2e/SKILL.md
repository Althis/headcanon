---
name: test-e2e
description: "What a good end-to-end test is: a recorded journey played step by step through the product's real surface, the way a person or a calling system uses it, ending on what the box's Check names. The method in order, a Quality list of yes-or-no tests with the fatal ones marked, and how the card describes the test in plain words. Holds for a web app, a command line tool, a service called over the wire and a mobile app alike."
when_to_use: "The tester writes an e2e test for a box, or the reviewer decides pass or fail on one; or the human asks what makes an end-to-end test good."
---

# End-to-end tests: a journey played through the real surface

`HC` means `node "${CLAUDE_PLUGIN_ROOT}/packages/canon/bin/headcanon.js"`. The method every kind of test shares is in `skills/test/SKILL.md`; this file holds what is particular to this kind. The sources behind each line and a worked example are in `reference.md` beside it.

Words used here:
- The **actor** is who uses the product from outside: a person, or a system that calls it.
- The **surface** is where the actor meets the product: its screens, a terminal, its published interface over the wire.
- A **stand-in** is a replacement the test controls for a system the project does not own.

## When this kind fits

By what the box's Check observes:

- It fits when the Check names something an actor does and then sees through the surface, and the result exists only with the product running whole: a flow across capabilities, a journey.
- A rule computed from inputs is a unit test, even when a screen shows its result.
- Parts working together behind the surface is an integration test.
- A quality judged on examples is an eval. What only a person can judge (it looks right, it reads well) stays a human judgment and gets no test.
- Where a smaller kind can observe the same Check, the smaller kind is the right one: it answers sooner and its failure points at the cause. The e2e test keeps the path only the whole can show; the variations of a rule stay with the tests below.

## How to write it

1. **The journey first.** Find the journey that passes through the box (`HC context <id>`, `HC find "<words>"`). When none does, record one with `HC op` journey, assumed: the actor, then each step as given, does, sees, citing its boxes. Write it from the box and its relatives, in the product's words, naming no control, address or argument. A journey that would have to change when the surface is redesigned is written too low.
2. **The surface and the tool.** The platform decides, and the project's own runner when it has one.

   | Platform | The surface | The actor does | The actor sees | The usual tool, as examples |
   |---|---|---|---|---|
   | web app | pages in a real browser | opens, types, presses | text, the state of controls, where they landed | a browser playbook (Playwright, Cypress, Selenium) |
   | command line tool | the built command in a real shell | runs it with arguments, input and files | standard output, standard error, the exit code, files written | a scripted session (Bats, an expect script, the language's process runner) |
   | service over the wire | its published interface, deployed | sends requests as a client | status, body, headers, a later read showing the effect | calls over the wire (the project's client library, REST-assured) |
   | mobile app | the installed app on a device or emulator | taps, types, swipes | what the screen shows and announces | a device playbook (Espresso, XCUITest, Maestro) |

3. **The starting state.** The journey's "given", built by the test itself, fresh, in a place of its own outside the repository: a temporary folder, a scratch database, a new profile, a new account.
   - By the shortest honest route: a seed, an import, the product's own interface. Through the surface only where the setup is itself what the box checks.
   - Whatever the result depends on is set by the test: today's date, the random seed, the data.
   - The product runs whole and real. A system the project does not own is replaced at the boundary by a stand-in.
4. **The steps.** One step of the test for each step of the journey, in order, named as the journey names it.
   - Each "does" goes through the surface, finding things the way the actor finds them: a control by its role and name, its label, its visible text; a command by its documented name and arguments; a call by its published route.
   - After an action that takes time, wait for what the actor would see next, with a limit. Never a fixed pause.
   - Each "sees" is an assertion on what the surface shows.
   - The details of the surface (selectors, addresses, arguments) live in helpers that act and report. Assertions stay in the test.
5. **The end.** The last assertions observe what the Check names as yes, with values from the box, never from what the product shows today. A result the Check says is kept is observed again after a fresh start: a reload, a new session, a second call. A refusal or another outcome the journey names is a test of its own.
6. **Prove it.** Run it. Where the box is not built, it fails at the missing step, and the failure names the step, what was expected and what was seen. Where the box is built, change one expected value, see it fail, restore it. Run it alone and after another test: the result is the same.
7. **Record it.** `HC tests add` with kind `e2e`, the journey's id in `journey`, and the description as the section below asks.

## Quality list

The tester applies it before recording; the reviewer applies it for the verdict and names the line that failed. A no on a fatal line fails the test. Any other no goes in the note with what would make it a yes.

| Check | Test | |
|---|---|---|
| right-kind | Does the Check observe what an actor does and sees through the surface with the product whole, beyond what a smaller kind could observe, the variations of a rule left to the tests below? | |
| from-journey | Does the test name a recorded journey, and does each of its steps play one step of that journey, in order? | fatal |
| real-surface | Does every action and observation of the played steps go through the surface the actor uses, with the product running whole: no internal function called, no store read or written directly? | fatal |
| asserts-the-check | Does it end by observing what the box's Check names as yes, with the expected values taken from the box? | fatal |
| can-fail | Would it fail with the behaviour missing or wrong: does every assertion run on every run, none inside a condition, a caught failure or a skipped step? | fatal |
| same-result | Does it build its own starting state, in a place of its own, so that the result is the same alone, after any other test, and beside a second copy of itself? | fatal |
| waits-on-outcome | Does every wait name what the actor would see and a limit, with no fixed pause anywhere? | fatal |
| leaves-nothing | Does the repository hold the same files after the run as before it? | fatal |
| short-setup | Is the starting state built by a route shorter than the surface, except where the setup is what the box checks? | |
| set-by-the-test | Are the date, the randomness and the data the result depends on set by the test, not taken from the wall clock or a shared store? | |
| owned-only | Does it touch only systems the project controls, each outside system replaced by a stand-in that the description names? | |
| as-the-actor-finds-it | Is each thing found the way the actor finds it, a test-only id used only where nothing the actor perceives identifies it, and no style class, structure path or generated id? | |
| one-path | Does it play one path of the journey to one outcome, with as many assertions along it as the path has things to see? | |
| seen-again | Where the Check says a result is kept, is it observed again through the surface after a fresh start? | |
| other-path | Where the journey names a refusal or another outcome the actor sees, does a test of its own play it? | |
| reads-as-journey | Are the steps named in the journey's words, the surface's details kept in helpers that make no assertions? | |
| failure-says-where | Does a failure name the journey step, what was expected and what was seen, and keep the evidence the platform offers (a screenshot, the captured output, the response)? | |

## What the description on the card says

The card shows the description to a person who cannot read code. It says, in this order:

- How the test is played, as that person knows the platform: "in a real browser", "by typing commands in a terminal", "by calling the running service as a client would", "on a phone".
- The starting state, with its values.
- What the actor does, in the journey's words.
- What the actor must see for the test to pass, with the values from the box.
- Anything replaced by a stand-in, said outright.

Whole sentences, present tense, the canon's glossary words. No file name, selector, function, runner, or status number without its meaning. Nothing the test does not do.

- Says it: "Played in a real browser on a running Ledgerline with fresh books. March 2025 holds two entries that total 1,250.00 EUR. The bookkeeper closes the month, then tries to add an entry dated 14 March 2025. The test passes when Ledgerline refuses the entry with the words 'March 2025 is closed' and the March statement still shows 1,250.00 EUR."
- Does not: "Runs closed-month.spec, clicks #close-btn, expects .alert and the total selector to equal 1250."

## Common failures

- A fixed pause before looking. Instead: wait for what the actor would see, with a limit.
- Finding a control by its style class or its place in the structure. Instead: its role and name, its label, its visible text; a test-only id as the last resort.
- A chain of tests, one creating what the next uses. Instead: each builds its own starting state.
- Building the starting state through the surface in every test, signing in by hand each time. Instead: the shorter route, and one test that plays the sign-in itself.
- Asserting on the store or an internal value. Instead: look again through the surface, as the actor would.
- An assertion that runs only if something is there. Instead: the starting state is known, so assert without a condition.
- The expected value copied from what the product shows today. Instead: from the box; a value the box lacks is a gap, noted on the box with `HC op` note.
- A journey written from the screens, press by press. Instead: from the box, in the product's words; the presses belong to the test's helpers.
- One e2e test for each variation of a rule. Instead: one path here, the variations in the unit or integration tests.
- Replacing the product's own parts with stand-ins. Instead: run it whole; with its parts replaced it is an integration test and is recorded as one.
- Calling a real outside system. Instead: a stand-in at the boundary, named in the description.
- Running it again until it passes, or marking it as unreliable. Instead: find the cause, which is shared state, time, or a wait on the wrong thing.
- Writing into the repository, or cleaning up only at the end. Instead: work in a place of its own, built fresh at the start; removal at the end is tidiness, never what the next run depends on.
