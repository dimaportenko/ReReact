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
   - **4a.** Tokenizer learns `=` and quoted strings (and `-` in names for `data-*`). ← *next*
   - **4b.** Parser grows a `peek`-driven attribute loop; codegen emits a props object.
5. **Children & text.** `<div>hi</div>` — open/close tags, real text nodes. Tokenizer gains a
   second mode (tag-mode vs text-mode).
6. **Expression containers.** `{ ... }` as opaque pass-through, in both attributes and children.
7. **Fragments.** `<>...</>` → `createElement(Fragment, null, ...)`.
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

> **Status:** _pending — extend `tokenize`, then run `npm test` and hand off to `lbb:commit`._
