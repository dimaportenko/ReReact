# Stage 03 — Reconciliation call flow

Companion to [`03-reconciliation.md`](03-reconciliation.md). Diagrams of how the reconciler's
functions call each other. Diagrams are Mermaid (GitHub renders them inline).

## The functions, at a glance

| Function | Job |
|----------|-----|
| `render(vnode, container)` | Entry point. Normalize the new tree, `diff` it against the tree stored on the container, then stash the new tree for next time. |
| `normalize(vnode)` | Collapse `null`/booleans → nothing and strings/numbers → a `TEXT` vnode, so everything downstream is one uniform shape. |
| `diff(parent, new, old)` | Reconcile **one slot**: decide remove / mount / replace / update. |
| `mount(parent, vnode, anchor)` | Create brand-new DOM for a vnode (recursively for children). |
| `update(new, old)` | Same type → patch the existing DOM node in place. |
| `diffChildren(parent, new, old)` | Keyed list reconciliation: match, update/move, mount, remove. |
| `applyProps` / `setProp` / `removeProp` | Add / change / remove attributes, styles, and event listeners. |

**The whole thing is mutual recursion.** The tree walk happens because
`diff → update → diffChildren → diff …` and `diff → mount → mount …` keep calling back into
each other. The recursion bottoms out at **leaves** (a `TEXT` node) and at **removals**
(`newVNode == null`).

## Who calls whom (call graph)

```mermaid
flowchart TD
  R["render(vnode, container)"] --> N["normalize()"]
  R --> D["diff(parent, new, old)"]

  D -->|"new == null (removal)"| RM["parent.removeChild(old.dom)"]
  D -->|"no old / type changed (mount or replace)"| M["mount(parent, vnode, anchor)"]
  D -->|"same type (update)"| U["update(new, old)"]

  M -->|"type is a function (component)"| M
  M -->|"type is host: set props"| AP["applyProps(dom, props, {})"]
  M -->|"type is host: recurse children"| M

  U -->|"type is a function: diff its output"| D
  U -->|"type is TEXT"| TV["dom.nodeValue = new value"]
  U -->|"type is host: diff props"| AP2["applyProps(dom, new, old)"]
  U -->|"type is host: diff children"| DC["diffChildren(dom, new, old)"]

  DC -->|"match + same type → reuse"| U
  DC -->|"no match → create"| M

  AP --> SP["setProp / removeProp"]
  AP2 --> SP
```

Notice the loops — `D → U → DC → U` and `D → U → DC → M → M` — those *are* the recursion
descending into the tree.

## The `diff` decision (one slot)

```mermaid
flowchart TD
  S["diff(parent, new, old)"] --> Q1{"new == null?"}
  Q1 -->|yes| RM["remove old.dom; return"]
  Q1 -->|no| Q2{"old == null OR old.type ≠ new.type?"}
  Q2 -->|yes| MNT["mount(new) at old's slot, then remove old if present"]
  Q2 -->|no| UPD["update(new, old): same type, patch in place"]
```

## Example 1 — first render (mount path)

Rendering `<ul><li key=a>a</li><li key=b>b</li></ul>` into an empty container:

```mermaid
sequenceDiagram
  participant R as render()
  participant D as diff()
  participant M as mount()
  participant DOM

  R->>D: diff(container, ul, null)
  Note over D: old == null → mount
  D->>M: mount(container, ul)
  M->>DOM: createElement("ul")
  M->>M: mount(ul, li-a)
  M->>DOM: createElement("li") + text "a"
  M->>M: mount(ul, li-b)
  M->>DOM: createElement("li") + text "b"
  M->>DOM: container.insertBefore(ul, null)  → appended
```

## Example 2 — second render with a keyed reorder (update path)

Re-rendering the same list reordered to `[b, a]`. The existing `<li>` nodes are **reused and
moved**, not rebuilt:

```mermaid
sequenceDiagram
  participant R as render()
  participant D as diff()
  participant U as update()
  participant DC as diffChildren()
  participant DOM

  R->>D: diff(container, ul', ul)
  Note over D: same type "ul" → update
  D->>U: update(ul', ul)
  U->>DC: diffChildren(ul.dom, [b, a], [a, b])
  Note over DC: match old by key → reuse the existing <li>s
  DC->>U: update(li-b', li-b)
  DC->>DOM: insertBefore(li-b, firstChild)  → moves b to front
  DC->>U: update(li-a', li-a)
  DC->>DOM: insertBefore(li-a, li-b.nextSibling)
  Note over DC: no unmatched old children → nothing removed
```

If instead the new list were `[a]`, `diffChildren` would reuse `a`, and the cleanup loop at
the end would `removeChild(li-b.dom)` because `b` was never reused.
