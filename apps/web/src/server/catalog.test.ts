import { describe, expect, test } from 'vitest';
import { activities, buildPrompt, findActivity, pageKind, themes } from './catalog';
import { mainWord, tidyWord, wordPair } from './words';

const session = (activityType: string, activitySubtype: string, theme = 'Animals') => ({ activityType, activitySubtype, theme });
const cat = { en: 'cat', fil: 'pusa' };

describe('modes', () => {
  test('two mode presets, Free Play is gone', () => {
    expect(activities.map((a) => a.id)).toEqual(['trace_learn', 'color_create']);
    expect(findActivity('free_play', 'storybook')).toBeNull();
  });

  test('Trace & Learn has Trace Word and Trace Image; Color & Create has one output (no Select Mode step)', () => {
    expect(activities[0].subtypes.map((s) => s.id)).toEqual(['trace_word', 'trace_image']);
    expect(activities[1].subtypes.map((s) => s.id)).toEqual(['coloring_page']);
    expect(findActivity('color_create', 'coloring_page')).not.toBeNull();
    expect(findActivity('color_create', 'trace_word')).toBeNull();
  });

  test('Free Expression is the first theme and the recommended one', () => {
    expect(themes[0]).toMatchObject({ name: 'Free Expression', recommended: true });
  });

  test('old sessions still get a page', () => {
    expect(pageKind(session('trace_learn', 'letter'))).toBe('trace_image');
    expect(pageKind(session('free_play', 'storybook'))).toBe('coloring');
  });
});

describe('buildPrompt', () => {
  test('Color & Create asks for thick black outlines with white insides', () => {
    const p = buildPrompt(session('color_create', 'coloring_page'), 'a happy cat.', cat);
    expect(p.prompt).toMatch(/^coloring book page of happy cat/);
    expect(p.prompt).toMatch(/thick bold black outlines, white interior, no shading, no gray, white background/);
    expect(p.prompt).toMatch(/theme: Animals$/);
    expect(p.negative).toMatch(/color/);
    expect(p.sheet).toEqual({ kind: 'coloring', en: 'cat', fil: 'pusa' });
    expect(p.needsImage).toBe(true);
  });

  test('Trace Image asks for a simple cartoon outline', () => {
    const p = buildPrompt(session('trace_learn', 'trace_image'), 'a cat', cat);
    expect(p.prompt).toMatch(/simple cute cartoon, dashed outline only, no fill, no shading, solid black eyes, white background/);
    expect(p.sheet.kind).toBe('trace_image');
  });

  test('Trace Word is letters only: no picture is made', () => {
    const p = buildPrompt(session('trace_learn', 'trace_word'), 'a cat', cat);
    expect(p.needsImage).toBe(false);
    expect(p.sheet).toEqual({ kind: 'trace_word', en: 'cat', fil: 'pusa' });
  });

  test('Free Expression adds no theme to the prompt', () => {
    const p = buildPrompt(session('color_create', 'coloring_page', 'Free Expression'), 'a rocket', { en: 'rocket', fil: '' });
    expect(p.prompt).not.toMatch(/theme/);
  });
});

describe('words', () => {
  test('the main thing the child asked for', () => {
    expect(mainWord('a big happy elephant')).toBe('elephant');
    expect(mainWord('isang malaking aso')).toBe('aso');
    expect(mainWord('three cats')).toBe('cat');
    expect(mainWord('can you make me a rocket please')).toBe('rocket');
    expect(mainWord('gumawa ka ng bahay')).toBe('bahay');
  });

  test('English and Filipino, whichever was said', () => {
    expect(wordPair('a cute cat')).toEqual({ en: 'cat', fil: 'pusa' });
    expect(wordPair('masayang pusa')).toEqual({ en: 'cat', fil: 'pusa' });
    expect(wordPair('limang mangga')).toEqual({ en: 'mango', fil: 'mangga' });
    // Not in the list: printed as said, in one language.
    expect(wordPair('a zorbleflop')).toEqual({ en: 'zorbleflop', fil: '' });
  });

  test('a word from the AI is cleaned up', () => {
    expect(tidyWord(' Cat! ')).toBe('cat');
    expect(tidyWord(undefined)).toBe('');
  });
});
