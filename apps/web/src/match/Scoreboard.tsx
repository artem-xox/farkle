import type { ClientView } from '@farkle/engine';

export interface ScoreboardProps {
  view: ClientView;
  botSeat: number | null;
}

export function Scoreboard({ view, botSeat }: ScoreboardProps) {
  return (
    <div className="scoreboard">
      {view.players.map((player) => (
        <div
          key={player.id}
          className={`scoreboard__player${player.id === view.current ? ' scoreboard__player--active' : ''}`}
        >
          <span className="scoreboard__name">
            {player.name}
            {player.id === botSeat && <span className="scoreboard__tag">bot</span>}
          </span>
          <span className="scoreboard__total">{player.total}</span>
        </div>
      ))}
      <div className="scoreboard__target">first to {view.target}</div>
    </div>
  );
}
