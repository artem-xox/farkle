import { BALANCED_DIE, CHEAT_DIE, DEVIL_DIE, ODD_DIE, WEIGHTED_DIE, type DieSpec } from '@farkle/engine';
import { describe, expect, it } from 'vitest';

import { balancedFarkleProbability, farkleProbability, safetyRatio } from '../src/odds.js';

describe('farkleProbability', () => {
  it('matches the textbook value for one balanced die', () => {
    expect(farkleProbability([BALANCED_DIE])).toBeCloseTo(4 / 6, 12);
  });

  it('matches the textbook value for two balanced dice', () => {
    expect(farkleProbability([BALANCED_DIE, BALANCED_DIE])).toBeCloseTo(16 / 36, 12);
  });

  it('is 0 for a die guaranteed to roll wild', () => {
    const alwaysWild: DieSpec = { id: 'always-wild-test', name: 'x', weights: [1, 0, 0, 0, 0, 0], wild: 1 };
    expect(farkleProbability([alwaysWild])).toBe(0);
  });

  it('is lower, but not zero, for an ordinary Devil\'s Head die', () => {
    const p = farkleProbability([DEVIL_DIE]);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(farkleProbability([BALANCED_DIE]));
  });

  it('is symmetric under reordering the dice', () => {
    const a = farkleProbability([DEVIL_DIE, WEIGHTED_DIE, CHEAT_DIE]);
    const b = farkleProbability([CHEAT_DIE, DEVIL_DIE, WEIGHTED_DIE]);
    expect(a).toBe(b);
  });

  it('the odd die farkles less often than a balanced die (more 1s and 5s)', () => {
    expect(farkleProbability([ODD_DIE])).toBeLessThan(farkleProbability([BALANCED_DIE]));
  });

  it('treats an empty set of dice as a certain farkle', () => {
    expect(farkleProbability([])).toBe(1);
  });

  it('cross-checks the weighted die by brute force over its own faces', () => {
    // 10:1:1:1:1:1 — farkles only on 2,3,4,6, weight 1 each out of 15.
    expect(farkleProbability([WEIGHTED_DIE])).toBeCloseTo(4 / 15, 12);
  });
});

describe('balancedFarkleProbability', () => {
  it('agrees with farkleProbability on an explicit array of balanced dice', () => {
    for (let n = 1; n <= 6; n++) {
      expect(balancedFarkleProbability(n)).toBeCloseTo(
        farkleProbability(new Array(n).fill(BALANCED_DIE) as DieSpec[]),
        12,
      );
    }
  });

  it('decreases monotonically as more balanced dice are added', () => {
    for (let n = 1; n < 6; n++) {
      expect(balancedFarkleProbability(n + 1)).toBeLessThan(balancedFarkleProbability(n));
    }
  });
});

describe('safetyRatio', () => {
  it('is exactly 1 for any number of balanced dice', () => {
    for (let n = 1; n <= 6; n++) {
      expect(safetyRatio(new Array(n).fill(BALANCED_DIE) as DieSpec[])).toBeCloseTo(1, 12);
    }
  });

  it('is greater than 1 when a Devil\'s Head makes the set safer', () => {
    expect(safetyRatio([DEVIL_DIE, BALANCED_DIE, BALANCED_DIE])).toBeGreaterThan(1);
  });

  it('is 1 for an empty set (the multiplier this feeds becomes a no-op)', () => {
    expect(safetyRatio([])).toBe(1);
  });
});
