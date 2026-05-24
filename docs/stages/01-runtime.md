# Stage 01 — Runtime

**Status:** Done
**Runnable when done:** `createElement(...)` produces the element tree, proven by passing tests; `Fragment` exists.

## Goal

Define the **element contract** — the data shape every other layer is built on. This is
what JSX compiles *to*, so getting it right means nothing downstream needs reworking.

## The concept

JSX is sugar for nested function calls. `<div id="x">hi</div>` is just
`createElement('div', { id: 'x' }, 'hi')`, which returns a plain object describing the UI.
That object tree **is** the virtual DOM. No DOM is touched here — runtime is pure data.

## Design

`createElement(type, props, ...children)` returns:

```js
{
  type,                            // 'div' (host) | function (component) | Fragment
  props: { ...props, children },   // children live INSIDE props — authentic React
  key,                             // lifted out of props for list reconciliation
}
```

- `type`: string → host/DOM element; function → component; `Fragment` symbol → group without a wrapper.
- Primitives (string/number) as children are kept as-is; the renderer (Stage 2) turns them into text nodes.
- `Fragment = Symbol('rereact.fragment')`.

See `src/runtime/index.js`.

## Build log

- _2026-05-24_ — Implemented `createElement` + `Fragment` in `src/runtime/index.js`; 4 tests
  in `test/runtime.test.js` (element shape, flatten, component-not-called, key lifted).
  `npm test` green (5 total).

## Gotchas & surprises

- `{list.map(...)}` arrives as a **single array child**, so `children.flat(Infinity)` is
  what makes inline children and mapped children behave the same.
- Children are normalized to an array even for 0/1 child (React leaves a single child
  unwrapped) — a deliberate divergence for a uniform renderer; see `decisions.md`.
- `createElement` stays a dumb constructor: it does **not** filter `null`/`false`/`undefined`
  children. Deciding what renders to nothing is the Stage 2 renderer's job.

## Verify

`node --test` against `test/runtime.test.js`:
- host element → correct `{ type, props, key }`
- nested children flatten / preserve order
- a function component is stored as `type` (not invoked yet — that's Stage 2)
- `key` is lifted out of `props`

## Open questions / next

- Do we need `ref` in the shape yet? (Defer until a later milestone.)
- Unblocks Stage 02 (static render), which consumes this tree.
