#!/usr/bin/env node
// Checks the two wildcard-safety claims made in code comments and tests
// (packages/engine/src/dice.ts on DEVIL_DIE/IMP_DIE, packages/bots/test/odds.test.ts)
// over the *whole current roster* rather than a handful of hand-picked
// companies. Exact (analytical), not simulated — cheap enough to brute-force.
//
// Usage:
//   npm run build
//   node scripts/dice-balance/wildcard-audit.mjs
import { BALANCED_DIE, DICE } from '@farkle/engine';
import { farkleProbability } from '@farkle/bots';

const roster = Object.values(DICE);

function auditNeverSafer(die, label) {
  let violations = 0;
  for (const filler of roster) {
    for (let size = 0; size <= 5; size++) {
      const company = new Array(size).fill(filler);
      const withDie = farkleProbability([die, ...company]);
      const withBalanced = farkleProbability([BALANCED_DIE, ...company]);
      if (withDie < withBalanced - 1e-12) {
        violations++;
        console.log(
          `  VIOLATION: ${label} safer than balanced with [${filler.id} x${size}]`,
          withDie.toFixed(5),
          '<',
          withBalanced.toFixed(5),
        );
      }
    }
  }
  console.log(`${label}: ${violations === 0 ? 'never safer than balanced (as expected)' : `${violations} violations`}`);
}

function auditSometimesSafer(die, label) {
  let saferCount = 0;
  let saferExample = null;
  for (const filler of roster) {
    for (let size = 1; size <= 5; size++) {
      const company = new Array(size).fill(filler);
      const withDie = farkleProbability([die, ...company]);
      const withBalanced = farkleProbability([BALANCED_DIE, ...company]);
      if (withDie < withBalanced - 1e-12) {
        saferCount++;
        saferExample ??= { filler: filler.id, size, withDie, withBalanced };
      }
    }
  }
  if (saferCount === 0) {
    console.log(`${label}: never safer than balanced in any company (unexpected — check the weights)`);
  } else {
    console.log(
      `${label}: safer than balanced in ${saferCount} compan${saferCount === 1 ? 'y' : 'ies'}` +
        ` — e.g. [${saferExample.filler} x${saferExample.size}]:` +
        ` ${saferExample.withDie.toFixed(5)} < ${saferExample.withBalanced.toFixed(5)}`,
    );
  }
}

console.log('-- devil: must NEVER be safer than balanced in any company (its wild sits on the scoring 1)');
auditNeverSafer(DICE['devil'], 'devil');

console.log('\n-- imp: SHOULD be safer than balanced once enough wildcards can triple up (its wild sits on the dead 6)');
auditSometimesSafer(DICE['imp'], 'imp');

console.log('\n-- single-die farkle rate for every roster die (sanity read)');
for (const die of roster) {
  console.log(' ', die.id.padEnd(10), (farkleProbability([die]) * 100).toFixed(2) + '%');
}
