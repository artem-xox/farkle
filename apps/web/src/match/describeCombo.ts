import type { Combo } from '@farkle/engine';

const COUNT_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six'];
const WILD_COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

/** "(one devil)" / "(two devils)" for a combo that used a resolved Devil's Head, else nothing. */
function wildSuffix(combo: Combo): string {
  if (combo.wilds === 0) {
    return '';
  }
  const noun = combo.wilds === 1 ? 'devil' : 'devils';
  return ` (${WILD_COUNT_WORDS[combo.wilds]} ${noun})`;
}

/** Names the combination the engine read, so a surprising score can be checked. */
export function describeCombo(combo: Combo): string {
  const base = ((): string => {
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
  })();
  return base + wildSuffix(combo);
}

export function describeCombos(combos: readonly Combo[]): string {
  return combos.map(describeCombo).join(' + ');
}
