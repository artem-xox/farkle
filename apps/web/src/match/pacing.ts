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
 * How long a farkle stays on screen before play moves on by itself.
 *
 * The engine resolves a farkle inside a single `reduce()` — the throw, the
 * farkle and the turn handover all arrive in one event batch — so without a
 * deliberate pause the losing dice would be replaced in the same frame they
 * appeared, and a player would never see what went wrong. The pause is a
 * presentation-layer hold over already-settled state, not an engine phase;
 * "Continue" just ends the hold early.
 */
export const FARKLE_PAUSE_MS = 10_000;
