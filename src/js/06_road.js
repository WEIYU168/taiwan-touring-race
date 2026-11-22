// ───────────────────────── 路面、路肩、標線 ─────────────────────────
const ROAD = { chunks: [], side: null, decals: null, CH: 50 };
const BARRIER_OFF = 1.5;                 // 路面邊緣到護欄
const SH_OFF = [0, 0.4, 1.0, 2.2, 3.6, 5.5, 8, 11, 14, 17.3, 22];
let JUNCTIONS = [
  { s: 1965, w: 15, len: 170, sides: [1, -1], name: '台74甲' },
  { s: 4900, w: 9, len: 150, sides: [1, -1], name: '縣道148' },
  { s: 10500, w: 9, len: 150, sides: [-1], name: '縣道150' }
];
function inJunction(s, pad = 0) { for (const j of JUNCTIONS) if (Math.abs(s - j.s) < j.w * 0.5 + pad) return j; return null; }

// 路面屬性：紅色防滑鋪面、減速標線、標線型式
function roadFlags(i) {
  const s = i * DS, k = Math.abs(TR.k[i]);
  let red = 0, bars = 0, mark = 0;
  // 急彎前 30–60 m 的紅色防滑鋪面
  let ahead = 0; for (let j = 6; j <= 20 && i + j < TR.n; j += 2) ahead = Math.max(ahead, Math.abs(TR.k[i + j]));
  if (ahead > 0.0225 && k < 0.012 && s > 300) red = 1;
  if (ahead > 0.017 && k < 0.008 && s > 300) { const m = (s % 60); if (m < 9) bars = 1; }
  // 直線段黃虛線，其餘雙黃線
  let straight = 1; for (let j = -25; j <= 25; j += 5) { const q = clamp(i + j, 0, TR.n - 1); if (Math.abs(TR.k[q]) > 0.0035) straight = 0; }
  const zn = zoneOf(s).id; if (straight && (zoneOf(s).dash || zn === 'plateau' || zn === 'tea' || zn === 'tunnel' || zn === 'pine')) mark = 1;
  const jn = inJunction(s, 2) ? 1 : 0;
  return [red, bars, mark, jn];
}

function buildRoad() {
  ROAD.chunks = [];
  const CH = ROAD.CH, tr = {};
  const nSh = SH_OFF.length;
  for (let c0 = 0; c0 < TR.n - 1; c0 += CH) {
    const c1 = Math.min(TR.n - 1, c0 + CH), ns = c1 - c0 + 1;
    // ── 路面
    const NU = 5, P = new Float32Array(ns * NU * 3), N = new Float32Array(ns * NU * 3), U = new Float32Array(ns * NU * 4), X = new Uint8Array(ns * NU * 4);
    for (let j = 0; j < ns; j++) {
      const i = c0 + j; const hw = TR.hw[i], fl = roadFlags(i);
      for (let k = 0; k < NU; k++) {
        const u = (k / (NU - 1) * 2 - 1) * hw, o = (j * NU + k);
        P[o * 3] = TR.x[i] + TR.nx[i] * u; P[o * 3 + 1] = TR.y[i] - TR.bank[i] * u; P[o * 3 + 2] = TR.z[i] + TR.nz[i] * u;
        // normal: up tilted by bank and grade
        let nx = TR.nx[i] * TR.bank[i] - TR.tx[i] * TR.grade[i], ny = 1, nz = TR.nz[i] * TR.bank[i] - TR.tz[i] * TR.grade[i]; const l = Math.hypot(nx, ny, nz);
        N[o * 3] = nx / l; N[o * 3 + 1] = ny / l; N[o * 3 + 2] = nz / l;
        U[o * 4] = u; U[o * 4 + 1] = i * DS; U[o * 4 + 2] = hw; U[o * 4 + 3] = fl[2];
        X[o * 4] = fl[0] * 255; X[o * 4 + 1] = fl[1] * 255; X[o * 4 + 2] = fl[3] * 255; X[o * 4 + 3] = 0;
      }
    }
    const idx = new Uint16Array((ns - 1) * (NU - 1) * 6); let q = 0;
    for (let j = 0; j < ns - 1; j++) for (let k = 0; k < NU - 1; k++) { const a = j * NU + k; idx[q++] = a; idx[q++] = a + NU; idx[q++] = a + NU + 1; idx[q++] = a; idx[q++] = a + NU + 1; idx[q++] = a + 1; }
    const road = mkVAO([{ loc: 0, data: P, size: 3 }, { loc: 1, data: N, size: 3 }, { loc: 2, data: U, size: 4 }, { loc: 3, data: X, size: 4, type: gl.UNSIGNED_BYTE, norm: true }], idx);
    // ── 路肩（兩側）
    const nv = ns * nSh * 2, SP = new Float32Array(nv * 3), SN = new Int8Array(nv * 4), M0 = new Uint8Array(nv * 4), M1 = new Uint8Array(nv * 4), M2 = new Uint8Array(nv * 2);
    for (let side = 0; side < 2; side++) {
      const sg = side ? -1 : 1, base = side * ns * nSh;
      for (let j = 0; j < ns; j++) {
        const i = c0 + j, s = i * DS; trackAt(s, tr); const hw = tr.hw;
        const zid = zoneOf(s).id, townish = zid === 'city' || zid === 'town' || !!zoneOf(s).town, brg = ROUTE.bridge(s) > 0.5;
        for (let k = 0; k < nSh; k++) {
          const d = sg * (hw + SH_OFF[k]), x = TR.x[i] + TR.nx[i] * d, z = TR.z[i] + TR.nz[i] * d, o = base + j * nSh + k;
          let y;
          if (k === 0) y = TR.y[i] - TR.bank[i] * d;
          else if (k === nSh - 1) y = gridH(x, z) - 2.2;
          else y = shoulderY(s, d, tr, x, z);
          SP[o * 3] = x; SP[o * 3 + 1] = y; SP[o * 3 + 2] = z;
          const gi = gridIdx(x, z); const lu = gi >= 0 ? TG.LU[gi] : 0, orr = gi >= 0 ? TG.OR[gi] : 0;
          const a = terrainAttrs(lu, orr, 0, hw + SH_OFF[k], hw);
          if (gi >= 0 && (TG.MASK[gi] & 2)) { a.fill(0); a[5] = 1; }
          if (brg) { a.fill(0); a[5] = 1; }
          else if (SH_OFF[k] < 0.9) { a.fill(0); a[5] = k ? 0.55 : 0.9; a[0] = 0.2; }
          else if (townish && SH_OFF[k] < 12) { a.fill(0); a[5] = 1; }
          for (let m = 0; m < 4; m++) { M0[o * 4 + m] = a[m] * 255; M1[o * 4 + m] = a[4 + m] * 255; }
          M2[o * 2] = 0; M2[o * 2 + 1] = a[9] * 255;
        }
      }
      // normals + 邊坡裸露
      for (let j = 0; j < ns; j++) for (let k = 0; k < nSh; k++) {
        const o = base + j * nSh + k, ja = base + Math.max(0, j - 1) * nSh + k, jb = base + Math.min(ns - 1, j + 1) * nSh + k, ka = base + j * nSh + Math.max(0, k - 1), kb = base + j * nSh + Math.min(nSh - 2, k + 1);
        const ax = SP[jb * 3] - SP[ja * 3], ay = SP[jb * 3 + 1] - SP[ja * 3 + 1], az = SP[jb * 3 + 2] - SP[ja * 3 + 2];
        const bx = SP[kb * 3] - SP[ka * 3], by = SP[kb * 3 + 1] - SP[ka * 3 + 1], bz = SP[kb * 3 + 2] - SP[ka * 3 + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1; SN[o * 4] = nx / l * 127; SN[o * 4 + 1] = ny / l * 127; SN[o * 4 + 2] = nz / l * 127;
        const slope = Math.hypot(nx, nz) / Math.max(0.05, ny);
        if (k > 3 && k < nSh - 1) { const rock = smooth(0.6, 1.0, slope); M1[o * 4 + 2] = Math.max(M1[o * 4 + 2], rock * 255); }
      }
    }
    const sidx = new Uint16Array((ns - 1) * (nSh - 1) * 12); q = 0;
    for (let side = 0; side < 2; side++) { const base = side * ns * nSh;
      for (let j = 0; j < ns - 1; j++) for (let k = 0; k < nSh - 1; k++) { const a = base + j * nSh + k, b = a + nSh;
        if (side === 0) { sidx[q++] = a; sidx[q++] = b; sidx[q++] = b + 1; sidx[q++] = a; sidx[q++] = b + 1; sidx[q++] = a + 1; }
        else { sidx[q++] = a; sidx[q++] = b + 1; sidx[q++] = b; sidx[q++] = a; sidx[q++] = a + 1; sidx[q++] = b + 1; } } }
    const sh = mkVAO([{ loc: 0, data: SP, size: 3 }, { loc: 1, data: SN, size: 4, type: gl.BYTE, norm: true }, { loc: 3, data: M0, size: 4, type: gl.UNSIGNED_BYTE, norm: true },
    { loc: 4, data: M1, size: 4, type: gl.UNSIGNED_BYTE, norm: true }, { loc: 5, data: M2, size: 2, type: gl.UNSIGNED_BYTE, norm: true }], sidx);
    const im = (c0 + c1) >> 1;
    ROAD.chunks.push({ road, sh, cx: TR.x[im], cy: TR.y[im], cz: TR.z[im], r: CH * DS * 0.5 + 30, i0: c0, i1: c1 });
  }
  buildSideRoads();
  buildDecals();
}

// 交叉路口的橫向道路（賽事期間封閉）
function sideRoadPath(j, sg, t) { // t 公尺，自主線中心向外
  const tr = trackAt(j.s, {});
  const x = tr.x + tr.nx * sg * t, z = tr.z + tr.nz * sg * t;
  return [x, z, tr];
}
function prepareJunctions() { // 在地形網格建立前整平
  for (const j of JUNCTIONS) for (const sg of j.sides) {
    const tr = trackAt(j.s, {});
    for (let t = tr.hw + 6; t < j.len; t += 5) {
      const [x, z] = sideRoadPath(j, sg, t);
      const y = tr.y - 0.5 - Math.max(0, t - 30) * 0.055;
      const gy = gridH(x, z);
      flattenPad(x, z, j.w * 0.5 + 2, Math.min(gy + 3, Math.max(y, gy - 6)));
      markClear(x, z, j.w * 0.5 + 5, 1);
    }
  }
}
function buildSideRoads() {
  const P = [], N = [], U = [], X = [], I = [];
  for (const j of JUNCTIONS) for (const sg of j.sides) {
    const tr = trackAt(j.s, {}), base = P.length / 3; let n = 0;
    for (let t = tr.hw - 0.3; t <= j.len; t += 4) {
      const [x, z] = sideRoadPath(j, sg, t);
      const yb = t < tr.hw + 3 ? tr.y - tr.bank * sg * t + 0.02 : lerp(tr.y - tr.bank * sg * (tr.hw + 3) + 0.02, gridH(x, z) + 0.55, smooth(tr.hw + 3, tr.hw + 22, t));
      for (let k = 0; k < 3; k++) {
        const u = (k - 1) * j.w * 0.5;
        P.push(x + tr.tx * u, yb, z + tr.tz * u); N.push(0, 1, 0); U.push(u, t, j.w * 0.5, 0); X.push(0, 0, t < tr.hw + 4 ? 255 : 0, 0);
      }
      n++;
    }
    for (let a = 0; a < n - 1; a++) for (let k = 0; k < 2; k++) { const o = base + a * 3 + k; if (sg > 0) I.push(o, o + 3, o + 4, o, o + 4, o + 1); else I.push(o, o + 4, o + 3, o, o + 1, o + 4); }
  }
  ROAD.side = mkVAO([{ loc: 0, data: new Float32Array(P), size: 3 }, { loc: 1, data: new Float32Array(N), size: 3 }, { loc: 2, data: new Float32Array(U), size: 4 }, { loc: 3, data: new Uint8Array(X), size: 4, type: gl.UNSIGNED_BYTE, norm: true }], new Uint16Array(I));
}

// 路面貼花：沿路面曲率的薄片
function buildDecals() {
  const P = [], U = [], I = []; const tr = {};
  const add = (s0, len, d0, w, layer, u0 = 0, u1 = 1, v0 = 0, v1 = 1) => {
    const seg = Math.max(2, Math.ceil(len / 1.5)), base = P.length / 3;
    for (let a = 0; a <= seg; a++) {
      const f = a / seg, s = s0 + len * f; trackAt(s, tr);
      for (let k = 0; k < 2; k++) { const d = d0 + (k ? -w / 2 : w / 2); P.push(tr.x + tr.nx * d, tr.y - tr.bank * d + 0.012, tr.z + tr.nz * d); U.push(k ? u1 : u0, lerp(v0, v1, f), layer); }
    }
    for (let a = 0; a < seg; a++) { const o = base + a * 2; I.push(o, o + 2, o + 3, o, o + 3, o + 1); }
  };
  ROAD.addDecal = add;
  const solid = [0.08, 0.2, 0.1, 0.9];
  // 起跑線與發車格
  add(S_START, 0.6, 0, TR.hw[S_START / DS | 0] * 2 - 1.2, 4, 0.06, 0.18, 0.1, 0.9);
  for (let g = 0; g < 8; g++) { const s = S_START - 7 - g * 7.5, d = (g % 2 ? -1 : 1) * 2.1; add(s + 2.6, 0.18, d, 2.6, 4, 0.06, 0.18, 0.1, 0.9); add(s + 0.4, 2.3, d + 1.3, 0.14, 4, 0.06, 0.18, 0.1, 0.9); add(s + 0.4, 2.3, d - 1.3, 0.14, 4, 0.06, 0.18, 0.1, 0.9); }
  // 終點格線
  add(S_FINISH - 2, 4, 0, TR.hw[S_FINISH / DS | 0] * 2 - 0.9, 3, 0, 1, 0, 0.25);
  // 「慢」「40」
  let last = -999;
  for (let i = 150; i < TR.n - 60; i++) {
    const s = i * DS, k = Math.abs(TR.k[i + 22]), k0 = Math.abs(TR.k[i]);
    if (k > 0.017 && k0 < 0.008 && s - last > 150 && !inJunction(s, 30) && s < S_FINISH - 100) { add(s, 5.2, -TR.hw[i] * 0.5, 2.0, 0); last = s; }
  }
  for (const s of ROUTE.decal40) add(s, 5.2, -TR.hw[s / DS | 0] * 0.5, 1.9, 1);
  // 路口斑馬線
  for (const j of JUNCTIONS) { const hw = trackAt(j.s, tr).hw; add(j.s - j.w * 0.5 - 5.5, 3, 0, hw * 2 - 1, 4, 0, hw * 2 / 1.2 / 4, 0, 1); add(j.s + j.w * 0.5 + 2.5, 3, 0, hw * 2 - 1, 4, 0, hw * 2 / 1.2 / 4, 0, 1); }
  for (const zs of ROUTE.zebras) { const w = trackAt(zs, tr).hw * 2 - 1; add(zs, 3, 0, w, 4, 0, w / 1.2 / 4, 0, 1); }
  if (typeof hazardDecals === 'function') hazardDecals(add);
  ROAD.decals = mkVAO([{ loc: 0, data: new Float32Array(P), size: 3 }, { loc: 2, data: new Float32Array(U), size: 3 }], new Uint16Array(I));
}

const ROAD_VS = GLSL_HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aUV; layout(location=3) in vec4 aX;
out vec3 vW; out vec3 vN; out vec4 vUV; out vec4 vX;
void main(){ vW = aPos; vN = aNrm; vUV = aUV; vX = aX; gl_Position = uViewProj * vec4(aPos, 1.); }`;
const ROAD_FS = GLSL_HEAD + GLSL_LIGHT + `
uniform sampler2DArray uTex0;
in vec3 vW; in vec3 vN; in vec4 vUV; in vec4 vX;
out vec4 oCol;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  float u = vUV.x, s = vUV.y, hw = vUV.z;
  vec3 V = uCam.xyz - vW; float dist = length(V); V /= dist;
  vec2 w = vW.xz;
  float near = 1. - smoothstep(20., 120., dist);
  vec3 col = mix(texture(uTex0, vec3(w/23., 4.)).rgb, texture(uTex0, vec3(w/2.9, 4.)).rgb, near*.85);
  vec4 nzA = texture(uNoise, w/113.), nzB = texture(uNoise, vec2(u/9.1, s/47.)), nzC = texture(uNoise, w/7.3);
  col *= mix(.74, 1.14, nzA.r) * mix(.92, 1.06, nzB.r);
  // 補丁
  vec2 pc = vec2(floor(u/2.4 + 11.), floor(s/11.)); float ph = hash21(pc);
  vec2 pf = vec2(fract(u/2.4 + 11.), fract(s/11.));
  float pm = step(.955, ph) * smoothstep(.0,.03,pf.x)*smoothstep(1.,.97,pf.x)*smoothstep(.0,.01,pf.y)*smoothstep(1.,.99,pf.y) * step(pf.y, .25 + hash21(pc+5.)*.7);
  col *= mix(1., .66 + .22*hash21(pc+3.), pm);
  // 輪跡（較亮較滑）
  float ln = abs(abs(u) - hw*.5);
  float track = smoothstep(.6,.15, abs(ln - .85));
  col *= 1. + track*.11*(.4+nzB.g);
  // 車道中央的油漬帶（較暗）
  col *= 1. - .1*smoothstep(.55, .0, ln)*(.4 + nzB.g)*smoothstep(.3, .6, nzA.b + .2);
  // 裂縫補膠
  float crack = (1. - smoothstep(.006, .016, abs(nzB.a - .5))) * step(.52, nzA.g) * near;
  col *= 1. - crack*.5;
  // 紅色防滑鋪面
  vec3 redc = vec3(.30,.075,.05) * (.75 + .5*texture(uTex0, vec3(w/2.9, 4.)).r*2.);
  col = mix(col, redc, vX.r*.88*smoothstep(.2,.55, nzB.b + .25));
  // 標線
  float aa = fwidth(u) + .004;
  float wear = texture(uTex0, vec3(u/3.3, s/8.3, 5.)).r;
  float wm = smoothstep(.2, .46, wear);
  float edgeL = 1. - smoothstep(.07, .07+aa, abs(abs(u) - (hw - .42)));
  float dbl = 1. - smoothstep(.05, .05+aa, abs(abs(u) - .13));
  float sgl = (1. - smoothstep(.065, .065+aa, abs(u))) * step(fract(s/10.), .4);
  float cen = mix(dbl, sgl, step(.5, vUV.w)) * (1. - vX.b);
  float fadeM = 1. - smoothstep(700., 1500., dist);
  vec3 white = vec3(.70,.70,.66), yellow = vec3(.72,.47,.03);
  float bars = step(fract(s/1.5), .2) * vX.g * (1. - smoothstep(.0, .3, abs(u) - (hw-.8)));
  float mkW = max(edgeL*(1.-vX.b), bars) * wm * fadeM, mkY = cen * wm * fadeM;
  col = mix(col, white*(.82+.18*wear), mkW);
  col = mix(col, yellow*(.82+.18*wear), mkY);
  float mark = max(mkW, mkY);
  // 光照
  vec3 n = normalize(vN + vec3(nzC.r-.5, 0., nzC.g-.5)*.16*near);
  float ndl = max(dot(n, uSun.xyz), 0.);
  float sh = shadowAt(vW, normalize(vN));
  vec3 H = normalize(uSun.xyz + V); float ndh = max(dot(n,H),0.), ndv = max(dot(n,V),0.);
  float rough = mix(mix(.6, .44, track) + (nzC.b-.5)*.1, .34, mark);
  float F = .035 + .965*pow(1.-max(dot(H,V),0.), 5.);
  vec3 spec = uSunCol.rgb * sh * ndl * ggx(ndh, rough) * F * .25;
  // 柏油骨材的細小反光點（近距離、順光時閃爍）
  float glint = step(.988, hash21(floor(w*46.))) * near * near * (1. - mark);
  spec += uSunCol.rgb * sh * ndl * glint * pow(ndh, 6.) * .35;
  float Fg = pow(1.-ndv, 5.);
  vec3 refl = skyAt(reflect(-V, n)) * Fg * .22 * mix(.5, 1., sh);
  vec3 lit = col * (uSunCol.rgb * ndl * sh + ambientL(n)) + spec + refl;
  oCol = vec4(fogged(lit, vW), 1.);
}`;
const DECAL_VS = GLSL_HEAD + `
layout(location=0) in vec3 aPos; layout(location=2) in vec3 aUV;
out vec3 vW; out vec3 vUV;
void main(){ vW = aPos; vUV = aUV; gl_Position = uViewProj * vec4(aPos, 1.); }`;
const DECAL_FS = GLSL_HEAD + GLSL_LIGHT + `
uniform sampler2DArray uTex0;
in vec3 vW; in vec3 vUV; out vec4 oCol;
void main(){
  vec4 t = texture(uTex0, vUV);
  if(t.a < .02) discard;
  vec3 n = vec3(0.,1.,0.);
  float sh = shadowAt(vW, n);
  vec3 lit = t.rgb*.72 * (uSunCol.rgb * max(uSun.y,0.) * sh + ambientL(n));
  if(vUV.z > 5.5){ // 油漬：深色、鏡面反射與彩虹薄膜
    vec3 V = normalize(uCam.xyz - vW); float F = .04 + .96*pow(1. - max(V.y, 0.), 5.);
    float nz = texture(uNoise, vW.xz*.35).r;
    vec3 film = .5 + .5*cos(6.2831*(nz*1.6 + vec3(0., .33, .67)));
    lit = vec3(.008) + skyAt(normalize(vec3(-V.x, abs(V.y) + .02, -V.z))) * (F*.9 + .05) * mix(vec3(1.), film, .3) * mix(.6, 1., sh);
    lit += uSunCol.rgb * sh * pow(max(dot(reflect(-uSun.xyz, n), V), 0.), 120.) * 2.;
  }
  oCol = vec4(fogged(lit, vW), t.a*.9);
}`;
