// 在页面里执行一段表达式并打印结果（无头自检用）。
// 用法：node scripts/eval.mjs <url> "<expression>"
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const URL_ = process.argv[2] || 'http://127.0.0.1:8123/';
const EXPR = process.argv[3] || 'document.title';
const OUT = process.argv[4] || null;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9800 + Math.floor(Math.random() * 500);

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1600,900',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-angle=metal',
  `--user-data-dir=/tmp/peng-eval-${PORT}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p?.webSocketDebuggerUrl) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no chrome');
}

let id = 0;
const pending = new Map();
function send(ws, method, params = {}) {
  const mid = ++id;
  return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
}

async function main() {
  const t = await getTarget();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  });
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Page.navigate', { url: URL_ });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const r = await send(ws, 'Runtime.evaluate', { expression: 'window.__APP_READY__ === true', returnByValue: true });
    if (r.result.value) break;
  }
  const r = await send(ws, 'Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result.value, null, 2));
  if (r.exceptionDetails) console.log('EXC', JSON.stringify(r.exceptionDetails));
  if (OUT) {
    await sleep(1800);
    const cap = await send(ws, 'Page.captureScreenshot', { format: 'png' });
    mkdirSync(OUT.replace(/\/[^/]*$/, ''), { recursive: true });
    writeFileSync(OUT, Buffer.from(cap.data, 'base64'));
    console.log('saved', OUT);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
