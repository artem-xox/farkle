# Jev as a policy — how well does a model play Farkle?

**Date:** 2026-09-21
**Base commit:** `c7cd8f2`, plus the `jev` branch that adds `packages/jev`
**Model:** `jev-1.13.0` (asked for as `jev-latest`)
**Bots:** `jev` (`packages/jev`, default thresholds) vs the `smart` preset
**Dice:** six ordinary dice for the headline run; three wildcard sets below

Reproduce with:

```bash
npm run build
export TYPESAFE_API_KEY=…
node scripts/jev/bench.mjs -n 800 --target 2000 --seed 42 --out jev-vs-smart.json
```

The seed reproduces the dice and nothing else — Jev is not a deterministic
policy, so the win rate will move between runs by about the width of the
interval below.

## The question

Every opponent in this repository is a hand-tuned heuristic. `smart` is the
strongest: a one-ply expected-value comparison
(docs/researches/2026-08-11-smart-v2.md), which beats every other preset in
all 54 pairings tested there.

`jev` is a different kind of thing. Every move is a request to
[TypeSafe's Jev](https://docs.typesafe.ai), a System One model, carrying the
rules, the standings, the match history and every legal move — with all the
arithmetic already done, because the model is
[documented as bad at arithmetic](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md).
The question is whether judgment supplied that way is worth anything against
a calculation.

## Result

800 matches, target 2000, seed 42.

| | `jev` | `smart` |
|---|---|---|
| **Win rate** | **48.3%** [44.8%, 51.7%] | 51.7% [48.3%, 55.2%] |
| Farkle rate | 25.4% | 18.5% |
| Points per bank | 651 | 632 |

**Jev plays this game about as well as the best heuristic here, and the
interval includes even.** 386 wins to 414 over 800 matches is not a
difference this run can distinguish from noise; it is also not evidence that
Jev is *better*, and the point estimate leans the other way. Treat it as: a
model handed pre-computed odds is roughly a match for a tuned one-ply EV
calculation, and is not close to free.

The interesting number is not the win rate but the pair beneath it. Jev
farkles **38% more often** (25.4% against 18.5%) and banks **3% more** when it
does bank. That is a coherent style rather than noise in two directions: it
presses on where `smart` banks, loses whole turns for it more often, and gets
most of the loss back in the turns that survive. The two policies arrive at
the same place by visibly different routes — which is the result that makes
`jev` worth having as an opponent even though it does not win more.

## Cost of playing this way

| | |
|---|---|
| Requests | 9 860 (12.3 per match) |
| Latency | 295 ms per request |
| Input tokens | 22 690 138 (2 301 per request) |
| Cost | **$0.95** for the run |

Requests scale with the target, at close to `target / 200` per match for one
seat — 4.2 at target 800, 9.8 at 2000, 20.1 at 4000, counted over 400
`smart`-vs-`smart` matches. So the interactive cost is a fraction of a cent
per match and a third of a second per move, which is why `--opponent jev` is
playable and why `farkle sim` is still the right place for anything
statistical.

## Confidence, and what it does not yet tell us

Mean confidence over keep Choices was **0.386**, and **5.1%** of decisions
fell back to `smart`: 407 for confidence below the `minConfidence` of 0.15,
128 for a press Noul inside the 0.02 deadband.

Both thresholds are still guesses. The documented tiers — act above 0.9,
escalate below 0.5 ([confidence](https://docs.typesafe.ai/confidence)) — are
written for questions with a handful of options; a keep Choice routinely
offers dozens, so probability mass is thin by construction and 0.386 is not a
sign of a confused model. Picking 0.15 was a judgement that the bottom few
percent are worth discarding, not a measurement.

A mean cannot settle it, so the benchmark now reports the distribution. From
the 6 000-target crown run below, 2 703 keep Choices:

```
0.0-0.1:  56 · 0.1-0.2: 312 · 0.2-0.3: 577 · 0.3-0.4: 537 · 0.4-0.5: 438
0.5-0.6: 347 · 0.6-0.7: 205 · 0.7-0.8:  83 · 0.8-0.9:  47 · 0.9-1.0: 101
```

Broad and single-humped, mode at 0.2–0.3, with a real spike at the very top
(101 answers above 0.9 — the throws where one keep is obviously right). The
0.15 threshold therefore cuts about **6%** of keeps out of a densely populated
part of the curve, not an isolated clump of confused answers. Where exactly it
sits matters, and nothing here says 0.15 is the right place for it.

**What would actually calibrate it**, and has not been run: the same 800
matches with `minConfidence: 0`, so no keep is ever refused for uncertainty.
If the win rate is unchanged, the gate is doing nothing and should go. If it
drops, the gate earns its place and the threshold can be tuned upward until
it stops paying. That is one more run at about $1, and it is the next thing
worth spending on.

## Wildcard loadouts

Does the rules digest survive contact with dice the model has to *read* rather
than count? Three sets, 500 matches each, both seats on the same dice — the
dice are the control here, not the subject, which is why `bench.mjs` takes one
`--loadout` and not one per side.

**Pick the target per loadout, not one target for all.** At the default 2000 a
crown match is over in 2.2 turns and offers 3.7 decisions; the dice decide it
and no policy can show through. So each set got a target that buys it the same
~6-turn, ~10-decision match an ordinary set gets at 2000. `set-round-robin.mjs`
reaches for a flat `target: 8000` for the same reason.

| Loadout | Target | Turns | `jev` | `smart` | Farkle rate | Points per bank |
|---|---|---|---|---|---|---|
| six ordinary | 2000 | 6.5 | **48.3%** [44.8, 51.7] | 51.7% | 25.4% / 18.5% | 651 / 632 |
| 3 king + 3 queen | 6000 | 5.7 | **52.6%** [48.2, 56.9] | 47.4% | 13.6% / 8.6% | 2208 / 2092 |
| six Devil's Head | 4000 | 7.2 | **50.0%** [45.6, 54.4] | 50.0% | 16.0% / 8.7% | 1108 / 1095 |
| 2 king + 2 queen + 2 devil | 5000 | 5.6 | **50.8%** [46.4, 55.2] | 49.2% | 15.5% / 8.3% | 1690 / 1546 |

**Level on every set.** All four intervals contain 50%, and nothing here
separates the policies. Wildcards do not break Jev, and they do not rescue it
either: whatever the dice, it lands where the EV calculation lands.

**The style is the finding, and it is loadout-independent.** In all four runs
Jev farkles more than `smart` — 1.4× on ordinary dice and 1.6–1.8× on every
wildcard set — and in three of four it banks more when it does bank. Same
direction, same rough magnitude, across 2 300 matches and four sets. Jev
presses on where the EV rule banks, loses whole turns for it, and takes the
loss back in the turns that survive. That is a policy with a temperament, not
a noisy one.

**The Crown Bonus was genuinely exercised.** On `3 king + 3 queen` it fires in
**21.3%** of keeps and on the mixed set in **12.5%**; on six Devil's Heads it
correctly never fires, because the bonus is keyed on the King *and* Queen
identities and not on "two wildcards". So the run does test the trickiest rule
in the game rather than talking past it, and the fallback rate on crown sets
(3.7–4.5%) is no worse than on ordinary dice (5.1%).

Confidence runs slightly *lower* on the long wildcard runs (0.395–0.416) than
on the short ones (0.428–0.443), which is a length effect rather than a dice
effect: a longer match spends more of its decisions mid-turn with many dice in
play and many legal keeps, and mass spread over more options is lower
confidence by construction.

Reproduce:

```bash
node scripts/jev/bench.mjs -n 500 --seed 42 --target 6000 --loadout king,king,king,queen,queen,queen
node scripts/jev/bench.mjs -n 500 --seed 42 --target 4000 --loadout devil
node scripts/jev/bench.mjs -n 500 --seed 42 --target 5000 --loadout king,king,queen,queen,devil,devil
```

Roughly $0.70 and five minutes each.

## Does a richer prompt help?

The first version sent the rules, the standings and the match log. A second
version adds three things, on the theory that a model given more to reason
from reasons better:

1. **The opponent's decisions, not just their results.** The engine emits no
   event for "pressed on rather than banked" — that choice is the *absence*
   of a `Banked` — so `describeHistory` reconstructs it from throw order and
   reports it: *"Henry chose to throw again rather than bank, putting 200 at
   risk on four dice."* Previously the log said what the opponent scored and
   never what they risked to score it.
2. **A tally per player** (`summariseTurns`): turns finished, banks, best
   turn, average, farkles, times pressed. All of it is already in the log,
   which is exactly why it is worth precomputing — Jev is documented as
   unable to count "items in a long list".
3. **Worked examples**, in the structured `instructions`/`criteria` a System
   One model accepts (there is no message history to put a few-shot turn in).
   Every example is the engine's, not invented: the farkle percentages come
   from `balancedFarkleProbability`, and each keep example is a real throw on
   which `smart` declines the top-scoring option — found by enumerating
   throws and asking it, after a first attempt at writing them by hand
   produced an example that was simply wrong about the rules.

Same 800 matches, same seed, same dice, same target. Only the prompt moved.

| | Base prompt | Enriched |
|---|---|---|
| **Win rate** | 48.3% [44.8, 51.7] | **48.0%** [44.6, 51.5] |
| Mean confidence | 0.386 | **0.499** |
| Fallback rate | 5.1% | **2.2%** |
| Tokens per request | 2 301 | 2 797 |
| Cost | $0.95 | $1.23 |

**It bought confidence, not wins.** The confidence distribution moved
visibly — the mode shifts from 0.2–0.3 to 0.4–0.7 and low-confidence
fallbacks halve — so the extra context genuinely changed how the model
answers. The win rate did not move at all: 48.0 against 48.3 is the same
number. Twenty-one percent more tokens per request, no better play.

The useful conclusion is about confidence rather than about prompting:
**a System One model's confidence is not a proxy for move quality here.**
More context concentrated the probability mass without moving the decisions
that matter. That also weakens the case for the `minConfidence` gate, which
is built on the opposite assumption.

## The strongest set, played long

`3 king + 3 queen` is the best loadout in the roster — 99.6% [99.6, 99.7]
against six ordinary dice with `smart` at target 8000, measured over 20 000
matches with `winRateHeadToHead`. Both seats on it, 500 matches, target 8000,
enriched prompt:

| | `jev` | `smart` |
|---|---|---|
| **Win rate** | **58.0%** [53.6, 62.2] | 42.0% |
| Farkle rate | 15.7% | 8.9% |
| Points per bank | **2 428** | 2 101 |

**The first result where the interval excludes 50%.** 290 wins of 500 is
p ≈ 0.0003, which survives a correction for all eight configurations tried
here. The mechanism is the one the farkle gap has been pointing at all along:
on crown dice a single turn can be worth thousands, Jev presses on nearly
twice as often, and at target 8000 there is enough match left for that
variance to pay. Points per bank — 2 428 against 2 101 — is where the edge
actually lives.

**This is confounded and should not be read as "the prompt worked."** Two
things changed between this run and any baseline: the prompt *and* the
configuration. There is no `3 king + 3 queen` at target 8000 on the base
prompt to compare against.

What the surrounding evidence suggests, without settling it: the prompt did
nothing on ordinary dice (48.0 vs 48.3), and crowns at target 6000 already
showed 52.6% on the *base* prompt, so the trend with target and dice predates
the enrichment. The clean test is one more run — crowns at 8000 on the base
prompt, about $1.24 — and it has not been done.

## Not measured

- **Whether the confidence gate pays for itself.** Still the open question,
  and now with better evidence that it matters: at `minConfidence` 0.15 it
  refuses about 6% of keeps, drawn from a populated part of the distribution
  rather than an isolated clump. The experiment is one run with
  `minConfidence: 0`.
- **Whether confident answers are better answers.** The histogram says how
  the confidences are spread, not whether the high ones correlate with good
  moves. Answering that needs per-decision confidence recorded against the
  outcome of the turn.
- **Other presets.** Only `smart` was played. Against `novice` the result is
  predictable; against `cautious` or `reckless` the style difference above
  might matter more than it does here.
- **Asymmetric loadouts.** Every run above gives both seats the same dice. Whether
  Jev prices an *opponent's* strong dice correctly — the state names them — is
  a different question and needs `bench.mjs` to grow a second loadout flag.
- **Which half of the enrichment did the work.** The three additions — the
  opponent's press decisions, the per-player tally, the worked examples —
  went in together and moved confidence together. Whether any one of them
  matters on its own is untested, and given the win rate did not move it is
  not obviously worth the runs.
- **Whether the 58% is the dice, the target or the prompt.** See above: one
  run settles it.
