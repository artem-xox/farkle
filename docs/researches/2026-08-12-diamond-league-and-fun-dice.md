# Research: a Diamond league, and five fun/joke dice

**Date:** 2026-08-12
**Engine commit:** `36d5e58` (dice.ts changes ship in the same change as this file)
**Bot preset:** `balanced` on both sides of every matchup below
**Tools:** `scripts/dice-balance/sweep-candidates.mjs`, `scripts/dice-balance/roster-report.mjs`, `scripts/dice-balance/tier-report.mjs`, `scripts/dice-balance/wildcard-audit.mjs` — all in this repo, all reproducible with the commands given in each section

## Question

The roster (docs/DESIGN.md §5) shipped nine dice in three informal leagues —
🥉 Bronze (`balanced`, `odd`), 🥈 Silver (`trinity`, `imp`), 🥇 Gold (`trader`,
`devil`, `weighted`, `worn`, `cheat`) — but nothing in the roster was
genuinely *stronger* than an ordinary die by more than about 12 points of
win6. This asks for five new dice and a rebalance, aimed at a new top league:

1. A 💎 Diamond league at 65–70% win6, above Gold's ceiling. `devil` moves up
   into it, retuned stronger; `king`, a new die with no wildcard, joins it.
2. Two Bronze jokes, `unlucky` (47–49%) and `even` (49–51%) — dice a player
   picks to make a match *harder* for themselves.
3. Two Silver dice, `twins` (a `trinity` analogue biased on `2` instead of
   `3`) and `unbalanced` (`balanced` with a directional noise), both landing
   in Silver's existing band.
4. Gold is untouched apart from losing `devil` to Diamond — it now has
   exactly the four dice (`trader`, `weighted`, `worn`, `cheat`) the brief
   asked it to keep.

## 1. Tuning each die

`sweep-candidates.mjs`'s workflow: try a handful of weight sets at 12k
matches to find the neighbourhood, then confirm the winner at 40k. Only the
final, shipped weights are reproduced below — see the script's `CANDIDATES`
array for the current worked example.

**`devil` (retune, Diamond).** The shipped `[1,3,3,3,3,3]` wild `1` measured
61.2% (docs/DESIGN.md §5's old table). Raising the wildcard's own weight
relative to the rest — `[1,2,2,2,2,2]`, wild still on `1` — raises how often
it comes up from 1-in-16 to 1-in-11 without changing anything else about the
die's identity, and lands at 68.2%.

**`king` (new, Diamond).** No wildcard: `[1,1,1,1,2,3]` stacks the roster's
two best faces, a cheap `5` single and a triple/straight-friendly `6`, on top
of each other. `5` and `6` together are already almost a third of the throw
at these weights (22.2% / 33.3%); heavier ratios (e.g. `[1,1,1,1,4,4]`,
76.3%) cleared the band, lighter ones (`[1,1,1,1,2,2]`, 59.6%) fell into
Silver — `[1,1,1,1,2,3]` was the neighbourhood that actually lands at 66.9%.

**`unlucky` (new, Bronze).** `1` and `5` shaved from 1/6 down to 12/76
(15.8%) each, the rest picking up the difference — 48.1%. The gap has to be
this subtle: a much wider one (e.g. halving `1`/`5`'s weight, `[2,3,3,3,2,3]`)
overshoots to the mid-40s.

**`even` (new, Bronze).** docs/DESIGN.md §5 already recorded that a strong
even-face bias (`[1,2,1,2,1,2]`) measures 42% — both scoring singles (`1`,
`5`) are odd, so leaning toward `2`/`4`/`6` pulls both at once and is a much
sharper penalty than `unlucky`'s. The brief wanted 49–51%, essentially
indistinguishable from `balanced`, so the bias had to be faint enough to
almost disappear: `[29,30,29,30,29,30]`, each even face 0.57pp likelier,
lands at 49.9%.

**`twins` (new, Silver).** `trinity`'s bet (`[1,1,4,1,1,1]`, `3` at 4/9 =
44.4%) moved to the `2` face and raised, since a `2`-of-a-kind pays 200
against `trinity`'s 300 — the cheaper combination needs a heavier bias to
land in the same league. `[3,19,3,3,3,3]` puts `2` at 19/34 = 55.9% and
measures 59.3%, between `trinity` (58.8%) and `imp` (59.9%).

**`unbalanced` (new, Silver).** Not a clean two-block split — every face
carries its own weight (`[5,4,5,3,2,2]`), but `1`/`2`/`3` average 3.67
against `4`/`5`/`6`'s 2.33. Early candidates with the imbalance concentrated
on one face (e.g. moving weight off `5` specifically, `[4,3,4,2,1,3]`) swung
win6 by 3-4pp for a 1-weight change — EV is far more sensitive to `1` and `5`
specifically than to `2`/`3`/`4`/`6`, so the final weights spread the bias
across all three faces on each side rather than loading it onto one. Lands
at 59.6%.

## 2. Roster snapshot

`npm run dice:roster` (40 000 matches for win6, 20 000 for win1; 95% CI ≈
±0.5pp). Sorted by win6, same as docs/DESIGN.md §5's table.

| die | weights | farkle6 | farkle3 | farkle2 | ev6 | ev3 | win6 | win6 CI95 | win1 | league |
|---|---|---|---|---|---|---|---|---|---|---|
| `unlucky` | `[12,13,13,13,12,13]` | 3.61% | 30.03% | 46.81% | 389 | 82.7 | 48.1 | [47.6,48.6] | 49.1 | 🥉 Bronze |
| `balanced` | `[1,1,1,1,1,1]` | 3.09% | 27.78% | 44.44% | 399 | 86.8 | 49.8 | [49.3,50.2] | 49.7 | 🥉 Bronze |
| `even` | `[29,30,29,30,29,30]` | 3.25% | 28.49% | 45.20% | 396 | 85.5 | 49.9 | [49.4,50.4] | 49.2 | 🥉 Bronze |
| `odd` | `[4,3,4,3,4,3]` | 1.91% | 22.16% | 38.32% | 431 | 98.5 | 56.7 | [56.2,57.2] | 51.2 | 🥉 Bronze |
| `trinity` | `[1,1,4,1,1,1]` | 2.86% | 37.86% | 60.49% | 470 | 79.4 | 58.8 | [58.4,59.3] | 47.0 | 🥈 Silver |
| `twins` | `[3,19,3,3,3,3]` | 1.70% | 38.19% | 67.82% | 461 | 76.2 | 59.3 | [58.8,59.8] | 44.5 | 🥈 Silver |
| `unbalanced` | `[5,4,5,3,2,2]` | 2.49% | 27.21% | 44.44% | 466 | 102.6 | 59.6 | [59.2,60.1] | 50.0 | 🥈 Silver |
| `imp` | `[2,7,7,7,2,2]`, wild `6` | 2.73% | 50.78% | 72.57% | 505 | 70.2 | 59.9 | [59.4,60.4] | 50.4 | 🥈 Silver |
| `trader` | `[1,1,1,1,2,1]` | 1.22% | 17.49% | 32.65% | 448 | 100.3 | 60.6 | [60.1,61.0] | 50.9 | 🥇 Gold |
| `weighted` | `[3,2,2,2,2,2]` | 1.91% | 21.85% | 37.87% | 473 | 107.6 | 61.3 | [60.8,61.8] | 51.8 | 🥇 Gold |
| `worn` | `[1,0,1,1,1,1]` | 0.58% | 19.20% | 36.00% | 467 | 108.8 | 61.8 | [61.3,62.2] | 52.7 | 🥇 Gold |
| `cheat` | `[2,2,2,2,2,5]` | 3.65% | 35.02% | 53.78% | 514 | 86.8 | 62.4 | [62.0,62.9] | 49.5 | 🥇 Gold |
| `king` | `[1,1,1,1,2,3]` | 1.69% | 25.51% | 44.44% | 543 | 94.9 | 66.9 | [66.4,67.3] | 50.2 | 💎 Diamond |
| `devil` | `[1,2,2,2,2,2]`, wild `1` | 5.20% | 46.88% | 66.94% | 584 | 65.1 | 68.2 | [67.8,68.7] | 52.6 | 💎 Diamond |

Every new/retuned die's `win1` (one copy among five `balanced`) sits close to
50 — an ordinary mixed pickup, not a trap or a giveaway — with one exception:
`twins` at 44.5%, confirming §3 below.

## 3. Strength tiers (win6)

`npm run dice:tiers`. The only two boundaries where this run's 95% CIs
actually fail to overlap are `odd`→`trinity` (2.1pp) and `cheat`→`king`
(4.5pp) — both league boundaries. Every other adjacent gap inside a league
(`unbalanced`→`imp`, `trader`→`weighted`, etc.) is within noise, which is the
point: a league is a plateau, not a ladder.

## 4. Wildcard safety, re-checked

`npm run dice:audit`. Both invariants asserted in
`packages/bots/test/odds.test.ts` still hold against the full 14-die roster,
new dice included as filler companies:

```
devil: never safer than balanced (as expected)
imp: safer than balanced in 2 companies — e.g. [imp x4]: 0.10542 < 0.10843
```

`devil`'s retune only changed *how much* riskier it runs, not the shape of
the guarantee — its wild sits on `1`, which can never complete a `Single`
alone, so swapping it in for a `balanced` die can only ever hold farkle rate
steady or raise it.

## 5. `twins` is a set die, same as `trinity`

Both `trinity` and `twins` bet everything on a triple of a face worth nothing
alone. §2's `win1` column confirms the same downgrade docs/DESIGN.md §5
already recorded for `trinity` (47.0% as a lone die among five `balanced`)
shows up for `twins` too, and more sharply (44.5%) — the cheaper triple
(`200` against `300`) needs the heavier bias (55.9% on `2` against
`trinity`'s 44.4% on `3`), and that heavier bias is what makes a lone `twins`
die a worse dead weight than a lone `trinity`.

## Reproduction

```bash
npm run build
node scripts/dice-balance/sweep-candidates.mjs --matches 40000   # §1, edit CANDIDATES to retry a weight set
npm run dice:roster    # §2
npm run dice:tiers     # §3
npm run dice:audit     # §4
```
