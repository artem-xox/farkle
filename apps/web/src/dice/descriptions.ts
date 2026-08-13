import { WILD, type DieSpec, type Face } from '@farkle/engine';

/**
 * The face worth showing a die on, statically, in a picker or card. A die
 * with a wild pip shows that — the point of the card is "what's special
 * about this die", and for `devil`/`imp` that pip never shows its printed
 * number at all (it's painted over as the Devil's Head). Every other die
 * just shows `1`; there's nothing more representative about any one face.
 */
export function iconicFace(die: DieSpec): Face {
  return die.wild !== undefined ? (die.wildFace ?? WILD) : 1;
}

/** Two-line-max blurbs on what makes each die different — the loadout picker keeps just the name; this is where the "why" lives. Kept short on purpose: the picker card is narrow, and a third line pushes its "Fill all 6" button out of alignment with its neighbours. */
export const DIE_DESCRIPTIONS: Record<string, string> = {
  balanced: 'A fair cube — every face equally likely.',
  weighted: 'Loaded toward 1, the priciest single. Fewer farkles, more points.',
  devil: "A wildcard 1 that only scores in combos — this die keeps no plain 1s.",
  king: 'A wildcard crown on the 2 — both real singles cut thin, leaning hard on 6. Pairs with a Queen for a bonus.',
  queen: 'A wildcard crown on the 6, and both its 1 and 5 singles are muted. Pairs with a King for a bonus.',
  imp: 'A wildcard on the dead 6 — often lands on nothing at all.',
  odd: 'Slightly favours 1, 3 and 5 over the even faces.',
  even: "A faint lean toward 2, 4 and 6 — the odd die's pale opposite.",
  cheat: 'A 6 turns up twice as often. Big triples, dead singles.',
  trader: 'A heavy 5, the cheapest single there is — safety over points.',
  trinity: 'A heavy 3, worthless alone — bets everything on three of a kind.',
  twins: 'A heavy 2, worthless alone — the same bet as Trinity, one face over.',
  unbalanced: 'Ordinary with a thumb on the scale — a bit more 1/2/3, a bit less 4/5/6.',
  worn: 'Its 2 is rubbed smooth and never comes up — one dead face, gone.',
  unlucky: 'Pale and chipped — 1 and 5 turn up just a little less than they should.',
};
