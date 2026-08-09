/**
 * Dice that always roll the same face.
 *
 * The turn rules are much easier to test with a loadout that produces a chosen
 * throw than with a hunt for a seed that happens to produce one. A loadout of
 * `2 2 3 3 4 4` farkles every time; six `1`s always score 8000.
 */
import type { DieSpec } from '../../src/dice.js';
import type { Pip } from '../../src/types.js';

export function fixedDie(face: Pip): DieSpec {
  const weights: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  weights[face - 1] = 1;
  return { id: `always-${face}`, name: `Always ${face}`, weights };
}

/** A die that always rolls its Devil's Head — always produces `WILD`. */
export function fixedWildDie(): DieSpec {
  return { id: 'always-wild', name: 'Always wild', weights: [1, 0, 0, 0, 0, 0], wild: 1 };
}

/** `loadout('223344')` throws exactly 2 2 3 3 4 4, in that order. */
export function loadout(faces: string): DieSpec[] {
  return [...faces].map((char) => fixedDie(Number(char) as Pip));
}
