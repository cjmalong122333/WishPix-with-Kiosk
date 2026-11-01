import { describe, expect, test } from 'vitest';
import { buildPrompt, findActivity } from './catalog';

const session = (activityType: string, activitySubtype: string) => ({ activityType, activitySubtype, theme: 'Animals' });

describe('buildPrompt', () => {
  test('coloring pages ask for black line art', () => {
    const p = buildPrompt(session('color_create', 'single_object'), 'a happy cat.');
    expect(p.prompt).toMatch(/^coloring book page of a single happy cat/);
    expect(p.prompt).toMatch(/theme: Animals$/);
    expect(p.negative).toMatch(/color/);
    expect(p.colorful).toBe(false);
    expect(p.sheet).toBeNull();
  });

  test('free play is colorful', () => {
    const p = buildPrompt(session('free_play', 'storybook'), 'a dragon eating pizza');
    expect(p.colorful).toBe(true);
    expect(p.prompt).toMatch(/bright friendly colors/);
  });

  test('letter tracing uses the first letter of the object', () => {
    expect(buildPrompt(session('trace_learn', 'letter'), 'a big elephant').sheet).toEqual({ kind: 'letter', letter: 'E', word: 'elephant' });
  });

  test('counting finds the number in English or Filipino', () => {
    expect(buildPrompt(session('trace_learn', 'number'), 'three cats').sheet).toEqual({ kind: 'number', count: 3, word: 'cats' });
    expect(buildPrompt(session('trace_learn', 'number'), 'limang mangga').sheet).toEqual({ kind: 'number', count: 5, word: 'mangga' });
    // No number said: three.
    expect(buildPrompt(session('trace_learn', 'number'), 'a dog').sheet).toMatchObject({ count: 3 });
  });

  test('counting pictures draw only the object, the sheet draws the number', () => {
    expect(buildPrompt(session('trace_learn', 'number'), 'four apples').prompt).toMatch(/^exactly 4 identical simple apples/);
  });

  test('shape tracing understands Filipino shape names', () => {
    expect(buildPrompt(session('trace_learn', 'shape'), 'isang bituin').sheet).toMatchObject({ kind: 'shape', shape: 'star' });
  });
});

test('findActivity rejects unknown combinations', () => {
  expect(findActivity('color_create', 'scene')).not.toBeNull();
  expect(findActivity('color_create', 'letter')).toBeNull();
  expect(findActivity('nope', 'scene')).toBeNull();
});
