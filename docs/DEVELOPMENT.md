# Development

A map of the repository: what's where, how it fits together, how to run it, and
where things currently stand. Rules are in [RULES.md](RULES.md), architecture
decisions in [DESIGN.md](DESIGN.md), milestones in [PLAN.md](PLAN.md).

**This file is kept up to date as work lands.** If you land a milestone, add a
package, or change how something is run, update the relevant section here in
the same session — don't let it drift.

## Status

M0 and M1 are done. The game is playable end to end from the terminal:
hot-seat, human vs human, full KCD2 scoring, hot dice, farkle, win detection,
seeded replay. No bots yet, no browser UI yet.

Open branch: `m1-match-and-cli`, not yet merged.

## Layout

```
packages/
  engine/     the rules — pure, dependency-free, the only place scoring logic lives
apps/
  cli/        terminal client — depends on @farkle/engine, nothing depends on it
docs/         RULES / DESIGN / PLAN / this file
```

`apps/web` doesn't exist yet — it's M3. When it lands, it depends on
`@farkle/engine` exactly the way `apps/cli` does, and on nothing else in this
repo; the two apps don't know about each other.

### `packages/engine/src`

| File | What's in it |
|---|---|
| `types.ts` | `Face`, `Combo`, `KeepOption`, `Counts` — no logic |
| `rng.ts` | Seeded PRNG (mulberry32) as pure state transitions: `(state) → (value, nextState)` |
| `dice.ts` | `DieSpec` (integer weight per face), `rollDie`/`rollDice`, the two shipped dice (`BALANCED_DIE`, `WEIGHTED_DIE`) |
| `scoring.ts` | The hard part. `scoreKeep` finds the maximum-value full-cover partition of a set of dice by memoised search; `legalKeeps` enumerates every legal subset of a throw; `hasScoringDice` is the farkle check |
| `match.ts` | The turn/match state machine: `GameState`, `GameAction`, `reduce()`. Pure — `reduce(state, action) → { state, events }`, no I/O |
| `host.ts` | `GameHost` interface and `LocalHost`, its in-process implementation; `ClientView`, the per-player projection of `GameState` |
| `index.ts` | The public API. If it's not re-exported here, apps can't import it — that's deliberate |

Read them in that order; each one builds on the last.

### `packages/engine/test`

- `rng.test.ts`, `dice.test.ts` — determinism and chi-square checks against
  declared weights.
- `scoring.test.ts` — the important one. Checked against an **independent
  oracle** (`test/helpers/reference.ts`, a naive scorer that brute-forces every
  set partition and shares no code with `scoring.ts`) across all 923 multisets
  of one to six dice, plus an exhaustive pass over all 46 656 six-dice throws.
- `match.test.ts` — turn flow, farkle, hot dice, banking, win detection,
  illegal-action rejection, and `replay()` determinism.
- `host.test.ts` — `ClientView` projection and `LocalHost` dispatch/subscribe.
- `test/helpers/fixed-dice.ts` — dice that always roll one face, so a test can
  ask for an exact throw (`loadout('223344')`) instead of hunting for a seed
  that happens to produce one.

### `apps/cli/src`

| File | What's in it |
|---|---|
| `main.ts` | Entry point: arg parsing, the game loop, wiring `LocalHost` events to the terminal |
| `prompt.ts` | `Prompt` — a line-reader over `readline`. Not a thin wrapper: see the comment at the top of the file for why it keeps its own line queue rather than calling `readline.question()` in a loop |
| `render.ts` | Pure formatting functions (dice as boxes, keep options as a table, colour). No I/O, so these are unit-testable without a terminal |

`apps/cli/test/prompt.test.ts` exists because `Prompt` had a real bug during
development — see below.

### Root

- `package.json` — npm workspaces (`packages/*`, `apps/*`); scripts are `test`,
  `test:watch`, `typecheck`, `build`, `play`.
- `tsconfig.json` — shared compiler options; each package extends it via its own
  `tsconfig.build.json`. The path alias `@farkle/engine` points straight at
  `packages/engine/src/index.ts`, so typecheck and Vitest work against source
  without a build step.
- `vitest.config.ts` — picks up `packages/*/test` and `apps/*/test`.

## Running things

```bash
npm install

npm test              # vitest run — everything, ~1.3s
npm run test:watch    # vitest, watch mode
npm run typecheck     # tsc --noEmit across the whole workspace

npm run build         # compiles @farkle/engine then @farkle/cli to dist/
npm run play          # builds, then launches the CLI
```

Playing directly, once built:

```bash
node apps/cli/dist/main.js --players "Alice,Bob" --target 2000
node apps/cli/dist/main.js --seed 20260809   # replay a specific match exactly
node apps/cli/dist/main.js --help
```

During a turn: type die positions to keep them (`1 4`), `?` to list every legal
keep with its point value, `t`/`b` to throw or bank, `q` to quit.

## Things worth knowing before touching the engine

- **Scoring must stay provably maximal.** `scoreKeep` exists because greedy
  partitioning is wrong (`1-2-3-4-5-5` is 550, not 200 — see RULES.md §5). Any
  change to `scoring.ts` should be re-verified against the reference oracle in
  `test/helpers/reference.ts`, not just against the golden vectors.
- **Three pairs do not score in this variant**, unlike KCD1 and most tabletop
  Farkle. This is the least certain rule in the spec — see RULES.md §11 — and
  it's load-bearing: the exhaustive test pins the six-dice farkle count at 1440
  specifically because three-pair hands don't score. If that assumption is ever
  confirmed wrong, that test is where it will announce itself.
- **`GameState` is plain data, `reduce` is pure.** No `Date.now()`, no direct
  `Math.random()` — randomness only ever advances through the `RngState`
  threaded in `GameState.rng`. This is what makes `replay()` exact and is a
  hard requirement, not a style preference (see DESIGN.md §1).
- **The CLI never computes a score itself.** It reads `ClientView.keeps` and
  displays what the engine already decided. If a change makes the CLI compute
  or duplicate scoring logic, that's a sign the `ClientView` projection is
  missing something, not a shortcut to take.
- **`Prompt` had a real concurrency bug worth knowing about**: calling
  `readline.question()` in an await-loop drops input lines that arrive in the
  same chunk as an earlier one (a multi-line paste, or any piped/redirected
  input) — the second line is emitted as a plain `'line'` event before the code
  gets a chance to register the next one-shot listener. Human typing is paced
  enough that this never shows up interactively, which is why it's easy to miss.
  Fixed by keeping one permanent listener and a queue; see the comment at the
  top of `prompt.ts`. Worth remembering if `Prompt` is ever rewritten.

## Next: M2

Bots and the simulation harness (`packages/bots`, `farkle sim` in the CLI).
Plan is in [PLAN.md](PLAN.md#m2--bots-and-the-simulation-harness).
