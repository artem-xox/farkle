/** One-line blurbs on what makes each die different — the loadout picker keeps just the name; this is where the "why" lives. */
export const DIE_DESCRIPTIONS: Record<string, string> = {
  balanced: 'A fair cube — every face equally likely.',
  weighted: 'Loaded toward 1, the most valuable single — fewer farkles and more points, at no cost.',
  devil: "Its 1 is a rare wildcard: it can't score alone, only inside a bigger combination — and this die has no 1s left.",
  imp: 'A wildcard on the worthless 6 — but three throws in four land on a dead face.',
  odd: 'Slightly favours 1, 3 and 5 over the even faces.',
  cheat: 'A 6 turns up twice as often as on a fair die. Big triples, dead singles.',
  trader: 'A heavy 5 — the cheapest single there is. Safety rather than points.',
  trinity: 'A heavy 3 — worthless alone, so the whole die bets on three of a kind. Worth more as a full set than one at a time.',
  worn: 'Its 2 is rubbed smooth and never comes up. One dead face simply gone.',
};
