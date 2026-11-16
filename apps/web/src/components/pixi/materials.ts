import * as THREE from 'three';
import { seeded } from './doodles';

// Materials for the Pixi animation. Everything is drawn in a crayon style:
// shading and outlines are textured with a paper grain that "boils" (shifts a
// few times a second) like hand-drawn animation. Colors are used as written
// (color management is switched off for this scene), so hex values here
// match the WishPix palette exactly.

export const PALETTE = {
  sky: '#5CC8FF',
  sun: '#FFD93D',
  purple: '#A98CF3',
  mint: '#6DECB9',
  pink: '#FF9EC9',
  white: '#FFFFFF',
  line: '#7262E6', // Pixi's crayon outline
  eye: '#3F368F',
};
export const SPARK_COLORS = [PALETTE.sky, PALETTE.sun, PALETTE.purple, PALETTE.mint, '#FFFFFF', PALETTE.pink];

export type Shared = {
  uTime: { value: number };
  uBoil: { value: THREE.Vector2 };
  uSeed: { value: number };
  uGrain: { value: THREE.Texture };
  uLight: { value: THREE.Vector3 };
  uPx: { value: number };
};

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// R: paper grain, G: crayon hatching. Tiles seamlessly.
export function grainTexture() {
  const s = 256;
  const rand = seeded(5);
  const hatch = document.createElement('canvas');
  hatch.width = hatch.height = s;
  const h = hatch.getContext('2d')!;
  h.strokeStyle = '#fff';
  h.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const len = 10 + rand() * 26;
    h.globalAlpha = 0.5 + rand() * 0.5;
    h.lineWidth = 1.2 + rand() * 2;
    for (const ox of [-s, 0, s])
      for (const oy of [-s, 0, s]) {
        h.beginPath();
        h.moveTo(x + ox, y + oy);
        h.lineTo(x + ox + len * 0.5, y + oy - len * 0.87);
        h.stroke();
      }
  }
  const hatchData = h.getImageData(0, 0, s, s).data;
  const g = 32;
  const low = Array.from({ length: g * g }, () => rand());
  const lowAt = (x: number, y: number) => low[(((y % g) + g) % g) * g + (((x % g) + g) % g)];
  const tex = canvasTexture(s, s, (ctx) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const fx = (x / s) * g;
        const fy = (y / s) * g;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const v =
          (lowAt(ix, iy) * (1 - tx) + lowAt(ix + 1, iy) * tx) * (1 - ty) + (lowAt(ix, iy + 1) * (1 - tx) + lowAt(ix + 1, iy + 1) * tx) * ty;
        const k = (y * s + x) * 4;
        img.data[k] = Math.round((v * 0.55 + rand() * 0.45) * 255);
        img.data[k + 1] = hatchData[k + 3];
        img.data[k + 2] = Math.round(rand() * 255);
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export const glowTexture = () =>
  canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });

const color = (c: string) => new THREE.Color(c);
const GRAIN = /* glsl */ `
  uniform sampler2D uGrain;
  uniform vec2 uBoil;
  uniform float uPx;
  vec4 grain(float scale) { return texture2D(uGrain, gl_FragCoord.xy / (scale * uPx) + uBoil); }
`;

// Soft crayon shading: two tones split by a grainy edge, hatching in the
// shadow, a pastel rainbow rim (the "glowing sketch" accent) and an optional glow.
export function skinMaterial(shared: Shared, base: string, shade: string, opts: { rim?: number; glow?: string } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: color(base) },
      uShade: { value: color(shade) },
      uRim: { value: opts.rim ?? 1 },
      uGlow: { value: 0 },
      uGlowColor: { value: color(opts.glow ?? '#FFFFFF') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uShade, uLight, uGlowColor;
      uniform float uRim, uGlow, uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      ${GRAIN}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(-vView);
        vec4 g = grain(230.0);
        float d = dot(n, uLight) * 0.5 + 0.5;
        float lit = smoothstep(0.4, 0.47, d + (g.r - 0.5) * 0.16);
        vec3 col = mix(uShade, uColor, lit);
        col = mix(col, uShade * 0.9, (1.0 - lit) * step(0.5, g.g) * 0.55);
        col = mix(col, vec3(1.0), smoothstep(0.88, 0.92, d + (g.r - 0.5) * 0.05) * 0.45);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
        vec3 rainbow = 0.55 + 0.45 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + vView.y * 0.22 + vView.x * 0.08 + uTime * 0.04));
        col += rim * mix(vec3(1.0), rainbow, 0.65) * 0.5 * uRim;
        col += uGlowColor * uGlow * (0.25 + rim * 0.9);
        col *= 0.95 + 0.07 * g.r;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// The crayon outline: the back faces pushed out a little, with a width that
// wobbles over the surface and changes with each boil step.
export function outlineMaterial(shared: Shared, width = 0.022, line = PALETTE.line) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uWidth: { value: width }, uColor: { value: color(line) } },
    vertexShader: /* glsl */ `
      uniform float uWidth, uSeed;
      void main() {
        vec3 p = position;
        float s = uSeed;
        float wob = 0.5 + 0.25 * sin(p.x * 7.1 + p.z * 3.0 + s * 1.7) + 0.25 * sin(p.y * 8.3 + p.x * 2.0 - s * 2.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        mv.xyz += n * uWidth * (0.45 + 1.1 * wob);
        mv.xy += vec2(sin(p.y * 11.0 + s * 3.1), cos(p.x * 13.0 + s * 2.7)) * uWidth * 0.18;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      ${GRAIN}
      void main() {
        vec4 g = grain(160.0);
        gl_FragColor = vec4(uColor * (0.88 + 0.24 * g.r), 1.0);
      }`,
    side: THREE.BackSide,
  });
}

// Ribbons drawn like crayon (uGlow 0) or as glowing magic lines (uGlow 1).
// aU runs 0..1 along the whole drawing (uProgress draws it on), aV -1..1 across.
export function strokeMaterial(shared: Shared, opts: { glow?: boolean; opacity?: number; dash?: number } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uProgress: { value: 1 },
      uOpacity: { value: opts.opacity ?? 1 },
      uGlow: { value: opts.glow ? 1 : 0 },
      uDash: { value: opts.dash ?? 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aU, aV;
      varying vec3 vColor;
      varying float vU, vV;
      void main() {
        vColor = aColor;
        vU = aU;
        vV = aV;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uProgress, uOpacity, uGlow, uDash;
      varying vec3 vColor;
      varying float vU, vV;
      ${GRAIN}
      void main() {
        if (vU > uProgress) discard;
        if (uDash > 0.0 && fract(vU * uDash) > 0.62) discard;
        float edge = 1.0 - abs(vV);
        vec4 g = grain(140.0);
        float crayon = smoothstep(0.0, 0.35, edge) * (0.72 + 0.4 * g.r);
        vec3 col = vColor;
        float a = crayon;
        if (uGlow > 0.5) {
          float core = smoothstep(0.55, 0.92, edge);
          float body = smoothstep(0.25, 0.6, edge);
          float head = smoothstep(uProgress - 0.04, uProgress, vU) * step(uProgress, 0.999);
          col = mix(vColor, vec3(1.0), clamp(core * 0.8 + head * 0.6, 0.0, 1.0));
          a = max(edge * edge * 0.45, body);
        }
        a *= uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// Paper for the halo pages, the drawing sheet and the worksheets. Shows one
// atlas cell (or a whole texture) revealed by a wobbly diagonal wipe.
export function pageMaterial(shared: Shared, map: THREE.Texture, opts: { lined?: boolean; zoom?: [number, number] } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uMap: { value: map },
      uCell: { value: new THREE.Vector4(0, 0, 1, 1) },
      uZoom: { value: new THREE.Vector2(...(opts.zoom ?? [1, 1])) },
      uReveal: { value: 1 },
      uLined: { value: opts.lined ? 1 : 0 },
      uAlpha: { value: 1 },
      uCurl: { value: 0.06 },
      uGlow: { value: 0 },
      uPaper: { value: color('#FFFDF4') },
    },
    vertexShader: /* glsl */ `
      uniform float uCurl;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float c = uv.x - 0.5;
        p.z -= uCurl * c * c * 4.0 - uCurl * (uv.y - 0.5) * (uv.y - 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec4 uCell;
      uniform vec2 uZoom;
      uniform float uReveal, uLined, uAlpha, uGlow;
      uniform vec3 uPaper;
      varying vec2 vUv;
      ${GRAIN}
      void main() {
        vec2 q = abs(vUv - 0.5) * 2.0;
        vec2 k = max(q - 0.88, 0.0);
        if (length(k) > 0.12) discard;
        vec4 g = grain(200.0);
        vec3 col = uPaper * (0.95 + 0.06 * g.r);
        if (uLined > 0.5) {
          float ly = abs(fract(vUv.y * 8.0) - 0.5);
          col = mix(col, vec3(0.72, 0.86, 1.0), smoothstep(0.06, 0.0, ly) * 0.55 * step(0.1, vUv.y) * step(vUv.y, 0.9));
          col = mix(col, vec3(1.0, 0.7, 0.85), smoothstep(0.012, 0.0, abs(vUv.x - 0.15)) * 0.6);
        }
        float border = smoothstep(0.86, 0.95, max(q.x, q.y));
        col = mix(col, vec3(0.8, 0.84, 0.96), border * 0.45);
        if (gl_FrontFacing) {
          vec2 cu = 0.5 + (vUv - 0.5) * uZoom;
          if (cu.x > 0.0 && cu.x < 1.0 && cu.y > 0.0 && cu.y < 1.0) {
            vec4 d = texture2D(uMap, uCell.xy + cu * uCell.zw);
            float w = (vUv.x * 0.8 + (1.0 - vUv.y) * 0.6) / 1.4 + (g.r - 0.5) * 0.1;
            float m = smoothstep(w - 0.06, w, uReveal * 1.12 - 0.04);
            col = mix(col, d.rgb / max(d.a, 0.001), d.a * m);
          }
        } else {
          col *= 0.93;
        }
        col += vec3(1.0, 0.95, 0.7) * uGlow * 0.35;
        gl_FragColor = vec4(col, uAlpha);
      }`,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

// The see-through microphone head: clear in the middle, glowing at the rim.
export function glassMaterial(shared: Shared) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uGlow: { value: 0 }, uTint: { value: color('#BDEBFF') } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform float uGlow;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        float rim = pow(1.0 - abs(dot(n, normalize(-vView))), 2.0);
        float spot = smoothstep(0.82, 0.95, dot(n, normalize(vec3(-0.4, 0.6, 0.7))));
        vec3 col = mix(uTint, vec3(1.0), rim * 0.5 + spot);
        col = mix(col, vec3(1.0, 0.93, 0.55), uGlow * 0.35);
        float a = 0.16 + rim * 0.62 + spot * 0.7 + uGlow * 0.12;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
  });
}

// Many doodles from the atlas in one draw call (confetti, floaters, orbiters).
export class SpriteBatch {
  mesh: THREE.InstancedMesh;
  private cell: THREE.InstancedBufferAttribute;
  private alpha: THREE.InstancedBufferAttribute;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(atlas: THREE.Texture, grid: [number, number], private max: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.cell = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.cell.setUsage(THREE.DynamicDrawUsage);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCell', this.cell);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas }, uGrid: { value: new THREE.Vector2(...grid) } },
      vertexShader: /* glsl */ `
        attribute float aCell, aAlpha;
        uniform vec2 uGrid;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          float col = mod(aCell, uGrid.x);
          float row = floor(aCell / uGrid.x + 0.001);
          vUv = vec2((col + uv.x) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y);
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vec4 c = texture2D(uMap, vUv);
          if (c.a * vAlpha < 0.01) discard;
          gl_FragColor = c * vAlpha;
        }`,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  // flip squashes the sprite sideways (-1..1), like a card turning over.
  push(x: number, y: number, z: number, size: number, cell: number, alpha: number, rot = 0, flip = 1, tilt = 0) {
    if (this.n >= this.max || alpha <= 0.005 || size <= 0) return;
    this.e.set(tilt, 0, rot);
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(size * flip, size, 1));
    this.mesh.setMatrixAt(this.n, this.m);
    this.cell.setX(this.n, cell);
    this.alpha.setX(this.n, Math.min(1, alpha));
    this.n++;
  }

  flush() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cell.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.n = 0;
  }
}

// Soft glowing dots with a little four-point glint.
export class SparkBatch {
  points: THREE.Points;
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;
  private alpha: THREE.BufferAttribute;
  private n = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(private max: number) {
    const geo = new THREE.BufferGeometry();
    const attr = (name: string, k: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(max * k), k);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.pos = attr('position', 3);
    this.col = attr('aColor', 3);
    this.size = attr('aSize', 1);
    this.alpha = attr('aAlpha', 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize, aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float r = length(p) * 2.0;
          float core = smoothstep(0.32, 0.0, r);
          float halo = pow(max(0.0, 1.0 - r), 2.0);
          float rays = max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y) * 2.2)
                     + max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x) * 2.2);
          vec3 col = mix(vColor, vec3(1.0), clamp(core + rays * 0.5, 0.0, 1.0) * 0.8);
          float a = clamp(halo * 0.75 + core + rays * 0.8, 0.0, 1.0) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  push(x: number, y: number, z: number, c: THREE.Color, size: number, alpha: number) {
    if (this.n >= this.max || alpha <= 0.005) return;
    const i = this.n++;
    this.pos.setXYZ(i, x, y, z);
    this.col.setXYZ(i, c.r, c.g, c.b);
    this.size.setX(i, size);
    this.alpha.setX(i, Math.min(1, alpha));
  }

  flush() {
    this.points.geometry.setDrawRange(0, this.n);
    for (const a of [this.pos, this.col, this.size, this.alpha]) a.needsUpdate = true;
    this.n = 0;
  }
}
