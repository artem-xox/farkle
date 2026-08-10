import type { DieSpec } from '@farkle/engine';

import { iconicFace } from '../dice/descriptions';
import { Die } from '../match/Die';
import { LoadoutPicker } from './LoadoutPicker';

export interface LoadoutStepProps {
  readonly yourLoadout: readonly DieSpec[];
  readonly opponentLoadout: readonly DieSpec[];
  readonly opponentLabel: string;
  readonly opponentEditable: boolean;
  /** Why the opponent's dice are what they are — the answer changed once the bot could mirror the player's loadout. */
  readonly opponentNote: string;
  readonly onChangeYours: (loadout: DieSpec[]) => void;
  readonly onChangeOpponent: (loadout: DieSpec[]) => void;
  readonly onBack: () => void;
  readonly onStart: () => void;
}

/**
 * The loadout screen from docs/PLAN.md M5, on its own step rather than
 * crammed into the same form as the name and target — it's a real decision
 * with its own detail (see Rules for the odds behind each die), not a minor
 * option alongside "first to".
 */
export function LoadoutStep({
  yourLoadout,
  opponentLoadout,
  opponentLabel,
  opponentEditable,
  opponentNote,
  onChangeYours,
  onChangeOpponent,
  onBack,
  onStart,
}: LoadoutStepProps) {
  return (
    <div className="setup setup--wide">
      <h1 className="setup__title">Choose your dice</h1>
      <p className="setup__subtitle">Tap a card to fill the highlighted slot — happy with plain dice? Skip ahead below.</p>

      <div className="setup__form">
        <LoadoutPicker label="Your dice" loadout={yourLoadout} onChange={onChangeYours} />

        {opponentEditable ? (
          <LoadoutPicker label={opponentLabel} loadout={opponentLoadout} onChange={onChangeOpponent} />
        ) : (
          <div className="loadout loadout--readonly">
            <span className="field__label">{opponentLabel}</span>
            <div className="loadout__slots loadout__slots--compact">
              {opponentLoadout.map((die, index) => (
                <span className="loadout-slot loadout-slot--readonly" key={index} title={die.name}>
                  <Die face={iconicFace(die)} dieId={die.id} />
                </span>
              ))}
            </div>
            <p className="loadout__note">{opponentNote}</p>
          </div>
        )}

        <div className="setup__step-actions">
          <button type="button" className="action" onClick={onBack}>
            Back
          </button>
          <button type="button" className="setup__start" onClick={onStart}>
            Start match
          </button>
        </div>
      </div>
    </div>
  );
}
