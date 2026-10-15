// 入口：装配世界、驱动循环。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD } from './config.js';
import { createUI } from './ui.js';
import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { createWater } from './world/water.js';
import { createRoad } from './world/road.js';
import { createVegetation } from './world/vegetation.js';
import { createProps } from './world/props.js';
import { createCreatures } from './world/creatures.js';
import { Cyclist } from './actors/goose.js';
import { Director } from './director.js';
import { createPostFX } from './postfx.js';

const ui = createUI();

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

async function main() {
  const canvas = document.getElementById('stage');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(WORLD.fogColor, WORLD.fogDensity);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 24000);
  camera.position.set(0, 60, 300);

  // 1) 天空 + 光照
  ui.setProgress(0.05, '点亮天空…');
  await nextFrame();
  const sky = createSky(scene);

  // 环境反射（由天空生成，供金属/水面使用）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSphere = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 24), sky.dome.material);
  envScene.add(envSphere);
  const envRT = pmrem.fromScene(envScene, 0, 1, 500);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();

  // 2) 地形
  ui.setProgress(0.2, '隆起山脉与海岸…');
  await nextFrame();
  const terrain = createTerrain(scene);

  // 3) 海洋
  ui.setProgress(0.42, '注入海洋与潮汐…');
  await nextFrame();
  const water = createWater(scene, terrain, {
    sunDir: sky.sunDir,
    sunColor: sky.uniforms.uSunColor.value,
    zenith: sky.uniforms.uZenith.value,
    horizon: sky.uniforms.uHorizon.value,
  });

  // 4) 公路
  ui.setProgress(0.52, '铺设环岛公路…');
  await nextFrame();
  const road = createRoad(scene, terrain);
  ui.setProgress(0.57, '削出路基与路肩…');
  await nextFrame();
  terrain.conformToRoad(road);

  // 5) 植被
  ui.setProgress(0.62, '播种森林与花海…');
  await nextFrame();
  const vegetation = createVegetation(scene, terrain, road);

  // 6) 村庄与地物
  ui.setProgress(0.82, '建造村庄、灯塔与风车…');
  await nextFrame();
  const props = createProps(scene, terrain, road);

  // 7) 生灵
  ui.setProgress(0.9, '放飞飞鸟与蝴蝶…');
  await nextFrame();
  const creatures = createCreatures(scene, terrain);

  // 8) 主角
  ui.setProgress(0.95, '请企鹅鹅 Peng 上车…');
  await nextFrame();
  const cyclist = new Cyclist(scene, road, terrain);

  // 9) 后期
  const postfx = createPostFX(renderer, scene, camera);

  // 运镜
  const director = new Director(camera, cyclist, terrain, WORLD.islandRadius);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 4000;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.enabled = false;

  // 输入
  let paused = false;
  let freeCam = false;
  const SPEED_STEP = 1.25;
  const bumpSpeed = (f) => cyclist.setSpeedMul(cyclist.speedMul * f);
  window.addEventListener('keydown', (e) => {
    if (e.code >= 'Digit1' && e.code <= 'Digit8') {
      director.setShot(parseInt(e.code.slice(5)) - 1);
      setFree(false);
    }
    if (e.code === 'ArrowRight') director.next();
    if (e.code === 'ArrowLeft') director.prev();
    if (e.code === 'BracketLeft' || e.code === 'Minus' || e.code === 'NumpadSubtract') bumpSpeed(1 / SPEED_STEP);
    if (e.code === 'BracketRight' || e.code === 'Equal' || e.code === 'NumpadAdd') bumpSpeed(SPEED_STEP);
    if (e.code === 'Digit0' || e.code === 'Numpad0') cyclist.setSpeedMul(1);
    if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
    if (e.code === 'KeyF') setFree(!freeCam);
    if (e.code === 'KeyH') ui.toggleUI();
  });
  function setFree(v) {
    freeCam = v;
    director.enabled = !v;
    controls.enabled = v;
    if (v) {
      controls.target.copy(cyclist.position);
      camera.position.copy(cyclist.position).add(new THREE.Vector3(12, 8, 12));
    } else {
      director._init = false;
    }
  }

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    postfx.setSize(w, h);
  });

  // 循环
  let simTime = 0;
  let last = performance.now();
  let fpsFrames = 0, fpsTimer = 0;

  ui.setProgress(1, '出发！');
  await nextFrame();
  ui.hideLoader();

  const sunDir = sky.sunDir;
  const sunAnchor = new THREE.Vector3();

  // 供无头自检 / 调试使用
  window.__app = {
    THREE, scene, camera, renderer, director, cyclist, terrain, water, road,
    setShot: (i) => { setFree(false); director.setShot(i); director._init = false; },
    seek: (dist) => { cyclist.dist = dist; cyclist.update(0.001); },
    setSpeed: (m) => cyclist.setSpeedMul(m),
    setPaused: (v) => { paused = v; },
    render: () => postfx.composer.render(),
  };

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const simDt = paused ? 0 : dt;
    simTime += simDt;

    cyclist.update(simDt);
    props.update(simDt, simTime);
    creatures.update(simDt, simTime);
    water.update(simTime, camera.position);
    postfx.update(simTime);

    // 阴影相机跟随主角，保证近处阴影清晰
    sunAnchor.copy(cyclist.position);
    sky.sun.target.position.copy(sunAnchor);
    sky.sun.position.copy(sunAnchor).addScaledVector(sunDir, 420);
    sky.sun.target.updateMatrixWorld();

    if (freeCam) {
      controls.target.lerp(cyclist.position, 1 - Math.exp(-3 * dt));
      controls.update();
    } else {
      director.update(dt, simTime);
    }

    postfx.composer.render();

    // 统计
    fpsFrames++; fpsTimer += dt;
    if (fpsTimer >= 0.4) {
      ui.setStats({ fps: fpsFrames / fpsTimer });
      fpsFrames = 0; fpsTimer = 0;
    }
    ui.setShot(director.enabled ? director.currentName : '自由视角');
    ui.setStats({
      speed: cyclist.speed,
      speedMul: cyclist.speedMul,
      dist: cyclist.dist,
      time: formatClock(simTime),
    });
  });

  window.__APP_READY__ = true;
}

function formatClock(sec) {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor(sec / 60) % 60;
  const s = Math.floor(sec) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

main().catch((err) => {
  console.error(err);
  ui.showFatal(err);
});
