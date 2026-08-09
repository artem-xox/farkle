import type { ClientView, KeepOption } from '@farkle/engine';

/**
 * A bot's decisions, read from exactly the information a human player would
 * see (`ClientView`). A policy is never given `GameState` directly — see
 * docs/DESIGN.md §6. That keeps a bot honest today and, if opponent loadouts
 * are ever hidden from a human, keeps a bot from cheating by construction
 * rather than by convention.
 */
export interface BotPolicy {
  readonly name: string;

  /**
   * Which legal keep to take from the current throw. `options` is always
   * `view.keeps` — every legal keep, best-scoring first — passed separately so
   * a policy doesn't have to recompute it.
   */
  chooseKeep(view: ClientView, options: readonly KeepOption[]): KeepOption;

  /**
   * Press on or lock in the turn score. Only called while at least one die
   * remains in play, i.e. throwing is still a legal option.
   */
  decideAfterKeep(view: ClientView): 'Throw' | 'Bank';
}
