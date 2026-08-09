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
