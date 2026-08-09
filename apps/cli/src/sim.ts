import { isPresetName, PRESET_NAMES, createPreset, runSimulation, type PresetName } from '@farkle/bots';
import { DEFAULT_TARGET } from '@farkle/engine';

import { bold, red, renderSimReport } from './render.js';

interface SimOptions {
  readonly a: PresetName;
  readonly b: PresetName;
  readonly matches: number;
  readonly seed: number;
  readonly target: number;
}

const PRESET_LIST = PRESET_NAMES.join(', ');

const SIM_USAGE = `
  farkle sim — headless bot-vs-bot matches

  Usage: farkle sim --a <preset> --b <preset> [options]

    --a <preset>         first bot's personality (required)
    --b <preset>         second bot's personality (required)
    -n, --matches <n>    matches to play (default: 10000)
    --seed <n>           reproduce a previous run exactly (default: random)
    --target <n>         score to win (default: ${DEFAULT_TARGET})
    --help               this message

  Presets: ${PRESET_LIST}

  Example: farkle sim --a cautious --b aggressive -n 100000 --seed 42
`;

function parseSimArgs(argv: readonly string[]): SimOptions | 'help' | Error {
  let a: PresetName | null = null;
  let b: PresetName | null = null;
  let matches = 10_000;
  let seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  let target = DEFAULT_TARGET;

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

  return { a, b, matches, seed, target };
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

  const report = runSimulation({
    matches: parsed.matches,
    seed: parsed.seed,
    target: parsed.target,
    makeA: (seed) => createPreset(parsed.a, seed),
    makeB: (seed) => createPreset(parsed.b, seed),
  });

  console.log(renderSimReport(parsed.a, parsed.b, report));
  console.log();
  return 0;
}
