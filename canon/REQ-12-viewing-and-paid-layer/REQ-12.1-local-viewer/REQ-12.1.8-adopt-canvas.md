---
id: REQ-12.1.8
parent: REQ-12.1
title: "Adopt: a full canvas of coloured nodes with handles, a card to approve, rewrite or delete a node, a docked chat, and a ? to ask about a passage"
state: stated
layer: requirement
source: "Claude Code session, 2026-10-17"
files: [packages/canon/public/app.js, packages/canon/public/style.css, packages/canon/src/ui/server.ts, packages/canon/src/edits.ts, packages/canon/src/mcp.ts]
---

# Adopt: a full canvas of coloured nodes with handles, a card to approve, rewrite or delete a node, a docked chat, and a ? to ask about a passage

## Stated

> I'd like you to configure a view mode that is specifically made to follow the /adopt skill. This mode should include a fullsize canvas with the nodes that we have created. These nodes should be colour coded and allow you to expand and collapse their children. The colours should be green for approved by a human, yellow for assumed and red for "blocker" which means that the adopt cannot finish until those are better defined(to represent the nodes where the model did not feel safe guessing). On the side of the canvas make a sticky for the chat window so that the user can continue to communicate with the model in free-form. The model should have the capacity to focus on a node, or open a node. Opening a node means clicking on it(it will need either handles or some other UI element to let the user expand and collapse the children since the click opens it). Opening a node opens a floating pop-up in which the definition of the node exists, and it allows the user to edit, approve or delete a node entirely.

> Also, please add to the nodes themselves a highlighting tool with a questionmark that allows the user to question the model "what do they mean" with the highlighted passage, so that the model can explain in the free-form side chat.

> Please make the pop-up movable and it's dimensions adjustable in the corners, also make it open in the very center of the canvas. [...] Also change the canvas to have an infinite canvas design, and add crosses to it to facilitate visualizing the navigation by panning through it. Start by default with a fit-view and add a button to show or hide nodenames, hide and show dependencies and hide and how edges at all. Start with all nodes without their labels as just circles with the colours, and make so selecting one by clicking it shows the full label. Add an eye icon to the node with the label showing. Clicking off of it will not automatically hide it's label, but instead leave it showing and only clicking the eye button will hide it again, or toggling the global button will hide or show all labels together. Also change the behaviour so that now double clicking a node, or clicking a button within the node will open the pop-up, since we replaced the single click action for showing the label of the node.

Source: Claude Code session, 2026-10-17, after the sixth adopt run reached the canvas.

> For the root, in the future, do not keep them as a single node, instead keep them a level above that as they own separate types and node shapes to signify that they are different than regular nodes. Create a one for premise and one for principles that expands on their own tiny principle nodes.

Source: Claude Code session, 2026-10-18, during the seventh adopt run.

> Opening a node does not move other nodes out of the way. Please implement force layout to avoid this [...] please lower the thickness of the border and change the layout of expanded nodes. Keep the reference tag on the top left but still inside the node, maybe separated by a thinner square border from the rest of the nodes contents

Source: Claude Code session, 2026-10-18, during the seventh adopt run.

## Intent [assumed]

The Adopt view is an infinite canvas filling the page, with a grid of crosses behind the nodes that pans and zooms with them, and the session's chat docked at its right. The view opens fitted to what it shows. Every node is a circle, green when the user approved it, yellow when it is the agent's guess, and red when it needs the user: an open node, a contested node, or one the check flagged. A second channel shows the code (DEC-026): a node that is not built has a grey fill and keeps its own border, a node out of sync carries a red dashed ring a little outside it, a draft shows neither, and the legend counts both. Above the tree sit two shapes of their own: the premise, a hexagon whose card holds what the project is, its purpose and what it is not, and the principles, an octagon that expands into one small diamond per principle, each with a card of its own; principles are rewritten in the premise card, since they live in the root README. Clicking a circle shows its name: the node grows into a card with the reference tag in a small frame at its top left, the title beside it, an eye that hides the name again and an arrow that opens its card, and the nodes around it move aside under a force pass so nothing overlaps; a name stays shown until its eye is pressed or the Names button hides every name at once, and the same button shows them all. A handle under each node with children shows or hides them. A double-click, or the arrow, opens the card in the middle of the canvas; the card moves by its header and resizes from any corner. The card shows the node's text, why it has its colour, and its findings, with the actions Approve, Rewrite, Delete, show or hide children, and Define further; a rewrite takes a title and the user's text, which becomes the stated entry. The card lists the node's tests, each as a description in plain words of what is tested and how, with its kind and its last outcome, and offers Implement this when the node is not built or out of sync and is not red. The first control at the top left of the canvas bar is Implement/align, the same steps over the selected node and what is under it, or over everything when nothing is selected: its card says what is in scope, shows a round step by step with Stop and Continue, and puts each built slice before the user, what was built, its tests and its commits, with Approve, Send back and Discard (JRN-2). Selecting words in the card shows a ? that sends the passage to the agent as a question, answered in the chat. Buttons hide or show the dependency links and all lines. After every action the chat shows that the agent is working, with the elapsed time, until the agent speaks or asks. The agent can point at a node or open its card, and a line it says appears in the chat beside the user's. A Finish button tells the agent the user is done; it stays plain while any node is red.

## Assumptions

- The canvas starts with the premise, the domains and their capabilities shown; deeper levels open on request. (model assumption)
- The chat is the page's change feed read both ways: the user's messages, the agent's lines, and the actions between them as quiet lines. (model assumption)
- The card for the premise rewrites only its purpose text; principles and the glossary keep their own views. (model assumption)
