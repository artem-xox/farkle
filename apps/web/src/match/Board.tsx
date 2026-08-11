import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { DieSpec, Face } from '@farkle/engine';

import { Die } from './Die';
import { FLY_MS, FLY_STAGGER_MS, TUMBLE_MS } from './pacing';

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  /**
   * Board indices of the most recent keep, from the engine's `Kept` event —
   * the source slots for the flight into the rail. Read from the event rather
   * than from `selection` because a bot never touches `selection`: it
   * dispatches its keep straight to the host, and taking the flight from the
   * player's click state left the bot's dice teleporting into the rail.
   */
  keptIndices: readonly number[];
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
  keptIndices,
  keptThisTurn,
  keptDiceThisTurn,
  spinToken,
  selectable,
  farkled = false,
  hint,
  onToggle,
}: BoardProps) {
  const [settled, setSettled] = useState(false);
  const boardDiceRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  /**
   * Where every die of the current throw sits, by board index. Kept as a
   * running cache rather than measured on demand: a keep replaces the whole
   * throw in the same batch that grows the rail, so by the time a die appears
   * in the rail the board position it flew from no longer exists to measure.
   */
  const boardRects = useRef<readonly DOMRect[]>([]);
  const keptCount = useRef(keptThisTurn.length);

  useEffect(() => {
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), TUMBLE_MS);
    return () => clearTimeout(timer);
    // spinToken changing means new dice landed — replay the settle delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  // Deliberately keeps the last measurement when the board empties: the render
  // that clears the throw is the very render the rail needs those rects for.
  useEffect(() => {
    const container = boardDiceRef.current;
    if (container === null) {
      return;
    }
    boardRects.current = Array.from(container.children, (die) => die.getBoundingClientRect());
    // `selection` is a dependency because picking a die lifts it — remeasuring
    // is what makes the flight start from the raised die rather than the felt.
  }, [thrown, spinToken, selection]);

  /**
   * Flies each newly kept die from the slot it was taken from into the rail —
   * for whoever is playing, since it keys off the engine's keep rather than
   * off anything the player's hands did.
   *
   * A FLIP: the die is already laid out in its final rail slot, and this
   * animates it *backwards* from the board rect captured above, so nothing
   * has to be positioned by hand or duplicated into a floating layer. Run as
   * a layout effect so the offset frame is painted first — in a plain effect
   * the die would flash at its destination before jumping back to the board.
   *
   * `applyKeep` in the engine appends the kept faces in the order of the
   * indices it was given, so the nth new rail slot came from `keptIndices[n]`.
   */
  useLayoutEffect(() => {
    const grew = keptThisTurn.length - keptCount.current;
    keptCount.current = keptThisTurn.length;
    const rail = railRef.current;
    if (grew <= 0 || rail === null || prefersReducedMotion()) {
      return;
    }
    for (let offset = 0; offset < grew; offset++) {
      const landed = rail.children[keptThisTurn.length - grew + offset];
      const source = keptIndices[offset];
      const from = source === undefined ? undefined : boardRects.current[source];
      if (!(landed instanceof HTMLElement) || from === undefined) {
        continue;
      }
      const to = landed.getBoundingClientRect();
      if (to.width === 0) {
        continue;
      }
      landed.animate(
        [
          {
            transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
          },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        {
          duration: FLY_MS,
          delay: offset * FLY_STAGGER_MS,
          easing: 'cubic-bezier(0.34, 0.85, 0.36, 1)',
          // Holds the die at the board end of the flight through its stagger
          // delay, instead of parking it in the rail until its turn comes.
          fill: 'backwards',
        },
      );
    }
  }, [keptThisTurn.length]);

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
          <div className="board__dice" ref={boardDiceRef}>
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
          <div className="board__aside-dice" ref={railRef}>
            {keptThisTurn.map((face, position) => (
              <Die key={`kept-${position}`} face={face} dieId={keptDiceThisTurn?.[position]?.id} tone="kept" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
