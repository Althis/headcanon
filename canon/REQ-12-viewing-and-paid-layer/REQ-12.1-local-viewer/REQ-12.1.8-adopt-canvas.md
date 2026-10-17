---
id: REQ-12.1.8
parent: REQ-12.1
title: "Adopt: a full canvas of coloured boxes with handles, a card to approve, rewrite or delete a box, a docked chat, and a ? to ask about a passage"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-17"
files: [packages/canon/public/app.js, packages/canon/public/style.css, packages/canon/src/ui/server.ts, packages/canon/src/edits.ts, packages/canon/src/mcp.ts]
---

# Adopt: a full canvas of coloured boxes with handles, a card to approve, rewrite or delete a box, a docked chat, and a ? to ask about a passage

## Stated

> I'd like you to configure a view mode that is specifically made to follow the /adopt skill. This mode should include a fullsize canvas with the nodes that we have created. These nodes should be colour coded and allow you to expand and collapse their children. The colours should be green for approved by a human, yellow for assumed and red for "blocker" which means that the adopt cannot finish until those are better defined(to represent the nodes where the model did not feel safe guessing). On the side of the canvas make a sticky for the chat window so that the user can continue to communicate with the model in free-form. The model should have the capacity to focus on a node, or open a node. Opening a node means clicking on it(it will need either handles or some other UI element to let the user expand and collapse the children since the click opens it). Opening a node opens a floating pop-up in which the definition of the node exists, and it allows the user to edit, approve or delete a node entirely.

> Also, please add to the nodes themselves a highlighting tool with a questionmark that allows the user to question the model "what do they mean" with the highlighted passage, so that the model can explain in the free-form side chat.

Source: Claude Code session, 2026-10-17.

## Intent [assumed]

The Adopt view is a canvas filling the page, with the session's chat docked at its right. Every box is green when the human approved it, yellow when it is the agent's guess, and red when it needs the human: an open node, a contested node, or one the check flagged. The premise sits at the top as its own box. A handle under each box with children shows or hides them; clicking a box opens its card. The card shows the box's text, why it has its colour, and its findings, with the actions Approve, Rewrite, Delete, show or hide children, and Define further; a rewrite takes a title and the human's text, which becomes the stated entry. Selecting words in the card shows a ? that sends the passage to the agent as a question, answered in the chat. After every action the chat shows that the agent is working, with the elapsed time, until the agent speaks or asks. The agent can point at a box or open its card, and a line it says appears in the chat beside the human's. A Finish button tells the agent the human is done; it stays plain while any box is red.

## Assumptions

- The canvas starts with the premise, the domains and their capabilities shown; deeper levels open on request. (model assumption)
- The chat is the page's change feed read both ways: the human's messages, the agent's lines, and the actions between them as quiet lines. (model assumption)
- The card for the premise rewrites only its purpose text; principles and the glossary keep their own views. (model assumption)
