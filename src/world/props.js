// 岛上人工地物：村庄、风车、灯塔、码头渔船、农场，以及沿路设施。
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { makeRng, fbm, smoothstep, clamp, lerp } from '../util/noise.js';
import { mergeAll, cylinderBetween } from '../util/geo.js';

const P = {
  plaster: 0xeee3cd,
  plaster2: 0xe6d3b6,
  brick: 0xb5644a,
  wood: 0x8a5a34,
  woodDark: 0x5f3d22,
  roofA: 0x9c4436,
  roofB: 0x44586b,
  roofC: 0x6b4a3a,
  stone: 0x9c958a,
  stoneDark: 0x6f6a60,
  white: 0xf4f1ea,
  red: 0xc0392b,
  metal: 0x8a9099,
  glass: 0xa9c7d6,
  sail: 0xf0ece0,
  straw: 0xd9b96a,
  crop: 0x8fae4a,
  crop2: 0xb0a34a,
};

const cache = {};
function mat(color, rough = 0.85, metal = 0.0, extra = {}) {
  const k = color + '|' + rough + '|' + metal + '|' + JSON.stringify(extra);
  if (!cache[k]) cache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  return cache[k];
}
const emissive = (color, inten) => new THREE.MeshStandardMaterial({ color, emissive: 0xffcf8a, emissiveIntensity: inten, roughness: 0.4 });

function addBox(g, w, h, d, m, x = 0, y = 0, z = 0, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.rotation.y = ry;
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
function addCyl(g, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
function addCone(g, r, h, m, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}

function gableRoof(w, d, h, m, overhang = 0.35) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0);
  shape.lineTo(w / 2 + overhang, 0);
  shape.lineTo(0, h);
  shape.lineTo(-w / 2 - overhang, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(d + overhang * 2) / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ---------- 房屋 ----------
function makeHouse(rng, style) {
  const g = new THREE.Group();
  const w = 3.2 + rng() * 1.6;
  const d = 3.0 + rng() * 1.8;
  const h = 2.6 + rng() * 1.0;
  const wallMat = mat(style.wall);
  const roofMat = mat(style.roof);

  addBox(g, w, h, d, wallMat, 0, h / 2, 0);
  // 半木结构装饰
  if (style.timber) {
    const m = mat(P.woodDark);
    addBox(g, w, 0.16, 0.1, m, 0, h * 0.75, d / 2 + 0.01);
    addBox(g, w, 0.16, 0.1, m, 0, h * 0.4, d / 2 + 0.01);
    addBox(g, 0.14, h, 0.1, m, -w / 4, h / 2, d / 2 + 0.01);
    addBox(g, 0.14, h, 0.1, m, w / 4, h / 2, d / 2 + 0.01);
  }
  // 屋顶
  const roof = gableRoof(w, d, 1.5 + rng() * 0.6, roofMat);
  roof.position.y = h;
  g.add(roof);
  // 烟囱
  if (rng() < 0.7) {
    addBox(g, 0.5, 1.4, 0.5, mat(P.brick), -w * 0.28, h + 0.8, d * 0.2);
  }
  // 门
  addBox(g, 0.9, 1.7, 0.12, mat(P.woodDark), 0, 0.85, d / 2 + 0.03);
  // 窗
  const wm = rng() < 0.6 ? emissive(0xffe6b0, 0.8) : mat(P.glass, 0.15, 0.2);
  for (const sx of [-1, 1]) {
    addBox(g, 0.7, 0.7, 0.1, mat(P.woodDark), sx * w * 0.28, h * 0.62, d / 2 + 0.02);
    addBox(g, 0.55, 0.55, 0.06, wm, sx * w * 0.28, h * 0.62, d / 2 + 0.06);
  }
  // 窗台花箱
  if (rng() < 0.6) {
    for (const sx of [-1, 1]) {
      addBox(g, 0.7, 0.16, 0.24, mat(P.wood), sx * w * 0.28, h * 0.62 - 0.42, d / 2 + 0.12);
      for (let k = -1; k <= 1; k++) {
        const f = addCyl(g, 0.06, 0.06, 0.12, mat([0xe8617a, 0xf2d24b, 0xe8617a][(k + 1)]), sx * w * 0.28 + k * 0.18, h * 0.62 - 0.28, d / 2 + 0.12, 6);
        f.castShadow = false;
      }
    }
  }
  return g;
}

function makeBarn(rng) {
  const g = new THREE.Group();
  const w = 6.5, d = 9, h = 3.6;
  addBox(g, w, h, d, mat(P.brick), 0, h / 2, 0);
  addBox(g, w + 0.2, 0.2, d + 0.2, mat(P.woodDark), 0, h, 0);
  // 复折屋顶
  const lower = gableRoof(w, d, 1.4, mat(P.roofC), 0.4);
  lower.position.y = h + 0.1;
  g.add(lower);
  const upper = gableRoof(w * 0.55, d, 1.2, mat(P.roofC), 0.2);
  upper.position.y = h + 1.5;
  g.add(upper);
  // 大门
  addBox(g, 2.6, 2.8, 0.16, mat(P.wood), 0, 1.4, d / 2 + 0.05);
  addBox(g, 2.6, 0.2, 0.2, mat(P.woodDark), 0, 2.8, d / 2 + 0.1);
  addBox(g, 0.2, 2.8, 0.2, mat(P.woodDark), 0, 1.4, d / 2 + 0.12);
  // 换气窗
  addBox(g, 0.9, 0.9, 0.1, mat(P.woodDark), 0, h + 1.2, d / 2 + 0.02, 0.785);
  return g;
}

function makeSilo() {
  const g = new THREE.Group();
  addCyl(g, 1.5, 1.5, 7, mat(P.white), 0, 3.5, 0, 20);
  for (let i = 0; i < 8; i++) {
    addCyl(g, 1.52, 1.52, 0.08, mat(P.stoneDark), 0, 0.6 + i * 0.85, 0, 20);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(P.metal, 0.5, 0.5));
  dome.position.y = 7; dome.castShadow = true; g.add(dome);
  return g;
}

// ---------- 风车 ----------
function makeWindmill() {
  const g = new THREE.Group();
  const stone = mat(P.stone);
  addCyl(g, 3.0, 3.6, 2.2, stone, 0, 1.1, 0, 20);
  addCyl(g, 2.2, 3.0, 5.0, mat(P.plaster2), 0, 4.6, 0, 20);
  const cap = addCone(g, 2.4, 2.2, mat(P.roofB), 0, 8.2, 0, 20);
  // 窗
  addBox(g, 0.6, 0.9, 0.2, mat(P.glass, 0.15, 0.2), 0, 4.6, 2.6);
  addBox(g, 0.8, 1.4, 0.2, mat(P.woodDark), 0, 1.0, 3.0);
  // 风车叶片
  const hub = new THREE.Group();
  hub.position.set(0, 7.6, 2.3);
  const hubC = addCyl(g, 0.3, 0.3, 0.5, mat(P.metal, 0.4, 0.6), 0, 7.6, 2.3, 10);
  hubC.rotation.x = Math.PI / 2;
  const bladeMat = mat(0x6b5334, 0.9);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i / 4) * Math.PI * 2;
    addBox(b, 0.45, 7.0, 0.16, bladeMat, 0, 3.5, 0);
    // 叶片骨架
    for (let s = 0; s < 7; s++) {
      addBox(b, 0.5, 0.08, 0.24, mat(P.woodDark), 0, 0.6 + s * 0.9, 0);
    }
    b.castShadow = true;
    hub.add(b);
  }
  g.add(hub);
  g.userData.hub = hub;
  return g;
}

// ---------- 灯塔 ----------
function makeLighthouse() {
  const g = new THREE.Group();
  const H = 12;
  const towerGeos = [];
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const r0 = lerp(1.7, 0.95, t0), r1 = lerp(1.7, 0.95, t1);
    const h = H / steps;
    const c = i % 2 === 0 ? P.white : P.red;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 22), mat(c));
    seg.position.y = H * t0 + h / 2;
    seg.castShadow = true; seg.receiveShadow = true;
    g.add(seg);
  }
  // 观景台
  addCyl(g, 1.35, 1.35, 0.25, mat(P.stoneDark), 0, H + 0.12, 0, 22);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    addCyl(g, 0.04, 0.04, 0.7, mat(P.metal, 0.4, 0.6), Math.cos(a) * 1.2, H + 0.58, Math.sin(a) * 1.2, 6);
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.04, 6, 24), mat(P.metal, 0.4, 0.6));
  rail.rotation.x = Math.PI / 2; rail.position.y = H + 0.92; g.add(rail);
  // 灯室
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.0, side: THREE.DoubleSide }));
  glass.position.y = H + 1.6; g.add(glass);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), emissive(0xffe7b0, 2.2));
  lamp.position.y = H + 1.6; g.add(lamp);
  const light = new THREE.PointLight(0xffd9a0, 4, 40, 2);
  light.position.y = H + 1.6; g.add(light);
  addCone(g, 1.15, 1.2, mat(P.roofB), 0, H + 2.9, 0, 18);
  addCyl(g, 0.06, 0.06, 0.7, mat(P.metal, 0.4, 0.6), 0, H + 3.7, 0, 6);
  // 旋转光束
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  beam.rotation.z = Math.PI / 2;
  beam.position.set(17, H + 1.6, 0);
  const beamGroup = new THREE.Group();
  beamGroup.position.y = 0;
  beamGroup.add(beam);
  g.add(beamGroup);
  g.userData.beam = beamGroup;
  return g;
}

// ---------- 码头 + 小船 ----------
function makeBoat(rng, sailColor) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat(P.woodDark, 0.8));
  hull.scale.set(0.9, 0.55, 2.4);
  hull.position.y = 0.1;
  hull.castShadow = true;
  g.add(hull);
  const deck = addBox(g, 1.5, 0.12, 3.6, mat(P.wood), 0, 0.55, 0);
  deck.scale.set(1, 1, 1);
  addBox(g, 1.7, 0.16, 0.5, mat(P.wood), 0, 0.66, -1.4);
  // 桅杆 + 帆
  if (rng() < 0.8) {
    addCyl(g, 0.06, 0.07, 3.6, mat(P.woodDark), 0, 2.4, 0.2, 8);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), mat(sailColor, 0.9, 0, { side: THREE.DoubleSide }));
    sail.position.set(0.05, 2.6, 0.25);
    g.add(sail);
  }
  // 桨
  addBox(g, 0.08, 0.08, 1.8, mat(P.wood), 0.7, 0.66, 0, 0.3);
  return g;
}

// 注意：栈桥沿本地 +z 延伸（放好后用 atan2(dir.x, dir.z) 朝向海面）
function makeDock(rng, length, width = 3.2) {
  const g = new THREE.Group();
  const plankMat = mat(P.wood, 0.9);
  const N = Math.floor(length / 0.5);
  for (let i = 0; i < N; i++) {
    addBox(g, width, 0.14, 0.42, plankMat, 0, 0.6, i * 0.5);
  }
  for (let i = 0; i < length / 3; i++) {
    for (const sx of [-1, 1]) {
      addCyl(g, 0.16, 0.18, 2.4, mat(P.woodDark), sx * (width / 2 - 0.2), 0.0, i * 3);
    }
  }
  for (const sx of [-1, 1]) addCyl(g, 0.14, 0.14, 1.0, mat(P.woodDark), sx * (width / 2 - 0.2), 1.1, Math.max(1, length - 0.6));
  return g;
}

// 帆船（远海）
function makeSailboat(rng) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat(P.white, 0.6));
  hull.scale.set(1.1, 0.5, 3.2);
  hull.position.y = 0.2;
  hull.castShadow = true;
  g.add(hull);
  addBox(g, 1.6, 0.2, 4.6, mat(P.wood), 0, 0.6, 0);
  addCyl(g, 0.07, 0.09, 6.0, mat(P.woodDark), 0, 3.6, 0.3, 8);
  const jib = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.4), mat(0xf6f4ee, 0.95, 0, { side: THREE.DoubleSide }));
  jib.position.set(0, 2.6, 1.6);
  g.add(jib);
  const main = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.4), mat(0xf6f4ee, 0.95, 0, { side: THREE.DoubleSide }));
  main.position.set(0, 3.0, -1.0);
  g.add(main);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), mat(P.red, 0.9, 0, { side: THREE.DoubleSide }));
  flag.position.set(0.4, 6.6, 0.3);
  g.add(flag);
  return g;
}

function makeBuoy(rng) {
  const g = new THREE.Group();
  addCyl(g, 0.5, 0.6, 1.1, mat(rng() < 0.5 ? P.red : 0xe0a021, 0.7), 0, 0.4, 0, 12);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 12), mat(P.metal, 0.5, 0.4));
  top.position.y = 1.2; g.add(top);
  addCyl(g, 0.04, 0.04, 1.0, mat(P.metal, 0.5, 0.4), 0, 1.9, 0, 6);
  return g;
}

// 热气球（点缀天空）
function makeBalloon(rng) {
  const g = new THREE.Group();
  const stripes = 8;
  const cols = [0xe0533f, 0xf2c14e, 0x4f9fd6, 0xf0f0e8, 0x63b06a];
  for (let i = 0; i < stripes; i++) {
    const geo = new THREE.SphereGeometry(3.2, 10, 16, (i / stripes) * Math.PI * 2, (Math.PI * 2) / stripes, 0, Math.PI * 0.72);
    const m = new THREE.Mesh(geo, mat(cols[i % cols.length], 0.75));
    g.add(m);
  }
  addCyl(g, 0.6, 0.9, 1.2, mat(P.wood, 0.9), 0, -4.4, 0, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    addCyl(g, 0.02, 0.02, 1.4, mat(0x4a3a2a, 0.9), Math.cos(a) * 2.2, -2.4, Math.sin(a) * 2.2, 4);
  }
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), emissive(0xffb14a, 1.6));
  fire.position.y = -3.6;
  g.add(fire);
  return g;
}

// ---------- 沿路设施 ----------
function makeLampPost() {
  const g = new THREE.Group();
  addCyl(g, 0.06, 0.1, 3.0, mat(0x2f3439, 0.5, 0.5), 0, 1.5, 0, 10);
  addCyl(g, 0.02, 0.02, 0.5, mat(0x2f3439, 0.5, 0.5), 0, 2.95, 0.22, 6).rotation.x = 0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0xfff0c8, 0.3, 0.2, { emissive: 0x000000 }));
  head.position.set(0, 3.0, 0.4); g.add(head);
  addCone(g, 0.3, 0.28, mat(0x2f3439, 0.5, 0.5), 0, 3.18, 0.4, 12);
  return g;
}

function makeSignpost(text) {
  const g = new THREE.Group();
  addCyl(g, 0.07, 0.08, 2.2, mat(P.woodDark), 0, 1.1, 0, 8);
  const b = addBox(g, 1.2, 0.4, 0.08, mat(P.wood), 0.3, 1.9, 0.05);
  b.rotation.y = 0.3;
  const b2 = addBox(g, 1.0, 0.34, 0.08, mat(P.wood), -0.25, 1.45, -0.05);
  b2.rotation.y = -0.4;
  return g;
}

function makeBench() {
  const g = new THREE.Group();
  const m = mat(P.wood, 0.9);
  addBox(g, 1.8, 0.1, 0.5, m, 0, 0.45, 0);
  addBox(g, 1.8, 0.1, 0.45, m, 0, 0.85, -0.22, 0).rotation.x = -0.15;
  for (const sx of [-1, 1]) {
    addBox(g, 0.1, 0.45, 0.5, mat(P.woodDark), sx * 0.8, 0.22, 0);
  }
  return g;
}

function makeFenceSegment(len) {
  const g = new THREE.Group();
  const m = mat(P.wood, 0.9);
  addBox(g, len, 0.08, 0.06, m, 0, 0.6, 0);
  addBox(g, len, 0.08, 0.06, m, 0, 0.95, 0);
  addBox(g, 0.09, 1.1, 0.09, mat(P.woodDark), -len / 2, 0.55, 0);
  addBox(g, 0.09, 1.1, 0.09, mat(P.woodDark), len / 2, 0.55, 0);
  return g;
}

function makeHaystack(rng) {
  const g = new THREE.Group();
  const m = mat(P.straw, 0.95);
  addCyl(g, 1.5, 1.7, 1.9, m, 0, 0.95, 0, 14);
  addCone(g, 1.8, 1.4, m, 0, 2.5, 0, 14);
  return g;
}

function makeWell() {
  const g = new THREE.Group();
  addCyl(g, 0.9, 1.0, 0.9, mat(P.stone), 0, 0.45, 0, 16);
  addCyl(g, 0.75, 0.75, 0.1, mat(0x2b3138), 0, 0.92, 0, 16);
  for (const sx of [-1, 1]) addBox(g, 0.12, 1.4, 0.12, mat(P.woodDark), sx * 0.8, 1.4, 0);
  addBox(g, 2.0, 0.14, 0.14, mat(P.woodDark), 0, 2.0, 0);
  const roof = makeGableRoof2(2.0, 1.4, 0.7, mat(P.roofC));
  roof.position.y = 2.1;
  g.add(roof);
  return g;
}
function makeGableRoof2(w, d, h, m) {
  const geo = new THREE.ConeGeometry(w / 1.42, h, 4);
  geo.rotateY(Math.PI / 4);
  geo.scale(1, 1, d / w);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  return mesh;
}

function makeStartGate() {
  const g = new THREE.Group();
  const m = mat(P.wood, 0.6);
  for (const sx of [-1, 1]) addBox(g, 0.4, 6, 0.4, mat(P.woodDark), sx * 7, 3, 0);
  addBox(g, 15, 0.5, 0.6, m, 0, 5.6, 0);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 1.6), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.9, side: THREE.DoubleSide }));
  banner.position.set(0, 4.6, 0);
  g.add(banner);
  return g;
}
function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const ctx = c.getContext('2d');
  const n = 16, m = 2;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    ctx.fillStyle = (i + j) % 2 ? '#1c1c1c' : '#f2f2ee';
    ctx.fillRect((i / n) * c.width, (j / m) * c.height, c.width / n + 1, c.height / m + 1);
  }
  ctx.fillStyle = '#c9403a';
  ctx.fillRect(0, 0, c.width, 3);
  ctx.fillRect(0, c.height - 3, c.width, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- 装配 ----------
export function createProps(scene, terrain, road) {
  const rng = makeRng(WORLD.seed ^ 0x5eed77);
  const group = new THREE.Group();
  group.name = 'props';
  const updatables = [];

  const slopeOK = (x, z, max = 0.3) => terrain.slopeAt(x, z) < max;

  // --- 村庄 ---
  const A = 0.62;
  const streetCenter = new THREE.Vector3(Math.cos(A) * (WORLD.roadRadius + 26), 0, Math.sin(A) * (WORLD.roadRadius + 26));
  const houseStyles = [
    { wall: P.plaster, roof: P.roofA, timber: true },
    { wall: P.plaster2, roof: P.roofB, timber: true },
    { wall: P.brick, roof: P.roofC, timber: false },
    { wall: P.plaster, roof: P.roofB, timber: true },
  ];
  const NH = 14;
  for (let i = 0; i < NH; i++) {
    const along = (i / (NH - 1) - 0.5) * 62;
    const side = i % 2 === 0 ? 1 : -1;
    const tangent = new THREE.Vector3(-Math.sin(A), 0, Math.cos(A));
    const outward = new THREE.Vector3(Math.cos(A), 0, Math.sin(A));
    const px = streetCenter.x + tangent.x * along + outward.x * side * (11 + rng() * 4);
    const pz = streetCenter.z + tangent.z * along + outward.z * side * (11 + rng() * 4);
    if (!slopeOK(px, pz, 0.34)) continue;
    if (road.nearRoad(px, pz, 7)) continue;
    const house = makeHouse(rng, houseStyles[(rng() * houseStyles.length) | 0]);
    house.position.set(px, terrain.heightAt(px, pz) - 0.15, pz);
    house.rotation.y = Math.atan2(px - streetCenter.x, pz - streetCenter.z) + Math.PI / 2 + (rng() - 0.5) * 0.5;
    group.add(house);
  }
  // 村中水井
  {
    const px = streetCenter.x, pz = streetCenter.z;
    const well = makeWell();
    well.position.set(px, terrain.heightAt(px, pz) - 0.1, pz);
    group.add(well);
  }
  // 谷仓 + 筒仓（村外农田）
  {
    const bx = streetCenter.x + Math.cos(A) * 34, bz = streetCenter.z + Math.sin(A) * 34;
    if (terrain.heightAt(bx, bz) > 3) {
      const barn = makeBarn(rng);
      barn.position.set(bx, terrain.heightAt(bx, bz) - 0.1, bz);
      barn.rotation.y = A + Math.PI / 2;
      group.add(barn);
      const silo = makeSilo();
      silo.position.set(bx + 5.5, terrain.heightAt(bx + 5.5, bz - 2) - 0.1, bz - 2);
      group.add(silo);
      for (let i = 0; i < 5; i++) {
        const hx = bx - 12 - i * 3.2, hz = bz + (rng() - 0.5) * 8;
        if (terrain.heightAt(hx, hz) < 3) continue;
        const hs = makeHaystack(rng);
        hs.position.set(hx, terrain.heightAt(hx, hz), hz);
        hs.rotation.y = rng() * 6.28;
        group.add(hs);
      }
    }
  }

  // --- 风车（找一处高地）---
  {
    let best = null, bestH = -1;
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const r = WORLD.roadRadius * (0.72 + rng() * 0.18);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrain.heightAt(x, z);
      if (h > 30 && slopeOK(x, z, 0.22) && !road.nearRoad(x, z, 12) && h > bestH) { best = { x, z, h }; bestH = h; }
    }
    if (best) {
      const wm = makeWindmill();
      wm.position.set(best.x, best.h - 0.2, best.z);
      wm.rotation.y = rng() * 6.28;
      group.add(wm);
      updatables.push((dt) => { wm.userData.hub.rotation.z += dt * 0.6; });
    }
  }

  // --- 灯塔（海岬）---
  {
    let best = null, bestScore = -1;
    for (let i = 0; i < 400; i++) {
      const a = rng() * Math.PI * 2;
      const r = WORLD.islandRadius * (0.86 + rng() * 0.14);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrain.heightAt(x, z);
      if (h < 6 || h > 40) continue;
      if (!slopeOK(x, z, 0.4)) continue;
      // 偏好三面靠海
      let sea = 0;
      for (let k = 0; k < 8; k++) {
        const aa = (k / 8) * Math.PI * 2;
        if (terrain.heightAt(x + Math.cos(aa) * 90, z + Math.sin(aa) * 90) < 0) sea++;
      }
      if (sea > bestScore) { bestScore = sea; best = { x, z, h }; }
    }
    if (best) {
      const lh = makeLighthouse();
      lh.position.set(best.x, best.h - 0.3, best.z);
      group.add(lh);
      updatables.push((dt, t) => { lh.userData.beam.rotation.y = t * 0.5; });
    }
  }

  // --- 码头 + 渔船 ---
  {
    let placed = 0;
    for (let i = 0; i < 800 && placed < 2; i++) {
      const a = rng() * Math.PI * 2;
      const r = WORLD.islandRadius * (0.98 + rng() * 0.05);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrain.heightAt(x, z);
      if (h < -2 || h > 5) continue;
      const outward = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const dockLen = 14 + rng() * 8;
      const dock = makeDock(rng, dockLen);
      dock.position.set(x, Math.min(h, 2), z);
      dock.rotation.y = Math.atan2(outward.x, outward.z);
      group.add(dock);
      for (let b = 0; b < 2; b++) {
        const boat = makeBoat(rng, rng() < 0.5 ? P.sail : 0xdce8ea);
        const side = (b === 0 ? 1 : -1) * 3.2;
        const bx = x + outward.x * (dockLen * 0.55 + b * 3) - outward.z * side;
        const bz = z + outward.z * (dockLen * 0.55 + b * 3) + outward.x * side;
        boat.position.set(bx, WORLD.waterLevel + 0.15, bz);
        boat.rotation.y = Math.atan2(outward.x, outward.z) + (rng() - 0.5) * 0.6;
        const phase = rng() * 6.28;
        group.add(boat);
        updatables.push((dt, t) => {
          boat.position.y = WORLD.waterLevel + 0.15 + Math.sin(t * 1.1 + phase) * 0.12;
          boat.rotation.z = Math.sin(t * 0.9 + phase) * 0.04;
          boat.rotation.x = Math.cos(t * 0.7 + phase) * 0.03;
        });
      }
      placed++;
    }
  }

  // --- 起点/终点拱门 ---
  {
    const p = road.points[0];
    const q = road.points[6];
    const dir = new THREE.Vector3().subVectors(q.p, p.p).normalize();
    const gate = makeStartGate();
    gate.position.copy(p.p);
    gate.position.y = p.p.y + 0.1;
    gate.rotation.y = Math.atan2(dir.x, dir.z);
    group.add(gate);
  }

  // --- 沿路设施 ---
  const pts = road.points;
  const halfW = road.width * 0.5;
  for (let i = 0; i < pts.length; i += 13) {
    const q = pts[i];
    const right = q.r;
    const side = (i % 26 === 0) ? 1 : -1;
    const edge = halfW + 1.6;
    const px = q.p.x + right.x * side * edge;
    const pz = q.p.z + right.z * side * edge;
    const h = terrain.heightAt(px, pz);
    if (h < 1.5 || terrain.slopeAt(px, pz) > 0.4) continue;
    if (i % 39 === 0) {
      const lamp = makeLampPost();
      lamp.position.set(px, h, pz);
      group.add(lamp);
    } else if (i % 91 === 0) {
      const bench = makeBench();
      bench.position.set(px, h, pz);
      bench.rotation.y = Math.atan2(right.x, right.z) + (side > 0 ? 0 : Math.PI);
      group.add(bench);
    } else if (i % 143 === 0) {
      const sign = makeSignpost('');
      sign.position.set(px, h, pz);
      sign.rotation.y = Math.atan2(right.x, right.z);
      group.add(sign);
    }
  }

  // --- 田间木栅栏（沿路的几段）---
  for (let i = 0; i < pts.length; i += 4) {
    const q = pts[i];
    const right = q.r;
    const px = q.p.x + right.x * (halfW + 2.2);
    const pz = q.p.z + right.z * (halfW + 2.2);
    const h = terrain.heightAt(px, pz);
    if (h < 2 || terrain.slopeAt(px, pz) > 0.45) continue;
    // 只在两段弧区放置
    const t = i / pts.length;
    if (!((t > 0.16 && t < 0.24) || (t > 0.62 && t < 0.7))) continue;
    const seg = makeFenceSegment(2.3);
    seg.position.set(px, h, pz);
    seg.rotation.y = Math.atan2(right.x, right.z);
    group.add(seg);
  }

  // --- 路侧轮廓标（白柱红环）---
  {
    const geos = [];
    for (let i = 0; i < pts.length; i += 9) {
      const q = pts[i];
      const right = q.r;
      const side = (i % 18 === 0) ? 1 : -1;
      const px = q.p.x + right.x * side * (halfW + 0.9);
      const pz = q.p.z + right.z * side * (halfW + 0.9);
      const h = terrain.heightAt(px, pz);
      if (h < 1.2) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.95, 6), mat(P.white, 0.7));
      post.position.set(px, h + 0.42, pz);
      group.add(post);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.16, 6), mat(P.red, 0.7));
      band.position.set(px, h + 0.72, pz);
      group.add(band);
    }
  }

  // --- 农田（谷仓附近的作物行）---
  {
    const fx = streetCenter.x + Math.cos(A) * 58, fz = streetCenter.z + Math.sin(A) * 58;
    const fh = terrain.heightAt(fx, fz);
    if (fh > 4) {
      const W = 26, D = 22, rows = 14;
      const cropGeos = [];
      for (let r = 0; r < rows; r++) {
        const local = (r / (rows - 1) - 0.5) * D;
        for (let c = 0; c < 30; c++) {
          const nx = (c / 29 - 0.5) * W;
          const x = fx + Math.cos(A) * nx - Math.sin(A) * local;
          const z = fz + Math.sin(A) * nx + Math.cos(A) * local;
          const h = terrain.heightAt(x, z);
          if (h < 3) continue;
          const g = new THREE.ConeGeometry(0.28, 0.9, 5);
          g.translate(0, 0.45, 0);
          g.translate(x, h, z);
          cropGeos.push(g);
        }
      }
      if (cropGeos.length) {
        const crop = new THREE.Mesh(mergeAll(cropGeos, P.crop), mat(P.crop, 0.95));
        crop.receiveShadow = true;
        group.add(crop);
      }
    }
  }

  // --- 近岸浮标 ---
  {
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      const r = WORLD.islandRadius * (1.06 + rng() * 0.16);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const b = makeBuoy(rng);
      b.position.set(x, WORLD.waterLevel, z);
      const phase = rng() * 6.28;
      group.add(b);
      updatables.push((dt, t) => {
        b.position.y = WORLD.waterLevel - 0.25 + Math.sin(t * 1.4 + phase) * 0.22;
        b.rotation.z = Math.sin(t * 1.2 + phase) * 0.08;
      });
    }
  }

  // --- 远海帆船 ---
  {
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = WORLD.islandRadius * (1.5 + rng() * 1.6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = makeSailboat(rng);
      s.position.set(x, WORLD.waterLevel, z);
      s.rotation.y = rng() * 6.28;
      s.scale.setScalar(1.1 + rng() * 0.5);
      const phase = rng() * 6.28;
      group.add(s);
      updatables.push((dt, t) => {
        s.position.y = WORLD.waterLevel + Math.sin(t * 0.8 + phase) * 0.3;
        s.rotation.z = Math.sin(t * 0.7 + phase) * 0.05;
      });
    }
  }

  // --- 热气球 ---
  {
    for (let i = 0; i < 2; i++) {
      const b = makeBalloon(rng);
      const r0 = WORLD.islandRadius * (0.5 + rng() * 0.5);
      const speed = 0.008 + rng() * 0.006;
      const y0 = 120 + rng() * 90;
      const phase = rng() * 6.28;
      group.add(b);
      updatables.push((dt, t) => {
        const ang = phase + t * speed;
        b.position.set(Math.cos(ang) * r0, y0 + Math.sin(t * 0.15 + phase) * 8, Math.sin(ang) * r0);
        b.rotation.y = -ang;
        b.rotation.z = Math.sin(t * 0.5 + phase) * 0.05;
      });
    }
  }

  scene.add(group);
  return { group, update: (dt, t) => updatables.forEach((f) => f(dt, t)) };
}
