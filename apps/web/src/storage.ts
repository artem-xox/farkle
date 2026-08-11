import { isPresetName, type PresetName } from '@farkle/bots';
import { DICE, DICE_PER_TURN, type GameState } from '@farkle/engine';

const STORAGE_KEY = 'farkle:match:v1';
const PREFS_KEY = 'farkle:setup:v1';
const HISTORY_KEY = 'farkle:history:v1';

/**
 * How many finished matches are kept. The cap is the point: `localStorage` has
 * a quota, the summary only ever reads aggregates, and nobody is scrolling to
 * match 200. Oldest are dropped first.
 */
const HISTORY_LIMIT = 50;

/** Matches the `maxLength` the name inputs enforce, so a hand-edited save can't smuggle in a longer one. */
export const NAME_MAX_LENGTH = 20;

export interface StoredMatch {
  readonly state: GameState;
  /** Player id the bot controls, or null for a hot-seat human-vs-human match. */
  readonly botSeat: number | null;
  readonly botPreset: PresetName | null;
  /**
   * The player's best single banked turn so far. Persisted rather than derived
   * because it is accumulated from the event stream, and events are not saved
   * — without this, resuming a match after a reload would silently restart the
   * count and under-report the personal best it feeds.
   */
  readonly bestTurn: number;
}

/**
 * `GameState` is plain, JSON-safe data by construction (DESIGN.md §1 — no
 * functions, no class instances, `rng` is just a number), so this is a plain
 * round trip. `localStorage` can still throw (private browsing, quota, a
 * disabled API) — losing persistence isn't worth failing the game over, so
 * every operation here swallows its own errors.
 */
export function saveMatch(match: StoredMatch): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(match));
  } catch {
    // Persistence is a nicety, not a requirement for the current session to work.
  }
}

/**
 * Returns whatever was stored, unvalidated beyond being parseable JSON. The
 * caller (App.tsx) is responsible for confirming the shape still makes sense
 * — e.g. by handing `state` to `LocalHost` and catching what that throws —
 * since that's already the one place that has to handle a corrupt or
 * schema-mismatched save.
 */
export function loadMatch(): StoredMatch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as StoredMatch);
  } catch {
    return null;
  }
}

export function clearMatch(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** What the setup screen remembers between matches, so a regular is not re-answering the same four questions every time. */
export interface SetupPrefs {
  readonly yourName: string;
  readonly friendName: string;
  readonly mode: 'bot' | 'friend';
  readonly preset: PresetName;
  readonly target: number;
  /** A `LOADOUT_PRESETS` id or `CUSTOM_PRESET_ID`. Validated only as a string here — the setup screen resolves it and falls back on its own if the id no longer exists, which is what happens when a preset is renamed or dropped. */
  readonly loadoutPreset: string;
  readonly botMirrors: boolean;
  /**
   * The six dice the player built in the picker, as die ids — kept so a custom
   * loadout survives the match that used it. Stored as ids rather than whole
   * `DieSpec`s so that a change to a die's weights reaches a saved loadout
   * instead of resurrecting the old numbers from `localStorage`.
   */
  readonly customLoadout: readonly string[];
}

export function saveSetupPrefs(prefs: SetupPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Same trade as saveMatch: remembering preferences is a nicety.
  }
}

/**
 * Validated field by field, unlike `loadMatch` — nothing downstream would
 * catch a bad value here. An unknown `preset` reaches `createPreset`, and a
 * junk `target` makes a match that cannot be won, so anything that doesn't
 * check out is dropped and the caller's own default stands. `allowedTargets`
 * is passed in because the offered targets are the setup screen's business,
 * not storage's.
 */
export function loadSetupPrefs(allowedTargets: readonly number[]): Partial<SetupPrefs> {
  let raw: unknown;
  try {
    const text = localStorage.getItem(PREFS_KEY);
    if (text === null) {
      return {};
    }
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }

  const stored = raw as Record<string, unknown>;
  const prefs: Partial<Record<keyof SetupPrefs, unknown>> = {};

  if (typeof stored['yourName'] === 'string') {
    prefs.yourName = stored['yourName'].slice(0, NAME_MAX_LENGTH);
  }
  if (typeof stored['friendName'] === 'string') {
    prefs.friendName = stored['friendName'].slice(0, NAME_MAX_LENGTH);
  }
  if (stored['mode'] === 'bot' || stored['mode'] === 'friend') {
    prefs.mode = stored['mode'];
  }
  if (typeof stored['preset'] === 'string' && isPresetName(stored['preset'])) {
    prefs.preset = stored['preset'];
  }
  if (typeof stored['target'] === 'number' && allowedTargets.includes(stored['target'])) {
    prefs.target = stored['target'];
  }
  if (typeof stored['loadoutPreset'] === 'string') {
    prefs.loadoutPreset = stored['loadoutPreset'];
  }
  if (typeof stored['botMirrors'] === 'boolean') {
    prefs.botMirrors = stored['botMirrors'];
  }
  // All or nothing: a loadout of the wrong length, or naming a die that no
  // longer exists, is dropped rather than patched into something the player
  // never chose.
  const loadout: unknown = stored['customLoadout'];
  if (
    Array.isArray(loadout) &&
    loadout.length === DICE_PER_TURN &&
    loadout.every((id) => typeof id === 'string' && DICE[id] !== undefined)
  ) {
    prefs.customLoadout = loadout as string[];
  }

  return prefs as Partial<SetupPrefs>;
}

/**
 * One finished match. Only matches that actually reached `MatchOver` are
 * recorded — quitting discards the match (see `App.tsx`'s `exitMatch`), and a
 * walked-away-from game is not a result either way.
 */
export interface MatchRecord {
  readonly at: number;
  readonly target: number;
  /** The bot's personality, or null for a pass & play match — which is why the summary can separate "against bots" from the rest. */
  readonly opponent: PresetName | null;
  readonly youWon: boolean;
  readonly yourTotal: number;
  readonly opponentTotal: number;
  readonly turns: number;
  readonly yourBestTurn: number;
}

function isMatchRecord(value: unknown): value is MatchRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const numbers = ['at', 'target', 'yourTotal', 'opponentTotal', 'turns', 'yourBestTurn'];
  return (
    numbers.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key])) &&
    typeof record['youWon'] === 'boolean' &&
    (record['opponent'] === null ||
      (typeof record['opponent'] === 'string' && isPresetName(record['opponent'])))
  );
}

export function loadHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    // Individually validated and filtered rather than rejected wholesale: one
    // malformed row from an older schema should cost that row, not the
    // player's whole record.
    return Array.isArray(parsed) ? parsed.filter(isMatchRecord) : [];
  } catch {
    return [];
  }
}

/** Appends a finished match, keeping the newest `HISTORY_LIMIT`. */
export function recordMatch(record: MatchRecord): void {
  try {
    const next = [...loadHistory(), record].slice(-HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Same trade as everything else here — losing the record must not cost the match.
  }
}
