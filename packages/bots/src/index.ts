export type { BotPolicy } from './policy.js';

export { ThresholdBot, type BotParams } from './threshold-bot.js';

export {
  createPreset,
  isPresetName,
  PRESET_NAMES,
  PRESETS,
  type PresetName,
} from './presets.js';

export { chooseBotAction, playBotMatch, type BotMatchResult } from './play.js';

export { summarizeMatch, type MatchSummary, type PlayerMatchStats } from './analyze.js';

export { wilsonInterval } from './stats.js';

export { balancedFarkleProbability, farkleProbability, safetyRatio } from './odds.js';

export {
  runSimulation,
  type SideReport,
  type SimulationOptions,
  type SimulationReport,
} from './simulate.js';
