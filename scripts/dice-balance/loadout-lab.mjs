#!/usr/bin/env node
// Experiments with *mixed* six-die loadouts — drawing up to six different
// dice from the roster and combining them freely, rather than the pure
// six-of-one loadouts `roster-report.mjs` measures. Two questions this
// answers that the roster report can't:
//
//   1. Does a "set" die (docs/DESIGN.md §5: trinity, and by the same logic
//      imp) really punish dilution as sharply as the single trinity-vs-5-
//      balanced data point in the doc suggests, across the whole curve?
//   2. Can a hand-picked mix of complementary dice beat the single best pure
//      loadout (`cheat`, win6 62.4%) by combining safety and ceiling instead
//      of choosing one?
//
// Section 1 measures every candidate loadout against six ordinary dice (the
// same baseline as roster-report, so the numbers are directly comparable).
// Section 2 runs a head-to-head round robin among the strongest candidates
// from section 1 — beating the same fixed baseline by different amounts
// doesn't tell you who wins when two candidates actually play each other.
//
// Usage:
//   npm run build
//   node scripts/dice-balance/loadout-lab.mjs [--matches 10000]
import { BALANCED_DIE, DICE } from '@farkle/engine';

import { analyticalMetricsMixed, formatPercent, winRateHeadToHead, winRateVsOrdinary } from './lib.mjs';

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return Number(process.argv[index + 1]);
}

const matches = readFlag('matches', 10_000);

/** Resolve a loadout written as die ids (repeats allowed) to DieSpecs. */
function loadout(...ids) {
  if (ids.length !== 6) {
    throw new RangeError(`loadout needs exactly 6 dice, got ${ids.length}: ${ids.join(',')}`);
  }
  return ids.map((id) => {
    const die = DICE[id];
    if (!die) throw new RangeError(`unknown die id "${id}"`);
    return die;
  });
}

const b = 'balanced';

const CANDIDATES = [
  // Dilution curves for the two "set" dice the docs call out or imply.
  ['trinity x1', loadout('trinity', b, b, b, b, b)],
  ['trinity x3', loadout('trinity', 'trinity', 'trinity', b, b, b)],
  ['trinity x6', loadout('trinity', 'trinity', 'trinity', 'trinity', 'trinity', 'trinity')],
  ['imp x1', loadout('imp', b, b, b, b, b)],
  ['imp x3', loadout('imp', 'imp', 'imp', b, b, b)],
  ['imp x6', loadout('imp', 'imp', 'imp', 'imp', 'imp', 'imp')],
  // Devil's wild sits on a face that never wins alone (docs claim: never
  // safer or less safe from company). Same curve, as a control.
  ['devil x1', loadout('devil', b, b, b, b, b)],
  ['devil x3', loadout('devil', 'devil', 'devil', b, b, b)],
  ['devil x6', loadout('devil', 'devil', 'devil', 'devil', 'devil', 'devil')],
  // Candidate mixed builds.
  ['glue-mix (2worn+2trader+2weighted)', loadout('worn', 'worn', 'trader', 'trader', 'weighted', 'weighted')],
  ['kitchen-sink (one of six non-set dice)', loadout('worn', 'trader', 'weighted', 'odd', 'devil', 'cheat')],
  ['spice (4worn+2devil)', loadout('worn', 'worn', 'worn', 'worn', 'devil', 'devil')],
  ['spice (4trader+2devil)', loadout('trader', 'trader', 'trader', 'trader', 'devil', 'devil')],
  // Pure references, recomputed at this script's seed for a fair comparison.
  ['worn x6', loadout('worn', 'worn', 'worn', 'worn', 'worn', 'worn')],
  ['cheat x6', loadout('cheat', 'cheat', 'cheat', 'cheat', 'cheat', 'cheat')],
];

console.log(`${matches} matches per matchup vs six ordinary dice. Balance band reference: 57-63% win6.\n`);

const columns = [
  ['loadout', 38],
  ['farkle6', 8],
  ['ev6', 7],
  ['win6', 7],
  ['win6 CI95', 15],
];
console.log(columns.map(([label, width]) => label.padStart(width)).join(' '));

const results = [];
for (const [label, dice] of CANDIDATES) {
  const m6 = analyticalMetricsMixed(dice);
  const r6 = winRateVsOrdinary(dice, matches, { balancedDie: BALANCED_DIE });
  const win6 = r6.a.winRate * 100;
  const [lo, hi] = r6.a.winRateCI95;
  results.push({ label, dice, m6, r6, win6 });
  const cells = [
    label,
    formatPercent(m6.farkleRate),
    m6.ev.toFixed(0),
    win6.toFixed(1),
    `[${(lo * 100).toFixed(1)},${(hi * 100).toFixed(1)}]`,
  ];
  console.log(cells.map((cell, index) => String(cell).padStart(columns[index][1])).join(' '));
}

// Round robin among the strongest-looking candidates: beating the same
// balanced baseline by different margins doesn't tell you who wins when two
// candidates actually play each other.
const FINALIST_LABELS = [
  'worn x6',
  'cheat x6',
  'glue-mix (2worn+2trader+2weighted)',
  'kitchen-sink (one of six non-set dice)',
  'trinity x6',
  'spice (4worn+2devil)',
];
const finalists = FINALIST_LABELS.map((label) => {
  const found = results.find((r) => r.label === label);
  if (!found) throw new Error(`finalist "${label}" not found among candidates above`);
  return found;
});

console.log('\nHead-to-head round robin among finalists (row vs column, row\'s win rate):\n');
const header = ['', ...finalists.map((f) => f.label.slice(0, 10))];
console.log(header.map((h, i) => h.padStart(i === 0 ? 40 : 12)).join(' '));

for (const rowFinalist of finalists) {
  const cells = [rowFinalist.label.slice(0, 40).padStart(40)];
  for (const colFinalist of finalists) {
    if (rowFinalist === colFinalist) {
      cells.push('-'.padStart(12));
      continue;
    }
    const r = winRateHeadToHead(rowFinalist.dice, colFinalist.dice, matches);
    cells.push((r.a.winRate * 100).toFixed(1).padStart(12));
  }
  console.log(cells.join(' '));
}
