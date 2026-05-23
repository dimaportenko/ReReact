# Stage 00 — Setup

**Status:** Done
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

- _2026-05-23_ — Added `package.json` (`"type": "module"`, `test` → `node --test`, no
  deps) and `test/smoke.test.js` (`node:test` + `node:assert`). `npm test` green on Node 22.

## Gotchas & surprises

- `node --test` with zero matching files isn't a real pass — added a smoke test so the
  toolchain is genuinely exercised.
- Git won't track empty directories, so the `src/` subfolders will appear alongside their
  first real file (Stage 1) rather than as committed placeholders.

## Verify

`npm test` exits 0.

## Open questions / next

Unblocks Stage 01 (runtime), which fills `src/runtime/index.js`.
