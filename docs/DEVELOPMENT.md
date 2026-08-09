# Development

A map of the repository: what's where, how it fits together, how to run it, and
where things currently stand. Rules are in [RULES.md](RULES.md), architecture
decisions in [DESIGN.md](DESIGN.md), milestones in [PLAN.md](PLAN.md).

**This file is kept up to date as work lands.** If you land a milestone, add a
package, or change how something is run, update the relevant section here in
the same session — don't let it drift. If you pick up a session and this file
looks stale (branches merged that it doesn't mention, a toolchain change it
doesn't reflect), fix it before adding more to it.

## Status

M0, M1 and M2 are done. The game is playable end to end from the terminal —
hot-seat human vs human, or human vs a bot (`--opponent <preset>`) — with full
KCD2 scoring, hot dice, farkle, win detection, seeded replay. Headless
bot-vs-bot simulation is available via `farkle sim`. No browser UI yet — that's
M3.

M8 (deployment) has a plan on record — [PLAN.md](PLAN.md#m8--deployment-on-digitalocean) —
but nothing to deploy until `apps/web` exists.

Merged: #1 (M0), #2 (M1), #3 (M8 plan), #4 (Node 20 toolchain upgrade), #5
(docs sync). M2 (this work) not yet merged.

## Layout

```
packages/
  engine/     the rules — pure, dependency-free, the only place scoring logic lives
  bots/       BotPolicy, ThresholdBot, presets, the bot-vs-bot match driver and sim harness
apps/
  cli/        terminal client — depends on @farkle/engine and @farkle/bots
docs/         RULES / DESIGN / PLAN / this file
```

`apps/web` doesn't exist yet — it's M3. When it lands, it depends on
`@farkle/engine` and `@farkle/bots` the way `apps/cli` does, and on nothing
else in this repo.

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

### `packages/bots/src`

| File | What's in it |
|---|---|
| `policy.ts` | `BotPolicy` — `chooseKeep` and `decideAfterKeep`, both reading only `ClientView` |
| `threshold-bot.ts` | `BotParams` and `ThresholdBot`, the one policy implementation behind every personality (DESIGN.md §6) |
| `presets.ts` | The five named personalities as `BotParams` presets, plus `createPreset` |
| `play.ts` | `chooseBotAction` (one seat, one decision) and `playBotMatch` (drives a whole match with a bot in every seat) — both built on `reduce()`/`viewOf()` from the engine, nothing new |
| `analyze.ts` | `summarizeMatch` — tallies an event log into per-player banks/farkles/points, pure function of `GameEvent[]` |
| `stats.ts` | `wilsonInterval` — the confidence interval `runSimulation` reports win rate with |
| `simulate.ts` | `runSimulation` — runs N headless matches between two policies and aggregates win rate, farkle rate, points per bank, turns per match |
| `index.ts` | Public API |

### `packages/bots/test`

- `threshold-bot.test.ts` — `chooseKeep`'s ranking and mistake-rate behaviour,
  `decideAfterKeep`'s threshold/hot-dice/desperation/catch-up logic, built
  against a hand-built `ClientView` fixture (`test/helpers/fake-view.ts`) so
  the tests are about the arithmetic, not about driving a real match.
- `presets.test.ts`, `stats.test.ts`, `analyze.test.ts` — the smaller pieces in
  isolation, including a golden Wilson-interval reference value.
- `play.test.ts` — `playBotMatch` and `chooseBotAction` against real engine
  matches: determinism, illegal-action-free completion across many seeds, and
  a "does this even terminate" regression guard.
- `simulate.test.ts` — `runSimulation`'s aggregates are internally consistent,
  deterministic per seed, and actually detect a real gap between a strong and
  a deliberately bad policy (not just structurally valid output).

### `apps/cli/src`

| File | What's in it |
|---|---|
| `main.ts` | Entry point: arg parsing, the game loop, wiring `LocalHost` events to the terminal, and driving a bot's seat via `chooseBotAction` when `--opponent` is set |
| `sim.ts` | The `farkle sim` subcommand: its own arg parsing, calls `runSimulation`, prints the report |
| `prompt.ts` | `Prompt` — a line-reader over `readline`. Not a thin wrapper: see the comment at the top of the file for why it keeps its own line queue rather than calling `readline.question()` (or `readline/promises`) in a loop |
| `render.ts` | Pure formatting functions (dice as boxes, keep options as a table, sim reports, colour). No I/O, so these are unit-testable without a terminal |

`apps/cli/test/prompt.test.ts` exists because `Prompt` had a real bug during
development — see below.

### Root

- `package.json` — npm workspaces (`packages/*`, `apps/*`); scripts are `test`,
  `test:watch`, `typecheck`, `build`, `play`.
- `tsconfig.json` — shared compiler options; each package extends it via its own
  `tsconfig.build.json`. The path aliases `@farkle/engine` and `@farkle/bots`
  point straight at each package's `src/index.ts`, so typecheck and Vitest work
  against source without a build step. Each package's own
  `tsconfig.build.json` clears `paths` so its *build* resolves sibling packages
  via `node_modules` (the real built `dist/`) instead — matching what actually
  happens when the package is consumed. Build order matters because of this:
  `engine` → `bots` → `cli`.
- `vitest.config.ts` — picks up `packages/*/test` and `apps/*/test`.

## Running things

```bash
npm install

npm test              # vitest run — everything, ~2s
npm run test:watch    # vitest, watch mode
npm run typecheck     # tsc --noEmit across the whole workspace

npm run build         # compiles engine, then bots, then cli, to dist/
npm run play          # builds, then launches the interactive CLI
```

Playing directly, once built:

```bash
node apps/cli/dist/main.js --players "Alice,Bob" --target 2000
node apps/cli/dist/main.js --opponent aggressive         # play against a bot
node apps/cli/dist/main.js --seed 20260809                # replay a specific match exactly
node apps/cli/dist/main.js --help

node apps/cli/dist/main.js sim --a cautious --b aggressive -n 100000 --seed 42
node apps/cli/dist/main.js sim --help
```

During a turn: type die positions to keep them (`1 4`), `?` to list every legal
keep with its point value, `t`/`b` to throw or bank, `q` to quit.

## Toolchain

Node 20+, TypeScript 7, Vitest 4. Upgraded from the Node-16-pinned versions M0
and M1 shipped with (#4) — if you find a stray reference to Node 16 or to
version pins in a comment, it's leftover from before that upgrade and should be
corrected on sight, not treated as current guidance.

## Things worth knowing before touching the engine or the bots

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
- **The CLI never computes a score itself, and neither does a bot.** Both read
  `ClientView.keeps` and act on what the engine already decided. A `BotPolicy`
  is never given `GameState` — only `ClientView`, the same projection a human
  seat gets (DESIGN.md §6).
- **A simulation harness that always starts the same side first is measuring
  first-move advantage, not the personalities.** `runSimulation` alternates
  `startingPlayer` by match index (`match % 2`) for exactly this reason — an
  early round-robin tuning pass without it showed mirrored matchups (e.g.
  "cautious vs balanced" run as A-vs-B versus as B-vs-A) disagreeing by 10+
  percentage points, far outside sampling noise at 20,000 matches. If you ever
  see a sim result that seems too strong to be about the policy, check whether
  something is being held constant that shouldn't be.
- **`reckless`'s parameters were retuned once, empirically.** The first draft
  (very high `bankAt`, `hotDiceAlwaysThrow`, negative `diceValue`) farkled on
  ~84% of its turns and lost to all four other presets, including `novice` —
  strictly dominated, which is exactly what PLAN.md's M2 tuning pass exists to
  catch. Lowering `bankAt` from 1000 to 450 (see `presets.ts`) brought it in
  line with the field (~53% overall in a round-robin) without changing its
  character as the highest-variance preset. If personalities are retuned
  again, rerun a round-robin (with alternating starting player) rather than
  eyeballing head-to-head numbers — the whole field shifts together.
- **`Prompt` had a real concurrency bug worth knowing about**: calling
  `readline.question()` in an await-loop drops input lines that arrive in the
  same chunk as an earlier one (a multi-line paste, or any piped/redirected
  input) — the second line is emitted as a plain `'line'` event before the code
  gets a chance to register the next one-shot listener. Human typing is paced
  enough that this never shows up interactively, which is why it's easy to miss.
  Fixed by keeping one permanent listener and a queue; see the comment at the
  top of `prompt.ts`. Worth remembering if `Prompt` is ever rewritten.

## Next: M3

Web UI. Plan is in [PLAN.md](PLAN.md#m3--web-ui): a React + Vite app talking to
`LocalHost` through `GameHost`, dice you click to select, a bot opponent in the
browser using the same `@farkle/bots` package the CLI uses.
