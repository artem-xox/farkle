import { legalKeeps } from '@farkle/engine';
import { describe, expect, it } from 'vitest';

import { createPreset, isPresetName, PRESET_NAMES, PRESETS } from '../src/presets.js';
import { fakeView } from './helpers/fake-view.js';

describe('PRESETS', () => {
  it('has the five personalities from docs/DESIGN.md §6', () => {
    expect([...PRESET_NAMES].sort()).toEqual(
      ['aggressive', 'balanced', 'cautious', 'novice', 'reckless', 'smart'].sort(),
    );
  });

  it.each(PRESET_NAMES)('%s has internally sane parameters', (name) => {
    const params = PRESETS[name];
    expect(params.bankAt).toBeGreaterThan(0);
    expect(params.minDiceToThrow).toBeGreaterThanOrEqual(0);
    expect(params.minDiceToThrow).toBeLessThanOrEqual(6);
    expect(Number.isFinite(params.diceValue)).toBe(true);
    expect(params.desperationMargin).toBeGreaterThanOrEqual(0);
    expect(params.catchUpBonus).toBeGreaterThanOrEqual(0);
    expect(params.mistakeRate).toBeGreaterThanOrEqual(0);
    expect(params.mistakeRate).toBeLessThanOrEqual(1);
  });

  it('only novice is meant to make deliberate mistakes', () => {
    for (const name of PRESET_NAMES) {
      if (name === 'novice') {
        expect(PRESETS[name].mistakeRate).toBeGreaterThan(0);
      } else {
        expect(PRESETS[name].mistakeRate).toBe(0);
      }
    }
  });
});

describe('isPresetName', () => {
  it('accepts every real preset and rejects everything else', () => {
    for (const name of PRESET_NAMES) {
      expect(isPresetName(name)).toBe(true);
    }
    expect(isPresetName('expert')).toBe(false);
    expect(isPresetName('')).toBe(false);
    expect(isPresetName('toString')).toBe(false);
  });
});

describe('createPreset', () => {
  it('names the bot after its preset and lets it act', () => {
    const view = fakeView({ turnScore: 50, diceInPlay: 4 });
    const options = legalKeeps([1, 2, 3, 4, 5, 6]);
    for (const name of PRESET_NAMES) {
      const bot = createPreset(name, 1);
      expect(bot.name).toBe(name);
      expect(() => bot.chooseKeep(view, options)).not.toThrow();
      expect(['Throw', 'Bank']).toContain(bot.decideAfterKeep(view));
    }
  });

  it('is deterministic for a given seed, including novice’s mistake rolls', () => {
    const view = fakeView();
    const options = legalKeeps([1, 1, 5, 5, 2, 3]);
    const first = createPreset('novice', 123);
    const second = createPreset('novice', 123);

    const firstChoices = Array.from({ length: 30 }, () => first.chooseKeep(view, options));
    const secondChoices = Array.from({ length: 30 }, () => second.chooseKeep(view, options));
    expect(firstChoices).toEqual(secondChoices);
  });
});
