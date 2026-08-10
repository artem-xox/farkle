import { BALANCED_DIE, DICE } from '@farkle/engine';
import { winRateVsOrdinary, analyticalMetricsMixed } from './lib.mjs';

const matches = 40000;
const specials = Object.values(DICE).filter((d) => d.id !== 'balanced');

console.log(`win6 for each special die, ${matches} matches, vs 6x balanced.\n`);
const rows = [];
for (const die of specials) {
  const pure = new Array(6).fill(die);
  const r = winRateVsOrdinary(pure, matches, { balancedDie: BALANCED_DIE });
  const m = analyticalMetricsMixed(pure);
  const row = { id: die.id, win6: r.a.winRate * 100, ci: r.a.winRateCI95.map(x => x * 100), farkle6: m.farkleRate * 100, ev6: m.ev };
  rows.push(row);
  console.log(die.id.padEnd(10), row.win6.toFixed(2).padStart(6), `[${row.ci[0].toFixed(2)},${row.ci[1].toFixed(2)}]`);
}
rows.sort((a, b) => b.win6 - a.win6);
console.log('\nSorted descending by win6:');
for (const r of rows) {
  console.log(r.id.padEnd(10), r.win6.toFixed(2).padStart(6), `farkle6=${r.farkle6.toFixed(2)}`, `ev6=${r.ev6.toFixed(0)}`);
}
