# Refine: reference

Every operation the refine skill writes, what to do with what lies outside your border, and one capability worked from its parcel to its report. The product is invented: Ledgerline, a bookkeeping tool that records entries in months, closes each month and produces its statement.

## Contents

1. The operations
2. What lies outside your border
3. A capability, worked

## 1. The operations

Each is one JSON object given to `HC op - --by <your name>` on stdin. The answer is JSON: `ok`, the `id` created or changed, or `error` with the reason. An operation that would break the canon is rolled back and refused with the errors it would have introduced. `why` is optional on every operation and is kept in the log and in History.

| Operation | Fields | What the tool does, and what it refuses |
|---|---|---|
| `create` | `under` (a node id, or `ROOT`), `title`, `intent`; for a requirement `check` and `kind` (`binary`, `numeric`); `source`; `binds`, a list of `"<relation> <unit id>"`; `implementedBy`, a list of lines; `layer` when it is not the one the depth gives; `state: "draft"` for a draft | Writes the node under its parent with the next free id, and answers that id. Refuses an unknown parent, a missing title, a missing Intent. |
| `bind` | `id`, `unit`, `relation` (`implements`, `contributes`, `contradicts`) | Binds a function, a cluster or a claim to a node. Binding a unit again changes its relation. |
| `unbind` | `id`, `unit` | Removes a binding. |
| `link`, `unlink` | `from` (the node that needs), `to` (the node needed), `kind` (`requires`; also `relates`, `conflicts`) | Writes the edge on `from`. Refuses a `requires` that would close a cycle. |
| `move-edge` | `on`, `from`, `to` | On the node `on`, the `requires` edge to `from` now points at `to`, a node under `from`: the edge goes down to the child that holds the concept. |
| `contest` | `id`, `summary`, `statements` (two or more of `{"text","source"}`); `other` when the conflict is with a second node | Makes the node contested and writes both sides under Contested, where the page reads them. |
| `note` | `id`, `text` | A dated line under Open. Refused on a node the user approved: say it in your report instead. |
| `reword` | `id`, `from`, `to` | Replaces the words `from` with `to` wherever they stand whole in the title and the body. Refused when they do not occur, and on a node the user approved. |
| `draft` | `id`, `why` (the diagnosis) | A guess that cannot be made right becomes a draft. Its question goes in your report. |
| `delete` | `id`; `subtree: true` when it has children | Removes a guessed node and the edges that named it. Refused on a node the user approved. |
| `move` | `id`, `under` | Puts a subtree under another parent. Its ids are renumbered and every reference follows. |
| `merge` | `from`, `to` | `from` said what `to` says: `to` takes its evidence and its edges, and `from` goes. Refused when `from` has children or the user approved it. |
| `term` | `term`, `definition` | Adds a guessed glossary term, or redefines one. Refused on a term the user approved. |
| `journey` | `title`; `steps`, each `{"label","requirements":[ids],"given","does","sees"}`; `source`; `id` to rewrite the steps of a guessed journey | Writes a guessed journey. An approved one is never rewritten. |
| `review` | `id` (the parent), `verdict` (`pass`, `fail`), `findings`, each `{"check","child","text"}` | Records a verdict. The answer says `exhausted: true` when the set's corrections are spent. |

The `kind` of a node is not changed by an operation: delete the node and create it again.

## 2. What lies outside your border

A refiner's name carries its border: `refiner-REQ-2.1` writes on `REQ-2.1` and under it. An operation anywhere else is refused with `outside refiner-REQ-2.1's capability (REQ-2.1): record it with HC propose`. Record it, and go on with your own nodes:

```
HC propose '{"op":"bind","id":"REQ-3.1","unit":"claim:5d0c2a91e7","relation":"contributes"}' --why "how a statement lists its entries is a rule of the statement, not of closing" --by refiner-REQ-2.1
```

`HC propose - --why "<reason>" --by <your name>` reads the operation from stdin, which a text holding an apostrophe needs. The session applies proposals as they come and asks the user only when a node involved is approved. You write yourself, although they name another capability, a `requires` link from one of your nodes to any node, and a `term`.

## 3. A capability, worked

The refiner is `refiner-REQ-2.1`. Its brief shows the map: `REQ-1 Entries` with `REQ-1.1 Recording an entry` and `REQ-1.2 Accounts`; `REQ-2 Months` with `REQ-2.1 Closing a month`; `REQ-3 Statements` with `REQ-3.1 The statement of a month`. Its capability reads: "Ledgerline closes a month, after which the entries of that month stand as recorded."

**The parcel.** `HC parcel REQ-2.1 --by refiner-REQ-2.1` prints:

```
# Parcel of REQ-2.1: evidence bound to this node, expanded one level

- [c1-4] (implements; cluster, 4 functions) Closes a month: finds what stands in the way, marks the month closed, builds its statement.
  - [src/months/close.ts#closeMonth] Marks the month it is given closed and returns its statement.
  - [src/months/close.ts#entriesWithoutAccount] Lists the entries of a month that name no account.
  - [src/months/lock.ts#lockMonth] Marks a month closed.
  - [src/months/lock.ts#assertOpen] Refuses a write to a month that is closed.

# Claims bound to this node; cite them by id

- [claim:1f3a9c0b77] (contributes; document, 2026-08-02) A month can be closed once every entry in it names an account. — docs/guide.md:40
- [claim:b3305a1c9e] (contributes; document, 2026-08-02) A month can be closed only after its last day. — docs/guide.md:41
- [claim:27d9e6f4b8] (contributes; document, 2026-03-10) A month can be closed from its last day on. — docs/rules.md:14
- [claim:8e41d2aa05] (contributes; document, 2026-08-02) A closed month takes no new entry. — docs/guide.md:44
- [claim:c07b55e310] (contributes; document, 2026-08-02) Closing a month produces its statement. — docs/guide.md:47
- [claim:5d0c2a91e7] (contributes; document, 2026-08-02) A statement lists its entries by account. — docs/guide.md:52
- [claim:e9a4470d12] (contributes; document, 2026-09-01) planned: a closed month is reopened only with a recorded reason. — docs/roadmap.md:8
```

**The four questions.**

- What must exist first? Every entry of the month names an account, as the first claim says. `HC find "entry names account"` answers `REQ-1.2.1  Every entry names one account  [title]`. The node exists: the child here requires it and does not say it again.
- What follows once it holds? A closed month takes no new entry, and the month has its statement.
- How does it fail, and what must prevent that? A closing that stops halfway, between marking the month and building its statement, leaves a closed month with no statement. No document speaks of it; the node's words "stand as recorded" make it necessary. `HC code show src/months/close.ts#closeMonth` shows the mark is set first and never undone.
- What does every system of its kind have at this point? A way back from a closing made in error. The roadmap plans it, so it is a child that says not built. A notice to the accountant on closing traces to nothing, and is dropped.

**The axis.** What closing a month guarantees, in the order it happens: before, during, after. A lifecycle.

**The evidence.**

- `closeMonth` never calls `entriesWithoutAccount`: it closes a month that holds an entry with no account, against docs/guide.md:40. Code against a claim: the child follows the document, binds the function as `contradicts`, and is contested.
- The two claims on the day a month may be closed are two documents that disagree. The newer one stands; a note names the older.
- The claim on how a statement lists its entries belongs to `REQ-3.1`: the proposal of section 2, then an `unbind` here.

**The creates,** each on stdin to its own `HC op - --by refiner-REQ-2.1`, the node the others need before them:

```json
{"op":"create","under":"REQ-2.1","title":"A month closes only when every entry in it names an account","intent":"Ledgerline refuses to close a month while an entry in it names no account.","check":"Closing a month that holds an entry with no account is refused, and the month is observed open afterwards.","kind":"binary","source":"docs/guide.md:40","binds":["implements claim:1f3a9c0b77","contributes src/months/close.ts#entriesWithoutAccount","contradicts src/months/close.ts#closeMonth"],"why":"axis: what closing guarantees, in the order it happens"}
{"op":"create","under":"REQ-2.1","title":"A month closes only after its last day","intent":"Ledgerline refuses to close a month on or before its last day.","check":"Closing a month on or before its last day is refused, and closing it on a later day is accepted.","kind":"binary","source":"docs/guide.md:41","binds":["implements claim:b3305a1c9e","contributes claim:27d9e6f4b8"],"implementedBy":["not built: closeMonth does not look at the date"],"why":"axis: what closing guarantees, in the order it happens"}
{"op":"create","under":"REQ-2.1","title":"Closing a month produces its statement","intent":"Closing a month marks it closed and produces the statement of that month.","check":"After a month is closed, the month is observed closed and one statement of it exists.","kind":"binary","source":"docs/guide.md:47","binds":["implements claim:c07b55e310","implements src/months/close.ts#closeMonth","contributes src/months/lock.ts#lockMonth"],"why":"axis: what closing guarantees, in the order it happens"}
{"op":"create","under":"REQ-2.1","title":"A closing that fails leaves the month open","intent":"A closing that cannot produce the statement leaves the month open, with no statement.","check":"After a closing in which the statement cannot be built, the month is observed open and no statement of it exists.","kind":"binary","source":"REQ-2.1 (how it fails: 'stand as recorded'); src/months/close.ts#closeMonth","implementedBy":["not built: closeMonth marks the month closed before the statement is built and does not undo the mark"],"why":"axis: what closing guarantees, in the order it happens"}
{"op":"create","under":"REQ-2.1","title":"A closed month takes no new entry","intent":"Ledgerline refuses an entry dated inside a closed month.","check":"Recording an entry dated inside a closed month is refused, and the entries of the month are observed unchanged.","kind":"binary","source":"docs/guide.md:44","binds":["implements claim:8e41d2aa05","implements src/months/lock.ts#assertOpen"],"why":"axis: what closing guarantees, in the order it happens"}
{"op":"create","under":"REQ-2.1","title":"A closed month is reopened only with a recorded reason","intent":"Ledgerline reopens a closed month only when a reason is given, and keeps that reason with the month.","check":"Reopening a closed month without a reason is refused; with a reason, the month is observed open and that reason is kept with it.","kind":"binary","source":"docs/roadmap.md:8 (planned)","binds":["implements claim:e9a4470d12"],"implementedBy":["not built: nothing reopens a month"],"why":"axis: what closing guarantees, in the order it happens"}
```

Every requirement says where it is built: three bind the functions that implement or serve them, three say `not built` with what exists instead.

**The links and the rest,** once the creates have answered `REQ-2.1.1` to `REQ-2.1.6`:

```json
{"op":"link","from":"REQ-2.1.1","to":"REQ-1.2.1","kind":"requires"}
{"op":"link","from":"REQ-2.1.3","to":"REQ-3.1","kind":"requires"}
{"op":"link","from":"REQ-2.1.4","to":"REQ-2.1.3","kind":"requires"}
{"op":"contest","id":"REQ-2.1.1","summary":"The guide says a month closes only when every entry names an account; the code closes it whatever its entries hold. Choosing decides whether closing is changed or the rule is dropped.","statements":[{"text":"A month can be closed once every entry in it names an account.","source":"docs/guide.md:40"},{"text":"closeMonth marks the month closed without looking at its entries.","source":"src/months/close.ts#closeMonth"}]}
{"op":"note","id":"REQ-2.1.2","text":"docs/rules.md:14 (2026-03-10) lets a month close from its last day on; docs/guide.md:41 (2026-08-02) is newer and stands."}
{"op":"unbind","id":"REQ-2.1","unit":"claim:5d0c2a91e7"}
```

**The checks.** `HC parcel --check` prints no line that names `REQ-2.1` or a node under it. `HC check | grep -E "REQ-2.1|errors,"` prints the contested node and, on the last line, no error.

**The report.**

```
REQ-2.1: axis, what closing guarantees in the order it happens; children REQ-2.1.1 to REQ-2.1.6; three say not built.
Issue: REQ-2.1.1, contradiction. Does closing refuse a month that holds an entry with no account? Why it matters: the guide says so and the code closes the month anyway, so a statement can carry an entry under no account.
Proposals: P-k3m9pq, the claim on how a statement lists its entries, to REQ-3.1.
Left: nothing. Every child is a leaf.
```
