import { useState, type CSSProperties } from 'react';

import type { PresetName } from '@farkle/bots';
import { createMatch, LocalHost, type GameState } from '@farkle/engine';

import { AboutAuthor } from './AboutAuthor';
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
  readonly bestTurn: number;
}

type Tab = 'play' | 'dice' | 'rules';

/**
 * In display order, because the sliding thumb behind the tab strip is placed
 * from an index into this list rather than from a measured button position —
 * the strip is an equal-column grid, so "third of the way along" is exact
 * without touching the DOM.
 */
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'dice', label: 'Dice' },
  { id: 'rules', label: 'Rules' },
];

const randomSeed = (): number => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

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
  return {
    id: 'resumed',
    initial: stored.state,
    botSeat: stored.botSeat,
    botPreset: stored.botPreset,
    // Saves written before best-turn tracking existed have no value here.
    bestTurn: stored.bestTurn ?? 0,
  };
}

export function App() {
  const [session, setSession] = useState<MatchSession | null>(() => resumeFromStorage());
  const [tab, setTab] = useState<Tab>('play');

  function startMatch(options: NewMatchOptions): void {
    const initial = createMatch({ players: options.players, target: options.target, seed: options.seed });
    setSession({ id: freshId(), initial, botSeat: options.botSeat, botPreset: options.botPreset, bestTurn: 0 });
  }

  /**
   * Quitting discards the match rather than parking it.
   *
   * `MatchScreen` clears the save when a match *finishes*, but leaving one
   * unfinished only dropped the session held in memory — the save stayed
   * behind, so the next reload resumed a match the player had explicitly
   * walked away from. Storage is the only thing that survives a reload, so
   * this is the one place the decision can be made stick.
   */
  function exitMatch(): void {
    clearMatch();
    setSession(null);
  }

  /**
   * Deals the same match again on a fresh seed — same players, same dice, same
   * target, different luck.
   *
   * Everything it needs is already in the current match's own config, so this
   * costs no extra plumbing: `MatchConfig` carries the players (with their
   * loadouts) and the target, and a resumed match carries them just the same.
   * Only the seat and personality live outside it. The new `id` is what
   * remounts `MatchScreen`, whose `LocalHost` is created once per mount.
   */
  function restartMatch(): void {
    if (session === null) {
      return;
    }
    clearMatch();
    const { players, target } = session.initial.config;
    setSession({
      id: freshId(),
      initial: createMatch({ players, target, seed: randomSeed() }),
      botSeat: session.botSeat,
      botPreset: session.botPreset,
      bestTurn: 0,
    });
  }

  return (
    <div className="app">
      <nav className="tabs" aria-label="Sections">
        {/*
          The gold pill is one element that slides between the tabs rather than
          a background that blinks on and off each button — the movement is
          what tells you the two sections are neighbours. Purely decorative,
          so it stays out of the accessibility tree; `aria-current` on the
          buttons is what actually reports the selection.
        */}
        <span
          className="tabs__thumb"
          style={{ '--tab-index': TABS.findIndex((entry) => entry.id === tab) } as CSSProperties}
          aria-hidden="true"
        />
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`tabs__tab${tab === entry.id ? ' tabs__tab--active' : ''}`}
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {/*
        The play tab stays mounted while the rules are open: MatchScreen owns
        the LocalHost, the event log and the bot's timers, none of which
        survive an unmount. Reading the rules mid-match must not forfeit it.
      */}
      <main className="app__panel" hidden={tab !== 'play'}>
        {session === null ? (
          <SetupScreen onStart={startMatch} onShowRules={() => setTab('rules')} />
        ) : (
          <MatchScreen
            key={session.id}
            initial={session.initial}
            botSeat={session.botSeat}
            botPreset={session.botPreset}
            initialBestTurn={session.bestTurn}
            onExit={exitMatch}
            onRestart={restartMatch}
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

      <AboutAuthor />
    </div>
  );
}
