#!/usr/bin/env node
// 檢查路線設定：node <skill>/scripts/check-route.js <專案資料夾> [路線key]
// 不需瀏覽器。載入 01_math.js、03_track.js、14_routes.js，檢查欄位、長度、彎道半徑、分段覆蓋、賽道自我交叉、選單與伺服器白名單。
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(process.argv[2] || '.'), only = process.argv[3];
const J = f => path.join(root, 'src/js', f);
for (const f of ['01_math.js', '03_track.js', '14_routes.js']) if (!fs.existsSync(J(f))) { console.error('找不到 ' + J(f) + '，請確認專案資料夾路徑'); process.exit(2); }
const stub = 'const PL = new Proxy({}, { get: () => 0 }); const cellUV = () => [0, 0, 1, 1]; const plainH139 = () => 0;\n';
const road = fs.existsSync(J('06_road.js')) ? fs.readFileSync(J('06_road.js'), 'utf8') : '';
const jm = road.match(/let JUNCTIONS = \[[\s\S]*?\n\];/);
const code = stub + ['01_math.js', '03_track.js'].map(f => fs.readFileSync(J(f), 'utf8')).join('\n') + '\n' + (jm ? jm[0] : 'let JUNCTIONS = [];') + '\n' + fs.readFileSync(J('14_routes.js'), 'utf8') + '\nglobalThis.__R = ROUTES;';
const ctx = vm.createContext({ console, Math, Float32Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Array, Object, Proxy, Number, String, JSON });
try { vm.runInContext(code, ctx, { filename: 'routes' }); } catch (e) { console.error('路線檔語法或執行錯誤：' + e.message); process.exit(1); }
const ROUTES = ctx.__R, html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8'), server = fs.existsSync(path.join(root, 'server.js')) ? fs.readFileSync(path.join(root, 'server.js'), 'utf8') : '';
const REQ = ['key', 'shield', 'title', 'sub', 'desc', 'note', 'pieces', 'sections', 'landmarks', 'elev', 'realAlt', 'zkeys', 'zones', 'junctions', 'sStart', 'sFinish', 'sEnd', 'heading0', 'elevNoise', 'kmMax', 'attractS', 'hwFn', 'plain', 'slopeL', 'slopeR', 'gully', 'bridge', 'sea', 'seaMin', 'soil', 'ponds', 'plainPatch', 'mount', 'landOverride', 'streets', 'streetSkip', 'plan', 'gates', 'decal40', 'zebras', 'init'];
let errs = 0, warns = 0;
const E = (k, m) => { errs++; console.log('  ✗ [' + k + '] ' + m); }, W = (k, m) => { warns++; console.log('  ! [' + k + '] ' + m); };
for (const key of Object.keys(ROUTES)) {
  if (only && key !== only) continue;
  const R = ROUTES[key]; console.log('路線 ' + key + '（' + (R.title || '?') + '）');
  for (const f of REQ) if (R[f] === undefined) E(key, '缺少欄位 ' + f);
  if (key !== 'r139' && typeof R.signs !== 'function') E(key, '缺少 signs()（可回傳空陣列）');
  if (R.key !== key) E(key, 'key 欄位（' + R.key + '）與物件名稱不同');
  if (!Array.isArray(R.pieces)) continue;
  const L = R.pieces.reduce((a, p) => a + p[0], 0);
  if (R.sEnd > L) E(key, 'sEnd ' + R.sEnd + ' 超過 pieces 總長 ' + L);
  if (!(R.sStart < R.sFinish && R.sFinish < R.sEnd)) E(key, '需要 sStart < sFinish < sEnd');
  if (R.sEnd - R.sFinish < 200) W(key, '終點後緩衝距離只有 ' + (R.sEnd - R.sFinish) + ' m，建議 ≥ 300');
  R.pieces.forEach((p, i) => { if (!p[1]) return; const rad = p[0] / (Math.abs(p[1]) * Math.PI / 180); if (rad < 25) E(key, 'pieces[' + i + '] ' + JSON.stringify(p) + ' 半徑 ' + rad.toFixed(0) + ' m 太急（需 ≥ 25 m，建議 ≥ 35）'); else if (rad < 35) W(key, 'pieces[' + i + '] ' + JSON.stringify(p) + ' 半徑 ' + rad.toFixed(0) + ' m 偏急'); if (p[0] < 30) W(key, 'pieces[' + i + '] 長度 < 30 m，平滑後可能失真'); });
  const cov = (arr, name, a0, a1) => { if (!arr || !arr.length) return E(key, name + ' 是空的'); for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i].s0 - arr[i - 1].s1) > 0.01) E(key, name + '[' + i + '] 沒有接續前一段（' + arr[i - 1].s1 + ' → ' + arr[i].s0 + '）'); if (arr[0].s0 > a0) E(key, name + ' 起點需 ≤ ' + a0); if (arr[arr.length - 1].s1 < a1) E(key, name + ' 終點需 ≥ ' + a1); };
  cov(R.sections, 'sections', 0, R.sFinish); cov(R.zones, 'zones', 0, R.sEnd);
  (R.sections || []).forEach((c, i) => { if (!(c.k1 > c.k0)) E(key, 'sections[' + i + '] 需 k1 > k0'); if (!c.name) E(key, 'sections[' + i + '] 缺 name'); });
  (R.zones || []).forEach((z, i) => { if (!Array.isArray(z.w) || z.w.length < 10 || z.w.length > 12) E(key, 'zones[' + i + '].w 需 12 個權重（順序見 references/route-authoring.md）'); else { const s = z.w.reduce((a, b) => a + b, 0); if (Math.abs(s - 1) > 0.05) W(key, 'zones[' + i + '].w 總和 ' + s.toFixed(2) + '，建議 = 1'); } if (!z.row) E(key, 'zones[' + i + '] 缺 row（行道樹設定）'); if (!z.mix && key !== 'r139') E(key, 'zones[' + i + '] 缺 mix（樹種比例）'); });
  const sorted = (arr, name, get) => { for (let i = 1; i < arr.length; i++) if (get(arr[i]) <= get(arr[i - 1])) E(key, name + ' 必須依 s 遞增（第 ' + i + ' 筆）'); };
  if (R.zkeys) { sorted(R.zkeys, 'zkeys', z => z.s); if (R.zkeys[0].s !== 0) E(key, 'zkeys 第一筆 s 需為 0'); if (R.zkeys[R.zkeys.length - 1].s < R.sEnd) E(key, 'zkeys 最後一筆 s 需 ≥ sEnd'); }
  if (R.elev) { sorted(R.elev, 'elev', e => e[0]); if (R.elev[0][0] !== 0) E(key, 'elev 第一筆需為 0'); if (R.elev[R.elev.length - 1][0] < R.sEnd) E(key, 'elev 最後一筆需 ≥ sEnd'); for (let i = 1; i < R.elev.length; i++) { const g = Math.abs(R.elev[i][1] - R.elev[i - 1][1]) / (R.elev[i][0] - R.elev[i - 1][0]); if (g > 0.12) W(key, 'elev 第 ' + i + ' 段坡度 ' + (g * 100).toFixed(0) + '% 偏陡'); } }
  if (R.realAlt) sorted(R.realAlt, 'realAlt', e => e[0]);
  (R.landmarks || []).forEach(l => { if (l.s < 0 || l.s > R.sFinish) W(key, '地標「' + l.name + '」s=' + l.s + ' 不在賽道上'); });
  (R.gates || []).forEach(g => { if (g.s < 0 || g.s > R.sEnd) E(key, '門架 s=' + g.s + ' 超出賽道'); });
  if (R.fog && !(R.fog[0] < R.fog[1] && R.fog[1] < R.sFinish)) E(key, 'fog 需為 [s0, s1] 且在終點前');
  if (R.attractS < 300 || R.attractS > R.sFinish - 400) W(key, 'attractS（選單背景展示位置）建議介於 300 與 sFinish-400');
  // 賽道自我交叉：依 pieces 積分，檢查相隔超過 250 m 的兩點距離
  { const P = []; let th = R.heading0 * Math.PI / 180, x = 0, z = 0, s = 0; for (const [len, deg] of R.pieces) { const k = deg * Math.PI / 180 / len; for (let i = 0; i < len; i += 5) { if (s % 10 === 0) P.push([x, z, s]); x += Math.sin(th) * 5; z += Math.cos(th) * 5; th += k * 5; s += 5; } }
    let worst = 1e9, at = null; for (let i = 0; i < P.length; i++) for (let j = i + 25; j < P.length; j++) { const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]); if (d < worst) { worst = d; at = [P[i][2], P[j][2]]; } }
    if (worst < 45) E(key, '賽道在 s≈' + at[0] + ' 與 s≈' + at[1] + ' 相距只有 ' + worst.toFixed(0) + ' m，地形會互相干擾（需 ≥ 45 m，建議 ≥ 80）');
    else if (worst < 80) W(key, '賽道在 s≈' + at[0] + ' 與 s≈' + at[1] + ' 相距 ' + worst.toFixed(0) + ' m，偏近');
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    console.log('  · 長度 ' + L + ' m，賽段 ' + (R.sFinish - R.sStart) + ' m，範圍約 ' + ((x1 - x0) / 1000).toFixed(1) + ' × ' + ((z1 - z0) / 1000).toFixed(1) + ' km，最近非相鄰距離 ' + worst.toFixed(0) + ' m'); }
  if (!new RegExp('data-v="' + key + '"').test(html)) E(key, 'src/index.html 的 #sRoute 沒有這條路線的按鈕');
  if (server && !new RegExp("'" + key + "'").test(server.match(/const ROUTES = \[[^\]]*\]/)?.[0] || '')) E(key, 'server.js 的 ROUTES 白名單沒有 ' + key + '（線上對戰會載入錯的路線）');
}
console.log(errs ? '\n✗ ' + errs + ' 個錯誤、' + warns + ' 個提醒' : '\n✓ 通過（' + warns + ' 個提醒）');
process.exit(errs ? 1 : 0);
