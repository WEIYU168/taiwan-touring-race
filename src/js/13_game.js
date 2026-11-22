// ───────────────────────── 賽事：物理、對手、鏡頭、HUD、音效 ─────────────────────────
const GAME = { state: 'boot', mode: 'race', diff: 1, tod: 'day', livery: 0, cars: [], player: null, time: 0, count: 0, camMode: 0, camYaw: 0, camPitch: 0, camDist: 1, drag: false, best: null, hud: true, paused: false, canopy: 0, muted: false };
const INP = { steer: 0, thr: 0, brk: 0, hb: 0, keys: {}, touch: { l: 0, r: 0, g: 0, b: 0 }, digital: true };
const GEARS = [3.15, 2.2, 1.66, 1.32, 1.09, 0.92], FINAL = 4.05, RW = 0.33;
// rate 轉向速度、dmax 最大角、exp 類比輸入曲線（>1 中心較鈍）、px 觸控拖曳距離、kb 鍵盤輸入爬升速度（每秒）
const STEER = [{ name: '靈敏', rate: 1.3, dmax: 1.04, exp: 1.1, px: 58, kb: 5.0 }, { name: '中等', rate: 0.9, dmax: 0.95, exp: 1.35, px: 78, kb: 3.8 }, { name: '穩重', rate: 0.6, dmax: 0.84, exp: 1.65, px: 105, kb: 2.7 }];
const DIFFS = [{ name: '輕鬆', k: 0.86 }, { name: '標準', k: 0.94 }, { name: '職業', k: 1.0 }];
const RIVALS = ['林', '陳', '黃', '張', '李', '王', '吳'];
const $ = id => document.getElementById(id);

function mkCar(i, ai) { return { idx: i, ai, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, heave: 0, s: 0, d: 0, v: 0, vx: 0, vz: 0, r: 0, steer: 0, spin: 0, liv: LIVERIES[i % 8], skill: 1, off: 0, offT: 0, gear: 1, rpm: 1000, brakeLight: 0, finished: false, ftime: 0, slip: 0, ax: 0, ay: 0, vcap: 99, react: 0, name: '', dmg: 0, dents: null, hitCD: 0, broken: false, brokenT: 0 }; }
function placeOnTrack(c, s, d) {
  const t = trackAt(s, {}); c.s = s; c.d = d; c.x = t.x + t.nx * d; c.z = t.z + t.nz * d; c.y = t.y - t.bank * d; c.yaw = t.th; c.v = 0; c.vx = 0; c.vz = 0; c.r = 0; c.pitch = Math.atan(t.grade); c.roll = 0; c.steer = 0; c.gear = 1; c.finished = false;
}
function startSession(mode) {
  const online = mode === 'online'; if (online) mode = 'race'; GAME.online = online;
  GAME.mode = mode; GAME.cars = []; GAME.time = 0;
  const n = online ? NET.players.length : mode === 'race' ? 8 : 1;
  const order = []; for (let i = 0; i < 8; i++) if (i !== GAME.livery) order.push(i);
  let ri = 0;
  for (let g = 0; g < n; g++) {
    const pl = online ? NET.players[g] : null;
    const isP = online ? pl.id === NET.id : mode !== 'race' ? true : g === n - 3; // 單機：玩家第 6 位起跑
    const c = mkCar(g, online ? false : !isP);
    c.model = isP ? (GAME.carModel || 0) : (g * 5 + 1) % CAR_MODELS.length;
    if (!isP) { const ph = CAR_MODELS[c.model].phys; c.skill *= 1 + (ph.pow - 1) * 0.12 + (ph.grip - 1) * 0.3; }
    c.liv = isP ? LIVERIES[GAME.livery] : LIVERIES[order[ri % 7]]; c.name = isP ? '你' : RIVALS[ri % 7]; if (!isP) ri++;
    const dk = DIFFS[GAME.diff].k; c.skill = dk * (1.0 - g * 0.012) * (0.985 + hash2(g, 3, 9) * 0.03); c.off = (g % 2 ? -1 : 1) * 0.6; c.react = 0.15 + hash2(g, 5, 2) * 0.35;
    placeOnTrack(c, mode === 'race' ? S_START - 7 - g * 7.5 + 1.2 : S_START - 4, mode === 'race' ? (g % 2 ? -2.1 : 2.1) : 0);
    if (online) { c.remote = !isP; c.netId = pl.id; c.fresh = true; c.liv = LIVERIES[pl.liv % 8]; c.name = pl.name; c.model = (pl.car | 0) % CAR_MODELS.length; }
    if (isP) GAME.player = c;
    GAME.cars.push(c);
  }
  const p = GAME.player;
  if (mode === 'cruise') { p.ai = true; p.skill = 0.6; p.vcap = 24; p.off = -2.0; GAME.state = 'racing'; GAME.camMode = 1; }
  else if (mode === 'attract') { p.ai = true; p.skill = 0.62; p.vcap = 22; placeOnTrack(p, ROUTE.attractS, -1.5); GAME.state = 'menu'; GAME.camMode = 4; }
  else { GAME.state = 'count'; GAME.count = 4.2; GAME.camMode = 0; }
  GAME.show = null; document.body.classList.remove('showroom'); if (typeof hideCarCard === 'function') hideCarCard(true);
  GAME.camYaw = 0; GAME.camPitch = 0; GAME.camDist = 1; GAME.camS = null; GAME.lastBeep = 9; GAME.split = 0; if (typeof fxClear === 'function') fxClear(); if (typeof resetHazards === 'function') resetHazards();
  REN.forceFar = true;
}

// ── 玩家車輛動力學（單軌模型 + 魔術公式輪胎）
const pac = a => Math.sin(1.55 * Math.atan(9.2 * a));
const _pp = {}, _pt = {};
function engineTorque(rpm) { const x = rpm / 7400; return 430 * (0.55 + 1.5 * x - 1.12 * x * x) * (rpm > 7350 ? 0.2 : 1); }
function stepPlayer(c, dt) {
  if (stepSpecial(c, dt)) { stepHazards(c, dt); return; }
  const m = 1250, a = 1.25, b = 1.45, L = 2.7, h = 0.48, Iz = 1950, g = 9.81;
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  let u = c.vx * sy + c.vz * cy, v = c.vx * cy - c.vz * sy, r = c.r;
  trackProject(c.x, c.z, c.s, _pp); const tr = trackAt(_pp.s, _pt);
  const offroad = Math.abs(_pp.d) > tr.hw - 0.2, surf = offroad ? 0.62 : 1;
  const sp = Math.abs(u), racing = GAME.state === 'racing' && !c.finished;
  let thr = racing ? INP.thr : 0, brk = racing ? INP.brk : (GAME.state === 'count' ? 1 : 0.6), hb = racing ? INP.hb : 0;
  if (c.broken) { thr = 0; hb = 0; brk = sp > 1 ? 0.3 : 1; }
  // 轉向
  const SK = STEER[GAME.steerSens === undefined ? 1 : GAME.steerSens], ph = CAR_MODELS[c.model || 0].phys;
  // 隨車速遞減的轉向角：高速時的最低轉角縮小，小幅修正不再造成大幅甩動
  const dmax = Math.min(0.55, Math.atan(L * 12.5 / (u * u + 1)) + 0.075 * (1 - 0.4 * smooth(12, 45, sp))) * SK.dmax;
  const tgt = (c.broken ? 0 : INP.steer) * dmax + (c.dmg >= 9 && !c.broken ? 0.012 : 0), rate = ((INP.digital ? 1.5 : 4) * dmax + 0.22 * (1 - 0.5 * smooth(10, 40, sp))) * SK.rate;
  const back = Math.sign(tgt) !== Math.sign(c.steer) || Math.abs(tgt) < Math.abs(c.steer) ? 1.6 : 1;
  c.steer += clamp(tgt - c.steer, -rate * dt * back, rate * dt * back);
  const dl = c.steer;
  // 變速箱
  let reverse = false;
  if (brk > 0.1 && thr < 0.1 && u < 1.2 && racing && !c.broken) { reverse = true; }
  const ratio = GEARS[c.gear - 1] * FINAL;
  let rpm = Math.max(1100, sp / RW * ratio * 60 / TAU);
  if (!reverse) { if (rpm > 7150 && c.gear < 6) { c.gear++; c.shiftT = 0.12; } else if (c.gear > 1 && sp / RW * GEARS[c.gear - 2] * FINAL * 60 / TAU < 5600) c.gear--; }
  c.shiftT = Math.max(0, (c.shiftT || 0) - dt);
  c.rpm = lerp(c.rpm, rpm + thr * 250 * (sp < 2 ? 8 : 0), 0.3);
  let Fd = (c.shiftT > 0 ? 0 : thr) * engineTorque(rpm) * ratio * 0.9 / RW;
  Fd *= ph.pow * (ph.ev ? 1 + 0.35 * (1 - smooth(0, 28, sp)) : 1);
  if (c.dmg >= 9) Fd *= u > 19.5 ? 0.12 : 0.45;  // 第 9 次撞擊後：動力大幅下降
  let Fb = 0;
  if (reverse) { Fd = u > -8 ? -4200 * brk : 0; } else Fb = brk * 1.32 * m * g;
  // 荷重
  const aero = 0.42 * u * u;
  const Fzf = Math.max(500, m * g * b / L - m * c.ax * h / L + aero * 0.45), Fzr = Math.max(500, m * g * a / L + m * c.ax * h / L + aero * 0.55);
  const mu = 1.34 * surf * ph.grip;
  const den = Math.max(sp, 4);
  const af = Math.atan2(v + a * r, den) - dl * (u >= 0 ? 1 : -1), ar = Math.atan2(v - b * r, den);
  let Fyf = -mu * Fzf * pac(af), Fyr = -mu * (GAME.aid ? 1.13 : 1.05) * Fzr * pac(ar) * (hb > 0.5 ? 0.35 : 1);
  const sgnU = u > 0.3 ? 1 : u < -0.3 ? -1 : 0;
  let Fxf = -Fb * 0.62 * sgnU, Fxr = Fd - Fb * 0.38 * sgnU - (hb > 0.5 ? 0.5 * mu * Fzr * sgnU : 0);
  // 摩擦圓 + 循跡控制
  const lr = mu * Fzr, lf = mu * Fzf;
  let spinning = 0;
  const tl = ph.trac || 0.8; if (Math.abs(Fxr) > lr * tl) { spinning = Math.min(1, Math.abs(Fxr) / lr - tl); Fxr = Math.sign(Fxr) * lr * tl; }
  if (Math.abs(Fxf) > lf * 0.97) Fxf = Math.sign(Fxf) * lf * 0.97;
  Fyr *= Math.sqrt(Math.max(0.06, 1 - (Fxr / lr) ** 2)); Fyf *= Math.sqrt(Math.max(0.06, 1 - (Fxf / lf) ** 2));
  const rel = angDiff(c.yaw, tr.th), grade = tr.grade * Math.cos(rel);
  const drag = 0.46 * ph.drag * u * sp + (offroad ? 900 + 60 * sp : 160) * sgnU + m * g * grade;
  const cd = Math.cos(dl), sd = Math.sin(dl);
  const ax = (Fxr + Fxf * cd - Fyf * sd - drag) / m, ay = (Fyr + Fyf * cd + Fxf * sd) / m;
  let Mz = a * (Fyf * cd + Fxf * sd) - b * Fyr;
  // 穩定輔助（溫和的偏航阻尼）
  const rref = u * dl / (L * (1 + 0.0022 * u * u));
  Mz += -(r - rref) * Iz * (GAME.aid ? 2.1 : 0.7) * ph.stab * smooth(4, 14, sp);
  u += (ax + v * r) * dt; v += (ay - u * r) * dt; r += Mz / Iz * dt;
  // 低速回歸運動學模型
  const kk = 1 - smooth(1.5, 7, sp);
  if (kk > 0 || u < 0) { const k2 = u < 0 ? 1 : kk, rk = u * Math.tan(dl) / L; r += (rk - r) * Math.min(1, k2 * dt * 12); v += (rk * b * 0.5 - v) * Math.min(1, k2 * dt * 12); }
  if (sp < 0.4 && thr < 0.05 && !reverse) { u *= 0.9; v *= 0.8; r *= 0.8; }
  c.ax = lerp(c.ax, ax, 0.2); c.ay = lerp(c.ay, ay + u * r * 0, 0.2);
  c.latG = u * r;
  c.yaw += r * dt; c.r = r;
  const sy2 = Math.sin(c.yaw), cy2 = Math.cos(c.yaw);
  c.vx = u * sy2 + v * cy2; c.vz = u * cy2 - v * sy2;
  c.x += c.vx * dt; c.z += c.vz * dt;
  // 護欄
  trackProject(c.x, c.z, _pp.s, _pp); trackAt(_pp.s, _pt);
  const rel2 = angDiff(c.yaw, _pt.th), lim = _pt.hw + BARRIER_OFF - 0.92 - 0.75 * Math.abs(Math.sin(rel2));
  if (Math.abs(_pp.d) > lim) {
    const sg = Math.sign(_pp.d), over = Math.abs(_pp.d) - lim; c.x -= _pt.nx * sg * over; c.z -= _pt.nz * sg * over;
    const vn = (c.vx * _pt.nx + c.vz * _pt.nz) * sg;
    if (vn > 0) { const vt = c.vx * _pt.tx + c.vz * _pt.tz; const nvn = -vn * 0.28, nvt = vt * (1 - Math.min(GAME.aid ? 0.12 : 0.22, vn * (GAME.aid ? 0.018 : 0.03)));
      c.vx = _pt.tx * nvt + _pt.nx * sg * nvn; c.vz = _pt.tz * nvt + _pt.nz * sg * nvn; c.r += clamp(-rel2 * 2.2, -1.6, 1.6) * Math.min(1, vn * 0.25);
      if (vn > 1.2) AUDIO.hit(Math.min(1, vn / 9)); GAME.shake = Math.min(1, vn / 8);
      if (vn > 2.2) { registerHit(c, _pt.nx * sg, _pt.nz * sg, vn); if (c === GAME.player && !c.ai && GAME.state === 'racing' && !c.broken) steerHint(); } }
    _pp.d = sg * lim;
  }
  if (_pp.s < 3 && c.vx * _pt.tx + c.vz * _pt.tz < 0) { c.vx = 0; c.vz = 0; }
  if (_pp.s > S_END - 8) { c.vx *= 0.9; c.vz *= 0.9; }
  c.s = _pp.s; c.d = _pp.d; c.v = u; c.offroad = offroad;
  c.slip = Math.max(Math.abs(ar) > 0.11 ? (Math.abs(ar) - 0.11) * 5 : 0, spinning * 2, Math.abs(af) > 0.14 ? (Math.abs(af) - 0.14) * 3 : 0, (brk > 0.9 && sp > 20) ? 0.15 : 0) * smooth(4, 12, sp);
  c.brakeLight = c.broken ? 0 : brk > 0.05 && !reverse ? 1 : 0;
  settleCar(c, dt, _pt);
  stepHazards(c, dt);
}
function settleCar(c, dt, t) {
  const ad = Math.abs(c.d), y = t.y - t.bank * clamp(c.d, -t.hw, t.hw) - Math.max(0, ad - t.hw) * 0.05;
  c.y = y;
  const rel = angDiff(c.yaw, t.th);
  const tp = Math.atan(t.grade) * Math.cos(rel) - clamp(c.ax, -14, 9) * 0.0032, tro = -Math.atan(t.bank) * Math.cos(rel) + clamp(c.latG || 0, -16, 16) * 0.0034;
  c.pitch += (tp - c.pitch) * Math.min(1, dt * 9); c.roll += (tro - c.roll) * Math.min(1, dt * 8);
  c.spin += c.v / RW * dt;
  c.heave = (c.offroad ? (hash2(c.s * 3 | 0, 1, 1) - 0.5) * 0.03 : 0) + Math.sin(c.s * 0.9) * 0.002;
}
// ── 對手／自動駕駛：沿賽車線的運動學模型
const _at = {};
function stepAI(c, dt, cars) {
  const t = trackAt(c.s, _at);
  let vt = Math.min(t.rv * c.skill, c.vcap);
  if (GAME.state === 'count' || c.finished) vt = 0;
  if (GAME.state === 'racing' && GAME.time < c.react && !c.finished && GAME.mode === 'race') vt = 0;
  // 與玩家的橡皮筋
  const p = GAME.player;
  if (p && p !== c && GAME.mode === 'race' && !c.finished) { const gap = c.s - p.s; vt *= 1 - clamp(gap / 900, -0.05, 0.07) * (GAME.diff < 2 ? 1 : 0.4); }
  // 避讓
  let want = t.rl + c.off * smooth(0, 1, 1 - Math.abs(t.k) * 40);
  let block = null;
  for (const o of cars) { if (o === c) continue; const gap = o.s - c.s; if (gap > 0.5 && gap < 9 + c.v * 0.55 && Math.abs(o.d - c.d) < 2.15) { if (!block || gap < block.s - c.s) block = o; } }
  if (block) {
    const room = t.hw - 1.3, left = block.d + 2.3, right = block.d - 2.3;
    const side = (left <= room && (right < -room || Math.abs(left - want) < Math.abs(right - want))) ? left : (right >= -room ? right : null);
    if (side !== null && c.v > block.v - 2) { want = side; c.offT = 1.2; c.offD = side; }
    const gap = block.s - c.s; if (gap < 6.5 + c.v * 0.12 && Math.abs(block.d - c.d) < 1.95) vt = Math.min(vt, Math.max(0, block.v - (6.5 - gap) * 1.2));
  } else if (c.offT > 0) { c.offT -= dt; want = c.offD; }
  for (const o of cars) { if (o === c) continue; if (Math.abs(o.s - c.s) < 5 && Math.abs(o.d - want) < 2.0) { want = c.d + (c.d > o.d ? 0.4 : -0.4); } }
  want = aiAvoid(c, want, t);
  want = clamp(want, -(t.hw - 1.25), t.hw - 1.25);
  const dv = vt - c.v;
  const acc = dv > 0 ? Math.min(7.4, 250000 / (1250 * Math.max(c.v, 6))) - 0.00037 * c.v * c.v - 9.81 * t.grade : -11.5;
  c.ax = lerp(c.ax, dv > 0.3 ? acc : dv < -0.3 ? acc : 0, 0.2);
  c.v = dv > 0 ? Math.min(vt, c.v + acc * dt) : Math.max(vt, c.v + acc * dt);
  c.brakeLight = dv < -1.5 ? 1 : 0;
  const d0 = c.d; c.d += clamp(want - c.d, -(1.2 + c.v * 0.06) * dt, (1.2 + c.v * 0.06) * dt) * 0.9;
  const ds = c.v * dt / Math.max(0.5, 1 - t.k * c.d); c.s = Math.min(c.s + ds, TR.len - 2);
  trackAt(c.s, t);
  c.x = t.x + t.nx * c.d; c.z = t.z + t.nz * c.d;
  const lat = (c.d - d0) / Math.max(ds, 0.01);
  const yawT = t.th + Math.atan(lat) + t.k * 1.2;
  c.yaw += angDiff(yawT, c.yaw) * Math.min(1, dt * 10);
  c.latG = c.v * c.v * t.k; c.vx = t.tx * c.v; c.vz = t.tz * c.v; c.steer = clamp(t.k * 2.7 * 1.6, -0.5, 0.5);
  c.gear = c.v < 18 ? 1 : c.v < 28 ? 2 : c.v < 38 ? 3 : c.v < 48 ? 4 : c.v < 58 ? 5 : 6;
  c.rpm = Math.max(1200, c.v / RW * GEARS[c.gear - 1] * FINAL * 60 / TAU); c.slip = 0; c.offroad = false;
  settleCar(c, dt, t);
}
function collideCars(cars) {
  const p = GAME.player; if (!p || p.ai) return;
  const t = trackAt(p.s, {});
  for (const o of cars) { if (o === p) continue; const dsv = o.s - p.s, dd = o.d - p.d; if (Math.abs(dsv) < 4.35 && Math.abs(dd) < 1.86) {
    const ox = 4.35 - Math.abs(dsv), oy = 1.86 - Math.abs(dd);
    if (oy < ox * 0.6) { const sg = Math.sign(dd) || 1; o.d += sg * oy * 0.5; p.x -= t.nx * sg * oy * 0.5; p.z -= t.nz * sg * oy * 0.5; const vn = (p.vx * t.nx + p.vz * t.nz) * sg; if (vn > 0) { p.vx -= t.nx * sg * vn * 0.8; p.vz -= t.nz * sg * vn * 0.8; if (vn > 1) AUDIO.hit(Math.min(0.7, vn / 8)); } } // 側面擦碰（並排、超車時）：只推開，不算撞擊
    else { const sg = Math.sign(dsv) || 1, rv = (p.v - o.v) * sg; if (rv > 0) { const e = rv * 0.55; o.v += sg * e; const pv = Math.hypot(p.vx, p.vz) || 1, k = Math.max(0, 1 - e / pv); p.vx *= k; p.vz *= k; if (rv > 1.5) { AUDIO.hit(Math.min(1, rv / 10)); GAME.shake = Math.min(1, rv / 10); }
      // 正面追撞前車、或被後車直接撞上：橫向重疊夠多才算「直接撞」；只擦到車角（超車切入）需很大速度差才算
      const direct = Math.abs(dd) < 1.2;
      if ((direct && rv > 4.5) || rv > 9) { registerHit(p, t.tx * sg, t.tz * sg, rv); registerHit(o, -t.tx * sg, -t.tz * sg, rv); } } o.s += sg * ox * 0.5; }
  } }
}

// ── 音效（Web Audio 合成）
const AUDIO = { ctx: null, on: false,
  init() { if (this.ctx) return; try { const C = window.AudioContext || window.webkitAudioContext; const x = this.ctx = new C(); const master = this.master = x.createGain(); master.gain.value = 0.5; const comp = x.createDynamicsCompressor(); master.connect(comp); comp.connect(x.destination);
      const mkN = () => { const b = x.createBuffer(1, x.sampleRate * 2, x.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = l * 0.98 + w * 0.02; d[i] = w * 0.5 + l * 6; } const s = x.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s; };
      this.eg = x.createGain(); this.eg.gain.value = 0; const sh = x.createWaveShaper(), cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const t = i / 128 - 1; cv[i] = Math.tanh(t * 2.6); } sh.curve = cv;
      this.ef = x.createBiquadFilter(); this.ef.type = 'lowpass'; this.ef.frequency.value = 900; this.ef.Q.value = 1.2;
      this.o = [['sawtooth', 1, 0.5], ['square', 0.5, 0.42], ['sawtooth', 1.5, 0.18], ['triangle', 2, 0.2]].map(([ty, mul, gn]) => { const o = x.createOscillator(); o.type = ty; const g = x.createGain(); g.gain.value = gn; o.connect(g); g.connect(sh); o.start(); return { o, mul }; });
      sh.connect(this.ef); this.ef.connect(this.eg); this.eg.connect(master);
      const n1 = mkN(); this.tf = x.createBiquadFilter(); this.tf.type = 'bandpass'; this.tf.frequency.value = 1300; this.tf.Q.value = 5; this.tg = x.createGain(); this.tg.gain.value = 0; n1.connect(this.tf); this.tf.connect(this.tg); this.tg.connect(master);
      const n2 = mkN(); this.wf = x.createBiquadFilter(); this.wf.type = 'lowpass'; this.wf.frequency.value = 500; this.wg = x.createGain(); this.wg.gain.value = 0; n2.connect(this.wf); this.wf.connect(this.wg); this.wg.connect(master);
      this.noise = mkN(); this.hg = x.createGain(); this.hg.gain.value = 0; const hf = x.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 700; this.noise.connect(hf); hf.connect(this.hg); this.hg.connect(master);
      this.on = true; } catch (e) { this.on = false; } },
  update(c, thr) { if (!this.on) return; const x = this.ctx, t = x.currentTime, f = c.rpm / 60 * 2;
    for (const o of this.o) o.o.frequency.setTargetAtTime(f * o.mul, t, 0.03);
    this.ef.frequency.setTargetAtTime(500 + c.rpm * 0.22 + thr * 2200, t, 0.05);
    const act = GAME.state === 'racing' || GAME.state === 'count' || GAME.state === 'finish';
    this.eg.gain.setTargetAtTime(act && !GAME.paused && !(c.broken && c.v < 1) ? (0.1 + thr * 0.16) * (CAR_MODELS[c.model || 0].phys.ev ? 0.3 : 1) : 0, t, 0.06);
    this.tg.gain.setTargetAtTime(act && !GAME.paused ? Math.min(0.3, c.slip * 0.35) * (c.offroad ? 0.2 : 1) : 0, t, 0.05); this.tf.frequency.setTargetAtTime(1100 + Math.abs(c.v) * 9, t, 0.1);
    this.wg.gain.setTargetAtTime(act && !GAME.paused ? Math.min(0.32, Math.abs(c.v) / 70 * 0.3 + (c.offroad ? 0.15 : 0)) : 0, t, 0.1); this.wf.frequency.setTargetAtTime(300 + Math.abs(c.v) * 22, t, 0.1);
    this.master.gain.setTargetAtTime(GAME.muted ? 0 : 0.5, t, 0.05); },
  hit(a) { if (!this.on) return; const t = this.ctx.currentTime; this.hg.gain.cancelScheduledValues(t); this.hg.gain.setValueAtTime(a * 0.9, t); this.hg.gain.exponentialRampToValueAtTime(0.001, t + 0.25); },
  beep(f, d) { if (!this.on) return; const x = this.ctx, o = x.createOscillator(), g = x.createGain(); o.frequency.value = f; o.type = 'square'; g.gain.value = 0.12; g.gain.exponentialRampToValueAtTime(0.001, x.currentTime + d); o.connect(g); g.connect(this.master); o.start(); o.stop(x.currentTime + d); }
};

// ── 輸入
function readInput(dt) {
  const k = INP.keys, tc = INP.touch;
  let st = (k.ArrowLeft || k.KeyA ? 1 : 0) - (k.ArrowRight || k.KeyD ? 1 : 0) + tc.l - tc.r;
  let th = (k.ArrowUp || k.KeyW) ? 1 : tc.g, bk = (k.ArrowDown || k.KeyS) ? 1 : tc.b, hb = k.Space ? 1 : 0; INP.digital = true;
  try { const gp = navigator.getGamepads && navigator.getGamepads()[0]; if (gp) { const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.08) { st = -ax; INP.digital = false; } const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0; if (rt > 0.05) th = rt; if (lt > 0.05) bk = lt; if (gp.buttons[0] && gp.buttons[0].pressed) hb = 1; } } catch (e) { }
  if (tc.active) { st = tc.sx; INP.digital = false; }
  const SKI = STEER[GAME.steerSens === undefined ? 1 : GAME.steerSens];
  if (!INP.digital) { const a = Math.abs(st), dz = 0.04; st = a < dz ? 0 : Math.sign(st) * Math.pow(Math.min(1, (a - dz) / (1 - dz)), SKI.exp); INP.ks = st; }
  else {
    // 鍵盤：輸入值漸進爬升（輕點＝小修正，長按＝打滿），高速時爬升更慢；放開或反打時快速回正
    const p = GAME.player, spd = p ? Math.abs(p.v) : 0, ks = INP.ks || 0;
    const rise = SKI.kb * (1 - 0.35 * smooth(12, 42, spd)), fall = 6.5;
    const towardZero = st === 0 || Math.sign(st) !== Math.sign(ks);
    INP.ks = ks + clamp(st - ks, -(towardZero ? fall : rise) * dt, (towardZero ? fall : rise) * dt);
    // 前段曲線較緩，輕點時轉角更小
    st = Math.sign(INP.ks) * Math.pow(Math.abs(INP.ks), 1.35);
  }
  if (GAME.autoThr && GAME.state === 'racing') th = bk > 0.05 ? 0 : 1;
  if (GAME.autoTest && GAME.player) { const p = GAME.player, la = trackAt(p.s + 9 + Math.abs(p.v) * 0.42, {}), ld = GAME.testLane !== undefined ? GAME.testLane : la.rl, tx = la.x + la.nx * ld - p.x, tz = la.z + la.nz * ld - p.z;
    const err = angDiff(Math.atan2(tx, tz), p.yaw); st = clamp(err * 3.2, -1, 1); INP.digital = false; const vt = trackAt(p.s + 4, {}).rv * GAME.autoTest; th = p.v < vt ? 1 : 0; bk = p.v > vt + 1.5 ? 1 : 0; }
  INP.steer = clamp(st, -1, 1); INP.thr = th; INP.brk = bk; INP.hb = hb;
}
function cycleCam() { GAME.camMode = (GAME.camMode + 1) % 5; GAME.camYaw = 0; GAME.camPitch = 0; toast(['追尾視角', '遠追視角', '引擎蓋視角', '車內視角', '環景空拍'][GAME.camMode]); }
function resetCar() { const p = GAME.player; if (!p || p.ai) return; if (p.broken) { toast('車輛已拋錨，無法復位'); return; } const s = p.s; placeOnTrack(p, s, 0); toast('已回到路面'); }
let toastT = 0; function toast(s, dur = 1.8) { const e = $('toast'); e.textContent = s; e.classList.add('on'); toastT = dur; }
// 撞到左右護欄時提醒玩家「輕點」轉向（避免太常跳出：前 3 次每次提醒，之後間隔 25 秒）
let steerHintN = 0, steerHintAt = -99;
function steerHint() {
  const now = performance.now() / 1000;
  if (steerHintN >= 3 && now - steerHintAt < 25) return;
  steerHintN++; steerHintAt = now;
  const cur = $('toast').textContent, pre = toastT > 0 && cur.startsWith('撞擊') ? cur + '　' : '';
  toast(pre + (INP.touch && INP.touch.active ? '提示：方向盤小幅輕推、分段修正，比一次推到底更不容易撞到護欄' : '提示：方向鍵「輕點」左右、分段修正，比長按更不容易撞到護欄'), 3.2);
}

// ── 鏡頭
const CS = { yaw: 0, x: 0, y: 0, z: 0, init: false, fov: 62 };
function updateGameCamera(dt) {
  const p = GAME.player; if (!p) return;
  const sp = Math.abs(p.v), mode = GAME.camMode;
  if (!GAME.drag && GAME.mode !== 'cruise' && mode !== 4 && GAME.state === 'racing' && !p.broken) { GAME.camYaw *= Math.exp(-dt * 2.5); GAME.camPitch *= Math.exp(-dt * 2.5); }
  if (mode === 4 && !GAME.drag) GAME.camYaw += dt * (GAME.state === 'menu' ? 0.07 : 0.12);
  const vyaw = sp > 3 && !p.ai ? Math.atan2(p.vx, p.vz) : p.yaw;
  const tyaw = (p.air || p.spinO) ? trackAt(p.s, _at).th : p.yaw + angDiff(vyaw, p.yaw) * 0.45;
  if (!CS.init) { CS.yaw = tyaw; CS.init = true; }
  CS.yaw += angDiff(tyaw, CS.yaw) * Math.min(1, dt * (mode === 4 ? 1.2 : 5.5));
  REN.cockpitOn = false; CAM.near = 0.4;
  let fov = 60 + smooth(20, 70, sp) * 12;
  const shake = (GAME.shake || 0); GAME.shake = shake * Math.exp(-dt * 6);
  const jx = (hash2(REN.frame, 1, 3) - 0.5) * (shake * 0.25 + sp * 0.00025), jy = (hash2(REN.frame, 2, 3) - 0.5) * (shake * 0.25 + sp * 0.0003);
  if (GAME.show) {
    const S = GAME.show, t = trackAt(S.s0 + SHOW_LEN, _at), orb = Math.max(0, S.t - SHOW_T) * 0.16 + (GAME.drag ? 0 : 0) + GAME.camYaw;
    const R = REN.w < REN.h ? 10 : 8.2, a = 0.42 + orb, ox = R * Math.cos(a), oz = R * Math.sin(a);
    const cx = p.x + t.nx * ox + t.tx * oz, cz = p.z + t.nz * ox + t.tz * oz;
    // 讓車子落在畫面左側、右側留給介紹卡（直式螢幕則置中偏上）
    let fx = p.x - cx, fz = p.z - cz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const k = REN.w < REN.h ? 0 : 1.35, ty = REN.w < REN.h ? -0.9 : 0;
    setCameraLook(cx, Math.max(groundY(cx, cz) + 1.0, p.y + 1.35), cz, p.x - fz * k, p.y + 0.6 + ty, p.z + fx * k); fov = 44;
  } else if (mode <= 1 || mode === 4) {
    const dist = (mode === 0 ? 5.6 : mode === 1 ? 8.5 : 13) * GAME.camDist, hh = mode === 0 ? 1.75 : mode === 1 ? 2.6 : 4.2;
    const yaw = CS.yaw + GAME.camYaw + PI, pit = clamp(GAME.camPitch + (mode === 4 ? 0.12 : 0), -0.25, 1.2);
    let cx = p.x + Math.sin(yaw) * dist * Math.cos(pit), cz = p.z + Math.cos(yaw) * dist * Math.cos(pit), cyy = p.y + hh + Math.sin(pit) * dist + p.pitch * -dist * 0.5;
    const gy = groundY(cx, cz) + 0.45; if (cyy < gy) cyy = gy;
    const la = mode === 4 ? 0 : 6;
    if (mode === 4 && p.broken) {
      driverRoot(p, _t1); const fx = (_t1[12] + p.x) / 2, fz = (_t1[14] + p.z) / 2, base = Math.atan2(_t1[12] - p.x, _t1[14] - p.z);
      if (!GAME.drag) GAME.camYaw = 0.6 * Math.sin((p.brokenT || 0) * 0.2);
      const by = base + 0.55 + GAME.camYaw, bd = 7.2 * GAME.camDist, bx = fx + Math.sin(by) * bd, bz = fz + Math.cos(by) * bd;
      setCameraLook(bx, Math.max(groundY(bx, bz) + 1.3, p.y + 1.8 + GAME.camPitch * 5), bz, fx, p.y + 0.85, fz); fov = 50;
    } else
    setCameraLook(cx + jx, cyy + jy, cz, p.x + Math.sin(p.yaw) * la * Math.cos(GAME.camYaw), p.y + 1.05 + Math.sin(p.pitch) * la, p.z + Math.cos(p.yaw) * la * Math.cos(GAME.camYaw), p.air ? 0 : -p.roll * 0.15);
    if (mode === 4 && !p.broken) fov = 50;
  } else {
    carMatrix(p, _cm); const o = [0, 0, 0], e = mode === 2 ? [0, 1.12, 1.18] : [0.36, 1.2, -0.08];
    M4.tp(_cm, e[0], e[1], e[2], o);
    const yaw = GAME.camYaw + (mode === 3 ? clamp(-p.steer * 0.5, -0.3, 0.3) : 0), pit = -GAME.camPitch * 0.8 - 0.03;
    const lx = Math.sin(yaw) * Math.cos(pit), ly = Math.sin(pit), lz = Math.cos(yaw) * Math.cos(pit), d = [0, 0, 0];
    M4.td(_cm, lx, ly, lz, d);
    setCameraLook(o[0] + jx * 0.3, o[1] + jy * 0.3, o[2], o[0] + d[0] * 10, o[1] + d[1] * 10, o[2] + d[2] * 10, -p.roll * 0.9);
    if (mode === 2) CAM.near = 0.12;
    if (mode === 3) { REN.cockpitOn = true; CAM.near = 0.1; fov = 68 + smooth(20, 70, sp) * 8; }
  }
  CS.fov += (fov - CS.fov) * Math.min(1, dt * 4); CAM.fov = CS.fov * DEG * (REN.w < REN.h ? 1.34 : 1);
  REN.focus = [p.x, p.y, p.z];
  REN.motion = GAME.paused ? 0 : smooth(22, 75, sp) * (mode === 4 ? 0.3 : 1) * (REN.q === QUALITY.low ? 0 : 1);
  const zn = zoneOf(p.s); const tgt = sat(zn.w[0] * 0.9 + (zn.id === 'tunnel' ? 0.75 : 0) + zn.w[6] * 0.5);
  GAME.canopy += (tgt - GAME.canopy) * Math.min(1, dt * 1.5); REN.canopy = GAME.canopy;
  REN.lightsOn = SKY.key === 'day' ? 0 : 0.65;
  REN.fogBoost = fogAt(CS.fogS = p.s);
}
function drawCars(phase) {
  if (phase !== 0) return;
  const P = useProg(PROGS.car); gl.disable(gl.CULL_FACE);
  for (const c of GAME.cars) { if (c.broken && c.brokenT > 1.5 && Math.abs(c.v) < 0.6) drawDriver(c, P, false); if (c === GAME.player && REN.cockpitOn) continue; if (!sphereInFrustum(CAM.planes, c.x, c.y + 0.7, c.z, 3)) continue; drawCar(c, P, false, false); }
  gl.enable(gl.CULL_FACE);
}
function drawCarsShadow(ci, C) { if (ci) return; const P = useProg(PROGS.sh_car); gl.disable(gl.CULL_FACE); for (const c of GAME.cars) { if (Math.hypot(c.x - C[0], c.z - C[2]) > C[3] + 30) continue; drawCar(c, P, true, false); if (c.broken && c.brokenT > 1.5 && Math.abs(c.v) < 0.6) drawDriver(c, P, true); } gl.enable(gl.CULL_FACE); }
function drawCockpit() { const P = useProg(PROGS.car); gl.disable(gl.CULL_FACE); drawCar(GAME.player, P, false, true); gl.enable(gl.CULL_FACE); }

// ── HUD
const HUDC = {};
function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
function setTxt(id, v) { if (HUDC[id] !== v) { HUDC[id] = v; $(id).textContent = v; } }
function buildMinimap() {
  const cv = $('mini'), W = cv.width, H = cv.height, m = 10; const sx = (W - 2 * m) / (TR.maxX - TR.minX), sz = (H - 2 * m) / (TR.maxZ - TR.minZ), sc = Math.min(sx, sz);
  GAME.mm = { sc, ox: W / 2 - (TR.minX + TR.maxX) / 2 * sc, oz: H / 2 - (TR.minZ + TR.maxZ) / 2 * sc };
  const off = mkCanvas(W, H), x = off.getContext('2d'); x.lineJoin = 'round'; x.lineCap = 'round';
  const path = () => { x.beginPath(); for (let i = 0; i < TR.n; i += 4) { const px = TR.x[i] * sc + GAME.mm.ox, pz = TR.z[i] * sc + GAME.mm.oz; i ? x.lineTo(px, pz) : x.moveTo(px, pz); } };
  path(); x.strokeStyle = 'rgba(8,12,10,0.75)'; x.lineWidth = 6; x.stroke(); path(); x.strokeStyle = '#f2f1ea'; x.lineWidth = 2.2; x.stroke();
  const dot = (s, col, r) => { const t = trackAt(s, {}); x.fillStyle = '#101312'; x.beginPath(); x.arc(t.x * sc + GAME.mm.ox, t.z * sc + GAME.mm.oz, r + 1.5, 0, TAU); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(t.x * sc + GAME.mm.ox, t.z * sc + GAME.mm.oz, r, 0, TAU); x.fill(); };
  for (const h of HAZ.hearts) dot(h.s, '#ff4f7a', 3.2); if (HAZ.truck) { dot(HAZ.truck.s, '#f08c1e', 3); dot(HAZ.tanker.s, '#f08c1e', 3); }
  x.fillStyle = '#f6c40e'; for (const c of SECTIONS) { const i = c.s0 / DS | 0; x.fillRect(TR.x[i] * sc + GAME.mm.ox - 4, TR.z[i] * sc + GAME.mm.oz - 1, 8, 2); }
  GAME.mmBase = off;
}
function updateHUD(dt) {
  const p = GAME.player; if (!p) return;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
  const hudOn = GAME.hud && (GAME.state === 'racing' || GAME.state === 'count' || GAME.state === 'finish');
  document.body.classList.toggle('hud-on', hudOn); document.body.classList.toggle('broken', !!p.broken);
  if (!hudOn) return;
  setTxt('spd', String(Math.round(Math.abs(p.v) * 3.6)));
  setTxt('gear', p.v < -0.5 ? 'R' : String(p.gear));
  const rp = sat((p.rpm - 1000) / 6400), n = 18, lit = Math.round(rp * n);
  if (HUDC.rpm !== lit) { HUDC.rpm = lit; const ch = $('rpm').children; for (let i = 0; i < n; i++) ch[i].className = i < lit ? (i > 14 ? 'on r' : i > 11 ? 'on y' : 'on') : ''; }
  const sec = sectionAt(p.s), S = SECTIONS[sec];
  setTxt('secName', S.name); setTxt('secSub', S.sub); setTxt('kpost', realK(Math.min(p.s, S_FINISH)).toFixed(1) + 'K'); setTxt('alt', '海拔 ' + Math.round(realAlt(p.s)) + ' m');
  setTxt('time', fmtTime(GAME.time));
  { const rem = Math.max(0, S_FINISH - p.s); setTxt('remain', rem >= 1000 ? (rem / 1000).toFixed(2) + ' km' : Math.round(rem) + ' m'); }
  { const k = p.dmg || 0; if (HUDC.dmg !== k + (p.broken ? 100 : 0)) { HUDC.dmg = k + (p.broken ? 100 : 0); const ch = $('dmgBar').children; for (let i = 0; i < 10; i++) ch[i].className = i < k ? (i >= 8 ? 'r' : i >= 5 ? 'o' : 'y') : ''; $('dmgN').textContent = p.broken ? '拋錨' : k >= 9 ? '動力下降' : k + '／10'; $('dmg').classList.toggle('bad', k >= 9); } }
  if (GAME.mode === 'race') { let pos = 1; for (const c of GAME.cars) if (c !== p && (c.finished ? (!p.finished || c.ftime < p.ftime) : (!p.finished && c.s > p.s))) pos++; setTxt('pos', String(pos)); setTxt('posN', '/ ' + GAME.cars.length); GAME.pos = pos; }
  else { setTxt('pos', GAME.mode === 'cruise' ? '巡' : '計'); setTxt('posN', GAME.mode === 'cruise' ? '環景巡航' : '單車計時'); }
  $('prog').style.width = (sat((p.s - S_START) / (S_FINISH - S_START)) * 100).toFixed(1) + '%';
  if (REN.frame % 3) return;
  const cv = $('mini'), x = cv.getContext('2d'), mm = GAME.mm; x.clearRect(0, 0, cv.width, cv.height); x.drawImage(GAME.mmBase, 0, 0);
  for (const c of GAME.cars) { if (c === p) continue; x.fillStyle = '#101312'; x.beginPath(); x.arc(c.x * mm.sc + mm.ox, c.z * mm.sc + mm.oz, 3.4, 0, TAU); x.fill(); x.fillStyle = '#f2f1ea'; x.beginPath(); x.arc(c.x * mm.sc + mm.ox, c.z * mm.sc + mm.oz, 2.2, 0, TAU); x.fill(); }
  x.fillStyle = '#101312'; x.beginPath(); x.arc(p.x * mm.sc + mm.ox, p.z * mm.sc + mm.oz, 5.6, 0, TAU); x.fill(); x.fillStyle = '#f6c40e'; x.beginPath(); x.arc(p.x * mm.sc + mm.ox, p.z * mm.sc + mm.oz, 4, 0, TAU); x.fill();
  if (!p.ai) { const la = trackAt(p.s + 6 + p.v * 1.15, _at).rv; $('brk').classList.toggle('on', GAME.aid && GAME.state === 'racing' && p.v > la * 1.1 + 3.5); } else $('brk').classList.remove('on');
  const wrong = !p.ai && Math.abs(angDiff(p.yaw, trackAt(p.s, _at).th)) > 2 && p.v > 4; $('wrong').classList.toggle('on', wrong);
}

// ── 主迴圈
function stepGame(dt) {
  if (GAME.paused) return;
  const p = GAME.player; if (!p) return;
  readInput(dt);
  if (GAME.state === 'count') {
    GAME.count -= dt; const n = Math.ceil(GAME.count - 0.2);
    if (n !== GAME.lastBeep && n <= 3 && n >= 1) { GAME.lastBeep = n; AUDIO.beep(440, 0.18); const L = $('lights').children; for (let i = 0; i < 3; i++) L[i].className = i < 4 - n ? 'on' : ''; }
    $('lights').classList.add('on');
    if (GAME.count <= 0.2) { GAME.state = 'racing'; GAME.time = 0; AUDIO.beep(880, 0.5); const L = $('lights').children; for (let i = 0; i < 3; i++) L[i].className = 'go'; setTimeout(() => $('lights').classList.remove('on'), 900); }
  }
  const sub = Math.max(2, Math.ceil(dt / 0.0085)), h = dt / sub;
  for (let k = 0; k < sub; k++) {
    for (const c of GAME.cars) { if (c === p && GAME.show) stepShow(c, h); else if (c.remote) stepRemote(c, h); else if (c.ai) stepAI(c, h, GAME.cars); else stepPlayer(c, h); }
    collideCars(GAME.cars);
  }
  if (GAME.state === 'racing') {
    GAME.time += dt;
    if (!p.ai && !p.finished && !p.broken) { const wrongWay = Math.abs(angDiff(p.yaw, trackAt(p.s, _at).th)) > 2.2; const stuck = Math.abs(p.v) < 1.2 && INP.thr > 0.5 && GAME.time > 3; GAME.stuckT = (stuck || wrongWay) ? (GAME.stuckT || 0) + dt : 0; if (GAME.stuckT > (wrongWay ? 4 : 2.2)) { GAME.stuckT = 0; resetCar(); } }
    for (const c of GAME.cars) if (!c.finished && !c.remote && c.s >= S_FINISH) { c.finished = true; c.ftime = GAME.time; if (c === p && GAME.mode !== 'cruise') finishRace(); if (c === p && GAME.mode === 'cruise') { toast('抵達松柏嶺受天宮'); setTimeout(() => { if (GAME.mode === 'cruise') showMenu(); }, 4000); } }
    if (GAME.mode === 'attract' && p.s > S_FINISH - 400) placeOnTrack(p, 300, -1.5);
  }
  if (GAME.state === 'menu' && p.s > S_FINISH - 400) placeOnTrack(p, 300, -1.5);
  stepFX(dt); stepBreakdown(p, dt);
  netTick(dt);
  AUDIO.update(p, p.ai ? 0.3 : p.broken ? 0 : INP.thr);
}
function finishRace() {
  GAME.state = 'finish'; const p = GAME.player; updateHUD(0);
  const key = 'best_' + ROUTE.key + '_' + GAME.mode; let best = null; try { best = parseFloat(localStorage.getItem(key)); } catch (e) { }
  const nb = !(best > 0) || p.ftime < best; if (nb) { try { localStorage.setItem(key, String(p.ftime)); } catch (e) { } }
  $('resPos').textContent = GAME.mode === 'race' ? '第 ' + GAME.pos + ' 名' : '完成計時'; $('resTime').textContent = fmtTime(p.ftime);
  $('resBest').textContent = nb ? '個人最佳紀錄' : '個人最佳 ' + fmtTime(best);
  $('resList').textContent = ''; if (GAME.online) { NET.fins[NET.id] = p.ftime; netSend({ t: 'fin', time: +p.ftime.toFixed(2) }); netResults(); }
  $('resAvg').textContent = '平均時速 ' + Math.round((S_FINISH - S_START) / p.ftime * 3.6) + ' km/h';
  setTimeout(() => { if (GAME.state === 'finish') { document.body.classList.add('show-result'); GAME.camMode = 4; } }, 1600);
}
function startShowroom(model) {
  const p = GAME.player; if (!p || GAME.state !== 'menu') return;
  p.model = model; p.dmg = 0; p.dents = null;
  GAME.show = { t: 0, s0: clamp(p.s, 400, S_FINISH - 600), card: false, model };
  document.body.classList.add('showroom');
  hideCarCard(true);
}
const SHOW_LEN = 32, SHOW_T = 2.8;
function stepShow(c, dt) {
  const S = GAME.show; S.t += dt; const f = Math.min(1, S.t / SHOW_T), e = 1 - Math.pow(1 - f, 2.2);
  const v = SHOW_LEN * 2.2 * Math.pow(1 - f, 1.2) / SHOW_T, t = trackAt(S.s0 + SHOW_LEN * e, _at);
  c.s = S.s0 + SHOW_LEN * e; c.d = -1.6; c.x = t.x + t.nx * c.d; c.z = t.z + t.nz * c.d; c.yaw = t.th; c.v = v; c.vx = t.tx * v; c.vz = t.tz * v;
  c.brakeLight = f > 0.45 && f < 1 ? 1 : 0; c.steer = 0; c.spin += v / RW * dt; c.ax = f < 1 ? -4 : 0; c.latG = 0; c.slip = 0; c.offroad = false;
  settleCar(c, dt, t);
  if (f >= 1 && !S.card) { S.card = true; showCarCard(S.model, true); }
}
function showMenu() { document.body.classList.remove('show-result', 'show-pause', 'hud-on'); document.body.classList.add('show-menu'); GAME.paused = false; startSession('attract'); if (typeof updateGoLabel === 'function') updateGoLabel(); }
function beginRace() { AUDIO.init(); if (AUDIO.ctx && AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); document.body.classList.remove('show-menu', 'show-result', 'show-pause'); GAME.paused = false; CS.init = false; startSession(GAME.selMode || 'race'); if (GAME.selMode === 'cruise') toast('環景巡航：拖曳畫面可 360° 環視，按 C 切換視角'); }
function togglePause() { if (GAME.online) return; if (GAME.state !== 'racing' && GAME.state !== 'count') return; GAME.paused = !GAME.paused; document.body.classList.toggle('show-pause', GAME.paused); }
