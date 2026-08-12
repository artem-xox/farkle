import { useEffect, useRef, useState } from 'react';

import { chooseBotAction, createPreset, type BotPolicy, type PresetName } from '@farkle/bots';
import {
  IllegalActionError,
  LocalHost,
  type DieSpec,
  type Face,
  type GameAction,
  type GameEvent,
  type GameState,
  type KeepOption,
} from '@farkle/engine';

import { clearMatch, recordMatch, saveMatch } from '../storage';
import { Board } from './Board';
import { ConfirmDialog } from './ConfirmDialog';
import { FarkleNotice } from './FarkleNotice';
import { KeepOptions } from './KeepOptions';
import { MatchOverOverlay } from './MatchOverOverlay';
import { botThinkTime, farklePauseMs, THROW_AFTER_KEEP_MS } from './pacing';
import { Scoreboard } from './Scoreboard';
import { matchingKeepOption } from './selection';
import { TurnLog } from './TurnLog';

export interface MatchScreenProps {
  initial: GameState;
  botSeat: number | null;
  botPreset: PresetName | null;
  /** The player's best banked turn carried over from a resumed match — events aren't persisted, so this arrives from the save rather than from the log. */
  initialBestTurn: number;
  onExit: () => void;
  /** Starts a fresh match with the same players, dice and target, on a new seed. */
  onRestart: () => void;
}

/** Derives the bot's own RNG seed from the match seed, so the bot's mistake
 * rolls (if any) are reproducible alongside the dice without needing a
 * separate seed input in the UI. */
const botSeedFrom = (matchSeed: number): number => (matchSeed ^ 0x9e3779b9) >>> 0;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface FarkleHold {
  readonly player: number;
  readonly faces: readonly Face[];
  readonly lost: number;
}

export function MatchScreen({
  initial,
  botSeat,
  botPreset,
  initialBestTurn,
  onExit,
  onRestart,
}: MatchScreenProps) {
  const [host] = useState(() => new LocalHost(initial));
  const [bot] = useState<BotPolicy | null>(() =>
    botSeat !== null && botPreset !== null
      ? createPreset(botPreset, botSeedFrom(initial.config.seed))
      : null,
  );
  const [events, setEvents] = useState<readonly GameEvent[]>([]);
  const [selection, setSelection] = useState<readonly number[]>([]);
  const [spinToken, setSpinToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [farkleHold, setFarkleHold] = useState<FarkleHold | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  /**
   * Which die spec produced each face in `view.keptThisTurn`, parallel to it
   * — the engine only keeps the resolved faces, not the dice that rolled
   * them, so this is tracked alongside rather than derived. Reset whenever
   * the engine's own `keptThisTurn` resets, i.e. at the start of a new turn.
   */
  const [keptDiceThisTurn, setKeptDiceThisTurn] = useState<readonly DieSpec[]>([]);
  /**
   * Board slots the last keep took its dice from, for the Board's flight into
   * the set-aside rail. Sourced from the `Kept` event rather than from
   * `selection` so it covers the bot's keeps too — the bot dispatches straight
   * to the host and never touches the player's selection.
   */
  const [keptIndices, setKeptIndices] = useState<readonly number[]>([]);

  /**
   * The human's seat. Every match the setup screen builds puts the player
   * first, but deriving it rather than hardcoding 0 keeps this honest if a bot
   * ever opens.
   */
  const youSeat = botSeat === 0 ? 1 : 0;

  /**
   * Best banked turn so far, in a ref rather than state: nothing renders it
   * during the match, and it must not be part of the dependency chain that
   * drives the bot's timer.
   */
  const bestTurn = useRef(initialBestTurn);
  /** A match resolves once, but the phase stays `MatchOver` — this stops a second event batch double-counting it. */
  const recorded = useRef(false);
  /** Which destructive action is waiting on a confirmation, if any. */
  const [pendingExit, setPendingExit] = useState<'quit' | 'restart' | null>(null);

  // Persist on every change, and stop offering to resume a finished match.
  useEffect(() => {
    return host.subscribe((newEvents) => {
      setEvents((prev) => [...prev, ...newEvents]);
      setSelection([]);
      if (newEvents.some((event) => event.type === 'Thrown')) {
        setSpinToken((token) => token + 1);
      }
      if (newEvents.some((event) => event.type === 'TurnStarted')) {
        setKeptDiceThisTurn([]);
      }

      // A farkle arrives in the same batch as the throw that caused it and the
      // handover to the next player, so by the time we see it the board has
      // already moved on. Capture the dice that busted, and hold them on
      // screen until the player acknowledges — see pacing.ts.
      let lastThrow: readonly Face[] = [];
      for (const event of newEvents) {
        if (event.type === 'Thrown') {
          lastThrow = event.faces;
        } else if (event.type === 'Kept') {
          setKeptIndices(event.indices);
        } else if (event.type === 'Farkled') {
          setFarkleHold({ player: event.player, faces: lastThrow, lost: event.lost });
        } else if (event.type === 'Banked' && event.player === youSeat) {
          bestTurn.current = Math.max(bestTurn.current, event.points);
        }
      }

      if (host.state.phase === 'MatchOver') {
        clearMatch();
        if (!recorded.current) {
          recorded.current = true;
          const them = youSeat === 0 ? 1 : 0;
          recordMatch({
            at: Date.now(),
            target: host.state.config.target,
            opponent: botPreset,
            youWon: host.state.winner === youSeat,
            yourTotal: host.state.totals[youSeat] ?? 0,
            opponentTotal: host.state.totals[them] ?? 0,
            turns: host.state.turn,
            yourBestTurn: bestTurn.current,
          });
        }
      } else {
        saveMatch({ state: host.state, botSeat, botPreset, bestTurn: bestTurn.current });
      }
    });
  }, [host, botSeat, botPreset, youSeat]);

  // Counts the farkle hold down and releases it when it expires.
  useEffect(() => {
    if (farkleHold === null) {
      return;
    }
    const pause = farklePauseMs(farkleHold.player === botSeat);
    setSecondsLeft(Math.round(pause / 1000));
    const tick = setInterval(() => setSecondsLeft((left) => Math.max(0, left - 1)), 1000);
    const release = setTimeout(() => setFarkleHold(null), pause);
    return () => {
      clearInterval(tick);
      clearTimeout(release);
    };
  }, [farkleHold, botSeat]);

  // Drives the bot's seat one action at a time, paced so it's watchable.
  // Re-runs whenever `events` changes, i.e. whenever the game state might
  // have — reading `host.state` directly rather than depending on it, since
  // it isn't React state itself. `farkleHold` is a dependency because the bot
  // must not play on while the player is still reading a farkle.
  useEffect(() => {
    if (bot === null || botSeat === null || farkleHold !== null) {
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
  }, [events, bot, botSeat, host, farkleHold]);

  const view = host.view(host.state.current);
  const matchOver = view.phase === 'MatchOver';
  const isBotTurn = botSeat !== null && view.current === botSeat;
  const canAct = !isBotTurn && !matchOver && farkleHold === null && !busy;
  const currentPlayer = view.players[view.current]!;
  const matchedOption = matchingKeepOption(selection, view);

  /**
   * Both footer buttons throw the current match away, so both ask first — but
   * only when there is something to throw away. A finished match is already
   * recorded and a match nobody has thrown in yet costs nothing, and a dialog
   * guarding neither is pure friction.
   */
  function ask(action: 'quit' | 'restart'): void {
    if (matchOver || events.length === 0) {
      (action === 'quit' ? onExit : onRestart)();
      return;
    }
    setPendingExit(action);
  }

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
    setSelection(option.indices);
  }

  /**
   * Commits the selection and immediately follows it with the player's real
   * decision. The engine still passes through `AwaitingBankOrThrow` in
   * between; chaining the two here just spares the player a screen whose only
   * content was a choice they had already made.
   */
  async function keepThen(next: 'Bank' | 'Throw'): Promise<void> {
    if (matchedOption === null || selection.length === 0) {
      return;
    }
    setBusy(true);
    // Snapshot which dice are being kept before dispatching — `view` (and so
    // `view.inPlayDice`) is stale the instant the engine state moves on.
    const keptSpecs = selection.map((index) => view.inPlayDice[index]!);
    try {
      await dispatch({ type: 'Keep', indices: selection });
      setKeptDiceThisTurn((prev) => [...prev, ...keptSpecs]);
      if (next === 'Throw') {
        // Otherwise the kept dice's flight into the rail and the next throw's
        // tumble-in start on the very same tick and animate on top of each
        // other — see THROW_AFTER_KEEP_MS in pacing.ts.
        await sleep(THROW_AFTER_KEEP_MS);
      }
      await dispatch({ type: next });
    } finally {
      setBusy(false);
    }
  }

  const boardFaces = farkleHold !== null ? farkleHold.faces : view.thrown;
  const boardDice = farkleHold !== null ? undefined : view.inPlayDice;
  const boardKept = farkleHold !== null ? [] : view.keptThisTurn;
  const boardKeptDice = farkleHold !== null ? undefined : keptDiceThisTurn;
  const selectable = canAct && view.phase === 'AwaitingKeep' && farkleHold === null;

  // Dice back in play after this keep — a keep that clears the board earns all
  // six back (hot dice) rather than leaving the player with nothing to throw.
  const diceAfterKeep =
    matchedOption === null ? 0 : matchedOption.diceLeft === 0 ? 6 : matchedOption.diceLeft;
  const bankAfterKeep = matchedOption === null ? view.turnScore : view.turnScore + matchedOption.points;

  const boardHint = (() => {
    if (farkleHold !== null) {
      return '';
    }
    if (matchOver) {
      return 'Match over';
    }
    if (view.phase === 'AwaitingThrow') {
      return isBotTurn ? `${currentPlayer.name} is about to throw` : 'Throw to start your turn';
    }
    return 'Dice set aside — throw again or bank';
  })();

  return (
    <div className="match">
      <Scoreboard view={view} botSeat={botSeat} />

      <div className="match__table">
        <Board
          thrown={boardFaces}
          thrownDice={boardDice}
          selection={selection}
          keptIndices={keptIndices}
          keptThisTurn={boardKept}
          keptDiceThisTurn={boardKeptDice}
          spinToken={spinToken}
          selectable={selectable}
          farkled={farkleHold !== null}
          hint={boardHint}
          onToggle={toggleDie}
        />

        <div className="turn-status">
          <span>
            Turn score <strong>{view.turnScore}</strong>
          </span>
          <span>
            {view.diceInPlay} {view.diceInPlay === 1 ? 'die' : 'dice'} in play
          </span>
        </div>

        {farkleHold !== null ? (
          <FarkleNotice
            playerName={view.players[farkleHold.player]?.name ?? 'Player'}
            lost={farkleHold.lost}
            secondsLeft={secondsLeft}
            onContinue={() => setFarkleHold(null)}
          />
        ) : isBotTurn && !matchOver ? (
          <p className="thinking">{currentPlayer.name} is thinking…</p>
        ) : matchOver ? null : (
          <>
            {/*
              Rendered for the whole AwaitingKeep phase, not just while there's
              a selection to describe — it used to mount only once the player
              picked a die, which reserved no space beforehand and shoved the
              buttons and scoring combinations down the instant it appeared.
              Keeping the element (with reserved height from `.selection-status`)
              and only swapping its text keeps everything below it still. The
              standing "click dice to set them aside" instruction that used to
              sit here permanently was itself removed as furniture explaining a
              board that already explains itself.
            */}
            {view.phase === 'AwaitingKeep' && (
              <p
                className={
                  selection.length === 0
                    ? 'selection-status'
                    : matchedOption !== null
                      ? 'selection-status selection-status--ok'
                      : 'selection-status selection-status--bad'
                }
              >
                {selection.length === 0
                  ? ''
                  : matchedOption !== null
                    ? `${matchedOption.points} points set aside`
                    : "Those dice don't score together — a 1, a 5, three of a kind, or a straight."}
              </p>
            )}

            <div className="match__actions">
              {view.phase === 'AwaitingThrow' && (
                <button
                  type="button"
                  className="action action--primary"
                  disabled={!canAct}
                  onClick={() => void dispatch({ type: 'Throw' })}
                >
                  Throw {view.diceInPlay} dice
                </button>
              )}

              {view.phase === 'AwaitingKeep' && (
                <>
                  <button
                    type="button"
                    className="action action--primary"
                    disabled={!canAct || matchedOption === null}
                    onClick={() => void keepThen('Throw')}
                  >
                    Keep &amp; throw {diceAfterKeep}
                    {matchedOption?.diceLeft === 0 && <span className="action__note">hot dice</span>}
                  </button>
                  <button
                    type="button"
                    className="action"
                    disabled={!canAct || matchedOption === null}
                    onClick={() => void keepThen('Bank')}
                  >
                    Keep &amp; bank {bankAfterKeep}
                  </button>
                </>
              )}

              {/* Only reachable if a keep-and-act chain is interrupted. */}
              {view.phase === 'AwaitingBankOrThrow' && (
                <>
                  <button
                    type="button"
                    className="action action--primary"
                    disabled={!canAct}
                    onClick={() => void dispatch({ type: 'Throw' })}
                  >
                    Throw {view.diceInPlay}
                  </button>
                  <button
                    type="button"
                    className="action"
                    disabled={!canAct}
                    onClick={() => void dispatch({ type: 'Bank' })}
                  >
                    Bank {view.turnScore}
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
          </>
        )}
      </div>

      <TurnLog
        events={events}
        names={view.players.map((player) => player.name)}
        autoScroll={!matchOver}
      />

      {matchOver && overlayDismissed && (
        <div className="match__result-bar">
          <span>
            {view.winner !== null ? `${view.players[view.winner]!.name} won this match.` : 'Match over.'}
          </span>
          <button type="button" className="action action--primary" onClick={onExit}>
            New match
          </button>
        </div>
      )}

      <div className="match__footer">
        <button type="button" className="match__exit" onClick={() => ask('restart')}>
          Start again
        </button>
        <button type="button" className="match__exit" onClick={() => ask('quit')}>
          Quit to menu
        </button>
      </div>

      {pendingExit !== null && (
        <ConfirmDialog
          title={pendingExit === 'quit' ? 'Quit to menu?' : 'Start again?'}
          message={
            pendingExit === 'quit'
              ? 'This match will be discarded — it won’t be saved, and it won’t count towards your record.'
              : 'This match will be discarded and a new one dealt with the same players, dice and target.'
          }
          confirmLabel={pendingExit === 'quit' ? 'Quit to menu' : 'Start again'}
          onConfirm={pendingExit === 'quit' ? onExit : onRestart}
          onCancel={() => setPendingExit(null)}
        />
      )}

      {matchOver && view.winner !== null && !overlayDismissed && (
        <MatchOverOverlay
          winnerName={view.players[view.winner]!.name}
          winnerTotal={view.players[view.winner]!.total}
          // Pass & play has no bot seat and so no "you": both sides are at this
          // device, and whoever just won deserves the confetti.
          celebrate={botSeat === null || view.winner === youSeat}
          onNewMatch={onExit}
          onReviewLog={() => setOverlayDismissed(true)}
        />
      )}
    </div>
  );
}
