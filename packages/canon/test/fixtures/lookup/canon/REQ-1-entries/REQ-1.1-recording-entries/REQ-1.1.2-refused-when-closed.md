---
id: REQ-1.1.2
parent: REQ-1.1
title: "An entry in a closed month is refused"
state: assumed
layer: requirement
kind: binary
uid: en0112
requires: [REQ-2.1.1]
binds: ["contributes src/entries.ts#refuseClosed"]
---

# An entry in a closed month is refused

## Intent

An entry dated in a closed month is refused with the reason shown.

## Check

Recording an entry dated 14 March after March was closed shows a refusal that names March.
