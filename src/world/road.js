// 环岛公路：闭合样条 + 路面网格 + 沿路设施定位辅助。
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { fbm, smoothstep, clamp } from '../util/noise.js';

function makeRoadTexture() {
  const W = 128, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // 沥青底（偏亮的暖灰，避免在低阳下过暗）
  ctx.fillStyle = '#63656a';
  ctx.fillRect(0, 0, W, H);
  // 噪点颗粒
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // 磨损的轮迹
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(W * 0.26, 0, W * 0.12, H);
  ctx.fillRect(W * 0.62, 0, W * 0.12, H);

  // 边缘白线
  ctx.fillStyle = 'rgba(240,241,236,0.85)';
  ctx.fillRect(W * 0.075, 0, 3, H);
  ctx.fillRect(W * 0.925 - 3, 0, 3, H);

  // 中央黄虚线
  ctx.fillStyle = 'rgba(236,199,92,0.9)';
  const dash = 46, gap = 44;
  for (let y = 0; y < H; y += dash + gap) ctx.fillRect(W * 0.5 - 3, y, 6, dash);

  // 边角碎石
  ctx.fillStyle = 'rgba(158,146,122,0.5)';
  ctx.fillRect(0, 0, W * 0.075, H);
  ctx.fillRect(W * 0.925, 0, W * 0.075, H);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRoad(scene, terrain) {
  const R = WORLD.roadRadius;
  const M = 1100;
  const ctrl = [];
  const CP = 192;
  const heights = [];
  for (let i = 0; i < CP; i++) {
    const a = (i / CP) * Math.PI * 2;
    const rr = R * (1 + 0.055 * fbm(Math.cos(a) * 2.1 + 5, Math.sin(a) * 2.1 - 3, 3)
                      + 0.02 * Math.sin(a * 5.0));
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const y = terrain.heightAt(x, z) + WORLD.roadLift;
    heights.push(y);
    ctrl.push(new THREE.Vector3(x, y, z));
  }
  // 路面纵断面平滑，避免剧烈起伏
  for (let pass = 0; pass < 2; pass++) {
    const prev = heights.slice();
    for (let i = 0; i < CP; i++) {
      const a = prev[(i - 1 + CP) % CP], b = prev[i], c = prev[(i + 1) % CP];
      heights[i] = (a + 2 * b + c) / 4;
    }
  }
  for (let i = 0; i < CP; i++) ctrl[i].y = Math.max(heights[i], WORLD.waterLevel + 2.2);

  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = 2000;

  // --- 路面网格（三列截面 + 路拱）---
  const halfW = WORLD.roadWidth * 0.5;
  const positions = [];
  const uvs = [];
  const normals = [];
  const indices = [];
  const segLenTotal = curve.getLength();
  const tileLen = 9.0;
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const Rv = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const pts = [];

  for (let i = 0; i <= M; i++) {
    const t = i / M;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T).normalize();
    Rv.crossVectors(up, T).normalize();
    pts.push({ p: P.clone(), r: Rv.clone(), t: T.clone(), t01: t });
    const crown = 0.10;
    const offs = [-halfW, 0, halfW];
    for (let k = 0; k < 3; k++) {
      const o = offs[k];
      positions.push(P.x + Rv.x * o, P.y + (k === 1 ? crown : 0) + (Math.abs(o) === halfW ? -0.03 : 0), P.z + Rv.z * o);
      uvs.push(k === 0 ? 0 : k === 1 ? 0.5 : 1, (segLenTotal * t) / tileLen);
      normals.push(0, 1, 0);
    }
  }
  for (let i = 0; i < M; i++) {
    const a = i * 3, b = a + 3;
    // 左半幅（两三角）
    indices.push(a, a + 1, b, a + 1, b + 1, b);
    // 右半幅（两三角）
    indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // 路面近乎水平：直接使用朝上的法线，避免缠绕方向影响明暗
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  const mat = new THREE.MeshStandardMaterial({
    map: makeRoadTexture(),
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'road';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  // --- 空间哈希，供其它模块避让 ---
  const cell = 40;
  const grid = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  pts.forEach((q, idx) => {
    const cx = Math.floor(q.p.x / cell), cz = Math.floor(q.p.z / cell);
    const k = key(cx, cz);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(idx);
  });
  function nearRoad(x, z, margin) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    const rr = Math.ceil(margin / cell);
    for (let ix = -rr; ix <= rr; ix++) {
      for (let iz = -rr; iz <= rr; iz++) {
        const list = grid.get(key(cx + ix, cz + iz));
        if (!list) continue;
        for (const idx of list) {
          const q = pts[idx].p;
          const dx = q.x - x, dz = q.z - z;
          if (dx * dx + dz * dz < margin * margin) return true;
        }
      }
    }
    return false;
  }

  // 最近的路中心点（含高度），用于地形让路
  function nearest(x, z, maxDist = 16) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    const rr = Math.ceil(maxDist / cell);
    let best = null, bd = maxDist * maxDist;
    for (let ix = -rr; ix <= rr; ix++) {
      for (let iz = -rr; iz <= rr; iz++) {
        const list = grid.get(key(cx + ix, cz + iz));
        if (!list) continue;
        for (const idx of list) {
          const q = pts[idx].p;
          const dx = q.x - x, dz = q.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; best = q; }
        }
      }
    }
    return best ? { dist: Math.sqrt(bd), y: best.y } : null;
  }

  return { curve, mesh, points: pts, nearRoad, nearest, length: segLenTotal, width: WORLD.roadWidth };
}
