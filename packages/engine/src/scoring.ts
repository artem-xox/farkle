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

const ZERO_COUNTS: Counts = [0, 0, 0, 0, 0, 0];

/**
 * Every combination that can be taken out of `real` physical dice plus
 * `wild` resolved wildcards right now. A Devil's Head can never complete a
 * `Single` on its own — see docs/RULES.md §11 — so a face's `Single`
 * candidate only exists when a *real* die shows it; `OfAKind` and the
 * straights are free to draw on wildcards since they always involve at
 * least the other two-plus dice a wild alone could never provide. Enumeration
 * order fixes the order of `combos` in a result, which keeps output stable
 * across runs.
 */
function candidateCombos(real: Counts, wild: Counts): Combo[] {
  const candidates: Combo[] = [];
  const total = (face: Pip): number => real[face - 1] + wild[face - 1];

  for (const face of PIPS) {
    const points = SINGLE_POINTS[face];
    if (points !== undefined && real[face - 1] > 0) {
      candidates.push({ kind: 'Single', faces: [face], points, wilds: 0 });
    }
  }

  for (const face of PIPS) {
    const available = total(face);
    for (let count = 3; count <= available; count++) {
      candidates.push({
        kind: 'OfAKind',
        faces: Array<Pip>(count).fill(face),
        points: ofAKindPoints(face, count),
        wilds: 0,
      });
    }
  }

  const has = (face: Pip): boolean => total(face) > 0;
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
 * Best full-cover partition of `real` physical dice plus `wild` resolved
 * wildcards, or null if they cannot all be covered by combinations.
 * Memoised on both count vectors — a real match only ever produces a small
 * number of distinct (real, wild) pairs, so this stays effectively free.
 * Greedy evaluation would be wrong — see docs/RULES.md §5.
 *
 * Each candidate combo consumes wildcards before real dice of the same face
 * (except `Single`, which never touches a wildcard at all): that leaves as
 * many real dice as possible for whatever `Single`s the rest of the
 * partition still needs, which is the only allocation that can ever matter,
 * since only `Single` cares which units are real.
 */
const partitionCache = new Map<string, Partition | null>();

function bestPartition(real: Counts, wild: Counts): Partition | null {
  if (totalOf(real) + totalOf(wild) === 0) {
    return { points: 0, combos: [] };
  }

  const key = `${real.join(',')}|${wild.join(',')}`;
  const cached = partitionCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best: Partition | null = null;
  for (const template of candidateCombos(real, wild)) {
    const nextReal = [...real] as [number, number, number, number, number, number];
    const nextWild = [...wild] as [number, number, number, number, number, number];

    const neededPerFace = new Map<Pip, number>();
    for (const face of template.faces) {
      neededPerFace.set(face, (neededPerFace.get(face) ?? 0) + 1);
    }

    let wildsUsed = 0;
    for (const [face, needed] of neededPerFace) {
      const index = face - 1;
      if (template.kind === 'Single') {
        nextReal[index] -= needed;
        continue;
      }
      const useWild = Math.min(needed, nextWild[index]!);
      nextWild[index]! -= useWild;
      nextReal[index] -= needed - useWild;
      wildsUsed += useWild;
    }

    const combo: Combo = wildsUsed === 0 ? template : { ...template, wilds: wildsUsed };
    const rest = bestPartition(nextReal, nextWild);
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
    const plain = bestPartition(counts, ZERO_COUNTS);
    return plain === null ? null : { points: plain.points, combos: plain.combos, assignment: [] };
  }

  const key = `${counts.join(',')}|${wilds}`;
  const cached = wildPartitionCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let best: WildPartition | null = null;
  for (const assignment of wildAssignments(wilds)) {
    const assignmentCounts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    for (const pip of assignment) {
      assignmentCounts[pip - 1]++;
    }
    const partition = bestPartition(counts, assignmentCounts);
    if (partition === null) {
      continue;
    }
    if (
      best === null ||
      partition.points > best.points ||
      (partition.points === best.points && compareAssignments(assignment, best.assignment) < 0)
    ) {
      best = { points: partition.points, combos: partition.combos, assignment };
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
 * result, but can never complete a `Single` by itself — see docs/RULES.md
 * §11. Returns null if the keep is illegal: it is empty, or some die does
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
 * Whether *some* non-empty subset of `faces` is a legal keep — a throw with
 * none is a farkle. A direct check rather than `legalKeeps(faces).length >
 * 0`: this runs on every throw (and, via `packages/bots/src/odds.ts`, up to
 * 6^6 times per distinct loadout), so it stays a handful of face-count
 * comparisons instead of enumerating up to 63 subsets.
 *
 * A real `1` or `5` always scores alone, same as ever. A Devil's Head only
 * scores as part of a bigger combination (see `candidateCombos`), but for
 * *existence* that's still cheap to decide without building the combination:
 * some face can reach a triple once enough wildcards top it up (they're free
 * to all pile onto whichever face is neediest, since only one combination
 * has to exist), or a straight is missing no more distinct faces than there
 * are wildcards to fill them.
 */
export function hasScoringDice(faces: readonly Face[]): boolean {
  const pips = faces.filter((face): face is Pip => !isWild(face));
  const wildCount = faces.length - pips.length;
  const counts = countFaces(pips);

  if (counts[0] > 0 || counts[4] > 0) {
    return true;
  }
  if (counts.some((count) => count + wildCount >= 3)) {
    return true;
  }
  const missing = (needed: readonly Pip[]): number =>
    needed.reduce((total, face) => total + (counts[face - 1] === 0 ? 1 : 0), 0);
  return (
    missing([1, 2, 3, 4, 5]) <= wildCount ||
    missing([2, 3, 4, 5, 6]) <= wildCount ||
    missing(PIPS) <= wildCount
  );
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
