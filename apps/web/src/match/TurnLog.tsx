import { useEffect, useRef } from 'react';

import type { GameEvent } from '@farkle/engine';

import { eventLine } from './eventLine';

export interface TurnLogProps {
  events: readonly GameEvent[];
  names: readonly string[];
}

const MAX_LINES = 60;

export function TurnLog({ events, names }: TurnLogProps) {
  const nameOf = (id: number): string => names[id] ?? `Player ${id}`;
  const lines = events
    .map((event, index) => ({ index, text: eventLine(event, nameOf) }))
    .filter((line): line is { index: number; text: string } => line.text !== null)
    .slice(-MAX_LINES);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div className="turn-log" ref={containerRef}>
      {lines.map((line) => (
        <div key={line.index} className="turn-log__line">
          {line.text}
        </div>
      ))}
    </div>
  );
}
