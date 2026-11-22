// ───────────────────────── 植被：樹木、草叢、茶園、鳳梨田 ─────────────────────────
const VEG = { sv: [], chunks: [], CHS: 30, bill: null, impTex: null, cover: {}, stats: {} };
const VEG_VS = (defs) => GLSL_HEAD + defs + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aUV; layout(location=3) in vec4 aCol;
layout(location=5) in vec4 iA; layout(location=6) in vec4 iB;
uniform vec4 uFade; // x near, y far (距離縮放), z wind scale
out vec3 vW; out vec3 vN; out vec3 vUV; out vec4 vCol; out float vFade;
void main(){
  float c = cos(iB.x), s = sin(iB.x);
  vec3 p = aPos * iA.w; p.y += aPos.z * iA.w * iB.w;
  vec3 base = iA.xyz;
  float dist = distance(base, uCam.xyz);
  float k = 1. - smoothstep(uFade.x, uFade.y, dist);
  p *= mix(.0, 1., k);
  vec3 w = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z) + base;
  vec3 n = vec3(c*aNrm.x + s*aNrm.z, aNrm.y, -s*aNrm.x + c*aNrm.z);
  float sw = aCol.a * uAmbSky.w * uFade.z, t = uCam.w, ph = dot(base.xz, vec2(.13,.11));
  vec2 wind = vec2(sin(t*1.25 + ph + w.y*.31), cos(t*1.07 + ph*1.3 + w.x*.23)) * .07;
  wind += vec2(sin(t*3.9 + w.x*2.1 + w.y*1.7), sin(t*3.4 + w.z*1.9 + w.y)) * .018;
  w.xz += wind * sw * (.4 + p.y*.16);
  vW = w; vN = n; vUV = aUV; vCol = aCol; vCol.rgb *= mix(vec3(.82,.88,.8), vec3(1.12,1.08,1.), iB.y); vFade = iB.z;
  gl_Position = uViewProj * vec4(w, 1.);
}`;
const VEG_FS = (defs) => GLSL_HEAD + defs + GLSL_LIGHT + `
uniform sampler2DArray uTex0;
in vec3 vW; in vec3 vN; in vec3 vUV; in vec4 vCol; in float vFade;
out vec4 oCol;
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(.06711056,.00583715)))); }
void main(){
  vec4 t = texture(uTex0, vUV);
  float opaque = step(11.5, vUV.z)*step(vUV.z, 14.5);
  float a = max(t.a, opaque);
  vec2 dx = dFdx(vUV.xy)*256., dy = dFdy(vUV.xy)*256.; float lod = .5*log2(max(dot(dx,dx), dot(dy,dy)) + 1e-6);
  float thr = mix(.46, .2, clamp(lod*.3, 0., 1.));
#ifdef SHADOW
  if(a < thr) discard; oCol = vec4(0.);
#else
  if(vFade < .99 && ign(gl_FragCoord.xy) > vFade) discard;
  if(uMisc.x > .5){ a = clamp((a - thr)/max(fwidth(a), .002) + .5, 0., 1.); if(a < .03) discard; } else { if(a < thr) discard; a = 1.; }
  vec3 base = t.rgb * vCol.rgb*vCol.rgb*1.7;
#ifdef BAKE
  oCol = vec4(base, 1.);
#else
  vec3 n = normalize(vN); vec3 V = normalize(uCam.xyz - vW);
  float ndl = dot(n, uSun.xyz);
  float wrap = max((ndl + .42)/1.42, 0.);
  float sh = shadowAt(vW, n*.6);
  float back = pow(max(dot(-V, uSun.xyz), 0.), 4.) * (1.-opaque);
  vec3 lit = base * (uSunCol.rgb * wrap * sh + ambientL(n) * mix(.72, 1., wrap));
  lit += base * vec3(1.2, 1.25, .4) * back * .5 * uSunCol.rgb * sh;
  oCol = vec4(fogged(lit, vW), a);
#endif
#endif
}`;
const BILL_VS = GLSL_HEAD + `
layout(location=0) in vec2 aPos; layout(location=5) in vec4 iA; layout(location=6) in vec4 iB;
out vec3 vW; out vec2 vQ; out vec3 vR; out vec3 vT; out vec4 vB;
void main(){
  vec3 base = iA.xyz; vec3 toC = uCam.xyz - base; toC.y = 0.; toC = normalize(toC + vec3(1e-4,0.,0.));
  vec3 r = vec3(toC.z, 0., -toC.x);
  vec3 w = base + r*aPos.x*iA.w*.5 + vec3(0., aPos.y*iA.w, 0.);
  vW = w; vQ = vec2(aPos.x*.5+.5, aPos.y); vR = r; vT = toC; vB = iB;
  gl_Position = uViewProj * vec4(w, 1.);
}`;
const BILL_FS = GLSL_HEAD + GLSL_LIGHT + `
uniform sampler2DArray uTex0;
in vec3 vW; in vec2 vQ; in vec3 vR; in vec3 vT; in vec4 vB; out vec4 oCol;
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(.06711056,.00583715)))); }
void main(){
  vec4 t = texture(uTex0, vec3(vQ, vB.x));
  if(t.a < .38) discard;
  if(vB.z < .99 && ign(gl_FragCoord.xy) > vB.z) discard;
  vec3 base = t.rgb/max(t.a, .3) * mix(vec3(.82,.88,.8), vec3(1.12,1.08,1.), vB.y);
  vec3 n = normalize(vR*(vQ.x-.5)*1.7 + vec3(0.,1.,0.)*(vQ.y-.4)*1.5 + vT*.5);
  float wrap = max((dot(n, uSun.xyz) + .42)/1.42, 0.);
  float sh = shadowAt(vW, n*.6);
  vec3 V = normalize(uCam.xyz - vW);
  float back = pow(max(dot(-V, uSun.xyz), 0.), 4.);
  vec3 lit = base * (uSunCol.rgb * wrap * sh + ambientL(n) * mix(.72, 1., wrap)) + base * vec3(1.2,1.25,.4) * back * .35 * uSunCol.rgb * sh;
  oCol = vec4(fogged(lit, vW), 1.);
}`;

// ── 網格產生器
class VB {
  constructor() { this.p = []; this.n = []; this.t = []; this.c = []; this.i = []; }
  v(x, y, z, nx, ny, nz, u, v, layer, r, g, b, sw) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.t.push(u, v, layer); this.c.push(sat(r) * 255, sat(g) * 255, sat(b) * 255, sat(sw) * 255); return this.p.length / 3 - 1; }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  build() {
    const m = mkVAO([{ loc: 0, data: new Float32Array(this.p), size: 3 }, { loc: 1, data: new Float32Array(this.n), size: 3 }, { loc: 2, data: new Float32Array(this.t), size: 3 },
    { loc: 3, data: new Uint8Array(this.c), size: 4, type: gl.UNSIGNED_BYTE, norm: true }], new Uint16Array(this.i));
    m.instBuf = gl.createBuffer(); m.instCap = 0;
    gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ARRAY_BUFFER, m.instBuf);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(5, 1);
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(6, 1);
    gl.bindVertexArray(null);
    let R = 0, H = 0; for (let k = 0; k < this.p.length; k += 3) { R = Math.max(R, Math.hypot(this.p[k], this.p[k + 2])); H = Math.max(H, this.p[k + 1]); }
    m.R = Math.max(R, H / 2) * 1.03; m.H = H;
    return m;
  }
}
function vbCard(vb, cx, cy, cz, nx, ny, nz, ox, oy, oz, size, layer, r, g, b, sw, R, aspect = 1) {
  // U,V 張成卡片；(ox,oy,oz) 為樹冠球面法線
  let ux = nz, uy = 0, uz = -nx; let l = Math.hypot(ux, uz);
  if (l < 0.05) { ux = 1; uz = 0; l = 1; } ux /= l; uz /= l;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  const rot = R() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
  const ax = ux * cr + vx * sr, ay = uy * cr + vy * sr, az = uz * cr + vz * sr, bx = -ux * sr + vx * cr, by = -uy * sr + vy * cr, bz = -uz * sr + vz * cr;
  const h = size / 2, hb = h * aspect, id = [];
  const C = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
  for (const q of C) {
    const px = cx + ax * q[0] * h + bx * q[1] * hb, py = cy + ay * q[0] * h + by * q[1] * hb, pz = cz + az * q[0] * h + bz * q[1] * hb;
    let mx = ox + (ax * q[0] + bx * q[1]) * 0.3 + nx * 0.15, my = oy + (ay * q[0] + by * q[1]) * 0.3 + ny * 0.15, mz = oz + (az * q[0] + bz * q[1]) * 0.3 + nz * 0.15; const ml = Math.hypot(mx, my, mz) || 1;
    id.push(vb.v(px, py, pz, mx / ml, my / ml, mz / ml, q[2], q[3], layer, r, g, b, sw));
  }
  vb.quad(id[0], id[1], id[2], id[3]);
}
function vbTube(vb, pts, sides, layer, r, g, b, vscale = 0.5) {
  // pts: [x,y,z,radius]
  const rings = [];
  let vacc = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k]; if (k) vacc += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1], p[2] - pts[k - 1][2]);
    const ring = [];
    for (let a = 0; a <= sides; a++) { const an = a / sides * TAU, c = Math.cos(an), s = Math.sin(an); ring.push(vb.v(p[0] + c * p[3], p[1], p[2] + s * p[3], c, 0.15, s, a / sides * 2, vacc * vscale, layer, r, g, b, k / (pts.length - 1) * 0.25)); }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let a = 0; a < sides; a++) vb.quad(rings[k][a], rings[k + 1][a], rings[k + 1][a + 1], rings[k][a + 1]);
}
const rUnit = R => { const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u); return [Math.cos(a) * s, u, Math.sin(a) * s]; };
function vbBlob(vb, R, c, rad, n, cs, layer, tint, crownC, crownR, lodK) {
  n = Math.max(3, Math.round(n * lodK.n)); cs *= lodK.s;
  for (let k = 0; k < n; k++) {
    const d = rUnit(R); if (d[1] < -0.35) d[1] *= 0.35;
    const f = 0.5 + 0.5 * Math.sqrt(R());
    const px = c[0] + d[0] * rad[0] * f, py = c[1] + d[1] * rad[1] * f, pz = c[2] + d[2] * rad[2] * f;
    let ox = px - crownC[0], oy = py - crownC[1], oz = pz - crownC[2]; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    const q = rUnit(R); let nx = ox * 0.55 + q[0] * 0.85, ny = oy * 0.55 + q[1] * 0.85, nz = oz * 0.55 + q[2] * 0.85; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const rf = sat(ol / crownR), hf = sat((py - (crownC[1] - crownR)) / (2 * crownR));
    const ao = (0.42 + 0.58 * Math.pow(rf, 1.4)) * (0.66 + 0.34 * hf), tv = 0.86 + 0.28 * R();
    vbCard(vb, px, py, pz, nx, ny, nz, ox, oy, oz, cs * (0.8 + R() * 0.45), layer, tint[0] * ao * tv, tint[1] * ao * tv, tint[2] * ao * tv, 0.35 + 0.65 * rf, R);
  }
}
// 樹種
const SPECIES = {
  acacia: (R, L) => { const vb = new VB(), h = 9.5 + R() * 2.5, lean = (R() - 0.5) * 1.6;
    const tr = [[0, -0.6, 0, 0.26], [lean * 0.15, 1.6, 0.05, 0.2], [lean * 0.45, 3.4, -0.1, 0.16], [lean * 0.7, 5.0, 0, 0.11]];
    vbTube(vb, tr, L.sides, LEAF.BARK, 0.62, 0.56, 0.5);
    const cc = [lean * 0.8, h * 0.68, 0], cr = h * 0.42;
    for (let b = 0; b < 5; b++) { const a = b / 5 * TAU + R(), rr = 1.6 + R() * 1.3, c = [cc[0] + Math.cos(a) * rr, h * (0.56 + R() * 0.22), cc[2] + Math.sin(a) * rr];
      vbTube(vb, [[tr[3][0], tr[3][1] - 0.6, 0, 0.08], [c[0] * 0.8 + tr[3][0] * 0.2, c[1] - 0.6, c[2] * 0.8, 0.04]], 3, LEAF.BARK, 0.6, 0.55, 0.5);
      vbBlob(vb, R, c, [2.5 + R() * 0.8, 1.6 + R() * 0.6, 2.5 + R() * 0.8], 24, 2.3, LEAF.ACACIA, [0.74, 0.78, 0.66], cc, cr, L); }
    return vb; },
  broad: (R, L) => { const vb = new VB(), h = 8.5 + R() * 3;
    const tr = [[0, -0.6, 0, 0.36], [0.1, 1.2, 0, 0.28], [0.05, 2.6, 0.1, 0.22], [0, 3.8, 0, 0.14]];
    vbTube(vb, tr, L.sides, LEAF.BARK, 0.7, 0.66, 0.62);
    const cc = [0, h * 0.62, 0], cr = h * 0.48;
    for (let b = 0; b < 6; b++) { const a = b / 6 * TAU + R(), rr = b < 5 ? 2.2 + R() * 1.4 : 0, c = [Math.cos(a) * rr, h * (b < 5 ? 0.5 + R() * 0.2 : 0.8), Math.sin(a) * rr];
      if (b < 5) vbTube(vb, [[0, 3.0, 0, 0.1], [c[0] * 0.75, c[1] - 0.5, c[2] * 0.75, 0.05]], 3, LEAF.BARK, 0.66, 0.62, 0.58);
      vbBlob(vb, R, c, [2.8 + R() * 0.8, 1.9 + R() * 0.5, 2.8 + R() * 0.8], 22, 2.5, LEAF.BROAD, [0.76, 0.8, 0.7], cc, cr, L); }
    return vb; },
  terminalia: (R, L) => { const vb = new VB(), h = 11.5 + R() * 2;
    vbTube(vb, [[0, -0.6, 0, 0.2], [0, h * 0.4, 0, 0.14], [0, h * 0.75, 0, 0.08], [0, h * 0.97, 0, 0.03]], L.sides, LEAF.BARK, 0.72, 0.7, 0.66);
    const tiers = 5, cc = [0, h * 0.62, 0];
    for (let t = 0; t < tiers; t++) { const y = h * (0.36 + t * 0.145), rad = (5.0 - t * 0.78) * (0.9 + R() * 0.2), n = Math.max(4, Math.round((26 - t * 3.5) * L.n));
      for (let k = 0; k < n; k++) { const a = R() * TAU, rr = rad * (0.25 + 0.75 * Math.sqrt(R())), px = Math.cos(a) * rr, pz = Math.sin(a) * rr, py = y + (R() - 0.5) * 0.5 - rr * 0.05;
        const q = rUnit(R); let nx = q[0] * 0.3, ny = 1, nz = q[2] * 0.3; const nl = Math.hypot(nx, ny, nz);
        let ox = px * 0.25, oy = 1.1, oz = pz * 0.25; const ol = Math.hypot(ox, oy, oz); const rf = rr / rad, ao = (0.55 + 0.45 * rf) * (0.72 + 0.07 * t), tv = 0.88 + 0.24 * R();
        vbCard(vb, px, py, pz, nx / nl, ny / nl, nz / nl, ox / ol, oy / ol, oz / ol, 2.5 * L.s * (0.8 + R() * 0.4), LEAF.TERM, 0.82 * ao * tv, 0.86 * ao * tv, 0.7 * ao * tv, 0.4 + 0.6 * rf, R); }
      for (let b = 0; b < (L.sides > 4 ? 5 : 0); b++) { const a = b / 5 * TAU + t; vbTube(vb, [[0, y - 0.3, 0, 0.05], [Math.cos(a) * rad * 0.8, y, Math.sin(a) * rad * 0.8, 0.02]], 3, LEAF.BARK, 0.7, 0.68, 0.64); } }
    return vb; },
  lychee: (R, L) => { const vb = new VB(), h = 4.6 + R() * 1.2;
    vbTube(vb, [[0, -0.5, 0, 0.2], [0.05, 0.8, 0, 0.17], [0, 1.6, 0, 0.12]], L.sides, LEAF.BARK, 0.6, 0.56, 0.52);
    const cc = [0, h * 0.52, 0], cr = h * 0.56;
    vbBlob(vb, R, [0, h * 0.56, 0], [3.1, h * 0.44, 3.1], 64, 2.2, LEAF.LYCHEE, [0.74, 0.78, 0.7], cc, cr, L);
    return vb; },
  betel: (R, L) => { const vb = new VB(), h = 11 + R() * 3, lx = (R() - 0.5) * 0.5;
    vbTube(vb, [[0, -0.5, 0, 0.11], [lx * 0.3, h * 0.35, 0, 0.085], [lx * 0.7, h * 0.7, 0, 0.075], [lx, h, 0, 0.07]], Math.max(4, L.sides - 1), LEAF.RING, 0.74, 0.76, 0.7, 0.9);
    vbTube(vb, [[lx, h, 0, 0.09], [lx, h + 0.8, 0, 0.06]], 4, LEAF.RING, 0.5, 0.72, 0.36, 0.9);
    const nf = L.n < 0.6 ? 6 : 9;
    for (let f = 0; f < nf; f++) { const a = f / nf * TAU + R() * 0.4, c = Math.cos(a), s = Math.sin(a), up = 0.9 - (f % 3) * 0.32, len = 2.5 + R() * 0.5, w = 1.25;
      const p0 = [lx, h + 0.75, 0], p1 = [lx + c * len * 0.5, h + 0.75 + up * len * 0.42, s * len * 0.5], p2 = [lx + c * len, h + 0.75 + up * len * 0.42 - len * 0.38, s * len];
      const sx = -s * w * 0.5, sz = c * w * 0.5, tv = 0.85 + R() * 0.3;
      const ids = []; [p0, p1, p2].forEach((p, k) => { const ao = 0.75 + k * 0.12; ids.push(vb.v(p[0] - sx, p[1], p[2] - sz, c * 0.3, 0.9, s * 0.3, k / 2, 0.08, LEAF.PALM, 0.8 * ao * tv, 0.84 * ao * tv, 0.72 * ao * tv, k * 0.5), vb.v(p[0] + sx, p[1], p[2] + sz, c * 0.3, 0.9, s * 0.3, k / 2, 0.92, LEAF.PALM, 0.8 * ao * tv, 0.84 * ao * tv, 0.72 * ao * tv, k * 0.5)); });
      vb.quad(ids[0], ids[2], ids[3], ids[1]); vb.quad(ids[2], ids[4], ids[5], ids[3]); }
    return vb; },
  bamboo: (R, L) => { const vb = new VB(), n = Math.round(15 * (0.45 + 0.55 * L.n)), cc = [0, 6.5, 0];
    for (let k = 0; k < n; k++) { const a = R() * TAU, r0 = R() * 0.9, h = 8 + R() * 4.5, bend = 1.6 + R() * 2.6, c = Math.cos(a), s = Math.sin(a);
      const pts = []; for (let j = 0; j <= 4; j++) { const f = j / 4; pts.push([c * (r0 + bend * f * f), -0.4 + (h + 0.4) * (f - 0.12 * f * f), s * (r0 + bend * f * f), 0.055 * (1 - f * 0.75)]); }
      vbTube(vb, pts, 3, LEAF.RING, 0.62, 0.74, 0.34, 0.9);
      const cards = Math.max(2, Math.round(7 * L.n));
      for (let j = 0; j < cards; j++) { const f = 0.5 + R() * 0.5, i0 = Math.min(3, Math.floor(f * 4)), t = f * 4 - i0, p = [lerp(pts[i0][0], pts[i0 + 1][0], t), lerp(pts[i0][1], pts[i0 + 1][1], t), lerp(pts[i0][2], pts[i0 + 1][2], t)];
        const q = rUnit(R), o = [p[0] * 0.3, 0.8, p[2] * 0.3], ol = Math.hypot(o[0], o[1], o[2]), ao = 0.6 + 0.4 * f, tv = 0.86 + R() * 0.28;
        vbCard(vb, p[0] + q[0] * 0.5, p[1] + q[1] * 0.4, p[2] + q[2] * 0.5, q[0], Math.abs(q[1]) * 0.6 + 0.2, q[2], o[0] / ol, o[1] / ol, o[2] / ol, 2.3 * L.s, LEAF.BAMBOO, 0.8 * ao * tv, 0.84 * ao * tv, 0.66 * ao * tv, 0.5 + 0.5 * f, R); } }
    return vb; },
  cypress: (R, L) => { const vb = new VB(), h = 11 + R() * 4.5, rad = 2.1 + R() * 0.6;
    vbTube(vb, [[0, -0.6, 0, 0.3], [0, 1.2, 0, 0.2], [0, h * 0.6, 0, 0.1], [0, h, 0, 0.02]], L.sides, LEAF.BARK, 0.66, 0.56, 0.5);
    const n = Math.round(96 * L.n);
    for (let k = 0; k < n; k++) { const f = Math.pow(R(), 0.8), y = 2.0 + f * (h - 2.2), rr = rad * (1 - f * 0.9) * (0.35 + 0.65 * Math.sqrt(R())), a = R() * TAU, px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
      const q = rUnit(R); let ox = Math.cos(a), oy = 0.45, oz = Math.sin(a); const ol = Math.hypot(ox, oy, oz);
      const rf = rr / (rad * (1 - f * 0.9) + 0.01), ao = 0.5 + 0.5 * rf, tv = 0.82 + R() * 0.36;
      vbCard(vb, px, y, pz, ox / ol * 0.5 + q[0] * 0.7, 0.3 + q[1] * 0.5, oz / ol * 0.5 + q[2] * 0.7, ox / ol, oy / ol, oz / ol, 1.9 * L.s * (1 - f * 0.4), LEAF.CYPRESS, 0.84 * ao * tv, 0.8 * ao * tv, 0.76 * ao * tv, 0.3 + 0.5 * f, R); }
    return vb; },
  shrub: (R, L) => { const vb = new VB(), h = 1.4 + R() * 1.1; const fl = R() < 0.22;
    vbBlob(vb, R, [0, h * 0.55, 0], [1.3 + R() * 0.5, h * 0.55, 1.3 + R() * 0.5], 16, 1.3, fl ? LEAF.FLOWER : LEAF.SHRUB, [0.78, 0.8, 0.72], [0, h * 0.4, 0], h * 0.9, L);
    return vb; },
  banana: (R, L) => { const vb = new VB(), h = 2.6 + R() * 0.9;
    vbTube(vb, [[0, -0.3, 0, 0.17], [0, h * 0.6, 0, 0.13], [0, h, 0, 0.08]], Math.max(4, L.sides - 1), LEAF.RING, 0.56, 0.7, 0.36, 0.3);
    const nf = L.n < 0.6 ? 5 : 8;
    for (let f = 0; f < nf; f++) { const a = f / nf * TAU + R() * 0.5, c = Math.cos(a), s = Math.sin(a), up = 0.5 + R() * 0.7, len = 2.3 + R() * 0.6, w = 0.75, tv = 0.86 + R() * 0.28;
      const P = [[0, h - 0.1, 0], [c * len * 0.5, h + up * len * 0.5, s * len * 0.5], [c * len, h + up * len * 0.5 - len * 0.32, s * len]];
      const ids = []; P.forEach((p, k) => { const ao = 0.72 + k * 0.14; ids.push(vb.v(p[0] + s * w * 0.5, p[1], p[2] - c * w * 0.5, c * 0.2, 0.95, s * 0.2, k / 2, 0.18, LEAF.BANANA, 0.82 * ao * tv, 0.85 * ao * tv, 0.74 * ao * tv, k * 0.5), vb.v(p[0] - s * w * 0.5, p[1], p[2] + c * w * 0.5, c * 0.2, 0.95, s * 0.2, k / 2, 0.82, LEAF.BANANA, 0.82 * ao * tv, 0.85 * ao * tv, 0.74 * ao * tv, k * 0.5)); });
      vb.quad(ids[0], ids[2], ids[3], ids[1]); vb.quad(ids[2], ids[4], ids[5], ids[3]); }
    return vb; },
  coconut: (R, L) => { const vb = new VB(), h = 8 + R() * 5, lx = (R() - 0.5) * 3.4;
    const pts = []; for (let j = 0; j <= 4; j++) { const f = j / 4; pts.push([lx * f * f, -0.5 + (h + 0.5) * f, 0, 0.2 - 0.075 * f]); }
    vbTube(vb, pts, Math.max(4, L.sides - 1), LEAF.RING, 0.62, 0.6, 0.54, 0.9);
    const nf = L.n < 0.6 ? 8 : 14;
    for (let f = 0; f < nf; f++) { const a = f / nf * TAU + R() * 0.4, c = Math.cos(a), s = Math.sin(a), up = 0.8 - (f % 3) * 0.45, len = 3.7 + R() * 0.9, w = 1.7, tv = 0.85 + R() * 0.3;
      const P = [[lx, h, 0], [lx + c * len * 0.5, h + up * len * 0.34, s * len * 0.5], [lx + c * len, h + up * len * 0.34 - len * 0.52, s * len]];
      const ids = []; P.forEach((p, k) => { const ao = 0.72 + k * 0.14; ids.push(vb.v(p[0] + s * w * 0.5, p[1], p[2] - c * w * 0.5, c * 0.2, 0.95, s * 0.2, k / 2, 0.06, LEAF.PALM, 0.8 * ao * tv, 0.86 * ao * tv, 0.7 * ao * tv, k * 0.5), vb.v(p[0] - s * w * 0.5, p[1], p[2] + c * w * 0.5, c * 0.2, 0.95, s * 0.2, k / 2, 0.94, LEAF.PALM, 0.8 * ao * tv, 0.86 * ao * tv, 0.7 * ao * tv, k * 0.5)); });
      vb.quad(ids[0], ids[2], ids[3], ids[1]); vb.quad(ids[2], ids[4], ids[5], ids[3]); }
    return vb; },
  pandanus: (R, L) => { const vb = new VB(), h = 2.2 + R() * 1.3;
    vbTube(vb, [[0, -0.3, 0, 0.12], [0.1, h * 0.5, 0, 0.09]], 4, LEAF.BARK, 0.6, 0.56, 0.5);
    vbBlob(vb, R, [0, h * 0.62, 0], [1.5 + R() * 0.4, h * 0.5, 1.5 + R() * 0.4], 15, 1.7, LEAF.PINE, [0.8, 0.86, 0.74], [0, h * 0.45, 0], h * 0.9, L);
    return vb; },
  casuarina: (R, L) => { const vb = new VB(), h = 9 + R() * 4;
    vbTube(vb, [[0, -0.6, 0, 0.22], [0.1, h * 0.5, 0, 0.12], [0, h, 0, 0.02]], L.sides, LEAF.BARK, 0.6, 0.55, 0.5);
    const cc = [0, h * 0.6, 0], cr = h * 0.5;
    for (let b = 0; b < 5; b++) { const f = b / 4, y = h * (0.3 + 0.62 * f), rr = (2.5 - 1.8 * f) * (0.85 + R() * 0.3); vbBlob(vb, R, [(R() - 0.5) * 0.6, y, (R() - 0.5) * 0.6], [rr, h * 0.11, rr], 17, 2.0, LEAF.ACACIA, [0.64, 0.76, 0.62], cc, cr, L); }
    return vb; }
};
const SP_ID = {};
function buildVegMeshes() {
  mkProg('veg', VEG_VS(''), VEG_FS(''));
  mkProg('veg_sh', VEG_VS('#define SHADOW\n'), VEG_FS('#define SHADOW\n'));
  mkProg('veg_bake', VEG_VS('#define BAKE\n'), VEG_FS('#define BAKE\n'));
  mkProg('bill', BILL_VS, BILL_FS);
  const L0 = { n: 1, s: 1, sides: 6 }, L1 = { n: 0.36, s: 1.5, sides: 4 };
  let seed = 100;
  for (const name in SPECIES) {
    SP_ID[name] = [];
    const nv = (name === 'shrub' || name === 'banana') ? 2 : 3;
    for (let v = 0; v < nv; v++) {
      seed += 7;
      const a = SPECIES[name](mulberry32(seed), L0).build(), b = SPECIES[name](mulberry32(seed), L1).build();
      SP_ID[name].push(VEG.sv.length);
      VEG.sv.push({ name, lod0: a, lod1: b, R: a.R, layer: VEG.sv.length, n0: 0, n1: 0, d0: new Float32Array(256 * 8), d1: new Float32Array(1024 * 8), noBill: name === 'shrub' });
    }
  }
  // 遠景貼片（impostor）烘焙
  const S = 256, n = VEG.sv.length;
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 9, gl.SRGB8_ALPHA8, S, S, n);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(), rb = gl.createRenderbuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, S, S);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  const P = useProg(PROGS.veg_bake); bindTex(0, TEX.leaf, gl.TEXTURE_2D_ARRAY);
  gl.uniform4f(P.u('uFade'), 1e8, 2e8, 0, 0);
  gl.viewport(0, 0, S, S); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  const vp = M4.create(), d = REN.uboData, inst = new Float32Array([0, 0, 0, 1, 0, 0.5, 1, 0]);
  for (let k = 0; k < n; k++) {
    const sv = VEG.sv[k], R = sv.R;
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, k);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    M4.ortho(vp, -R, R, 0, 2 * R, -2 * R, 2 * R);
    d.fill(0); d.set(vp, 0); gl.bindBuffer(gl.UNIFORM_BUFFER, REN.ubo); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, d);
    gl.bindVertexArray(sv.lod0.vao); gl.bindBuffer(gl.ARRAY_BUFFER, sv.lod0.instBuf); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.DYNAMIC_DRAW);
    gl.drawElementsInstanced(gl.TRIANGLES, sv.lod0.count, gl.UNSIGNED_SHORT, 0, 1);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteRenderbuffer(rb);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  VEG.impTex = tex;
  // billboard quad
  const bq = mkVAO([{ loc: 0, data: new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), size: 2 }], new Uint16Array([0, 1, 2, 0, 2, 3]));
  bq.instBuf = gl.createBuffer(); gl.bindVertexArray(bq.vao); gl.bindBuffer(gl.ARRAY_BUFFER, bq.instBuf);
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(5, 1);
  gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(6, 1); gl.bindVertexArray(null);
  VEG.bill = bq; VEG.billData = new Float32Array(16384 * 8); VEG.billN = 0;
  // 地被網格
  const mkCross = (layer, w, h, nq, tint, nrmUp) => { const vb = new VB();
    for (let q = 0; q < nq; q++) { const a = q / nq * PI, c = Math.cos(a), s = Math.sin(a);
      const i0 = vb.v(-c * w / 2, 0, -s * w / 2, -s * 0.25, nrmUp, c * 0.25, 0, 0, layer, tint[0] * 0.75, tint[1] * 0.75, tint[2] * 0.75, 0), i1 = vb.v(c * w / 2, 0, s * w / 2, -s * 0.25, nrmUp, c * 0.25, 1, 0, layer, tint[0] * 0.75, tint[1] * 0.75, tint[2] * 0.75, 0),
        i2 = vb.v(c * w / 2, h, s * w / 2, -s * 0.25, nrmUp, c * 0.25, 1, 1, layer, tint[0], tint[1], tint[2], 1), i3 = vb.v(-c * w / 2, h, -s * w / 2, -s * 0.25, nrmUp, c * 0.25, 0, 1, layer, tint[0], tint[1], tint[2], 1);
      vb.quad(i0, i1, i2, i3); }
    return vb.build(); };
  VEG.cover.grass = { mesh: mkCross(LEAF.GRASS, 0.95, 0.5, 3, [0.64, 0.67, 0.56], 1), fade: 'grass' };
  VEG.cover.silver = { mesh: mkCross(LEAF.SILVER, 1.8, 2.0, 3, [0.7, 0.72, 0.66], 0.9), fade: 'grass2' };
  VEG.cover.pine = { mesh: mkCross(LEAF.PINE, 1.25, 0.82, 3, [0.8, 0.82, 0.78], 1), fade: 'crop' };
  { const vb = new VB(), prof = [[-0.56, 0], [-0.54, 0.42], [-0.36, 0.72], [0, 0.82], [0.36, 0.72], [0.54, 0.42], [0.56, 0]], Lh = 3.02;
    for (let e = 0; e < 2; e++) for (let k = 0; k < prof.length; k++) { const p = prof[k], a = prof[Math.max(0, k - 1)], b = prof[Math.min(prof.length - 1, k + 1)]; let nx = (b[1] - a[1]), ny = -(b[0] - a[0]); const l = Math.hypot(nx, ny) || 1; nx = -nx / l; ny = Math.abs(ny / l) + 0.15;
      const sh = 0.5 + 0.5 * sat(p[1] / 0.8); vb.v(p[0], p[1], e ? Lh : -Lh, nx, ny, 0, k / (prof.length - 1) * 1.1, e * 4.0, LEAF.TEA, 0.8 * sh, 0.82 * sh, 0.76 * sh, 0); }
    const n = prof.length; for (let k = 0; k < n - 1; k++) vb.quad(k, n + k, n + k + 1, k + 1);
    VEG.cover.tea = { mesh: vb.build(), fade: 'crop' }; }
}

// ── 配置
const TREE_MIX = {
  city: [['broad', 1]], park: [['broad', 0.42], ['acacia', 0.36], ['bamboo', 0.08], ['banana', 0.06], ['shrub', 0.08]],
  ridgeN: [['acacia', 0.58], ['broad', 0.27], ['bamboo', 0.05], ['shrub', 0.1]], tunnel: [['broad', 0.5], ['acacia', 0.3], ['banana', 0.1], ['shrub', 0.1]],
  mixed: [['acacia', 0.6], ['broad', 0.25], ['bamboo', 0.05], ['shrub', 0.1]], pine: [['acacia', 0.5], ['broad', 0.32], ['banana', 0.08], ['shrub', 0.1]],
  twist: [['acacia', 0.46], ['broad', 0.34], ['bamboo', 0.1], ['banana', 0.03], ['shrub', 0.07]], plateau: [['broad', 0.5], ['acacia', 0.3], ['betel', 0.1], ['shrub', 0.1]],
  hengshan: [['acacia', 0.5], ['broad', 0.35], ['shrub', 0.15]], descent: [['acacia', 0.45], ['broad', 0.35], ['bamboo', 0.12], ['shrub', 0.08]],
  tea: [['broad', 0.5], ['betel', 0.3], ['acacia', 0.2]], town: [['broad', 1]]
};
function pickSpecies(mix, r) { let a = 0; for (const m of mix) { a += m[1]; if (r < a) return m[0]; } return mix[0][0]; }

function placeVegetation() {
  VEG.chunks = [];
  const CHS = VEG.CHS, R = mulberry32(20261116), tr = {}, zp = {};
  const nCh = Math.ceil((TR.n - 1) / CHS);
  for (let c = 0; c < nCh; c++) { const im = Math.min(TR.n - 1, c * CHS + CHS / 2 | 0); VEG.chunks.push({ trees: [], cover: { grass: [], silver: [], pine: [], tea: [] }, cx: TR.x[im], cy: TR.y[im], cz: TR.z[im], r: 190 }); }
  const lattice = new Set();
  const addTree = (name, x, z, scale, s) => {
    const ids = SP_ID[name], sv = ids[(R() * ids.length) | 0];
    const ch = VEG.chunks[clamp(Math.floor(s / DS / CHS), 0, nCh - 1)];
    ch.trees.push(x, groundY(x, z) - 0.05, z, scale, R() * TAU, R(), sv);
  };
  const okSpot = (x, z, s, minD) => {
    const gi = gridIdx(x, z); if (gi < 0 || TG.S[gi] < 0) return -1;
    if (TG.MASK[gi] & 1) return -1;
    if (TG.H[gi] < ROUTE.seaMin) return -1;
    if (Math.abs(TG.D[gi]) < minD) return -1;
    if (Math.abs(TG.S[gi] - s) > 46) return -1;
    return gi;
  };
  for (let i = 0; i < TR.n - 1; i += 3) {
    const s = i * DS; trackAt(s, tr); const zn = zoneOf(s), mix = zn.mix || TREE_MIX[zn.id]; zoneParams(s, zp);
    if (s > S_END - 6) break;
    const jn = inJunction(s, 9);
    for (let sd = -1; sd <= 1; sd += 2) {
      const bk = sd > 0 ? zp.bkL : zp.bkR;
      // 行道樹
      const rw = zn.row, every = Math.max(1, Math.round(rw.sp / (DS * 3)));
      if (!jn && (i / 3 | 0) % every === (sd > 0 ? 0 : (every >> 1)) && R() < rw.p && s > 70) {
        const d = sd * (tr.hw + BARRIER_OFF + 1.7 + R() * (rw.ty === 'terminalia' ? 0.3 : 1.6)), x = tr.x + tr.nx * d, z = tr.z + tr.nz * d;
        if (okSpot(x, z, s, tr.hw + 2.5) >= 0) {
          const ty = Array.isArray(rw.ty) ? pickSpecies(rw.ty, R()) : rw.ty === 'mix' ? pickSpecies([['acacia', 0.5], ['broad', 0.4], ['bamboo', 0.1]], R()) : rw.ty === 'banyan' ? 'broad' : rw.ty;
          addTree(ty, x, z, rw.ty === 'terminalia' ? 1.05 + R() * 0.15 : 0.9 + R() * 0.35, s);
        }
      }
      // 區塊填充
      for (let dd = tr.hw + 6; dd < 150; dd += 6.5) {
        const ss = s + (R() - 0.5) * 6, d = sd * (dd + (R() - 0.5) * 6); const t2 = trackAt(clamp(ss, 0, TR.len), VEG._t || (VEG._t = {}));
        const x = t2.x + t2.nx * d, z = t2.z + t2.nz * d;
        const gi = okSpot(x, z, ss, t2.hw + 5.2); if (gi < 0) { R(); continue; }
        const lu = TG.LU[gi], fall = dd < 70 ? 1 : lerp(1, 0.4, (dd - 70) / 80);
        const r = R();
        if (lu === LU.FOREST) { if (r < 0.8 * zn.dens * fall) { const cl = vnoise(x / 38, z / 38, 91); const name = cl > 0.74 && (zn.id === 'twist' || zn.id === 'park' || zn.id === 'descent' || zn.id === 'ridgeN') ? 'bamboo' : pickSpecies(mix, R()); addTree(name, x, z, name === 'shrub' ? 1 : 0.8 + R() * 0.5, ss); } }
        else if (lu === LU.BAMBOO) { if (r < 0.62 * fall) addTree(R() < 0.8 ? 'bamboo' : 'broad', x, z, 0.85 + R() * 0.4, ss); }
        else if (lu === LU.ORCHARD || lu === LU.BETEL || lu === LU.CYPRESS) {
          const g = lu === LU.ORCHARD ? 7.2 : lu === LU.BETEL ? 4.2 : 4.6, lx = Math.round(x / g), lz = Math.round(z / g);
          for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
            const key = (lx + ox) * 100003 + (lz + oz) + lu * 7e9; if (lattice.has(key)) continue;
            const jx = (lx + ox) * g + (hash2(lx + ox, lz + oz, 5) - 0.5) * (lu === LU.CYPRESS ? 2.2 : 0.7), jz = (lz + oz) * g + (hash2(lx + ox, lz + oz, 6) - 0.5) * (lu === LU.CYPRESS ? 2.2 : 0.7);
            const g2 = okSpot(jx, jz, ss, t2.hw + 5.5); if (g2 < 0 || TG.LU[g2] !== lu) continue;
            lattice.add(key);
            if (lu === LU.CYPRESS && hash2(lx + ox, lz + oz, 8) < 0.12) continue;
            addTree(lu === LU.ORCHARD ? 'lychee' : lu === LU.BETEL ? (zn.palm || 'betel') : 'cypress', jx, jz, 0.85 + hash2(lx + ox, lz + oz, 7) * 0.35, TG.S[g2]);
          }
        }
        else if (lu === LU.TEA || lu === LU.PINE || lu === LU.VEG) { if (r < 0.022) addTree(zn.id === 'tea' || zn.id === 'plateau' ? (R() < 0.7 ? 'betel' : 'broad') : 'broad', x, z, 0.9 + R() * 0.3, ss); }
        else if (lu === LU.PASTURE) { if (r < (zn.pastureP === undefined ? 0.05 : zn.pastureP)) addTree(zn.pasture || (R() < 0.7 ? 'broad' : 'acacia'), x, z, 0.9 + R() * 0.4, ss); }
        else if (lu === LU.TOWN) { if (r < 0.06) addTree(R() < 0.5 ? 'banana' : 'broad', x, z, 0.8 + R() * 0.3, ss); }
      }
    }
  }
  // 路緣草叢、芒草、灌叢
  for (let i = 30; i < TR.n - 10; i++) {
    const s = i * DS; trackAt(s, tr); const zn = zoneOf(s); if (zn.id === 'city' || zn.id === 'town' || zn.town || zn.nograss || ROUTE.bridge(s) > 0.2 || inJunction(s, 8)) continue;
    const ch = VEG.chunks[clamp(Math.floor(i / CHS), 0, nCh - 1)]; zoneParams(s, zp);
    for (let sd = -1; sd <= 1; sd += 2) {
      for (let k = 0; k < 6; k++) {
        const o = k < 2 ? 0.75 + R() * 0.7 : 1.9 + R() * 5.5, d = sd * (tr.hw + o), ss = s + R() * DS, t2 = trackAt(ss, VEG._t);
        const x = t2.x + t2.nx * d, z = t2.z + t2.nz * d; const gi = gridIdx(x, z); if (gi < 0 || (TG.MASK[gi] & 1)) continue;
        if (k >= 2 && Math.abs(TG.D[gi]) < t2.hw + 0.8) continue;
        const y = shoulderY(ss, d, t2, x, z);
        ch.cover.grass.push(x, y - 0.04, z, 0.6 + R() * 0.75, R() * TAU, R(), 1, 0);
      }
      if (R() < 0.13) { const o = 2.4 + R() * 6, d = sd * (tr.hw + o), x = tr.x + tr.nx * d, z = tr.z + tr.nz * d, gi = gridIdx(x, z); if (gi >= 0 && !(TG.MASK[gi] & 1) && Math.abs(TG.D[gi]) > tr.hw + 1.8) ch.cover.silver.push(x, shoulderY(s, d, tr, x, z) - 0.05, z, 0.7 + R() * 0.6, R() * TAU, R(), 1, 0); }
      if (R() < 0.05 && zn.w[0] > 0.3) { const o = 3.4 + R() * 5, d = sd * (tr.hw + o), x = tr.x + tr.nx * d, z = tr.z + tr.nz * d; if (okSpot(x, z, s, tr.hw + 3) >= 0) addTree(R() < 0.25 ? 'banana' : 'shrub', x, z, 0.8 + R() * 0.5, s); }
    }
  }
  // 茶園與鳳梨田：以世界座標列距排列，與地表著色一致
  const c = TG.cell;
  for (let gz = 1; gz < TG.nz - 1; gz++) for (let gx = 1; gx < TG.nx - 1; gx++) {
    const o = gz * TG.nx + gx, lu = TG.LU[o]; if (lu !== LU.TEA && lu !== LU.PINE) continue;
    const ad = Math.abs(TG.D[o]); if (ad > (lu === LU.TEA ? 78 : 46) || TG.S[o] < 0 || (TG.MASK[o] & 3)) continue;
    const hw = trackAt(TG.S[o], tr).hw; if (ad < hw + 8.5) continue;
    const x = TG.x0 + gx * c, z = TG.z0 + gz * c, orr = TG.OR[o];
    const ch = VEG.chunks[clamp(Math.floor(TG.S[o] / DS / CHS), 0, nCh - 1)];
    const pitch = lu === LU.TEA ? 1.8 : 1.5, lo = (orr ? x : z) - c / 2, k0 = Math.ceil(lo / pitch - 0.5), k1 = Math.floor((lo + c) / pitch - 0.5 - 1e-6);
    for (let k = k0; k <= k1; k++) {
      const rc = (k + 0.5) * pitch;
      if (lu === LU.TEA) {
        const px = orr ? rc : x, pz = orr ? z : rc;
        const ya = gridH(orr ? px : px - 3, orr ? pz - 3 : pz), yb = gridH(orr ? px : px + 3, orr ? pz + 3 : pz);
        ch.cover.tea.push(px, (ya + yb) / 2 + 0.06, pz, 1, orr ? 0 : PI / 2, hash2(k, gx + gz, 3), 1, (orr ? (yb - ya) : (yb - ya)) / 6 * (orr ? 1 : 1));
      } else {
        for (let m = 0; m < 5; m++) { const al = (orr ? z : x) - c / 2 + (m + 0.5) * 1.2 + (hash2(k, m + gx * 7 + gz * 13, 2) - 0.5) * 0.3, px = orr ? rc : al, pz = orr ? al : rc;
          ch.cover.pine.push(px, gridH(px, pz) + 0.05, pz, 0.8 + hash2(k, m + gx, 4) * 0.4, hash2(k, m + gz, 5) * TAU, hash2(m, k + gx, 6), 1, 0); }
      }
    }
  }
  // 封裝
  let nt = 0, ng = 0;
  for (const ch of VEG.chunks) {
    ch.trees = new Float32Array(ch.trees); nt += ch.trees.length / 7;
    let y0 = 1e9, y1 = -1e9, rr = 0; for (let k = 0; k < ch.trees.length; k += 7) { rr = Math.max(rr, Math.hypot(ch.trees[k] - ch.cx, ch.trees[k + 2] - ch.cz)); y0 = Math.min(y0, ch.trees[k + 1]); y1 = Math.max(y1, ch.trees[k + 1]); }
    ch.r = rr + 14; if (ch.trees.length) ch.cy = (y0 + y1) / 2 + 5; ch.r = Math.hypot(ch.r, (y1 - y0) / 2 + 10);
    for (const key in ch.cover) {
      const arr = ch.cover[key]; if (!arr.length) { ch.cover[key] = null; continue; }
      const data = new Float32Array(arr), mesh = VEG.cover[key].mesh; ng += data.length / 8;
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      // 重用網格的頂點緩衝
      mesh.bufs.forEach((b, k) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); const loc = k; const sz = [3, 3, 3, 4][k]; gl.enableVertexAttribArray(loc); if (k === 3) gl.vertexAttribPointer(loc, 4, gl.UNSIGNED_BYTE, true, 0, 0); else gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 0, 0); });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(5, 1);
      gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(6, 1);
      gl.bindVertexArray(null);
      ch.cover[key] = { vao, n: data.length / 8, count: mesh.count };
    }
  }
  VEG.stats.trees = nt; VEG.stats.cover = ng;
}

// ── 繪製
function vegPush(sv, lod, x, y, z, sc, rot, tint, fade) {
  let d = lod ? sv.d1 : sv.d0, n = lod ? sv.n1 : sv.n0;
  if (n * 8 >= d.length) { const nd = new Float32Array(d.length * 2); nd.set(d); d = nd; if (lod) sv.d1 = d; else sv.d0 = d; }
  const o = n * 8; d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = sc; d[o + 4] = rot; d[o + 5] = tint; d[o + 6] = fade; d[o + 7] = 0;
  if (lod) sv.n1 = n + 1; else sv.n0 = n + 1;
}
function vegFlush(P, shadow) {
  for (const sv of VEG.sv) {
    for (let lod = 0; lod < 2; lod++) {
      const n = lod ? sv.n1 : sv.n0; if (!n) continue;
      const m = lod ? sv.lod1 : sv.lod0, d = lod ? sv.d1 : sv.d0;
      gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ARRAY_BUFFER, m.instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 8), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0, n);
      REN.stats.tris += m.count / 3 * n;
    }
    sv.n0 = 0; sv.n1 = 0;
  }
}
function drawVegMain(phase) {
  if (phase !== 1) return;
  const q = REN.q, pl = CAM.planes, cp = CAM.pos;
  const near2 = q.treeNear * q.treeNear, mid2 = q.treeMid * q.treeMid, far = q.treeFar, far2 = far * far;
  let bn = 0; const bd = VEG.billData;
  for (const ch of VEG.chunks) {
    const dc = Math.hypot(ch.cx - cp[0], ch.cz - cp[2]);
    if (dc - ch.r > far || !sphereInFrustum(pl, ch.cx, ch.cy, ch.cz, ch.r)) continue;
    const t = ch.trees;
    for (let k = 0; k < t.length; k += 7) {
      const x = t[k], y = t[k + 1], z = t[k + 2], dx = x - cp[0], dz = z - cp[2], dy = y - cp[1], d2 = dx * dx + dz * dz + dy * dy;
      if (d2 > far2) continue;
      const sv = VEG.sv[t[k + 6]];
      if (d2 < mid2 || sv.noBill) {
        if (sv.noBill && d2 > mid2 * 0.5) continue;
        const rr = sv.R * t[k + 3] * 1.3;
        if (!sphereInFrustum(pl, x, y + rr * 0.8, z, rr * 1.3)) continue;
        vegPush(sv, d2 < near2 ? 0 : 1, x, y, z, t[k + 3], t[k + 4], t[k + 5], 1);
      } else {
        if (d2 > 200000 && ((k / 7) & 1)) continue;
        if (bn >= 16384) continue;
        const o = bn * 8, dd = Math.sqrt(d2); bd[o] = x; bd[o + 1] = y; bd[o + 2] = z; bd[o + 3] = sv.R * 2 * t[k + 3]; bd[o + 4] = sv.layer; bd[o + 5] = t[k + 5]; bd[o + 6] = sat((far - dd) / 60); bd[o + 7] = 0; bn++;
      }
    }
  }
  gl.disable(gl.CULL_FACE);
  const a2c = !!REN.msaa; if (a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  let P = useProg(PROGS.veg); bindTex(0, TEX.leaf, gl.TEXTURE_2D_ARRAY);
  gl.uniform4f(P.u('uFade'), 1e8, 2e8, 1, 0);
  vegFlush(P);
  // 地被
  const fades = { grass: [q.grass * 0.55, q.grass], grass2: [q.grass * 1.2, q.grass * 2], crop: [q.crop * 0.75, q.crop] };
  for (const key in VEG.cover) {
    const fd = fades[VEG.cover[key].fade]; if (fd[1] <= 2) continue; gl.uniform4f(P.u('uFade'), fd[0], fd[1], key === 'tea' ? 0 : 1, 0);
    if (key === 'tea') gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    for (const ch of VEG.chunks) {
      const cv = ch.cover[key]; if (!cv) continue;
      const dc = Math.hypot(ch.cx - cp[0], ch.cz - cp[2]); if (dc - 110 > fd[1] || !sphereInFrustum(pl, ch.cx, ch.cy, ch.cz, 115)) continue;
      gl.bindVertexArray(cv.vao); gl.drawElementsInstanced(gl.TRIANGLES, cv.count, gl.UNSIGNED_SHORT, 0, cv.n);
      REN.stats.tris += cv.count / 3 * cv.n;
    }
  }
  gl.disable(gl.CULL_FACE);
  if (bn) {
    P = useProg(PROGS.bill); bindTex(0, VEG.impTex, gl.TEXTURE_2D_ARRAY);
    gl.bindVertexArray(VEG.bill.vao); gl.bindBuffer(gl.ARRAY_BUFFER, VEG.bill.instBuf); gl.bufferData(gl.ARRAY_BUFFER, bd.subarray(0, bn * 8), gl.DYNAMIC_DRAW);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, bn);
  }
  if (a2c) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.enable(gl.CULL_FACE);
  VEG.stats.bill = bn;
}
function drawVegShadow(ci, C) {
  const rad = C[3], lim = rad + (ci ? 60 : 85), lim2 = lim * lim;
  for (const ch of VEG.chunks) {
    const dc = Math.hypot(ch.cx - C[0], ch.cz - C[2]); if (dc - ch.r > lim) continue;
    const t = ch.trees;
    for (let k = 0; k < t.length; k += 7) {
      const dx = t[k] - C[0], dz = t[k + 2] - C[2]; if (dx * dx + dz * dz > lim2) continue;
      const sv = VEG.sv[t[k + 6]]; if (ci && sv.noBill) continue;
      vegPush(sv, 1, t[k], t[k + 1], t[k + 2], t[k + 3], t[k + 4], t[k + 5], 1);
    }
  }
  gl.disable(gl.CULL_FACE);
  const P = useProg(PROGS.veg_sh); bindTex(0, TEX.leaf, gl.TEXTURE_2D_ARRAY);
  gl.uniform4f(P.u('uFade'), 1e8, 2e8, 1, 0);
  vegFlush(P, true);
  if (!ci) { // 近層：茶樹列也投影
    gl.uniform4f(P.u('uFade'), 1e8, 2e8, 0, 0);
    for (const ch of VEG.chunks) { const cv = ch.cover.tea; if (!cv) continue; const dc = Math.hypot(ch.cx - C[0], ch.cz - C[2]); if (dc - 110 > lim) continue; gl.bindVertexArray(cv.vao); gl.drawElementsInstanced(gl.TRIANGLES, cv.count, gl.UNSIGNED_SHORT, 0, cv.n); }
  }
  gl.enable(gl.CULL_FACE);
}
