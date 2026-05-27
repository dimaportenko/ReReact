# Stage 04 — Hooks: step-by-step build plan

Test-first breakdown of the hooks implementation (per the "small, test-first steps" rule).
Each step is one idea: a runnable test, then the minimal code to make it pass.

## The crux (what makes hooks hard here)

The renderer currently treats a function component as *transient*: `mount`/`update` call
`vnode.type(props)` and throw the function away. Hooks need the opposite — **state that
outlives a single render**, found again on the next render by **call order**.

Three pieces make that work, and they mirror real React:

1. **A persistent instance** per component — holds the `hooks` array plus enough context to
   re-render itself in place (`parentDom`, last `rendered` output). We carry it old→new just
   like we already carry `_rendered`.
2. **A "current instance" dispatcher** — a module global that `useState` reads. Before running
   a component we point it at that instance and reset a `hookIndex` cursor to 0; each hook call
   consumes the next slot. *This* is why hooks can't be conditional.
3. **`setState` = re-run + diff** — the setter closes over the instance, writes the new value,
   then re-runs the component and feeds the output back through the Stage 3 `diff`. A
   props-driven update and a `setState` become *the same operation*.

Re-renders stay **synchronous** (no batching) — simplest to understand. Batching is a later
refinement.

## Step plan (one idea each)

1. **Instance + dispatcher + `useState` initial value** (read-only setter stub).
2. **`setState` triggers a targeted re-render** (counter counts; only the text node changes).
3. **Multiple `useState` per component** (call-order correctness).
4. **`useEffect`** — runs after commit, deps comparison, cleanup before re-run.
5. **Unmount cleanup + `useRef` + `useMemo`** (small additions on the same machinery).

---

## Step 1 — instance, dispatcher, `useState` initial value

**Runnable test first** — new file `test/hooks.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { createElement } from "../src/runtime/index.js";
import { render, useState } from "../src/dom/index.js";

const newContainer = () =>
  new JSDOM("<!doctype html><body></body>").window.document.body;

test("useState returns its initial value on first render", () => {
  const root = newContainer();
  function Counter() {
    const [count] = useState(7);
    return createElement("p", null, count);
  }
  render(createElement(Counter, null), root);
  assert.equal(root.querySelector("p").textContent, "7");
});
```

Run it — it fails because `useState` isn't exported yet.

**Minimal implementation** in `src/dom/index.js`:

Add module globals near the top (by the `TEXT`/`ROOT` symbols):

```js
let currentInstance = null; // the component whose hooks we're populating
let hookIndex = 0;          // cursor into its hooks array, reset each render
```

Add two helpers and the hook. `renderComponent` is the only place that touches the
dispatcher; `rerender` is the shared "re-run + diff" path (the update branch uses it now;
`setState` will reuse it in Step 2):

```js
function renderComponent(instance) {
  currentInstance = instance;
  hookIndex = 0;
  const output = normalize(instance.vnode.type(instance.vnode.props));
  currentInstance = null;
  return output;
}

function rerender(instance) {
  const rendered = renderComponent(instance);
  diff(instance.parentDom, rendered, instance.rendered);
  instance.rendered = rendered;
  instance.vnode.dom = rendered ? rendered.dom : null;
}

export function useState(initial) {
  const instance = currentInstance;
  const i = hookIndex++;
  if (i >= instance.hooks.length) {
    instance.hooks[i] = initial; // only on first render of this slot
  }
  const setState = () => {}; // wired up in Step 2
  return [instance.hooks[i], setState];
}
```

Then route the function-component branches through this machinery. **`mount`** (replaces the
current function-component branch):

```js
if (typeof vnode.type === "function") {
  const instance = { hooks: [], vnode, parentDom, rendered: null };
  vnode._instance = instance;
  const rendered = renderComponent(instance);
  if (rendered) {
    mount(parentDom, rendered, anchor);
  }
  instance.rendered = rendered;
  vnode.dom = rendered ? rendered.dom : null;
  return;
}
```

**`update`** (replaces the current function-component branch) — carry the instance forward
and reuse `rerender`:

```js
if (typeof newVNode.type === "function") {
  const instance = oldVNode._instance;
  instance.vnode = newVNode;       // latest props live here
  newVNode._instance = instance;   // carry it forward, like _rendered
  rerender(instance);
  return;
}
```

Why this shape: `renderComponent` is the *single* place the dispatcher is armed, so hook
order is guaranteed. Because we finish a component's hook phase (and null out
`currentInstance`) **before** recursing into its rendered children, nested components don't
clobber each other — no dispatcher stack needed for our recursive model.

After this, `npm test` should be 14 green. The setter is still a stub — Step 2 makes it call
`rerender`, and the counter actually counts.

> **Status:** done — committed in `50508a8` (14 tests green).

---

## Step 2 — `setState` triggers a targeted re-render

The setter was a stub. Now it writes the new value and re-runs the component through the
`rerender` path we already built in Step 1 — so this step is *only* the setter body; the
re-render + diff machinery is reused unchanged.

**Runnable test first** — add to `test/hooks.test.js`:

```js
test("setState re-renders the component in place", () => {
  const root = newContainer();
  function Counter() {
    const [count, setCount] = useState(0);
    return createElement(
      "button",
      { onClick: () => setCount(count + 1) },
      `count: ${count}`,
    );
  }
  render(createElement(Counter, null), root);
  const button = root.querySelector("button");
  assert.equal(button.textContent, "count: 0");

  button.click();
  assert.equal(button.textContent, "count: 1");
  assert.equal(root.querySelector("button"), button); // same node, updated in place

  button.click();
  assert.equal(button.textContent, "count: 2");
});
```

Run it — the clicks do nothing yet, so it fails at `count: 1`.

**Minimal implementation** — replace the `setState` stub in `useState`:

```js
export function useState(initial) {
  const instance = currentInstance;
  const i = hookIndex++;
  if (i >= instance.hooks.length) {
    instance.hooks[i] = initial;
  }
  const setState = (next) => {
    const value = typeof next === "function" ? next(instance.hooks[i]) : next;
    if (Object.is(value, instance.hooks[i])) return; // nothing changed → skip
    instance.hooks[i] = value;
    rerender(instance);
  };
  return [instance.hooks[i], setState];
}
```

Why this works:

- The setter closes over **`instance` and the slot index `i`**, never the value — so it always
  reads/writes the live `instance.hooks[i]`, even on the next render.
- It accepts both forms: `setCount(5)` and `setCount(c => c + 1)`.
- `rerender(instance)` re-runs the component (re-arming the dispatcher, cursor back to 0, so
  the same `useState` call hits slot `i` again and now reads the updated value) and feeds the
  output through `diff`. The `<button>` keeps the same `type`, so `diff` → `update` patches it
  in place and only the text node changes — that's why `root.querySelector("button") === button`.
- The stale-closure trap is dodged *for free*: each re-render produces a fresh `onClick` whose
  closure captures the new `count`, and the reconciler swaps the listener (Stage 3's
  add/remove-listener logic). So `setCount(count + 1)` works without the functional form.
- `Object.is` bail-out mirrors real React: setting state to its current value does no work.

After this, `npm test` should be 15 green, and the counter counts on every click.

> **Status:** done — committed in `21b6301` (15 tests green). Same commit wires the
> `examples/hello` page to a working click counter.

---

## Step 3 — multiple `useState` per component

**No implementation change needed** — the Step 1–2 machinery already handles N hooks:
`hookIndex++` hands out a distinct slot per call, and `renderComponent` resets the cursor to
0 each render so the same calls land on the same slots again. This step is purely a **test
that proves and guards that invariant** (and shows why the rules of hooks exist).

**Runnable test** — add to `test/hooks.test.js`:

```js
test("multiple useState slots are independent", () => {
  const root = newContainer();

  function Form() {
    const [a, setA] = useState("a0");
    const [b, setB] = useState("b0");
    return createElement(
      "div",
      null,
      createElement("button", { id: "a", onClick: () => setA("a1") }, a),
      createElement("button", { id: "b", onClick: () => setB("b1") }, b),
    );
  }

  render(createElement(Form, null), root);
  assert.equal(root.querySelector("#a").textContent, "a0");
  assert.equal(root.querySelector("#b").textContent, "b0");

  root.querySelector("#a").click();
  assert.equal(root.querySelector("#a").textContent, "a1");
  assert.equal(root.querySelector("#b").textContent, "b0"); // b stays put
});
```

It should be green immediately. To *see* the rules-of-hooks failure mode firsthand,
temporarily wrap the second `useState` in an `if` and watch the slots desync — the cursor
points at the wrong slot on the next render.

> **Status:** done — committed in `fb598e7` (16 tests green). Same commit extends the
> `examples/hello` page to two hooks (count + background toggle).

---

## Step 4 — `useEffect`

The first hook that needs genuinely new machinery. Two new ideas:

1. **Effects run *after* commit**, not during render. So `useEffect` doesn't call your
   function — it *queues* it, and we flush the queue once the DOM work for this pass is done.
2. **Deps gating + cleanup.** Compare this render's deps to last render's; only re-run if they
   changed, and run the previous cleanup *before* the re-run.

**The "after commit" boundary:** the two things that kick off a commit are `render()` (root)
and a `setState`. So those two flush the queue; `rerender` itself stays a pure "re-run +
diff" mechanic (it can run nested inside a parent's pass, so it must *not* flush early).

**Runnable test first** — add to `test/hooks.test.js` (and import `useEffect`):

```js
import { render, useState, useEffect } from "../src/dom/index.js"; // add useEffect

test("useEffect runs after commit, re-runs on dep change, cleans up first", () => {
  const root = newContainer();
  const log = [];

  function Box() {
    const [n, setN] = useState(0);
    useEffect(() => {
      log.push(`run ${n}`);
      return () => log.push(`cleanup ${n}`);
    }, [n]);
    return createElement("button", { onClick: () => setN(n + 1) }, `${n}`);
  }

  render(createElement(Box, null), root);
  assert.deepEqual(log, ["run 0"]); // fired after mount

  root.querySelector("button").click(); // n: 0 -> 1, dep changed
  assert.deepEqual(log, ["run 0", "cleanup 0", "run 1"]); // cleanup before re-run
});
```

**Minimal implementation** in `src/dom/index.js`.

A module-level queue + flush (near the other globals):

```js
let pendingEffects = []; // effects collected this commit, flushed after DOM work

function flushEffects() {
  const effects = pendingEffects;
  pendingEffects = []; // swap first, so an effect's setState can queue fresh ones
  for (const run of effects) run();
}
```

The hook:

```js
export function useEffect(fn, deps) {
  const instance = currentInstance;
  const i = hookIndex++;
  const prev = instance.hooks[i];

  const changed =
    !prev ||                                       // first render
    !deps ||                                       // no deps array -> every render
    deps.some((d, j) => !Object.is(d, prev.deps[j]));

  if (changed) {
    pendingEffects.push(() => {
      if (prev && prev.cleanup) prev.cleanup();    // cleanup before re-run
      const cleanup = fn();
      instance.hooks[i] = { deps, cleanup };       // remember for next compare
    });
  }
}
```

Flush at the two commit boundaries — end of `render`:

```js
export function render(vnode, container) {
  const next = normalize(vnode);
  diff(container, next, container[ROOT] ?? null);
  container[ROOT] = next;
  flushEffects(); // add this
}
```

…and right after `rerender` in the `setState` closure:

```js
    instance.hooks[i] = value;
    rerender(instance);
    flushEffects(); // setState is a commit boundary
```

Why it works: `useState` proved the cursor model; `useEffect` reuses the same
`instance.hooks[i]` slot but stores `{ deps, cleanup }` instead of a value. The `prev` closure
captures last render's record, so cleanup runs against the *old* values before the new effect
overwrites the slot. Empty `[]` runs once (next render: `some` over an empty array is
`false`); no deps array runs every render.

**Scope note:** this covers mount / dep-change / cleanup-before-re-run. **Cleanup on
*unmount*** (component removed from the tree) needs the reconciler to walk removed component
vnodes and run their cleanups — that's **Step 5**, alongside `useRef` and `useMemo`.
