import { useState, type FormEvent } from 'react';

import { PRESET_NAMES, type PresetName } from '@farkle/bots';
import { BALANCED_DIE, DICE_PER_TURN, type DieSpec, type PlayerConfig } from '@farkle/engine';

import { capitalize, PRESET_DESCRIPTIONS } from '../presets';

export interface NewMatchOptions {
  readonly players: readonly [PlayerConfig, PlayerConfig];
  readonly target: number;
  readonly seed: number;
  readonly botSeat: number | null;
  readonly botPreset: PresetName | null;
}

export interface SetupScreenProps {
  onStart: (options: NewMatchOptions) => void;
}

/**
 * 8000 is deliberate rather than round: it is exactly what six 1s score, so
 * the longest match is still winnable by a single miraculous throw.
 */
const TARGET_CHOICES = [1500, 3000, 8000];
const DEFAULT_TARGET_CHOICE = 3000;

const randomSeed = (): number => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
const defaultLoadout = (): DieSpec[] => new Array(DICE_PER_TURN).fill(BALANCED_DIE);

export function SetupScreen({ onStart }: SetupScreenProps) {
  const [mode, setMode] = useState<'bot' | 'friend'>('bot');
  const [yourName, setYourName] = useState('You');
  const [friendName, setFriendName] = useState('Friend');
  const [preset, setPreset] = useState<PresetName>('balanced');
  const [target, setTarget] = useState(DEFAULT_TARGET_CHOICE);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const you = yourName.trim() || 'You';
    const seed = randomSeed();

    if (mode === 'bot') {
      onStart({
        players: [
          { name: you, loadout: defaultLoadout() },
          { name: capitalize(preset), loadout: defaultLoadout() },
        ],
        target,
        seed,
        botSeat: 1,
        botPreset: preset,
      });
    } else {
      const friend = friendName.trim() || 'Friend';
      onStart({
        players: [
          { name: you, loadout: defaultLoadout() },
          { name: friend, loadout: defaultLoadout() },
        ],
        target,
        seed,
        botSeat: null,
        botPreset: null,
      });
    }
  }

  return (
    <div className="setup">
      <h1 className="setup__title">Farkle</h1>
      <p className="setup__subtitle">Kingdom Come: Deliverance II rules</p>

      <form className="setup__form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="field__input"
            value={yourName}
            maxLength={20}
            onChange={(event) => setYourName(event.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label">Opponent</span>
          <div className="segmented">
            <button
              type="button"
              className={mode === 'bot' ? 'segmented__option segmented__option--active' : 'segmented__option'}
              onClick={() => setMode('bot')}
            >
              Bot
            </button>
            <button
              type="button"
              className={
                mode === 'friend' ? 'segmented__option segmented__option--active' : 'segmented__option'
              }
              onClick={() => setMode('friend')}
            >
              Friend (pass &amp; play)
            </button>
          </div>
        </div>

        {mode === 'bot' ? (
          <label className="field">
            <span className="field__label">Personality</span>
            <select
              className="field__input"
              value={preset}
              onChange={(event) => setPreset(event.target.value as PresetName)}
            >
              {PRESET_NAMES.map((name) => (
                <option key={name} value={name}>
                  {capitalize(name)} — {PRESET_DESCRIPTIONS[name]}
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
              maxLength={20}
              onChange={(event) => setFriendName(event.target.value)}
            />
          </label>
        )}

        <div className="field">
          <span className="field__label">First to</span>
          <div className="segmented">
            {TARGET_CHOICES.map((value) => (
              <button
                type="button"
                key={value}
                className={
                  target === value ? 'segmented__option segmented__option--active' : 'segmented__option'
                }
                onClick={() => setTarget(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="setup__start">
          Start match
        </button>
      </form>
    </div>
  );
}
