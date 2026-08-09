import { describe, expect, it } from 'vitest';

import {
  assertValidDie,
  BALANCED_DIE,
  CHEAT_DIE,
  DEVIL_DIE,
  DICE,
  faceProbabilities,
  ODD_DIE,
  rollDice,
  rollDie,
  WEIGHTED_DIE,
  wildProbability,
  type DieSpec,
} from '../src/dice.js';
import { seedRng, type RngState } from '../src/rng.js';
import { DICE_PER_TURN, isWild, PIPS, WILD, type Face } from '../src/types.js';

function rollMany(die: DieSpec, samples: number, seed: number): number[] {
  const observed = new Array<number>(6).fill(0);
  let state: RngState = seedRng(seed);
  for (let n = 0; n < samples; n++) {
    const rolled = rollDie(die, state);
    if (isWild(rolled.face)) {
      throw new Error('rollMany: unexpected wild face from a die with no wild configured');
    }
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
  it('exposes the five dice M1–M5 ship with', () => {
    expect(Object.keys(DICE).sort()).toEqual(['balanced', 'cheat', 'devil', 'odd', 'weighted']);
    for (const die of Object.values(DICE)) {
      expect(() => assertValidDie(die)).not.toThrow();
    }
  });

  it('the cheat die rolls a 6 exactly twice as often as a balanced die does', () => {
    const probabilities = faceProbabilities(CHEAT_DIE);
    expect(probabilities[5]).toBeCloseTo((1 / 6) * 2, 12);
    expect(probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
  });

  it('the odd die favours 1, 3 and 5 over 2, 4 and 6', () => {
    const probabilities = faceProbabilities(ODD_DIE);
    for (const oddIndex of [0, 2, 4]) {
      for (const evenIndex of [1, 3, 5]) {
        expect(probabilities[oddIndex]).toBeGreaterThan(probabilities[evenIndex]!);
      }
    }
  });

  it('the devil die has its 6 face marked wild, not its 1', () => {
    // Marking the 1 wild would swap one guaranteed score for another and
    // change nothing; marking the 6 wild is what actually cuts farkle risk.
    expect(DEVIL_DIE.wild).toBe(6);
    expect(wildProbability(DEVIL_DIE)).toBeCloseTo(1 / 6, 12);
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

  it('rejects an out-of-range wild face', () => {
    expect(() =>
      assertValidDie({ id: 'x', name: 'x', weights: [1, 1, 1, 1, 1, 1], wild: 0 as never }),
    ).toThrow(RangeError);
    expect(() =>
      assertValidDie({ id: 'x', name: 'x', weights: [1, 1, 1, 1, 1, 1], wild: 7 as never }),
    ).toThrow(RangeError);
  });

  it('rejects a wild face pinned to a dead face', () => {
    expect(() =>
      assertValidDie({ id: 'x', name: 'x', weights: [1, 1, 1, 1, 0, 1], wild: 5 }),
    ).toThrow(RangeError);
  });

  it('accepts a die with a wild face', () => {
    const devil: DieSpec = { id: 'devil', name: 'devil', weights: [1, 1, 1, 1, 1, 1], wild: 1 };
    expect(() => assertValidDie(devil)).not.toThrow();
  });
});

describe('wild faces', () => {
  const devil: DieSpec = { id: 'devil', name: 'devil', weights: [2, 1, 1, 1, 1, 1], wild: 1 };

  it('rolls WILD instead of its pinned pip, at the pip\'s own weight', () => {
    const samples = 120_000;
    const observed = { wild: 0, other: new Array<number>(6).fill(0) };
    let state: RngState = seedRng(77);
    for (let n = 0; n < samples; n++) {
      const rolled = rollDie(devil, state);
      state = rolled.state;
      if (isWild(rolled.face)) {
        observed.wild++;
      } else {
        observed.other[rolled.face - 1]!++;
      }
    }
    // weights sum to 7; pip 1 (now wild) carries weight 2.
    expect(observed.wild / samples).toBeCloseTo(2 / 7, 2);
    expect(observed.other[0]).toBe(0); // pip 1 itself never comes up directly
    for (let face = 2; face <= 6; face++) {
      expect(observed.other[face - 1]! / samples).toBeCloseTo(1 / 7, 2);
    }
  });

  it('never rolls WILD for a die with no wild face', () => {
    expect(wildProbability(BALANCED_DIE)).toBe(0);
    expect(wildProbability(WEIGHTED_DIE)).toBe(0);
  });

  it('reports the exact wild probability', () => {
    expect(wildProbability(devil)).toBeCloseTo(2 / 7, 12);
  });

  it('rollDice can produce WILD faces mixed with ordinary ones', () => {
    const loadout = [devil, BALANCED_DIE, devil];
    const result = rollDice(loadout, seedRng(9001));
    expect(result.faces).toHaveLength(3);
    for (const face of result.faces) {
      expect(face === WILD || PIPS.includes(face)).toBe(true);
    }
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
      expect(PIPS).toContain(face satisfies Face);
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
