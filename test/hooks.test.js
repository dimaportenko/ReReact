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
