# Stage 04 — Hooks

**Status:** Not started
**Runnable when done:** a `useState` counter re-renders on click; `useEffect` runs after commit.

## Goal

Make components stateful. A hook call stores state tied to the component instance and, when
updated, schedules a re-render that flows through the Stage 03 reconciler.

## The concept

Hooks rely on **stable call order** per render. State lives outside the component function,
indexed by a per-instance hook cursor that resets at the start of each render — which is why
the "rules of hooks" (no conditional hooks) exist.

## Design

- Per-component hook storage + a cursor incremented on each hook call.
- `useState(initial)` → `[value, setValue]`; `setValue` schedules a re-render.
- `useEffect(fn, deps)` → run after commit; compare deps; run cleanup before re-run/unmount.
- Then `useRef`, `useMemo` as small additions on the same machinery.

## Build log

- _pending_

## Gotchas & surprises

- _pending_

## Verify

Counter increments and only the text node updates; effect fires after mount and on dep
change, cleanup fires on unmount.

## Open questions / next

- Batching multiple `setState` calls in one tick — do it now or defer?
- Unblocks Stage 05 (compiler): real components written in JSX exercising all of the above.
