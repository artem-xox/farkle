import { useState } from 'react';

import type { PresetName } from '@farkle/bots';
import { createMatch, LocalHost, type GameState } from '@farkle/engine';

import { MatchScreen } from './match/MatchScreen';
import { SetupScreen, type NewMatchOptions } from './setup/SetupScreen';
import { clearMatch, loadMatch } from './storage';

interface MatchSession {
  readonly id: string;
  readonly initial: GameState;
  readonly botSeat: number | null;
  readonly botPreset: PresetName | null;
}

function freshId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

/**
 * Resumes a saved match if one exists and still parses into something
 * `LocalHost` accepts — the one place that has to handle a corrupt or
 * schema-mismatched save, since `storage.ts` itself doesn't validate.
 */
function resumeFromStorage(): MatchSession | null {
  const stored = loadMatch();
  if (stored === null) {
    return null;
  }
  try {
    new LocalHost(stored.state);
  } catch {
    clearMatch();
    return null;
  }
  if (stored.state.phase === 'MatchOver') {
    clearMatch();
    return null;
  }
  return { id: 'resumed', initial: stored.state, botSeat: stored.botSeat, botPreset: stored.botPreset };
}

export function App() {
  const [session, setSession] = useState<MatchSession | null>(() => resumeFromStorage());

  function startMatch(options: NewMatchOptions): void {
    const initial = createMatch({ players: options.players, target: options.target, seed: options.seed });
    setSession({ id: freshId(), initial, botSeat: options.botSeat, botPreset: options.botPreset });
  }

  if (session === null) {
    return <SetupScreen onStart={startMatch} />;
  }

  return (
    <MatchScreen
      key={session.id}
      initial={session.initial}
      botSeat={session.botSeat}
      botPreset={session.botPreset}
      onExit={() => setSession(null)}
    />
  );
}
