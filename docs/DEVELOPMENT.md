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

M0 through M3 are done, plus a round of web UI polish on top. The game is
playable end to end both from the terminal and in the browser — hot-seat human
vs human, or human vs a bot personality — with full KCD2 scoring, hot dice,
farkle, win detection. `farkle sim` runs headless bot-vs-bot matches from the
CLI.

M4 (deployment) has a plan on record — [PLAN.md](PLAN.md#m4--deployment-on-digitalocean),
moved up to sit right after M3 rather than at the end of the file. `apps/web`
now exists, so the one hard blocker it named is gone; what's left is CI, a
DigitalOcean App Platform app, `.do/app.yaml`, cache headers, and a domain —
see the plan for the full checklist.

Merged: #1 (M0), #2 (M1), #3 (M4 plan, filed as M8 before the renumber), #4
(Node 20 toolchain upgrade), #5 (docs sync), #6 (M2), #7 (M3). The web UI
polish pass is not yet merged.

## Layout

```
packages/
  engine/     the rules — pure, dependency-free, the only place scoring logic lives
  bots/       BotPolicy, ThresholdBot, presets, the bot-vs-bot match driver and sim harness
apps/
  cli/        terminal client — depends on @farkle/engine and @farkle/bots
  web/        React + Vite browser client — depends on the same two packages
docs/         RULES / DESIGN / PLAN / this file
```

`apps/cli` and `apps/web` don't know about each other. Both are thin shells
over `LocalHost`/`ClientView` from `@farkle/engine` and `BotPolicy` from
`@farkle/bots` — neither app computes a score or drives bot logic itself.

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

`chooseBotAction` is also what `apps/web` uses to drive a bot's seat one step
at a time in the browser — see below.

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

### `apps/web/src`

| File | What's in it |
|---|---|
| `main.tsx` | Mounts `<App>` |
| `App.tsx` | The Play / Rules tab shell, setup vs match screen, resuming a saved match from `localStorage` on load |
| `storage.ts` | `saveMatch`/`loadMatch`/`clearMatch` — `GameState` is already plain, JSON-safe data (DESIGN.md §1), so this is a thin, error-swallowing wrapper, not a serialisation layer |
| `presets.ts` | Preset display blurbs for the setup screen (`PRESET_DESCRIPTIONS`) |
| `setup/SetupScreen.tsx` | Name, bot personality or hot-seat friend, target score (1500 / 3000 / 8000) |
| `rules/RulesScreen.tsx` | The rules, written out for players rather than for implementers — the player-facing counterpart to RULES.md |
| `match/MatchScreen.tsx` | Owns the `LocalHost` for one match session, drives a bot seat via `chooseBotAction` on a timer, holds farkles on screen, persists on every change |
| `match/selection.ts` | `matchingKeepOption` — is the player's current die selection a legal keep? Compares by *face multiset*, not by the literal indices `legalKeeps` picked as its representative, since two dice showing the same value are interchangeable for scoring (see the comment in the file for why this matters, and why the *dispatched* action still uses the literal clicked indices) |
| `match/Board.tsx`, `Die.tsx` | The board and one die. Dice physically move between the board and the "set aside" rail when clicked, rather than just changing colour — see below |
| `match/KeepOptions.tsx` | Every legal keep as a clickable row. Clicking *selects* those dice; committing is a separate choice (keep & throw / keep & bank) |
| `match/FarkleNotice.tsx` | The farkle hold's panel — explanation plus a Continue button and its countdown |
| `match/pacing.ts` | `botThinkTime(phase)`, `TUMBLE_MS`, `FARKLE_PAUSE_MS` — the only place "how long things take" is defined |
| `match/logEntry.ts` | `buildLog` turns a flat `GameEvent[]` into per-turn blocks for display, plus `diceGlyphs` (⚀–⚅) |
| `match/describeCombo.ts` | Pure `Combo` → text |
| `match/Scoreboard.tsx`, `TurnLog.tsx`, `MatchOverOverlay.tsx` | The rest of the screen |
| `styles.css` | One stylesheet, no CSS-in-JS or modules — small enough not to need either |

The UI never scores a selection itself: `MatchScreen` reads `view.keeps`
(computed by the engine inside `viewOf`) and `matchingKeepOption` only compares
against it, per DESIGN.md §3's rule that the UI never computes a score by any
path other than asking the engine.

**Keeping dice is two clicks, not three.** The engine's turn goes
`AwaitingKeep` → `AwaitingBankOrThrow`, but the UI collapses that: "keep &
throw" and "keep & bank" each dispatch `Keep` and then the follow-up action
back to back (`keepThen` in `MatchScreen`). The middle phase still exists in
the engine and is still rendered as a fallback if a chain is ever interrupted
— it just isn't a screen the player has to walk through, since by the time
they have chosen a combination they have already decided what to do next.

**The farkle hold is presentation, not an engine phase.** A farkle resolves
inside one `reduce()` — the throw, the farkle and the handover all arrive in a
single event batch — so by the time the UI hears about it, play has already
moved on. `MatchScreen` captures the busted dice out of that batch and holds
them on the board (`FARKLE_PAUSE_MS`, or until "Continue"), and the bot effect
takes `farkleHold` as a dependency so the opponent doesn't play on underneath
a notice the player is still reading. Nothing about the underlying state is
paused or rewound.

**Bot pacing**, since it looks like it could be a `setInterval` loop but isn't:
`MatchScreen` has one `useEffect` keyed on `events` (which changes exactly once
per dispatched action). Each time it fires, if it's the bot's turn it schedules
*one* action after `botThinkTime(phase)` ms. Dispatching that action produces
new events, which reruns the effect, which schedules the next one. A whole bot
turn is a chain of these, not a loop — which is what makes each step
individually cancellable (see the cleanup function) if the component unmounts
mid-turn (e.g. "Quit to menu").

**The Play tab stays mounted while the Rules tab is open** (`hidden`, not
unmounted). `MatchScreen` owns the `LocalHost`, the event log and the bot's
timers, none of which survive an unmount — reading the rules mid-match must
not forfeit it.

`apps/web` doesn't have its own test directory yet. The pure helpers
(`selection.ts`, `logEntry.ts`, `describeCombo.ts`, `storage.ts`) are
straightforward candidates if they grow non-obvious logic; the interactive
parts were verified by hand in a browser rather than with component tests —
there's no testing-library set up in this repo yet.

### Root

- `package.json` — npm workspaces (`packages/*`, `apps/*`); scripts are `test`,
  `test:watch`, `typecheck`, `build`, `play`, `dev:web`.
- `tsconfig.json` — shared compiler options for **`packages/*` and `apps/cli`
  only**. `apps/web` has its own `tsconfig.json` (DOM lib, `jsx: react-jsx`,
  `moduleResolution: bundler`) because a browser app's compiler settings
  genuinely diverge from the Node-oriented rest of the repo — it's excluded
  from the root `include` list rather than shoehorned in. The path aliases
  `@farkle/engine` and `@farkle/bots` point straight at each package's
  `src/index.ts`, so typecheck and Vitest work against source without a build
  step. Each package's own `tsconfig.build.json` (and `apps/web/vite.config.ts`
  via `resolve.alias`) clears/redirects that so a real *build* resolves
  siblings the way a consumer actually would. Build order matters because of
  this: `engine` → `bots` → `cli`/`web`.
- `vitest.config.ts` — picks up `packages/*/test` and `apps/*/test`.
- `.claude/launch.json` — dev-server config so the web app can be opened in a
  preview pane by name (`farkle-web`); `.claude/settings.local.json` is
  machine-local tool permissions and is gitignored.

## Running things

```bash
npm install

npm test              # vitest run — everything, ~2s
npm run test:watch    # vitest, watch mode
npm run typecheck     # tsc across packages + apps/cli, then apps/web's own tsc

npm run build         # compiles engine, then bots, then cli, then web, to dist/
npm run play          # builds, then launches the interactive CLI
npm run dev:web       # launches the Vite dev server for the browser app
```

Playing the CLI directly, once built:

```bash
node apps/cli/dist/main.js --players "Alice,Bob" --target 2000
node apps/cli/dist/main.js --opponent aggressive         # play against a bot
node apps/cli/dist/main.js --seed 20260809                # replay a specific match exactly
node apps/cli/dist/main.js --help

node apps/cli/dist/main.js sim --a cautious --b aggressive -n 100000 --seed 42
node apps/cli/dist/main.js sim --help
```

During a CLI turn: type die positions to keep them (`1 4`), `?` to list every
legal keep with its point value, `t`/`b` to throw or bank, `q` to quit.

The web app needs no build step in dev — `npm run dev:web` and open the printed
`localhost` URL. Click dice to select them, or click a listed option to commit
it immediately; `Bank`/`Throw` appear once at least one die is kept.

## Deploying

`apps/web` ships as a static site on DigitalOcean App Platform. Plan and cost
model: [PLAN.md#m4](PLAN.md#m4--deployment-on-digitalocean).

**Names, since they don't all match.** The DigitalOcean app is called
**`farkle-game`**; its single component is called **`farkle`**; the GitHub repo
is `artem-xox/farkle`. `app_name` in the workflow must match the *app*
(`farkle-game`), and the `ingress` rule in the spec must match the *component*
(`farkle`). Getting either wrong fails at deploy time, not at review time.

- **`.do/app.yaml`** is the app spec, and it is kept byte-identical to what the
  dashboard's App Spec editor shows — one `static_sites` component, built with
  `npm ci && npm run build -w @farkle/web`, serving `apps/web/dist`, with
  `catchall_document: index.html` so client-side routes and page refreshes
  don't 404. Its `environment_slug: node-js` is load-bearing: left unset,
  DigitalOcean auto-detects a runtime from the repo and has picked an invalid
  `typescript:default` off the tsconfig files.
- **`.github/workflows/ci.yml`** has two jobs. `test` runs on every branch push:
  typecheck, the full test suite, and a build — this is the only thing that
  happens on a feature branch. `deploy` runs only on push to `main`, `needs:
  test`, so a red suite blocks that job entirely; it then calls
  `digitalocean/app_action/deploy@v2` against the `farkle-game` app, which reads
  `.do/app.yaml` from the checked-out commit and redeploys it.
- **`deploy_on_push: true`** means DigitalOcean *also* deploys off its own
  GitHub webhook. A push to `main` therefore produces two deployments: DO's,
  which starts immediately and is not gated on tests, and the workflow's, which
  runs after the suite passes. Setting it to `false` makes CI the only trigger
  and is the arrangement PLAN.md's M4 describes; it is `true` by choice, not by
  oversight.
- **Rolling back** a bad deploy: DigitalOcean dashboard → the `farkle-game` app
  → **Activity** tab → pick a previous successful deployment → **Rebuild and
  Deploy** (or **Revert to this deployment** if offered). This does not touch
  `main` — no `git revert` is required to get the site back, only to fix the
  branch itself.
- **Secrets this depends on**: a `DIGITALOCEAN_ACCESS_TOKEN` repository secret
  (Settings → Secrets and variables → Actions in GitHub), and the `farkle-game`
  app already existing in DigitalOcean (created once by hand in the dashboard —
  the action updates an app, it doesn't create the first one from scratch
  against a fresh GitHub authorization).
- **The component must be a Static Site, not a Web Service.** DigitalOcean sees
  a Node.js repo and defaults new components to Web Service, which then
  crash-loops with `determine start command: when there is no default process a
  command is required` — there is no process to start, and a Web Service also
  bills for containers a static site doesn't need. The type is changeable in
  place: app → Settings → the component → **Resource type** → Static Site.

## Toolchain

Node 20+, TypeScript 7, Vitest 4, React 19, Vite 8. Upgraded from the
Node-16-pinned versions M0 and M1 shipped with (#4) — if you find a stray
reference to Node 16 or to version pins in a comment, it's leftover from
before that upgrade and should be corrected on sight, not treated as current
guidance.

## Things worth knowing before touching the engine, the bots, or the UIs

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
  threaded in `GameState.rng`. This is what makes `replay()` exact, and is what
  makes `localStorage.setItem(key, JSON.stringify(state))` in `apps/web`
  correct with no custom serialisation. Not a style preference — see
  DESIGN.md §1.
- **Neither UI computes a score itself, and neither does a bot.** All three
  read `ClientView.keeps` (or, for the web app's manual-selection path,
  compare against it via `matchingKeepOption`) and act on what the engine
  already decided. A `BotPolicy` is never given `GameState` — only
  `ClientView`, the same projection a human seat gets (DESIGN.md §6).
- **Physically identical dice are not the same *index*.** Two dice showing a 1
  are interchangeable for scoring, but `legalKeeps` still has to pick one
  representative index per distinct face-multiset (dedup has to pick
  *something*). `apps/web`'s `matchingKeepOption` compares selections by face
  values for this reason, not by set-equality on indices — see the comment in
  `match/selection.ts`. It matters more than it looks: once dice can have
  different weights per physical die (M4), which literal die gets removed from
  play actually changes future throw odds, so the web app dispatches the
  user's *literal* clicked indices, not the matched option's representative
  ones, even though the two are interchangeable today.
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

## Next: M4, then M5

M4 is deployment — in progress; see [PLAN.md](PLAN.md#m4--deployment-on-digitalocean)
and the "Deploying" section above.

After that, M5 is loadouts and more dice. Plan is in
[PLAN.md](PLAN.md#m5--loadouts-and-more-dice): a six-slot loadout screen,
per-die distributions shown honestly in the UI, more dice specs balanced by
simulation, and opponents with their own visible loadouts. This is also when
the index-vs-face-value distinction noted above starts to matter functionally
rather than just in principle.
