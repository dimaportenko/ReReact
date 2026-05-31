# Stage 04 — Hooks

**Status:** Done
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

- _2026-05-25 → 2026-05-31_ — Built in 5 small steps (test-first); detailed plan in
  [`04-hooks-steps.md`](04-hooks-steps.md).
  - **Step 1:** per-component instance + dispatcher (`currentInstance` / `hookIndex`) +
    `useState` initial value (setter stub).
  - **Step 2:** `setState` writes the new value and re-runs the component through a shared
    `rerender(instance)` path — a `setState` and a props-driven update are the same operation.
  - **Step 3:** test-only — proved the cursor already indexes N hooks independently.
  - **Step 4:** `useEffect` — queued during render, flushed after commit at the two commit
    boundaries (`render` and `setState`); deps gating + cleanup-before-re-run.
  - **Step 5:** unmount cleanup (walks removed subtrees, runs effect cleanups at all three
    removal sites in `diff`/`diffChildren`), plus `useRef` and `useMemo` as small additions on
    the same hook-storage pattern.
  - 20 tests green; `examples/hello` exercises two hooks (count + bg toggle).

## Gotchas & surprises

- **Closures over `instance`, not `currentInstance`.** `setState` and queued effects run
  *after* `renderComponent` has reset `currentInstance = null`. Capturing `const instance =
  currentInstance` at hook-call time is what makes them work — reading the live
  `currentInstance` later would see `null` (or worse, the wrong component).
- **Slot-read typo** (`instance.hookIndex[i]` instead of `instance.hooks[i]`) crashed
  `useEffect` on its second slot with *"reading '1'"* — `hookIndex` is the *module* cursor,
  not a field on the instance. Caught by Step 4's test.
- **Where to flush effects.** Flush at the *commit boundaries* (`render` and `setState`), not
  inside `rerender` — because `rerender` is also called from `update` mid-pass during a parent
  render, and flushing there would fire nested effects prematurely.
- **Where a vnode's children live differs by kind.** Host/text → normalized
  `vnode.props.children`. Component → `vnode._instance.rendered`. The `unmount` walker has to
  branch on `typeof vnode.type` for that reason.
- Multiple hooks "just work" once the cursor model is right (Step 3 needed no implementation
  change). The rules-of-hooks rule exists because *any* non-determinism in call order desyncs
  the slot index from its intended meaning.

## Verify

Counter increments and only the text node updates; effect fires after mount and on dep
change, cleanup fires on unmount.

## Open questions / next

- ~~Batching multiple `setState` calls in one tick — do it now or defer?~~ Resolved: deferred.
  Synchronous re-render is the most understandable model; batching is a perf concern that
  belongs with the fiber/scheduler milestone.
- Unblocks Stage 05 (compiler): real components written in JSX exercising all of the above.
