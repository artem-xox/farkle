import { useEffect, useState } from 'react';

import { chooseBotAction, createPreset, type BotPolicy, type PresetName } from '@farkle/bots';
import {
  IllegalActionError,
  LocalHost,
  type GameAction,
  type GameEvent,
  type GameState,
  type KeepOption,
} from '@farkle/engine';

import { clearMatch, saveMatch } from '../storage';
import { DiceTray } from './DiceTray';
import { KeepOptions } from './KeepOptions';
import { MatchOverOverlay } from './MatchOverOverlay';
import { botThinkTime } from './pacing';
import { Scoreboard } from './Scoreboard';
import { matchingKeepOption } from './selection';
import { TurnLog } from './TurnLog';

export interface MatchScreenProps {
  initial: GameState;
  botSeat: number | null;
  botPreset: PresetName | null;
  onExit: () => void;
}

/** Derives the bot's own RNG seed from the match seed, so the bot's mistake
 * rolls (if any) are reproducible alongside the dice without needing a
 * separate seed input in the UI. */
const botSeedFrom = (matchSeed: number): number => (matchSeed ^ 0x9e3779b9) >>> 0;

export function MatchScreen({ initial, botSeat, botPreset, onExit }: MatchScreenProps) {
  const [host] = useState(() => new LocalHost(initial));
  const [bot] = useState<BotPolicy | null>(() =>
    botSeat !== null && botPreset !== null
      ? createPreset(botPreset, botSeedFrom(initial.config.seed))
      : null,
  );
  const [events, setEvents] = useState<readonly GameEvent[]>([]);
  const [selection, setSelection] = useState<readonly number[]>([]);
  const [spinToken, setSpinToken] = useState(0);

  // Persist on every change, and stop offering to resume a finished match.
  useEffect(() => {
    return host.subscribe((newEvents) => {
      setEvents((prev) => [...prev, ...newEvents]);
      setSelection([]);
      if (newEvents.some((event) => event.type === 'Thrown')) {
        setSpinToken((token) => token + 1);
      }
      if (host.state.phase === 'MatchOver') {
        clearMatch();
      } else {
        saveMatch({ state: host.state, botSeat, botPreset });
      }
    });
  }, [host, botSeat, botPreset]);

  // Drives the bot's seat one action at a time, paced so it's watchable.
  // Re-runs whenever `events` changes, i.e. whenever the game state might
  // have — reading `host.state` directly rather than depending on it, since
  // it isn't React state itself.
  useEffect(() => {
    if (bot === null || botSeat === null) {
      return;
    }
    const state = host.state;
    if (state.phase === 'MatchOver' || state.current !== botSeat) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) {
        return;
      }
      const view = host.view(botSeat);
      const action = chooseBotAction(view, bot);
      host.dispatch(botSeat, action).catch((error: unknown) => {
        // A bot only ever builds actions from what the engine already
        // offered it, so this would mean a real bug, not a bad move.
        console.error('bot action was rejected unexpectedly', error);
      });
    }, botThinkTime(state.phase));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, bot, botSeat, host]);

  const view = host.view(host.state.current);
  const isBotTurn = botSeat !== null && view.current === botSeat;
  const canAct = !isBotTurn && view.phase !== 'MatchOver';
  const currentPlayer = view.players[view.current]!;
  const matchedOption = matchingKeepOption(selection, view);

  async function dispatch(action: GameAction): Promise<void> {
    try {
      await host.dispatch(view.current, action);
    } catch (error) {
      if (!(error instanceof IllegalActionError)) {
        throw error;
      }
      // The UI only ever offers legal actions, so this would be a real bug —
      // surfacing it beats failing silently.
      console.error(error);
    }
  }

  function toggleDie(index: number): void {
    setSelection((prev) =>
      prev.includes(index) ? prev.filter((value) => value !== index) : [...prev, index],
    );
  }

  function pickOption(option: KeepOption): void {
    void dispatch({ type: 'Keep', indices: option.indices });
  }

  function keepSelection(): void {
    if (selection.length > 0) {
      void dispatch({ type: 'Keep', indices: selection });
    }
  }

  return (
    <div className="match">
      <Scoreboard view={view} botSeat={botSeat} />

      <div className="match__table">
        <DiceTray
          faces={view.thrown}
          spinToken={spinToken}
          selectable={canAct && view.phase === 'AwaitingKeep'}
          selection={selection}
          onToggle={toggleDie}
        />

        {view.phase === 'AwaitingKeep' && (
          <div className="selection-status">
            {selection.length === 0 ? (
              <p className="selection-status__hint">Click dice to select them, or pick an option below.</p>
            ) : matchedOption !== null ? (
              <p className="selection-status__ok">
                {matchedOption.points} points — click "Keep" or an option below to confirm.
              </p>
            ) : (
              <p className="selection-status__bad">
                These dice don't form a scoring combination. A single 1 or 5, three or more of a
                kind, or a straight — see the options below.
              </p>
            )}
          </div>
        )}

        {isBotTurn && <p className="thinking">{currentPlayer.name} is thinking…</p>}

        <div className="match__actions">
          {view.phase === 'AwaitingThrow' && (
            <button type="button" disabled={!canAct} onClick={() => void dispatch({ type: 'Throw' })}>
              Throw {view.diceInPlay} dice
            </button>
          )}
          {view.phase === 'AwaitingKeep' && (
            <button type="button" disabled={!canAct || matchedOption === null} onClick={keepSelection}>
              Keep selected dice
            </button>
          )}
          {view.phase === 'AwaitingBankOrThrow' && (
            <>
              <button type="button" disabled={!canAct} onClick={() => void dispatch({ type: 'Bank' })}>
                Bank {view.turnScore}
              </button>
              <button type="button" disabled={!canAct} onClick={() => void dispatch({ type: 'Throw' })}>
                Throw {view.diceInPlay} more
              </button>
            </>
          )}
        </div>

        {view.phase === 'AwaitingKeep' && (
          <KeepOptions
            options={view.keeps}
            thrown={view.thrown}
            selection={selection}
            disabled={!canAct}
            onPick={pickOption}
          />
        )}

        <div className="turn-status">
          <span>Turn score: {view.turnScore}</span>
          <span>{view.diceInPlay} dice in play</span>
        </div>
      </div>

      <TurnLog events={events} names={view.players.map((player) => player.name)} />

      <button type="button" className="match__exit" onClick={onExit}>
        Quit to menu
      </button>

      {view.phase === 'MatchOver' && view.winner !== null && (
        <MatchOverOverlay
          winnerName={view.players[view.winner]!.name}
          winnerTotal={view.players[view.winner]!.total}
          onNewMatch={onExit}
        />
      )}
    </div>
  );
}
