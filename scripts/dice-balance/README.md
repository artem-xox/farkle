# Dice balance scripts

Tools used to calibrate the dice roster against the balance band defined in
[docs/DESIGN.md §5](../../docs/DESIGN.md#the-balance-band): a special die
should win **57–63%** of matches when six of it play against six ordinary
dice, both sides run by the same bot. They're kept here rather than
regenerated each time a die gets added or retuned.

All of them import `@farkle/engine` and `@farkle/bots` by package name (not
`dist/` paths), so they always exercise exactly what the game ships. Build
first:

```bash
npm run build
```

## `roster-report.mjs`

The full balance table for every die currently in `DICE` — farkle rate at
6/3/2 dice, EV of a full throw, and simulated win rate with a 95% CI. This is
what the table in DESIGN.md §5 comes from. Auto-discovers the roster, so
adding a die to `packages/engine/src/dice.ts` is enough for it to show up
here; no need to edit this script.

```bash
node scripts/dice-balance/roster-report.mjs
node scripts/dice-balance/roster-report.mjs --matches 40000 --matches-single 20000  # defaults shown
```

A few minutes at the defaults (nine dice × 40k + 20k matches each).

## `sweep-candidates.mjs`

The workhorse for tuning a die that doesn't exist yet, or rebalancing one
that's outside the band. Edit the `CANDIDATES` array at the top with the
weight sets you're considering (a label, a `[w1..w6]` array, and an optional
1-indexed `wild` pip), then run it:

```bash
node scripts/dice-balance/sweep-candidates.mjs                # 10k matches/candidate, ~a few seconds each
node scripts/dice-balance/sweep-candidates.mjs --matches 40000  # confirm the winner at the report's precision
```

Workflow: sweep a handful of weight variants at 5k–10k matches to find the
neighbourhood that lands in-band, then re-run just the winner at 40k to get a
CI tight enough to trust, then move the weights into
`packages/engine/src/dice.ts` for real.

The shipped candidates are left in the array as a worked reference — replace
or add to them, they don't need to stay.

## `wildcard-audit.mjs`

Checks the two safety claims made about the wildcard dice (in
`packages/engine/src/dice.ts`'s comments and `packages/bots/test/odds.test.ts`)
against the *entire* roster rather than a few hand-picked companies of dice:

- `devil`'s wild sits on the `1`, so a throw with a devil die should never
  farkle *less* than the same throw with an ordinary die, in any company.
- `imp`'s wild sits on the dead `6`, so it should occasionally farkle *more*
  than ordinary alone but *less* once enough imps are together to complete
  triples out of their own wildcards.

Useful whenever a new wildcard-bearing die is added — run it and see whether
the intended safety story actually holds before writing the doc comment that
claims it does.

```bash
node scripts/dice-balance/wildcard-audit.mjs
```

## `tier-report.mjs`

`roster-report.mjs` narrowed to just the win6 leaderboard for the special
(non-`balanced`) dice, sorted strongest to weakest. Useful on its own when
the question is purely "which dice are ahead of which" rather than the full
farkle/EV breakdown.

```bash
node scripts/dice-balance/tier-report.mjs
node scripts/dice-balance/tier-report.mjs --matches 40000  # default shown
```

It deliberately doesn't auto-assign gold/silver/bronze tiers — see the
script's header comment for why a fixed gap threshold would be brittle. Treat
a gap as a tier boundary only when the 95% CIs on either side of it don't
overlap.

## `loadout-lab.mjs`

Everything above measures **pure** loadouts — six copies of one die. This
script tests **mixed** loadouts: dilution curves for the "set" dice
(`trinity`, `imp`) that punish being spread thin, hand-picked mixed builds,
and a head-to-head round robin among the strongest candidates (playing each
other directly, not just against six `balanced` dice, since beating the same
baseline by different margins doesn't say who wins when two loadouts
actually meet).

```bash
node scripts/dice-balance/loadout-lab.mjs                # 10k matches/matchup, a few minutes
node scripts/dice-balance/loadout-lab.mjs --matches 40000 # confirm a close finding at the report's precision
```

Edit the `CANDIDATES` and `FINALIST_LABELS` arrays at the top to try
different loadouts — same worked-reference-not-fixed-list convention as
`sweep-candidates.mjs`'s `CANDIDATES`. Findings from a run of this script
belong in a dated file under
[`docs/researches`](../../docs/researches), not folded into DESIGN.md — see
that directory for the format.

## Why simulation, not just the analytical numbers

`analyticalMetrics` in `lib.mjs` gives exact farkle rate and EV by brute-force
enumeration — fast and exact, but it says nothing about how a whole match
plays out (turn-score decisions, hot dice, banking thresholds). `win6` comes
from `runSimulation` instead, which is what actually answers "is this die too
strong." A die can look fearsome analytically (`devil`'s 6.3% six-dice farkle
rate, worst in the roster) and still land mid-band once real turns are played
out, because farkle rate is only one input to a match's outcome.
