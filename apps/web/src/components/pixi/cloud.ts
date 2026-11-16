// The puffy outline of Pixi's thought bubble, as SVG path data: round bumps
// around a rounded box of w x h pixels. Outlines with different `seed`s have
// the same bumps drawn by a slightly different hand, so the page can switch
// between them like Pixi's "boiling" crayon lines.

type CloudOptions = {
  // About how wide each bump is, in pixels.
  bump: number;
  // Which wobble to use (0 = none).
  seed?: number;
  // How far the wobble moves each point, in pixels.
  wobble?: number;
};

// How far in from the box edge the dips between bumps are, per bump width.
// The bumps (arcs of radius 0.56 x their width) reach back out to the edge.
export const CLOUD_INSET = 0.34;

const SAMPLES = 240;
const ROUNDNESS = 5; // superellipse exponent: 2 = ellipse, higher = boxier

function random(seed: number) {
  let a = seed * 0x9e3779b1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cloudPath(w: number, h: number, { bump, seed = 0, wobble = 0 }: CloudOptions) {
  const inset = bump * CLOUD_INSET;
  const a = Math.max(1, w / 2 - inset);
  const b = Math.max(1, h / 2 - inset);
  const k = 2 / ROUNDNESS;

  // Points along the rounded box, and the distance along it to each one.
  const xs: number[] = [];
  const ys: number[] = [];
  const along: number[] = [0];
  for (let i = 0; i <= SAMPLES; i++) {
    // Start a little before the top left, so no dip lands right on a corner.
    const th = Math.PI * 1.1 + (i / SAMPLES) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    xs.push(w / 2 + a * Math.sign(c) * Math.abs(c) ** k);
    ys.push(h / 2 + b * Math.sign(s) * Math.abs(s) ** k);
    if (i) along.push(along[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  }
  const total = along[SAMPLES];

  // Bumps of slightly different sizes (the same for every seed).
  const n = Math.max(6, Math.round(total / bump));
  const shape = random(7);
  const sizes = Array.from({ length: n }, () => 0.8 + shape() * 0.4);
  const sum = sizes.reduce((x, y) => x + y, 0);

  const jitter = random(seed + 1);
  const shake = () => (seed ? (jitter() - 0.5) * 2 * wobble : 0);
  const pts: [number, number][] = [];
  let at = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (at / sum) * total;
    while (j < SAMPLES - 1 && along[j + 1] < d) j++;
    const f = (d - along[j]) / Math.max(1e-6, along[j + 1] - along[j]);
    pts.push([xs[j] + (xs[j + 1] - xs[j]) * f + shake(), ys[j] + (ys[j + 1] - ys[j]) * f + shake()]);
    at += sizes[i];
  }

  // Clockwise on screen, so each arc bulges outward.
  const r = (v: number) => Math.round(v * 10) / 10;
  let path = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    const radius = Math.hypot(x1 - x0, y1 - y0) * (0.56 + (seed ? (jitter() - 0.5) * 0.06 : 0));
    path += `A${r(radius)} ${r(radius)} 0 0 1 ${r(x1)} ${r(y1)}`;
  }
  return path + 'Z';
}
