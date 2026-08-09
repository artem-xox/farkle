import type { GameEvent, PlayerId } from '@farkle/engine';

export interface PlayerMatchStats {
  readonly banks: number;
  readonly bankedPoints: number;
  readonly farkles: number;
}

export interface MatchSummary {
  readonly winner: PlayerId;
  /** Indexed by player id. */
  readonly players: readonly PlayerMatchStats[];
  /** Turns played by every player combined — banks plus farkles. */
  readonly totalTurns: number;
}

/**
 * Tallies a match's event log into per-player stats. A pure function of
 * `GameEvent[]` rather than something `playBotMatch` computes inline, so a
 * human-vs-bot match played through the CLI could be summarised the same way.
 */
export function summarizeMatch(events: readonly GameEvent[], playerCount: number): MatchSummary {
  const banks = new Array<number>(playerCount).fill(0);
  const bankedPoints = new Array<number>(playerCount).fill(0);
  const farkles = new Array<number>(playerCount).fill(0);
  let winner: PlayerId | null = null;
  let totalTurns = 0;

  for (const event of events) {
    if (event.type === 'Banked') {
      banks[event.player]!++;
      bankedPoints[event.player]! += event.points;
      totalTurns++;
    } else if (event.type === 'Farkled') {
      farkles[event.player]!++;
      totalTurns++;
    } else if (event.type === 'MatchWon') {
      winner = event.winner;
    }
  }

  if (winner === null) {
    throw new RangeError('summarizeMatch: event log has no MatchWon event — the match is not over');
  }

  return {
    winner,
    totalTurns,
    players: banks.map((_, id) => ({
      banks: banks[id]!,
      bankedPoints: bankedPoints[id]!,
      farkles: farkles[id]!,
    })),
  };
}
