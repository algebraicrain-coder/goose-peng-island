// 海面：平铺平面 + 程序化波法线 + 菲涅尔 + 太阳高光 + 岸线泡沫。
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { PONDS } from './terrain.js';

const waterVert = /* glsl */`
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const waterFrag = /* glsl */`
precision highp float;
varying vec3 vWorldPos;

uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uZenith;
uniform vec3  uHorizon;
uniform vec3  uDeep;
uniform vec3  uShallow;
uniform vec3  uFoam;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uWaterLevel;
uniform float uCalm;
uniform float uWaveScale;
uniform sampler2D uHeightTex;
uniform float uTerrainSize;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// 多倍频噪声（每次旋转 + 频率翻倍），给出无方向性的不规则涌浪。
float fbmSwell(vec2 p) {
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = rot * p * 2.03; a *= 0.5; }
  return s;
}

void addWave(vec2 p, inout float hgt, inout vec2 grad, vec2 dir, float freq, float amp, float speed, float ph) {
  float s = dot(dir, p) * freq + uTime * speed + ph;
  hgt += amp * sin(s);
  grad += dir * (freq * amp * cos(s));
}
// 与 addWave 相同，但按距离淡出高频波：波长小于几个像素时只会产生摩尔纹。
void addWaveLod(vec2 p, float dist, inout float hgt, inout vec2 grad, vec2 dir, float freq, float amp, float speed, float ph) {
  float wl = 6.2831853 / freq;
  float lod = 1.0 - smoothstep(0.35, 1.0, dist / (wl * 165.0));
  if (lod <= 0.002) return;
  float a = amp * lod;
  float s = dot(dir, p) * freq + uTime * speed + ph;
  hgt += a * sin(s);
  grad += dir * (freq * a * cos(s));
}

void main() {
  vec3 V = normalize(uCamPos - vWorldPos);
  float dist = length(uCamPos - vWorldPos);
  vec2 p = vWorldPos.xz;

  // --- 深度（相对水下的地形）---
  vec2 huv = vWorldPos.xz / uTerrainSize + 0.5;
  float terrainH = texture2D(uHeightTex, huv).r;
  float depth = max(uWaterLevel - terrainH, 0.0);

  // --- 波法线 ---
  float hgt = 0.0;
  vec2 grad = vec2(0.0);
  float calm = uCalm;
  // 多方向叠加，避免出现规则条带；高频分量随距离淡出
  addWaveLod(p, dist, hgt, grad, normalize(vec2( 1.0, 0.33)), 0.045, 0.42 * calm, 0.62, 0.0);
  addWaveLod(p, dist, hgt, grad, normalize(vec2(-0.62, 1.0)), 0.071, 0.30 * calm, 1.05, 2.1);
  addWaveLod(p, dist, hgt, grad, normalize(vec2( 0.88,-0.47)), 0.118, 0.20 * calm, 1.55, 4.2);
  addWaveLod(p, dist, hgt, grad, normalize(vec2( 0.14, 1.0)), 0.186, 0.11 * calm, 2.15, 1.3);
  addWaveLod(p, dist, hgt, grad, normalize(vec2(-1.0,-0.26)), 0.305, 0.06 * calm, 2.85, 3.7);

  // 细碎涟漪（近处可见，远处淡出，故大坐标精度问题暴露不到）
  float detailFade = exp(-dist * 0.0016);
  vec2 q = p * 0.42 + uTime * 0.12;
  float e = 0.4;
  float n0 = vnoise(q);
  float nx = vnoise(q + vec2(e, 0.0));
  float nz = vnoise(q + vec2(0.0, e));
  grad += vec2(nx - n0, nz - n0) * 0.55 * detailFade;
  // 中尺度不规则涌浪：多倍频、无方向性，避免远看成平行条纹
  vec2 q2 = p * 0.012 + uTime * 0.02;
  float m0 = fbmSwell(q2);
  float mx = fbmSwell(q2 + vec2(0.35, 0.0));
  float mz = fbmSwell(q2 + vec2(0.0, 0.35));
  grad += vec2(mx - m0, mz - m0) * 1.6;

  // 掠射角下水面在屏幕上被极度压缩，法线扰动会退化成横向条纹；
  // 按视线与水面的夹角淡出扰动（俯视几乎不受影响，近处也保留细节）。
  float graze = 1.0 - smoothstep(0.04, 0.30, abs(V.y));
  grad *= 1.0 - 0.75 * graze;

  vec3 N = normalize(vec3(-grad.x * uWaveScale, 1.0, -grad.y * uWaveScale));

  // --- 菲涅尔 ---
  float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);

  // --- 反射天色 ---
  vec3 R = reflect(-V, N);
  vec3 skyCol = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
  float sd = max(dot(R, normalize(uSunDir)), 0.0);
  skyCol += uSunColor * pow(sd, 60.0) * 0.6;

  // --- 水体颜色 ---
  vec3 body = mix(uShallow, uDeep, smoothstep(0.4, 11.0, depth));
  body += uShallow * 0.35 * exp(-depth * 0.55);           // 近岸透亮

  vec3 col = mix(body, skyCol, fres);

  // --- 太阳高光（远处更柔，避免波纹在远场变成硬闪光带）---
  vec3 H = normalize(normalize(uSunDir) + V);
  float nh = max(dot(N, H), 0.0);
  float far = smoothstep(150.0, 2600.0, dist);
  col += uSunColor * pow(nh, mix(260.0, 42.0, far)) * mix(3.4, 1.1, far);
  col += uSunColor * pow(nh, 22.0) * 0.08;

  // --- 岸线泡沫 ---
  float shore = 1.0 - smoothstep(0.0, 2.4, depth);
  float fn = vnoise(p * 0.30 + vec2(uTime * 0.05, uTime * 0.03));
  float fn2 = vnoise(p * 0.85 - vec2(uTime * 0.09, uTime * 0.05));
  float crest = smoothstep(0.55, 1.0, fn * 0.6 + fn2 * 0.4);
  float foam = shore * (0.35 + 0.65 * crest) + smoothstep(0.02, 0.18, hgt * calm) * 0.06 * shore;
  col = mix(col, uFoam, clamp(foam, 0.0, 0.92));

  // --- 雾（与场景一致的指数雾）---
  float fogF = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWater(scene, terrain, palette) {
  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: palette.sunDir.clone() },
    uSunColor: { value: palette.sunColor.clone() },
    uZenith: { value: palette.zenith.clone() },
    uHorizon: { value: palette.horizon.clone() },
    uDeep: { value: new THREE.Color(0x0b3a4a) },
    uShallow: { value: new THREE.Color(0x2f9f96) },
    uFoam: { value: new THREE.Color(0xeaf3f2) },
    uFogColor: { value: new THREE.Color(WORLD.fogColor) },
    uFogDensity: { value: WORLD.fogDensity },
    uWaterLevel: { value: WORLD.waterLevel },
    uCalm: { value: 1.0 },
    uWaveScale: { value: 1.0 },
    uHeightTex: { value: terrain.heightTex },
    uTerrainSize: { value: terrain.size },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    uniforms,
    fog: false,
  });

  const geo = new THREE.PlaneGeometry(14000, 14000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WORLD.waterLevel, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);

  // --- 内陆水塘 ---
  const pondGroup = new THREE.Group();
  pondGroup.name = 'ponds';
  for (const pd of PONDS) {
    // 找出水线与岸的交界半径
    let r = pd.r * 0.4;
    for (let step = 0; step < 200; step++) {
      const rr = pd.r * 0.4 + (step / 200) * pd.r * 1.6;
      const h = terrain.heightAt(pd.x + rr, pd.z);
      if (h >= pd.water) break;
      r = rr;
    }
    const pmat = mat.clone();
    pmat.uniforms = THREE.UniformsUtils.clone(mat.uniforms);
    pmat.uniforms.uCalm.value = 0.16;
    pmat.uniforms.uWaveScale.value = 0.45;
    pmat.uniforms.uWaterLevel.value = pd.water;
    pmat.uniforms.uHeightTex.value = terrain.heightTex;
    pmat.uniforms.uDeep.value = new THREE.Color(0x1f4d4a);
    pmat.uniforms.uShallow.value = new THREE.Color(0x6fbfa8);
    const pgeo = new THREE.CircleGeometry(Math.max(r, pd.r * 0.8), 48);
    pgeo.rotateX(-Math.PI / 2);
    const pm = new THREE.Mesh(pgeo, pmat);
    pm.position.set(pd.x, pd.water, pd.z);
    pm.renderOrder = -9;
    pondGroup.add(pm);
    pd._mesh = pm;
  }
  scene.add(pondGroup);

  function update(time, camPos) {
    uniforms.uTime.value = time;
    uniforms.uCamPos.value.copy(camPos);
    for (const pd of PONDS) {
      if (pd._mesh) {
        pd._mesh.material.uniforms.uTime.value = time;
        pd._mesh.material.uniforms.uCamPos.value.copy(camPos);
      }
    }
  }

  return { mesh, material: mat, uniforms, update, group: pondGroup };
}
