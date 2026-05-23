# Decision log

Cross-cutting choices and their rationale, so we don't relitigate them. Append new
entries at the top. Each: the decision, why, and what we traded away.

---

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
