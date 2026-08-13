# Research: King and Queen, from valley to twins to a stronger King (M9)

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

## 5. Twins were a real synergy, but not the final answer

Shipping the exact-twin version (§2–§4) was a genuine improvement over M8's valley, and briefly shipped as such. But making `king` a literal copy of `queen` also fully retired King's own identity — the two dice became interchangeable, differing only in name, colour and crown glyph. That raised the obvious next question: is an exact copy actually the *best* use of Queen's weight shape, or just the easiest one?

## 6. A third option: same weights, crown on the other slot

`queen`'s weights (`[1,2,2,2,1,2]`) have two slots tied at weight `2`: `2` and `6`. Queen paints `6` as her crown, leaving `2` real (worth nothing on its own either way — `2` never scores alone). Nothing said King's crown had to go on the *same* slot: putting it on `2` instead, leaving `6` real, is an equally valid reading of "copy Queen's weights."

It is not an equally valid reading of "copy Queen's die," though — §0's finding (the wild slot changes ev6/win6 even at equal weight) means this is a **different, stronger** die: a wildcard is picked to resolve to whichever pip helps the current throw most, which is strictly more flexible than a fixed real face of the same weight. Leaving `6` — the best face for triples after `1` — real rather than wild is worth more than the flexibility of making it wild, at least in this weight shape:

| | farkle6 | ev6 | win6 (vs six `balanced`, target 2000) |
|---|---|---|---|
| `king`, crown on `2` (this option) | 0.58% | **991** | **88.2%** [87.87,88.50] (40k, `tier-report.mjs`) |
| `queen` / twin-`king`, crown on `6` | 0.58% | 856 | 84.8% [84.49,85.19] |
| `devil` (Diamond's third die, for scale) | 3.09% | 771 | 79.8% [79.40,80.19] |

farkle6 is identical to Queen's regardless (unaffected by which equal-weight slot is wild — only ev6/win6 move), and King is now clearly the roster's highest-EV die, ahead of both `queen` and `devil`.

**The mix is no longer free, but the peak survives the cost.** Since King and Queen are no longer identical, mixing them again has a real tradeoff (Queen dilutes King's higher EV; King dilutes Queen's lower farkle6) — but the Crown Bonus more than pays for it. Full 0–6 sweep, `CROWN_MULTIPLIER = 2` (shipped), smart preset:

| king : queen | win6 @ target 2000 | farkle6 | ev6 | win6 @ target 8000 |
|---|---|---|---|---|
| 0:6 (pure Queen) | 84.88% | 0.58% | 855.6 | 98.07% [97.80,98.30] |
| 1:5 | 88.17% | 0.96% | 1079.5 | 99.23% [99.06,99.37] |
| 2:4 | 89.51% | 1.34% | 1220.7 | 99.55% [99.41,99.65] |
| **3:3** | **90.45%** [90.04,90.85] | 1.50% | 1288.9 | **99.65%** [99.53,99.74] |
| 4:2 | 90.26% | 1.34% | 1282.9 | 99.65% [99.53,99.74] |
| 5:1 | 89.59% | 0.96% | 1192.3 | 99.51% [99.37,99.62] |
| 6:0 (pure King) | 87.93% | 0.58% | 991.1 | 99.17% [98.99,99.31] |

3:3 beats *both* pure ends at every point measured — this is a real peak with a real cost (farkle6 more than doubles from either pure end to 3:3), not the twins' free lunch, and it survives at both match lengths.

Direct head-to-head, target 8000, smart preset both sides, 15 000 matches each — now including pure King specifically, since it's no longer the same die as pure Queen:

| A | B | A win rate |
|---|---|---|
| 3 King : 3 Queen | 6× Queen (pure) | **79.19%** [78.54,79.84] |
| 3 King : 3 Queen | 6× King (pure) | **70.99%** [70.26,71.71] |
| 3 King : 3 Queen | 6× Devil (pure) | **88.21%** [87.69,88.72] |

The mix beats pure King head-to-head 71% of the time — adding Queen to an already-stronger King is still a clear upgrade, not just a hedge against picking the weaker pure end.

## 7. Decision and what shipped

`KING_DIE` keeps `queen`'s exact six weights but with `wild: 2` (not `6`) — `packages/engine/src/dice.ts`. This is what actually shipped, superseding both the M8 differentiated version and the exact-twin version tried in between.

- King is now the roster's highest-EV die (991), ahead of `queen` (856) and `devil` (771) — a real, distinct identity, unlike the twin version.
- `apps/web/src/dice/stats.ts`: `RISK_ANCHOR_ID` (`worn`) still ties `king` and `queen` at Risk 9.0 (farkle6 is unaffected by which equal-weight slot is wild). `POWER_ANCHOR_ID` (`king`) is now unambiguous — `king`'s own ev6 is clearly highest, not tied with `queen`'s.
- The King/Queen Crown Bonus synergy survives with a real, non-trivial peak at 3:3 (§6), rather than the twins' zero-cost one — mixing now costs some farkle6, and the bonus pays for it and then some.

This closes the open question §5 (of the version once at this heading) raised: a smaller, deliberate difference between King and Queen — same weights, different wild slot, rather than either M8's large weight split or an exact copy — keeps King distinguishable *and* strong *and* synergistic, all three at once.

## 8. Reproduction

```bash
npm run build
node scripts/dice-balance/tier-report.mjs --matches 40000 --preset smart   # §6's king/queen/devil row
npm run dice:audit                                                          # invariants still hold
# §2-§4 (twins) and §6 (final shape) have no committed script (ad hoc
# sweeps, deleted after use). Rebuild with lib.mjs's winRateHeadToHead/
# winRateVsOrdinary({ preset: 'smart', target: 8000 }) over the loadouts
# and CROWN_MULTIPLIER values described in each section.
```
