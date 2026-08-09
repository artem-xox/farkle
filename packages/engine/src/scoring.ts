import { type DieSpec } from './dice.js';
import {
  DICE_PER_TURN,
  isWild,
  PIPS,
  type Combo,
  type Counts,
  type Face,
  type KeepOption,
  type Pip,
} from './types.js';

/** Value of three of a kind, indexed by `face - 1`. */
const TRIPLE_POINTS: readonly number[] = [1000, 200, 300, 400, 500, 600];

const SINGLE_POINTS: Readonly<Partial<Record<Pip, number>>> = { 1: 100, 5: 50 };

const STRAIGHT_LOW_POINTS = 500;
const STRAIGHT_HIGH_POINTS = 750;
const STRAIGHT_FULL_POINTS = 1500;

/**
 * Four or more of a kind doubles from the triple value for each extra die.
 * This is a single indivisible combination, not a triple plus leftovers.
 */
export function ofAKindPoints(face: Pip, count: number): number {
  if (count < 3 || count > 6) {
    throw new RangeError(`n-of-a-kind is defined for 3..6 dice, got ${count}`);
  }
  return TRIPLE_POINTS[face - 1]! * (1 << (count - 3));
}

export function countFaces(faces: readonly Pip[]): Counts {
  const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const face of faces) {
    counts[face - 1]++;
  }
  return counts;
}

export function countsToFaces(counts: Counts): Pip[] {
  const faces: Pip[] = [];
  for (const face of PIPS) {
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
 * across runs. `wilds` is always 0 here — this is the physical-only search;
 * `bestPartitionWithWilds` attributes wildcards afterwards.
 */
function candidateCombos(counts: Counts): Combo[] {
  const candidates: Combo[] = [];

  for (const face of PIPS) {
    const points = SINGLE_POINTS[face];
    if (points !== undefined && counts[face - 1] > 0) {
      candidates.push({ kind: 'Single', faces: [face], points, wilds: 0 });
    }
  }

  for (const face of PIPS) {
    const available = counts[face - 1];
    for (let count = 3; count <= available; count++) {
      candidates.push({
        kind: 'OfAKind',
        faces: Array<Pip>(count).fill(face),
        points: ofAKindPoints(face, count),
        wilds: 0,
      });
    }
  }

  const has = (face: Pip): boolean => counts[face - 1] > 0;
  if (has(1) && has(2) && has(3) && has(4) && has(5)) {
    candidates.push({
      kind: 'StraightLow',
      faces: [1, 2, 3, 4, 5],
      points: STRAIGHT_LOW_POINTS,
      wilds: 0,
    });
  }
  if (has(2) && has(3) && has(4) && has(5) && has(6)) {
    candidates.push({
      kind: 'StraightHigh',
      faces: [2, 3, 4, 5, 6],
      points: STRAIGHT_HIGH_POINTS,
      wilds: 0,
    });
  }
  if (PIPS.every(has)) {
    candidates.push({
      kind: 'StraightFull',
      faces: [1, 2, 3, 4, 5, 6],
      points: STRAIGHT_FULL_POINTS,
      wilds: 0,
    });
  }

  return candidates;
}

interface Partition {
  readonly points: number;
  readonly combos: readonly Combo[];
}

/**
 * Best full-cover partition of `counts`, or null if the dice cannot all be
 * covered by combinations. Memoised on the count vector; there are only 924
 * reachable vectors, so the exhaustive search is effectively free and no
 * heuristic is needed. Greedy evaluation would be wrong — see docs/RULES.md §5.
 *
 * Physical pips only — no wildcards. `bestPartitionWithWilds` below is what
 * every public entry point actually calls; this stays the fast, well-tested
 * core it fans out to per wildcard assignment.
 */
const partitionCache = new Map<string, Partition | null>();

function bestPartition(counts: Counts): Partition | null {
  if (totalOf(counts) === 0) {
    return { points: 0, combos: [] };
  }

  const key = counts.join(',');
  const cached = partitionCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best: Partition | null = null;
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
 * Every non-decreasing sequence of `count` pips — the distinct multisets a
 * player's wildcards can resolve to. `count` is at most `DICE_PER_TURN`, so
 * this is at most C(11, 5) = 462 sequences, generated once per distinct
 * (counts, wild count) pair thanks to the cache below.
 */
function wildAssignments(count: number): Pip[][] {
  const results: Pip[][] = [];
  const current: Pip[] = [];

  function build(remaining: number, minPip: Pip): void {
    if (remaining === 0) {
      results.push([...current]);
      return;
    }
    for (let pip = minPip; pip <= 6; pip++) {
      current.push(pip as Pip);
      build(remaining - 1, pip as Pip);
      current.pop();
    }
  }

  build(count, 1);
  return results;
}

function compareAssignments(a: readonly Pip[], b: readonly Pip[]): number {
  for (let index = 0; index < a.length; index++) {
    const delta = a[index]! - b[index]!;
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

/**
 * Marks how many of each combo's faces were actually a resolved wildcard
 * rather than a die that showed that pip. Combos of the same face are
 * fungible, so which specific combo "gets" a given wildcard is arbitrary —
 * this walks `combos` in order and claims wildcards greedily per face, which
 * is deterministic and always attributes the right total per face.
 */
function attributeWilds(combos: readonly Combo[], assignment: readonly Pip[]): Combo[] {
  const remaining: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const pip of assignment) {
    remaining[pip - 1]++;
  }
  return combos.map((combo) => {
    let wilds = 0;
    for (const face of combo.faces) {
      const index = face - 1;
      if (remaining[index]! > 0) {
        remaining[index]!--;
        wilds++;
      }
    }
    return { ...combo, wilds };
  });
}

interface WildPartition {
  readonly points: number;
  readonly combos: readonly Combo[];
  /** The pips this partition's wildcards resolved to, ascending. */
  readonly assignment: readonly Pip[];
}

/**
 * Best full-cover partition of `counts` plus `wilds` wildcards read however
 * most favours the player. Tries every way to resolve the wildcards to
 * concrete pips and keeps the highest-scoring one — ties broken by the
 * lexicographically smallest assignment, so the result is deterministic
 * rather than dependent on enumeration order. Memoised the same way as
 * `bestPartition`: the (counts, wilds) pairs a real match can produce number
 * in the low thousands at most.
 */
const wildPartitionCache = new Map<string, WildPartition | null>();

function bestPartitionWithWilds(counts: Counts, wilds: number): WildPartition | null {
  if (wilds === 0) {
    const plain = bestPartition(counts);
    return plain === null ? null : { points: plain.points, combos: plain.combos, assignment: [] };
  }

  const key = `${counts.join(',')}|${wilds}`;
  const cached = wildPartitionCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best: WildPartition | null = null;
  for (const assignment of wildAssignments(wilds)) {
    const merged = [...counts] as [number, number, number, number, number, number];
    for (const pip of assignment) {
      merged[pip - 1]++;
    }
    const partition = bestPartition(merged);
    if (partition === null) {
      continue;
    }
    if (
      best === null ||
      partition.points > best.points ||
      (partition.points === best.points && compareAssignments(assignment, best.assignment) < 0)
    ) {
      best = {
        points: partition.points,
        combos: attributeWilds(partition.combos, assignment),
        assignment,
      };
    }
  }

  wildPartitionCache.set(key, best);
  return best;
}

export interface ScoredKeep {
  readonly points: number;
  readonly combos: readonly Combo[];
  /** `faces` as given to `scoreKeep`, with every `WILD` resolved to a pip. */
  readonly resolved: readonly Pip[];
}

/**
 * Value of keeping exactly these dice, read the way most favourable to the
 * player. A Devil's Head (`WILD`) is resolved to whichever pip maximises the
 * result. Returns null if the keep is illegal: it is empty, or some die does
 * not participate in any combination under the best reading.
 */
export function scoreKeep(faces: readonly Face[]): ScoredKeep | null {
  if (faces.length === 0) {
    return null;
  }

  const pips: Pip[] = [];
  let wildCount = 0;
  for (const face of faces) {
    if (isWild(face)) {
      wildCount++;
    } else {
      pips.push(face);
    }
  }

  const best = bestPartitionWithWilds(countFaces(pips), wildCount);
  if (best === null) {
    return null;
  }

  const resolved: Pip[] = [];
  let nextAssigned = 0;
  for (const face of faces) {
    resolved.push(isWild(face) ? best.assignment[nextAssigned++]! : face);
  }

  return { points: best.points, combos: best.combos, resolved };
}

export function isLegalKeep(faces: readonly Face[]): boolean {
  return scoreKeep(faces) !== null;
}

/**
 * Whether a throw scores at all. A throw with no scoring dice is a farkle.
 * Equivalent to `legalKeeps(...).length > 0`, and asserted to be so by the
 * exhaustive tests; this form avoids enumerating 63 subsets per throw.
 *
 * A Devil's Head always scores — worst case it stands alone as a `1` — so any
 * throw containing one can never farkle.
 */
export function hasScoringDice(faces: readonly Face[]): boolean {
  const pips = faces.filter((face): face is Pip => !isWild(face));
  if (pips.length < faces.length) {
    return true;
  }
  const counts = countFaces(pips);
  if (counts[0] > 0 || counts[4] > 0) {
    return true;
  }
  return counts.some((count) => count >= 3);
}

/** Sorted, comma-joined die ids — a canonical key for "which dice, ignoring order". */
function diceIdKey(dice: readonly DieSpec[]): string {
  return dice
    .map((die) => die.id)
    .sort()
    .join(',');
}

/**
 * Every legal keep available from a throw, best first.
 *
 * Deduplicated by the multiset of kept faces — two dice showing the same value
 * are interchangeable — with the lowest-indexed representative retained. Both
 * `points` and `diceLeft` matter to callers: taking the most points often means
 * throwing a single die next, which farkles about two thirds of the time.
 *
 * `dice`, when given, must be the specs that produced `thrown`, one per index.
 * Two keeps can take the same faces for the same points and still be
 * different choices — a keep that leaves a Devil's Head in play is not the
 * same as one that leaves an ordinary die — so with `dice` present the
 * dedup and the resulting `diceLeftSpecs` distinguish them instead of
 * treating a loadout as if every die were interchangeable. Without `dice`
 * this reduces to the original, die-identity-blind behaviour.
 */
export function legalKeeps(thrown: readonly Face[], dice?: readonly DieSpec[]): KeepOption[] {
  if (thrown.length > DICE_PER_TURN) {
    throw new RangeError(`a throw holds at most ${DICE_PER_TURN} dice, got ${thrown.length}`);
  }
  if (dice !== undefined && dice.length !== thrown.length) {
    throw new RangeError(
      `legalKeeps: ${dice.length} dice given for a throw of ${thrown.length} faces`,
    );
  }

  const options: { option: KeepOption; diceLeftKey: string }[] = [];
  const seen = new Set<string>();

  for (let mask = 1; mask < 1 << thrown.length; mask++) {
    // Sorted by face so that `indices[i]` and `faces[i]` describe the same die.
    // A Devil's Head sorts after every pip — its rank has no other meaning.
    const selected: { index: number; face: Face }[] = [];
    for (let index = 0; index < thrown.length; index++) {
      if (mask & (1 << index)) {
        selected.push({ index, face: thrown[index]! });
      }
    }
    selected.sort((a, b) => (isWild(a.face) ? 7 : a.face) - (isWild(b.face) ? 7 : b.face));
    const indices = selected.map((entry) => entry.index);
    const faces = selected.map((entry) => entry.face);

    const kept = new Set(indices);
    const diceLeftSpecs = dice?.filter((_, index) => !kept.has(index));
    const diceLeftKey = diceLeftSpecs === undefined ? '' : diceIdKey(diceLeftSpecs);

    const key = dice === undefined ? faces.join('') : `${faces.join('')}|${diceLeftKey}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const scored = scoreKeep(faces);
    if (scored === null) {
      continue;
    }

    options.push({
      option: {
        indices,
        faces,
        resolved: scored.resolved,
        points: scored.points,
        combos: scored.combos,
        diceLeft: thrown.length - faces.length,
        ...(diceLeftSpecs !== undefined ? { diceLeftSpecs } : {}),
      },
      diceLeftKey,
    });
  }

  options.sort(
    (a, b) =>
      b.option.points - a.option.points ||
      b.option.diceLeft - a.option.diceLeft ||
      a.option.faces.join('').localeCompare(b.option.faces.join('')) ||
      a.diceLeftKey.localeCompare(b.diceLeftKey),
  );
  return options.map((entry) => entry.option);
}

/** The highest-scoring legal keep, or null if the throw farkles. */
export function bestKeep(thrown: readonly Face[], dice?: readonly DieSpec[]): KeepOption | null {
  return legalKeeps(thrown, dice)[0] ?? null;
}
