/**
 * An independent, deliberately naive scorer used as a test oracle.
 *
 * The engine's scorer searches by repeatedly taking one combination and
 * recursing on the remainder. This one enumerates every set partition of the
 * dice and validates each block. The two share no logic, so agreement between
 * them is real evidence rather than a tautology. Bell(6) = 203 partitions, so
 * the cost is irrelevant.
 */
import { isWild, type Face, type Pip } from '../../src/types.js';

export function* setPartitions<T>(items: readonly T[]): Generator<T[][]> {
  if (items.length === 0) {
    yield [];
    return;
  }
  const [first, ...rest] = items as [T, ...T[]];
  for (const partition of setPartitions(rest)) {
    for (let block = 0; block < partition.length; block++) {
      const copy = partition.map((existing) => [...existing]);
      copy[block]!.push(first);
      yield copy;
    }
    yield [[first], ...partition.map((existing) => [...existing])];
  }
}

const TRIPLE_POINTS: Readonly<Record<Pip, number>> = {
  1: 1000,
  2: 200,
  3: 300,
  4: 400,
  5: 500,
  6: 600,
};

/** Value of one block if it is exactly one scoring combination, else null. */
export function comboValue(block: readonly Pip[]): number | null {
  const sorted = [...block].sort((a, b) => a - b);
  const first = sorted[0]!;

  if (sorted.length === 1) {
    if (first === 1) return 100;
    if (first === 5) return 50;
    return null;
  }

  if (sorted.length >= 3 && sorted.length <= 6 && sorted.every((face) => face === first)) {
    return TRIPLE_POINTS[first] * 2 ** (sorted.length - 3);
  }

  const asText = sorted.join('');
  if (asText === '12345') return 500;
  if (asText === '23456') return 750;
  if (asText === '123456') return 1500;

  return null;
}

/** Best score over all full-cover partitions, or null if the dice cannot be covered. */
export function referenceScore(faces: readonly Pip[]): number | null {
  if (faces.length === 0) {
    return null;
  }
  let best: number | null = null;
  for (const partition of setPartitions(faces)) {
    let total = 0;
    let valid = true;
    for (const block of partition) {
      const value = comboValue(block);
      if (value === null) {
        valid = false;
        break;
      }
      total += value;
    }
    if (valid && (best === null || total > best)) {
      best = total;
    }
  }
  return best;
}

/** Every multiset of `size` dice, as non-decreasing face arrays. */
export function allMultisets(size: number, minFace = 1): Pip[][] {
  if (size === 0) {
    return [[]];
  }
  const result: Pip[][] = [];
  for (let face = minFace; face <= 6; face++) {
    for (const rest of allMultisets(size - 1, face)) {
      result.push([face as Pip, ...rest]);
    }
  }
  return result;
}

/** Every ordered throw of `size` dice: 6^size of them. */
export function* allThrows(size: number): Generator<Pip[]> {
  const total = 6 ** size;
  for (let n = 0; n < total; n++) {
    const faces: Pip[] = [];
    let remainder = n;
    for (let position = 0; position < size; position++) {
      faces.push(((remainder % 6) + 1) as Pip);
      remainder = Math.floor(remainder / 6);
    }
    yield faces;
  }
}

/**
 * Independent oracle for a throw that may contain wildcards: brute-forces
 * every one of the (up to 6^wildCount) ways to resolve each `WILD` position
 * to a concrete pip — not just the distinct multisets the engine's own
 * `wildAssignments` enumerates — and defers to `referenceScore` for each.
 * Deliberately does not reuse anything from `src/scoring.ts`.
 */
export function referenceScoreWithWilds(faces: readonly Face[]): number | null {
  const wildPositions: number[] = [];
  const template: Pip[] = faces.map((face) => (isWild(face) ? 1 : face));
  faces.forEach((face, index) => {
    if (isWild(face)) {
      wildPositions.push(index);
    }
  });

  if (wildPositions.length === 0) {
    return referenceScore(template);
  }

  let best: number | null = null;
  const assign = (position: number): void => {
    if (position === wildPositions.length) {
      const score = referenceScore(template);
      if (score !== null && (best === null || score > best)) {
        best = score;
      }
      return;
    }
    for (let pip = 1; pip <= 6; pip++) {
      template[wildPositions[position]!] = pip as Pip;
      assign(position + 1);
    }
  };
  assign(0);
  return best;
}
