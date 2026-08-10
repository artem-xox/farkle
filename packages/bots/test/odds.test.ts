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

  it('is 1 (certain) for a die guaranteed to roll wild — it can never complete a Single alone', () => {
    const alwaysWild: DieSpec = { id: 'always-wild-test', name: 'x', weights: [1, 0, 0, 0, 0, 0], wild: 1 };
    expect(farkleProbability([alwaysWild])).toBe(1);
  });

  it('a lone Devil\'s Head die farkles more often than a lone balanced die', () => {
    // DEVIL_DIE is BALANCED_DIE with its `1` face replaced by a wildcard
    // that can't score alone — every other face is identical, so this can
    // only ever be a net loss, never a gain, for a single die on its own.
    expect(farkleProbability([DEVIL_DIE])).toBeGreaterThan(farkleProbability([BALANCED_DIE]));
  });

  it('a Devil\'s Head never farkles less than a balanced die in the same company', () => {
    // Same proof, generalised: only the "did this die's `1`-or-wild face
    // come up" outcome differs between the two dice, and a real `1` always
    // scores while a wild only does conditionally — so for any fixed set of
    // other dice, swapping one balanced die for a devil die can only hold
    // steady or make the whole throw farkle more often, never less.
    const companies: DieSpec[][] = [
      [],
      [BALANCED_DIE],
      [BALANCED_DIE, BALANCED_DIE],
      [WEIGHTED_DIE, ODD_DIE],
      [CHEAT_DIE, CHEAT_DIE, CHEAT_DIE],
    ];
    for (const company of companies) {
      expect(farkleProbability([DEVIL_DIE, ...company])).toBeGreaterThanOrEqual(
        farkleProbability([BALANCED_DIE, ...company]),
      );
    }
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

  it('is at most 1 whenever a Devil\'s Head replaces a balanced die — never a strict safety gain', () => {
    expect(safetyRatio([DEVIL_DIE, BALANCED_DIE, BALANCED_DIE])).toBeLessThanOrEqual(1);
  });

  it('is greater than 1 when the odd die makes the set genuinely safer', () => {
    expect(safetyRatio([ODD_DIE])).toBeGreaterThan(1);
  });

  it('is 1 for an empty set (the multiplier this feeds becomes a no-op)', () => {
    expect(safetyRatio([])).toBe(1);
  });
});
