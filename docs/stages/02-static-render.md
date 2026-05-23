# Stage 02 — Static render

**Status:** Not started
**Runnable when done:** `render(element, container)` paints an element tree into real DOM (no updates yet).

## Goal

Make the virtual DOM visible: walk an element tree and build the corresponding real DOM
nodes once. No diffing — a fresh render each time.

## The concept

The renderer ("ReactDOM"): host elements become DOM nodes, function components get *called*
to produce their element tree, and that recursion bottoms out at text nodes.

## Design

- `render(element, container)` recursively creates DOM nodes and appends them.
- Map props → DOM: attributes, `className`, `style`, event handlers (`onClick` → `addEventListener`).
- Function components: call `type(props)`, render the returned element.
- Decide where we *see* it: browser `examples/*.html` with `<script type="module">`, or Node + `jsdom` for headless tests. (See decisions.md when chosen.)

## Build log

- _pending_

## Gotchas & surprises

- _pending_

## Verify

Render a small tree (nested elements + a component + an `onClick`) and confirm the DOM matches.

## Open questions / next

- Where to render for tests vs demos (browser vs jsdom)?
- Unblocks Stage 03 (reconciliation): instead of always rebuilding, diff against the prior tree.
