import { Celebration } from './Celebration';

export interface MatchOverOverlayProps {
  winnerName: string;
  winnerTotal: number;
  /** Whether the player at this device won — losing gets the same card without the confetti. */
  celebrate: boolean;
  onNewMatch: () => void;
  /** Dismisses the overlay, leaving the final board and full turn log readable. */
  onReviewLog: () => void;
}

/**
 * "You wins!" is the default case, not an edge one — the setup screen seeds
 * the human's name as "You" — so the verb has to agree with the name rather
 * than being hardcoded third-person.
 */
function winLine(winnerName: string): string {
  return /^you$/i.test(winnerName.trim()) ? 'You win!' : `${winnerName} wins!`;
}

export function MatchOverOverlay({
  winnerName,
  winnerTotal,
  celebrate,
  onNewMatch,
  onReviewLog,
}: MatchOverOverlayProps) {
  return (
    <div className="match-over">
      {/* Before the card in the DOM, and the card is the only positioned thing here, so the burst goes on behind it rather than over the text. */}
      {celebrate && <Celebration />}
      <div className="match-over__card">
        <h2>{winLine(winnerName)}</h2>
        <p>{winnerTotal} points</p>
        <div className="match-over__actions">
          <button type="button" className="match-over__button" onClick={onNewMatch}>
            New match
          </button>
          <button type="button" className="match-over__link" onClick={onReviewLog}>
            Review the log
          </button>
        </div>
      </div>
    </div>
  );
}
