# Adopt: reference

The premise file as `top` writes it, and what an entry must not contain. The format itself, every type with its fields, states, sections and rules, is what `HC format` prints. Write with the Write tool, one file per call.

## Contents

1. The premise file
2. Entry quality: what not to write

## 1. The premise file (`canon/README.md`)

`HC init` wrote a skeleton. The premise replaces everything in it except the `format` line, which stays as it is. Everything here is a guess until the user approves it on the page.

```markdown
---
id: ROOT
title: "<Project> canon"
state: assumed
source: "<what the premise rests on: path:lines, the code tree>"
format: <as HC init wrote it>
---

# <Project> canon

## Intent

<What the project is and for whom, as an encyclopedia entry opens.>

## Not this

- <what the project is not, where the evidence makes it clear> (<path:lines>)

## Principles

**PRN-1 <Title>** [assumed]
<A short paragraph: the direction, what it means for the choices the project makes, where it applies.>
Source: <path:lines>

## Glossary [assumed]

**<term>** (`TERM-<slug>`) [assumed]: <what the term is, as a dictionary says it>
```

- A principle carries its marker on its title line: `[assumed]` while it is a guess. The page writes `[resolved]` when the user approves it, and no marker when they rewrite it: a line without a marker is the user's own.
- A term carries its marker after its id. The slug is the term in lower case, every run of other characters turned into one hyphen. The heading's `[assumed]` covers the terms that carry no marker of their own; it is removed only when every term is approved.
- No `## Implemented by` on the premise, and no `## Stated`: the page writes the user's words when they type them.
- A term is a word the product gives a meaning of its own. A common word in its common sense is not one; a definition says what the term is, never what must be done.

## 2. Entry quality: what not to write

An entry is read later, by someone who was not in this conversation, the way a dictionary or encyclopedia entry is read. It says what the thing is, concisely, and nothing else. Each example below is wrong, with the reason, then the entry as it should be. The product is invented: Ledgerline, a bookkeeping tool.

**Correction history inside the entry.**
Wrong: "Entry: one line of the books, with a date, an amount and an account (attachments were removed after the owner said they are out of scope)."
Why: the parenthesis is a story about how the entry changed. A reader wants the definition, and the history is already in git.
Right: "Entry: one line of the books, with a date, an amount and an account."

**The reason given for a correction, written as content.**
Wrong: "Account: the heading an entry is counted under in a statement. This is a bookkeeping rule, and asking for an exception does not change it."
Why: the second sentence is the user's explanation of why an earlier draft was wrong. It argues with a draft the reader never saw.
Right: "Account: the heading an entry is counted under in a statement."

**A "not" clause.**
Wrong: "Closing: fixing a month so that its entries stand as recorded. Not a backup, and not an export."
Why: the reader learns two neighbors and still has to infer the thing. Exclusions belong only in a Not this section, where they are read as exclusions.
Right: "Closing: fixing a month so that its entries stand as recorded."

**Dependence on the conversation.**
Wrong: "Statement: as discussed above, the summary of a month."
Why: "as discussed above" points at nothing the reader has.
Right: "Statement: the summary of a closed month, its entries totalled by account."

**Current state as definition.**
Wrong: "Statements: produced when a month is closed; three layouts as of version 0.4."
Why: the count and the version describe one day. Written here, they become a requirement to have exactly that many.
Right: "Statements: produced when a month is closed, one for each closed month."

**Two concepts in one entry.**
Wrong: "Closed month: a month that takes no new entry; an open month is one that still does."
Why: the entry defines a second term in passing, and a reader looking up Open month never finds it.
Right: two entries. "Closed month: a month that takes no new entry." "Open month: a month that still takes entries."

**Rationale inside the entry.**
Wrong: "Closing check: refuses to close a month that holds an entry with no account, which matters because such entries caused wrong totals in the first release."
Why: the second clause is a reason. Reasons live in decision records, where they can be read with their context.
Right: "Closing check: refuses to close a month that holds an entry with no account."
