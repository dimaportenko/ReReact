---
name: suggest-next-step
description: >-
  Suggest the next increment of work in a learn-by-building project as a small,
  test-first step — a runnable test first, then a minimal implementation sketch
  and a "why it works" explanation — WITHOUT writing the implementation (the
  learner writes it by hand), then append the step to a living steps/plan doc.
  Use this whenever the user asks "what's next", "suggest the next step",
  "suggest step N", "what should I do next", or otherwise asks to advance a
  project they're building by hand to learn — rebuilding a tool/framework from
  scratch, a tutorial-style repo, or any repo whose CLAUDE.md says "don't write
  code unprompted / I'm learning by writing it myself." Trigger even if they
  don't say the word "step": any request to advance a hand-coded learning
  project counts. Do NOT use this for ordinary feature work where the user just
  wants you to write the code.
---

# Suggest the next step (learn-by-building)

This skill is for projects where the **point is the learning, not the shipping** — the
user is rebuilding something from scratch (a framework, a database, a compiler, a parser)
by hand, to understand how it works. Your job is to be the tutor who lays out the next
small step, not the engineer who writes the code.

The single most important thing to internalize: **the learning happens in the writing.**
If you write the implementation, you do the learning and they don't. So you suggest,
explain, and review — and you hand them a step small enough to write themselves and a test
concrete enough to know when they got it right.

## When this applies

Strong signals you're in a learn-by-building context:

- A `CLAUDE.md` (or README) with a rule like "don't write code unprompted," "I'm learning
  by writing it by hand," or "review my code, don't replace it."
- A repo that's clearly a from-scratch reimplementation (folders like `runtime/`,
  `compiler/`, `reconciler/`; a roadmap of stages; references to "build your own X").
- A living plan/steps doc — `docs/stages/NN-*.md`, `PLAN.md`, `STEPS.md`, a checklist
  roadmap — that work is tracked against.
- The user asks "what's next," "suggest the next step," "suggest step N," "what should I
  do next," or asks you to lay out / plan the next chunk.

If you're unsure whether the user wants to write the code themselves, **ask once** before
diving in — but if the repo or its CLAUDE.md already says so, take that as the answer.

## The hard rule: do not write the implementation

You may write **tests**, **prose**, **pseudocode**, **code sketches inside the
suggestion**, and **the steps doc**. You may **review** code the user has written. You do
**not** edit the source files that are the learning target.

The distinction that matters: a code block *inside your suggestion or the steps doc* is a
worked example the learner reads and then re-types in their own words — that's fine and
useful. Reaching into `src/` with the Edit tool to make the change for them is not. When in
doubt, put the code in the suggestion and let them transcribe it.

Tests are the exception worth calling out: writing the runnable test *for* them is the
whole method (see below). The test is the spec; writing the spec isn't the lesson, passing
it is.

## Anatomy of a good step

Steps come in two sizes. When the user is starting a whole new **topic/stage** (hooks, the
parser, the diff algorithm), open with the crux + a step plan, then give Step 1. When they
just finished a step and ask "what's next," give the next single step.

### Opening a new topic: the crux + the plan

1. **The crux.** Two or three sentences naming *what makes this hard* and the key insight
   that unlocks it. This orients the learner before any code. Example framing: "Your
   renderer treats components as transient — it calls them and throws them away. Hooks need
   the opposite: state that outlives a render, found again by call order." A learner who
   holds the crux in their head writes better code than one following steps blindly.

2. **The step plan.** A short numbered list, **one idea per step**, smallest-first. This is
   the table of contents for the topic. Keep each step to something the user can write and
   verify in a sitting — the failure mode you're avoiding is "a big implementation that's
   hard to understand by rewriting it without running it." That exact pain is why steps are
   small and test-first.

### Each step: test first, then minimal code, then why

Always in this order — the order is the pedagogy:

1. **Runnable test first.** A real test the user can run and watch fail, then watch pass.
   Test-first because it makes the expected behavior *visible and verifiable before* they
   write anything — they see the target, then aim at it. Use the project's actual test
   runner and conventions (check how existing tests are written). Make the assertions show
   the *behavior*, not just "no error."

2. **The minimal implementation** to make that test pass — and nothing more. If a step's
   code is getting long, the step is too big; split it. Show exactly where it goes (which
   function, replacing which lines) so the learner isn't hunting.

3. **Why it works.** A short explanation of *why* this code does the job — the mechanism,
   not a restatement of the code. This is where real understanding forms. Call out the
   subtle bits (closures capturing the right binding, why the cursor resets, why cleanup
   runs before re-run). Prefer explaining the why over piling on rules.

4. **Scope note (when relevant).** Explicitly name what this step *doesn't* handle and which
   later step picks it up. Deferring on purpose keeps each step honest and small, and keeps
   the learner from thinking they missed something.

End the suggestion by **offering** the next step, not barrelling into it: "Want me to lay
out Step N?" The user drives the pace.

## Always write the step into the steps doc

This skill always records the step in a **living plan/steps doc** so the project has a
durable trail of the methodology, not just chat scrollback. Mechanics:

- **Find or create the doc.** Look for an existing steps/stages doc for the current topic
  (e.g. `docs/stages/04-hooks-steps.md`, `PLAN.md`, `STEPS.md`). If none fits, create one
  that matches the project's docs layout and naming. A supplementary `NN-<topic>-steps.md`
  next to a stage doc is a good default when the project uses numbered stage docs.
- **Mirror the suggestion.** The doc entry contains the same crux / step plan / per-step
  (test → minimal code → why → scope note) you put in chat. The doc is the source of truth;
  chat is the conversation about it.
- **Status markers + provenance.** When a step is finished and validated, mark it done in
  the doc with a short blockquote noting the commit and test count, e.g.
  `> **Status:** done — committed in `abc1234` (18 tests green).` This turns the doc into a
  build log the learner can re-read later and see *how* it was built, which is the deliverable
  in a learning project.
- Keep the doc under control: one topic per doc, newest step appended at the bottom, the
  step plan near the top updated as steps complete.

## The per-step loop

Most sessions settle into this rhythm. Recognize where the user is and pick up there:

1. **Suggest** the next step (test → minimal code → why), in chat and appended to the doc.
2. **User implements** by hand. Wait for them.
3. **Validate** when they ask: read the files they changed, run the test suite, confirm the
   new test passes and nothing regressed. If a test fails, **diagnose** it — point at the
   root cause and explain it; don't silently fix their code. (A misread variable, an
   assignment-vs-comparison typo, an off-by-one in a cursor — name it and let them fix it.)
4. **Commit & push** only when they ask, following the repo's commit conventions (message
   style, any required trailer). Report the resulting commit hash.
5. **Record** the done-status in the doc (commit hash + test count), then **write the next
   step** into the doc when they ask for it. Back to 1.

Adapt freely — if they only want validation, just validate; if they only want the next step
written, just write it. The loop is a default, not a script.

## Reviewing the user's implementation

When validating, you're a careful reviewer, not a rubber stamp:

- Run the actual test suite; report real pass/fail counts, don't assert "looks good" without
  running it.
- Read the diff. Flag latent bugs even when tests pass (a missing `return`, a wrong DOM
  property, a closure capturing the live global instead of a saved binding). Explain the
  *why* of each flag.
- If you spot a small correctness issue that the current tests don't catch, mention it and
  offer a one-line fix — but let the user decide, and don't apply it to their source unless
  they say so.
- Confirm the new behavior is actually exercised (the new test ran and is green), not just
  that the suite is green overall.

## What makes this skill succeed

- The learner can write each step themselves and *knows why it works* afterward.
- Nothing in `src/` was written by you — only tests, the steps doc, and explanations.
- The steps doc reads, after the fact, as a clear build log of how the topic was built.
- Steps were small enough that no single one was "too big to understand by rewriting it."
