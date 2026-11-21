# Integration tests: sources and a worked example

Read with `SKILL.md` beside it. The names in the "supports" column are the checks of its Quality list.

## Sources

Opened and read on 2026-11-18, except the last group.

| Key | Source | What it says that the skill uses | Supports |
|---|---|---|---|
| Fowler-IT | Martin Fowler, "IntegrationTest", bliki, 2018. https://martinfowler.com/bliki/IntegrationTest.html | The term has two senses. Narrow: only the code that talks to a separate part, with doubles for the rest, in process or over the wire, run early. Broad: live versions of everything, better called system or end-to-end tests. | right-kind, one-seam, no-wider, hermetic |
| Fowler-CT | Martin Fowler, "ContractTest", bliki, 2011. https://martinfowler.com/bliki/ContractTest.html | A double always raises the question of whether it is accurate; a contract test run against the real service answers it. It checks the format, not the exact data. It runs at the pace of the other service, apart from the build. | stand-in-kept-true, only-what-is-fixed, hermetic |
| SWE-13 | Andrew Trenk and Dillon Bly, "Test Doubles", chapter 13 of Winters, Manshreck and Wright, Software Engineering at Google, O'Reilly, 2020. https://abseil.io/resources/swe-book/html/ch13.html | "A real implementation should be preferred over a test double." A fake when the real one is too slow, not deterministic or too hard to build; a fake has fidelity to the real contract and is itself tested against the real implementation. Stubbing gives unclear, brittle tests that cannot store state. Testing state is preferred over testing interactions; over-specified arguments make tests break for nothing. | crosses-for-real, same-kind, stand-in-kept-true, far-side-outcome, only-what-is-fixed |
| SWE-14 | Joseph Graves, "Larger Testing", chapter 14 of the same book. https://abseil.io/resources/swe-book/html/ch14.html | What unit tests leave open: unfaithful doubles, configuration, behaviour that emerges between parts. Fidelity defined. The shape of a larger test: obtain the system, seed the data, act, verify. A hermetic system under test. Flakiness makes larger tests unusable; timed sleeps are replaced by events or polling. A failure names what failed and shortens the way to the cause. Record and replay as a way to build a smaller test from real traffic. | right-kind, as-shipped, hermetic, own-state, waits-on-events, says-where, stand-in-kept-true |
| Clemson | Toby Clemson, "Testing Strategies in a Microservice Architecture", martinfowler.com, 2014. https://martinfowler.com/articles/microservice-testing/ (read in its text version, https://martinfowler.com/articles/microservice-testing/fallback.html) | An integration test "verifies the communication paths and interactions between components to detect interface defects". Gateway tests: basic success and error paths, protocol errors, and timeouts or slow answers triggered through a configurable stub. Persistence tests: the structure the code assumes matches the store's, and the transaction is closed between the setup, the action and the assertion so the data makes the whole round trip. Such tests have more than one reason to fail, so they are kept to what the seam needs. | right-kind, failing-side, round-trip, as-shipped, no-lower, hermetic |
| Vocke | Ham Vocke, "The Practical Test Pyramid", martinfowler.com, 2018. https://martinfowler.com/articles/practical-test-pyramid.html | Integration tests cover the product with what lives outside it: stores, file systems, calls over the network. One integration point at a time. The dependency runs locally. For a store: start it, connect, write through the product, read back. Wherever data is turned into another form or back, a test. "Push your tests as far down the test pyramid as you can." Contract tests run against the fake and the real server. | one-seam, self-starting, same-kind, round-trip, no-lower, stand-in-kept-true |
| Pact | Pact Foundation, Pact documentation, undated: "Introduction" and "Writing Consumer tests". https://docs.pact.io/ and https://docs.pact.io/consumer | Contract testing checks each side of an integration point alone against a shared contract made from the consumer's own tests, so only what a consumer uses is fixed. Assertions "just strict enough" for the consumer to keep working. State set up explicitly. No random data in what is compared. Kept to the code that makes the call, not whole flows. | stand-in-kept-true, only-what-is-fixed, own-state, fixed-inputs, no-wider |
| Testcontainers | Testcontainers, "What is Testcontainers, and why should you use it?", guide, undated. https://testcontainers.com/guides/introducing-testcontainers/ | An in-memory substitute "may not have all the features of your production service", so a test passes there and fails on the real one. A shared, pre-provisioned environment lets one run interfere with another's data. The practice: start the real service before the test, point the product's settings at it, destroy it after, whether the test passed or failed. | same-kind, hermetic, own-state, self-starting, leaves-no-trace |
| Fowler-ND | Martin Fowler, "Eradicating Non-Determinism in Tests", martinfowler.com, 2011. https://martinfowler.com/articles/nonDeterminism.html | Causes of a test that passes and fails on the same code, with the remedy for each: no isolation (rebuild the state from scratch; "Properly isolated tests can be run in any sequence"), asynchronous work (never a bare sleep; a callback or polling), remote services (doubles, checked by contract tests), time (wrap the clock), leaked resources. | own-state, waits-on-events, fixed-inputs, hermetic, leaves-no-trace |
| Spotify | André Schaffer and Rickard Dybeck, "Testing of Microservices", Spotify Engineering, 2018. https://engineering.atspotify.com/2018/01/testing-of-microservices | An integrated test is one "that will pass or fail based on the correctness of another system"; ideally there are none. An integration test checks a service alone through its points of interaction: start a store, fill it, start the service, ask its real interface, so internals change without touching tests. | hermetic, through-the-entry, same-kind |
| Dodds | Kent C. Dodds, "Write tests. Not too many. Mostly integration.", 2019. https://kentcdodds.com/blog/write-tests | Parts shown to work alone are not shown to work together. Each mock removes confidence in how the code works with what it depends on; mock only what cannot be run, such as a real payment. | right-kind, crosses-for-real |
| Rainsberger | J. B. Rainsberger, "Integrated Tests Are a Scam", 2009, note added 2023. https://blog.thecodewhisperer.com/permalink/integrated-tests-are-a-scam | A test that depends on several pieces of real behaviour at once cannot cover their paths: the paths multiply with each layer, so only a small share is ever written, and the suite gives confidence it has not earned. | no-lower, no-wider |

Known, not opened on that day; cited for the origin of an idea only:

- Mike Cohn, Succeeding with Agile, Addison-Wesley, 2009: the test pyramid.
- Ian Robinson, "Consumer-Driven Contracts: A Service Evolution Pattern", martinfowler.com, 2006: the origin of consumer-driven contracts.
- Gerard Meszaros, xUnit Test Patterns, Addison-Wesley, 2007: the vocabulary of test doubles (fake, stub, mock) that SWE-13 uses.

Checks that rest on HeadCanon's own rules as well as on the sources:

- checks-the-check: the Check quality "same-property" in `docs/format.md`, carried to the test.
- leaves-no-trace: the rule that a test leaves the repository as it found it; the run compares the repository before and after.
- can-fail: a skipped test does not count as failing, so a setup that cannot start must not hide as one.
- through-the-entry: also the rule that the code is read only to learn how to call things.

## Where the sources disagree, and what the skill takes

- **How many.** The pyramid (Cohn, Vocke, Clemson) wants few integration tests above many unit tests, and Rainsberger explains why wide ones cannot cover the paths. The honeycomb (Spotify) and the trophy (Dodds) want mostly integration tests, because unit tests bound to internals slow change and prove less. The skill takes no side on a number: the kind follows what the Check observes, one test per seam the Check names.
- **What both sides agree on,** which is what the Quality list keeps: the test is narrow; it runs this product against its real dependency, alone; it does not pass or fail on the correctness of someone else's system; a double is trusted only when something checks it against the real part.
- **The word.** Fowler notes that "integration test" names two different things. The skill uses the narrow sense and sends the broad one to the e2e kind.
- **A contract test against a live service** fails for reasons outside the repository (Fowler-CT: it need not break the build). It is therefore not recorded as a node's test; it is what a project runs apart, to keep a stand-in true.

## Worked example: Ledgerline

Ledgerline is an invented bookkeeping tool: entries, months, closing a month, statements.

### The node

- Title: A closed month refuses new entries
- uid: `7c1e9a`
- Intent: A closed month holds the entries it had at closing. An entry dated inside a closed month is refused.
- Kind: binary
- Check: After a month holding entries is closed, saving an entry dated in that month is refused, and the month's entries read from the store equal the entries it held at closing.

### Choosing the kind

- The Check observes two things: a refusal, and what the store holds afterwards. "Read from the store" is behind the surface, and it crosses a seam.
- The parts can be right alone and wrong together: the refusal is answered, yet the entry was written before the rule ran; or closing is kept in memory and never stored, so a fresh reader finds March open.
- It is not a unit test: the rule "closed means refuse" alone would pass with both defects above. It is not a journey: nobody's path through the product is told.
- The seam, in one sentence: the ledger and its store; what crosses is the closing of a month and the entries of that month.

### The test

Written in no language: the project's own runner decides the real form.

```
test "[hc:7c1e9a] a closed month refuses a new entry and keeps the entries it had"

  setup
    store  = a private store of the kind Ledgerline runs on, started for this test,
             given its structure by Ledgerline's own setup
    ledger = Ledgerline opened on that store, its clock fixed at 2 April
    book   = a new book in ledger, under a name unique to this test
    ledger.add_entry(book, 5 March,  "Rent",  1200.00)
    ledger.add_entry(book, 18 March, "Paper",   40.50)
    ledger.close_month(book, March)

  act
    answer = ledger.add_entry(book, 30 March, "Late invoice", 310.00)

  observe
    reader  = Ledgerline opened anew on the same store
    entries = reader.entries_of(book, March)

  expect
    answer is a refusal
        on failure: "ledger and store: saving into closed March was not refused, got <answer>"
    entries, each as (date, label, amount), are exactly
        (5 March, "Rent", 1200.00) and (18 March, "Paper", 40.50)
        on failure: "ledger and store: closed March holds <entries>, expected the two entries it had at closing"

  cleanup, also when a step above failed
    remove the book; stop the store and delete what it wrote
    if the store could not start: setup error "the store could not start: <reason>", not a skip
```

### The Quality list, applied

- right-kind: yes. The Check reads from the store after a refusal.
- one-seam: yes. The ledger and its store, named in the description.
- crosses-for-real (fatal): yes. Ledgerline's own code on one side, a real store on the other; no stand-in.
- checks-the-check (fatal): yes. A save that is not refused fails the first expectation; a refusal that still wrote, or a closing that was never stored, fails the second.
- same-kind: yes. The store is the kind Ledgerline runs on.
- as-shipped: yes. The structure comes from Ledgerline's own setup.
- stand-in-kept-true: does not apply, there is none.
- hermetic (fatal): yes. The store is private to the test; nothing outside the repository is reached.
- self-starting: yes. The test starts the store.
- own-state (fatal): yes. A new book under a unique name, filled by the test.
- fixed-inputs: yes. The clock is fixed, the dates and amounts are written out.
- waits-on-events: does not apply. Each step returns when it is done.
- through-the-entry: yes. Entries are added and the month is closed the way the product does it.
- far-side-outcome: yes. The entries the store holds are compared, not the fact that a save was attempted.
- round-trip: yes. The reader is opened anew after the act.
- failing-side: the side where the trigger does not hold, an entry dated in an open month is saved, is the sibling node "An open month accepts entries". The Check names no failure of the store. A closing that stops half way belongs to the node "Closing a month is whole or not at all", which gets its own test with a store told to fail.
- no-lower: yes. One refused save. The cases of the rule, the first day, the last day, a month closed and reopened, are unit tests.
- no-wider: yes. No screen, no statement, no second seam.
- only-what-is-fixed: yes. Date, label and amount are compared. The ids the store gives, the time of writing and the wording of the refusal are left free, since the node fixes none of them.
- can-fail (fatal): yes. Both expectations run on every run; a store that cannot start is a setup error, not a skip.
- says-where: yes. Each message names the seam, the expected and the seen.
- leaves-no-trace (fatal): yes. The book is removed and the store deleted, on failure too.

### The description on the card

> Checks the ledger and its store together. A book holds two March entries, Rent of 1200.00 on the 5th and Paper of 40.50 on the 18th, and March is closed. The test then tries to save a third entry dated 30 March. It passes when the save is refused and March, read again from the store by a fresh reader, holds exactly the two entries it had at closing. The store is a real one of the kind Ledgerline runs on, started for this test and removed after it.

### The same test, failing review

A version that sets the month closed in memory, replaces the store with a stand-in that returns the two entries the test gave it, and asserts that "save" was never called:

- crosses-for-real, fatal: the entries compared are the stand-in's own canned answer.
- checks-the-check, fatal: a refusal that still wrote to the store would pass.
- round-trip and far-side-outcome: nothing is read from a store; the assertion is about a call.
- What would pass: the real store on the far side, and the entries read from it after the refused save.
