# Research: mixed six-die loadout strategy

**Date:** 2026-08-10
**Engine commit:** `26feda6`
**Bot preset:** `balanced` on both sides of every matchup below (a policy difference would confound a dice-only question)
**Tools:** `scripts/dice-balance/roster-report.mjs`, `scripts/dice-balance/loadout-lab.mjs`, `scripts/dice-balance/tier-report.mjs` — all in this repo, all reproducible with the commands given in each section

## Question

A player's loadout is six dice drawn freely from the collection (docs/DESIGN.md §5), repeats allowed. `roster-report.mjs` only measures **pure** loadouts — six copies of the same die — against six ordinary dice. This research asks two things that number doesn't answer:

1. Is a hand-picked **mix** of different dice ever stronger than committing to the single best pure die?
2. The docs already flag `trinity` as punishing dilution (one `trinity` among five `balanced` is a downgrade). Does that hold for the whole 1→3→6 curve, and does it apply to other wildcard dice (`imp`, `devil`)?

All numbers below are a snapshot of the roster as shipped at commit `26feda6`. **Rerun the scripts to refresh this table whenever a die's weights change** — that's the whole point of keeping this as a dated, reproducible report rather than a claim baked into prose.

## 1. Roster snapshot

`npm run dice:roster` (40 000 matches for win6, 20 000 for win1; 95% CI ≈ ±0.5pp).

| die | weights | farkle6 | farkle3 | farkle2 | ev6 | ev3 | win6 | win6 CI95 | win1 | in band (57-63%) |
|---|---|---|---|---|---|---|---|---|---|---|
| `balanced` | `[1,1,1,1,1,1]` | 3.09% | 27.78% | 44.44% | 399 | 86.8 | 49.8 | [49.3,50.2] | 49.7 | — |
| `odd` | `[4,3,4,3,4,3]` | 1.91% | 22.16% | 38.32% | 431 | 98.5 | 56.7 | [56.2,57.2] | 51.2 | **NO** |
| `trinity` | `[1,1,4,1,1,1]` | 2.86% | 37.86% | 60.49% | 470 | 79.4 | 58.8 | [58.4,59.3] | 47.0 | yes |
| `imp` | `[2,7,7,7,2,2]`, wild `6` | 2.73% | 50.78% | 72.57% | 505 | 70.2 | 59.9 | [59.4,60.4] | 50.4 | yes |
| `trader` | `[1,1,1,1,2,1]` | 1.22% | 17.49% | 32.65% | 448 | 100.3 | 60.6 | [60.1,61.0] | 50.9 | yes |
| `devil` | `[1,3,3,3,3,3]`, wild `1` | 6.26% | 47.46% | 66.02% | 515 | 57.4 | 61.2 | [60.7,61.7] | 50.6 | yes |
| `weighted` | `[3,2,2,2,2,2]` | 1.91% | 21.85% | 37.87% | 473 | 107.6 | 61.3 | [60.8,61.8] | 51.8 | yes |
| `worn` | `[1,0,1,1,1,1]` | 0.58% | 19.20% | 36.00% | 467 | 108.8 | 61.8 | [61.3,62.2] | 52.7 | yes |
| `cheat` | `[2,2,2,2,2,5]` | 3.65% | 35.02% | 53.78% | 514 | 86.8 | 62.4 | [62.0,62.9] | 49.5 | yes |

## 2. Strength tiers (win6)

`npm run dice:tiers`. Sorted descending; tier cuts are placed only where the 95% CIs on either side of the gap don't overlap — see the reasoning note in `tier-report.mjs`'s header comment for why this isn't a fixed-threshold auto-split.

| tier | dice | win6 range | note |
|---|---|---|---|
| 🥇 Gold | `cheat`, `worn`, `weighted`, `devil`, `trader` | 60.6–62.4% | one tight plateau — gaps inside it are mostly CI noise |
| 🥈 Silver | `imp`, `trinity` | 58.8–59.9% | both are "set" dice — this is their strength as a **pure 6-of-one** loadout only; see §3 for how badly that collapses under dilution |
| 🥉 Bronze | `odd` | 56.7% | the only die outside the project's own 57–63% balance band |

The only two statistically real gaps in the whole ranking are `trinity`→`odd` (2.11pp, CIs disjoint) and `imp`→`trinity` (1.05pp, CIs barely disjoint). Everything inside Gold is a genuine plateau by design (docs/DESIGN.md §5: "every special die is a sidegrade").

## 3. Dilution curves: do "set" dice punish mixing?

`npm run dice:lab` (10 000 matches/matchup vs six `balanced`, `--matches` 40000 for a confirmation pass on any single row).

| loadout | farkle6 | ev6 | win6 | win6 CI95 |
|---|---|---|---|---|
| `trinity` ×1 + 5×`balanced` | 3.60% | 384 | 46.9 | [46.0,47.9] |
| `trinity` ×3 + 3×`balanced` | 3.90% | 378 | **45.4** | [44.4,46.4] |
| `trinity` ×6 | 2.86% | 470 | 58.8 | [57.8,59.8] |
| `imp` ×1 + 5×`balanced` | 3.60% | 410 | 50.5 | [49.5,51.5] |
| `imp` ×3 + 3×`balanced` | 4.21% | 445 | 53.8 | [52.8,54.8] |
| `imp` ×6 | 2.73% | 505 | 59.2 | [58.2,60.2] |
| `devil` ×1 + 5×`balanced` | 3.47% | 408 | 50.2 | [49.2,51.2] |
| `devil` ×3 + 3×`balanced` | 4.39% | 442 | 54.7 | [53.7,55.7] |
| `devil` ×6 | 6.26% | 515 | 62.4 | [61.4,63.3] |

**Finding: `trinity`'s dilution curve is not monotonic.** Three copies (45.4%) are worse than one (46.9%) — the midpoint is the *worst* place to be, not an interpolation between "none" and "all six". `imp` and `devil` both climb monotonically instead; they tolerate a partial commitment without a curve-shaped trap, they just underperform a full commitment. Practical rule: **`trinity` is all-six-or-none — there is no safe partial buy-in.**

## 4. Candidate mixed builds vs the balanced baseline

Same run as §3, remaining rows.

| loadout | farkle6 | ev6 | win6 | win6 CI95 |
|---|---|---|---|---|
| glue-mix (2`worn`+2`trader`+2`weighted`) | 1.50% | 451 | 59.5 | [58.5,60.5] |
| kitchen-sink (1 each of `worn`/`trader`/`weighted`/`odd`/`devil`/`cheat`) | 2.49% | 434 | 54.6 | [53.6,55.6] |
| spice (4`worn`+2`devil`) | 1.82% | 468 | 59.1 | [58.2,60.1] |
| spice (4`trader`+2`devil`) | 2.11% | 453 | 56.7 | [55.7,57.7] |
| `worn` ×6 | 0.58% | 467 | 62.5 | [61.6,63.5] |
| `cheat` ×6 | 3.65% | 514 | 61.5 | [60.6,62.5] |

All hand-mixed builds land at or below the Gold tier's floor. `kitchen-sink` — one of every non-set die — is the *worst* build tested here, worse even than `trinity` ×6: diversity for its own sake does not stack advantages, it just averages each die's specific strength down.

## 5. Head-to-head round robin

The table above only says "beats `balanced` by more or less." It doesn't say who wins when two candidates actually play each other — that's this round robin (10 000 matches/pairing, row's win rate against column).

| | `worn`×6 | `cheat`×6 | glue-mix | kitchen-sink | `trinity`×6 | spice (4`worn`+2`devil`) |
|---|---|---|---|---|---|---|
| **`worn`×6** | — | 49.8 | 52.3 | 57.4 | 53.6 | 52.9 |
| **`cheat`×6** | 50.8 | — | 52.5 | 57.4 | 54.1 | 53.4 |
| **glue-mix** | 48.9 | 47.1 | — | 55.5 | 51.5 | 50.8 |
| **kitchen-sink** | 42.9 | 42.3 | 44.6 | — | 46.9 | 45.4 |
| **`trinity`×6** | 45.5 | 45.6 | 48.0 | 54.0 | — | 48.7 |
| **spice** | 47.1 | 46.6 | 48.6 | 55.0 | 51.4 | — |

`cheat` ×6 beats every other finalist, including `worn` ×6. That margin (49.8/50.8) looked like noise at 10k matches, so it was re-run at 40k matches head-to-head:

```
worn x6 vs cheat x6, 40k matches: 49.23% [48.75, 49.72]
```

The CI excludes 50% — `cheat` ×6's edge over `worn` ×6 is real, not sampling noise.

## 6. Conclusion

- **No mixed loadout tested beats the best pure loadout.** The theory going in ("safety-die backbone + a pinch of a high-ceiling die") does not survive contact with the round robin — every hand-built mix loses to both `worn` ×6 and `cheat` ×6.
- **`cheat` ×6 is the strongest loadout measured, confirmed head-to-head against its next-closest rival (`worn` ×6) at 40k matches.**
- **`worn` ×6** is the next-best and the lowest-variance option (0.58% farkle6, the safest full throw in the whole roster) — the pick if minimizing variance matters more than the last percentage point of win rate.
- **`trinity` and `imp` only pay off as a full commitment.** `trinity` additionally punishes any partial buy-in worse than not touching it at all.
- **Maximizing diversity is actively bad.** `kitchen-sink` — one of everything — is the weakest build tested.

## 7. Open questions

- 50/50 splits between two *pure* top-tier archetypes (e.g. 3×`cheat` + 3×`worn`) — untested; the round robin only tried mixes built from lower-tier "glue" dice plus spice, never two Gold-tier dice against each other in one loadout.
- Whether `imp`'s "safer in its own company" effect (docs/DESIGN.md §5) ever produces a mixed loadout that beats `imp` ×6 itself, e.g. 5×`imp` + 1 of something that doesn't dilute the wildcard-completion effect.
- All win6-vs-round-robin numbers here use the `balanced` bot preset on both sides; a policy tuned specifically to exploit a given loadout's shape (e.g. banking earlier with `worn` because its floor is so safe) is not modeled and could shift these margins.

## Reproduction

```bash
npm run build
npm run dice:roster   # §1
npm run dice:tiers    # §2
npm run dice:lab      # §3, §4, §5 (default 10 000 matches/matchup)
node scripts/dice-balance/loadout-lab.mjs --matches 40000   # §5's confirmation pass on the closest pairing
```
