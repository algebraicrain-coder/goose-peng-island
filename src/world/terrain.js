// 程序化岛屿地形：高度场 + 双线性采样 + 生物群系顶点着色。
import * as THREE from 'three';
import { WORLD, PALETTE } from '../config.js';
import { fbm, ridged, smoothstep, smoothstepU, clamp, lerp } from '../util/noise.js';

// 岛上的内陆湖/水塘（中心、半径、水面高度）
export const PONDS = [
  { x: -96, z: 150, r: 34, water: 13.2 },
  { x: 176, z: -60, r: 26, water: 10.6 },
];

export function islandHeight(x, z) {
  const R = WORLD.islandRadius;
  const nx = x / R, nz = z / R;
  let d = Math.hypot(nx, nz);

  // 不规则海岸线
  const wob = fbm(x * 0.0021 + 11.3, z * 0.0021 - 4.7, 4) * 0.15
            + fbm(x * 0.0058 + 3.1, z * 0.0058 + 9.2, 3) * 0.055;
  d = Math.max(0, d + wob * (0.35 + 0.65 * Math.min(d, 1.5)));

  const island = smoothstepU(1.0, 0.26, d);              // 陆地掩码
  const ridge = ridged(x * 0.00125, z * 0.00125, 6, 2.05, 0.5);
  const hills = fbm(x * 0.0034 + 40, z * 0.0034 - 20, 5);
  const detail = fbm(x * 0.017, z * 0.017, 4);
  const central = smoothstepU(0.9, 0.05, d);             // 山脉靠中

  // 环岛公路缓坡带：给公路一条平缓的走廊
  const beltD = 0.564;
  const beltn = clamp(1 - Math.abs(d - beltD) / 0.115, 0, 1);
  const belt = beltn * beltn * (3 - 2 * beltn);

  let h = 0;
  h += island * 21;
  h += island * hills * 30 * (1 - 0.74 * belt);
  h += island * Math.pow(ridge, 1.65) * 232 * (0.25 + 0.75 * central) * (1 - 0.92 * belt);
  h += island * detail * 1.7 * (1 - 0.25 * belt);
  h -= smoothstepU(0.56, 1.0, d) * 13;                   // 海岸压低 → 沙滩

  // 内陆盆地（供湖/塘）
  for (const p of PONDS) {
    const dd = Math.hypot(x - p.x, z - p.z);
    h -= smoothstepU(p.r * 1.75, p.r * 0.15, dd) * (p.water + 7.0);
  }
  return h;
}

export function createTerrain(scene) {
  const S = WORLD.terrainSize;
  const N = WORLD.terrainSegments;
  const cell = S / N;
  const V = N + 1;
  const half = S / 2;

  const heights = new Float32Array(V * V);
  let minH = Infinity, maxH = -Infinity;
  for (let iz = 0; iz < V; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < V; ix++) {
      const x = -half + ix * cell;
      const h = islandHeight(x, z);
      heights[iz * V + ix] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(V * V * 3);
  const uvs = new Float32Array(V * V * 2);
  for (let iz = 0; iz < V; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < V; ix++) {
      const x = -half + ix * cell;
      const i = iz * V + ix;
      positions[i * 3] = x;
      positions[i * 3 + 1] = heights[i];
      positions[i * 3 + 2] = z;
      uvs[i * 2] = ix / N;
      uvs[i * 2 + 1] = iz / N;
    }
  }
  const indices = new Uint32Array(N * N * 6);
  let ptr = 0;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz * V + ix;
      const b = a + 1;
      const c = a + V;
      const d = c + 1;
      indices[ptr++] = a; indices[ptr++] = c; indices[ptr++] = b;
      indices[ptr++] = b; indices[ptr++] = c; indices[ptr++] = d;
    }
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  // --- 顶点着色 ---
  function paintColors() {
  const nrm = geometry.getAttribute('normal');
  const colors = new Float32Array(V * V * 3);
  const cSand = new THREE.Color().fromArray(PALETTE.sand[0] !== undefined ? rgb(PALETTE.sand[0]) : [1, 1, 1]);
  const cSand2 = new THREE.Color().fromArray(rgb(PALETTE.sand[1]));
  const cGrassL = new THREE.Color().fromArray(rgb(PALETTE.grassLow[0]));
  const cGrassL2 = new THREE.Color().fromArray(rgb(PALETTE.grassLow[1]));
  const cGrassH = new THREE.Color().fromArray(rgb(PALETTE.grassHigh[0]));
  const cGrassH2 = new THREE.Color().fromArray(rgb(PALETTE.grassHigh[1]));
  const cRock = new THREE.Color().fromArray(rgb(PALETTE.rock[0]));
  const cRockD = new THREE.Color().fromArray(rgb(PALETTE.rockDark[0]));
  const cSnow = new THREE.Color().fromArray(rgb(PALETTE.snow[0]));
  const cSilt = new THREE.Color(0x6d7a5f);
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  const c = new THREE.Color();

  for (let iz = 0; iz < V; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < V; ix++) {
      const x = -half + ix * cell;
      const i = iz * V + ix;
      const y = heights[i];
      const sl = 1 - nrm.getY(i);                        // 0 平坦 → 1 陡峭
      const moisture = fbm(x * 0.0026 - 8.1, z * 0.0026 + 5.5, 4) * 0.5 + 0.5;
      const patch = fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
      const tint = fbm(x * 0.4, z * 0.4, 2) * 0.5 + 0.5;

      // 草地基色
      tmp.copy(cGrassL).lerp(cGrassL2, tint);
      tmp2.copy(cGrassH).lerp(cGrassH2, patch);
      c.copy(tmp).lerp(tmp2, clamp(moisture * 1.2 - 0.1, 0, 1));

      // 高处转岩/雪
      const rockT = smoothstep(0.22, 0.55, sl);
      c.lerp(tmp.copy(cRock).lerp(cRockD, tint), rockT);
      const snowT = smoothstep(120, 190, y) * (1 - smoothstep(0.45, 0.75, sl));
      c.lerp(cSnow, snowT);

      // 沙滩带
      const sandT = smoothstep(4.5, 0.4, Math.abs(y)) * smoothstep(0.35, 0.55, 1 - Math.hypot(x, z) / (WORLD.islandRadius * 0.95));
      tmp.copy(cSand).lerp(cSand2, patch);
      c.lerp(tmp, clamp(sandT, 0, 1));

      // 水下淤泥
      if (y < 0) c.lerp(cSilt, smoothstep(0, -6, y));

      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  paintColors();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
    dithering: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  // --- 采样函数（双线性，和网格一致）---
  function heightAt(x, z) {
    const gx = (x + half) / cell;
    const gz = (z + half) / cell;
    if (gx < 0 || gz < 0 || gx >= N || gz >= N) return islandHeight(x, z);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const h00 = heights[iz * V + ix];
    const h10 = heights[iz * V + ix + 1];
    const h01 = heights[(iz + 1) * V + ix];
    const h11 = heights[(iz + 1) * V + ix + 1];
    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  const nTmp = new THREE.Vector3();
  function normalAt(x, z, out = nTmp) {
    const e = cell;
    const hl = heightAt(x - e, z), hr = heightAt(x + e, z);
    const hd = heightAt(x, z - e), hu = heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  function slopeAt(x, z) {
    return 1 - normalAt(x, z).y;
  }

  // 供水面着色器采样（世界坐标 → 高度）
  const texSize = 256;
  const data = new Float32Array(texSize * texSize);
  const heightTex = new THREE.DataTexture(data, texSize, texSize, THREE.RedFormat, THREE.FloatType);
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
  function fillHeightTex() {
    for (let j = 0; j < texSize; j++) {
      for (let i = 0; i < texSize; i++) {
        const x = (i / (texSize - 1) - 0.5) * S;
        const z = (j / (texSize - 1) - 0.5) * S;
        data[j * texSize + i] = heightAt(x, z);
      }
    }
    heightTex.needsUpdate = true;
  }
  fillHeightTex();

  const posAttr = geometry.getAttribute('position');
  function refresh() {
    for (let i = 0; i < V * V; i++) posAttr.setY(i, heights[i]);
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    paintColors();
    fillHeightTex();
  }

  // 沿公路走廊把地形“削平”，保证路面高于地面、两侧自然过渡
  function conformToRoad(road, opts = {}) {
    const roadHalf = opts.roadHalf ?? WORLD.roadWidth * 0.5;
    const inner = roadHalf + (opts.inner ?? 1.6);
    const outer = roadHalf + (opts.outer ?? 9.5);
    const drop = opts.drop ?? 0.6;
    const bandMax = WORLD.roadRadius * 0.16;
    for (let iz = 0; iz < V; iz++) {
      const z = -half + iz * cell;
      for (let ix = 0; ix < V; ix++) {
        const x = -half + ix * cell;
        if (Math.abs(Math.hypot(x, z) - WORLD.roadRadius) > bandMax) continue;
        const nr = road.nearest(x, z, outer);
        if (!nr) continue;
        const t = 1 - smoothstep(inner, outer, nr.dist);
        if (t <= 0) continue;
        const i = iz * V + ix;
        heights[i] = lerp(heights[i], nr.y - drop, t);
      }
    }
    refresh();
  }

  return { mesh, geometry, heightAt, normalAt, slopeAt, heights, cell, V, size: S, minH, maxH, heightTex, refresh, conformToRoad };
}

function rgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
