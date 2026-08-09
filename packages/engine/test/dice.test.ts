import { describe, expect, it } from 'vitest';

import {
  assertValidDie,
  BALANCED_DIE,
  DICE,
  faceProbabilities,
  rollDice,
  rollDie,
  WEIGHTED_DIE,
  type DieSpec,
} from '../src/dice.js';
import { seedRng, type RngState } from '../src/rng.js';
import { DICE_PER_TURN, FACES, type Face } from '../src/types.js';

function rollMany(die: DieSpec, samples: number, seed: number): number[] {
  const observed = new Array<number>(6).fill(0);
  let state: RngState = seedRng(seed);
  for (let n = 0; n < samples; n++) {
    const rolled = rollDie(die, state);
    observed[rolled.face - 1]!++;
    state = rolled.state;
  }
  return observed;
}

function chiSquare(observed: readonly number[], die: DieSpec, samples: number): number {
  const probabilities = faceProbabilities(die);
  let total = 0;
  for (let index = 0; index < observed.length; index++) {
    const expected = samples * probabilities[index]!;
    if (expected === 0) {
      continue;
    }
    total += (observed[index]! - expected) ** 2 / expected;
  }
  return total;
}

describe('die specs', () => {
  it('exposes the two dice v1 ships with', () => {
    expect(Object.keys(DICE).sort()).toEqual(['balanced', 'weighted']);
    for (const die of Object.values(DICE)) {
      expect(() => assertValidDie(die)).not.toThrow();
    }
  });

  it('reports the weighted die as two thirds ones', () => {
    const probabilities = faceProbabilities(WEIGHTED_DIE);
    expect(probabilities[0]).toBeCloseTo(10 / 15, 12);
    for (let face = 2; face <= 6; face++) {
      expect(probabilities[face - 1]).toBeCloseTo(1 / 15, 12);
    }
    expect(probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
  });

  it('rejects malformed weights', () => {
    expect(() => assertValidDie({ id: 'x', name: 'x', weights: [0, 0, 0, 0, 0, 0] })).toThrow(
      RangeError,
    );
    expect(() => assertValidDie({ id: 'x', name: 'x', weights: [1, -1, 1, 1, 1, 1] })).toThrow(
      RangeError,
    );
    expect(() => assertValidDie({ id: 'x', name: 'x', weights: [1, 0.5, 1, 1, 1, 1] })).toThrow(
      RangeError,
    );
  });
});

describe('sampling matches the declared weights', () => {
  const samples = 120_000;

  it('balanced die', () => {
    const observed = rollMany(BALANCED_DIE, samples, 11);
    // 5 degrees of freedom, critical value at p = 0.001, fixed seed.
    expect(chiSquare(observed, BALANCED_DIE, samples)).toBeLessThan(20.515);
  });

  it('weighted die', () => {
    const observed = rollMany(WEIGHTED_DIE, samples, 22);
    expect(chiSquare(observed, WEIGHTED_DIE, samples)).toBeLessThan(20.515);
    expect(observed[0]! / samples).toBeCloseTo(2 / 3, 2);
  });

  it('never rolls a face with zero weight', () => {
    const noFivesOrSixes: DieSpec = {
      id: 'pie',
      name: 'Test die with dead faces',
      weights: [6, 1, 3, 3, 0, 0],
    };
    const observed = rollMany(noFivesOrSixes, 20_000, 33);
    expect(observed[4]).toBe(0);
    expect(observed[5]).toBe(0);
    expect(chiSquare(observed, noFivesOrSixes, 20_000)).toBeLessThan(16.266);
  });
});

describe('rolling a set of dice', () => {
  it('returns one face per die and advances the generator', () => {
    const loadout = new Array<DieSpec>(DICE_PER_TURN).fill(BALANCED_DIE);
    const result = rollDice(loadout, seedRng(5));
    expect(result.faces).toHaveLength(DICE_PER_TURN);
    for (const face of result.faces) {
      expect(FACES).toContain(face satisfies Face);
    }
    expect(result.state).not.toBe(seedRng(5));
  });

  it('replays identically from the same state', () => {
    const loadout = [BALANCED_DIE, WEIGHTED_DIE, BALANCED_DIE];
    expect(rollDice(loadout, seedRng(404))).toEqual(rollDice(loadout, seedRng(404)));
  });

  it('rolls no dice for an empty loadout', () => {
    const state = seedRng(1);
    expect(rollDice([], state)).toEqual({ faces: [], state });
  });
});
