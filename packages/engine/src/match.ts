import { assertValidDie, rollDice, type DieSpec } from './dice.js';
import { type RngState } from './rng.js';
import { hasScoringDice, scoreKeep } from './scoring.js';
import { DICE_PER_TURN, type Combo, type Face } from './types.js';

export type PlayerId = number;

export const DEFAULT_TARGET = 2000;

export interface PlayerConfig {
  readonly name: string;
  /** Exactly `DICE_PER_TURN` dice. Which die is kept changes what is left to throw. */
  readonly loadout: readonly DieSpec[];
}

export interface MatchConfig {
  readonly players: readonly PlayerConfig[];
  readonly target: number;
  readonly seed: number;
  readonly startingPlayer: PlayerId;
}

export interface MatchOptions {
  readonly players: readonly PlayerConfig[];
  /** Required — a defaulted seed would silently make every match identical. */
  readonly seed: number;
  readonly target?: number;
  readonly startingPlayer?: PlayerId;
}

export type Phase =
  /** Start of a turn: the player has nothing at stake yet and must throw. */
  | 'AwaitingThrow'
  /** Dice are on the table and at least one of them scores. */
  | 'AwaitingKeep'
  /** The player has kept dice and now chooses to press on or bank. */
  | 'AwaitingBankOrThrow'
  | 'MatchOver';

export interface GameState {
  readonly config: MatchConfig;
  readonly phase: Phase;
  readonly current: PlayerId;
  /** Banked points, indexed by player id. */
  readonly totals: readonly number[];
  /** 1-based count of turns started in the match. */
  readonly turn: number;
  readonly turnScore: number;
  /** Loadout indices of the current player's dice still in play this turn. */
  readonly inPlay: readonly number[];
  /** The current throw, parallel to `inPlay`. Empty outside `AwaitingKeep`. */
  readonly thrown: readonly Face[];
  /** Faces kept so far this turn, for display. */
  readonly keptThisTurn: readonly Face[];
  readonly rng: RngState;
  readonly winner: PlayerId | null;
}

export type GameAction =
  | { readonly type: 'Throw' }
  | { readonly type: 'Keep'; readonly indices: readonly number[] }
  | { readonly type: 'Bank' };

export type GameEvent =
  | { readonly type: 'TurnStarted'; readonly player: PlayerId; readonly turn: number }
  | {
      readonly type: 'Thrown';
      readonly player: PlayerId;
      readonly faces: readonly Face[];
    }
  | {
      readonly type: 'Kept';
      readonly player: PlayerId;
      readonly indices: readonly number[];
      readonly faces: readonly Face[];
      readonly combos: readonly Combo[];
      readonly points: number;
      readonly turnScore: number;
    }
  | { readonly type: 'HotDice'; readonly player: PlayerId }
  | { readonly type: 'Farkled'; readonly player: PlayerId; readonly lost: number }
  | {
      readonly type: 'Banked';
      readonly player: PlayerId;
      readonly points: number;
      readonly total: number;
    }
  | { readonly type: 'TurnEnded'; readonly player: PlayerId; readonly next: PlayerId }
  | { readonly type: 'MatchWon'; readonly winner: PlayerId; readonly total: number }

export interface ReduceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export class IllegalActionError extends Error {
  override readonly name = 'IllegalActionError';
}

function loadoutIndices(player: PlayerConfig): number[] {
  return player.loadout.map((_, index) => index);
}

export function createMatch(options: MatchOptions): GameState {
  const { players } = options;
  if (players.length < 2) {
    throw new RangeError(`a match needs at least two players, got ${players.length}`);
  }
  for (const player of players) {
    if (player.loadout.length !== DICE_PER_TURN) {
      throw new RangeError(
        `player "${player.name}" has ${player.loadout.length} dice, expected ${DICE_PER_TURN}`,
      );
    }
    player.loadout.forEach(assertValidDie);
  }

  const target = options.target ?? DEFAULT_TARGET;
  if (!Number.isInteger(target) || target <= 0) {
    throw new RangeError(`target must be a positive integer, got ${target}`);
  }

  const startingPlayer = options.startingPlayer ?? 0;
  if (!Number.isInteger(startingPlayer) || startingPlayer < 0 || startingPlayer >= players.length) {
    throw new RangeError(`no player with id ${startingPlayer}`);
  }

  return {
    config: { players, target, seed: options.seed, startingPlayer },
    phase: 'AwaitingThrow',
    current: startingPlayer,
    totals: players.map(() => 0),
    turn: 1,
    turnScore: 0,
    inPlay: loadoutIndices(players[startingPlayer]!),
    thrown: [],
    keptThisTurn: [],
    rng: options.seed >>> 0,
    winner: null,
  };
}

/** Why `action` cannot be applied to `state`, or null if it can. */
export function validateAction(state: GameState, action: GameAction): string | null {
  if (state.phase === 'MatchOver') {
    return 'the match is over';
  }

  switch (action.type) {
    case 'Throw':
      return state.phase === 'AwaitingKeep'
        ? 'keep at least one scoring die before throwing again'
        : null;

    case 'Bank':
      return state.phase === 'AwaitingBankOrThrow'
        ? null
        : 'keep at least one scoring die before banking';

    case 'Keep': {
      if (state.phase !== 'AwaitingKeep') {
        return 'there are no dice on the table';
      }
      const { indices } = action;
      if (indices.length === 0) {
        return 'keep at least one die';
      }
      const seen = new Set<number>();
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= state.thrown.length) {
          return `there is no die at position ${index + 1}`;
        }
        if (seen.has(index)) {
          return `position ${index + 1} was given twice`;
        }
        seen.add(index);
      }
      const faces = indices.map((index) => state.thrown[index]!);
      if (scoreKeep(faces) === null) {
        return 'every kept die must be part of a scoring combination';
      }
      return null;
    }
  }
}

function endTurn(state: GameState, rng: RngState): ReduceResult {
  const next = (state.current + 1) % state.config.players.length;
  const turn = state.turn + 1;
  return {
    state: {
      ...state,
      rng,
      phase: 'AwaitingThrow',
      current: next,
      turn,
      turnScore: 0,
      inPlay: loadoutIndices(state.config.players[next]!),
      thrown: [],
      keptThisTurn: [],
    },
    events: [
      { type: 'TurnEnded', player: state.current, next },
      { type: 'TurnStarted', player: next, turn },
    ],
  };
}

function applyThrow(state: GameState): ReduceResult {
  const player = state.config.players[state.current]!;
  const dice = state.inPlay.map((index) => player.loadout[index]!);
  const rolled = rollDice(dice, state.rng);

  const thrownEvent: GameEvent = {
    type: 'Thrown',
    player: state.current,
    faces: rolled.faces,
  };

  if (!hasScoringDice(rolled.faces)) {
    const farkled: GameEvent = { type: 'Farkled', player: state.current, lost: state.turnScore };
    const ended = endTurn(state, rolled.state);
    return { state: ended.state, events: [thrownEvent, farkled, ...ended.events] };
  }

  return {
    state: { ...state, rng: rolled.state, phase: 'AwaitingKeep', thrown: rolled.faces },
    events: [thrownEvent],
  };
}

function applyKeep(state: GameState, indices: readonly number[]): ReduceResult {
  const faces = indices.map((index) => state.thrown[index]!);
  // Validated by `validateAction`, which `reduce` runs first.
  const scored = scoreKeep(faces)!;
  const turnScore = state.turnScore + scored.points;

  const kept = new Set(indices);
  const remaining = state.inPlay.filter((_, position) => !kept.has(position));
  const hotDice = remaining.length === 0;

  const events: GameEvent[] = [
    {
      type: 'Kept',
      player: state.current,
      indices,
      faces,
      combos: scored.combos,
      points: scored.points,
      turnScore,
    },
  ];
  if (hotDice) {
    events.push({ type: 'HotDice', player: state.current });
  }

  return {
    state: {
      ...state,
      phase: 'AwaitingBankOrThrow',
      turnScore,
      inPlay: hotDice ? loadoutIndices(state.config.players[state.current]!) : remaining,
      thrown: [],
      keptThisTurn: [...state.keptThisTurn, ...faces],
    },
    events,
  };
}

function applyBank(state: GameState): ReduceResult {
  const total = state.totals[state.current]! + state.turnScore;
  const totals = [...state.totals];
  totals[state.current] = total;

  const banked: GameEvent = {
    type: 'Banked',
    player: state.current,
    points: state.turnScore,
    total,
  };

  if (total >= state.config.target) {
    return {
      state: {
        ...state,
        totals,
        phase: 'MatchOver',
        winner: state.current,
        turnScore: 0,
        thrown: [],
      },
      events: [banked, { type: 'MatchWon', winner: state.current, total }],
    };
  }

  const ended = endTurn({ ...state, totals }, state.rng);
  return { state: ended.state, events: [banked, ...ended.events] };
}

/**
 * The whole of the game's behaviour: a pure transition from state and action to
 * the next state and the events that describe the change. Rejects illegal
 * actions rather than silently ignoring them.
 */
export function reduce(state: GameState, action: GameAction): ReduceResult {
  const problem = validateAction(state, action);
  if (problem !== null) {
    throw new IllegalActionError(`cannot ${action.type.toLowerCase()}: ${problem}`);
  }

  switch (action.type) {
    case 'Throw':
      return applyThrow(state);
    case 'Keep':
      return applyKeep(state, action.indices);
    case 'Bank':
      return applyBank(state);
  }
}

export interface MatchLog {
  readonly options: MatchOptions;
  readonly actions: readonly GameAction[];
}

/** Replays a logged match. Same log in, same events out — always. */
export function replay(log: MatchLog): ReduceResult {
  let state = createMatch(log.options);
  const events: GameEvent[] = [];
  for (const action of log.actions) {
    const result = reduce(state, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
