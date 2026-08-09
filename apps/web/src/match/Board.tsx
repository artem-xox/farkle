import { useEffect, useState } from 'react';

import type { Face } from '@farkle/engine';

import { Die } from './Die';
import { TUMBLE_MS } from './pacing';

export interface BoardProps {
  /** The current throw. Empty between throws. */
  thrown: readonly Face[];
  /** Indices into `thrown` the player has set aside but not yet committed. */
  selection: readonly number[];
  /** Faces already committed earlier in this turn — no longer takeable back. */
  keptThisTurn: readonly Face[];
  /** Bumped by the parent each time a fresh throw lands, to replay the tumble. */
  spinToken: number;
  selectable: boolean;
  /** Render the dice on the board as busted, for the farkle hold. */
  farkled?: boolean;
  hint: string;
  onToggle: (index: number) => void;
}

/**
 * The table: a board holding the dice still live in the current throw, and a
 * rail beside it holding dice that are out of play — the ones the player has
 * clicked this throw (still retractable) and the ones already committed
 * earlier in the turn (not).
 *
 * Clicking a die physically moves it between the two, which is the whole
 * point: "set aside" is what keeping dice actually is, so the layout says so
 * rather than relying on a highlight colour.
 */
export function Board({
  thrown,
  selection,
  keptThisTurn,
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

  const staged = selection.map((index) => ({ index, face: thrown[index]! }));
  const onBoard = thrown
    .map((face, index) => ({ face, index }))
    .filter((die) => !selection.includes(die.index));

  const asideEmpty = staged.length === 0 && keptThisTurn.length === 0;

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
                tumbling={!settled}
                tone={farkled ? 'dead' : 'default'}
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
              <Die key={`kept-${position}`} face={face} tone="kept" />
            ))}
            {staged.map((die) => (
              <Die
                key={`staged-${spinToken}-${die.index}`}
                face={die.face}
                tone="staged"
                disabled={!selectable}
                {...(selectable ? { onClick: () => onToggle(die.index) } : {})}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
