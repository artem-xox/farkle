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
