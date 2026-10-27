// Shared pieces for the Pixi animations: timing helpers, the soft star geometry,
// twinkly point clouds, the dreamy sky, and Pixi itself.
import * as THREE from 'three'

export const TAU = Math.PI * 2
export const FOV = 35
export const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))

export const PALETTE = {
  skyTop: '#3d3a8c', skyMid: '#7a6bc9', skyBottom: '#e3a6d6', skyGlow: '#ffd9a8',
  lavender: '#c9b8ff', sky: '#9fd4ff', pink: '#ffb6d5', gold: '#ffd27a', cream: '#fff6dc',
  face: '#3a2a5c', cheek: '#ff9cc4', cloud: '#f4ecff', iris: '#7b5cf0',
}
export const CONFETTI_COLORS = [PALETTE.lavender, PALETTE.sky, PALETTE.pink, PALETTE.gold, '#ffffff', '#b8f0e0']

// --- Timing helpers -------------------------------------------------------

export const clamp01 = (x) => Math.min(1, Math.max(0, x))
export const lerp = (a, b, k) => a + (b - a) * k
export const seg = (t, a, b) => clamp01((t - a) / (b - a))
export const smooth = (x) => x * x * (3 - 2 * x)
export const easeOutCubic = (x) => 1 - (1 - x) ** 3
export const easeInCubic = (x) => x ** 3
export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2
export const easeOutBack = (x, s = 1.5) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2
// Rises and falls once between a and b.
export const bump = (t, a, b) => Math.sin(Math.PI * seg(t, a, b))
// Smoothly on between a..a+fade and off between b-fade..b.
export const envelope = (t, a, b, fade) => smooth(seg(t, a, a + fade)) * (1 - smooth(seg(t, b - fade, b)))
// A damped jiggle starting at time a: the squash-and-stretch settle.
export const wobble = (t, a, amp, freq = 2.2, decay = 4.5) =>
  t < a ? 0 : amp * Math.exp(-(t - a) * decay) * Math.sin((t - a) * freq * TAU)

export function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// --- Geometry -------------------------------------------------------------

// A soft, pillow-like five-point star. The outline radius follows a cosine so
// the tips and valleys are both round; the front and back bulge like a cushion.
export function pillowStar(outer, inner, depth, { roundness = 1.3, rings = 40, segs = 150, flat = 0.7, colors } = {}) {
  const radius = (a) => inner + (outer - inner) * ((1 + Math.cos(5 * a)) / 2) ** roundness
  const pos = []
  for (let j = 0; j <= rings; j++) {
    const u = (j / rings) * Math.PI
    const c = Math.cos(u)
    const z = depth * Math.sign(c) * Math.abs(c) ** flat
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU
      const r = radius(a) * Math.sin(u)
      pos.push(-Math.sin(a) * r, Math.cos(a) * r, z)
    }
  }
  const index = []
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * segs + i
      const b = j * segs + ((i + 1) % segs)
      const c = (j + 1) * segs + i
      const d = (j + 1) * segs + ((i + 1) % segs)
      index.push(a, c, b, b, c, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  // The poles are degenerate; point their normals straight out so the face stays smooth.
  const normals = geo.attributes.normal
  for (let i = 0; i < segs; i++) {
    normals.setXYZ(i, 0, 0, 1)
    normals.setXYZ(rings * segs + i, 0, 0, -1)
  }
  if (colors) {
    const top = new THREE.Color(colors[0])
    const bottom = new THREE.Color(colors[1])
    const col = []
    const tmp = new THREE.Color()
    for (let k = 0; k < pos.length; k += 3) {
      tmp.copy(bottom).lerp(top, clamp01((pos[k + 1] / outer + 1) / 2))
      col.push(tmp.r, tmp.g, tmp.b)
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  }
  // Height of the front surface at (x, y), for placing the face.
  const frontZ = (x, y) => {
    const s = Math.min(0.999, Math.hypot(x, y) / radius(Math.atan2(-x, y)))
    return depth * (1 - s * s) ** (flat / 2)
  }
  return { geo, frontZ }
}

export function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d'), size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export const glowTexture = () => canvasTexture(256, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
})

export const ringTexture = () => canvasTexture(256, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.62, 'rgba(255,255,255,0)')
  g.addColorStop(0.8, 'rgba(255,255,255,0.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
})

// --- Twinkly points -------------------------------------------------------

// One shader for stars and sparkles: a soft dot with a small four-point glint.
// Twinkle is a slow sine (periods of 4-12 s), never a blink.
function sparkleMaterial(perspective) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize, aAlpha, aPhase, aSpeed;
      uniform float uTime, uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        float twinkle = aSpeed > 0.0 ? 0.55 + 0.45 * sin(uTime * aSpeed + aPhase) : 1.0;
        vAlpha = aAlpha * twinkle;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale * ${perspective ? '(200.0 / -mv.z)' : '1.0'};
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float core = pow(max(0.0, 1.0 - length(p) * 2.0), 2.4);
        float rays = max(0.0, 1.0 - abs(p.x) * 20.0) * max(0.0, 1.0 - abs(p.y) * 2.0)
                   + max(0.0, 1.0 - abs(p.y) * 20.0) * max(0.0, 1.0 - abs(p.x) * 2.0);
        float a = (core + rays * 0.5) * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

export function pointCloud(count, perspective) {
  const geo = new THREE.BufferGeometry()
  const attr = (name, size) => {
    const a = new THREE.BufferAttribute(new Float32Array(count * size), size)
    a.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute(name, a)
    return a
  }
  const points = new THREE.Points(geo, sparkleMaterial(perspective))
  points.frustumCulled = false
  return {
    points,
    position: attr('position', 3),
    color: attr('aColor', 3),
    size: attr('aSize', 1),
    alpha: attr('aAlpha', 1),
    phase: attr('aPhase', 1),
    speed: attr('aSpeed', 1),
  }
}

export function markDirty(cloud) {
  for (const key of ['position', 'color', 'size', 'alpha', 'phase', 'speed']) cloud[key].needsUpdate = true
}

// Short-lived sparkles for trails, catches and bursts.
export function sparklePool(max) {
  const cloud = pointCloud(max, true)
  const items = []
  const tmp = new THREE.Color()
  return {
    points: cloud.points,
    spawn(p) {
      if (items.length >= max) items.shift()
      items.push({ age: 0, ...p })
    },
    clear() { items.length = 0 },
    update(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const s = items[i]
        s.age += dt
        if (s.age >= s.life) { items.splice(i, 1); continue }
        const drag = Math.exp(-dt * (s.drag ?? 1.6))
        s.vx *= drag; s.vy *= drag; s.vz *= drag
        s.vy -= (s.gravity ?? 0) * dt
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt
      }
      items.forEach((s, i) => {
        cloud.position.setXYZ(i, s.x, s.y, s.z)
        tmp.set(s.color)
        cloud.color.setXYZ(i, tmp.r, tmp.g, tmp.b)
        cloud.size.setX(i, s.size)
        cloud.alpha.setX(i, Math.sin(Math.PI * (s.age / s.life)) * (s.opacity ?? 0.9))
        cloud.speed.setX(i, 0)
      })
      cloud.points.geometry.setDrawRange(0, items.length)
      markDirty(cloud)
    },
  }
}

// --- Backdrop -------------------------------------------------------------

// A gradient sky card attached to the camera, so camera moves never show an edge.
export function createSky(aspect) {
  const skyH = 2 * 80 * TAN * 1.15
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(skyH * aspect, skyH),
    new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(PALETTE.skyTop) },
        uMid: { value: new THREE.Color(PALETTE.skyMid) },
        uBottom: { value: new THREE.Color(PALETTE.skyBottom) },
        uGlow: { value: new THREE.Color(PALETTE.skyGlow) },
        uAspect: { value: aspect },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uBottom, uGlow;
        uniform float uAspect;
        varying vec2 vUv;
        void main() {
          vec3 c = mix(uBottom, uMid, smoothstep(0.0, 0.48, vUv.y));
          c = mix(c, uTop, smoothstep(0.48, 1.0, vUv.y));
          vec2 q = (vUv - vec2(0.5, 0.42)) * vec2(uAspect, 1.0);
          c += uGlow * exp(-dot(q, q) * 7.0) * 0.22;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthWrite: false,
    }),
  )
  sky.position.z = -80
  sky.renderOrder = -10
  return sky
}

// Soft, warm lights with no shadows.
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight('#e2d6ff', '#ffc8e2', 1.3))
  const key = new THREE.DirectionalLight('#fff1dd', 2.0)
  key.position.set(3, 4, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#b3dcff', 0.8)
  fill.position.set(-5, 1, 3)
  scene.add(fill)
}

// Distant stars that twinkle a whole number of times per `loop` seconds.
export function createStarField(count, aspect, loop, rng) {
  const stars = pointCloud(count, false)
  const starColors = ['#ffffff', '#fff1c9', '#dcecff', '#ffe3f1']
  const tmp = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const z = -30 - rng() * 10
    const spread = -z * TAN * 1.1
    stars.position.setXYZ(i, (rng() * 2 - 1) * spread * aspect, (rng() * 1.25 - 0.25) * spread, z)
    tmp.set(starColors[i % starColors.length])
    stars.color.setXYZ(i, tmp.r, tmp.g, tmp.b)
    stars.size.setX(i, 5 + rng() ** 3 * 16)
    stars.alpha.setX(i, 0.5 + rng() * 0.5)
    stars.phase.setX(i, rng() * TAU)
    stars.speed.setX(i, (TAU / loop) * (1 + Math.floor(rng() * 3)))
  }
  markDirty(stars)
  return stars
}

// Fluffy clouds made of soft spheres. Returns an adder; each cloud remembers its home x.
export function cloudMaker(scene, rng) {
  const cloudMat = new THREE.MeshStandardMaterial({ color: PALETTE.cloud, roughness: 1, emissive: '#a898e6', emissiveIntensity: 0.1 })
  const puff = new THREE.SphereGeometry(1, 32, 20)
  const clouds = []
  const addCloud = (x, y, z, scale, puffs) => {
    const group = new THREE.Group()
    for (let i = 0; i < puffs; i++) {
      const k = puffs === 1 ? 0.5 : i / (puffs - 1)
      const r = 0.45 + Math.sin(Math.PI * k) * 0.55 + rng() * 0.15
      const m = new THREE.Mesh(puff, cloudMat)
      m.position.set((k - 0.5) * puffs * 0.62, r * 0.35 + rng() * 0.12, (rng() - 0.5) * 0.4)
      m.scale.set(r, r * 0.86, r * 0.8)
      group.add(m)
    }
    const base = new THREE.Mesh(puff, cloudMat)
    base.scale.set(puffs * 0.36, 0.38, 0.6)
    group.add(base)
    group.position.set(x, y, z)
    group.scale.setScalar(scale)
    scene.add(group)
    clouds.push({ group, x, phase: rng() * TAU })
  }
  return { clouds, addCloud }
}

// --- Pixi -----------------------------------------------------------------

// Arms hang at this angle; "raise" is measured from the side, so 0 is straight out.
export const ARM_REST = -0.55

// Builds Pixi and returns the parts the animations move. `squash` is scaled for
// squash-and-stretch; the face, arms, legs and cap all ride on it.
export function createPixi() {
  const pixi = new THREE.Group()
  pixi.rotation.order = 'YXZ'
  const squash = new THREE.Group()
  pixi.add(squash)

  const body = pillowStar(1.08, 0.7, 0.55, { roundness: 1.25, colors: ['#ffd56e', '#ffb093'] })
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.5, emissive: '#ffa63d', emissiveIntensity: 0.2,
    sheen: 0.4, sheenColor: new THREE.Color('#ffe6f2'), sheenRoughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.55,
  })
  squash.add(new THREE.Mesh(body.geo, bodyMat))

  const glowMap = glowTexture()
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: PALETTE.gold, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }))
  glow.scale.setScalar(4.2)
  glow.position.z = -0.7
  pixi.add(glow)
  const light = new THREE.PointLight('#ffcf7a', 4, 9, 2)
  light.position.z = -0.9
  pixi.add(light)

  // Face. Every feature sits on the curved front, turned to match it.
  const face = new THREE.Group()
  squash.add(face)
  const up = new THREE.Vector3(0, 0, 1)
  const placeOnFace = (obj, x, y, lift) => {
    const e = 0.01
    const z = body.frontZ(x, y)
    const n = new THREE.Vector3(-(body.frontZ(x + e, y) - z) / e, -(body.frontZ(x, y + e) - z) / e, 1).normalize()
    obj.position.set(x, y, z + lift)
    obj.quaternion.setFromUnitVectors(up, n)
    face.add(obj)
  }
  const faceMat = new THREE.MeshPhysicalMaterial({ color: PALETTE.face, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 })
  const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const ball = new THREE.SphereGeometry(1, 32, 24)
  const glossy = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 })
  const scleraMat = glossy('#fffdf8')
  const irisMat = glossy(PALETTE.iris)
  const pupilMat = glossy('#21173d')
  const blob = (mat, sx, sy, sz, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(ball, mat)
    m.scale.set(sx, sy, sz)
    m.position.set(x, y, z)
    return m
  }

  // Big mascot eyes: white, a violet iris that can look around, two shines.
  const makeEye = (x) => {
    const holder = new THREE.Group()
    const open = new THREE.Group()
    open.add(blob(scleraMat, 0.165, 0.205, 0.07))
    const iris = new THREE.Group()
    iris.add(blob(irisMat, 0.118, 0.148, 0.05, 0, -0.012, 0.035))
    iris.add(blob(pupilMat, 0.07, 0.09, 0.04, 0, -0.012, 0.06))
    iris.add(blob(shineMat, 0.042, 0.042, 0.02, 0.04, 0.05, 0.09))
    iris.add(blob(shineMat, 0.02, 0.02, 0.012, -0.035, -0.06, 0.088))
    open.add(iris)
    const closed = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.026, 12, 32, Math.PI), faceMat)
    closed.scale.y = 0.85
    closed.position.y = -0.04
    closed.visible = false
    holder.add(open, closed)
    placeOnFace(holder, x, 0.12, 0.0)
    // Eyebrows: short soft arcs that lift when Pixi is excited.
    const brow = new THREE.Group()
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 10, 24, 1.7), faceMat)
    arc.rotation.z = Math.PI / 2 - 0.85
    arc.position.y = -0.06
    brow.add(arc)
    const browHolder = new THREE.Group()
    browHolder.add(brow)
    placeOnFace(browHolder, x * 1.05, 0.37, 0.004)
    brow.rotation.z = -0.12 * Math.sign(x)
    return { holder, open, closed, iris, brow }
  }
  const eyeL = makeEye(-0.27)
  const eyeR = makeEye(0.27)

  // Open smile with a little pink tongue.
  const mouthShape = new THREE.Shape()
  mouthShape.moveTo(-1, 0)
  mouthShape.quadraticCurveTo(0, -0.22, 1, 0)
  mouthShape.bezierCurveTo(1, -1.1, -1, -1.1, -1, 0)
  const mouth = new THREE.Group()
  mouth.add(new THREE.Mesh(new THREE.ShapeGeometry(mouthShape, 24), new THREE.MeshBasicMaterial({ color: '#5a2448' })))
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#ff8fb4' }))
  tongue.scale.set(0.5, 0.2, 1)
  tongue.position.set(0, -0.6, 0.002)
  mouth.add(tongue)
  mouth.scale.set(0.105, 0.105, 1)
  const mouthHolder = new THREE.Group()
  mouthHolder.add(mouth)
  placeOnFace(mouthHolder, 0, -0.1, 0.006)

  const cheekMat = new THREE.MeshBasicMaterial({ color: PALETTE.cheek, transparent: true, opacity: 0.72, depthWrite: false })
  const cheeks = [-0.49, 0.49].map((x) => {
    const holder = new THREE.Group()
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(1, 40), cheekMat)
    cheek.scale.set(0.12, 0.075, 1)
    holder.add(cheek)
    placeOnFace(holder, x, -0.08, 0.012)
    return holder
  })

  // Tiny arms with round mitten hands in the side valleys. The left one is
  // mirrored, so "raise" (pivot z) and "swing" (pivot y, negative = across the
  // front) mean the same on both sides. reach(k) stretches the arm cartoon-style.
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.18, 8, 16)
  const limbMat = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, emissive: '#ffa63d', emissiveIntensity: 0.18, sheen: 0.4, sheenColor: new THREE.Color('#ffe6f2') })
  const armMat = limbMat('#ffc477')
  const handMat = limbMat('#ffd890')
  const makeArm = (side) => {
    const root = new THREE.Group()
    root.position.set(0.66 * side, -0.2, 0.22)
    root.scale.x = side
    const pivot = new THREE.Group()
    // Angled toward the viewer, so a raised arm stays in front of the star points.
    const tilt = new THREE.Group()
    tilt.rotation.y = -0.7
    const arm = new THREE.Mesh(armGeo, armMat)
    arm.rotation.z = Math.PI / 2
    arm.position.x = 0.15
    const thumb = blob(handMat, 0.05, 0.045, 0.045, 0.3, 0.1, 0.04)
    const hand = blob(handMat, 0.12, 0.115, 0.1, 0.34, 0.01, 0)
    tilt.add(arm, hand, thumb)
    pivot.add(tilt)
    root.add(pivot)
    squash.add(root)
    const reach = (k) => {
      arm.scale.y = k
      arm.position.x = 0.15 * k
      hand.position.x = 0.34 + 0.3 * (k - 1)
      thumb.position.x = 0.3 + 0.3 * (k - 1)
    }
    return { pivot, thumb, reach }
  }
  const armL = makeArm(-1)
  const armR = makeArm(1)

  // Stubby legs with lavender booties under the bottom valley; they dangle while Pixi floats.
  const legMat = limbMat('#ffbb83')
  const bootMat = new THREE.MeshPhysicalMaterial({ color: '#b7a0ff', roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color('#e9ddff'), clearcoat: 0.4 })
  const soleMat = new THREE.MeshStandardMaterial({ color: '#8fc8ff', roughness: 0.6 })
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.14, 8, 16)
  const makeLeg = (side) => {
    const pivot = new THREE.Group()
    pivot.position.set(0.19 * side, -0.66, 0.02)
    const leg = new THREE.Mesh(legGeo, legMat)
    leg.position.y = -0.13
    pivot.add(leg)
    pivot.add(blob(bootMat, 0.14, 0.1, 0.17, 0.02 * side, -0.29, 0.06))
    pivot.add(blob(soleMat, 0.13, 0.03, 0.16, 0.02 * side, -0.37, 0.06))
    squash.add(pivot)
    return pivot
  }
  const legL = makeLeg(-1)
  const legR = makeLeg(1)

  // Pixi's signature sleepy nightcap: a floppy sky-blue cone with a fluffy rim and pom-pom.
  const CAP_H = 0.95
  const capGeo = new THREE.ConeGeometry(0.36, CAP_H, 40, 16, true)
  capGeo.translate(0, CAP_H / 2, 0)
  const capPos = capGeo.attributes.position
  for (let i = 0; i < capPos.count; i++) {
    const h = capPos.getY(i) / CAP_H
    capPos.setX(i, capPos.getX(i) + 0.4 * h * h)
    capPos.setY(i, capPos.getY(i) * (1 - 0.3 * h * h))
  }
  capGeo.computeVertexNormals()
  const fluffMat = new THREE.MeshPhysicalMaterial({ color: '#fffaff', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#ffffff') })
  const cap = new THREE.Group()
  cap.position.set(-0.02, 0.6, 0)
  cap.scale.set(1, 1, 1.75) // deep enough to cover the thick top point
  const capMesh = new THREE.Mesh(capGeo, new THREE.MeshPhysicalMaterial({
    color: PALETTE.sky, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color('#e4f4ff'), side: THREE.DoubleSide,
  }))
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.09, 16, 40), fluffMat)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.02
  const pom = blob(fluffMat, 0.13, 0.13, 0.13 / 1.75, 0.4, CAP_H * 0.7 + 0.04, 0)
  cap.add(capMesh, rim, pom)
  squash.add(cap)

  return { group: pixi, squash, face, eyeL, eyeR, mouth, cheeks, armL, armR, legL, legR, cap, glow, glowMap }
}
