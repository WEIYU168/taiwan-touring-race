// ───────────────────────── 程序化貼圖 ─────────────────────────
const TEX = {};
const CJK = '"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei","Heiti TC","Noto Sans CJK JP",sans-serif';
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
function canvasPixels(cv) { // 上下翻轉，使 v=1 對應畫布頂端
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data, o = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) o.set(d.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return o;
}
function pnoise(x, y, per, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const w = (a, b) => hash2(((a % per) + per) % per, ((b % per) + per) % per, seed);
  return lerp(lerp(w(ix, iy), w(ix + 1, iy), ux), lerp(w(ix, iy + 1), w(ix + 1, iy + 1), ux), uy);
}
function pfbm(u, v, base, oct, seed) { let s = 0, a = 0.5, n = 0, f = base; for (let o = 0; o < oct; o++) { s += a * pnoise(u * f, v * f, f, seed + o * 13); n += a; a *= 0.5; f *= 2; } return s / n; }
const stretch = (v, k = 1.7) => sat((v - 0.5) * k + 0.5);

function buildNoiseTex() {
  const S = 256, d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, o = (y * S + x) * 4;
    d[o] = stretch(pfbm(u, v, 4, 5, 1)) * 255; d[o + 1] = stretch(pfbm(u, v, 8, 4, 2)) * 255; d[o + 2] = stretch(pfbm(u, v, 16, 3, 3)) * 255; d[o + 3] = stretch(pfbm(u, v, 32, 2, 4), 1.4) * 255;
  }
  TEX.noise = texFromData(S, S, d, {});
}

function pixCanvas(S, fn) {
  const c = mkCanvas(S), x = c.getContext('2d'), im = x.createImageData(S, S), d = im.data, col = [0, 0, 0];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) { fn(px / S, py / S, col, px, py); const o = (py * S + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
  x.putImageData(im, 0, 0); return c;
}
// 重複貼磚用：靠邊的筆觸多畫一份
function wrapDo(S, x, y, m, fn) { for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { const X = x + ox * S, Y = y + oy * S; if (X > -m && X < S + m && Y > -m && Y < S + m) fn(X, Y); } }

function buildGroundTex() {
  const S = 512, R = mulberry32(77), L = [];
  // 0 草地
  { const c = pixCanvas(S, (u, v, o) => { const n = pfbm(u, v, 6, 4, 11), m = pfbm(u, v, 24, 3, 12); const g = 0.75 + n * 0.4 + m * 0.2; o[0] = 68 * g + m * 22; o[1] = 88 * g + m * 10; o[2] = 40 * g; });
    const x = c.getContext('2d'); x.lineCap = 'round';
    for (let i = 0; i < 5200; i++) { const px = R() * S, py = R() * S, a = -PI / 2 + (R() - 0.5) * 1.6, l = 4 + R() * 9, t = R();
      x.strokeStyle = t < 0.12 ? `rgba(${150 + R() * 40 | 0},${140 + R() * 30 | 0},70,0.6)` : `rgba(${40 + R() * 60 | 0},${78 + R() * 70 | 0},${20 + R() * 30 | 0},0.7)`; x.lineWidth = 0.8 + R() * 1.2;
      wrapDo(S, px, py, 14, (X, Y) => { x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); x.stroke(); }); }
    L.push(c); }
  // 1 紅土（八卦台地紅土礫石層）
  { const c = pixCanvas(S, (u, v, o) => { const n = pfbm(u, v, 5, 5, 21), m = pfbm(u, v, 40, 2, 22); const g = 0.78 + n * 0.36 + m * 0.14; o[0] = 126 * g; o[1] = 76 * g; o[2] = 52 * g; });
    const x = c.getContext('2d');
    for (let i = 0; i < 900; i++) { const px = R() * S, py = R() * S, r = 0.8 + R() * R() * 5, t = R(); x.fillStyle = t < 0.5 ? `rgba(${180 + R() * 40 | 0},${150 + R() * 40 | 0},${120 + R() * 40 | 0},0.75)` : `rgba(${90 + R() * 30 | 0},${48 + R() * 20 | 0},30,0.6)`;
      wrapDo(S, px, py, 8, (X, Y) => { x.beginPath(); x.ellipse(X, Y, r, r * (0.6 + R() * 0.4), R() * 3, 0, TAU); x.fill(); }); }
    L.push(c); }
  // 2 落葉林床
  { const c = pixCanvas(S, (u, v, o) => { const n = pfbm(u, v, 6, 4, 31), m = pfbm(u, v, 30, 2, 32); const g = 0.7 + n * 0.5; o[0] = 62 * g + m * 20; o[1] = 52 * g + m * 14; o[2] = 30 * g; });
    const x = c.getContext('2d');
    for (let i = 0; i < 2600; i++) { const px = R() * S, py = R() * S, a = R() * TAU, l = 5 + R() * 9, t = R();
      x.fillStyle = t < 0.3 ? `rgba(${120 + R() * 50 | 0},${88 + R() * 30 | 0},40,0.8)` : t < 0.55 ? `rgba(${45 + R() * 30 | 0},${70 + R() * 40 | 0},25,0.75)` : `rgba(${70 + R() * 30 | 0},${48 + R() * 20 | 0},26,0.8)`;
      wrapDo(S, px, py, 14, (X, Y) => { x.save(); x.translate(X, Y); x.rotate(a); x.beginPath(); x.ellipse(0, 0, l, l * 0.3, 0, 0, TAU); x.fill(); x.restore(); }); }
    L.push(c); }
  // 3 混凝土／碎石地
  { const c = pixCanvas(S, (u, v, o, px, py) => { const n = pfbm(u, v, 4, 4, 41), m = hash2(px, py, 43); const g = 0.82 + n * 0.25 + (m - 0.5) * 0.12; o[0] = 150 * g; o[1] = 148 * g; o[2] = 141 * g; });
    const x = c.getContext('2d'); x.strokeStyle = 'rgba(60,60,58,0.35)'; x.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) { const p = (i + 0.5) / 4 * S; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(S, p); x.stroke(); }
    L.push(c); }
  // 4 瀝青
  { const c = pixCanvas(S, (u, v, o, px, py) => { const n = pfbm(u, v, 5, 4, 51), m = hash2(px, py, 53), m2 = hash2(px >> 1, py >> 1, 54); let g = 0.86 + n * 0.2 + (m - 0.5) * 0.3 + (m2 - 0.5) * 0.16; if (m > 0.972) g += 0.55; if (m2 < 0.03) g -= 0.25; o[0] = 74 * g; o[1] = 75 * g; o[2] = 78 * g; });
    L.push(c); }
  // 5 白色標線磨損遮罩（灰階）
  { const c = pixCanvas(S, (u, v, o, px, py) => { const n = pfbm(u, v, 9, 4, 61), m = hash2(px, py, 63); const g = sat(0.55 + n * 0.8 + (m - 0.5) * 0.35) * 255; o[0] = o[1] = o[2] = g; });
    L.push(c); }
  TEX.ground = texArray(L, S, S, {});
}

// 葉片圖層（顏色 + 遮罩）
function mkLeafLayer(S, base, seed, fn) {
  const cc = mkCanvas(S), mc = mkCanvas(S), c = cc.getContext('2d'), m = mc.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, S, S); m.fillStyle = '#000'; m.fillRect(0, 0, S, S);
  const P = {
    leaf(x, y, len, wid, ang, col, vein) {
      for (let k = 0; k < 2; k++) { const ctx = k ? m : c; ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = k ? '#fff' : col;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.45, -wid, len, 0); ctx.quadraticCurveTo(len * 0.45, wid, 0, 0); ctx.fill();
        if (vein && !k) { ctx.strokeStyle = vein; ctx.lineWidth = Math.max(0.6, wid * 0.14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke(); }
        ctx.restore(); }
    },
    line(x0, y0, x1, y1, w, col) { for (let k = 0; k < 2; k++) { const ctx = k ? m : c; ctx.strokeStyle = k ? '#fff' : col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); } },
    curve(x0, y0, cx, cy, x1, y1, w, col) { for (let k = 0; k < 2; k++) { const ctx = k ? m : c; ctx.strokeStyle = k ? '#fff' : col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke(); } },
    dot(x, y, r, col) { for (let k = 0; k < 2; k++) { const ctx = k ? m : c; ctx.fillStyle = k ? '#fff' : col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } },
    fillAll() { m.fillStyle = '#fff'; m.fillRect(0, 0, S, S); }, c, S
  };
  fn(P, mulberry32(seed));
  const cd = c.getImageData(0, 0, S, S).data, md = m.getImageData(0, 0, S, S).data, o = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const s = ((S - 1 - y) * S + x) * 4, t = (y * S + x) * 4; o[t] = cd[s]; o[t + 1] = cd[s + 1]; o[t + 2] = cd[s + 2]; o[t + 3] = md[s]; }
  return o;
}
const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
const LEAF = { BROAD: 0, ACACIA: 1, TERM: 2, LYCHEE: 3, PALM: 4, BAMBOO: 5, CYPRESS: 6, BANANA: 7, GRASS: 8, SILVER: 9, PINE: 10, SHRUB: 11, TEA: 12, BARK: 13, RING: 14, FLOWER: 15 };
function buildLeafTex() {
  const S = 256, L = [];
  const cluster = (P, R, n, len, wid, colFn, twig, spread = 0.36) => {
    // 幾根小枝 + 沿枝著生的葉
    const tw = 5 + (R() * 3 | 0);
    for (let t = 0; t < tw; t++) {
      const a0 = R() * TAU, r0 = R() * S * 0.1, x0 = S / 2 + Math.cos(a0) * r0, y0 = S / 2 + Math.sin(a0) * r0;
      const a = t / tw * TAU + R() * 0.8, l = S * (spread * 0.6 + R() * spread * 0.55), x1 = S / 2 + Math.cos(a) * l, y1 = S / 2 + Math.sin(a) * l;
      if (twig) P.line(x0, y0, x1, y1, 1.6, twig);
      const k = n / tw | 0;
      for (let i = 0; i < k; i++) { const f = 0.15 + R() * 0.9, px = lerp(x0, x1, f), py = lerp(y0, y1, f), la = a + (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.9); const c = colFn(R); P.leaf(px, py, len * (0.7 + R() * 0.6), wid * (0.7 + R() * 0.6), la, c[0], c[1]); }
    }
  };
  // 0 闊葉
  L.push(mkLeafLayer(S, rgb(52, 84, 30), 1, (P, R) => cluster(P, R, 80, 34, 9, R => { const g = 0.7 + R() * 0.6; return [rgb(44 * g, 86 * g, 26 * g), rgb(70 * g, 110 * g, 44 * g)]; }, rgb(60, 48, 30))));
  // 1 相思樹（鐮刀狀假葉，橄欖綠）
  L.push(mkLeafLayer(S, rgb(54, 76, 30), 2, (P, R) => cluster(P, R, 150, 30, 3.6, R => { const g = 0.65 + R() * 0.65; return [rgb(52 * g, 80 * g, 28 * g), null]; }, rgb(58, 46, 30), 0.4)));
  // 2 小葉欖仁（細小輪生葉，嫩綠）
  L.push(mkLeafLayer(S, rgb(86, 126, 40), 3, (P, R) => {
    for (let t = 0; t < 26; t++) { const a = R() * TAU, r = Math.sqrt(R()) * S * 0.4, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.8;
      for (let i = 0; i < 9; i++) { const la = i / 9 * TAU + R() * 0.4, g = 0.75 + R() * 0.5; P.leaf(x, y, 10 + R() * 6, 3.6, la, rgb(84 * g, 132 * g, 36 * g), null); } }
    for (let t = 0; t < 6; t++) { const a = R() * TAU; P.line(S / 2, S / 2, S / 2 + Math.cos(a) * S * 0.38, S / 2 + Math.sin(a) * S * 0.3, 1.2, rgb(70, 60, 40)); }
  }));
  // 3 荔枝／龍眼（濃綠帶紅褐新梢）
  L.push(mkLeafLayer(S, rgb(36, 66, 26), 4, (P, R) => cluster(P, R, 120, 30, 7.5, R => { const t = R(), g = 0.7 + R() * 0.5; return t < 0.14 ? [rgb(120 * g, 70 * g, 36 * g), rgb(150 * g, 96 * g, 50 * g)] : [rgb(32 * g, 72 * g, 26 * g), rgb(56 * g, 96 * g, 40 * g)]; }, rgb(52, 42, 28), 0.42)));
  // 4 檳榔／棕櫚羽狀葉
  L.push(mkLeafLayer(S, rgb(50, 88, 32), 5, (P, R) => {
    const x0 = 8, y0 = S * 0.5, x1 = S - 6;
    P.curve(x0, y0, S * 0.5, y0 - 26, x1, y0 + 22, 3.2, rgb(88, 110, 50));
    for (let i = 0; i < 46; i++) { const f = 0.04 + i / 46 * 0.94, x = lerp(x0, x1, f), y = y0 - 26 * 2 * f * (1 - f) + 22 * f * f + 0, l = (54 + R() * 14) * Math.sin(Math.min(1, f * 1.5 + 0.12) * PI * 0.5 + 0.2) * (1 - f * 0.35);
      const g = 0.7 + R() * 0.5; for (const sd of [-1, 1]) P.leaf(x, y, l, 4.2, sd * (1.05 + f * 0.35) + 0.25 * f, rgb(46 * g, 96 * g, 30 * g), rgb(80 * g, 124 * g, 50 * g)); }
  }));
  // 5 竹
  L.push(mkLeafLayer(S, rgb(92, 118, 40), 6, (P, R) => {
    for (let t = 0; t < 9; t++) { const x0 = S / 2 + (R() - 0.5) * 40, y0 = S / 2 + (R() - 0.5) * 40, a = R() * TAU, l = S * (0.25 + R() * 0.2), x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
      P.line(x0, y0, x1, y1, 1.1, rgb(120, 130, 60));
      for (let i = 0; i < 12; i++) { const f = 0.2 + R() * 0.8, g = 0.75 + R() * 0.5; P.leaf(lerp(x0, x1, f), lerp(y0, y1, f), 26 + R() * 12, 3.4, a + (R() < 0.5 ? 1 : -1) * (0.35 + R() * 0.5), rgb(88 * g, 124 * g, 36 * g), null); } }
  }));
  // 6 落羽松（11 月轉橘紅）
  L.push(mkLeafLayer(S, rgb(150, 82, 36), 7, (P, R) => {
    for (let t = 0; t < 16; t++) { const x0 = S / 2 + (R() - 0.5) * 60, y0 = S / 2 + (R() - 0.5) * 60, a = R() * TAU, l = S * (0.2 + R() * 0.22), x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
      P.line(x0, y0, x1, y1, 1.3, rgb(90, 56, 34));
      const warm = R();
      for (let i = 0; i < 26; i++) { const f = i / 26, g = 0.75 + R() * 0.45; const col = warm < 0.25 ? rgb(96 * g, 112 * g, 40 * g) : warm < 0.6 ? rgb(176 * g, 104 * g, 36 * g) : rgb(160 * g, 66 * g, 30 * g);
        for (const sd of [-1, 1]) P.leaf(lerp(x0, x1, f), lerp(y0, y1, f), 11 + R() * 4, 1.5, a + sd * 1.15, col, null); } }
  }));
  // 7 香蕉葉
  L.push(mkLeafLayer(S, rgb(70, 120, 40), 8, (P, R) => {
    P.leaf(10, S / 2, S - 20, 78, 0, rgb(64, 122, 38), rgb(120, 160, 70));
    for (let i = 0; i < 46; i++) { const x = 24 + i / 46 * (S - 60); P.c.strokeStyle = 'rgba(40,90,26,0.35)'; P.c.lineWidth = 1; P.c.beginPath(); P.c.moveTo(x, S / 2); P.c.lineTo(x + 14, S / 2 - 40); P.c.moveTo(x, S / 2); P.c.lineTo(x + 14, S / 2 + 40); P.c.stroke(); }
  }));
  // 8 草叢（由底部向上）
  L.push(mkLeafLayer(S, rgb(78, 108, 40), 9, (P, R) => {
    for (let i = 0; i < 70; i++) { const x0 = S / 2 + (R() - 0.5) * 70, a = (R() - 0.5) * 1.5, h = S * (0.35 + R() * 0.55), g = 0.65 + R() * 0.6, dry = R() < 0.18;
      P.curve(x0, S - 2, x0 + Math.sin(a) * h * 0.3, S - h * 0.6, x0 + Math.sin(a) * h * 0.75, S - h, 2.2 + R() * 1.6, dry ? rgb(160 * g, 148 * g, 72 * g) : rgb(70 * g, 116 * g, 36 * g)); }
  }));
  // 9 芒草（白背芒，秋冬抽穗）
  L.push(mkLeafLayer(S, rgb(110, 124, 60), 10, (P, R) => {
    for (let i = 0; i < 46; i++) { const x0 = S / 2 + (R() - 0.5) * 60, a = (R() - 0.5) * 1.3, h = S * (0.3 + R() * 0.4), g = 0.7 + R() * 0.5; P.curve(x0, S - 2, x0 + Math.sin(a) * h * 0.3, S - h * 0.6, x0 + Math.sin(a) * h * 0.9, S - h * 0.9, 2 + R(), rgb(96 * g, 126 * g, 50 * g)); }
    for (let i = 0; i < 9; i++) { const x0 = S / 2 + (R() - 0.5) * 50, a = (R() - 0.5) * 0.7, h = S * (0.72 + R() * 0.22), x1 = x0 + Math.sin(a) * h * 0.4, y1 = S - h;
      P.line(x0, S - 2, x1, y1 + 40, 1.5, rgb(150, 150, 96));
      for (let k = 0; k < 16; k++) { const f = k / 16, px = x1 + (R() - 0.5) * 5, py = y1 + 44 - f * 44; P.leaf(px, py, 20 + R() * 12, 1.8, -PI / 2 + (R() - 0.5) * 0.9 + a, rgb(232, 222, 204), null); } }
  }));
  // 10 鳳梨植株
  L.push(mkLeafLayer(S, rgb(84, 108, 74), 11, (P, R) => {
    for (let i = 0; i < 34; i++) { const a = -PI / 2 + (i / 33 - 0.5) * 2.9 + (R() - 0.5) * 0.2, l = S * (0.42 + R() * 0.22), g = 0.72 + R() * 0.5; const red = R() < 0.25;
      P.leaf(S / 2 + (R() - 0.5) * 16, S - 4, l, 9, a, red ? rgb(118 * g, 104 * g, 78 * g) : rgb(74 * g, 110 * g, 78 * g), rgb(120 * g, 140 * g, 104 * g)); }
  }));
  // 11 灌叢
  L.push(mkLeafLayer(S, rgb(58, 96, 34), 12, (P, R) => cluster(P, R, 170, 15, 5.5, R => { const g = 0.65 + R() * 0.7; return [rgb(54 * g, 98 * g, 30 * g), null]; }, rgb(60, 50, 30), 0.44)));
  // 12 茶樹冠面（不透明）
  L.push(mkLeafLayer(S, rgb(58, 104, 22), 13, (P, R) => { P.fillAll(); for (let i = 0; i < 900; i++) { const g = 0.6 + R() * 0.75, yl = R() < 0.3; P.leaf(R() * S, R() * S, 12 + R() * 9, 4.4, R() * TAU, yl ? rgb(126 * g, 158 * g, 36 * g) : rgb(52 * g, 108 * g, 22 * g), rgb(90 * g, 136 * g, 40 * g)); } }));
  // 13 樹皮（不透明）
  L.push(mkLeafLayer(S, rgb(86, 70, 52), 14, (P, R) => { P.fillAll(); for (let i = 0; i < 300; i++) { const x = R() * S, y = R() * S, l = 20 + R() * 70, g = R(); P.c.strokeStyle = g < 0.5 ? `rgba(40,30,22,${0.3 + R() * 0.4})` : `rgba(130,112,90,${0.2 + R() * 0.3})`; P.c.lineWidth = 1 + R() * 2.5; P.c.beginPath(); P.c.moveTo(x, y); P.c.bezierCurveTo(x + (R() - 0.5) * 8, y + l * 0.3, x + (R() - 0.5) * 8, y + l * 0.7, x + (R() - 0.5) * 6, y + l); P.c.stroke(); } }));
  // 14 環紋樹幹（檳榔、竹）
  L.push(mkLeafLayer(S, rgb(150, 150, 140), 15, (P, R) => { P.fillAll(); for (let y = 0; y < S; y += 16) { P.c.fillStyle = `rgba(60,60,52,${0.35 + R() * 0.3})`; P.c.fillRect(0, y + (R() * 3 | 0), S, 2.5); } for (let i = 0; i < 200; i++) { P.c.fillStyle = `rgba(${R() < 0.5 ? '90,100,70' : '200,200,190'},${R() * 0.25})`; P.c.fillRect(R() * S, R() * S, 2 + R() * 6, 6 + R() * 30); } }));
  // 15 花叢（九重葛桃紅）
  L.push(mkLeafLayer(S, rgb(70, 100, 40), 16, (P, R) => cluster(P, R, 170, 14, 6, R => { const g = 0.7 + R() * 0.5; return R() < 0.55 ? [rgb(196 * g, 40 * g, 110 * g), null] : [rgb(56 * g, 100 * g, 34 * g), null]; }, rgb(60, 50, 30), 0.44)));
  TEX.leaf = texArray(L, S, S, { wrap: gl.CLAMP_TO_EDGE });
}

// ───────────────────────── 建物、標誌貼圖 ─────────────────────────
const PL = { CONC: 0, FACADE: 1, SHOP: 2, BRICK: 3, TILE_O: 4, TILE_G: 5, CORR: 6, STEEL: 7, DOOR: 8, FRIEZE: 9, STONE: 10, GLASS: 11, WIN: 12, CHEV: 13, SPEED: 14, WARN: 15, SHIELD: 16, KM0: 17, KM1: 18, DIR: 19, BROWN: 20, PLAQUE: 21, SHOPSIGN: 22, INFO: 23, BROWN2: 28, WARN3: 30, ARROWB: 31, TMA: 32, ROADWORK: 33, BANNER2: 29, BANNER: 24, LIGHT: 25, WARN2: 26, TILEWALL: 27 };
function buildPropTex() {
  const S = 512, L = [], R = mulberry32(4242);
  const C = () => { const c = mkCanvas(S); return [c, c.getContext('2d')]; };
  const noiseOver = (x, a, n = 4000) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * a})`; x.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); } };
  const streaks = (x, n, a) => { for (let i = 0; i < n; i++) { const px = R() * S, l = 40 + R() * 260; const g = x.createLinearGradient(0, 0, 0, l); g.addColorStop(0, `rgba(40,36,30,${a * R()})`); g.addColorStop(1, 'rgba(40,36,30,0)'); x.fillStyle = g; x.save(); x.translate(px, R() * S * 0.5); x.fillRect(0, 0, 3 + R() * 10, l); x.restore(); } };
  const text = (x, s, px, py, size, col, wgt = '700', align = 'center', maxW) => { x.font = `${wgt} ${size}px ${CJK}`; x.fillStyle = col; x.textAlign = align; x.textBaseline = 'middle'; x.fillText(s, px, py, maxW); };
  let c, x;
  // 0 混凝土
  [c, x] = C(); x.fillStyle = '#d8d6d0'; x.fillRect(0, 0, S, S); noiseOver(x, 0.07); streaks(x, 26, 0.16); L.push(c);
  // 1 透天厝立面（一開間 × 一層樓）
  [c, x] = C(); x.fillStyle = '#e9e6dd'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 16) { x.fillStyle = 'rgba(0,0,0,0.035)'; x.fillRect(0, i, S, 1); x.fillRect(i, 0, 1, S); }
  x.fillStyle = '#b9b6ac'; x.fillRect(0, 0, S, 22); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 22, S, 5);
  { const wx = 78, wy = 110, ww = 356, wh = 250; x.fillStyle = '#8f9498'; x.fillRect(wx - 10, wy - 10, ww + 20, wh + 20);
    const g = x.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, '#5d7a8c'); g.addColorStop(0.5, '#2f4350'); g.addColorStop(1, '#1b2830'); x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = 'rgba(255,255,255,0.14)'; x.beginPath(); x.moveTo(wx + 30, wy); x.lineTo(wx + 150, wy); x.lineTo(wx + 60, wy + wh); x.lineTo(wx, wy + wh); x.lineTo(wx, wy + 60); x.fill();
    x.fillStyle = '#c9ccce'; x.fillRect(wx + ww / 2 - 5, wy, 10, wh); x.fillRect(wx, wy + 70, ww, 7);
    x.fillStyle = '#a9a69c'; x.fillRect(wx - 26, wy + wh + 10, ww + 52, 14);
    // 鐵窗
    x.strokeStyle = 'rgba(205,208,210,0.9)'; x.lineWidth = 3; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(wx - 14 + i * (ww + 28) / 8, wy + 84); x.lineTo(wx - 14 + i * (ww + 28) / 8, wy + wh + 10); x.stroke(); } x.strokeRect(wx - 14, wy + 84, ww + 28, wh - 74);
    // 冷氣
    x.fillStyle = '#d5d6d2'; x.fillRect(360, 400, 96, 70); x.fillStyle = '#6a6d6c'; x.beginPath(); x.arc(396, 435, 24, 0, TAU); x.fill(); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(360, 470, 96, 8); }
  streaks(x, 14, 0.14); noiseOver(x, 0.04, 2500); L.push(c);
  // 2 一樓店面（鐵捲門）
  [c, x] = C(); x.fillStyle = '#dedbd2'; x.fillRect(0, 0, S, S); x.fillStyle = '#9da0a1'; x.fillRect(56, 120, 400, 392);
  for (let y = 120; y < S; y += 14) { x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(56, y, 400, 3); x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(56, y + 9, 400, 4); }
  x.fillStyle = '#6f7375'; x.fillRect(46, 104, 420, 20); x.fillStyle = '#b3afa4'; x.fillRect(0, 0, S, 26); streaks(x, 10, 0.2); noiseOver(x, 0.05, 2500); L.push(c);
  // 3 紅磚
  [c, x] = C(); x.fillStyle = '#9a8f84'; x.fillRect(0, 0, S, S);
  for (let r = 0; r < 16; r++) for (let k = -1; k < 8; k++) { const bx = k * 64 + (r % 2) * 32, by = r * 32; const g = 0.78 + R() * 0.38; x.fillStyle = rgb(168 * g, 74 * g, 48 * g); x.fillRect(bx + 2, by + 2, 60, 28); }
  noiseOver(x, 0.08, 5000); L.push(c);
  // 4 橘色琉璃瓦（筒瓦）
  [c, x] = C(); x.fillStyle = '#b4521c'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 16; k++) { const g = x.createLinearGradient(k * 32, 0, k * 32 + 32, 0); g.addColorStop(0, '#6e2c0c'); g.addColorStop(0.3, '#d9701f'); g.addColorStop(0.5, '#f2a03c'); g.addColorStop(0.75, '#c85e1a'); g.addColorStop(1, '#6e2c0c'); x.fillStyle = g; x.fillRect(k * 32, 0, 32, S); }
  for (let y = 0; y < S; y += 64) { x.fillStyle = 'rgba(40,14,4,0.45)'; x.fillRect(0, y, S, 5); x.fillStyle = 'rgba(255,220,150,0.25)'; x.fillRect(0, y + 5, S, 3); }
  noiseOver(x, 0.05, 2500); L.push(c);
  // 5 灰黑板瓦
  [c, x] = C(); x.fillStyle = '#3d3c3b'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 16; k++) { const g = x.createLinearGradient(k * 32, 0, k * 32 + 32, 0); g.addColorStop(0, '#1c1b1b'); g.addColorStop(0.4, '#55524f'); g.addColorStop(0.6, '#6b6763'); g.addColorStop(1, '#1c1b1b'); x.fillStyle = g; x.fillRect(k * 32, 0, 32, S); }
  for (let y = 0; y < S; y += 48) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, y, S, 4); }
  noiseOver(x, 0.08, 5000); L.push(c);
  // 6 浪板（白，頂點色上色）
  [c, x] = C(); for (let k = 0; k < 32; k++) { const g = x.createLinearGradient(k * 16, 0, k * 16 + 16, 0); g.addColorStop(0, '#a8a8a8'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#a8a8a8'); x.fillStyle = g; x.fillRect(k * 16, 0, 16, S); }
  streaks(x, 30, 0.22); L.push(c);
  // 7 鍍鋅鋼
  [c, x] = C(); x.fillStyle = '#b9bdc0'; x.fillRect(0, 0, S, S); for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '70,76,80'},${R() * 0.16})`; x.fillRect(R() * S, R() * S, 30 + R() * 160, 1 + R() * 3); } streaks(x, 16, 0.12); L.push(c);
  // 8 廟門（朱紅 + 門釘）
  [c, x] = C(); x.fillStyle = '#a3170f'; x.fillRect(0, 0, S, S); x.fillStyle = '#7b0f0a'; x.fillRect(250, 0, 12, S); x.strokeStyle = '#d7a514'; x.lineWidth = 8; x.strokeRect(14, 14, S - 28, S - 28);
  for (let r = 0; r < 6; r++) for (let k = 0; k < 6; k++) { x.fillStyle = '#e2b420'; x.beginPath(); x.arc(64 + k * 77, 70 + r * 76, 12, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,255,220,0.5)'; x.beginPath(); x.arc(60 + k * 77, 66 + r * 76, 4, 0, TAU); x.fill(); } L.push(c);
  // 9 彩繪橫樑
  [c, x] = C(); x.fillStyle = '#1b4f8f'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 8; k++) { x.fillStyle = ['#c9302a', '#1f8a4d', '#e3b021', '#2a68b8'][k % 4]; x.fillRect(k * 64 + 6, 40, 52, S - 80); x.strokeStyle = '#f0d060'; x.lineWidth = 5; x.strokeRect(k * 64 + 6, 40, 52, S - 80); x.fillStyle = '#f4e3a0'; x.beginPath(); x.arc(k * 64 + 32, S / 2, 18, 0, TAU); x.fill(); }
  x.fillStyle = '#d7a514'; x.fillRect(0, 0, S, 26); x.fillRect(0, S - 26, S, 26); L.push(c);
  // 10 石材
  [c, x] = C(); x.fillStyle = '#a9a59c'; x.fillRect(0, 0, S, S); for (let r = 0; r < 8; r++) for (let k = -1; k < 4; k++) { const g = 0.86 + R() * 0.22; x.fillStyle = rgb(176 * g, 172 * g, 162 * g); x.fillRect(k * 128 + (r % 2) * 64 + 3, r * 64 + 3, 122, 58); } noiseOver(x, 0.1, 9000); L.push(c);
  // 11 玻璃帷幕
  [c, x] = C(); x.fillStyle = '#e8e8e4'; x.fillRect(0, 0, S, S);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) { const g = x.createLinearGradient(0, r * 256, 0, r * 256 + 256); g.addColorStop(0, '#7fa3b8'); g.addColorStop(1, '#263842'); x.fillStyle = g; x.fillRect(k * 256 + 12, r * 256 + 12, 232, 232); x.fillStyle = 'rgba(255,255,255,0.16)'; x.beginPath(); x.moveTo(k * 256 + 40, r * 256 + 12); x.lineTo(k * 256 + 130, r * 256 + 12); x.lineTo(k * 256 + 60, r * 256 + 244); x.lineTo(k * 256 + 12, r * 256 + 244); x.fill(); } L.push(c);
  // 12 單窗（農舍）
  [c, x] = C(); x.fillStyle = '#ebe7dc'; x.fillRect(0, 0, S, S); x.fillStyle = '#6b6f6e'; x.fillRect(140, 120, 232, 220); { const g = x.createLinearGradient(0, 130, 0, 330); g.addColorStop(0, '#506a78'); g.addColorStop(1, '#1e2a30'); x.fillStyle = g; x.fillRect(150, 130, 212, 200); } x.fillStyle = '#c8cac8'; x.fillRect(252, 130, 8, 200); streaks(x, 12, 0.16); noiseOver(x, 0.05, 2500); L.push(c);
  // 13 彎道導標（黃底黑箭）
  [c, x] = C(); x.fillStyle = '#f6c40e'; x.fillRect(0, 0, S, S); x.fillStyle = '#111'; x.beginPath(); x.moveTo(120, 40); x.lineTo(250, 40); x.lineTo(400, 256); x.lineTo(250, 472); x.lineTo(120, 472); x.lineTo(270, 256); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 14; x.strokeRect(7, 7, S - 14, S - 14); L.push(c);
  // 14 速限（左 40、右 50）
  [c, x] = C(); x.clearRect(0, 0, S, S); for (let k = 0; k < 2; k++) { const cx = 128 + k * 256, cy = 256; x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 122, 0, TAU); x.fill(); x.strokeStyle = '#d6221f'; x.lineWidth = 26; x.beginPath(); x.arc(cx, cy, 106, 0, TAU); x.stroke(); text(x, k ? '50' : '40', cx, cy + 6, 118, '#111', '800'); } L.push(c);
  // 15 警告標誌（左：連續彎路；右：慢）
  [c, x] = C(); x.clearRect(0, 0, S, S); for (let k = 0; k < 2; k++) { const ox = k * 256; x.fillStyle = '#d6221f'; x.beginPath(); x.moveTo(ox + 128, 140); x.lineTo(ox + 250, 356); x.lineTo(ox + 6, 356); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(ox + 128, 182); x.lineTo(ox + 214, 336); x.lineTo(ox + 42, 336); x.fill();
    if (!k) { x.strokeStyle = '#111'; x.lineWidth = 15; x.lineCap = 'round'; x.beginPath(); x.moveTo(ox + 112, 326); x.bezierCurveTo(ox + 112, 290, ox + 150, 290, ox + 140, 262); x.bezierCurveTo(ox + 132, 240, ox + 112, 240, ox + 124, 214); x.stroke(); } else text(x, '慢', ox + 128, 290, 82, '#111', '800'); } L.push(c);
  // 16 縣道 139 盾牌
  [c, x] = C(); x.clearRect(0, 0, S, S); x.fillStyle = '#fff'; x.beginPath(); x.roundRect(36, 36, 440, 440, 54); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 22; x.beginPath(); x.roundRect(52, 52, 408, 408, 40); x.stroke(); text(x, '139', 256, 276, 196, '#111', '800'); L.push(c);
  // 17,18 里程牌（每層 4×5 = 20 格）
  for (let pg = 0; pg < 2; pg++) { [c, x] = C(); x.clearRect(0, 0, S, S); for (let i = 0; i < 20; i++) { const k = pg * 20 + i, cx = (i % 4) * 128, cy = (i / 4 | 0) * 102; x.fillStyle = '#0c6a3c'; x.beginPath(); x.roundRect(cx + 10, cy + 6, 108, 90, 10); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 4; x.beginPath(); x.roundRect(cx + 15, cy + 11, 98, 80, 7); x.stroke(); text(x, k + 'K', cx + 64, cy + 54, 46, '#fff', '800'); } L.push(c); }
  // 19 指示牌（綠底，2×2）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  { const D = [['南投 松柏嶺', '↑', 'Nantou・Songboling'], ['芬園 花壇', '←→', 'Fenyuan・Huatan'], ['員林 草屯', '←→', 'Yuanlin・Caotun'], ['田中 名間', '←→', 'Tianzhong・Mingjian']];
    D.forEach((d, i) => { const ox = (i % 2) * 256, oy = (i / 2 | 0) * 256; x.fillStyle = '#0b6b3a'; x.beginPath(); x.roundRect(ox + 6, oy + 50, 244, 156, 12); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.roundRect(ox + 14, oy + 58, 228, 140, 8); x.stroke(); text(x, d[1], ox + 128, oy + 92, 44, '#fff', '800'); text(x, d[0], ox + 128, oy + 138, 38, '#fff', '700', 'center', 212); text(x, d[2], ox + 128, oy + 176, 19, '#fff', '500', 'center', 212); }); } L.push(c);
  // 20 觀光指示（棕底，2×4）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  { const D = ['八卦山大佛風景區', '銀行山', '猴探井 天空之橋', '橫山賞鷹平台', '鳳山寺', '松柏嶺 受天宮', '落羽松森林', '八卦山脈 茶園'];
    D.forEach((d, i) => { const ox = (i % 2) * 256, oy = (i / 2 | 0) * 128; x.fillStyle = '#6b3f1d'; x.beginPath(); x.roundRect(ox + 6, oy + 14, 244, 100, 10); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 13, oy + 21, 230, 86, 7); x.stroke(); text(x, d, ox + 128, oy + 66, 30, '#fff', '700', 'center', 214); }); } L.push(c);
  // 21 匾額（2×2）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  ['八卦山', '受天宮', '鳳山寺', '大佛寺'].forEach((d, i) => { const ox = (i % 2) * 256, oy = (i / 2 | 0) * 256; x.fillStyle = '#7a0f0a'; x.fillRect(ox + 8, oy + 70, 240, 116); x.strokeStyle = '#e2b420'; x.lineWidth = 9; x.strokeRect(ox + 14, oy + 76, 228, 104); text(x, d, ox + 128, oy + 131, 66, '#f3cf45', '800', 'center', 208); }); L.push(c);
  // 22 招牌（4×4 直式）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  { const D = [['茶', '#0f6b3c', '#fff'], ['製茶廠', '#f3ecd8', '#0f6b3c'], ['鳳梨酥', '#f2c021', '#7a2a0a'], ['土鳳梨', '#b5482a', '#fff'], ['檳榔', '#d6221f', '#fff'], ['咖啡', '#3a2a20', '#f3ecd8'], ['土雞城', '#f3ecd8', '#b5482a'], ['機車行', '#1d4f9a', '#fff'],
    ['松柏嶺茶', '#0f6b3c', '#f6e7a8'], ['荔枝', '#b01838', '#fff'], ['冬瓜茶', '#f3ecd8', '#3a2a20'], ['民宿', '#f2c021', '#3a2a20'], ['金紙', '#d6221f', '#f6d94a'], ['早餐', '#f08c1e', '#fff'], ['農產', '#3c7a26', '#fff'], ['茶行', '#7a0f0a', '#f3cf45']];
    D.forEach((d, i) => { const ox = (i % 4) * 128, oy = (i / 4 | 0) * 128; x.fillStyle = d[1]; x.fillRect(ox + 34, oy + 3, 60, 122); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.strokeRect(ox + 35, oy + 4, 58, 120); const n = d[0].length, fs = Math.min(46, 108 / n); for (let k = 0; k < n; k++) text(x, d[0][k], ox + 64, oy + 64 + (k - (n - 1) / 2) * fs * 1.04, fs, d[2], '800'); }); } L.push(c);
  // 23 告示（2×2）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  { x.fillStyle = '#0b6b3a'; x.fillRect(8, 40, 240, 176); x.strokeStyle = '#fff'; x.lineWidth = 5; x.strokeRect(16, 48, 224, 160); text(x, '南投縣', 128, 102, 58, '#fff', '800'); text(x, 'Nantou County', 128, 160, 24, '#fff', '500');
    x.fillStyle = '#0b6b3a'; x.fillRect(264, 40, 240, 176); x.strokeRect(272, 48, 224, 160); text(x, '彰化縣', 384, 102, 58, '#fff', '800'); text(x, 'Changhua County', 384, 160, 23, '#fff', '500');
    x.fillStyle = '#fff'; x.fillRect(8, 296, 240, 176); x.strokeStyle = '#d6221f'; x.lineWidth = 8; x.strokeRect(16, 304, 224, 160); text(x, '前有測速照相', 128, 350, 33, '#111', '800', 'center', 204); text(x, '速限 40', 128, 416, 54, '#d6221f', '800');
    x.fillStyle = '#f6c40e'; x.fillRect(264, 296, 240, 176); x.strokeStyle = '#111'; x.lineWidth = 6; x.strokeRect(272, 304, 224, 160); text(x, '連續彎路', 384, 352, 46, '#111', '800'); text(x, '小心駕駛', 384, 416, 46, '#111', '800'); } L.push(c);
  // 24 賽事布條（上：起點；下：終點）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  for (let k = 0; k < 2; k++) { const oy = k * 256; x.fillStyle = k ? '#101113' : '#0b6b3a'; x.fillRect(0, oy + 60, S, 136);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#111'; x.fillRect(i * 32, oy + 60 + j * 14, 32, 14); x.fillRect(i * 32, oy + 168 + j * 14, 32, 14); }
    text(x, k ? '終點  FINISH' : '起點  START', 256, oy + 116, 46, '#fff', '800'); text(x, k ? '松柏嶺 受天宮' : '139 縣道 八卦稜線房車賽', 256, oy + 152, 22, '#f6c40e', '700'); } L.push(c);
  // 25 燈籠／發光面
  [c, x] = C(); { const g = x.createRadialGradient(256, 256, 20, 256, 256, 300); g.addColorStop(0, '#fff2c0'); g.addColorStop(0.5, '#e8401c'); g.addColorStop(1, '#8c1408'); x.fillStyle = g; x.fillRect(0, 0, S, S); for (let k = 0; k < 12; k++) { x.fillStyle = 'rgba(90,10,4,0.35)'; x.fillRect(k * 44 + 8, 0, 4, S); } } L.push(c);
  // 26 警告標誌 2（左：險降坡；右：岔路）
  [c, x] = C(); x.clearRect(0, 0, S, S); for (let k = 0; k < 2; k++) { const ox = k * 256; x.fillStyle = '#d6221f'; x.beginPath(); x.moveTo(ox + 128, 140); x.lineTo(ox + 250, 356); x.lineTo(ox + 6, 356); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(ox + 128, 182); x.lineTo(ox + 214, 336); x.lineTo(ox + 42, 336); x.fill(); x.fillStyle = '#111';
    if (!k) { x.beginPath(); x.moveTo(ox + 78, 326); x.lineTo(ox + 178, 326); x.lineTo(ox + 78, 268); x.fill(); } else { x.fillRect(ox + 120, 236, 16, 92); x.fillRect(ox + 88, 276, 80, 14); } } L.push(c);
  // 27 外牆二丁掛磚（暖色）
  [c, x] = C(); x.fillStyle = '#cfc8b8'; x.fillRect(0, 0, S, S); for (let r = 0; r < 32; r++) for (let k = -1; k < 8; k++) { const g = 0.86 + R() * 0.2; x.fillStyle = rgb(226 * g, 214 * g, 190 * g); x.fillRect(k * 64 + (r % 2) * 32 + 1, r * 16 + 1, 62, 14); } streaks(x, 18, 0.12); L.push(c);
  // 28 觀光指示 2（墾丁、大鵬灣）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  ['南灣', '墾丁大街', '船帆石', '鵝鑾鼻燈塔', '龍磐公園', '風吹砂', '鵬灣跨海大橋', '大鵬灣國際賽車場'].forEach((d, i) => { const ox = (i % 2) * 256, oy = (i / 2 | 0) * 128; x.fillStyle = '#6b3f1d'; x.beginPath(); x.roundRect(ox + 6, oy + 14, 244, 100, 10); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 13, oy + 21, 230, 86, 7); x.stroke(); text(x, d, ox + 128, oy + 66, 30, '#fff', '700', 'center', 214); }); L.push(c);
  // 29 通用賽事布條
  [c, x] = C(); x.clearRect(0, 0, S, S);
  for (let k = 0; k < 2; k++) { const oy = k * 256; x.fillStyle = k ? '#101113' : '#0b6b3a'; x.fillRect(0, oy + 60, S, 136);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#111'; x.fillRect(i * 32, oy + 60 + j * 14, 32, 14); x.fillRect(i * 32, oy + 168 + j * 14, 32, 14); }
    text(x, k ? '終點  FINISH' : '起點  START', 256, oy + 116, 46, '#fff', '800'); text(x, 'TAIWAN TOURING CUP', 256, oy + 152, 22, '#f6c40e', '700'); } L.push(c);
  // 30 彎路警告（左：左彎；右：右彎）
  [c, x] = C(); x.clearRect(0, 0, S, S); for (let k = 0; k < 2; k++) { const ox = k * 256, sg = k ? 1 : -1; x.fillStyle = '#d6221f'; x.beginPath(); x.moveTo(ox + 128, 140); x.lineTo(ox + 250, 356); x.lineTo(ox + 6, 356); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(ox + 128, 182); x.lineTo(ox + 214, 336); x.lineTo(ox + 42, 336); x.fill();
    x.strokeStyle = '#111'; x.lineWidth = 15; x.lineCap = 'butt'; x.beginPath(); x.moveTo(ox + 128 - sg * 14, 330); x.lineTo(ox + 128 - sg * 14, 278); x.quadraticCurveTo(ox + 128 - sg * 14, 238, ox + 128 + sg * 18, 236); x.stroke();
    x.fillStyle = '#111'; x.beginPath(); x.moveTo(ox + 128 + sg * 46, 236); x.lineTo(ox + 128 + sg * 16, 214); x.lineTo(ox + 128 + sg * 16, 258); x.fill(); } L.push(c);
  // 31 箭頭標誌板（黑底黃色燈點，向左箭頭）
  [c, x] = C(); x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, S, S); x.strokeStyle = '#333'; x.lineWidth = 10; x.strokeRect(5, 5, S - 10, S - 10);
  { const pts = []; for (let i = 0; i <= 12; i++) pts.push([120 + i * 26, 256]); for (let i = 1; i <= 6; i++) { pts.push([96 + i * 26, 256 - i * 24]); pts.push([96 + i * 26, 256 + i * 24]); }
    x.fillStyle = '#ffcc33'; for (const p of pts) { x.beginPath(); x.arc(p[0], p[1], 10, 0, TAU); x.fill(); } } L.push(c);
  // 32 緩衝墊黃黑斜紋
  [c, x] = C(); x.fillStyle = '#111'; x.fillRect(0, 0, S, S); x.fillStyle = '#f5c400'; for (let k = -4; k < 8; k++) { x.beginPath(); x.moveTo(k * 128, 0); x.lineTo(k * 128 + 64, 0); x.lineTo(k * 128 + 64 + S, S); x.lineTo(k * 128 + S, S); x.fill(); } noiseOver(x, 0.05, 2000); L.push(c);
  // 33 事故／施工告示（左：道路維護；右：前方事故）
  [c, x] = C(); x.clearRect(0, 0, S, S);
  x.fillStyle = '#f08c1e'; x.fillRect(8, 120, 240, 272); x.strokeStyle = '#111'; x.lineWidth = 8; x.strokeRect(16, 128, 224, 256); text(x, '道路維護', 128, 196, 46, '#111', '800'); text(x, '車道縮減', 128, 262, 46, '#111', '800'); text(x, '請往左', 128, 330, 40, '#111', '800');
  x.fillStyle = '#f6c40e'; x.fillRect(264, 120, 240, 272); x.strokeRect(272, 128, 224, 256); text(x, '前方事故', 384, 196, 46, '#111', '800'); text(x, '路面油漬', 384, 262, 46, '#d6221f', '800'); text(x, '請靠右', 384, 330, 40, '#111', '800'); L.push(c);
  TEX.prop = texArray(L, S, S, {});
}

// 路面噴字／標線貼花
function buildDecalTex() {
  const W = 256, H = 512, L = [];
  const mk = fn => { const c = mkCanvas(W, H), x = c.getContext('2d'); x.clearRect(0, 0, W, H); fn(x); const im = x.getImageData(0, 0, W, H), d = im.data, R = mulberry32(9);
    for (let i = 0; i < d.length; i += 4) { const n = hash2((i >> 2) % W >> 1, ((i >> 2) / W | 0) >> 1, 5); d[i + 3] = d[i + 3] * (n < 0.16 ? 0.25 : n < 0.3 ? 0.7 : 1); } x.putImageData(im, 0, 0); return c; };
  const tall = (x, s, col) => { x.save(); x.translate(W / 2, H / 2); x.scale(1, 2.6); x.font = `800 ${s.length > 1 ? 120 : 150}px ${CJK}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(s, 0, 4); x.restore(); };
  L.push(mk(x => tall(x, '慢', '#f2f2ee')));
  L.push(mk(x => tall(x, '40', '#f2f2ee')));
  L.push(mk(x => { x.fillStyle = '#f2f2ee'; x.beginPath(); x.moveTo(128, 30); x.lineTo(210, 190); x.lineTo(152, 190); x.lineTo(152, 480); x.lineTo(104, 480); x.lineTo(104, 190); x.lineTo(46, 190); x.fill(); }));
  L.push(mk(x => { for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i + j) % 2 ? '#f2f2ee' : '#16171a'; x.fillRect(i * 64, j * 64, 64, 64); } }));
  L.push(mk(x => { x.fillStyle = '#f2f2ee'; for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 10, 0, 40, H); }));  // 斑馬線
  L.push(mk(x => tall(x, '139', '#f2f2ee')));
  { const c = mkCanvas(W, H), x = c.getContext('2d'), R = mulberry32(77); x.clearRect(0, 0, W, H);  // 6 油漬
    for (let i = 0; i < 26; i++) { const px = W * (0.18 + R() * 0.64), py = H * (0.08 + R() * 0.84), r = 26 + R() * 70, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(8,6,5,0.95)'); g.addColorStop(0.7, 'rgba(10,8,6,0.85)'); g.addColorStop(1, 'rgba(10,8,6,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(px, py, r * 0.8, r * 1.4, R(), 0, TAU); x.fill(); }
    L.push(c); }
  TEX.decal = texArray(L, W, H, { wrap: gl.REPEAT, wrapT: gl.CLAMP_TO_EDGE });
}
