#!/usr/bin/env node
// Full round robin among every pure six-of-one dice set plus a handful of
// hand-picked mixed "crown" sets, all played by the `smart` bot preset at
// `target: 8000` — a report requested to see, for the whole roster at once,
// who is stronger or weaker against whom (not just against six ordinary
// dice, which `roster-report.mjs` already covers).
//
// Usage:
//   npm run build
//   node scripts/dice-balance/set-round-robin.mjs [--matches 5000] [--out results.json]
import { writeFileSync } from 'node:fs';

import { DICE } from '@farkle/engine';

import { winRateHeadToHead } from './lib.mjs';

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const matches = Number(readFlag('matches', 5000));
const outPath = readFlag('out', null);
const target = 8000;
const preset = 'smart';

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

// Every pure six-of-one set from the roster, in `DICE` insertion order.
const PURE_SETS = Object.keys(DICE).map((id) => [id, loadout(id, id, id, id, id, id)]);

// Three custom mixed "crown" sets requested for this report.
const CUSTOM_SETS = [
  ['3 king + 3 queen', loadout('king', 'king', 'king', 'queen', 'queen', 'queen')],
  ['2 king + 2 queen + 2 worn', loadout('king', 'king', 'queen', 'queen', 'worn', 'worn')],
  ['2 king + 2 queen + 2 cheat', loadout('king', 'king', 'queen', 'queen', 'cheat', 'cheat')],
];

const SETS = [...PURE_SETS, ...CUSTOM_SETS];

console.error(
  `${SETS.length} sets, ${(SETS.length * (SETS.length - 1)) / 2} pairings, ${matches} matches each, preset=${preset}, target=${target}`,
);

const matrix = {};
for (const [label] of SETS) matrix[label] = {};

let done = 0;
const total = (SETS.length * (SETS.length - 1)) / 2;
const startedAt = Date.now();
for (let i = 0; i < SETS.length; i++) {
  const [labelA, diceA] = SETS[i];
  for (let j = i + 1; j < SETS.length; j++) {
    const [labelB, diceB] = SETS[j];
    const r = winRateHeadToHead(diceA, diceB, matches, { preset, target });
    matrix[labelA][labelB] = r.a.winRate;
    matrix[labelB][labelA] = r.b.winRate;
    done++;
    if (done % 10 === 0 || done === total) {
      const elapsed = (Date.now() - startedAt) / 1000;
      console.error(`  ${done}/${total} pairings (${elapsed.toFixed(0)}s elapsed)`);
    }
  }
}

const output = {
  preset,
  target,
  matches,
  sets: SETS.map(([label]) => label),
  matrix,
};

const json = JSON.stringify(output, null, 2);
if (outPath) {
  writeFileSync(outPath, json);
  console.error(`wrote ${outPath}`);
} else {
  console.log(json);
}
