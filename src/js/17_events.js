// ───────────────────────── 路上事件：修復愛心、防撞緩衝車、油罐車漏油 ─────────────────────────
// 每條路線各兩顆修復愛心（約 30%、62% 處）、一台防撞緩衝車（約 46%）、一台拋錨漏油的油罐車（約 80%）。
// 位置在載入路線時依彎道自動挑選較直的路段，各路線固定、線上對戰各端一致。
const HAZ = { hearts: [], truck: null, tanker: null, oil: null, bands: [], mesh: null, lamps: null };
const ROLL_DUR = 1.75, SPIN_DUR = 2.5;

function findStraight(frac, avoid) {
  const target = S_START + frac * (S_FINISH - S_START);
  let best = target, bestScore = 1e9;
  for (let s = target - 700; s <= target + 700; s += 10) {
    if (s < S_START + 300 || s > S_FINISH - 250 || inJunction(s, 70)) continue;
    if (avoid.some(a => Math.abs(a - s) < 260)) continue;
    if (ROUTE.fog && s > ROUTE.fog[0] - 150 && s < ROUTE.fog[1] + 60) continue;
    let mk = 0; for (let q = s - 110; q <= s + 70; q += 4) mk = Math.max(mk, Math.abs(TR.k[clamp(Math.round(q / DS), 0, TR.n - 1)]));
    const score = mk * 4000 + Math.abs(s - target) * 0.01;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  return best;
}
function planHazards() {
  const used = [];
  const s1 = findStraight(0.46, used); used.push(s1);
  const s2 = findStraight(0.8, used); used.push(s2);
  const h1 = findStraight(0.3, used); used.push(h1);
  const h2 = findStraight(0.62, used); used.push(h2);
  const h3 = findStraight(0.88, used.concat([S_FINISH - 300])); // 第三顆：油罐車之後、離終點至少約 560 m（太靠近終點就沒用了），給最後一段修車況
  // 每個地點同時放兩顆，三種擺法擇一（由位置決定，所有玩家看到的一樣）：中＋左、中＋右、左＋右
  const LN = { L: 3.0, C: 0, R: -3.0 }, PAIRS = [['C', 'L'], ['C', 'R'], ['L', 'R']];
  HAZ.hearts = [];
  [h1, h2, h3].forEach((hs, i) => { const pr = PAIRS[(Math.floor(hs / 7) + i) % 3]; for (const k of pr) HAZ.hearts.push({ s: hs, d: LN[k], got: false, grp: i }); });
  const hw1 = trackAt(s1, {}).hw, hw2 = trackAt(s2, {}).hw;
  // 防撞緩衝車：右側車道，車尾的緩衝墊朝向來車
  HAZ.truck = { s: s1, d: -(hw1 - 1.42), s0: s1 - 4.6, s1: s1 + 4.1, hw: 1.25 };
  // 油罐車：左側車道拋錨，油漬漫到路中央
  const td = hw2 - 1.42;
  HAZ.tanker = { s: s2, d: td, s0: s2 - 5.4, s1: s2 + 4.6, hw: 1.25 };
  HAZ.oil = { sc: s2 - 13, ls: 11, dlo: -0.7, dhi: td - 0.4 };
  HAZ.bands = [
    { s0: HAZ.truck.s0 - 18, s1: HAZ.truck.s1 + 2, dlo: HAZ.truck.d - 1.3, dhi: HAZ.truck.d + 1.3 },
    { s0: HAZ.oil.sc - HAZ.oil.ls - 2, s1: HAZ.tanker.s1 + 2, dlo: HAZ.oil.dlo - 0.2, dhi: td + 1.3 }
  ];
  HAZ.warn = [{ s: HAZ.truck.s0 - 230, msg: '前方高速公路防撞緩衝車，請往左變換車道', done: false }, { s: HAZ.oil.sc - HAZ.oil.ls - 230, msg: '前方油罐車拋錨漏油，請靠右閃避', done: false }];
}
function hazardDecals(add) {
  const o = HAZ.oil; if (!o) return;
  add(o.sc - o.ls, o.ls * 2, (o.dlo + o.dhi) / 2, o.dhi - o.dlo + 0.6, 6);
  add(HAZ.tanker.s0 - 1, HAZ.tanker.s1 - HAZ.tanker.s0 - 1, HAZ.tanker.d - 0.3, 2.4, 6);
}
function resetHazards() {
  for (const h of HAZ.hearts) h.got = false;
  for (const w of HAZ.warn || []) w.done = false;
  GAME.fogMsg = false;
}

// ── 模型：在路線載入時直接烘焙到世界座標
function hazardFrame(s, d) { const f = roadFrame(s, d, 0); f.m[13] = f.t.y - f.t.bank * d; return f.m; }
function hzWheels(mb, zs, track, r = 0.48) {
  const T = M4.create(), R0 = M4.create(), m0 = mb.m;
  for (const z of zs) for (const sx of [-1, 1]) {
    M4.mul(T, m0, M4.translate(R0, sx * track, r, z)); M4.mul(T, T, M4.rotZ(R0, PI / 2)); mb.m = T;
    mb.lay(-1).col(0.03, 0.03, 0.03, 1); mb.cyl(0, -0.16, 0, r, r, 0.32, 16, true, true);
    mb.col(0.55, 0.55, 0.55, 0.3); mb.cyl(0, sx > 0 ? 0.161 : -0.171, 0, r * 0.55, r * 0.55, 0.01, 12, true);
  }
  mb.m = m0;
}
function buildAttenuatorTruck(mb, lamps) {
  const Y = [0.96, 0.74, 0.05];
  // 底盤
  mb.lay(-1).col(0.06, 0.06, 0.06, 1); mb.box(0, 0.75, -0.1, 0.95, 0.14, 3.7);
  // 駕駛室
  mb.col(Y[0], Y[1], Y[2], 0.6); mb.box(0, 1.95, 3.15, 1.2, 1.15, 0.9);
  mb.col(0.92, 0.92, 0.9, 0.6); mb.box(0, 0.95, 4.06, 1.2, 0.18, 0.03);
  mb.col(0.03, 0.04, 0.05, 0.3); mb.q4([1.12, 2.0, 4.06], [-1.12, 2.0, 4.06], [-1.12, 2.85, 3.92], [1.12, 2.85, 3.92]);
  for (const sx of [-1, 1]) { mb.q4(sx > 0 ? [1.21, 1.95, 2.55] : [-1.21, 1.95, 3.7], sx > 0 ? [1.21, 1.95, 3.7] : [-1.21, 1.95, 2.55], sx > 0 ? [1.21, 2.8, 3.7] : [-1.21, 2.8, 2.55], sx > 0 ? [1.21, 2.8, 2.55] : [-1.21, 2.8, 3.7]); }
  mb.col(0.9, 0.9, 0.88, 1); mb.box(0, 3.12, 3.1, 1.15, 0.03, 0.8);
  // 車斗與工具箱
  mb.col(Y[0], Y[1], Y[2], 0.6); mb.box(0, 1.55, -0.2, 1.22, 0.7, 2.25);
  mb.col(0.85, 0.08, 0.06, 0.6); for (let z = -2.2; z < 2; z += 0.6) mb.box(1.23, 1.05, z + 0.15, 0.01, 0.07, 0.15); for (let z = -2.2; z < 2; z += 0.6) mb.box(-1.23, 1.05, z + 0.15, 0.01, 0.07, 0.15);
  mb.col(0.95, 0.95, 0.93, 0.6); for (let z = -1.9; z < 2; z += 0.6) { mb.box(1.23, 1.05, z + 0.15, 0.01, 0.07, 0.15); mb.box(-1.23, 1.05, z + 0.15, 0.01, 0.07, 0.15); }
  // 箭頭標誌板（後方升起）與支架
  mb.col(0.12, 0.12, 0.12, 0.3); for (const sx of [-0.7, 0.7]) mb.box(sx, 2.75, -2.25, 0.06, 0.55, 0.06);
  mb.lay(PL.ARROWB).col(0.55, 0.55, 0.55, 1); mb.q4([1.25, 2.4, -2.33], [-1.25, 2.4, -2.33], [-1.25, 3.75, -2.33], [1.25, 3.75, -2.33]);
  mb.lay(-1).col(0.08, 0.08, 0.08, 1); mb.box(0, 3.08, -2.29, 1.27, 0.7, 0.04, 0, 1 | 2 | 4 | 8 | 16);
  lamps.lay(PL.ARROWB).col(1, 0.85, 0.35, 0.1); lamps.q4([1.25, 2.4, -2.345], [-1.25, 2.4, -2.345], [-1.25, 3.75, -2.345], [1.25, 3.75, -2.345]);
  // 車尾緩衝墊（黃黑斜紋）
  mb.col(0.15, 0.15, 0.15, 0.3); for (const sx of [-0.6, 0.6]) mb.box(sx, 0.8, -2.85, 0.07, 0.07, 0.45);
  mb.lay(PL.TMA).col(1, 1, 1, 1); mb.box(0, 0.95, -3.95, 1.18, 0.52, 0.72, 1.2);
  mb.lay(-1).col(0.85, 0.06, 0.04, 0.1); for (const sx of [-1, 1]) mb.box(sx * 1.05, 1.38, -4.68, 0.07, 0.05, 0.01);
  // 車頂黃色旋轉燈
  mb.col(0.2, 0.2, 0.2, 0.3); mb.box(0, 3.18, 3.0, 0.7, 0.05, 0.12);
  lamps.lay(-1).col(1, 0.62, 0.05, 0.1); for (const sx of [-0.55, 0.55]) lamps.cyl(sx, 3.22, 3.0, 0.11, 0.09, 0.16, 10, true);
  lamps.col(1, 0.62, 0.05, 0.1); for (const sx of [-1.15, 1.15]) lamps.box(sx, 1.15, -2.47, 0.08, 0.06, 0.02);
  hzWheels(mb, [2.9, -1.0, -1.95], 1.0);
}
function buildTanker(mb, lamps) {
  mb.lay(-1).col(0.06, 0.06, 0.06, 1); mb.box(0, 0.75, 0, 0.95, 0.14, 4.9);
  // 車頭
  mb.col(0.92, 0.92, 0.9, 0.6); mb.box(0, 1.85, 3.85, 1.22, 1.1, 0.9);
  mb.col(0.1, 0.35, 0.68, 0.6); mb.box(0, 1.0, 4.76, 1.22, 0.2, 0.02); mb.box(0, 1.45, 3.85, 1.23, 0.07, 0.9);
  mb.col(0.03, 0.04, 0.05, 0.3); mb.q4([1.14, 1.95, 4.76], [-1.14, 1.95, 4.76], [-1.14, 2.75, 4.62], [1.14, 2.75, 4.62]);
  // 油槽（銀色圓筒）
  const T = M4.create(), R0 = M4.create(), m0 = mb.m;
  M4.mul(T, m0, M4.translate(R0, 0, 1.95, -5.0)); M4.mul(T, T, M4.rotX(R0, PI / 2)); mb.m = T;
  mb.col(0.78, 0.8, 0.82, 0.3); mb.cyl(0, 0, 0, 1.12, 1.12, 7.7, 28, true, true, 0.2);
  mb.col(0.85, 0.32, 0.05, 0.6); mb.cyl(0, 3.2, 0, 1.135, 1.135, 0.35, 28, false);
  mb.m = m0;
  // 危險物品標示
  mb.col(0.95, 0.45, 0.05, 0.6); for (const sx of [-1, 1]) mb.box(sx * 1.13, 1.95, -1.2, 0.01, 0.28, 0.4);
  mb.col(0.05, 0.05, 0.05, 1); mb.box(0, 3.08, -1.2, 0.08, 0.05, 2.5);
  hzWheels(mb, [3.6, -2.4, -3.5], 1.0);
  lamps.lay(-1).col(1, 0.6, 0.05, 0.1); for (const sx of [-1.1, 1.1]) { lamps.box(sx, 1.0, -4.95, 0.09, 0.07, 0.03); lamps.box(sx, 1.1, 4.78, 0.1, 0.06, 0.02); }
  // 漏油滴落的油柱
  mb.col(0.02, 0.018, 0.015, 0.6); mb.cyl(-0.85, 0.02, -4.2, 0.04, 0.03, 0.85, 8, false);
}
function buildCone(mb, x, z, y) {
  mb.col(0.95, 0.35, 0.04, 0.6); mb.box(x, y + 0.02, z, 0.2, 0.02, 0.2); mb.cyl(x, y + 0.04, z, 0.15, 0.03, 0.66, 12, true);
  mb.col(0.95, 0.95, 0.93, 0.6); mb.cyl(x, y + 0.3, z, 0.098, 0.082, 0.12, 12, false);
}
function buildTriangle(mb) {
  mb.col(0.9, 0.06, 0.04, 0.6);
  const s = 0.28, h = 0.5;
  for (const [a, b] of [[[-s, 0.05], [0, h]], [[0, h], [s, 0.05]], [[s, 0.05], [-s, 0.05]]]) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L * 0.03, ny = dx / L * 0.03;
    mb.q4([a[0], a[1], 0], [b[0], b[1], 0], [b[0] + nx, b[1] + ny, 0], [a[0] + nx, a[1] + ny, 0]);
    mb.q4([a[0] + nx, a[1] + ny, 0], [b[0] + nx, b[1] + ny, 0], [b[0], b[1], 0], [a[0], a[1], 0]);
  }
  mb.col(0.1, 0.1, 0.1, 1); mb.box(0, 0.02, -0.12, 0.2, 0.01, 0.12);
}
function buildHazards() {
  const mb = new MB(8192), lamps = new MB(512), tr = {};
  const T = HAZ.truck, K = HAZ.tanker;
  mb.m = hazardFrame(T.s, T.d); lamps.m = mb.m; buildAttenuatorTruck(mb, lamps);
  mb.m = hazardFrame(K.s, K.d); lamps.m = mb.m; buildTanker(mb, lamps);
  mb.m = null; lamps.m = null;
  // 錐形筒：緩衝車後方，排在該車道內
  for (let k = 0; k < 5; k++) { const s = T.s0 - 5 - k * 5, d = T.d - 0.9 + k * 0.42; const t = trackAt(s, tr); const x = t.x + t.nx * d, z = t.z + t.nz * d; buildCone(mb, x, z, t.y - t.bank * d); }
  // 三角警示架：油罐車後方 25 公尺
  { const s = K.s0 - 26, d = K.d; mb.m = hazardFrame(s, d); M4.mul(mb.m, mb.m, M4.rotY(M4.create(), PI)); buildTriangle(mb); mb.m = null; }
  // 事前警告標誌
  signPost(mb, T.s0 - 150, -(trackAt(T.s0 - 150, tr).hw + BARRIER_OFF + 1.4), PL.ROADWORK, [0, 0.23, 0.5, 0.77], 1.6, 1.25, 1.9);
  signPost(mb, HAZ.oil.sc - HAZ.oil.ls - 150, -(trackAt(HAZ.oil.sc - 150, tr).hw + BARRIER_OFF + 1.4), PL.ROADWORK, [0.5, 0.23, 1, 0.77], 1.6, 1.25, 1.9);
  HAZ.mesh = mb.build(); HAZ.lamps = lamps.build();
}
function drawHazards(phase) {
  if (phase !== 0 || !HAZ.mesh) return;
  useProg(PROGS.static); bindTex(0, TEX.prop, gl.TEXTURE_2D_ARRAY); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(HAZ.mesh.vao); gl.drawElements(gl.TRIANGLES, HAZ.mesh.count, HAZ.mesh.itype, 0);
  if (fract(CAM.time * 1.25) < 0.55) { gl.bindVertexArray(HAZ.lamps.vao); gl.drawElements(gl.TRIANGLES, HAZ.lamps.count, HAZ.lamps.itype, 0); }
  gl.enable(gl.CULL_FACE);
  drawHearts();
}
function drawHazardsShadow(ci, C) {
  if (!HAZ.mesh) return;
  useProg(PROGS.sh_static); gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(HAZ.mesh.vao); gl.drawElements(gl.TRIANGLES, HAZ.mesh.count, HAZ.mesh.itype, 0);
  gl.enable(gl.CULL_FACE);
}

// ── 修復愛心（立體、旋轉、上下浮動）
function buildHeartMesh() {
  const NT = 72, NF = 12, T = 0.22, sc = 0.042, cy = -2;
  const curve = t => [16 * Math.pow(Math.sin(t), 3), 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
  const P = [];
  for (let side = 0; side < 2; side++) for (let j = 0; j <= NF; j++) for (let i = 0; i <= NT; i++) {
    const f = j / NF, c = curve(i / NT * TAU), x = c[0] * f * sc, y = (cy + (c[1] - cy) * f) * sc, z = (side ? -1 : 1) * T * Math.sqrt(Math.max(0, 1 - f * f));
    P.push([x, y + 0.5, z]);
  }
  const mb = new MB(4096); mb.col(1, 1, 1, 1); const V = NT + 1;
  for (let side = 0; side < 2; side++) {
    const b0 = side * (NF + 1) * V, base = mb.nv;
    for (let j = 0; j <= NF; j++) for (let i = 0; i <= NT; i++) {
      const g = (jj, ii) => P[b0 + clamp(jj, 0, NF) * V + ((ii + NT) % NT)];
      const p = g(j, i), a = g(j, i + 1), b = g(j, i - 1), cc = g(j + 1, i), dd = g(j - 1, i);
      const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = cc[0] - dd[0], vy = cc[1] - dd[1], vz = cc[2] - dd[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      if (j === 0) { nx = 0; ny = 0; nz = side ? -1 : 1; } else { nx /= l; ny /= l; nz /= l; if (nz * (side ? -1 : 1) < 0 && j < NF * 0.7) { nx = -nx; ny = -ny; nz = -nz; } }
      mb.v(p[0], p[1], p[2], nx, ny, nz);
    }
    for (let j = 0; j < NF; j++) for (let i = 0; i < NT; i++) { const a = base + j * V + i, b = a + V; if (side) mb.quad(a, a + 1, b + 1, b); else mb.quad(a, b, b + 1, a + 1); }
  }
  CARM.heart = mb.build();
}
const _hm = M4.create(), _hr = M4.create(), _ht = {};
function drawHearts() {
  const P = useProg(PROGS.car); gl.disable(gl.CULL_FACE);
  gl.uniform4f(P.u('uDmg'), 0, 0, 0, 0); gl.uniform4f(P.u('uP'), 4, 0, 0, 0); gl.uniform1f(P.u('uInside'), 0);
  for (const h of HAZ.hearts) {
    if (h.got) continue;
    const t = trackAt(h.s, _ht), x = t.x + t.nx * h.d, z = t.z + t.nz * h.d, y = t.y + 1.25 + Math.sin(CAM.time * 2.2) * 0.18;
    if (!sphereInFrustum(CAM.planes, x, y, z, 1.5)) continue;
    M4.translate(_hm, x, y, z); M4.mul(_hm, _hm, M4.rotY(_hr, CAM.time * 1.8)); M4.mul(_hm, _hm, M4.scale(_hr, 1.25, 1.25, 1.25));
    gl.uniformMatrix4fv(P.u('uModel'), false, _hm); gl.bindVertexArray(CARM.heart.vao); gl.drawElements(gl.TRIANGLES, CARM.heart.count, CARM.heart.itype, 0);
  }
  gl.enable(gl.CULL_FACE);
}

// ── 每步檢查：愛心、緩衝車、油罐車、油漬、事前提示
const _hz = {};
function stepHazards(c, dt) {
  if (!c || c.ai || c.remote || c.broken || c.finished || !HAZ.truck || GAME.state !== 'racing') return;
  for (const w of HAZ.warn) if (!w.done && c.s > w.s && c.s < w.s + 200) { w.done = true; toast(w.msg); }
  if (ROUTE.fog && !GAME.fogMsg && c.s > ROUTE.fog[0] - 60 && c.s < ROUTE.fog[1]) { GAME.fogMsg = true; toast('前方起霧，能見度降低，請減速慢行'); }
  for (const h of HAZ.hearts) {
    if (h.got || Math.abs(c.s - h.s) > 2.6 || Math.abs(c.d - h.d) > 1.6) continue;
    h.got = true; const had = c.dmg || 0;
    c.dmg = 0; c.dents = null; c.dentVer = (c.dentVer || 0) + 1;
    const t = trackAt(h.s, _hz), x = t.x + t.nx * h.d, z = t.z + t.nz * h.d;
    for (let i = 0; i < 36; i++) { const a = Math.random() * TAU, r = 1 + Math.random() * 2.5; fxSpawn(x, t.y + 1.3, z, Math.cos(a) * r + c.vx * 0.6, 0.5 + Math.random() * 2.2, Math.sin(a) * r + c.vz * 0.6, 0.8 + Math.random() * 0.7, 0.12, 0.5, -2); }
    toast(had ? '修復愛心！撞擊次數歸零，車況完全恢復' : '修復愛心！（車況本來就完好）');
    AUDIO.beep(660, 0.12); setTimeout(() => AUDIO.beep(880, 0.12), 110); setTimeout(() => AUDIO.beep(1320, 0.25), 220);
  }
  if (c.air || c.spinO) return;
  const T = HAZ.truck;
  if (c.s > T.s0 - 2.2 && c.s < T.s1 + 2.2 && Math.abs(c.d - T.d) < T.hw + 0.86) { launchCar(c); return; }
  const K = HAZ.tanker;
  if (c.s > K.s0 - 2.2 && c.s < K.s1 + 2.2 && Math.abs(c.d - K.d) < K.hw + 0.86) {
    const t = trackAt(c.s, _hz), target = K.d - K.hw - 0.88, push = c.d - target;
    c.x -= t.nx * push; c.z -= t.nz * push; c.d = target;
    const vn = c.vx * t.nx + c.vz * t.nz; if (vn > 0) { c.vx -= t.nx * vn * 1.3; c.vz -= t.nz * vn * 1.3; }
    if (c.s < K.s0 + 0.5) { c.vx *= 0.45; c.vz *= 0.45; }
    AUDIO.hit(0.8); GAME.shake = 0.7; registerHit(c, t.nx, t.nz, Math.max(4, Math.abs(c.v) * 0.5));
  }
  const O = HAZ.oil, qs = (c.s - O.sc) / O.ls, qd = (c.d - (O.dlo + O.dhi) / 2) / ((O.dhi - O.dlo) / 2 + 0.5);
  if (qs * qs + qd * qd < 1 && Math.abs(c.v) > 4 && !((c.oilCD || 0) > 0)) startSpin(c);
}
// 撞上緩衝車：飛起翻兩圈後落地，速度降到 10–20 km/h
function launchCar(c) {
  const T = HAZ.truck;
  registerHit(c, Math.sin(c.yaw), Math.cos(c.yaw), Math.max(6, Math.abs(c.v)));
  if (c.broken) return;
  const sp = clamp(Math.abs(c.v) * 0.75, 9, 26);
  c.air = { t: 0, s0: c.s, d0: c.d, dist: Math.max(16, sp * ROLL_DUR) + (T.s1 - c.s), d1: clamp(T.d + T.hw + 1.6, -1, trackAt(c.s, _hz).hw - 1.2), dir: Math.random() < 0.5 ? 1 : -1, sp };
  AUDIO.hit(1); GAME.shake = 1; toast('撞上防撞緩衝車！');
}
// 壓到油漬：像陀螺般打轉前進，速度降到 10–20 km/h
function startSpin(c) {
  const t = trackAt(c.s, _hz);
  c.spinO = { t: 0, yaw0: c.yaw, total: angDiff(t.th, c.yaw) + (Math.random() < 0.5 ? 1 : -1) * 3 * TAU, v0: Math.abs(c.v), v1: 2.8 + Math.random() * 2.8, d: c.d };
  c.oilCD = SPIN_DUR + 2; toast('壓到油漬，車子打轉了！');
}
function stepSpecial(c, dt) {
  if (c.oilCD > 0) c.oilCD -= dt;
  if (c.air) {
    const A = c.air; A.t += dt; const f = Math.min(1, A.t / ROLL_DUR), e = f * f * (3 - 2 * f);
    const s = Math.min(A.s0 + A.dist * f, TR.len - 3), d = lerp(A.d0, A.d1, e), t = trackAt(s, _hz);
    const roll = A.dir * 2 * TAU * e, h = 5.2 * 4 * f * (1 - f) + 0.7;
    c.yaw = t.th; c.pitch = Math.sin(f * PI) * 0.12; c.roll = roll; c.heave = 0;
    carMatrix(Object.assign(_hz2, c, { x: 0, y: 0, z: 0 }), _cm);
    c.x = t.x + t.nx * d - _cm[4] * 0.7; c.z = t.z + t.nz * d - _cm[6] * 0.7; c.y = t.y + h - _cm[5] * 0.7;
    c.s = s; c.d = d; c.v = A.sp; c.vx = t.tx * A.sp; c.vz = t.tz * A.sp; c.spin += A.sp / RW * dt; c.slip = 0; c.brakeLight = 0; c.steer = 0;
    if (f >= 1) {
      c.air = null; c.roll = 0; const v = 2.8 + Math.random() * 2.8; c.v = v; c.vx = t.tx * v; c.vz = t.tz * v; c.r = 0; c.x = t.x + t.nx * d; c.z = t.z + t.nz * d; c.y = t.y;
      GAME.shake = 0.9; AUDIO.hit(0.9);
      for (let i = 0; i < 16; i++) fxSpawn(c.x + (Math.random() - 0.5) * 3, c.y + 0.2, c.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.5 + Math.random(), (Math.random() - 0.5) * 3, 1 + Math.random() * 0.6, 0.4, 1.8, -1);
      toast('落地！請重新加速');
    }
    return true;
  }
  if (c.spinO) {
    const A = c.spinO; A.t += dt; const f = Math.min(1, A.t / SPIN_DUR), e = 1 - (1 - f) * (1 - f);
    const v = lerp(A.v0, A.v1, e), t = trackAt(c.s, _hz);
    c.s = Math.min(c.s + v * dt, TR.len - 3); trackAt(c.s, t);
    const lim = t.hw + BARRIER_OFF - 1.1; c.d = clamp(c.d, -lim, lim);
    c.x = t.x + t.nx * c.d; c.z = t.z + t.nz * c.d; c.yaw = A.yaw0 + A.total * e;
    c.v = v; c.vx = t.tx * v; c.vz = t.tz * v; c.r = 0; c.spin += v / RW * dt; c.slip = 1; c.brakeLight = 1; c.steer = 0; c.latG = 0; c.ax = 0;
    settleCar(c, dt, t);
    if (f >= 1) { c.spinO = null; c.yaw = t.th + angDiff(c.yaw, t.th); c.vx = Math.sin(c.yaw) * A.v1; c.vz = Math.cos(c.yaw) * A.v1; c.v = A.v1; c.slip = 0; c.brakeLight = 0; toast('穩住了，請重新加速'); }
    return true;
  }
  return false;
}
const _hz2 = {};
// 對手避開事件路段
function aiAvoid(c, want, t) {
  for (const b of HAZ.bands) {
    if (c.s < b.s0 - 55 || c.s > b.s1) continue;
    if (want > b.dlo - 1.0 && want < b.dhi + 1.0) {
      const up = b.dhi + 1.05, dn = b.dlo - 1.05, lim = t.hw - 1.25;
      want = (up <= lim && (dn < -lim || Math.abs(up - c.d) < Math.abs(dn - c.d))) ? up : dn;
    }
  }
  return want;
}
// 起霧強度（依玩家位置）
function fogAt(s) { const f = ROUTE.fog; if (!f) return 0; return smooth(f[0] - 40, f[0] + 140, s) * (1 - smooth(f[1] - 140, f[1] + 40, s)); }
