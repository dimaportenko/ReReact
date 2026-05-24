// import { Fragment } from "../runtime/index.js";

const TEXT = Symbol("rereact.text");
const ROOT = Symbol("rereact.root");

export function render(vnode, container) {
  const next = normalize(vnode);
  diff(container, next, container[ROOT] ?? null);
  container[ROOT] = next;
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
    const rendered = normalize(vnode.type(vnode.props));
    if (rendered) {
      mount(parentDom, rendered, anchor);
    }
    vnode._rendered = rendered;
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
    const rendered = normalize(newVNode.type(newVNode.props));
    diff(oldVNode.dom.parentNode, rendered, oldVNode._rendered ?? null);
    newVNode._rendered = rendered;
    newVNode.dom = rendered ? rendered.dom : null;
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
