# Rules Specification — Farkle (KCD2 variant)

This is the normative reference for the rules engine. Every statement here should
map to at least one test. Where the source game's behaviour is unconfirmed, the
section says so explicitly rather than guessing silently.

The variant implemented is the dice minigame from *Kingdom Come: Deliverance II*.
It differs from KCD1 and from most "classic" Farkle rule sets — see
[Deviations](#deviations-from-other-variants).

## 1. Equipment

Six dice. Each die has faces `1..6`.

A die is defined by an integer weight per face rather than by a probability, so
that distributions stay exact and free of floating-point drift:

```
weights: [w1, w2, w3, w4, w5, w6]
P(face i) = w_i / sum(weights)
```

A balanced die is `[1, 1, 1, 1, 1, 1]`. A die with weight `0` on a face can never
roll that face. See [DESIGN.md](DESIGN.md) for the dice available in v1.

## 2. Match setup

- Two or more players, each starting at 0 banked points.
- A match target, agreed before play. Default `2000`.
- A fixed turn order. The starting player is decided by the match configuration
  (v1: player index 0 starts).

## 3. Turn structure

A turn consists of one or more *throws*.

1. The player throws all dice currently in play (six at the start of a turn).
2. If the throw contains no scoring dice, the player **farkles**: the turn ends
   immediately and all points accumulated during this turn are lost.
   See [Farkle](#7-farkle).
3. Otherwise the player must **keep** a non-empty legal set of dice from the
   throw (see [Keeping](#5-keeping-dice)). The value of the kept set is added to
   the turn score.
4. The kept dice leave play for the remainder of the turn.
5. The player then chooses to either:
   - **bank**, ending the turn and adding the turn score to their banked total; or
   - **throw again**, using only the dice still in play.
6. If no dice remain in play after keeping, [hot dice](#6-hot-dice) applies.

A player may not bank before keeping at least one die in the current throw, and
may not throw again without keeping at least one die.

## 4. Scoring combinations

A *combination* is a multiset of dice with a point value. These are the only
combinations that score:

| Combination | Value |
|---|---|
| A single `1` | 100 |
| A single `5` | 50 |
| Three `1`s | 1000 |
| Three `2`s | 200 |
| Three `3`s | 300 |
| Three `4`s | 400 |
| Three `5`s | 500 |
| Three `6`s | 600 |
| Four of a kind | triple value × 2 |
| Five of a kind | triple value × 4 |
| Six of a kind | triple value × 8 |
| Straight `1-2-3-4-5` | 500 |
| Straight `2-3-4-5-6` | 750 |
| Straight `1-2-3-4-5-6` | 1500 |

Nothing else scores. In particular a single `2`, `3`, `4` or `6` is worthless on
its own, and pairs never score.

Four, five and six of a kind are each a **single indivisible combination**, not a
triple plus leftovers. Concretely:

| n of a kind | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| three | 1000 | 200 | 300 | 400 | 500 | 600 |
| four | 2000 | 400 | 600 | 800 | 1000 | 1200 |
| five | 4000 | 800 | 1200 | 1600 | 2000 | 2400 |
| six | 8000 | 1600 | 2400 | 3200 | 4000 | 4800 |

Six `1`s therefore scores 8000 and wins a default match outright.

## 5. Keeping dice

Let `T` be the multiset of dice in the current throw and `K ⊆ T` the set the
player wants to keep.

**Legality.** `K` is legal if and only if it is non-empty and there exists a
partition of `K` into combinations from §4 that covers *every* die in `K`. A
player may never keep a die that does not participate in a combination.

Examples of illegal keeps: `{2,2}` (pairs do not score), `{2,3,4}` (not a
straight), `{1,1,1,2}` (the `2` is uncovered), `{2,3,4,5,6,6}` (the sixth die is
uncovered even though `2-3-4-5-6` scores).

**Value.** The value of a legal `K` is the **maximum** over all valid partitions
of the sum of the combination values. The engine always reads a selection in the
way most favourable to the player.

This maximum matters — greedy partitioning gives wrong answers:

- `{1,2,3,4,5,5}` → straight `1-5` (500) + single `5` (50) = **550**,
  not `100 + 50 + 50` = 200.
- `{5,5,5,5}` → four of a kind = **1000**, not triple + single = 550.
- `{2,2,2,2,2,2}` → six of a kind = **1600**, not two triples = 400.

**Partial keeps are allowed and often correct.** Keeping fewer dice for fewer
points leaves more dice to throw, which lowers the chance of farkling on the next
throw. The engine must expose every legal keep, not only the highest-scoring one.

## 6. Hot dice

If after keeping there are no dice left in play, the player takes all six dice
back and may throw again. The turn score carries over and remains at risk.

The player may also bank instead of taking the hot-dice throw. Hot dice is an
opportunity, not an obligation.

## 7. Farkle

A throw with no scoring dice ends the turn. The entire turn score is lost and the
banked total is unchanged. Play passes to the next player.

Formally: a throw farkles if and only if no legal keep exists, which for the
combinations in §4 is equivalent to the throw containing no `1`, no `5`, and no
three-of-a-kind or better.

## 8. Winning

The first player whose **banked** total reaches or exceeds the match target wins,
and the match ends immediately at that moment. There is no requirement to hit the
target exactly, and no "final round" for the remaining players in v1.

Turn score alone never wins — points must be banked.

## 9. Test vectors

Throws of six dice, with the highest-value legal keep. These belong in the test
suite verbatim.

| Throw | Best full-value keep | Points | Note |
|---|---|---|---|
| `1 2 3 4 5 6` | all six | 1500 | full straight, triggers hot dice |
| `1 2 3 4 5 5` | all six | 550 | straight `1-5` + single `5` |
| `1 1 2 3 4 5` | all six | 600 | straight `1-5` + single `1` |
| `2 3 4 5 6 6` | `2 3 4 5 6` | 750 | the spare `6` cannot be kept |
| `1 1 1 5 5 5` | all six | 1500 | two triples simply add up |
| `3 3 3 3 3 2` | `3 3 3 3 3` | 1200 | five of a kind; the `2` is dead |
| `1 1 1 1 1 1` | all six | 8000 | instant win at target 2000 |
| `6 6 6 6 6 6` | all six | 4800 | |
| `2 3 4 6 6 6` | `6 6 6` | 600 | |
| `1 2 2 3 4 6` | `1` | 100 | only one scoring die |
| `1 1 2 2 3 3` | `1 1` | 200 | **not** three pairs in this variant |
| `2 2 3 3 4 4` | — | — | **farkle** — three pairs does not score |
| `2 2 3 4 4 6` | — | — | farkle |

Four-dice throws, for the doubling rule:

| Throw | Best keep | Points |
|---|---|---|
| `1 1 1 1` | all four | 2000 |
| `5 5 5 5` | all four | 1000 |
| `2 2 2 2` | all four | 400 |

## 10. Deviations from other variants

Carried over from KCD1 but **removed** in this variant — implementing them would
be a bug:

- Three pairs (KCD1: 1500)
- Two triples (KCD1: 2500)
- Four of a kind + a pair (KCD1: 1500)
- Flat values for four/five/six of a kind (KCD1: 1000 / 2000 / 4000). This
  variant doubles from the triple value instead.

Not present in this variant at all, though common in tabletop Farkle:

- A minimum score required to open an account ("get on the board").
- A final round for other players after someone crosses the target.

Both are candidates for the optional-rules editor, not for v1.

## 11. Unconfirmed and deferred

These are known gaps, recorded so they are not mistaken for settled behaviour.

**Three pairs.** Two independent guides list no pair-based combination for KCD2,
and the doubling rule for four-plus of a kind is consistent across them. This is
still the highest-risk assumption in the document: if it is wrong, `2 2 3 3 4 4`
flips from a farkle to a 1500-point throw. Worth verifying in-game before the
scoring tests are treated as golden.

**Devil's Head face.** Some dice in the source game carry a wildcard face that
can stand in for any value when completing a combination. Not implemented in v1.
When it is, the open questions are whether a wildcard scores on its own, whether
a throw of only wildcards farkles, and how it interacts with the maximum-value
rule (a wildcard should presumably be assigned the value that maximises the
keep). The scoring engine should treat "wildcard" as a first-class face from the
start so that adding such dice does not require reworking the partitioner.

**Match target.** In the source game the target varies by opponent and wager.
Modelled here as match configuration with a default of 2000.
