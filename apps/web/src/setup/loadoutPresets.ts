import { BALANCED_DIE, DEVIL_DIE, DICE_PER_TURN, WORN_DIE, type DieSpec } from '@farkle/engine';

import { DIE_STATS } from '../dice/stats';

export interface LoadoutPreset {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** The one die every slot is filled with. All three presets are pure — see the note below on why. */
  readonly die: DieSpec;
  /**
   * How often a turn with these dice ends scoring nothing, as a fraction.
   *
   * Measured with `farkle sim --a balanced --b balanced --loadout-a <die>
   * --loadout-b <die> -n 20000 --seed 7 --target 3000`, i.e. with both sides on
   * this loadout, which is the mirrored case the setup screen defaults to.
   * Copied by hand like everything in `dice/stats.ts`, and stale the moment a
   * die's weights change.
   *
   * This is deliberately *not* `farkle6`, and the two disagree in a way worth
   * knowing: `devil` has the worst opening throw in the roster (6.3% dead) and
   * yet the *best* turn survival of these three (12%), because its wildcard
   * rescues the throws where only one or two dice are left. Showing only
   * `farkle6` would have said "Devil's luck busts ten times more than Steady",
   * which is false at the scale a player actually experiences.
   */
  readonly turnFarkle: number;
}

/**
 * The three loadouts offered on the setup screen, with "Custom" as the fourth
 * way out into the full picker.
 *
 * **All three are pure**, which is a finding rather than a shortcut:
 * docs/researches/2026-08-10-mixed-loadout-strategy.md §6 measured every
 * hand-built mix against the pure loadouts and none of them won. `kitchen-sink`
 * — one of each non-set die — was the *weakest* build tested, below even
 * `trinity` ×6. Mixing for its own sake averages each die's specific strength
 * down instead of stacking advantages, so a mixed preset would be offering the
 * player something we have measured to be worse.
 *
 * **Why these three.** `worn` and `devil` are within half a point of each other
 * on win rate (61.8% vs 61.2%, DESIGN.md §5) and at opposite ends of the roster
 * on bust rate (0.6% vs 6.3% farkle on a full throw). That is the balance band
 * doing exactly what it exists for: same strength, opposite texture. Picking
 * between them is a choice about how a match should *feel*, not which is
 * stronger — which is the only kind of choice worth putting on a first screen.
 *
 * `cheat` ×6 is the strongest loadout measured (research §6) and is deliberately
 * not here: its texture sits between the other two, so as a fourth card it would
 * add strength without adding a decision. It stays in the Custom picker.
 */
export const LOADOUT_PRESETS: readonly LoadoutPreset[] = [
  {
    id: 'ordinary',
    name: 'Ordinary',
    blurb: 'Six fair dice. The game exactly as it is written.',
    die: BALANCED_DIE,
    turnFarkle: 0.293,
  },
  {
    id: 'steady',
    name: 'Steady',
    blurb: 'Worn dice — the 2 is rubbed smooth and never comes up, so a fresh throw almost never dies.',
    die: WORN_DIE,
    turnFarkle: 0.19,
  },
  {
    id: 'devils-luck',
    name: "Devil's luck",
    blurb:
      "Devil's Head dice — no 1s at all, but a wildcard that finishes combinations. Risky to open with, hard to kill once a turn is going.",
    die: DEVIL_DIE,
    turnFarkle: 0.12,
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
