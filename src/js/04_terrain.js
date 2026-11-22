// ───────────────────────── 八卦台地地形 ─────────────────────────
const TG = { cell: 6, R: 440, chunk: 32 };
const _tz = {}, _tt = {};
let RIDGE_X = null;

function ridgeXAt(z) {
  const f = clamp((z - TR.minZ) / (TR.maxZ - TR.minZ) * (RIDGE_X.length - 1), 0, RIDGE_X.length - 1.001);
  const i = f | 0; return lerp(RIDGE_X[i], RIDGE_X[i + 1], f - i);
}
function plainH(x, z) { return ROUTE.plain(x, z); }
function plainH139(x, z) {
  const xe = x - ridgeXAt(z);
  if (xe < 0) { // 彰化平原
    return 29 + (fbm(x / 900, z / 900, 2, 71) - 0.5) * 6 + smooth(-900, 0, xe) * 3;
  }
  // 東側：貓羅溪谷地 → 南投丘陵
  let h = lerp(31, 96, smooth(TR.minZ + 600, TR.maxZ - 1800, z)) + (fbm(x / 700, z / 700, 2, 73) - 0.5) * 8;
  const far = Math.max(0, xe - 3800);
  if (far > 0) h += far * 0.05 * (0.5 + fbm(x / 2600, z / 2600, 2, 75)) + ridged(x / 1900, z / 1900, 3, 77) * Math.min(far * 0.12, 420);
  return h;
}
function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

// 天然地表（未下挖），s,d 為最近路徑參數
function terrainHraw(x, z, s, d) {
  const zp = zoneParams(s, _tz), tr = trackAt(s, _tt);
  const ad = Math.abs(d), left = d > 0, hw = tr.hw;
  const und = (fbm(x / 85, z / 85, 3, 11) - 0.5) * 2 * zp.und * 2.2;
  const bias = (left ? zp.bkL : zp.bkR) * 11;
  const t1 = smooth(hw + 3, hw + 42, ad);
  let h = tr.y - 0.45 + t1 * (bias + und) - tr.bank * clamp(d, -(hw + 3), hw + 3) * (1 - t1);
  const plw = (left ? zp.plL : zp.plR) * (0.8 + 0.4 * noise1(s / 260 + (left ? 40 : 0), 33));
  const t2 = Math.max(0, ad - plw);
  if (t2 > 0) {
    const drop = t2 * t2 / (t2 + 70) * (left ? ROUTE.slopeL : ROUTE.slopeR);
    const gul = ridged(x / 170, z / 170, 3, 5);
    h += -drop - ROUTE.gully * ((gul - 0.35) * Math.min(t2 * 0.22, 30) - (fbm(x / 420, z / 420, 3, 3) - 0.5) * Math.min(t2 * 0.1, 16));
  }
  const p = plainH(x, z);
  const rr = smax(h, p, 14 * smooth(25, 90, ad)), br = ROUTE.bridge(s);
  return br > 0 ? lerp(rr, p, br) : rr;
}
function lowerAmt(ad, hw) { return 1.7 * (1 - smooth(hw + 9.5, hw + 17, ad)); }

// 路肩剖面高度（路面邊緣之外 0–17 m）
function shoulderY(s, d, tr, x, z) {
  const ad = Math.abs(d), sg = d < 0 ? -1 : 1, o = ad - tr.hw;
  const edgeY = tr.y - tr.bank * sg * tr.hw;
  if (ROUTE.bridge(s) > 0.5) return o < 0.45 ? edgeY - 0.03 : edgeY - 1.0 - (o - 0.45) * 30;
  const verge = edgeY - 0.035 - 0.05 * Math.min(o, 2.4);
  const nat = terrainHraw(x, z, s, d) + 0.12;
  return lerp(verge, nat, smooth(2.0, 7.0, o));
}

// 不規則田區（jittered Voronoi）
const _patch = { h: 0, o: 0, e: 0 };
function patchAt(x, z) {
  const g = 118, cx = Math.floor(x / g), cz = Math.floor(z / g);
  let best = 1e18, sec = 1e18, bh = 0, bo = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ix = cx + dx, iz = cz + dz;
    const px = (ix + 0.15 + 0.7 * hash2(ix, iz, 101)) * g, pz = (iz + 0.15 + 0.7 * hash2(ix, iz, 102)) * g;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) { sec = best; best = d; bh = hash2(ix, iz, 103); bo = hash2(ix, iz, 104) > 0.5 ? 1 : 0; } else if (d < sec) sec = d;
  }
  _patch.h = bh; _patch.o = bo; _patch.e = Math.sqrt(sec) - Math.sqrt(best); // e: 距田埂距離
  return _patch;
}
function landUseAt(x, z, s, d, slope) {
  const zn = zoneOf(s), ad = Math.abs(d), left = d > 0;
  const zp = zoneParams(s, _tz);
  const plw = (left ? zp.plL : zp.plR) * (0.8 + 0.4 * noise1(s / 260 + (left ? 40 : 0), 33));
  const ov = ROUTE.landOverride(s, left, ad, x, z); if (ov >= 0) return ov;
  if (slope > 0.38 || ad > plw + 12) return LU.FOREST;
  const p = patchAt(x, z);
  let acc = 0; const w = zn.w;
  for (let i = 0; i < w.length; i++) { acc += w[i]; if (p.h < acc) return i; }
  return LU.FOREST;
}

function buildTerrainData(progress) {
  const cell = TG.cell, pad = TG.R + 40;
  // ridge axis table
  RIDGE_X = new Float32Array(128);
  { const cnt = new Float32Array(128); for (let i = 0; i < TR.n; i++) { const b = clamp(Math.round((TR.z[i] - TR.minZ) / (TR.maxZ - TR.minZ) * 127), 0, 127); RIDGE_X[b] += TR.x[i]; cnt[b]++; }
    let last = TR.x[0]; for (let b = 0; b < 128; b++) { if (cnt[b]) { RIDGE_X[b] /= cnt[b]; last = RIDGE_X[b]; } else RIDGE_X[b] = last; }
    RIDGE_X = boxSmooth(RIDGE_X, 6, 2); }
  TG.x0 = Math.floor((TR.minX - pad) / cell) * cell; TG.z0 = Math.floor((TR.minZ - pad) / cell) * cell;
  TG.nx = Math.ceil((TR.maxX + pad - TG.x0) / cell / TG.chunk) * TG.chunk + 1;
  TG.nz = Math.ceil((TR.maxZ + pad - TG.z0) / cell / TG.chunk) * TG.chunk + 1;
  const nx = TG.nx, nz = TG.nz, N = nx * nz;
  const D2 = new Float32Array(N).fill(1e12), SI = new Int32Array(N).fill(-1);
  const Rc = Math.ceil(TG.R / cell);
  for (let i = 0; i < TR.n; i += 2) {
    const fx = (TR.x[i] - TG.x0) / cell, fz = (TR.z[i] - TG.z0) / cell;
    const cx = Math.round(fx), cz = Math.round(fz);
    const z0 = Math.max(0, cz - Rc), z1 = Math.min(nz - 1, cz + Rc);
    for (let gz = z0; gz <= z1; gz++) {
      const dz = (gz - fz) * cell, w = Math.sqrt(Math.max(0, TG.R * TG.R - dz * dz)) / cell;
      const xa = Math.max(0, Math.ceil(fx - w)), xb = Math.min(nx - 1, Math.floor(fx + w));
      let o = gz * nx + xa;
      for (let gx = xa; gx <= xb; gx++, o++) { const dx = (gx - fx) * cell, d2 = dx * dx + dz * dz; if (d2 < D2[o]) { D2[o] = d2; SI[o] = i; } }
    }
  }
  TG.D = new Float32Array(N); TG.S = new Float32Array(N); TG.H = new Float32Array(N); TG.LU = new Uint8Array(N); TG.OR = new Uint8Array(N); TG.MASK = new Uint8Array(N);
  const pr = {};
  for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
    const o = gz * nx + gx, x = TG.x0 + gx * cell, z = TG.z0 + gz * cell;
    if (SI[o] < 0) { TG.D[o] = 9999; TG.S[o] = -1; TG.H[o] = plainH(x, z); continue; }
    trackProject(x, z, SI[o] * DS, pr);
    TG.D[o] = pr.d; TG.S[o] = pr.s;
    TG.H[o] = terrainHraw(x, z, pr.s, pr.d);
  }
  // 抹平最近點切換造成的摺痕
  { const H = TG.H, B = new Float32Array(N);
    for (let pass = 0; pass < 2; pass++) {
      for (let gz = 1; gz < nz - 1; gz++) for (let gx = 1; gx < nx - 1; gx++) {
        const o = gz * nx + gx; const ad = Math.abs(TG.D[o]);
        if (ad > 9000) { B[o] = H[o]; continue; }
        const a = (H[o - 1] + H[o + 1] + H[o - nx] + H[o + nx]) * 0.2 + H[o] * 0.2;
        B[o] = lerp(H[o], a, smooth(26, 70, ad));
      }
      for (let gz = 1; gz < nz - 1; gz++) for (let gx = 1; gx < nx - 1; gx++) { const o = gz * nx + gx; H[o] = B[o]; }
    } }
  // 土地利用
  for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
    const o = gz * nx + gx; if (TG.S[o] < 0) { TG.LU[o] = LU.FOREST; continue; }
    const x = TG.x0 + gx * cell, z = TG.z0 + gz * cell;
    const gxm = Math.max(0, gx - 1), gxp = Math.min(nx - 1, gx + 1), gzm = Math.max(0, gz - 1), gzp = Math.min(nz - 1, gz + 1);
    const sl = Math.hypot(TG.H[gz * nx + gxp] - TG.H[gz * nx + gxm], TG.H[gzp * nx + gx] - TG.H[gzm * nx + gx]) / (2 * cell);
    TG.LU[o] = landUseAt(x, z, TG.S[o], TG.D[o], sl); TG.OR[o] = _patch.o;
  }
}
function gridIdx(x, z) { const gx = Math.round((x - TG.x0) / TG.cell), gz = Math.round((z - TG.z0) / TG.cell); if (gx < 0 || gz < 0 || gx >= TG.nx || gz >= TG.nz) return -1; return gz * TG.nx + gx; }
function gridH(x, z) {
  const fx = clamp((x - TG.x0) / TG.cell, 0, TG.nx - 1.001), fz = clamp((z - TG.z0) / TG.cell, 0, TG.nz - 1.001);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * TG.nx + ix, H = TG.H;
  return lerp(lerp(H[o], H[o + 1], tx), lerp(H[o + TG.nx], H[o + TG.nx + 1], tx), tz);
}
const _gp = {}, _gt = {};
// 任意點的可見地表高度
function groundY(x, z) {
  const o = gridIdx(x, z);
  if (o < 0 || TG.S[o] < 0) return gridH(x, z);
  const ad = Math.abs(TG.D[o]);
  if (ad < 16) {
    trackProject(x, z, TG.S[o], _gp); const tr = trackAt(_gp.s, _gt); const a = Math.abs(_gp.d);
    if (a <= tr.hw) return tr.y - tr.bank * _gp.d;
    if (a < tr.hw + 7.5) return shoulderY(_gp.s, _gp.d, tr, x, z);
  }
  return gridH(x, z) + 0.1;
}
function markClear(x, z, r, v = 1) {
  const c = TG.cell, x0 = Math.floor((x - r - TG.x0) / c), x1 = Math.ceil((x + r - TG.x0) / c), z0 = Math.floor((z - r - TG.z0) / c), z1 = Math.ceil((z + r - TG.z0) / c);
  for (let gz = Math.max(0, z0); gz <= Math.min(TG.nz - 1, z1); gz++) for (let gx = Math.max(0, x0); gx <= Math.min(TG.nx - 1, x1); gx++) {
    const dx = TG.x0 + gx * c - x, dz = TG.z0 + gz * c - z; if (dx * dx + dz * dz <= (r + c * 0.6) * (r + c * 0.6)) TG.MASK[gz * TG.nx + gx] |= v;
  }
}
// 整平一塊基地（建物用）
function flattenPad(x, z, r, y) {
  const c = TG.cell, R = r + 14, x0 = Math.floor((x - R - TG.x0) / c), x1 = Math.ceil((x + R - TG.x0) / c), z0 = Math.floor((z - R - TG.z0) / c), z1 = Math.ceil((z + R - TG.z0) / c);
  for (let gz = Math.max(0, z0); gz <= Math.min(TG.nz - 1, z1); gz++) for (let gx = Math.max(0, x0); gx <= Math.min(TG.nx - 1, x1); gx++) {
    const o = gz * TG.nx + gx; const dx = TG.x0 + gx * c - x, dz = TG.z0 + gz * c - z, d = Math.hypot(dx, dz);
    const ad = Math.abs(TG.D[o]); const tr = trackAt(Math.max(0, TG.S[o]), _gt);
    const keep = smooth(tr.hw + 6, tr.hw + 16, ad); // 不動到路肩帶
    const t = (1 - smooth(r, R, d)) * keep;
    TG.H[o] = lerp(TG.H[o], y, t);
  }
}

// ───────────────────────── 地形網格 ─────────────────────────
const TERRAIN = { chunks: [], coarse: null, idx1: null, idx2: null };
function terrainAttrs(lu, orient, slope, ad, hw, dist) {
  // 回傳 [soil, tea, pine, cover, veg, paved, rock, orient, plain, inst]
  const a = terrainAttrs.o; a.fill(0);
  a[7] = orient;
  switch (lu) {
    case LU.FOREST: a[3] = 1; break;
    case LU.TEA: a[1] = 1; a[9] = ad < 78 ? 1 : 0; break;
    case LU.PINE: a[2] = 1; a[9] = ad < 46 ? 1 : 0; break;
    case LU.ORCHARD: a[3] = 0.45; a[0] = 0.15; break;
    case LU.PASTURE: break;
    case LU.BETEL: a[3] = 0.3; a[0] = 0.25; break;
    case LU.BAMBOO: a[3] = 0.9; break;
    case LU.TOWN: a[5] = 0.6; a[0] = 0.15; break;
    case LU.CYPRESS: a[3] = 0.5; a[0] = 0.2; break;
    case LU.VEG: a[4] = 1; break;
    case LU.SAND: a[0] = 1; break;
    case LU.POND: a[4] = 1; break;
  }
  if (ad < hw + 9) { const k = 1 - smooth(hw + 4, hw + 9, ad); for (let i = 0; i < 7; i++) a[i] *= 1 - k; a[9] *= 1 - k; }
  a[6] = smooth(0.55, 0.9, slope) * (1 - smooth(60, 140, ad));
  return a;
}
terrainAttrs.o = new Float32Array(10);

function buildTerrainMeshes() {
  TERRAIN.chunks = [];
  const cell = TG.cell, C = TG.chunk, nx = TG.nx, nz = TG.nz, V = C + 1;
  // 共享索引（含裙邊）
  const mkIdx = (st) => {
    const idx = []; const q = (a, b, c, d) => idx.push(a, b, c, a, c, d);
    for (let z = 0; z < C; z += st) for (let x = 0; x < C; x += st) { const a = z * V + x; q(a, a + st * V, a + st * V + st, a + st); }
    const S0 = V * V; // skirt verts: 4 edges × V
    for (let i = 0; i < C; i += st) {
      q(i, i + st, S0 + i + st, S0 + i);                                           // z=0 edge
      q(C * V + i + st, C * V + i, S0 + V + i, S0 + V + i + st);                    // z=C edge
      q((i + st) * V, i * V, S0 + 2 * V + i, S0 + 2 * V + i + st);                  // x=0 edge
      q(i * V + C, (i + st) * V + C, S0 + 3 * V + i + st, S0 + 3 * V + i);          // x=C edge
    }
    return new Uint16Array(idx);
  };
  const i1 = mkIdx(1), i2 = mkIdx(2), i4 = mkIdx(4);
  const mkIB = d => { const b = gl.createBuffer(); gl.bindVertexArray(null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d, gl.STATIC_DRAW); return { b, n: d.length }; };
  TERRAIN.ibs = [mkIB(i1), mkIB(i2), mkIB(i4)];
  // render heights (下挖路肩帶)
  const HR = new Float32Array(nx * nz);
  const tr = {};
  for (let o = 0; o < nx * nz; o++) {
    let h = TG.H[o];
    if (TG.S[o] >= 0) { const ad = Math.abs(TG.D[o]); if (ad < 30) { trackAt(TG.S[o], tr); h -= lowerAmt(ad, tr.hw); } }
    HR[o] = h;
  }
  TG.HR = HR;
  const nvert = V * V + 4 * V;
  for (let cz = 0; cz < (nz - 1) / C; cz++) for (let cx = 0; cx < (nx - 1) / C; cx++) {
    let minD = 1e9;
    for (let z = 0; z <= C; z += 4) for (let x = 0; x <= C; x += 4) minD = Math.min(minD, Math.abs(TG.D[(cz * C + z) * nx + cx * C + x]));
    if (minD > TG.R - 8) continue;
    const P = new Float32Array(nvert * 3), Nn = new Int8Array(nvert * 4), M0 = new Uint8Array(nvert * 4), M1 = new Uint8Array(nvert * 4), M2 = new Uint8Array(nvert * 2);
    let y0 = 1e9, y1 = -1e9;
    for (let z = 0; z <= C; z++) for (let x = 0; x <= C; x++) {
      const gx = cx * C + x, gz = cz * C + z, o = gz * nx + gx, k = z * V + x;
      const h = HR[o];
      P[k * 3] = TG.x0 + gx * cell; P[k * 3 + 1] = h; P[k * 3 + 2] = TG.z0 + gz * cell;
      if (h < y0) y0 = h; if (h > y1) y1 = h;
      const hl = HR[gz * nx + Math.max(0, gx - 1)], hr = HR[gz * nx + Math.min(nx - 1, gx + 1)], hu = HR[Math.max(0, gz - 1) * nx + gx], hd = HR[Math.min(nz - 1, gz + 1) * nx + gx];
      let nxn = (hl - hr), nyn = 2 * cell, nzn = (hu - hd); const l = Math.hypot(nxn, nyn, nzn);
      Nn[k * 4] = nxn / l * 127; Nn[k * 4 + 1] = nyn / l * 127; Nn[k * 4 + 2] = nzn / l * 127;
      const slope = Math.hypot(hl - hr, hu - hd) / (2 * cell);
      const ad = Math.abs(TG.D[o]); let hw = 5; if (TG.S[o] >= 0 && ad < 40) hw = trackAt(TG.S[o], tr).hw;
      const a = terrainAttrs(TG.LU[o], TG.OR[o], slope, ad, hw);
      if (TG.MASK[o] & 2) { a[0] = 0; a[1] = 0; a[2] = 0; a[3] = 0; a[4] = 0; a[5] = 1; a[9] = 0; }
      for (let j = 0; j < 4; j++) { M0[k * 4 + j] = a[j] * 255; M1[k * 4 + j] = a[4 + j] * 255; }
      M2[k * 2] = a[8] * 255; M2[k * 2 + 1] = a[9] * 255;
    }
    // skirts
    const sk = (e, i, src) => {
      const k = V * V + e * V + i;
      P[k * 3] = P[src * 3]; P[k * 3 + 1] = P[src * 3 + 1] - 22; P[k * 3 + 2] = P[src * 3 + 2];
      for (let j = 0; j < 4; j++) { Nn[k * 4 + j] = Nn[src * 4 + j]; M0[k * 4 + j] = M0[src * 4 + j]; M1[k * 4 + j] = M1[src * 4 + j]; }
      M2[k * 2] = M2[src * 2]; M2[k * 2 + 1] = M2[src * 2 + 1];
    };
    for (let i = 0; i <= C; i++) { sk(0, i, i); sk(1, i, C * V + i); sk(2, i, i * V); sk(3, i, i * V + C); }
    const m = mkVAO([{ loc: 0, data: P, size: 3 }, { loc: 1, data: Nn, size: 4, type: gl.BYTE, norm: true }, { loc: 3, data: M0, size: 4, type: gl.UNSIGNED_BYTE, norm: true },
    { loc: 4, data: M1, size: 4, type: gl.UNSIGNED_BYTE, norm: true }, { loc: 5, data: M2, size: 2, type: gl.UNSIGNED_BYTE, norm: true }], null);
    m.cx = TG.x0 + (cx + 0.5) * C * cell; m.cz = TG.z0 + (cz + 0.5) * C * cell; m.cy = (y0 + y1) / 2;
    m.r = Math.hypot(C * cell * 0.71, (y1 - y0) / 2 + 12);
    TERRAIN.chunks.push(m);
  }
  buildCoarseTerrain();
}

function buildCoarseTerrain() {
  const cell = 96, padX = 15000, padZ = 13000;
  const x0 = Math.floor((TR.minX - padX) / cell) * cell, z0 = Math.floor((TR.minZ - padZ) / cell) * cell;
  const nx = Math.ceil((TR.maxX + padX - x0) / cell) + 1, nz = Math.ceil((TR.maxZ + padZ - z0) / cell) + 1, N = nx * nz;
  const D2 = new Float32Array(N).fill(1e12), SI = new Int32Array(N).fill(-1);
  const R = 1900, Rc = Math.ceil(R / cell);
  for (let i = 0; i < TR.n; i += 8) {
    const fx = (TR.x[i] - x0) / cell, fz = (TR.z[i] - z0) / cell, cx = Math.round(fx), cz = Math.round(fz);
    for (let gz = Math.max(0, cz - Rc); gz <= Math.min(nz - 1, cz + Rc); gz++) for (let gx = Math.max(0, cx - Rc); gx <= Math.min(nx - 1, cx + Rc); gx++) {
      const dx = (gx - fx) * cell, dz = (gz - fz) * cell, d2 = dx * dx + dz * dz, o = gz * nx + gx; if (d2 < D2[o]) { D2[o] = d2; SI[o] = i; }
    }
  }
  const H = new Float32Array(N), Dd = new Float32Array(N), pr = {}, Wet = new Uint8Array(N), Wet2 = new Uint8Array(N), In = new Uint8Array(N);
  for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
    const o = gz * nx + gx, x = x0 + gx * cell, z = z0 + gz * cell;
    if (SI[o] < 0 || D2[o] > R * R) { H[o] = plainH(x, z); Dd[o] = 9999; if (H[o] < ROUTE.sea) { Wet[o] = Math.min(255, (ROUTE.sea - H[o]) * 25.5); Wet2[o] = 1; } continue; }
    trackProject(x, z, SI[o] * DS, pr);
    Dd[o] = Math.abs(pr.d);
    let h = terrainHraw(x, z, pr.s, pr.d);
    Wet[o] = h < ROUTE.sea ? Math.min(255, (ROUTE.sea - h) * 25.5) : 0; Wet2[o] = h < ROUTE.sea ? 1 : 0; In[o] = Dd[o] < TG.R - 60 ? 1 : 0;
    h -= 20 * (1 - smooth(TG.R - 90, TG.R + 150, Dd[o]));
    H[o] = h;
  }
  const P = new Float32Array(N * 3), Nn = new Int8Array(N * 4), M0 = new Uint8Array(N * 4), M1 = new Uint8Array(N * 4), M2 = new Uint8Array(N * 2);
  for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
    const o = gz * nx + gx, x = x0 + gx * cell, z = z0 + gz * cell;
    P[o * 3] = x; P[o * 3 + 1] = H[o]; P[o * 3 + 2] = z;
    const hl = H[gz * nx + Math.max(0, gx - 1)], hr = H[gz * nx + Math.min(nx - 1, gx + 1)], hu = H[Math.max(0, gz - 1) * nx + gx], hd = H[Math.min(nz - 1, gz + 1) * nx + gx];
    const l = Math.hypot(hl - hr, 2 * cell, hu - hd);
    Nn[o * 4] = (hl - hr) / l * 127; Nn[o * 4 + 1] = 2 * cell / l * 127; Nn[o * 4 + 2] = (hu - hd) / l * 127;
    const slope = Math.hypot(hl - hr, hu - hd) / (2 * cell);
    const ph = plainH(x, z), xe = x - ridgeXAt(z);
    const onPlain = (1 - smooth(4, 22, H[o] - ph)) * (xe < 0 || xe < 4200 ? 1 : 1 - smooth(4200, 6000, xe)) * (1 - smooth(0.05, 0.16, slope));
    const op = onPlain * ROUTE.plainPatch;
    M0[o * 4 + 3] = (1 - op) * 255;  // forest cover
    M2[o * 2] = op * 255;
    M1[o * 4] = Wet[o]; M1[o * 4 + 1] = Wet2[o] * 255; M1[o * 4 + 2] = In[o] * 255;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let k = 0;
  for (let gz = 0; gz < nz - 1; gz++) for (let gx = 0; gx < nx - 1; gx++) { const a = gz * nx + gx; idx[k++] = a; idx[k++] = a + nx; idx[k++] = a + nx + 1; idx[k++] = a; idx[k++] = a + nx + 1; idx[k++] = a + 1; }
  TERRAIN.coarse = mkVAO([{ loc: 0, data: P, size: 3 }, { loc: 1, data: Nn, size: 4, type: gl.BYTE, norm: true }, { loc: 3, data: M0, size: 4, type: gl.UNSIGNED_BYTE, norm: true },
  { loc: 4, data: M1, size: 4, type: gl.UNSIGNED_BYTE, norm: true }, { loc: 5, data: M2, size: 2, type: gl.UNSIGNED_BYTE, norm: true }], idx);
}

const TERRAIN_VS = GLSL_HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aNrm; layout(location=3) in vec4 aM0; layout(location=4) in vec4 aM1; layout(location=5) in vec2 aM2;
uniform vec4 uSea; // level, enabled, beach, coarse
out vec3 vW; out vec3 vN; out vec4 vM0; out vec4 vM1; out vec2 vM2; out float vDep;
void main(){
  vec3 p = aPos; vec3 n = aNrm.xyz; vec4 m1 = aM1; float dep = -2.;
  if(uSea.y > .5){
    if(uSea.w > .5){ m1 = vec4(0.); if(aM1.g > .5){ dep = aM1.r*10. + .02; p.y = uSea.x - aM1.b*.7; n = vec3(0.,1.,0.); } }
    else { dep = uSea.x - p.y; if(dep > 0.){ p.y = uSea.x; n = vec3(0.,1.,0.); } }
  }
  vDep = dep; vW = p; vN = n; vM0 = aM0; vM1 = m1; vM2 = aM2; gl_Position = uViewProj * vec4(p, 1.);
}`;
const TERRAIN_FS = GLSL_HEAD + GLSL_LIGHT + `
uniform sampler2DArray uTex0;
uniform vec4 uSea; uniform vec4 uWater; uniform vec4 uWater2; uniform vec3 uSoil; uniform vec4 uStyle;
in vec3 vW; in vec3 vN; in vec4 vM0; in vec4 vM1; in vec2 vM2; in float vDep;
out vec4 oCol;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float rows(float c, float pitch, float duty, out float fw){
  float r = c/pitch; fw = fwidth(r);
  float m = 1. - smoothstep(duty*.5 - fw, duty*.5 + fw, abs(fract(r)-.5));
  return mix(m, duty, smoothstep(.35, .9, fw));
}
void main(){
  if(uSea.y > .5 && vDep > 0.){
    vec3 Vw = uCam.xyz - vW; float dw = length(Vw); Vw /= dw; float t = uCam.w; vec2 wv = vW.xz;
    vec3 nA = texture(uNoise, wv/29. + vec2(t*.011, t*.006)).rgb, nB = texture(uNoise, wv/6.7 - vec2(t*.021, -t*.013)).rgb;
    vec3 wn = normalize(vec3((nA.r-.5)*.55 + (nB.g-.5)*.3, 1., (nA.g-.5)*.55 + (nB.r-.5)*.3));
    wn = normalize(mix(vec3(0.,1.,0.), wn, (.3 + .7/(1. + dw*.006)) * uWater.w));
    float F = .02 + .42*pow(1. - max(dot(wn, Vw), 0.), 5.);
    // 水色漸層：岸邊淺水偏青藍 → 深水湛藍，遠方再加深
    float dk = smoothstep(0., uWater2.w, vDep);
    vec3 wc = mix(uWater2.rgb, uWater.rgb, dk);
    wc = mix(wc, uWater.rgb*vec3(.8, .85, 1.1), smoothstep(150., 1400., dw)*.6);
    vec3 body = wc * (uSunCol.rgb*max(uSun.y, .12)*.4 + uAmbSky.rgb*.78);
    vec3 Rw = reflect(-Vw, wn); Rw.y = abs(Rw.y) + .01;
    float shw = shadowAt(vW, vec3(0.,1.,0.));
    vec3 Hw = normalize(uSun.xyz + Vw);
    vec3 cw = mix(body, skyAt(normalize(Rw)) * vec3(.62, .8, 1.), F) + uSunCol.rgb * pow(max(dot(wn, Hw), 0.), 220.) * 5. * shw;
    float foam = smoothstep(.5, .0, vDep) * smoothstep(.3, .7, nB.b + .22*sin(vDep*8. - t*1.5)) * (1. - uSea.w);
    cw = mix(cw, vec3(.8)*(uSunCol.rgb*.22 + uAmbSky.rgb), foam*.8);
    oCol = vec4(fogged(cw, vW), 1.); return;
  }
  vec3 pondC = vec3(0.); float pondK = 0.;
  vec3 n = normalize(vN);
  vec3 V = uCam.xyz - vW; float dist = length(V);
  vec2 uv = vW.xz;
  vec4 nzA = texture(uNoise, uv/330.); vec4 nzB = texture(uNoise, uv/61.); vec4 nzC = texture(uNoise, uv/13.);
  float near = 1. - smoothstep(50., 200., dist);
  vec3 gA = texture(uTex0, vec3(uv/5.3, 0.)).rgb, gB = texture(uTex0, vec3(uv/37., 0.)).rgb;
  vec3 grass = mix(gB, gA, near*.75) * mix(vec3(.78,.86,.6), vec3(1.06,1.0,.72), nzA.r) * mix(.85, 1.1, nzB.g);
  vec3 soil = mix(texture(uTex0, vec3(uv/29., 1.)).rgb, texture(uTex0, vec3(uv/4.3, 1.)).rgb, near*.7) * mix(.82, 1.12, nzB.r);
  soil *= uSoil;
  vec3 col = grass;
  float orient = step(.5, vM1.a);
  float rc = mix(uv.y, uv.x, orient);
  float inst = vM2.y * (1. - smoothstep(170., 230., dist));
  float fw;
  // 茶園
  if(vM0.g > .01){
    float h = rows(rc, 1.8, .6, fw);
    vec3 teaTop = mix(vec3(.105,.24,.035), vec3(.2,.36,.05), nzC.r) * mix(.85,1.15,nzB.b);
    vec3 far = mix(soil*.55, teaTop, h);
    vec3 nearG = mix(soil*.8, soil*.3, h*.8);
    col = mix(col, mix(far, nearG, inst), vM0.g);
  }
  // 鳳梨田
  if(vM0.b > .01){
    float h = rows(rc, 1.5, .55, fw);
    float dots = mix(.75 + .25*sin(mix(uv.x, uv.y, orient)*5.2), 1., smoothstep(.1,.4,fw));
    vec3 pine = mix(vec3(.16,.23,.14), vec3(.25,.31,.17), nzC.g);
    vec3 far = mix(soil, pine, h*dots*.92);
    vec3 nearG = mix(soil, soil*.55, h*.5);
    col = mix(col, mix(far, nearG, inst), vM0.b);
  }
  if(vM1.r > .01 && uStyle.y > .5){
    vec2 pq = uv/vec2(54.,35.); vec2 pc = floor(pq), pf = fract(pq);
    float dike = smoothstep(.0,.05,pf.x)*smoothstep(1.,.95,pf.x)*smoothstep(.0,.08,pf.y)*smoothstep(1.,.92,pf.y);
    vec3 Vp = normalize(uCam.xyz - vW); float Fp = .03 + .97*pow(1. - max(Vp.y, 0.), 5.);
    // 魚塭／湖面：藍色，靠堤岸處較淺較青、中央較深
    float ctr = smoothstep(.0, .35, min(min(pf.x, 1. - pf.x), min(pf.y, 1. - pf.y)));
    vec3 pDeep = mix(vec3(.02,.09,.27), vec3(.03,.13,.32), hash21(pc)), pShal = vec3(.07,.3,.42);
    pondC = mix(pShal, pDeep, ctr) * (uSunCol.rgb*uSun.y*.4 + uAmbSky.rgb*.8);
    pondC = mix(pondC, skyAt(normalize(vec3(-Vp.x, abs(Vp.y) + .02, -Vp.z))) * vec3(.62, .8, 1.), Fp*.75);
    pondK = dike * vM1.r; col = mix(col, grass*.8, vM1.r);
  } else
  // 菜園／薑田
  if(vM1.r > .01){
    float h = rows(rc, 1.25, .5, fw);
    vec3 crop = mix(vec3(.13,.3,.05), vec3(.26,.38,.09), nzB.a);
    col = mix(col, mix(soil*.85, crop, h*step(.25, nzA.g + nzB.r*.3)), vM1.r);
  }
  col = mix(col, soil, vM0.r * (.6 + .4*nzB.g));
  // 森林：近看落葉林床，遠看樹冠
  float cover = vM0.a;
  if(cover > .01){
    vec3 litter = texture(uTex0, vec3(uv/4.7, 2.)).rgb * mix(.7,1.1,nzB.r);
    vec3 under = mix(litter, grass*.55, nzB.b*.6);
    float c1 = texture(uNoise, uv/17.).r, c2 = texture(uNoise, (uv + uSun.xz*2.2)/17.).r;
    float c3 = texture(uNoise, uv/6.1).g;
    float sh = clamp(.55 + (c1-c2)*3.2, .25, 1.15);
    vec3 can = mix(vec3(.035,.085,.022), vec3(.085,.16,.035), c1) * (sh*.8 + c3*.35) * mix(vec3(.85,1.,.8), vec3(1.25,1.1,.7), nzA.b);
    float farK = smoothstep(120., 230., dist);
    col = mix(col, mix(under, can, farK), cover);
  }
  // 鋪面／砂石地
  if(vM1.g > .01){ vec3 pave = texture(uTex0, vec3(uv/6.3, 3.)).rgb * mix(.85,1.08,nzB.g); col = mix(col, pave, vM1.g); }
  // 紅土礫石邊坡
  col = mix(col, soil*mix(.9,1.25,nzC.b), vM1.b*.85);
  // 平原：稻田拼布、聚落、道路
  if(vM2.x > .01){
    vec2 q = uv*mat2(.9659,-.2588,.2588,.9659);
    vec2 cell = floor(q/vec2(150.,95.)); vec2 f = fract(q/vec2(150.,95.));
    float h1 = hash21(cell), h2 = hash21(cell+7.3);
    vec3 pad = h1 < .42 ? mix(vec3(.2,.33,.08), vec3(.3,.4,.1), h2) : h1 < .7 ? mix(vec3(.42,.38,.16), vec3(.5,.43,.2), h2) : h1 < .86 ? mix(vec3(.3,.24,.16), vec3(.36,.3,.2), h2) : vec3(.16,.28,.1);
    if(hash21(cell+11.) < uStyle.z) pad = vec3(.035,.07,.065);
    float edge = smoothstep(.0,.035,f.x)*smoothstep(.0,.05,f.y);
    pad = mix(vec3(.3,.32,.24), pad, mix(1., edge, 1.-smoothstep(1500.,5000.,dist)));
    float town = smoothstep(.6,.72, texture(uNoise, uv/5200.).r*.75 + texture(uNoise, uv/1300.).g*.4);
    vec3 tcol = mix(vec3(.4,.39,.37), vec3(.62,.6,.57), hash21(floor(uv/26.)));
    tcol = mix(tcol, vec3(.2,.26,.14), step(.72, hash21(floor(uv/26.)+3.)));
    pad = mix(pad, tcol, town*.9);
    col = mix(col, pad, vM2.x);
  }
  col = mix(col, soil*1.05, (1. - smoothstep(.3, 2.6, -vDep)) * uSea.z * uSea.y * (1. - uSea.w) * (1. - vM1.g));
  float ndl = max(dot(n, uSun.xyz), 0.);
  float sh = shadowAt(vW, n);
  // 樹冠下環境光壓暗
  float ao = mix(1., .62, cover * (1.-smoothstep(120.,230.,dist)));
  vec3 lit = col * (uSunCol.rgb * ndl * sh + ambientL(n) * ao);
  lit = mix(lit, pondC, pondK);
  oCol = vec4(fogged(lit, vW), 1.);
}`;
