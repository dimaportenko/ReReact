# Stage 05 — Compiler — Steps

Supplementary build log for Stage 5. The stage doc ([05-compiler.md](05-compiler.md)) holds
the design; this file is the **living step-by-step plan** we work against. One idea per step,
smallest first, each with a runnable test before the implementation.

## The crux

JSX is **not** JavaScript. `<div id="x">hi</div>` is syntax the JS engine can't parse — it
has to be *transformed into `createElement(...)` calls before it ever runs*. That's the whole
job of this stage: a source-to-source compiler, exactly what Babel's JSX transform does, minus
the scale.

The key insight that keeps it tractable: **we do not build a JavaScript parser.** We only parse
the *JSX islands* — the `<...>` shapes. Anything inside an expression container `{ ... }` is
opaque text we copy through verbatim. So we never have to understand JS expressions, only the
angle-bracket grammar around them.

The pipeline is the same three stages every compiler has:

```
source text  ──tokenize──▶  tokens  ──parse──▶  AST  ──codegen──▶  createElement(...) text
```

We build it one *feature* at a time (self-closing tag, then attributes, then children, …), and
each feature reaches through all three stages. That way every step ends in a compile result you
can read and run, instead of three big half-built stages that don't do anything yet.

## Step plan

1. **Tokenizer: structural tokens.** Turn `<br/>` into `[<, name, /, >]`. Scanning a string
   into tokens. ✓ done
2. **Parser: the simplest element.** Tokens → an AST node `{ type:"element", tag, attributes:[], children:[] }` for `<br/>`. ✓ done
3. **Codegen: emit `createElement`.** AST → the string `createElement("br", null)`. First
   end-to-end compile. ✓ done
4. **Attributes.** `id="x"` and boolean shorthand → a props object. Split in two:
   - **4a.** Tokenizer learns `=` and quoted strings (and `-` in names for `data-*`). ✓ done
   - **4b.** Parser grows a `peek`-driven attribute loop; codegen emits a props object. ✓ done
5. **Children & text.** `<div>hi</div>` — open/close tags, real text nodes. Tokenizer gains a
   second mode (tag-mode vs text-mode). Split in three (✓ all done):
   - **5a.** Tokenizer: text-mode + closing tags (a `text` token). ✓ done
   - **5b.** Parser: open/close elements with children (recursion). ✓ done
   - **5c.** Codegen: children as trailing `createElement` args. ✓ done
6. **Expression containers.** `{ ... }` as opaque pass-through, in both attributes and children.
   Split in three:
   - **6a.** Tokenizer: the `expr` token (brace balancing). ✓ done
   - **6b.** Expression children (codegen emits raw value *unquoted*). ✓ done
   - **6c.** Expression attribute values. ✓ done
7. **Fragments.** `<>...</>` → `createElement(Fragment, null, ...)`. ✓ done
8. **Spread attributes.** `<div {...rest}/>`.
9. **Wiring.** A `.jsx` → `.js` transform (CLI or import hook); run an example through it
   end-to-end and confirm it matches the hand-written `createElement` calls from Stage 1.

Steps 1–3 together produce the first end-to-end compile of the simplest possible element. Each
later step adds exactly one JSX feature across the three stages.

---

## Step 1 — Tokenizer: structural tokens

**Goal:** a `tokenize(input)` that scans a JSX string into a flat token array. For now, handle
only what a bare self-closing tag needs: the punctuation `<`, `>`, `/`, and *names* (tag and,
later, attribute identifiers).

### Test first

`test/compiler.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { tokenize } from "../src/compiler/index.js";

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
  assert.deepEqual(tokenize("<section/>"), [
    { type: "<" },
    { type: "name", value: "section" },
    { type: "/" },
    { type: ">" },
  ]);
});
```

Run `npm test` and watch it fail (`tokenize` isn't exported yet).

### Minimal implementation

`src/compiler/index.js`:

```js
// A token is the smallest meaningful chunk of source. For now:
//   { type: "<" } | { type: ">" } | { type: "/" } | { type: "name", value }

const isNameStart = (c) => /[A-Za-z_]/.test(c);
const isNamePart  = (c) => /[A-Za-z0-9_.-]/.test(c);

export function tokenize(input) {
  const tokens = [];
  let i = 0; // cursor: index of the next unread character

  while (i < input.length) {
    const c = input[i];

    // structural punctuation — one character, one token
    if (c === "<") { tokens.push({ type: "<" }); i++; continue; }
    if (c === ">") { tokens.push({ type: ">" }); i++; continue; }
    if (c === "/") { tokens.push({ type: "/" }); i++; continue; }

    // whitespace between tokens inside a tag carries no meaning — skip it
    if (/\s/.test(c)) { i++; continue; }

    // a name: tag or attribute identifier (greedy: consume all name chars)
    if (isNameStart(c)) {
      const start = i;
      while (i < input.length && isNamePart(input[i])) i++;
      tokens.push({ type: "name", value: input.slice(start, i) });
      continue;
    }

    throw new SyntaxError(`Unexpected character ${JSON.stringify(c)} at index ${i}`);
  }

  return tokens;
}
```

### Why it works

- **One cursor, one pass.** `i` is the only state. Each branch either emits a token and advances,
  or skips a character. The loop always makes progress, so it terminates.
- **Single-char punctuation is trivial**: see the char, push the token, `i++`. The interesting
  case is the *name*, which spans multiple characters — so we record `start`, run an inner loop
  consuming every name-part char, then slice the original string `[start, i)`. That inner loop is
  why `section` becomes one token instead of seven.
- **`isNameStart` vs `isNamePart`** mirror real identifier rules: a name can't begin with a digit
  but can contain them (`h1`), and `.`/`-` are allowed so later we can scan `foo.Bar` member tags
  and `data-id` attributes without special-casing.
- **The `throw`** is your early warning system: any character you haven't taught the tokenizer
  about fails loudly with its index, instead of silently producing a wrong token stream that
  blows up confusingly three stages later.

### Scope note

This tokenizer only knows *tag-mode* — the world inside `<...>`. It deliberately skips **all**
whitespace, which is correct *only* because every input here is tag-internal. The moment we
tokenize children in **Step 5** (`<div>hi there</div>`), the spaces in `hi there` become
*significant text* and this global skip becomes wrong — that's where we split scanning into
tag-mode vs text-mode. Quoted strings (`=`, `"`) arrive in **Step 4**; `{`/`}` in **Step 6**.
Don't add them yet; each has its own step with its own test.

> **Status:** done — committed in `a40b742` (23 tests green, was 20). Tokenizer scans `<`,
> `>`, `/`, names, and skips whitespace; the three self-closing-tag tests pass. `isNamePart`
> currently omits `.`/`-`; they get added back in Step 4 when `data-id` and member-expression
> tags appear.

---

## Step 2 — Parser: the simplest element

**Goal:** a `parse(tokens)` that turns the flat token array from Step 1 into a single **AST
node** describing the element. For now, the only shape it understands is a bare self-closing
tag: `<br/>` → `{ type:"element", tag:"br", attributes:[], children:[] }`.

The mental shift from Step 1: the tokenizer answered *"what are the pieces?"* The parser answers
*"how do the pieces fit together?"* — it imposes **grammar** on the flat list. Same technique
though: one cursor walking left to right, exactly like the tokenizer walked the source string.
The only difference is the cursor now indexes **tokens**, not characters.

### Test first

Append to `test/compiler.test.js`:

```js
import { parse, tokenize } from "../src/compiler/index.js";

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
  // missing the closing ">" — parser runs out of tokens where it expects one
  assert.throws(() => parse(tokenize("<br/")), /expected/i);
});
```

We feed `parse` the output of `tokenize` so the test exercises the **two stages composed** —
that's the pipeline taking shape. Run `npm test` and watch the first two fail (`parse` isn't
exported) before you write it.

### Minimal implementation

Add to `src/compiler/index.js`:

```js
// An AST node for a host element:
//   { type:"element", tag, attributes:[], children:[] }
// The parser walks the flat token array with a single cursor — the same one-pass,
// one-cursor shape as the tokenizer, but indexing tokens instead of characters.

export function parse(tokens) {
  let pos = 0; // cursor: index of the next unread token

  const next = () => tokens[pos++]; // consume and return the next token

  // consume the next token, asserting it's the type the grammar requires here
  function expect(type) {
    const token = next();
    if (!token || token.type !== type) {
      const found = token ? token.type : "end of input";
      throw new SyntaxError(`Expected "${type}" but found ${found}`);
    }
    return token;
  }

  // grammar for now:  element := "<" name "/" ">"
  expect("<");
  const tag = expect("name").value;
  expect("/");
  expect(">");

  return { type: "element", tag, attributes: [], children: [] };
}
```

### Why it works

- **`expect` is the grammar, made executable.** Each `expect("...")` line is one symbol in the
  production `element := "<" name "/" ">"`, in order. Reading the four calls top to bottom *is*
  reading the grammar rule. That's the payoff of a hand-written recursive-descent parser: the
  code has the same shape as the rule it recognizes.
- **The cursor never backtracks.** `next()` consumes one token and advances. Because the grammar
  here is unambiguous — at each position exactly one token type is legal — we never need to peek
  ahead or undo. (`peek` without consuming arrives in Step 4, where after the tag name we must
  *decide* between "another attribute" and "the closing `/>`".)
- **Errors surface at the structural layer.** `tokenize("<br/")` is a perfectly valid token
  stream — `[<, name, /]`. Nothing is wrong with the *pieces*; what's wrong is the *shape*, a
  missing `>`. The parser is the first stage positioned to notice, and `expect(">")` running off
  the end of the array is exactly how it does — `next()` returns `undefined`, the `!token` guard
  fires, and you get `Expected ">" but found end of input`.
- **`attributes:[]` and `children:[]` are deliberate placeholders.** The codegen step needs a
  consistent node shape, so we commit to the full shape now and just leave the lists empty until
  Steps 4 and 5 fill them. Designing the data shape ahead of the features that populate it keeps
  later steps from rewriting this one.

### Scope note

Only the **self-closing** form (`<br/>`) parses. Open/close pairs (`<div>…</div>`) and text
children are **Step 5**; attributes are **Step 4** (that's why `attributes` is empty, not
absent). This parser also doesn't yet check for **leftover tokens** after the final `>` — for a
single top-level element there aren't any, but once nesting and siblings appear we'll add a
"consumed everything?" assertion. Don't add it now; it has no failing test to justify it yet.

> **Status:** done — committed in `0c58fd8` (26 tests green, was 23). `parse(tokens)` walks
> the token array with one non-backtracking cursor; `expect(type)` makes the grammar
> `element := "<" name "/" ">"` executable, and running off the end of the array surfaces a
> missing `>` as a `SyntaxError`. `attributes`/`children` are empty placeholders until Steps 4–5.

---

## Step 3 — Codegen: emit `createElement`

**Goal:** a `generate(node)` that turns the AST node from Step 2 into a **string of
JavaScript source** — a `createElement(...)` call. With this step the three stages connect
end to end for the first time: `"<br/>"` → tokens → AST → `'createElement("br", null)'`.

The crux of codegen is that **it's the inverse of parsing**. The parser read text and built
structure; codegen reads structure and writes text back out — but emits *JavaScript* (a
`createElement` call) instead of the *JSX* we started with. That round-trip, JSX-source →
JS-source, is the entire job of the compiler, and after this step you can watch it happen.

### Test first

Append to `test/compiler.test.js` (add `generate` to the existing import):

```js
import { tokenize, parse, generate } from "../src/compiler/index.js";

// the whole pipeline, composed — this is "the compiler" in miniature
const compile = (src) => generate(parse(tokenize(src)));

test("compiles a self-closing tag to a createElement call", () => {
  assert.equal(compile("<br/>"), 'createElement("br", null)');
});

test("the tag name is emitted as a quoted string literal", () => {
  assert.equal(compile("<section/>"), 'createElement("section", null)');
});
```

Note `assert.equal` (string comparison) rather than `deepEqual` — codegen's output is a
string, not a structure. Run `npm test`, watch it fail (`generate` isn't exported), then
write it.

### Minimal implementation

Add to `src/compiler/index.js`:

```js
// Codegen: turn an AST node back into source text — but JS, not JSX.
// For now the only node is a host element with no attributes and no children.

export function generate(node) {
  // A host element's type is the tag name as a JS *string literal*.
  // JSON.stringify does exactly that: "br" → the 4-character text  "br"
  // (quotes included), and it escapes anything weird for free.
  const type = JSON.stringify(node.tag);

  // No attributes yet, so props is React's no-props convention: literal null.
  // Note this is the STRING "null" — we're emitting source code, so everything
  // generate() returns is text destined to be written into a .js file.
  const props = "null";

  return `createElement(${type}, ${props})`;
}
```

### Why it works

- **Codegen mirrors the parser, run backwards.** `parse` consumed `<`, a name, `/`, `>` and
  produced `{ tag: "br" }`; `generate` consumes `{ tag: "br" }` and produces the call text.
  Structure in, text out — the exact inverse of Step 2.
- **`JSON.stringify(node.tag)` is the quoting trick.** We need the tag to appear in the
  output *as a quoted string* — `"br"`, with the quote characters — because in
  `createElement("br", null)` the first argument is a JS string literal. `JSON.stringify`
  turns the value `br` into the source text `"br"` and handles escaping, so we never
  hand-concatenate quotes.
- **`props` is the string `"null"`, not the value `null`.** This is the mental gear-shift of
  codegen: we are not *calling* `createElement`, we are *writing out the text of a call* for
  some future `.js` file to run. Every piece we assemble is a string. The runtime accepts
  `null` for no-props (`{ ...null }` is `{}`), so emitting literal `null` is the faithful
  no-attributes form.
- **End to end at last.** The `compile` helper chains `tokenize → parse → generate` — the
  whole compiler in three function calls. Every later step just *widens* one of these three
  stages (props, children, fragments); the pipeline shape is now fixed and won't change.

### Scope note

Two deferrals worth naming so they don't feel missing:

- **Host vs. component.** A capitalized tag like `<App/>` must compile to
  `createElement(App, null)` — a bare **identifier**, not the string `"App"` — because that's
  how the runtime tells a component (a function) from a host element (a tag name string). We
  quote *every* tag for now; the lowercase-is-host / Capitalized-is-component branch is a
  small later addition (it folds naturally into Step 4 or a micro-step of its own).
- **`null` props and no children** hold only until **Step 4** (attributes replace `null` with
  a props object) and **Step 5** (children become trailing arguments). `Fragment` as the
  emitted type arrives in **Step 7**.

> **Status:** done — committed in `84dadd5` (28 tests green, was 26). `generate(node)` renders
> the AST node as a `createElement(...)` call string: `JSON.stringify(node.tag)` for the quoted
> tag, literal text `"null"` for the no-props slot. The `compile = generate∘parse∘tokenize`
> helper makes the first full pipeline pass green — `"<br/>"` → `'createElement("br", null)'`.
> **Milestone: Steps 1–3 done — the first end-to-end compile of the simplest element.**

---

## Step 4a — Tokenizer: `=` and quoted strings

**Goal:** teach `tokenize` the two new lexical shapes an attribute needs — the `=` sign and a
double-quoted string value — so that `<div id="x"/>` scans into a token stream the parser can
later read. No parsing or codegen yet; this step ends at the token array.

The crux: a **quoted string is the first token whose boundaries are content-defined, not
character-class-defined.** A name ends when the next char isn't a name-char; a string ends only
at the *matching closing quote* — the spaces, digits, and punctuation in between are all part of
the value, not delimiters. So unlike every token so far, you consume the opening `"`, then read
*everything* until you see the closing `"`, regardless of what those characters are.

### Test first

Append to `test/compiler.test.js`:

```js
test("tokenizes an attribute: name = quoted-string", () => {
  assert.deepEqual(tokenize('<div id="x"/>'), [
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
  // inside the quotes, nothing is a delimiter except the closing quote
  assert.deepEqual(tokenize('<a href="/a b?c"/>'), [
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

test("an unterminated string is a syntax error", () => {
  assert.throws(() => tokenize('<div id="x/>'), /unterminated|string/i);
});
```

The second test is the one that matters: `"/a b?c"` contains `/`, a space, and `?` — characters
that are *structural* or *illegal* outside quotes — yet they all land inside one `string` token.
Run `npm test`, watch the new ones fail, then extend the tokenizer.

### Minimal implementation

Two changes in `src/compiler/index.js`.

First, re-add `-` to the name-part class (top of the file) so `data-id` scans as one name:

```js
const isNamePart = (c) => /[A-Za-z0-9_-]/.test(c);
```

Then add two branches inside the `tokenize` loop, alongside the existing punctuation branches:

```js
    // the equals sign that ties an attribute name to its value
    if (c === "=") { tokens.push({ type: "=" }); i++; continue; }

    // a quoted string value: consume from after the opening quote up to the
    // matching closing quote. Everything between is literal content.
    if (c === '"') {
      i++;                       // step over the opening quote
      const start = i;
      while (i < input.length && input[i] !== '"') i++;
      if (i >= input.length) {
        throw new SyntaxError(`Unterminated string starting at index ${start - 1}`);
      }
      tokens.push({ type: "string", value: input.slice(start, i) });
      i++;                       // step over the closing quote
      continue;
    }
```

### Why it works

- **The string scanner inverts the name scanner's logic.** A name loops *while* the char is a
  name-char (a positive class); a string loops *until* it hits the one terminator, accepting
  everything else. That's why structural characters like `/` and `?` survive inside the
  quotes — the loop's only exit condition is `input[i] === '"'`, so nothing else can end it.
- **`start` points *after* the opening quote, and we slice before the closing one.** The quotes
  are delimiters, not data: `input.slice(start, i)` captures exactly the characters between them.
  The two `i++`s (over the opening and closing quotes) are what keep the cursor from ever
  re-reading a quote as the start of a second, empty string.
- **The unterminated-string `throw` is the loud-failure principle again.** If the closing quote
  is missing, the inner loop runs off the end of the input. Without the guard you'd silently emit
  a string token containing the entire rest of the file — a bug that surfaces confusingly three
  stages later. The `i >= input.length` check turns that into an immediate, located error.
- **`-` rejoins `isNamePart` but not `isNameStart`.** A name still can't *begin* with a hyphen
  (that would be ambiguous with other syntax), but may contain one — exactly the rule HTML uses
  for `data-id`, `aria-label`, and friends. (`.` for member-expression component tags like
  `Foo.Bar` is still deferred; it has no test yet.)

### Scope note

This step stops at tokens. The parser still only understands `<` name `/` `>`, so feeding it
`<div id="x"/>` will *still* fail at the `expect("/")` after the tag name — that's expected and
gets fixed in **4b**, where the parser grows an attribute loop and codegen emits a props object.
Boolean-shorthand attributes (`<input disabled/>` → `{ disabled: true }`) and single-quoted
strings are also 4b/later concerns; this step only adds the two lexical shapes. Expression-valued
attributes (`id={x}`) wait for **Step 6** (`{ ... }` containers).

> **Status:** done — committed in `54a495e` (32 tests green, was 28). `tokenize` gained `=`
> and double-quoted `string` tokens; the string scanner loops *until* the closing quote (so
> `/`, spaces, `?` survive inside it) and throws on an unterminated string. `-` rejoined
> `isNamePart` (not `isNameStart`) for `data-*` names. Parser still rejects `<div id="x"/>` at
> `expect("/")` — that's 4b's job.

---

## Step 4b — Parser attribute loop + props-object codegen

**Goal:** `<div id="x"/>` compiles to `createElement("div", { "id": "x" })`. The parser fills the
`attributes` array; codegen turns it into a props object (or stays `null` when empty).

### The crux

The parser has only ever consumed a *fixed* sequence — `<` name `/` `>`, four tokens, no choices.
Attributes break that: after the tag name there can be **zero or more** of them, then the close.
So for the first time the parser must **look without consuming** — peek at the next token and
*decide* "another attribute?" vs "the closing `/>`". That peek-driven loop is the new idea;
everything else is bookkeeping.

### Test first

Append to `test/compiler.test.js`:

```js
test("parses an attribute into the attributes list", () => {
  assert.deepEqual(parse(tokenize('<div id="x"/>')), {
    type: "element",
    tag: "div",
    attributes: [{ name: "id", value: "x" }],
    children: [],
  });
});

test("parses multiple attributes in order", () => {
  assert.deepEqual(parse(tokenize('<a href="/x" title="go"/>')), {
    type: "element",
    tag: "a",
    attributes: [
      { name: "href", value: "/x" },
      { name: "title", value: "go" },
    ],
    children: [],
  });
});

test("compiles attributes to a props object", () => {
  assert.equal(compile('<div id="x"/>'), 'createElement("div", { "id": "x" })');
});

test("no attributes still emits null props", () => {
  assert.equal(compile("<br/>"), 'createElement("br", null)');
});
```

That last test is the regression guard: the empty case must *still* produce `null`, not `{}`.
Run `npm test`, watch the first three fail.

### Minimal implementation

**Parser** — replace the fixed middle of `parse` (between reading the tag and the closing
`/` `>`) with a `peek`-driven loop:

```js
  const peek = () => tokens[pos];           // look at next token WITHOUT consuming

  expect("<");
  const tag = expect("name").value;

  // zero or more attributes, until we hit the closing "/"
  const attributes = [];
  while (peek() && peek().type === "name") {
    const name = next().value;              // attribute name
    expect("=");                            // (value is required for now)
    const value = expect("string").value;  // the quoted value
    attributes.push({ name, value });
  }

  expect("/");
  expect(">");

  return { type: "element", tag, attributes, children: [] };
```

**Codegen** — replace the hard-coded `const props = "null";` in `generate`:

```js
  // Each attribute becomes a  "name": "value"  pair; join into an object literal.
  // No attributes → React's no-props convention, the literal null.
  const props =
    node.attributes.length === 0
      ? "null"
      : `{ ${node.attributes
          .map((a) => `${JSON.stringify(a.name)}: ${JSON.stringify(a.value)}`)
          .join(", ")} }`;
```

### Why it works

- **`peek` is the whole lesson.** `next` advances the cursor; `peek` reads `tokens[pos]` *without*
  advancing. The loop condition asks "is the next token a `name`?" — if yes, an attribute follows;
  if it's the `/`, we fall out of the loop. Deciding *before* consuming is what lets one grammar
  rule handle zero, one, or many attributes. (Note the `peek() &&` guard: at end-of-input `peek()`
  is `undefined`, and reading `.type` off it would throw the wrong error.)
- **The loop body is a mini fixed-sequence.** Inside one iteration the grammar is rigid again —
  `name`, `=`, `string` — so it's three ordinary `expect`/`next` calls. The flexibility lives
  *only* in the `while`; each attribute is still deterministic.
- **Codegen mirrors the data exactly.** Each `{name, value}` becomes `"name": "value"`, both sides
  run through `JSON.stringify` for correct quoting/escaping, joined with `, ` inside braces. The
  empty-array branch preserves the Step 3 contract — `null`, never `{}` — so `<br/>` is untouched.
- **Two stages, one feature.** The token shapes existed after 4a but did nothing; now the parser
  gives them structure and codegen gives them output. This is the stage-spanning pattern: a feature
  isn't "done" until it reaches all the way through to emitted text.

### Scope note

Deferred on purpose:
- **Boolean shorthand** (`<input disabled/>` → `{ "disabled": true }`): the loop currently
  *requires* `=` and a value (`expect("=")`). Making the value optional — peek after the name for
  `=` vs not — is a clean follow-up (call it 4c if you want it isolated).
- **Component vs host** (`<App/>` → identifier, not `"App"`): still quoting every tag; that branch
  is its own micro-step.
- **Expression-valued attributes** (`id={x}`) are **Step 6**; **spread** (`{...rest}`) is **Step 8**.

A judgment call baked into the test: it asserts `{ "id": "x" }` — keys quoted, via
`JSON.stringify(a.name)`. React-style output would be `{ id: "x" }` (bare identifier keys). Quoted
keys are chosen because they're *correct for any attribute name* (including `data-id`, not a valid
bare key) and dead simple. Emitting bare keys where legal is a worthwhile later variation.

> **Status:** done — committed in `1463856` (35 tests green, was 32). The parser grew its first
> variable-length rule — a `peek()`-driven `while` loop reading zero-or-more `name = string`
> attributes before the closing `/>`. Codegen maps the `attributes` array to a props object
> literal (`JSON.stringify` on both key and value), and the empty case still emits `null`, so
> `<br/>` is unchanged. NOTE: the stray 4a import (`syncBuiltinESMExports`) was *not* removed in
> this commit despite the commit message saying so — cleanup pending in a follow-up.

---

## Step 5 — Children & text (a new topic)

This is the biggest step in the stage, so it opens a sub-topic of its own and splits into
pieces, just like Step 4 did.

### The crux

Every input so far has been *tag-internal* — the world between `<` and `>`, where whitespace is
noise and only grammar characters appear. That's why the tokenizer could **skip all whitespace
globally**. But `<div>hi there</div>` has a second world: the **text content between tags**,
where the space in `hi there` is *significant data*, and arbitrary characters (`hi there!?`) are
legal. The tokenizer can no longer treat the whole input the same way — it needs to know *where
it is*: inside a tag (tag-mode) or in the text between tags (text-mode). That mode switch is the
hard, new idea; everything else (recursion, matching close tags) follows from it.

The mode boundary is exactly the two characters that delimit tags:
- seeing `>` ends a tag → switch to **text-mode**
- seeing `<` ends text → switch back to **tag-mode**

### Sub-step plan

- **5a. Tokenizer: text-mode + closing tags.** `<div>hi</div>` →
  `[<, name(div), >, text("hi"), <, /, name(div), >]`. The scanner gains a mode and a `text`
  token; closing tags reuse the existing `<`, `/`, `name`, `>` tokens. ← *next*
- **5b. Parser: open/close elements with children.** Distinguish a self-closing `/>` from an
  open tag `>`; after an open tag, parse children (text nodes + nested elements, recursively)
  until the matching `</tag>`. The element node's `children` array finally fills.
- **5c. Codegen: children as trailing args.** `createElement("div", null, "hi")` — append each
  child after the props argument; text children become quoted strings, element children recurse
  through `generate`.

---

## Step 5a — Tokenizer: text-mode and closing tags

**Goal:** `tokenize("<div>hi</div>")` produces the full token stream including a `text` token for
the content and the four tokens of the closing tag. The scanner stops skipping whitespace
unconditionally and instead tracks which mode it's in.

### Test first

Append to `test/compiler.test.js`:

```js
test("tokenizes an element with a text child", () => {
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
  // the space in "hi there" is data, not a token separator
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

test("self-closing tags still tokenize as before (no text token)", () => {
  assert.deepEqual(tokenize("<br/>"), [
    { type: "<" },
    { type: "name", value: "br" },
    { type: "/" },
    { type: ">" },
  ]);
});
```

The second test is the point of the whole step: `"hi there"` must come back as **one** `text`
token with its space intact — proof the global whitespace-skip no longer applies in text-mode.
Run `npm test`, watch the first two fail.

### Minimal implementation

The tokenizer gains a single piece of state — the current mode — and the main loop branches on
it. Sketch (restructure your existing `tokenize`; don't just bolt this on):

```js
export function tokenize(input) {
  const tokens = [];
  let i = 0;
  let mode = "tag"; // "tag" inside <...>, "text" between tags

  while (i < input.length) {
    const c = input[i];

    if (mode === "text") {
      // text runs until the next "<". Everything up to it is one text token.
      if (c === "<") { mode = "tag"; continue; } // don't consume "<"; let tag-mode see it
      const start = i;
      while (i < input.length && input[i] !== "<") i++;
      tokens.push({ type: "text", value: input.slice(start, i) });
      continue;
    }

    // --- tag-mode: the rules you already have ---
    if (c === "<") { tokens.push({ type: "<" }); i++; continue; }
    if (c === ">") { tokens.push({ type: ">" }); i++; mode = "text"; continue; } // ">" opens text
    if (c === "/") { tokens.push({ type: "/" }); i++; continue; }
    if (c === "=") { tokens.push({ type: "=" }); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }            // whitespace skip — tag-mode ONLY now
    if (c === '"') { /* ...unchanged string scanner... */ }
    if (isNameStart(c)) { /* ...unchanged name scanner... */ }

    throw new SyntaxError(`Unexpected character ${JSON.stringify(c)} at index ${i}`);
  }

  return tokens;
}
```

Two surgical changes to the tag-mode branches you already have:
1. the `>` branch sets `mode = "text"` after pushing its token;
2. the whitespace-skip now lives *only* in tag-mode (it moved inside the tag-mode block, after the
   text-mode `if`), so it can never eat significant text.

### Why it works

- **One bit of state changes everything.** `mode` is the whole feature. The same character means
  different things depending on it: in tag-mode `h` starts a name; in text-mode `h` starts text.
  A tokenizer with modes is the standard answer to "the same input has regions with different
  lexical rules" — HTML, template languages, and string interpolation all work this way.
- **The mode flips on `>` and `<`, the natural tag delimiters.** Pushing `>` means a tag just
  closed, so what follows is content → `mode = "text"`. In text-mode, hitting `<` means content
  ended and a tag is starting → flip back. Crucially the text-mode branch **doesn't consume** the
  `<` (no `i++` before `continue`) — it just changes mode and loops, letting the tag-mode `<`
  branch emit the token. One character, one owner.
- **Text scanning mirrors the string scanner from 4a.** Loop *until* the terminator (`<`),
  accepting everything else — so the space in `hi there` is captured, not skipped. The difference
  from a quoted string is only the terminator (`<` vs `"`) and that there are no surrounding
  delimiters to step over.
- **Self-closing tags are unaffected** because `<br/>` never emits a `>` until the very end, so
  the scanner stays in tag-mode the whole time and `mode = "text"` only trips as the input ends.
  That's why the third (regression) test still passes untouched.

### Scope note

- **5a stops at tokens.** The parser still only understands self-closing tags, so feeding it
  `<div>hi</div>` will fail at `expect("/")` — fixed in **5b**, where open tags and child parsing
  arrive.
- **Whitespace-only text** (the newlines/indentation between nested tags, e.g.
  `<ul>\n  <li/>\n</ul>`) will tokenize into `text` tokens that are pure whitespace. Real JSX
  trims/drops these; we'll decide how to handle them in 5b or a dedicated follow-up — not now.
- **Expression containers** `{x}` inside children are **Step 6**; they're a *third* lexical
  context and get their own mode handling there.

> **Status:** done — committed in `25e7b3b` (37 tests green, was 35). `tokenize` gained a `mode`
> flag: tag-mode is the old behaviour, text-mode runs from after a `>` until the next `<` and
> emits one `text` token with whitespace intact. The `>` branch flips to text-mode; the text-mode
> `<` branch flips back *without* consuming the `<`. Whitespace-skip moved into tag-mode only.
> (The stray `syncBuiltinESMExports` import — falsely claimed gone in 4b and this 5a message — was
> actually removed in the follow-up commit `e0c2b91`.)

---

## Step 5b — Parser: open/close elements with children

**Goal:** the parser stops only understanding self-closing tags. It now distinguishes `/>` (no
children) from `>` (an open tag), and after an open tag parses a list of children — text nodes
*and nested elements* — up to the matching `</tag>`, filling the `children` array that has sat
empty since Step 2.

### The crux

This is the step where the grammar becomes **recursive**: an element can contain elements, which
can contain elements, with no fixed depth. So the parsing function must **call itself** —
`parseElement` parses one element, and to parse that element's children it calls `parseElement`
again for each nested tag. The subtle part is that all those nested calls must share **one
cursor**: there is a single `pos` walking the flat token array, and every level of recursion
advances the same `pos`. We get that for free by making the helpers *nested functions that close
over `pos`*, rather than passing an index around.

The second new idea is **two-token lookahead**. Inside a child list, when you see a `<` you must
decide: is this a *nested element* opening (`<li>…`) or *this element's closing tag* (`</ul>`)?
The two are distinguished only by the *next* token — `name` vs `/`. So the parser peeks one token
past the cursor to choose.

### Test first

Append to `test/compiler.test.js`:

```js
test("parses an open/close element with a text child", () => {
  assert.deepEqual(parse(tokenize("<div>hi</div>")), {
    type: "element",
    tag: "div",
    attributes: [],
    children: [{ type: "text", value: "hi" }],
  });
});

test("self-closing element still parses with empty children", () => {
  assert.deepEqual(parse(tokenize("<br/>")), {
    type: "element",
    tag: "br",
    attributes: [],
    children: [],
  });
});

test("parses nested element children (recursion)", () => {
  assert.deepEqual(parse(tokenize("<ul><li>a</li><li>b</li></ul>")), {
    type: "element",
    tag: "ul",
    attributes: [],
    children: [
      { type: "element", tag: "li", attributes: [], children: [{ type: "text", value: "a" }] },
      { type: "element", tag: "li", attributes: [], children: [{ type: "text", value: "b" }] },
    ],
  });
});

test("a mismatched closing tag is a syntax error", () => {
  assert.throws(() => parse(tokenize("<div>hi</span>")), /mismatch|closing|span|div/i);
});
```

The nested test is the one that proves recursion: a `ul` whose children are `li` elements, each
with its own text child. Run `npm test`, watch the open/close and nested tests fail.

### Minimal implementation

Restructure `parse` so its body becomes nested helpers sharing the cursor. First, let `peek` take
an offset so we can look ahead:

```js
  const peek = (offset = 0) => tokens[pos + offset];   // look ahead WITHOUT consuming
```

Then split the parsing into `parseElement` (one element) and `parseChildren` (a child list),
and end `parse` by returning `parseElement()`:

```js
  function parseElement() {
    expect("<");
    const tag = expect("name").value;

    const attributes = [];
    while (peek() && peek().type === "name") {
      const name = next().value;
      expect("=");
      const value = expect("string").value;
      attributes.push({ name, value });
    }

    // self-closing: "/" ">" — no children
    if (peek() && peek().type === "/") {
      expect("/");
      expect(">");
      return { type: "element", tag, attributes, children: [] };
    }

    // open tag: ">" then children until the matching "</tag>"
    expect(">");
    const children = parseChildren(tag);
    return { type: "element", tag, attributes, children };
  }

  function parseChildren(parentTag) {
    const children = [];
    while (true) {
      const token = peek();
      if (!token) {
        throw new SyntaxError(`Unexpected end of input: <${parentTag}> was never closed`);
      }

      // a closing tag "< / name >" ends this child list — the 2-token lookahead
      if (token.type === "<" && peek(1) && peek(1).type === "/") {
        expect("<");
        expect("/");
        const closeTag = expect("name").value;
        expect(">");
        if (closeTag !== parentTag) {
          throw new SyntaxError(
            `Mismatched closing tag: expected </${parentTag}> but found </${closeTag}>`,
          );
        }
        return children;
      }

      // text child
      if (token.type === "text") {
        children.push({ type: "text", value: next().value });
        continue;
      }

      // nested element child — recurse
      if (token.type === "<") {
        children.push(parseElement());
        continue;
      }

      throw new SyntaxError(`Unexpected ${token.type} token in children of <${parentTag}>`);
    }
  }

  return parseElement();
```

### Why it works

- **Recursion mirrors the data.** The grammar is "an element is `<tag> children </tag>`, and each
  child may itself be an element." Code that recognizes a self-referential grammar is naturally
  self-referential: `parseElement` → `parseChildren` → `parseElement`. The call stack at any
  moment mirrors the tag nesting depth in the source — when you're three `parseElement` frames
  deep, you're inside three nested tags.
- **One cursor, shared by closure.** `pos`, `next`, `peek`, `expect` are all defined once in
  `parse` and *captured* by the nested helpers. Every recursive `parseElement` call reads and
  advances the **same** `pos`. If instead each call had its own index, the levels would re-parse
  each other's tokens — the shared cursor is what makes the single left-to-right pass work across
  arbitrary depth.
- **Two-token lookahead resolves the only ambiguity.** At a `<` in a child list, one token isn't
  enough to know what you're looking at; `peek(1)` tells you `/` (closing tag, stop) versus `name`
  (nested element, recurse). This is the first time the parser needs to see *two* tokens to decide
  — still no backtracking, just a wider window.
- **The mismatch check turns a silent bug into a loud one.** Comparing `closeTag` to `parentTag`
  catches `<div>…</span>`. Without it the parser would happily accept mis-nested tags and build a
  structurally wrong tree that explodes later. The "never closed" guard does the same for input
  that runs out before the close tag arrives.
- **Self-closing is now just an early return.** The `peek().type === "/"` branch handles `<br/>`
  before any child logic runs, so the Step 2 behaviour is preserved exactly — that's the
  regression test staying green.

### Scope note

- **Codegen is untouched this step**, so `compile("<div>hi</div>")` still emits
  `createElement("div", null)` — the children are *parsed* but not yet *emitted*. **Step 5c** makes
  codegen walk `children` and append them as trailing `createElement` args. (Your existing
  `compile` tests still pass because they only use self-closing tags.)
- **Whitespace-only text nodes** (newlines/indentation between nested tags) will now appear in
  `children` as `text` nodes of pure whitespace. The tests above avoid them by writing tags with
  no gaps (`<ul><li>…`); deciding whether to trim them is a deliberate later call (5c or a
  follow-up), not this step.
- **Expression-container children** `{x}` are **Step 6**; **fragments** `<>…</>` are **Step 7**.

> **Status:** done — committed in `79bf5d3` (40 tests green, was 37). `parse` refactored into
> nested `parseElement`/`parseChildren` helpers closing over one shared cursor, so recursion
> handles arbitrary nesting depth. Self-closing (`/>`) returns early with empty children; open
> tags parse children until the matching `</tag>`, using two-token lookahead (`peek(1)`) to tell
> a closing tag from a nested element. Mismatched and never-closed tags throw. Codegen still
> ignores `children` — that's 5c.

---

## Step 5c — Codegen: children as trailing args

**Goal:** close out the children sub-topic. `generate` walks the `children` array the parser has
been filling and appends each child after the props argument, so the whole tree compiles end to
end: `compile("<div>hi</div>")` → `createElement("div", null, "hi")`, and nested trees nest.

### The crux

`createElement(type, props, ...children)` takes children as **trailing arguments** — variadic, one
per child. So codegen's job is to turn the `children` array into a comma-separated argument list
glued after `props`. Two kinds of child need different rendering: a **text** node becomes a quoted
string literal (`"hi"` via `JSON.stringify`), and an **element** node becomes *another
`createElement(...)` call* — which means `generate` must **call itself** on element children. The
parser recursed to build the tree; codegen recurses to walk it back out. Same shape, opposite
direction.

### Test first

Append to `test/compiler.test.js`:

```js
test("compiles a text child as a trailing string arg", () => {
  assert.equal(compile("<div>hi</div>"), 'createElement("div", null, "hi")');
});

test("compiles nested element children recursively", () => {
  assert.equal(
    compile("<ul><li>a</li></ul>"),
    'createElement("ul", null, createElement("li", null, "a"))',
  );
});

test("compiles children alongside attributes", () => {
  assert.equal(
    compile('<p id="x">hi</p>'),
    'createElement("p", { "id": "x" }, "hi")',
  );
});

test("no children still emits just type and props", () => {
  assert.equal(compile("<br/>"), 'createElement("br", null)');
});
```

The nested test is the proof of recursion: the inner `createElement("li", null, "a")` appears as an
*argument* to the outer call. The last test is the regression guard — a childless element must emit
**no** trailing args (and no trailing comma). Run `npm test`, watch the first three fail.

### Minimal implementation

In `generate`, after computing `type` and `props`, render the children and assemble the arg list:

```js
  // Each child becomes one trailing argument:
  //   text node    -> a quoted string literal
  //   element node -> a nested createElement(...) call (recurse!)
  const children = node.children.map((child) =>
    child.type === "text" ? JSON.stringify(child.value) : generate(child),
  );

  // type and props are always present; children follow only if there are any,
  // so a childless element emits no trailing comma.
  const args = [type, props, ...children];
  return `createElement(${args.join(", ")})`;
```

(Replace the old `return` line; keep the `type` and `props` computations above as-is.)

### Why it works

- **Codegen recursion is the mirror of parser recursion.** `parseChildren` called `parseElement`
  to build nested nodes; now `generate` calls `generate` on each element child to emit nested calls.
  The text-vs-element branch is the base case vs recursive case: text terminates (a literal),
  elements recurse (another `generate`). An element five levels deep in the tree produces a
  `createElement` call five levels deep in the output — structure preserved exactly.
- **The spread + `join` handles the variadic shape and the empty case in one stroke.** `args`
  always starts with `type` and `props`; `...children` adds zero or more after. When `children` is
  empty the array is just `[type, props]`, so `join(", ")` yields `createElement("br", null)` with
  no dangling comma. That's why the regression test passes without a special branch — the empty
  case falls out of the general code.
- **`JSON.stringify` on text reuses the quoting trick** from Step 3: it turns the raw text value
  into a correct JS string literal, escaping quotes/newlines for free, so even `<p>say "hi"</p>`
  would emit a valid argument.
- **The output is now runnable React.** Feed `createElement("ul", null, createElement("li", null,
  "a"))` to the runtime from Stage 1 and it builds the same element tree your hand-written calls did
  — which is exactly what Step 9 (wiring) will verify against the examples.

### Scope note

- **Whitespace-only text children still pass straight through.** `<ul> <li/> </ul>` would emit
  `createElement("ul", null, " ", createElement("li", null), " ")` — those `" "` args are real to
  the runtime. Trimming/dropping insignificant whitespace is a deliberate later decision (a 5d
  follow-up or handled at render time); this step emits faithfully what the parser produced.
- **Expression-container children** `{x}` are **Step 6** — they'll emit the raw expression text
  *unquoted* (an identifier, not a string), which is exactly why they need their own step.
- **Fragments** (`<>…</>`) are **Step 7**; **spread props** **Step 8**.

> **Status:** done — committed in `59b56db` (43 tests green, was 40). `generate` now maps
> `node.children` into trailing args — text → `JSON.stringify` literal, element → recursive
> `generate` call — and emits `[type, props, ...children].join(", ")`, so a childless element
> stays `createElement("br", null)` with no trailing comma. **Step 5 complete: a nested JSX tree
> compiles end to end to runnable `createElement` calls.**

---

## Step 6 — Expression containers `{ ... }` (a new topic)

This is the conceptual centre of the whole stage — the place where the "**we do not build a
JavaScript parser**" decision stops being a slogan and becomes a line of code.

### The crux

Everything inside `{ ... }` is **arbitrary JavaScript** — `count`, `count + 1`, `items.map(x =>
<li>{x}</li>)`. We refuse to understand it. The tokenizer's only job is to find where the
expression *ends* — the matching `}` — and hand back everything between the braces as one opaque
chunk of text. We never tokenize the JS inside; we copy it through **verbatim**.

Two things make this subtle:
1. **Brace balancing.** The expression can itself contain braces — object literals `{a: 1}`,
   nested JSX with more containers. So "the matching `}`" isn't "the next `}`" — you must count
   depth: `+1` on `{`, `−1` on `}`, and stop when depth returns to zero. (We accept one honest
   limitation: a `}` inside a *string or comment* within the expression would fool the counter.
   Handling that needs a real JS lexer, which is explicitly out of scope — we'll note it, not
   solve it.)
2. **Unquoted output.** A text child compiles to a *quoted string* (`"hi"`); an expression child
   compiles to the **raw expression, unquoted** (`count`, not `"count"`). That difference — quote
   vs don't-quote — is the entire point of the feature, and it's why expressions can't just reuse
   the text-node path.

Expression containers appear in **two** places — as a **child** (`<p>{count}</p>`) and as an
**attribute value** (`<input value={x}/>`) — so this topic splits along that line.

### Sub-step plan

- **6a. Tokenizer: the `expr` token (brace balancing).** `{count + 1}` → a single
  `{ type: "expr", value: "count + 1" }` token, scanned by depth-counting. Works in both
  tag-mode and text-mode. ← *next*
- **6b. Expression children.** Parser accepts an `expr` token in a child list as
  `{ type: "expression", value }`; codegen emits the raw value **unquoted** as a trailing arg.
- **6c. Expression attribute values.** Parser accepts `name={expr}` (value is an expression, not
  a string); codegen emits `name: value` with the value **unquoted**.

---

## Step 6a — Tokenizer: the `expr` token (brace balancing)

**Goal:** `tokenize` recognises `{ ... }` and emits one `expr` token whose `value` is the verbatim
text between the *balanced* braces — correctly skipping past nested braces inside.

### Test first

Append to `test/compiler.test.js`:

```js
test("tokenizes an expression container as one expr token", () => {
  assert.deepEqual(tokenize("<p>{count}</p>"), [
    { type: "<" }, { type: "name", value: "p" }, { type: ">" },
    { type: "expr", value: "count" },
    { type: "<" }, { type: "/" }, { type: "name", value: "p" }, { type: ">" },
  ]);
});

test("an expression's inner content is opaque (not tokenized)", () => {
  // "count + 1" comes back as ONE value string, spaces and "+" intact
  assert.deepEqual(tokenize("<p>{count + 1}</p>"), [
    { type: "<" }, { type: "name", value: "p" }, { type: ">" },
    { type: "expr", value: "count + 1" },
    { type: "<" }, { type: "/" }, { type: "name", value: "p" }, { type: ">" },
  ]);
});

test("nested braces inside an expression are balanced, not ended early", () => {
  // the inner "{ id: 1 }" must NOT end the expression at the first "}"
  assert.deepEqual(tokenize("<x a={ {id: 1} }/>"), [
    { type: "<" }, { type: "name", value: "x" },
    { type: "name", value: "a" }, { type: "=" },
    { type: "expr", value: " {id: 1} " },
    { type: "/" }, { type: ">" },
  ]);
});

test("an unterminated expression is a syntax error", () => {
  assert.throws(() => tokenize("<p>{count</p>"), /unterminated|expression|brace/i);
});
```

The third test is the whole point: `{ {id: 1} }` has a nested object literal, and a naive "stop at
the first `}`" scanner would cut the expression off mid-way. Run `npm test`, watch them fail.

### Minimal implementation

Add **one** branch to the `tokenize` loop. It must run in *both* modes — an expression is just as
valid as an attribute value (tag-mode) as it is between tags (text-mode) — so place it where it
sees every character. Simplest: handle `{` right at the top of the loop body, before the
mode-specific logic:

```js
    // expression container: copy everything up to the MATCHING "}" verbatim.
    // depth counting lets nested braces ({a:1}, nested JSX) pass through.
    if (c === "{") {
      i++;                       // step over the opening "{"
      const start = i;
      let depth = 1;             // we're inside one brace
      while (i < input.length && depth > 0) {
        if (input[i] === "{") depth++;
        else if (input[i] === "}") depth--;
        if (depth === 0) break;  // don't consume the closing "}" into the value
        i++;
      }
      if (depth !== 0) {
        throw new SyntaxError(`Unterminated expression starting at index ${start - 1}`);
      }
      tokens.push({ type: "expr", value: input.slice(start, i) });
      i++;                       // step over the closing "}"
      // after an expression in text position, we're still in text-mode;
      // in tag position, still tag-mode — so DON'T touch `mode` here.
      continue;
    }
```

Put this branch **before** the `if (mode === "text")` block so it's reachable in both modes. One
wrinkle: in text-mode your scanner currently reads text "until `<`" — it will now also need to stop
at `{`. Widen that inner condition:

```js
      while (i < input.length && input[i] !== "<" && input[i] !== "{") i++;
```

so `hi {x}` in `<p>hi {x}</p>` emits `text("hi ")` then `expr("x")` instead of swallowing the `{`.

### Why it works

- **Depth counting is the entire idea.** A flat "find the next `}`" scanner is wrong the moment an
  expression contains its own braces. Tracking `depth` — `+1` per `{`, `−1` per `}`, stop at zero —
  is exactly how you match *balanced* delimiters, the same trick a calculator uses for parentheses.
  When depth hits zero you've found *the* matching brace, not just *a* brace.
- **We never look at what's inside.** The loop only cares about `{` and `}`; every other character
  — identifiers, operators, spaces, even a whole nested `<li>{x}</li>` — is copied without
  inspection. That's the "no JS parser" promise made literal: the value string is opaque payload.
- **`slice(start, i)` captures the raw expression**, braces excluded (we `i++` past the opener
  before recording `start`, and `break` before consuming the closer). The two tests with internal
  spaces (`count + 1`, ` {id: 1} `) prove the whitespace is preserved verbatim — because, unlike
  tag-mode, nothing in here skips anything.
- **Mode is deliberately left untouched.** An expression is a *value*, not a structural boundary,
  so it doesn't open or close a tag. Whatever mode we were in before `{`, we're in after `}`.

### Scope note

- **6a stops at the token.** The parser still rejects `expr` tokens (it has no branch for them), so
  `<p>{count}</p>` won't *parse* yet — that's **6b** (children) and **6c** (attributes).
- **The honest limitation:** a `}` inside a *string* or *comment* within the expression
  (`{ "}" }`, `{ x /* } */ }`) will miscount, because we don't lex JS. Real Babel does; we
  deliberately don't. Worth a one-line code comment so the next reader knows it's a *known* corner,
  not an oversight.
- **Empty containers** `{}` and **whitespace-only** `{ }` will tokenize as `expr` with an empty/
  blank value; whether to reject those is a parser-level decision for 6b, not here.

> **Status:** done — committed in `0117535` (47 tests green, was 43). A `{` branch in `tokenize`
> copies up to the matching `}` into one opaque `expr` token via depth counting, so nested braces
> (`{ {id: 1} }`) don't end it early; an unterminated expression throws. The branch sits before
> the text-mode block so it fires in both modes, and the text scanner now also stops at `{`. Mode
> is left untouched (an expression is a value, not a boundary). Parser support is 6b/6c.

---

## Step 6b — Expression children

**Goal:** an `expr` token sitting in a child list becomes an AST node `{ type: "expression", value }`,
and codegen emits its `value` **raw and unquoted** as a trailing arg — so
`compile("<p>{count}</p>")` → `createElement("p", null, count)`. Note `count`, **not** `"count"`.

### The crux

This is where the quote-vs-don't-quote distinction from the topic intro becomes one line of code.
Both a text child and an expression child are "things between the tags," and both ride out as
trailing `createElement` args — but a **text** node is *data* (it must become the string literal
`"hi"`), while an **expression** is *code* (it must stay the identifier `count`, evaluated at
runtime). Same slot in the output, opposite treatment: text gets `JSON.stringify`, expression gets
copied verbatim. Get that and the whole step is two tiny additions — one in the parser, one in
codegen.

### Test first

Append to `test/compiler.test.js`:

```js
test("parses an expression child into an expression node", () => {
  assert.deepEqual(parse(tokenize("<p>{count}</p>")), {
    type: "element",
    tag: "p",
    attributes: [],
    children: [{ type: "expression", value: "count" }],
  });
});

test("compiles an expression child to an UNQUOTED trailing arg", () => {
  // the point of the whole feature: count, not "count"
  assert.equal(compile("<p>{count}</p>"), 'createElement("p", null, count)');
});

test("text and expression children sit side by side", () => {
  assert.equal(
    compile("<p>hi {name}</p>"),
    'createElement("p", null, "hi ", name)',
  );
});

test("an element and an expression child compile together", () => {
  assert.equal(
    compile("<ul>{items}</ul>"),
    'createElement("ul", null, items)',
  );
});
```

The third test is the real proof: `"hi "` is **quoted** (it's text) and `name` is **bare** (it's
an expression), side by side in the same arg list — and it also exercises the text-mode scanner
stopping at `{`, which 6a added but no test until now actually triggered. Run `npm test`, watch
them fail.

### Minimal implementation

**Parser** — add one branch in `parseChildren`, alongside the existing `text` and `<` branches:

```js
      // expression child — opaque JS, kept verbatim
      if (token.type === "expr") {
        children.push({ type: "expression", value: next().value });
        continue;
      }
```

**Codegen** — extend the child-mapping in `generate` to handle the new node type:

```js
  const children = node.children.map((child) => {
    if (child.type === "text") return JSON.stringify(child.value); // data → quoted
    if (child.type === "expression") return child.value;           // code → verbatim
    return generate(child);                                        // nested element → recurse
  });
```

(That replaces the two-branch ternary you have now with a three-way `if` chain — same shape, one
more case.)

### Why it works

- **The node type carries the quote decision.** The parser doesn't decide how to render — it just
  labels: `text` for data, `expression` for code, `element` for a subtree. Codegen reads the label
  and picks the treatment. Keeping "what is it" (parser) separate from "how do I emit it" (codegen)
  is why adding a child kind is one line in each, not a tangle.
- **`return child.value` is the entire feature.** No `JSON.stringify`, no quotes — the raw text the
  tokenizer captured in 6a goes straight into the output. `{count}` parsed to `value: "count"`, and
  `"count"` (the 5 characters) is emitted as-is, producing the *identifier* `count` in the
  generated source. That's the runtime reading a variable instead of a string literal.
- **The side-by-side test proves the split is real.** `<p>hi {name}</p>` tokenizes to
  `text("hi ")` then `expr("name")`; the parser makes one `text` node and one `expression` node;
  codegen quotes the first and not the second → `"hi ", name`. Two children, two code paths, one
  arg list.
- **Everything else is unchanged.** Element recursion still falls through to `generate(child)`, and
  the `[type, props, ...children]` join from 5c handles the new args with zero changes — an
  expression is just another entry in the children array.

### Scope note

- **Expression *attributes*** (`<input value={x}/>`) are **6c** — the tokenizer already emits the
  `expr` token there (6a works in tag-mode), but the *parser's attribute loop* still only accepts
  `= string`, so `value={x}` won't parse until 6c teaches it `= (string | expr)`.
- **Empty `{}`** would parse to `{ type: "expression", value: "" }` and emit an empty arg
  (`createElement("p", null, )`) — invalid JS. Real JSX treats `{}` / `{/* comment */}` as nothing.
  Rejecting or dropping empties is a deliberate later refinement, not this step; the tests avoid it.
- **Whitespace-only text** between an expression and a tag still rides through as text args, same as
  Step 5 — untouched here.

> **Status:** done — committed in `fdb1698` (52 tests green, was 47). `parseChildren` gained an
> `expr` branch producing `{ type: "expression", value }`; `generate`'s child map became a
> three-way chain — text → `JSON.stringify` (quoted), expression → `child.value` (raw), element →
> recurse. So `<p>{count}</p>` → `createElement("p", null, count)` (unquoted), and mixed children
> `<p>hi {name}</p>` → `"hi ", name`. The text scanner stopping at `{` (added in 6a) is finally
> exercised. Expression attributes are 6c.

---

## Step 6c — Expression attribute values

**Goal:** the parser's attribute loop accepts `name={expr}` as well as `name="str"`, and codegen
emits an expression value **unquoted** in the props object — so `compile('<input value={x}/>')` →
`createElement("input", { "value": x })`. This finishes the expression-container topic: `{ ... }`
now works in *both* positions, child and attribute.

### The crux

It's the **same quote-vs-don't-quote split as 6b**, moved into the props object. After `=` the
value can now be one of two token types — a `string` (quote it) or an `expr` (emit raw). The one
real design choice is how the attribute node *remembers which kind it is* so codegen can decide.
The constraint: the existing string-attribute tests assert `{ name: "id", value: "x" }` exactly
(`deepEqual`), so you **must not** add a field to string attributes — adding `expression: false`
would break them. The clean move: tag *only* expression attributes with a flag, leaving string
attributes byte-for-byte unchanged.

### Test first

Append to `test/compiler.test.js`:

```js
test("parses an expression attribute, flagged as an expression", () => {
  assert.deepEqual(parse(tokenize("<input value={x}/>")), {
    type: "element",
    tag: "input",
    attributes: [{ name: "value", value: "x", expression: true }],
    children: [],
  });
});

test("a string attribute is unchanged (no expression flag)", () => {
  // regression guard: string attrs must stay exactly { name, value }
  assert.deepEqual(parse(tokenize('<div id="x"/>')), {
    type: "element",
    tag: "div",
    attributes: [{ name: "id", value: "x" }],
    children: [],
  });
});

test("compiles an expression attribute UNQUOTED in the props object", () => {
  assert.equal(
    compile("<input value={x}/>"),
    'createElement("input", { "value": x })',
  );
});

test("string and expression attributes mix in one props object", () => {
  assert.equal(
    compile('<a href="/x" onClick={go}/>'),
    'createElement("a", { "href": "/x", "onClick": go })',
  );
});
```

The mix test is the proof: `"href"` keeps its quoted string value, `"onClick"` gets the bare
identifier `go` — quote and don't-quote, side by side in one object, mirroring the side-by-side
children test from 6b. Run `npm test`, watch them fail.

### Minimal implementation

**Parser** — in `parseElement`'s attribute loop, branch on the token type after `=`:

```js
    while (peek() && peek().type === "name") {
      const name = next().value;
      expect("=");
      // value is either a quoted string or an expression container
      if (peek() && peek().type === "expr") {
        attributes.push({ name, value: next().value, expression: true });
      } else {
        attributes.push({ name, value: expect("string").value });
      }
    }
```

(String attributes still push exactly `{ name, value }` — no flag — so the regression test holds.)

**Codegen** — in the props map, quote a string value but emit an expression value raw:

```js
  const props =
    node.attributes.length === 0
      ? "null"
      : `{ ${node.attributes
          .map((attr) => {
            const value = attr.expression ? attr.value : JSON.stringify(attr.value);
            return `${JSON.stringify(attr.name)}: ${value}`;
          })
          .join(", ")} }`;
```

### Why it works

- **The flag is the quote decision, carried on the node.** Just like children label themselves
  `text` vs `expression`, an attribute now optionally carries `expression: true`. Codegen reads it:
  flag set → `attr.value` raw; flag absent → `JSON.stringify(attr.value)`. Same parser-labels /
  codegen-decides separation as 6b.
- **Absent-means-string keeps the old shape intact.** `attr.expression` is `undefined` for string
  attributes, which is falsy — so the ternary takes the `JSON.stringify` branch without the field
  ever needing to exist. That's why string attributes stay literally `{ name, value }` and the
  regression test passes untouched. (Adding `expression: false` would've worked for codegen but
  broken the `deepEqual` — the absence *is* the signal.)
- **The tokenizer needed zero changes.** 6a's `{`-branch already runs in tag-mode, so `value={x}`
  was *already* tokenizing to `name(value) = expr(x)`. The only thing missing was the parser
  accepting an `expr` where it previously demanded a `string` — this step is purely "widen the
  grammar `= string` to `= (string | expr)`," parser + codegen, no lexer work.
- **`peek().type === "expr"` chooses without backtracking.** One-token lookahead after `=` picks
  the branch; the `else` still uses `expect("string")` so a missing/!wrong value token throws the
  same clear error as before. No ambiguity, no rewind.

### Scope note

- **This completes Step 6.** `{ ... }` now compiles in both children (6b) and attributes (6c),
  always emitted verbatim/unquoted — the "opaque pass-through JS" promise fully delivered across
  the two positions where containers appear.
- **Spread attributes** `<div {...rest}/>` are **Step 8** — note they *look* like an expression
  but aren't a `name={value}` pair; they need their own parser branch (a `{` immediately where an
  attribute name is expected, not after `=`).
- **Boolean shorthand** (`<input disabled/>`, no `=`) is still deferred (the loop still requires
  `=`); it's an independent follow-up whenever you want it.
- **Empty `{}` attribute** (`value={}`) would emit `{ "value":  }` — invalid JS, same empty-
  container caveat as 6b; tests avoid it.

> **Status:** done — committed in `a4b504a` (55 tests green, was 52). The parser's
> attribute loop now branches on a one-token lookahead after `=`: an `expr` token pushes
> `{ name, value, expression: true }`, a `string` still pushes exactly `{ name, value }` (no flag,
> so the string-attribute regression holds). Codegen reads the flag — expression value emitted raw,
> string value through `JSON.stringify` — so `<a href="/x" onClick={go}/>` mixes a quoted string and
> a bare identifier in one props object. Tokenizer needed no changes (6a already scanned `value={x}`
> as `name = expr`). **Step 6 complete: `{ ... }` now compiles in both children (6b) and attributes (6c).**

---

## Step 7 — Fragments `<>...</>`

**Goal:** `<>hi</>` compiles to `createElement(Fragment, null, "hi")`. A fragment groups
children **without a wrapper element** — and the whole feature is "detect the missing tag
name," parser + codegen, with **zero tokenizer changes**.

### The crux

A fragment is an opening tag with an empty name (`<>`) and a matching `</>`. Two insights
make it small:

1. **The tokenizer is already done.** `<>` is just the tokens `<` `>` with no `name` between
   them, and `</>` is `<` `/` `>`. `tokenize("<>hi</>")` today already returns
   `[<, >, text("hi"), <, /, >]`. A fragment is literally a tag whose name is *absent*, and
   absence needs no token.
2. **The feature is "detect the missing name."** At a `<`, the parser peeks: if the next
   token is `>` (not a `name`), it's a fragment open; the matching `</>` has no name either.
   Codegen then emits the **bare identifier** `Fragment` in the type slot instead of a quoted
   `"div"` — the same quote-vs-don't-quote distinction as string-vs-expression and (foreshadowed)
   host-vs-component.

### Test first

Append to `test/compiler.test.js`:

```js
test("parses a fragment into a fragment node (no tag, no attributes)", () => {
  assert.deepEqual(parse(tokenize("<>hi</>")), {
    type: "fragment",
    children: [{ type: "text", value: "hi" }],
  });
});

test("compiles a fragment to createElement(Fragment, ...) — Fragment is a BARE identifier", () => {
  // not "Fragment" the string — the bare value, like a component type
  assert.equal(compile("<>hi</>"), 'createElement(Fragment, null, "hi")');
});

test("compiles a fragment with multiple element children", () => {
  assert.equal(
    compile("<><li>a</li><li>b</li></>"),
    'createElement(Fragment, null, createElement("li", null, "a"), createElement("li", null, "b"))',
  );
});

test("an empty fragment emits just Fragment and null props", () => {
  // regression guard: no children → no trailing comma
  assert.equal(compile("<></>"), "createElement(Fragment, null)");
});

test("a fragment nests as a child of an element", () => {
  assert.equal(
    compile("<div><>a</></div>"),
    'createElement("div", null, createElement(Fragment, null, "a"))',
  );
});
```

The bare-identifier test is the point: `Fragment` appears **unquoted**, unlike `"div"`. The
last test proves fragments compose — `parseChildren` already recurses into `parseElement` for a
nested `<`, and the fragment branch makes that recursion handle `<>` too. Run `npm test`, watch
the new ones fail.

### Minimal implementation

**Parser** — `parseElement`, add a fragment branch right after `expect("<")`, *before* the name:

```js
  function parseElement() {
    expect("<");

    // Fragment: "<>" — the "<" is immediately followed by ">", no tag name.
    if (peek() && peek().type === ">") {
      expect(">");
      const children = parseChildren(null); // null parentTag marks "this is a fragment"
      return { type: "fragment", children };
    }

    const tag = expect("name").value;
    // ...attributes loop, self-close, open-tag — all unchanged...
  }
```

**Parser** — `parseChildren`, teach the closing-tag branch that `</>` has no name (and thread
the `null` sentinel both ways so mismatches still throw):

```js
      if (token.type === "<" && peek(1) && peek(1).type === "/") {
        expect("<");
        expect("/");

        // fragment close "</>" has no name; element close "</tag>" does
        if (peek() && peek().type === ">") {
          expect(">");
          if (parentTag !== null) {
            throw new SyntaxError(
              `Mismatched closing tag: expected </${parentTag}> but found </>`,
            );
          }
          return children;
        }

        const closeTag = expect("name").value;
        expect(">");
        if (parentTag === null) {
          throw new SyntaxError(
            `Mismatched closing tag: expected </> but found </${closeTag}>`,
          );
        }
        if (closeTag !== parentTag) {
          throw new SyntaxError(
            `Mismatched closing tag: expected </${parentTag}> but found </${closeTag}>`,
          );
        }
        return children;
      }
```

**Codegen** — `generate`, branch the *type* and *props* slots on the fragment node; children
and the final `join` stay exactly as they are:

```js
export function generate(node) {
  const isFragment = node.type === "fragment";

  // A host element's type is a quoted string ("div"); a fragment's type is the
  // BARE identifier `Fragment` — a value the runtime matches by its Symbol,
  // not a string. Same "quote vs don't-quote" call as string-vs-expression.
  const type = isFragment ? "Fragment" : JSON.stringify(node.tag);

  // Fragments never carry attributes, so props is always null.
  const props = isFragment
    ? "null"
    : node.attributes.length === 0
      ? "null"
      : `{ ${node.attributes
          .map((attr) => {
            const value = attr.expression ? attr.value : JSON.stringify(attr.value);
            return `${JSON.stringify(attr.name)}: ${value}`;
          })
          .join(", ")} }`;

  // children + args + return: UNCHANGED
  const children = node.children.map((child) => {
    if (child.type === "text") return JSON.stringify(child.value);
    if (child.type === "expression") return child.value;
    return generate(child);
  });

  const args = [type, props, ...children];
  return `createElement(${args.join(", ")})`;
}
```

### Why it works

- **The tokenizer never learned about fragments — and didn't need to.** `<>` and `</>`
  decompose into tokens already emitted. The feature lives entirely in *interpreting the
  absence of a `name`*, a parser-and-up concern. A new surface syntax that reuses existing
  lexical pieces costs zero lexer work — the payoff of the layered design.
- **`parentTag === null` is the fragment sentinel, threaded through recursion.** A real tag
  passes its name down so the close matches by string equality; a fragment passes `null`. The
  two symmetric `null` checks mean both `<>x</div>` and `<div>x</>` throw — you can't close a
  fragment with a named tag or vice-versa.
- **Bare `Fragment` vs quoted `"div"` is the type-slot distinction again.** The runtime stored
  `Fragment` as a `Symbol`; the emitted code must reference that *binding by name*, not a
  string, so `createElement` receives the actual symbol and recognizes "group without a
  wrapper." Identical mechanism to the future `<App/>` → bare `App` for components.
- **Empty fragment falls out for free.** `<></>` parses to `{ type:"fragment", children:[] }`;
  `[type, props, ...[]].join(", ")` is just `Fragment, null` — no trailing comma, no special
  case. Same spread-and-join trick that handled childless elements in 5c.

### Scope note

- **The emitted `Fragment` must be in scope where the compiled code runs** — imported from the
  runtime. The compiler only emits the *reference*; arranging the import is **Step 9 (wiring)**.
- **Host-vs-component** (`<App/>` → bare `App`, not `"App"`) is still deferred — every named tag
  is quoted today. Same bare-identifier-in-the-type-slot idea; folds in as its own micro-step.
- **`<React.Fragment>` long form and keyed fragments** (`<Fragment key=…>`) are out of scope —
  the short `<>…</>` is the whole feature here.

> **Status:** done — committed in `22ef9eb` (60 tests green, was 55). The tokenizer was
> untouched: `<>` is already `<` `>` and `</>` is `< / >`, so a fragment is a tag with the
> name omitted. `parseElement` detects a `<` followed by `>` (no name) and returns a
> `{ type: "fragment", children }` node, parsing its children with a `null` `parentTag`
> sentinel; `parseChildren` learns that a `</>` close has no name and throws a mismatch when
> a fragment and a named tag are crossed either way. Codegen branches on `isFragment`: the
> type slot emits the bare identifier `Fragment` (matched by its runtime `Symbol`) and props
> is always `null`, with children/args unchanged — so `<></>` falls out as
> `createElement(Fragment, null)` with no trailing comma.
