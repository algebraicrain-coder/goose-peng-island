// 主角：企鹅鹅 Peng + 自行车。全部由基础几何程序化建模，含可动骨架。
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { taperedTube, cylinderBetween, mergeAll, paintVertexColors } from '../util/geo.js';
import { lerp, clamp, smoothstep } from '../util/noise.js';

const WHEEL_R = 0.62;
const CRANK_R = 0.17;
const CRANK_RATIO = 0.42;   // 曲柄相对车轮的转速比（齿比）
const MARK_A = 2.36;        // 轮上不对称标记的角度（红色轮辐 + 反光片所在处）

function mat(color, rough = 0.7, metal = 0.0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

const M = {
  feather: mat(0xece8dd, 0.78, 0.0),
  featherDim: mat(0xdcd8cc, 0.78, 0.0),
  featherTip: mat(0x9aa0a6, 0.7, 0.0),
  beak: mat(0xf2a13a, 0.45, 0.0),
  beakDark: mat(0xd9871f, 0.5, 0.0),
  eye: mat(0x14110f, 0.25, 0.0),
  glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  leg: mat(0xef9a3c, 0.55, 0.0),
  scarf: mat(0xc9403a, 0.85, 0.0),
  frame: mat(0xc0453f, 0.35, 0.25, { metalness: 0.3 }),
  frameDark: mat(0x2c2f33, 0.5, 0.3),
  chrome: mat(0xd8dbe0, 0.28, 0.85),
  tire: mat(0x23262a, 0.9, 0.0),
  rim: mat(0xcfd3d8, 0.3, 0.8),
  spoke: mat(0xe6e9ee, 0.3, 0.85),
  reflector: mat(0xe23b2e, 0.4, 0.0, { emissive: 0x7a1408, emissiveIntensity: 0.25 }),
  leather: mat(0x6b4a30, 0.75, 0.0),
  fender: mat(0xe9e2cf, 0.5, 0.15),
  basket: mat(0xb98a52, 0.85, 0.0),
  cloth: mat(0xd8cbb0, 0.95, 0.0),
  bread: mat(0xd8a15e, 0.8, 0.0),
  flower: mat(0xe8617a, 0.7, 0.0),
  flowerC: mat(0xf2d24b, 0.7, 0.0),
  leaf: mat(0x5f8f43, 0.85, 0.0),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffcf7a, emissiveIntensity: 0.55, roughness: 0.3 }),
};

// ---------- 自行车 ----------
function buildWheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R, 0.058, 12, 56), M.tire);
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.072, 0.022, 8, 56), M.rim);
  rim.rotation.y = Math.PI / 2;
  g.add(rim);

  const spokes = [];
  const NS = 20;
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * Math.PI * 2;
    const inner = new THREE.Vector3((i % 2 ? 0.03 : -0.03), Math.cos(a) * 0.05, Math.sin(a) * 0.05);
    const outer = new THREE.Vector3(0, Math.cos(a) * (WHEEL_R - 0.07), Math.sin(a) * (WHEEL_R - 0.07));
    spokes.push(cylinderBetween(inner, outer, 0.006, 0.006, 4));
  }
  const spokesGeo = mergeAll(spokes, 0xd9dde2);
  const spokesMesh = new THREE.Mesh(spokesGeo, M.spoke);
  g.add(spokesMesh);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 12), M.chrome);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);

  // 均匀轮辐是旋转对称的（每 360/NS 度自我重合），高速时只看轮辐会因频闪/混叠
  // 而「看不出在转」。加三个不对称标记做旋转参照：一根醒目的红色轮辐 + 红色反光片
  // （同在 MARK_A）、气门嘴（0°，深色以区别于银色轮圈）。任一时刻都能看出角位置。
  const markSpoke = new THREE.Mesh(cylinderBetween(
    new THREE.Vector3(-0.03, 0, 0),
    new THREE.Vector3(0, Math.cos(MARK_A) * (WHEEL_R - 0.07), Math.sin(MARK_A) * (WHEEL_R - 0.07)),
    0.015, 0.011, 6), M.frame);
  g.add(markSpoke);

  const valve = new THREE.Mesh(cylinderBetween(
    new THREE.Vector3(0, WHEEL_R - 0.14, 0),
    new THREE.Vector3(0, WHEEL_R - 0.005, 0), 0.019, 0.019, 6), M.frameDark);
  g.add(valve);

  const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.072, 0.042), M.reflector);
  reflector.position.set(0, Math.cos(MARK_A) * (WHEEL_R - 0.10), Math.sin(MARK_A) * (WHEEL_R - 0.10));
  reflector.rotation.x = MARK_A;
  g.add(reflector);
  return g;
}

function buildBicycle() {
  const root = new THREE.Group();
  root.name = 'bicycle';

  const rearAxle = new THREE.Vector3(0, WHEEL_R, -0.70);
  const frontAxle = new THREE.Vector3(0, WHEEL_R, 0.70);
  const bb = new THREE.Vector3(0, 0.30, 0.05);
  const seatTop = new THREE.Vector3(0, 1.0, -0.30);
  const headTop = new THREE.Vector3(0, 1.04, 0.42);
  const forkCrown = new THREE.Vector3(0, 0.72, 0.55);

  const tubes = [];
  const T = (a, b, r1, r2 = r1) => tubes.push(cylinderBetween(a, b, r1, r2, 12));
  T(rearAxle, bb, 0.022);                          // 后下叉
  T(rearAxle, seatTop, 0.017);                     // 后上叉
  T(bb, seatTop, 0.024);                           // 立管
  T(bb, forkCrown, 0.028, 0.024);                  // 下管
  T(seatTop, headTop, 0.022);                      // 上管
  T(headTop, forkCrown, 0.03);                     // 头管
  // 前叉
  const fL = new THREE.Vector3(-0.07, WHEEL_R, 0.70);
  const fR = new THREE.Vector3(0.07, WHEEL_R, 0.70);
  T(forkCrown, fL, 0.02, 0.014);
  T(forkCrown, fR, 0.02, 0.014);
  const frameGeo = mergeAll(tubes, 0xc0453f);
  const frame = new THREE.Mesh(frameGeo, M.frame);
  frame.castShadow = true;
  root.add(frame);

  // 座管 + 车座
  const seatPost = new THREE.Mesh(cylinderBetween(seatTop, new THREE.Vector3(0, 1.12, -0.34), 0.02, 0.019, 10), M.chrome);
  root.add(seatPost);
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), M.leather);
  saddle.scale.set(0.62, 0.24, 1.32);
  saddle.position.set(0, 1.15, -0.34);
  saddle.castShadow = true;
  root.add(saddle);

  // 车把
  const stem = new THREE.Mesh(cylinderBetween(headTop, new THREE.Vector3(0, 1.18, 0.40), 0.022, 0.02, 10), M.chrome);
  root.add(stem);
  const barPts = [
    new THREE.Vector3(-0.30, 1.14, 0.34),
    new THREE.Vector3(-0.24, 1.2, 0.42),
    new THREE.Vector3(0, 1.21, 0.44),
    new THREE.Vector3(0.24, 1.2, 0.42),
    new THREE.Vector3(0.30, 1.14, 0.34),
  ];
  const barGeo = taperedTube(new THREE.CatmullRomCurve3(barPts), () => 0.022, 24, 10);
  root.add(new THREE.Mesh(barGeo, M.chrome));
  // 把套
  const gripL = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.1, 6, 12), M.frameDark);
  gripL.position.set(-0.28, 1.16, 0.37); gripL.rotation.set(0, 0, 1.1); root.add(gripL);
  const gripR = gripL.clone(); gripR.position.x = 0.28; gripR.rotation.z = -1.1; root.add(gripR);

  // 铃铛
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0xd9b23c, 0.3, 0.7));
  bell.position.set(-0.13, 1.24, 0.44); root.add(bell);

  // 前叉挡泥板
  for (const az of [frontAxle, rearAxle]) {
    const f = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.055, 0.038, 8, 40, Math.PI * 0.95), M.fender);
    f.rotation.y = Math.PI / 2;
    f.position.copy(az);
    f.position.y += 0.02;
    root.add(f);
  }

  // 车轮
  const rearWheel = buildWheel();
  rearWheel.position.copy(rearAxle);
  root.add(rearWheel);
  const frontWheel = buildWheel();
  frontWheel.position.copy(frontAxle);
  root.add(frontWheel);

  // 牙盘 + 曲柄组
  const crank = new THREE.Group();
  crank.position.copy(bb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 8, 32), M.chrome);
  ring.rotation.y = Math.PI / 2;
  ring.position.x = 0.075;
  crank.add(ring);
  const ringPlate = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), M.chrome);
  ringPlate.rotation.y = Math.PI / 2; ringPlate.position.x = 0.075; crank.add(ringPlate);

  const crankGeos = [];
  const pedalPivots = [];
  for (const side of [-1, 1]) {
    const x = 0.085 * side;
    const armAng = side === -1 ? 0 : Math.PI;
    // 曲柄臂
    const arm = cylinderBetween(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, Math.cos(armAng) * CRANK_R, Math.sin(armAng) * CRANK_R), 0.018, 0.016, 8);
    crankGeos.push(arm);
    // 踏板枢轴（保持水平）
    const pivot = new THREE.Group();
    pivot.position.set(0, Math.cos(armAng) * CRANK_R, Math.sin(armAng) * CRANK_R);
    crank.add(pivot);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.028, 0.1), M.frameDark);
    pedal.position.x = 0.07 * side;
    pivot.add(pedal);
    pedal.castShadow = true;
    pedalPivots.push({ pivot, pedal, side });
  }
  crank.add(new THREE.Mesh(mergeAll(crankGeos, 0xcfd3d8), M.chrome));
  const bbAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.19, 12), M.frameDark);
  bbAxle.rotation.z = Math.PI / 2;
  crank.add(bbAxle);
  root.add(crank);

  // 链条
  const chainPts = [];
  const R1 = 0.115, R2 = 0.055;
  const chainPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.09, 0.30 + R1, 0.05),
    new THREE.Vector3(0.09, WHEEL_R + R2, -0.70),
    new THREE.Vector3(0.09, WHEEL_R - R2, -0.70),
    new THREE.Vector3(0.09, 0.30 - R1, 0.05),
    new THREE.Vector3(0.09, 0.30 - R1 * 0.6, 0.13),
  ], true);
  const chainGeo = taperedTube(chainPath, () => 0.012, 96, 6);
  root.add(new THREE.Mesh(chainGeo, M.frameDark));

  // 前车筐 + 面包 + 花
  const basket = new THREE.Group();
  basket.position.set(0, 1.02, 0.66);
  const bGeo = new THREE.CylinderGeometry(0.20, 0.15, 0.19, 16, 1, true);
  const basketMesh = new THREE.Mesh(bGeo, M.basket);
  basketMesh.material.side = THREE.DoubleSide;
  basket.add(basketMesh);
  // 筐的竖条
  const ribs = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * 0.20, 0.095, Math.sin(a) * 0.20);
    const bot = new THREE.Vector3(Math.cos(a) * 0.15, -0.095, Math.sin(a) * 0.15);
    ribs.push(cylinderBetween(bot, top, 0.008, 0.008, 8));
  }
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.012, 6, 24), M.basket);
  rim2.rotation.x = Math.PI / 2; rim2.position.y = 0.095; basket.add(rim2);
  basket.add(new THREE.Mesh(mergeAll(ribs, 0xb98a52), M.basket));
  // 布 + 法棍 + 花束
  const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M.cloth);
  cloth.position.y = 0.06; basket.add(cloth);
  const baguette = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 6, 12), M.bread);
  baguette.position.set(-0.03, 0.13, 0.0); baguette.rotation.set(0.5, 0.3, 1.2); basket.add(baguette);
  for (let i = 0; i < 4; i++) {
    const stemT = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 5), M.leaf);
    stemT.position.set(0.05 + i * 0.015, 0.14, 0.02 - i * 0.02);
    stemT.rotation.z = -0.3 + i * 0.12;
    basket.add(stemT);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), i % 2 ? M.flower : M.flowerC);
    fl.position.copy(stemT.position).add(new THREE.Vector3(-0.03 + i * 0.02, 0.12, 0));
    basket.add(fl);
  }
  root.add(basket);

  // 车灯
  const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 14), M.chrome);
  lampBody.rotation.x = Math.PI / 2;
  lampBody.position.set(0, 1.06, 0.60);
  root.add(lampBody);
  const lampLens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M.lamp);
  lampLens.rotation.x = Math.PI / 2;
  lampLens.position.set(0, 1.06, 0.635);
  root.add(lampLens);
  const lampLight = new THREE.PointLight(0xffd9a0, 1.1, 7, 2);
  lampLight.position.set(0, 1.06, 0.7);
  root.add(lampLight);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, rearWheel, frontWheel, crank, pedalPivots };
}

// ---------- 鹅 ----------
function makeFoot() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.075);
  s.bezierCurveTo(0.10, -0.05, 0.12, 0.02, 0.13, 0.10);
  s.lineTo(0.075, 0.06);
  s.lineTo(0.045, 0.15);
  s.lineTo(0.0, 0.07);
  s.lineTo(-0.045, 0.15);
  s.lineTo(-0.075, 0.06);
  s.lineTo(-0.13, 0.10);
  s.bezierCurveTo(-0.12, 0.02, -0.10, -0.05, 0, -0.075);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.0, 0.02);
  return g;
}

function buildGoose() {
  const root = new THREE.Group();
  root.name = 'goose';

  const bodyC = new THREE.Vector3(0, 1.38, -0.06);

  // 身体
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), M.feather);
  body.scale.set(0.33, 0.31, 0.44);
  body.position.copy(bodyC);
  root.add(body);
  // 腹部浅色
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.featherDim);
  belly.scale.set(0.30, 0.20, 0.40);
  belly.position.copy(bodyC).add(new THREE.Vector3(0, -0.10, 0.02));
  root.add(belly);

  // 脖子
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.56, 0.12),
    new THREE.Vector3(0, 1.74, 0.26),
    new THREE.Vector3(0, 1.96, 0.28),
    new THREE.Vector3(0, 2.13, 0.40),
  ]);
  const neck = new THREE.Mesh(taperedTube(neckCurve, (t) => lerp(0.165, 0.078, smoothstep(0, 1, t)), 40, 16), M.feather);
  root.add(neck);
  // 脖子转折处的小肉瘤（中国鹅特征）
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), M.beak);
  knob.position.set(0, 2.12, 0.40);
  knob.scale.set(0.8, 0.9, 0.8);
  root.add(knob);

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 28, 20), M.feather);
  head.scale.set(0.86, 1.0, 1.18);
  head.position.set(0, 2.17, 0.50);
  root.add(head);

  // 喙
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.26, 14), M.beak);
  beak.rotation.x = Math.PI / 2;
  beak.scale.set(0.9, 1.0, 0.72);
  beak.position.set(0, 2.155, 0.66);
  root.add(beak);
  const beakTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), M.beakDark);
  beakTip.position.set(0, 2.15, 0.78);
  root.add(beakTip);

  // 眼睛 + 高光
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), M.eye);
    eye.position.set(0.078 * sx, 2.215, 0.575);
    root.add(eye);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.glint);
    gl.position.set(0.088 * sx, 2.228, 0.598);
    root.add(gl);
    eyes.push(eye);
  }
  // 眼周浅色环
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), M.featherDim);
    ring.position.set(0.075 * sx, 2.215, 0.585);
    ring.rotation.y = Math.PI / 2 * sx * 0.4;
    root.add(ring);
  }

  // 翅膀（折叠）+ 翅尖
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.featherDim);
    cover.scale.set(0.10, 0.24, 0.40);
    cover.position.set(0.30 * sx, 1.40, -0.02);
    cover.rotation.z = 0.15 * sx;
    w.add(cover);
    // 覆羽层次
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), k === 2 ? M.featherTip : M.featherDim);
      f.scale.set(0.035, 0.11, 0.30 - k * 0.03);
      f.position.set((0.32 + k * 0.012) * sx, 1.42 - k * 0.03, -0.16 - k * 0.05);
      f.rotation.z = 0.18 * sx;
      w.add(f);
    }
    // 翅尖（初级飞羽）
    const tipPts = [
      new THREE.Vector3(0.30 * sx, 1.42, -0.24),
      new THREE.Vector3(0.26 * sx, 1.40, -0.5),
      new THREE.Vector3(0.18 * sx, 1.34, -0.7),
    ];
    const tip = new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(tipPts), (t) => lerp(0.075, 0.012, t), 20, 8), M.featherTip);
    tip.scale.set(1, 0.55, 1);
    w.add(tip);
    root.add(w);
    wings.push(w);
  }

  // 前伸的“手臂”翅膀搭在车把上
  for (const sx of [-1, 1]) {
    const armPts = [
      new THREE.Vector3(0.22 * sx, 1.52, 0.10),
      new THREE.Vector3(0.30 * sx, 1.4, 0.28),
      new THREE.Vector3(0.28 * sx, 1.2, 0.40),
    ];
    const arm = new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(armPts), (t) => lerp(0.085, 0.03, t), 20, 10), M.feather);
    root.add(arm);
  }

  // 尾巴
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), i === 3 ? M.featherTip : M.feather);
    t.scale.set(0.06, 0.035, 0.20);
    t.position.set((i - 1.5) * 0.05, 1.46 + i * 0.01, -0.50 - i * 0.015);
    t.rotation.x = -0.35;
    root.add(t);
  }

  // 围巾
  const scarfSegs = [];
  let parent = root;
  const scarfRoot = new THREE.Group();
  scarfRoot.position.set(0, 1.60, 0.16);
  root.add(scarfRoot);
  let cur = scarfRoot;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0 : 0, i === 0 ? 0 : -0.105);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16 - i * 0.012, 0.028, 0.12), M.scarf);
    m.position.z = -0.05;
    seg.add(m);
    cur.add(seg);
    cur = seg;
    scarfSegs.push(seg);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return { root, scarfSegs, head, neck, wings, body };
}

// 动态管状肢体（鹅腿），逐帧重建曲线
class DynamicTube {
  constructor(tubular = 14, radial = 8) {
    this.tubular = tubular;
    this.radial = radial;
    this.geo = new THREE.BufferGeometry();
    const count = (tubular + 1) * (radial + 1);
    this.pos = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    this.uv = new Float32Array(count * 2);
    const idx = [];
    for (let i = 1; i <= tubular; i++) {
      for (let j = 1; j <= radial; j++) {
        const a = (radial + 1) * (i - 1) + (j - 1);
        const b = (radial + 1) * i + (j - 1);
        const c = (radial + 1) * i + j;
        const d = (radial + 1) * (i - 1) + j;
        idx.push(a, b, d, b, c, d);
      }
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.mesh = new THREE.Mesh(this.geo, M.leg);
    this.mesh.castShadow = true;
    this._curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    this._pts = this._curve.points;
  }
  update(a, knee, b, r1, r2) {
    this._pts[0].copy(a);
    this._pts[1].copy(knee);
    this._pts[2].copy(b);
    const curve = this._curve;
    const frames = curve.computeFrenetFrames(this.tubular, false);
    const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    let p = 0, n = 0, u = 0;
    for (let i = 0; i <= this.tubular; i++) {
      const t = i / this.tubular;
      curve.getPointAt(t, P);
      N.copy(frames.normals[i]); B.copy(frames.binormals[i]);
      const r = lerp(r1, r2, t);
      for (let j = 0; j <= this.radial; j++) {
        const v = (j / this.radial) * Math.PI * 2;
        const cos = Math.cos(v), sin = -Math.sin(v);
        const nx = cos * N.x + sin * B.x;
        const ny = cos * N.y + sin * B.y;
        const nz = cos * N.z + sin * B.z;
        this.pos[p++] = P.x + r * nx; this.pos[p++] = P.y + r * ny; this.pos[p++] = P.z + r * nz;
        this.nor[n++] = nx; this.nor[n++] = ny; this.nor[n++] = nz;
        this.uv[u++] = t; this.uv[u++] = j / this.radial;
      }
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('normal').needsUpdate = true;
    this.geo.getAttribute('uv').needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

// ---------- 组合：骑手 ----------
export class Cyclist {
  constructor(scene, road, terrain) {
    this.road = road;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'cyclist';

    const bike = buildBicycle();
    this.bike = bike;
    this.group.add(bike.root);

    const goose = buildGoose();
    this.goose = goose;
    this.group.add(goose.root);

    // 腿 + 蹼
    this.legs = [];
    this.feet = [];
    for (const side of [-1, 1]) {
      const tube = new DynamicTube();
      this.group.add(tube.mesh);
      const foot = new THREE.Mesh(makeFoot(), M.leg);
      foot.castShadow = true;
      this.group.add(foot);
      this.legs.push({ tube, side, hip: new THREE.Vector3(0.09 * side, 1.08, 0.06) });
      this.feet.push(foot);
    }

    this.dist = 0;
    this.baseSpeed = WORLD.cycleSpeed;
    this.speedMul = 1;
    this.speed = this.baseSpeed;
    this.wheelAngle = 0;
    this.crankAngle = 0;
    this.lean = 0;
    this._pos = new THREE.Vector3();
    this._tan = new THREE.Vector3();
    this._tanAhead = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.tangent = new THREE.Vector3(0, 0, 1);
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);

    scene.add(this.group);
    this.update(0);
  }

  // 骑行速度倍率（1.0 = 默认）。按实际里程累计，故随时变速都不会让车轮跳变。
  setSpeedMul(m) {
    this.speedMul = clamp(m, 0.1, 6);
    this.speed = this.baseSpeed * this.speedMul;
    return this.speed;
  }

  update(dt) {
    const L = this.road.length;
    this.dist += this.speed * dt;
    const t = ((this.dist % L) + L) % L / L;

    const curve = this.road.curve;
    curve.getPointAt(t, this._pos);
    curve.getTangentAt(t, this._tan).normalize();

    // 曲率 → 倾斜
    const ahead = 7;
    const t2 = (((this.dist + ahead) % L) + L) % L / L;
    curve.getTangentAt(t2, this._tanAhead).normalize();
    const cross = this._tan.x * this._tanAhead.z - this._tan.z * this._tanAhead.x;
    const targetLean = clamp(-cross * 5.2, -0.42, 0.42);
    this.lean = lerp(this.lean, targetLean, Math.min(1, dt * 2.2));

    // 姿态
    const yaw = Math.atan2(this._tan.x, this._tan.z);
    const horiz = Math.hypot(this._tan.x, this._tan.z);
    const pitch = -Math.atan2(this._tan.y, horiz);
    this.group.position.copy(this._pos);
    this.group.rotation.set(0, 0, 0);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = yaw;
    this.group.rotation.x = pitch;
    this.group.rotation.z = this.lean;

    // 车轮 & 曲柄：转角直接取「行进里程 / 轮半径」，严格随速度与里程变化，
    // 且不依赖每帧 dt（掉帧、变速、暂停都不会让轮子与地面打滑或跳变）。
    this.wheelAngle = (this.dist / WHEEL_R) % (Math.PI * 2);
    this.crankAngle = (this.dist / WHEEL_R * CRANK_RATIO) % (Math.PI * 2);
    this.bike.rearWheel.rotation.x = this.wheelAngle;
    this.bike.frontWheel.rotation.x = this.wheelAngle;
    this.bike.crank.rotation.x = this.crankAngle;

    const tt = performance.now() * 0.001;

    // 踏板 → 腿/脚
    for (let i = 0; i < 2; i++) {
      const side = this.legs[i].side;
      const baseAng = side === -1 ? 0 : Math.PI;
      const ang = this.crankAngle + baseAng;
      const pivot = this.bike.pedalPivots[i].pivot;
      // 踏板保持水平
      pivot.rotation.x = -this.crankAngle;

      // 踏板在自行车 root 局部坐标
      const pedalLocal = new THREE.Vector3(side * 0.085, 0.30 + Math.cos(ang) * CRANK_R, 0.05 + Math.sin(ang) * CRANK_R);
      const ankle = pedalLocal.clone().add(new THREE.Vector3(0, 0.075, 0.0));

      const hip = this.legs[i].hip;
      const mid = hip.clone().lerp(ankle, 0.5);
      const knee = mid.clone().add(new THREE.Vector3(
        side * 0.11,
        0.03 + 0.05 * Math.sin(tt * 2 + i),
        0.16 + 0.10 * Math.cos(ang)
      ));
      this.legs[i].tube.update(hip, knee, ankle, 0.045, 0.03);

      // 蹼随踏板
      this.feet[i].position.copy(pedalLocal);
      this.feet[i].position.y += 0.045;
      this.feet[i].rotation.set(0, 0, 0);
    }

    // 脖子/头 呼吸 + 摆动
    const bob = Math.sin(this.wheelAngle * 2) * 0.012;
    const look = Math.sin(tt * 0.6) * 0.05 + Math.sin(tt * 1.7) * 0.02;
    this.goose.head.rotation.y = look;
    this.goose.head.position.y = 2.17 + bob + Math.sin(tt * 1.3) * 0.008;
    this.group.position.y += 0.0;

    // 翅膀轻颤
    for (let i = 0; i < this.goose.wings.length; i++) {
      const w = this.goose.wings[i];
      const s = i === 0 ? -1 : 1;
      w.rotation.z = Math.sin(tt * 3.1 + i) * 0.03 * s;
      w.rotation.x = Math.sin(tt * 2.2 + i * 1.5) * 0.02;
    }

    // 围巾飘动
    const flow = 0.12 + Math.min(this.speed / 30, 0.5);
    this.goose.scarfSegs.forEach((s, i) => {
      s.rotation.x = 0.14 + Math.sin(tt * 4 - i * 0.7) * 0.16 * flow;
      s.rotation.y = Math.sin(tt * 3.2 - i * 0.9) * 0.10 * flow;
    });

    this.position.copy(this._pos);
    this.tangent.copy(this._tan);
  }
}
