import type { PresetName } from '@farkle/bots';
import type { GameState } from '@farkle/engine';

const STORAGE_KEY = 'farkle:match:v1';

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
