---
id: REQ-2.1.2
parent: REQ-2.1
title: "Closing a month totals its entries"
state: assumed
layer: requirement
kind: binary
uid: mo0212
binds: ["implements src/months.ts#closeMonth"]
---

# Closing a month totals its entries

## Intent

Closing a month adds up its entries and hands the carry-over to the next month.

## Check

Closing March with entries of 10 and 5 gives a March total of 15 and an April carry-over of 15.
