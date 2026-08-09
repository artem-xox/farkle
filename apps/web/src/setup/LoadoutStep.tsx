import type { DieSpec } from '@farkle/engine';

import { LoadoutPicker } from './LoadoutPicker';

export interface LoadoutStepProps {
  readonly yourLoadout: readonly DieSpec[];
  readonly opponentLoadout: readonly DieSpec[];
  readonly opponentLabel: string;
  readonly opponentEditable: boolean;
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
  onChangeYours,
  onChangeOpponent,
  onBack,
  onStart,
}: LoadoutStepProps) {
  return (
    <div className="setup">
      <h1 className="setup__title">Choose your dice</h1>
      <p className="setup__subtitle">Six per loadout — see Rules for exact odds on each die</p>

      <div className="setup__form">
        <LoadoutPicker label="Your dice" loadout={yourLoadout} onChange={onChangeYours} />
        <LoadoutPicker
          label={opponentLabel}
          loadout={opponentLoadout}
          onChange={onChangeOpponent}
          disabled={!opponentEditable}
        />

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
