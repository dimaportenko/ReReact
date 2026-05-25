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
