# Stage 01 — Runtime

**Status:** Not started
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

- _pending_

## Gotchas & surprises

- _pending_

## Verify

`node --test` against `test/runtime.test.js`:
- host element → correct `{ type, props, key }`
- nested children flatten / preserve order
- a function component is stored as `type` (not invoked yet — that's Stage 2)
- `key` is lifted out of `props`

## Open questions / next

- Do we need `ref` in the shape yet? (Defer until a later milestone.)
- Unblocks Stage 02 (static render), which consumes this tree.
