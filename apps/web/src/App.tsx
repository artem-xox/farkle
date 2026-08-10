import { useState } from 'react';

import type { PresetName } from '@farkle/bots';
import { createMatch, LocalHost, type GameState } from '@farkle/engine';

import { DiceScreen } from './dice/DiceScreen';
import { MatchScreen } from './match/MatchScreen';
import { RulesScreen } from './rules/RulesScreen';
import { SetupScreen, type NewMatchOptions } from './setup/SetupScreen';
import { clearMatch, loadMatch } from './storage';

interface MatchSession {
  readonly id: string;
  readonly initial: GameState;
  readonly botSeat: number | null;
  readonly botPreset: PresetName | null;
}

type Tab = 'play' | 'dice' | 'rules';

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
  const [tab, setTab] = useState<Tab>('play');

  function startMatch(options: NewMatchOptions): void {
    const initial = createMatch({ players: options.players, target: options.target, seed: options.seed });
    setSession({ id: freshId(), initial, botSeat: options.botSeat, botPreset: options.botPreset });
  }

  return (
    <div className="app">
      <nav className="tabs" aria-label="Sections">
        <button
          type="button"
          className={`tabs__tab${tab === 'play' ? ' tabs__tab--active' : ''}`}
          aria-current={tab === 'play'}
          onClick={() => setTab('play')}
        >
          Play
        </button>
        <button
          type="button"
          className={`tabs__tab${tab === 'dice' ? ' tabs__tab--active' : ''}`}
          aria-current={tab === 'dice'}
          onClick={() => setTab('dice')}
        >
          Dice
        </button>
        <button
          type="button"
          className={`tabs__tab${tab === 'rules' ? ' tabs__tab--active' : ''}`}
          aria-current={tab === 'rules'}
          onClick={() => setTab('rules')}
        >
          Rules
        </button>
      </nav>

      {/*
        The play tab stays mounted while the rules are open: MatchScreen owns
        the LocalHost, the event log and the bot's timers, none of which
        survive an unmount. Reading the rules mid-match must not forfeit it.
      */}
      <main className="app__panel" hidden={tab !== 'play'}>
        {session === null ? (
          <SetupScreen onStart={startMatch} />
        ) : (
          <MatchScreen
            key={session.id}
            initial={session.initial}
            botSeat={session.botSeat}
            botPreset={session.botPreset}
            onExit={() => setSession(null)}
          />
        )}
      </main>

      {tab === 'dice' && (
        <main className="app__panel">
          <DiceScreen />
        </main>
      )}

      {tab === 'rules' && (
        <main className="app__panel">
          <RulesScreen />
        </main>
      )}
    </div>
  );
}
