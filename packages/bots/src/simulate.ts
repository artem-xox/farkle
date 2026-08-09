import {
  BALANCED_DIE,
  createMatch,
  DEFAULT_TARGET,
  DICE_PER_TURN,
  nextU32,
  seedRng,
  type DieSpec,
  type PlayerConfig,
  type RngState,
} from '@farkle/engine';

import { summarizeMatch, type PlayerMatchStats } from './analyze.js';
import { playBotMatch } from './play.js';
import type { BotPolicy } from './policy.js';
import { wilsonInterval } from './stats.js';

export interface SimulationOptions {
  readonly matches: number;
  /** The whole run's randomness — both matchups and dice — derives from this. */
  readonly seed: number;
  readonly target?: number;
  readonly loadoutA?: readonly DieSpec[];
  readonly loadoutB?: readonly DieSpec[];
  /**
   * A factory rather than a ready-made `BotPolicy`: each match gets a fresh
   * bot instance with its own derived seed, so any single match in a run can
   * be replayed in isolation instead of needing the whole run replayed to put
   * a stateful bot's internal RNG back where it was.
   */
  readonly makeA: (seed: number) => BotPolicy;
  readonly makeB: (seed: number) => BotPolicy;
}

export interface SideReport {
  readonly wins: number;
  readonly winRate: number;
  readonly winRateCI95: readonly [number, number];
  /** Mean points per successful bank — 0 if the side never banked. */
  readonly avgBankedPerBank: number;
  /** Farkles as a fraction of this side's turns (banks + farkles). */
  readonly farkleRate: number;
  readonly avgTurnsPlayed: number;
}

export interface SimulationReport {
  readonly matches: number;
  readonly avgTurnsPerMatch: number;
  readonly a: SideReport;
  readonly b: SideReport;
}

interface RunningTotals {
  banks: number;
  bankedPoints: number;
  farkles: number;
  turnsPlayed: number;
}

function newTotals(): RunningTotals {
  return { banks: 0, bankedPoints: 0, farkles: 0, turnsPlayed: 0 };
}

function accumulate(totals: RunningTotals, match: PlayerMatchStats): void {
  totals.banks += match.banks;
  totals.bankedPoints += match.bankedPoints;
  totals.farkles += match.farkles;
  totals.turnsPlayed += match.banks + match.farkles;
}

function buildSideReport(wins: number, matches: number, totals: RunningTotals): SideReport {
  return {
    wins,
    winRate: wins / matches,
    winRateCI95: wilsonInterval(wins, matches),
    avgBankedPerBank: totals.banks === 0 ? 0 : totals.bankedPoints / totals.banks,
    farkleRate: totals.turnsPlayed === 0 ? 0 : totals.farkles / totals.turnsPlayed,
    avgTurnsPlayed: totals.turnsPlayed / matches,
  };
}

function draw(state: RngState): { value: number; state: RngState } {
  return nextU32(state);
}

const defaultLoadout = (): DieSpec[] => new Array<DieSpec>(DICE_PER_TURN).fill(BALANCED_DIE);

/**
 * Runs `matches` headless games between two bot policies and aggregates the
 * result: win rate with a 95% confidence interval, average points per bank,
 * farkle rate, and turns per match — enough to tell whether two personalities
 * are actually different, and to explain the difference rather than just
 * report it. See docs/DESIGN.md §6.
 */
export function runSimulation(options: SimulationOptions): SimulationReport {
  if (!Number.isInteger(options.matches) || options.matches < 1) {
    throw new RangeError(`matches must be a positive integer, got ${options.matches}`);
  }

  const target = options.target ?? DEFAULT_TARGET;
  const loadoutA = options.loadoutA ?? defaultLoadout();
  const loadoutB = options.loadoutB ?? defaultLoadout();

  let rng: RngState = seedRng(options.seed);
  let aWins = 0;
  let totalTurns = 0;
  const aTotals = newTotals();
  const bTotals = newTotals();

  for (let match = 0; match < options.matches; match++) {
    const gameDraw = draw(rng);
    rng = gameDraw.state;
    const aDraw = draw(rng);
    rng = aDraw.state;
    const bDraw = draw(rng);
    rng = bDraw.state;

    const players: PlayerConfig[] = [
      { name: 'A', loadout: loadoutA },
      { name: 'B', loadout: loadoutB },
    ];
    // Going first is a real advantage in a race to the target — without
    // alternating it, "A" would win more often than its policy alone
    // deserves, for every pairing, regardless of which two policies are
    // being compared.
    const startingPlayer = match % 2;
    const state = createMatch({ players, target, seed: gameDraw.value, startingPlayer });
    const bots = [options.makeA(aDraw.value), options.makeB(bDraw.value)];

    const result = playBotMatch(state, bots);
    const summary = summarizeMatch(result.events, 2);

    if (summary.winner === 0) {
      aWins++;
    }
    totalTurns += summary.totalTurns;
    accumulate(aTotals, summary.players[0]!);
    accumulate(bTotals, summary.players[1]!);
  }

  return {
    matches: options.matches,
    avgTurnsPerMatch: totalTurns / options.matches,
    a: buildSideReport(aWins, options.matches, aTotals),
    b: buildSideReport(options.matches - aWins, options.matches, bTotals),
  };
}
