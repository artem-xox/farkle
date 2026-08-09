import { useEffect, useState } from 'react';

import type { DieSpec, Face } from '@farkle/engine';

import { Die } from './Die';
import { TUMBLE_MS } from './pacing';

export interface BoardProps {
  /** The current throw. Empty between throws. */
  thrown: readonly Face[];
  /**
   * The dice that produced `thrown`, parallel to it — drives each die's
   * identity colour. Omitted (or shorter than `thrown`) falls back to the
   * plain look, which is all a farkle hold can offer — see MatchScreen.
   */
  thrownDice?: readonly DieSpec[];
  /** Indices into `thrown` the player has picked, but not yet committed with an action button. */
  selection: readonly number[];
  /** Faces already committed earlier in this turn — no longer takeable back. */
  keptThisTurn: readonly Face[];
  /** The dice that produced `keptThisTurn`, parallel to it. */
  keptDiceThisTurn?: readonly DieSpec[];
  /** Bumped by the parent each time a fresh throw lands, to replay the tumble. */
  spinToken: number;
  selectable: boolean;
  /** Render the dice on the board as busted, for the farkle hold. */
  farkled?: boolean;
  hint: string;
  onToggle: (index: number) => void;
}

/**
 * The table: a board holding every die from the current throw, and a rail
 * beside it holding dice already committed earlier in the turn (via Keep) —
 * no longer retractable.
 *
 * Picking dice for this throw only outlines them in place; nothing moves to
 * the rail until the player actually presses "Keep & throw" or "Keep &
 * bank", so a click is reversible right up to the moment it isn't.
 */
export function Board({
  thrown,
  thrownDice,
  selection,
  keptThisTurn,
  keptDiceThisTurn,
  spinToken,
  selectable,
  farkled = false,
  hint,
  onToggle,
}: BoardProps) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), TUMBLE_MS);
    return () => clearTimeout(timer);
    // spinToken changing means new dice landed — replay the settle delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  const onBoard = thrown.map((face, index) => ({
    face,
    index,
    dieId: thrownDice?.[index]?.id,
    picked: selection.includes(index),
  }));

  const asideEmpty = keptThisTurn.length === 0;

  return (
    <div className="board">
      <div className={`board__surface${farkled ? ' board__surface--farkled' : ''}`}>
        {onBoard.length === 0 ? (
          <p className="board__hint">{hint}</p>
        ) : (
          <div className="board__dice">
            {onBoard.map((die) => (
              <Die
                key={`${spinToken}-${die.index}`}
                face={die.face}
                dieId={die.dieId}
                tumbling={!settled}
                tone={farkled ? 'dead' : die.picked ? 'selected' : 'default'}
                disabled={!selectable || !settled}
                {...(selectable ? { onClick: () => onToggle(die.index) } : {})}
              />
            ))}
          </div>
        )}
      </div>

      <div className="board__aside">
        <span className="board__aside-label">Set aside</span>
        {asideEmpty ? (
          <span className="board__aside-empty">—</span>
        ) : (
          <div className="board__aside-dice">
            {keptThisTurn.map((face, position) => (
              <Die key={`kept-${position}`} face={face} dieId={keptDiceThisTurn?.[position]?.id} tone="kept" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
