# End-to-end tests: sources and a worked example

Read with `SKILL.md` beside it. Part 1 says where each line of the Quality list comes from. Part 2 says where the sources disagree and what the skill takes. Part 3 is one example, from a box to the test and its card description.

## 1. Sources

Each was opened and read on 2026-11-18 unless marked otherwise. The names after "Supports" are the lines of the Quality list.

### What the kind is and when it fits

- Martin Fowler, "BroadStackTest", 2013. https://martinfowler.com/bliki/BroadStackTest.html
  A test that exercises most of the parts of a large application, also called end-to-end or full-stack; it may go through the user interface or through a service interface; calls to remote systems are left out and replaced by doubles checked with contract tests. Supports: right-kind, real-surface, owned-only.
- Martin Fowler, "TestPyramid", 2012. https://martinfowler.com/bliki/TestPyramid.html
  Tests through the user interface are brittle, costly to write and slow, and more prone to non-determinism; a high-level test is a second line of defence, and one that fails alone points at a missing lower test. Supports: right-kind.
- Ham Vocke, "The Practical Test Pyramid", 2018. https://martinfowler.com/articles/practical-test-pyramid.html
  End-to-end tests exist for a user interface and for an interface over the wire alike; push a test as far down as it can go; a higher test covers only what the lower ones cannot; choose the journeys that carry the product's core value. Supports: right-kind, from-journey, one-path, real-surface for a service.
- Mike Wacker, "Just Say No to More End-to-End Tests", Google Testing Blog, 2015. https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html
  A test is worth what it does for the fix: the feedback must be fast, reliable, and must isolate the failure; end-to-end tests are weakest on all three and keep one strength, they simulate a real user. Supports: right-kind, same-result, failure-says-where.
- Kent C. Dodds, "Write tests. Not too many. Mostly integration.", 2019. https://kentcdodds.com/blog/write-tests
  Confidence rises with each level and so does cost; tests tied to implementation details add little confidence and break on refactoring. Supports: right-kind, real-surface, as-the-actor-finds-it.
- Joseph Graves, "Larger Testing", chapter 14 of Software Engineering at Google, edited by Winters, Manshreck and Wright, O'Reilly, 2020. https://abseil.io/resources/swe-book/html/ch14.html
  A large test obtains a system under test, seeds its data, performs actions and verifies behaviour, which is the order of "How to write it"; a hermetic system under test reduces flakiness and conflicts; fixed sleeps give way to polling or events; a failure must say what failed and why. Supports: same-result, set-by-the-test, owned-only, waits-on-outcome, failure-says-where.

### Written from a journey, in the product's words

- Dan North, "Introducing BDD", 2006. https://dannorth.net/blog/introducing-bdd/
  A test's name is a sentence about behaviour; acceptance criteria are scenarios of given some context, when an event, then some outcomes, in the language the business uses. Supports: from-journey, reads-as-journey, and the shape of the card description.
- Cucumber documentation, "Writing better Gherkin". https://cucumber.io/docs/bdd/better-gherkin/
  Scenarios describe behaviour, not implementation; the test for a wording is whether it must change when the implementation does; declarative over imperative. Supports: from-journey, reads-as-journey, and step 1's rule that a journey names no control.
- Cucumber documentation, "Anti-patterns". https://cucumber.io/docs/guides/anti-patterns/
  Steps coupled to one feature and steps that join several actions do not survive reuse; organise by the concept of the domain. Supports: reads-as-journey.
- Martin Fowler, "PageObject", 2013. https://martinfowler.com/bliki/PageObject.html
  An object wraps a page with an interface in the application's terms so tests do not reach into the structure; such objects make no assertions, the test does. Supports: reads-as-journey.

### As the actor uses it

- Testing Library documentation, "Guiding Principles". https://testing-library.com/docs/guiding-principles/
  "The more your tests resemble the way your software is used, the more confidence they can give you." Supports: real-surface, as-the-actor-finds-it.
- Testing Library documentation, "About Queries", the Priority section. https://testing-library.com/docs/queries/about/
  Find things first by what everyone perceives (role, label, text), then by semantic attributes, and by a test id only when nothing else works. Supports: as-the-actor-finds-it.
- Playwright documentation, "Best Practices". https://playwright.dev/docs/best-practices
  Test what the user sees, not implementation details; each test isolated with its own storage and data; do not test what you do not control; prefer user-facing locators; assertions that wait and retry. Supports: real-surface, same-result, owned-only, as-the-actor-finds-it, waits-on-outcome.
- Playwright documentation, "Locators". https://playwright.dev/docs/locators
  Role first, text for what is not interactive, label for form fields, a test id as the fallback; style and structure paths are not recommended because they break when the structure changes. Supports: as-the-actor-finds-it.
- Prasad, Firshman, Tashian and Parish, "Command Line Interface Guidelines". https://clig.dev/
  What a command line program shows its caller: zero exit on success and non-zero on failure, the primary output on standard output, messages and errors on standard error. Supports: real-surface and asserts-the-check for a command line tool, where these are what the actor sees.

### The same result every time

- Martin Fowler, "Eradicating Non-Determinism in Tests", 2011. https://martinfowler.com/articles/nonDeterminism.html
  A test that passes and fails on the same code is useless as a regression test and teaches people to ignore failures. Causes and remedies: lack of isolation (rebuild the starting state for each test, runnable in any order), asynchronous behaviour (never a bare sleep; a callback, or polling against a limit), remote services (doubles, checked by contract tests), time (wrap the clock and set it), resource leaks. Supports: same-result, waits-on-outcome, set-by-the-test, owned-only.
- John Micco, "Flaky Tests at Google and How We Mitigate Them", Google Testing Blog, 2016. https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
  A flaky result is a pass and a fail on the same code. Measured there: about 1.5% of all test runs, almost 16% of tests with some flakiness, about 84% of pass-to-fail transitions involving a flaky test; rerunning hides real failures and people come to ignore the alarm. Supports: same-result, and the common failure "running it again until it passes".
- Playwright documentation, "Isolation". https://playwright.dev/docs/browser-contexts
  Starting each test from scratch against cleaning up in between: cleaning is easy to get wrong and leaks state into later tests. Supports: same-result, and the last common failure.
- Playwright documentation, "Auto-waiting". https://playwright.dev/docs/actionability
  An action waits until its target is ready and fails at a limit; assertions retry until the condition holds or the limit passes. Supports: waits-on-outcome.
- Cypress documentation, "Best Practices". https://docs.cypress.io/app/core-concepts/best-practices
  No test relies on the state another left; reset state before a test, not after, because an after hook may never run; no waiting for an arbitrary time; do not visit sites you do not control; set state and sign in programmatically; do not write tiny tests of one assertion as if they were unit tests. Supports: same-result, short-setup, waits-on-outcome, owned-only, one-path.
- Selenium documentation, "Generating application state", "Test independency", "Mock external services". https://www.selenium.dev/documentation/test_practices/encouraged/
  The browser driver is not for preparing a test: create data and sign in through an interface below it; write each test as its own unit; replace external services. Supports: short-setup, same-result, owned-only.
- Android Developers, "Espresso idling resources". https://developer.android.com/training/testing/espresso/idling-resource
  On a device, sleeps and retry loops are named as bad workarounds; the test waits on the app's own signal that its work is done. Supports: waits-on-outcome on a mobile app.
- Martin Fowler, "ContractTest", 2011. https://martinfowler.com/bliki/ContractTest.html
  A double for a remote service drifts from the real one; a separate test, run at the pace the service changes, checks that the double still answers as the service does. Supports: owned-only, and why the description names each stand-in.

### Known, not opened in this session

- Gerard Meszaros, xUnit Test Patterns: Refactoring Test Code, Addison-Wesley, 2007. The test smells Conditional Test Logic, Erratic Test (with Interacting Tests among its causes), Fragile Test and Obscure Test. Supports: can-fail, same-result, as-the-actor-finds-it, reads-as-journey.

### From HeadCanon itself

- asserts-the-check, seen-again and other-path apply the Check tests of `docs/format.md` (same-property, decidable, other-case) to a test: the test observes the same property as the Check, at the moment the Check names, and the case where the trigger does not hold is covered.
- leaves-nothing is the house rule that a test leaves the repository as it found it; the tool compares the repository before and after each run.

## 2. Where the sources disagree, and what the skill takes

- **How to find a control.** Cypress recommends attributes added for tests; Playwright and Testing Library put role, label and text first and a test id last. The skill takes the second: a test that finds things as the actor does also fails when the actor could no longer find them. A test id remains the answer where nothing the actor perceives identifies the thing.
- **Cleaning up.** The house rule says a test removes what it creates. Cypress and Fowler say a test must not depend on cleanup having run, because an interrupted run skips it. Both hold when the test works in a place of its own outside the repository, built fresh at the start: the repository is never touched, and removal at the end is tidiness.
- **How many.** Wacker gives a split of tests by kind as a first guess, Vocke says to keep end-to-end tests to the journeys that matter, Dodds weights the middle. The skill takes no number from any of them. It takes the method they share: a Check goes to the smallest kind that can observe it.
- **Setup through the surface.** A journey often begins with steps the actor really takes (signing in, entering data). Cypress and Selenium say to reach that state by a shorter route. The skill keeps both: the journey's "given" is built by the shorter route, every "does" is played through the surface, and the step that is itself under check somewhere has one test that plays it.

## 3. A worked example: Ledgerline

Ledgerline is an invented bookkeeping tool: entries, months, closing a month, statements. The web app is the platform shown; the same journey on other platforms follows.

### The box

```
REQ-3.2.1  A closed month refuses new entries          uid: k3f9a2   kind: binary
Intent: A closed month accepts no new entry dated within it.
Check:  When a month is closed and an entry dated within it is added, Ledgerline refuses
        the entry with the message "<month> is closed", and the month's statement shows
        the same total as before the attempt.
```

Why e2e: the Check names what an actor does (adds an entry) and sees (a refusal, a statement) across three capabilities: entries, closing, statements. The rule "is this date inside a closed month" is decided from inputs and has its own unit test on another box; this test does not repeat its variations.

The case from the tester's first pass, with values: given March 2025 with the entries "Office rent" 1,200.00 EUR and "Paper" 50.00 EUR; when the bookkeeper closes March 2025 and adds "Late invoice" 40.00 EUR dated 14 March 2025; then the entry is refused with "March 2025 is closed" and the March statement shows 1,250.00 EUR.

### The journey, recorded first

No journey passed through the box, so the tester records one. It names no button and no page.

```json
{ "op": "journey",
  "title": "The bookkeeper closes a month and a late entry is turned away",
  "state": "assumed",
  "source": "REQ-3.2, REQ-3.2.1, REQ-4.1",
  "why": "the e2e test of REQ-3.2.1 plays it",
  "steps": [
    { "label": "The month's entries", "requirements": ["REQ-2.1"],
      "given": "March 2025 is open and holds two entries that total 1,250.00 EUR",
      "does": "the bookkeeper opens March 2025",
      "sees": "both entries and the total 1,250.00 EUR" },
    { "label": "Closing", "requirements": ["REQ-3.2"],
      "does": "the bookkeeper closes March 2025",
      "sees": "March 2025 is shown as closed" },
    { "label": "A late entry", "requirements": ["REQ-3.2.1"],
      "does": "the bookkeeper adds an entry dated 14 March 2025",
      "sees": "the entry is refused with 'March 2025 is closed'" },
    { "label": "The statement", "requirements": ["REQ-3.2.1", "REQ-4.1"],
      "does": "the bookkeeper opens the statement of March 2025",
      "sees": "the total is still 1,250.00 EUR and the late entry is absent" }
  ] }
```

It is sent with `HC op - --by tester-REQ-3.2` and comes back as `JRN-3`, shown on the Journeys tab as a guess.

### The test, as a browser playbook

The project already tests its pages with Playwright, so the test uses it; another web project's usual tool would do the same job. One step of the test per step of the journey.

```ts
import { test, expect } from "@playwright/test";
import { freshBooks } from "./helpers/books";

test("[hc:k3f9a2] a closed month refuses a late entry and its statement keeps its total", async ({ page }) => {
  // Given: built by Ledgerline's own import into a temporary folder, with today's date set.
  const books = await freshBooks({
    today: "2025-04-02",
    entries: [
      { date: "2025-03-03", text: "Office rent", amount: "1200.00" },
      { date: "2025-03-10", text: "Paper", amount: "50.00" },
    ],
  });

  await test.step("S1 The month's entries", async () => {
    await page.goto(books.url);
    await page.getByRole("link", { name: "March 2025" }).click();
    await expect(page.getByRole("row", { name: /Office rent/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Paper/ })).toBeVisible();
    await expect(page.getByText("Total 1,250.00 EUR")).toBeVisible();
  });

  await test.step("S2 Closing", async () => {
    await page.getByRole("button", { name: "Close month" }).click();
    await page.getByRole("button", { name: "Close March 2025" }).click();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  });

  await test.step("S3 A late entry", async () => {
    await page.getByRole("button", { name: "Add entry" }).click();
    await page.getByLabel("Date").fill("2025-03-14");
    await page.getByLabel("Description").fill("Late invoice");
    await page.getByLabel("Amount").fill("40.00");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByRole("alert")).toHaveText("March 2025 is closed");
  });

  await test.step("S4 The statement", async () => {
    await page.reload();
    await page.getByRole("link", { name: "Statement" }).click();
    await expect(page.getByText("Total 1,250.00 EUR")).toBeVisible();
    await expect(page.getByText("Late invoice")).toHaveCount(0);
  });
});
```

What came from where:

- The message and the total come from the box and its case. They are the expected values.
- The names of the controls ("Close month", "Add entry") were read from the product, to learn how to call things. They are not expected values: were a name to change, the test would be updated and the box would not.
- The absence of "Late invoice" is asserted after the total is visible, so the statement has loaded before the test looks for what must not be there.
- `freshBooks` starts Ledgerline on books in a temporary folder outside the repository and returns their address. It asserts nothing.

### The same journey on the other platforms

The journey does not change. Only the surface does.

| Step | Command line tool | Service over the wire | Mobile app |
|---|---|---|---|
| Given | import the two entries into books in a temporary folder | create a set of books and post the two entries | install the app with seeded books |
| S1 | list March 2025; the output shows both entries and the total | read the entries of March 2025; the body holds both and the total | open March 2025; the screen shows both and the total |
| S2 | run the close command for March 2025; exit code zero | send the close request; a success status | press the control named "Close month" and confirm |
| S3 | run the add command dated 14 March 2025; a non-zero exit code and "March 2025 is closed" on standard error | post the entry; a refusal status whose body says "March 2025 is closed" | fill the entry and save; the screen shows "March 2025 is closed" |
| S4 | print the statement of March 2025; the total is 1,250.00 EUR and no line reads "Late invoice" | read the statement in a new session; the same total, no late entry | reopen the app and the statement; the same total, no late entry |

### The record and the card

```json
{ "box": "k3f9a2", "runner": "e2e-web", "kind": "e2e", "journey": "JRN-3",
  "file": "tests/e2e/closed-month-refuses-entry.spec.ts",
  "title": "[hc:k3f9a2] a closed month refuses a late entry and its statement keeps its total",
  "description": "Played in a real browser on a running Ledgerline with fresh books. March 2025 holds two entries that total 1,250.00 EUR. The bookkeeper closes the month, then tries to add an entry dated 14 March 2025. The test passes when Ledgerline refuses the entry with the words 'March 2025 is closed' and the March statement still shows 1,250.00 EUR." }
```

The description says how it is played, the starting state, what the bookkeeper does and what they must see. It names no file, no control and no tool.

### The Quality list applied

| Check | Answer | Why |
|---|---|---|
| right-kind | yes | an actor's action and what they see across entries, closing and statements; the date rule's variations are left to its unit test |
| from-journey | yes | names JRN-3; steps S1 to S4 in order, nothing added |
| real-surface | yes | every "does" and "sees" is in the browser on the running product; only the "given" is imported |
| asserts-the-check | yes | ends on the refusal message and the unchanged total, both from the box |
| can-fail | yes | no condition around any assertion; with the box not built, S3 fails because the entry is saved |
| same-result | yes | its own books in its own folder; nothing shared with another test |
| waits-on-outcome | yes | every look is an assertion that retries until a limit; no pause |
| leaves-nothing | yes | the books live in a temporary folder outside the repository |
| short-setup | yes | the two entries arrive by import; entering entries is another box's check |
| set-by-the-test | yes | today's date is given to `freshBooks`; the entries carry fixed dates |
| owned-only | yes | Ledgerline alone; no outside system is called |
| as-the-actor-finds-it | yes | role and name, label, visible text throughout |
| one-path | yes | one path, the refusal, with an assertion wherever the path has something to see |
| seen-again | yes | the statement is read after a reload |
| other-path | yes, elsewhere | the other outcome, an entry accepted in an open month, is the journey of REQ-2.1 and has its own test |
| reads-as-journey | yes | steps carry the journey's labels; the helper makes no assertion |
| failure-says-where | yes | a failure names the step (for example "S3 A late entry"), the expected text and what the page showed; the runner keeps a trace |
