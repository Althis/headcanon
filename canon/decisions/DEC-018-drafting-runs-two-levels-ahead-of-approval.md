---
id: DEC-018
title: "Drafting runs two levels ahead of approval: a box is cut only when its children lie within two levels of the deepest approved box on its path"
state: stated
date: 2026-10-18
intents: [REQ-3.4]
origin: side-effect
---

# Drafting runs two levels ahead of approval: a box is cut only when its children lie within two levels of the deepest approved box on its path

## Resolution

> I killed the terminal. Too many things were going wrong. First, and more importantly, the way it is right now the agent is getting busy doing things that are likely to be overwritten. We need a limit to the definition depth without confirmation. I know I told you that we needed a way for the system to define leaves ahead of the user approval, but doing it so far when the user might rewrite a top level entity means all the work was wasted.
>
> What we need instead is to define a formula to calculate definition depth. This formula should be conservative the higher the user is, say that until the domains are defined, we have something where the system would only define up to 2 levels down. Then each approved node increases the depth the system can go to.

Claude Code session, 2026-10-18, after the seventh adopt run.

## Why

DEC-017 made drafting continuous: refiners cut every ready node while the human reviews the top. In the seventh run that meant requirements four levels down were drafted under domains the human had not read yet, and one rewrite of a domain would have thrown all of it away. The human asked for a limit with a formula rather than a judgement call: conservative near the top, growing with each approval.

The formula lives in the next command, where no agent can shortcut it. A box's level counts the premise as zero. The anchor is the deepest approved box on the path from the premise to the box, the premise itself once it is approved and none before. A draft may reach two levels below the anchor, so a box is cut only when its children would lie within that reach. Before the premise is approved only the domains are drafted; with it, the capabilities; an approved domain lets its capabilities be cut into requirements; an approved capability lets its requirements be cut into leaves. Approval anywhere moves the frontier under that box only. Boxes beyond reach are reported as waiting, each with the box whose approval would release it, and the attend loop leaves them alone.

This bounds DEC-017; it does not replace it. The distance of two is a constant in one place, to be tuned from runs.
