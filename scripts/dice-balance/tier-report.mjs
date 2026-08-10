#!/usr/bin/env node
// Ranks every special (non-balanced) die in the roster by win6 — the
// docs/DESIGN.md §5 balance metric — sorted strongest to weakest.
// Auto-discovers the roster the same way roster-report.mjs does.
//
// This deliberately does *not* auto-assign tiers: the roster is calibrated
// so most dice sit in a tight plateau (docs/DESIGN.md §5's 57-63% band is
// meant to keep them close), so a fixed gap-size threshold would be brittle
// against small roster changes and would sometimes carve a lone die into
// its own tier just because it happens to sit between two close rolls of
// the dice (no pun intended). Read the win6 column and its CI: a gap is
// worth treating as a tier boundary only when the confidence intervals of
// the two dice on either side of it don't overlap.
//
// Usage:
//   npm run build
//   node scripts/dice-balance/tier-report.mjs [--matches 40000]
import { BALANCED_DIE, DICE } from '@farkle/engine';

import { analyticalMetricsMixed, winRateVsOrdinary } from './lib.mjs';

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return Number(process.argv[index + 1]);
}

const matches = readFlag('matches', 40_000);
const specials = Object.values(DICE).filter((die) => die.id !== 'balanced');

console.log(`win6 for every special die, ${matches} matches each, vs 6x balanced.\n`);

const columns = [
  ['die', 10],
  ['win6', 7],
  ['win6 CI95', 15],
  ['farkle6', 8],
  ['ev6', 7],
];
console.log(columns.map(([label, width]) => label.padStart(width)).join(' '));

const rows = [];
for (const die of specials) {
  const pure = new Array(6).fill(die);
  const r = winRateVsOrdinary(pure, matches, { balancedDie: BALANCED_DIE });
  const m = analyticalMetricsMixed(pure);
  rows.push({
    id: die.id,
    win6: r.a.winRate * 100,
    ci: r.a.winRateCI95.map((x) => x * 100),
    farkle6: m.farkleRate * 100,
    ev6: m.ev,
  });
}
rows.sort((a, b) => b.win6 - a.win6);

for (const row of rows) {
  const cells = [
    row.id,
    row.win6.toFixed(2),
    `[${row.ci[0].toFixed(2)},${row.ci[1].toFixed(2)}]`,
    row.farkle6.toFixed(2),
    row.ev6.toFixed(0),
  ];
  console.log(cells.map((cell, index) => String(cell).padStart(columns[index][1])).join(' '));
}
