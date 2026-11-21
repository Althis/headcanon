---
id: REQ-3.1.2
parent: REQ-3.1
title: "Rounding happens once, on a statement's totals"
state: contested
layer: requirement
kind: binary
uid: st0312
conflicts: [REQ-1.1.3]
---

# Rounding happens once, on a statement's totals

## Intent

Amounts are added unrounded and the total of a statement is rounded to the cent.

## Check

Three amounts of 0.333 give a statement total of 1.00.
