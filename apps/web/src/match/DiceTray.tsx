import { useEffect, useState } from 'react';

import type { Face } from '@farkle/engine';

import { Die } from './Die';
import { TUMBLE_MS } from './pacing';

export interface DiceTrayProps {
  faces: readonly Face[];
  /** Bumped by the parent each time a fresh throw lands, to replay the tumble. */
  spinToken: number;
  selectable: boolean;
  selection: readonly number[];
  onToggle: (index: number) => void;
}

export function DiceTray({ faces, spinToken, selectable, selection, onToggle }: DiceTrayProps) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), TUMBLE_MS);
    return () => clearTimeout(timer);
    // spinToken changing means new dice landed — replay the settle delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  if (faces.length === 0) {
    return <div className="dice-tray dice-tray--empty">no dice on the table</div>;
  }

  return (
    <div className="dice-tray">
      {faces.map((face, index) => (
        <Die
          key={`${spinToken}-${index}`}
          face={face}
          selected={selection.includes(index)}
          disabled={!selectable || !settled}
          onClick={() => onToggle(index)}
        />
      ))}
    </div>
  );
}
