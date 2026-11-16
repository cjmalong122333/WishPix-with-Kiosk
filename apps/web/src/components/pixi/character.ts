import * as THREE from 'three';
import { doodle } from './doodles';
import { outlineMaterial, PALETTE, skinMaterial, strokeMaterial, glassMaterial, type Shared } from './materials';
import { BoilingStroke, type RibbonPath } from './strokes';
import type { Pt } from './doodles';

// Pixi, the WishPix dream-painter: a small floating sprite drawn in crayon,
// holding the microphone wand, with a speech-bubble crest that turns into a
// picture frame. This file builds the rig; scene.ts animates it.

export type Pose = {
  x: number;
  y: number;
  squash: number;
  lean: number;
  tilt: number;
  turn: number;
  headTilt: number;
  headNod: number;
  headTurn: number;
  wandArm: number;
  wandFwd: number;
  wrist: number;
  wristFwd: number;
  freeArm: number;
  freeFwd: number;
  legSwing: number;
  wandGlow: number;
  cheek: number;
  crest: number;
  dots: number;
  browL: number;
  browR: number;
  mouth: number;
  smile: number;
  happy: number;
  eyeX: number;
  eyeY: number;
  eyeScale: number;
  blink: number;
};

export const REST: Pose = {
  x: 0,
  y: 0,
  squash: 0,
  lean: 0,
  tilt: 0,
  turn: 0,
  headTilt: 0,
  headNod: 0,
  headTurn: 0,
  wandArm: 0.5,
  wandFwd: -0.2,
  wrist: -0.85,
  wristFwd: 0.15,
  freeArm: -0.35,
  freeFwd: -0.1,
  legSwing: 0,
  wandGlow: 0.3,
  cheek: 0,
  crest: 0,
  dots: 0.3,
  browL: 0,
  browR: 0,
  mouth: 0,
  smile: 1,
  happy: 0,
  eyeX: 0,
  eyeY: 0,
  eyeScale: 1,
  blink: 1,
};

const HEAD = { r: 0.72, sx: 1.08, sy: 0.96, sz: 0.95 };
const HEAD_ABC = [HEAD.r * HEAD.sx, HEAD.r * HEAD.sy, HEAD.r * HEAD.sz] as const;
const TORSO = { r: 0.5, sx: 1, sy: 0.9, sz: 0.88, y: -0.1 };
const FEET_Y = -0.82;

const deg = (d: number) => (d * Math.PI) / 180;
function ellipse(rx: number, ry: number, a0: number, a1: number, n = 40, cx = 0, cy = 0): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = deg(a0 + ((a1 - a0) * i) / n);
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
}

// A point on an ellipsoid's front, turned to lie on the surface.
function onSurface<T extends THREE.Object3D>(obj: T, [a, b, c]: readonly [number, number, number], x: number, y: number, lift: number, cy = 0) {
  const z = c * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - (y / b) ** 2));
  const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
  obj.position.set(x, y + cy, z).addScaledVector(n, lift);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return obj;
}

function starShape(outer: number, inner: number, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export function puffyStar(outer: number, inner: number, depth: number) {
  const geo = new THREE.ExtrudeGeometry(starShape(outer, inner), {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.8,
    bevelSize: outer * 0.16,
    bevelSegments: 3,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

// The crest: a puffy speech bubble that morphs into a picture frame.
class Crest {
  readonly group = new THREE.Group();
  readonly geo = new THREE.BufferGeometry();
  private readonly n = 84;
  private readonly d = 0.06;
  private m = -1;
  private pos: THREE.BufferAttribute;
  private readonly skin: THREE.ShaderMaterial;
  private readonly dots: THREE.Mesh[] = [];
  private readonly picture: THREE.Mesh;
  private readonly bubble = [new THREE.Color('#FFFFFF'), new THREE.Color('#BFE3FF')];
  private readonly frame = [new THREE.Color('#FFE15A'), new THREE.Color('#F4B72E')];

  constructor(shared: Shared, outline: THREE.Material, pictureTex: THREE.Texture) {
    const n = this.n;
    this.pos = new THREE.BufferAttribute(new Float32Array((2 + 3 * n) * 3), 3);
    this.geo.setAttribute('position', this.pos);
    const F = (i: number) => 2 + (i % n);
    const M = (i: number) => 2 + n + (i % n);
    const B = (i: number) => 2 + 2 * n + (i % n);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      index.push(0, F(i), F(i + 1), 1, B(i + 1), B(i));
      index.push(F(i), M(i), F(i + 1), F(i + 1), M(i), M(i + 1));
      index.push(M(i), B(i), M(i + 1), M(i + 1), B(i), B(i + 1));
    }
    this.geo.setIndex(index);
    this.skin = skinMaterial(shared, '#FFFFFF', '#BFE3FF', { rim: 0.6 });
    const mesh = new THREE.Mesh(this.geo, this.skin);
    mesh.add(new THREE.Mesh(this.geo, outline));
    this.group.add(mesh);

    const dotColors = [
      [PALETTE.sky, '#2BA6EE'],
      [PALETTE.purple, '#8566E8'],
      [PALETTE.mint, '#1FBF83'],
    ];
    const dotGeo = new THREE.SphereGeometry(0.042, 14, 10);
    dotColors.forEach(([c, s], i) => {
      const dot = new THREE.Mesh(dotGeo, skinMaterial(shared, c, s, { rim: 0.4 }));
      dot.position.set((i - 1) * 0.12, 0, this.d - 0.008);
      dot.scale.z = 0.7;
      this.dots.push(dot);
      this.group.add(dot);
    });

    this.picture = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3), new THREE.MeshBasicMaterial({ map: pictureTex }));
    this.picture.position.z = this.d + 0.022;
    this.group.add(this.picture);
    this.set(0);
  }

  private radius(phi: number, m: number) {
    const sup = (a: number, b: number, p: number) => (Math.abs(Math.cos(phi) / a) ** p + Math.abs(Math.sin(phi) / b) ** p) ** (-1 / p);
    let diff = Math.abs(phi - (Math.PI + 0.62));
    diff = Math.min(diff, Math.PI * 2 - diff);
    const tail = 0.17 * Math.max(0, 1 - diff / 0.3) ** 1.7;
    const bubble = sup(0.31, 0.21, 2.6) + tail;
    const frame = sup(0.3, 0.225, 10);
    return bubble + (frame - bubble) * m;
  }

  set(m: number) {
    if (Math.abs(m - this.m) < 0.002) return;
    this.m = m;
    const { n, d } = this;
    this.pos.setXYZ(0, 0, 0, d + 0.012);
    this.pos.setXYZ(1, 0, 0, -d - 0.012);
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * Math.PI * 2;
      const r = this.radius(phi, m);
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      this.pos.setXYZ(2 + i, c * r, s * r, d);
      this.pos.setXYZ(2 + n + i, c * (r + 0.032), s * (r + 0.032), 0);
      this.pos.setXYZ(2 + 2 * n + i, c * r, s * r, -d);
    }
    this.pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    (this.skin.uniforms.uColor.value as THREE.Color).copy(this.bubble[0]).lerp(this.frame[0], m);
    (this.skin.uniforms.uShade.value as THREE.Color).copy(this.bubble[1]).lerp(this.frame[1], m);
    const k = THREE.MathUtils.smoothstep(m, 0.35, 0.95);
    this.picture.scale.setScalar(Math.max(0.001, k));
    this.picture.visible = k > 0.01;
  }

  // The dots bounce like someone talking; `amount` is how lively.
  animate(t: number, amount: number) {
    const hide = 1 - THREE.MathUtils.smoothstep(this.m, 0.05, 0.4);
    this.dots.forEach((dot, i) => {
      dot.position.y = Math.max(0, Math.sin(t * 7 - i * 0.9)) * 0.05 * amount;
      dot.scale.setScalar(Math.max(0.001, hide * (1 + Math.max(0, Math.sin(t * 7 - i * 0.9)) * 0.25 * amount)));
      dot.scale.z *= 0.7;
      dot.visible = hide > 0.01;
    });
  }
}

export class PixiRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly headPivot = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armWand = new THREE.Group(); // Pixi's left arm (screen right)
  readonly armFree = new THREE.Group();
  readonly handFree = new THREE.Group();
  readonly handWand = new THREE.Group();
  readonly wand = new THREE.Group();
  readonly mic = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly eyes: { group: THREE.Group; open: THREE.Group; happy: THREE.Object3D; base: THREE.Vector3; sparkle: THREE.Mesh }[] = [];
  private readonly brows: { group: THREE.Group; base: THREE.Vector3; side: number }[] = [];
  private mouthOpen!: THREE.Mesh;
  private smile!: THREE.Object3D;
  private readonly cheeks: THREE.Mesh[] = [];
  private readonly crest: Crest;
  private readonly strokes: BoilingStroke[] = [];
  private readonly glass: THREE.ShaderMaterial;
  private readonly core: THREE.Mesh;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly coreGlow: THREE.Sprite;
  private readonly outline: THREE.ShaderMaterial;
  private readonly thin: THREE.ShaderMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(
    shared: Shared,
    glow: THREE.Texture,
    crestPicture: THREE.Texture
  ) {
    this.outline = outlineMaterial(shared, 0.022);
    this.thin = outlineMaterial(shared, 0.012);
    const bodySkin = skinMaterial(shared, '#D4F1FF', '#9CD9FA');
    const headSkin = skinMaterial(shared, '#EAF8FF', '#B0E1FC');
    const footSkin = skinMaterial(shared, '#FFE680', '#F5BE2E', { rim: 0.6 });
    const ink = strokeMaterial(shared, { opacity: 0.92 });

    this.root.add(this.body);

    // Torso and head.
    const torso = this.part(new THREE.SphereGeometry(TORSO.r, 32, 24), bodySkin, this.body, this.outline);
    torso.scale.set(TORSO.sx, TORSO.sy, TORSO.sz);
    torso.position.y = TORSO.y;
    this.headPivot.position.y = 0.3;
    this.body.add(this.headPivot);
    this.head.position.y = 0.62;
    this.headPivot.add(this.head);
    const skull = this.part(new THREE.SphereGeometry(HEAD.r, 40, 30), headSkin, this.head, this.outline);
    skull.scale.set(HEAD.sx, HEAD.sy, HEAD.sz);

    // Loose rainbow sketch lines around the head and body.
    this.stroke(
      [
        { pts: ellipse(0.84, 0.75, 100, 415, 60), color: PALETTE.sky, width: 0.03 },
        { pts: ellipse(0.9, 0.81, 18, 132, 30), color: PALETTE.sun, width: 0.028 },
        { pts: ellipse(0.88, 0.79, 212, 292, 24), color: PALETTE.mint, width: 0.026 },
      ],
      ink,
      this.head
    );
    this.stroke(
      [
        { pts: ellipse(0.57, 0.5, 205, 335, 30, 0, TORSO.y), color: PALETTE.purple, width: 0.026 },
        { pts: ellipse(0.6, 0.53, 15, 70, 14, 0, TORSO.y), color: PALETTE.mint, width: 0.024 },
      ],
      ink,
      this.body
    );
    // A crayon star drawn on the belly: the WishPix spark.
    const belly = this.stroke([{ pts: doodle('star')[0].pts, color: '#F2B705', width: 0.024, closed: true }], strokeMaterial(shared), this.body, 0.13);
    onSurface(belly.mesh, [TORSO.r * TORSO.sx, TORSO.r * TORSO.sy, TORSO.r * TORSO.sz], 0, -0.06, 0.012, TORSO.y);

    this.buildFace(shared, glow);
    this.crest = new Crest(shared, this.thin, crestPicture);
    this.crest.group.position.set(0.08, 0.87, 0);
    this.crest.group.rotation.z = -0.12;
    this.head.add(this.crest.group);

    // Arms with mitten hands.
    const armGeo = new THREE.CapsuleGeometry(0.1, 0.2, 6, 14);
    const handGeo = new THREE.SphereGeometry(0.115, 18, 14);
    for (const side of [1, -1]) {
      const arm = side === 1 ? this.armWand : this.armFree;
      arm.position.set(0.4 * side, 0.12, 0);
      this.body.add(arm);
      this.part(armGeo, bodySkin, arm, this.outline).position.y = -0.2;
      const hand = side === 1 ? this.handWand : this.handFree;
      hand.position.y = -0.38;
      arm.add(hand);
      this.part(handGeo, bodySkin, hand, this.outline);
      if (side === 1) hand.add(this.wand);
    }

    // Short dangling legs with yellow crayon boots.
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.1, 6, 14);
    const footGeo = new THREE.SphereGeometry(0.13, 18, 14);
    for (const side of [1, -1]) {
      const leg = new THREE.Group();
      leg.position.set(0.2 * side, -0.42, 0);
      this.body.add(leg);
      this.part(legGeo, bodySkin, leg, this.outline).position.y = -0.14;
      const foot = this.part(footGeo, footSkin, leg, this.outline);
      foot.position.set(0, -0.28, 0.04);
      foot.scale.set(1, 0.72, 1.3);
      this.legs.push(leg);
    }

    // The microphone wand: paintbrush handle, mint ferrule, a bristle tuft
    // holding a clear microphone head with a glowing star inside.
    const handle = this.part(new THREE.CylinderGeometry(0.036, 0.026, 0.62, 14), skinMaterial(shared, '#C7B6FF', '#9479EE'), this.wand, this.thin);
    handle.position.y = 0;
    const tip = this.part(new THREE.SphereGeometry(0.034, 12, 10), skinMaterial(shared, PALETTE.sky, '#2BA6EE'), this.wand, this.thin);
    tip.position.y = -0.31;
    const ferrule = this.part(new THREE.CylinderGeometry(0.05, 0.042, 0.11, 16), skinMaterial(shared, '#A6F5D6', '#3FD39B'), this.wand, this.thin);
    ferrule.position.y = 0.36;
    const tuft = this.part(
      new THREE.LatheGeometry([new THREE.Vector2(0.05, 0.41), new THREE.Vector2(0.075, 0.46), new THREE.Vector2(0.1, 0.52), new THREE.Vector2(0.09, 0.57), new THREE.Vector2(0.001, 0.6)], 18),
      skinMaterial(shared, '#FFF3C4', '#FFC93D'),
      this.wand,
      this.thin
    );
    tuft.position.y = 0;
    this.mic.position.y = 0.74;
    this.wand.add(this.mic);
    this.coreMat = new THREE.MeshBasicMaterial({ color: '#FFE45C' });
    this.core = new THREE.Mesh(this.track(puffyStar(0.075, 0.035, 0.02)), this.coreMat);
    this.mic.add(this.core);
    this.coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#FFE98A', transparent: true, depthWrite: false, opacity: 0.8 }));
    this.mic.add(this.coreGlow);
    this.glass = glassMaterial(shared);
    const ball = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.17, 28, 20)), this.glass);
    ball.renderOrder = 2;
    this.mic.add(ball);
    const grilleMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, depthWrite: false });
    const grilleGeo = this.track(new THREE.TorusGeometry(0.171, 0.006, 6, 48));
    for (const [rx, ry] of [
      [Math.PI / 2, 0],
      [0, 0],
      [0, Math.PI / 2],
      [Math.PI / 2 - 0.5, 0],
      [Math.PI / 2 + 0.5, 0],
    ]) {
      const ring = new THREE.Mesh(grilleGeo, grilleMat);
      ring.rotation.set(rx, ry, 0);
      ring.renderOrder = 3;
      this.mic.add(ring);
    }
  }

  private track<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private part(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, outline: THREE.Material | null) {
    this.track(geo);
    const mesh = new THREE.Mesh(geo, mat);
    if (outline) mesh.add(new THREE.Mesh(geo, outline));
    parent.add(mesh);
    return mesh;
  }

  private stroke(paths: RibbonPath[], mat: THREE.Material, parent: THREE.Object3D, scale = 1) {
    const s = new BoilingStroke(paths, mat, { scale, step: 0.02, jitter: 0.006 });
    this.strokes.push(s);
    parent.add(s.mesh);
    return s;
  }

  private buildFace(shared: Shared, glow: THREE.Texture) {
    const ink = strokeMaterial(shared);
    // Paint-droplet eyes with a star-shaped sparkle.
    const drop = new THREE.Shape();
    drop.moveTo(0, 0.15);
    drop.bezierCurveTo(0.05, 0.09, 0.105, 0.02, 0.105, -0.04);
    drop.absarc(0, -0.04, 0.105, 0, Math.PI, true);
    drop.bezierCurveTo(-0.105, 0.02, -0.05, 0.09, 0, 0.15);
    const eyeGeo = this.track(new THREE.ShapeGeometry(drop, 20));
    const p = eyeGeo.attributes.position;
    const top = new THREE.Color('#2F2878');
    const bottom = new THREE.Color('#6E5DE6');
    const cols: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      c.copy(bottom).lerp(top, THREE.MathUtils.clamp((p.getY(i) + 0.145) / 0.295, 0, 1));
      cols.push(c.r, c.g, c.b);
    }
    eyeGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const white = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
    const sparkleGeo = this.track(new THREE.ShapeGeometry(starShape(0.052, 0.016, 4)));
    const dotGeo = this.track(new THREE.CircleGeometry(0.02, 12));

    for (const side of [-1, 1]) {
      const group = onSurface(new THREE.Group(), HEAD_ABC, 0.25 * side, -0.02, 0.012);
      const open = new THREE.Group();
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.rotation.z = -0.12 * side;
      open.add(eye);
      const sparkle = new THREE.Mesh(sparkleGeo, white);
      sparkle.position.set(-0.035, 0.03, 0.003);
      open.add(sparkle);
      const dot = new THREE.Mesh(dotGeo, white);
      dot.position.set(0.04, -0.08, 0.003);
      open.add(dot);
      group.add(open);
      const happy = new BoilingStroke([{ pts: ellipse(0.095, 0.08, 15, 165, 16), color: PALETTE.eye, width: 0.04 }], ink, { step: 0.015, jitter: 0.004 });
      this.strokes.push(happy);
      happy.mesh.position.y = -0.03;
      group.add(happy.mesh);
      this.head.add(group);
      this.eyes.push({ group, open, happy: happy.mesh, base: group.position.clone(), sparkle });

      // Small eyebrows that float just off the face.
      const brow = onSurface(new THREE.Group(), HEAD_ABC, 0.27 * side, 0.25, 0.07);
      const line = new BoilingStroke([{ pts: ellipse(0.1, 0.045, 150, 30, 12), color: '#5B4CD6', width: 0.034 }], ink, { step: 0.015, jitter: 0.004 });
      this.strokes.push(line);
      brow.add(line.mesh);
      this.head.add(brow);
      this.brows.push({ group: brow, base: brow.position.clone(), side });

      const cheek = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(0.3, 0.18)),
        new THREE.MeshBasicMaterial({ map: glow, color: '#FF86BC', transparent: true, depthWrite: false, opacity: 0.75 })
      );
      onSurface(cheek, HEAD_ABC, 0.45 * side, -0.17, 0.02);
      this.head.add(cheek);
      this.cheeks.push(cheek);
    }

    // Mouth: a crayon smile, or an open "wow" mouth.
    const mouth = onSurface(new THREE.Group(), HEAD_ABC, 0, -0.2, 0.012);
    const smile = new BoilingStroke([{ pts: ellipse(0.1, 0.075, 200, 340, 16), color: PALETTE.eye, width: 0.032 }], ink, { step: 0.015, jitter: 0.004 });
    this.strokes.push(smile);
    this.smile = smile.mesh;
    mouth.add(smile.mesh);
    const shape = new THREE.Shape();
    shape.moveTo(-0.1, 0);
    shape.absarc(0, 0, 0.1, Math.PI, Math.PI * 2, false);
    shape.quadraticCurveTo(0, -0.025, -0.1, 0);
    this.mouthOpen = new THREE.Mesh(this.track(new THREE.ShapeGeometry(shape, 16)), new THREE.MeshBasicMaterial({ color: '#4A3FA8' }));
    const tongue = new THREE.Mesh(this.track(new THREE.CircleGeometry(0.05, 16)), new THREE.MeshBasicMaterial({ color: PALETTE.pink }));
    tongue.scale.y = 0.55;
    tongue.position.set(0, -0.07, 0.002);
    this.mouthOpen.add(tongue);
    this.mouthOpen.position.y = 0.01;
    mouth.add(this.mouthOpen);
    this.head.add(mouth);
  }

  apply(p: Pose, t: number, boil: number) {
    this.root.position.set(p.x, p.y, 0);
    const sy = 1 + p.squash;
    const sxz = 1 - p.squash * 0.5;
    this.body.scale.set(sxz, sy, sxz);
    this.body.position.y = -FEET_Y * (sy - 1);
    this.body.rotation.set(p.tilt, p.turn, p.lean);
    this.headPivot.rotation.set(p.headNod, p.headTurn, p.headTilt);
    this.armWand.rotation.set(p.wandFwd, 0, p.wandArm);
    this.armFree.rotation.set(p.freeFwd, 0, p.freeArm);
    this.wand.rotation.set(p.wristFwd, 0, p.wrist);
    this.legs.forEach((leg, i) => {
      leg.rotation.x = 0.12 + p.legSwing * Math.sin(t * 2.2 + i * 1.7);
      leg.rotation.z = (i ? -1 : 1) * 0.06;
    });

    const happy = THREE.MathUtils.smoothstep(p.happy, 0.3, 0.7);
    const open = Math.max(0.02, p.blink * (1 - happy) * p.eyeScale);
    for (const eye of this.eyes) {
      eye.group.position.set(eye.base.x + p.eyeX, eye.base.y + p.eyeY, eye.base.z);
      eye.open.scale.set(p.eyeScale, open, 1);
      eye.open.visible = open > 0.03;
      eye.happy.scale.setScalar(Math.max(0.001, happy));
      eye.happy.visible = happy > 0.05;
      eye.sparkle.rotation.z = Math.sin(t * 1.3) * 0.25;
      eye.sparkle.scale.setScalar(1 + Math.sin(t * 2.1) * 0.12);
    }
    for (const brow of this.brows) {
      const lift = brow.side < 0 ? p.browL : p.browR;
      brow.group.position.set(brow.base.x, brow.base.y + lift + Math.sin(t * 1.9 + brow.side) * 0.006, brow.base.z);
      brow.group.rotation.z = brow.side * -lift * 1.4;
    }
    this.mouthOpen.scale.set(0.75 + 0.35 * p.mouth, Math.max(0.001, p.mouth), 1);
    this.mouthOpen.visible = p.mouth > 0.12;
    this.smile.visible = p.mouth < 0.3;
    this.smile.scale.set(p.smile, 1, 1);
    this.cheeks.forEach((cheek) => {
      (cheek.material as THREE.MeshBasicMaterial).opacity = 0.72 + 0.28 * p.cheek * (0.85 + 0.15 * Math.sin(t * 6));
      cheek.scale.setScalar(1 + 0.3 * p.cheek);
    });

    this.crest.set(THREE.MathUtils.clamp(p.crest, 0, 1));
    this.crest.animate(t, p.dots);
    this.crest.group.rotation.z = -0.12 + Math.sin(t * 2.3) * 0.03 - p.headTilt * 0.3;

    const glow = p.wandGlow;
    this.core.rotation.y = t * 1.6;
    this.core.rotation.z = Math.sin(t * 0.9) * 0.3;
    this.core.scale.setScalar(1 + glow * 0.25 + Math.sin(t * 5) * 0.04 * glow);
    this.coreMat.color.set('#FFE45C').lerp(new THREE.Color('#FFFFFF'), glow * 0.45);
    this.coreGlow.scale.setScalar(0.32 + glow * 0.5);
    this.coreGlow.material.opacity = 0.45 + glow * 0.5;
    this.glass.uniforms.uGlow.value = glow;

    for (const s of this.strokes) s.boil(boil);
  }

  micWorld(target: THREE.Vector3) {
    return this.mic.getWorldPosition(target);
  }

  // Points that page elements (the thought bubble) follow: the top of the
  // crest, and a spot just outside the head's sketch lines, upper left.
  headAnchors(crestTop: THREE.Vector3, headEdge: THREE.Vector3) {
    this.crest.group.localToWorld(crestTop.set(0, 0.27, 0));
    this.head.localToWorld(headEdge.set(-0.8, 0.5, 0));
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const s of this.strokes) s.dispose();
    this.crest.geo.dispose();
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
  }
}

// A paper star for the printing toss.
export function paperStar(shared: Shared) {
  const geo = puffyStar(0.16, 0.075, 0.04);
  const star = new THREE.Mesh(geo, skinMaterial(shared, '#FFE45C', '#F4B72E', { rim: 0.8 }));
  star.add(new THREE.Mesh(geo, outlineMaterial(shared, 0.014, '#E39B12')));
  return star;
}
