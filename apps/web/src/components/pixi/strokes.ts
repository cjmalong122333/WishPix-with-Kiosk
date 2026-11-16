import * as THREE from 'three';
import { resample, type Pt } from './doodles';

export type RibbonPath = { pts: Pt[]; color: string; width: number; closed?: boolean };
export type RibbonOpts = { scale?: number; z?: number; jitter?: number; seed?: number; step?: number };
// A point along the finished ribbon, for following the "pen".
export type PenSample = { u: number; x: number; y: number };

// Flat strips along 2D paths (in the XY plane), with a slight hand-drawn
// wobble and pressure change. All paths share one 0..1 "aU" coordinate so a
// whole drawing can be drawn on stroke by stroke.
export function ribbon(paths: RibbonPath[], opts: RibbonOpts = {}) {
  const { scale = 1, z = 0, jitter = 0.006, seed = 1, step = 0.03 } = opts;
  const lines = paths.map((p) => {
    const pts = resample(
      p.pts.map(([x, y]) => [x * scale, y * scale] as Pt),
      p.closed,
      step
    );
    const len: number[] = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { ...p, pts, len };
  });
  const total = lines.reduce((sum, l) => sum + l.len[l.len.length - 1], 0) || 1;
  const pos: number[] = [];
  const col: number[] = [];
  const us: number[] = [];
  const vs: number[] = [];
  const index: number[] = [];
  const samples: PenSample[] = [];
  const c = new THREE.Color();
  let start = 0;
  lines.forEach((l, li) => {
    c.set(l.color);
    const length = l.len[l.len.length - 1];
    const base = pos.length / 3;
    const ph = seed * 1.7 + li * 2.3;
    l.pts.forEach(([x, y], i) => {
      const next = l.pts[Math.min(i + 1, l.pts.length - 1)];
      const prev = l.pts[Math.max(i - 1, 0)];
      let tx = next[0] - prev[0];
      let ty = next[1] - prev[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const s = l.len[i];
      const wob = jitter * (Math.sin(s * 11 + ph) * 0.6 + Math.sin(s * 27 + ph * 1.9) * 0.4);
      const cx = x - ty * wob;
      const cy = y + tx * wob;
      const ends = l.closed ? 1 : Math.min(1, (s + 0.02) / 0.06, (length - s + 0.02) / 0.06);
      const hw = (l.width / 2) * (0.88 + 0.12 * Math.sin(s * 19 + ph)) * (0.55 + 0.45 * ends);
      const u = (start + s) / total;
      pos.push(cx - ty * hw, cy + tx * hw, z, cx + ty * hw, cy - tx * hw, z);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      us.push(u, u);
      vs.push(1, -1);
      samples.push({ u, x: cx, y: cy });
      if (i) {
        const a = base + (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    start += length;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  geo.setAttribute('aV', new THREE.Float32BufferAttribute(vs, 1));
  geo.setIndex(index);
  return { geo, samples, total };
}

// Where the pen is at progress u (0..1).
export function penAt(samples: PenSample[], u: number): PenSample {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].u < u) lo = mid + 1;
    else hi = mid;
  }
  return samples[lo];
}

// Three slightly different versions of one stroke set, swapped a few times a
// second so the lines "boil" like hand-drawn animation.
export class BoilingStroke {
  readonly mesh: THREE.Mesh;
  private frames: THREE.BufferGeometry[];

  constructor(paths: RibbonPath[], material: THREE.Material, opts: RibbonOpts = {}) {
    this.frames = [0, 1, 2].map((k) => ribbon(paths, { ...opts, seed: (opts.seed ?? 1) + k * 3.1, jitter: opts.jitter ?? 0.008 }).geo);
    this.mesh = new THREE.Mesh(this.frames[0], material);
  }

  boil(frame: number) {
    this.mesh.geometry = this.frames[frame % 3];
  }

  dispose() {
    for (const g of this.frames) g.dispose();
  }
}
