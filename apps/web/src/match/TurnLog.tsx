import { useEffect, useRef } from 'react';

import type { GameEvent } from '@farkle/engine';

import { buildLog, type LogEntry } from './logEntry';

export interface TurnLogProps {
  events: readonly GameEvent[];
  names: readonly string[];
  /** Stop pinning to the bottom once the match is over, so it can be read back. */
  autoScroll?: boolean;
}

function EntryRow({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case 'kept':
      return (
        <div className="log__row">
          <span className="log__dice">{entry.dice}</span>
          <span className="log__combos">{entry.combos}</span>
          <span className="log__points">+{entry.points}</span>
        </div>
      );
    case 'hot':
      return (
        <div className="log__row log__row--hot">
          <span className="log__badge">hot dice</span>
          <span className="log__combos">all six dice come back</span>
        </div>
      );
    case 'farkle':
      return (
        <div className="log__row log__row--farkle">
          <span className="log__badge">farkle</span>
          <span className="log__combos">
            {entry.lost > 0 ? `lost ${entry.lost} points` : 'nothing at stake'}
          </span>
        </div>
      );
    case 'bank':
      return (
        <div className="log__row log__row--bank">
          <span className="log__badge">banked</span>
          <span className="log__combos">{entry.points} points</span>
          <span className="log__points">{entry.total}</span>
        </div>
      );
    case 'win':
      return (
        <div className="log__row log__row--win">
          <span className="log__badge">wins</span>
          <span className="log__combos">with {entry.total} points</span>
        </div>
      );
  }
}

export function TurnLog({ events, names, autoScroll = true }: TurnLogProps) {
  const nameOf = (id: number): string => names[id] ?? `Player ${id}`;
  const turns = buildLog(events, nameOf);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (el !== null && autoScroll) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns.length, autoScroll]);

  if (turns.length === 0) {
    return (
      <div className="log log--empty">
        <p>The turn log will fill in as the match plays out.</p>
      </div>
    );
  }

  return (
    <div className="log" ref={containerRef}>
      {turns.map((turnBlock) => (
        <section key={`${turnBlock.turn}-${turnBlock.player}`} className="log__turn">
          <header className="log__turn-head">
            <span className="log__turn-number">Turn {turnBlock.turn}</span>
            <span className="log__turn-player">{turnBlock.player}</span>
          </header>
          {turnBlock.entries.map((entry, position) => (
            <EntryRow key={position} entry={entry} />
          ))}
        </section>
      ))}
    </div>
  );
}
