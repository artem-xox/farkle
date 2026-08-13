import { nextBelow, type RngState } from './rng.js';
import { WILD, WILD_KING, WILD_QUEEN, type Face, type Pip, type Wild } from './types.js';

/**
 * A die is an integer weight per face rather than a probability, so
 * distributions stay exact. The source game's published numbers are fractions
 * over denominators like 13 and 15, which is what a weighted bag produces.
 * A weight of zero means the face can never come up.
 */
export interface DieSpec {
  readonly id: string;
  readonly name: string;
  readonly weights: readonly [number, number, number, number, number, number];
  /**
   * The physical pip that is painted as a wildcard instead of its own value.
   * Rolling it produces `wildFace` (or plain `WILD` if that's unset), but its
   * likelihood still comes from `weights[wild - 1]` — the die stays one
   * honest set of six weights rather than growing a seventh, separate
   * probability.
   */
  readonly wild?: Pip;
  /**
   * Which wildcard sentinel `wild` resolves to — `WILD` (a Devil's Head) if
   * omitted. Every wild face resolves combinations identically regardless of
   * this (RULES.md §11): it's a display/identity distinction, not a rules
   * one, that exists solely so `scoreKeep` can tell King's crown apart from
   * Queen's for the Crown Bonus (RULES.md §12) — two Devil's Heads, or a
   * Devil's Head and a King, never trigger it.
   */
  readonly wildFace?: Wild;
}

/** The face `die` shows for physical pip `pip` — `pip` itself, or whichever wildcard sentinel `die.wild` resolves to. */
export function faceFor(die: DieSpec, pip: Pip): Face {
  return die.wild === pip ? (die.wildFace ?? WILD) : pip;
}

export const BALANCED_DIE: DieSpec = {
  id: 'balanced',
  name: 'Ordinary die',
  weights: [1, 1, 1, 1, 1, 1],
};

/**
 * A pale, chipped cousin of the ordinary die: `1` and `5`, the only two faces
 * that ever score alone, are each shaved from 1/6 down to 12/76 (15.8%) while
 * the other four faces pick up the difference. The bias is deliberately
 * subtle — this is a joke at the balanced die's expense, not a trap, so it
 * loses by a couple of points rather than by a mile.
 */
export const UNLUCKY_DIE: DieSpec = {
  id: 'unlucky',
  name: 'Unlucky die',
  weights: [12, 13, 13, 13, 12, 13],
};

/**
 * A `1` comes up a little under a quarter of the time (3/13) instead of 1/6.
 * Every point of that bias is spent on the most valuable single in the game,
 * which makes this the roster's plainest upgrade: fewer farkles *and* more
 * points, with no face given up in exchange.
 */
export const WEIGHTED_DIE: DieSpec = {
  id: 'weighted',
  name: 'Weighted die',
  weights: [3, 2, 2, 2, 2, 2],
};

/**
 * Its `1` face is painted as a Devil's Head — see docs/RULES.md §4a — and
 * comes up 1 throw in 6 (16.7%, same odds a real `1` would have on a
 * balanced die). A Devil's Head is *not* simply a free `1`: it can never
 * complete a `Single` by itself (`scoreKeep` in scoring.ts refuses to
 * resolve a wildcard that way), only a bigger combination — three or more of
 * a kind, or a straight. A lone Devil's Head, or one thrown alongside dice it
 * can't join into such a combination, scores nothing at all.
 *
 * So the wildcard is not this die's only departure from ordinary: painting
 * the `1` over *removes* the 100-point single entirely. Retuned three times
 * now: M6 promoted it to Diamond at a heavier wild than the original
 * Gold-tier printing; M7 raised the whole league's band to 70–75% against a
 * `balanced` bot; M8 re-measured every Diamond die against the `smart` bot
 * instead (docs/researches, dated) and pushed the whole league to 80–90%
 * against it — 79.5% win6.
 *
 * Every face carries the same weight, which makes this die's *distribution*
 * identical to a balanced one's — farkle6 (3.09%) doesn't move a single
 * point off `balanced`'s own. The win6 jump comes entirely from what the
 * wildcard is worth once it *does* show up: unlike a fixed `1`, it resolves
 * to whichever pip the rest of the throw can make the most of, so it upgrades
 * plenty of throws a real `1` would have left at a flat 100 points. A
 * heavier wild than this was tried and dropped: `packages/bots/test/
 * odds.test.ts` asserts a Devil's Head never farkles *less* than a balanced
 * die in the same company, and this exact weight is the ceiling of that
 * guarantee against the current roster — past it, a wild common enough to
 * complete its own triples starts occasionally out-safetying a real `1` in
 * specific heavy-wildcard companies (`king`'s in particular, post-M8),
 * making the die sometimes *safer* than ordinary rather than strictly
 * riskier.
 */
export const DEVIL_DIE: DieSpec = {
  id: 'devil',
  name: "Devil's head die",
  weights: [8, 8, 8, 8, 8, 8],
  wild: 1,
};

/**
 * RULES.md §12. M8 moved the crown from the `5` to the `2` and rebuilt the
 * die around it: previously the crown sat on a rare, lightly-weighted face
 * backed by a heavy real `6`, which bought a ceiling with barely any risk —
 * measurably the *safest* way Diamond had of winning big. `2` never scored
 * on its own to begin with, so painting the crown there costs nothing by
 * itself; what raises the risk is that `1` and `5` — the die's only two
 * possible real singles — are both cut to the bare minimum weight (no face
 * is zeroed: every physical pip still has a chance to show), so almost
 * nothing about this die scores except through a three-or-more-of-a-kind or
 * a straight. `3` and `4` are moderately heavy and `6` is the heaviest face
 * by far, so those combinations do come — 81.5% win6 (`smart` preset, vs six
 * `balanced` dice) — but farkle6 (3.6%) is clearly the highest of the three
 * Diamond dice (`devil` 3.09%, `queen` 0.6%), which is the point: King buys
 * the same Diamond-league ceiling as its siblings, but pays more up front for
 * it. Kept alongside a Queen's die (below) in the same keep, the two crowns'
 * combination pays the Crown Bonus — see `scoreKeep` in scoring.ts.
 */
export const KING_DIE: DieSpec = {
  id: 'king',
  name: "King's die",
  weights: [1, 4, 9, 9, 1, 17],
  wild: 2,
  wildFace: WILD_KING,
};

/**
 * `6` is painted as a Queen instead of its printed pip. An early cut of this
 * die was flat across `1`–`5` (2 each) — with no heavy face to give up, it
 * had no safety net to lose either, and ran well past the M7 Diamond band.
 * Both scoring singles were suppressed instead (`1` and `5` cut to 1 each),
 * which pushed the die to lean on its crown and on triples rather than on
 * cheap singles. M8 re-measured the whole league against the `smart` bot and
 * moved the target band to 80–90%: with `1`/`5` still suppressed but `2`,
 * `3`, `4` and the crown itself all raised to the same weight, this die is
 * now tied with `worn` for the roster's safest die (0.58% farkle6 each,
 * exactly — not a rounding coincidence, `analyticalMetrics` is exact brute
 * force) while still landing at 84.8% win6 (`smart` preset, vs six
 * `balanced` dice) — the safety, not raw aggression, is what carries the win
 * rate. Rare-ish crown (1 in 5, 20%, against King's roughly 1 in 10). Same
 * Crown Bonus as King when both crowns land in the same keep.
 */
export const QUEEN_DIE: DieSpec = {
  id: 'queen',
  name: "Queen's die",
  weights: [1, 2, 2, 2, 1, 2],
  wild: 6,
  wildFace: WILD_QUEEN,
};

/**
 * A lesser devil: the wildcard sits on the `6`, a face that never scores on
 * its own, so carrying it costs nothing directly — the price is charged in
 * weights instead. Seven throws in nine land on a dead `2`, `3` or `4`, and
 * each scoring single turns up twice in 27. Wildcard glue on a die that is
 * otherwise mostly rubbish: alone it farkles more often than an ordinary die,
 * but a throw holding several of them starts completing three-of-a-kinds out
 * of the wildcards themselves.
 */
export const IMP_DIE: DieSpec = {
  id: 'imp',
  name: "Imp's die",
  weights: [2, 7, 7, 7, 2, 2],
  wild: 6,
};

/**
 * A heavy `5`: 2 throws in 7 instead of 1 in 6. The 50-point single is the
 * cheapest thing on the scoring table, so this buys safety rather than
 * points — it is the roster's best die to still have in play when only two or
 * three are left, and its worst at converting a full throw into a big turn.
 */
export const TRADER_DIE: DieSpec = {
  id: 'trader',
  name: "Trader's die",
  weights: [1, 1, 1, 1, 2, 1],
};

/**
 * A heavy `3`, at 4 throws in 9. A lone `3` is worth nothing, so the whole die
 * is a bet on three-of-a-kind or better, and a cheap one — three `3`s pay 300.
 * That cheapness is what lets the bias run so high, and it makes this the one
 * die in the roster that is worth more as a set than as a single: six of them
 * beat six ordinary dice, while one among five ordinary dice is a downgrade.
 */
export const TRINITY_DIE: DieSpec = {
  id: 'trinity',
  name: 'Holy Trinity die',
  weights: [1, 1, 4, 1, 1, 1],
};

/**
 * `trinity`'s bet, moved one face over and raised: the `2` comes up 19/34
 * (55.9%), a heavier lean than `trinity` carries on its `3` (4/9, 44.4%). It
 * has to be heavier to stay in the same band — a `2`-of-a-kind pays 200
 * against `trinity`'s 300, so the cheaper combination needs the extra bias
 * just to land in the same silver company.
 */
export const TWINS_DIE: DieSpec = {
  id: 'twins',
  name: 'Twins die',
  weights: [3, 19, 3, 3, 3, 3],
};

/**
 * `balanced` with the thumb very lightly on the scale: `1`, `2` and `3`
 * average heavier than `4`, `5` and `6` (weights `[5,4,5,3,2,2]`), but neither
 * half is flat — this is noise with a direction, not a clean split. The `1`
 * bias buys real points; the `5` and `6` losses cost some safety back, and
 * the two roughly net out into the silver band alongside `trinity` and
 * `imp`.
 */
export const UNBALANCED_DIE: DieSpec = {
  id: 'unbalanced',
  name: 'Unbalanced die',
  weights: [5, 4, 5, 3, 2, 2],
};

/**
 * The `2` face is worn so smooth the die never settles on it; the remaining
 * five faces are equally likely. Nothing is added — a dead face is simply
 * taken away, which is enough to make it the roster's safest die on a full
 * throw (0.6% farkles against 3.1%).
 */
export const WORN_DIE: DieSpec = {
  id: 'worn',
  name: 'Worn die',
  weights: [1, 0, 1, 1, 1, 1],
};

/**
 * Odd faces (1, 3, 5) are slightly likelier than even ones. Measured effect
 * on play, not just face probability, is docs/DESIGN.md §5's job — landing
 * on 1 and 5 more often directly cuts the farkle rate.
 */
export const ODD_DIE: DieSpec = {
  id: 'odd',
  name: 'Odd die',
  weights: [4, 3, 4, 3, 4, 3],
};

/**
 * `odd`'s mirror, and a much fainter one. A straight `[1,2,1,2,1,2]`-style
 * lean toward `2`/`4`/`6` was tried and dropped during M5 calibration
 * (docs/DESIGN.md §5) — it pulls both scoring singles at once and sinks to
 * 42% win6. This ships the faintest bias that still reads as "the opposite
 * of odd" (`[29,30,29,30,29,30]`, each even face 0.57pp likelier) rather than
 * the strong one, which is what keeps it a bronze-league joke instead of a
 * trap.
 */
export const EVEN_DIE: DieSpec = {
  id: 'even',
  name: 'Even die',
  weights: [29, 30, 29, 30, 29, 30],
};

/**
 * A `6` comes up twice as often as it would on a balanced die (1/3 instead of
 * 1/6); the other five faces share what is left, in the same proportion as a
 * balanced die. A 6 alone never scores, so this is a higher-variance die more
 * than a strictly stronger one — see docs/DESIGN.md §5 for the measured effect.
 */
export const CHEAT_DIE: DieSpec = {
  id: 'cheat',
  name: "Cheat's die",
  weights: [2, 2, 2, 2, 2, 5],
};

export const DICE: Readonly<Record<string, DieSpec>> = {
  [BALANCED_DIE.id]: BALANCED_DIE,
  [UNLUCKY_DIE.id]: UNLUCKY_DIE,
  [WEIGHTED_DIE.id]: WEIGHTED_DIE,
  [DEVIL_DIE.id]: DEVIL_DIE,
  [KING_DIE.id]: KING_DIE,
  [QUEEN_DIE.id]: QUEEN_DIE,
  [IMP_DIE.id]: IMP_DIE,
  [ODD_DIE.id]: ODD_DIE,
  [EVEN_DIE.id]: EVEN_DIE,
  [CHEAT_DIE.id]: CHEAT_DIE,
  [TRADER_DIE.id]: TRADER_DIE,
  [TRINITY_DIE.id]: TRINITY_DIE,
  [TWINS_DIE.id]: TWINS_DIE,
  [UNBALANCED_DIE.id]: UNBALANCED_DIE,
  [WORN_DIE.id]: WORN_DIE,
};

export function assertValidDie(die: DieSpec): void {
  let total = 0;
  for (const weight of die.weights) {
    if (!Number.isInteger(weight) || weight < 0) {
      throw new RangeError(`die "${die.id}" has a non-integer or negative weight`);
    }
    total += weight;
  }
  if (total === 0) {
    throw new RangeError(`die "${die.id}" has no weight on any face`);
  }
  if (die.wild !== undefined) {
    if (!Number.isInteger(die.wild) || die.wild < 1 || die.wild > 6) {
      throw new RangeError(`die "${die.id}" has an out-of-range wild face ${die.wild}`);
    }
    if (die.weights[die.wild - 1] === 0) {
      throw new RangeError(`die "${die.id}" marks a zero-weight face as wild — it can never come up`);
    }
  } else if (die.wildFace !== undefined) {
    throw new RangeError(`die "${die.id}" sets wildFace without a wild pip to apply it to`);
  }
}

/** Probability of each physical face, for display. Ignores whether it is wild. */
export function faceProbabilities(die: DieSpec): number[] {
  const total = die.weights.reduce((sum, weight) => sum + weight, 0);
  return die.weights.map((weight) => weight / total);
}

/** Probability that a throw of this die produces the Devil's Head, or 0 if it has none. */
export function wildProbability(die: DieSpec): number {
  if (die.wild === undefined) {
    return 0;
  }
  const total = die.weights.reduce((sum, weight) => sum + weight, 0);
  return die.weights[die.wild - 1]! / total;
}

export interface RollResult {
  readonly faces: Face[];
  readonly state: RngState;
}

export function rollDie(die: DieSpec, state: RngState): { face: Face; state: RngState } {
  const total = die.weights.reduce((sum, weight) => sum + weight, 0);
  const pick = nextBelow(state, total);
  let cumulative = 0;
  for (let index = 0; index < die.weights.length; index++) {
    cumulative += die.weights[index]!;
    if (pick.value < cumulative) {
      const pip = (index + 1) as Pip;
      return { face: faceFor(die, pip), state: pick.state };
    }
  }
  // Unreachable while the weights sum to `total`.
  throw new Error(`die "${die.id}" failed to produce a face`);
}

/** Throws the given dice in order, threading the generator state through. */
export function rollDice(dice: readonly DieSpec[], state: RngState): RollResult {
  const faces: Face[] = [];
  let current = state;
  for (const die of dice) {
    const rolled = rollDie(die, current);
    faces.push(rolled.face);
    current = rolled.state;
  }
  return { faces, state: current };
}
