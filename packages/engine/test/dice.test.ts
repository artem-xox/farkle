import { describe, expect, it } from 'vitest';

import {
  assertValidDie,
  BALANCED_DIE,
  CHEAT_DIE,
  DEVIL_DIE,
  DICE,
  EVEN_DIE,
  faceProbabilities,
  IMP_DIE,
  KING_DIE,
  ODD_DIE,
  QUEEN_DIE,
  rollDice,
  rollDie,
  TRADER_DIE,
  TRINITY_DIE,
  TWINS_DIE,
  UNBALANCED_DIE,
  UNLUCKY_DIE,
  WEIGHTED_DIE,
  wildProbability,
  WORN_DIE,
  type DieSpec,
} from '../src/dice.js';
import { seedRng, type RngState } from '../src/rng.js';
import { DICE_PER_TURN, isWild, PIPS, WILD_KING, WILD_QUEEN, type Face } from '../src/types.js';

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
  it('exposes the fifteen dice the roster ships with', () => {
    expect(Object.keys(DICE).sort()).toEqual([
      'balanced',
      'cheat',
      'devil',
      'even',
      'imp',
      'king',
      'odd',
      'queen',
      'trader',
      'trinity',
      'twins',
      'unbalanced',
      'unlucky',
      'weighted',
      'worn',
    ]);
    for (const die of Object.values(DICE)) {
      expect(() => assertValidDie(die)).not.toThrow();
    }
  });

  it('keys every die under its own id', () => {
    for (const [id, die] of Object.entries(DICE)) {
      expect(die.id).toBe(id);
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

  it('the devil die has its 1 face marked wild, and rare', () => {
    expect(DEVIL_DIE.wild).toBe(1);
    expect(DEVIL_DIE.wildFace).toBeUndefined();
    expect(wildProbability(DEVIL_DIE)).toBeCloseTo(1 / 9, 12);
  });

  it('the imp die puts its wild on the 6 instead', () => {
    expect(IMP_DIE.wild).toBe(6);
    expect(wildProbability(IMP_DIE)).toBeCloseTo(2 / 27, 12);
  });

  it("the king die's 5 is a rare King, backed by a heavy real 6", () => {
    expect(KING_DIE.wild).toBe(5);
    expect(KING_DIE.wildFace).toBe(WILD_KING);
    expect(wildProbability(KING_DIE)).toBeCloseTo(2 / 23, 12);
    const probabilities = faceProbabilities(KING_DIE);
    expect(probabilities[5]).toBeCloseTo(5 / 23, 12);
    for (const face of [1, 2, 3, 4]) {
      expect(probabilities[face - 1]).toBeCloseTo(4 / 23, 12);
    }
    expect(probabilities[5]).toBeGreaterThan(probabilities[0]!);
  });

  it("the queen die's 6 is a Queen, otherwise flat across the other five faces", () => {
    expect(QUEEN_DIE.wild).toBe(6);
    expect(QUEEN_DIE.wildFace).toBe(WILD_QUEEN);
    expect(wildProbability(QUEEN_DIE)).toBeCloseTo(1 / 11, 12);
    const probabilities = faceProbabilities(QUEEN_DIE);
    expect(probabilities[4]).toBeCloseTo(2 / 11, 12);
    for (const face of [1, 2, 3, 4]) {
      expect(probabilities[face - 1]).toBeCloseTo(2 / 11, 12);
    }
    expect(probabilities[4]).toBeCloseTo(probabilities[0]!, 12);
    expect(wildProbability(QUEEN_DIE)).toBeGreaterThan(wildProbability(KING_DIE));
  });

  it('the unlucky die rolls 1 and 5 a little less often than a balanced die', () => {
    const probabilities = faceProbabilities(UNLUCKY_DIE);
    expect(probabilities[0]).toBeLessThan(1 / 6);
    expect(probabilities[4]).toBeLessThan(1 / 6);
    for (const face of [2, 3, 4, 6]) {
      expect(probabilities[face - 1]).toBeGreaterThan(1 / 6);
    }
  });

  it('the even die favours 2, 4 and 6 over 1, 3 and 5 — the odd die\'s mirror', () => {
    const probabilities = faceProbabilities(EVEN_DIE);
    for (const evenIndex of [1, 3, 5]) {
      for (const oddIndex of [0, 2, 4]) {
        expect(probabilities[evenIndex]).toBeGreaterThan(probabilities[oddIndex]!);
      }
    }
  });

  it('the twins die rolls a 2 more often than the trinity die rolls its 3', () => {
    const twins = faceProbabilities(TWINS_DIE);
    const trinity = faceProbabilities(TRINITY_DIE);
    expect(twins[1]).toBeGreaterThan(trinity[2]!);
  });

  it('the unbalanced die averages heavier on 1/2/3 than on 4/5/6', () => {
    const probabilities = faceProbabilities(UNBALANCED_DIE);
    const low = (probabilities[0]! + probabilities[1]! + probabilities[2]!) / 3;
    const high = (probabilities[3]! + probabilities[4]! + probabilities[5]!) / 3;
    expect(low).toBeGreaterThan(high);
  });

  it('reports the weighted die as three thirteenths ones', () => {
    const probabilities = faceProbabilities(WEIGHTED_DIE);
    expect(probabilities[0]).toBeCloseTo(3 / 13, 12);
    for (let face = 2; face <= 6; face++) {
      expect(probabilities[face - 1]).toBeCloseTo(2 / 13, 12);
    }
    expect(probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
  });

  it('the trader die rolls a 5 twice as often as any other face', () => {
    const probabilities = faceProbabilities(TRADER_DIE);
    expect(probabilities[4]).toBeCloseTo(2 / 7, 12);
    for (const face of [1, 2, 3, 4, 6]) {
      expect(probabilities[face - 1]).toBeCloseTo(1 / 7, 12);
    }
  });

  it('the trinity die rolls a 3 four times as often as any other face', () => {
    const probabilities = faceProbabilities(TRINITY_DIE);
    expect(probabilities[2]).toBeCloseTo(4 / 9, 12);
    for (const face of [1, 2, 4, 5, 6]) {
      expect(probabilities[face - 1]).toBeCloseTo(1 / 9, 12);
    }
  });

  it('the worn die never rolls its 2, and spreads the rest evenly', () => {
    const probabilities = faceProbabilities(WORN_DIE);
    expect(probabilities[1]).toBe(0);
    for (const face of [1, 3, 4, 5, 6]) {
      expect(probabilities[face - 1]).toBeCloseTo(1 / 5, 12);
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
      expect(isWild(face) || PIPS.includes(face)).toBe(true);
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
    expect(observed[0]! / samples).toBeCloseTo(3 / 13, 2);
  });

  it('worn die — its dead face never comes up', () => {
    const observed = rollMany(WORN_DIE, samples, 44);
    expect(observed[1]).toBe(0);
    expect(chiSquare(observed, WORN_DIE, samples)).toBeLessThan(20.515);
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
