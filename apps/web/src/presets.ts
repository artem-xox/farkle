import type { PresetName } from '@farkle/bots';

/** Short blurbs for the setup screen — the personality shapes from docs/DESIGN.md §6. */
export const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  cautious: 'Banks early, rarely risks a big turn',
  balanced: 'A sensible, well-rounded player',
  aggressive: 'Pushes for big turns, banks late',
  reckless: 'High variance — no fear of hot dice',
  novice: 'Plays reasonably, but makes real mistakes',
};

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
