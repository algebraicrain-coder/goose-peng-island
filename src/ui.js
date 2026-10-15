// HUD / 加载界面控制。
const $ = (id) => document.getElementById(id);

export function createUI() {
  const loader = $('loader');
  const bar = $('loader-bar');
  const status = $('loader-status');
  const hud = $('hud');
  const shotName = $('shot-name');
  const statSpeed = $('stat-speed');
  const statMul = $('stat-mul');
  const statDist = $('stat-dist');
  const statTime = $('stat-time');
  const statFps = $('stat-fps');
  const fatal = $('fatal');
  const fatalMsg = $('fatal-msg');

  let uiVisible = true;

  return {
    setProgress(p, msg) {
      bar.style.width = Math.round(p * 100) + '%';
      if (msg) status.textContent = msg;
    },
    hideLoader() {
      loader.classList.add('done');
      hud.classList.remove('hidden');
      setTimeout(() => loader.classList.add('hidden'), 1000);
    },
    setShot(name) { shotName.textContent = name; },
    setStats(d) {
      if (d.speed !== undefined) statSpeed.textContent = d.speed.toFixed(1) + ' m/s';
      if (d.speedMul !== undefined) statMul.textContent = '×' + d.speedMul.toFixed(2);
      if (d.dist !== undefined) statDist.textContent = (d.dist / 1000).toFixed(2) + ' km';
      if (d.time !== undefined) statTime.textContent = d.time;
      if (d.fps !== undefined) statFps.textContent = d.fps.toFixed(0);
    },
    toggleUI() {
      uiVisible = !uiVisible;
      hud.classList.toggle('hidden-ui', !uiVisible);
    },
    showFatal(err) {
      fatal.classList.remove('hidden');
      fatalMsg.textContent = (err && (err.stack || err.message)) || String(err);
      loader.classList.add('hidden');
    },
  };
}
