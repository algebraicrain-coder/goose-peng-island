// 植被与散石：全部合并几何 + InstancedMesh，兼顾数量与性能。
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { makeRng, fbm, smoothstep, lerp } from '../util/noise.js';
import { mergeAll } from '../util/geo.js';
import { PONDS } from './terrain.js';

const C = {
  trunk: 0x6b4a2f,
  trunk2: 0x8a6a45,
  pine1: 0x2f5a34,
  pine2: 0x3c6e3e,
  pine3: 0x24502c,
  leaf1: 0x4c8038,
  leaf2: 0x5f9b45,
  leaf3: 0x3f6f30,
  palm: 0x3f7a3a,
  palm2: 0x59a04a,
  rock: 0x8b8577,
  rock2: 0x6d675b,
  bush: 0x467a37,
  bush2: 0x5b8f45,
  grass1: 0x4d7a35,
  grass2: 0x74a44a,
  flower: [0xe8617a, 0xf2d24b, 0xf0f0f0, 0xb07ad6, 0xf2964b],
};

function cyl(a, b, r1, r2, seg = 8, color = C.trunk) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  m.setPosition(a);
  g.applyMatrix4(m);
  return g;
}

function blob(r, color, sx = 1, sy = 1, sz = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(sx, sy, sz);
  return g;
}

// ---- 树木几何 ----
function pineGeo() {
  const trunk = mergeAll([cyl(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.6, 0), 0.16, 0.1, 8)], C.trunk);
  const tiers = [
    { r: 1.9, h: 3.2, y: 3.0, c: C.pine3 },
    { r: 1.5, h: 2.8, y: 4.7, c: C.pine1 },
    { r: 1.1, h: 2.4, y: 6.2, c: C.pine2 },
    { r: 0.62, h: 2.0, y: 7.6, c: C.pine1 },
  ];
  const foliage = tiers.map((t) => {
    const g = new THREE.ConeGeometry(t.r, t.h, 9, 1);
    g.translate(0, t.y + t.h * 0.15, 0);
    return mergeAll([g], t.c);
  });
  return mergeAll([trunk, ...foliage], 0xffffff);
}

function broadleafGeo(rng) {
  const parts = [];
  parts.push(cyl(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.9, 0), 0.19, 0.12, 8));
  parts.push(cyl(new THREE.Vector3(0, 2.4, 0), new THREE.Vector3(0.7, 3.4, 0.3), 0.09, 0.06, 6));
  parts.push(cyl(new THREE.Vector3(0, 2.4, 0), new THREE.Vector3(-0.6, 3.3, -0.4), 0.09, 0.06, 6));
  const trunk = mergeAll(parts, C.trunk2);
  const canopy = [];
  const clusters = [
    [0, 4.6, 0, 1.9], [1.3, 4.1, 0.5, 1.4], [-1.2, 4.2, -0.5, 1.4],
    [0.4, 5.5, -0.8, 1.3], [-0.6, 5.4, 0.7, 1.25],
  ];
  clusters.forEach((c, i) => {
    const g = new THREE.IcosahedronGeometry(c[3], 1);
    g.scale(1.05, 0.9, 1.05);
    g.translate(c[0], c[1], c[2]);
    canopy.push(g);
  });
  const leaf = mergeAll(canopy, C.leaf2);
  return mergeAll([trunk, leaf], 0xffffff);
}

function palmGeo(rng) {
  const geos = [];
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector3(Math.sin(t * 1.1) * 1.6, t * 6.4, Math.sin(t * 0.6) * 0.4));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunkGeo = [];
  const steps = 12;
  let prev = curve.getPointAt(0);
  for (let i = 1; i <= steps; i++) {
    const cur = curve.getPointAt(i / steps);
    trunkGeo.push(cyl(prev, cur, lerp(0.22, 0.1, i / steps), lerp(0.22, 0.1, (i + 1) / steps), 7));
    prev = cur;
  }
  const trunk = mergeAll(trunkGeo, 0x9a7b52);
  const top = curve.getPointAt(1);
  const fronds = [];
  const NF = 9;
  for (let i = 0; i < NF; i++) {
    const a = (i / NF) * Math.PI * 2 + 0.3;
    const len = 3.4 + Math.sin(i * 2.1) * 0.5;
    const fp = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      const droop = -t * t * 2.0;
      fp.push(new THREE.Vector3(
        top.x + Math.cos(a) * len * t,
        top.y + 0.2 + droop,
        top.z + Math.sin(a) * len * t
      ));
    }
    const fc = new THREE.CatmullRomCurve3(fp);
    // 用扁平的连续小段模拟羽叶
    let pv = fc.getPointAt(0);
    for (let s = 1; s <= 6; s++) {
      const cv = fc.getPointAt(s / 6);
      const seg = cyl(pv, cv, lerp(0.16, 0.02, s / 6), lerp(0.16, 0.02, (s + 1) / 6), 5, C.palm);
      seg.scale(1, 0.35, 1);
      fronds.push(seg);
      pv = cv;
    }
  }
  const leaves = mergeAll(fronds, C.palm2);
  const coconuts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(0.16, 1);
    g.translate(top.x + Math.cos(i * 2.1) * 0.3, top.y - 0.1, top.z + Math.sin(i * 2.1) * 0.3);
    coconuts.push(g);
  }
  return mergeAll([trunk, leaves, mergeAll(coconuts, 0x6b4f2a)], 0xffffff);
}

function rockGeo(rng) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    const f = 0.7 + rng() * 0.6;
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.75, pos.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

function bushGeo() {
  const parts = [];
  const blobs = [[0, 0.5, 0, 0.7], [0.5, 0.35, 0.3, 0.5], [-0.5, 0.4, -0.2, 0.55], [0.1, 0.8, -0.3, 0.5]];
  blobs.forEach((b) => {
    const g = new THREE.IcosahedronGeometry(b[3], 1);
    g.scale(1, 0.8, 1);
    g.translate(b[0], b[1], b[2]);
    parts.push(g);
  });
  return mergeAll(parts, C.bush2);
}

function grassGeo() {
  const blades = [];
  const NB = 5;
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * Math.PI * 2 + 0.4;
    const h = 0.55 + (i % 2) * 0.22;
    const bend = 0.16;
    const g = new THREE.BufferGeometry();
    const w = 0.045;
    const ox = Math.cos(a) * 0.06, oz = Math.sin(a) * 0.06;
    const verts = new Float32Array([
      ox - w, 0, oz, ox + w, 0, oz,
      ox + Math.cos(a) * bend, h * 0.55, oz + Math.sin(a) * bend,
      ox, h, oz + Math.sin(a) * bend * 1.8,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    g.computeVertexNormals();
    blades.push(g);
  }
  return mergeAll(blades, C.grass2);
}

function flowerGeo(rng) {
  const parts = [];
  const stem = cyl(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.4, 0), 0.014, 0.012, 5);
  parts.push(stem);
  const head = new THREE.IcosahedronGeometry(0.075, 1);
  head.translate(0, 0.44, 0);
  parts.push(head);
  const leafG = new THREE.IcosahedronGeometry(0.09, 0);
  leafG.scale(1.4, 0.25, 0.7);
  leafG.translate(0.07, 0.2, 0);
  parts.push(leafG);
  return mergeAll(parts, C.flower[(rng() * C.flower.length) | 0]);
}

function placeInstanced(geo, material, list, rng) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  list.forEach((p, i) => {
    e.set(p.tiltX || 0, p.yaw || 0, p.tiltZ || 0);
    q.setFromEuler(e);
    v.set(p.x, p.y, p.z);
    s.set(p.sx || p.s, p.sy || p.s, p.sz || p.s);
    m.compose(v, q, s);
    mesh.setMatrixAt(i, m);
    const t = p.tint === undefined ? 1 : p.tint;
    col.setRGB(t, t * (p.tintG === undefined ? 1 : p.tintG), t * (p.tintB === undefined ? 1 : p.tintB));
    if (mesh.setColorAt) mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function createVegetation(scene, terrain, road) {
  const rng = makeRng(WORLD.seed ^ 0xabc123);
  const R = WORLD.islandRadius;
  const group = new THREE.Group();
  group.name = 'vegetation';

  const pondOpen = (x, z) => {
    for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.5) return false;
    return true;
  };

  const lists = {
    pine: [], broad: [], palm: [], rock: [], bush: [], grass: [], flower: [],
  };

  const TOTAL = 26000;
  for (let i = 0; i < TOTAL; i++) {
    const x = (rng() * 2 - 1) * R * 1.22;
    const z = (rng() * 2 - 1) * R * 1.22;
    const h = terrain.heightAt(x, z);
    if (h < 1.4 || h > 128) continue;
    const slope = terrain.slopeAt(x, z);
    if (slope > 0.62) continue;
    if (!pondOpen(x, z)) continue;
    const distC = Math.hypot(x, z) / R;
    const onRoad = road.nearRoad(x, z, 5.2);

    const forest = fbm(x * 0.0016 + 70, z * 0.0016 - 30, 4) * 0.5 + 0.5;
    const meadow = fbm(x * 0.0031 - 12, z * 0.0031 + 22, 4) * 0.5 + 0.5;
    const r = rng();

    // 近海 → 棕榈
    if (h < 11 && distC > 0.66 && r < 0.16) {
      lists.palm.push({ x, y: h - 0.1, z, s: 0.7 + rng() * 0.5, yaw: rng() * 6.28, tiltX: (rng() - 0.5) * 0.12, tiltZ: (rng() - 0.5) * 0.12, tint: 0.85 + rng() * 0.3 });
      continue;
    }
    // 森林（针叶/阔叶）
    if (!onRoad && slope < 0.5 && r < forest * 0.55) {
      const isPine = h > 44 || rng() < 0.5 + smoothstep(30, 90, h) * 0.3;
      if (isPine) {
        lists.pine.push({ x, y: h - 0.15, z, s: 0.55 + rng() * 0.95, yaw: rng() * 6.28, tiltX: (rng() - 0.5) * 0.06, tiltZ: (rng() - 0.5) * 0.06, tint: 0.8 + rng() * 0.4 });
      } else {
        lists.broad.push({ x, y: h - 0.15, z, s: 0.7 + rng() * 0.8, yaw: rng() * 6.28, tint: 0.82 + rng() * 0.38 });
      }
      continue;
    }
    // 灌木
    if (!onRoad && slope < 0.55 && r < meadow * 0.5) {
      lists.bush.push({ x, y: h - 0.1, z, s: 0.6 + rng() * 0.9, yaw: rng() * 6.28, tint: 0.8 + rng() * 0.45 });
      continue;
    }
    // 石头（陡坡更多）
    if (!onRoad && r < 0.05 + slope * 0.5) {
      lists.rock.push({ x, y: h - 0.25, z, s: 0.4 + rng() * 1.5, yaw: rng() * 6.28, tiltX: (rng() - 0.5) * 0.4, tiltZ: (rng() - 0.5) * 0.4, tint: 0.8 + rng() * 0.4 });
      continue;
    }
    // 花
    if (!onRoad && h < 70 && slope < 0.4 && rng() < 0.5 * meadow) {
      lists.flower.push({ x, y: h, z, s: 0.7 + rng() * 0.9, yaw: rng() * 6.28, tint: 1 });
      continue;
    }
    // 草皮
    if (!onRoad && h < 95 && rng() < 0.9) {
      lists.grass.push({ x, y: h - 0.02, z, s: 0.7 + rng() * 1.1, yaw: rng() * 6.28, tint: 0.75 + rng() * 0.5 });
    }
  }

  const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const smoothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0, side: THREE.DoubleSide });
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });

  const pine = placeInstanced(pineGeo(), flatMat, lists.pine, rng);
  const broad = placeInstanced(broadleafGeo(rng), smoothMat, lists.broad, rng);
  const palm = placeInstanced(palmGeo(rng), smoothMat, lists.palm, rng);
  const rock = placeInstanced(rockGeo(rng), flatMat, lists.rock, rng);
  const bush = placeInstanced(bushGeo(), smoothMat, lists.bush, rng);
  const grass = placeInstanced(grassGeo(), grassMat, lists.grass, rng);
  const flower = placeInstanced(flowerGeo(rng), flowerMat, lists.flower, rng);

  [pine, broad, palm, rock, bush, grass, flower].forEach((m) => { if (m) group.add(m); });
  scene.add(group);

  return { group, counts: Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])) };
}
