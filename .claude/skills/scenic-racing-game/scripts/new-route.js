#!/usr/bin/env node
// 新增路線骨架（可直接建置執行，之後再依實景改寫）
// 用法：node <skill>/scripts/new-route.js <專案資料夾> --key sunmoon --title "日月潭 環湖" --shield "台21" --type mountain [--km 33] [--len 9000] [--sub "起點 → 終點"]
//   --type  mountain（山路，四周丘陵）| coast（右側臨海，含沙灘與海面）| plain（平原、田野、聚落）
//   --km    實際路線長度（公里），用於 HUD 里程換算
//   --len   遊戲內賽道長度（公尺，建議 7000–12000）
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2), root = path.resolve(argv[0] && !argv[0].startsWith('--') ? argv.shift() : '.');
const opt = {}; for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1];
const key = opt.key, title = opt.title, shield = opt.shield || '景', type = opt.type || 'mountain';
if (!key || !/^[a-z][a-z0-9_]{1,15}$/.test(key) || !title) { console.error('需要 --key（小寫英數，例 sunmoon）與 --title（例 "日月潭 環湖"）'); process.exit(2); }
if (!['mountain', 'coast', 'plain'].includes(type)) { console.error('--type 只能是 mountain、coast 或 plain'); process.exit(2); }
const F = { routes: path.join(root, 'src/js/14_routes.js'), html: path.join(root, 'src/index.html'), server: path.join(root, 'server.js') };
for (const f of [F.routes, F.html]) if (!fs.existsSync(f)) { console.error('找不到 ' + f); process.exit(2); }
let routes = fs.readFileSync(F.routes, 'utf8');
if (new RegExp('\\n  ' + key + ': \\{').test(routes)) { console.error('路線 ' + key + ' 已存在'); process.exit(2); }

const target = Math.max(5000, Math.min(16000, +(opt.len || 9000))), km = +(opt.km || target / 1000 * 2.5);
// 骨架彎道：左右交替，整體方向維持前進；山路較曲折
const pat = {
  mountain: [[160, 0], [110, 35], [90, -45], [140, 0], [100, 50], [90, -40], [200, 0], [120, 30], [80, -60], [70, 55], [150, 0], [110, -30]],
  coast: [[220, 0], [160, -20], [140, 25], [260, 0], [150, 30], [130, -25], [300, 0], [170, -15], [160, 20]],
  plain: [[300, 0], [200, 20], [180, -20], [400, 0], [220, -25], [200, 25], [350, 0]]
}[type];
const pieces = [[120, 0]]; let L = 120, k = 0;
while (L < target + 300) { const p = pat[k++ % pat.length]; pieces.push(p.slice()); L += p[0]; }
pieces.push([300, 0]); L += 300;
const sEnd = L - 300, sFinish = sEnd - 300, n = 4, seg = sFinish / n;
const sections = [], zones = [];
const W = {
  mountain: [0.6, 0, 0, 0.1, 0.1, 0, 0.1, 0.05, 0, 0.05, 0, 0],
  coast: [0.4, 0, 0, 0, 0.3, 0.1, 0, 0.1, 0, 0, 0.1, 0],
  plain: [0.2, 0, 0, 0.15, 0.25, 0.05, 0.05, 0.15, 0, 0.15, 0, 0]
}[type];
const MIX = { mountain: [['acacia', 0.45], ['broad', 0.35], ['bamboo', 0.1], ['shrub', 0.1]], coast: [['casuarina', 0.4], ['broad', 0.3], ['pandanus', 0.3]], plain: [['broad', 0.6], ['lychee', 0.2], ['betel', 0.1], ['banana', 0.1]] }[type];
const ROW = { mountain: { sp: 8, ty: [['acacia', 0.5], ['broad', 0.5]], p: 0.8 }, coast: { sp: 12, ty: 'coconut', p: 0.6 }, plain: { sp: 14, ty: 'broad', p: 0.6 } }[type];
for (let i = 0; i < n; i++) {
  const s0 = Math.round(i * seg), s1 = i === n - 1 ? sFinish : Math.round((i + 1) * seg);
  sections.push({ s0, s1, name: '第' + '一二三四'[i] + '段（待改：地名）', sub: '待改：鄉鎮・特色', k0: +(km * i / n).toFixed(1), k1: +(km * (i + 1) / n).toFixed(1) });
  zones.push(Object.assign({ s0: i ? s0 : -100, s1: i === n - 1 ? sEnd + 300 : s1, id: key + '_' + i, w: W, row: ROW, dens: 0.9, mix: MIX }, type === 'coast' ? { palm: 'coconut', pasture: 'pandanus', pastureP: 0.03 } : {}, type === 'plain' ? { poles: 1 } : {}));
}
const elev = type === 'mountain' ? [[0, 60], [Math.round(sEnd * 0.3), 150], [Math.round(sEnd * 0.6), 260], [Math.round(sEnd * 0.8), 230], [sEnd, 280]]
  : type === 'coast' ? [[0, 6], [Math.round(sEnd * 0.5), 14], [sEnd, 8]] : [[0, 20], [Math.round(sEnd * 0.5), 30], [sEnd, 24]];
const zk = { mountain: { plL: 120, plR: 100, bkL: 0.1, bkR: -0.15, hs: 0.3, und: 3 }, coast: { plL: 320, plR: 32, bkL: 0.05, bkR: -0.1, hs: 0, und: 0.6 }, plain: { plL: 450, plR: 450, bkL: 0, bkR: 0, hs: 0, und: 0.5 } }[type];
const zkeys = [Object.assign({ s: 0 }, zk), Object.assign({ s: sEnd }, zk)];
const J = v => JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ');
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const plainFn = {
  mountain: `plain(x, z) { return 40 + (fbm(x / 900, z / 900, 3, 501) - 0.5) * 40 + ridged(x / 1600, z / 1600, 3, 503) * 140; }`,
  coast: `plain(x, z) { const dl = (x - this.A[0]) * this.n1[0] + (z - this.A[1]) * this.n1[1] + 200; const land = 2 + fbm(x / 600, z / 600, 3, 81) * 55 * smooth(450, 1700, dl) + ridged(x / 1500, z / 1500, 3, 83) * 170 * smooth(600, 3000, dl); return lerp(-7, land, smooth(-150, 250, dl)); }`,
  plain: `plain(x, z) { return 18 + (fbm(x / 700, z / 700, 3, 505) - 0.5) * 10; }`
}[type];
const water = type === 'coast' ? `sea: 0, seaMin: 0.7, water: { deep: [0.008, 0.07, 0.19, 1], shallow: [0.04, 0.36, 0.36, 5], beach: 1 }, soil: [2.7, 6.2, 9.0], plainPatch: 0,` : `sea: -999, seaMin: -999, water: null, soil: [1, 1, 1], plainPatch: 1,`;
const init = type === 'coast' ? `init() { const a = trackAt(0, {}), b = trackAt(this.sFinish, {}), l = Math.hypot(b.x - a.x, b.z - a.z); this.A = [a.x, a.z]; this.n1 = [(b.z - a.z) / l, -(b.x - a.x) / l]; },` : `init() { },`;
const over = type === 'coast' ? `landOverride(s, left, ad) { if (!left && ad > 10) return LU.SAND; return -1; },` : `landOverride: noOverride,`;
const block = `
  // ── ${title}（由 new-route.js 產生的骨架：pieces、sections、zones、elev、plan 都要依實景改寫）
  ${key}: {
    key: '${key}', shield: '${esc(shield)}', title: '${esc(title)}', sub: '${esc(opt.sub || '起點 → 終點（待改）')}', tag: '待改',
    desc: '待改：一兩句描述沿途實景（依查證資料撰寫）。',
    note: '實際約 ${km} km，濃縮為 ${(sFinish / 1000).toFixed(1)} km；彎道為依走向編排，非 GPS 實測。',
    pieces: ${J(pieces)},
    sections: [
${sections.map(s => '      ' + J(s)).join(',\n')}],
    landmarks: [{ s: 90, name: '起點（待改）' }, { s: ${sFinish}, name: '終點（待改）' }],
    elev: ${J(elev)},
    realAlt: ${J(elev)},
    zkeys: [
${zkeys.map(z => '      ' + J(z)).join(',\n')}],
    zones: [
${zones.map(z => '      ' + J(z)).join(',\n')}],
    junctions: [], sStart: 90, sFinish: ${sFinish}, sEnd: ${sEnd}, heading0: 0, elevNoise: ${type === 'mountain' ? 0.8 : 0.3}, kmMax: ${Math.max(1, Math.floor(km) - 1)}, attractS: 600,
    hwFn(si) { return lerp(6.2, 5.0, smooth(180, 320, si)); },
    slopeL: ${type === 'coast' ? 0.12 : 0.3}, slopeR: ${type === 'coast' ? 0.5 : 0.35}, gully: ${type === 'mountain' ? 0.8 : 0.2}, bridge: noBridge, ${water} ponds: 0, mount: ${type === 'coast' ? '[0.5, 0.9, 0.8, -PI / 2]' : '[1, 0.8, 0.6, 0]'},
    ${over}
    streets: [], streetSkip: () => false,
    plan(add, tr) { /* 地標：add('類型', s, d, { r: 整地半徑, flat: false, y: 高度 })，類型見 PROP_EXTRA 與 11_props.js */ },
    signs: () => [],
    gates: [{ s: 116, plaque: -1, banner: 0 }, { s: ${sFinish}, plaque: -1, banner: 1 }], decal40: [], zebras: [],
    ${init}
    ${plainFn}
  }`;
const anchor = routes.lastIndexOf('\n};\nfunction applyRoute');
if (anchor < 0) { console.error('14_routes.js 找不到 ROUTES 結尾（"};" 後接 function applyRoute）'); process.exit(1); }
routes = routes.slice(0, anchor) + ',' + block + routes.slice(anchor);
fs.writeFileSync(F.routes, routes);
let html = fs.readFileSync(F.html, 'utf8');
const m = html.match(/(<div class="seg" id="sRoute">[\s\S]*?)(<\/div><\/div>)/);
if (!m) { console.error('index.html 找不到 #sRoute'); process.exit(1); }
html = html.replace(m[0], m[1] + `<button data-v="${key}" aria-pressed="false">${title}<small>待改　${(sFinish / 1000).toFixed(0)} km</small></button>` + m[2]);
fs.writeFileSync(F.html, html);
if (fs.existsSync(F.server)) { let sv = fs.readFileSync(F.server, 'utf8'); sv = sv.replace(/const ROUTES = \[([^\]]*)\]/, (a, b) => `const ROUTES = [${b}, '${key}']`); fs.writeFileSync(F.server, sv); }
console.log(`已新增路線 ${key}（${type}，賽段 ${sFinish} m）。下一步：
  1. 依實景改寫 src/js/14_routes.js 裡 ${key} 的 pieces／sections／zones／elev／plan
  2. node <skill>/scripts/check-route.js ${path.relative(process.cwd(), root) || '.'} ${key}
  3. node build.js`);
