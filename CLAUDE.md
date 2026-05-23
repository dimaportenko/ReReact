# CLAUDE.md

Guidance for working in this repo. Keep it current as the project evolves.

## ⛔ Hard rule: do NOT write code unprompted

The user is learning by writing the implementation **by hand**. Do **not** write or edit
code unless they explicitly ask for it in that message. This includes the `src/`
implementation, scaffolding, config (`package.json`), tests, and example code.

Default mode instead: explain concepts, discuss design and trade-offs, sketch the approach
in prose or pseudocode, point to references, and **review code the user has written**.
When you think code is the next step, *offer* and wait for an explicit "yes, write it."

Docs are the exception: writing/updating `docs/`, `README.md`, and this file is fine
without asking, since documentation (not implementation) is the project deliverable here.

## What this is

`rereact` is an **educational** project: rebuilding React from scratch to learn how it
works. Optimize every decision for **understanding**, not for production-readiness or
performance. See `README.md` for the roadmap.

When writing code here, prefer the explanation-friendly version. A comment explaining
*why* a line exists is worth more than a clever one-liner. Assume the reader is learning
how React works by reading this code.

## Tech decisions (and why)

- **Plain JavaScript, ESM only.** No TypeScript, no transpile step fighting our custom
  JSX. Files run directly in modern browsers and Node. Document data shapes in comments.
- **Hand-rolled JSX compiler.** Tokenizer → parser → codegen, written by us. Do *not*
  pull in Babel/Acorn/SWC for the compiler — building it is the point.
- **No runtime dependencies.** No `react`, no framework libs. Tests use the built-in
  `node:test` runner. (We may add `jsdom` only when DOM-renderer tests need it.)
- **Build order: runtime → renderer → reconciler → hooks → compiler.** We get pixels on
  screen early by hand-writing `createElement` calls, and add the JSX compiler last as
  sugar over machinery we already understand.

## Architecture

Three layers, mirrored in `src/`:

| Layer | Folder | Responsibility |
|-------|--------|----------------|
| Runtime | `src/runtime/` | The element contract: `createElement`, `Fragment`, element shape. Pure data, no DOM. |
| Renderer | `src/dom/` | Turn elements into real DOM, diff/reconcile on update, hooks. The "ReactDOM". |
| Compiler | `src/compiler/` | Transform `.jsx` source text into `createElement` calls. |

### The element contract (mirror real React)

`createElement(type, props, ...children)` returns:

```js
{
  type,              // string ('div') for host elements, or a function for components
  props: {
    ...props,        // attributes / component props
    children,        // children live INSIDE props (authentic React shape)
  },
  key,               // pulled out of props for list reconciliation
}
```

`type` is a string for host (DOM) elements and a function for components. `Fragment` is a
special symbol used as `type` to group children without a wrapper node.

## Conventions

- Lowercase, dash-free folder names under `src/` matching the table above.
- Each `src/<layer>/` exports a clear public surface from `index.js`.
- Tests live in `test/` (or `*.test.js` beside the code) and run under `node:test`.
- Examples in `examples/<name>/` are runnable demos, ideally openable in a browser via a
  `<script type="module">` so there's no hidden build magic.

## Docs (these matter as much as the code)

This is a learning project, so documentation is a primary deliverable:

- `docs/stages/NN-*.md` — one **living** doc per build stage. While working a stage, append
  to its dated **Build log**, record surprises under **Gotchas**, and flip its **Status**
  (also in the table in `docs/README.md`).
- `docs/decisions.md` — running log of cross-cutting choices and their *why*. Add an entry
  whenever you make a decision that outlives a single stage.
- `docs/_template.md` — copy to start a new stage doc.
- Keep `README.md`'s roadmap checkboxes and `docs/README.md`'s status table in sync.

## Scope guardrails

- **Compiler scope:** a full JS parser is out of scope. The compiler parses **JSX islands**
  embedded in JS; the contents of expression containers `{ ... }` are treated as opaque JS
  passed through verbatim. Handle: elements, attributes, spread, children, expression
  containers, and fragments `<>...</>`.
- **Reconciler:** start with a simple recursive diff. Only evolve toward a fiber
  architecture in a later milestone, and only once the simple version is understood.
- Don't add tooling (bundlers, TS, test frameworks) unless a stage genuinely needs it.
  Every dependency hides something we're trying to learn.

## Status

Stage 0 (setup) not yet started. Docs (`README.md`, `CLAUDE.md`) are in place.
