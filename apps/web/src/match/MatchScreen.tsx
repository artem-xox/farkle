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
import { botThinkTime, farklePauseMs, KEEP_SETTLE_MS } from './pacing';
import { Scoreboard } from './Scoreboard';
import { matchingKeepOption, sameIndices } from './selection';
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
  /** The turn's own kept dice, snapshotted at the moment of the bust — see the refs below. */
  readonly keptFaces: readonly Face[];
  readonly keptDice: readonly DieSpec[];
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
   * Refs mirroring `keptDiceThisTurn` (plus the faces the engine doesn't hand
   * back to us once a turn ends). The `host.subscribe` callback below is a
   * stable closure — recreated only when `host`/`botSeat`/`botPreset`/`youSeat`
   * change, not on every render — so any `keptDiceThisTurn` it read directly
   * would be frozen at mount time. These refs are mutated in place at the same
   * two call sites the state is, so the Farkled branch of that callback can
   * read this turn's actual kept dice synchronously, before the `TurnStarted`
   * event later in the same batch resets them for the next turn.
   */
  const keptDiceRef = useRef<readonly DieSpec[]>([]);
  const keptFacesRef = useRef<readonly Face[]>([]);

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

      // A farkle arrives in the same batch as the throw that caused it and the
      // handover to the next player, so by the time we see it the board has
      // already moved on. Capture the dice that busted, and hold them on
      // screen until the player acknowledges — see pacing.ts.
      //
      // The engine always orders a bust as Thrown, Farkled, TurnEnded,
      // TurnStarted (see applyThrow/endTurn in match.ts) — so processing
      // events in order, rather than a `TurnStarted` reset hoisted ahead of
      // this loop, means the Farkled branch below always reads the refs
      // before TurnStarted's branch clears them for the next turn.
      let lastThrow: readonly Face[] = [];
      for (const event of newEvents) {
        if (event.type === 'Thrown') {
          lastThrow = event.faces;
        } else if (event.type === 'Kept') {
          setKeptIndices(event.indices);
          // `event.dice` covers both the player's own keeps and the bot's —
          // unlike the old approach of snapshotting `view.inPlayDice` inside
          // `keepThen`, which only ever ran for the player's own clicks and
          // left the bot's kept dice in the rail with no identity colour.
          if (event.dice !== undefined) {
            keptDiceRef.current = [...keptDiceRef.current, ...event.dice];
            setKeptDiceThisTurn(keptDiceRef.current);
          }
          keptFacesRef.current = [...keptFacesRef.current, ...event.faces];
        } else if (event.type === 'Farkled') {
          setFarkleHold({
            player: event.player,
            faces: lastThrow,
            lost: event.lost,
            keptFaces: keptFacesRef.current,
            keptDice: keptDiceRef.current,
          });
        } else if (event.type === 'Banked' && event.player === youSeat) {
          bestTurn.current = Math.max(bestTurn.current, event.points);
        } else if (event.type === 'TurnStarted') {
          keptDiceRef.current = [];
          keptFacesRef.current = [];
          setKeptDiceThisTurn([]);
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

  /**
   * Picking the option that's already selected clears the selection instead
   * of re-applying it — otherwise the only way to undo a combo tap was to
   * click every one of its dice individually.
   */
  function pickOption(option: KeepOption): void {
    setSelection((prev) => (sameIndices(prev, option.indices) ? [] : option.indices));
  }

  /**
   * Commits the selection and immediately follows it with the player's real
   * decision. The engine still passes through `AwaitingBankOrThrow` in
   * between; chaining the two here just spares the player a screen whose only
   * content was a choice they had already made. Always pauses between the two
   * dispatches — see `KEEP_SETTLE_MS` in pacing.ts — so the kept dice's flight
   * into the rail finishes before whatever comes next (a new tumble-in, or the
   * turn handing off to the bot) starts on top of it.
   */
  async function keepThen(next: 'Bank' | 'Throw'): Promise<void> {
    if (matchedOption === null || selection.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await dispatch({ type: 'Keep', indices: selection });
      await sleep(KEEP_SETTLE_MS);
      await dispatch({ type: next });
    } finally {
      setBusy(false);
    }
  }

  /**
   * The Bank button's handler, reachable from two different engine phases —
   * `AwaitingKeep` when the player still has a selection on the board to
   * commit first, and `AwaitingBankOrThrow` when the dice are already in the
   * rail and there's nothing left to do but pause and bank.
   */
  async function bank(): Promise<void> {
    if (view.phase === 'AwaitingKeep') {
      await keepThen('Bank');
      return;
    }
    setBusy(true);
    try {
      await sleep(KEEP_SETTLE_MS);
      await dispatch({ type: 'Bank' });
    } finally {
      setBusy(false);
    }
  }

  const boardFaces = farkleHold !== null ? farkleHold.faces : view.thrown;
  const boardDice = farkleHold !== null ? undefined : view.inPlayDice;
  const boardKept = farkleHold !== null ? farkleHold.keptFaces : view.keptThisTurn;
  const boardKeptDice = farkleHold !== null ? farkleHold.keptDice : keptDiceThisTurn;
  const selectable = canAct && view.phase === 'AwaitingKeep' && farkleHold === null;

  const bankAfterKeep = matchedOption === null ? view.turnScore : view.turnScore + matchedOption.points;
  const bankAmount = matchedOption !== null ? bankAfterKeep : view.turnScore;

  /**
   * The three action buttons are permanent fixtures of the layout — see
   * `.match__actions` in actions.css — rather than swapped in and out per
   * phase, so which of the three is actually clickable right now is just
   * this: one gate per button, everything else about their position and
   * presence stays constant. `canAct` alone already covers the bot's turn,
   * a farkle hold and a finished match, so none of those need a separate
   * check here.
   */
  const canThrow = canAct && (view.phase === 'AwaitingThrow' || view.phase === 'AwaitingBankOrThrow');
  const canKeep = canAct && view.phase === 'AwaitingKeep' && matchedOption !== null;
  const canBank =
    canAct && (view.phase === 'AwaitingBankOrThrow' || (view.phase === 'AwaitingKeep' && matchedOption !== null));

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

        {/*
          A fixed-height slot holding exactly one of three things: the three
          action buttons (the player's own turn), the farkle notice, or the
          "thinking" indicator — never more than one at a time, and never
          stacked with the buttons. `.match__actions-slot` in actions.css
          reserves the tallest of the three (the farkle notice) as a
          `min-height`, or everything below it — the scoring-combinations
          panel included — would still shift up and down as this slot's
          actual content changed height between the three. The buttons
          themselves are still a permanent fixture *within* their own turn —
          always rendered, just enabled or disabled per
          `canThrow`/`canKeep`/`canBank` — rather than a different set of
          elements per phase.
        */}
        <div className="match__actions-slot">
          {farkleHold !== null ? (
            <FarkleNotice
              playerName={view.players[farkleHold.player]?.name ?? 'Player'}
              lost={farkleHold.lost}
              secondsLeft={secondsLeft}
              onContinue={() => setFarkleHold(null)}
            />
          ) : isBotTurn && !matchOver ? (
            <p className="thinking">{currentPlayer.name} is thinking…</p>
          ) : (
            <div className="match__actions">
              <button
                type="button"
                className="action action--primary action--throw"
                disabled={!canThrow}
                onClick={() => void dispatch({ type: 'Throw' })}
              >
                Throw
              </button>
              <div className="match__actions-row">
                <button
                  type="button"
                  className="action action--primary"
                  disabled={!canKeep}
                  onClick={() => void keepThen('Throw')}
                >
                  Keep{matchedOption !== null ? ` ${matchedOption.points}` : ''}
                  {matchedOption?.diceLeft === 0 && <span className="action__note">hot dice</span>}
                </button>
                <button type="button" className="action" disabled={!canBank} onClick={() => void bank()}>
                  Bank {bankAmount}
                </button>
              </div>
            </div>
          )}
        </div>

        <KeepOptions
          options={view.phase === 'AwaitingKeep' ? view.keeps : []}
          thrown={view.thrown}
          selection={selection}
          disabled={!selectable}
          onPick={pickOption}
        />
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
