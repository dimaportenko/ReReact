# Stage 00 — Setup

**Status:** Not started
**Runnable when done:** `npm test` runs the `node:test` runner against an empty/sample spec and passes.

## Goal

Lay the minimal plumbing so every later stage has somewhere to put code and a way to run
tests — without introducing tooling that hides what we're learning.

## The concept

Not a React concept — just enough scaffold. The lesson is *how little* you actually need:
modern Node runs ESM and has a built-in test runner, so there's no bundler or framework.

## Design

- `package.json` with `"type": "module"` so `import`/`export` work natively.
- A `test` script: `node --test`.
- Folder skeleton matching the architecture: `src/runtime/`, `src/dom/`, `src/compiler/`,
  plus `examples/` and `test/`.
- No dependencies yet. (`jsdom` may arrive at Stage 2 if we test the DOM renderer headlessly.)

## Build log

- _pending_

## Gotchas & surprises

- _pending_

## Verify

`npm test` exits 0.

## Open questions / next

Unblocks Stage 01 (runtime), which fills `src/runtime/index.js`.
