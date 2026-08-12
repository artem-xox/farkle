import { describe, expect, it } from 'vitest';

import { bestKeep, CROWN_MULTIPLIER, scoreKeep, hasScoringDice, legalKeeps } from '../src/scoring.js';
import { WILD, WILD_KING, WILD_QUEEN, type Face, type Pip } from '../src/types.js';
import { allMultisets, referenceScoreWithWilds } from './helpers/reference.js';

const dice = (text: string): Face[] =>
  [...text].map((char) => (char === 'W' ? WILD : (Number(char) as Pip)));

describe("a Devil's Head with nothing to combine with", () => {
  it('cannot score on its own', () => {
    expect(scoreKeep([WILD])).toBeNull();
  });

  it('does not rescue a throw when no die can join it into a bigger combination', () => {
    expect(hasScoringDice(dice('W'))).toBe(false);
    // 2, 3, 4 plus a wild: no 1, no 5, and the wild can add at most one more
    // die to any single face (never reaching a triple) or fill at most one
    // gap in a straight (both the low and high straight are missing two).
    expect(hasScoringDice(dice('W234'))).toBe(false);
    expect(scoreKeep(dice('W234'))).toBeNull();
  });

  it('two wildcards alone still cannot score — a pair is not a combination', () => {
    expect(scoreKeep(dice('WW'))).toBeNull();
    expect(hasScoringDice(dice('WW'))).toBe(false);
  });
});

describe('a Devil\'s Head that does have something to combine with', () => {
  it('rescues a throw that would otherwise farkle by completing a triple', () => {
    // 2, 2, 3, 3, 4 alone has no 1, no 5, and no triple — but the wild can
    // join either pair to make one, and joining the 3s (300) beats joining
    // the 2s (200). The full six dice still can't all be kept together
    // (nothing covers the leftover pair + spare 4), so this checks the
    // throw's best *available* keep, not a full-cover score.
    expect(hasScoringDice(dice('22334W'))).toBe(true);
    expect(bestKeep(dice('22334W'))?.points).toBe(300);
  });

  it('wildcards can form a combination entirely among themselves', () => {
    // Three wildcards, no real dice at all: they can still form a triple.
    expect(hasScoringDice(dice('WWW'))).toBe(true);
    expect(scoreKeep(dice('WWW'))?.points).toBe(1000);
    // Six wildcards can be read as six 1s.
    expect(scoreKeep(dice('WWWWWW'))?.points).toBe(8000);
  });
});

describe('golden vectors for wildcard resolution', () => {
  const cases: [string, number][] = [
    ['WWW', 1000], // three wildcards as three 1s, not three 5s (300)
    ['66W', 600], // completes triple sixes
    ['6666W', 2400], // 2400 = 600 * 2^2, five-of-a-kind sixes
    ['1234W', 500], // straight low over four loose singles
    ['2345W', 750], // straight high over a straight low reading (500)
    ['12345W', 1500], // full straight
    ['22W', 200], // resolves to a third 2, not a lone single (illegal anyway)
  ];

  it.each(cases)('%s scores %i at best', (text, expected) => {
    expect(scoreKeep(dice(text))?.points).toBe(expected);
  });

  const illegal = ['W', 'WW', 'W234', '2W'];

  it.each(illegal)('%s is not a legal keep', (text) => {
    expect(scoreKeep(dice(text))).toBeNull();
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

  it('never attributes a wildcard to a Single combo', () => {
    // a 1 (real) + three 5s (two real, one wild) — the Single must be the
    // real 1, never the wild, even though both would read the same here.
    const scored = scoreKeep(dice('155W'));
    expect(scored?.points).toBe(600); // 100 (single 1) + 500 (triple 5s)
    const single = scored!.combos.find((combo) => combo.kind === 'Single');
    expect(single).toMatchObject({ wilds: 0 });
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

  it('never offers a keep of a lone wildcard', () => {
    const options = legalKeeps(dice('W234'));
    expect(options.every((option) => !(option.faces.length === 1 && option.faces[0] === WILD))).toBe(
      true,
    );
  });
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

describe('the Crown Bonus (RULES.md §12)', () => {
  it('a King alone resolves exactly like a plain Devil\'s Head — no bonus without a Queen', () => {
    const withKing = scoreKeep([6, 6, WILD_KING]);
    const withDevil = scoreKeep([6, 6, WILD]);
    expect(withKing?.points).toBe(600);
    expect(withKing?.points).toBe(withDevil?.points);
    expect(withKing?.combos.some((combo) => combo.kind === 'CrownBonus')).toBe(false);
  });

  it('a King and a Devil together still do not qualify — the bonus is keyed on the Queen specifically', () => {
    const scored = scoreKeep([6, 6, WILD_KING, WILD]);
    expect(scored?.points).toBe(1200); // 600 * 2^1, four-of-a-kind sixes, no bonus
    expect(scored?.combos.some((combo) => combo.kind === 'CrownBonus')).toBe(false);
  });

  it('a King and a Queen resolved into the same combination pay the Crown Bonus', () => {
    const base = scoreKeep([6, 6, 6, WILD]); // reference: four-of-a-kind sixes, no crown
    expect(base?.points).toBe(1200);

    const crowned = scoreKeep([6, 6, 6, WILD_KING, WILD_QUEEN]);
    const expectedBase = 2400; // five-of-a-kind sixes: 600 * 2^2
    const expectedBonus = Math.round(expectedBase * (CROWN_MULTIPLIER - 1));
    expect(crowned?.points).toBe(expectedBase + expectedBonus);

    const bonusCombo = crowned?.combos.find((combo) => combo.kind === 'CrownBonus');
    expect(bonusCombo).toMatchObject({ faces: [], points: expectedBonus, wilds: 0 });
  });

  it('the Crown Bonus combo keeps points equal to the sum of all combos, same invariant as any other keep', () => {
    const crowned = scoreKeep([6, 6, 6, WILD_KING, WILD_QUEEN]);
    const summed = crowned!.combos.reduce((total, combo) => total + combo.points, 0);
    expect(summed).toBe(crowned!.points);
  });

  it('a lone King (or Queen) still cannot rescue a throw with nothing to combine with', () => {
    expect(scoreKeep([WILD_KING])).toBeNull();
    expect(hasScoringDice([WILD_KING, 2, 3, 4])).toBe(false);
    expect(scoreKeep([WILD_KING, WILD_QUEEN])).toBeNull(); // a pair still isn't a combination
  });

  it('two Queens (no King) never trigger the bonus either — it takes one of each', () => {
    const scored = scoreKeep([6, 6, 6, WILD_QUEEN, WILD_QUEEN]);
    expect(scored?.points).toBe(2400); // five-of-a-kind, plain
    expect(scored?.combos.some((combo) => combo.kind === 'CrownBonus')).toBe(false);
  });
});
