export {
  DICE_PER_TURN,
  FACES,
  type Combo,
  type ComboKind,
  type Counts,
  type Face,
  type KeepOption,
} from './types.js';

export { nextBelow, nextU32, seedRng, type RngResult, type RngState } from './rng.js';

export {
  assertValidDie,
  BALANCED_DIE,
  DICE,
  faceProbabilities,
  rollDice,
  rollDie,
  WEIGHTED_DIE,
  type DieSpec,
  type RollResult,
} from './dice.js';

export {
  bestKeep,
  countFaces,
  countsToFaces,
  hasScoringDice,
  isLegalKeep,
  legalKeeps,
  ofAKindPoints,
  scoreKeep,
  type ScoredKeep,
} from './scoring.js';

export {
  createMatch,
  DEFAULT_TARGET,
  IllegalActionError,
  reduce,
  replay,
  validateAction,
  type GameAction,
  type GameEvent,
  type GameState,
  type MatchConfig,
  type MatchLog,
  type MatchOptions,
  type Phase,
  type PlayerConfig,
  type PlayerId,
  type ReduceResult,
} from './match.js';

export {
  LocalHost,
  viewOf,
  type ClientView,
  type EventListener,
  type GameHost,
  type PlayerView,
  type Unsubscribe,
} from './host.js';
