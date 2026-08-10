#!/usr/bin/env node
// Template for tuning a new or rebalanced die against the 57-63% win6 band
// (docs/DESIGN.md §5). Edit the `CANDIDATES` list below with whatever
// weight sets you're comparing, run it, and read off farkle/EV/win6 for
// each. This is what produced the shipped `trader`, `trinity`, `imp` and
// `worn` weights, and the retuned `weighted` and `devil` — kept here rather
// than thrown away so the next die doesn't start from a blank editor.
//
// Usage:
//   npm run build
//   node scripts/dice-balance/sweep-candidates.mjs [--matches 10000]
//
// Start with a few thousand matches per candidate to find the right
// neighbourhood (a couple of minutes for ~20 candidates), then re-run just
// the winner at --matches 40000 (or use roster-report.mjs once it's in
// packages/engine/src/dice.ts) to confirm the number holds up.
import { BALANCED_DIE } from '@farkle/engine';

import { analyticalMetrics, formatPercent, winRateVsOrdinary } from './lib.mjs';

/** [label, weights, wild?] — `wild` is the 1-indexed pip painted as a Devil's Head, if any. */
const CANDIDATES = [
  ['balanced (reference)', [1, 1, 1, 1, 1, 1]],
  ['weighted (shipped)', [3, 2, 2, 2, 2, 2]],
  ['devil (shipped)', [1, 3, 3, 3, 3, 3], 1],
  ['imp (shipped)', [2, 7, 7, 7, 2, 2], 6],
  ['trader (shipped)', [1, 1, 1, 1, 2, 1]],
  ['trinity (shipped)', [1, 1, 4, 1, 1, 1]],
  ['worn (shipped)', [1, 0, 1, 1, 1, 1]],
  // Add new candidates here, e.g.:
  // ['my-idea [2,3,3,3,2,2] wild6', [2, 3, 3, 3, 2, 2], 6],
];

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return Number(process.argv[index + 1]);
}

const matches = readFlag('matches', 10_000);
console.log(`${matches} matches per candidate. Band: 57-63% win6.\n`);

const columns = [
  ['candidate', 24],
  ['farkle6', 8],
  ['farkle3', 8],
  ['farkle2', 8],
  ['ev6', 7],
  ['ev3', 7],
  ['win6', 7],
  ['win1', 7],
  ['band', 5],
];
console.log(columns.map(([label, width]) => label.padStart(width)).join(' '));

for (const [label, weights, wild] of CANDIDATES) {
  const die = { id: label, name: label, weights, wild };
  const m6 = analyticalMetrics(die, 6);
  const m3 = analyticalMetrics(die, 3);
  const m2 = analyticalMetrics(die, 2);
  const pure = new Array(6).fill(die);
  const mixed = [die, ...new Array(5).fill(BALANCED_DIE)];
  const r6 = winRateVsOrdinary(pure, matches, { balancedDie: BALANCED_DIE });
  const r1 = winRateVsOrdinary(mixed, matches, { balancedDie: BALANCED_DIE });
  const win6 = r6.a.winRate * 100;
  const inBand = win6 >= 57 && win6 <= 63;
  const cells = [
    label,
    formatPercent(m6.farkleRate),
    formatPercent(m3.farkleRate),
    formatPercent(m2.farkleRate),
    m6.ev.toFixed(0),
    m3.ev.toFixed(1),
    win6.toFixed(1),
    (r1.a.winRate * 100).toFixed(1),
    inBand ? 'yes' : '-',
  ];
  console.log(cells.map((cell, index) => String(cell).padStart(columns[index][1])).join(' '));
}
