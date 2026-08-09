import type { GameEvent } from '@farkle/engine';

import { describeCombos } from './describeCombo';

/**
 * One human-readable line per event worth showing in the turn log, or null
 * for the ones that are only useful for driving the UI (`Thrown`, whose dice
 * are already on the table; `TurnEnded`, redundant with the next
 * `TurnStarted`). Pure and exported on its own so it can be unit tested
 * without rendering anything.
 */
export function eventLine(event: GameEvent, nameOf: (id: number) => string): string | null {
  switch (event.type) {
    case 'TurnStarted':
      return `Turn ${event.turn} — ${nameOf(event.player)}`;
    case 'Thrown':
      return null;
    case 'Kept':
      return `${nameOf(event.player)} kept ${event.faces.join(' ')} → ${event.points} (${describeCombos(event.combos)})`;
    case 'HotDice':
      return `${nameOf(event.player)} rolled hot dice — all six back`;
    case 'Farkled':
      return `${nameOf(event.player)} farkled${event.lost > 0 ? `, lost ${event.lost}` : ''}`;
    case 'Banked':
      return `${nameOf(event.player)} banked ${event.points} → ${event.total}`;
    case 'TurnEnded':
      return null;
    case 'MatchWon':
      return `${nameOf(event.winner)} wins with ${event.total}!`;
  }
}
