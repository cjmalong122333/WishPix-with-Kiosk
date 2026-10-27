// WishPix "Listening to your wish": Pixi hears a child speaking and gathers the
// words into a wish jar. Four states, each a seamless 4-second loop that the app
// can hold as long as it needs:
//   idle      Pixi floats, blinks and cups a hand to its ear.
//   listening sound bubbles float in to the beat of the voice and drop into the jar.
//   thinking  the jar swirls with rainbow light; Pixi taps its chin under candy gears.
//   done      the jar pops into confetti that gathers into a picture of the wish,
//             then Pixi bounces, spins and gives a thumbs-up and a wink.
// States blend into each other. Motion stays gentle: no flashing, no fast cuts.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  TAU, FOV, TAN, PALETTE, CONFETTI_COLORS, ARM_REST,
  clamp01, lerp, seg, smooth, easeOutCubic, easeInOutSine, easeOutBack, bump, envelope, wobble,
  seededRandom, pillowStar, ringTexture, pointCloud, markDirty, sparklePool,
  createSky, addLights, createStarField, cloudMaker, createPixi,
} from './pixiKit.js'

export const LISTEN_STATES = ['idle', 'listening', 'thinking', 'done']
export const LOOP_SECONDS = 4 // every looping motion repeats on this beat
export const DONE_SECONDS = 5 // the "got it!" moment, before it settles into a held loop
export const WISH_SHAPES = ['heart', 'star', 'cat', 'flower', 'rainbow']

const L4 = LOOP_SECONDS
const BLEND = 0.7
const PIXI_POS = new THREE.Vector3(0, 0.25, 0)
const JAR_POS = new THREE.Vector3(-1.2, -0.74, 0.3)
const JAR_TOP = 0.42
const SHAPE_Y = 2.72
const SHAPE_SIZE = 1.9
const BUBBLE_MAX = 40
const CAUGHT_MAX = 14
const SHAPE_DOTS = 380

// The box the camera must show: Pixi, the jar and the thinking props (top =
// TOP_CLOSE), or also the wish picture above them (top = TOP_DONE).
const TOP_CLOSE = 2.75
const TOP_DONE = SHAPE_Y + SHAPE_SIZE / 2 + 0.15
function computeLayout(aspect, top) {
  const halfW = 2.05
  const bottom = JAR_POS.y - 0.7
  const halfH = ((top - bottom) / 2) * 1.06
  const d = Math.max(halfH / TAN, halfW / (TAN * aspect))
  const visH = 2 * d * TAN
  const lookY = (top + bottom) / 2
  return { d, visH, visW: visH * aspect, lookY, bottom: lookY - visH / 2 }
}

// A pretend voice for previews and video: two short phrases with syllables,
// repeating every 4 seconds so recordings loop cleanly.
function simulatedVoice(t) {
  const p = ((t % L4) + L4) % L4
  const phrase = envelope(p, 0.1, 1.75, 0.18) + envelope(p, 2.15, 3.65, 0.18)
  const syllables = Math.abs(Math.sin(TAU * 3 * p) * (0.6 + 0.4 * Math.sin(TAU * 0.75 * p + 1)))
  return clamp01(phrase * (0.2 + 0.8 * syllables))
}

// --- Materials and shapes ---------------------------------------------------

// Soap-bubble glass: nearly clear in the middle, a pastel rainbow rim and one soft shine.
function bubbleMaterial(tint) {
  return new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color(tint) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec3 vN, vV, vTint;
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = uTint;
        #endif
        vec4 mv = modelViewMatrix * p;
        vN = normalize(normalMatrix * n);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vN, vV, vTint;
      void main() {
        vec3 n = normalize(vN);
        float f = 1.0 - abs(dot(n, normalize(vV)));
        float rim = pow(f, 2.2);
        vec3 rainbow = 0.62 + 0.38 * cos(6.2832 * (f * 1.3 + vec3(0.0, 0.33, 0.67)));
        float shine = pow(max(0.0, dot(n, normalize(vec3(-0.45, 0.6, 0.66)))), 36.0);
        vec3 c = mix(vTint, rainbow, 0.45 * rim) + shine;
        gl_FragColor = vec4(c, ((0.07 + 0.6 * rim) + shine * 0.8) * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

// Warm light inside the jar. Fill sets how high it reaches; swirl turns it into
// slowly turning rainbow bands, like a gentle mixing potion.
function potionMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uFill: { value: 0 }, uSwirl: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 1 } },
    vertexShader: 'varying vec3 vPos; varying vec3 vN, vV; void main() { vPos = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */ `
      uniform float uFill, uSwirl, uTime, uGlow;
      varying vec3 vPos;
      varying vec3 vN, vV;
      void main() {
        float h = (vPos.y + 0.38) / 0.67;
        float wave = 0.025 * sin(atan(vPos.z, vPos.x) * 3.0 + uTime * 1.5708);
        float filled = 1.0 - smoothstep(uFill - 0.05, uFill + 0.05, h + wave);
        float a = atan(vPos.z, vPos.x) / 6.2832;
        float hue = a + h * 0.8 - uTime * 0.25;
        vec3 rainbow = 0.6 + 0.4 * cos(6.2832 * (hue + vec3(0.0, 0.33, 0.67)));
        vec3 warm = vec3(1.0, 0.86, 0.58);
        vec3 c = mix(warm, rainbow, 0.2 + 0.8 * uSwirl);
        float edge = 0.55 + 0.45 * (1.0 - abs(dot(normalize(vN), normalize(vV))));
        gl_FragColor = vec4(c * uGlow * edge, filled * 0.45);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

function heartGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, -0.9)
  s.bezierCurveTo(-0.9, -0.3, -1.1, 0.35, -0.6, 0.7)
  s.bezierCurveTo(-0.25, 0.9, 0, 0.65, 0, 0.42)
  s.bezierCurveTo(0, 0.65, 0.25, 0.9, 0.6, 0.7)
  s.bezierCurveTo(1.1, 0.35, 0.9, -0.3, 0, -0.9)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.2, bevelSegments: 5, curveSegments: 24 })
  geo.center()
  geo.scale(0.85, 0.85, 0.85)
  return geo
}

function noteGeometry() {
  const head = new THREE.SphereGeometry(0.42, 24, 16)
  head.scale(1.2, 0.85, 0.8)
  head.rotateZ(0.35)
  head.translate(-0.25, -0.55, 0)
  const stem = new THREE.CylinderGeometry(0.09, 0.09, 1.3, 12)
  stem.translate(0.2, 0.05, 0)
  const flag = new THREE.CapsuleGeometry(0.1, 0.45, 6, 12)
  flag.rotateZ(-1.0)
  flag.translate(0.42, 0.55, 0)
  const geo = mergeGeometries([head.toNonIndexed(), stem.toNonIndexed(), flag.toNonIndexed()])
  geo.computeVertexNormals()
  return geo
}

// A candy gear: round teeth, a glossy body and a hole in the middle.
function gearGeometry(teeth, outer, inner) {
  const s = new THREE.Shape()
  const n = teeth * 24
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU
    const k = smooth(clamp01((0.5 + 0.5 * Math.cos(teeth * a) - 0.3) / 0.4))
    const r = inner + (outer - inner) * k
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const hole = new THREE.Path()
  hole.absarc(0, 0, inner * 0.3, 0, TAU, true)
  s.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 12 })
  geo.center()
  return geo
}

// The picture the sparkles gather into. Drawn in color; each dot takes the
// color under it. A stand-in until the app shows the real generated picture.
function drawWishShape(name) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.lineJoin = 'round'
  if (name === 'star') {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2
      const r = i % 2 ? 50 : 112
      ctx.lineTo(128 + Math.cos(a) * r, 136 + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fillStyle = ctx.strokeStyle = '#ffd25e'
    ctx.lineWidth = 18
    ctx.fill()
    ctx.stroke()
  } else if (name === 'cat') {
    ctx.fillStyle = ctx.strokeStyle = '#ffb27a'
    ctx.lineWidth = 14
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(128 + side * 82, 120)
      ctx.lineTo(128 + side * 70, 34)
      ctx.lineTo(128 + side * 18, 78)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(128, 145, 92, 80, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ff9cc4'
    ctx.beginPath()
    ctx.ellipse(128, 165, 13, 9, 0, 0, TAU)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    for (const x of [92, 164]) {
      ctx.beginPath()
      ctx.arc(x, 136, 17, 0, TAU)
      ctx.fill()
    }
  } else if (name === 'flower') {
    ctx.fillStyle = '#ff9ccc'
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU
      ctx.beginPath()
      ctx.arc(128 + Math.cos(a) * 64, 128 + Math.sin(a) * 64, 44, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = '#ffd25e'
    ctx.beginPath()
    ctx.arc(128, 128, 40, 0, TAU)
    ctx.fill()
  } else if (name === 'rainbow') {
    const bands = ['#ff8fb4', '#ffb27a', '#ffe07a', '#a6ecc6', '#9fd4ff', '#c9b8ff']
    ctx.lineCap = 'round'
    bands.forEach((c, i) => {
      ctx.strokeStyle = c
      ctx.lineWidth = 17
      ctx.beginPath()
      ctx.arc(128, 196, 112 - i * 15, Math.PI, 0)
      ctx.stroke()
    })
  } else {
    ctx.beginPath()
    ctx.moveTo(128, 226)
    ctx.bezierCurveTo(26, 156, 6, 92, 48, 54)
    ctx.bezierCurveTo(84, 22, 120, 40, 128, 74)
    ctx.bezierCurveTo(136, 40, 172, 22, 208, 54)
    ctx.bezierCurveTo(250, 92, 230, 156, 128, 226)
    ctx.fillStyle = '#ff8fc2'
    ctx.fill()
  }
  return canvas
}

function sampleWishShape(name, count, rng) {
  const canvas = drawWishShape(name)
  const data = canvas.getContext('2d').getImageData(0, 0, 256, 256).data
  const spots = []
  for (let y = 0; y < 256; y += 5) {
    for (let x = 0; x < 256; x += 5) {
      const i = (y * 256 + x) * 4
      if (data[i + 3] > 200) spots.push({ u: x / 256, v: y / 256, color: new THREE.Color(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255).convertSRGBToLinear() })
    }
  }
  const out = []
  for (let i = 0; i < count; i++) out.push(spots[Math.floor(rng() * spots.length)] ?? { u: 0.5, v: 0.5, color: new THREE.Color('#ffffff') })
  return out
}

// --- Poses ------------------------------------------------------------------

const POSE_KEYS = ['px', 'py', 'rotX', 'rotY', 'rotZ', 'q', 'raiseL', 'swingL', 'raiseR', 'swingR', 'reachR', 'smile', 'ooh',
  'browL', 'browR', 'lookX', 'lookY', 'eyes', 'blink', 'wink', 'thumb', 'tuck']

const basePose = (st) => ({
  px: 0, py: 0.07 * Math.sin((TAU * st) / L4), rotX: 0, rotY: 0, rotZ: 0.03 * Math.sin((TAU * st) / L4 + 1), q: 0,
  raiseL: -0.75, swingL: 0.05, raiseR: ARM_REST, swingR: 0, reachR: 1,
  smile: 1, ooh: 0, browL: 0, browR: 0, lookX: 0, lookY: 0, eyes: 1, blink: 0, wink: 0, thumb: 0, tuck: 0,
})

const loopT = (st) => ((st % L4) + L4) % L4
const blinkAt = (p, a) => bump(p, a, a + 0.18)

// Ready to listen: float, blink, then cup a hand to the ear with a curious tilt.
function idlePose(st) {
  const P = basePose(st)
  const p = loopT(st)
  const ear = envelope(p, 1.0, 3.7, 0.5)
  P.raiseR = lerp(ARM_REST, 1.6, ear) + 0.05 * ear * Math.sin(TAU * p)
  P.swingR = 0.3 * ear
  P.reachR = 1 + 0.6 * ear
  P.rotZ += -0.12 * ear
  P.rotY = -0.22 * ear
  P.lookX = 0.25 * ear
  P.browL = P.browR = 0.03 * ear
  P.smile = 1.05 + 0.05 * ear
  P.blink = blinkAt(p, 0.55)
  return P
}

// Listening: lean in with wide eyes, nod along, bounce to the voice.
function listeningPose(st, level) {
  const P = basePose(st)
  const p = loopT(st)
  P.raiseR = 1.55 + 0.05 * Math.sin(TAU * p)
  P.swingR = 0.3
  P.reachR = 1.55
  P.rotX = 0.12 + 0.06 * (0.4 + level) * Math.sin(TAU * st)
  P.rotZ += -0.08
  P.rotY = -0.12
  P.q = 0.035 * level * Math.sin(TAU * 2 * st)
  P.py += 0.03 * level * Math.abs(Math.sin(TAU * 2 * st))
  P.eyes = 1.1
  P.browL = P.browR = 0.045
  P.smile = 1.2 + 0.1 * level
  P.lookX = -0.35 + 0.15 * Math.sin((TAU * st) / L4)
  P.lookY = -0.25
  P.blink = blinkAt(p, 3.1)
  return P
}

// Thinking: hand on the chin with little taps, eyes up and to the side.
function thinkingPose(st) {
  const P = basePose(st)
  const p = loopT(st)
  const taps = envelope(p, 0.2, 1.8, 0.2) + envelope(p, 2.2, 3.8, 0.2)
  P.raiseR = 0.05 + 0.12 * taps * Math.max(0, Math.sin(TAU * 2.5 * st))
  P.swingR = -1.25
  P.reachR = 1.25
  P.rotZ = -0.06 + 0.06 * Math.sin((TAU * st) / L4)
  P.rotX = -0.04
  P.lookX = -0.55 + 0.2 * Math.sin((TAU * st) / L4)
  P.lookY = 0.8
  P.browL = 0.055
  P.browR = 0.02
  P.smile = 0.8
  P.ooh = 0.3
  P.blink = blinkAt(p, 2.0)
  return P
}

// Got it: watch the jar pop, cheer at the picture, hop and spin, then thumbs-up and wink.
function donePose(st) {
  const P = basePose(st)
  const anticipate = envelope(st, 0, 0.6, 0.25)
  P.lookX = -0.8 * anticipate
  P.lookY = -0.5 * anticipate
  P.rotX = 0.1 * anticipate
  P.q = -0.06 * bump(st, 0.15, 0.45) + wobble(st, 0.45, 0.08, 2.2, 5)
  const surprise = envelope(st, 0.45, 1.6, 0.2)
  P.browL = P.browR = 0.05 * surprise
  P.ooh = 0.8 * envelope(st, 0.45, 1.2, 0.15)
  P.eyes = 1 + 0.1 * surprise
  const lookUp = envelope(st, 0.95, 2.6, 0.35)
  P.lookY += 0.9 * lookUp
  const cheer = envelope(st, 1.2, 2.25, 0.3)
  P.raiseL = lerp(P.raiseL, 0.8, cheer) + 0.1 * cheer * Math.sin(TAU * 2 * st)
  P.raiseR = lerp(P.raiseR, 0.8, cheer) + 0.1 * cheer * Math.sin(TAU * 2 * st + 1.5)
  P.smile = 1.1 + 0.25 * smooth(seg(st, 1.2, 1.6))
  // Hop and spin.
  P.q += -0.12 * bump(st, 2.0, 2.25)
  const hop = seg(st, 2.2, 2.8)
  P.py += 0.45 * Math.sin(Math.PI * hop)
  P.q += 0.1 * bump(st, 2.2, 2.5) + wobble(st, 2.8, -0.12, 2.2, 5)
  P.tuck = bump(st, 2.15, 2.85)
  P.rotY += TAU * easeInOutSine(seg(st, 2.3, 3.05))
  // Thumbs-up and wink, then hold.
  const thumbs = smooth(seg(st, 3.0, 3.35))
  P.raiseR = lerp(P.raiseR, 0.45 + 0.04 * Math.sin((TAU * st) / L4), thumbs)
  P.swingR = lerp(P.swingR, -0.5, thumbs)
  P.thumb = thumbs
  const wink = envelope(st, 3.4, 4.3, 0.15)
  P.wink = wink
  P.rotZ += 0.1 * wink
  P.smile += 0.2 * wink
  if (st > 4.6) P.blink = blinkAt(loopT(st - 4.6), 2.5)
  return P
}

const POSES = { idle: idlePose, listening: listeningPose, thinking: thinkingPose, done: donePose }

function mixPose(a, b, k) {
  const out = {}
  for (const key of POSE_KEYS) out[key] = lerp(a[key], b[key], k)
  return out
}

// --- Scene --------------------------------------------------------------------

// background: false renders on a transparent canvas (no sky, no bloom) so the
// animation can sit behind app buttons and text.
export function createListenScene({ width, height, background = true }) {
  const aspect = width / height
  const near = computeLayout(aspect, TOP_CLOSE)
  const L = computeLayout(aspect, TOP_DONE) // the wider view; bubbles and clouds are placed against it
  const rng = seededRandom(11)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !background, premultipliedAlpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.setClearColor(0x000000, background ? 1 : 0)
  const canvas = renderer.domElement

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 200)
  scene.add(camera)
  addLights(scene)
  const tmpColor = new THREE.Color()

  // Backdrop: a soft gradient sky, twinkling stars, a few clouds. Kept sparse so UI can sit on top.
  let stars = null
  const { clouds, addCloud } = cloudMaker(scene, rng)
  if (background) {
    scene.fog = new THREE.Fog('#6a5cb8', 18, 46)
    camera.add(createSky(aspect))
    stars = createStarField(200, aspect, L4, rng)
    scene.add(stars.points)
    const w = L.visW / 2
    addCloud(-w * 1.25, L.bottom - 0.1, -5, 0.75, 5)
    addCloud(w * 1.2, L.bottom - 0.3, -4.5, 0.7, 4)
    addCloud(-w * 2.0, L.lookY + 2.6, -16, 1.2, 5)
    addCloud(w * 2.1, L.lookY + 4.2, -18, 1.3, 6)
  }

  // Sparkles that drift up and fade, once per loop.
  const AMBIENT = 46
  const ambient = pointCloud(AMBIENT, true)
  const ambientSeeds = []
  for (let i = 0; i < AMBIENT; i++) {
    ambientSeeds.push({
      x: (rng() * 2 - 1) * L.visW * 0.6, y: L.bottom + rng() * L.visH * 0.7,
      z: -0.5 - rng() * 5, sway: rng() * TAU, phase: rng(),
    })
    tmpColor.set(CONFETTI_COLORS[i % 5])
    ambient.color.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b)
    ambient.size.setX(i, 0.3 + rng() * 0.45)
    ambient.speed.setX(i, 0)
  }
  scene.add(ambient.points)

  const pool = sparklePool(300)
  scene.add(pool.points)

  // --- Pixi --------------------------------------------------------------

  const pixiParts = createPixi()
  const { group: pixi, squash, face, eyeL, eyeR, mouth, cheeks, armL, armR, legL, legR, cap, glow: pixiGlow, glowMap } = pixiParts
  scene.add(pixi)

  // --- The wish jar --------------------------------------------------------

  const jar = new THREE.Group()
  jar.position.copy(JAR_POS)
  scene.add(jar)
  const jarBody = new THREE.Group()
  jar.add(jarBody)
  const glassProfile = new THREE.SplineCurve([
    [0.0, -0.42], [0.22, -0.42], [0.33, -0.38], [0.385, -0.27], [0.4, -0.08], [0.38, 0.12],
    [0.31, 0.25], [0.235, 0.31], [0.225, 0.36], [0.25, 0.4], [0.24, 0.42],
  ].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(60)
  const glass = new THREE.Mesh(new THREE.LatheGeometry(glassProfile, 64), bubbleMaterial('#f4eeff'))
  glass.renderOrder = 4
  const potionProfile = [
    [0.0, -0.38], [0.2, -0.38], [0.3, -0.34], [0.35, -0.23], [0.36, -0.08], [0.34, 0.1], [0.28, 0.22], [0.2, 0.28], [0.0, 0.29],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const potion = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(potionProfile).getPoints(40), 48), potionMaterial())
  potion.renderOrder = 3
  jarBody.add(potion, glass)
  const jarGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#ffe3a8', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
  jarGlow.scale.setScalar(1.9)
  jarGlow.position.z = -0.3
  jar.add(jarGlow)

  // A soft lavender lid with a pink star knob.
  const lid = new THREE.Group()
  const lidMat = new THREE.MeshPhysicalMaterial({ color: PALETTE.lavender, roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color('#f1e9ff'), clearcoat: 0.5 })
  const lidTop = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.09, 40), lidMat)
  const lidRim = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.035, 12, 40), lidMat)
  lidRim.rotation.x = Math.PI / 2
  lidRim.position.y = -0.03
  const knob = new THREE.Mesh(pillowStar(0.11, 0.065, 0.05, { rings: 12, segs: 60 }).geo, new THREE.MeshPhysicalMaterial({ color: PALETTE.pink, roughness: 0.4, emissive: '#ff8fbf', emissiveIntensity: 0.25, clearcoat: 0.6 }))
  knob.position.y = 0.15
  lid.add(lidTop, lidRim, knob)
  jarBody.add(lid)

  // --- Bubbles and the little shapes inside them ------------------------------

  const shapeGeos = [new THREE.SphereGeometry(0.62, 24, 16), heartGeometry(), pillowStar(1, 0.55, 0.42, { rings: 16, segs: 60 }).geo, noteGeometry()]
  const shapeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.18 })
  const SHAPE_CAP = BUBBLE_MAX + CAUGHT_MAX * 2
  const shapeMeshes = shapeGeos.map((g) => {
    const m = new THREE.InstancedMesh(g, shapeMat, SHAPE_CAP)
    m.setColorAt(0, tmpColor.set('#ffffff'))
    m.frustumCulled = false
    m.count = 0
    scene.add(m)
    return m
  })
  const film = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 20), bubbleMaterial('#ffffff'), BUBBLE_MAX)
  film.setColorAt(0, tmpColor.set('#ffffff'))
  film.frustumCulled = false
  film.renderOrder = 6
  film.count = 0
  scene.add(film)
  const BUBBLE_TINTS = ['#ffe0f0', '#e0f1ff', '#efe6ff', '#fff3d6']
  const SHAPE_COLORS = ['#ff8fbf', '#7cc2ff', '#b59cff', '#ffc94d', '#7fe0bf']

  // --- Thinking props: orbiting stars, candy gears, a lightbulb -----------------

  const thinkProps = new THREE.Group()
  scene.add(thinkProps)
  const orbitStarGeo = pillowStar(0.13, 0.075, 0.06, { rings: 12, segs: 60 }).geo
  const orbitStars = [PALETTE.gold, PALETTE.pink, PALETTE.sky, '#fff1b8', PALETTE.lavender].map((c) => {
    const m = new THREE.Mesh(orbitStarGeo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.4 }))
    thinkProps.add(m)
    return m
  })
  const candy = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, emissive: color, emissiveIntensity: 0.12 })
  const makeGear = (teeth, outer, color, x, y) => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(gearGeometry(teeth, outer, outer * 0.74), candy(color)))
    const button = new THREE.Mesh(new THREE.SphereGeometry(outer * 0.3, 24, 16), candy('#ffffff'))
    button.scale.z = 0.45
    button.position.z = 0.06
    g.add(button)
    g.position.set(x, y, 0.1)
    thinkProps.add(g)
    return g
  }
  const gearA = makeGear(8, 0.3, '#ff9ec8', 1.12, 1.62)
  const gearB = makeGear(6, 0.22, '#8fe3c8', 1.55, 1.98)
  const bulb = new THREE.Group()
  bulb.position.set(-0.62, 2.18, 0.1)
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#ffe7a3', emissive: '#ffc95c', emissiveIntensity: 0.2, roughness: 0.3 })
  const glassBall = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), bulbMat)
  glassBall.scale.y = 1.08
  glassBall.position.y = 0.16
  const baseMat = new THREE.MeshPhysicalMaterial({ color: PALETTE.lavender, roughness: 0.4, clearcoat: 0.6 })
  const bulbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.14, 24), baseMat)
  bulbBase.position.y = -0.1
  bulb.add(glassBall, bulbBase)
  for (const y of [-0.06, -0.12]) {
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.018, 8, 24), baseMat)
    ringMesh.rotation.x = Math.PI / 2
    ringMesh.position.y = y
    bulb.add(ringMesh)
  }
  const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#ffe1a0', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
  bulbGlow.position.set(0, 0.16, -0.2)
  bulbGlow.scale.setScalar(1.3)
  bulb.add(bulbGlow)
  thinkProps.add(bulb)

  // --- Done: confetti that gathers into the wish picture ----------------------

  const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false })
  const dotMeshes = [
    new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 2), dotMat, SHAPE_DOTS / 2),
    new THREE.InstancedMesh(pillowStar(0.08, 0.048, 0.03, { rings: 8, segs: 40 }).geo, dotMat, SHAPE_DOTS / 2),
  ]
  for (const m of dotMeshes) { m.frustumCulled = false; scene.add(m) }
  const dots = []
  for (let i = 0; i < SHAPE_DOTS; i++) {
    dots.push({
      mesh: dotMeshes[i % 2], index: Math.floor(i / 2),
      dir: new THREE.Vector3(rng() * 2 - 1, 0.6 + rng() * 1.2, (rng() * 2 - 1) * 0.5).normalize(),
      dist: 0.8 + rng() * 1.3, delay: rng() * 0.2,
      spin: new THREE.Vector3(rng(), rng(), rng()).multiplyScalar(4), phase: rng() * TAU,
      burstColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      target: new THREE.Vector3(), color: new THREE.Color(), start: 0,
    })
  }
  let shapeName = null
  function setWishShape(name) {
    if (name === shapeName) return
    shapeName = WISH_SHAPES.includes(name) ? name : 'heart'
    const spots = sampleWishShape(shapeName, SHAPE_DOTS, seededRandom(5))
    spots.forEach((s, i) => {
      const d = dots[i]
      d.target.set((s.u - 0.5) * SHAPE_SIZE, (0.5 - s.v) * SHAPE_SIZE + SHAPE_Y, 0.35)
      d.color.copy(s.color).lerp(tmpColor.set('#ffffff'), 0.12)
      d.start = 1.0 + s.u * 0.45 + d.delay
    })
  }
  setWishShape('heart')
  const shapeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#ffe7c4', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
  shapeGlow.position.set(0, SHAPE_Y, 0.1)
  shapeGlow.scale.setScalar(SHAPE_SIZE * 2.1)
  scene.add(shapeGlow)
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), color: '#fff0fb', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
  scene.add(ring)

  // --- Post-processing --------------------------------------------------

  let composer = null
  if (background) {
    composer = new EffectComposer(renderer)
    composer.setPixelRatio(1)
    composer.setSize(width, height)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.42, 0.6, 0.86))
    composer.addPass(new OutputPass())
  }
  const pointScale = Math.min(width, height) / 1080
  for (const c of [stars, ambient, pool]) if (c) c.points.material.uniforms.uScale.value = pointScale

  // --- State ----------------------------------------------------------------

  let clock = 0
  let state = 'idle'
  let stateStart = 0
  let from = null // the state being blended away from: { name, start } or { pose }
  let blendStart = -10
  let liveLevel = 0
  let level = 0
  let simulate = true
  let fill = 0.12
  let jarSpin = 0
  let lastHit = -10
  let popped = false
  let slot = -1
  let spawnBudget = 0
  let framing = 0 // 0 = close on Pixi, 1 = pulled back to show the wish picture
  const weights = { idle: 1, listening: 0, thinking: 0, done: 0 }
  const bubbles = []
  const caught = []
  const launched = []

  const stateTime = () => clock - stateStart
  const poseFor = (name, st) => POSES[name](st, name === 'listening' ? level : 0)

  function currentPose() {
    const target = poseFor(state, stateTime())
    const k = smooth(seg(clock, blendStart, blendStart + BLEND))
    if (!from || k >= 1) return target
    const prev = from.pose ?? poseFor(from.name, clock - from.start)
    return mixPose(prev, target, k)
  }

  function setState(name, { restart = false } = {}) {
    if (!LISTEN_STATES.includes(name) || (name === state && !restart)) return
    const midBlend = clock < blendStart + BLEND
    from = midBlend ? { pose: currentPose() } : { name: state, start: stateStart }
    blendStart = clock
    state = name
    stateStart = clock
    slot = -1
    if (name === 'done') popped = false
  }

  const mouthPos = (out) => out.set(jar.position.x, jar.position.y + JAR_TOP * jarBody.scale.y + 0.02, jar.position.z)

  function spawnBubble(r, born, voice) {
    if (bubbles.length >= BUBBLE_MAX) return
    const fromBottom = r() < 0.62
    const side = r() < 0.5 ? -1 : 1
    const p0 = fromBottom
      ? new THREE.Vector3((r() * 2 - 1) * L.visW * 0.42, L.bottom - 0.4, 0.4 + r() * 0.4)
      : new THREE.Vector3(side * (L.visW / 2 + 0.4), L.bottom + r() * (JAR_POS.y - L.bottom + 1.2), 0.4 + r() * 0.4)
    const p1 = new THREE.Vector3(lerp(p0.x, JAR_POS.x, 0.35) + (r() - 0.5) * 1.2, p0.y + 1.4 + r() * 1.2, 0.7)
    bubbles.push({
      born, p0, p1, voice,
      dur: 2.6 - 0.7 * voice + r() * 0.3,
      size: 0.13 + 0.15 * voice + r() * 0.03,
      kind: Math.floor(r() * 4),
      tint: BUBBLE_TINTS[Math.floor(r() * BUBBLE_TINTS.length)],
      color: SHAPE_COLORS[Math.floor(r() * SHAPE_COLORS.length)],
      phase: r() * TAU,
    })
  }

  function catchBubble(b) {
    lastHit = clock
    fill += (0.85 - fill) * 0.1
    const m = mouthPos(new THREE.Vector3())
    for (let i = 0; i < 4; i++) spark(m.x, m.y + 0.05, m.z + 0.1, 0.5, { color: b.color, size: 0.35 + rng() * 0.3, life: 0.8 })
    if (caught.length >= CAUGHT_MAX) caught.shift()
    caught.push({ kind: b.kind, color: b.color, a: rng() * TAU, r: 0.08 + rng() * 0.17, y: -0.28 + rng() * 0.38, bob: rng() * TAU, born: clock })
  }

  function spark(x, y, z, speed, opts = {}) {
    const a = rng() * TAU
    const b = (rng() - 0.5) * Math.PI
    pool.spawn({
      x, y, z,
      vx: Math.cos(a) * Math.cos(b) * speed, vy: Math.sin(a) * Math.cos(b) * speed, vz: Math.sin(b) * speed * 0.5,
      life: 0.9 + rng() * 0.8, size: 0.5 + rng() * 0.6,
      color: CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)],
      ...opts,
    })
  }

  const bez = (out, p0, p1, p2, p3, k) => {
    const u = 1 - k
    return out.set(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * k).addScaledVector(p2, 3 * u * k * k).addScaledVector(p3, k * k * k)
  }

  const tmpV = new THREE.Vector3()
  const tmpV2 = new THREE.Vector3()
  const tmpV3 = new THREE.Vector3()
  const tmpQ = new THREE.Quaternion()
  const tmpE = new THREE.Euler()
  const tmpS = new THREE.Vector3()
  const tmpM = new THREE.Matrix4()
  const counts = [0, 0, 0, 0]

  function putShape(kind, pos, rot, scale, color) {
    const mesh = shapeMeshes[kind]
    const i = counts[kind]++
    if (i >= SHAPE_CAP) return
    tmpM.compose(pos, tmpQ.setFromEuler(rot), tmpS.setScalar(Math.max(0.0001, scale)))
    mesh.setMatrixAt(i, tmpM)
    mesh.setColorAt(i, tmpColor.set(color))
  }

  function update(dt) {
    const st = stateTime()
    for (const name of LISTEN_STATES) weights[name] += ((name === state ? 1 : 0) - weights[name]) * (1 - Math.exp(-dt * 4))

    // Camera: fixed, with a slow, eased pull-back while the wish picture forms.
    const wantWide = state === 'done' && st > 0.3 ? 1 : 0
    framing = clamp01(framing + Math.sign(wantWide - framing) * Math.min(Math.abs(wantWide - framing), dt / 1.8))
    const f = easeInOutSine(framing)
    camera.position.set(0, lerp(near.lookY, L.lookY, f), lerp(near.d, L.d, f))
    camera.lookAt(0, lerp(near.lookY, L.lookY, f), 0)

    // The voice: a pretend one for previews, or the real loudness from setLevel().
    const target = state === 'listening' ? (simulate ? simulatedVoice(st) : liveLevel) : 0
    level += (target - level) * (1 - Math.exp(-dt * (target > level ? 16 : 5)))

    // Pixi.
    const P = currentPose()
    pixi.position.set(PIXI_POS.x + P.px, PIXI_POS.y + P.py, PIXI_POS.z)
    pixi.rotation.set(P.rotX - P.lookY * 0.16, P.rotY + P.lookX * 0.25, P.rotZ)
    const sy = 1 + P.q
    const sx = 1 / Math.sqrt(sy)
    squash.scale.set(sx, sy, sx)
    face.position.set(P.lookX * 0.04, P.lookY * 0.035, 0)
    for (const e of [eyeL, eyeR]) {
      e.iris.position.set(P.lookX * 0.035, P.lookY * 0.04, 0)
      e.holder.scale.setScalar(P.eyes)
    }
    armL.pivot.rotation.set(0, P.swingL, P.raiseL)
    armR.pivot.rotation.set(0, P.swingR, P.raiseR)
    armR.reach(P.reachR)
    armR.thumb.scale.set(0.05, 0.045 + 0.05 * P.thumb, 0.045)
    armR.thumb.position.y = 0.1 + 0.06 * P.thumb
    mouth.scale.set(0.105 * P.smile * (1 - 0.45 * P.ooh), 0.105 * P.smile * (1 + 0.35 * P.ooh), 1)
    eyeL.brow.position.y = P.browL
    eyeR.brow.position.y = P.browR - 0.035 * P.wink
    eyeL.open.scale.y = Math.max(0.06, 1 - P.blink)
    eyeR.open.scale.y = Math.max(0.06, 1 - Math.max(P.blink, P.wink))
    eyeR.open.visible = P.wink < 0.85
    eyeR.closed.visible = P.wink >= 0.85
    for (const c of cheeks) c.scale.setScalar(1 + 0.15 * P.wink + 0.08 * level)
    legL.rotation.x = 0.12 * Math.sin((TAU * clock) / 2) + 0.5 * P.tuck
    legR.rotation.x = 0.12 * Math.sin((TAU * clock) / 2 + Math.PI) + 0.5 * P.tuck
    legL.rotation.z = -0.1 - 0.15 * P.tuck
    legR.rotation.z = 0.1 + 0.15 * P.tuck
    cap.rotation.z = -0.2 + 0.06 * Math.sin((TAU * clock) / L4 - 1) - 0.8 * P.q + 0.08 * P.wink
    pixiGlow.material.opacity = 0.36 + 0.05 * Math.sin((TAU * clock) / L4) + 0.08 * level

    // The jar bobs, wiggles when a bubble lands, and swirls while thinking.
    const think = weights.thinking
    const done = weights.done
    jar.position.y = JAR_POS.y + 0.05 * Math.sin((TAU * clock) / L4 + 2)
    jar.rotation.z = 0.04 * Math.sin((TAU * clock) / L4) + 0.05 * think * Math.sin(TAU * 0.5 * clock)
    let jq = wobble(clock, lastHit, 0.07, 2.6, 6)
    if (state === 'done') jq += -0.1 * bump(st, 0.1, 0.45) + wobble(st, 0.45, 0.12, 2.4, 5)
    jarBody.scale.set(1 / Math.sqrt(1 + jq), 1 + jq, 1 / Math.sqrt(1 + jq))
    jarSpin += dt * (TAU / L4) * (1 + 2 * think)

    // Lid: closed when idle, hovering open while listening, shut tight to mix, popped when done.
    const listenW = weights.listening
    let lidUp = 0.28 * listenW
    let lidTilt = 0.35 * listenW
    if (state === 'done') {
      const pop = easeOutBack(seg(st, 0.42, 0.75), 2)
      const back = smooth(seg(st, 3.0, 3.7))
      lidUp = lerp(lidUp, 0.6, pop * (1 - back)) + 0.05 * Math.sin(TAU * st) * pop * (1 - back)
      lidTilt = lerp(lidTilt, 0.6, pop * (1 - back))
    }
    lid.position.set(0.08 * lidTilt, JAR_TOP + 0.045 + lidUp, 0)
    lid.rotation.z = -lidTilt
    lid.rotation.y = think * jarSpin * 0.25

    // Fill: rises with every bubble caught, drains when the wish is let out, rests low when idle.
    if (state === 'done' && st > 0.45) fill += (0 - fill) * (1 - Math.exp(-dt * 3))
    else if (state === 'idle') fill += (0.12 - fill) * (1 - Math.exp(-dt * 0.4))
    const pm = potion.material.uniforms
    pm.uFill.value = fill
    pm.uSwirl.value = think
    pm.uTime.value = clock
    pm.uGlow.value = 0.8 + 0.4 * think + 0.25 * level
    jarGlow.material.opacity = 0.12 + 0.28 * fill + 0.12 * think
    jarGlow.scale.setScalar(1.6 + 0.6 * fill)

    // Bubbles: spawned to the voice, then float along a curve and drop into the jar.
    if (state === 'listening') {
      if (simulate) {
        // Fixed slots in the 4-second loop, so recordings repeat exactly.
        const n = Math.floor(st / 0.25)
        while (slot < n) {
          slot += 1
          const j = ((slot % 16) + 16) % 16
          const voice = simulatedVoice(slot * 0.25)
          if (voice > 0.3 && slot >= 0) spawnBubble(seededRandom(j * 7919 + 13), stateStart + slot * 0.25, voice)
        }
      } else if (level > 0.08) {
        spawnBudget += dt * (1.6 + 7 * level)
        while (spawnBudget >= 1) { spawnBudget -= 1; spawnBubble(rng, clock, level) }
      }
    }
    counts.fill(0)
    const mouthNow = mouthPos(tmpV3)
    let filmCount = 0
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      const age = clock - b.born
      if (age >= b.dur) { bubbles.splice(i, 1); catchBubble(b); continue }
      if (age < 0) continue
      const k = age / b.dur
      const eased = lerp(k, easeInOutSine(k), 0.6)
      tmpV2.copy(mouthNow).add(tmpV.set(0.15, 1.0, 0.2))
      bez(tmpV, b.p0, b.p1, tmpV2, mouthNow, eased)
      tmpV.x += 0.1 * Math.sin(TAU * 0.8 * age + b.phase) * (1 - k)
      const pulse = 1 + 0.22 * level * Math.sin(TAU * 2 * clock + b.phase)
      const s = b.size * easeOutBack(seg(age, 0, 0.35)) * (1 - smooth(seg(k, 0.84, 1))) * pulse
      tmpM.compose(tmpV, tmpQ.identity(), tmpS.setScalar(Math.max(0.0001, s)))
      film.setMatrixAt(filmCount, tmpM)
      film.setColorAt(filmCount, tmpColor.set(b.tint))
      filmCount++
      tmpE.set(0.3 * Math.sin(TAU * age * 0.5 + b.phase), 0.6 * Math.sin(TAU * age * 0.4), 0.25 * Math.sin(TAU * age * 0.6 + b.phase))
      putShape(b.kind, tmpV, tmpE, s * 0.5, b.color)
    }
    film.count = filmCount
    film.instanceMatrix.needsUpdate = true
    film.instanceColor.needsUpdate = true

    // Shapes caught in the jar tumble around inside; when the jar pops they fly out.
    if (state === 'done' && st >= 0.45 && !popped) {
      popped = true
      const m = mouthPos(new THREE.Vector3())
      for (const c of caught) {
        launched.push({ ...c, born: clock, x: m.x + Math.cos(c.a) * 0.1, y: m.y, z: m.z, vx: (rng() - 0.5) * 2.2, vy: 2 + rng() * 1.6, vz: (rng() - 0.5) * 0.8 })
      }
      caught.length = 0
      for (let i = 0; i < 24; i++) spark(m.x, m.y + 0.1, m.z + 0.1, 1.4 + rng() * 1.4, { size: 0.5 + rng() * 0.5 })
    }
    for (const c of caught) {
      const a = c.a + jarSpin
      tmpV.set(jar.position.x + Math.cos(a) * c.r, jar.position.y + c.y + 0.03 * Math.sin((TAU * clock) / 2 + c.bob), jar.position.z + Math.sin(a) * c.r * 0.7)
      tmpE.set(0.3, a, 0.4 * Math.sin(a))
      putShape(c.kind, tmpV, tmpE, 0.075 * easeOutBack(seg(clock, c.born, c.born + 0.4)), c.color)
    }
    for (let i = launched.length - 1; i >= 0; i--) {
      const c = launched[i]
      const age = clock - c.born
      if (age > 1.3) { launched.splice(i, 1); continue }
      tmpV.set(c.x + c.vx * age, c.y + c.vy * age - 1.4 * age * age, c.z + c.vz * age)
      tmpE.set(age * 3, age * 4, age * 2)
      putShape(c.kind, tmpV, tmpE, 0.1 * (1 - smooth(seg(age, 0.7, 1.3))), c.color)
    }
    shapeMeshes.forEach((m, k) => {
      m.count = Math.min(counts[k], SHAPE_CAP)
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    })

    // Thinking props fade in around Pixi's head.
    thinkProps.visible = think > 0.01
    const head = tmpV2.set(pixi.position.x, pixi.position.y + 0.9, 0)
    orbitStars.forEach((m, i) => {
      const a = (TAU * clock) / L4 + (i * TAU) / orbitStars.length
      m.position.set(head.x + Math.cos(a) * 1.3, head.y + 0.55 + Math.sin(a) * 0.16, Math.sin(a) * 0.7)
      m.rotation.z = -a
      m.scale.setScalar(think * (0.85 + 0.15 * Math.sin(TAU * (clock / 2) + i)))
    })
    const pop = easeOutBack(think, 1.6)
    gearA.rotation.z = (TAU * clock) / (L4 * 2)
    gearB.rotation.z = -(TAU * clock) / (L4 * 2) * (8 / 6) + 0.3
    gearA.scale.setScalar(Math.max(0.0001, pop))
    gearB.scale.setScalar(Math.max(0.0001, pop))
    gearA.position.y = 1.62 + 0.04 * Math.sin((TAU * clock) / L4)
    gearB.position.y = 1.98 + 0.04 * Math.sin((TAU * clock) / L4 + 1)
    bulb.scale.setScalar(Math.max(0.0001, pop))
    bulb.position.y = 2.18 + 0.05 * Math.sin((TAU * clock) / L4 + 2)
    bulb.rotation.z = 0.12 * Math.sin((TAU * clock) / L4)
    const bright = state === 'thinking' ? smooth(seg(st, 0.4, 2.8)) * (0.85 + 0.15 * Math.sin((TAU * st) / L4)) : 0
    bulbMat.emissiveIntensity = 0.1 + 0.4 * bright * think
    bulbGlow.material.opacity = 0.3 * bright * think

    // Done: the wish picture gathers from the burst, twinkles, and fades when leaving.
    const showDots = done > 0.01 && (state !== 'done' || st >= 0.45)
    const m = mouthPos(tmpV3)
    const dst = state === 'done' ? st : 99
    for (const d of dots) {
      let s = 0
      if (showDots) {
        const out = easeOutCubic(seg(dst, 0.45 + d.delay * 0.3, 1.25))
        tmpV.copy(m).addScaledVector(d.dir, d.dist * out)
        tmpV.y -= 0.25 * seg(dst, 0.45, 1.4) ** 2
        tmpV.x += 0.06 * Math.sin(TAU * 0.9 * clock + d.phase)
        const k = easeInOutSine(seg(dst, d.start, d.start + 1.0))
        tmpV.lerp(d.target, k)
        const twinkle = 0.85 + 0.2 * Math.sin((TAU * clock) / 2 + d.phase) * k
        s = easeOutCubic(seg(dst, 0.45, 0.6)) * twinkle * done
        tmpColor.set(d.burstColor).lerp(d.color, k)
        tmpE.set(d.spin.x * clock * (1 - k), d.spin.y * clock * (1 - k), d.spin.z * clock * (1 - k))
        d.mesh.setColorAt(d.index, tmpColor)
      }
      tmpM.compose(tmpV, tmpQ.setFromEuler(tmpE), tmpS.setScalar(Math.max(0.0001, s)))
      d.mesh.setMatrixAt(d.index, tmpM)
    }
    for (const dm of dotMeshes) {
      dm.instanceMatrix.needsUpdate = true
      if (dm.instanceColor) dm.instanceColor.needsUpdate = true
    }
    shapeGlow.material.opacity = 0.35 * smooth(seg(dst, 2.0, 2.8)) * done
    ring.position.copy(m)
    ring.scale.setScalar(0.4 + 3.2 * easeOutCubic(seg(dst, 0.45, 1.3)))
    ring.material.opacity = state === 'done' ? 0.3 * bump(st, 0.45, 1.3) : 0
    if (state === 'done' && st > 2.6 && st < 5 && rng() < dt * 8) {
      const d = dots[Math.floor(rng() * dots.length)]
      spark(d.target.x, d.target.y, d.target.z + 0.05, 0.15, { size: 0.4 + rng() * 0.4, life: 1.1, opacity: 0.8 })
    }
    pool.update(dt)

    // Ambient life, periodic in the loop.
    for (const c of clouds) c.group.position.x = c.x + 0.1 * Math.sin((TAU * clock) / L4 + c.phase)
    ambientSeeds.forEach((a, i) => {
      const f = (clock / L4 + a.phase) % 1
      ambient.position.setXYZ(i, a.x + 0.15 * Math.sin(TAU * f + a.sway), a.y + f * 1.8, a.z)
      ambient.alpha.setX(i, Math.sin(Math.PI * f) * 0.7)
    })
    markDirty(ambient)
    ambient.points.material.uniforms.uTime.value = clock
    if (stars) stars.points.material.uniforms.uTime.value = clock
  }

  // --- Loop ------------------------------------------------------------------

  let raf = 0
  let prevNow = 0
  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 1 / 60
    prevNow = now
    clock += dt
    update(dt)
    render()
  }

  const render = () => (composer ? composer.render() : renderer.render(scene, camera))

  return {
    canvas,
    start() { cancelAnimationFrame(raf); prevNow = 0; raf = requestAnimationFrame(frame) },
    // Stop and jump ahead by `seconds` at 60 fps, then draw that one frame (for checking frames).
    freezeAfter(seconds) {
      cancelAnimationFrame(raf)
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        clock += 1 / 60
        update(1 / 60)
      }
      render()
    },
    setState,
    get state() { return state },
    // Seconds spent in the current state.
    get stateTime() { return stateTime() },
    // Microphone loudness, 0 (quiet) to 1 (loud). Used when simulate is off.
    setLevel(v) { liveLevel = clamp01(v) },
    setSimulated(on) { simulate = !!on },
    setWishShape,
    dispose() {
      cancelAnimationFrame(raf)
      scene.traverse((o) => {
        o.geometry?.dispose()
        for (const mat of [o.material].flat()) {
          if (!mat) continue
          mat.map?.dispose()
          mat.dispose()
        }
      })
      composer?.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
