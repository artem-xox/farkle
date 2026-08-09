import {
  DICE_PER_TURN,
  FACES,
  type Combo,
  type Counts,
  type Face,
  type KeepOption,
} from './types.js';

/** Value of three of a kind, indexed by `face - 1`. */
const TRIPLE_POINTS: readonly number[] = [1000, 200, 300, 400, 500, 600];

const SINGLE_POINTS: Readonly<Partial<Record<Face, number>>> = { 1: 100, 5: 50 };

const STRAIGHT_LOW_POINTS = 500;
const STRAIGHT_HIGH_POINTS = 750;
const STRAIGHT_FULL_POINTS = 1500;

/**
 * Four or more of a kind doubles from the triple value for each extra die.
 * This is a single indivisible combination, not a triple plus leftovers.
 */
export function ofAKindPoints(face: Face, count: number): number {
  if (count < 3 || count > 6) {
    throw new RangeError(`n-of-a-kind is defined for 3..6 dice, got ${count}`);
  }
  return TRIPLE_POINTS[face - 1]! * (1 << (count - 3));
}

export function countFaces(faces: readonly Face[]): Counts {
  const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const face of faces) {
    counts[face - 1]++;
  }
  return counts;
}

export function countsToFaces(counts: Counts): Face[] {
  const faces: Face[] = [];
  for (const face of FACES) {
    for (let n = 0; n < counts[face - 1]; n++) {
      faces.push(face);
    }
  }
  return faces;
}

function totalOf(counts: Counts): number {
  return counts[0] + counts[1] + counts[2] + counts[3] + counts[4] + counts[5];
}

/**
 * Every combination that can be taken out of `counts` right now. Enumeration
 * order fixes the order of `combos` in a result, which keeps output stable
 * across runs.
 */
function candidateCombos(counts: Counts): Combo[] {
  const candidates: Combo[] = [];

  for (const face of FACES) {
    const points = SINGLE_POINTS[face];
    if (points !== undefined && counts[face - 1] > 0) {
      candidates.push({ kind: 'Single', faces: [face], points });
    }
  }

  for (const face of FACES) {
    const available = counts[face - 1];
    for (let count = 3; count <= available; count++) {
      candidates.push({
        kind: 'OfAKind',
        faces: Array<Face>(count).fill(face),
        points: ofAKindPoints(face, count),
      });
    }
  }

  const has = (face: Face): boolean => counts[face - 1] > 0;
  if (has(1) && has(2) && has(3) && has(4) && has(5)) {
    candidates.push({ kind: 'StraightLow', faces: [1, 2, 3, 4, 5], points: STRAIGHT_LOW_POINTS });
  }
  if (has(2) && has(3) && has(4) && has(5) && has(6)) {
    candidates.push({ kind: 'StraightHigh', faces: [2, 3, 4, 5, 6], points: STRAIGHT_HIGH_POINTS });
  }
  if (FACES.every(has)) {
    candidates.push({
      kind: 'StraightFull',
      faces: [1, 2, 3, 4, 5, 6],
      points: STRAIGHT_FULL_POINTS,
    });
  }

  return candidates;
}

export interface ScoredKeep {
  readonly points: number;
  readonly combos: readonly Combo[];
}

/**
 * Best full-cover partition of `counts`, or null if the dice cannot all be
 * covered by combinations. Memoised on the count vector; there are only 924
 * reachable vectors, so the exhaustive search is effectively free and no
 * heuristic is needed. Greedy evaluation would be wrong — see docs/RULES.md §5.
 */
const partitionCache = new Map<string, ScoredKeep | null>();

function bestPartition(counts: Counts): ScoredKeep | null {
  if (totalOf(counts) === 0) {
    return { points: 0, combos: [] };
  }

  const key = counts.join(',');
  const cached = partitionCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best: ScoredKeep | null = null;
  for (const combo of candidateCombos(counts)) {
    const remaining = [...counts] as [number, number, number, number, number, number];
    for (const face of combo.faces) {
      remaining[face - 1]--;
    }
    const rest = bestPartition(remaining);
    if (rest === null) {
      continue;
    }
    const points = combo.points + rest.points;
    if (best === null || points > best.points) {
      best = { points, combos: [combo, ...rest.combos] };
    }
  }

  partitionCache.set(key, best);
  return best;
}

/**
 * Value of keeping exactly these dice, read the way most favourable to the
 * player. Returns null if the keep is illegal: it is empty, or some die does not
 * participate in any combination.
 */
export function scoreKeep(faces: readonly Face[]): ScoredKeep | null {
  if (faces.length === 0) {
    return null;
  }
  const best = bestPartition(countFaces(faces));
  return best === null ? null : { points: best.points, combos: [...best.combos] };
}

export function isLegalKeep(faces: readonly Face[]): boolean {
  return scoreKeep(faces) !== null;
}

/**
 * Whether a throw scores at all. A throw with no scoring dice is a farkle.
 * Equivalent to `legalKeeps(...).length > 0`, and asserted to be so by the
 * exhaustive tests; this form avoids enumerating 63 subsets per throw.
 */
export function hasScoringDice(faces: readonly Face[]): boolean {
  const counts = countFaces(faces);
  if (counts[0] > 0 || counts[4] > 0) {
    return true;
  }
  return counts.some((count) => count >= 3);
}

/**
 * Every legal keep available from a throw, best first.
 *
 * Deduplicated by the multiset of kept faces — two dice showing the same value
 * are interchangeable — with the lowest-indexed representative retained. Both
 * `points` and `diceLeft` matter to callers: taking the most points often means
 * throwing a single die next, which farkles about two thirds of the time.
 */
export function legalKeeps(thrown: readonly Face[]): KeepOption[] {
  if (thrown.length > DICE_PER_TURN) {
    throw new RangeError(`a throw holds at most ${DICE_PER_TURN} dice, got ${thrown.length}`);
  }

  const options: KeepOption[] = [];
  const seen = new Set<string>();

  for (let mask = 1; mask < 1 << thrown.length; mask++) {
    // Sorted by face so that `indices[i]` and `faces[i]` describe the same die.
    const selected: { index: number; face: Face }[] = [];
    for (let index = 0; index < thrown.length; index++) {
      if (mask & (1 << index)) {
        selected.push({ index, face: thrown[index]! });
      }
    }
    selected.sort((a, b) => a.face - b.face);
    const indices = selected.map((entry) => entry.index);
    const faces = selected.map((entry) => entry.face);

    const key = faces.join('');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const scored = scoreKeep(faces);
    if (scored === null) {
      continue;
    }

    options.push({
      indices,
      faces,
      points: scored.points,
      combos: scored.combos,
      diceLeft: thrown.length - faces.length,
    });
  }

  options.sort(
    (a, b) =>
      b.points - a.points ||
      b.diceLeft - a.diceLeft ||
      a.faces.join('').localeCompare(b.faces.join('')),
  );
  return options;
}

/** The highest-scoring legal keep, or null if the throw farkles. */
export function bestKeep(thrown: readonly Face[]): KeepOption | null {
  return legalKeeps(thrown)[0] ?? null;
}
