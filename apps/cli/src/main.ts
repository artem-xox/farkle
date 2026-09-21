#!/usr/bin/env node
import { chooseBotActionAsync } from '@farkle/bots';
import { JevBot } from '@farkle/jev';
import {
  BALANCED_DIE,
  createMatch,
  DICE_PER_TURN,
  IllegalActionError,
  LocalHost,
  validateAction,
  type GameAction,
  type GameEvent,
  type PlayerConfig,
} from '@farkle/engine';

import {
  createOpponent,
  isOpponentName,
  jevUnavailable,
  OPPONENT_NAMES,
  summarizeJev,
  type OpponentName,
} from './opponent.js';
import { Prompt } from './prompt.js';
import {
  bold,
  describeCombos,
  dim,
  green,
  red,
  renderDice,
  renderKeepOptions,
  renderKeptThisTurn,
  renderScoreboard,
  yellow,
} from './render.js';
import { runSimCommand } from './sim.js';

interface Options {
  readonly names: readonly string[];
  readonly target: number;
  readonly seed: number;
  readonly opponent: OpponentName | null;
}

const PRESET_LIST = OPPONENT_NAMES.join(', ');

const USAGE = `
  farkle — hot-seat dice, KCD2 rules

  Usage: farkle [options]
         farkle sim --a <preset> --b <preset> [options]

    --players <a,b,...>   player names (default: "Player 1,Player 2")
    --opponent <preset>   play against a bot instead of a second human
                           (${PRESET_LIST}) — makes it a two-player match
                           "jev" plays through TypeSafe's Jev model and needs
                           TYPESAFE_API_KEY set
    --target <n>          score to win (default: 2000)
    --seed <n>            replay a previous match exactly
    --help                this message

  During a turn: enter die positions to keep them (e.g. "1 4"),
  "?" to list every legal keep, "q" to quit.

  "farkle sim" runs headless bot-vs-bot matches — see "farkle sim --help".
`;

function parseArgs(argv: readonly string[]): Options | 'help' | Error {
  let names = ['Player 1', 'Player 2'];
  let target = 2000;
  let seed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  let opponent: OpponentName | null = null;

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
      case '--players': {
        names = value
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name.length > 0);
        if (names.length < 2) {
          return new Error('a match needs at least two players');
        }
        break;
      }
      case '--opponent': {
        if (!isOpponentName(value)) {
          return new Error(`unknown bot preset "${value}" — choose from ${PRESET_LIST}`);
        }
        opponent = value;
        break;
      }
      case '--target': {
        target = Number(value);
        if (!Number.isInteger(target) || target <= 0) {
          return new Error(`--target must be a positive integer, got "${value}"`);
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
      default:
        return new Error(`unknown option "${flag}"`);
    }
  }

  return { names, target, seed, opponent };
}

function parsePositions(text: string, diceCount: number): number[] | string {
  const tokens = text.split(/[\s,]+/).filter((token) => token.length > 0);
  const indices: number[] = [];
  for (const token of tokens) {
    const position = Number(token);
    if (!Number.isInteger(position) || position < 1 || position > diceCount) {
      return `"${token}" is not a die position — pick from 1 to ${diceCount}`;
    }
    indices.push(position - 1);
  }
  return indices;
}

const plural = (count: number, singular: string, many: string): string =>
  `${count} ${count === 1 ? singular : many}`;

function makeEventPrinter(names: readonly string[]): (event: GameEvent) => void {
  const who = (id: number): string => names[id] ?? `Player ${id}`;

  return (event) => {
    switch (event.type) {
      case 'TurnStarted':
        console.log(dim(`\n  ── turn ${event.turn} ${'─'.repeat(40)}`));
        break;

      case 'Thrown':
        // The board is drawn at the prompt, so the dice are about to be shown.
        break;

      case 'Kept':
        console.log(
          `   ${green('✓')} kept ${bold(event.faces.join(' '))} ` +
            `${dim('→')} ${bold(String(event.points))}  ` +
            dim(`${describeCombos(event.combos)} · turn ${event.turnScore}`),
        );
        break;

      case 'HotDice':
        console.log(`   ${yellow('★')} hot dice — all six come back`);
        break;

      case 'Farkled':
        console.log(
          `   ${red('✗')} farkle — ${who(event.player)} loses ` +
            (event.lost === 0 ? 'nothing' : bold(String(event.lost))),
        );
        break;

      case 'Banked':
        console.log(
          `   ${green('●')} ${who(event.player)} banks ${bold(String(event.points))} ` +
            dim(`→ ${event.total}`),
        );
        break;

      case 'TurnEnded':
        break;

      case 'MatchWon':
        console.log(`\n   ${yellow('♛')} ${bold(who(event.winner))} wins with ${event.total}\n`);
        break;
    }
  };
}

async function nextAction(prompt: Prompt, host: LocalHost): Promise<GameAction | null> {
  const state = host.state;
  const view = host.view(state.current);
  const you = view.players[view.you]!;

  const quit = (answer: string): boolean => answer === 'q' || answer === 'quit';

  if (view.phase === 'AwaitingThrow') {
    console.log(`  ${renderScoreboard(view)}`);
    const answer = await prompt.ask(
      `   ${bold(you.name)} · [enter] throw ${plural(view.diceInPlay, 'die', 'dice')} · [q]uit › `,
    );
    if (answer === null || quit(answer.trim().toLowerCase())) {
      return null;
    }
    return { type: 'Throw' };
  }

  if (view.phase === 'AwaitingKeep') {
    console.log(renderDice(view.thrown));
    for (;;) {
      const answer = await prompt.ask(
        `   turn ${bold(String(view.turnScore))} · kept ${renderKeptThisTurn(view)} · ` +
          `keep which? ${dim('(e.g. "1 4", ? for options)')} › `,
      );
      if (answer === null) {
        return null;
      }
      const trimmed = answer.trim().toLowerCase();
      if (quit(trimmed)) {
        return null;
      }
      if (trimmed === '?') {
        console.log(renderKeepOptions(view.keeps));
        continue;
      }
      if (trimmed === '') {
        console.log(dim('   enter die positions, e.g. "1 4"'));
        continue;
      }

      const indices = parsePositions(trimmed, view.thrown.length);
      if (typeof indices === 'string') {
        console.log(`   ${red(indices)}`);
        continue;
      }

      const action: GameAction = { type: 'Keep', indices };
      const problem = validateAction(state, action);
      if (problem !== null) {
        console.log(`   ${red(problem)}`);
        continue;
      }
      return action;
    }
  }

  // AwaitingBankOrThrow
  for (;;) {
    const answer = await prompt.ask(
      `   turn ${bold(String(view.turnScore))} · ` +
        `[t]hrow ${plural(view.diceInPlay, 'die', 'dice')} · [b]ank · [q]uit › `,
    );
    if (answer === null) {
      return null;
    }
    const trimmed = answer.trim().toLowerCase();
    if (quit(trimmed)) {
      return null;
    }
    if (trimmed === 't' || trimmed === 'throw' || trimmed === '') {
      return { type: 'Throw' };
    }
    if (trimmed === 'b' || trimmed === 'bank') {
      return { type: 'Bank' };
    }
    console.log(dim('   "t" to throw, "b" to bank'));
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Derives a bot seed from the match seed so `--seed` alone still replays exactly. */
const botSeedFrom = (matchSeed: number): number => (matchSeed ^ 0x9e3779b9) >>> 0;

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (parsed instanceof Error) {
    console.error(`\n  ${red(parsed.message)}\n${USAGE}`);
    return 1;
  }

  // Jev plays over the network, so it can be unplayable for a reason no
  // amount of dice will fix. Say so now rather than mid-turn.
  if (parsed.opponent === 'jev') {
    const problem = jevUnavailable();
    if (problem !== null) {
      console.error(`\n  ${red(problem)}\n`);
      return 1;
    }
  }

  // --opponent makes it a two-player match: a human seat and a bot seat.
  const names = parsed.opponent
    ? [parsed.names[0] ?? 'You', capitalize(parsed.opponent)]
    : parsed.names;
  const bot = parsed.opponent
    ? createOpponent(parsed.opponent, {
        seed: botSeedFrom(parsed.seed),
        onNotice: (text) => console.log(`   ${dim(text)}`),
      })
    : null;
  const botSeat = bot === null ? null : 1;

  const players: PlayerConfig[] = names.map((name) => ({
    name,
    loadout: new Array(DICE_PER_TURN).fill(BALANCED_DIE),
  }));

  const host = new LocalHost(createMatch({ players, target: parsed.target, seed: parsed.seed }));
  const printEvent = makeEventPrinter(names);
  host.subscribe((events) => events.forEach(printEvent));
  // The bot's own view of the match log. `ClientView` is a snapshot, so a
  // policy that plays on the history of the game — Jev does — has to be told.
  // It sees exactly the log the human above is reading.
  if (bot?.observe !== undefined) {
    host.subscribe((events) => bot.observe?.(events));
  }

  console.log(`\n  ${bold('FARKLE')} ${dim(`· first to ${parsed.target} · seed ${parsed.seed}`)}`);
  console.log(dim(`  ── turn 1 ${'─'.repeat(40)}`));

  const prompt = new Prompt();
  try {
    while (host.state.phase !== 'MatchOver') {
      const action =
        bot !== null && host.state.current === botSeat
          ? await chooseBotActionAsync(host.view(botSeat), bot)
          : await nextAction(prompt, host);

      if (action === null) {
        console.log(
          dim(
            parsed.opponent === 'jev'
              ? `\n  stopped. --seed ${parsed.seed} replays these dice, but not Jev's moves\n`
              : `\n  stopped. replay this match with --seed ${parsed.seed}\n`,
          ),
        );
        return 0;
      }
      try {
        await host.dispatch(host.state.current, action);
      } catch (error) {
        if (!(error instanceof IllegalActionError)) {
          throw error;
        }
        console.log(`   ${red(error.message)}`);
      }
    }
  } finally {
    prompt.close();
  }

  if (bot instanceof JevBot) {
    // Not decoration: it is the only way to see how much of that match was
    // actually the model and how much was its fallback.
    console.log(dim(`  ${summarizeJev(bot.stats)}`));
  }
  console.log(
    dim(
      parsed.opponent === 'jev'
        ? `  --seed ${parsed.seed} replays these dice, but not Jev's moves — see DESIGN.md §6\n`
        : `  replay this match with --seed ${parsed.seed}\n`,
    ),
  );
  return 0;
}

async function run(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  return command === 'sim' ? runSimCommand(rest) : main();
}

run().then(
  (code) => {
    process.exit(code);
  },
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
