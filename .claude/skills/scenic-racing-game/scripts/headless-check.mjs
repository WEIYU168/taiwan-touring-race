#!/usr/bin/env node
// 用無頭 Chrome 實際跑一條路線：載入、自動駕駛跑完全程、8 車對手賽、每個分段截圖。
// 用法：node <skill>/scripts/headless-check.mjs <專案資料夾> <路線key> [截圖資料夾]
// 需要 Playwright（免費）：在任一資料夾執行  npm i -D playwright && npx playwright install chromium
//   或設定 PLAYWRIGHT_PATH 指向已安裝的 playwright/index.mjs；CHROME_PATH 指向自備的 Chrome。
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const [root0, key, out0] = process.argv.slice(2);
if (!root0 || !key) { console.error('用法：node headless-check.mjs <專案資料夾> <路線key> [截圖資料夾]'); process.exit(2); }
const root = path.resolve(root0), out = path.resolve(out0 || path.join(root, 'shots')), page0 = path.join(root, 'public/index.html');
if (!fs.existsSync(page0)) { console.error('找不到 ' + page0 + '，請先執行 node build.js'); process.exit(2); }
let pw;
try { pw = process.env.PLAYWRIGHT_PATH ? await import(pathToFileURL(process.env.PLAYWRIGHT_PATH).href) : await import('playwright'); }
catch (e) { console.error('找不到 Playwright。安裝方式：npm i -D playwright && npx playwright install chromium（免費）'); process.exit(2); }
const chromium = pw.chromium || pw.default.chromium;
fs.mkdirSync(out, { recursive: true });
const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await chromium.launch(Object.assign({ args }, process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}));
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/fonts|ERR_/.test(t)) errors.push(t.slice(0, 500)); });
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
const T0 = Date.now(), log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's', ...a);
await p.goto(pathToFileURL(page0).href);
await p.waitForFunction('window.READY===true', null, { timeout: 240000 }).catch(() => { console.log('✗ 頁面沒有在 240 秒內完成載入'); });
log('頁面載入完成');
const ok = await p.evaluate(k => new Promise(r => { window.__lr = 0; G.loadRoute(k).then(() => r(true)).catch(e => r('載入失敗：' + e.message)); }), key);
if (ok !== true) { console.log('✗ ' + ok); await b.close(); process.exit(1); }
await p.evaluate('window.__manual=true;window.__dt=1/60;window.__frames=async n=>{for(let i=0;i<n;i++){window.__once=true;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}}');
log('路線 ' + key + ' 載入完成');
const lap = await p.evaluate(`(()=>{G.GAME.selMode="time";G.begin();G.GAME.count=0.3;G.sim(30);G.GAME.autoTest=0.93;const q=G.GAME.player;let mx=0;for(let i=0;i<60*600&&!q.finished&&!q.broken;i++){G.sim(1);mx=Math.max(mx,q.v)}G.GAME.autoTest=0;return {fin:q.finished,broken:q.broken,t:G.GAME.time,s:q.s,vmax:mx*3.6,dmg:q.dmg}})()`);
log((lap.fin ? '✓' : '✗') + ' 自動駕駛' + (lap.fin ? '完成全程 ' + lap.t.toFixed(0) + ' 秒' : '未完成（停在 s=' + lap.s.toFixed(0) + (lap.broken ? '，已拋錨' : '') + '）') + '，極速 ' + lap.vmax.toFixed(0) + ' km/h，撞擊 ' + lap.dmg + ' 次');
const race = await p.evaluate(`(()=>{G.GAME.selMode="race";G.begin();G.GAME.count=0.3;G.sim(30);let n=0;for(let i=0;i<60*700&&n<7;i++){G.sim(1);n=G.GAME.cars.filter(c=>c.ai&&c.finished).length}return {n,t:G.GAME.time}})()`);
log((race.n >= 7 ? '✓' : '✗') + ' 對手完賽 ' + race.n + '／7（' + race.t.toFixed(0) + ' 秒）');
const secs = await p.evaluate('G.route().sections.map(s=>({s:(s.s0+s.s1)/2,name:s.name}))');
await p.evaluate('G.GAME.selMode="time";G.begin();G.GAME.state="racing";G.GAME.hud=false;G.tod("day");G.GAME.camMode=1;G.GAME.camPitch=0.1');
for (let i = 0; i < secs.length; i++) {
  await p.evaluate(s => { G.place(G.GAME.player, s, -1); G.GAME.camYaw = 0.45; }, secs[i].s);
  await p.evaluate('window.__frames(2)'); await p.waitForTimeout(200);
  const f = path.join(out, key + '_' + (i + 1) + '.png'); await p.screenshot({ path: f });
  log('截圖 ' + path.relative(process.cwd(), f) + '（' + secs[i].name + '）');
}
await b.close();
if (errors.length) { console.log('✗ 主控台錯誤：\n  ' + errors.slice(0, 8).join('\n  ')); }
const pass = lap.fin && race.n >= 7 && !errors.length;
console.log(pass ? '\n✓ 路線可正常遊玩。請逐張檢視截圖確認景觀。' : '\n✗ 有問題需要修正（見上方）。');
process.exit(pass ? 0 : 1);
