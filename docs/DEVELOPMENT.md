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

M4 (deployment) is live: the game is served from
<https://farkle-game-frkhm.ondigitalocean.app/>, built and deployed by CI on
every push to `main`. That app is now called `farkle-dev` and is being joined by
`farkle-prod`, deployed by hand from Actions → *Deploy to production*. The DNS
record for `farkle.iamxox.space` is still to come, so until then prod answers
only on its own `ondigitalocean.app` hostname. What else remains of the
milestone is analytics and error reporting, which need an account somewhere
rather than a commit.
Cache and security headers turned out not to be a checklist item at all: App
Platform cannot set custom response headers on a static site, so the CSP and
referrer policy travel in `index.html` and the caching defaults stand. See
[PLAN.md](PLAN.md#m4--deployment-on-digitalocean) for the full checklist and
the "Deploying" section below for the operational details.

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
| `main.tsx` | Mounts `<App>` inside `<ErrorBoundary>` |
| `ErrorBoundary.tsx` | The last line of defence: turns a throw during render into a readable panel with a reload and a "discard the saved match" escape hatch, instead of a blank page. No error reporting service behind it (PLAN.md M4 item 11) — the console is the only record |
| `App.tsx` | The Play / Dice / Rules tab shell, setup vs match screen, resuming a saved match from `localStorage` on load — and `exitMatch`, which *discards* that save, since "Quit to menu" has to mean the match is over rather than parked |
| `storage.ts` | `saveMatch`/`loadMatch`/`clearMatch` for the match — `GameState` is already plain, JSON-safe data (DESIGN.md §1), so this is a thin, error-swallowing wrapper, not a serialisation layer — plus `saveSetupPrefs`/`loadSetupPrefs` and `recordMatch`/`loadHistory`, which unlike the match *are* validated, because nothing downstream would catch a bad value. History is a capped ring of finished matches, filtered row by row on read so one bad entry costs that entry rather than the whole record |
| `setup/record.ts` | `summarizeHistory` — the stored history reduced to what the screen shows. Kept free of React so it is unit-tested for real (`apps/web/test/record.test.ts`) rather than only exercised through the browser |
| `presets.ts` | `capitalize`, and a note on why the per-personality blurbs that used to live here are gone |
| `setup/SetupScreen.tsx` | Name, bot personality or hot-seat friend, target score (1500 / 3000 / 8000), and the loadout choice. Remembers all of it between matches |
| `setup/LoadoutChoice.tsx`, `loadoutPresets.ts` | The "Your dice" row: Ordinary, plus a Custom card that opens the picker and remembers the build. Both numbers on the card are copied static data with the same sync caveat as `dice/stats.ts` |
| `setup/LoadoutStep.tsx`, `LoadoutPicker.tsx` | The full picker behind Custom — sticky six-slot rack, tier-grouped card catalog. See [notes/loadout-screen-redesign.md](notes/loadout-screen-redesign.md) |
| `rules/RulesScreen.tsx` | The rules, written out for players rather than for implementers — the player-facing counterpart to RULES.md |
| `match/MatchScreen.tsx` | Owns the `LocalHost` for one match session, drives a bot seat via `chooseBotAction` on a timer, holds farkles on screen, persists on every change |
| `match/selection.ts` | `matchingKeepOption` — is the player's current die selection a legal keep? Compares by *face multiset*, not by the literal indices `legalKeeps` picked as its representative, since two dice showing the same value are interchangeable for scoring (see the comment in the file for why this matters, and why the *dispatched* action still uses the literal clicked indices) |
| `match/Board.tsx`, `Die.tsx` | The board and one die. Dice physically move between the board and the "set aside" rail when clicked, rather than just changing colour — see below |
| `match/KeepOptions.tsx` | Every legal keep as a clickable row. Clicking *selects* those dice; committing is a separate choice (keep & throw / keep & bank) |
| `match/FarkleNotice.tsx` | The farkle hold's panel — explanation plus a Continue button and its countdown |
| `match/ConfirmDialog.tsx` | The guard in front of "Quit to menu" and "Start again". Focus starts on the harmless answer; Escape and a backdrop click cancel |
| `match/Scoreboard.tsx` | The two players on opposite edges with the goal between them, each side showing what it still needs. Assumes exactly two seats, which `NewMatchOptions.players` guarantees as a two-tuple |
| `match/pacing.ts` | `botThinkTime(phase)`, `TUMBLE_MS`, `FARKLE_PAUSE_MS` — the only place "how long things take" is defined |
| `match/logEntry.ts` | `buildLog` turns a flat `GameEvent[]` into per-turn blocks for display, plus `diceGlyphs` (⚀–⚅) |
| `match/describeCombo.ts` | Pure `Combo` → text |
| `match/TurnLog.tsx` | The match log: turn blocks in a labelled, sunken well. The heading is load-bearing — without it the log read as a continuation of the scoring combinations above it |
| `match/MatchOverOverlay.tsx` | The win card |
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
- `.claude/launch.json` — server config so the web app can be opened in a
  preview pane by name: `farkle-web` (Vite dev, 5173) and `farkle-web-preview`
  (`vite preview` over `dist/`, 4173, for checking what actually deploys).
  `.claude/settings.local.json` is machine-local tool permissions and is
  gitignored.

## Running things

```bash
npm install

npm test              # vitest run — everything, ~2s
npm run test:watch    # vitest, watch mode
npm run typecheck     # tsc across packages + apps/cli, then apps/web's own tsc

npm run build         # compiles engine, then bots, then cli, then web, to dist/
npm run play          # builds, then launches the interactive CLI
npm run dev:web       # launches the Vite dev server for the browser app

npm run preview -w @farkle/web   # serves dist/ — what actually deploys
```

`preview` needs `npm run build` first; it serves the built output rather than
compiling on the fly, which is the only way to see the production bundle, the
real `index.html` (CSP included) and the `public/` assets behave together.

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

**Two apps, and the names don't all match.** `farkle-dev` deploys itself from
every green push to `main`; `farkle-prod` deploys only when somebody presses the
button. Both have a single component called **`farkle`**, and the GitHub repo is
`artem-xox/farkle`. `name` in a spec must match the *app*, and the `ingress`
rule must match the *component*. Getting either wrong fails at deploy time, not
at review time. `farkle-dev` was renamed from `farkle-game` and kept the
hostname it was born with, so `farkle-game-frkhm.ondigitalocean.app` is current,
not stale.

| | `farkle-dev` | `farkle-prod` |
|---|---|---|
| Spec | `.do/app.dev.yaml` | `.do/app.prod.yaml` |
| Workflow | `ci.yml` | `deploy-prod.yml` |
| Trigger | push to `main`, after tests | the button, plus an approval |
| Branch it builds | `main` | `main` |
| URL | `farkle-game-frkhm.ondigitalocean.app` | `farkle.iamxox.space` |
| Indexable | no | yes |

- **The two specs** are the same file bar name, branch, `envs` and the custom
  domain — one `static_sites` component, built with `npm ci && npm run build -w
  @farkle/web`, serving `apps/web/dist`, with `catchall_document: index.html` so
  client-side routes and page refreshes don't 404. `environment_slug: node-js`
  is load-bearing in both: left unset, DigitalOcean auto-detects a runtime from
  the repo and has picked an invalid `typescript:default` off the tsconfig
  files. Keep them in sync by hand; nothing enforces it.
- **`.github/workflows/ci.yml`** has two jobs. `test` runs on every branch push:
  typecheck, the full test suite, and a build — this is the only thing that
  happens on a feature branch. `deploy` runs only on push to `main`, `needs:
  test`, so a red suite blocks that job entirely; it then calls
  `digitalocean/app_action/deploy@v2` with
  `app_spec_location: .do/app.dev.yaml`, which applies the spec from the
  checked-out commit. **Only `farkle-dev` is reachable this way** — merging to
  `main` can never move prod.
- **`.github/workflows/deploy-prod.yml`** is the button: Actions → *Deploy to
  production* → **Run workflow**. It runs the full suite against `main`, applies
  `.do/app.prod.yaml`, then fetches the app's own live URL from the action's
  `app` output and checks the page actually answers — the action reports success
  when DigitalOcean calls the deployment ACTIVE, which is not the same thing.
  It also queues rather than cancels on a second run, since a half-applied spec
  is worse than a wait.
- **Both apps build `main`, and prod deploys its tip.** An App Platform GitHub
  source names a *branch*, never a commit, and DigitalOcean resolves it when the
  build runs — the action even passes `UpdateAllSourceVersions: true`. So there
  is no such thing as deploying a chosen SHA here: pressing the button ships
  whatever `main` points at right then. That is also why `deploy-prod.yml`
  checks out `ref: main` explicitly instead of the dispatch ref — testing one
  commit while DigitalOcean builds another would make the suite meaningless.
  Rolling prod back means the dashboard, not the button.
- **What actually separates prod from dev** is two lines, and nothing else:
  `deploy_on_push: false` in the prod spec, so DigitalOcean's own webhook never
  fires, and the absence of any push trigger in `deploy-prod.yml`. Setting
  either wrong turns every merge to `main` into a production release.
- **`SITE_URL` and `SITE_INDEXABLE`** are build-time envs set per app in the
  spec. `apps/web/vite.config.ts` substitutes `SITE_URL` into the `%SITE_URL%`
  placeholders in `index.html` — `og:url`, `og:image` and `canonical`, all of
  which have to be absolute — and generates `robots.txt`, which is why there
  isn't one in `apps/web/public`. Both default to failing safe: unset
  `SITE_URL` means the production origin, unset `SITE_INDEXABLE` means
  `Disallow: /`. The canonical tag matters because App Platform cannot redirect,
  so prod answers on its `ondigitalocean.app` hostname as well as its domain no
  matter what, and the tag is the only way to name the real one.
- **`app_spec_location`, never `app_name`.** The two inputs are mutually
  exclusive and they deploy opposite things: given `app_name`, the action
  fetches the spec from the *live app* and — in its own words — "a potential
  in-repository app spec is ignored". The workflow was written that way until
  Aug 2026, so nothing in the spec had ever been applied and the file was
  documentation rather than configuration. Which app gets deployed now comes
  from the spec's own `name` field; if no app by that name exists, the action
  creates one.
- **`deploy_on_push: false`** is deliberate and load-bearing. Set to `true`,
  DigitalOcean *also* deploys off its own GitHub webhook, so a push to `main`
  produces two deployments: DO's, which starts immediately and is not gated on
  tests, and the workflow's, which runs after the suite passes. With it off,
  CI is the only path to production. This is exactly what the `app_name` bug
  above masked: the live app kept `deploy_on_push: true` and every push to
  `main` deployed twice, the first of them untested.
- **No custom response headers.** App Platform static sites can't set them —
  the spec offers CORS and an edge-cache toggle, nothing per-path. Two
  consequences. Caching is whatever DO serves by default,
  `public,max-age=10,s-maxage=86400`, which is fine (`index.html` goes stale in
  10s; hashed assets can't go stale at all). And the security policy has to
  live in the document: `apps/web/index.html` carries a strict CSP as
  `<meta http-equiv>` plus `<meta name="referrer">`. The CSP allows no inline
  script or style, which the build currently satisfies — adding an inline
  `<script>`, or a React `style={{…}}` attribute, will break the page in
  production while dev looks fine. `X-Content-Type-Options` and
  `frame-ancestors` are unavailable via meta and are therefore absent.
- **Social preview.** `apps/web/public/og.jpg` is the 1200×630 card, generated
  from the checked-in source `apps/web/branding/og.svg` — regenerate with
  `sips -s format jpeg -s formatOptions 85 apps/web/branding/og.svg --out apps/web/public/og.jpg`.
  The `og:url` and `og:image` tags are absolute and resolve against `SITE_URL`,
  so each app advertises its own origin.
- **Rolling back** a bad deploy: DigitalOcean dashboard → the app → **Activity**
  tab → pick a previous successful deployment → **Rebuild and Deploy** (or
  **Revert to this deployment** if offered). This does not touch `main` — no
  `git revert` is required to get the site back, only to fix the branch itself.
  This is the only rollback prod has — the button always ships the tip of
  `main`, so getting an old build back means either the dashboard or a
  `git revert` on `main` followed by another dispatch.
- **The `production` GitHub environment** is what makes the button ask before it
  fires: Settings → Environments → `production` lists a required reviewer, and
  the dispatched run waits on that approval before its first step. Delete the
  environment and the workflow still runs — GitHub recreates a nameless one with
  no protection — so the gate is a repository setting, not something this
  repository can hold in a file.
- **Secrets this depends on**: a `DIGITALOCEAN_ACCESS_TOKEN` repository secret
  (Settings → Secrets and variables → Actions in GitHub). The app itself does
  *not* have to exist first — given `app_spec_location`, the action creates an
  app when it finds no match for the spec's `name`. That is a convenience and a
  hazard in equal measure: a typo in `name` silently creates a second app rather
  than failing, which is exactly what would have happened had `.do/app.dev.yaml`
  been merged still saying `farkle-game` after the rename.
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

## Next: M5

M4 is deployment, and everything in it that is a code change has landed; what's
left needs an account (a domain, analytics, error reporting) rather than a
commit. See [PLAN.md](PLAN.md#m4--deployment-on-digitalocean) and the
"Deploying" section above.

So next is M5 is loadouts and more dice. Plan is in
[PLAN.md](PLAN.md#m5--loadouts-and-more-dice): a six-slot loadout screen,
per-die distributions shown honestly in the UI, more dice specs balanced by
simulation, and opponents with their own visible loadouts. This is also when
the index-vs-face-value distinction noted above starts to matter functionally
rather than just in principle.
