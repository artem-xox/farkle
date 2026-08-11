import type { ClientView, PlayerView } from '@farkle/engine';

export interface ScoreboardProps {
  view: ClientView;
  botSeat: number | null;
}

function Side({
  player,
  active,
  isBot,
  target,
  side,
}: {
  player: PlayerView;
  active: boolean;
  isBot: boolean;
  target: number;
  side: 'left' | 'right';
}) {
  const toGo = Math.max(0, target - player.total);

  return (
    <div
      className={`scoreboard__side scoreboard__side--${side}${active ? ' scoreboard__side--active' : ''}`}
    >
      <span className="scoreboard__name">
        {player.name}
        {isBot && <span className="scoreboard__tag">bot</span>}
      </span>
      <span className="scoreboard__total">{player.total}</span>
      <span className="scoreboard__togo">{toGo === 0 ? 'there' : `${toGo} to go`}</span>
    </div>
  );
}

/**
 * The two players on opposite edges with the goal between them, rather than a
 * left-packed row that read as one list of three similar things.
 *
 * Exactly two seats is safe to assume here: `NewMatchOptions.players` is a
 * two-tuple, so the setup screen cannot produce a match with any other number,
 * and it is the only thing that produces one.
 */
export function Scoreboard({ view, botSeat }: ScoreboardProps) {
  const [you, them] = view.players;
  if (you === undefined || them === undefined) {
    return null;
  }

  return (
    <div className="scoreboard">
      <Side
        player={you}
        active={you.id === view.current}
        isBot={you.id === botSeat}
        target={view.target}
        side="left"
      />

      <div className="scoreboard__goal">
        <span className="scoreboard__goal-label">Goal</span>
        <span className="scoreboard__goal-value">{view.target}</span>
      </div>

      <Side
        player={them}
        active={them.id === view.current}
        isBot={them.id === botSeat}
        target={view.target}
        side="right"
      />
    </div>
  );
}
