// ───────────────────────── 139 縣道：賽道定義 ─────────────────────────
// 座標：+X 東、+Z 南、+Y 上。車頭方向 θ=0 朝南，θ 增加 = 左轉（朝東）。
// 遊戲賽道為實際 35.5 km（八卦山牌樓→松柏嶺受天宮）的 1:3 濃縮版，地標順序、走向與各段地景對應實境。
const DS = 2;
let S_START = 90, S_FINISH = 12000, S_END = 12300;

// [長度 m, 轉角 °（正 = 左）]
let PIECES = [
  // 1 八卦山大佛上山段 0–1300
  [120, 0], [90, -35], [60, 0], [80, 55], [50, 0], [70, -75], [60, 0], [75, 95], [40, 0], [70, -100], [80, 0], [100, 50], [60, 0], [90, -40], [70, 25], [85, 0], [100, 10],
  // 2 稜線北段・銀行山 1300–2400
  [150, -20], [120, 18], [100, 0], [110, -30], [90, 22], [130, 0], [120, -25], [100, 20], [80, 0], [100, -12],
  // 3 小葉欖仁綠色隧道 2400–3900
  [200, 0], [140, 30], [100, -45], [120, 0], [90, 40], [80, -50], [110, 35], [160, 0], [100, -30], [120, 28], [90, 0], [100, -22], [90, 14],
  // 4 相思林・鳳梨田 3900–5600
  [130, 35], [90, -60], [70, 0], [80, 55], [60, -45], [150, 0], [100, 30], [85, -65], [70, 70], [120, 0], [110, -35], [100, 40], [90, -30], [140, 0], [105, 20], [100, -11], [100, 0],
  // 5 19K–23K 連續彎道 5600–7200
  [60, 50], [55, -80], [40, 0], [60, 85], [50, -70], [70, 40], [45, 0], [65, -95], [60, 110], [50, -60], [80, 0], [55, 70], [60, -90], [50, 60], [40, 0], [70, -75], [65, 80], [60, -50], [90, 30], [55, -65], [60, 75], [70, 0], [80, -40], [70, 25], [70, -7], [70, 0],
  // 6 鳳山寺・八卦茶園 7200–8900
  [180, 0], [120, 25], [140, -35], [200, 0], [110, 30], [100, -40], [150, 0], [120, 35], [130, -30], [170, 0], [100, 22], [100, -12], [80, 0],
  // 7 猴探井・橫山 8900–10200
  [100, 35], [90, -50], [120, 0], [80, 45], [70, -40], [140, 0], [60, 70], [55, -100], [40, 0], [60, 105], [50, -85], [60, 0], [65, 80], [60, -95], [50, 40], [100, 0], [100, -10],
  // 8 赤水・松柏嶺 10200–12000
  [150, 0], [110, 30], [90, -45], [140, 0], [120, 40], [100, -55], [130, 35], [180, 0], [100, -30], [110, 40], [90, -25], [130, 0], [100, 15], [80, -10], [170, 0],
  // 終點後緩衝
  [300, 0]
];
let SECTIONS = [
  { s0: 0, s1: 1300, name: '八卦山大佛', sub: '彰化市・卦山路上山段', k0: 0, k1: 3.8 },
  { s0: 1300, s1: 2400, name: '稜線北段・銀行山', sub: '彰化市・東外環道口', k0: 3.8, k1: 7.0 },
  { s0: 2400, s1: 3900, name: '小葉欖仁綠色隧道', sub: '花壇鄉・芬園鄉', k0: 7.0, k1: 13.0 },
  { s0: 3900, s1: 5600, name: '相思林・鳳梨田', sub: '芬園鄉・員林市', k0: 13.0, k1: 19.0 },
  { s0: 5600, s1: 7200, name: '19K–23K 連續彎道', sub: '彰化／南投縣界・落羽松', k0: 19.0, k1: 23.0 },
  { s0: 7200, s1: 8900, name: '鳳山寺・八卦茶園', sub: '南投市・八卦路', k0: 23.0, k1: 28.0 },
  { s0: 8900, s1: 10200, name: '猴探井・橫山', sub: '八卦山脈最高點 443 m', k0: 28.0, k1: 31.0 },
  { s0: 10200, s1: 12000, name: '赤水・松柏嶺', sub: '名間鄉・受天宮', k0: 31.0, k1: 35.5 },
];
let LANDMARKS = [
  { s: 90, name: '八卦山牌樓' }, { s: 430, name: '八卦山大佛' }, { s: 1750, name: '銀行山' }, { s: 1965, name: '台74甲 東外環道口' },
  { s: 2500, name: '小葉欖仁綠色隧道' }, { s: 4900, name: '縣道148 路口' }, { s: 6060, name: '落羽松森林' }, { s: 6400, name: '21K 測速照相' },
  { s: 7260, name: '鳳山寺' }, { s: 7900, name: '鳳梨酥三合院' }, { s: 9080, name: '猴探井天空之橋' }, { s: 9560, name: '橫山' },
  { s: 10500, name: '赤水三叉路口' }, { s: 12000, name: '松柏嶺受天宮' }
];
// 路面高程控制點（遊戲內）與實際海拔對照
let ELEV = [[0, 38], [100, 39.5], [400, 62], [800, 92], [1300, 122], [1700, 130], [1950, 140], [2400, 148], [3000, 162], [3400, 158], [3900, 176], [4400, 196], [4850, 190], [5200, 208], [5600, 224],
[6000, 246], [6400, 240], [6800, 262], [7200, 280], [7900, 288], [8400, 282], [8900, 296], [9300, 312], [9580, 326], [9900, 304], [10200, 286], [10500, 280], [11000, 290], [11500, 300], [12000, 308], [12300, 308]];
let REAL_ALT = [[0, 35], [430, 97], [1300, 150], [1965, 193], [3900, 255], [5600, 325], [7200, 400], [8900, 420], [9580, 443], [10500, 395], [12000, 430], [12300, 430]];

// 地形／地景分區關鍵影格： s, 台地半寬(左=東, 右=西), 側坡偏置, 山腰起伏強度, 地表起伏
let ZKEYS = [
  { s: 0, plL: 500, plR: 500, bkL: 0, bkR: 0, hs: 0, und: 0.4 },
  { s: 220, plL: 300, plR: 200, bkL: 0.1, bkR: 0, hs: 0, und: 0.6 },
  { s: 420, plL: 70, plR: 110, bkL: 0.55, bkR: -0.15, hs: 0.2, und: 1.5 },
  { s: 1300, plL: 90, plR: 50, bkL: 0.2, bkR: -0.4, hs: 0.3, und: 3 },
  { s: 2400, plL: 150, plR: 110, bkL: 0.05, bkR: -0.1, hs: 0.15, und: 2.5 },
  { s: 2900, plL: 160, plR: 120, bkL: 0, bkR: -0.05, hs: 0.15, und: 2.5 },
  { s: 3900, plL: 170, plR: 120, bkL: 0, bkR: -0.1, hs: 0.2, und: 3 },
  { s: 5450, plL: 130, plR: 100, bkL: 0.1, bkR: -0.2, hs: 0.3, und: 3 },
  { s: 5650, plL: 38, plR: 32, bkL: 0, bkR: 0, hs: 0.95, und: 4 },
  { s: 7080, plL: 38, plR: 32, bkL: 0, bkR: 0, hs: 0.95, und: 4 },
  { s: 7260, plL: 260, plR: 220, bkL: 0, bkR: 0, hs: 0.08, und: 2 },
  { s: 8850, plL: 240, plR: 200, bkL: 0, bkR: 0, hs: 0.08, und: 2 },
  { s: 9000, plL: 130, plR: 46, bkL: 0.1, bkR: -0.5, hs: 0.3, und: 3 },
  { s: 9450, plL: 90, plR: 42, bkL: -0.1, bkR: -0.35, hs: 0.15, und: 2.5 },
  { s: 9640, plL: 60, plR: 40, bkL: 0, bkR: -0.2, hs: 0.5, und: 3 },
  { s: 9720, plL: 38, plR: 32, bkL: 0, bkR: 0, hs: 0.95, und: 4 },
  { s: 10120, plL: 38, plR: 32, bkL: 0, bkR: 0, hs: 0.95, und: 4 },
  { s: 10320, plL: 250, plR: 210, bkL: 0, bkR: 0, hs: 0.08, und: 2 },
  { s: 11650, plL: 260, plR: 220, bkL: 0, bkR: 0, hs: 0.05, und: 1.5 },
  { s: 11800, plL: 320, plR: 300, bkL: 0, bkR: 0, hs: 0, und: 0.5 },
  { s: 12300, plL: 320, plR: 300, bkL: 0, bkR: 0, hs: 0, und: 0.5 }
];
// 土地利用代碼
const LU = { FOREST: 0, TEA: 1, PINE: 2, ORCHARD: 3, PASTURE: 4, BETEL: 5, BAMBOO: 6, TOWN: 7, CYPRESS: 8, VEG: 9, SAND: 10, POND: 11 };
// 景觀分區：s 範圍、土地利用權重 [forest, tea, pine, orchard, pasture, betel, bamboo, town, cypress, veg]、路樹
let ZONES = [
  { s0: -100, s1: 250, id: 'city', w: [0.1, 0, 0, 0, 0.1, 0, 0, 0.8, 0, 0], row: { sp: 15, ty: 'banyan', p: 0.8 }, dens: 0.5 },
  { s0: 250, s1: 1300, id: 'park', w: [0.86, 0, 0, 0, 0.04, 0, 0.1, 0, 0, 0], row: { sp: 7, ty: 'mix', p: 0.85 }, dens: 1 },
  { s0: 1300, s1: 2400, id: 'ridgeN', w: [0.66, 0, 0, 0.04, 0.12, 0, 0.08, 0, 0, 0.1], row: { sp: 8, ty: 'acacia', p: 0.7 }, dens: 0.9 },
  { s0: 2400, s1: 2950, id: 'tunnel', w: [0.25, 0, 0, 0.15, 0.25, 0, 0, 0, 0, 0.35], row: { sp: 8, ty: 'terminalia', p: 1 }, dens: 0.8 },
  { s0: 2950, s1: 3900, id: 'mixed', w: [0.45, 0, 0, 0.15, 0.2, 0, 0.1, 0, 0, 0.1], row: { sp: 6.5, ty: 'acacia', p: 0.9 }, dens: 0.9 },
  { s0: 3900, s1: 5600, id: 'pine', w: [0.3, 0, 0.38, 0.22, 0, 0, 0.05, 0.05, 0, 0], row: { sp: 14, ty: 'mix', p: 0.35 }, dens: 0.85 },
  { s0: 5600, s1: 7200, id: 'twist', w: [0.86, 0, 0, 0, 0, 0, 0.14, 0, 0, 0], row: { sp: 6, ty: 'mix', p: 0.9 }, dens: 1.1 },
  { s0: 7200, s1: 8900, id: 'plateau', w: [0.1, 0.42, 0.25, 0.07, 0, 0.1, 0, 0.06, 0, 0], row: { sp: 22, ty: 'broad', p: 0.3 }, dens: 0.8 },
  { s0: 8900, s1: 9650, id: 'hengshan', w: [0.4, 0.1, 0.25, 0, 0.1, 0, 0, 0, 0, 0.15], row: { sp: 12, ty: 'mix', p: 0.4 }, dens: 0.85 },
  { s0: 9650, s1: 10200, id: 'descent', w: [0.9, 0, 0, 0, 0, 0, 0.1, 0, 0, 0], row: { sp: 6, ty: 'mix', p: 0.9 }, dens: 1.1 },
  { s0: 10200, s1: 11700, id: 'tea', w: [0.1, 0.6, 0.07, 0, 0, 0.15, 0, 0.08, 0, 0], row: { sp: 24, ty: 'broad', p: 0.3 }, dens: 0.8 },
  { s0: 11700, s1: 12600, id: 'town', w: [0, 0.2, 0, 0, 0, 0, 0, 0.8, 0, 0], row: { sp: 18, ty: 'banyan', p: 0.5 }, dens: 0.5 }
];
function zoneOf(s) { for (let i = 0; i < ZONES.length; i++) if (s < ZONES[i].s1) return ZONES[i]; return ZONES[ZONES.length - 1]; }

const TR = { n: 0 };

function interpTable(tab, s) {
  if (s <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (s <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; return lerp(a[1], b[1], (s - a[0]) / (b[0] - a[0])); }
  return tab[tab.length - 1][1];
}
function boxSmooth(arr, r, passes = 1) {
  const n = arr.length; let a = arr, b = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    let acc = 0; const w = 2 * r + 1;
    for (let i = -r; i <= r; i++) acc += a[clamp(i, 0, n - 1)];
    for (let i = 0; i < n; i++) { b[i] = acc / w; acc += a[clamp(i + r + 1, 0, n - 1)] - a[clamp(i - r, 0, n - 1)]; }
    const t = a; a = b; b = (t === arr) ? new Float32Array(n) : t;
  }
  return a;
}

function buildTrack() {
  // 1 m 解析度曲率
  let L = 0; for (const p of PIECES) L += p[0];
  const n1 = Math.round(L) + 1;
  let k1 = new Float32Array(n1);
  let s = 0;
  for (const p of PIECES) { const k = p[1] * DEG / p[0]; for (let i = 0; i < p[0]; i++) k1[s + i] = k; s += p[0]; }
  k1 = boxSmooth(k1, 13, 2);
  // 高程：Catmull-Rom → 平滑
  let e1 = new Float32Array(n1);
  for (let i = 0; i < n1; i++) {
    let j = 1; while (j < ELEV.length - 1 && ELEV[j][0] < i) j++;
    const p1 = ELEV[j - 1], p2 = ELEV[j], p0 = ELEV[Math.max(0, j - 2)], p3 = ELEV[Math.min(ELEV.length - 1, j + 1)];
    const t = sat((i - p1[0]) / (p2[0] - p1[0]));
    const m1 = (p2[1] - p0[1]) / Math.max(1, p2[0] - p0[0]) * (p2[0] - p1[0]), m2 = (p3[1] - p1[1]) / Math.max(1, p3[0] - p1[0]) * (p2[0] - p1[0]);
    const t2 = t * t, t3 = t2 * t;
    e1[i] = (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  }
  for (let i = 0; i < n1; i++) {
    const flat = smooth(140, 320, i) * (1 - smooth(S_FINISH - 250, S_FINISH - 100, i)) * ROUTE.elevNoise;
    e1[i] += flat * ((noise1(i / 230, 5) - 0.5) * 3.2 + (noise1(i / 95, 9) - 0.5) * 1.0);
  }
  e1 = boxSmooth(e1, 30, 2);
  // 取樣
  const n = Math.floor(L / DS) + 1;
  TR.n = n; TR.len = (n - 1) * DS;
  const A = () => new Float32Array(n);
  TR.x = A(); TR.y = A(); TR.z = A(); TR.th = A(); TR.k = A(); TR.bank = A(); TR.hw = A(); TR.tx = A(); TR.tz = A(); TR.nx = A(); TR.nz = A(); TR.grade = A();
  let th = ROUTE.heading0 * DEG, x = 0, z = 0;
  for (let i = 0; i < n; i++) {
    const si = i * DS;
    TR.x[i] = x; TR.z[i] = z; TR.th[i] = th; TR.k[i] = k1[Math.min(n1 - 1, si)]; TR.y[i] = e1[Math.min(n1 - 1, si)];
    for (let j = 0; j < DS; j++) { const kk = k1[Math.min(n1 - 1, si + j)]; const tm = th + kk * 0.5; x += Math.sin(tm); z += Math.cos(tm); th += kk; }
  }
  // 置中
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, TR.x[i]); x1 = Math.max(x1, TR.x[i]); z0 = Math.min(z0, TR.z[i]); z1 = Math.max(z1, TR.z[i]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < n; i++) { TR.x[i] -= cx; TR.z[i] -= cz; }
  TR.minX = x0 - cx; TR.maxX = x1 - cx; TR.minZ = z0 - cz; TR.maxZ = z1 - cz;
  let bank = A(), hw = A();
  for (let i = 0; i < n; i++) {
    const si = i * DS;
    TR.tx[i] = Math.sin(TR.th[i]); TR.tz[i] = Math.cos(TR.th[i]);
    TR.nx[i] = Math.cos(TR.th[i]); TR.nz[i] = -Math.sin(TR.th[i]);
    bank[i] = clamp(TR.k[i] * 2.6, -0.05, 0.05);
    let w = ROUTE.hwFn(si);
    hw[i] = w;
    TR.grade[i] = i > 0 ? (TR.y[i] - TR.y[i - 1]) / DS : 0;
  }
  TR.grade[0] = TR.grade[1];
  TR.bank = boxSmooth(bank, 6, 1); TR.hw = hw;
  buildRacingLine();
}

// 內插取樣
function trackAt(s, o) {
  o = o || {};
  const f = clamp(s / DS, 0, TR.n - 1.001), i = f | 0, t = f - i, j = i + 1;
  o.i = i; o.s = s;
  o.x = lerp(TR.x[i], TR.x[j], t); o.y = lerp(TR.y[i], TR.y[j], t); o.z = lerp(TR.z[i], TR.z[j], t);
  o.th = TR.th[i] + (TR.th[j] - TR.th[i]) * t;
  o.tx = Math.sin(o.th); o.tz = Math.cos(o.th); o.nx = o.tz; o.nz = -o.tx;
  o.k = lerp(TR.k[i], TR.k[j], t); o.bank = lerp(TR.bank[i], TR.bank[j], t); o.hw = lerp(TR.hw[i], TR.hw[j], t);
  o.grade = lerp(TR.grade[i], TR.grade[j], t);
  o.rl = lerp(TR.rl[i], TR.rl[j], t); o.rv = lerp(TR.rv[i], TR.rv[j], t);
  return o;
}
// 世界座標 → (s, d)；hint 為上一次的 s（<0 代表全域搜尋）
function trackProject(x, z, hint, o) {
  o = o || {};
  let i0, i1, best = 1e18, bi = 0;
  if (hint >= 0) { const h = Math.round(hint / DS); i0 = Math.max(0, h - 40); i1 = Math.min(TR.n - 2, h + 40); }
  else {
    i0 = 0; i1 = TR.n - 2;
    for (let i = 0; i < TR.n; i += 8) { const dx = x - TR.x[i], dz = z - TR.z[i], d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
    i0 = Math.max(0, bi - 10); i1 = Math.min(TR.n - 2, bi + 10); best = 1e18;
  }
  let bt = 0;
  for (let i = i0; i <= i1; i++) {
    const ax = TR.x[i], az = TR.z[i], bx = TR.x[i + 1] - ax, bz = TR.z[i + 1] - az;
    const t = sat(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz));
    const px = ax + bx * t - x, pz = az + bz * t - z, d = px * px + pz * pz;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  const th = TR.th[bi] + (TR.th[bi + 1] - TR.th[bi]) * bt;
  const cx = lerp(TR.x[bi], TR.x[bi + 1], bt), cz = lerp(TR.z[bi], TR.z[bi + 1], bt);
  o.s = (bi + bt) * DS;
  o.d = (x - cx) * Math.cos(th) + (z - cz) * (-Math.sin(th));
  o.th = th; o.dist = Math.sqrt(best);
  return o;
}
function realK(s) { for (const c of SECTIONS) if (s < c.s1) return lerp(c.k0, c.k1, sat((s - c.s0) / (c.s1 - c.s0))); return SECTIONS[SECTIONS.length - 1].k1; }
function sOfRealK(k) { for (const c of SECTIONS) if (k <= c.k1) return lerp(c.s0, c.s1, sat((k - c.k0) / (c.k1 - c.k0))); return S_FINISH; }
function sectionAt(s) { for (let i = 0; i < SECTIONS.length; i++) if (s < SECTIONS[i].s1) return i; return SECTIONS.length - 1; }
function realAlt(s) { return interpTable(REAL_ALT, s); }

const _zk = {};
function zoneParams(s, o) {
  o = o || _zk;
  let j = 1; while (j < ZKEYS.length - 1 && ZKEYS[j].s < s) j++;
  const a = ZKEYS[j - 1], b = ZKEYS[j]; let t = sat((s - a.s) / (b.s - a.s)); t = t * t * (3 - 2 * t);
  o.plL = lerp(a.plL, b.plL, t); o.plR = lerp(a.plR, b.plR, t); o.bkL = lerp(a.bkL, b.bkL, t); o.bkR = lerp(a.bkR, b.bkR, t);
  o.hs = lerp(a.hs, b.hs, t); o.und = lerp(a.und, b.und, t);
  // 山腰路：一側上邊坡、一側下邊坡，沿線交替
  const w = (noise1(s / 210, 21) - 0.5) * 2.4;
  const ws = clamp(w, -1, 1);
  o.bkL = clamp(o.bkL + o.hs * ws, -1, 1); o.bkR = clamp(o.bkR - o.hs * ws, -1, 1);
  return o;
}

// 最短／平滑賽車線與速度剖面
function buildRacingLine() {
  const n = TR.n;
  let d = new Float32Array(n);
  const lim = i => TR.hw[i] - 1.45;
  for (const step of [48, 24, 12, 6, 3, 1]) {
    const iters = step > 6 ? 40 : 70;
    for (let it = 0; it < iters; it++) {
      for (let i = 1; i < n - 1; i++) {
        const a = Math.max(0, i - step), b = Math.min(n - 1, i + step);
        const ax = TR.x[a] + TR.nx[a] * d[a], az = TR.z[a] + TR.nz[a] * d[a];
        const bx = TR.x[b] + TR.nx[b] * d[b], bz = TR.z[b] + TR.nz[b] * d[b];
        const f = (i - a) / (b - a);
        const mx = lerp(ax, bx, f), mz = lerp(az, bz, f);
        const t = (mx - TR.x[i]) * TR.nx[i] + (mz - TR.z[i]) * TR.nz[i];
        const L = lim(i);
        d[i] = lerp(d[i], clamp(t, -L, L), 0.6);
      }
    }
  }
  d = boxSmooth(d, 5, 2);
  // 起跑區回到中線
  for (let i = 0; i < n; i++) { const s = i * DS; d[i] *= smooth(120, 260, s); }
  TR.rl = d;
  // 線上曲率
  const px = new Float32Array(n), pz = new Float32Array(n);
  for (let i = 0; i < n; i++) { px[i] = TR.x[i] + TR.nx[i] * d[i]; pz[i] = TR.z[i] + TR.nz[i] * d[i]; }
  let kl = new Float32Array(n);
  const st = 4;
  for (let i = st; i < n - st; i++) {
    const ax = px[i] - px[i - st], az = pz[i] - pz[i - st], bx = px[i + st] - px[i], bz = pz[i + st] - pz[i];
    const cr = az * bx - ax * bz; // sign: left turn positive
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(px[i + st] - px[i - st], pz[i + st] - pz[i - st]);
    kl[i] = 2 * cr / (la * lb * lc + 1e-9);
  }
  kl = boxSmooth(kl, 3, 1);
  TR.kl = kl;
  const rv = new Float32Array(n);
  const aLat = 12.2, vTop = 68;
  for (let i = 0; i < n; i++) rv[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(Math.abs(kl[i]), 1e-4)));
  for (let i = n - 2; i >= 0; i--) {
    const lat = rv[i + 1] * rv[i + 1] * Math.abs(kl[i + 1]);
    const ab = 10.5 * Math.sqrt(Math.max(0.15, 1 - (lat / 13.5) ** 2)) + 9.81 * TR.grade[i];
    rv[i] = Math.min(rv[i], Math.sqrt(rv[i + 1] * rv[i + 1] + 2 * ab * DS));
  }
  rv[0] = Math.min(rv[0], 5);
  for (let i = 0; i < n - 1; i++) {
    const v = Math.max(rv[i], 3);
    const aa = Math.min(7.2, 245000 / (1250 * v)) - 0.36 * v * v / 1250 - 9.81 * TR.grade[i];
    rv[i + 1] = Math.min(rv[i + 1], Math.sqrt(v * v + 2 * Math.max(0.3, aa) * DS));
  }
  TR.rv = rv;
}
