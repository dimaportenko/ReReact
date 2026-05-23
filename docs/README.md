# ReReact docs

Living documentation for the build. Code shows *what* we built; these docs capture
*why*, *how it felt to build*, and *what we learned* — the actual point of the project.

## How these docs work

- **One doc per stage** in [`stages/`](stages/), numbered to match the roadmap in the root `README.md`.
- Stage docs are **living**: while building a stage, append to its **Build log** (dated, newest on top), record surprises in **Gotchas**, and flip its **Status**.
- Cross-cutting choices that outlive a single stage go in [`decisions.md`](decisions.md) with their rationale.
- Start a new stage doc by copying [`_template.md`](_template.md).

## Stage status

| # | Stage | Doc | Status |
|---|-------|-----|--------|
| 0 | Setup | [00-setup](stages/00-setup.md) | Not started |
| 1 | Runtime | [01-runtime](stages/01-runtime.md) | Not started |
| 2 | Static render | [02-static-render](stages/02-static-render.md) | Not started |
| 3 | Reconciliation | [03-reconciliation](stages/03-reconciliation.md) | Not started |
| 4 | Hooks | [04-hooks](stages/04-hooks.md) | Not started |
| 5 | Compiler | [05-compiler](stages/05-compiler.md) | Not started |

Keep this table in sync as stages progress.
