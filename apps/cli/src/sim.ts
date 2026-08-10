import { isPresetName, PRESET_NAMES, createPreset, runSimulation, type PresetName } from '@farkle/bots';
import { DEFAULT_TARGET, DICE, DICE_PER_TURN, type DieSpec } from '@farkle/engine';

import { bold, red, renderSimReport } from './render.js';

interface SimOptions {
  readonly a: PresetName;
  readonly b: PresetName;
  readonly matches: number;
  readonly seed: number;
  readonly target: number;
  readonly loadoutA: readonly DieSpec[];
  readonly loadoutB: readonly DieSpec[];
}

const PRESET_LIST = PRESET_NAMES.join(', ');
const DIE_LIST = Object.keys(DICE).join(', ');

const SIM_USAGE = `
  farkle sim — headless bot-vs-bot matches

  Usage: farkle sim --a <preset> --b <preset> [options]

    --a <preset>         first bot's personality (required)
    --b <preset>         second bot's personality (required)
    -n, --matches <n>    matches to play (default: 10000)
    --seed <n>           reproduce a previous run exactly (default: random)
    --target <n>         score to win (default: ${DEFAULT_TARGET})
    --loadout-a <dice>   first bot's six dice (default: all ordinary)
    --loadout-b <dice>   second bot's six dice
    --help               this message

  Presets: ${PRESET_LIST}
  Dice: ${DIE_LIST}

  A loadout is either one die id, meaning all ${DICE_PER_TURN} slots, or exactly
  ${DICE_PER_TURN} comma-separated ids. Pointing it at one side and leaving the
  other ordinary is how a die's balance is measured — see DESIGN.md §5.

  Example: farkle sim --a cautious --b aggressive -n 100000 --seed 42
  Example: farkle sim --a balanced --b balanced --loadout-a devil -n 40000
`;

/** `"devil"` → six devil dice; `"devil,odd,..."` → exactly those six. */
function parseLoadout(flag: string, value: string): DieSpec[] | Error {
  const ids = value.split(',').map((id) => id.trim());
  const dice: DieSpec[] = [];
  for (const id of ids) {
    const die = DICE[id];
    if (die === undefined) {
      return new Error(`${flag}: unknown die "${id}" — choose from ${DIE_LIST}`);
    }
    dice.push(die);
  }
  if (dice.length === 1) {
    return new Array<DieSpec>(DICE_PER_TURN).fill(dice[0]!);
  }
  if (dice.length !== DICE_PER_TURN) {
    return new Error(`${flag}: give 1 die id or exactly ${DICE_PER_TURN}, got ${dice.length}`);
  }
  return dice;
}

function parseSimArgs(argv: readonly string[]): SimOptions | 'help' | Error {
  let a: PresetName | null = null;
  let b: PresetName | null = null;
  let matches = 10_000;
  let seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  let target = DEFAULT_TARGET;
  const ordinary = (): DieSpec[] => new Array<DieSpec>(DICE_PER_TURN).fill(DICE['balanced']!);
  let loadoutA = ordinary();
  let loadoutB = ordinary();

  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!;
    if (flag === '--help' || flag === '-h') {
      return 'help';
    }
    const value = argv[index + 1];
    if (value === undefined) {
      return new Error(`${flag} needs a value`);
    }
    index++;

    switch (flag) {
      case '--a':
      case '--b': {
        if (!isPresetName(value)) {
          return new Error(`unknown bot preset "${value}" — choose from ${PRESET_LIST}`);
        }
        if (flag === '--a') a = value;
        else b = value;
        break;
      }
      case '-n':
      case '--matches': {
        matches = Number(value);
        if (!Number.isInteger(matches) || matches < 1) {
          return new Error(`${flag} must be a positive integer, got "${value}"`);
        }
        break;
      }
      case '--seed': {
        const parsed = Number(value);
        if (!Number.isInteger(parsed)) {
          return new Error(`--seed must be an integer, got "${value}"`);
        }
        seed = parsed >>> 0;
        break;
      }
      case '--target': {
        target = Number(value);
        if (!Number.isInteger(target) || target <= 0) {
          return new Error(`--target must be a positive integer, got "${value}"`);
        }
        break;
      }
      case '--loadout-a':
      case '--loadout-b': {
        const parsed = parseLoadout(flag, value);
        if (parsed instanceof Error) {
          return parsed;
        }
        if (flag === '--loadout-a') loadoutA = parsed;
        else loadoutB = parsed;
        break;
      }
      default:
        return new Error(`unknown option "${flag}"`);
    }
  }

  if (a === null) {
    return new Error(`--a <preset> is required — choose from ${PRESET_LIST}`);
  }
  if (b === null) {
    return new Error(`--b <preset> is required — choose from ${PRESET_LIST}`);
  }

  return { a, b, matches, seed, target, loadoutA, loadoutB };
}

export async function runSimCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseSimArgs(argv);
  if (parsed === 'help') {
    console.log(SIM_USAGE);
    return 0;
  }
  if (parsed instanceof Error) {
    console.error(`\n  ${red(parsed.message)}\n${SIM_USAGE}`);
    return 1;
  }

  console.log(
    `\n  ${bold('FARKLE SIM')} ${bold(parsed.a)} vs ${bold(parsed.b)} · target ${parsed.target} · seed ${parsed.seed}\n`,
  );

  // Printed only when it isn't the default, so an ordinary personality run
  // reads exactly as it did before the flag existed — but a loadout run can
  // never be mistaken for one.
  const loadoutLine = (loadout: readonly DieSpec[]): string => {
    const ids = [...new Set(loadout.map((die) => die.id))];
    return ids.length === 1 ? `six ${ids[0]}` : loadout.map((die) => die.id).join(' ');
  };
  for (const [side, loadout] of [
    [parsed.a, parsed.loadoutA],
    [parsed.b, parsed.loadoutB],
  ] as const) {
    if (loadout.some((die) => die.id !== 'balanced')) {
      console.log(`  ${side} dice: ${loadoutLine(loadout)}`);
    }
  }

  const report = runSimulation({
    matches: parsed.matches,
    seed: parsed.seed,
    target: parsed.target,
    loadoutA: parsed.loadoutA,
    loadoutB: parsed.loadoutB,
    makeA: (seed) => createPreset(parsed.a, seed),
    makeB: (seed) => createPreset(parsed.b, seed),
  });

  console.log(renderSimReport(parsed.a, parsed.b, report));
  console.log();
  return 0;
}
