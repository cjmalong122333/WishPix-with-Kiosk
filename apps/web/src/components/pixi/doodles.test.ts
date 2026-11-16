import { describe, expect, it } from 'vitest';
import { doodleForWish } from './doodles';

describe('doodleForWish', () => {
  it('finds the doodle for English and Filipino wishes', () => {
    expect(doodleForWish('a happy cat')).toBe('cat');
    expect(doodleForWish('masayang pusa')).toBe('cat');
    expect(doodleForWish('two puppies playing')).toBe('dog');
    expect(doodleForWish('isang paru-paro')).toBe('butterfly');
    expect(doodleForWish('Bahay sa bundok')).toBe('house');
  });

  it('only matches whole words', () => {
    expect(doodleForWish('scatter')).toBeNull();
    expect(doodleForWish('a carrot')).toBeNull();
  });

  it('returns nothing for unknown or empty wishes', () => {
    expect(doodleForWish('a lion')).toBeNull();
    expect(doodleForWish('')).toBeNull();
    expect(doodleForWish(null)).toBeNull();
  });
});
