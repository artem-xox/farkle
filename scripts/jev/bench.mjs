#!/usr/bin/env node
// How well does Jev actually play?
//
// Plays N headless matches of `JevBot` against a `ThresholdBot` preset and
// reports the same numbers `farkle sim` does — win rate with a 95% Wilson
// interval, farkle rate, points per bank — plus the ones only a model has:
// mean confidence, fallback rate, latency and token spend.
//
// This lives here rather than in `farkle sim` on purpose. `runSimulation` is
// synchronous and runs a hundred thousand matches in seconds; this is
// network-bound, costs real money, and is measurement rather than a shipped
// feature. That is exactly the line scripts/ sits on — see
// scripts/dice-balance/README.md.
//
// Usage:
//   npm run build
//   TYPESAFE_API_KEY=… node scripts/jev/bench.mjs [-n 200] [--seed 42]
//                          [--opponent smart] [--target 2000] [--loadout king,queen,…]
//                          [--concurrency 6] [--out results.json] [--yes]
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

import { createPreset, isPresetName, playBotMatchAsync, summarizeMatch, wilsonInterval } from '@farkle/bots';
import { createMatch, DEFAULT_TARGET, DICE, DICE_PER_TURN } from '@farkle/engine';
import { JevBot } from '@farkle/jev';

/** Accepts `--name value`, and `-n` as the documented short form for `--matches`. */
function readFlag(name, fallback, short = null) {
  for (const flag of short ? [`--${name}`, `-${short}`] : [`--${name}`]) {
    const index = process.argv.indexOf(flag);
    if (index !== -1) return process.argv[index + 1];
  }
  return fallback;
}

const matches = Number(readFlag('matches', 200, 'n'));
const seed = Number(readFlag('seed', 42));
const target = Number(readFlag('target', DEFAULT_TARGET));
const concurrency = Number(readFlag('concurrency', 6));
const opponent = readFlag('opponent', 'smart');

/*
 * One flag, applied to *both* seats — unlike `farkle sim`, which takes a
 * loadout per side because it is measuring dice against each other. Here the
 * dice are the control, not the subject: the question is whether Jev reads a
 * set of wildcards as well as `smart` prices one, and giving the two seats
 * different dice would answer a different question badly.
 *
 * `"king"` means six of them; six comma-separated ids mean exactly those.
 * Same spelling `farkle sim` uses (apps/cli/src/sim.ts).
 */
const loadoutIds = readFlag('loadout', 'balanced');
const outPath = readFlag('out', null);
const assumeYes = process.argv.includes('--yes');

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  console.error('TYPESAFE_API_KEY is not set — get a key at https://console.typesafe.ai/keys');
  process.exit(1);
}
if (!isPresetName(opponent)) {
  console.error(`unknown preset "${opponent}"`);
  process.exit(1);
}
if (!Number.isInteger(matches) || matches < 1) {
  console.error(`-n must be a positive integer, got "${matches}"`);
  process.exit(1);
}

function parseLoadout(value) {
  const ids = value.split(',').map((id) => id.trim());
  const dice = ids.map((id) => {
    const die = DICE[id];
    if (!die) {
      console.error(`--loadout: unknown die "${id}" — choose from ${Object.keys(DICE).join(', ')}`);
      process.exit(1);
    }
    return die;
  });
  if (dice.length === 1) return new Array(DICE_PER_TURN).fill(dice[0]);
  if (dice.length !== DICE_PER_TURN) {
    console.error(`--loadout: give 1 die id or exactly ${DICE_PER_TURN}, got ${dice.length}`);
    process.exit(1);
  }
  return dice;
}

const dice = parseLoadout(loadoutIds);

/*
 * Rough, and labelled as such — but measured rather than guessed. Counting
 * decisions across 400 `smart`-vs-`smart` matches gives very close to
 * `target / 200` requests per match for one seat (4.2 at target 800, 9.8 at
 * 2000, 20.1 at 4000), and a state carrying the rules plus a full history
 * measured 2 024 input tokens a call over the first real run. Input is the
 * only billed side ($0.042/MTok); output is free.
 *
 * The point of printing this is to stop somebody starting a run an order of
 * magnitude more expensive than they meant to, not to quote them.
 */
const TOKENS_PER_CALL = 2200;
const USD_PER_MTOK = 0.042;

const estimatedCalls = Math.round((matches * target) / 200);
const estimatedCost = (estimatedCalls * TOKENS_PER_CALL * USD_PER_MTOK) / 1_000_000;
const estimatedMinutes = (estimatedCalls * 0.3) / concurrency / 60;

console.error(
  `jev vs ${opponent} · ${matches} matches · target ${target} · dice ${loadoutIds} · concurrency ${concurrency}\n` +
    `roughly ${estimatedCalls.toLocaleString()} requests, about $${estimatedCost.toFixed(2)} and ` +
    `${Math.ceil(estimatedMinutes)} min — estimates, not a quote.`,
);

if (!assumeYes && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question('spend it? [y/N] ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'y') {
    console.error('nothing sent.');
    process.exit(0);
  }
}

/** Every Jev seat shares one stats object by sharing nothing — totals are summed at the end. */
const jevStats = [];
const fallbackDetails = new Map();

async function playOne(index) {
  // Jev takes seat 0 in every match and the starting player alternates, so
  // going first — a real advantage in a race — is split evenly rather than
  // handed to one side, exactly as `runSimulation` does it.
  const matchSeed = (seed + index * 2654435761) >>> 0;
  const state = createMatch({
    players: [
      { name: 'Jev', loadout: dice },
      { name: opponent, loadout: dice },
    ],
    target,
    seed: matchSeed,
    startingPlayer: index % 2,
  });

  const jev = new JevBot({
    apiKey,
    seed: matchSeed,
    onFallback: (reason) => fallbackDetails.set(reason, (fallbackDetails.get(reason) ?? 0) + 1),
  });
  const result = await playBotMatchAsync(state, [jev, createPreset(opponent, matchSeed ^ 0x9e3779b9)]);

  jevStats.push(jev.stats);
  return summarizeMatch(result.events, 2);
}

/**
 * A fixed pool rather than `Promise.all` over everything. 1 200 requests per
 * minute is the documented ceiling, and six in flight at the ~300ms a call
 * actually takes is 1 200/min exactly — so the default sits on the line
 * rather than over it, and the client's backoff covers the rest.
 */
async function runPool() {
  const summaries = new Array(matches);
  let next = 0;
  let done = 0;
  const startedAt = Date.now();

  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= matches) return;
      summaries[index] = await playOne(index);
      done++;
      // Rewrite one line on a terminal; one line per tenth of the run when
      // the output is a file or a pipe, where \r would produce a single
      // unreadable mega-line.
      const elapsed = (Date.now() - startedAt) / 1000;
      const eta = (elapsed / done) * (matches - done);
      const line = `${done}/${matches} matches · ${Math.round(elapsed)}s elapsed · ~${Math.round(eta)}s left`;
      if (process.stderr.isTTY) {
        process.stderr.write(`\r  ${line}   `);
      } else if (done % Math.max(1, Math.round(matches / 10)) === 0) {
        process.stderr.write(`  ${line}\n`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, matches) }, worker));
  if (process.stderr.isTTY) process.stderr.write('\n');
  return summaries;
}

const summaries = await runPool();

const side = (id) => {
  const banks = summaries.reduce((sum, match) => sum + match.players[id].banks, 0);
  const points = summaries.reduce((sum, match) => sum + match.players[id].bankedPoints, 0);
  const farkles = summaries.reduce((sum, match) => sum + match.players[id].farkles, 0);
  const wins = summaries.filter((match) => match.winner === id).length;
  return {
    wins,
    winRate: wins / matches,
    winRateCI95: wilsonInterval(wins, matches),
    avgBankedPerBank: banks === 0 ? 0 : points / banks,
    farkleRate: banks + farkles === 0 ? 0 : farkles / (banks + farkles),
  };
};

const totals = jevStats.reduce(
  (sum, stats) => ({
    calls: sum.calls + stats.calls,
    inputTokens: sum.inputTokens + stats.inputTokens,
    ms: sum.ms + (stats.meanMs ?? 0) * stats.calls,
    // Weighted by how many Choices each mean is over, so a match that made
    // three decisions does not count as much as one that made ninety.
    confidenceWeighted: sum.confidenceWeighted + (stats.meanConfidence ?? 0) * stats.choices,
    confidenceSamples: sum.confidenceSamples + stats.choices,
    confidenceHistogram: sum.confidenceHistogram.map(
      (count, bucket) => count + (stats.confidenceHistogram[bucket] ?? 0),
    ),
    fallbacks: sum.fallbacks + Object.values(stats.fallbacks).reduce((a, b) => a + b, 0),
  }),
  {
    calls: 0,
    inputTokens: 0,
    ms: 0,
    confidenceWeighted: 0,
    confidenceSamples: 0,
    confidenceHistogram: new Array(10).fill(0),
    fallbacks: 0,
  },
);

const jev = side(0);
const them = side(1);
const pct = (value) => `${(value * 100).toFixed(1)}%`;

/**
 * The confidence distribution as one line — this is what calibrates
 * `minConfidence`, and a mean cannot. Reads as `0.0-0.1: 12 · 0.1-0.2: 58 …`,
 * empty buckets dropped.
 */
const histogram = (buckets) =>
  buckets
    .map((count, index) => [index, count])
    .filter(([, count]) => count > 0)
    .map(([index, count]) => `${(index / 10).toFixed(1)}-${((index + 1) / 10).toFixed(1)}: ${count}`)
    .join(' · ');

const report = {
  matches,
  target,
  opponent,
  loadout: loadoutIds,
  seed,
  model: jevStats.find((stats) => stats.model !== null)?.model ?? null,
  jev,
  [opponent]: them,
  calls: totals.calls,
  callsPerMatch: totals.calls / matches,
  meanConfidence: totals.confidenceSamples === 0 ? null : totals.confidenceWeighted / totals.confidenceSamples,
  confidenceHistogram: totals.confidenceHistogram,
  meanMs: totals.calls === 0 ? null : totals.ms / totals.calls,
  fallbacks: totals.fallbacks,
  fallbackRate: totals.calls === 0 ? 0 : totals.fallbacks / (totals.calls + totals.fallbacks),
  fallbacksByReason: Object.fromEntries(fallbackDetails),
  inputTokens: totals.inputTokens,
  costUsd: (totals.inputTokens * USD_PER_MTOK) / 1_000_000,
};

console.log(`
  jev vs ${opponent} — ${matches} matches, target ${target}, seed ${seed}
  dice ${loadoutIds} (both seats) · model ${report.model ?? 'unknown'}

  win rate      jev ${pct(jev.winRate)}  [${pct(jev.winRateCI95[0])}, ${pct(jev.winRateCI95[1])}]
                ${opponent.padEnd(3)} ${pct(them.winRate)}
  farkle rate   jev ${pct(jev.farkleRate)} · ${opponent} ${pct(them.farkleRate)}
  per bank      jev ${jev.avgBankedPerBank.toFixed(0)} · ${opponent} ${them.avgBankedPerBank.toFixed(0)}

  ${report.calls} requests (${report.callsPerMatch.toFixed(0)}/match) · ${Math.round(report.meanMs ?? 0)}ms each
  mean confidence ${report.meanConfidence === null ? 'n/a' : report.meanConfidence.toFixed(3)} · ` +
  `${pct(report.fallbackRate)} of decisions fell back
  confidence ${histogram(report.confidenceHistogram)}
  ${Object.entries(report.fallbacksByReason)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(' · ') || 'no fallbacks'}
  ${report.inputTokens.toLocaleString()} input tokens · $${report.costUsd.toFixed(2)}
`);

if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`wrote ${outPath}`);
}
