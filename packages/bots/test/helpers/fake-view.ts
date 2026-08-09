import type { ClientView } from '@farkle/engine';

/**
 * `decideAfterKeep` only ever reads a handful of `ClientView` fields; the rest
 * exist purely so the object satisfies the type. Building one by hand, rather
 * than driving a real match, keeps these tests about the threshold arithmetic
 * and not about engine wiring — that's covered separately in play.test.ts.
 */
export function fakeView(overrides: Partial<ClientView> = {}): ClientView {
  const defaults: ClientView = {
    you: 0,
    phase: 'AwaitingBankOrThrow',
    current: 0,
    yourTurn: true,
    players: [
      { id: 0, name: 'A', total: 0, loadout: [] },
      { id: 1, name: 'B', total: 0, loadout: [] },
    ],
    target: 2000,
    turn: 1,
    turnScore: 0,
    thrown: [],
    keptThisTurn: [],
    diceInPlay: 3,
    keeps: [],
    winner: null,
  };
  return { ...defaults, ...overrides };
}
