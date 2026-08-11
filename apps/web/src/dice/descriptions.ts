import { WILD, type DieSpec, type Face } from '@farkle/engine';

/**
 * The face worth showing a die on, statically, in a picker or card. A die
 * with a wild pip shows that — the point of the card is "what's special
 * about this die", and for `devil`/`imp` that pip never shows its printed
 * number at all (it's painted over as the Devil's Head). Every other die
 * just shows `1`; there's nothing more representative about any one face.
 */
export function iconicFace(die: DieSpec): Face {
  return die.wild !== undefined ? WILD : 1;
}

/** Two-line-max blurbs on what makes each die different — the loadout picker keeps just the name; this is where the "why" lives. Kept short on purpose: the picker card is narrow, and a third line pushes its "Fill all 6" button out of alignment with its neighbours. */
export const DIE_DESCRIPTIONS: Record<string, string> = {
  balanced: 'A fair cube — every face equally likely.',
  weighted: 'Loaded toward 1, the priciest single. Fewer farkles, more points.',
  devil: "A rare wildcard 1 that only scores in combos — this die keeps no plain 1s.",
  imp: 'A wildcard on the dead 6 — often lands on nothing at all.',
  odd: 'Slightly favours 1, 3 and 5 over the even faces.',
  cheat: 'A 6 turns up twice as often. Big triples, dead singles.',
  trader: 'A heavy 5, the cheapest single there is — safety over points.',
  trinity: 'A heavy 3, worthless alone — bets everything on three of a kind.',
  worn: 'Its 2 is rubbed smooth and never comes up — one dead face, gone.',
};
