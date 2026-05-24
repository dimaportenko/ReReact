import { test } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { createElement, Fragment } from "../src/runtime/index.js";
import { render } from "../src/dom/index.js";

const newContainer = () =>
  new JSDOM("<!doctype html><body></body>").window.document.body;

test("renders host element with attributes and text", () => {
  const root = newContainer();
  render(createElement("div", { id: "x", className: "box" }, "hi"), root);
  assert(root.innerHTML === '<div id="x" class="box">hi</div>');
});

test("calls function components", () => {
  const root = newContainer();
  const Hi = ({ name }) => createElement("span", null, `hi ${name}`);
  render(createElement(Hi, { name: "ann" }), root);
  assert.equal(root.innerHTML, "<span>hi ann</span>");
});

test("Fragment adds no wrapper node", () => {
  const root = newContainer();
  render(
    createElement(Fragment, null, createElement("i", null, "a"), "b"),
    root,
  );
  assert.equal(root.innerHTML, "<i>a</i>b");
});

test("onClick attaches a real listener", () => {
  const root = newContainer();
  let clicks = 0;
  render(createElement("button", { onClick: () => clicks++ }), root);
  root.querySelector("button").click();
  assert.equal(clicks, 1);
});

test("render div with text, no attributes", () => {
  const root = newContainer();
  render(createElement("div", null, false, null, "only"), root);
  assert.equal(root.innerHTML, "<div>only</div>");
});
