# Stage 02 — Static render

**Status:** Done
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

- _2026-05-24_ — Implemented `render(element, container)` in `src/dom/index.js` (5 cases:
  null/boolean → nothing, primitive → text, function → component, Fragment → children,
  string → host) plus `applyProps` (events, `className`, `style`, attributes). 5 tests in
  `test/dom.test.js` via jsdom; `examples/hello/` browser demo. `npm test` green (9 total).
  Removed the Stage 0 smoke test now that real tests exist.

## Gotchas & surprises

- Renderer reads `container.ownerDocument` rather than a global `document`, so the same
  code runs in the browser and under jsdom — tests just pass a jsdom `<body>`.
- Deferred simplifications: `setAttribute` ignores DOM *properties* (`value`/`checked`);
  `disabled={false}` still renders the attribute present; `onDoubleClick` → `"doubleclick"`
  is not the real `dblclick` event.
- Mount-only: calling `render` twice **appends twice** — no clearing/diffing until Stage 3.
- ES modules need `http://`, not `file://` — serve examples (`python3 -m http.server`).

## Verify

Render a small tree (nested elements + a component + an `onClick`) and confirm the DOM matches.

## Open questions / next

- ~~Where to render for tests vs demos?~~ Resolved: jsdom for automated tests + a browser `examples/*.html` for feel (see `decisions.md`).
- Unblocks Stage 03 (reconciliation): instead of always rebuilding, diff against the prior tree.
