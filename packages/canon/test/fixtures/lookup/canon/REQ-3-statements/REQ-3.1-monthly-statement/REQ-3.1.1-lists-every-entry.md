---
id: REQ-3.1.1
parent: REQ-3.1
title: "A statement lists every entry of its month"
state: assumed
layer: requirement
kind: binary
uid: st0311
binds: ["implements src/statements.ts#buildStatement"]
---

# A statement lists every entry of its month

## Intent

A statement opens with the carry-over from the month before and lists every entry of its month.

## Check

The March statement shows the carry-over from February and the two entries recorded in March.
