// 几何工具：变径管、两点之间的圆柱、属性归一化后的合并等。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 保证所有参与合并的几何体拥有相同的属性集合（position/normal/uv/color）
export function ensureMergeable(geo, color) {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) {
    const n = geo.getAttribute('position').count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  const n = geo.getAttribute('position').count;
  if (!geo.getAttribute('color')) {
    const c = new THREE.Color(color === undefined ? 0xffffff : color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return geo;
}

export function paintVertexColors(geo, colorFn) {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    colorFn(c, pos.getX(i), pos.getY(i), pos.getZ(i), i);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function mergeAll(geos, color) {
  // 统一转成非索引几何，避免 indexed / non-indexed 混合导致合并失败
  const list = geos.map((g) => {
    const gg = g.index ? g.toNonIndexed() : g;
    return ensureMergeable(gg, color);
  });
  const merged = mergeGeometries(list, false);
  return merged || list[0];
}

// 由 a 到 b 的圆柱（可两端不同半径）
export function cylinderBetween(a, b, r1, r2 = r1, radialSeg = 10, capped = true) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, radialSeg, 1, !capped);
  geo.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  m.setPosition(a);
  geo.applyMatrix4(m);
  return geo;
}

// 沿曲线生成变径管（用于鹅脖、腿等）
export function taperedTube(curve, radiusFn, tubularSegments = 64, radialSegments = 12, epsilon = 1e-5) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const center = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);
    center.copy(P);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    const r = radiusFn(t);
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v), cos = -Math.cos(v);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      positions.push(center.x + r * nx, center.y + r * ny, center.z + r * nz);
      normals.push(nx, ny, nz);
      uvs.push(t, j / radialSegments);
    }
  }
  for (let i = 1; i <= tubularSegments; i++) {
    for (let j = 1; j <= radialSegments; j++) {
      const a = (radialSegments + 1) * (i - 1) + (j - 1);
      const b = (radialSegments + 1) * i + (j - 1);
      const c = (radialSegments + 1) * i + j;
      const d = (radialSegments + 1) * (i - 1) + j;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

// 把一组点扰动成有机块体
export function jitter(geo, amount, seedFn) {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const s = seedFn(i);
    pos.setXYZ(
      i,
      pos.getX(i) + (s.x ?? 0) * amount,
      pos.getY(i) + (s.y ?? 0) * amount,
      pos.getZ(i) + (s.z ?? 0) * amount
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// 由 z/y 轴朝向：方便把物件立到法线方向
export function alignToNormal(obj, normal, up = new THREE.Vector3(0, 1, 0)) {
  const q = new THREE.Quaternion().setFromUnitVectors(up, normal.clone().normalize());
  obj.quaternion.copy(q);
  return obj;
}
