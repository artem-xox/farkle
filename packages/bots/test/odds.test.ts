import {
  BALANCED_DIE,
  CHEAT_DIE,
  DEVIL_DIE,
  DICE,
  IMP_DIE,
  ODD_DIE,
  WEIGHTED_DIE,
  type DieSpec,
} from '@farkle/engine';
import { describe, expect, it } from 'vitest';

import {
  balancedFarkleProbability,
  expectedKeepValue,
  farkleProbability,
  safetyRatio,
} from '../src/odds.js';

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
    // The devil die's only scoring single is its 5 (3 weights in 16); the
    // wildcard on its 1 face can't complete a Single alone, so on one die
    // the wildcard is worth exactly nothing.
    expect(farkleProbability([DEVIL_DIE])).toBeCloseTo(13 / 16, 12);
    expect(farkleProbability([DEVIL_DIE])).toBeGreaterThan(farkleProbability([BALANCED_DIE]));
  });

  it('a Devil\'s Head never farkles less than a balanced die in the same company', () => {
    // Not a construction proof — the devil die's weights differ from a
    // balanced one's, so this is asserted over the whole roster instead:
    // for every filler die and every company size, swapping in a devil die
    // holds steady or farkles more, never less.
    for (const filler of Object.values(DICE)) {
      for (let size = 0; size <= 5; size++) {
        const company = new Array<DieSpec>(size).fill(filler);
        expect(
          farkleProbability([DEVIL_DIE, ...company]),
          `${filler.id} x${size}`,
        ).toBeGreaterThanOrEqual(farkleProbability([BALANCED_DIE, ...company]));
      }
    }
  });

  it('an imp die is riskier alone but safer once other imps can complete its triples', () => {
    // The imp's wildcard sits on the 6, a face that never scored anyway, so
    // unlike the devil it gives up nothing directly — and enough wildcards
    // in one throw start completing three-of-a-kinds among themselves
    // (RULES.md §4a), which is where it overtakes an ordinary die.
    expect(farkleProbability([IMP_DIE])).toBeGreaterThan(farkleProbability([BALANCED_DIE]));

    const fourImps = new Array<DieSpec>(4).fill(IMP_DIE);
    expect(farkleProbability([IMP_DIE, ...fourImps])).toBeLessThan(
      farkleProbability([BALANCED_DIE, ...fourImps]),
    );
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
    // 3:2:2:2:2:2 — farkles only on 2, 3, 4 and 6, weight 2 each out of 13.
    expect(farkleProbability([WEIGHTED_DIE])).toBeCloseTo(8 / 13, 12);
  });

  it('ranks the whole roster on a full six-die throw', () => {
    // The balance target is docs/DESIGN.md §5: every die in the roster is a
    // sidegrade, so none of them may drift into "never farkles" territory
    // the way the pre-M6 weighted die (0.01% on six) did.
    for (const die of Object.values(DICE)) {
      const six = new Array<DieSpec>(6).fill(die);
      expect(farkleProbability(six), die.id).toBeLessThan(0.07);
      expect(farkleProbability(six), die.id).toBeGreaterThan(0.005);
    }
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

describe('expectedKeepValue', () => {
  it('matches the textbook value for one balanced die', () => {
    // A lone die scores only on 1 (100) or 5 (50), each 1/6 of the time.
    expect(expectedKeepValue([BALANCED_DIE])).toBeCloseTo((100 + 50) / 6, 12);
  });

  it('reproduces the roster figures measured independently in scripts/dice-balance', () => {
    // These are the `ev6`/`ev3` columns of the balanced row in
    // docs/researches/2026-08-10-mixed-loadout-strategy.md §1, produced by
    // `analyticalMetricsMixed` in scripts/dice-balance/lib.mjs — a separate
    // implementation of the same enumeration, so agreeing with it is a real
    // cross-check rather than a restatement.
    expect(expectedKeepValue(new Array(6).fill(BALANCED_DIE) as DieSpec[])).toBeCloseTo(399, 0);
    expect(expectedKeepValue(new Array(3).fill(BALANCED_DIE) as DieSpec[])).toBeCloseTo(86.8, 1);
  });

  it('is 0 for a die that can never score, and for no dice at all', () => {
    const alwaysThree: DieSpec = { id: 'always-3-test', name: 'x', weights: [0, 0, 1, 0, 0, 0] };
    expect(expectedKeepValue([alwaysThree])).toBe(0);
    expect(expectedKeepValue([])).toBe(0);
  });

  it('rises with every extra die in the throw', () => {
    for (let n = 1; n < 6; n++) {
      const fewer = expectedKeepValue(new Array(n).fill(BALANCED_DIE) as DieSpec[]);
      const more = expectedKeepValue(new Array(n + 1).fill(BALANCED_DIE) as DieSpec[]);
      expect(more).toBeGreaterThan(fewer);
    }
  });

  it('is consistent with farkleProbability: zero exactly when a farkle is certain', () => {
    const alwaysWild: DieSpec = { id: 'always-wild-ev-test', name: 'x', weights: [1, 0, 0, 0, 0, 0], wild: 1 };
    expect(farkleProbability([alwaysWild])).toBe(1);
    expect(expectedKeepValue([alwaysWild])).toBe(0);
  });
});
