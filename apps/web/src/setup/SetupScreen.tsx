import { useEffect, useState, type FormEvent } from 'react';

import { PRESET_NAMES, type PresetName } from '@farkle/bots';
import { BALANCED_DIE, DICE, DICE_PER_TURN, type DieSpec, type PlayerConfig } from '@farkle/engine';

import { capitalize } from '../presets';
import { loadHistory, loadSetupPrefs, NAME_MAX_LENGTH, saveSetupPrefs } from '../storage';
import { summarizeHistory } from './record';
import { HeroDice } from './HeroDice';
import { LoadoutChoice } from './LoadoutChoice';
import {
  CUSTOM_PRESET_ID,
  DEFAULT_PRESET_ID,
  presetById,
  presetLoadout,
} from './loadoutPresets';
import { LoadoutStep } from './LoadoutStep';

export interface NewMatchOptions {
  readonly players: readonly [PlayerConfig, PlayerConfig];
  readonly target: number;
  readonly seed: number;
  readonly botSeat: number | null;
  readonly botPreset: PresetName | null;
}

export interface SetupScreenProps {
  onStart: (options: NewMatchOptions) => void;
  /** Opens the Rules tab — the setup screen has to be able to answer "what is Farkle?" for anyone arriving from a shared link. */
  onShowRules: () => void;
}

/**
 * 8000 is deliberate rather than round: it is exactly what six 1s score, so
 * the longest match is still winnable by a single miraculous throw.
 *
 * `turnsEach` answers the only question a player actually has about these
 * numbers — how long is this going to take — and is measured rather than
 * guessed, from `farkle sim --a balanced --b balanced -n 20000 --seed 42
 * --target <n>`, whose "turns per match" per side reads 2.7 / 5.3 / 14.6.
 * Rounded, because it is a signpost and the spread across personalities is
 * wider than the rounding error.
 */
const TARGET_CHOICES = [
  { value: 1500, turnsEach: 3 },
  { value: 3000, turnsEach: 5 },
  { value: 8000, turnsEach: 15 },
] as const;
const TARGET_VALUES: readonly number[] = TARGET_CHOICES.map((choice) => choice.value);
const DEFAULT_TARGET_CHOICE = 3000;

const randomSeed = (): number => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
const defaultLoadout = (): DieSpec[] => new Array(DICE_PER_TURN).fill(BALANCED_DIE);
const isOrdinary = (loadout: readonly DieSpec[]): boolean =>
  loadout.every((die) => die.id === BALANCED_DIE.id);

type Step = 'basics' | 'loadout';

export function SetupScreen({ onStart, onShowRules }: SetupScreenProps) {
  // One read, at mount: the screen remounts after every match, and re-reading
  // then is the point — it is how the last match's answers come back.
  const [prefs] = useState(() => loadSetupPrefs(TARGET_VALUES));
  // Read on mount for the same reason: this screen remounts when a match ends,
  // which is exactly when the record has just changed.
  const [history] = useState(() => loadHistory());

  const [step, setStep] = useState<Step>('basics');
  const [mode, setMode] = useState<'bot' | 'friend'>(prefs.mode ?? 'bot');
  // Empty rather than 'You', so the default arrives as a placeholder and
  // nobody has to clear someone else's name before typing their own. Both
  // fields fall back to the placeholder text on submit.
  const [yourName, setYourName] = useState(prefs.yourName ?? '');
  const [friendName, setFriendName] = useState(prefs.friendName ?? '');
  const [preset, setPreset] = useState<PresetName>(prefs.preset ?? 'balanced');
  const [target, setTarget] = useState(prefs.target ?? DEFAULT_TARGET_CHOICE);
  // A stored id is only trusted as far as it still resolves: a preset that gets
  // renamed or dropped must not leave the row with nothing selected and the
  // player silently on ordinary dice.
  const [loadoutPreset, setLoadoutPreset] = useState(() => {
    const stored = prefs.loadoutPreset;
    if (stored === CUSTOM_PRESET_ID || (stored !== undefined && presetById(stored) !== undefined)) {
      return stored;
    }
    return DEFAULT_PRESET_ID;
  });
  // Default on, so building a loadout is a choice about how the match feels
  // rather than a difficulty dial handed out by accident: six of any Gold-tier
  // die beat six ordinary ones around 61% of the time (DESIGN.md §5), and a
  // player who wants that edge should be turning it on deliberately.
  const [botMirrors, setBotMirrors] = useState(prefs.botMirrors ?? true);
  // Seeded from the saved custom loadout, so a build survives the match that
  // used it. `loadSetupPrefs` has already checked every id resolves.
  const [yourLoadout, setYourLoadout] = useState<DieSpec[]>(() =>
    prefs.customLoadout === undefined
      ? defaultLoadout()
      : prefs.customLoadout.map((id) => DICE[id] ?? BALANCED_DIE),
  );
  const [opponentLoadout, setOpponentLoadout] = useState<DieSpec[]>(defaultLoadout());

  // Saved on change rather than on start: a player who types their name and
  // then reloads without starting should not have to type it again either.
  useEffect(() => {
    saveSetupPrefs({
      yourName,
      friendName,
      mode,
      preset,
      target,
      loadoutPreset,
      botMirrors,
      customLoadout: yourLoadout.map((die) => die.id),
    });
  }, [yourName, friendName, mode, preset, target, loadoutPreset, botMirrors, yourLoadout]);

  /**
   * The single source of truth for what actually goes to the table. A named
   * preset fills all six slots with its die; "Custom" is the only case that
   * reads the picker's own state.
   */
  const chosenPreset = loadoutPreset === CUSTOM_PRESET_ID ? undefined : presetById(loadoutPreset);
  const yoursEffective = chosenPreset === undefined ? yourLoadout : presetLoadout(chosenPreset);
  const botLoadout = botMirrors ? yoursEffective : defaultLoadout();
  const opponentEffective = mode === 'friend' ? opponentLoadout : botLoadout;

  /** Nothing to mirror when both sides would play ordinary dice anyway, so the toggle stays off screen. */
  const mirrorMatters = mode === 'bot' && !isOrdinary(yoursEffective);

  const friend = friendName.trim() || 'Friend';

  /** Follows the personality dropdown, which is most of the point: "Aggressive" is a word, "2–3 vs Aggressive" is an opponent. */
  const record = summarizeHistory(history, mode === 'bot' ? preset : null);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    handleStart();
  }

  function handleStart(): void {
    const you = yourName.trim() || 'You';
    const seed = randomSeed();

    if (mode === 'bot') {
      onStart({
        players: [
          { name: you, loadout: yoursEffective },
          { name: capitalize(preset), loadout: botLoadout },
        ],
        target,
        seed,
        botSeat: 1,
        botPreset: preset,
      });
    } else {
      onStart({
        players: [
          { name: you, loadout: yoursEffective },
          { name: friend, loadout: opponentLoadout },
        ],
        target,
        seed,
        botSeat: null,
        botPreset: null,
      });
    }
  }

  /**
   * "Custom" opens the picker rather than merely selecting a fourth option —
   * the card *is* the way in, so choosing it and then hunting for a second
   * button would be a wasted tap.
   *
   * It deliberately does not seed the picker from the preset that was showing.
   * It used to, back when several named builds sat beside it; now the only
   * other card is Ordinary, and seeding from it would wipe the custom loadout
   * the player just came back for.
   */
  function handleChooseCustom(): void {
    setLoadoutPreset(CUSTOM_PRESET_ID);
    setStep('loadout');
  }

  if (step === 'loadout') {
    return (
      <LoadoutStep
        yourLoadout={yourLoadout}
        opponentLoadout={opponentEffective}
        opponentLabel={mode === 'bot' ? `${capitalize(preset)}’s dice` : `${friend}’s dice`}
        opponentEditable={mode === 'friend'}
        opponentNote={
          botMirrors
            ? 'Mirroring your dice — turn that off on the previous screen to leave this opponent on ordinary dice.'
            : 'Bots don’t own a collection yet, so this opponent plays ordinary dice.'
        }
        onChangeYours={setYourLoadout}
        onChangeOpponent={setOpponentLoadout}
        onBack={() => setStep('basics')}
        onStart={handleStart}
      />
    );
  }

  return (
    <div className="setup">
      <h1 className="setup__title">Farkle</h1>
      <p className="setup__subtitle">
        <button type="button" className="setup__link setup__link--subtitle" onClick={onShowRules}>
          Kingdom Come: Deliverance II rules
        </button>
      </p>

      <HeroDice />

      {/*
        The returning player's record is the only thing that used to share
        this slot with the pitch text. Nobody with none yet has anything to
        show here, so the line simply isn't there for them — minimalism over
        an empty placeholder.
      */}
      {record !== null && (
        <p className="setup__pitch">
          <span className="setup__record">
            {record.bots.wins}&ndash;{record.bots.losses} against bots
            {record.versus !== null && mode === 'bot' && (
              <>
                {' · '}
                {record.versus.wins}&ndash;{record.versus.losses} vs {capitalize(preset)}
              </>
            )}
            {record.bestTurn > 0 && <>{' · '}best turn {record.bestTurn}</>}
          </span>
        </p>
      )}

      <form className="setup__form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="field__input"
            value={yourName}
            placeholder="You"
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) => setYourName(event.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label" id="opponent-label">
            Opponent
          </span>
          {/* A radiogroup rather than a row of buttons: it is one choice out of a set, and without the roles a screen reader announces two unrelated buttons. */}
          <div className="segmented" role="radiogroup" aria-labelledby="opponent-label">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'bot'}
              className={mode === 'bot' ? 'segmented__option segmented__option--active' : 'segmented__option'}
              onClick={() => setMode('bot')}
            >
              <span className="segmented__value">Bot</span>
              <span className="segmented__hint">on this device</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'friend'}
              className={
                mode === 'friend' ? 'segmented__option segmented__option--active' : 'segmented__option'
              }
              onClick={() => setMode('friend')}
            >
              <span className="segmented__value">Friend</span>
              <span className="segmented__hint">pass &amp; play</span>
            </button>
          </div>
        </div>

        {mode === 'bot' ? (
          <label className="field">
            <span className="field__label">Personality</span>
            {/*
              One word per option. The descriptions that used to trail each
              name were the whole reason this control truncated on a phone —
              a native select has no room for them, and "Balanced — A sensible,
              well-rounded playe" reads worse than no explanation at all.
            */}
            <select
              className="field__input"
              value={preset}
              onChange={(event) => setPreset(event.target.value as PresetName)}
            >
              {PRESET_NAMES.map((name) => (
                <option key={name} value={name}>
                  {capitalize(name)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span className="field__label">Friend&rsquo;s name</span>
            <input
              className="field__input"
              value={friendName}
              placeholder="Friend"
              maxLength={NAME_MAX_LENGTH}
              onChange={(event) => setFriendName(event.target.value)}
            />
          </label>
        )}

        <div className="field">
          <span className="field__label" id="target-label">
            First to
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="target-label">
            {TARGET_CHOICES.map((choice) => (
              <button
                type="button"
                key={choice.value}
                role="radio"
                aria-checked={target === choice.value}
                className={
                  target === choice.value
                    ? 'segmented__option segmented__option--active'
                    : 'segmented__option'
                }
                onClick={() => setTarget(choice.value)}
              >
                <span className="segmented__value">{choice.value}</span>
                <span className="segmented__hint">~{choice.turnsEach} turns each</span>
              </button>
            ))}
          </div>
        </div>

        <LoadoutChoice
          selected={loadoutPreset}
          customLoadout={yourLoadout}
          onSelectPreset={setLoadoutPreset}
          onChooseCustom={handleChooseCustom}
        />

        {mirrorMatters && (
          <label className="setup__mirror">
            <input
              type="checkbox"
              checked={botMirrors}
              onChange={(event) => setBotMirrors(event.target.checked)}
            />
            <span>
              <span className="setup__mirror-label">Bot plays the same dice</span>
              <span className="setup__mirror-hint">
                {botMirrors
                  ? 'An even match — both sides throw the same six.'
                  : 'The bot stays on ordinary dice, so the advantage is yours.'}
              </span>
            </span>
          </label>
        )}

        <button type="submit" className="setup__start">
          Start match
        </button>
      </form>
    </div>
  );
}
