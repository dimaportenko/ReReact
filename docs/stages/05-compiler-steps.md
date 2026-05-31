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
2. **Parser: the simplest element.** Tokens → an AST node `{ type:"element", tag, attributes:[], children:[] }` for `<br/>`. ← *this step*
3. **Codegen: emit `createElement`.** AST → the string `createElement("br", null)`. First
   end-to-end compile.
4. **Attributes.** `id="x"` and boolean shorthand → a props object. Tokenizer learns `=` and
   quoted strings.
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

> **Status:** _pending — implement `parse`, then run `npm test` and hand off to `lbb:commit`._
