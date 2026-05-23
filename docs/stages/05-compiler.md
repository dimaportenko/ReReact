# Stage 05 — Compiler

**Status:** Not started
**Runnable when done:** a `.jsx` file transforms to `.js` with `createElement` calls and runs in the app.

## Goal

Replace the by-hand `createElement(...)` calls with real JSX syntax, by writing our own
compiler: tokenizer → parser → AST → codegen.

## The concept

JSX is not JavaScript — it's a syntax extension that must be *transformed* before it runs.
We tokenize the source, parse JSX into an AST, and generate `createElement` calls. This is
exactly what Babel's JSX transform does, minus the scale.

## Design

- **Scope:** parse **JSX islands** embedded in JS. Contents of expression containers `{ ... }`
  pass through as opaque JS (we don't build a full JS parser). Handle: elements, attributes,
  attribute spread, children, expression containers, and fragments `<>...</>`.
- **Tokenizer:** emit tokens for `<`, `>`, `/`, identifiers, strings, `{`/`}`, text.
- **Parser:** build an element AST (tag, attributes, children).
- **Codegen:** emit `createElement(type, props, ...children)`; `<>` → `Fragment`.
- **Wiring:** a `.jsx` → `.js` transform (CLI or import hook) feeding the runtime.

## Build log

- _pending_

## Gotchas & surprises

- _pending_

## Verify

Compile an example component to `createElement` calls and run it through the renderer;
output matches the hand-written version from earlier stages.

## Open questions / next

- How to wire the transform: build step, CLI, or a Node/browser import hook?
- Milestone 1 complete when this runs. Next milestones: synthetic events, context, fiber.
