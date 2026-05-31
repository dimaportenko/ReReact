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
   into tokens. ← *this step*
2. **Parser: the simplest element.** Tokens → an AST node `{ type:"element", tag, attributes:[], children:[] }` for `<br/>`.
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

> **Status:** done — 23 tests green (was 20). Tokenizer scans `<`, `>`, `/`, names, and
> skips whitespace; the three self-closing-tag tests pass. `isNamePart` currently omits
> `.`/`-`; they get added back in Step 4 when `data-id` and member-expression tags appear.
