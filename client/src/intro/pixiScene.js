// The WishPix intro: Pixi floats in, waves, catches a wish star, spins it into
// confetti that spells "WishPix", then bounces and winks. Everything runs on one
// 12-second timeline, so a frame depends only on the time and the loop is seamless.
// Motion stays gentle on purpose: no flashing, nothing brighter than a slow swell.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import {
  TAU, FOV, TAN, PALETTE, CONFETTI_COLORS, ARM_REST as REST,
  clamp01, lerp, seg, smooth, easeOutCubic, easeInCubic, easeInOutSine, easeOutBack, bump, envelope, wobble,
  seededRandom, pillowStar, ringTexture, pointCloud, markDirty, sparklePool,
  createSky, addLights, createStarField, cloudMaker, createPixi,
} from './pixiKit.js'

export const LOOP_SECONDS = 12
const T = LOOP_SECONDS
const TEXT_FONT = "Fredoka, 'Andika', 'Inter', sans-serif"
const TEXT_ASPECT = 3.2 // the text canvas is 2048 x 640

// "WishPix" in a rounded font with a soft white outline. Returns the canvas so
// the confetti can sample where the letters are.
function drawWordmark() {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 640
  const ctx = canvas.getContext('2d')
  let size = 420
  ctx.font = `700 ${size}px ${TEXT_FONT}`
  size *= Math.min(1, 1760 / ctx.measureText('WishPix').width)
  ctx.font = `700 ${size}px ${TEXT_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const x = canvas.width / 2
  const y = canvas.height / 2 + size * 0.04
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(255, 236, 255, 0.7)'
  ctx.shadowBlur = 32
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = size * 0.17
  ctx.strokeText('WishPix', x, y)
  ctx.shadowBlur = 0
  const grad = ctx.createLinearGradient(160, 0, 1888, 0)
  grad.addColorStop(0, '#ff6fb5')
  grad.addColorStop(0.36, '#9d72ff')
  grad.addColorStop(0.68, '#4aa9ff')
  grad.addColorStop(1, '#ffb22e')
  ctx.fillStyle = grad
  ctx.fillText('WishPix', x, y)
  // A soft highlight on the top half of the letters.
  ctx.globalCompositeOperation = 'source-atop'
  const gloss = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.1)
  gloss.addColorStop(0, 'rgba(255,255,255,0.45)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.fillRect(0, 0, canvas.width, y)
  return canvas
}

function sampleWordmark(canvas, count, rng) {
  const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const spots = []
  for (let y = 0; y < height; y += 6) {
    for (let x = 0; x < width; x += 6) {
      if (data[(y * width + x) * 4 + 3] > 220) spots.push([x / width, y / height])
    }
  }
  const picked = []
  for (let i = 0; i < count; i++) picked.push(spots[Math.floor(rng() * spots.length)] ?? [0.5, 0.5])
  return picked
}

// --- Scene ---------------------------------------------------------------

// Fit Pixi (about 3.6 wide) and the wordmark above it in any aspect ratio.
function computeLayout(aspect) {
  const d = Math.max(2.75 / TAN, 2.1 / (TAN * aspect))
  const visH = 2 * d * TAN
  const visW = visH * aspect
  const textW = Math.min(4.6, visW * 0.9 * 0.84)
  const textH = textW / TEXT_ASPECT
  const spare = Math.max(0, (visH * 0.9 - 5.1) / 2) * 0.55 // extra height in tall frames
  const pixiY = -0.85 - spare
  const textY = 0.98 + textH / 2 + spare * 0.6
  const lookY = (pixiY - 1.15 + textY + textH / 2) / 2
  return { d, visW, visH, textW, textH, pixiY, textY, lookY }
}

export function loadSceneFonts() {
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000))
  return Promise.race([document.fonts.load(`700 200px ${TEXT_FONT}`), timeout]).catch(() => {})
}

export function createPixiScene({ width, height }) {
  const aspect = width / height
  const L = computeLayout(aspect)
  const rng = seededRandom(7)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  const canvas = renderer.domElement

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#6a5cb8', 16, 46)
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 200)
  scene.add(camera)

  // Sky: a gradient card that travels with the camera, so the push-in never shows an edge.
  camera.add(createSky(aspect))

  // The loop fades gently through the sky color, which hides the camera reset.
  const fadeH = 2 * 1 * TAN * 1.2
  const fade = new THREE.Mesh(
    new THREE.PlaneGeometry(fadeH * aspect, fadeH),
    new THREE.MeshBasicMaterial({ color: PALETTE.skyTop, transparent: true, depthTest: false, depthWrite: false, fog: false }),
  )
  fade.position.z = -1
  fade.renderOrder = 1000
  camera.add(fade)

  addLights(scene)

  // Distant stars.
  const stars = createStarField(240, aspect, T, rng)
  scene.add(stars.points)
  const tmpColor = new THREE.Color()

  // Floating sparkles that drift upward and fade at both ends of their rise.
  const AMBIENT = 70
  const ambient = pointCloud(AMBIENT, true)
  const ambientSeeds = []
  for (let i = 0; i < AMBIENT; i++) {
    ambientSeeds.push({
      x: (rng() * 2 - 1) * L.visW * 0.75, y: L.lookY - L.visH * 0.55 + rng() * L.visH * 0.4,
      z: -1 - rng() * 7, sway: rng() * TAU, phase: rng(), cycles: 1 + Math.floor(rng() * 2),
    })
    tmpColor.set(CONFETTI_COLORS[i % 5])
    ambient.color.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b)
    ambient.size.setX(i, 0.35 + rng() * 0.5)
    ambient.speed.setX(i, 0)
  }
  scene.add(ambient.points)

  // Fluffy clouds made of soft spheres.
  const { clouds, addCloud } = cloudMaker(scene, rng)
  const w = L.visW / 2
  addCloud(-w * 0.95, L.pixiY - 1.75, -3.5, 0.95, 5)
  addCloud(w * 0.98, L.pixiY - 1.95, -3, 0.85, 4)
  addCloud(-w * 2.1, L.lookY + 3.0, -14, 1.15, 5)
  addCloud(w * 2.2, L.lookY + 4.6, -17, 1.25, 6)
  addCloud(0, L.pixiY - 4.4, -11, 2.2, 7)

  // --- Pixi --------------------------------------------------------------

  const { group: pixi, squash, face, eyeL, eyeR, mouth, cheeks, armL, armR, legL, legR, cap, glow: pixiGlow, glowMap } = createPixi()
  scene.add(pixi)

  // --- The wish star --------------------------------------------------------

  const wish = new THREE.Group()
  scene.add(wish)
  const wishStar = new THREE.Mesh(
    pillowStar(0.38, 0.22, 0.15, { roundness: 1.15, rings: 24, segs: 90 }).geo,
    new THREE.MeshStandardMaterial({ color: PALETTE.cream, emissive: '#ffe9a8', emissiveIntensity: 1.25, roughness: 0.4 }),
  )
  wish.add(wishStar)
  const wishGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#ffe7a6', blending: THREE.AdditiveBlending, depthWrite: false }))
  scene.add(wishGlow)
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), color: '#fff0fb', blending: THREE.AdditiveBlending, depthWrite: false }))
  scene.add(ring)

  // --- Confetti that becomes the wordmark ---------------------------------

  const wordCanvas = drawWordmark()
  const wordTex = new THREE.CanvasTexture(wordCanvas)
  wordTex.colorSpace = THREE.SRGBColorSpace
  wordTex.anisotropy = 8
  const word = new THREE.Mesh(
    new THREE.PlaneGeometry(L.textW, L.textH),
    new THREE.MeshBasicMaterial({ map: wordTex, transparent: true, depthWrite: false, fog: false }),
  )
  word.position.set(0, L.textY, 0.25)
  word.renderOrder = 5
  scene.add(word)

  const CONFETTI = 720
  const confettiMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false })
  const confettiMeshes = [
    new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.042, 2), confettiMat, CONFETTI / 2),
    new THREE.InstancedMesh(pillowStar(0.075, 0.045, 0.03, { rings: 8, segs: 40 }).geo, confettiMat, CONFETTI / 2),
  ]
  const targets = sampleWordmark(wordCanvas, CONFETTI, rng)
  const confetti = targets.map(([u, v], i) => {
    const dir = new THREE.Vector3(rng() * 2 - 1, rng() * 1.6 - 0.4, (rng() * 2 - 1) * 0.6).normalize()
    return {
      mesh: confettiMeshes[i % 2], index: Math.floor(i / 2),
      dir, dist: 1.1 + rng() * 1.9,
      target: new THREE.Vector3((u - 0.5) * L.textW, (0.5 - v) * L.textH + L.textY, 0.32 + rng() * 0.05),
      start: 7.3 + u * 0.55 + rng() * 0.15, // letters fill in left to right
      fade: 8.75 + u * 0.4 + rng() * 0.2,
      spin: new THREE.Vector3(rng(), rng(), rng()).multiplyScalar(5),
      flutter: rng() * TAU,
      scale: 0.8 + rng() * 0.5,
    }
  })
  confettiMeshes.forEach((m, k) => {
    for (let i = 0; i < m.count; i++) m.setColorAt(i, tmpColor.set(CONFETTI_COLORS[(i * 7 + k) % CONFETTI_COLORS.length]))
    m.frustumCulled = false
    scene.add(m)
  })

  const pool = sparklePool(400)
  scene.add(pool.points)

  // --- Post-processing --------------------------------------------------

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(1)
  composer.setSize(width, height)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.42, 0.6, 0.86))
  composer.addPass(new OutputPass())

  const pointScale = Math.min(width, height) / 1080
  for (const m of [stars.points.material, ambient.points.material, pool.points.material]) m.uniforms.uScale.value = pointScale

  // --- Timeline -----------------------------------------------------------

  const startPos = new THREE.Vector3(-(L.visW / 2 + 1.8), L.pixiY + 1.1, -0.6)
  const wishFrom = new THREE.Vector3(L.visW * 0.38, L.lookY + L.visH * 0.42, -0.4)
  const tmpV = new THREE.Vector3()
  const tmpM = new THREE.Matrix4()
  const tmpQ = new THREE.Quaternion()
  const tmpE = new THREE.Euler()
  const tmpS = new THREE.Vector3()
  const burstAt = new THREE.Vector3()
  let trailBudget = 0
  let textSparkBudget = 0

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

  function update(t, prevT, dt) {
    const crossed = (a) => prevT < a && t >= a

    // Camera: one slow push-in across the loop.
    const push = easeInOutSine(clamp01(t / (T - 0.9)))
    camera.position.set(0, L.lookY + 0.12 * push, L.d * (1 - 0.1 * push))
    camera.lookAt(0, L.lookY, 0)
    fade.material.opacity = Math.max(1 - smooth(seg(t, 0, 0.8)), smooth(seg(t, 11.1, T)))

    // Pixi floats in on a gentle swoop, leaning into the motion.
    const arrive = seg(t, 0.2, 2.3)
    const ea = easeOutCubic(arrive)
    let px = lerp(startPos.x, 0, ea)
    let py = lerp(startPos.y, L.pixiY, easeInOutSine(arrive)) + Math.sin(Math.PI * arrive) * 0.4
    const pz = lerp(startPos.z, 0, ea)
    let rotY = -1.1 * (1 - ea)
    let rotZ = -0.22 * Math.sin(Math.PI * arrive) * (1 - arrive * 0.5)
    let rotX = 0
    let q = -0.12 * Math.sin(Math.PI * arrive) * (1 - arrive) // stretched sideways while flying
    q += wobble(t, 2.3, -0.12, 1.8, 4)
    py += 0.07 * Math.sin((TAU * t) / 3)

    let raiseL = REST
    let raiseR = REST
    let smile = 1
    let surprise = 0

    // Wave hello.
    const waveEnv = envelope(t, 2.3, 3.95, 0.35)
    const waveBeat = Math.sin(TAU * 1.9 * (t - 2.3))
    raiseR = lerp(raiseR, 0.6, waveEnv) + waveEnv * 0.38 * waveBeat
    raiseL += waveEnv * 0.15
    rotZ += waveEnv * 0.06 * Math.sin(TAU * 1.9 * (t - 2.3) + 1)
    smile += waveEnv * 0.12

    // Hooray arms to catch the wish star, held while spinning it.
    const hooray = smooth(seg(t, 4.35, 4.8)) * (1 - smooth(seg(t, 6.75, 7.2)))
    raiseL = lerp(raiseL, 0.75, hooray) + hooray * 0.1 * Math.sin(TAU * 2 * t)
    raiseR = lerp(raiseR, 0.75, hooray) + hooray * 0.1 * Math.sin(TAU * 2 * t + 1.5)

    // Anticipation, catch squash, spin, and the burst reaction.
    q -= 0.08 * bump(t, 4.55, 4.88)
    q += wobble(t, 4.9, 0.14, 2.4, 4.5)
    surprise = envelope(t, 3.45, 5.3, 0.3)
    const spin = seg(t, 5.1, 6.6)
    rotY += TAU * easeInOutSine(spin)
    py += 0.16 * Math.sin(Math.PI * spin)
    q += 0.06 * Math.sin(Math.PI * spin)
    q += wobble(t, 6.75, -0.1, 2, 4)
    smile += 0.18 * envelope(t, 6.8, 9.0, 0.3)

    // Happy hop, then a wink.
    q -= 0.16 * bump(t, 9.0, 9.28)
    const hop = seg(t, 9.25, 9.85)
    py += 0.55 * Math.sin(Math.PI * hop)
    q += 0.14 * bump(t, 9.22, 9.6)
    q += wobble(t, 9.85, -0.16, 2.2, 5)
    const hopArms = bump(t, 9.12, 9.98)
    raiseL = lerp(raiseL, 0.75, hopArms)
    raiseR = lerp(raiseR, 0.75, hopArms)
    const wink = envelope(t, 10.05, 10.9, 0.15)
    rotZ += 0.12 * wink
    smile += 0.25 * wink

    // Where the wish star is, so Pixi can look at it.
    const headTop = tmpV.set(px, py + 1.9, pz + 0.15)
    const fall = seg(t, 3.4, 4.9)
    const wishPos = new THREE.Vector3()
    if (t < 4.9) {
      const k = easeInOutSine(fall)
      const ctrl = new THREE.Vector3(wishFrom.x * 0.8, headTop.y + 1.2, 0)
      wishPos.copy(wishFrom).multiplyScalar((1 - k) ** 2).addScaledVector(ctrl, 2 * k * (1 - k)).addScaledVector(headTop, k * k)
    } else {
      wishPos.copy(headTop).add(new THREE.Vector3(0, 0.05 * Math.sin(TAU * t) + 0.28 * smooth(spin), 0))
    }

    // Eyes follow the wish star, then look up at the forming letters.
    const lookStar = envelope(t, 3.3, 7.0, 0.35)
    const lookText = envelope(t, 6.9, 9.2, 0.35)
    let lx = lookStar * clamp01((wishPos.x - px) / 3)
    const ly = lookStar * Math.min(1, Math.max(-1, (wishPos.y - py) / 2.5)) + lookText * 0.85
    lx *= 1 - smooth(spin) * (1 - smooth(seg(t, 6.6, 6.9)))
    face.position.set(lx * 0.04, ly * 0.035, 0)
    for (const e of [eyeL, eyeR]) e.iris.position.set(lx * 0.035, ly * 0.04, 0)
    rotX -= ly * 0.16
    rotY += lx * 0.25

    pixi.position.set(px, py, pz)
    pixi.rotation.set(rotX, rotY, rotZ)
    const sy = 1 + q
    const sx = 1 / Math.sqrt(sy)
    squash.scale.set(sx, sy, sx)
    armL.pivot.rotation.z = raiseL
    armR.pivot.rotation.z = raiseR
    // An "ooh" mouth while the wish star falls; a big grin otherwise.
    const ooh = envelope(t, 3.6, 5.0, 0.25)
    mouth.scale.set(0.105 * smile * (1 - 0.45 * ooh), 0.105 * smile * (1 + 0.35 * ooh), 1)
    eyeL.brow.position.y = 0.04 * surprise + 0.02 * lookText
    eyeR.brow.position.y = 0.04 * surprise + 0.02 * lookText - 0.035 * wink

    // Legs dangle and trail behind while flying, then tuck up during the hop.
    const flying = Math.sin(Math.PI * arrive)
    const tuck = bump(t, 9.2, 9.9)
    legL.rotation.x = 0.12 * Math.sin((TAU * t) / 1.5) - 0.5 * flying + 0.5 * tuck
    legR.rotation.x = 0.12 * Math.sin((TAU * t) / 1.5 + Math.PI) - 0.35 * flying + 0.5 * tuck
    legL.rotation.z = -0.1 - 0.15 * tuck
    legR.rotation.z = 0.1 + 0.15 * tuck
    // The cap flops a beat behind Pixi's moves.
    cap.rotation.z = -0.2 + 0.06 * Math.sin((TAU * t) / 3 - 1) + 0.35 * flying * (1 - arrive) - 0.8 * q + 0.08 * wink
    pixiGlow.material.opacity = 0.36 + 0.05 * Math.sin((TAU * t) / 3)

    const blink = Math.max(bump(t, 1.5, 1.68), bump(t, 8.25, 8.43))
    eyeL.open.scale.y = Math.max(0.06, 1 - blink)
    eyeR.open.scale.y = Math.max(0.06, 1 - Math.max(blink, wink))
    eyeR.open.visible = wink < 0.85
    eyeR.closed.visible = wink >= 0.85
    for (const c of cheeks) c.scale.setScalar(1 + 0.15 * wink)

    // The wish star: appears, falls along an arc, is caught, spun, and bursts.
    const appear = easeOutBack(seg(t, 3.25, 3.6))
    const grow = 1 + 0.35 * smooth(spin)
    const gone = 1 - easeInCubic(seg(t, 6.7, 6.95))
    const wishScale = t < 3.25 ? 0 : appear * grow * gone
    wish.visible = wishScale > 0.001
    wish.position.copy(wishPos)
    wish.scale.setScalar(Math.max(0.001, wishScale))
    wish.rotation.set(0.25 * Math.sin(TAU * t / 2), 0, t * 1.4 + TAU * 2 * easeInOutSine(spin))
    const swell = seg(t, 6.7, 7.25)
    wishGlow.position.copy(wishPos)
    wishGlow.scale.setScalar(1.7 * appear * grow * (1 + 0.7 * easeOutCubic(swell)))
    wishGlow.material.opacity = t < 3.25 ? 0 : (0.6 + 0.15 * smooth(spin)) * (1 - smooth(swell))
    ring.position.copy(wishPos)
    ring.scale.setScalar(0.5 + 4.5 * easeOutCubic(seg(t, 6.7, 7.6)))
    ring.material.opacity = 0.32 * bump(t, 6.7, 7.6)
    if (crossed(6.7)) burstAt.copy(wishPos)

    // Sparkles: trail, catch puff, burst, wink, and a few on the letters.
    if (t >= 3.4 && t < 6.7) {
      trailBudget += dt * (t < 4.9 ? 55 : 22)
      while (trailBudget >= 1) {
        trailBudget -= 1
        spark(wishPos.x + (rng() - 0.5) * 0.2, wishPos.y + (rng() - 0.5) * 0.2, wishPos.z, 0.25, { gravity: 0.25, size: 0.35 + rng() * 0.45 })
      }
    }
    if (crossed(4.9)) for (let i = 0; i < 18; i++) spark(wishPos.x, wishPos.y, wishPos.z, 1.6 + rng())
    if (crossed(6.72)) for (let i = 0; i < 40; i++) spark(burstAt.x, burstAt.y, burstAt.z, 2.2 + rng() * 1.5, { size: 0.6 + rng() * 0.6 })
    if (crossed(10.2)) {
      for (let i = 0; i < 4; i++) {
        spark(px + 0.55 + rng() * 0.25, py + 0.35 + rng() * 0.3, 0.7, 0.3, { color: i % 2 ? PALETTE.gold : '#ffffff', size: 0.6 + rng() * 0.5, life: 1.2 })
      }
    }
    if (t > 9.0 && t < 11.0) {
      textSparkBudget += dt * 9
      while (textSparkBudget >= 1) {
        textSparkBudget -= 1
        const c = confetti[Math.floor(rng() * confetti.length)]
        spark(c.target.x, c.target.y, c.target.z + 0.05, 0.15, { size: 0.4 + rng() * 0.4, life: 1.1, opacity: 0.8 })
      }
    }
    pool.update(dt)

    // Confetti bursts out, then flies to its spot in a letter and melts into the wordmark.
    for (const c of confetti) {
      let s = 0
      if (t >= 6.7) {
        const out = easeOutCubic(seg(t, 6.7, 7.7))
        const flutter = Math.sin(TAU * 0.9 * t + c.flutter) * 0.08
        tmpV.copy(burstAt).addScaledVector(c.dir, c.dist * out)
        tmpV.y -= 0.3 * seg(t, 6.7, 7.9) ** 2
        tmpV.x += flutter
        const k = easeInOutSine(seg(t, c.start, c.start + 0.95))
        tmpV.lerp(c.target, k)
        s = c.scale * easeOutCubic(seg(t, 6.7, 6.85)) * (1 - smooth(seg(t, c.fade, c.fade + 0.5)))
        tmpE.set(c.spin.x * t, c.spin.y * t, c.spin.z * t)
      }
      tmpQ.setFromEuler(tmpE)
      tmpM.compose(tmpV, tmpQ, tmpS.setScalar(Math.max(0.0001, s)))
      c.mesh.setMatrixAt(c.index, tmpM)
    }
    for (const m of confettiMeshes) m.instanceMatrix.needsUpdate = true

    const wordIn = seg(t, 8.35, 9.3)
    word.material.opacity = smooth(seg(t, 8.35, 9.2))
    word.scale.setScalar(0.88 + 0.12 * easeOutBack(wordIn))
    word.position.y = L.textY + 0.04 * Math.sin((TAU * t) / 4)

    // Ambient life: drifting clouds and rising sparkles, all periodic in the loop.
    for (const c of clouds) c.group.position.x = c.x + 0.25 * Math.sin((TAU * t) / T + c.phase)
    ambientSeeds.forEach((a, i) => {
      const f = ((t / T) * a.cycles + a.phase) % 1
      ambient.position.setXYZ(i, a.x + 0.2 * Math.sin(TAU * f + a.sway), a.y + f * 2.4, a.z)
      ambient.alpha.setX(i, Math.sin(Math.PI * f) * 0.75)
    })
    markDirty(ambient)
    for (const m of [stars.points.material, ambient.points.material]) m.uniforms.uTime.value = t
  }

  // --- Loop ------------------------------------------------------------------

  let raf = 0
  let t0 = performance.now()
  let prevT = 0
  let prevNow = t0
  let heldAt = null

  function frame(now) {
    raf = requestAnimationFrame(frame)
    const t = heldAt ?? ((now - t0) / 1000) % T
    const dt = Math.min(0.05, (now - prevNow) / 1000)
    if (t < prevT) {
      pool.clear()
      prevT = -1
    }
    update(t, prevT, dt)
    composer.render()
    prevT = t
    prevNow = now
  }

  return {
    canvas,
    start() { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame) },
    restart() { t0 = performance.now(); prevT = -1; heldAt = null; pool.clear() },
    // Freeze on one moment (for checking frames); null resumes.
    hold(t) { heldAt = t == null ? null : Math.min(T - 0.001, Math.max(0, t)) },
    dispose() {
      cancelAnimationFrame(raf)
      scene.traverse((o) => {
        o.geometry?.dispose()
        for (const m of [o.material].flat()) {
          if (!m) continue
          m.map?.dispose()
          m.dispose()
        }
      })
      composer.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
