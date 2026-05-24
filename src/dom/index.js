import { Fragment } from "../runtime/index.js";

export function render(element, container) {
  const doc = container.ownerDocument;

  if (element == null || typeof element === "boolean") return;

  if (typeof element === "string" || typeof element === "number") {
    container.appendChild(doc.createTextNode(String(element)));
    return;
  }

  const { type, props } = element;

  if (typeof type === "function") {
    render(type(props), container);
    return;
  }

  if (type === Fragment) {
    for (const child of props.children) {
      render(child, container);
    }
    return;
  }

  const node = doc.createElement(type);
  applyProps(node, props);
  for (const child of props.children) {
    render(child, node);
  }
  container.appendChild(node);
}

function applyProps(node, props) {
  for (const [name, value] of Object.entries(props)) {
    if (name === "children") {
      continue;
    }

    if (name.startsWith("on")) {
      const eventName = name.slice(2).toLowerCase();
      node.addEventListener(eventName, value);
    } else if (name === "className") {
      node.setAttribute("class", value);
    } else if (name === "style" && value && typeof value === "object") {
      Object.assign(node.style, value);
    } else {
      node.setAttribute(name, value);
    }
  }
}
