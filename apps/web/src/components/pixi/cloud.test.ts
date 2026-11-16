import { describe, expect, it } from 'vitest';
import { cloudPath } from './cloud';

describe('cloudPath', () => {
  it('draws a closed outline of bumps with no bad numbers', () => {
    const path = cloudPath(360, 150, { bump: 60 });
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path.split('A').length - 1).toBeGreaterThanOrEqual(6);
  });

  it('keeps the same bumps for every seed, only wobbled', () => {
    const arcs = (p: string) => p.split('A').length;
    expect(arcs(cloudPath(360, 150, { bump: 60, seed: 1, wobble: 2 }))).toBe(arcs(cloudPath(360, 150, { bump: 60 })));
    expect(cloudPath(360, 150, { bump: 60, seed: 1, wobble: 2 })).not.toBe(cloudPath(360, 150, { bump: 60, seed: 2, wobble: 2 }));
  });

  it('survives a box smaller than its bumps', () => {
    expect(cloudPath(10, 10, { bump: 60 })).not.toMatch(/NaN|Infinity/);
  });
});
