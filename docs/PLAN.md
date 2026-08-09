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
phone.

## M4 — Loadouts and more dice

- Loadout screen: six slots, dice chosen from a collection.
- Per-die distribution shown honestly in the UI.
- More dice specs, balanced by simulation rather than by feel.
- Opponents carry their own loadouts, visible before the match.

## M5 — Optimal play and hints

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

## M6 — Meta-game

Opponents with names, loadouts and personalities; wagers and a purse; dice won
and collected; progression through increasingly strong opponents; saves.

## M7 — Online multiplayer

A server owning the engine and treating client actions as untrusted, `RemoteHost`
on the client, matchmaking, reconnection, spectating. The `GameHost` seam from
M1 is what makes this an addition rather than a rewrite.

## Out of scope

- Badges and equipment modifiers from the source game — deliberately excluded.
- Wildcard (Devil's Head) dice — until the mechanic is confirmed in-game;
  RULES.md §11.
- KCD1 combinations and tabletop rule variants — later, as an optional rule set.
