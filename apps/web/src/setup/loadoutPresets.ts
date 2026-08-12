import { BALANCED_DIE, DICE_PER_TURN, type DieSpec } from '@farkle/engine';

import { DIE_STATS } from '../dice/stats';

export interface LoadoutPreset {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** The one die every slot is filled with. */
  readonly die: DieSpec;
  /**
   * How often a turn with these dice ends scoring nothing, as a fraction.
   *
   * Measured with `farkle sim --a balanced --b balanced --loadout-a <die>
   * --loadout-b <die> -n 20000 --seed 7 --target 3000`. Copied by hand like
   * everything in `dice/stats.ts`, and stale the moment a die's weights change.
   *
   * Deliberately *not* `farkle6`: the two disagree, and the card shows both. A
   * die can have the worst opening throw in the roster and still lose the
   * fewest turns, because what kills a turn is usually the throw with one or
   * two dice left rather than the full six.
   */
  readonly turnFarkle: number;
}

/**
 * The named loadouts offered on the setup screen, with "Custom" beside them as
 * the way into the full picker.
 *
 * There is exactly one, and that is deliberate: ordinary dice are the game as
 * written, and anything else is a build rather than a menu item. An earlier
 * pass shipped two more — `worn` and `devil`, as "Steady" and "Devil's luck".
 * They measured well and read nicely, but three cards plus Custom pushed the
 * setup screen past two full phone screens for a decision most players make
 * once. The dice themselves are untouched and the full collection remains one
 * tap away in Custom, where the tier catalog explains them better than a card
 * could.
 *
 * If named builds come back, the finding that shaped them still holds:
 * docs/researches/2026-08-10-mixed-loadout-strategy.md §6 measured every
 * hand-built mix as worse than the pure loadouts, with `kitchen-sink` — one of
 * each non-set die — the weakest build tested. A mixed preset would be
 * offering the player something we have measured to be bad.
 */
export const LOADOUT_PRESETS: readonly LoadoutPreset[] = [
  {
    id: 'ordinary',
    name: 'Ordinary',
    blurb: 'Six fair dice. The game exactly as it is written.',
    die: BALANCED_DIE,
    turnFarkle: 0.293,
  },
];

export const DEFAULT_PRESET_ID = 'ordinary';

/** Sentinel for "none of the above" — the setup screen's fourth card, which opens the full picker rather than naming a loadout. */
export const CUSTOM_PRESET_ID = 'custom';

export const presetById = (id: string): LoadoutPreset | undefined =>
  LOADOUT_PRESETS.find((preset) => preset.id === id);

export const presetLoadout = (preset: LoadoutPreset): DieSpec[] =>
  new Array<DieSpec>(DICE_PER_TURN).fill(preset.die);

/**
 * The two numbers a player is actually choosing between, as percentages.
 *
 * Both are shown because either alone misleads: `openingDies` (`farkle6` from
 * the roster) ranks `devil` worst and `worn` best, and `turnLost` ranks them
 * the other way round. The pair is the trade — a safe first throw against a
 * turn that survives once the dice run low.
 */
export const presetOdds = (preset: LoadoutPreset): { openingDies: number; turnLost: number } => ({
  openingDies: (DIE_STATS[preset.die.id]?.farkle6 ?? 0) * 100,
  turnLost: preset.turnFarkle * 100,
});
