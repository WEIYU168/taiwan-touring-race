// ───────────────────────── 繪製管線 ─────────────────────────
const QUALITY = {
  min: { name: '省電', scale: 0.5, sh0: 1024, sh1: 0, msaa: 0, treeNear: 28, treeMid: 72, treeFar: 250, grass: 1, crop: 110, farEvery: 0, terr: 1400, bloom: false, sh0Every: 2 },
  low: { name: '流暢', sh0Every: 2, scale: 0.62, sh0: 1024, sh1: 0, msaa: 0, treeNear: 42, treeMid: 105, treeFar: 380, grass: 55, crop: 140, farEvery: 0, terr: 1800, rays: true },
  med: { name: '標準', scale: 0.82, sh0: 2048, sh1: 1024, msaa: 0, treeNear: 60, treeMid: 150, treeFar: 600, grass: 85, crop: 200, farEvery: 3, terr: 2600, ao: true, rays: true },
  high: { name: '精緻', scale: 1.0, sh0: 2048, sh1: 2048, msaa: 4, treeNear: 80, treeMid: 190, treeFar: 820, grass: 110, crop: 240, farEvery: 2, terr: 3400, ao: true, rays: true }
};
const REN = { q: QUALITY.med, qkey: 'med', w: 0, h: 0, scale: 1, frame: 0, ubo: null, uboData: new Float32Array(84), sh: [null, null], shM: [M4.create(), M4.create()], shVP: [M4.create(), M4.create()], shC: [[0, 0, 0, 1], [0, 0, 0, 1]], bloom: [], lightsOn: 0, motion: 0, stats: { draws: 0, tris: 0 } };
const SCENE = { shadow: [], opaque: [], blend: [], cockpit: [] };
const CAM = { pos: [0, 0, 0], view: M4.create(), proj: M4.create(), vp: M4.create(), r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1], fov: 60 * DEG, near: 0.4, far: 32000, tanX: 1, tanY: 1, planes: new Float32Array(24), time: 0 };

const STATIC_VS = GLSL_HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aUV; layout(location=3) in vec4 aCol;
out vec3 vW; out vec3 vN; out vec3 vUV; out vec4 vCol;
void main(){ vW = aPos; vN = aNrm; vUV = aUV; vCol = aCol; gl_Position = uViewProj * vec4(aPos, 1.); }`;
const STATIC_FS = GLSL_HEAD + GLSL_LIGHT + `
uniform sampler2DArray uTex0;
in vec3 vW; in vec3 vN; in vec3 vUV; in vec4 vCol; out vec4 oCol;
void main(){
  vec3 base = pow(vCol.rgb, vec3(2.2));
  float m = vCol.a;
  float glass = 0.;
  if(vUV.z > -.5){ vec4 t = texture(uTex0, vUV); if(t.a < .45) discard; base *= t.rgb;
    float lum = dot(t.rgb, vec3(.3,.5,.2)); glass = (vUV.z > .5 && vUV.z < 2.5 || abs(vUV.z-11.) < .5 || abs(vUV.z-12.) < .5) ? smoothstep(.16,.05,lum)*step(t.r, t.b) : 0.; }
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  vec3 V = normalize(uCam.xyz - vW);
  float ndl = max(dot(n, uSun.xyz), 0.);
  float sh = shadowAt(vW, n);
  // 風化：霧面材質加入雨水垂流痕與斑駁，並以雜訊擾動法線
  if(m > .85 && vUV.z > -.5){
    float st = texture(uNoise, vec2(vW.x*.9 + vW.z*.9, vW.y*.035)).r, bl = texture(uNoise, vW.xz*.11 + vW.y*.07).g;
    float hz = abs(n.y) < .5 ? 1. : 0.;
    base *= 1. - hz*.2*smoothstep(.45, .85, st) - .14*smoothstep(.35, .8, bl);
    n = normalize(n + (texture(uNoise, vW.xz*1.7 + vW.y*1.3).rgb - .5)*.1);
  }
  ndl = max(dot(n, uSun.xyz), 0.);
  vec3 lit = base * (uSunCol.rgb * ndl * sh + ambientL(n));
  // 材質：a≥.9 霧面；.6 亮面漆；.3 金屬；.1 自發光
  float gloss = m < .2 ? 0. : m < .45 ? .75 : m < .75 ? .5 : .08;
  // 金屬表面的刷紋粗糙度變化
  if(m >= .2 && m < .45) gloss *= .75 + .4*texture(uNoise, vW.xz*.6 + vW.y*2.1).b;
  gloss = max(gloss, glass);
  if(gloss > .01){
    vec3 H = normalize(uSun.xyz + V); float rough = mix(.85, .22, gloss);
    float F = .04 + .96*pow(1.-max(dot(n,V),0.), 5.);
    lit += uSunCol.rgb * sh * ndl * ggx(max(dot(n,H),0.), rough) * mix(.04, .5, gloss) * .25;
    vec3 R = reflect(-V, n);
    lit = mix(lit, skyAt(normalize(vec3(R.x, abs(R.y)+.02, R.z))) * mix(.6, 1., sh), F * gloss * (m < .45 && m >= .2 ? .55 : .8) );
  }
  if(m < .2) lit = base * (2.2 + 4.*uMisc.y);
  // 黃昏晨曦時窗戶亮燈
  if(glass > .5 && uMisc.y > .3){ float on = step(.62, fract(sin(dot(floor(vUV.xy), vec2(12.9898,78.233)) + floor(vW.x*.13)) * 43758.5453)); lit += vec3(1.,.72,.38)*.9*on*uMisc.y; }
  oCol = vec4(fogged(lit, vW), 1.);
}`;
const DEPTH_FS = `#version 300 es
precision mediump float; void main(){}`;
const STATIC_SH_VS = GLSL_HEAD + `layout(location=0) in vec3 aPos; void main(){ gl_Position = uViewProj * vec4(aPos, 1.); }`;

const POST_DOWN_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 oCol; uniform sampler2D uTex0; uniform vec2 uTexel; uniform float uThr;
void main(){
  vec3 c = texture(uTex0, vUV + uTexel*vec2(-1.,-1.)).rgb + texture(uTex0, vUV + uTexel*vec2(1.,-1.)).rgb + texture(uTex0, vUV + uTexel*vec2(-1.,1.)).rgb + texture(uTex0, vUV + uTexel*vec2(1.,1.)).rgb;
  c *= .25;
  if(uThr > 0.){ c = min(c, vec3(40.)); float l = max(c.r, max(c.g, c.b)); float k = max(l - uThr, 0.); k = k*k/(k + .6); c *= k/max(l, 1e-4); }
  oCol = vec4(c, 1.);
}`;
const POST_UP_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 oCol; uniform sampler2D uTex0; uniform vec2 uTexel;
void main(){
  vec3 c = texture(uTex0, vUV + uTexel*vec2(-.5,-.5)).rgb + texture(uTex0, vUV + uTexel*vec2(.5,-.5)).rgb + texture(uTex0, vUV + uTexel*vec2(-.5,.5)).rgb + texture(uTex0, vUV + uTexel*vec2(.5,.5)).rgb;
  oCol = vec4(c*.25, 1.);
}`;
// 螢幕空間環境光遮蔽（半解析度，僅用深度重建法線）
const POST_AO_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 oCol;
uniform highp sampler2D uTex1; uniform vec4 uProj; uniform vec2 uTexel;
float linZ(float d){ float z = d*2.-1.; return 2.*uProj.z*uProj.w/(uProj.w + uProj.z - z*(uProj.w - uProj.z)); }
vec3 vpos(vec2 uv){ float z = linZ(textureLod(uTex1, uv, 0.).r); return vec3((uv*2.-1.)*uProj.xy*z, -z); }
void main(){
  float d0 = textureLod(uTex1, vUV, 0.).r;
  if(d0 >= .99999){ oCol = vec4(1.); return; }
  vec3 P = vpos(vUV);
  vec3 a = vpos(vUV + vec2(uTexel.x, 0.)) - P, b = P - vpos(vUV - vec2(uTexel.x, 0.));
  vec3 c = vpos(vUV + vec2(0., uTexel.y)) - P, e = P - vpos(vUV - vec2(0., uTexel.y));
  vec3 dx = abs(a.z) < abs(b.z) ? a : b, dy = abs(c.z) < abs(e.z) ? c : e;
  vec3 N = normalize(cross(dx, dy)); if(dot(N, P) > 0.) N = -N;
  float z = -P.z, R = .85;
  float rs = min(R/(z*uProj.y)*.5, .09);
  float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453)*6.2831853;
  float ao = 0.;
  for(int i = 0; i < 12; i++){
    float f = (float(i) + .5)/12., an = ang + float(i)*2.39996;
    vec2 off = vec2(cos(an)*uProj.y/uProj.x, sin(an)) * rs * sqrt(f);
    vec3 v = vpos(vUV + off) - P; float vv = dot(v, v);
    float w = 1. - smoothstep(R*R*.6, R*R*2.2, vv);
    ao += max(dot(v, N) - .012 - .0015*z, 0.)/(vv + .02) * w;
  }
  ao = clamp(1. - ao/12.*R*.95, 0., 1.);
  ao = mix(ao, 1., smoothstep(55., 140., z));
  oCol = vec4(vec3(ao), 1.);
}`;
// 太陽光束：從太陽在螢幕上的位置往外做放射狀取樣，只累積天空（深度=1）的亮部
const POST_RAYS_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 oCol;
uniform sampler2D uTex0; uniform highp sampler2D uTex1; uniform vec4 uSunP; uniform float uThr;
void main(){
  vec2 d = uSunP.xy - vUV; float L = length(d*vec2(uSunP.w, 1.));
  vec2 st = d/32.*.92;
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
  vec2 uv = vUV + st*j; vec3 acc = vec3(0.); float dec = 1.;
  for(int i = 0; i < 32; i++){
    uv += st;
    vec2 cu = clamp(uv, vec2(.001), vec2(.999));
    float sky = step(.99999, textureLod(uTex1, cu, 0.).r);
    vec3 c = max(texture(uTex0, cu).rgb - uThr, vec3(0.));
    acc += min(c, vec3(6.))*sky*dec; dec *= .965;
  }
  oCol = vec4(acc/32.*uSunP.z*exp(-L*1.6), 1.);
}`;
const POST_COMP_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 oCol;
uniform sampler2D uTex0; uniform sampler2D uTex1; uniform sampler2D uTex2; uniform sampler2D uTex3; uniform vec4 uP; // exposure, motion, time, bloom
uniform vec2 uCenter; uniform vec4 uFx; // ao 強度, 光束強度, ao 貼圖 texel x, y
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec3 c = texture(uTex0, vUV).rgb;
  if(uP.y > .002){
    vec2 d = (vUV - uCenter); float r2 = dot(d,d);
    vec2 st = d * uP.y * smoothstep(.03, .5, r2) * .11;
    float j = hash(gl_FragCoord.xy + uP.z)*.5;
    vec3 acc = c; for(int i=1;i<6;i++){ acc += texture(uTex0, vUV - st*(float(i)+j)).rgb; } c = acc/6.;
  }
  if(uFx.x > 0.){
    vec2 t = uFx.zw;
    float ao = texture(uTex2, vUV).r*.4 + (texture(uTex2, vUV + vec2(t.x, t.y)).r + texture(uTex2, vUV + vec2(-t.x, t.y)).r + texture(uTex2, vUV + vec2(t.x, -t.y)).r + texture(uTex2, vUV - t).r)*.15;
    c *= mix(1., ao, uFx.x);
  }
  if(uFx.y > 0.){ vec2 t = uFx.zw*2.; c += (texture(uTex3, vUV).rgb*.5 + (texture(uTex3, vUV + t).rgb + texture(uTex3, vUV - t).rgb)*.25) * uFx.y; }
  c += texture(uTex1, vUV).rgb * uP.w;
  c *= uP.x;
  vec2 q = vUV - .5; float vig = 1. - dot(q,q)*.62; c *= vig*vig;
  c = aces(c);
  // 調色：中間調對比、暗部偏冷、亮部偏暖，增加層次
  float l = dot(c, vec3(.2126,.7152,.0722));
  c = mix(vec3(l), c, 1.1);
  c = mix(c, c*c*(3.-2.*c), .26);
  c *= mix(vec3(.96, .99, 1.05), vec3(1.035, 1., .955), smoothstep(.08, .7, l));
  c = clamp(c, 0., 1.);
  c = pow(c, vec3(1./2.2));
  c += (hash(gl_FragCoord.xy*.7 + uP.z*3.1) - .5)*.012;
  oCol = vec4(c, dot(c, vec3(.299,.587,.114)));
}`;
const POST_FXAA_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 oCol; uniform sampler2D uTex0; uniform vec2 uTexel;
void main(){
  vec4 cM = texture(uTex0, vUV);
  float lM = cM.a, lN = texture(uTex0, vUV + vec2(0., uTexel.y)).a, lS = texture(uTex0, vUV - vec2(0., uTexel.y)).a, lE = texture(uTex0, vUV + vec2(uTexel.x, 0.)).a, lW = texture(uTex0, vUV - vec2(uTexel.x, 0.)).a;
  float mn = min(lM, min(min(lN,lS), min(lE,lW))), mx = max(lM, max(max(lN,lS), max(lE,lW))), rng = mx - mn;
  if(rng < max(.035, mx*.11)){ oCol = vec4(cM.rgb, 1.); return; }
  float lNW = texture(uTex0, vUV + uTexel*vec2(-1.,1.)).a, lNE = texture(uTex0, vUV + uTexel*vec2(1.,1.)).a, lSW = texture(uTex0, vUV + uTexel*vec2(-1.,-1.)).a, lSE = texture(uTex0, vUV + uTexel*vec2(1.,-1.)).a;
  vec2 dir = vec2(-((lNW+lNE)-(lSW+lSE)), ((lNW+lSW)-(lNE+lSE)));
  float red = max((lNW+lNE+lSW+lSE)*.03125, .0078125);
  float rc = 1./(min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir*rc, -8., 8.)*uTexel;
  vec3 a = .5*(texture(uTex0, vUV + dir*(1./3.-.5)).rgb + texture(uTex0, vUV + dir*(2./3.-.5)).rgb);
  vec3 b = a*.5 + .25*(texture(uTex0, vUV + dir*-.5).rgb + texture(uTex0, vUV + dir*.5).rgb);
  float lb = dot(b, vec3(.299,.587,.114));
  oCol = vec4((lb < mn || lb > mx) ? a : b, 1.);
}`;

function initRender() {
  REN.ubo = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, REN.ubo);
  gl.bufferData(gl.UNIFORM_BUFFER, REN.uboData.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, REN.ubo);
  mkProg('terrain', TERRAIN_VS, TERRAIN_FS);
  mkProg('road', ROAD_VS, ROAD_FS);
  mkProg('decal', DECAL_VS, DECAL_FS);
  mkProg('static', STATIC_VS, STATIC_FS);
  mkProg('sh_static', STATIC_SH_VS, DEPTH_FS);
  mkProg('pdown', FSQ_VS, POST_DOWN_FS);
  mkProg('pup', FSQ_VS, POST_UP_FS);
  mkProg('pcomp', FSQ_VS, POST_COMP_FS);
  mkProg('pao', FSQ_VS, POST_AO_FS);
  mkProg('prays', FSQ_VS, POST_RAYS_FS);
  mkProg('pfxaa', FSQ_VS, POST_FXAA_FS);
}
function setQuality(key) {
  REN.qkey = key; REN.q = QUALITY[key];
  for (let i = 0; i < 2; i++) { if (REN.sh[i]) { gl.deleteFramebuffer(REN.sh[i].fb); gl.deleteTexture(REN.sh[i].tex); } }
  REN.sh[0] = mkShadowMap(REN.q.sh0);
  REN.sh[1] = mkShadowMap(REN.q.sh1 || 16);
  REN.w = 0; // 強制重建 FBO
}
function resizeRender(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth || 1280, ch = canvas.clientHeight || 720;
  let sc = REN.q.scale * REN.scale * dpr;
  let w = Math.max(320, Math.round(cw * sc)), h = Math.max(180, Math.round(ch * sc));
  const maxPix = 2560 * 1440; if (w * h > maxPix) { const k = Math.sqrt(maxPix / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
  if (w === REN.w && h === REN.h) return;
  REN.w = w; REN.h = h; canvas.width = w; canvas.height = h;
  delFBO(REN.scene); delFBO(REN.msaa); delFBO(REN.ldr); delFBO(REN.ao); delFBO(REN.rays); REN.bloom.forEach(delFBO); REN.bloom = []; REN.ao = REN.rays = null;
  const wantDT = REN.q.ao || REN.q.rays;
  REN.scene = mkFBO(w, h, { hdr: true, depth: true, depthTex: wantDT });
  if (wantDT && !REN.scene.ok) { delFBO(REN.scene); REN.scene = mkFBO(w, h, { hdr: true, depth: true }); }
  if (REN.scene.dtex) {
    if (REN.q.ao) REN.ao = mkFBO(w >> 1, h >> 1, { hdr: false });
    if (REN.q.rays) REN.rays = mkFBO(Math.max(64, w >> 2), Math.max(36, h >> 2), { hdr: true });
  }
  REN.msaa = null;
  if (REN.q.msaa) { const m = mkMSAAFBO(w, h, Math.min(REN.q.msaa, gl.getParameter(gl.MAX_SAMPLES))); if (m.ok) REN.msaa = m; else delFBO(m); }
  REN.ldr = mkFBO(w, h, { hdr: false });
  let bw = w >> 1, bh = h >> 1;
  for (let i = 0; REN.q.bloom !== false && i < 5 && bw > 8 && bh > 8; i++) { REN.bloom.push(mkFBO(bw, bh, { hdr: true })); bw >>= 1; bh >>= 1; }
}

function updateCamera(aspect) {
  const c = CAM;
  M4.perspective(c.proj, c.fov, aspect, c.near, c.far);
  M4.mul(c.vp, c.proj, c.view);
  c.r = [c.view[0], c.view[4], c.view[8]]; c.u = [c.view[1], c.view[5], c.view[9]]; c.f = [-c.view[2], -c.view[6], -c.view[10]];
  c.tanY = Math.tan(c.fov / 2); c.tanX = c.tanY * aspect;
  frustumPlanes(c.vp, c.planes);
}
function setCameraLook(px, py, pz, tx, ty, tz, roll = 0) {
  CAM.pos[0] = px; CAM.pos[1] = py; CAM.pos[2] = pz;
  let ux = 0, uy = 1, uz = 0;
  if (roll) { // 以視線為軸滾轉
    let fx = tx - px, fy = ty - py, fz = tz - pz; const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    let rx = fz * 1 - 0, rz = -fx; const rl = Math.hypot(rx, rz) || 1; rx = -fz / rl; rz = fx / rl; // right = f × up
    ux = Math.sin(roll) * rx; uy = Math.cos(roll); uz = Math.sin(roll) * rz;
  }
  M4.lookAt(CAM.view, px, py, pz, tx, ty, tz, ux, uy, uz);
}

const _lv = M4.create(), _lp = M4.create(), _bias = new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
function setupCascade(i, cx, cy, cz, radius, depth) {
  const L = SKY.sun, size = REN.sh[i].size;
  M4.lookAt(_lv, cx + L[0] * depth, cy + L[1] * depth, cz + L[2] * depth, cx, cy, cz, 0, 1, 0);
  // texel snapping
  const rx = _lv[0], ry = _lv[4], rz = _lv[8], ux = _lv[1], uy = _lv[5], uz = _lv[9];
  const texel = 2 * radius / size;
  const sx = cx * rx + cy * ry + cz * rz, sy = cx * ux + cy * uy + cz * uz;
  const dx = Math.round(sx / texel) * texel - sx, dy = Math.round(sy / texel) * texel - sy;
  cx += rx * dx + ux * dy; cy += ry * dx + uy * dy; cz += rz * dx + uz * dy;
  M4.lookAt(_lv, cx + L[0] * depth, cy + L[1] * depth, cz + L[2] * depth, cx, cy, cz, 0, 1, 0);
  M4.ortho(_lp, -radius, radius, -radius, radius, 1, depth * 2);
  M4.mul(REN.shVP[i], _lp, _lv);
  M4.mul(REN.shM[i], _bias, REN.shVP[i]);
  REN.shC[i][0] = cx; REN.shC[i][1] = cy; REN.shC[i][2] = cz; REN.shC[i][3] = radius;
}
function uploadUBO(vp) {
  const d = REN.uboData, t = SKY.tod;
  d.set(vp, 0); d.set(REN.shM[0], 16); d.set(REN.shM[1], 32);
  d[48] = CAM.pos[0]; d[49] = CAM.pos[1]; d[50] = CAM.pos[2]; d[51] = CAM.time;
  d[52] = SKY.sun[0]; d[53] = SKY.sun[1]; d[54] = SKY.sun[2]; d[55] = 1;
  d[56] = SKY.sunCol[0]; d[57] = SKY.sunCol[1]; d[58] = SKY.sunCol[2]; d[59] = t.exposure;
  d[60] = SKY.ambSky[0]; d[61] = SKY.ambSky[1]; d[62] = SKY.ambSky[2]; d[63] = 1;
  d[64] = SKY.ambGnd[0]; d[65] = SKY.ambGnd[1]; d[66] = SKY.ambGnd[2]; d[67] = REN.canopy || 0;
  d[68] = t.fog[0]; d[69] = t.fog[1]; d[70] = t.fog[2]; d[71] = t.fog[3] + (REN.fogBoost || 0) * 0.021;
  d[72] = 1; d[73] = 1; d[74] = 1; d[75] = (REN.fogBoost || 0) * 0.9;
  d[76] = 1 / REN.sh[0].size; d[77] = 1 / REN.sh[1].size; d[78] = REN.shC[0][3]; d[79] = REN.q.sh1 ? REN.shC[1][3] : 0;
  d[80] = REN.msaa ? 1 : 0; d[81] = REN.lightsOn; d[82] = 0; d[83] = 0;
  gl.bindBuffer(gl.UNIFORM_BUFFER, REN.ubo);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, d);
}
function bindCommonTex() {
  bindTex(TEXU.noise, TEX.noise); bindTex(TEXU.sky, SKY.lut);
  bindTex(TEXU.sh0, REN.sh[0].tex); bindTex(TEXU.sh1, REN.sh[1].tex);
}

function drawTerrainAndRoad() {
  const pl = CAM.planes, cp = CAM.pos;
  // 路面
  let P = useProg(PROGS.road);
  bindTex(0, TEX.ground, gl.TEXTURE_2D_ARRAY);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  for (const c of ROAD.chunks) {
    if (!sphereInFrustum(pl, c.cx, c.cy, c.cz, c.r)) continue;
    const d = Math.hypot(c.cx - cp[0], c.cz - cp[2]); if (d > REN.q.terr + 400) continue;
    gl.bindVertexArray(c.road.vao); gl.drawElements(gl.TRIANGLES, c.road.count, c.road.itype, 0);
  }
  gl.disable(gl.CULL_FACE);
  if (ROAD.side) { gl.bindVertexArray(ROAD.side.vao); gl.drawElements(gl.TRIANGLES, ROAD.side.count, ROAD.side.itype, 0); }
  // 路肩 + 地形
  P = useProg(PROGS.terrain);
  bindTex(0, TEX.ground, gl.TEXTURE_2D_ARRAY);
  const W = ROUTE.water;
  gl.uniform4f(P.u('uSea'), ROUTE.sea, W ? 1 : 0, W ? W.beach : 0, 0);
  if (W) { gl.uniform4fv(P.u('uWater'), W.deep); gl.uniform4fv(P.u('uWater2'), W.shallow); }
  gl.uniform3fv(P.u('uSoil'), ROUTE.soil); gl.uniform4f(P.u('uStyle'), 0, ROUTE.ponds ? 1 : 0, ROUTE.ponds || 0, 0);
  gl.disable(gl.CULL_FACE);
  for (const c of ROAD.chunks) {
    if (!sphereInFrustum(pl, c.cx, c.cy, c.cz, c.r)) continue;
    const d = Math.hypot(c.cx - cp[0], c.cz - cp[2]); if (d > REN.q.terr) continue;
    gl.bindVertexArray(c.sh.vao); gl.drawElements(gl.TRIANGLES, c.sh.count, c.sh.itype, 0);
  }
  gl.enable(gl.CULL_FACE);
  for (const c of TERRAIN.chunks) {
    if (!sphereInFrustum(pl, c.cx, c.cy, c.cz, c.r)) continue;
    const d = Math.hypot(c.cx - cp[0], c.cz - cp[2]) - 136;
    if (d > REN.q.terr + 800) continue;
    const ib = TERRAIN.ibs[d < 330 ? 0 : d < 900 ? 1 : 2];
    gl.bindVertexArray(c.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib.b);
    gl.drawElements(gl.TRIANGLES, ib.n, gl.UNSIGNED_SHORT, 0);
  }
  gl.uniform4f(P.u('uSea'), ROUTE.sea, W ? 1 : 0, 0, 1);
  gl.bindVertexArray(TERRAIN.coarse.vao);
  gl.drawElements(gl.TRIANGLES, TERRAIN.coarse.count, TERRAIN.coarse.itype, 0);
}
function drawDecals() {
  if (!ROAD.decals) return;
  useProg(PROGS.decal); bindTex(0, TEX.decal, gl.TEXTURE_2D_ARRAY);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4);
  gl.bindVertexArray(ROAD.decals.vao); gl.drawElements(gl.TRIANGLES, ROAD.decals.count, ROAD.decals.itype, 0);
  gl.disable(gl.POLYGON_OFFSET_FILL);
}

function renderFrame(dt) {
  const q = REN.q; REN.frame++;
  const aspect = REN.w / REN.h;
  updateCamera(aspect);
  bindCommonTex();
  // ── 陰影
  const f = CAM.f, cp = CAM.pos;
  const foc = REN.focus || [cp[0] + f[0] * 12, cp[1] + f[1] * 12, cp[2] + f[2] * 12];
  const r0 = REN.shadowR0 || 36;
  const do0 = !q.sh0Every || REN.frame % q.sh0Every === 0 || REN.forceFar;
  if (do0) setupCascade(0, foc[0] + f[0] * r0 * 0.45, foc[1], foc[2] + f[2] * r0 * 0.45, r0, 260);
  const doFar = q.sh1 && (q.farEvery <= 1 || REN.frame % q.farEvery === 0 || REN.forceFar);
  if (doFar) setupCascade(1, cp[0] + f[0] * 150, foc[1], cp[2] + f[2] * 150, 210, 420);
  REN.forceFar = false;
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
  gl.colorMask(false, false, false, false);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 3.5);
  for (let i = 0; i < 2; i++) {
    if (i === 1 && !doFar) continue;
    if (i === 0 && !do0) continue;
    gl.bindFramebuffer(gl.FRAMEBUFFER, REN.sh[i].fb);
    gl.viewport(0, 0, REN.sh[i].size, REN.sh[i].size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    if (i === 1 && !q.sh1) continue;
    uploadUBO(REN.shVP[i]);
    for (const fn of SCENE.shadow) fn(i, REN.shC[i]);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.colorMask(true, true, true, true);
  // ── 主場景（HDR）
  const target = REN.msaa || REN.scene;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
  gl.viewport(0, 0, REN.w, REN.h);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  uploadUBO(CAM.vp);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  for (const fn of SCENE.opaque) fn(0);
  drawTerrainAndRoad();
  for (const fn of SCENE.opaque) fn(1);
  gl.disable(gl.CULL_FACE);
  drawSky(CAM);
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  drawDecals();
  for (const fn of SCENE.blend) fn();
  gl.depthMask(true); gl.disable(gl.BLEND);
  // 車內視角：清深度後繪製座艙
  if (SCENE.cockpit.length && REN.cockpitOn) {
    gl.clear(gl.DEPTH_BUFFER_BIT); gl.depthFunc(gl.LESS);
    for (const fn of SCENE.cockpit) fn();
  }
  if (REN.msaa) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, REN.msaa.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, REN.scene.fb);
    gl.blitFramebuffer(0, 0, REN.w, REN.h, 0, 0, REN.w, REN.h, gl.COLOR_BUFFER_BIT | (REN.scene.dtex ? gl.DEPTH_BUFFER_BIT : 0), gl.NEAREST);
  }
  // ── 後製
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  const cockpit = SCENE.cockpit.length && REN.cockpitOn;
  // 環境光遮蔽
  let aoK = 0, raysK = 0;
  if (REN.ao && !cockpit) {
    let P = useProg(PROGS.pao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, REN.ao.fb); gl.viewport(0, 0, REN.ao.w, REN.ao.h);
    bindTex(1, REN.scene.dtex); gl.uniform4f(P.u('uProj'), CAM.tanX, CAM.tanY, CAM.near, CAM.far); gl.uniform2f(P.u('uTexel'), 1 / REN.ao.w, 1 / REN.ao.h);
    drawFSQ(); aoK = 0.75;
  }
  // 太陽光束
  if (REN.rays && !cockpit) {
    const s = SKY.sun, k = 1e4, vp = CAM.vp, wx = CAM.pos[0] + s[0] * k, wy = CAM.pos[1] + s[1] * k, wz = CAM.pos[2] + s[2] * k;
    const cx = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12], cy = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13], cw = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
    const facing = s[0] * CAM.f[0] + s[1] * CAM.f[1] + s[2] * CAM.f[2];
    if (cw > 0 && facing > 0.05 && s[1] > -0.02) {
      const ux = cx / cw * 0.5 + 0.5, uy = cy / cw * 0.5 + 0.5, edge = Math.max(Math.abs(ux - 0.5), Math.abs(uy - 0.5));
      raysK = smooth(0.05, 0.45, facing) * (1 - smooth(0.55, 1.1, edge)) * (0.45 + 0.55 * (1 - smooth(0.08, 0.55, s[1]))) * (1 - (REN.fogBoost || 0) * 0.6);
      if (raysK > 0.01) {
        const P = useProg(PROGS.prays);
        gl.bindFramebuffer(gl.FRAMEBUFFER, REN.rays.fb); gl.viewport(0, 0, REN.rays.w, REN.rays.h);
        bindTex(0, REN.scene.tex); bindTex(1, REN.scene.dtex);
        gl.uniform4f(P.u('uSunP'), ux, uy, 1.6, aspect); gl.uniform1f(P.u('uThr'), 0.55 / SKY.tod.exposure);
        drawFSQ();
      } else raysK = 0;
    }
  }
  let src = REN.scene, P = useProg(PROGS.pdown);
  for (let i = 0; i < REN.bloom.length; i++) {
    const b = REN.bloom[i];
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h);
    bindTex(0, src.tex); gl.uniform2f(P.u('uTexel'), 1 / src.w, 1 / src.h); gl.uniform1f(P.u('uThr'), i === 0 ? 1.15 / SKY.tod.exposure : 0);
    drawFSQ(); src = b;
  }
  P = useProg(PROGS.pup);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = REN.bloom.length - 1; i > 0; i--) {
    const b = REN.bloom[i - 1], s = REN.bloom[i];
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h);
    bindTex(0, s.tex); gl.uniform2f(P.u('uTexel'), 1 / s.w, 1 / s.h);
    drawFSQ();
  }
  gl.disable(gl.BLEND);
  P = useProg(PROGS.pcomp);
  gl.bindFramebuffer(gl.FRAMEBUFFER, REN.ldr.fb); gl.viewport(0, 0, REN.w, REN.h);
  bindTex(0, REN.scene.tex); bindTex(1, REN.bloom.length ? REN.bloom[0].tex : REN.scene.tex);
  bindTex(2, aoK ? REN.ao.tex : REN.scene.tex); bindTex(3, raysK ? REN.rays.tex : REN.scene.tex);
  gl.uniform4f(P.u('uP'), SKY.tod.exposure, REN.motion, CAM.time % 100, REN.bloom.length ? 0.2 / REN.bloom.length : 0);
  gl.uniform2f(P.u('uCenter'), 0.5, 0.52);
  gl.uniform4f(P.u('uFx'), aoK, raysK, REN.ao ? 1 / REN.ao.w : REN.rays ? 0.5 / REN.rays.w : 0, REN.ao ? 1 / REN.ao.h : REN.rays ? 0.5 / REN.rays.h : 0);
  drawFSQ();
  for (let u = 1; u <= 3; u++) bindTex(u, null); // 解除綁定，避免下一幀與場景 FBO 形成回饋迴圈
  P = useProg(PROGS.pfxaa);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, REN.w, REN.h);
  bindTex(0, REN.ldr.tex); gl.uniform2f(P.u('uTexel'), 1 / REN.w, 1 / REN.h);
  drawFSQ();
}
