/**
 * Dice that always roll the same face.
 *
 * The turn rules are much easier to test with a loadout that produces a chosen
 * throw than with a hunt for a seed that happens to produce one. A loadout of
 * `2 2 3 3 4 4` farkles every time; six `1`s always score 8000.
 */
import type { DieSpec } from '../../src/dice.js';
import type { Face } from '../../src/types.js';

export function fixedDie(face: Face): DieSpec {
  const weights: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  weights[face - 1] = 1;
  return { id: `always-${face}`, name: `Always ${face}`, weights };
}

/** `loadout('223344')` throws exactly 2 2 3 3 4 4, in that order. */
export function loadout(faces: string): DieSpec[] {
  return [...faces].map((char) => fixedDie(Number(char) as Face));
}
