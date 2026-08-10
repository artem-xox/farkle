import { DICE_PER_TURN, type DieSpec } from '@farkle/engine';

import { iconicFace } from '../dice/descriptions';
import { Die } from '../match/Die';
import {
  CUSTOM_PRESET_ID,
  LOADOUT_PRESETS,
  presetOdds,
  type LoadoutPreset,
} from './loadoutPresets';

export interface LoadoutChoiceProps {
  /** A preset id, or `CUSTOM_PRESET_ID` when the player has been through the picker. */
  readonly selected: string;
  /** What the custom card previews — only read when `selected` is custom. */
  readonly customLoadout: readonly DieSpec[];
  readonly onSelectPreset: (id: string) => void;
  /** Opens the full picker. Selecting custom and choosing dice are the same gesture. */
  readonly onChooseCustom: () => void;
}

/** A row of six dice at card size, showing what a loadout is made of without naming every slot. */
function DiceStrip({ dice }: { readonly dice: readonly DieSpec[] }) {
  return (
    <span className="loadout-choice__strip" aria-hidden="true">
      {dice.map((die, index) => (
        <Die key={index} face={iconicFace(die)} dieId={die.id} />
      ))}
    </span>
  );
}

function presetDice(preset: LoadoutPreset): DieSpec[] {
  return new Array<DieSpec>(DICE_PER_TURN).fill(preset.die);
}

/**
 * The loadout decision, on the setup screen itself rather than behind it.
 *
 * This does not replace `LoadoutStep` — that screen was rebuilt around a sticky
 * rack and a tier-grouped catalog (docs/notes/loadout-screen-redesign.md) and is
 * far too much to inline here. It is option 3 from that note's "options
 * considered", which was deferred as the natural next step: name a few measured
 * loadouts, let the catalog stay one tap away for anyone who wants it.
 *
 * What it buys is one primary action. The screen used to offer "Choose dice" as
 * its main button and "Skip — play with ordinary dice" as an underlined
 * afterthought, which put the fast path second and still never showed a player
 * what the dice were for.
 */
export function LoadoutChoice({
  selected,
  customLoadout,
  onSelectPreset,
  onChooseCustom,
}: LoadoutChoiceProps) {
  return (
    <div className="field">
      <span className="field__label" id="loadout-label">
        Your dice
      </span>
      <div className="loadout-choice" role="radiogroup" aria-labelledby="loadout-label">
        {LOADOUT_PRESETS.map((preset) => {
          const active = selected === preset.id;
          const odds = presetOdds(preset);
          return (
            <button
              type="button"
              key={preset.id}
              role="radio"
              aria-checked={active}
              className={`loadout-choice__card${active ? ' loadout-choice__card--active' : ''}`}
              onClick={() => onSelectPreset(preset.id)}
            >
              <DiceStrip dice={presetDice(preset)} />
              <span className="loadout-choice__name">{preset.name}</span>
              <span className="loadout-choice__blurb">{preset.blurb}</span>
              <span className="loadout-choice__stat">
                Opening throw dies {odds.openingDies.toFixed(1)}% &middot; turn lost{' '}
                {odds.turnLost.toFixed(0)}%
              </span>
            </button>
          );
        })}

        <button
          type="button"
          role="radio"
          aria-checked={selected === CUSTOM_PRESET_ID}
          className={`loadout-choice__card${
            selected === CUSTOM_PRESET_ID ? ' loadout-choice__card--active' : ''
          }`}
          onClick={onChooseCustom}
        >
          {selected === CUSTOM_PRESET_ID ? (
            <DiceStrip dice={customLoadout} />
          ) : (
            <span className="loadout-choice__strip loadout-choice__strip--empty" aria-hidden="true">
              ?
            </span>
          )}
          <span className="loadout-choice__name">Custom</span>
          <span className="loadout-choice__blurb">
            Mix your own six from the full collection of nine.
          </span>
          <span className="loadout-choice__stat">
            {selected === CUSTOM_PRESET_ID ? 'Tap to edit' : 'Opens the picker'}
          </span>
        </button>
      </div>
    </div>
  );
}
