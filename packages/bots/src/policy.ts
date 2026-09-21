import type { ClientView, GameEvent, KeepOption } from '@farkle/engine';

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

/**
 * The same contract as `BotPolicy`, loosened so a decision may be awaited.
 * Every `BotPolicy` is already structurally an `AsyncBotPolicy` — `KeepOption`
 * is assignable to `KeepOption | Promise<KeepOption>` — so this is a
 * supertype, not a parallel hierarchy: nothing that exists has to change to
 * be driven through it.
 *
 * It exists for one kind of policy: one whose decision is I/O. `@farkle/jev`
 * asks a model over the network, which no synchronous signature can express.
 * The synchronous `BotPolicy` stays the default, because everything that runs
 * a policy many thousands of times (`runSimulation`) depends on it being
 * cheap and blocking.
 */
export interface AsyncBotPolicy {
  readonly name: string;
  chooseKeep(
    view: ClientView,
    options: readonly KeepOption[],
  ): KeepOption | Promise<KeepOption>;
  decideAfterKeep(view: ClientView): 'Throw' | 'Bank' | Promise<'Throw' | 'Bank'>;
  /**
   * Everything that has happened in the match, handed over as it happens.
   * `ClientView` is a snapshot and carries no log, so a policy that wants the
   * history of the match — how the opponent has been playing, what this seat
   * has already lost — has nowhere else to get it.
   *
   * This is not a hole in the "bots see only what a human sees" rule of
   * DESIGN.md §3: a `GameEvent` log is exactly what both clients already
   * render for their human (the web's `TurnLog`, the CLI's event printer),
   * and it reveals nothing `ClientView` does not.
   */
  observe?(events: readonly GameEvent[]): void;
}
