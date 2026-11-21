# Unit tests: reference

The sources behind the Quality list of the unit test skill, the names the field gives to stand-ins, and one worked example. The product in the example is invented.

## Contents

1. Sources, and the checks each supports
2. Stand-ins, by their usual names
3. Worked example: from a box to its tests and their descriptions
4. A test of the same box that fails the list

## 1. Sources, and the checks each supports

Opened on 2026-11-18:

| Source | Supports |
|---|---|
| Kent Beck, "Test Desiderata", 2019. Read at https://testdesiderata.com/, where the essay's address https://kentbeck.github.io/TestDesiderata/ now leads: twelve properties of a test, each with one line, and the note that some support each other and some pull apart. | isolated (Isolated); deterministic (Deterministic); quick (Fast); reads-cold (Readable); would-fail (Behavioral: sensitive to changes in behaviour); survives-rewrite (Structure-insensitive); failure-says-why (Specific); same-property (Predictive); cases-cover (Composable: each dimension tested apart) |
| Adam Bender, "Testing Overview", chapter 11 of Winters, Manshreck and Wright (eds.), Software Engineering at Google, O'Reilly, 2020. https://abseil.io/resources/swe-book/html/ch11.html | right-kind (a small test runs in one process, with no input or output, no sleep, no blocking call); deterministic and isolated (hermetic tests, what flakiness costs); quick; straight-line ("a test should be obvious upon inspection"). Also why the list has no coverage figure: coverage shows that a line ran, not that its result was checked |
| Erik Kuefler, "Unit Testing", chapter 12 of the same book. https://abseil.io/resources/swe-book/html/ch12.html | survives-rewrite (test through public interfaces; "the ideal test is unchanging"); one-behaviour (a test per behaviour, not per method); named-for-behaviour; reads-cold (complete and concise; values a test depends on stated in the test, not in shared setup); straight-line (no logic in tests); failure-says-why; calls-only-promised (test state, not interactions); the given, when, then order of the method |
| Andrew Trenk and Dillon Bly, "Test Doubles", chapter 13 of the same book. https://abseil.io/resources/swe-book/html/ch13.html | stand-ins-needed (the real part is preferred when it is fast, deterministic and simple to build; a fake must behave as the real one for what the test uses); real-rule (a stub cannot verify real behaviour); calls-only-promised (checking calls only for functions that change state outside); promised-only (no overspecification) |
| Martin Fowler, "Mocks Aren't Stubs", 2004, revised 2007. https://martinfowler.com/articles/mocksArentStubs.html | the names in section 2; survives-rewrite and calls-only-promised (a test that checks outbound calls is coupled to how the code is written; "a classic test only cares about the final state") |
| Martin Fowler, "UnitTest", 2014. https://martinfowler.com/bliki/UnitTest.html | right-kind (what a unit is depends on the situation; what unit tests share is a small part and speed); quick (no fixed figure: fast enough that running them is never put off); stand-ins-needed (real collaborators are fine while they are stable and fast) |
| Martin Fowler, "Eradicating Non-Determinism in Tests", 2011. https://martinfowler.com/articles/nonDeterminism.html | deterministic (the clock wrapped and fixed, no fixed sleeps, no remote service); isolated (fresh state for each test) |
| Bill Wake, "3A: Arrange, Act, Assert", 2011. https://xp123.com/3a-arrange-act-assert/ | one-behaviour (one arrangement and one action per test); steps 5 and 6 of the method |
| Vladimir Khorikov, "Structural Inspection", 2016. https://enterprisecraftsmanship.com/posts/structural-inspection/ | survives-rewrite (a test of how the code is built fails on a harmless rewrite and proves nothing about the result) |
| Vladimir Khorikov, "When to Mock", 2020. https://enterprisecraftsmanship.com/posts/when-to-mock/ | stand-ins-needed and calls-only-promised (mock only what the product does not control and other systems see; calls between the product's own parts are details of how it is built) |

Known, not opened on that day:

| Source | Supports |
|---|---|
| Vladimir Khorikov, Unit Testing: Principles, Practices, and Patterns, Manning, 2020, chapter 4, the four pillars. Only the chapter's headings were served at https://livebook.manning.com/book/unit-testing/chapter-4. | would-fail (protection against regressions); survives-rewrite (resistance to refactoring, the one the book does not trade away, which is why it is fatal here); quick (fast feedback); reads-cold and one-behaviour (maintainability) |
| Gerard Meszaros, xUnit Test Patterns: Refactoring Test Code, Addison-Wesley, 2007, the test smells. Its site, xunitpatterns.com, reset the connection on each of four tries. | reads-cold (Obscure Test, Mystery Guest, General Fixture); straight-line (Conditional Test Logic); failure-says-why and one-behaviour (Assertion Roulette, Eager Test); deterministic and isolated (Erratic Test); survives-rewrite and promised-only (Fragile Test, Overspecified Software, Sensitive Equality); quick (Slow Tests); the names in section 2 |
| Glenford Myers, The Art of Software Testing, Wiley, 1979: equivalence classes and boundary values. | step 2 of the method; would-fail (each bound, on it and beside it); cases-cover (each class once) |
| DeMillo, Lipton and Sayward, "Hints on Test Data Selection: Help for the Practicing Programmer", IEEE Computer 11(4), 1978: mutation. | would-fail (tests are judged by whether they tell the program from its nearly right variants) |
| Barr, Harman, McMinn, Shahbaz and Yoo, "The Oracle Problem in Software Testing: A Survey", IEEE Transactions on Software Engineering 41(5), 2015. | expected-from-box and same-property (the expected result must come from a statement of what is wanted, apart from the program under test) |
| Michael Feathers, Working Effectively with Legacy Code, Prentice Hall, 2004: characterization tests. | expected-from-box (a value read off the code records what the code does, never whether that is what is wanted) |

Tried and not read, so not cited as support: Beck's essay on Medium (the server answered 403), and three posts of the Google Testing Blog (the pages came without the article text).

Two checks rest on HeadCanon's own rules as well as on the literature: expected-from-box (every expected value comes from the box) and the second half of isolated (a test leaves the repository as it found it).

## 2. Stand-ins, by their usual names

The field calls a stand-in a test double. Meszaros's names, as Fowler gives them:

- **dummy**: passed along and never used.
- **fake**: a working version with a shortcut that keeps it out of production, such as a store kept in memory.
- **stub**: hands back fixed answers to the calls the test makes.
- **spy**: a stub that also records how it was called.
- **mock**: set up beforehand with the calls it expects, and fails when they differ.

A test that looks at the result afterwards verifies state; one that looks at the calls made verifies behaviour. The skill asks for the first and allows the second only where the call is the promise.

## 3. Worked example: from a box to its tests and their descriptions

Ledgerline keeps books: entries, months, closing a month, statements. The glossary says an **entry** is a dated record of debits and credits with a number; an entry **balances** when its debits and its credits total the same; a **closed** month takes no new entry and no change.

The box, as the tester receives it:

```markdown
---
id: REQ-4.2.1
parent: REQ-4.2
title: "A month with an unbalanced entry is not closed"
state: assumed
layer: requirement
kind: binary
uid: k7m2qx
---

## Intent

Closing a month is refused while an entry dated in that month does not balance, and the refusal names every such entry.

## Check

When closing is requested for a month that holds an entry with debits of 100.00 and credits of 99.99 in the ledger's currency, the month stays open and the refusal names that entry; when every entry dated in the month balances, the month closes.
```

**The kind.** The Check observes a result computed from the entries of a month and one request. The same entries give the same answer, and nothing outside one process is needed. A unit test. What the closing screen shows belongs to the journey Closing a month.

**1 The rule.** Given a month with an entry dated in it that does not balance, when closing is requested, the request is refused, the refusal names each such entry, and the month stays open; given none, the month closes.

**2 The cases, from the box's words.** The condition has two sides. "Dated in that month" has two bounds, the first day and the last. "Does not balance" has two classes, debits above credits and credits above debits. "Every such entry" is the case of more than one.

**3 The expected values, written before any code is read.**

| Case | Entries given | Month asked | Expected |
|---|---|---|---|
| A, the condition holds | 1: 10 March 2026, 100.00 against 100.00. 2: 10 March 2026, 100.00 against 99.99 | March 2026 | refused, names entry 2 only, March open |
| B, the condition fails | 1: 10 March 2026, 100.00 against 100.00 | March 2026 | March closed |
| C, on the last day | 1: 31 March 2026, 100.00 against 99.99 | March 2026 | refused, names entry 1, March open |
| D, the day after | 1: 31 March 2026, 100.00 against 100.00. 2: 1 April 2026, 100.00 against 99.99 | March 2026 | March closed |
| E, on the first day | 1: 1 March 2026, 100.00 against 99.99 | March 2026 | refused, names entry 1, March open |
| F, the day before | 1: 1 March 2026, 100.00 against 100.00. 2: 28 February 2026, 100.00 against 99.99 | March 2026 | March closed |
| G, more than one | 1: 100.00 against 100.00. 2: 100.00 against 99.99. 3: 50.00 against 20.00, all 10 March 2026 | March 2026 | refused, names entries 2 and 3 only, March open |
| H, credits above debits | 1: 10 March 2026, 99.99 against 100.00 | March 2026 | refused, names entry 1, March open |

Gaps, reported and not tested: the box does not say whether a month with no entry closes, and no case here needs it. How the refusal names an entry is not said either; the tests compare which entries are named, never the words of the message.

**4 The entry.** Reading the code shows that the closing screen and the command both close a month through one call, which takes a ledger and a month and gives back the closed month or a refusal carrying entries. The tests call that. They do not call the inner function that totals one entry.

**5 Arrange.** The ledger is built in memory by the product's own code, with the entries written in each test. No stand-in is needed: the dates are given, so no clock is read, and nothing is stored outside the process.

**6 and 7 The tests.** Written here in no language; the project's runner decides the syntax (a Python project would usually use pytest, a TypeScript one Vitest or Jest, a Go one its standard testing package). Each assertion carries its message.

```text
test "[hc:k7m2qx] closing a month is refused while one of its entries does not balance"
  given  a ledger holding
           entry 1, dated 10 March 2026: debits 100.00, credits 100.00
           entry 2, dated 10 March 2026: debits 100.00, credits 99.99
  when   closing March 2026 is requested
  then   the answer is a refusal                 "an unbalanced entry in March must refuse the closing"
         the refusal names exactly: entry 2      "the refusal names the unbalanced entry and no other"
         March 2026 is open                      "a refused closing leaves the month open"

test "[hc:k7m2qx] an unbalanced entry dated the day after the month does not stop its closing"
  given  a ledger holding
           entry 1, dated 31 March 2026: debits 100.00, credits 100.00
           entry 2, dated 1 April 2026:  debits 100.00, credits 99.99
  when   closing March 2026 is requested
  then   March 2026 is closed                    "only entries dated in March count for closing March"
```

The other six follow the table in the same shape, one test each.

**8 See it fail.** Closing is built in Ledgerline. Case A passes at first run; with "entry 2" changed to "entry 1" it fails with "the refusal names the unbalanced entry and no other: expected entry 1, found entry 2", and the right value goes back. Case H fails: the month closes. Its arrangement and entry are those of case A, which passes, so the test stands: the code refuses only when debits are the larger side, and the box says "does not balance". The expected value stays, the finding is reported, and the box shows as out of sync until the code is aligned.

**9 The descriptions on the card.**

- Case A: "Checks that a month is not closed while one of its entries does not balance. It sets up March 2026 with two entries dated 10 March, one of 100.00 against 100.00 and one of 100.00 against 99.99, and asks to close the month. It expects a refusal that names only the second entry, with March still open. The closing rule is tried directly; nothing else of Ledgerline runs."
- Case D: "Checks that only entries dated in the month count when it is closed. It sets up a balanced entry dated 31 March 2026 and one of 100.00 against 99.99 dated 1 April 2026, and asks to close March. It expects March closed. The closing rule is tried directly; nothing else of Ledgerline runs."

Each test is then recorded as the test skill says, the description in its own field:

```json
{"box":"k7m2qx","runner":"<the runner's recorded name>","kind":"unit","file":"<the test file>","title":"[hc:k7m2qx] closing a month is refused while one of its entries does not balance","description":"Checks that a month is not closed while one of its entries does not balance. It sets up March 2026 with two entries dated 10 March, one of 100.00 against 100.00 and one of 100.00 against 99.99, and asks to close the month. It expects a refusal that names only the second entry, with March still open. The closing rule is tried directly; nothing else of Ledgerline runs."}
```

## 4. A test of the same box that fails the list

```text
test "closing works"
  given  the shared sample ledger
  when   closing is requested for each month of the sample
  then   for each month: the refusal's entries equal the month's entries where debits differ from credits
         the balance checker was called once per entry
description: "Asserts the closing function returns the unbalanced fixtures."
```

The reviewer's findings, by check:

- expected-from-box, fatal: the expected entries are computed in the test with the rule's own comparison. What would pass: the entries written out, as in the table of section 3.
- survives-rewrite, fatal: the count of calls to an internal part is asserted. What would pass: the refusal and the month's state only.
- reads-cold: the values that decide the result sit in a shared sample.
- straight-line and one-behaviour: a loop over months holds every case in one test.
- named-for-behaviour: "closing works" names neither a condition nor a result.
- The description uses code words and gives no value and no result, so the question every kind shares, whether a person who cannot read code learns what is checked and how, is also a no.

Verdict: fail.
