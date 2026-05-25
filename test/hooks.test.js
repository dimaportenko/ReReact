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
