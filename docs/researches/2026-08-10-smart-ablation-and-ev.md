# Research: ablating `smart`, and replacing `bankAt` with expected value

**Date:** 2026-08-10
**Engine commit:** `7b6e868`
**Baseline:** every variant measured head-to-head against `balanced`, the incumbent
**Tools:** `scripts/dice-balance/smart-lab.mjs`, `scripts/dice-balance/smart-ev-roster.mjs`

## Question

The previous research (2026-08-10-smart-bot-prototype.md) shipped `smart` — `balanced` plus two rules bundled together — and could not tell which rule did what, because every margin landed inside the noise of a 5 000-match round robin. Three things follow from that, and this report does all three:

1. **Ablate.** Run each of `smart`'s two rules alone, at a match count that can actually resolve a 1pp effect.
2. **Replace `bankAt` with the quantity it approximates.** A constant bank threshold is a fixed guess at where "one more throw is worth it" flips. That comparison is computable exactly.
3. **Test the short-race lever the round robin actually pointed at** — `reckless` wins short races with `minDiceToThrow: 1` and a negative `diceValue`, not with its `bankAt`, which is the part `smart` copied.

## 1. Method

Each variant plays `balanced` head-to-head, both sides on the same loadout, across 3 victory targets × 3 dice sets = 9 conditions, **20 000 matches per cell** (95% CI ≈ ±0.7pp — the fix for the previous report's central weakness). "Does this rule beat the bot it was grafted onto?" is a much sharper and cheaper question than a full round robin, which is what buys the extra precision.

Variants under test, all `balanced` unless stated:

| variant | change |
|---|---|
| `smart` | both rules — the committed preset, as a reference row |
| `smart-bankat` | rule 1 alone: `bankAt = clamp(290 + 240000/target, 200, 600)` |
| `smart-endgame` | rule 2 alone: cap the threshold at 150 once within 300 of the target |
| `smart-ev` | **new** — one-ply expected-value banking (§3), replacing `bankAt` *and* `minDiceToThrow` |
| `smart-risk` | **new** — for `target <= 2000` only, swap in `minDiceToThrow: 1`, `diceValue: -5` |

Variants live in `smart-lab.mjs` rather than in `PRESETS`, because `PRESET_NAMES` drives the opponent picker on the web setup screen and these are scaffolding, not personalities to offer a player.

## 2. Ablation result: both of `smart`'s rules are inert

Mean win rate against `balanced` across the 9 conditions (50.0 = no effect):

| variant | mean | worst cell | best cell | cells whose CI excludes 50 |
|---|---|---|---|---|
| `smart` | **49.6** | 49.0 | 50.4 | 3 — all of them *below* 50 |
| `smart-bankat` | **49.9** | 49.6 | 50.2 | 0 |
| `smart-endgame` | **49.7** | 49.2 | 50.2 | 0 |
| `smart-ev` | **51.1** | 50.3 | 53.5 | 4 — all *above* 50 |
| `smart-risk` | **50.0** | 49.2 | 51.9 | 2 — one above, one below |

**Neither rule does anything.** `smart-bankat` and `smart-endgame` each land within a third of a point of 50.0, and not one of their 18 cells has a confidence interval that excludes 50. Bundled together in `smart` they are, if anything, a mild net negative: `smart` is significantly *worse* than `balanced` in three cells (ordinary/1500, ordinary/3000, trinity/8000) and significantly better in none.

**This retracts a claim from the previous report.** That report read `smart`'s ties at ordinary/8000, trinity/3000 and trinity/8000 as the hypothesis "holding, barely." At 4× the match count those cells are 50.3 [49.6, 50.9], 49.7 [49.0, 50.4] and 49.1 [48.5, 49.8]. The apparent long-race gain was sampling noise, and the last of them is actually a loss. The honest summary is that **`smart` as shipped is a very slightly worse `balanced`**.

## 3. What actually works: one-ply expected-value banking

The rule replaces both `bankAt` and `minDiceToThrow` with the comparison they were approximating. With `S` the current turn score, `p = farkleProbability(dice in play)` and `g = expectedKeepValue(dice in play)` (both exact, by weighted enumeration in `packages/bots/src/odds.ts`):

```
EV(bank now)          = S
EV(throw, then bank)  = (1 − p) · (S + E[points | scoring])  =  (1 − p)·S + g
⟹ throw exactly when   g > S · p
```

`expectedKeepValue` is deliberately unconditional — farkle outcomes are included at zero — which is what makes `g = (1 − p) · E[points | scoring]` and collapses the rule to that one line. It cross-checks exactly against `analyticalMetricsMixed` in `scripts/dice-balance/lib.mjs` (`ev6 = 399`, `ev3 = 86.8` for balanced dice), a separately written implementation of the same enumeration; that agreement is asserted as a unit test.

**Why a constant can't express this.** The breakeven turn score `g/p` on balanced dice:

| dice in play | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| bank above | **38** | 113 | 313 | 912 | 3 136 | 12 931 |

`balanced`'s flat 350 is wrong at both ends by more than an order of magnitude: it keeps throwing a single die with 300 banked (breakeven 38) and banks five dice at 400 (breakeven 3 136). No single number fits a curve that spans 38 to 12 931, which is why tuning the constant — all `smart-bankat` did — was never going to move anything.

### Result

| dice | target | `smart-ev` win% vs `balanced` | CI95 | its farkle% | avg/bank |
|---|---|---|---|---|---|
| ordinary | 1500 | 50.9 | [50.2, 51.6] | 18.5 | 590 |
| ordinary | 3000 | 51.9 | [51.2, 52.6] | 17.9 | 597 |
| ordinary | 8000 | **53.5** | [52.8, 54.2] | 17.1 | 603 |
| cheat | 1500 | 51.1 | [50.4, 51.8] | 16.1 | 713 |
| cheat | 3000 | 50.4 | [49.7, 51.0] | 15.1 | 722 |
| cheat | 8000 | 50.3 | [49.6, 51.0] | 14.5 | 733 |
| trinity | 1500 | 50.5 | [49.8, 51.2] | 12.3 | 622 |
| trinity | 3000 | 50.5 | [49.8, 51.2] | 11.5 | 635 |
| trinity | 8000 | 50.6 | [49.9, 51.3] | 10.4 | 644 |

**It wins all nine conditions.** Four cells individually exclude 50; the other five straddle it but point the same way, and 9-for-9 in one direction is p ≈ 0.002 under the null even ignoring the margins. This is the first change in this line of research with a real effect.

**The mechanism is visible in the diagnostics.** On ordinary dice `smart-ev` farkles at 17–18.5% against roughly 31% for the balanced-parameter variants — it nearly halves the farkle rate — while banking about 13% less per bank (590–603 vs 673–690). It trades turn size for turn reliability, and the trade pays. That is precisely the "banks a single die far too late" error the breakeven table predicts.

**Its edge is concentrated where the dice are ordinary, and grows with race length** — 50.9 → 51.9 → 53.5 as the target goes 1500 → 3000 → 8000. On `cheat` and `trinity` it is a flat ~+0.4pp. Both facts have the same cause: those dice already farkle far less (10–19% even for `balanced`), so there is much less of the specific mistake this rule fixes, and a per-turn edge compounds over more turns.

Worth stating plainly: **the rule is myopic and wins anyway.** It values throwing as "throw once, then bank," ignoring that a good throw earns another decision, so it systematically undervalues throwing and banks earlier than true optimal play. Beating a hand-tuned constant while handicapped that way is the strongest argument yet for the full solver in docs/PLAN.md M6 — this is the prototype that milestone says it is waiting for.

## 4. The short-race lever is real, but only on ordinary dice

`smart-risk` tests the previous report's own suspicion — that `reckless`'s short-race edge lives in `minDiceToThrow`/`diceValue`, not `bankAt`:

| dice | target 1500 | CI95 |
|---|---|---|
| ordinary | **51.9** | [51.2, 52.6] |
| cheat | 49.8 | [49.1, 50.5] |
| trinity | **49.2** | [48.5, 49.8] |

Confirmed on ordinary dice — a significant +1.9pp, and the largest single-cell effect of any variant except `smart-ev` at 8000. Refuted everywhere else: it is significantly *negative* on `trinity`, and flat on `cheat`. So the lever is real but conditional, and averaged over the grid it is exactly nothing (mean 50.0). It is not a general improvement, and shipping it unconditionally would be a wash.

## 5. Conclusions

- **Both rules in the shipped `smart` are inert; `smart` is marginally worse than `balanced`.** It should not be presented as a stronger personality. Either retire it or re-point it at the rule that works.
- **One-ply EV banking is a genuine improvement** — the only change tested across two reports that beats `balanced` in every condition, by +1.1pp on average and +3.5pp at its best.
- **The reason is structural, not a tuning accident.** A single `bankAt` cannot track a breakeven that runs from 38 to 12 931 points depending on dice in play, and `expectedKeepValue` additionally makes the threshold respond to *which* dice are left, which no static parameter can express.
- **`smart-risk` is a conditional win, not a general one** — good on ordinary dice in a short race, actively bad on `trinity`.
- **Against the whole roster `smart-ev` averages 54.5%** and is at or above 50% in 43 of 45 pairings (§6), which would make it the strongest bot measured across this and both parent reports. It is the one variant worth promoting into `PRESETS` — noting that doing so adds it to the web setup screen's opponent picker, so it wants a player-facing name and a difficulty slot, not just a merge.

## 6. Roster confirmation

`smart-ev` against every shipped preset — `smart-lab` only establishes that it beats `balanced`, not where it would rank. 10 000 matches/cell (CI ≈ ±1.0pp), fresh seeds.

| dice | target | cautious | balanced | aggressive | reckless | novice | mean |
|---|---|---|---|---|---|---|---|
| ordinary | 1500 | 56.5 | 51.2 | 52.0 | *49.6* | 55.7 | **53.0** |
| ordinary | 3000 | 59.0 | 52.0 | 54.2 | 53.4 | 58.0 | **55.3** |
| ordinary | 8000 | 61.3 | 54.4 | 58.2 | 59.5 | 64.3 | **59.5** |
| cheat | 1500 | 54.4 | 50.4 | 51.3 | 52.5 | 54.3 | **52.6** |
| cheat | 3000 | 57.0 | 50.5 | 50.7 | 51.8 | 55.0 | **53.0** |
| cheat | 8000 | 59.8 | 50.4 | 50.1 | 54.2 | 57.1 | **54.3** |
| trinity | 1500 | 54.6 | 51.1 | *50.0* | 52.3 | 55.1 | **52.6** |
| trinity | 3000 | 57.6 | 50.8 | 50.2 | 53.9 | 56.1 | **53.7** |
| trinity | 8000 | 62.4 | *49.9* | 50.4 | 58.4 | 60.2 | **56.3** |

**Grand mean: 54.5%.** For scale, the same 9-condition grand average put `balanced` at 53.3% and `aggressive` at 52.7% in the previous report — not a strictly like-for-like comparison (that round robin included `smart` in each row's opponents and used 5 000 matches), but the ordering is clear enough.

`smart-ev` is at or above 50% in **43 of 45 pairings**. The two exceptions are `reckless` at ordinary/1500 (49.6) and `balanced` at trinity/8000 (49.9), both inside the interval; `aggressive` at trinity/1500 is a dead 50.0.

Its margin widens sharply with race length — the ordinary-dice row runs 53.0 → 55.3 → **59.5** — and at target 8000 it beats `novice` 64.3%, `cautious` 61.3% and `reckless` 59.5%. The two runs also cross-validate: the `balanced` column here (51.2 / 52.0 / 54.4 on ordinary) reproduces §3's independently seeded 20 000-match figures (50.9 / 51.9 / 53.5) within a point.

**Its one weak spot is a short race on ordinary dice**, the single condition where `reckless` still edges it — which is exactly where `smart-risk` scored its only significant win (§4). That is now a concrete, evidence-backed pairing to try rather than a guess.

## 7. Open questions

- **Un-myopia.** The obvious next step is a two-ply (or depth-limited) version that credits a throw with the continuation value of the decision it earns. The breakeven table says the myopic rule banks too early; how much is on the table is measurable without building the whole M6 solver.
- **`smart-ev` + `smart-risk`.** The roster pass sharpens this from a guess into the obvious next experiment: `smart-ev`'s only real loss in 45 pairings is to `reckless` in a short ordinary race, and that is precisely the cell where `smart-risk` won. Whether they compose or interfere is untested — the EV rule already subsumes `minDiceToThrow`, so `smart-risk`'s contribution would have to come through `diceValue` and the keep ranking alone.
- **`chooseKeep` is still heuristic.** The EV rule improves only the throw-or-bank decision; keep selection is still `points + diceValue × diceLeft × safetyRatio`. `expectedKeepValue` could rank keeps by the EV of the dice each one *leaves behind*, which is the same machinery applied to the other half of the turn — plausibly a larger remaining gain than un-myopia.
- **Why is the gain so small on `cheat`/`trinity`?** The farkle-rate explanation above is a hypothesis fitted to the diagnostics, not something this grid tests directly.
- Same standing caveat as both parent reports: symmetric loadouts only.

## 8. Reproduction

```bash
npm run build
npm test                                            # incl. the expectedKeepValue cross-check and the EV-rule tests
node scripts/dice-balance/smart-lab.mjs 20000        # §2, §3, §4  (~30 min)
node scripts/dice-balance/smart-ev-roster.mjs 10000  # §6          (~20 min)
```
