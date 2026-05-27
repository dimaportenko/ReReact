// import { Fragment } from "../runtime/index.js";

const TEXT = Symbol("rereact.text");
const ROOT = Symbol("rereact.root");

let currentInstance = null;
let hookIndex = 0;
let pendingEffects = [];

function flushEffects() {
  const effects = pendingEffects;
  pendingEffects = [];

  for (const run of effects) run();
}

export function render(vnode, container) {
  const next = normalize(vnode);
  diff(container, next, container[ROOT] ?? null);
  container[ROOT] = next;
  flushEffects();
}

function normalize(vnode) {
  if (vnode == null || typeof vnode === "boolean") {
    return null;
  }

  if (typeof vnode === "string" || typeof vnode === "number") {
    return {
      type: TEXT,
      props: {
        nodeValue: String(vnode),
        children: [],
      },
    };
  }

  return vnode;
}

function diff(parentDom, newVNode, oldVNode) {
  if (newVNode == null) {
    if (oldVNode) {
      parentDom.removeChild(oldVNode.dom);
    }
    return;
  }

  if (oldVNode == null || oldVNode.type !== newVNode.type) {
    mount(parentDom, newVNode, oldVNode ? oldVNode.dom : null);

    if (oldVNode) {
      parentDom.removeChild(oldVNode.dom);
    }

    return;
  }

  update(newVNode, oldVNode);
}

function mount(parentDom, vnode, anchor) {
  const doc = parentDom.ownerDocument;

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

  if (vnode.type === TEXT) {
    vnode.dom = doc.createTextNode(vnode.props.nodeValue);
    parentDom.insertBefore(vnode.dom, anchor);
    return;
  }

  const dom = doc.createElement(vnode.type);
  applyProps(dom, vnode.props, {});
  const children = vnode.props.children.map(normalize).filter(Boolean);
  for (const child of children) {
    mount(dom, child, null);
  }

  vnode.props.children = children;
  vnode.dom = dom;
  parentDom.insertBefore(dom, anchor);
}

function update(newVNode, oldVNode) {
  newVNode.dom = oldVNode.dom;

  if (typeof newVNode.type === "function") {
    const instance = oldVNode._instance;
    instance.vnode = newVNode;
    newVNode._instance = instance;
    rerender(instance);
    return;
  }

  if (newVNode.type === TEXT) {
    if (newVNode.props.nodeValue !== oldVNode.props.nodeValue) {
      oldVNode.dom.nodeValue = newVNode.props.nodeValue;
    }
    return;
  }

  applyProps(oldVNode.dom, newVNode.props, oldVNode.props);
  newVNode.props.children = diffChildren(
    oldVNode.dom,
    newVNode.props.children,
    oldVNode.props.children,
  );
}

function diffChildren(parentDom, newRaw, oldChildren) {
  const newChildren = newRaw.map(normalize).filter(Boolean);

  const oldByKey = new Map();
  oldChildren.forEach((child, index) =>
    oldByKey.set(child.key ?? index, child),
  );

  const reused = new Set();
  let prevDom = null;

  newChildren.forEach((newChild, index) => {
    const oldChild = oldByKey.get(newChild.key ?? index);
    const anchor = prevDom ? prevDom.nextSibling : parentDom.firstChild;

    if (oldChild && oldChild.type === newChild.type) {
      update(newChild, oldChild);
      reused.add(oldChild);
      if (newChild.dom !== anchor) {
        parentDom.insertBefore(newChild.dom, anchor);
      }
    } else {
      mount(parentDom, newChild, anchor);
    }
    prevDom = newChild.dom;
  });

  for (const oldChild of oldChildren) {
    if (!reused.has(oldChild) && oldChild.dom.parentNode === parentDom) {
      parentDom.removeChild(oldChild.dom);
    }
  }

  return newChildren;
}

function applyProps(dom, newProps, oldProps) {
  for (const name in oldProps) {
    if (name !== "children" && !(name in newProps)) {
      removeProp(dom, name, oldProps[name]);
    }
  }

  for (const name in newProps) {
    if (name !== "children" && newProps[name] !== oldProps[name]) {
      setProp(dom, name, newProps[name], oldProps[name]);
    }
  }
}

function setProp(dom, name, value, oldValue) {
  if (name.startsWith("on")) {
    const event = name.slice(2).toLowerCase();
    if (oldValue) {
      dom.removeEventListener(event, oldValue);
    }
    dom.addEventListener(event, value);
  } else if (name === "className") {
    dom.setAttribute("class", value);
  } else if (name === "style" && value && typeof value === "object") {
    dom.style.cssText = "";
    Object.assign(dom.style, value);
  } else {
    dom.setAttribute(name, value);
  }
}

function removeProp(dom, name, oldValue) {
  if (name.startsWith("on")) {
    const event = name.slice(2).toLowerCase();
    dom.removeEventListener(event, oldValue);
  } else if (name === "className") {
    dom.removeAttribute("class");
  } else {
    dom.removeAttribute(name);
  }
}

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
  const setState = (next) => {
    const value = typeof next === "function" ? next(instance.hooks[i]) : next;
    if (Object.is(value, instance.hooks[i])) {
      return;
    }
    instance.hooks[i] = value;
    rerender(instance);
    flushEffects();
  };
  return [instance.hooks[i], setState];
}

export function useEffect(fn, deps) {
  const instance = currentInstance;
  const i = hookIndex++;
  const prev = instance.hooks[i];

  const changed =
    !prev ||
    !deps ||
    deps.some((dep, index) => !Object.is(dep, prev.deps[index]));

  if (changed) {
    pendingEffects.push(() => {
      if (prev && prev.cleanup) {
        prev.cleanup();
      }

      const cleanup = fn();
      instance.hooks[i] = { deps, cleanup };
    });
  }
}
