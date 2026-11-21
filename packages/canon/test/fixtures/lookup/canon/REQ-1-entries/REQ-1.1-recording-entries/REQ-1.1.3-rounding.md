---
id: REQ-1.1.3
parent: REQ-1.1
title: "Rounding keeps an entry's amount to the cent"
state: assumed
layer: requirement
kind: binary
uid: en0113
---

# Rounding keeps an entry's amount to the cent

## Intent

An amount typed with more than two decimals is rounded to the cent when the entry is recorded.

## Check

An amount typed as 12.505 is recorded as 12.51.

## Implemented by

- not built: amounts are stored as typed
