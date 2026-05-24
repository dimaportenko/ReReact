# rereact

Learning React by rebuilding it from scratch.

This is an educational project. The goal is not to ship a production framework — it's
to understand *how React actually works* by re-implementing its three core pieces by
hand, with no magic and no dependencies hiding the interesting parts:

1. **JSX runtime** — what `<div/>` actually *is* (`createElement`, the element shape, `Fragment`).
2. **The renderer / reconciler** ("ReactDOM") — turning elements into real DOM, then *diffing* them on updates, then hooks (`useState`, `useEffect`).
3. **JSX compiler** — a hand-rolled tokenizer → parser → codegen that turns `<div/>` syntax into `createElement(...)` calls.

Everything is written in plain JavaScript (ESM) so it runs directly in the browser and
Node with no build step getting in the way. We only reach for tooling when the concept
being taught requires it.

## Guiding principles

- **Clarity over performance.** We optimize for "I understand why this line exists," not speed.
- **No magic.** Every transformation is something we wrote and can step through.
- **Authentic shapes.** Where it doesn't hurt clarity, we mirror real React's data structures (e.g. `children` lives inside `props`), so the lessons transfer.
- **Incremental.** Each stage produces something runnable before the next begins.

## Roadmap

### Milestone 1 — Core (compiler + runtime + react)

Built in this order so we always have something runnable on screen. Each links to its
living [stage doc](docs/) (design notes + build log + gotchas):

- [x] **[Stage 0 — Setup](docs/stages/00-setup.md).** `package.json` (ESM), test runner (`node:test`), folder skeleton.
- [x] **[Stage 1 — Runtime](docs/stages/01-runtime.md).** The element contract: `createElement(type, props, ...children)`, `Fragment`, primitives. Write JSX calls *by hand* for now.
- [ ] **[Stage 2 — Static render](docs/stages/02-static-render.md).** `render(element, container)`: build real DOM from an element tree. Attributes, events, text, function components.
- [ ] **[Stage 3 — Reconciliation](docs/stages/03-reconciliation.md).** Re-render and *diff* against the previous tree: update / replace / remove nodes. Keys for lists.
- [ ] **[Stage 4 — Hooks](docs/stages/04-hooks.md).** `useState` + scheduled re-render, then `useEffect`, `useRef`, `useMemo`.
- [ ] **[Stage 5 — Compiler](docs/stages/05-compiler.md).** Hand-rolled JSX compiler: tokenizer → parser → codegen emitting `createElement` calls, wired as a `.jsx` → `.js` transform. *Now the by-hand calls from Stage 1 become real JSX.*

### Future milestones (rough sketch)

- Synthetic event system & event delegation
- Context API
- Fiber architecture & interruptible rendering
- Refs, portals, error boundaries
- Suspense / lazy

## Project structure

```
rereact/
├── src/
│   ├── runtime/    # createElement, Fragment, element shape  (the "what")
│   ├── dom/        # render, reconciler, hooks                (the "how it runs")
│   └── compiler/   # tokenizer, parser, codegen              (the JSX sugar)
├── examples/       # runnable demos (counter, todo, ...)
├── test/           # node:test specs
└── docs/           # living per-stage docs + decision log
```

## Getting started

> Scaffolding lands in Stage 0. Once it does, this section will cover `npm test` and
> opening an example in the browser.

## References

- [Build your own React (Rodrigo Pombo / "Didact")](https://pomb.us/build-your-own-react/)
- [React docs — "React without JSX"](https://react.dev/reference/react/createElement)
- [Preact source](https://github.com/preactjs/preact) — a small, readable real-world implementation
