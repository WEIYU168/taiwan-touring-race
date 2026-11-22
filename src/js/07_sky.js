// ───────────────────────── 大氣、天空、時段 ─────────────────────────
const TOD = {
  dawn: { name: '晨曦', sub: '07:00 中央山脈日出', az: 108, el: 12.5, turb: 2.4, cloud: 0.44, fog: [0.0013, 0.014, 28, 0.00005], exposure: 0.92, tint: [1.0, 0.97, 0.94] },
  day: { name: '晴日', sub: '11:00 稜線晴空', az: 158, el: 46, turb: 1.8, cloud: 0.36, fog: [0.0004, 0.012, 28, 0.000036], exposure: 0.56, tint: [1, 1, 1] },
  dusk: { name: '夕照', sub: '16:50 彰化平原落日', az: 246, el: 8, turb: 3.0, cloud: 0.5, fog: [0.0009, 0.013, 28, 0.00005], exposure: 1.0, tint: [1.0, 0.96, 0.93] }
};
const SKY = { lut: null, fb: null, sun: [0, 1, 0], sunCol: [1, 1, 1], ambSky: [0.3, 0.4, 0.6], ambGnd: [0.1, 0.1, 0.08], tod: null, W: 256, H: 128 };

const ATMO_GLSL = `
const float PI = 3.14159265;
const vec3 bR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float bM = 21e-6, HR = 8000., HM = 1200., Re = 6371e3, Ra = 6471e3;
const vec3 bO = vec3(.650e-6, 1.881e-6, .085e-6);
float ozd(float h){ return max(0., 1. - abs(h - 25000.)/15000.); }
vec2 rsi(vec3 r0, vec3 rd, float sr){ float b = 2.*dot(rd,r0), c = dot(r0,r0)-sr*sr, d = b*b-4.*c; if(d<0.) return vec2(1e9,-1e9); d = sqrt(d); return vec2((-b-d)*.5, (-b+d)*.5); }
vec3 atmosphere(vec3 r, vec3 pSun, float turb){
  vec3 r0 = vec3(0., Re + 300., 0.);
  vec2 p = rsi(r0, r, Ra); if(p.x > p.y) return vec3(0.);
  vec2 pg = rsi(r0, r, Re); if(pg.x > 0.) p.y = min(p.y, pg.x);
  float iStep = p.y/20., iT = 0., odR = 0., odM = 0., odO = 0.; vec3 totR = vec3(0.), totM = vec3(0.);
  float mu = dot(r, pSun), g = .76, gg = g*g;
  float pR = 3./(16.*PI)*(1.+mu*mu), pM = 3./(8.*PI)*((1.-gg)*(mu*mu+1.))/(pow(1.+gg-2.*mu*g, 1.5)*(2.+gg));
  for(int i=0;i<20;i++){
    vec3 pos = r0 + r*(iT + iStep*.5); float h = max(length(pos)-Re, 0.);
    float dR = exp(-h/HR)*iStep, dM = exp(-h/HM)*iStep; odR += dR; odM += dM; odO += ozd(h)*iStep;
    float jStep = rsi(pos, pSun, Ra).y/8., jT = 0., jR = 0., jM = 0., jO = 0.;
    for(int j=0;j<8;j++){ vec3 jp = pos + pSun*(jT + jStep*.5); float jh = max(length(jp)-Re, 0.); jR += exp(-jh/HR)*jStep; jM += exp(-jh/HM)*jStep; jO += ozd(jh)*jStep; jT += jStep; }
    vec3 at = exp(-(bM*turb*1.1*(odM+jM) + bR*(odR+jR) + bO*(odO+jO)));
    totR += dR*at; totM += dM*at; iT += iStep;
  }
  return 22.*(pR*bR*totR + pM*bM*turb*totM);
}`;
const SKYLUT_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 oCol; uniform vec3 uSunD; uniform float uTurb;
${ATMO_GLSL}
void main(){
  float az = (vUV.x - .5)*6.2831853; float v = clamp((vUV.y - .02)/.96, 0., 1.); float y = v*v; float h = sqrt(max(1.-y*y, 0.));
  vec3 d = vec3(sin(az)*h, y, cos(az)*h);
  vec3 c = atmosphere(d, uSunD, uTurb);
  // 太陽附近的 Mie 尖峰過亮處稍壓，保留暈光
  oCol = vec4(min(c, vec3(60.)), 1.);
}`;
const SKY_VS = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vP;
void main(){ vP = aPos; gl_Position = vec4(aPos, 1., 1.); }`;
const SKY_FS = GLSL_HEAD + GLSL_LIGHT + `
in vec2 vP; out vec4 oCol;
uniform vec3 uCamR, uCamU, uCamF; uniform vec2 uTan; uniform vec4 uCloud; uniform vec4 uMount; // 遠山強度 ×3、方位旋轉
float cl(vec2 p){ return texture(uNoise, p*.019).r*.56 + texture(uNoise, p*.051+.31).g*.27 + texture(uNoise, p*.13+.7).b*.13 + texture(uNoise, p*.33).a*.07; }
float rid(float az, float f, float row){ return texture(uNoise, vec2(az*f*.15915494, row)).r*.6 + texture(uNoise, vec2(az*f*2.*.15915494, row+.37)).g*.28 + texture(uNoise, vec2(az*f*5.*.15915494, row+.11)).b*.12; }
void main(){
  vec3 dir = normalize(uCamF + uCamR*vP.x*uTan.x + uCamU*vP.y*uTan.y);
  vec3 sky = skyAt(normalize(vec3(dir.x, max(dir.y, 0.), dir.z)));
  vec3 hor = fogColor(dir);
  float mu = dot(dir, uSun.xyz);
  vec3 col = sky;
  float occ = 0.;
  if(dir.y > -.02){
    float dy = max(dir.y, 0.) + .055;
    float t = 1./dy;
    // 高卷雲
    vec2 c2 = dir.xz*t*vec2(1.6, 5.) + vec2(uCloud.y*.0016, 0.) + uCam.xz*.00003;
    float ci = smoothstep(.52, .86, texture(uNoise, c2*.05).r*.6 + texture(uNoise, c2*.13).g*.4) * uCloud.z;
    vec3 ciC = uSunCol.rgb*.10*(1. + 2.5*pow(max(mu,0.), 6.)) + uAmbSky.rgb*.7;
    col = mix(col, ciC, ci*.42*smoothstep(0., .12, dir.y));
    // 積雲
    vec2 cp = dir.xz*t*5.2 + vec2(uCloud.y*.011, uCloud.y*.004) + uCam.xz*.00012;
    float d = cl(cp);
    float a = smoothstep(1.-uCloud.x-.16, 1.-uCloud.x+.14, d);
    if(a > .001){
      vec2 sd = normalize(uSun.xz + vec2(1e-4))*(1.6 + 2.5*(1.-uSun.y));
      float d2 = cl(cp + sd);
      float light = clamp(.5 + (d - d2)*4.5, 0., 1.);
      float thick = smoothstep(1.-uCloud.x, 1.-uCloud.x+.3, d);
      vec3 litC = uSunCol.rgb*(.13 + .22*pow(max(mu,0.), 3.)) + uAmbSky.rgb*.85;
      vec3 shC = uAmbSky.rgb*.78 + uSunCol.rgb*.012;
      vec3 cc = mix(shC, litC, light*(1.-thick*.45));
      cc += uSunCol.rgb * pow(max(mu,0.), 24.) * (1.-thick)*.5;
      float fade = exp(-t*.085);
      cc = mix(hor*1.02, cc, fade);
      float al = a*(.35 + .65*fade) * smoothstep(-.01, .05, dir.y);
      col = mix(col, cc, al); occ = al;
    }
  }
  // 遠山剪影：東側為中央山脈、集集大山、南投丘陵；西側為平原與海
  float az = atan(dir.x, dir.z);
  float el = asin(clamp(dir.y, -1., 1.));
  float az2 = az - uMount.w;
  float east = smoothstep(-.55, .5, sin(az2 + .15));
  float notW = 1. - smoothstep(.55, .95, -sin(az2));
  float hz = uFog.w;
  float h0 = (.030 + .034*rid(az, 7., .13)) * east * uMount.x;
  float h1 = (.016 + .034*rid(az, 11., .47)) * mix(.25, 1., east) * notW * uMount.y;
  float h2 = (.004 + .026*rid(az, 17., .81)) * mix(.35, 1., east) * notW * uMount.z;
  vec3 mBase = vec3(.035, .06, .055) + uAmbSky.rgb*.10;
  float sunSide = .5 + .5*dot(normalize(vec2(dir.x, dir.z)), normalize(uSun.xz + vec2(1e-4)));
  vec3 mLit = mBase + uSunCol.rgb*.012*(1.-sunSide);
  if(el < h0){ float f = 1.-exp(-hz*52000.); col = mix(mLit, hor, f*.985); occ = 1.; }
  if(el < h1){ float f = 1.-exp(-hz*24000.); col = mix(mLit*.9, hor, f*.97); occ = 1.; }
  if(el < h2){ float f = 1.-exp(-hz*11000.); col = mix(mLit*.8, hor, f*.95); occ = 1.; }
  if(dir.y < 0.) col = mix(col, hor, smoothstep(0., -.03, dir.y));
  // 太陽
  float disc = smoothstep(.99990, .99996, mu);
  col = mix(col, fogColor(dir), uFogCol.w * (1. - smoothstep(-.05, .55, dir.y)*.55));
  col += uSunCol.rgb * 16. * disc * (1.-occ) * uCloud.w * (1. - uFogCol.w);
  oCol = vec4(col, 1.);
}`;

// JS 版大氣（計算太陽色與環境光）
function atmoJS(dx, dy, dz, sx, sy, sz, turb) {
  const Re = 6371e3, Ra = 6471e3, bR = [5.8e-6, 13.5e-6, 33.1e-6], bM = 21e-6, HR = 8000, HM = 1200, bO = [0.65e-6, 1.881e-6, 0.085e-6];
  const ozd = h => Math.max(0, 1 - Math.abs(h - 25000) / 15000);
  const r0y = Re + 300;
  const rsi = (oy, ox, rx, ry, rz, sr) => { const b = 2 * (rx * ox + ry * oy), c = ox * ox + oy * oy - sr * sr, d = b * b - 4 * c; if (d < 0) return [1e9, -1e9]; const q = Math.sqrt(d); return [(-b - q) / 2, (-b + q) / 2]; };
  let p = rsi(r0y, 0, dx, dy, dz, Ra); if (p[0] > p[1]) return [0, 0, 0];
  const pg = rsi(r0y, 0, dx, dy, dz, Re); if (pg[0] > 0) p[1] = Math.min(p[1], pg[0]);
  const n = 16, st = p[1] / n; let odR = 0, odM = 0, odO = 0; const tR = [0, 0, 0], tM = [0, 0, 0];
  const mu = dx * sx + dy * sy + dz * sz, g = 0.76, gg = g * g;
  const pR = 3 / (16 * PI) * (1 + mu * mu), pM = 3 / (8 * PI) * ((1 - gg) * (mu * mu + 1)) / (Math.pow(1 + gg - 2 * mu * g, 1.5) * (2 + gg));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * st, px = dx * t, py = r0y + dy * t, pz = dz * t, h = Math.max(0, Math.hypot(px, py, pz) - Re);
    const dR = Math.exp(-h / HR) * st, dM = Math.exp(-h / HM) * st; odR += dR; odM += dM; odO += ozd(h) * st;
    // sun ray from pos
    const b = 2 * (sx * px + sy * py + sz * pz), c = px * px + py * py + pz * pz - Ra * Ra, q = Math.sqrt(Math.max(0, b * b - 4 * c)), jl = (-b + q) / 2, js = jl / 6;
    let jR = 0, jM = 0, jO = 0;
    for (let j = 0; j < 6; j++) { const u = (j + 0.5) * js, jh = Math.max(0, Math.hypot(px + sx * u, py + sy * u, pz + sz * u) - Re); jR += Math.exp(-jh / HR) * js; jM += Math.exp(-jh / HM) * js; jO += ozd(jh) * js; }
    for (let k = 0; k < 3; k++) { const at = Math.exp(-(bM * turb * 1.1 * (odM + jM) + bR[k] * (odR + jR) + bO[k] * (odO + jO))); tR[k] += dR * at; tM[k] += dM * at; }
  }
  return [22 * (pR * bR[0] * tR[0] + pM * bM * turb * tM[0]), 22 * (pR * bR[1] * tR[1] + pM * bM * turb * tM[1]), 22 * (pR * bR[2] * tR[2] + pM * bM * turb * tM[2])];
}
function sunTransJS(sy, turb) {
  const Re = 6371e3, Ra = 6471e3, r0y = Re + 300, sx = Math.sqrt(1 - sy * sy);
  const b = 2 * r0y * sy, c = r0y * r0y - Ra * Ra, t1 = (-b + Math.sqrt(b * b - 4 * c)) / 2, n = 48, st = t1 / n; let odR = 0, odM = 0, odO = 0;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) * st, h = Math.max(0, Math.hypot(sx * t, r0y + sy * t) - Re); odR += Math.exp(-h / 8000) * st; odM += Math.exp(-h / 1200) * st; odO += Math.max(0, 1 - Math.abs(h - 25000) / 15000) * st; }
  const bR = [5.8e-6, 13.5e-6, 33.1e-6], bO = [0.65e-6, 1.881e-6, 0.085e-6];
  return bR.map((k, i) => Math.exp(-(k * odR + 21e-6 * turb * 1.1 * odM + bO[i] * odO)));
}

function initSky() {
  mkProg('skylut', FSQ_VS, SKYLUT_FS);
  mkProg('sky', SKY_VS, SKY_FS);
  SKY.fb = mkFBO(SKY.W, SKY.H, { hdr: true });
  gl.bindTexture(gl.TEXTURE_2D, SKY.fb.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  SKY.lut = SKY.fb.tex;
}
function setTimeOfDay(key) {
  const t = TOD[key]; SKY.tod = t; SKY.key = key;
  const b = t.az * DEG, e = t.el * DEG;
  SKY.sun = [Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)];
  // LUT
  gl.bindFramebuffer(gl.FRAMEBUFFER, SKY.fb.fb); gl.viewport(0, 0, SKY.W, SKY.H);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  const P = useProg(PROGS.skylut);
  gl.uniform3fv(P.u('uSunD'), SKY.sun); gl.uniform1f(P.u('uTurb'), t.turb);
  drawFSQ();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // 太陽直射與天空漫射
  const T = sunTransJS(SKY.sun[1], t.turb);
  SKY.sunCol = [22 * T[0] / PI * t.tint[0], 22 * T[1] / PI * t.tint[1], 22 * T[2] / PI * t.tint[2]];
  const acc = [0, 0, 0]; let wsum = 0;
  for (let ie = 0; ie < 7; ie++) for (let ia = 0; ia < 12; ia++) {
    const el = (ie + 0.5) / 7 * PI / 2, az = (ia + 0.5) / 12 * TAU, y = Math.sin(el), h = Math.cos(el);
    const c = atmoJS(Math.sin(az) * h, y, Math.cos(az) * h, SKY.sun[0], SKY.sun[1], SKY.sun[2], t.turb);
    const w = y * h; for (let k = 0; k < 3; k++) acc[k] += Math.min(c[k], 8) * w; wsum += w;
  }
  SKY.ambSky = acc.map(v => v / wsum * (1.15 + 0.5 * (1 - SKY.sun[1])));
  const ga = [0.17, 0.19, 0.11];
  SKY.ambGnd = ga.map((a, k) => a * (SKY.sunCol[k] * SKY.sun[1] + SKY.ambSky[k]) * 0.9 + SKY.ambSky[k] * 0.12);
}
function drawSky(cam) {
  const P = useProg(PROGS.sky);
  gl.uniform3f(P.u('uCamR'), cam.r[0], cam.r[1], cam.r[2]);
  gl.uniform3f(P.u('uCamU'), cam.u[0], cam.u[1], cam.u[2]);
  gl.uniform3f(P.u('uCamF'), cam.f[0], cam.f[1], cam.f[2]);
  gl.uniform2f(P.u('uTan'), cam.tanX, cam.tanY);
  gl.uniform4fv(P.u('uMount'), ROUTE.mount);
  gl.uniform4f(P.u('uCloud'), SKY.tod.cloud, cam.time, 1, cam.sunDisc === undefined ? 1 : cam.sunDisc);
  gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
  drawFSQ();
  gl.depthMask(true);
}
