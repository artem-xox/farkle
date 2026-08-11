# Plan

Milestones in dependency order. Each one ends with something that can be played
or measured, and none requires reworking an earlier one. Rules are specified in
[RULES.md](RULES.md); architecture in [DESIGN.md](DESIGN.md).

Priority is a good single-player game against bots. Multiplayer comes after that,
not alongside it.

## M0 — Engine core

The foundation, built headless with no UI of any kind.

- Project skeleton: monorepo, TypeScript config, Vitest.
- Core types: `Face`, `DieSpec`, `KeepOption`, `Combo`.
- Seeded PRNG living inside game state; weighted-bag dice sampler.
- Two dice: `balanced` and `weighted` (DESIGN.md §5).
- Scoring: `hasScoringDice`, `isLegalKeep`, `scoreKeep`, `legalKeeps`, with the
  memoised maximising partition search.
- Tests: exhaustive enumeration over all 46 656 six-dice throws, the RULES.md §9
  vectors as golden cases, a chi-square check on the dice sampler.

Done when the scorer is exhaustively verified and the rules document has no
statement without a corresponding test.

## M1 — Match state machine and CLI

- `GameState`, `GameAction`, `GameEvent`, and the `reduce` function.
- Turn flow: throw, keep, bank, farkle, hot dice, turn passing, win detection.
- `LocalHost` implementing `GameHost`.
- A terminal client: hot-seat play, dice rendered as text, keeps chosen by index.
- Replay: a seed plus an action log reproduces a match exactly.

Done when a full match is playable in the terminal and every rule has been
exercised by hand at least once.

## M2 — Bots and the simulation harness

- `BotPolicy` interface and the parameterised `ThresholdBot`.
- The five personality presets from DESIGN.md §6.
- `farkle sim` — headless matches between two personalities, reporting win rate
  with a confidence interval, average turn score, farkle rate, turns per match.
- Tuning pass: adjust preset parameters against measured results; drop or fix any
  preset that is strictly dominated.
- Play against a bot from the CLI.

Done when the personalities are measurably distinct and ordered by strength, and
`cautious` versus `aggressive` produces a result we can explain.

## M3 — Web UI

- React + Vite app talking to `LocalHost` through `GameHost`.
- The table: dice, selection by clicking, live score for the current selection,
  visible indication of which combinations were read.
- Illegal keeps blocked with an explanation rather than silently ignored.
- Turn score, banked totals, target, turn log.
- Dice animation driven by the engine's result — a tumble that lands on a face
  already decided.
- Bot opponent with a selectable personality; paced so its turn is watchable.
- State persisted across reloads.

Done when a full match against a bot is playable in the browser on desktop and
phone. ✅ Shipped in #7.

### M3.1 — Polish pass

Everything M3 asked for worked, but playing it turned up rough edges worth
fixing before building more on top:

- **A rules tab**, so the game explains itself instead of assuming the player
  already knows Farkle — and specifically that this variant does *not* score
  three pairs.
- **Farkles were invisible.** The engine resolves a farkle in one `reduce()`,
  so the busted dice were replaced in the same frame they appeared and the
  player just saw their score vanish. Now the dice stay on a red-lit board with
  an explanation until "Continue", or ten seconds, whichever comes first.
- **A real board.** Dice sit on a wooden surface, and clicking one physically
  moves it to a "set aside" rail rather than merely tinting it — which is what
  keeping a die actually is.
- **One fewer screen per keep.** "Keep & throw" / "Keep & bank" replace a bare
  "Keep" followed by a separate bank-or-throw prompt for a decision the player
  had already made.
- **A readable turn log**, grouped by turn, with dice as ⚀–⚅ glyphs and
  colour-coded badges — and reachable after the match ends rather than buried
  under the win overlay.
- **Target scores of 1500 / 3000 / 8000** rather than 500 / 2000 / 4000. 8000
  is exactly six 1s, so the longest match is still winnable in one throw.

## M4 — Deployment on DigitalOcean

Sequenced right after the web UI on purpose: it depends only on M3, and the
sooner a real URL exists, the sooner "play it" means clicking a link rather
than cloning a repo. Everything below assumes the v1 architecture — no server.

### What is actually being deployed

v1 is static files (DESIGN.md §3). The engine, the bots and the match state all
live in the browser; there is no API, no database, no accounts, no session. The
hosting question is therefore "where do we put a few dozen files behind a CDN",
not "what does the back end cost". Most of the usual deployment work — secrets,
migrations, backups, scaling — does not exist here.

### Traffic budget

Assumption for sizing: **100 visitors per month, 5 games each**. Games are free
in bandwidth terms — a match is local computation and makes no network calls
after load. So traffic is the first-load payload times the number of cold visits.

| Item | Estimate |
|---|---|
| JS — React + engine + app, gzipped | ~150 KB |
| CSS, fonts, icons | ~50 KB |
| HTML and the rest | ~10 KB |
| **Per cold load** | **~200–250 KB** |
| 100 visitors × ~1.5 loads, mostly cold | **~40 MB/month** |

Vite emits content-hashed filenames, so returning players re-download nothing but
`index.html`. Against the 1 GiB/month included allowance that leaves headroom of
roughly 4 000 cold loads — about 40× the assumed traffic.

### Choice: App Platform, static site component

DigitalOcean App Platform, one static-site app, built from GitHub on push to
`main`.

- The first three static-site apps are free; ours is the first.
- Automatic HTTPS, global CDN, deploy-on-push, deployment history and one-click
  rollback are included. Nothing to operate, no OS to patch, no certbot cron.
- 1 GiB/month outbound per app, then $0.02/GiB.
- Builds run on DO's builders; a Vite build of an app this size takes seconds.

### Cost

| Item | Per month |
|---|---|
| App Platform static site (free tier) | $0.00 |
| Outbound transfer (~40 MB of a 1 GiB allowance) | $0.00 |
| DNS hosting on DigitalOcean | $0.00 |
| TLS certificate (Let's Encrypt, automatic) | $0.00 |
| Domain registration — `.com` at an outside registrar, ~$12–15/year | ~$1.10 |
| **Total** | **~$1/month — the domain, and nothing else** |

Hosting stays $0 at ten times the assumed traffic. The first non-zero hosting
line appears at roughly 4 000 cold loads a month, and it is $0.02 per further
4 000. This is not a cost worth optimising; it is a cost worth ignoring.

### Alternatives, and what each is for

| Option | Cost | Verdict |
|---|---|---|
| App Platform static site | $0 | Chosen. Cheapest and least to operate. |
| Spaces + built-in CDN | $5/mo — 250 GiB storage, 1 TiB transfer | Pays for capacity we would need thousands of times our traffic to use. Becomes right if presentation work lands heavy assets: 3D dice, audio. |
| Droplet, 512 MB, nginx | $4/mo | Buys nothing for static files and costs the most attention: patching, cert renewal, a hand-written deploy. Justified only when M8 needs a process running. |
| Cloudflare Pages / Netlify free tier | $0 | Comparable, with far more generous bandwidth. Named here so that "we're on DigitalOcean" stays a decision rather than an assumption. |

### If M8 ever lands

Outside this budget, but worth having the number on record. A WebSocket server
for the same 100 players is one App Platform basic service ($5/mo, 1 vCPU,
512 MiB) or a $6 Droplet — matches live in memory and a hundred players a month
will not trouble either. Managed Postgres ($15/mo) is needed only once accounts
and persistent progression exist, which is M7 territory. So multiplayer moves
this site from ~$1 to ~$6–7/month, and to ~$22 with a database.

### What still has to be written

Blocking — required before a first deploy:

1. ~~**`apps/web` itself (M3).**~~ Done — `npm run build -w @farkle/web`
   emits `dist/` (~210 KB JS, ~66 KB gzipped) and is already wired into the
   root `build` script alongside the engine, bots and the CLI.
2. ~~**A live look at the production build.**~~ Done — `npm run preview -w
   @farkle/web` (also a named entry in `.claude/launch.json`) was served and
   played through: setup, throw, keep, bank, a bot turn and the turn log all
   behave as they do in dev, with a clean console. Dev and build have not
   diverged.
3. ~~**Node version.**~~ Done — `.node-version` and `engines.node` in the root
   `package.json` both pin `>=20`, matching what App Platform's buildpack and
   `.github/workflows/ci.yml`'s `setup-node` use.
4. ~~**`.do/app.yaml` committed to the repo.**~~ Done — one `static_sites`
   component, build command, `output_dir: apps/web/dist`,
   `catchall_document: index.html`, and an explicit
   `environment_slug: node-js`, without which DigitalOcean auto-detects an
   invalid `typescript:default` runtime off the tsconfig files and fails the
   deploy after an otherwise successful build. The file is kept identical to
   the spec the dashboard shows, so the two can't drift.

   `deploy_on_push` is now `false`: DigitalOcean no longer deploys off its own
   webhook, so CI is the sole trigger and nothing reaches the site without the
   suite passing first. It was `true` until then, which meant two deployments
   per push to `main`, the first of them ungated by tests.
5. ~~**Cache headers.**~~ Resolved as *nothing to do, and nothing we can do*.
   App Platform has no way to set custom response headers on a static site —
   the app spec covers CORS and edge caching on/off, not `Cache-Control` per
   path, and it is [a standing feature
   request](https://ideas.digitalocean.com/app-platform/p/static-site-headers-and-routing).
   What it serves by default is `public,max-age=10,s-maxage=86400` on
   everything: 10 seconds in the browser, 24 hours at the CDN edge, purged on
   deploy. That is the safe side of the trade for `index.html` — a new build
   reaches players within seconds — and merely wasteful for content-hashed
   assets, which revalidate more often than they need to but can never be
   served stale. Revisit only if the site ever sits behind something that can
   set headers.
6. **Domain.** Register it, point the nameservers at DigitalOcean DNS, attach it
   to the app, wait for the certificate. Deferred deliberately — the game lives
   at `farkle-game-frkhm.ondigitalocean.app` until then, which is also the
   absolute URL in the `og:` tags, so both change together.

Worth doing, not blocking:

7. ~~**A CI gate.**~~ Done — `.github/workflows/ci.yml` runs typecheck, tests
   and the build on every branch push; on `main` a second job deploys via
   `digitalocean/app_action`, gated on the test job succeeding first.
8. ~~**Static-site basics.**~~ Done — a descriptive `<title>`, a description,
   `theme-color`, an SVG favicon and an `apple-touch-icon`, `robots.txt`, and
   OG/Twitter tags pointing at a 1200×630 card (`apps/web/public/og.jpg`,
   generated from `apps/web/branding/og.svg`). A shared link now previews as
   the game rather than as a bare URL.
9. ~~**Security headers**~~ — as far as a static site can carry them. Same
   constraint as item 5: no custom response headers, so the policy travels in
   the document as a `<meta http-equiv="Content-Security-Policy">`. It is
   strict (`default-src 'self'`, no `unsafe-inline` anywhere) and the app
   passes it unchanged, because Vite emits no inline script for this build and
   the UI uses no inline `style` attributes — worth remembering before adding
   either. `Referrer-Policy` ships as `<meta name="referrer">`.
   `X-Content-Type-Options` and `frame-ancestors` have no meta equivalent and
   are simply absent until something upstream can set headers.
10. **Analytics**, if we want to know whether it really is 100 visitors.
    Cloudflare Web Analytics or hosted Plausible — no cookies, so no consent
    banner. Self-hosting Plausible would cost several times the site itself.
    Still open, and it needs an account rather than a code change: whichever is
    picked, its beacon host must be added to the CSP in `index.html`, which
    currently allows scripts from `'self'` only.
11. **Error reporting.** Sentry's free tier, or nothing. An engine that throws
    in someone's browser is otherwise invisible to us — still true, and still
    open on the reporting side, since a DSN means an account.

    What did land is the half that needs no service: an `ErrorBoundary` around
    the app. Before it, anything thrown during render unmounted the tree and
    left a blank page — indistinguishable from a failed deploy, with no way
    out. Now the player gets an explanation, the error message, a reload, and a
    "discard the saved match" escape hatch for the case where a stored
    `GameState` is what poisons the render. Wiring a DSN in later is a change
    to one component plus a CSP entry.
12. ~~**A deploy section in DEVELOPMENT.md**~~ Done — see "Deploying" there.

Deliberately absent, and staying absent while v1 is static: environment
variables and secrets (there are no keys), a database (state is `localStorage`,
M3), backups (no server-side state exists to lose), and any scaling plan (a CDN
serves identical files to any number of players).

Done when a push to `main` publishes the game on its own domain over HTTPS
within minutes, a bad build can be rolled back from the DigitalOcean console,
and the monthly bill is the domain.

Where that stands: everything above is done except the domain (6) and the two
items that need an account rather than a commit (10, 11). A push to `main`
publishes the game within minutes, gated on the test suite, at
<https://farkle-game-frkhm.ondigitalocean.app/>; rollback from the console
works; the bill is $0 until a domain is registered.

## M5 — Loadouts and more dice

- ~~**Wildcard dice as a first-class engine concept.**~~ Done — `Face` =
  `Pip | Wild`; `scoreKeep` resolves a wildcard to whichever pip maximises the
  keep, barred from completing a `Single` on its own (RULES.md §4a).
  Exhaustively tested against an independent brute-force oracle. #13, #14.
- ~~**More dice specs, balanced by simulation rather than by feel.**~~ Done —
  nine dice ship (DESIGN.md §5), and their weights are now measured rather
  than reasoned. The metric is a die's win rate as a full loadout against six
  ordinary dice with the same bot on both sides, and the band is 57–63%; the
  first pass at `weighted` (`[10,1,1,1,1,1]`) measured 97.7% and `devil` 80.6%,
  so both were retuned. `imp` / `trader` / `trinity` / `worn` were added to
  fill out the shape space the band leaves open.
- ~~**`farkle sim` takes a loadout.**~~ Done — `--loadout-a` / `--loadout-b`
  accept one die id (all six slots) or six comma-separated ones, which is how
  the numbers in DESIGN.md §5 are reproduced.
- ~~**`legalKeeps` dedupes by die identity, not just face value.**~~ Done —
  two keeps worth the same points can still be different choices if they
  leave different dice behind; `KeepOption.diceLeftSpecs` carries this
  through to bots and the UI. Not originally itemised here, but was most of
  the engine work this milestone actually needed.
- ~~**Bots price risk per die, not per die count.**~~ Done —
  `ThresholdBot`'s keep ranking and its dice-count floor are both scaled by
  `safetyRatio` (DESIGN.md §6), falling back to the exact pre-M5 formula on
  an all-balanced loadout (verified, not just assumed).
- ~~**Loadout screen: six slots, dice chosen from a collection.**~~ Done — its
  own step after match setup, tap-to-fill rather than six dropdowns
  (`apps/web/src/setup/LoadoutStep.tsx`, `LoadoutPicker.tsx`).
- ~~**Per-die distribution shown honestly in the UI.**~~ Done — moved off
  Rules onto its own "Dice" tab (`apps/web/src/dice/DiceScreen.tsx`) so it
  reads as reference material rather than one more rule to get through.
- ~~**Opponents carry their own loadouts, visible before the match.**~~ Done
  for what v1's bots support: a bot's loadout defaults to six balanced dice
  and is shown read-only next to the player's own picker. Bots do not yet
  *own* a persistent collection to choose from — that's M7 (opponents with
  names, loadouts and personalities as identity, not a per-match default).

**What's left:** nothing blocking. The calibration pass only measured dice
against the `balanced` preset — a die that is a sidegrade for a middling bot
could still be lopsided for a `cautious` or `reckless` one, and re-running the
band across personalities is cheap now that the flag exists. Ideas for dice
that need more than weights and a wild face are recorded in DESIGN.md §5
("Directions for later dice") rather than scheduled here.

### M5.1 — Setup screen pass

The first screen was a correct form and nothing more: it asked four questions
and answered none. This pass keeps the questions and fixes what surrounded
them.

- **The personality dropdown truncated on a phone.** Each option read
  `Balanced — A sensible, well-rounded player`, which a native `<select>` has
  no room for — the screenshot that prompted this showed `well-rounded playe`.
  The blurbs are gone rather than shortened; one word per option is what the
  control can actually render. An icon per playstyle is the intended
  replacement, and is not built yet.
- **The name field was pre-filled with `You` as a *value*,** so typing your own
  name meant clearing someone else's first. It is a placeholder now; the
  existing fallback on submit already covered the empty case.
- **Setup answers are remembered** (`farkle:setup:v1`) — name, opponent,
  personality and target. Unlike the stored match, these are validated field by
  field in `storage.ts`: nothing downstream would catch an unknown preset or a
  target that makes the match unwinnable, so anything that fails to check out is
  dropped and the screen's own default stands.
- **1500 / 3000 / 8000 now say how long they take.** The numbers are measured,
  not guessed: `farkle sim --a balanced --b balanced -n 20000 --seed 42
  --target <n>` reports 2.7 / 5.3 / 14.6 turns per side, shown rounded as
  "~3 / ~5 / ~15 turns each". Same principle as the dice table in DESIGN.md §5
  — a number on screen should be one we ran.
- **Dice on the dice game's front page.** Three of them, tumbling in on load and
  re-rolling when tapped, plus a sentence saying what Farkle is and a link into
  the Rules tab — the site has OG cards, so arriving without knowing the game is
  a real path.
- **Two bugs.** The loadout step labelled the opponent's dice `Friend's dice`
  literally, ignoring the name that had just been typed. And "Skip" always
  substituted a fresh ordinary loadout, so "Choose dice → pick → Back → Skip"
  discarded the picks silently; it now starts with whatever is in the slots and
  says so.
- **Segmented controls are radiogroups.** They were rows of plain buttons, which
  a screen reader announces as unrelated controls rather than one choice out of
  a set. `aria-current` on the tabs was passing a boolean instead of `page`.

Deliberately not done here: a match history and a win/loss record on this
screen. Built in M5.3 below.

### M5.2 — Loadout presets on the setup screen

The other half of what M5.1 left open, and option 3 from
[the loadout redesign note](notes/loadout-screen-redesign.md) — deferred there
as "the natural next step", built here.

The setup screen offered "Choose dice" as its primary button and "Skip — play
with ordinary dice" as an underlined afterthought: the fast path came second,
and neither told a player what the dice were *for*. Now a "Your dice" row names
three measured loadouts, with a fourth "Custom" card that opens the existing
picker. One primary action, "Start match".

- **The presets are pure — `balanced`, `worn`, `devil` — and that is a finding,
  not a shortcut.** The mixed-loadout research §6 measured every hand-built mix
  as worse than the pure loadouts, `kitchen-sink` (one of each) worst of all.
  `worn` and `devil` sit within half a point of each other on win rate (61.8%
  vs 61.2%) at opposite ends of the roster on opening-throw risk, which is the
  balance band doing what it exists for: same strength, opposite texture.
- **Each card shows two numbers, because either alone misleads.** The first cut
  showed only `farkle6`, making `devil` look ten times deadlier than `worn`
  (6.3% vs 0.6%). Per *turn* the ranking inverts — `devil` loses 12% of turns,
  `worn` 19%, ordinary 29% — because the wildcard rescues throws with one or two
  dice left, which is where turns actually die. The turn numbers are from
  `farkle sim --a balanced --b balanced --loadout-a <die> --loadout-b <die>
  -n 20000 --seed 7 --target 3000`.
- **The bot can mirror the player's loadout, and does by default.** Six `worn`
  or six `devil` beat six ordinary dice about 61% of the time, so without this
  every preset would have been a difficulty cut handed out by accident.
  Mirrored, the same sim reads 50.5% / 50.8% — an even match, which is what the
  checkbox claims. Turning it off is how a player asks for the edge, and the
  hint under the checkbox says so.
- `LoadoutStep` is untouched apart from taking its opponent note as a prop:
  the sticky rack and tier catalog from #18 are the Custom path, not something
  this replaces.

Still open: bots that own a collection rather than borrowing the player's
(M7), and preset loadouts built from two Gold-tier dice, which the research
lists as untested.

### M5.3 — A record worth coming back for

The last thing M5.1 left open. Finished matches are kept in
`farkle:history:v1` and reduced to one line on the setup screen:
`3–3 against bots · 2–1 vs Balanced · best turn 1250`.

- **The head-to-head follows the personality dropdown**, which is most of the
  point. M5.1 stripped the descriptions out of that control because a native
  `<select>` truncated them; this gives it meaning back without any prose.
  "Aggressive" is a word — "0–2 vs Aggressive" is an opponent.
- **The record replaces the pitch rather than joining it.** Someone who has
  played a dozen matches does not need Farkle explained, and someone who has
  played none has no record to show, so the same slot serves both audiences and
  the screen doesn't grow a line for whichever is currently irrelevant.
- **Nothing shows until three bot matches exist.** Greeting a new player with
  "0–1 against bots" is worse than saying nothing; the line is meant to be a
  reason to come back.
- **Only finished matches count.** Quitting discards the match (see the fix in
  the same change), and a walked-away-from game is not a result either way.
  Pass & play is stored but kept out of the "against bots" tally — two humans
  on one device produce a result, but not one that says anything about the
  player. It still counts toward the personal best, which is a personal best.
- **Best turn is persisted with the match, not just accumulated.** It is built
  from the event stream and events are not saved, so without carrying it in
  `StoredMatch` a resumed match would silently restart the count.
- The summarising logic lives in `setup/record.ts`, deliberately free of React
  so it is covered by real unit tests (`apps/web/test/record.test.ts` — the
  first tests in `apps/web`, which the root Vitest `include` already matched).

Deliberately absent: a detail view of past matches. The loop is the point; a
list is a screen, and M7 is where opponents and progression get one.

### M5.4 — UI pass over setup and the table

Seven fixes from playing on a phone. Nothing here changes a rule or a number;
it is all about what the screens make easy to see.

- **The setup screen is down to two loadout cards**, Ordinary and Custom.
  `worn` and `devil` shipped as "Steady" and "Devil's luck" in M5.2 and
  measured well, but four cards pushed the screen past two phone screens for a
  decision most players make once. The dice are untouched and all nine are one
  tap away in Custom.
- **A custom loadout is remembered** (`customLoadout` in `farkle:setup:v1`,
  stored as die ids so a reweighted die reaches a saved build instead of
  resurrecting old numbers). Opening Custom no longer re-seeds the picker from
  the showing preset either — with Ordinary as the only other card, that would
  have wiped the build the player came back for.
- **The scoreboard splits the players around the goal** instead of packing all
  three facts left, and each side now says how much it still needs. Safe to
  assume exactly two seats: `NewMatchOptions.players` is a two-tuple.
- **"Click dice to set them aside" is gone.** It was permanent furniture
  explaining a board that explains itself, and it pushed the actions down every
  phone screen. The status line now speaks only once dice are selected.
- **The turn log is a labelled, sunken section.** This was the real problem
  behind "they blur together": the log had *no heading at all*, so its
  dice-glyph rows read as a continuation of the dice-glyph rows under "Scoring
  combinations". The two now differ on every axis — the choices are raised,
  gold-labelled and interactive; the log is recessed, dim-labelled, headed
  "Match log", separated by a rule and 38px of air, and each turn carries a
  gold rail so the rhythm reads as a timeline rather than a list.
- **"Start again"** sits beside "Quit to menu" and deals the same match on a
  fresh seed. It needs no new plumbing: `MatchConfig` already carries the
  players with their loadouts and the target, so the current match is its own
  recipe.
- **Both of those confirm first**, since both throw a match away — the
  follow-up flagged when quitting became destructive in M5.3. Focus lands on
  "Keep playing", and Escape or a backdrop click cancels. The dialog is skipped
  when there is nothing to lose: a finished match, or one nobody has thrown in
  yet.

## M6 — Optimal play and hints

Deferred until a prototype exists. Kept here so the shape is on record.

Optimal Farkle play is computable rather than heuristic. The state
`(own banked score, opponent banked score, turn score, dice in play)` is small
enough to solve by value iteration — on the order of a few hundred thousand
states at the default target with a 50-point grid — giving the exact
throw-or-bank decision and the exact value of every keep.

What that unlocks: an opponent that plays correctly instead of plausibly,
especially in endgames where the right move is to keep throwing far past any
sensible threshold; a hint overlay showing the player what optimal play would do
and what their choice cost; and a yardstick that converts every personality's
strength into a number.

Two complications to expect. The solution depends on the dice loadout, so it must
be recomputed or memoised per loadout rather than shipped as one table. And it
must run off the main thread.

## M7 — Meta-game

Opponents with names, loadouts and personalities; wagers and a purse; dice won
and collected; progression through increasingly strong opponents; saves.

## M8 — Online multiplayer

A server owning the engine and treating client actions as untrusted, `RemoteHost`
on the client, matchmaking, reconnection, spectating. The `GameHost` seam from
M1 is what makes this an addition rather than a rewrite.

## Out of scope

- Badges and equipment modifiers from the source game — deliberately excluded.
- KCD1 combinations and tabletop rule variants — later, as an optional rule set.
