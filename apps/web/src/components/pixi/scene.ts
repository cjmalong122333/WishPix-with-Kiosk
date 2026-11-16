import * as THREE from 'three';
import { PixiRig, paperStar, REST, type Pose } from './character';
import { ATLAS, CONFETTI, DRAWABLE, HALO, THINKING, cellOf, doodle, doodleForWish, paintAtlas, paintDoodle, seeded, type DoodleName } from './doodles';
import { canvasTexture, glowTexture, grainTexture, pageMaterial, SparkBatch, SPARK_COLORS, SpriteBatch, strokeMaterial, type Shared } from './materials';
import { penAt, ribbon, type PenSample } from './strokes';

// The Pixi animation for the kiosk: one three.js scene with six moods that
// blend into each other. The canvas is transparent, so the kiosk background
// shows through.

export type PixiMood = 'idle' | 'listening' | 'thinking' | 'generating' | 'printing' | 'success';
export const PIXI_MOODS: PixiMood[] = ['idle', 'listening', 'thinking', 'generating', 'printing', 'success'];

export type PixiOptions = {
  quality?: 'auto' | 'low' | 'high';
  // Called once if the computer stays too slow even at the lowest resolution.
  onTooSlow?: () => void;
  // Called every frame with where Pixi's head is on screen. The object is
  // reused from frame to frame, so read it right away.
  onAnchor?: (anchor: PixiAnchor) => void;
};
// Where Pixi's head is this frame, in CSS pixels from the canvas's top left.
export type PixiAnchor = {
  // Top middle of the crest.
  crestX: number;
  crestY: number;
  // Just outside the head's upper-left edge.
  headX: number;
  headY: number;
  // Pixels per scene unit at the head (how big Pixi is on screen).
  unit: number;
  width: number;
  height: number;
};
export type PixiScene = {
  setMood(mood: PixiMood): void;
  // Microphone loudness 0..1 while listening.
  // A number, or a function read every frame (for live microphone levels).
  setLevel(level: number | (() => number)): void;
  // Stops drawing (while hidden or the screen sleeps) and starts again.
  setPaused(paused: boolean): void;
  // The finished picture, shown on the worksheets and in the crest frame.
  setPicture(url: string | null): void;
  // What the child asked for: Pixi draws a matching doodle first, if it knows one.
  setWish(text: string | null): void;
  // Clear space wanted above the crest, in CSS pixels (for the thought
  // bubble; 0 for none). The camera zooms out just enough to make it.
  setHeadroom(px: number): void;
  dispose(): void;
};

const FOV = 30;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const TAU = Math.PI * 2;

// --- Timing helpers ---------------------------------------------------------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeOutBack = (x: number, s = 1.7) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const bump = (t: number, a: number, b: number) => Math.sin(Math.PI * seg(t, a, b));
const envelope = (t: number, a: number, b: number, fade: number) => smooth(seg(t, a, a + fade)) * (1 - smooth(seg(t, b - fade, b)));
const damp = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
// Piecewise-smooth keyframes [time, value].
function keys(t: number, frames: [number, number][]) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    if (t <= t1) {
      const [t0, v0] = frames[i - 1];
      return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
    }
  }
  return frames[frames.length - 1][1];
}
function bezier(out: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number) {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
}
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// --- What each mood looks like ---------------------------------------------
const KEYS = Object.keys(REST) as (keyof Pose)[];
const zero = (): Pose => Object.fromEntries(KEYS.map((k) => [k, 0])) as Pose;

const BASE: Record<PixiMood, Partial<Pose>> = {
  idle: { wandGlow: 0.35, dots: 0.35 },
  listening: {
    tilt: 0.08,
    headTilt: 0.15,
    wandArm: 2.3,
    wrist: -2.45,
    wristFwd: 0.35,
    freeArm: -1.25,
    freeFwd: 0,
    cheek: 1,
    wandGlow: 0.85,
    browL: 0.045,
    browR: 0.045,
    eyeScale: 1.08,
    mouth: 0.16,
    dots: 1,
  },
  thinking: { headTilt: -0.14, headNod: -0.12, eyeY: 0.035, eyeX: -0.025, browL: 0.075, browR: -0.012, wandArm: 1.6, wrist: -1.9, freeArm: -0.6, smile: 0.7, wandGlow: 0.5, dots: 0.9 },
  generating: {
    x: -1.15,
    turn: 0.28,
    headTurn: 0.2,
    headTilt: 0.05,
    wandArm: 1.35,
    wrist: -1.3,
    wristFwd: 0.25,
    freeArm: -0.7,
    browL: -0.015,
    browR: -0.015,
    wandGlow: 1,
    crest: 1,
    eyeX: 0.035,
    smile: 0.9,
  },
  printing: { wandArm: 1.1, wrist: -1.1, wandGlow: 0.8, crest: 1, freeArm: -0.5, mouth: 0.1, browL: 0.03, browR: 0.03 },
  success: { crest: 1, wandArm: 1.9, wrist: -3.0, freeArm: -1.9, mouth: 0.55, cheek: 0.7, browL: 0.05, browR: 0.05, wandGlow: 0.8 },
};

// Camera framing per mood: center and the box that must fit on screen.
const FRAME: Record<PixiMood, { cx: number; cy: number; w: number; h: number }> = {
  idle: { cx: 0, cy: 0.74, w: 4.5, h: 4.3 },
  listening: { cx: 0, cy: 0.78, w: 4.5, h: 4.3 },
  thinking: { cx: 0, cy: 0.8, w: 4.5, h: 4.3 },
  generating: { cx: -0.1, cy: 0.74, w: 5.5, h: 4.3 },
  printing: { cx: 0.25, cy: 0.72, w: 5.1, h: 4.5 },
  success: { cx: 0, cy: 0.85, w: 4.6, h: 4.6 },
};
const HALO_SPEED: Record<PixiMood, number> = { idle: 0.12, listening: 0.26, thinking: 0.2, generating: 0.08, printing: 0.16, success: 0.4 };
// Headroom for the thought bubble: the top of the crest when Pixi stands
// still, and how much higher it gets in each mood (floating, hops, jumps).
const CREST_TOP = 2.06;
const LIFT: Record<PixiMood, number> = { idle: 0.1, listening: 0.1, thinking: 0.1, generating: 0.1, printing: 0.3, success: 0.7 };
const BUBBLE_GAP = 0.06;

const HALO_R = 1.75;
const PAGE_COUNT = 8;
const SHEET_POS = new THREE.Vector3(1.3, 0.74, 0.25);
const GEN = { appear: 0.5, fill: 1.5, hold: 0.8, fly: 0.9 };
const PRINT_CYCLE = 5.2;
const MAX_SHEETS = 6;
const UPRIGHT = new Set<DoodleName>(['A', 'B', 'C', 'one', 'two', 'three']);

type Spark = {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
  grav: number;
  drag: number;
  path?: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
};
type Bit = { p: THREE.Vector3; v: THREE.Vector3; rot: number; spin: number; flip: number; flipSpeed: number; size: number; cell: number; age: number; life: number; sway: number };

export function createPixiScene(host: HTMLElement, opts: PixiOptions = {}): PixiScene {
  THREE.ColorManagement.enabled = false;
  const quality = opts.quality ?? 'auto';
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  let pixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2);
  renderer.setPixelRatio(pixelRatio);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture>(t: T) => (textures.push(t), t);

  const shared: Shared = {
    uTime: { value: 0 },
    uBoil: { value: new THREE.Vector2() },
    uSeed: { value: 0 },
    uGrain: { value: keep(grainTexture()) },
    uLight: { value: new THREE.Vector3(-0.35, 0.55, 0.8).normalize() },
    uPx: { value: pixelRatio },
  };
  const glow = keep(glowTexture());
  const atlas = keep(new THREE.CanvasTexture(paintAtlas()));
  atlas.premultiplyAlpha = true;
  const cellRect = (cell: number, v: THREE.Vector4) =>
    v.set((cell % ATLAS.cols) / ATLAS.cols, 1 - (Math.floor(cell / ATLAS.cols) + 1) / ATLAS.rows, 1 / ATLAS.cols, 1 / ATLAS.rows);

  // The little picture in the crest frame, and the printed worksheet.
  const crestTex = keep(canvasTexture(264, 180, () => {}));
  const sheetTex = keep(canvasTexture(384, 512, () => {}));
  let picture: HTMLImageElement | null = null;
  function drawPictures() {
    const c = (crestTex.image as HTMLCanvasElement).getContext('2d')!;
    const [w, h] = [264, 180];
    if (picture) cover(c, picture, 0, 0, w, h);
    else {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#9FDCFF');
      sky.addColorStop(1, '#E6F7FF');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#FFD93D';
      c.beginPath();
      c.arc(205, 52, 28, 0, TAU);
      c.fill();
      c.fillStyle = '#6DECB9';
      c.beginPath();
      c.ellipse(70, 190, 140, 70, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#3FD39B';
      c.beginPath();
      c.ellipse(220, 200, 120, 62, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#FFFFFF';
      for (const [x, y, r] of [[70, 50, 18], [92, 44, 22], [114, 52, 16]]) {
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
      }
    }
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = 8;
    c.strokeRect(4, 4, w - 8, h - 8);
    crestTex.needsUpdate = true;

    const s = (sheetTex.image as HTMLCanvasElement).getContext('2d')!;
    s.fillStyle = '#FFFFFF';
    s.fillRect(0, 0, 384, 512);
    s.strokeStyle = '#5CC8FF';
    s.lineWidth = 8;
    roundRect(s, 14, 14, 356, 484, 22);
    s.stroke();
    s.fillStyle = '#E8F6FF';
    roundRect(s, 34, 32, 316, 52, 16);
    s.fill();
    s.fillStyle = '#4C3FBF';
    s.font = '800 30px system-ui, sans-serif';
    s.textAlign = 'center';
    s.textBaseline = 'middle';
    s.fillText('WishPix', 192, 59);
    s.save();
    roundRect(s, 40, 100, 304, 284, 18);
    s.clip();
    if (picture) cover(s, picture, 40, 100, 304, 284);
    else {
      s.fillStyle = '#FFFDF4';
      s.fillRect(40, 100, 304, 284);
      s.translate(192, 242);
      s.scale(118, -118);
      paintDoodle(s, doodle('cat'), seeded(3));
    }
    s.restore();
    s.strokeStyle = '#A98CF3';
    s.lineWidth = 5;
    roundRect(s, 40, 100, 304, 284, 18);
    s.stroke();
    s.setLineDash([14, 10]);
    s.strokeStyle = '#B9C6E4';
    s.lineWidth = 4;
    for (const y of [418, 462]) {
      s.beginPath();
      s.moveTo(48, y);
      s.lineTo(336, y);
      s.stroke();
    }
    s.setLineDash([]);
    sheetTex.needsUpdate = true;
  }
  drawPictures();

  // --- Pixi --------------------------------------------------------------
  const rig = new PixiRig(shared, glow, crestTex);
  scene.add(rig.root);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, color: '#24345E', transparent: true, depthWrite: false, opacity: 0.22 }));
  shadow.position.set(0, -1.12, -0.3);
  scene.add(shadow);

  // --- Sketchbook halo: pages and doodles orbiting behind Pixi -------------
  const halo = new THREE.Group();
  scene.add(halo);
  const orbit = new THREE.Mesh(
    ribbon([{ pts: Array.from({ length: 97 }, (_, i) => [Math.cos((i / 96) * TAU) * HALO_R, Math.sin((i / 96) * TAU) * HALO_R * 0.92] as [number, number]), color: '#FFFFFF', width: 0.022 }], { step: 0.04 }).geo,
    strokeMaterial(shared, { opacity: 0.55, dash: 44 })
  );
  halo.add(orbit);
  const pageGeo = new THREE.PlaneGeometry(0.46, 0.58, 6, 6);
  const shown = new Set<DoodleName>();
  const pages = Array.from({ length: PAGE_COUNT }, (_, i) => {
    const mat = pageMaterial(shared, atlas, { lined: true, zoom: [1.25, 1.25 * (0.58 / 0.46)] });
    const mesh = new THREE.Mesh(pageGeo, mat);
    halo.add(mesh);
    const name = HALO[(i * 2) % HALO.length];
    shown.add(name);
    cellRect(cellOf(name), mat.uniforms.uCell.value);
    return { mesh, mat, name, erase: -1, pop: 0, phase: i * 1.37 };
  });
  const floaters = Array.from({ length: 9 }, (_, i) => ({ cell: cellOf(HALO[(i * 5 + 3) % HALO.length]), born: -i * 1.3, life: rnd(6, 10), offset: (i + 0.5) / 9, wobble: rnd(0, TAU) }));
  let nextPageSwap = 3;
  let swapIndex = 0;

  function swapPage(page: (typeof pages)[number], name: DoodleName) {
    shown.delete(page.name);
    page.name = name;
    shown.add(name);
    cellRect(cellOf(name), page.mat.uniforms.uCell.value);
  }

  // --- Effects --------------------------------------------------------------
  const sprites = new SpriteBatch(atlas, [ATLAS.cols, ATLAS.rows], 240);
  sprites.mesh.renderOrder = 5;
  scene.add(sprites.mesh);
  const sparkBatch = new SparkBatch(520);
  sparkBatch.points.renderOrder = 10;
  scene.add(sparkBatch.points);
  const sparkColors = SPARK_COLORS.map((c) => new THREE.Color(c));
  const sparks: Spark[] = [];
  const bits: Bit[] = [];

  function spark(p: THREE.Vector3, v: THREE.Vector3, o: Partial<Pick<Spark, 'life' | 'size' | 'color' | 'grav' | 'drag'>> = {}) {
    if (sparks.length > 480) sparks.shift();
    sparks.push({ p: p.clone(), v: v.clone(), age: 0, life: o.life ?? rnd(0.6, 1.2), size: o.size ?? rnd(0.08, 0.16), color: o.color ?? pick(sparkColors), grav: o.grav ?? 0, drag: o.drag ?? 1.5 });
  }
  function sparkTo(from: THREE.Vector3, to: THREE.Vector3, life: number, lift = 0.3, size?: number) {
    const mid = new THREE.Vector3().lerpVectors(from, to, 0.5).add(new THREE.Vector3(rnd(-0.25, 0.25), lift + rnd(-0.15, 0.15), rnd(-0.1, 0.2)));
    if (sparks.length > 480) sparks.shift();
    sparks.push({ p: from.clone(), v: new THREE.Vector3(), age: 0, life, size: size ?? rnd(0.07, 0.13), color: pick(sparkColors), grav: 0, drag: 0, path: [from.clone(), mid, to.clone()] });
  }
  function confetti(origin: THREE.Vector3, count: number, power: number, cells: DoodleName[] = CONFETTI) {
    for (let i = 0; i < count; i++) {
      if (bits.length > 160) bits.shift();
      const a = rnd(-1.15, 1.15);
      const speed = rnd(1.6, 3.6) * power;
      const name = pick(cells);
      // Letters and numbers only wobble: upside down, a 3 looks like a backwards E.
      const upright = UPRIGHT.has(name);
      bits.push({
        p: origin.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), rnd(-0.1, 0.1), rnd(-0.2, 0.3))),
        v: new THREE.Vector3(Math.sin(a) * speed, Math.cos(a) * speed * rnd(0.8, 1.2), rnd(-0.4, 0.9)),
        rot: upright ? rnd(-0.3, 0.3) : rnd(0, TAU),
        spin: upright ? 0 : rnd(-5, 5),
        flip: rnd(0, TAU),
        flipSpeed: rnd(3, 8),
        size: rnd(0.17, 0.3),
        cell: cellOf(name),
        age: 0,
        life: rnd(3, 4.4),
        sway: rnd(0, TAU),
      });
    }
  }

  // Generating: a sheet beside Pixi where the wand draws glowing lines.
  const gen = {
    presence: 0,
    group: new THREE.Group(),
    mat: pageMaterial(shared, atlas, { zoom: [1.05, 1.05] }),
    traceMat: strokeMaterial(shared, { glow: true }),
    trace: null as THREE.Mesh | null,
    samples: [] as PenSample[],
    name: 'sun' as DoodleName,
    start: 0,
    dur: 3,
    page: 0,
    pen: new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#FFF4B8', transparent: true, depthWrite: false })),
  };
  gen.group.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5, 8, 8), gen.mat));
  gen.mat.uniforms.uCurl.value = 0.1;
  gen.group.visible = false;
  scene.add(gen.group);
  gen.pen.visible = false;
  scene.add(gen.pen);

  function newDrawing(now: number) {
    gen.name = wishDoodle && !wishDrawn ? wishDoodle : pick(DRAWABLE.filter((n) => n !== gen.name));
    wishDrawn = true;
    if (gen.trace) {
      gen.group.remove(gen.trace);
      gen.trace.geometry.dispose();
    }
    const { geo, samples, total } = ribbon(
      doodle(gen.name).map((st) => ({ pts: st.pts, color: st.ink, width: 0.085, closed: st.closed })),
      { scale: 0.6, z: 0.014, step: 0.02, jitter: 0.004 }
    );
    gen.trace = new THREE.Mesh(geo, gen.traceMat);
    gen.group.add(gen.trace);
    gen.samples = samples;
    gen.dur = THREE.MathUtils.clamp(total * 0.6, 2.2, 4.6);
    gen.start = now;
    gen.page = (gen.page + 3) % PAGE_COUNT;
    cellRect(cellOf(gen.name), gen.mat.uniforms.uCell.value);
    gen.mat.uniforms.uReveal.value = 0;
  }

  // Printing: a paper star tossed up that bursts into worksheets.
  const star = paperStar(shared);
  star.visible = false;
  scene.add(star);
  const sheetGeo = new THREE.PlaneGeometry(0.66, 0.88, 4, 4);
  const sheetMat = pageMaterial(shared, sheetTex);
  sheetMat.uniforms.uCurl.value = 0.04;
  const sheets: { mesh: THREE.Mesh; born: number; n: number; from: THREE.Vector3 }[] = [];
  const print = { presence: 0, cycle: -1, burst: false, release: new THREE.Vector3(), stack: 0 };

  // Listening: "ear" arcs that drift in towards Pixi.
  const ears: { side: number; born: number; y: number; size: number }[] = [];
  const earTimer = [0, 0.25];
  let orbitPresence = 0;

  // --- State ----------------------------------------------------------------
  let mood: PixiMood = 'idle';
  let moodStart = 0;
  let levelSource: number | (() => number) = 0;
  let wishDoodle: DoodleName | null = null;
  let wishDrawn = false;
  let levelSmooth = 0;
  const pose: Pose = { ...REST };
  const final: Pose = { ...REST };
  let extras = zero();
  let fading = zero();
  let fadeStart = -10;
  let nextBlink = 2;
  let blinkAt = -1;
  let doubleBlink = false;
  let aimWrist = 0;
  let aimWeight = 0;
  let haloAngle = 0;
  let haloSpeed = HALO_SPEED.idle;
  let haloScale = 1;
  const frame = { ...FRAME.idle };
  let jumpsDone = -1;
  let time = 0;
  let headroomPx = 0;

  // How much taller (scene units, added at the top) a mood's box must be so
  // `headroomPx` fits between the crest and the top of the canvas.
  function extraTop(goal: (typeof FRAME)[PixiMood]) {
    if (!headroomPx) return 0;
    for (let extra = 0; extra < 3; extra += 0.05) {
      const half = Math.max((goal.h + extra) / 2, goal.w / 2 / camera.aspect);
      const unit = anchor.height / (2 * half);
      const room = (goal.cy + extra / 2 + half - CREST_TOP - LIFT[mood] - BUBBLE_GAP) * unit;
      if (room >= headroomPx) return extra;
    }
    return 3;
  }

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const headPos = new THREE.Vector3();
  const micPos = new THREE.Vector3();
  const handPos = new THREE.Vector3();
  const aimAt = new THREE.Vector3();
  const page4 = new THREE.Vector3();

  function setMood(next: PixiMood) {
    if (next === mood) return;
    fading = { ...extras };
    fadeStart = time;
    mood = next;
    moodStart = time;
    if (next === 'generating') {
      wishDrawn = false;
      newDrawing(time);
    }
    if (next === 'printing') {
      print.cycle = -1;
      print.stack = 0;
    }
    if (next === 'success') jumpsDone = -1;
  }

  // --- Per-mood motion ------------------------------------------------------
  function moodExtras(e: Pose, t: number, st: number, dt: number) {
    if (mood === 'idle') {
      const wp = (st + 4) % 9.5;
      const wave = envelope(wp, 0, 2.1, 0.4);
      e.freeArm += -2.15 * wave + 0.35 * Math.sin(wp * 13) * wave;
      e.headTilt += 0.1 * wave + 0.07 * Math.sin(t * 0.5);
      e.mouth += 0.4 * wave;
      e.headTurn += (0.2 * Math.sin(t * 0.37) + 0.08 * Math.sin(t * 0.91)) * (1 - wave);
      e.eyeX += 0.025 * Math.sin(t * 0.37 + 0.4);
      const cp = st % 8;
      e.crest += smooth(seg(cp, 3.4, 4.4)) * (1 - smooth(seg(cp, 7, 8)));
      if (Math.random() < dt * 3) spark(micPos, tmp.set(rnd(-0.2, 0.2), rnd(0.2, 0.5), rnd(0, 0.2)), { life: 1.2 });
    }

    if (mood === 'listening') {
      const lv = levelSmooth;
      e.headNod += 0.05 * Math.sin(t * 7) * lv;
      e.squash += 0.025 * Math.sin(t * 9) * lv;
      e.wandGlow += 0.2 * lv;
      e.dots += lv;
      e.wrist += 0.06 * Math.sin(t * 2.2);
      for (const side of [0, 1]) {
        earTimer[side] -= dt;
        if (earTimer[side] <= 0) {
          earTimer[side] = rnd(0.35, 0.55) - 0.25 * lv;
          ears.push({ side: side ? 1 : -1, born: t, y: rnd(-0.18, 0.28), size: 0.3 + lv * 0.16 });
        }
      }
      const rate = 8 + 34 * lv;
      for (let i = 0; i < 4; i++) {
        if (Math.random() < (dt * rate) / 4) {
          const a = rnd(0, TAU);
          const r = rnd(1.1, 2.0);
          sparkTo(tmp2.set(micPos.x + Math.cos(a) * r, micPos.y + Math.sin(a) * r * 0.8, micPos.z + rnd(0.3, 0.9)), micPos, rnd(0.6, 0.95), 0);
        }
      }
    }

    if (mood === 'thinking') {
      e.wrist += 0.22 * Math.sin(t * 2.6);
      e.wandFwd += 0.15 * Math.cos(t * 2.6);
      e.browL += 0.03 * Math.sin(t * 1.4);
      e.browR -= 0.02 * Math.sin(t * 1.4);
      e.eyeX += 0.03 * Math.sin(t * 0.9);
      e.headTilt += 0.06 * Math.sin(t * 0.7);
      if (Math.random() < dt * 4) spark(micPos, tmp.set(rnd(-0.3, 0.3), rnd(0.1, 0.4), 0), { life: 1 });
    }

    if (mood === 'printing') {
      const c = Math.floor(st / PRINT_CYCLE);
      const pt = st - c * PRINT_CYCLE;
      e.freeArm += keys(pt, [[0, 0], [0.42, 0.3], [0.62, -2.15], [1.1, -2.15], [1.9, 0]]);
      e.freeFwd += keys(pt, [[0, 0], [0.42, 0.5], [0.62, 0.3], [1.3, 0]]);
      e.squash += keys(pt, [[0, 0], [0.42, -0.07], [0.6, 0.07], [0.9, 0]]);
      e.headNod += -0.36 * bump(pt, 0.55, 2.3);
      e.eyeY += 0.045 * bump(pt, 0.55, 2.3);
      e.mouth += 0.6 * bump(pt, 1.45, 2.7);
      e.happy += 0.9 * bump(pt, 1.6, 2.5);
      e.y += 0.12 * bump(pt, 1.6, 2.15);
    }

    if (mood === 'success') {
      const first = st < 2.8;
      const idx = first ? 0 : 1 + Math.floor((st - 2.8) / 3.4);
      const a = first ? st : (st - 2.8) % 3.4;
      const height = first ? 0.55 : 0.26;
      const u = seg(a, 0.22, 0.82);
      const air = a > 0.22 && a < 0.82;
      e.y += air ? height * 4 * u * (1 - u) : 0;
      e.squash += a < 0.22 ? -0.16 * smooth(a / 0.22) : air ? 0.14 * (1 - u) ** 2 : -0.15 * Math.exp(-(a - 0.82) * 6) * Math.cos((a - 0.82) * 14);
      const up = envelope(a, 0.1, 1.2, 0.2);
      e.wandArm += 0.55 * up;
      e.freeArm -= 0.6 * up;
      e.happy += envelope(a, 0.15, 1.6, 0.15);
      e.mouth += 0.3 * up;
      e.wandArm += 0.18 * Math.sin(t * 3);
      e.freeArm += 0.18 * Math.sin(t * 3 + 1);
      if (a >= 0.5 && jumpsDone < idx) {
        jumpsDone = idx;
        confetti(tmp.set(final.x, 1.9, 0.3), first ? 46 : 18, first ? 1 : 0.75);
        for (let i = 0; i < (first ? 30 : 12); i++) spark(micPos, tmp2.set(rnd(-1.5, 1.5), rnd(0.5, 2.2), rnd(-0.3, 0.6)), { grav: 1.4, life: rnd(0.8, 1.4) });
      }
    }
  }

  // --- Systems ----------------------------------------------------------------
  function updateHalo(t: number, dt: number) {
    haloSpeed += (HALO_SPEED[mood] - haloSpeed) * damp(dt, 1.5);
    haloScale += ((mood === 'generating' ? 0.84 : 1) - haloScale) * damp(dt, 3);
    haloAngle += haloSpeed * dt;
    halo.position.set(final.x * 0.92, 0.74, -0.95);
    halo.scale.setScalar(haloScale);
    orbit.rotation.z = haloAngle * 0.5;

    if (t > nextPageSwap) {
      nextPageSwap = t + rnd(2.8, 4.2);
      const page = pages[(swapIndex = (swapIndex + 3) % PAGE_COUNT)];
      if (page.erase < 0 && !(mood === 'generating' && pages.indexOf(page) === gen.page)) page.erase = t;
    }
    pages.forEach((page, i) => {
      const a = haloAngle + (i / PAGE_COUNT) * TAU;
      page.mesh.position.set(Math.cos(a) * HALO_R, Math.sin(a) * HALO_R * 0.92, Math.sin(a + 1) * 0.12);
      page.mesh.rotation.set(Math.sin(t * 0.7 + page.phase) * 0.18, Math.sin(t * 0.55 + page.phase) * 0.35, Math.sin(t * 0.8 + page.phase) * 0.14);
      let reveal = 1;
      if (page.erase >= 0) {
        const e = t - page.erase;
        if (e < 0.6) reveal = 1 - smooth(e / 0.6);
        else {
          if (e - dt < 0.6) swapPage(page, pick(HALO.filter((n) => !shown.has(n))));
          reveal = smooth(seg(e, 0.6, 2.0));
          if (e > 2) page.erase = -1;
        }
      }
      page.mat.uniforms.uReveal.value = reveal;
      const pop = page.pop > 0 ? easeOutBack(seg(t, page.pop, page.pop + 0.45), 3) : 1;
      page.mesh.scale.setScalar(Math.max(0.01, pop));
      page.mat.uniforms.uGlow.value = page.pop > 0 ? 1 - seg(t, page.pop, page.pop + 1.2) : 0;
    });

    // Doodles drifting between the pages, changing every few seconds.
    for (const f of floaters) {
      const age = t - f.born;
      if (age > f.life) {
        f.born = t;
        f.life = rnd(6, 10);
        f.cell = cellOf(pick(HALO));
      }
      const a = -haloAngle * 0.8 + f.offset * TAU;
      const r = (1.32 + 0.08 * Math.sin(t * 0.9 + f.wobble)) * haloScale;
      const alpha = envelope(age, 0, f.life, 0.8) * 0.95;
      sprites.push(halo.position.x + Math.cos(a) * r, halo.position.y + Math.sin(a) * r * 0.92 + 0.05 * Math.sin(t * 1.3 + f.wobble), halo.position.z + 0.1, 0.26 * haloScale, f.cell, alpha, Math.sin(t * 0.8 + f.wobble) * 0.3);
    }
  }

  function updateGenerating(t: number, dt: number) {
    gen.presence += ((mood === 'generating' ? 1 : 0) - gen.presence) * damp(dt, mood === 'generating' ? 3 : 5);
    gen.group.visible = gen.presence > 0.01;
    gen.pen.visible = false;
    aimWeight += ((mood === 'generating' || mood === 'printing' ? 1 : 0) - aimWeight) * damp(dt, 4);
    if (!gen.group.visible) return;
    const ct = t - gen.start;
    const traceEnd = GEN.appear + gen.dur;
    const fillEnd = traceEnd + GEN.fill;
    const flyStart = fillEnd + GEN.hold;
    const appear = easeOutBack(seg(ct, 0, GEN.appear));
    const progress = seg(ct, GEN.appear, traceEnd);
    const fill = seg(ct, traceEnd, fillEnd);
    const fly = easeInOut(seg(ct, flyStart, flyStart + GEN.fly));

    const page = pages[gen.page];
    page.mesh.getWorldPosition(page4);
    gen.group.position.lerpVectors(SHEET_POS, page4, fly);
    gen.group.position.y += Math.sin(t * 1.4) * 0.04 * (1 - fly);
    gen.group.rotation.set(Math.sin(t * 0.9) * 0.04, -0.28 * (1 - fly), Math.sin(t * 0.7) * 0.03);
    gen.group.scale.setScalar(Math.max(0.01, (0.55 + 0.45 * appear) * (1 - fly * 0.69) * (0.6 + 0.4 * gen.presence)));
    gen.mat.uniforms.uAlpha.value = Math.min(gen.presence, seg(ct, 0, 0.3));
    gen.mat.uniforms.uReveal.value = smooth(fill);
    gen.mat.uniforms.uGlow.value = bump(fill, 0.6, 1) * 0.8;
    gen.traceMat.uniforms.uProgress.value = progress;
    gen.traceMat.uniforms.uOpacity.value = Math.min(gen.presence, 1 - 0.55 * fill) * (1 - fly);

    if (mood !== 'generating') return;
    if (progress > 0 && progress < 1) {
      const p = penAt(gen.samples, progress);
      gen.group.localToWorld(tmp.set(p.x, p.y, 0.03));
      aimAt.copy(tmp);
      gen.pen.visible = true;
      gen.pen.position.copy(tmp);
      gen.pen.scale.setScalar(0.32 + Math.sin(t * 20) * 0.04);
      if (Math.random() < dt * 65) sparkTo(micPos, tmp, rnd(0.25, 0.4), 0.25, rnd(0.08, 0.14));
      if (Math.random() < dt * 14) spark(tmp, tmp2.set(rnd(-0.3, 0.3), rnd(-0.4, 0.1), rnd(0, 0.3)), { life: rnd(0.4, 0.8), size: rnd(0.05, 0.1), grav: 0.6 });
    } else if (ct < traceEnd) {
      gen.group.localToWorld(aimAt.set(0, 0, 0));
    } else if (fill > 0 && fill < 1) {
      aimAt.copy(gen.group.position);
      if (Math.random() < dt * 60) {
        gen.group.localToWorld(tmp.set(rnd(-0.55, 0.55), rnd(-0.55, 0.55), 0.03));
        sparkTo(micPos, tmp, rnd(0.45, 0.7), 0.35);
      }
    } else aimAt.copy(gen.group.position);
    if (ct > flyStart + GEN.fly) {
      swapPage(page, gen.name);
      page.pop = t;
      page.erase = -1;
      for (let i = 0; i < 14; i++) spark(page4, tmp.set(rnd(-0.8, 0.8), rnd(-0.8, 0.8), rnd(0, 0.4)), { life: 0.8 });
      newDrawing(t);
    }
  }

  function updatePrinting(t: number, dt: number) {
    print.presence += ((mood === 'printing' ? 1 : 0) - print.presence) * damp(dt, 4);
    star.visible = false;
    if (print.presence < 0.01 && sheets.length) {
      for (const s of sheets) scene.remove(s.mesh);
      sheets.length = 0;
    }
    sheetMat.uniforms.uAlpha.value = print.presence;
    const apex = tmp2.set(final.x + 0.95, 1.95, 0.55);
    if (mood === 'printing') {
      const st = t - moodStart;
      const c = Math.floor(st / PRINT_CYCLE);
      const pt = st - c * PRINT_CYCLE;
      if (c !== print.cycle) {
        print.cycle = c;
        print.burst = false;
      }
      aimAt.copy(apex);
      if (pt < 0.62) {
        rig.handFree.getWorldPosition(tmp);
        star.position.copy(tmp).add(tmp.set(0, 0.1, 0.12));
        star.scale.setScalar(Math.max(0.01, easeOutBack(seg(pt, 0.05, 0.35))));
        star.rotation.set(0, Math.sin(t * 3) * 0.4, Math.sin(t * 2) * 0.2);
        star.visible = true;
        print.release.copy(star.position);
      } else if (pt < 1.6) {
        const u = seg(pt, 0.62, 1.6);
        const k = 1 - (1 - u) ** 2;
        bezier(star.position, print.release, tmp.set((print.release.x + apex.x) / 2, apex.y + 0.75, 0.6), apex, k);
        star.rotation.set(u * 3, u * 5, u * 9);
        star.scale.setScalar(1 + 0.3 * u);
        star.visible = true;
        if (Math.random() < dt * 30) spark(star.position, tmp.set(rnd(-0.2, 0.2), rnd(-0.6, -0.2), 0), { life: 0.6, size: 0.08 });
      } else if (!print.burst) {
        print.burst = true;
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * TAU;
          spark(apex, tmp.set(Math.cos(a) * rnd(1.2, 2.2), Math.sin(a) * rnd(1.2, 2.2), rnd(-0.2, 0.4)), { life: rnd(0.6, 1.1), drag: 3 });
        }
        confetti(apex, 6, 0.6, ['star', 'sparkle', 'heart']);
        const mesh = new THREE.Mesh(sheetGeo, sheetMat);
        mesh.renderOrder = 1;
        scene.add(mesh);
        sheets.push({ mesh, born: t, n: print.stack++, from: apex.clone() });
        if (sheets.length > MAX_SHEETS) scene.remove(sheets.shift()!.mesh);
      }
    }
    for (const s of sheets) {
      const a = t - s.born;
      const n = s.n % MAX_SHEETS;
      const rest = tmp.set(1.42 + ((n * 37) % 5) * 0.012, -0.52 + n * 0.024, 0.5 + n * 0.006);
      if (a < 0.4) {
        s.mesh.position.copy(s.from);
        s.mesh.scale.setScalar(Math.max(0.01, easeOutBack(a / 0.4)));
        s.mesh.rotation.set(0, (1 - a / 0.4) * Math.PI, 0);
      } else {
        const u = easeInOut(seg(a, 0.4, 2.3));
        bezier(s.mesh.position, s.from, tmp2.set(1.9, 1.3, 0.8), rest, u);
        s.mesh.position.x += Math.sin(a * 3.2) * 0.22 * (1 - u);
        s.mesh.scale.setScalar(1);
        s.mesh.rotation.set(Math.sin(a * 3) * 0.4 * (1 - u), Math.sin(a * 2.3) * 0.3 * (1 - u), Math.sin(a * 4) * 0.35 * (1 - u) + (((n * 3) % 5) - 2) * 0.03 * u);
        if (mood === 'printing' && u < 1 && u > 0) {
          aimAt.copy(s.mesh.position);
          if (Math.random() < dt * 18) sparkTo(micPos, s.mesh.position, rnd(0.3, 0.5), 0.2);
        }
      }
    }
  }

  function updateEarsAndOrbit(t: number, dt: number) {
    rig.head.getWorldPosition(headPos);
    for (let i = ears.length - 1; i >= 0; i--) {
      const ear = ears[i];
      const a = (t - ear.born) / 1.1;
      if (a >= 1) {
        ears.splice(i, 1);
        continue;
      }
      const x = headPos.x + ear.side * (1.45 - 0.62 * smooth(a));
      sprites.push(x, headPos.y + ear.y, headPos.z + 0.25, ear.size * (1 - 0.3 * a), cellOf('waves'), bump(a, 0, 1) * (mood === 'listening' ? 1 : 0.5), ear.side * 0.15, -ear.side);
    }

    orbitPresence += ((mood === 'thinking' ? 1 : 0) - orbitPresence) * damp(dt, 3);
    if (orbitPresence > 0.01) {
      THINKING.forEach((name, i) => {
        const ring = i % 3;
        const tilt = [0.75, -0.6, 0.9][ring];
        const r = [1.3, 1.42, 1.18][ring] * (0.7 + 0.3 * orbitPresence);
        const a = t * [1.1, -0.85, 1.4][ring] + (i / THINKING.length) * TAU;
        const x = Math.cos(a) * r;
        const z0 = Math.sin(a) * r;
        const y = -Math.sin(tilt) * z0 * 0.6 + 0.12;
        const z = Math.cos(tilt) * z0;
        sprites.push(headPos.x + x, headPos.y + y, headPos.z + z, 0.25, cellOf(name), orbitPresence * (z < 0 ? 0.8 : 1), t * 1.5 + i);
      });
    }
  }

  function updateParticles(dt: number) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) {
        sparks.splice(i, 1);
        continue;
      }
      const k = s.age / s.life;
      if (s.path) bezier(s.p, s.path[0], s.path[1], s.path[2], smooth(k));
      else {
        s.v.y -= s.grav * dt;
        s.v.multiplyScalar(Math.exp(-s.drag * dt));
        s.p.addScaledVector(s.v, dt);
      }
      const alpha = Math.min(1, s.age / 0.1) * (1 - smooth(seg(k, s.path ? 0.75 : 0.4, 1)));
      sparkBatch.push(s.p.x, s.p.y, s.p.z, s.color, s.size * (s.path ? 1 - 0.5 * k : 1), alpha);
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.age += dt;
      if (b.age >= b.life) {
        bits.splice(i, 1);
        continue;
      }
      b.v.y -= 3.1 * dt;
      b.v.multiplyScalar(Math.exp(-1.1 * dt));
      if (b.v.y < -1.2) b.v.y = -1.2;
      b.p.addScaledVector(b.v, dt);
      b.rot += b.spin * dt;
      const flip = Math.cos(b.flip + b.age * b.flipSpeed);
      const alpha = Math.min(1, b.age / 0.08) * (1 - smooth(seg(b.age, b.life - 0.6, b.life)));
      const rot = b.rot + Math.sin(b.age * 3 + b.sway) * 0.25;
      sprites.push(b.p.x + Math.sin(b.age * 2.5 + b.sway) * 0.12, b.p.y, b.p.z, b.size, b.cell, alpha, rot, Math.max(0.2, Math.abs(flip)));
    }
  }

  // --- Frame loop -------------------------------------------------------------
  const anchor: PixiAnchor = { crestX: 0, crestY: 0, headX: 0, headY: 0, unit: 1, width: 1, height: 1 };
  const crestTop = new THREE.Vector3();
  const headEdge = new THREE.Vector3();
  const unitEnd = new THREE.Vector3();
  function toScreen(v: THREE.Vector3) {
    v.project(camera);
    v.set((v.x + 1) * 0.5 * anchor.width, (1 - v.y) * 0.5 * anchor.height, 0);
    return v;
  }
  function reportAnchor() {
    if (!opts.onAnchor) return;
    rig.headAnchors(crestTop, headEdge);
    unitEnd.copy(crestTop).x += 1;
    toScreen(crestTop);
    toScreen(headEdge);
    toScreen(unitEnd);
    anchor.crestX = crestTop.x;
    anchor.crestY = crestTop.y;
    anchor.headX = headEdge.x;
    anchor.headY = headEdge.y;
    anchor.unit = unitEnd.x - crestTop.x;
    opts.onAnchor(anchor);
  }

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    anchor.width = w;
    anchor.height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    sparkBatch.material.uniforms.uScale.value = (h * pixelRatio) / (2 * TAN);
    shared.uPx.value = pixelRatio;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  let last = performance.now();
  let raf = 0;
  let slowFrames = 0;
  let frames = 0;
  let stillSlow = 0;
  let paused = false;

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    time += dt;
    const t = time;
    const st = t - moodStart;

    // Lower the resolution if the kiosk computer can't keep up.
    if (quality === 'auto') {
      frames++;
      if (dt > 1 / 36) slowFrames++;
      if (frames >= 90) {
        if (slowFrames > 45 && pixelRatio > 0.6) {
          pixelRatio = Math.max(0.6, pixelRatio * 0.8);
          renderer.setPixelRatio(pixelRatio);
          resize();
        } else if (slowFrames > 60 && pixelRatio <= 0.6) {
          // Under ~25 fps at the lowest resolution for three windows in a row.
          if (++stillSlow === 3) opts.onTooSlow?.();
        } else stillSlow = 0;
        frames = slowFrames = 0;
      }
    }

    const boil = Math.floor(t * 6) % 3;
    shared.uTime.value = t;
    shared.uSeed.value = boil * 1.7 + 0.3;
    shared.uBoil.value.set([0, 0.37, 0.71][boil], [0, 0.53, 0.19][boil]);

    const level = clamp01(typeof levelSource === 'function' ? levelSource() : levelSource);
    levelSmooth += (level - levelSmooth) * damp(dt, level > levelSmooth ? 18 : 5);

    // Pose: ease toward the mood's base pose, then add this moment's motion.
    const base = BASE[mood];
    for (const k of KEYS) pose[k] += ((base[k] ?? REST[k]) - pose[k]) * damp(dt, 5);
    extras = zero();
    moodExtras(extras, t, st, dt);
    const fade = 1 - smooth(seg(t, fadeStart, fadeStart + 0.5));
    const enter = smooth(seg(st, 0, 0.35));
    for (const k of KEYS) final[k] = pose[k] + extras[k] * enter + fading[k] * fade;

    // Floating, swaying and blinking, in every mood.
    final.y += 0.065 * Math.sin(t * 2) * (mood === 'generating' ? 0.6 : 1);
    final.lean += 0.04 * Math.sin(t * 0.8);
    final.legSwing = 0.12;
    if (t > nextBlink) {
      blinkAt = t;
      doubleBlink = Math.random() < 0.25;
      nextBlink = t + rnd(2.2, 5);
    }
    const b = t - blinkAt;
    final.blink = 1 - bump(b, 0, 0.16) - (doubleBlink ? bump(b, 0.24, 0.4) : 0);

    // Point the wand at whatever it is drawing or sending.
    rig.handWand.getWorldPosition(handPos);
    if (aimWeight > 0.01) {
      const want = Math.atan2(-(aimAt.x - handPos.x), aimAt.y - handPos.y) - final.wandArm - final.lean;
      aimWrist += (want - aimWrist) * damp(dt, 8);
      final.wrist += (aimWrist - final.wrist) * aimWeight * 0.85;
    } else aimWrist = final.wrist;

    rig.apply(final, t, boil);
    rig.micWorld(micPos);

    updateHalo(t, dt);
    updateGenerating(t, dt);
    updatePrinting(t, dt);
    updateEarsAndOrbit(t, dt);
    updateParticles(dt);

    const height = Math.max(0, final.y) / 0.6;
    shadow.position.x = final.x;
    shadow.scale.set(1.5 * (1 - 0.3 * height), 0.34 * (1 - 0.3 * height), 1);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - 0.45 * height);

    // Camera: fit this mood's box on screen, whatever the shape of the canvas,
    // with room above for the thought bubble when there is one.
    const goal = FRAME[mood];
    const extra = extraTop(goal);
    const f = damp(dt, 2.2);
    frame.cx += (goal.cx - frame.cx) * f;
    frame.cy += (goal.cy + extra / 2 - frame.cy) * f;
    frame.w += (goal.w - frame.w) * f;
    frame.h += (goal.h + extra - frame.h) * f;
    const dist = Math.max(frame.h / 2 / TAN, frame.w / 2 / (TAN * camera.aspect));
    camera.position.set(frame.cx, frame.cy + 0.12, dist);
    camera.lookAt(frame.cx, frame.cy, 0);

    sprites.flush();
    sparkBatch.flush();
    renderer.render(scene, camera);
    reportAnchor();
  }
  raf = requestAnimationFrame(tick);

  return {
    setMood,
    setLevel(v) {
      levelSource = v;
    },
    setWish(text) {
      wishDoodle = doodleForWish(text);
    },
    setHeadroom(px) {
      headroomPx = Math.max(0, px);
    },
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      cancelAnimationFrame(raf);
      if (!p) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    setPicture(url) {
      if (!url) {
        picture = null;
        drawPictures();
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        picture = img;
        drawPictures();
      };
      img.src = url;
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      rig.dispose();
      if (gen.trace) gen.trace.geometry.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
      for (const tex of textures) tex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Draws an image to fill the box, cropping the overflow (like CSS cover).
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth || w;
  const ih = img.naturalHeight || h;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}
