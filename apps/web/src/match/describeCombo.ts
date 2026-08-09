import type { Combo } from '@farkle/engine';

const COUNT_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six'];

/** Names the combination the engine read, so a surprising score can be checked. */
export function describeCombo(combo: Combo): string {
  switch (combo.kind) {
    case 'Single':
      return `a ${combo.faces[0]}`;
    case 'OfAKind':
      return `${COUNT_WORDS[combo.faces.length]} ${combo.faces[0]}s`;
    case 'StraightLow':
      return '1–5 straight';
    case 'StraightHigh':
      return '2–6 straight';
    case 'StraightFull':
      return 'full straight';
  }
}

export function describeCombos(combos: readonly Combo[]): string {
  return combos.map(describeCombo).join(' + ');
}
