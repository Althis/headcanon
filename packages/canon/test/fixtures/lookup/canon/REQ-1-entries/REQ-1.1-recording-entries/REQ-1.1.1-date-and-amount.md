---
id: REQ-1.1.1
parent: REQ-1.1
title: "An entry keeps its date and amount"
state: assumed
layer: requirement
kind: binary
uid: en0111
steps: [JRN-1/S1]
binds: ["implements src/entries.ts#recordEntry"]
---

# An entry keeps its date and amount

## Intent

An entry reads back with the date and the amount it was recorded with.

## Check

An entry recorded as 12.50 on 3 March reads back as 12.50 on 3 March.

## Implemented by

- The entry is stored as given (src/entries.ts:10-32)
