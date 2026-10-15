// 无头 Chrome 自检：加载页面、收集控制台/异常、按机位截图。
// 用法：node scripts/shot.mjs <url> <outDir> [shotIndex ...]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/';
const OUT = process.argv[3] || 'build/shots';
const SHOTS = process.argv.slice(4).map(Number);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + Math.floor(Math.random() * 500);
const W = 1600, H = 900;

mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader',
  '--use-angle=metal',
  '--hide-scrollbars',
  '--mute-audio',
  `--user-data-dir=/tmp/peng-chrome-${PORT}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeErr = '';
chrome.stderr.on('data', (d) => { chromeErr += d.toString(); });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome 调试端口\n' + chromeErr);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.handlers.forEach((h) => h(msg));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(fn) { this.handlers.push(fn); }
}

async function main() {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const logs = [];
  cdp.on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push('[' + msg.params.type + '] ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push('[EXCEPTION] ' + (d.exception?.description || d.text));
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') logs.push('[' + e.level + '] ' + e.text);
    }
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: URL_ });

  // 等待就绪
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__APP_READY__ === true', returnByValue: true });
    if (r.result.value) { ready = true; break; }
  }
  await sleep(2500); // 让动画稳定

  const shotList = SHOTS.length ? SHOTS : [0];
  for (const s of shotList) {
    await cdp.send('Runtime.evaluate', { expression: `window.__app && window.__app.setShot(${s})` });
    await sleep(2200);
    const cap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const name = `shot${String(s).padStart(2, '0')}.png`;
    writeFileSync(`${OUT}/${name}`, Buffer.from(cap.data, 'base64'));
    console.log('saved', `${OUT}/${name}`);
  }

  // 一次全局远景
  const cap = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/current.png`, Buffer.from(cap.data, 'base64'));

  console.log('READY:', ready);
  console.log('--- console/errors ---');
  console.log(logs.length ? logs.join('\n') : '(none)');

  ws.close();
  chrome.kill();
  process.exit(ready && !logs.some((l) => l.includes('EXCEPTION')) ? 0 : 1);
}

main().catch((e) => { console.error(e.message || e); chrome.kill(); process.exit(2); });
