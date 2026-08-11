# Research: `smart` — a target-relative, endgame-aware `balanced`

**Date:** 2026-08-10
**Engine commit:** `5ad867a`
**Bot presets:** all six now in `packages/bots/src/presets.ts` — the original five plus `smart`
**Tools:** `scripts/dice-balance/tactics-report.mjs` (unchanged from the previous research — `smart` joins the grid automatically because it's now in `PRESET_NAMES`)

## Question

The previous research (2026-08-10-tactics-vs-victory-conditions.md) found that `balanced`'s edge over the field grows with a longer victory target, and that the `balanced`-vs-`aggressive` gap narrows or flips on higher-ceiling dice (`cheat`, `trinity`). Its fixed `bankAt` (350) and lack of any rule tied to its *own* progress toward the target were flagged as candidate causes. This asks: do two concrete, cheap rule changes actually improve on `balanced`, measured the same way?

## 1. What `smart` changes

`smart` is `balanced`'s parameters (`minDiceToThrow: 2`, `diceValue: 15`, `hotDiceAlwaysThrow: true`, `desperationMargin: 200`, `catchUpBonus: 0.5`, `mistakeRate: 0`) plus two new, opt-in `BotParams` fields implemented in `threshold-bot.ts` (backward compatible — every existing preset is untouched, since neither field is set on them):

1. **Target-relative `bankAt`.** `bankAt = clamp(290 + 240000 / target, 200, 600)` instead of a fixed 350. This gives 450 at target 1500, 410 at the engine's default 2000, 370 at 3000, and 320 at 8000 — bolder for a short race, more conservative for a long one, bounded by the roster's own existing range (`cautious`'s 200 floor, `aggressive`'s 600 ceiling).
2. **Endgame caution.** Once `smart`'s own remaining distance to the target drops to 300 or below, its bank threshold is capped at 150, applied *before* the existing desperation-margin override — so a genuinely must-win turn (opponent also close) still takes priority, but an uncontested near-win no longer gambles for points it doesn't need.

## 2. Round robin: avg win% (this preset's average against the other five)

Same grid and match count as the previous research (5 000 matches/pairing).

| target | dice | cautious | balanced | aggressive | reckless | novice | **smart** |
|---|---|---|---|---|---|---|---|
| 1500 | ordinary | 46.5 | 52.1 | 51.0 | 52.9 | 46.2 | **51.3** |
| 3000 | ordinary | 46.1 | 53.2 | 51.3 | 50.9 | 46.0 | **52.4** |
| 8000 | ordinary | 47.3 | **55.1** | 51.1 | 47.2 | 44.0 | **55.1** |
| 1500 | cheat | 47.1 | 51.1 | 51.6 | 51.8 | 47.9 | **50.6** |
| 3000 | cheat | 44.9 | **52.0** | 53.5 | 50.7 | 46.9 | **52.0** |
| 8000 | cheat | 43.3 | 54.4 | 54.1 | 49.2 | 45.5 | **53.4** |
| 1500 | trinity | 47.0 | 52.6 | 52.9 | 49.4 | 46.8 | **51.3** |
| 3000 | trinity | 45.1 | 53.4 | 53.5 | 47.4 | 46.8 | **53.7** |
| 8000 | trinity | 42.1 | 56.1 | 55.6 | 45.1 | 44.8 | **56.2** |

**Grand average across all 9 conditions:** `balanced` 53.3% · `smart` 52.9% · `aggressive` 52.7% · `reckless` 49.4% · `novice` 46.1% · `cautious` 45.5%.

## 3. Head-to-head, `smart` vs `balanced` specifically

Pulled from the same matrices (`balanced`'s win rate in the direct pairing):

| target | ordinary | cheat | trinity |
|---|---|---|---|
| 1500 | balanced 50.7 | balanced 51.1 | **balanced 52.3** |
| 3000 | smart 50.8 | balanced 50.4 | tie 50.0 |
| 8000 | smart 50.5 | smart 50.3 | balanced 50.7 |

`balanced` wins the direct matchup in 6 of 9 conditions, `smart` in 3, one dead tie — but every cell where `smart` wins is inside noise for 5 000 matches (CI ≈ ±1.4pp on a near-50% cell), while `balanced`'s clearest win (trinity/1500, 52.3%) is not. **`smart` does not clearly beat `balanced` head-to-head anywhere in this grid.**

## 4. Findings

**The overall ranking moved: `smart` overtakes `aggressive` and `reckless`, but not `balanced`.** Grand average puts `smart` in solid second place (52.9%, essentially tied with `aggressive`'s 52.7%), a clear step up from `reckless` (49.4%) and light-years past `cautious`/`novice`. So the two rules are a net improvement on the bot they were grafted onto's nearest rival tier — just not on `balanced` itself.

**The long-race, high-EV-dice direction of the hypothesis holds, barely.** At `ordinary`/8000, `trinity`/3000 and `trinity`/8000 — exactly the conditions flagged in the previous research as `balanced`'s hardest to defend — `smart` **ties or edges past** `balanced` (55.1/55.1, 53.7/53.4, 56.2/56.1). These are the only cells where the new rules pay off, and even here the margin is inside sampling noise.

**The short-race `bankAt` boost looks like a net negative, not a fix.** At target 1500 across all three dice sets, `smart` loses its head-to-head against `balanced` by 0.7–4.6pp, worse than the gap at longer targets. Raising `bankAt` from 350 to 450 for a short race did *not* recover the ground `reckless`(also `bankAt` 450, but with `minDiceToThrow: 1` and `diceValue: -5`) holds there in the earlier research — which says the short-race edge those risk-seeking presets have isn't really about `bankAt` alone, it's `reckless`'s willingness to throw down to a single die and its dice-hoarding aversion. Bolting a higher `bankAt` onto `balanced`'s otherwise-cautious keep-selection just adds risk without the payoff.

**The two rules were tested bundled, not separately — this is the study's main limitation.** `smart` changes both `bankAt`'s shape and adds endgame caution at once, so this grid cannot say which rule helped (if either) and which hurt. Rule 1 (target-relative `bankAt`) is the more likely source of the short-race regression, since it's the one with a real behavioral effect at target 1500 (450 vs. 350); rule 2 (endgame caution) only ever activates in the match's last turn or two and is a plausible candidate for the small, noise-level gains at long targets, where more turns means more chances for it to matter.

## 5. Verdict

**Ship `smart` as a genuine second difficulty tier below `balanced`, not as `balanced`'s replacement.** It's a real improvement over `aggressive`/`reckless`/`cautious`/`novice` on average, and the underlying idea — that the effective bank threshold should account for the match's own shape — is directionally supported at the long-target, high-EV-dice end. But this prototype, as bundled, does not unseat `balanced` anywhere with a statistically real margin, and clearly loses ground at short targets.

## 6. Open questions

- **Ablate the two rules.** A `smart-bankat-only` and `smart-endgame-only` variant, run through the same grid, would say which rule is carrying the (small) long-target gains and which is causing the short-target loss — right now both are confounded into one preset.
- **Retune the short-target end of the `bankAtTargetBase`/`bankAtTargetScale` curve**, or drop the boost there entirely (clamp the formula so it never exceeds `balanced`'s 350 below some target), since the data here argues the increase is actively harmful rather than neutral.
- **`endgameMargin`/`endgameBankAt` were picked by intuition (300 / 150), not swept.** A parameter sweep the way `sweep-candidates.mjs` does for dice would tell whether 150 is too aggressive a cap (giving up EV) or not aggressive enough (still gambling more than needed).
- Same caveat as the parent research: all of this is `smart` vs. the roster on *symmetric* dice loadouts; an asymmetric-equipment cross with tactic choice is still untested.

## 7. Reproduction

```bash
npm run build
npm test    # confirms `smart` satisfies the same param sanity checks as the other five
node scripts/dice-balance/tactics-report.mjs 5000   # §2/§3 (~20-25 min on the machine this was run on)
```
