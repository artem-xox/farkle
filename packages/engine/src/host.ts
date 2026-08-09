import {
  IllegalActionError,
  reduce,
  type GameAction,
  type GameEvent,
  type GameState,
  type Phase,
  type PlayerId,
} from './match.js';
import { legalKeeps } from './scoring.js';
import { type DieSpec } from './dice.js';
import { type Face, type KeepOption } from './types.js';

export interface PlayerView {
  readonly id: PlayerId;
  readonly name: string;
  readonly total: number;
  readonly loadout: readonly DieSpec[];
}

/**
 * What one player is allowed to see. Farkle hides almost nothing today, but
 * routing every consumer through a projection now means hiding something later
 * — an opponent's loadout, say — does not require reworking the UI or the bots.
 */
export interface ClientView {
  readonly you: PlayerId;
  readonly phase: Phase;
  readonly current: PlayerId;
  readonly yourTurn: boolean;
  readonly players: readonly PlayerView[];
  readonly target: number;
  readonly turn: number;
  readonly turnScore: number;
  readonly thrown: readonly Face[];
  readonly keptThisTurn: readonly Face[];
  readonly diceInPlay: number;
  /** Specs of the dice still in play for the current player, parallel to nothing in particular. */
  readonly inPlayDice: readonly DieSpec[];
  /**
   * Legal keeps for the current throw, best first, each aware of which dice
   * they leave behind — see `legalKeeps`'s `dice` parameter. Empty outside
   * `AwaitingKeep`.
   */
  readonly keeps: readonly KeepOption[];
  readonly winner: PlayerId | null;
}

export function viewOf(state: GameState, you: PlayerId): ClientView {
  const currentPlayer = state.config.players[state.current]!;
  const inPlayDice = state.inPlay.map((index) => currentPlayer.loadout[index]!);

  return {
    you,
    phase: state.phase,
    current: state.current,
    yourTurn: state.current === you && state.phase !== 'MatchOver',
    players: state.config.players.map((player, id) => ({
      id,
      name: player.name,
      total: state.totals[id]!,
      loadout: player.loadout,
    })),
    target: state.config.target,
    turn: state.turn,
    turnScore: state.turnScore,
    thrown: state.thrown,
    keptThisTurn: state.keptThisTurn,
    diceInPlay: state.inPlay.length,
    inPlayDice,
    keeps: state.thrown.length > 0 ? legalKeeps(state.thrown, inPlayDice) : [],
    winner: state.winner,
  };
}

export type Unsubscribe = () => void;
export type EventListener = (events: readonly GameEvent[]) => void;

/**
 * The seam between the game and its presentation. `LocalHost` runs the engine
 * in-process; a future `RemoteHost` would speak to a server running the same
 * engine. Nothing above this interface should know which it has.
 */
export interface GameHost {
  view(playerId: PlayerId): ClientView;
  dispatch(playerId: PlayerId, action: GameAction): Promise<void>;
  subscribe(listener: EventListener): Unsubscribe;
}

export class LocalHost implements GameHost {
  private current: GameState;
  private readonly listeners = new Set<EventListener>();

  constructor(initial: GameState) {
    this.current = initial;
  }

  get state(): GameState {
    return this.current;
  }

  view(playerId: PlayerId): ClientView {
    return viewOf(this.current, playerId);
  }

  async dispatch(playerId: PlayerId, action: GameAction): Promise<void> {
    if (playerId !== this.current.current) {
      throw new IllegalActionError(
        `it is not player ${playerId}'s turn (current player is ${this.current.current})`,
      );
    }
    const result = reduce(this.current, action);
    this.current = result.state;
    for (const listener of this.listeners) {
      listener(result.events);
    }
  }

  subscribe(listener: EventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
