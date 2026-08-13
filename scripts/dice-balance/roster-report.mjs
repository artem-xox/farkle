#!/usr/bin/env node
// Reports the balance numbers for every die currently in the shipped
// roster (`DICE` from `@farkle/engine`) — the table docs/DESIGN.md §5 is
// built from. Auto-discovers the roster, so it never goes stale the way a
// hardcoded list would: add a die to `packages/engine/src/dice.ts` and it
// shows up here without touching this file.
//
// Usage:
//   npm run build            # this script reads the built packages
//   node scripts/dice-balance/roster-report.mjs [--matches 40000] [--matches-single 20000] [--preset balanced]
import { BALANCED_DIE, DICE } from '@farkle/engine';

import { analyticalMetrics, formatPercent, winRateVsOrdinary } from './lib.mjs';

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return Number(process.argv[index + 1]);
}

function readStringFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const matchesSix = readFlag('matches', 40_000);
const matchesOne = readFlag('matches-single', 20_000);
// Diamond-league numbers since M8 are measured against `smart`, not the
// `balanced` default every other league's numbers still use — pass
// `--preset smart` when re-checking those specifically.
const preset = readStringFlag('preset', 'balanced');

console.log(
  `Balance band is 57-63% win6 (docs/DESIGN.md §5). ${matchesSix} matches for win6, ` +
    `${matchesOne} for win1. 95% CI at 40k matches is roughly ±0.5pp.\n`,
);

const columns = [
  ['die', 10],
  ['farkle6', 8],
  ['farkle3', 8],
  ['farkle2', 8],
  ['ev6', 7],
  ['ev3', 7],
  ['win6', 7],
  ['win6 CI95', 15],
  ['win1', 7],
  ['band', 5],
];
console.log(columns.map(([label, width]) => label.padStart(width)).join(' '));

const rows = [];
for (const die of Object.values(DICE)) {
  const m6 = analyticalMetrics(die, 6);
  const m3 = analyticalMetrics(die, 3);
  const m2 = analyticalMetrics(die, 2);
  const pure = new Array(6).fill(die);
  const mixed = [die, ...new Array(5).fill(BALANCED_DIE)];
  const r6 = winRateVsOrdinary(pure, matchesSix, { balancedDie: BALANCED_DIE, preset });
  const r1 = winRateVsOrdinary(mixed, matchesOne, { balancedDie: BALANCED_DIE, preset });
  const win6 = r6.a.winRate * 100;
  rows.push({ die, m6, m3, m2, r6, r1, win6 });
}

rows.sort((a, b) => a.win6 - b.win6);

for (const { die, m6, m3, m2, r6, r1, win6 } of rows) {
  const [lo, hi] = r6.a.winRateCI95;
  const inBand = win6 >= 57 && win6 <= 63;
  const cells = [
    die.id,
    formatPercent(m6.farkleRate),
    formatPercent(m3.farkleRate),
    formatPercent(m2.farkleRate),
    m6.ev.toFixed(0),
    m3.ev.toFixed(1),
    win6.toFixed(1),
    `[${(lo * 100).toFixed(1)},${(hi * 100).toFixed(1)}]`,
    (r1.a.winRate * 100).toFixed(1),
    inBand ? 'yes' : (die.id === 'balanced' ? '-' : 'NO'),
  ];
  console.log(cells.map((cell, index) => String(cell).padStart(columns[index][1])).join(' '));
}
