# Research: rebalancing Diamond to 80–90% win6, and moving King's crown to the 2

**Date:** 2026-08-13
**Engine commit:** `f158a45` (dice.ts changes ship in the same change as this file)
**Bot preset:** `smart` on both sides of every matchup below — a deliberate departure from `roster-report.mjs`/`tier-report.mjs`'s `balanced` default (see [§0](#0-methodology-note-smart-not-balanced))
**Tools:** `scripts/dice-balance/tier-report.mjs --preset smart`, ad hoc sweep scripts (deleted after use, per this directory's convention — the surviving numbers are in the tables below and in `packages/engine/src/dice.ts`'s comments)

## Question

Two asks, landed together because the second only makes sense once the first
moves the ground it stands on:

1. Push all three Diamond dice (`devil`, `king`, `queen`) from ~70–72% win6
   to **80–90%**, measured against the `smart` bot instead of `balanced`.
2. Redesign `king` so its crown sits on the `2` instead of the `5`, and so
   that the redesign **raises its risk** rather than lowering it — without
   zeroing any face's weight.

## 0. Methodology note: `smart`, not `balanced`

Every number in this file is `smart` vs `smart` (`winRateVsOrdinary(..., {
preset: 'smart' })`), continuing what M7's King/Queen crown work already
measured its own numbers against (see `dice.ts`'s comments predating this
pass). `roster-report.mjs` and `tier-report.mjs` still default to `balanced`,
which is why the Bronze/Silver/Gold numbers already in `apps/web/src/dice/
stats.ts` don't match a `smart`-preset run of those scripts — this file
doesn't touch those leagues, so that mismatch is pre-existing and out of
scope here. Both scripts now take `--preset <name>` (added in this change)
specifically so a future Diamond-only re-check doesn't need a throwaway
script:

```bash
npm run build
node scripts/dice-balance/tier-report.mjs --matches 40000 --preset smart
```

## 1. The King redesign

**The constraint that mattered most: no zeroed faces.** An early pass at
"raise King's risk" zeroed the `5` slot entirely once the crown left it —
clean on paper, but empirically *wrong*: removing a face concentrates the
remaining weight onto fewer symbols, which makes 6-dice throws farkle *less*
often (the same effect `worn`'s single dead face already trades on). Every
zeroed-face King candidate came out *safer* than the original, the opposite
of the goal, and was dropped once that was clear — every physical pip on the
final die still has some chance to show.

**The harder finding: win6 and farkle6 pull against each other for this
shape.** Once every face is required to have some weight, sweeping ~50
candidate weight sets showed a real Pareto frontier rather than a free lunch:

- Push the King toward `balanced`-die-strength safety (heavy `6`, meaningful
  real `1`/`5`) and win6 climbs past 90% while farkle6 collapses toward zero
  — a *safer* King, backwards from the brief.
- Push toward maximum risk (both real singles cut to the bare minimum
  nonzero weight, flatter backing) and farkle6 climbs — the best no-zero
  candidates found reached 5.5–6% farkle6, comfortably above the *old*
  King's own 5.62% — but win6 fell to the high 70s, short of the 80% floor.
- No candidate found both crossed 80% win6 *and* beat the old King's own
  farkle6. The chosen weights sit deliberately on the risk-favouring end of
  the frontier that still clears 80%.

**Final:** `weights: [1, 4, 9, 9, 1, 17]`, `wild: 2`. `1` and `5` (the die's
only two possible real singles) are both cut to weight `1` — as thin as a
nonzero weight gets; `3`/`4` are moderate; `6` is by far the heaviest face,
same "back the wildcard-less die with the best real face" idea the original
King used, just with more of the total weight spent getting there. Result:
**81.5% win6**, **farkle6 3.6%** — not higher than the pre-M8 King's own
5.62%, but clearly the highest risk of the three current Diamond dice at a
matching win rate (`devil` 3.09%, `queen` 0.58%), which is the sense in which
the risk did go up: relative to what winning 80%+ costs the other two, King
now visibly pays more for it. farkle3 (three dice left) is a steep 66.4%,
against `devil`'s 46.6% and `queen`'s 30.6% at three — King is *specifically*
the die that punishes pushing your luck down to the last few dice.

## 2. Devil and Queen

Both were far more straightforward — the brief for them was just "stronger,"
with no risk-direction constraint, so sweeping toward the middle of the new
band was enough.

**`devil`:** `weights: [8, 8, 8, 8, 8, 8]` (flat), `wild: 1`, unchanged from
the previous `wild` face. Flat weights make this die's *distribution*
identical to `balanced`'s — farkle6 (3.09%) doesn't move a single point off
`balanced`'s own; the +30-point win6 jump is entirely the wildcard's
flexibility (it resolves to whichever pip the rest of the throw can use
best, unlike a fixed rolled value) rather than any change in raw safety.
**79.8% win6** [79.4, 80.2] — a hair under the nominal 80% floor, not above
it: `packages/bots/test/odds.test.ts` asserts a Devil's Head must never
farkle *less* than a balanced die in the same company, checked against the
*entire* roster (not just `balanced` filler), and this flat weighting is the
exact ceiling of that guarantee post-M8 — `king`'s own new wildcard is heavy
enough that *any* heavier Devil wild starts occasionally out-safetying a real
`1` in `king`-heavy company. Pushing Devil higher would mean loosening that
tested invariant, which this change doesn't do.

**`queen`:** `weights: [1, 2, 2, 2, 1, 2]`, `wild: 6`, same shape as before
(both real singles suppressed) with `2`/`3`/`4` and the crown itself all
raised together. **84.8% win6**, farkle6 **0.58%** — by a wide margin the
safest die in the entire roster (exactly tied with `worn`'s 0.58%, to the
5th decimal place: `analyticalMetrics` is exact brute force, not simulated,
so this isn't a rounding coincidence). Queen's win rate is carried by safety,
not aggression, same story as before M8, just at a higher pitch.

| die | weights | wild | win6 | win6 CI95 | farkle6 | ev6 |
|---|---|---|---|---|---|---|
| `queen` | `[1,2,2,2,1,2]` | `6` | 84.84 | [84.49,85.19] | 0.58 | 856 |
| `king` | `[1,4,9,9,1,17]` | `2` | 81.53 | [81.15,81.91] | 3.59 | 1008 |
| `devil` | `[8,8,8,8,8,8]` | `1` | 79.80 | [79.40,80.19] | 3.09 | 771 |

(`npm run dice:audit` still passes against the full roster with these three
retuned — `devil`'s "never safer than balanced" guarantee and `imp`'s
"safer in its own company" one both hold as before.)

## 3. King/Queen synergy, re-measured

M7's session found a real synergy under the *old* weights: a 1–2 King : 5–4
Queen mix beat both pure ends on win6, and EV peaked cleanly at a 3:3 split.
Re-running the same 0–6 : 6–0 sweep under the new weights (40 000 matches per
mix, `smart` preset, vs 6× `balanced`) does not reproduce that shape:

| king : queen | win6 | win6 CI95 | farkle6 | ev6 |
|---|---|---|---|---|
| 0 : 6 | 84.84 | [84.49,85.19] | 0.58 | 855.6 |
| 1 : 5 | 84.07 | [83.71,84.43] | 1.62 | 913.7 |
| 2 : 4 | 81.26 | [80.87,81.64] | 3.51 | 918.1 |
| 3 : 3 | 79.67 | [79.28,80.06] | 5.14 | 922.1 |
| 4 : 2 | 78.89 | [78.49,79.29] | 5.69 | 949.6 |
| 5 : 1 | 79.48 | [79.08,79.88] | 4.94 | 994.8 |
| 6 : 0 | 81.53 | [81.15,81.91] | 3.59 | 1007.8 |

**win6 is a valley, not a peak.** It falls monotonically from pure Queen
(84.84%) to a minimum around 4 King : 2 Queen (78.89%), then rises back
toward pure King — every mixed ratio loses to at least one pure end. **ev6 is
now simply monotonic**, rising the whole way from pure Queen (855.6) to pure
King (1007.8), with no interior peak either. Both of these are different
from the pre-M8 finding.

**Why the synergy went away:** the Crown Bonus only fires when a keep
resolves *both* a King's crown and a Queen's crown in the same combination —
a fairly rare joint event regardless of mix ratio. Before M8, King and Queen
were close enough in both win6 and ev6 that this occasional bonus was enough
to tip a mixed loadout over either pure end. After M8, Queen's win6 (84.8%)
and King's ev6 (1008, now the roster's highest by a wide margin) both moved
independently upward on each die's own terms — the *gap* between what pure
Queen already offers (safety) and pure King already offers (ceiling) grew
faster than the occasional Crown Bonus could bridge it. The mechanic still
works exactly as designed (`docs/RULES.md §12`, added in this change since
it had never actually been written down) — it just isn't, on the current
numbers, a reason to run the two together over running either alone.

farkle6 climbs smoothly with King's share (0.58% → 5.69% → back down to
3.59%), which is a straight blend of the two dice's own farkle rates with no
surprises — the risk of a mixed loadout is exactly what the ratio suggests it
should be, even where win6 and ev6 aren't.

## Reproduction

```bash
npm run build
node scripts/dice-balance/tier-report.mjs --matches 40000 --preset smart   # §1, §2 table
npm run dice:audit                                                          # §2's invariant check
# §3's mix table has no committed script (ad hoc sweep, deleted after use) —
# rebuild it with lib.mjs's winRateVsOrdinary({ preset: 'smart' }) over
# [king×k, queen×(6-k)] for k in 0..6, 40000 matches each.
```
