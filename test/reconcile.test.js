import { test } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { createElement } from "../src/runtime/index.js";
import { render } from "../src/dom/index.js";

const newContainer = () =>
  new JSDOM("<!doctype html><body></body>").window.document.body;

test("same type updates in place (node identity preserved)", () => {
  const root = newContainer();
  render(createElement("p", { id: "a" }, "one"), root);
  const p = root.querySelector("p");
  render(createElement("p", { id: "b" }, "two"), root);

  assert.equal(root.querySelector("p"), p);
  assert.equal(p.id, "b");
  assert.equal(p.textContent, "two");
});

test("different type replaces the node", () => {
  const root = newContainer();
  render(createElement("div", null, "x"), root);
  render(createElement("span", null, "x"), root);
  assert.equal(root.innerHTML, "<span>x</span>");
});

test("shrinking a list removes the leftover nodes", () => {
  const root = newContainer();
  const ul = (n) =>
    createElement(
      "ul",
      null,
      ...["a", "b", "c"].slice(0, n).map((t) => createElement("li", null, t)),
    );
  render(ul(3), root);
  render(ul(1), root);
  assert.equal(root.querySelectorAll("li").length, 1);
});

test("keyed reorder reuses DOM nodes", () => {
  const root = newContainer();
  const list = (keys) =>
    createElement(
      "ul",
      null,
      ...keys.map((k) => createElement("li", { key: k }, k)),
    );
  render(list(["a", "b", "c"]), root);
  const cNode = [...root.querySelectorAll("li")].find(
    (li) => li.textContent === "c",
  );
  render(list(["c", "a", "b"]), root);
  const after = [...root.querySelectorAll("li")];
  assert.deepEqual(
    after.map((li) => li.textContent),
    ["c", "a", "b"],
  );
  assert.equal(after[0], cNode); // the SAME <li> moved to the front, not rebuilt;
});

test("event handlers are swapped, not stacked", () => {
  const root = newContainer();
  let a = 0,
    b = 0;
  render(createElement("button", { onClick: () => a++ }), root);
  render(createElement("button", { onClick: () => b++ }), root);
  root.querySelector("button").click();
  assert.equal(a, 0); // old listener removed
  assert.equal(b, 1); // new listener active
});
