import { isWild, type ClientView, type Face, type KeepOption } from '@farkle/engine';

/** Dice the player has clicked, identified by position in `view.thrown`. */
export type Selection = readonly number[];

/** Sorts a Devil's Head after every pip — an arbitrary but stable order, matching `legalKeeps`. */
function faceRank(face: Face): number {
  return isWild(face) ? 7 : face;
}

export function facesKey(faces: readonly Face[]): string {
  return [...faces].sort((a, b) => faceRank(a) - faceRank(b)).join(',');
}

/** Same dice by position, order aside — used to detect "the active combo was tapped again". */
export function sameIndices(a: Selection, b: Selection): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((value, i) => value === sortedB[i]);
}

/**
 * The legal keep matching this selection's face *values*, if any.
 *
 * Compares by face multiset rather than by the exact indices `legalKeeps`
 * picked as its representative: two dice showing the same value are
 * interchangeable for scoring, so clicking the second die showing a 1 must
 * still match the option built around the first one. This is also the whole
 * validity check for a manual selection — asking the engine (`view.keeps`,
 * already computed by `viewOf`) rather than re-deriving scores in the UI,
 * per docs/DESIGN.md §3.
 */
export function matchingKeepOption(
  selection: Selection,
  view: Pick<ClientView, 'thrown' | 'keeps'>,
): KeepOption | null {
  if (selection.length === 0) {
    return null;
  }
  const selectedFaces = selection.map((index) => view.thrown[index]!);
  const key = facesKey(selectedFaces);
  return view.keeps.find((option) => facesKey(option.faces) === key) ?? null;
}
