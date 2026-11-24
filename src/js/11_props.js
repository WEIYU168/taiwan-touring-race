// ───────────────────────── 地標、建物、護欄、標誌 ─────────────────────────
const PROPS = { chunks: [], plan: [], CH: 100 };
const _pm = M4.create();
function frameM(x, y, z, fx, fz) { return M4.fromBasis(M4.create(), fz, 0, -fx, 0, 1, 0, fx, 0, fz, x, y, z); }
function roadFrame(s, d, face /* 1: 面向來車, 2: 面向道路, 0: 順向 */, yOff = 0) {
  const t = trackAt(s, {}), x = t.x + t.nx * d, z = t.z + t.nz * d, sg = d < 0 ? -1 : 1;
  let fx = t.tx, fz = t.tz;
  if (face === 1) { fx = -t.tx; fz = -t.tz; } else if (face === 2) { fx = -sg * t.nx; fz = -sg * t.nz; }
  return { m: frameM(x, 0, z, fx, fz), x, z, t, fx, fz };
}
const cellUV = (i, cols, rows) => [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows, (i % cols + 1) / cols, 1 - Math.floor(i / cols) / rows];
function signQuad(mb, w, h, y0, layer, uv, flip) {
  mb.lay(layer).col(1, 1, 1, 1);
  const u0 = flip ? uv[2] : uv[0], u1 = flip ? uv[0] : uv[2];
  mb.q4([-w / 2, y0, 0.03], [w / 2, y0, 0.03], [w / 2, y0 + h, 0.03], [-w / 2, y0 + h, 0.03], u0, uv[1], u1, uv[3]);
  mb.lay(-1).col(0.55, 0.57, 0.58, 0.3); mb.q4([w / 2, y0, -0.02], [-w / 2, y0, -0.02], [-w / 2, y0 + h, -0.02], [w / 2, y0 + h, -0.02]);
}
function signPost(mb, s, d, layer, uv, w, h, y0 = 1.9, flip = false) {
  const f = roadFrame(s, d, 1); const y = groundY(f.x, f.z); f.m[13] = y; mb.m = f.m;
  mb.lay(-1).col(0.6, 0.62, 0.63, 0.3); mb.cyl(0, -0.3, -0.05, 0.04, 0.04, y0 + h + 0.3, 6, true);
  signQuad(mb, w, h, y0, layer, uv, flip); mb.m = null;
}
function roofGable(mb, w, d, y, h, layer, over = 0.6, tail = 0) {
  const hw = w / 2 + over, hd = d / 2 + over; mb.lay(layer);
  mb.q4([-hw, y, hd], [hw, y, hd], [hw, y + h, 0], [-hw, y + h, 0], 0, 0, w / 2.2, 1.6);
  mb.q4([hw, y, -hd], [-hw, y, -hd], [-hw, y + h, 0], [hw, y + h, 0], 0, 0, w / 2.2, 1.6);
  mb.lay(-1);
  for (const sx of [-1, 1]) { const a = mb.v(sx * (w / 2), y, d / 2, sx, 0, 0), b = mb.v(sx * (w / 2), y, -d / 2, sx, 0, 0), c = mb.v(sx * (w / 2), y + h * (1 - over / hd), 0, sx, 0, 0); if (sx > 0) mb.tri(a, b, c); else mb.tri(b, a, c); }
  if (tail) { mb.box(0, y + h + 0.12, 0, hw, 0.14, 0.16); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) mb.box(sx * (hw + 0.3 + k * 0.45), y + h + 0.2 + k * k * 0.16 * tail, 0, 0.3, 0.1, 0.12); }
}
// 以目前 mb.m 為基準，暫時套用局部平移／旋轉；回傳舊矩陣以便還原
function subM(mb, x, y, z, ry = 0) {
  const m0 = mb.m, t = M4.translate(M4.create(), x, y, z);
  if (ry) M4.mul(t, t, M4.rotY(M4.create(), ry));
  const m = M4.create(); if (m0) M4.mul(m, m0, t); else m.set(t);
  mb.m = m; return m0;
}
const SHIRTS = [[0.85, 0.85, 0.82], [0.12, 0.2, 0.42], [0.62, 0.1, 0.1], [0.16, 0.36, 0.22], [0.92, 0.72, 0.18], [0.35, 0.35, 0.37], [0.9, 0.5, 0.55], [0.2, 0.55, 0.7], [0.05, 0.05, 0.06], [0.75, 0.38, 0.16]];
const PANTS = [[0.1, 0.12, 0.2], [0.06, 0.06, 0.07], [0.28, 0.26, 0.22], [0.45, 0.42, 0.36], [0.18, 0.22, 0.32]];
const SKINS = [[0.82, 0.62, 0.48], [0.74, 0.54, 0.4], [0.64, 0.45, 0.32], [0.86, 0.68, 0.55]];
// 站立的路人（約 1.55–1.8 m），腳底在原點、面向 +Z
function person(mb, R, x, z, ry, o = {}) {
  const m0 = subM(mb, x, 0, z, ry), k = 0.88 + R() * 0.14;
  const sh = SHIRTS[R() * SHIRTS.length | 0], pa = PANTS[R() * PANTS.length | 0], sk = SKINS[R() * SKINS.length | 0];
  const skirt = R() < 0.18, armF = (R() - 0.5) * 0.3, lean = (R() - 0.5) * 0.06;
  mb.lay(-1);
  // 鞋、腿
  mb.col(0.06, 0.06, 0.06, 1); for (const sx of [-1, 1]) mb.ellipsoid(sx * 0.095 * k, 0.04, 0.04, 0.055, 0.045, 0.12, 8, 4);
  mb.col(pa[0], pa[1], pa[2], 1);
  if (skirt) { mb.col(sk[0], sk[1], sk[2], 1); for (const sx of [-1, 1]) mb.cyl(sx * 0.09 * k, 0.07, 0, 0.045, 0.055, 0.45 * k, 8, false); mb.col(pa[0], pa[1], pa[2], 1); mb.cyl(0, 0.48 * k, 0, 0.24 * k, 0.15 * k, 0.42 * k, 12, false); }
  else for (const sx of [-1, 1]) { mb.cyl(sx * 0.095 * k, 0.07, 0, 0.058, 0.075, 0.48 * k, 8, false); mb.cyl(sx * 0.09 * k, 0.55 * k, 0, 0.075, 0.09, 0.36 * k, 8, false); }
  mb.ellipsoid(0, 0.92 * k, 0, 0.17 * k, 0.11 * k, 0.11 * k, 12, 6);
  // 軀幹、肩
  mb.col(sh[0], sh[1], sh[2], 1);
  mb.ellipsoid(0, 1.18 * k, lean, 0.18 * k, 0.27 * k, 0.11 * k, 14, 8);
  mb.ellipsoid(0, 1.38 * k, lean, 0.21 * k, 0.07 * k, 0.1 * k, 12, 5);
  // 手臂（上臂袖子、前臂與手掌膚色）
  for (const sx of [-1, 1]) {
    const ax = sx * 0.225 * k, f = sx * armF;
    mb.col(sh[0], sh[1], sh[2], 1); mb.ellipsoid(ax, 1.25 * k, lean + f * 0.3, 0.05, 0.15 * k, 0.05, 8, 5);
    mb.col(sk[0], sk[1], sk[2], 1); mb.ellipsoid(ax + sx * 0.012, 0.98 * k, lean + f, 0.04, 0.14 * k, 0.04, 8, 5);
    mb.ellipsoid(ax + sx * 0.015, 0.8 * k, lean + f * 1.2, 0.035, 0.06, 0.025, 6, 4);
  }
  // 頸、頭、頭髮
  mb.col(sk[0], sk[1], sk[2], 1); mb.cyl(0, 1.42 * k, lean, 0.045, 0.042, 0.08, 8, false);
  const hy = 1.6 * k; mb.ellipsoid(0, hy, lean + 0.01, 0.085, 0.108, 0.095, 12, 8); mb.ellipsoid(0, hy - 0.015, lean + 0.095, 0.016, 0.022, 0.016, 5, 3);
  for (const sx of [-1, 1]) mb.ellipsoid(sx * 0.085, hy, lean, 0.013, 0.024, 0.016, 5, 3);
  const hair = R() < 0.15 ? [0.5, 0.48, 0.45] : [0.05, 0.04, 0.035];
  mb.col(hair[0], hair[1], hair[2], 1); mb.ellipsoid(0, hy + 0.045, lean - 0.008, 0.09, 0.075, 0.1, 12, 6);
  if (R() < 0.4) mb.ellipsoid(0, hy - 0.02, lean - 0.05, 0.088, 0.09, 0.07, 10, 5);
  if (o.hat === 'cone' || (o.farm && R() < 0.5)) { mb.col(0.82, 0.74, 0.5, 1); mb.cyl(0, hy + 0.07, lean, 0.26, 0.0, 0.16, 14, false); }
  else if (R() < 0.25) { const c = SHIRTS[R() * SHIRTS.length | 0]; mb.col(c[0], c[1], c[2], 1); mb.ellipsoid(0, hy + 0.06, lean, 0.095, 0.05, 0.1, 10, 5); mb.box(0, hy + 0.04, lean + 0.12, 0.07, 0.006, 0.05); }
  mb.m = m0;
}
// 機車（車頭朝 +Z）
function scooter(mb, R, x, z, ry) {
  const m0 = subM(mb, x, 0, z, ry);
  const pal = [[0.85, 0.85, 0.83], [0.08, 0.08, 0.09], [0.6, 0.08, 0.08], [0.15, 0.3, 0.6], [0.55, 0.57, 0.6], [0.9, 0.82, 0.62], [0.35, 0.55, 0.4]], c = pal[R() * pal.length | 0];
  mb.lay(-1);
  mb.col(0.03, 0.03, 0.03, 1); for (const wz of [0.6, -0.55]) mb.ellipsoid(0, 0.2, wz, 0.05, 0.2, 0.2, 12, 6);
  mb.col(0.5, 0.5, 0.52, 0.3); for (const wz of [0.6, -0.55]) mb.ellipsoid(0, 0.2, wz, 0.055, 0.1, 0.1, 10, 5);
  mb.col(0.12, 0.12, 0.12, 1); mb.box(0, 0.3, 0.02, 0.15, 0.035, 0.32);
  mb.col(c[0], c[1], c[2], 0.6);
  mb.ellipsoid(0, 0.5, -0.42, 0.19, 0.2, 0.42, 14, 8);
  mb.ellipsoid(0, 0.62, 0.48, 0.16, 0.36, 0.1, 12, 7);
  mb.ellipsoid(0, 0.34, 0.6, 0.06, 0.06, 0.18, 8, 4);
  mb.col(0.05, 0.05, 0.05, 1); mb.ellipsoid(0, 0.72, -0.34, 0.15, 0.055, 0.36, 12, 6);
  mb.col(0.08, 0.08, 0.08, 1); mb.cyl(0, 0.62, 0.55, 0.025, 0.025, 0.42, 6, true); mb.box(0, 1.04, 0.55, 0.33, 0.018, 0.018);
  mb.col(c[0], c[1], c[2], 0.6); mb.ellipsoid(0, 1.0, 0.58, 0.13, 0.07, 0.08, 10, 5);
  mb.col(0.95, 0.95, 0.9, 0.3); mb.ellipsoid(0, 1.0, 0.655, 0.06, 0.035, 0.015, 8, 4);
  mb.col(0.8, 0.15, 0.05, 0.3); mb.box(0, 0.6, -0.84, 0.08, 0.025, 0.01);
  mb.col(0.5, 0.5, 0.52, 0.3); for (const sx of [-1, 1]) { mb.box(sx * 0.2, 1.12, 0.52, 0.006, 0.08, 0.006); mb.box(sx * 0.22, 1.21, 0.52, 0.04, 0.025, 0.006); }
  mb.m = m0;
}
// 鐵窗（外推式鐵窗與遮雨小頂）＋冷氣室外機，對齊立面貼圖的窗位
function windowExtras(mb, R, w, floors, fh, bays) {
  const bw = w / bays, gc = [[0.82, 0.84, 0.85], [0.55, 0.58, 0.6], [0.3, 0.42, 0.36], [0.85, 0.85, 0.8]][R() * 4 | 0];
  for (let f = 1; f < floors; f++) for (let b = 0; b < bays; b++) {
    const cx = -w / 2 + (b + 0.5) * bw, y0 = f * fh + 0.277 * fh, y1 = f * fh + 0.66 * fh, hx = bw * 0.375, dz = 0.32;
    if (R() < 0.6) {
      mb.lay(-1).col(gc[0], gc[1], gc[2], 0.3);
      mb.box(cx, y0, dz / 2, hx + 0.02, 0.02, dz / 2 + 0.02); mb.box(cx, y1, dz / 2, hx + 0.02, 0.02, dz / 2 + 0.02);
      for (const sx of [-1, 1]) { mb.box(cx + sx * hx, (y0 + y1) / 2, dz, 0.018, (y1 - y0) / 2, 0.018); mb.box(cx + sx * hx, (y0 + y1) / 2, dz / 2, 0.012, 0.012, dz / 2); }
      const nb = Math.max(5, Math.round(hx * 2 / 0.13)); for (let i = 1; i < nb; i++) mb.box(cx - hx + i * hx * 2 / nb, (y0 + y1) / 2, dz, 0.007, (y1 - y0) / 2, 0.007);
      mb.box(cx, (y0 + y1) / 2, dz, hx, 0.008, 0.008);
      if (R() < 0.7) { const rc = R() < 0.5 ? [0.25, 0.45, 0.62] : [0.72, 0.72, 0.7]; mb.lay(PL.CORR).col(rc[0], rc[1], rc[2], 0.6); mb.q4([cx - hx - 0.1, y1 + 0.02, dz + 0.12], [cx + hx + 0.1, y1 + 0.02, dz + 0.12], [cx + hx + 0.1, y1 + 0.22, -0.02], [cx - hx - 0.1, y1 + 0.22, -0.02], 0, 0, hx, 0.3); }
    }
    if (R() < 0.55) {
      const ax = cx + 0.295 * bw, ay = f * fh + 0.15 * fh, aw = bw * 0.095;
      mb.lay(-1).col(0.84, 0.85, 0.82, 1); mb.box(ax, ay, 0.17, aw, 0.27, 0.15);
      { const m0 = subM(mb, ax - aw * 0.22, ay, 0.322); mb.m = M4.mul(M4.create(), mb.m, M4.rotX(M4.create(), PI / 2)); mb.col(0.22, 0.23, 0.23, 1); mb.cyl(0, -0.005, 0, 0.17, 0.17, 0.01, 14, true); mb.m = m0; }
      mb.col(0.5, 0.5, 0.5, 0.3); mb.box(ax, ay - 0.3, 0.17, aw + 0.03, 0.015, 0.17);
    }
  }
}
function townhouse(mb, R, w, d, floors, opt = {}) {
  const fh = 3.3, H = floors * fh, bays = Math.max(1, Math.round(w / 4.2));
  const tint = opt.tint || [[0.93, 0.9, 0.84], [0.86, 0.84, 0.8], [0.9, 0.82, 0.72], [0.8, 0.86, 0.88], [0.92, 0.88, 0.76]][R() * 5 | 0];
  mb.lay(PL.CONC).col(tint[0] * 0.92, tint[1] * 0.92, tint[2] * 0.92, 1); mb.box(0, H / 2 - 1, -d / 2, w / 2, H / 2 + 1, d / 2, 5, 1 | 2 | 32);
  mb.col(tint[0], tint[1], tint[2], 1).lay(opt.shop === false ? PL.FACADE : PL.SHOP); mb.q4([-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, fh, 0], [-w / 2, fh, 0], 0, 0, bays, 1);
  mb.lay(PL.CONC); mb.q4([-w / 2, -2, 0], [w / 2, -2, 0], [w / 2, 0, 0], [-w / 2, 0, 0], 0, 0, 1, 0.3);
  if (floors > 1) { mb.lay(PL.FACADE); mb.q4([-w / 2, fh, 0], [w / 2, fh, 0], [w / 2, H, 0], [-w / 2, H, 0], 0, 0, bays, floors - 1); }
  mb.lay(PL.CONC).col(0.7, 0.7, 0.68, 1); mb.q4([-w / 2, H, 0], [w / 2, H, 0], [w / 2, H, -d], [-w / 2, H, -d], 0, 0, 2, 2);
  mb.lay(-1).col(tint[0] * 0.85, tint[1] * 0.85, tint[2] * 0.85, 1); mb.box(0, H + 0.4, -0.1, w / 2, 0.4, 0.1); mb.box(0, fh + 0.05, 0.6, w / 2, 0.08, 0.6);
  if (R() < 0.75) { const c = [[0.2, 0.42, 0.62], [0.24, 0.5, 0.36], [0.62, 0.22, 0.18], [0.7, 0.7, 0.72]][R() * 4 | 0]; mb.lay(PL.CORR).col(c[0], c[1], c[2], 0.6); mb.box(0, H + 1.2, -d * 0.6, w / 2 - 0.3, 1.2, d * 0.3, 2); roofGable(mb, w - 0.6, d * 0.6, H + 2.4, 0.7, PL.CORR, 0.3); }
  mb.lay(PL.STEEL).col(0.85, 0.87, 0.9, 0.3); mb.cyl(w / 2 - 1, H, -1.2, 0.5, 0.5, 1.3, 10, true);
  if (floors > 1) windowExtras(mb, R, w, floors, fh, bays);
  // 騎樓下停放的機車、門口的路人（墾丁路線不放路人，只保留停放的機車）
  const people = ROUTE.key !== 'kenting';
  if (opt.shop !== false) {
    const n = Math.floor((w - 0.6) / 0.78);
    for (let i = 0; i < n; i++) if (R() < 0.55) scooter(mb, R, -w / 2 + 0.55 + i * 0.78 + (R() - 0.5) * 0.08, 0.95 + (R() - 0.5) * 0.15, (R() - 0.5) * 0.25);
    const np = R() < 0.55 ? 1 + (R() < 0.35 ? 1 : 0) : 0;
    for (let i = 0; i < np; i++) { const x = (R() - 0.5) * (w - 1), z = 1.9 + R() * 1.2, ry = (R() - 0.5) * 2.4; if (people) person(mb, R, x, z, ry); } // 照樣取亂數，其他路線的街景不受影響
  } else if (R() < 0.35) { const x = (R() - 0.5) * (w - 2), z = 1.5 + R() * 1.5, ry = (R() - 0.5) * 3; if (people) person(mb, R, x, z, ry, { farm: true }); }
  if (opt.sign !== false && R() < 0.8) { const uv = cellUV(R() * 16 | 0, 4, 4); mb.lay(PL.SHOPSIGN).col(1, 1, 1, 1); const sx = (R() < 0.5 ? -1 : 1) * (w / 2 - 0.2); const du = (uv[2] - uv[0]) * 0.26; for (const k of [1, -1]) mb.q4([sx, fh + 0.2, 0.9 * (k > 0 ? 1 : 0.02) + 0.1], [sx, fh + 0.2, k > 0 ? 0.1 : 1.0], [sx, fh + 3.2, k > 0 ? 0.1 : 1.0], [sx, fh + 3.2, 0.9 * (k > 0 ? 1 : 0.02) + 0.1], uv[0] + du, uv[1], uv[2] - du, uv[3]); }
}
function shed(mb, R, w, d, h) {
  const c = [[0.72, 0.74, 0.74], [0.3, 0.46, 0.6], [0.36, 0.5, 0.38], [0.74, 0.68, 0.56]][R() * 4 | 0];
  mb.lay(PL.CORR).col(c[0], c[1], c[2], 0.6); mb.box(0, h / 2 - 1, -d / 2, w / 2, h / 2 + 1, d / 2, 2, 1 | 2 | 16 | 32);
  mb.col(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.6); roofGable(mb, w, d, h, 1.3, PL.CORR, 0.5); mb.m[14] += 0;
}
function temple(mb, w, d, plaque, big) {
  mb.lay(PL.STONE).col(0.9, 0.9, 0.88, 1); mb.box(0, -0.6, -d / 2, w / 2 + 2, 1.2, d / 2 + 2, 3);
  const H = big ? 6.5 : 4.6;
  mb.lay(PL.BRICK).col(1, 0.9, 0.86, 1); mb.box(0, 0.6 + H / 2, -d / 2 - 1, w / 2, H / 2, d / 2 - 1, 3);
  mb.lay(PL.DOOR).col(1, 1, 1, 0.6); for (const px of [-w * 0.28, 0, w * 0.28]) mb.q4([px - 1.3, 0.6, -1.98], [px + 1.3, 0.6, -1.98], [px + 1.3, 3.8, -1.98], [px - 1.3, 3.8, -1.98]);
  mb.lay(-1).col(0.72, 0.1, 0.07, 0.6); const nc = big ? 6 : 4; for (let k = 0; k < nc; k++) mb.cyl(-w / 2 + 0.6 + k * (w - 1.2) / (nc - 1), 0.6, 0.6, 0.3, 0.27, H, 10, false);
  mb.lay(PL.FRIEZE).col(1, 1, 1, 1); mb.box(0, 0.6 + H + 0.35, -d / 2 + 0.4, w / 2 + 0.6, 0.4, d / 2 + 0.8, 4, 1 | 2 | 16 | 32);
  mb.col(1, 1, 1, 0.6); roofGable(mb, w + 1.6, d + 3, 0.6 + H + 0.75, big ? 3.4 : 2.5, PL.TILE_O, 1.6, 1);
  if (big) { mb.lay(PL.FRIEZE).col(1, 1, 1, 1); mb.box(0, 0.6 + H + 4.6, -d / 2, w * 0.3, 0.8, d * 0.3, 4, 1 | 2 | 16 | 32); mb.col(1, 1, 1, 0.6); roofGable(mb, w * 0.62, d * 0.62, 0.6 + H + 5.4, 2.6, PL.TILE_O, 1.4, 1.2); }
  const uv = cellUV(plaque, 2, 2); mb.lay(PL.PLAQUE).col(1, 1, 1, 1); mb.q4([-1.9, 0.6 + H - 1.3, 0.75], [1.9, 0.6 + H - 1.3, 0.75], [1.9, 0.6 + H + 0.2, 0.75], [-1.9, 0.6 + H + 0.2, 0.75], uv[0] + 0.02, uv[1] + 0.14, uv[2] - 0.02, uv[3] - 0.14);
  mb.lay(PL.LIGHT).col(1, 0.9, 0.8, 0.1); for (let k = 0; k < nc - 1; k++) mb.ellipsoid(-w / 2 + 0.6 + (k + 0.5) * (w - 1.2) / (nc - 1), 0.6 + H - 0.9, 0.9, 0.34, 0.42, 0.34, 8, 5);
}
function paifang(mb, span, plaque, banner) {
  const H = 7.2;
  for (const sx of [-1, 1]) { mb.lay(PL.STONE).col(0.9, 0.9, 0.88, 1); mb.box(sx * span / 2, 0.2, 0, 0.8, 1.2, 0.8, 2); mb.lay(-1).col(0.72, 0.1, 0.07, 0.6); mb.cyl(sx * span / 2, 1.2, 0, 0.5, 0.45, H - 1.2, 12, false);
    mb.col(0.72, 0.1, 0.07, 0.6); mb.cyl(sx * (span / 2 + 3.2), 0, 0, 0.36, 0.33, H - 2.2, 10, false); }
  mb.lay(PL.FRIEZE).col(1, 1, 1, 1); mb.box(0, H + 0.5, 0, span / 2 + 4.2, 0.5, 0.4, 3); mb.box(0, H - 1.6, 0, span / 2 + 0.3, 0.3, 0.3, 3);
  mb.col(1, 1, 1, 0.6); roofGable(mb, span + 1, 1.4, H + 1.9, 1.6, PL.TILE_O, 1.3, 1.3);
  for (const sx of [-1, 1]) { const m0 = mb.m, t = M4.create(); M4.mul(t, m0, M4.translate(M4.create(), sx * (span / 2 + 3.4), H + 0.2, 0)); mb.m = t; roofGable(mb, 3.6, 1.2, 0.8, 1.1, PL.TILE_O, 0.9, 1); mb.m = m0; }
  const uv = cellUV(plaque, 2, 2); mb.lay(PL.PLAQUE).col(1, 1, 1, 1);
  for (const k of [1, -1]) mb.q4([-2.2 * k, H + 1.05, 0.45 * k], [2.2 * k, H + 1.05, 0.45 * k], [2.2 * k, H + 2.4, 0.45 * k], [-2.2 * k, H + 2.4, 0.45 * k], uv[0] + 0.02, uv[1] + 0.14, uv[2] - 0.02, uv[3] - 0.14);
  if (banner >= 0) { mb.lay(PL.BANNER).col(1, 1, 1, 1); for (const k of [1, -1]) mb.q4([-span / 2 * k, H - 3.2, 0.36 * k], [span / 2 * k, H - 3.2, 0.36 * k], [span / 2 * k, H - 1.9, 0.36 * k], [-span / 2 * k, H - 1.9, 0.36 * k], 0, banner ? 0.12 : 0.62, 1, banner ? 0.38 : 0.88); }
}
function buddha(mb) { // 八卦山大佛：黑色坐佛、蓮花座，高約 22 m
  mb.lay(PL.STONE).col(0.86, 0.86, 0.84, 1); mb.cyl(0, -1, 0, 11, 11, 2.2, 28, true);
  mb.lay(-1).col(0.93, 0.9, 0.86, 1); mb.lathe(0, 1.2, 0, [[8.6, 0], [9.6, 0.8], [9.9, 1.8], [9.2, 2.6], [8.4, 2.9]], 28);
  mb.col(0.09, 0.09, 0.1, 0.6);
  mb.ellipsoid(0, 5.6, 0.6, 8.2, 2.3, 5.6, 22, 10);
  mb.ellipsoid(0, 10.2, -0.6, 4.9, 5.6, 3.9, 20, 12);
  mb.ellipsoid(0, 14.2, -0.6, 5.6, 2.2, 3.4, 18, 8);
  for (const sx of [-1, 1]) { mb.ellipsoid(sx * 5.2, 10.6, 0.2, 1.5, 4.2, 1.7, 12, 8); mb.ellipsoid(sx * 3.2, 6.6, 3.2, 3.0, 1.3, 1.6, 12, 6); }
  mb.ellipsoid(0, 6.8, 4.2, 1.9, 0.8, 1.2, 10, 6);
  mb.cyl(0, 15.4, -0.5, 1.5, 1.3, 1.4, 12, false);
  mb.ellipsoid(0, 18.4, -0.4, 2.5, 2.8, 2.6, 18, 12);
  mb.ellipsoid(0, 21.0, -0.6, 1.2, 0.9, 1.2, 10, 6);
  for (const sx of [-1, 1]) mb.ellipsoid(sx * 2.5, 17.8, -0.5, 0.35, 1.3, 0.6, 6, 6);
}
function skyBridge(mb, len) { // 猴探井天空之橋：白色吊橋、微笑曲線橋面
  const N = 40;
  for (const sz of [-1, 1]) { mb.lay(-1).col(0.94, 0.94, 0.92, 0.6); for (const sx of [-1, 1]) mb.box(sx * 1.6, 6, sz * len / 2, 0.35, 16, 0.5); mb.box(0, 20, sz * len / 2, 2.2, 0.5, 0.6); mb.box(0, 13, sz * len / 2, 2.0, 0.3, 0.4); }
  for (let k = 0; k < N; k++) {
    const f0 = k / N, f1 = (k + 1) / N, z0 = (f0 - 0.5) * len, z1 = (f1 - 0.5) * len, y0 = -9 * 4 * f0 * (1 - f0) + 2, y1 = -9 * 4 * f1 * (1 - f1) + 2;
    mb.col(0.82, 0.83, 0.84, 0.6); mb.q4([-1.3, y0, z0], [1.3, y0, z0], [1.3, y1, z1], [-1.3, y1, z1]); mb.q4([1.3, y0 - 0.3, z0], [-1.3, y0 - 0.3, z0], [-1.3, y1 - 0.3, z1], [1.3, y1 - 0.3, z1]);
    const c0 = 20 - 14 * 4 * f0 * (1 - f0), c1 = 20 - 14 * 4 * f1 * (1 - f1);
    for (const sx of [-1, 1]) { mb.col(0.9, 0.9, 0.9, 0.3); mb.q4([sx * 1.6, c0, z0], [sx * 1.6, c1, z1], [sx * 1.6, c1 + 0.14, z1], [sx * 1.6, c0 + 0.14, z0]); mb.q4([sx * 1.45, y0 + 1.1, z0], [sx * 1.45, y1 + 1.1, z1], [sx * 1.45, y1 + 1.18, z1], [sx * 1.45, y0 + 1.18, z0]);
      if (k % 2 === 0) mb.q4([sx * 1.6, y0, z0 - 0.04], [sx * 1.6, y0, z0 + 0.04], [sx * 1.6, c0, z0 + 0.04], [sx * 1.6, c0, z0 - 0.04]); }
  }
}

// 建地規劃（在地形網格建立前呼叫：整地、清除植被）
function planProps() {
  const R = mulberry32(555), tr = {}; PROPS.plan = []; const P = PROPS.plan;
  const add = (type, s, d, o = {}) => { const t = trackAt(s, tr), x = t.x + t.nx * d, z = t.z + t.nz * d; const y = o.y !== undefined ? o.y : t.y - 0.25; const it = Object.assign({ type, s, d, x, z, y, r: 10 }, o);
    if (it.flat !== false) flattenPad(x, z, it.r, y); if (it.r > 0) markClear(x, z, it.r + 2, it.pave ? 3 : 1); P.push(it); return it; };
  for (const [a, b] of ROUTE.streets) for (let s = a; s < b;) { const w = 4.4 + (R() * 3 | 0) * 2.1; for (const sg of [-1, 1]) { if (ROUTE.streetSkip(s, sg)) continue; const hw = trackAt(s, tr).hw; add('house', s, sg * (hw + 7.5 + R() * 1.5), { w, dp: 9 + R() * 3, fl: 2 + (R() * 3 | 0), r: 5, flat: false, seed: R() * 1e6 | 0 }); } s += w + 0.4 + (R() < 0.15 ? 5 : 0); }
  ROUTE.plan(add, tr, R);
  for (let s = 300; s < S_FINISH - 350; s += 46) for (const sg of [-1, 1]) {
    if (zoneOf(s).nofarm) continue;
    const t = trackAt(s, tr), d = sg * (t.hw + 15 + R() * 8), x = t.x + t.nx * d, z = t.z + t.nz * d, gi = gridIdx(x, z);
    if (gi < 0 || TG.LU[gi] !== LU.TOWN || (TG.MASK[gi] & 1) || inJunction(s, 30) || Math.abs(TG.D[gi]) < t.hw + 9 || TG.H[gi] < ROUTE.seaMin) continue;
    add(R() < 0.45 ? 'shed' : 'farm', s, d, { r: 8, seed: R() * 1e6 | 0, w: 7 + R() * 4, dp: 8 + R() * 4 });
  }
}
function gantry(mb, span, banner) {
  const H = 6.6; mb.lay(-1).col(0.16, 0.17, 0.18, 0.6);
  for (const sx of [-1, 1]) { mb.box(sx * span / 2, H / 2, 0, 0.28, H / 2, 0.28); mb.box(sx * span / 2, 0.25, 0, 0.7, 0.25, 0.7); }
  mb.box(0, H + 0.1, 0, span / 2 + 0.28, 0.14, 0.3); mb.box(0, H - 1.9, 0, span / 2, 0.1, 0.22);
  mb.lay(PL.BANNER2).col(1, 1, 1, 1); for (const k of [1, -1]) mb.q4([-span / 2 * k, H - 1.8, 0.24 * k], [span / 2 * k, H - 1.8, 0.24 * k], [span / 2 * k, H, 0.24 * k], [-span / 2 * k, H, 0.24 * k], 0, banner ? 0.12 : 0.62, 1, banner ? 0.38 : 0.88);
}
const PROP_EXTRA = {
  lighthouse(mb) { // 鵝鑾鼻燈塔：白色圓塔
    mb.lay(-1).col(0.95, 0.95, 0.93, 1); mb.cyl(0, -1, 0, 3.4, 2.3, 18, 18, false); mb.box(0, 1.6, -7, 6, 2.6, 3.4); mb.box(0, 0.5, 9, 14, 1.5, 0.4); 
    mb.col(0.12, 0.12, 0.13, 0.6); mb.cyl(0, 17, 0, 2.9, 2.9, 0.4, 18, true); mb.cyl(0, 20, 0, 2.0, 0.2, 1.8, 14, false);
    mb.lay(PL.GLASS).col(1, 1, 1, 0.6); mb.cyl(0, 17.4, 0, 1.8, 1.8, 2.6, 14, false);
    mb.lay(PL.LIGHT).col(1, 0.95, 0.8, 0.1); mb.ellipsoid(0, 18.6, 0, 0.7, 0.9, 0.7, 8, 5);
  },
  sailrock(mb) { // 船帆石
    mb.lay(PL.STONE).col(0.4, 0.37, 0.33, 1); mb.ellipsoid(0, 6, 0, 6.5, 11, 5, 12, 9); mb.ellipsoid(2.5, 3, 1.5, 6, 5, 5.5, 10, 7); mb.ellipsoid(-1.5, 12, -0.5, 4, 6.5, 3.4, 10, 7);
    mb.lay(-1).col(0.2, 0.3, 0.14, 1); mb.ellipsoid(-1.2, 17.6, -0.4, 2.8, 1.3, 2.4, 8, 5);
  },
  peak(mb) { // 大尖石山：從牧場草原拔起的尖聳岩峰（砂岩、頁岩礫石），西側陡壁、東側稜線較長
    const H = 300, Rb = 560;
    const hX = (x, z) => {
      const xs = x + 35, a = Math.atan2(z, xs), r = Math.hypot(xs, z);
      const Rs = 205 * (1 + 0.75 * Math.max(0, Math.cos(a)) ** 2 + 0.12 * Math.sin(a * 3 + 1));
      const t = Math.max(0, 1 - r / Rs);
      let h = H * Math.pow(t, 1.45) * (1 + 0.1 * (ridged(x / 70, z / 70, 3, 301) - 0.5)) + H * 0.06 * Math.pow(t, 6) * Math.sin(a * 2.0 + 0.6);
      h += (9 * Math.sin(a * 13 + r * 0.04 + 2 * vnoise(a * 3, r / 60, 311)) + 7 * (fbm(x / 28, z / 28, 3, 313) - 0.5)) * t * (1 - t) * 4;
      h += 34 * Math.pow(Math.max(0, 1 - Math.hypot(x, z) / Rb), 2) - 28 * smooth(Rb * 0.72, Rb, Math.hypot(x, z));
      return h;
    };
    const NR = 46, NA = 132, base = mb.nv;
    for (let j = 0; j <= NR; j++) for (let i = 0; i < NA; i++) {
      const r = Rb * Math.pow(j / NR, 1.5) + 0.01, a = i / NA * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hX(x, z), e = 2.5;
      const nx = hX(x - e, z) - hX(x + e, z), nz = hX(x, z - e) - hX(x, z + e), ny = 2 * e, l = Math.hypot(nx, ny, nz);
      const slope = Math.hypot(nx, nz) / ny, n1 = fbm(x / 40, z / 40, 3, 307), n2 = vnoise(x / 9, z / 9, 309);
      const rock = sat(smooth(0.75, 1.35, slope) * 0.85 + smooth(H * 0.55, H * 0.85, y) * 0.75 - (n1 - 0.5) * 1.3 - smooth(H * 0.45, 0, y) * 0.5);
      const shrub = sat(smooth(0.1, 0.4, slope) * (0.7 + n1) - rock * 0.5), pasture = 1 - smooth(18, 60, y);
      let cr = lerp(0.2, 0.13, shrub) , cg = lerp(0.3, 0.2, shrub), cb = lerp(0.12, 0.08, shrub);
      cr = lerp(cr, 0.3, pasture); cg = lerp(cg, 0.4, pasture); cb = lerp(cb, 0.15, pasture);
      const rg = 0.82 + 0.3 * n2; cr = lerp(cr, 0.46 * rg, rock); cg = lerp(cg, 0.43 * rg, rock); cb = lerp(cb, 0.37 * rg, rock);
      mb.lay(-1).col(cr, cg, cb, 1); mb.v(x, y, z, nx / l, ny / l, nz / l);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = base + j * NA + i, b = base + j * NA + (i + 1) % NA; mb.quad(a, a + NA, b + NA, b); }
  },
  npp(mb) { // 核三廠圍阻體
    for (const sx of [-1, 1]) { mb.lay(PL.CONC).col(0.9, 0.9, 0.88, 1); mb.cyl(sx * 32, 0, 0, 20, 20, 36, 24, false); mb.lay(-1); mb.ellipsoid(sx * 32, 36, 0, 20, 11, 20, 24, 7); }
    mb.lay(PL.CONC).col(0.82, 0.84, 0.86, 1); mb.box(0, 9, -40, 70, 13, 14, 8);
  },
  pylon(mb) { // 鵬灣跨海大橋：單塔斜張
    mb.lay(PL.CONC).col(0.95, 0.95, 0.93, 1);
    const B = [[-1.8, -24, -2.6], [1.8, -24, -2.6], [1.8, -24, 2.6], [-1.8, -24, 2.6]], T = [[-0.8, 58, -15], [0.8, 58, -15], [0.8, 58, -13], [-0.8, 58, -13]];
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; mb.q4(B[k2], B[k], T[k], T[k2], 0, 0, 1, 8); }
    mb.lay(-1).col(0.93, 0.93, 0.9, 0.3);
    for (let c = 0; c < 9; c++) { const f = 0.5 + c * 0.055, ty = -24 + 82 * f, tz = -14 * f; for (const dir of [1, -1]) { const az = dir * (30 + c * 20), ax = -5; mb.q4([0, ty, tz], [ax, 0.9, az], [ax, 1.1, az], [0, ty + 0.25, tz]); mb.q4([ax, 0.9, az], [0, ty, tz], [0, ty + 0.25, tz], [ax, 1.1, az]); } }
  },
  grandstand(mb) { // 賽車場看台
    const Ln = 45;
    for (let k = 0; k < 7; k++) { mb.lay(PL.CONC).col(0.8, 0.8, 0.78, 1); mb.box(0, 0.6 + k * 0.75, -3 - k * 1.3, Ln, 0.4 + k * 0.0, 0.65, 4); mb.lay(-1).col(k % 2 ? 0.1 : 0.8, k % 2 ? 0.35 : 0.12, k % 2 ? 0.7 : 0.1, 0.6); mb.box(0, 1.15 + k * 0.75, -3 - k * 1.3, Ln - 0.5, 0.14, 0.4); }
    mb.lay(PL.CONC).col(0.85, 0.85, 0.83, 1); mb.box(0, 3, -13.2, Ln, 4, 0.5, 5);
    mb.lay(PL.CORR).col(0.9, 0.9, 0.92, 0.6); mb.q4([-Ln, 9.5, -13.5], [Ln, 9.5, -13.5], [Ln, 8.2, -1], [-Ln, 8.2, -1], 0, 0, 30, 4); mb.q4([Ln, 9.5, -13.5], [-Ln, 9.5, -13.5], [-Ln, 8.2, -1], [Ln, 8.2, -1], 0, 0, 30, 4);
    mb.lay(-1).col(0.3, 0.3, 0.32, 0.3); for (let k = -4; k <= 4; k++) mb.box(k * 11, 4.6, -13.2, 0.18, 4.8, 0.18);
  },
  pitbox(mb) { // 維修區
    mb.lay(PL.SHOP).col(0.9, 0.9, 0.88, 1); mb.q4([-40, 0, 0], [40, 0, 0], [40, 4, 0], [-40, 4, 0], 0, 0, 14, 1);
    mb.lay(PL.CONC).col(0.86, 0.86, 0.84, 1); mb.box(0, 3.5, -5, 40, 4.5, 5, 5, 1 | 2 | 4 | 32); mb.lay(PL.GLASS).col(1, 1, 1, 0.6); mb.q4([-40, 4.6, 0.02], [40, 4.6, 0.02], [40, 7.6, 0.02], [-40, 7.6, 0.02], 0, 0, 20, 1);
  },
  hotel(mb, it, R) { townhouse(mb, R, 30, 14, 6, { shop: false, sign: false, tint: [0.96, 0.94, 0.9] }); }
};
function buildProps() {
  PROPS.chunks = [];
  const nCh = Math.ceil(TR.n / PROPS.CH), mbs = [], tr = {}, zp = {};
  const mbAt = s => { const k = clamp(Math.floor(s / DS / PROPS.CH), 0, nCh - 1); return mbs[k] || (mbs[k] = new MB(4096)); };
  const R = mulberry32(909);
  // 地標與建物
  for (const it of PROPS.plan) {
    const mb = mbAt(it.s), t = trackAt(it.s, tr), sg = it.d < 0 ? -1 : 1; let fx = -sg * t.nx, fz = -sg * t.nz;
    if (it.face === 'away' || it.type === 'buddha') { fx = -fx; fz = -fz; }
    const Rr = mulberry32(it.seed || 1);
    if (PROP_EXTRA[it.type]) { if (it.along) { fx = t.tx; fz = t.tz; } mb.m = frameM(it.x, it.y, it.z, fx, fz); PROP_EXTRA[it.type](mb, it, Rr); mb.m = null; continue; }
    if (it.type === 'house') { const gy = groundY(it.x, it.z); mb.m = frameM(it.x + fx * it.dp * 0, Math.max(gy, t.y - 0.4) + 0.05, it.z, fx, fz); townhouse(mb, Rr, it.w, it.dp, it.fl); }
    else { mb.m = frameM(it.x, it.y + 0.1, it.z, fx, fz);
      if (it.type === 'buddha') buddha(mb);
      else if (it.type === 'temple') temple(mb, it.w, it.dp, it.plaque, it.big);
      else if (it.type === 'farm') townhouse(mb, Rr, it.w, it.dp, 1 + (Rr() * 2 | 0), { shop: false, sign: Rr() < 0.3 });
      else if (it.type === 'shed') shed(mb, Rr, it.w + 3, it.dp + 2, 4 + Rr() * 2);
      else if (it.type === 'center') { mb.lay(PL.GLASS).col(1, 1, 1, 0.6); mb.box(0, 2.6, -6, 11, 3.6, 6, 4, 1 | 2 | 16 | 32); mb.lay(PL.CONC).col(0.92, 0.92, 0.9, 1); mb.box(0, 6.4, -6, 12.5, 0.3, 7.5, 5); }
      else if (it.type === 'resto') { mb.lay(PL.CONC).col(0.97, 0.97, 0.95, 1); mb.box(0, 2.2, -5, 8, 3.2, 5, 5, 1 | 2 | 16 | 32); mb.lay(PL.GLASS).col(1, 1, 1, 0.6); mb.q4([-6, 0.3, 0.02], [6, 0.3, 0.02], [6, 3.6, 0.02], [-6, 3.6, 0.02], 0, 0, 4, 1); mb.col(0.2, 0.42, 0.78, 0.6); roofGable(mb, 16, 10, 5.4, 1.6, PL.CORR, 0.8); mb.m = frameM(it.x, it.y + 0.1, it.z, fx, fz); mb.col(0.97, 0.97, 0.95, 1).lay(-1); mb.cyl(-10, -1, -3, 2.2, 2.2, 7.5, 14, false); mb.col(0.2, 0.42, 0.78, 0.6); mb.cyl(-10, 6.5, -3, 2.5, 0.1, 2.4, 14, false); }
      else if (it.type === 'sanheyuan') { // 紅磚三合院
        const wing = (cx, cz, w, d) => { const m0 = mb.m, m = M4.create(); M4.mul(m, m0, M4.translate(M4.create(), cx, 0, cz)); mb.m = m; mb.lay(PL.BRICK).col(1, 0.94, 0.9, 1); mb.box(0, 1.1, 0, w / 2, 2.1, d / 2, 2.6, 1 | 2 | 16 | 32); mb.col(1, 1, 1, 1); roofGable(mb, w, d, 3.2, 1.5, PL.TILE_G, 0.5, 0.6); mb.m = m0; };
        wing(0, -12, 20, 6);
        for (const sx of [-1, 1]) { const m0 = mb.m, m = M4.create(); M4.mul(m, m0, M4.translate(M4.create(), sx * 9.5, 0, -3)); M4.mul(m, m, M4.rotY(M4.create(), PI / 2)); mb.m = m; mb.lay(PL.BRICK).col(1, 0.94, 0.9, 1); mb.box(0, 1.1, 0, 6, 2.1, 2.6, 2.6, 1 | 2 | 16 | 32); mb.col(1, 1, 1, 1); roofGable(mb, 12, 5.2, 3.2, 1.3, PL.TILE_G, 0.5, 0.5); mb.m = m0; }
        mb.lay(PL.DOOR).col(1, 1, 1, 0.6); mb.q4([-1.1, 0, -8.95], [1.1, 0, -8.95], [1.1, 2.6, -8.95], [-1.1, 2.6, -8.95]);
      }
      else if (it.type === 'bridge') { mb.m = frameM(it.x, it.y, it.z, t.tx, t.tz); skyBridge(mb, 204); }
    }
    mb.m = null;
  }
  // 牌樓／賽事門架
  for (const g of ROUTE.gates) { const f = roadFrame(g.s, 0, 1); f.m[13] = f.t.y; const mb = mbAt(g.s); mb.m = f.m; if (g.plaque >= 0) paifang(mb, f.t.hw * 2 + 3.4, g.plaque, g.banner); else gantry(mb, f.t.hw * 2 + 3.4, g.banner); mb.m = null;
    // 門架兩側的觀眾（墾丁路線不放人）
    const Rs = mulberry32((g.s * 7 | 0) + 31);
    if (ROUTE.key !== 'kenting') for (const sg of [-1, 1]) for (let k = 0; k < 9; k++) {
      const s = g.s + (Rs() - 0.5) * 34, hw = trackAt(s, tr).hw, d = sg * (hw + BARRIER_OFF + 1.4 + Rs() * 3.2);
      if (s < 2 || s > S_END - 2 || inJunction(s, 4)) continue;
      const pf = roadFrame(s, d, 2); const gy = groundY(pf.x, pf.z); if (Math.abs(gy - pf.t.y) > 2.5) continue;
      pf.m[13] = gy; const pm = mbAt(s); pm.m = pf.m; person(pm, Rs, 0, 0, (Rs() - 0.5) * 1.2); pm.m = null;
    } }
  // 護欄、矮牆、緣石
  PROPS.rail = new Uint8Array(TR.n * 2);
  for (let side = 0; side < 2; side++) {
    const sg = side ? -1 : 1; let prev = null, prevType = 0;
    for (let i = 0; i < TR.n; i++) {
      const s = i * DS; trackAt(s, tr); zoneParams(s, zp); const zid = zoneOf(s).id, bk = sg > 0 ? zp.bkL : zp.bkR;
      const zz = zoneOf(s); let type = zz.rail || ((zid === 'city' || zid === 'town' || zz.town) ? 3 : bk > 0.32 ? 2 : 1); if (ROUTE.bridge(s) > 0.3) type = 2;
      if (inJunction(s, 0.5) && JUNCTIONS.some(j => Math.abs(s - j.s) < j.w / 2 + 0.5 && j.sides.includes(sg))) type = 4;
      if (s < 20 || s > S_END - 4) type = 0;
      PROPS.rail[i * 2 + side] = type;
      const d = sg * (tr.hw + BARRIER_OFF), x = tr.x + tr.nx * d, z = tr.z + tr.nz * d, y = shoulderY(s, d, tr, x, z);
      const cur = { x, y, z, nx: -sg * tr.nx, nz: -sg * tr.nz };
      if (prev && type && type === prevType) {
        const mb = mbAt(s), a = prev, b = cur, len = Math.hypot(b.x - a.x, b.z - a.z);
        const strip = (o0, y0, o1, y1, ny) => { const i0 = mb.v(a.x + a.nx * o0, a.y + y0, a.z + a.nz * o0, a.nx, ny, a.nz, s * 0.3, y0), i1 = mb.v(b.x + b.nx * o0, b.y + y0, b.z + b.nz * o0, b.nx, ny, b.nz, (s + len) * 0.3, y0), i2 = mb.v(b.x + b.nx * o1, b.y + y1, b.z + b.nz * o1, b.nx, ny, b.nz, (s + len) * 0.3, y1), i3 = mb.v(a.x + a.nx * o1, a.y + y1, a.z + a.nz * o1, a.nx, ny, a.nz, s * 0.3, y1); if (sg > 0) mb.quad(i0, i1, i2, i3); else mb.quad(i1, i0, i3, i2); };
        if (type === 1) { mb.lay(PL.STEEL).col(0.8, 0.82, 0.84, 0.3); strip(0.02, 0.44, 0.07, 0.52, 0.5); strip(0.07, 0.52, 0.02, 0.6, -0.4); strip(0.02, 0.6, 0.07, 0.68, 0.5); strip(0.07, 0.68, 0.02, 0.76, -0.4); strip(-0.05, 0.76, -0.05, 0.44, 0);
          if (i % 2 === 0) { mb.lay(-1).col(0.62, 0.64, 0.66, 0.3); mb.box(b.x - b.nx * 0.1, b.y + 0.3, b.z - b.nz * 0.1, 0.06, 0.45, 0.06); if (i % 8 === 0) { mb.col(1, 0.75, 0.1, 0.1); mb.box(b.x + b.nx * 0.09, b.y + 0.6, b.z + b.nz * 0.09, 0.04, 0.04, 0.04); } } }
        else if (type === 2) { mb.lay(PL.CONC).col(0.78, 0.77, 0.74, 1); strip(0.12, 0, 0.0, 0.55, 0.2); strip(0.0, 0.55, -0.22, 0.55, 1); }
        else if (type === 3) { mb.lay(PL.CONC).col(0.8, 0.8, 0.78, 1); strip(0.0, 0, 0.0, 0.2, 0); strip(0.0, 0.2, -0.3, 0.2, 1); }
        else if (type === 4 && i % 1 === 0) { const red = (i % 2 === 0); mb.lay(-1).col(red ? 0.85 : 0.95, red ? 0.12 : 0.95, red ? 0.1 : 0.93, 0.6); strip(0.25, 0, 0.1, 0.8, 0.3); strip(0.1, 0.8, -0.1, 0.8, 1); strip(-0.1, 0.8, -0.25, 0, 0.3); }
      }
      prev = cur; prevType = type;
    }
  }
  // 急彎導標
  for (let i = 60; i < TR.n - 30; i += 6) { const k = TR.k[i]; if (Math.abs(k) < 0.0165) continue; const s = i * DS, sg = k > 0 ? -1 : 1, mb = mbAt(s); if (inJunction(s, 12)) continue;
    signPost(mb, s, sg * (TR.hw[i] + BARRIER_OFF + 0.7), PL.CHEV, [0, 0, 1, 1], 0.6, 0.75, 1.0, k > 0); }
  // 里程牌、速限、警告、指示
  for (let k = 1; k <= ROUTE.kmMax; k++) { const s = sOfRealK(k); if (inJunction(s, 12)) continue; const uv = [(k % 20 % 4) / 4, 1 - (Math.floor(k % 20 / 4) + 1) * 102 / 512, (k % 20 % 4 + 1) / 4, 1 - Math.floor(k % 20 / 4) * 102 / 512]; signPost(mbAt(s), s, -(trackAt(s, tr).hw + BARRIER_OFF + 0.9), k < 20 ? PL.KM0 : PL.KM1, uv, 0.62, 0.5, 1.1); }
  const SG = ROUTE.key !== 'r139' ? ROUTE.signs() : [[5590, PL.SPEED, [0, 0.26, 0.5, 0.74], 0.9, 0.9], [5560, PL.INFO, [0.5, 0, 1, 0.5], 1.5, 1.1], [6330, PL.INFO, [0, 0, 0.5, 0.5], 1.5, 1.1], [6040, PL.INFO, [0, 0.5, 0.5, 1], 2.0, 1.5], [9660, PL.WARN2, [0, 0.26, 0.5, 0.74], 1.0, 1.0], [9690, PL.SPEED, [0, 0.26, 0.5, 0.74], 0.9, 0.9],
  [1880, PL.DIR, [0.5, 0.5, 1, 1], 2.6, 2.0], [4820, PL.DIR, [0, 0, 0.5, 0.5], 2.6, 2.0], [10420, PL.DIR, [0.5, 0, 1, 0.5], 2.6, 2.0], [7100, PL.DIR, [0, 0.5, 0.5, 1], 2.6, 2.0],
  [330, PL.BROWN, cellUV(0, 2, 4), 2.6, 1.3], [1700, PL.BROWN, cellUV(1, 2, 4), 2.2, 1.1], [8980, PL.BROWN, cellUV(2, 2, 4), 2.6, 1.3], [9480, PL.BROWN, cellUV(3, 2, 4), 2.6, 1.3], [7180, PL.BROWN, cellUV(4, 2, 4), 2.2, 1.1], [11500, PL.BROWN, cellUV(5, 2, 4), 2.6, 1.3], [5930, PL.BROWN, cellUV(6, 2, 4), 2.6, 1.3], [7400, PL.BROWN, cellUV(7, 2, 4), 2.6, 1.3],
  [300, PL.SHIELD, [0, 0, 1, 1], 0.8, 0.8], [2440, PL.SHIELD, [0, 0, 1, 1], 0.8, 0.8], [7300, PL.SHIELD, [0, 0, 1, 1], 0.8, 0.8], [10300, PL.SHIELD, [0, 0, 1, 1], 0.8, 0.8]].map(g => [m139(g[0]), ...g.slice(1)]); // 139 路線已縮短，路牌位置一起換算
  for (const g of SG) signPost(mbAt(g[0]), g[0], -(trackAt(g[0], tr).hw + BARRIER_OFF + 1.6), g[1], g[2], g[3], g[4], g[4] > 1.2 ? 2.4 : 1.9);
  // 彎道警告：每個明顯彎道入口前約 75 m，右側路邊；連續彎道只立一面「連續彎路」
  { const curves = []; for (let i = 40; i < TR.n - 30;) { if (Math.abs(TR.k[i]) > 0.0105) { let j = i; while (j < TR.n - 1 && Math.abs(TR.k[j]) > 0.006) j++; curves.push({ i0: i, i1: j, dir: Math.sign(TR.k[i]) }); i = j + 3; } else i++; }
    let lastS = -1e9;
    for (let q = 0; q < curves.length; q++) {
      const c = curves[q], s = c.i0 * DS - 75;
      if (s < 140 || s > S_FINISH - 40 || s - lastS < 95 || inJunction(s, 25) || (HAZ.bands || []).some(b => s > b.s0 - 45 && s < b.s1 + 25)) continue;
      let r = q; while (curves[r + 1] && (curves[r + 1].i0 - curves[r].i1) * DS < 110) r++;
      const chain = r > q;
      signPost(mbAt(s), s, -(trackAt(s, tr).hw + BARRIER_OFF + 1.3), chain ? PL.WARN : PL.WARN3, chain || c.dir > 0 ? [0, 0.26, 0.5, 0.74] : [0.5, 0.26, 1, 0.74], 1.05, 1.05);
      lastS = chain ? curves[r].i1 * DS : s;
    } }
  // 測速照相桿
  if (ROUTE.key === 'r139') { const sc = m139(6400), f = roadFrame(sc, -(trackAt(sc, tr).hw + BARRIER_OFF + 1), 1); f.m[13] = groundY(f.x, f.z); const mb = mbAt(sc); mb.m = f.m; mb.lay(-1).col(0.55, 0.57, 0.58, 0.3); mb.cyl(0, -0.3, 0, 0.09, 0.07, 5.2, 8, true); mb.col(0.9, 0.9, 0.9, 0.6); mb.box(0, 4.9, 0.25, 0.25, 0.2, 0.3); mb.m = null; }
  // 電線桿
  for (let i = 40; i < TR.n - 20; i += 22) { const s = i * DS, zid = zoneOf(s).id; if (!(zoneOf(s).poles || ['plateau', 'tea', 'town', 'city', 'pine', 'tunnel', 'hengshan'].includes(zid)) || inJunction(s, 14) || ROUTE.bridge(s) > 0.1) continue;
    const f = roadFrame(s, TR.hw[i] + BARRIER_OFF + 1.9, 0); const gi = gridIdx(f.x, f.z); if (gi >= 0 && (TG.MASK[gi] & 2)) continue; f.m[13] = groundY(f.x, f.z); const mb = mbAt(s); mb.m = f.m;
    mb.lay(PL.CONC).col(0.72, 0.71, 0.69, 1); mb.cyl(0, -0.5, 0, 0.17, 0.11, 9.5, 8, true); mb.lay(-1).col(0.4, 0.4, 0.4, 0.3); mb.box(0, 8.4, 0, 0.9, 0.05, 0.05); mb.box(0, 7.6, 0, 0.6, 0.04, 0.04);
    if (i % 88 === 40) { mb.col(0.5, 0.52, 0.54, 0.3); mb.cyl(0.35, 6.2, 0, 0.26, 0.26, 0.8, 8, true); } mb.m = null; }
  for (let k = 0; k < nCh; k++) { if (!mbs[k] || !mbs[k].nv) continue; const m = mbs[k].build(); PROPS.chunks.push(m); }
}
function drawProps(phase) {
  if (phase !== 0) return;
  useProg(PROGS.static); bindTex(0, TEX.prop, gl.TEXTURE_2D_ARRAY); gl.disable(gl.CULL_FACE);
  const cp = CAM.pos;
  for (const c of PROPS.chunks) { if (!sphereInFrustum(CAM.planes, c.cx, c.cy, c.cz, c.r)) continue; if (Math.hypot(c.cx - cp[0], c.cz - cp[2]) - c.r > 1600) continue; gl.bindVertexArray(c.vao); gl.drawElements(gl.TRIANGLES, c.count, c.itype, 0); REN.stats.tris += c.count / 3; }
  gl.enable(gl.CULL_FACE);
}
function drawPropsShadow(ci, C) {
  useProg(PROGS.sh_static); gl.disable(gl.CULL_FACE);
  for (const c of PROPS.chunks) { if (Math.hypot(c.cx - C[0], c.cz - C[2]) - c.r > C[3] + 60) continue; gl.bindVertexArray(c.vao); gl.drawElements(gl.TRIANGLES, c.count, c.itype, 0); }
  gl.enable(gl.CULL_FACE);
}
