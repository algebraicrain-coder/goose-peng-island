// 生灵与大气：飞鸟、蝴蝶、云团。
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { makeRng } from '../util/noise.js';
import { mergeAll } from '../util/geo.js';

function makeBird(color, span = 1.0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  body.scale.set(0.6, 0.6, 2.0);
  g.add(body);
  const wingMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
  const wings = [];
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(span, 0.12);
    shape.lineTo(span, -0.28);
    shape.lineTo(0, -0.2);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
    const w = new THREE.Mesh(geo, wingMat);
    w.scale.x = sx * 1;
    w.rotation.y = Math.PI / 2;
    g.add(w);
    wings.push(w);
  }
  g.userData.wings = wings;
  return g;
}

function makeCloud(rng, scale) {
  const parts = [];
  const n = 5 + ((rng() * 5) | 0);
  for (let i = 0; i < n; i++) {
    const r = (0.6 + rng() * 0.6) * scale;
    const g = new THREE.SphereGeometry(r, 12, 9);
    g.scale(1.5, 0.75, 1.3);
    g.translate((rng() - 0.5) * scale * 3.4, (rng() - 0.4) * scale * 0.7, (rng() - 0.5) * scale * 2.4);
    parts.push(g);
  }
  const geo = mergeAll(parts, 0xffffff);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0, emissive: 0x9fb2c4, emissiveIntensity: 0.35, flatShading: false }));
  return m;
}

function makeButterfly(colorA, colorB) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.1, 3, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wings = [];
  const wmat = new THREE.MeshStandardMaterial({ color: colorA, roughness: 0.75, side: THREE.DoubleSide, emissive: colorA, emissiveIntensity: 0.12 });
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.14, 0.1, 0.16, 0.02, 0.01, -0.02);
    shape.bezierCurveTo(0.13, -0.06, 0.11, -0.16, 0.0, -0.06);
    const geo = new THREE.ShapeGeometry(shape, 6);
    const w = new THREE.Mesh(geo, wmat);
    w.position.set(sx * 0.02, 0, 0);
    w.rotation.y = Math.PI / 2;
    w.scale.x = sx * 1;
    w.rotation.z = Math.PI / 2;
    g.add(w);
    wings.push({ mesh: w, sx });
  }
  g.userData.wings = wings;
  return g;
}

export function createCreatures(scene, terrain) {
  const rng = makeRng(WORLD.seed ^ 0xb17d5);
  const group = new THREE.Group();
  group.name = 'creatures';

  // --- 云 ---
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const c = makeCloud(rng, 30 + rng() * 60);
    c.position.set((rng() - 0.5) * 5200, 300 + rng() * 320, (rng() - 0.5) * 5200);
    const s = 0.7 + rng() * 0.9;
    c.scale.set(s, s * 0.8, s);
    c.userData.drift = 3 + rng() * 6;
    group.add(c);
    clouds.push(c);
  }

  // --- 飞鸟 ---
  const birds = [];
  const birdColors = [0x2f3438, 0xf2f2ee, 0x3a4046, 0xe8e6dd];
  for (let f = 0; f < 5; f++) {
    const cx = (rng() - 0.5) * 900;
    const cz = (rng() - 0.5) * 900;
    const cy = 90 + rng() * 180;
    const radius = 120 + rng() * 260;
    const speed = (0.08 + rng() * 0.1) * (rng() < 0.5 ? 1 : -1);
    const count = 5 + ((rng() * 8) | 0);
    for (let i = 0; i < count; i++) {
      const b = makeBird(birdColors[(rng() * birdColors.length) | 0], 0.7 + rng() * 0.6);
      b.userData = {
        ...b.userData,
        cx, cz, cy: cy + (rng() - 0.5) * 30, radius: radius + (rng() - 0.5) * 40,
        speed, phase: rng() * 6.28 + (i / count) * 1.2, flap: 3 + rng() * 3, flapPhase: rng() * 6.28,
        vy: (rng() - 0.5) * 6,
      };
      group.add(b);
      birds.push(b);
    }
  }

  // --- 蝴蝶（草地附近）---
  const butterflies = [];
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2;
    const r = WORLD.islandRadius * (0.3 + rng() * 0.55);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = terrain.heightAt(x, z);
    if (h < 2 || h > 60) continue;
    const b = makeButterfly(rng() < 0.5 ? 0xf2a13a : 0xf2617a, 0xffffff);
    b.userData = { ...b.userData, x, z, y: h + 0.6, phase: rng() * 6.28, flap: 14 + rng() * 8, r: 2 + rng() * 3, sp: 0.4 + rng() * 0.6 };
    group.add(b);
    butterflies.push(b);
  }

  scene.add(group);

  function update(dt, t) {
    for (const c of clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 2800) c.position.x = -2800;
    }
    for (const b of birds) {
      const u = b.userData;
      const ang = u.phase + t * u.speed;
      b.position.set(u.cx + Math.cos(ang) * u.radius, u.cy + Math.sin(t * 0.4 + u.phase) * 6 + u.vy * Math.sin(t * 0.7 + u.phase), u.cz + Math.sin(ang) * u.radius);
      b.rotation.y = -ang + (u.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      const flap = Math.sin(t * u.flap + u.flapPhase);
      b.userData.wings.forEach((w, i) => {
        w.rotation.x = flap * 0.6 * (i === 0 ? 1 : 1);
        w.rotation.z = flap * 0.4;
      });
    }
    for (const b of butterflies) {
      const u = b.userData;
      const ang = t * u.sp + u.phase;
      b.position.set(u.x + Math.cos(ang) * u.r, u.y + Math.sin(t * 1.3 + u.phase) * 0.5, u.z + Math.sin(ang * 1.3) * u.r);
      b.rotation.y = ang + Math.PI / 2;
      const flap = Math.sin(t * u.flap + u.phase);
      u.wings.forEach((w) => { w.mesh.rotation.z = Math.PI / 2 + flap * 0.9 * w.sx; });
    }
  }

  return { group, update, clouds, birds };
}
