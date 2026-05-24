# Stage 03 — Reconciliation

**Status:** Done
**Runnable when done:** re-rendering updates only what changed instead of rebuilding the DOM.

## Goal

The heart of React: given a new element tree and the previous one, compute the minimal DOM
operations — update in place, replace, insert, or remove.

## The concept

Reconciliation / diffing. Same `type` at the same position → update props on the existing
node and recurse. Different `type` → replace. Lists use `key` to match nodes across renders
instead of relying on index.

## Design

- Start with a **simple recursive diff** (old tree vs new tree). No fiber yet — keep it understandable.
- Update path: diff props (add/remove/change attributes & listeners), then diff children.
- Keyed children: match by `key`; fall back to index when keys are absent.
- Call-flow diagrams (who calls whom, worked examples): [`03-reconciliation-flow.md`](03-reconciliation-flow.md).

## Build log

- _2026-05-24_ — Implemented `diff` / `mount` / `update` / `diffChildren` in `src/dom/index.js`
  (replaces Stage 2's mount-only `render`). Reconciles the new tree against the previous one
  stashed on the container; keyed child reconciliation with move-via-`insertBefore`;
  `applyProps` now adds/updates/**removes** props incl. stale-listener cleanup. 5 tests in
  `test/reconcile.test.js`. `npm test` green (13). Dropped the Stage 2 Fragment test (deferred).

## Gotchas & surprises

- **Persist the normalized tree + `.dom` refs.** Text children are raw strings, so each render
  re-normalizes them into fresh vnodes — write the normalized children back onto the vnode or
  they lose their DOM node. Skipping this produced a text-merge bug ("a" + "c" → "ac").
- **The reconciler assumes it owns the DOM.** A test that set `textContent` directly (a `=`
  vs `===` typo) desynced the virtual tree from the DOM and produced wrong output.
- Two bugs caught in review: `diff`'s removal branch needs an explicit `return`; component
  `update` must read `dom.parentNode`, not `parentDom`.
- **Single-root model:** `createElement(Fragment)` would hit `document.createElement(symbol)`,
  so fragments / multi-root components are deferred — the limitation fibers remove.

## Verify

Re-render with a changed attribute, a swapped child type, and a reordered keyed list;
confirm only the affected DOM nodes change (e.g. preserved node identity / focus).

## Open questions / next

- ~~How far to push the keyed-list algorithm?~~ Resolved: simple move-via-`insertBefore` keyed diff is enough to learn from; React's two-ended optimization is out of scope.
- Unblocks Stage 04 (hooks): state changes trigger a re-render that flows through this diff.
