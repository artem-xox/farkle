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

- Loadout screen: six slots, dice chosen from a collection.
- Per-die distribution shown honestly in the UI.
- More dice specs, balanced by simulation rather than by feel.
- Opponents carry their own loadouts, visible before the match.

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
- Wildcard (Devil's Head) dice — until the mechanic is confirmed in-game;
  RULES.md §11.
- KCD1 combinations and tabletop rule variants — later, as an optional rule set.
