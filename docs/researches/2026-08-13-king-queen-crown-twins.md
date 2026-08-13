# Research: King and Queen as exact statistical twins (M9)

**Date:** 2026-08-13
**Engine commit:** `eb4820e` (dice.ts changes ship in the same change as this file)
**Bot preset:** `smart` throughout
**Tools:** ad hoc sweep scripts (deleted after use, per this directory's convention — every number below is reproducible with the commands in [§5](#5-reproduction)), plus `scripts/dice-balance/lib.mjs`'s `winRateHeadToHead`/`winRateVsOrdinary`, both of which gained a `target` option in this change (previously hardcoded to the engine's `DEFAULT_TARGET`, 2000, with no way to override it)

## Question

M8 ([docs/researches/2026-08-13-diamond-rebalance-and-king-wild-move.md](2026-08-13-diamond-rebalance-and-king-wild-move.md)) pushed Diamond to 80–90% win6 and deliberately gave `king` a *different* risk/reward shape from `queen`'s — thin real singles, heavy `6`, meaningfully higher farkle6. Re-running the King/Queen mix sweep from the original crown PR under those weights found the Crown Bonus's synergy had disappeared: win6 was a *valley* across the 0–6 mix, every ratio losing to whichever pure end it sat closer to. This asks the obvious follow-up: is the differentiation itself what killed the synergy, and if `king` simply copied `queen`'s weights instead, does it come back?

**Correction, same day:** a first pass at "copy `queen`'s weights" left the crown on King's existing `2` slot rather than moving it to `queen`'s `6`, on the reasoning that `2` and `6` carry equal weight (`2` each) in `[1,2,2,2,1,2]`, so which one is wild "shouldn't matter." That reasoning is correct for farkle6 and the marginal wild-probability, but wrong for ev6/win6: a wildcard resolves to whichever pip helps most, strictly more flexible than a fixed real face of equal weight, so *which* slot gets that flexibility changes a die's actual scoring. The `2`-crown version measured 991 ev6 against `queen`'s 856 — a visibly different die, not a twin — and had already been shipped in an open PR with §2's multiplier table and §4's head-to-head numbers computed against it before the mistake was caught (via `tier-report.mjs`, which is exactly the kind of full-roster check that catches this sort of thing). §2's multiplier sweep turned out to still be correct, because an *earlier*, separate check of the hypothesis (before the PR's own weights were finalised) had already used the correct `wild: 6` — but §4's head-to-head numbers were run against the wrong build and are corrected below. `KING_DIE.wild` is `6` in what actually shipped; see its doc comment in `dice.ts` for the same story closer to the code.

## 1. Baseline: the M8 valley (for reference)

From the M8 research doc, `smart` preset, target 2000 (the engine default — see [§0](#0-note-target-2000-vs-8000) below):

| king : queen | win6 | ev6 |
|---|---|---|
| 0 : 6 | 84.84% | 855.6 |
| 3 : 3 | 79.67% | 922.1 |
| 6 : 0 | 81.53% | 1007.8 |

Every mixed ratio loses to at least one pure end. This is the shape being tested against.

## 0. Note: target 2000 vs 8000

Every dice-balance number in this repo, this file's own §1 included, was measured at the engine's default match target (2000) purely because `winRateHeadToHead`/`winRateVsOrdinary` never exposed a way to override it — not a deliberate choice. Added a `target` option to both in this change. §2–§4 below use it to also check the finding at **target 8000**, a noticeably longer race.

## 2. The hypothesis: `king` = `queen`'s weights, exactly

Set `KING_DIE.weights = [1, 2, 2, 2, 1, 2]` (was `[1, 4, 9, 9, 1, 17]`) **and** `wild: 6` (was `2`) — see the correction note above for why the wild slot has to move too, not just the weights. Re-ran the full 0–6 mix sweep, smart preset, target 2000, at three `CROWN_MULTIPLIER` values (1.5, 2 — the shipped value — and 3, each 20k matches/mix):

| CROWN_MULTIPLIER | 0:6 / 6:0 (now identical) | **3:3 (peak)** | peak − pure end |
|---|---|---|---|
| 1.5× | 84.88% | **88.11%** [87.66,88.56] | +3.23pp |
| 2× (shipped) | 84.88% | **89.61%** [89.31,89.91] (40k) | +4.73pp |
| 3× | 84.88% | **89.66%** [89.23,90.07] | +4.78pp |

A clean, symmetric, statistically solid peak at 3:3 in all three cases — confidence intervals don't overlap the pure ends at any multiplier. farkle6 is identical (0.58%) across every mix ratio, since mixing two statistically identical dice costs nothing: the Crown Bonus is pure upside with no tradeoff to pay for it, unlike M8's shape where a mixed loadout sacrificed some of each pure end's own edge.

Note the multiplier's marginal effect flattens out fast: 2× → 3× moves the peak by only 0.05pp (well within noise) while roughly doubling ev6 (1204 → 1552) — consistent with M8's own finding that raw multiplier scaling saturates quickly in a race-to-target format. **Shipped `CROWN_MULTIPLIER` is unchanged at 2×** — the weight change alone is what restores the synergy; the multiplier was never the lever that mattered.

## 3. Confirming at a longer match (target 8000)

Same weights, `CROWN_MULTIPLIER = 2` (shipped), smart preset, target 8000 instead of 2000:

| king : queen | win6 @ target 2000 | win6 @ target 8000 |
|---|---|---|
| 0:6 / 6:0 | 84.88% | 98.07% [97.80,98.30] |
| **3:3** | 89.61% | **99.52%** [99.39,99.63] |

In percentage points the gap looks smaller at the longer target (+4.73pp → +1.45pp) purely because everything is compressed near the 100% ceiling. Read as **loss rate** instead — the number that actually matters near a ceiling — it's the opposite: the pure ends lose 1.93% of matches, the 3:3 mix loses only 0.48%, **losing about 4× less often**. A longer race lets a real per-turn edge compound further, so the synergy is if anything *more* pronounced at 8000 than at 2000, not less.

For context, the M8-shipped Diamond dice's own vs-six-`balanced` win6 also all move sharply at target 8000 (smart preset, `king`/`queen` now identical): `devil` 79.80% → 95.43% [95.13,95.71]; `king`/`queen` 84.84% → 98.19% [97.99,98.36]. None of this is specific to the synergy — every real edge in this game compounds harder over a longer race, which is worth remembering whenever a win6 number is quoted without its match target.

## 4. Direct matchups at target 8000

Not "vs six `balanced`" but a genuine head-to-head, smart preset both sides, target 8000, 15 000 matches each (corrected numbers — see the correction note in [§ Question](#question): this section was originally run against the `wild: 2` build by mistake):

| A | B | A win rate | B win rate |
|---|---|---|---|
| 3 King : 3 Queen | 6× Queen (pure) | **75.49%** [74.80,76.18] | 24.51% |
| 3 King : 3 Queen | 6× Devil (pure) | **85.57%** [85.00,86.12] | 14.43% |

The mixed loadout doesn't just edge out its own now-identical pure end in a three-way comparison against `balanced` — it beats pure Queen head-to-head about 3 times out of 4, and beats pure Devil (a perfectly respectable 80%-band Diamond die in its own right) close to 6 times out of 7. This is the practical case for actually building a 3:3 King/Queen loadout rather than either pure one, stated as directly as the balance metric can state it.

## 5. Decision and what shipped

`KING_DIE` now has `queen`'s exact weights (`packages/engine/src/dice.ts`). Consequences, all mechanical, none requiring new anchors:

- `king` and `queen` are now identical in every measured stat: farkle6 0.58% (exactly `worn`'s value too, to the 5th decimal — see the M8 doc), win6 84.84% (vs six `balanced`), ev6 856.
- `apps/web/src/dice/stats.ts`'s `RISK_ANCHOR_ID` (`worn`) and `POWER_ANCHOR_ID` (`king`) both still hold — `king` and `queen` now tie `worn` for Risk 9.0, and tie each other for the roster's highest Power (9.0, by construction of the anchor).
- King's own distinct standalone identity from M8 (thin real singles, heavy `6`, deliberately elevated risk) is retired. Its interest now lives entirely in the pair, not in either die alone — see `KING_DIE`'s doc comment for the full reasoning.

**This is explicitly not the final word on King's identity.** The next open question — noted here rather than in code, since it's a direction, not a decision yet — is whether some *smaller* difference between the two (not M8's full split, not zero) could keep a distinguishable King while still preserving most of this synergy. That would need its own sweep across the difference-vs-synergy-strength tradeoff, which this file doesn't attempt.

## 6. Reproduction

```bash
npm run build
node scripts/dice-balance/tier-report.mjs --matches 40000 --preset smart   # king/queen now report identical numbers
npm run dice:audit                                                          # invariants still hold
# §2-§4 have no committed script (ad hoc sweeps, deleted after use). Rebuild
# with lib.mjs's winRateHeadToHead/winRateVsOrdinary({ preset: 'smart',
# target: 8000 }) over the loadouts and CROWN_MULTIPLIER values described above.
```
