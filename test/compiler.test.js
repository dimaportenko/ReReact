import { test } from "node:test";
import assert from "node:assert";
import { tokenize, parse, generate } from "../src/compiler/index.js";

const compile = (src) => generate(parse(tokenize(src)));

test("tokenizes a self-closing tag", () => {
  assert.deepEqual(tokenize("<br/>"), [
    { type: "<" },
    { type: "name", value: "br" },
    { type: "/" },
    { type: ">" },
  ]);
});

test("whitespace inside a tag is insignificant", () => {
  assert.deepEqual(tokenize("<br />"), [
    { type: "<" },
    { type: "name", value: "br" },
    { type: "/" },
    { type: ">" },
  ]);
});

test("a multi-character tag name scans as one name token", () => {
  assert.deepEqual(tokenize("<section />"), [
    { type: "<" },
    { type: "name", value: "section" },
    { type: "/" },
    { type: ">" },
  ]);
});

test("tokenizes an attribute: name = quoted-string", () => {
  assert.deepEqual(tokenize('<div id="x" />'), [
    { type: "<" },
    { type: "name", value: "div" },
    { type: "name", value: "id" },
    { type: "=" },
    { type: "string", value: "x" },
    { type: "/" },
    { type: ">" },
  ]);
});

test("a string value can contain spaces and punctuation", () => {
  assert.deepEqual(tokenize('<a href="/a b?c" />'), [
    { type: "<" },
    { type: "name", value: "a" },
    { type: "name", value: "href" },
    { type: "=" },
    { type: "string", value: "/a b?c" },
    { type: "/" },
    { type: ">" },
  ]);
});

test("a name can contain a hyphen (data-* attributes)", () => {
  assert.deepEqual(tokenize("<div data-id/>"), [
    { type: "<" },
    { type: "name", value: "div" },
    { type: "name", value: "data-id" },
    { type: "/" },
    { type: ">" },
  ]);
});

test("tokenize an element with a text child", () => {
  assert.deepEqual(tokenize("<div>hi</div>"), [
    { type: "<" },
    { type: "name", value: "div" },
    { type: ">" },
    { type: "text", value: "hi" },
    { type: "<" },
    { type: "/" },
    { type: "name", value: "div" },
    { type: ">" },
  ]);
});

test("text content preserves internal whitespace", () => {
  assert.deepEqual(tokenize("<p>hi there</p>"), [
    { type: "<" },
    { type: "name", value: "p" },
    { type: ">" },
    { type: "text", value: "hi there" },
    { type: "<" },
    { type: "/" },
    { type: "name", value: "p" },
    { type: ">" },
  ]);
});

test("tokenizes an expression container as one expr token", () => {
  assert.deepEqual(tokenize("<p>{count}</p>"), [
    { type: "<" },
    { type: "name", value: "p" },
    { type: ">" },
    { type: "expr", value: "count" },
    { type: "<" },
    { type: "/" },
    { type: "name", value: "p" },
    { type: ">" },
  ]);
});

test("an expression's inner content is opaque (not tokenized)", () => {
  assert.deepEqual(tokenize("<p>{count + 1}</p>"), [
    { type: "<" },
    { type: "name", value: "p" },
    { type: ">" },
    { type: "expr", value: "count + 1" },
    { type: "<" },
    { type: "/" },
    { type: "name", value: "p" },
    { type: ">" },
  ]);
});

test("nested brances inside an expression are balanced, not ended early", () => {
  assert.deepEqual(tokenize("<x a={ {id: 1} } />"), [
    { type: "<" },
    { type: "name", value: "x" },
    { type: "name", value: "a" },
    { type: "=" },
    { type: "expr", value: " {id: 1} " },
    { type: "/" },
    { type: ">" },
  ]);
});

test("an unterminated expression is a syntax error", () => {
  assert.throws(
    () => tokenize("<p>{count</p>"),
    /unterminated|expression|brace/i,
  );
});

test("an unterminated string is a syntax error", () => {
  assert.throws(() => tokenize('<div id="x/>'), /unterminated|string/i);
});

test("parses a self-closing tag into an element node", () => {
  assert.deepEqual(parse(tokenize("<br/>")), {
    type: "element",
    tag: "br",
    attributes: [],
    children: [],
  });
});

test("parses a multi-character tag name", () => {
  assert.deepEqual(parse(tokenize("<section/>")), {
    type: "element",
    tag: "section",
    attributes: [],
    children: [],
  });
});

test("parses an attribute into the attributes list", () => {
  assert.deepEqual(parse(tokenize('<div id="x"/>')), {
    type: "element",
    tag: "div",
    attributes: [{ name: "id", value: "x" }],
    children: [],
  });
});

test("parses multiple attributes in order", () => {
  assert.deepEqual(parse(tokenize('<a href="/x" title="go" />')), {
    type: "element",
    tag: "a",
    attributes: [
      { name: "href", value: "/x" },
      { name: "title", value: "go" },
    ],
    children: [],
  });
});

test("parses an open/close element with a text child", () => {
  assert.deepEqual(parse(tokenize("<div>hi</div>")), {
    type: "element",
    tag: "div",
    attributes: [],
    children: [
      {
        type: "text",
        value: "hi",
      },
    ],
  });
});

test("parses nested element children (recursion)", () => {
  assert.deepEqual(parse(tokenize("<ul><li>a</li><li>b</li></ul>")), {
    type: "element",
    tag: "ul",
    attributes: [],
    children: [
      {
        type: "element",
        tag: "li",
        attributes: [],
        children: [{ type: "text", value: "a" }],
      },
      {
        type: "element",
        tag: "li",
        attributes: [],
        children: [{ type: "text", value: "b" }],
      },
    ],
  });
});

test("a mismatched closing tag is a syntax error", () => {
  assert.throws(
    () => parse(tokenize("<div>hi</span>")),
    /mismatch|closing|span|div/i,
  );
});

test("a malformed tag is a syntax error", () => {
  assert.throws(() => parse(tokenize("<br/")), /expected/i);
});

test("compiles attributes to a props object", () => {
  assert.equal(
    compile('<div id="x" />'),
    'createElement("div", { "id": "x" })',
  );
});

test("compiles a self-closing tag to a createElement call", () => {
  assert.equal(compile("<br/>"), 'createElement("br", null)');
});

test("the tag name is emitted as a quoted string literal", () => {
  assert.equal(compile("<section />"), 'createElement("section", null)');
});

test("compiles a text child as a trailing string arg", () => {
  assert.equal(compile("<div>hi</div>"), 'createElement("div", null, "hi")');
});

test("compiles nexted element children recursively", () => {
  assert.equal(
    compile("<ul><li>a</li></ul>"),
    'createElement("ul", null, createElement("li", null, "a"))',
  );
});

test("compiles children alonside attributes", () => {
  assert.equal(
    compile('<p id="x">hi</p>'),
    'createElement("p", { "id": "x" }, "hi")',
  );
});
