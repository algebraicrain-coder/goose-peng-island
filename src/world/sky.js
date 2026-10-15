// 天空穹顶（渐变 + 太阳）与光照装配。
import * as THREE from 'three';
import { WORLD } from '../config.js';

export function sunDirection() {
  const az = WORLD.sunAzimuth, el = WORLD.sunElevation;
  return new THREE.Vector3(
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az)
  ).normalize();
}

const skyVert = /* glsl */`
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const skyFrag = /* glsl */`
precision highp float;
varying vec3 vWorldPos;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y;

  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
  sky = mix(uGround, sky, smoothstep(-0.06, 0.05, h));

  float sd = max(dot(dir, normalize(uSunDir)), 0.0);
  // 日轮 + 光晕 + 地平线暖色
  sky += uSunColor * pow(sd, 1600.0) * 6.0 * uSunIntensity;
  sky += uSunColor * pow(sd, 14.0) * 0.55 * uSunIntensity;
  sky += uSunColor * pow(sd, 3.0) * 0.16 * uSunIntensity * (1.0 - clamp(h, 0.0, 1.0));
  // 地平线大气增亮
  sky += vec3(0.06, 0.05, 0.04) * pow(1.0 - clamp(abs(h), 0.0, 1.0), 8.0);

  gl_FragColor = vec4(sky, 1.0);
}
`;

export function createSky(scene) {
  const sunDir = sunDirection();

  const uniforms = {
    uZenith: { value: new THREE.Color(0x2f6ea8) },
    uHorizon: { value: new THREE.Color(0xd9dccb) },
    uGround: { value: new THREE.Color(0x6b6f63) },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(0xffd9a0) },
    uSunIntensity: { value: 1.0 },
  };

  const geo = new THREE.SphereGeometry(4500, 48, 32);
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'sky';
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  scene.add(dome);

  // ---- 光照 ----
  const sun = new THREE.DirectionalLight(0xffe6bf, 3.0);
  sun.position.copy(sunDir).multiplyScalar(1200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -190;
  sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 190;
  sun.shadow.camera.bottom = -190;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd6f2, 0x6a6a52, 0.85);
  scene.add(hemi);

  const fill = new THREE.DirectionalLight(0x8fb6e0, 0.35);
  fill.position.set(-sunDir.x * 800, 500, -sunDir.z * 800);
  scene.add(fill);

  return { dome, uniforms, sun, hemi, fill, sunDir };
}
