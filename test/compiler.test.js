import { test } from "node:test";
import assert from "node:assert";
import { tokenize, parse } from "../src/compiler/index.js";

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

test("a malformed tag is a syntax error", () => {
  assert.throws(() => parse(tokenize("<br/")), /expected/i);
});
