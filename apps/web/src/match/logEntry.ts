import { isWild, WILD_KING, WILD_QUEEN, type Face, type GameEvent } from '@farkle/engine';

import { describeCombos } from './describeCombo';

/**
 * Unicode die faces, U+2680–U+2685. Safe here in a way they are not in the
 * CLI, where they render double-width in some terminals and would misalign
 * the position numbers under the dice — the browser has no such problem.
 */
const DIE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

const WILD_GLYPH = '😈';
const CROWN_GLYPH = '👑';

export function diceGlyphs(faces: readonly Face[]): string {
  return faces
    .map((face) => {
      if (face === WILD_KING || face === WILD_QUEEN) {
        return CROWN_GLYPH;
      }
      return isWild(face) ? WILD_GLYPH : DIE_GLYPHS[face - 1];
    })
    .join(' ');
}

export type LogEntry =
  | { readonly kind: 'kept'; readonly dice: string; readonly combos: string; readonly points: number }
  | { readonly kind: 'hot' }
  | { readonly kind: 'farkle'; readonly lost: number }
  | { readonly kind: 'bank'; readonly points: number; readonly total: number }
  | { readonly kind: 'win'; readonly total: number };

/** One player's turn, with every scoring step inside it. */
export interface LogTurn {
  readonly turn: number;
  readonly player: string;
  readonly entries: readonly LogEntry[];
}

function playerOf(event: GameEvent): number {
  return event.type === 'MatchWon' ? event.winner : event.player;
}

/**
 * Groups a match's event log into per-turn blocks for display.
 *
 * Note the first turn has no `TurnStarted` to key off: `createMatch` returns a
 * state rather than emitting an opening event, so the first thing in the log
 * is the opening `Thrown`. The first block is therefore synthesised from
 * whichever player that event belongs to.
 */
export function buildLog(events: readonly GameEvent[], nameOf: (id: number) => string): LogTurn[] {
  const turns: { turn: number; player: string; entries: LogEntry[] }[] = [];

  const ensureTurn = (event: GameEvent): LogEntry[] => {
    if (turns.length === 0) {
      turns.push({ turn: 1, player: nameOf(playerOf(event)), entries: [] });
    }
    return turns[turns.length - 1]!.entries;
  };

  for (const event of events) {
    switch (event.type) {
      case 'TurnStarted':
        turns.push({ turn: event.turn, player: nameOf(event.player), entries: [] });
        break;
      case 'Kept':
        ensureTurn(event).push({
          kind: 'kept',
          dice: diceGlyphs(event.faces),
          combos: describeCombos(event.combos),
          points: event.points,
        });
        break;
      case 'HotDice':
        ensureTurn(event).push({ kind: 'hot' });
        break;
      case 'Farkled':
        ensureTurn(event).push({ kind: 'farkle', lost: event.lost });
        break;
      case 'Banked':
        ensureTurn(event).push({ kind: 'bank', points: event.points, total: event.total });
        break;
      case 'MatchWon':
        ensureTurn(event).push({ kind: 'win', total: event.total });
        break;
      case 'Thrown':
      case 'TurnEnded':
        // `Thrown` is already visible on the board; `TurnEnded` is redundant
        // with the `TurnStarted` that always follows it.
        break;
    }
  }

  // A turn that started but produced nothing yet is noise in the log.
  return turns.filter((entry) => entry.entries.length > 0);
}
