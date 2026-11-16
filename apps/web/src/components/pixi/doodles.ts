// Crayon doodles for the Pixi animation. Each doodle is a few strokes in a
// -1..1 box (y up). They are painted once into a texture atlas (halo pages,
// confetti, floating doodles), and Pixi's wand traces the same strokes while
// a picture is being made.

export type Pt = [number, number];
export type Stroke = { pts: Pt[]; ink: string; fill?: string; closed?: boolean; width?: number };
export type Doodle = Stroke[];

// Crayon line colors (a little deeper than the fills so they show on paper).
export const INK = { sky: '#2BA6EE', sun: '#EFB000', purple: '#8566E8', mint: '#1FBF83', pink: '#EC69A6', peach: '#F2973A' };
export const FILL = { sky: '#A4DEFF', sun: '#FFE066', purple: '#D2C4FF', mint: '#A8F2D3', pink: '#FFC4DE', peach: '#FFD6A8', white: '#FFFFFF' };
type Hue = keyof typeof INK;

const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 32): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}
// Closed outline from a radius function (r of the angle), for blobs and clouds.
function radial(cx: number, cy: number, sx: number, sy: number, r: (a: number) => number, n = 64): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    pts.push([cx + Math.cos(a) * sx * r(a), cy + Math.sin(a) * sy * r(a)]);
  }
  return pts;
}
const circle = (cx: number, cy: number, r: number, n = 36) => radial(cx, cy, r, r, () => 1, n);
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
function star(cx: number, cy: number, ro: number, ri: number, points = 5, rot = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + rot + (i * Math.PI) / points;
    const r = i % 2 ? ri : ro;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
function rotate(d: Doodle, a: number): Doodle {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return d.map((st) => ({ ...st, pts: st.pts.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt) }));
}
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y]);

const crayon = (hue: Hue): Doodle =>
  rotate(
    [
      { pts: [[-0.78, -0.18], [0.42, -0.18], [0.82, 0], [0.42, 0.18], [-0.78, 0.18]], ink: INK[hue], fill: FILL[hue], closed: true },
      { pts: [[-0.42, -0.18], [-0.42, 0.18]], ink: INK[hue] },
      { pts: [[0.1, -0.18], [0.1, 0.18]], ink: INK[hue] },
    ],
    deg(35)
  );

const DEFS = {
  star: [{ pts: star(0, -0.04, 0.88, 0.4), ink: INK.sun, fill: FILL.sun, closed: true }],
  cloud: [{ pts: radial(0, 0, 0.74, 0.46, (a) => 1 + 0.17 * Math.abs(Math.sin(3 * a)), 72), ink: INK.sky, fill: FILL.white, closed: true }],
  heart: [
    {
      pts: Array.from({ length: 48 }, (_, i) => {
        const t = (i / 48) * TAU;
        return [(16 * Math.sin(t) ** 3) / 19, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 19 + 0.12] as Pt;
      }),
      ink: INK.pink,
      fill: FILL.pink,
      closed: true,
    },
  ],
  sun: [
    { pts: circle(0, 0, 0.42), ink: INK.peach, fill: FILL.sun, closed: true },
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * TAU + 0.2;
      return { pts: [[Math.cos(a) * 0.58, Math.sin(a) * 0.58], [Math.cos(a) * 0.88, Math.sin(a) * 0.88]] as Pt[], ink: INK.peach };
    }),
    { pts: circle(-0.14, 0.08, 0.04, 10), ink: INK.peach, fill: INK.peach, closed: true },
    { pts: circle(0.14, 0.08, 0.04, 10), ink: INK.peach, fill: INK.peach, closed: true },
    { pts: arc(0, -0.04, 0.17, 0.13, deg(200), deg(340), 12), ink: INK.peach },
  ],
  cat: [
    { pts: [[-0.5, 0.12], [-0.44, 0.8], [-0.1, 0.42]], ink: INK.purple, fill: FILL.purple, closed: true },
    { pts: mirror([[-0.5, 0.12], [-0.44, 0.8], [-0.1, 0.42]]), ink: INK.purple, fill: FILL.purple, closed: true },
    { pts: circle(0, -0.1, 0.58), ink: INK.purple, fill: FILL.purple, closed: true },
    { pts: circle(-0.22, 0.0, 0.065, 10), ink: INK.purple, fill: INK.purple, closed: true },
    { pts: circle(0.22, 0.0, 0.065, 10), ink: INK.purple, fill: INK.purple, closed: true },
    { pts: [[-0.06, -0.16], [0.06, -0.16], [0, -0.24]], ink: INK.pink, fill: FILL.pink, closed: true },
    { pts: [[-0.16, -0.32], [-0.08, -0.38], [0, -0.3], [0.08, -0.38], [0.16, -0.32]], ink: INK.purple },
    { pts: [[-0.3, -0.18], [-0.78, -0.08]], ink: INK.purple, width: 0.7 },
    { pts: [[-0.3, -0.26], [-0.78, -0.3]], ink: INK.purple, width: 0.7 },
    { pts: [[0.3, -0.18], [0.78, -0.08]], ink: INK.purple, width: 0.7 },
    { pts: [[0.3, -0.26], [0.78, -0.3]], ink: INK.purple, width: 0.7 },
  ],
  fish: [
    { pts: [[-0.5, 0], [-0.9, 0.34], [-0.86, -0.34]], ink: INK.sky, fill: FILL.sky, closed: true },
    { pts: radial(0.02, 0, 0.58, 0.36, () => 1), ink: INK.sky, fill: FILL.sky, closed: true },
    { pts: circle(0.3, 0.08, 0.06, 10), ink: INK.purple, fill: INK.purple, closed: true },
    { pts: arc(-0.1, 0, 0.16, 0.3, deg(-70), deg(70), 10), ink: INK.sky },
    { pts: circle(0.74, 0.42, 0.07, 12), ink: INK.sky, closed: true },
    { pts: circle(0.84, 0.68, 0.1, 14), ink: INK.sky, closed: true },
  ],
  flower: [
    { pts: [[0, 0.1], [0.04, -0.3], [-0.02, -0.88]], ink: INK.mint, width: 1.2 },
    { pts: [[0.02, -0.5], [0.34, -0.36], [0.46, -0.52], [0.14, -0.62]], ink: INK.mint, fill: FILL.mint, closed: true },
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * TAU + 0.3;
      return { pts: circle(Math.cos(a) * 0.3, 0.32 + Math.sin(a) * 0.3, 0.19, 20), ink: INK.pink, fill: FILL.pink, closed: true };
    }),
    { pts: circle(0, 0.32, 0.17, 20), ink: INK.sun, fill: FILL.sun, closed: true },
  ],
  house: [
    { pts: rect(-0.52, -0.82, 0.52, 0.08), ink: INK.sky, fill: FILL.sky, closed: true },
    { pts: [[-0.7, 0.06], [0, 0.74], [0.7, 0.06]], ink: INK.purple, fill: FILL.purple, closed: true },
    { pts: rect(-0.14, -0.82, 0.14, -0.34), ink: INK.peach, fill: FILL.sun, closed: true },
    { pts: rect(0.22, -0.3, 0.44, -0.08), ink: INK.sky, fill: FILL.white, closed: true },
    { pts: rect(-0.44, -0.3, -0.22, -0.08), ink: INK.sky, fill: FILL.white, closed: true },
  ],
  A: [
    { pts: [[-0.56, -0.8], [0, 0.82], [0.56, -0.8]], ink: INK.sky, width: 1.5 },
    { pts: [[-0.3, -0.12], [0.3, -0.12]], ink: INK.sky, width: 1.5 },
  ],
  B: [
    { pts: [[-0.42, -0.8], [-0.42, 0.8]], ink: INK.purple, width: 1.5 },
    { pts: [[-0.42, 0.8], ...arc(0.08, 0.41, 0.4, 0.39, deg(90), deg(-90), 16), [-0.42, 0.02]], ink: INK.purple, width: 1.5 },
    { pts: [[-0.42, 0.02], ...arc(0.12, -0.39, 0.44, 0.41, deg(90), deg(-90), 16), [-0.42, -0.8]], ink: INK.purple, width: 1.5 },
  ],
  C: [{ pts: arc(0.08, 0, 0.72, 0.8, deg(45), deg(315), 32), ink: INK.mint, width: 1.5 }],
  one: [
    { pts: [[-0.32, 0.46], [0.06, 0.82], [0.06, -0.8]], ink: INK.sun, width: 1.5 },
    { pts: [[-0.32, -0.8], [0.44, -0.8]], ink: INK.sun, width: 1.5 },
  ],
  two: [{ pts: [...arc(0, 0.36, 0.44, 0.42, deg(165), deg(-30), 20), [-0.5, -0.8], [0.56, -0.8]], ink: INK.pink, width: 1.5 }],
  three: [
    { pts: arc(-0.02, 0.4, 0.4, 0.38, deg(150), deg(-90), 20), ink: INK.sky, width: 1.5 },
    { pts: arc(-0.02, -0.38, 0.46, 0.42, deg(90), deg(-150), 20), ink: INK.sky, width: 1.5 },
  ],
  tree: [
    { pts: rect(-0.13, -0.86, 0.13, -0.18), ink: INK.peach, fill: FILL.peach, closed: true },
    { pts: radial(0, 0.24, 0.58, 0.52, (a) => 1 + 0.12 * Math.abs(Math.sin(4 * a)), 72), ink: INK.mint, fill: FILL.mint, closed: true },
    { pts: circle(-0.22, 0.32, 0.07, 10), ink: INK.pink, fill: FILL.pink, closed: true },
    { pts: circle(0.2, 0.14, 0.07, 10), ink: INK.pink, fill: FILL.pink, closed: true },
    { pts: circle(0.08, 0.5, 0.07, 10), ink: INK.pink, fill: FILL.pink, closed: true },
  ],
  rainbow: [
    { pts: arc(0, -0.55, 0.88, 0.95, deg(180), 0, 30), ink: INK.pink, width: 1.6 },
    { pts: arc(0, -0.55, 0.7, 0.76, deg(180), 0, 28), ink: INK.sun, width: 1.6 },
    { pts: arc(0, -0.55, 0.52, 0.57, deg(180), 0, 24), ink: INK.mint, width: 1.6 },
    { pts: arc(0, -0.55, 0.34, 0.38, deg(180), 0, 20), ink: INK.sky, width: 1.6 },
  ],
  butterfly: [
    { pts: rotate([{ pts: radial(-0.4, 0.28, 0.38, 0.3, () => 1, 28), ink: '' }], 0.3)[0].pts, ink: INK.purple, fill: FILL.pink, closed: true },
    { pts: mirror(rotate([{ pts: radial(-0.4, 0.28, 0.38, 0.3, () => 1, 28), ink: '' }], 0.3)[0].pts), ink: INK.purple, fill: FILL.pink, closed: true },
    { pts: radial(-0.3, -0.3, 0.27, 0.22, () => 1, 24), ink: INK.purple, fill: FILL.sun, closed: true },
    { pts: radial(0.3, -0.3, 0.27, 0.22, () => 1, 24), ink: INK.purple, fill: FILL.sun, closed: true },
    { pts: [[0, -0.55], [0, 0.42]], ink: INK.purple, width: 1.5 },
    { pts: [[0, 0.4], [-0.12, 0.66], [-0.24, 0.74]], ink: INK.purple, width: 0.8 },
    { pts: [[0, 0.4], [0.12, 0.66], [0.24, 0.74]], ink: INK.purple, width: 0.8 },
  ],
  car: [
    { pts: [[-0.86, -0.36], [-0.86, 0.04], [-0.46, 0.1], [-0.26, 0.46], [0.3, 0.46], [0.5, 0.1], [0.86, 0.04], [0.86, -0.36]], ink: INK.sky, fill: FILL.sky, closed: true },
    { pts: [[-0.2, 0.12], [-0.1, 0.36], [0.22, 0.36], [0.32, 0.12]], ink: INK.sky, fill: FILL.white, closed: true },
    { pts: circle(-0.46, -0.4, 0.2, 20), ink: INK.purple, fill: FILL.purple, closed: true },
    { pts: circle(0.46, -0.4, 0.2, 20), ink: INK.purple, fill: FILL.purple, closed: true },
  ],
  moon: [{ pts: [...arc(0, 0, 0.72, 0.72, deg(50), deg(310), 28), ...arc(0.26, 0, 0.58, 0.58, deg(-67), deg(-293), 24)], ink: INK.sun, fill: FILL.sun, closed: true }],
  bird: [{ pts: [...arc(-0.34, -0.1, 0.36, 0.42, deg(170), deg(20), 14), ...arc(0.34, -0.1, 0.36, 0.42, deg(160), deg(10), 14)], ink: INK.sky, width: 1.4 }],
  crayonSun: crayon('sun'),
  crayonSky: crayon('sky'),
  crayonPurple: crayon('purple'),
  crayonMint: crayon('mint'),
  circle: [{ pts: circle(0, 0, 0.66), ink: INK.mint, fill: FILL.mint, closed: true }],
  triangle: [{ pts: [[0, 0.72], [0.74, -0.56], [-0.74, -0.56]], ink: INK.sun, fill: FILL.sun, closed: true }],
  square: rotate([{ pts: rect(-0.58, -0.58, 0.58, 0.58), ink: INK.sky, fill: FILL.sky, closed: true }], deg(8)),
  spiral: [{ pts: Array.from({ length: 70 }, (_, i) => { const a = (i / 69) * 5.5 * Math.PI; const r = 0.05 + (i / 69) * 0.72; return [Math.cos(a) * r, Math.sin(a) * r] as Pt; }), ink: INK.purple, width: 1.2 }],
  sparkle: [{ pts: star(0, 0, 0.86, 0.2, 4), ink: INK.sun, fill: FILL.white, closed: true }],
  note: [
    { pts: rotate([{ pts: radial(0, 0, 0.24, 0.17, () => 1, 20), ink: '' }], -0.4)[0].pts.map(([x, y]) => [x - 0.26, y - 0.52] as Pt), ink: INK.sky, fill: INK.sky, closed: true },
    { pts: [[-0.04, -0.46], [-0.04, 0.66]], ink: INK.sky, width: 1.3 },
    { pts: [[-0.04, 0.66], [0.3, 0.46], [0.36, 0.12]], ink: INK.sky, width: 1.3 },
  ],
  // Sound arcs: used as the "ear" particles while Pixi listens.
  waves: [
    { pts: arc(-0.7, 0, 0.36, 0.36, deg(-55), deg(55), 12), ink: INK.purple, width: 1.4 },
    { pts: arc(-0.7, 0, 0.8, 0.8, deg(-50), deg(50), 16), ink: INK.sky, width: 1.4 },
    { pts: arc(-0.7, 0, 1.24, 1.24, deg(-40), deg(40), 18), ink: INK.mint, width: 1.4 },
  ],
  dog: [
    { pts: circle(0, -0.06, 0.54), ink: INK.peach, fill: FILL.peach, closed: true },
    { pts: radial(-0.56, 0.04, 0.18, 0.38, () => 1, 20).map(([x, y]) => [x, y] as Pt), ink: INK.peach, fill: '#F7B877', closed: true },
    { pts: radial(0.56, 0.04, 0.18, 0.38, () => 1, 20), ink: INK.peach, fill: '#F7B877', closed: true },
    { pts: circle(-0.18, 0.06, 0.06, 10), ink: INK.purple, fill: INK.purple, closed: true },
    { pts: circle(0.18, 0.06, 0.06, 10), ink: INK.purple, fill: INK.purple, closed: true },
    { pts: radial(0, -0.14, 0.11, 0.075, () => 1, 14), ink: INK.purple, fill: INK.purple, closed: true },
    { pts: arc(0, -0.24, 0.16, 0.1, deg(200), deg(340), 10), ink: INK.purple },
    { pts: arc(0, -0.36, 0.08, 0.1, deg(180), deg(360), 10), ink: INK.pink, fill: FILL.pink, closed: true },
  ],
} satisfies Record<string, Doodle>;

export type DoodleName = keyof typeof DEFS;
export const DOODLE_NAMES = Object.keys(DEFS) as DoodleName[];
export const cellOf = (name: DoodleName) => DOODLE_NAMES.indexOf(name);
export const doodle = (name: DoodleName): Doodle => DEFS[name];

// Doodles Pixi draws while a picture is being made.
export const DRAWABLE: DoodleName[] = ['sun', 'house', 'cat', 'flower', 'fish', 'tree', 'heart', 'rainbow', 'butterfly', 'car', 'dog', 'star'];
// Doodles that drift in the sketchbook halo.
export const HALO: DoodleName[] = ['star', 'cloud', 'cat', 'fish', 'tree', 'A', 'one', 'two', 'three', 'B', 'C', 'moon', 'heart', 'butterfly', 'sparkle', 'dog', 'note'];
// Success confetti: crayons, stars, letters and shapes.
export const CONFETTI: DoodleName[] = ['crayonSun', 'crayonSky', 'crayonPurple', 'crayonMint', 'star', 'sparkle', 'heart', 'A', 'B', 'C', 'one', 'two', 'three', 'circle', 'triangle', 'square'];
// What circles Pixi's head while it thinks.
export const THINKING: DoodleName[] = ['star', 'crayonSun', 'crayonSky', 'sparkle', 'crayonPurple', 'note', 'star', 'crayonMint', 'cloud'];

// Words (English and Filipino) that pick the doodle Pixi draws first while
// the real picture is being made, so a wish for a cat starts with a cat.
const WISH_WORDS: [DoodleName, RegExp][] = [
  ['cat', /\b(cats?|kitty|kittens?|pusa|kuting)\b/i],
  ['dog', /\b(dogs?|pupp(y|ies)|doggy|aso|tuta)\b/i],
  ['fish', /\b(fish|isda)\b/i],
  ['butterfly', /\b(butterfl(y|ies)|paru-?paro)\b/i],
  ['flower', /\b(flowers?|roses?|sunflowers?|bulaklak)\b/i],
  ['tree', /\b(trees?|puno)\b/i],
  ['house', /\b(houses?|home|bahay)\b/i],
  ['car', /\b(cars?|kotse|jeepneys?|bus)\b/i],
  ['rainbow', /\b(rainbows?|bahaghari)\b/i],
  ['heart', /\b(hearts?|puso)\b/i],
  ['star', /\b(stars?|bituin)\b/i],
  ['moon', /\b(moon|buwan)\b/i],
  ['cloud', /\b(clouds?|ulap)\b/i],
  ['sun', /\b(sun|sunshine|araw)\b/i],
];
export function doodleForWish(text: string | null | undefined): DoodleName | null {
  if (!text) return null;
  return WISH_WORDS.find(([, words]) => words.test(text))?.[0] ?? null;
}

export const ATLAS = { cols: 8, rows: 4, cell: 128 };
// The doodle fills this much of its atlas cell (from the center, 0..0.5).
export const ATLAS_EXTENT = 0.42;

export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Points every `step` along a stroke (closed strokes return to the start).
export function resample(pts: Pt[], closed: boolean | undefined, step: number): Pt[] {
  const src = closed ? [...pts, pts[0]] : pts;
  const out: Pt[] = [src[0]];
  for (let i = 1; i < src.length; i++) {
    const [x0, y0] = src[i - 1];
    const [x1, y1] = src[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

// A hand-drawn wobble: each point nudged sideways by a smooth random amount.
function wobbly(pts: Pt[], amount: number, rand: () => number): Pt[] {
  const p1 = rand() * TAU;
  const p2 = rand() * TAU;
  let s = 0;
  return pts.map(([x, y], i) => {
    if (i) s += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    const next = pts[Math.min(i + 1, pts.length - 1)];
    const prev = pts[Math.max(i - 1, 0)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const k = amount * (Math.sin(s * 9 + p1) * 0.6 + Math.sin(s * 23 + p2) * 0.4);
    return [x - (ty / len) * k, y + (tx / len) * k];
  });
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

// Colors a closed shape the way a child does: a zigzag scribble over a light wash.
function scribbleFill(ctx: CanvasRenderingContext2D, st: Stroke, rand: () => number) {
  const xs = st.pts.map((p) => p[0]);
  const ys = st.pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  ctx.save();
  tracePath(ctx, st.pts);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = st.fill!;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = st.fill!;
  ctx.lineWidth = 0.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const span = Math.max(x1 - x0, y1 - y0) + 0.3;
  let flip = false;
  for (let k = -span; k < span; k += 0.075) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const ax = cx + k * 0.82 - span * 0.57;
    const ay = cy + k * 0.57 + span * 0.82;
    const bx = cx + k * 0.82 + span * 0.57;
    const by = cy + k * 0.57 - span * 0.82;
    const j = (rand() - 0.5) * 0.03;
    if (flip) {
      ctx.lineTo(bx + j, by);
      ctx.lineTo(ax + j, ay);
    } else {
      ctx.moveTo(ax + j, ay);
      ctx.lineTo(bx + j, by);
    }
    flip = !flip;
  }
  ctx.stroke();
  ctx.restore();
}

// Paints one doodle in its own -1..1 coordinates (the caller sets the transform).
export function paintDoodle(ctx: CanvasRenderingContext2D, d: Doodle, rand: () => number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const st of d) {
    if (st.fill && st.closed) scribbleFill(ctx, st, rand);
    const base = 0.085 * (st.width ?? 1);
    const pts = resample(st.pts, st.closed, 0.05);
    // A few slightly different passes give the waxy crayon edge.
    const passes = [
      { w: base, a: 0.95, j: 0.008 },
      { w: base * 0.75, a: 0.5, j: 0.016 },
      { w: base * 1.12, a: 0.3, j: 0.02 },
    ];
    for (const p of passes) {
      ctx.globalAlpha = p.a;
      ctx.strokeStyle = st.ink;
      ctx.lineWidth = p.w;
      tracePath(ctx, wobbly(pts, p.j, rand));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

export function paintAtlas(): HTMLCanvasElement {
  const { cols, rows, cell } = ATLAS;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d')!;
  DOODLE_NAMES.forEach((name, i) => {
    ctx.save();
    ctx.translate(((i % cols) + 0.5) * cell, (Math.floor(i / cols) + 0.5) * cell);
    ctx.beginPath();
    ctx.rect(-cell / 2, -cell / 2, cell, cell);
    ctx.clip();
    ctx.scale(cell * ATLAS_EXTENT, -cell * ATLAS_EXTENT);
    paintDoodle(ctx, DEFS[name], seeded(i + 7));
    ctx.restore();
  });
  // Crayon grain: tiny gaps in the wax.
  const rand = seeded(99);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 26000; i++) ctx.fillRect(rand() * canvas.width, rand() * canvas.height, 1 + rand() * 1.5, 1);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
