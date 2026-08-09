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

export const WEIGHTED_DIE: DieSpec = {
  id: 'weighted',
  name: 'Weighted die',
  weights: [10, 1, 1, 1, 1, 1],
};

/**
 * Otherwise balanced, but its `6` face is painted as a Devil's Head — see
 * docs/RULES.md §11. Deliberately not the `1` face: a physical `1` already
 * scores on its own, so marking it wild would swap one guaranteed-scoring
 * outcome for another and leave the farkle rate unchanged. Marking the `6`
 * wild instead means the one face that would otherwise score nothing by
 * itself now always does, which is where the wildcard actually earns its
 * keep — `scoreKeep` resolves it to whichever pip maximises the keep, so a
 * throw containing this die is measurably safer than an ordinary die, not
 * merely differently labelled. See docs/DESIGN.md §5 for the measured effect
 * and `packages/bots/src/odds.ts` for the farkle-probability arithmetic.
 */
export const DEVIL_DIE: DieSpec = {
  id: 'devil',
  name: "Devil's head die",
  weights: [1, 1, 1, 1, 1, 1],
  wild: 6,
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
  [ODD_DIE.id]: ODD_DIE,
  [CHEAT_DIE.id]: CHEAT_DIE,
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
