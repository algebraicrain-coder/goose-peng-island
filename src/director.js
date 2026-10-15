// 电影感运镜：多机位自动切换 + 手持微抖 + 平滑过渡。
import * as THREE from 'three';

const SHOTS = [
  { name: '追随', hold: 8.5 },
  { name: '低位轨道', hold: 7.5 },
  { name: '正面迎拍', hold: 6.5 },
  { name: '环绕', hold: 9.0 },
  { name: '升空远景', hold: 10.0 },
  { name: '过肩主观', hold: 7.0 },
  { name: '俯瞰越肩', hold: 8.0 },
  { name: '岛屿全景', hold: 11.0 },
];

export class Director {
  constructor(camera, cyclist, terrain, islandRadius) {
    this.camera = camera;
    this.cyclist = cyclist;
    this.terrain = terrain;
    this.islandRadius = islandRadius;

    this.shots = SHOTS;
    this.index = 0;
    this.timer = 0;
    this.enabled = true;

    this.curPos = new THREE.Vector3();
    this.curTarget = new THREE.Vector3();
    this._init = false;

    this._F = new THREE.Vector3();
    this._R = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    // 相对主角的偏移（平滑在此空间进行，避免跟随移动目标时持续滞后）
    this._desPos = new THREE.Vector3();
    this._desTgt = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
  }

  get currentName() { return this.shots[this.index].name; }

  setShot(i) {
    this.index = ((i % this.shots.length) + this.shots.length) % this.shots.length;
    this.timer = 0;
  }
  next() { this.setShot(this.index + 1); }
  prev() { this.setShot(this.index - 1); }

  computeShot(i, t, out) {
    const c = this.cyclist;
    const P = c.position;
    const F = this._F.copy(c.tangent).normalize();
    const R = this._R.crossVectors(this._up, F).normalize();

    switch (i) {
      case 0: // 追随
        out.pos.copy(P).addScaledVector(F, -7.6).addScaledVector(this._up, 3.3).addScaledVector(R, 0.6);
        out.tgt.copy(P).addScaledVector(F, 7.0).addScaledVector(this._up, 1.5);
        break;
      case 1: { // 低位轨道：选地势更低的一侧，避免贴上山坡
        const hs = this.terrain.heightAt(P.x + R.x * 6, P.z + R.z * 6);
        const ho = this.terrain.heightAt(P.x - R.x * 6, P.z - R.z * 6);
        const side = hs <= ho ? 1 : -1;
        out.pos.copy(P).addScaledVector(R, 4.4 * side).addScaledVector(this._up, 0.75).addScaledVector(F, -1.2);
        out.tgt.copy(P).addScaledVector(this._up, 0.95).addScaledVector(F, 0.6);
        break;
      }
      case 2: // 正面迎拍
        out.pos.copy(P).addScaledVector(F, 9.5).addScaledVector(this._up, 2.3).addScaledVector(R, -1.8);
        out.tgt.copy(P).addScaledVector(this._up, 1.25);
        break;
      case 3: { // 环绕
        const a = t * 0.32;
        out.pos.set(P.x + Math.cos(a) * 9.5, P.y + 3.2, P.z + Math.sin(a) * 9.5);
        out.tgt.copy(P).addScaledVector(this._up, 1.3);
        break;
      }
      case 4: // 升空远景：大高度 + 大后撤，保留地平线，避免拍成垂直俯视
        out.pos.copy(P).addScaledVector(this._up, 62).addScaledVector(F, -70).addScaledVector(R, 26);
        out.tgt.copy(P).addScaledVector(this._up, 6.0).addScaledVector(F, 30);
        break;
      case 5: // 过肩主观
        out.pos.copy(P).addScaledVector(F, -2.6).addScaledVector(this._up, 2.35).addScaledVector(R, 0.35);
        out.tgt.copy(P).addScaledVector(F, 11).addScaledVector(this._up, 1.7);
        break;
      case 6: // 俯瞰越肩
        out.pos.copy(P).addScaledVector(F, -13).addScaledVector(this._up, 17).addScaledVector(R, 5);
        out.tgt.copy(P).addScaledVector(this._up, 1.0).addScaledVector(F, 3);
        break;
      case 7: { // 岛屿全景
        const a = t * 0.045;
        const r = this.islandRadius * 1.9;
        out.pos.set(Math.cos(a) * r, this.islandRadius * 0.86, Math.sin(a) * r);
        out.tgt.copy(P).addScaledVector(this._up, 3);
        break;
      }
      default:
        out.pos.copy(P).addScaledVector(F, -8).addScaledVector(this._up, 4);
        out.tgt.copy(P);
    }
    // 低位镜头不要穿地
    if (i === 1 || i === 5 || i === 6) {
      const gh = this.terrain.heightAt(out.pos.x, out.pos.z) + 0.8;
      if (out.pos.y < gh) out.pos.y = gh;
    }
    return out;
  }

  update(dt, t) {
    if (!this.enabled) return;
    this.timer += dt;
    if (this.timer > this.shots[this.index].hold) this.next();

    const out = { pos: this._pos, tgt: this._tgt };
    this.computeShot(this.index, t, out);

    const P = this.cyclist.position;
    this._desPos.copy(out.pos).sub(P);
    this._desTgt.copy(out.tgt).sub(P);

    if (!this._init) {
      this.curPos.copy(this._desPos);
      this.curTarget.copy(this._desTgt);
      this._init = true;
    }

    // 平滑跟随（指数趋近，在主角局部坐标系内，故不会因前进而滞后）
    const k = 1.0 - Math.exp(-2.6 * dt);
    this.curPos.lerp(this._desPos, k);
    this.curTarget.lerp(this._desTgt, k);

    // 手持微抖
    const amp = this.index === 7 ? 0.9 : 0.14;
    this._tmp.set(
      Math.sin(t * 1.7) * 0.5 + Math.sin(t * 0.53) * 0.5,
      Math.sin(t * 2.3 + 1.0) * 0.4 + Math.sin(t * 0.71) * 0.4,
      Math.sin(t * 1.1 + 2.0) * 0.5
    ).multiplyScalar(amp * 0.1);

    this.camera.position.copy(P).add(this.curPos).add(this._tmp);
    this._lookAt.copy(P).add(this.curTarget);
    this.camera.lookAt(this._lookAt);
  }
}
