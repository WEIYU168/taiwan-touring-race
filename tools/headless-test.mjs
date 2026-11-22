// 用法：node tools/headless-test.mjs <截圖前綴> '<steps JSON>' [寬] [高]
// steps 例：'[{"js":"G.begin()","frames":60,"name":"start"}]'
// 需要：npm i -D playwright（並裝好 Chrome；或設定 CHROME_PATH）
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = process.argv[2]; const steps = JSON.parse(process.argv[3]); const W = +(process.argv[4] || 960), H = +(process.argv[5] || 540);
const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('ERR_TUNNEL')) console.log('[' + m.type() + ']', t.slice(0, 1500)); });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(pathToFileURL(path.join(ROOT, 'public/index.html')).href);
await p.waitForFunction('window.READY===true', null, { timeout: 120000 });
await p.evaluate('window.__manual=true;window.__dt=1/60;window.__frames=async n=>{for(let i=0;i<n;i++){window.__once=true;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}}');
for (const s of steps) {
  try { if (s.js) await p.evaluate(s.js); if (s.frames) await p.evaluate('window.__frames(' + s.frames + ')'); } catch (e) { console.log('eval fail', s.name, e.message.slice(0, 300)); }
  await p.waitForTimeout(300);
  if (s.name) await p.screenshot({ path: prefix + s.name + '.png' });
}
await b.close();
