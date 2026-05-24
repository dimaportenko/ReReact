# Decision log

Cross-cutting choices and their rationale, so we don't relitigate them. Append new
entries at the top. Each: the decision, why, and what we traded away.

---

### 2026-05-24 — Reconcile by diffing the new tree against the previous one

`render` stashes the last normalized vtree on the container (a `Symbol` prop) and diffs the
next render against it; each vnode is tagged with its `.dom` (components also keep `._rendered`).
**Why:** enables update-in-place and minimal DOM ops without a separate patch list.
**Trade-off:** we mutate vnodes to cache `.dom` and normalized children — an internal
annotation, not pure data.

### 2026-05-24 — Single-root model; fragments & multi-root components deferred to fibers

The simple recursive diff assumes **one vnode ↔ one DOM node**, so components must return a
single element and `<>...</>` isn't reconciled (the Stage 2 Fragment test was dropped).
**Why:** keeps the diff tractable and understandable. **Trade-off:** a genuine limitation —
and precisely what the fiber architecture exists to remove (a later milestone).

### 2026-05-24 — Render via `container.ownerDocument`; test with jsdom

The renderer reads `container.ownerDocument` instead of a global `document`, so identical
code runs in the browser and under jsdom. Automated tests use **jsdom** (a test-only
devDependency) so `npm test` exercises the DOM renderer headlessly; a browser
`examples/*.html` covers the tactile "does it really click" check. **Trade-off:** one
devDependency — but it's test-only and hides nothing about React itself.

### 2026-05-24 — `createElement` children are always a (flattened) array

Children are normalized to a flat array regardless of count, via `children.flat(Infinity)`.
**Why:** the renderer/reconciler can iterate uniformly with no single-vs-many special case,
and flattening makes `{list.map(...)}` (which arrives as one array child) behave like inline
children. **Trade-off:** diverges from real React, which leaves a single child unwrapped —
the reason `React.Children` helpers exist.

### 2026-05-23 — `children` live inside `props`

Mirror real React: `createElement` stores children as `props.children`, not a separate
top-level field. **Why:** the lessons (and the mental model) transfer to real React; how
components receive `props.children` is identical. **Trade-off:** slightly less obvious than
a top-level `children` field when first reading the element shape.

### 2026-05-23 — Build order: runtime → renderer → reconciler → hooks → compiler

Build the JSX *runtime* and *renderer* first (hand-writing `createElement` calls), and the
JSX *compiler* last. **Why:** gets visible output on screen fastest, and the compiler
becomes understandable sugar over machinery we already built. **Trade-off:** we write
`createElement(...)` by hand until Stage 5.

### 2026-05-23 — Hand-rolled JSX compiler (no Babel/Acorn/SWC)

Write our own tokenizer → parser → codegen. **Why:** understanding the JSX transform is a
core goal; an off-the-shelf parser would hide it. **Trade-off:** more work, and we limit
scope to JSX islands embedded in JS (expression-container contents `{ ... }` pass through
as opaque JS).

### 2026-05-23 — Plain JavaScript (ESM), no TypeScript

Files run directly in browser and Node with no transpile step. **Why:** zero tooling
between us and the concepts; nothing fighting our custom JSX. **Trade-off:** data shapes
are documented in comments, not enforced by a type checker.
