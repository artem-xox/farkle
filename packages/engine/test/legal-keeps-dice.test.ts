import { describe, expect, it } from 'vitest';

import type { DieSpec } from '../src/dice.js';
import { legalKeeps } from '../src/scoring.js';
import type { Face } from '../src/types.js';
import { fixedDie } from './helpers/fixed-dice.js';

/**
 * Two dice that always show a 5 but are not the same die: an ordinary die and
 * a Devil's Head die that happens to have rolled its non-wild face this time.
 * Without die identity these are indistinguishable once thrown; with it they
 * are not, because keeping one leaves a different loadout in play than
 * keeping the other.
 */
const ordinaryFive: DieSpec = { id: 'ordinary-five', name: 'Ordinary five', weights: [0, 0, 0, 0, 1, 0] };
const devilFive: DieSpec = { id: 'devil-five', name: 'Devil five', weights: [0, 0, 0, 0, 1, 1], wild: 6 };

describe('legalKeeps without a dice argument', () => {
  it('treats two dice showing the same face as interchangeable, as before', () => {
    const thrown: Face[] = [5, 5, 1, 1, 2, 3];
    const singleFiveKeeps = legalKeeps(thrown).filter(
      (option) => option.faces.length === 1 && option.faces[0] === 5,
    );
    expect(singleFiveKeeps).toHaveLength(1);
    expect(singleFiveKeeps[0]?.diceLeftSpecs).toBeUndefined();
  });
});

describe('legalKeeps with a dice argument', () => {
  const dice: DieSpec[] = [
    ordinaryFive,
    devilFive,
    fixedDie(1),
    fixedDie(1),
    fixedDie(2),
    fixedDie(3),
  ];
  const thrown: Face[] = [5, 5, 1, 1, 2, 3];

  it('keeps two same-face, same-points keeps distinct when they leave different dice behind', () => {
    const singleFiveKeeps = legalKeeps(thrown, dice).filter(
      (option) => option.faces.length === 1 && option.faces[0] === 5,
    );
    // Keeping the ordinary five leaves the devil-five die in play, and vice
    // versa — two real, distinct choices, not one deduplicated option.
    expect(singleFiveKeeps).toHaveLength(2);
    expect(singleFiveKeeps.every((option) => option.points === 50)).toBe(true);

    const leftoverIdSets = singleFiveKeeps.map(
      (option) => new Set(option.diceLeftSpecs!.map((die) => die.id)),
    );
    expect(leftoverIdSets[0]).not.toEqual(leftoverIdSets[1]);
    expect(leftoverIdSets.some((set) => set.has('devil-five'))).toBe(true);
    expect(leftoverIdSets.some((set) => set.has('ordinary-five'))).toBe(true);
  });

  it('reports diceLeftSpecs with the correct length and no reference to kept dice', () => {
    for (const option of legalKeeps(thrown, dice)) {
      expect(option.diceLeftSpecs).toHaveLength(option.diceLeft);
    }
  });

  it('rejects a dice array whose length does not match the throw', () => {
    expect(() => legalKeeps(thrown, dice.slice(0, 3))).toThrow(RangeError);
  });

  it('is unaffected by dice identity when every die is the same physical spec', () => {
    const uniform = new Array(6).fill(fixedDie(1)) as DieSpec[];
    const uniformThrow: Face[] = [1, 1, 1, 1, 1, 1];
    const withDice = legalKeeps(uniformThrow, uniform);
    const withoutDice = legalKeeps(uniformThrow);
    expect(withDice.map((o) => o.points)).toEqual(withoutDice.map((o) => o.points));
    expect(withDice.map((o) => o.faces)).toEqual(withoutDice.map((o) => o.faces));
  });

  it('distinguishes two different Devil\'s Head dice that both rolled wild', () => {
    // A Devil's Head can't complete a Single alone, so the fork here is a
    // triple of 4s completed by whichever wild(s) join it — same token
    // (`WILD`), same resolved value, same points, but a different set of
    // dice left over depending on which wild(s) were used: the triple can be
    // built from wildA + two real 4s, wildB + two real 4s, or both wilds
    // plus a single real 4 — three distinct choices, not one deduplicated
    // down to fewer because they share a points/face reading.
    const wildA: DieSpec = { id: 'devil-a', name: 'Devil A', weights: [1, 0, 0, 0, 0, 0], wild: 1 };
    const wildB: DieSpec = { id: 'devil-b', name: 'Devil B', weights: [1, 0, 0, 0, 0, 0], wild: 1 };
    const wildDice: DieSpec[] = [wildA, wildB, fixedDie(4), fixedDie(4), fixedDie(2), fixedDie(3)];
    const wildThrow: Face[] = ['W' as Face, 'W' as Face, 4, 4, 2, 3];

    const tripleFourKeeps = legalKeeps(wildThrow, wildDice).filter(
      (option) => option.faces.length === 3 && option.points === 400,
    );
    expect(tripleFourKeeps).toHaveLength(3);

    const leftoverIdKeys = tripleFourKeeps.map((option) =>
      [...option.diceLeftSpecs!.map((die) => die.id)].sort().join(','),
    );
    expect(new Set(leftoverIdKeys).size).toBe(3);
  });
});
