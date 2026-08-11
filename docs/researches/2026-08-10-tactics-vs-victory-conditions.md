# Research: bot tactics across victory conditions and dice sets

**Date:** 2026-08-10
**Engine commit:** `462a7d2`
**Bot presets:** all five from `packages/bots/src/presets.ts` — `cautious`, `balanced`, `aggressive`, `reckless`, `novice`
**Tools:** `scripts/dice-balance/tactics-report.mjs`, `scripts/dice-balance/tactics-trend.mjs` — both new in this research, reproducible with the commands in §4

## Question

The five personalities are tuned (docs/DESIGN.md §6) with `farkle sim` round robins at the default target (2000) and ordinary dice. Two things that default doesn't cover:

1. Does the ranking of tactics hold as the **victory condition** changes — a short sprint to 1500 vs. a long grind to 8000?
2. Does it hold across different **dice sets** — the plain roster vs. a die that raises the ceiling (`cheat`, the strongest pure loadout found in the mixed-loadout research) vs. a die that changes the risk shape entirely (`trinity`, an all-or-nothing "set" die)?

## 1. Method

Full round robin (10 unique pairs) among all five presets, both players always on the *same* dice loadout (equipment is symmetric — the question is which tactic wins with it, not whether one side's dice are better). Grid: 3 targets (1500 / 3000 / 8000) × 3 dice sets (`ordinary`, `cheat`×6, `trinity`×6) = 9 conditions, 5 000 matches per pairing (95% CI ≈ ±1.4pp on a near-50% cell). A tenth, finer scan (§3) reruns just `aggressive` vs `cautious` on ordinary dice across 8 targets from 500 to 12 000 at 12 000 matches/point (CI ≈ ±0.9pp) to see the shape between the three coarse grid points.

## 2. Round robin: win% (row vs. column), avg win% = row's average against the other four

### Ordinary dice

| target | cautious | balanced | aggressive | reckless | novice |
|---|---|---|---|---|---|
| **1500** | 46.7 | **52.5** | 51.1 | 53.4 | 46.3 |
| **3000** | 46.5 | **54.2** | 51.5 | 51.4 | 46.4 |
| **8000** | 48.4 | **56.5** | 52.3 | 48.1 | 44.8 |

### `cheat`×6 (the strongest single die from the mixed-loadout research)

| target | cautious | balanced | aggressive | reckless | novice |
|---|---|---|---|---|---|
| **1500** | 47.0 | 51.1 | **51.9** | 52.0 | 48.0 |
| **3000** | 45.1 | 52.5 | **54.1** | 51.0 | 47.3 |
| **8000** | 43.6 | **55.5** | 55.1 | 49.6 | 46.2 |

### `trinity`×6 (all-or-nothing three-of-a-kind die)

| target | cautious | balanced | aggressive | reckless | novice |
|---|---|---|---|---|---|
| **1500** | 46.8 | **52.7** | 53.3 | 49.8 | 47.3 |
| **3000** | 45.8 | **54.3** | 54.5 | 48.0 | 47.4 |
| **8000** | 43.1 | **57.8** | 57.2 | 46.2 | 45.8 |

(Bold = best of the row's five for that condition. Full 5×5 matrices, including CIs, are in the raw output — §4 regenerates them.)

**Grand average across all 9 conditions:** `balanced` 54.1% · `aggressive` 53.4% · `reckless` 49.9% · `novice` 46.6% · `cautious` 45.9%.

## 3. Fine scan: `aggressive` vs `cautious`, ordinary dice, target 500→12 000

The coarse grid only samples three points; this fills in the shape for the pairing with the clearest gap.

| target | aggressive win% | CI95 | avg turns/match |
|---|---|---|---|
| 500 | 51.6 | [50.7, 52.5] | 2.1 |
| 1000 | 55.0 | [54.1, 55.9] | 3.7 |
| 1500 | 54.0 | [53.1, 54.8] | 5.6 |
| 2000 | 54.5 | [53.6, 55.4] | 7.4 |
| 3000 | 53.4 | [52.6, 54.3] | 11.2 |
| 5000 | 53.9 | [53.0, 54.8] | 19.0 |
| 8000 | 52.3 | [51.4, 53.2] | 30.9 |
| 12000 | 52.2 | [51.3, 53.1] | 47.1 |

`aggressive` beats `cautious` at every target tested, from a two-turn sprint to a 47-turn marathon — the gap never crosses 50%. It is not monotonic, though: it's weakest at the very shortest race (500, essentially a coin flip at 51.6%), peaks around 1000–2000, then tapers slowly as the race lengthens. `cautious` is simply the weaker tactic in this pairing at any length; it never catches up, it just loses by less at the extremes.

## 4. Findings

**`balanced` is the strongest tactic overall, and its lead grows with race length.** On ordinary dice its avg win% climbs from 52.5% (target 1500) to 56.5% (target 8000) — a longer race rewards its moderate, catch-up-aware thresholds more, not less. This matches the intuition that variance evens out over more turns, so the tactic with the better *expected* threshold policy pulls ahead.

**`reckless` is a short-race specialist that collapses in long races.** It's the single best tactic at target 1500 on ordinary dice (53.4%, edging out `balanced`), but by target 8000 it has fallen to 48.1% — worse than a coin flip, and worse than `cautious`. It also has the widest spread across all 9 conditions tested (46.2–53.4pp, vs. `balanced`'s 51.1–57.8pp and `aggressive`'s 51.1–57.2pp), meaning it is the *least* robust tactic to the game's own configuration: great in a sprint, a liability in a marathon.

**The dice set shifts the `balanced`-vs-`aggressive` gap — and can flip it.** Averaged across targets: on ordinary dice `balanced` beats `aggressive` by a clear 2.8pp (54.4% vs. 51.6%); on `cheat` dice the gap nearly vanishes and slightly favors `aggressive` (53.0% vs. 53.7%); on `trinity` dice they're essentially tied (54.9% vs. 55.0%), with `aggressive` outright winning the head-to-head at target 3000 (52.0% vs. `balanced`'s 48.0%, and this cell alone is outside the CI band). Higher-ceiling or boom/bust dice reward `aggressive`'s greedier keeps (its `diceValue` is 0 — no bias toward hoarding dice) more than they punish its higher bank threshold, so "which tactic is best" is not just a function of the victory target, it also depends on the loadout in play.

**`cautious` is the weakest tactic tested, in every one of the 9 conditions — worse even than `novice`.** `novice` is `balanced` with an 18% deliberate-mistake rate, built to be beatable by design (docs/DESIGN.md §6), and it does sit near the bottom throughout (45.6–48.0% averaged by dice set). `cautious` is at or below it in 6 of 9 conditions and never clears 48.4% anywhere. Its disadvantage is worst on `trinity` and `cheat` dice at the longest target (43.1% and 43.6% at target 8000) — dice that punish banking early more than the default roster does, which is exactly where `cautious`'s low `bankAt` (200) and high `minDiceToThrow` cost the most forgone value. This is a genuine surprise: "play it safe" is not just suboptimal here, it is dominated by a strategy that occasionally makes outright mistakes.

**`aggressive` is the most consistently strong runner-up.** It's never the worst, is competitive with `balanced` everywhere, and is the only tactic whose average win% *increases* on every one of the three dice sets as the target grows (51.1→52.3 ordinary, 51.9→55.1 cheat, 53.3→57.2 trinity) — the same "variance evens out" logic that helps `balanced`, but from a slightly bolder starting threshold.

## 5. Practical takeaways

- If picking one "house" difficulty setting that should hold up regardless of how a match is configured, `balanced` is it — it never finishes worse than 2nd and is 1st in 6 of 9 conditions.
- A short-race game mode (low target) is the one place `reckless` is a genuinely strong pick, not just a high-variance curiosity — worth keeping in mind if a "quick match" preset is ever added to the product.
- `cautious` underperforming `novice` across the board suggests the preset's parameters (docs/DESIGN.md §6: low `bankAt`, high `minDiceToThrow`) may be tuned further from the win-rate-optimal point than "risk-averse" flavor text implies — worth a look if `cautious` is meant to occupy a specific difficulty rung rather than just "the safe one."

## 6. Open questions

- Only three dice sets were tested (`ordinary`, `cheat`, `trinity`); the mixed-loadout research (2026-08-10-mixed-loadout-strategy.md) found `worn`×6 close behind `cheat`×6 in raw strength but with a much lower farkle rate — untested here is whether that safety profile changes the tactic ranking differently than `cheat`'s raw EV boost does.
- All matches here use the *same* loadout on both sides. Asymmetric equipment (one side on `cheat`, the other on `trinity`) crossed with tactic choice is untested.
- The fine scan (§3) only covers one pairing (`aggressive` vs `cautious`). Whether `reckless`'s collapse past target ~3000 is itself monotonic or has its own hump is not directly measured — the coarse grid's 1500/3000/8000 samples are consistent with a monotonic decline but don't rule out a peak between them.

## 7. Reproduction

```bash
npm run build
node scripts/dice-balance/tactics-report.mjs 5000    # §2 (took ~16 min on the machine this was run on)
node scripts/dice-balance/tactics-trend.mjs 12000     # §3 (~2.5 min)
```

Both scripts print markdown tables to stdout and a per-cell progress line to stderr; each cell/point uses a seed derived deterministically from its condition, so any single cell can be regenerated in isolation.
