import { describe, expect, it } from 'vitest';

import { scoreKeep, hasScoringDice, legalKeeps } from '../src/scoring.js';
import { WILD, type Face, type Pip } from '../src/types.js';
import { allMultisets, referenceScoreWithWilds } from './helpers/reference.js';

const dice = (text: string): Face[] =>
  [...text].map((char) => (char === 'W' ? WILD : (Number(char) as Pip)));

describe('a lone Devil\'s Head', () => {
  it('scores as a 1 on its own', () => {
    expect(scoreKeep([WILD])?.points).toBe(100);
    expect(scoreKeep([WILD])?.resolved).toEqual([1]);
  });

  it('never lets a throw farkle', () => {
    expect(hasScoringDice(dice('W'))).toBe(true);
    expect(hasScoringDice(dice('WWWWWW'))).toBe(true);
    // A throw that would otherwise farkle outright, plus one wild.
    expect(hasScoringDice(dice('22334W'))).toBe(true);
  });
});

describe('golden vectors for wildcard resolution', () => {
  const cases: [string, number][] = [
    ['WW', 200], // two ones beats a 1+5 (150) or two fives (100)
    ['WWW', 1000], // three ones, not three fives (300)
    ['66W', 600], // completes triple sixes, not a lone six (illegal) + single
    ['6666W', 2400], // 2400 = 600 * 2^2, five-of-a-kind sixes
    ['1234W', 500], // straight low over four loose singles
    ['2345W', 750], // straight high over a straight low reading (500)
    ['12345W', 1500], // full straight
    ['22W', 200], // resolves to a third 2, not a 1/5 single
  ];

  it.each(cases)('%s scores %i at best', (text, expected) => {
    expect(scoreKeep(dice(text))?.points).toBe(expected);
  });

  it('resolves 22W to a 2, not a loose single', () => {
    const scored = scoreKeep(dice('22W'));
    expect(scored?.resolved).toEqual([2, 2, 2]);
    expect(scored?.combos).toHaveLength(1);
    expect(scored?.combos[0]).toMatchObject({ kind: 'OfAKind', wilds: 1 });
  });

  it('marks how many dice in each combo were a resolved wildcard', () => {
    const scored = scoreKeep(dice('6666W'));
    expect(scored?.combos).toHaveLength(1);
    expect(scored?.combos[0]).toMatchObject({ kind: 'OfAKind', points: 2400, wilds: 1 });
  });

  it('keeps resolved aligned with the original, non-contiguous input order', () => {
    // W . W . 3  →  wild, 2, wild, 4, 3 — wilds are not adjacent.
    const scored = scoreKeep(dice('W2W43'));
    expect(scored).not.toBeNull();
    expect(scored!.resolved).toHaveLength(5);
    // Positions 1, 3, 4 (the real dice) must pass through unchanged.
    expect(scored!.resolved[1]).toBe(2);
    expect(scored!.resolved[3]).toBe(4);
    expect(scored!.resolved[4]).toBe(3);
  });
});

describe('legalKeeps resolves wildcards inside each option', () => {
  it('the best option for 2 3 4 5 W is the high straight, not the low one', () => {
    const options = legalKeeps(dice('2345W'));
    expect(options[0]?.points).toBe(750);
    expect(options[0]?.resolved).toContain(6);
  });
});

describe('replacing a face with a wildcard never scores less', () => {
  for (let size = 1; size <= 6; size++) {
    it(`holds over every multiset of ${size} dice`, () => {
      for (const faces of allMultisets(size)) {
        const before = scoreKeep(faces);
        if (before === null) {
          continue;
        }
        for (let position = 0; position < faces.length; position++) {
          const wildcarded: Face[] = [...faces];
          wildcarded[position] = WILD;
          const after = scoreKeep(wildcarded);
          expect(after, `keep ${faces.join('')}, wildcard at ${position}`).not.toBeNull();
          expect(after!.points).toBeGreaterThanOrEqual(before.points);
        }
      }
    });
  }
});

describe('against an independent brute-force oracle', () => {
  it('agrees for every one-wildcard throw of every size', () => {
    for (let size = 1; size <= 6; size++) {
      for (const rest of allMultisets(size - 1)) {
        const faces: Face[] = [WILD, ...rest];
        const actual = scoreKeep(faces);
        const expected = referenceScoreWithWilds(faces);
        expect(actual === null ? null : actual.points, `keep ${faces.join('')}`).toBe(expected);
      }
    }
  });

  it('agrees for every two-wildcard throw of every size', () => {
    for (let size = 2; size <= 6; size++) {
      for (const rest of allMultisets(size - 2)) {
        const faces: Face[] = [WILD, WILD, ...rest];
        const actual = scoreKeep(faces);
        const expected = referenceScoreWithWilds(faces);
        expect(actual === null ? null : actual.points, `keep ${faces.join('')}`).toBe(expected);
      }
    }
  });

  it('agrees for every three-wildcard throw up to 5 dice', () => {
    for (let size = 3; size <= 5; size++) {
      for (const rest of allMultisets(size - 3)) {
        const faces: Face[] = [WILD, WILD, WILD, ...rest];
        const actual = scoreKeep(faces);
        const expected = referenceScoreWithWilds(faces);
        expect(actual === null ? null : actual.points, `keep ${faces.join('')}`).toBe(expected);
      }
    }
  });

  it('agrees on the all-wild throws of every size, including six', () => {
    for (let size = 1; size <= 6; size++) {
      const faces: Face[] = new Array(size).fill(WILD);
      const actual = scoreKeep(faces);
      const expected = referenceScoreWithWilds(faces);
      expect(actual === null ? null : actual.points, `keep ${faces.join('')}`).toBe(expected);
    }
  });
});
