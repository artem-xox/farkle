import { BALANCED_DIE, legalKeeps, type ClientView, type DieSpec, type Face } from '@farkle/engine';

/**
 * A `ClientView` built by hand, the same trick `packages/bots/test` uses: it
 * keeps these tests about what gets said to the model rather than about
 * engine wiring, which `packages/engine/test/host.test.ts` already covers.
 *
 * `keeps` is filled from the real `legalKeeps` when a throw is given, because
 * the options are the one part that must be genuine — a hand-written keep
 * list would let `questions.ts` claim uniqueness over a set the engine never
 * produces.
 */
export function fakeView(overrides: Partial<ClientView> = {}): ClientView {
  const thrown: readonly Face[] = overrides.thrown ?? [];
  const inPlayDice: readonly DieSpec[] =
    overrides.inPlayDice ?? new Array<DieSpec>(thrown.length).fill(BALANCED_DIE);

  const defaults: ClientView = {
    you: 0,
    phase: thrown.length > 0 ? 'AwaitingKeep' : 'AwaitingBankOrThrow',
    current: 0,
    yourTurn: true,
    players: [
      { id: 0, name: 'Jev', total: 0, loadout: new Array<DieSpec>(6).fill(BALANCED_DIE) },
      { id: 1, name: 'Henry', total: 0, loadout: new Array<DieSpec>(6).fill(BALANCED_DIE) },
    ],
    target: 2000,
    turn: 1,
    turnScore: 0,
    thrown,
    keptThisTurn: [],
    diceInPlay: inPlayDice.length,
    inPlayDice,
    keeps: thrown.length > 0 ? legalKeeps(thrown, inPlayDice) : [],
    winner: null,
  };
  return { ...defaults, ...overrides };
}
