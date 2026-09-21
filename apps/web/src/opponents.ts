import { createPreset, isPresetName, PRESET_NAMES, type AsyncBotPolicy, type PresetName } from '@farkle/bots';
import { JevBot } from '@farkle/jev';

/**
 * Who the player can be matched against. The six tuned personalities
 * (DESIGN.md §6), plus Jev — which is a different kind of thing entirely: a
 * policy that asks a model for its move rather than computing one.
 *
 * Kept in the web app rather than in `@farkle/bots` because it is a menu, not
 * a library concept: the CLI has its own list with its own membership (see
 * `apps/cli/src/opponent.ts`), and Jev's is conditional here in a way it is
 * not there.
 */
export type OpponentId = PresetName | 'jev';

/**
 * Whether Jev can be played at all. False in every built bundle: it needs the
 * dev server's proxy to hold the API key, because a static site has nowhere
 * to keep one — see the comment on `jevProxy` in vite.config.ts.
 */
export const JEV_AVAILABLE = __JEV_ENABLED__;

export const OPPONENT_IDS: readonly OpponentId[] = JEV_AVAILABLE
  ? [...PRESET_NAMES, 'jev']
  : PRESET_NAMES;

export function isOpponentId(id: string): id is OpponentId {
  return id === 'jev' ? JEV_AVAILABLE : isPresetName(id);
}

/**
 * Whether a stored value still names a playable opponent. Separate from
 * `isOpponentId` on purpose: a match record saying "you lost to Jev" stays
 * valid and displayable after the dev proxy goes away, whereas *starting* a
 * new match against it does not.
 */
export function isRecordedOpponent(id: string): id is OpponentId {
  return id === 'jev' || isPresetName(id);
}

/**
 * The bot for a chosen opponent. Async for every id — a preset simply never
 * awaits.
 *
 * The `JEV_AVAILABLE` test comes first so that a production build, where it
 * folds to a literal `false`, drops this branch and the whole `@farkle/jev`
 * import with it. Shipping the client for an opponent that cannot be selected
 * would be dead weight in every visitor's bundle.
 */
export function createOpponentPolicy(id: OpponentId, seed: number): AsyncBotPolicy {
  if (!JEV_AVAILABLE || id !== 'jev') {
    // `id` is only ever 'jev' when Jev is available: `OPPONENT_IDS` does not
    // offer it otherwise and `isOpponentId` rejects a stored one.
    return createPreset(id as PresetName, seed);
  }
  return new JevBot({
    // No key: the dev proxy attaches it on the way out, so nothing secret is
    // ever in this bundle. Same-origin, so the page's CSP needs no exception.
    baseUrl: `${window.location.origin}/jev`,
    seed,
    onFallback: (reason, detail) => {
      // Visible in the console rather than on the board: it is diagnostic,
      // and a toast mid-turn would interrupt a game to report something the
      // player cannot act on. The CLI, whose audience is developing this,
      // prints it inline.
      console.info(`[jev] fell back to smart play — ${reason}: ${detail}`);
    },
  });
}
