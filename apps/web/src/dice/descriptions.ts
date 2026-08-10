/** One-line blurbs on what makes each die different — the loadout picker keeps just the name; this is where the "why" lives. */
export const DIE_DESCRIPTIONS: Record<string, string> = {
  balanced: 'A fair cube — every face equally likely.',
  weighted: 'Loaded toward 1 — two in three throws land there.',
  devil: "One face is a wildcard, but it can't score alone — only inside a bigger combination.",
  odd: 'Slightly favours 1, 3 and 5 over the even faces.',
  cheat: 'A 6 turns up twice as often as on a fair die.',
};
