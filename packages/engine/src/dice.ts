import { nextBelow, type RngState } from './rng.js';
import { type Face } from './types.js';

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

export const DICE: Readonly<Record<string, DieSpec>> = {
  [BALANCED_DIE.id]: BALANCED_DIE,
  [WEIGHTED_DIE.id]: WEIGHTED_DIE,
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
}

/** Probability of each face, for display. */
export function faceProbabilities(die: DieSpec): number[] {
  const total = die.weights.reduce((sum, weight) => sum + weight, 0);
  return die.weights.map((weight) => weight / total);
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
      return { face: (index + 1) as Face, state: pick.state };
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
