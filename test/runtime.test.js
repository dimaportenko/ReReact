import { test } from "node:test";
import assert from "node:assert";
import { createElement, Fragment } from "../src/runtime/index.js";

test("host element has type, props, key", () => {
  const el = createElement("div", { key: "foo", id: "myID" }, "bar");
  assert.equal(el.type, "div");
  assert.equal(el.key, "foo");
  assert.deepEqual(el.props.children, ["bar"]);
  assert.equal(el.props.id, "myID");
});

test("children flatten and preserve order", () => {
  const el = createElement("ul", null, "a", ["b", "c"], "d");
  assert.deepEqual(el.props.children, ["a", "b", "c", "d"]);
});

test("function component is stored as type, not called", () => {
  let called = false;
  const Comp = () => (called = true);
  const el = createElement(Comp, null);
  assert.equal(el.type, Comp);
  assert.equal(called, false); // rendering invokes it — that's Stage 2's job
});

test("key is lifted out of props", () => {
  const el = createElement("li", { key: "row-1", className: "c" });
  assert.equal(el.key, "row-1");
  assert.equal("key" in el.props, false);
  assert.equal(el.props.className, "c");
});
