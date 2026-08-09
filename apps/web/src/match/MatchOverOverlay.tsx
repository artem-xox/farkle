export interface MatchOverOverlayProps {
  winnerName: string;
  winnerTotal: number;
  onNewMatch: () => void;
}

export function MatchOverOverlay({ winnerName, winnerTotal, onNewMatch }: MatchOverOverlayProps) {
  return (
    <div className="match-over">
      <div className="match-over__card">
        <h2>{winnerName} wins!</h2>
        <p>{winnerTotal} points</p>
        <button type="button" className="match-over__button" onClick={onNewMatch}>
          New match
        </button>
      </div>
    </div>
  );
}
