# Stage 03 — Reconciliation

**Status:** Not started
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

## Build log

- _pending_

## Gotchas & surprises

- _pending_

## Verify

Re-render with a changed attribute, a swapped child type, and a reordered keyed list;
confirm only the affected DOM nodes change (e.g. preserved node identity / focus).

## Open questions / next

- How far to push the keyed-list algorithm before it's "good enough" to learn from?
- Unblocks Stage 04 (hooks): state changes trigger a re-render that flows through this diff.
