---
id: REQ-2.1.1
parent: REQ-2.1
title: "A closed month accepts no new entry"
state: assumed
layer: requirement
kind: binary
uid: mo0211
source: "docs/rules.md:4"
requires: [REQ-1.1.1]
relates: [REQ-3.1.1]
binds: ["contributes src/entries.ts#refuseClosed", "contributes claim:aaaaaaaaaa", "implements src/months.ts#MonthBook.isClosed"]
---

# A closed month accepts no new entry

## Intent

A closed month takes no new entry and its totals stay as they were.

## Check

After March is closed, recording an entry dated 14 March is refused and the March total is unchanged.

## Implemented by

- The closed flag is read before an entry is kept (src/months.ts:30-33)
