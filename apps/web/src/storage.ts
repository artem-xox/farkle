import { isPresetName, type PresetName } from '@farkle/bots';
import type { GameState } from '@farkle/engine';

const STORAGE_KEY = 'farkle:match:v1';
const PREFS_KEY = 'farkle:setup:v1';

/** Matches the `maxLength` the name inputs enforce, so a hand-edited save can't smuggle in a longer one. */
export const NAME_MAX_LENGTH = 20;

export interface StoredMatch {
  readonly state: GameState;
  /** Player id the bot controls, or null for a hot-seat human-vs-human match. */
  readonly botSeat: number | null;
  readonly botPreset: PresetName | null;
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

  return prefs as Partial<SetupPrefs>;
}
