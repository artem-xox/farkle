import { nextBelow, type RngState } from './rng.js';
import { WILD, type Face, type Pip } from './types.js';

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
   * The physical pip that is painted as a Devil's Head instead of its own
   * value. Rolling it produces `WILD`, but its likelihood still comes from
   * `weights[wild - 1]` — the die stays one honest set of six weights rather
   * than growing a seventh, separate probability.
   */
  readonly wild?: Pip;
}

export const BALANCED_DIE: DieSpec = {
  id: 'balanced',
  name: 'Ordinary die',
  weights: [1, 1, 1, 1, 1, 1],
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
 * Its `1` face is painted as a Devil's Head — see docs/RULES.md §4a — and is
 * rare, 1 throw in 16. A Devil's Head is *not* simply a free `1`: it can never
 * complete a `Single` by itself (`scoreKeep` in scoring.ts refuses to resolve
 * a wildcard that way), only a bigger combination — three or more of a kind,
 * or a straight. A lone Devil's Head, or one thrown alongside dice it can't
 * join into such a combination, scores nothing at all.
 *
 * So the wildcard is not this die's only departure from ordinary: painting the
 * `1` over *removes* the 100-point single entirely, and the low weight is what
 * keeps a face this strong inside the band. The result farkles more often than
 * an ordinary die on a full throw (6.3% against 3.1%) while scoring more when
 * it does connect — the roster's clearest high-variance die.
 */
export const DEVIL_DIE: DieSpec = {
  id: 'devil',
  name: "Devil's head die",
  weights: [1, 3, 3, 3, 3, 3],
  wild: 1,
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
  [WEIGHTED_DIE.id]: WEIGHTED_DIE,
  [DEVIL_DIE.id]: DEVIL_DIE,
  [IMP_DIE.id]: IMP_DIE,
  [ODD_DIE.id]: ODD_DIE,
  [CHEAT_DIE.id]: CHEAT_DIE,
  [TRADER_DIE.id]: TRADER_DIE,
  [TRINITY_DIE.id]: TRINITY_DIE,
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
      return { face: die.wild === pip ? WILD : pip, state: pick.state };
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
