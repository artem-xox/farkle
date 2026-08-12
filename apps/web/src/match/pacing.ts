import type { Phase } from '@farkle/engine';

/**
 * How long a bot "thinks" before acting, keyed by what it's about to decide.
 * Purely cosmetic — without this, a bot's whole turn would resolve in the
 * same tick and be unwatchable (docs/PLAN.md M3: "paced so its turn is
 * watchable").
 */
const BOT_THINK_MS: Record<Phase, number> = {
  AwaitingThrow: 650,
  AwaitingKeep: 900,
  AwaitingBankOrThrow: 700,
  MatchOver: 0,
};

export function botThinkTime(phase: Phase): number {
  return BOT_THINK_MS[phase];
}

/** How long the dice tumble animation runs — dice stay unclickable until it settles. */
export const TUMBLE_MS = 550;

/**
 * How long a kept die takes to travel from the board into the set-aside rail,
 * and how far apart a run of them is staggered.
 *
 * Deliberately shorter than `TUMBLE_MS`: the dice fly out while the next
 * throw is already tumbling in behind them, and a flight that outlasted the
 * tumble would still be crossing the board once the new dice had settled.
 */
export const FLY_MS = 380;
export const FLY_STAGGER_MS = 55;

/**
 * How long "Keep & throw" waits after dispatching the keep before dispatching
 * the throw that follows it. The two used to fire back to back — same tick,
 * no gap — which meant the kept dice's flight into the rail and the next
 * throw's tumble-in animated on top of each other instead of in sequence.
 * Only `keepThen` in MatchScreen.tsx needs this: the bot already paces Keep
 * and Throw as two separate phases via `botThinkTime`, well past this on its
 * own, and a bare "Throw 6 dice" at the start of a turn has no prior flight
 * to wait out.
 */
export const THROW_AFTER_KEEP_MS = 500;

/**
 * How long a farkle stays on screen before play moves on by itself.
 *
 * The engine resolves a farkle inside a single `reduce()` — the throw, the
 * farkle and the turn handover all arrive in one event batch — so without a
 * deliberate pause the losing dice would be replaced in the same frame they
 * appeared, and a player would never see what went wrong. The pause is a
 * presentation-layer hold over already-settled state, not an engine phase;
 * "Continue" just ends the hold early.
 *
 * The two lengths are not the same event. Your own farkle is a loss to read —
 * which dice came up, how much went with them. The bot's is news about someone
 * else, and holding it as long only reads as the game having stalled.
 */
export const FARKLE_PAUSE_PLAYER_MS = 5_000;
export const FARKLE_PAUSE_BOT_MS = 3_000;

/** `farkledSeatIsBot` is false for both seats of a pass & play match — two humans both get the longer read. */
export function farklePauseMs(farkledSeatIsBot: boolean): number {
  return farkledSeatIsBot ? FARKLE_PAUSE_BOT_MS : FARKLE_PAUSE_PLAYER_MS;
}
