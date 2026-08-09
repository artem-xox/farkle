import { describe, expect, it } from 'vitest';

import {
  bestKeep,
  countFaces,
  hasScoringDice,
  isLegalKeep,
  legalKeeps,
  ofAKindPoints,
  scoreKeep,
} from '../src/scoring.js';
import type { Face, Pip } from '../src/types.js';
import { allMultisets, allThrows, referenceScore } from './helpers/reference.js';

const dice = (text: string): Face[] => [...text].map((char) => Number(char) as Face);

function permutations(faces: readonly Face[]): Face[][] {
  if (faces.length <= 1) {
    return [[...faces]];
  }
  const result: Face[][] = [];
  for (let index = 0; index < faces.length; index++) {
    const rest = [...faces.slice(0, index), ...faces.slice(index + 1)];
    for (const tail of permutations(rest)) {
      result.push([faces[index]!, ...tail]);
    }
  }
  return result;
}

describe('n of a kind', () => {
  it('doubles from the triple value for each extra die', () => {
    const table: Record<Pip, [number, number, number, number]> = {
      1: [1000, 2000, 4000, 8000],
      2: [200, 400, 800, 1600],
      3: [300, 600, 1200, 2400],
      4: [400, 800, 1600, 3200],
      5: [500, 1000, 2000, 4000],
      6: [600, 1200, 2400, 4800],
    };
    for (const [face, expected] of Object.entries(table)) {
      for (let count = 3; count <= 6; count++) {
        expect(ofAKindPoints(Number(face) as Pip, count)).toBe(expected[count - 3]);
      }
    }
  });

  it('rejects counts outside 3..6', () => {
    expect(() => ofAKindPoints(1, 2)).toThrow(RangeError);
    expect(() => ofAKindPoints(1, 7)).toThrow(RangeError);
  });
});

describe('golden vectors from docs/RULES.md §9', () => {
  const scoringThrows: [string, number][] = [
    ['123456', 1500],
    ['123455', 550],
    ['112345', 600],
    ['234566', 750],
    ['111555', 1500],
    ['333332', 1200],
    ['111111', 8000],
    ['666666', 4800],
    ['234666', 600],
    ['122346', 100],
    ['112233', 200],
    ['1111', 2000],
    ['5555', 1000],
    ['2222', 400],
  ];

  it.each(scoringThrows)('%s scores %i at best', (text, expected) => {
    expect(bestKeep(dice(text))?.points).toBe(expected);
  });

  const farkles = ['223344', '223446'];

  it.each(farkles)('%s farkles', (text) => {
    expect(hasScoringDice(dice(text))).toBe(false);
    expect(legalKeeps(dice(text))).toHaveLength(0);
    expect(bestKeep(dice(text))).toBeNull();
  });

  it('reads 1 2 3 4 5 5 as a straight plus a five, not as loose singles', () => {
    const best = bestKeep(dice('123455'));
    expect(best?.points).toBe(550);
    expect(best?.combos.map((combo) => combo.kind).sort()).toEqual(['Single', 'StraightLow']);
  });

  it('reads four fives as one combination rather than a triple plus a single', () => {
    const scored = scoreKeep(dice('5555'));
    expect(scored?.points).toBe(1000);
    expect(scored?.combos).toHaveLength(1);
    expect(scored?.combos[0]?.kind).toBe('OfAKind');
  });
});

describe('keep legality', () => {
  const illegal = ['22', '234', '1112', '234566', '6', '2'];

  it.each(illegal)('%s is not a legal keep', (text) => {
    expect(scoreKeep(dice(text))).toBeNull();
    expect(isLegalKeep(dice(text))).toBe(false);
  });

  const legal = ['1', '5', '222', '12345', '23456', '123456', '1111', '15'];

  it.each(legal)('%s is a legal keep', (text) => {
    expect(isLegalKeep(dice(text))).toBe(true);
  });

  it('treats an empty keep as illegal', () => {
    expect(scoreKeep([])).toBeNull();
    expect(isLegalKeep([])).toBe(false);
  });
});

describe('against the independent reference scorer', () => {
  for (let size = 1; size <= 6; size++) {
    it(`agrees on every multiset of ${size} dice`, () => {
      const multisets = allMultisets(size);
      expect(multisets.length).toBeGreaterThan(0);
      for (const faces of multisets) {
        const actual = scoreKeep(faces);
        const expected = referenceScore(faces);
        expect(actual === null ? null : actual.points, `keep ${faces.join('')}`).toBe(expected);
      }
    });
  }
});

describe('internal consistency of a scored keep', () => {
  it('combos exactly partition the kept dice and sum to the reported points', () => {
    for (let size = 1; size <= 6; size++) {
      for (const faces of allMultisets(size)) {
        const scored = scoreKeep(faces);
        if (scored === null) {
          continue;
        }

        const consumed = countFaces(scored.combos.flatMap((combo) => [...combo.faces]));
        expect(consumed, `keep ${faces.join('')}`).toEqual(countFaces(faces));

        const summed = scored.combos.reduce((total, combo) => total + combo.points, 0);
        expect(summed, `keep ${faces.join('')}`).toBe(scored.points);
      }
    }
  });

  it('does not depend on the order the dice are given in', () => {
    for (const text of ['123455', '111555', '234666']) {
      const base = dice(text);
      const expected = scoreKeep(base)?.points;
      for (const permuted of permutations(base)) {
        expect(scoreKeep(permuted)?.points, `keep ${permuted.join('')}`).toBe(expected);
      }
    }
  });
});

describe('exhaustive properties over all 46 656 six-dice throws', () => {
  it('hasScoringDice agrees with a legal keep existing', () => {
    let farkleCount = 0;
    let count = 0;
    for (const faces of allThrows(6)) {
      count++;
      const scores = hasScoringDice(faces);
      if (!scores) {
        farkleCount++;
      }
      expect(legalKeeps(faces).length > 0, `throw ${faces.join('')}`).toBe(scores);
    }
    expect(count).toBe(46656);
    // A six-dice farkle needs no 1, no 5, no triple, and — unlike standard
    // Farkle — no help from three pairs. The classic 1080 counts only the
    // no-1/no-5/no-triple hands; the extra 360 are the three-pair hands that
    // this variant does not score. See docs/RULES.md §10.
    expect(farkleCount).toBe(1440);
  });

  it('every reported keep is legal, correctly valued, and indexed into the throw', () => {
    for (const faces of allMultisets(6)) {
      const options = legalKeeps(faces);
      for (const option of options) {
        expect([...option.faces]).toEqual(option.indices.map((index) => faces[index]));
        expect(new Set(option.indices).size).toBe(option.indices.length);
        expect(option.diceLeft).toBe(faces.length - option.faces.length);
        expect(scoreKeep(option.faces)?.points).toBe(option.points);
      }
      // Deduplicated by multiset, and ordered best first.
      const keys = options.map((option) => option.faces.join(''));
      expect(new Set(keys).size).toBe(keys.length);
      for (let i = 1; i < options.length; i++) {
        expect(options[i - 1]!.points).toBeGreaterThanOrEqual(options[i]!.points);
      }
    }
  });

  it('indexes correctly into an unsorted throw', () => {
    // Throw: 5 2 1 6 3 4 — the straight uses every die, in scrambled positions.
    const thrown = dice('521634');
    for (const option of legalKeeps(thrown)) {
      expect([...option.faces]).toEqual(option.indices.map((index) => thrown[index]));
    }
    const best = bestKeep(thrown);
    expect(best?.points).toBe(1500);
    expect([...best!.indices].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeping more dice never scores less than the best keep found so far', () => {
    // Adding a scoring die to a legal keep cannot reduce the best achievable score.
    for (const faces of allMultisets(5)) {
      const before = scoreKeep(faces);
      if (before === null) {
        continue;
      }
      for (const extra of [1, 5] as Face[]) {
        const after = scoreKeep([...faces, extra]);
        expect(after, `keep ${faces.join('')} + ${extra}`).not.toBeNull();
        expect(after!.points).toBeGreaterThanOrEqual(before.points);
      }
    }
  });
});
