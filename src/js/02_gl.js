// ───────────────────────── WebGL2 helpers ─────────────────────────
let gl = null;
const CAPS = { floatRT: false, halfRT: false, aniso: null, maxAniso: 1, floatLinear: false };
const RES = { on: false, list: [] };
function freeWorld() { gl.bindVertexArray(null); for (const r of RES.list) { if (r[0]) gl.deleteVertexArray(r[1]); else gl.deleteBuffer(r[1]); } RES.list = []; }
const TEXU = { noise: 5, sky: 6, sh0: 7, sh1: 8 };

function initGL(canvas) {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) return false;
  CAPS.floatRT = !!gl.getExtension('EXT_color_buffer_float');
  CAPS.halfRT = !!gl.getExtension('EXT_color_buffer_half_float') || CAPS.floatRT;
  CAPS.floatLinear = !!gl.getExtension('OES_texture_float_linear');
  CAPS.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (CAPS.aniso) CAPS.maxAniso = Math.min(8, gl.getParameter(CAPS.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  // 路線資源追蹤：切換路線時釋放
  const cb = gl.createBuffer.bind(gl), cv = gl.createVertexArray.bind(gl);
  gl.createBuffer = () => { const b = cb(); if (RES.on) RES.list.push([0, b]); return b; };
  gl.createVertexArray = () => { const v = cv(); if (RES.on) RES.list.push([1, v]); return v; };
  return true;
}

const GLSL_HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
precision highp sampler2DArray;
layout(std140) uniform Frame {
  mat4 uViewProj;
  mat4 uShadowM0;
  mat4 uShadowM1;
  vec4 uCam;      // xyz camera, w time
  vec4 uSun;      // xyz direction to sun, w shadow enable
  vec4 uSunCol;   // rgb sun radiance, w exposure
  vec4 uAmbSky;   // rgb, w wind
  vec4 uAmbGnd;   // rgb, w canopy ambient darkening
  vec4 uFog;      // x density, y falloff, z base height, w haze density
  vec4 uFogCol;   // rgb tint, w unused
  vec4 uShadowP;  // x texel0, y texel1, z radius0, w radius1
  vec4 uMisc;     // x lod/alpha bias, y pass flag, z,w spare
};
`;
const GLSL_LIGHT = `
uniform sampler2D uSkyLUT;
uniform sampler2DShadow uSh0;
uniform sampler2DShadow uSh1;
uniform sampler2D uNoise;
vec2 skyUV(vec3 d){ return vec2(atan(d.x, d.z)*0.15915494+0.5, sqrt(clamp(d.y,0.,1.))*0.96+0.02); }
vec3 skyAt(vec3 d){ return textureLod(uSkyLUT, skyUV(d), 0.).rgb; }
vec3 fogColor(vec3 dir){
  vec3 hd = normalize(vec3(dir.x, 0.03 + max(dir.y,0.)*0.6, dir.z));
  vec3 c = skyAt(hd) * uFogCol.rgb; float l = dot(c, vec3(.3,.5,.2));
  return mix(c, vec3(l*1.08 + .02)*vec3(.97,1.,1.03), uFogCol.w);
}
vec3 fogged(vec3 col, vec3 wp){
  vec3 v = wp - uCam.xyz; float d = length(v); vec3 dir = v/max(d,1e-3);
  float k = uFog.y; float t = k*dir.y*d;
  float integ = abs(t) > 1e-3 ? (1.-exp(-t))/t : 1.0 - 0.5*t;
  float od = uFog.x * exp(min(-k*(uCam.y-uFog.z), 3.0)) * d * integ + uFog.w * d;
  float f = 1.0 - exp(-od);
  return mix(col, fogColor(dir), f);
}
float pcf9(sampler2DShadow s, vec3 c, float ts){
  float r = 0.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) r += texture(s, vec3(c.xy + vec2(float(x),float(y))*ts*1.1, c.z));
  return r/9.;
}
float pcf4(sampler2DShadow s, vec3 c, float ts){
  float r = texture(s, vec3(c.xy + vec2(-.5,-.5)*ts, c.z)) + texture(s, vec3(c.xy + vec2(.5,-.5)*ts, c.z))
          + texture(s, vec3(c.xy + vec2(-.5,.5)*ts, c.z)) + texture(s, vec3(c.xy + vec2(.5,.5)*ts, c.z));
  return r*.25;
}
float shadowAt(vec3 wp, vec3 n){
  if(uSun.w < .5) return 1.;
  vec3 q0 = (uShadowM0 * vec4(wp + n*0.05, 1.)).xyz;
  vec2 e0 = min(q0.xy, 1.-q0.xy);
  float in0 = smoothstep(0.0, 0.06, min(e0.x, e0.y));
  float s = 1.;
  float s1 = 1.;
  vec3 q1 = (uShadowM1 * vec4(wp + n*0.35, 1.)).xyz;
  vec2 e1 = min(q1.xy, 1.-q1.xy);
  float in1 = smoothstep(0.0, 0.08, min(e1.x, e1.y));
  if(in1 > 0. && q1.z < 1. && q1.z > 0.) s1 = mix(1., pcf4(uSh1, vec3(q1.xy, q1.z - 0.0012), uShadowP.y), in1);
  if(in0 > 0. && q0.z < 1. && q0.z > 0.) s = mix(s1, pcf9(uSh0, vec3(q0.xy, q0.z - 0.0005), uShadowP.x), in0);
  else s = s1;
  return s;
}
vec3 ambientL(vec3 n){
  float h = n.y*0.5+0.5;
  vec3 a = mix(uAmbGnd.rgb, uAmbSky.rgb, h);
  // 朝太陽方位的一側天空較亮；朝下的面接收地面反彈的暖色日光
  vec3 sh = normalize(vec3(uSun.x, 0., uSun.z) + vec3(1e-4));
  float sk = max(uSun.y, 0.);
  a += uSunCol.rgb * (0.03*max(dot(n, sh), 0.)*(0.4 + 0.6*h) + 0.045*sk*(1.-h)*vec3(1., .9, .75));
  return a;
}
// 鏡面遮蔽：陰影中的反射減弱
float specOcc(float sh, float ndv){ return mix(0.5, 1.0, sh) * (0.6 + 0.4*ndv); }
float ggx(float ndh, float rough){ float a = rough*rough; float a2 = a*a; float d = ndh*ndh*(a2-1.)+1.; return a2/(3.14159*d*d); }
`;

const PROGS = {};
function mkProg(name, vs, fs) {
  const comp = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
      console.error('SHADER ERROR [' + name + ']\n' + log + '\n' + lines.slice(0, 6000));
      throw new Error('shader ' + name + ': ' + log);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, comp(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('LINK ERROR [' + name + '] ' + gl.getProgramInfoLog(p)); throw new Error('link ' + name); }
  const bi = gl.getUniformBlockIndex(p, 'Frame');
  if (bi !== gl.INVALID_INDEX && bi !== -1) gl.uniformBlockBinding(p, bi, 0);
  const P = { p, name, locs: {} };
  P.u = n => (n in P.locs) ? P.locs[n] : (P.locs[n] = gl.getUniformLocation(p, n));
  gl.useProgram(p);
  const fixed = { uNoise: TEXU.noise, uSkyLUT: TEXU.sky, uSh0: TEXU.sh0, uSh1: TEXU.sh1, uTex0: 0, uTex1: 1, uTex2: 2, uTex3: 3 };
  for (const k in fixed) { const l = P.u(k); if (l) gl.uniform1i(l, fixed[k]); }
  PROGS[name] = P;
  return P;
}
function useProg(P) { gl.useProgram(P.p); return P; }

// generic VAO: attribs = [{loc,data,size,type?,norm?,div?,int?}], idx
function mkVAO(attribs, idx, dyn) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bufs = [];
  for (const a of attribs) {
    const b = a.buf || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    if (a.data) gl.bufferData(gl.ARRAY_BUFFER, a.data, a.dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const type = a.type || gl.FLOAT;
    gl.enableVertexAttribArray(a.loc);
    gl.vertexAttribPointer(a.loc, a.size, type, !!a.norm, a.stride || 0, a.offset || 0);
    if (a.div) gl.vertexAttribDivisor(a.loc, a.div);
    bufs.push(b);
  }
  let ib = null, itype = gl.UNSIGNED_SHORT, count = 0;
  if (idx) {
    ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    itype = idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    count = idx.length;
  }
  gl.bindVertexArray(null);
  return { vao, bufs, ib, itype, count };
}

// ───────────────────────── static mesh builder ─────────────────────────
class MB {
  constructor(cap = 2048) {
    this.cap = cap; this.icap = cap * 3;
    this.p = new Float32Array(cap * 3); this.n = new Float32Array(cap * 3); this.t = new Float32Array(cap * 3);
    this.c = new Uint8Array(cap * 4); this.i = new Uint32Array(this.icap);
    this.nv = 0; this.ni = 0;
    this.cr = 255; this.cg = 255; this.cb = 255; this.ca = 255; this.layer = -1;
    this.m = null; this.tmp = [0, 0, 0];
  }
  _grow() {
    const cap = this.cap * 2;
    const g = (A, old, k) => { const a = new A(cap * k); a.set(old); return a; };
    this.p = g(Float32Array, this.p, 3); this.n = g(Float32Array, this.n, 3); this.t = g(Float32Array, this.t, 3); this.c = g(Uint8Array, this.c, 4);
    this.cap = cap;
  }
  _growI() { const a = new Uint32Array(this.icap * 2); a.set(this.i); this.i = a; this.icap *= 2; }
  col(r, g, b, a = 1) { this.cr = sat(r) * 255 | 0; this.cg = sat(g) * 255 | 0; this.cb = sat(b) * 255 | 0; this.ca = sat(a) * 255 | 0; return this; }
  hex(h, a = 1) { return this.col((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255, a); }
  lay(l) { this.layer = l; return this; }
  v(x, y, z, nx, ny, nz, u = 0, v = 0) {
    if (this.nv >= this.cap) this._grow();
    const k = this.nv, m = this.m;
    if (m) {
      const px = m[0] * x + m[4] * y + m[8] * z + m[12], py = m[1] * x + m[5] * y + m[9] * z + m[13], pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const qx = m[0] * nx + m[4] * ny + m[8] * nz, qy = m[1] * nx + m[5] * ny + m[9] * nz, qz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(qx, qy, qz) || 1;
      x = px; y = py; z = pz; nx = qx / l; ny = qy / l; nz = qz / l;
    }
    this.p[k * 3] = x; this.p[k * 3 + 1] = y; this.p[k * 3 + 2] = z;
    this.n[k * 3] = nx; this.n[k * 3 + 1] = ny; this.n[k * 3 + 2] = nz;
    this.t[k * 3] = u; this.t[k * 3 + 1] = v; this.t[k * 3 + 2] = this.layer;
    this.c[k * 4] = this.cr; this.c[k * 4 + 1] = this.cg; this.c[k * 4 + 2] = this.cb; this.c[k * 4 + 3] = this.ca;
    return this.nv++;
  }
  tri(a, b, c) { if (this.ni + 3 > this.icap) this._growI(); this.i[this.ni++] = a; this.i[this.ni++] = b; this.i[this.ni++] = c; }
  quad(a, b, c, d) { if (this.ni + 6 > this.icap) this._growI(); const i = this.i; i[this.ni++] = a; i[this.ni++] = b; i[this.ni++] = c; i[this.ni++] = a; i[this.ni++] = c; i[this.ni++] = d; }
  // flat quad from 4 points (ccw seen from the normal side), uv rect
  q4(a, b, c, d, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i0 = this.v(a[0], a[1], a[2], nx, ny, nz, u0, v0), i1 = this.v(b[0], b[1], b[2], nx, ny, nz, u1, v0),
      i2 = this.v(c[0], c[1], c[2], nx, ny, nz, u1, v1), i3 = this.v(d[0], d[1], d[2], nx, ny, nz, u0, v1);
    this.quad(i0, i1, i2, i3);
  }
  // axis-aligned box centred at (cx,cy,cz) with half sizes; uvm = metres per uv unit (0 → 0..1 per face)
  box(cx, cy, cz, hx, hy, hz, uvm = 0, faces = 63) {
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    const U = (w) => uvm ? w / uvm : 1;
    if (faces & 1) this.q4([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0, 0, U(hz * 2), U(hy * 2)); // +X
    if (faces & 2) this.q4([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0, 0, U(hz * 2), U(hy * 2)); // -X
    if (faces & 4) this.q4([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 0, U(hx * 2), U(hz * 2)); // +Y
    if (faces & 8) this.q4([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, 0, U(hx * 2), U(hz * 2)); // -Y
    if (faces & 16) this.q4([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, U(hx * 2), U(hy * 2)); // +Z
    if (faces & 32) this.q4([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, U(hx * 2), U(hy * 2)); // -Z
  }
  // cylinder / cone along Y from y0 to y1
  cyl(cx, y0, cz, r0, r1, h, seg = 10, capTop = true, capBot = false, vScale = 1) {
    const base = this.nv; const sl = (r0 - r1) / h;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU, c = Math.cos(a), s = Math.sin(a);
      const nl = Math.hypot(1, sl);
      this.v(cx + c * r0, y0, cz + s * r0, c / nl, sl / nl, s / nl, i / seg * 2, 0);
      this.v(cx + c * r1, y0 + h, cz + s * r1, c / nl, sl / nl, s / nl, i / seg * 2, h * vScale);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; this.quad(a, a + 1, a + 3, a + 2); }
    if (capTop && r1 > 0.001) { const c0 = this.v(cx, y0 + h, cz, 0, 1, 0, .5, .5); const b = this.nv; for (let i = 0; i <= seg; i++) { const a = i / seg * TAU; this.v(cx + Math.cos(a) * r1, y0 + h, cz + Math.sin(a) * r1, 0, 1, 0, .5, .5); } for (let i = 0; i < seg; i++) this.tri(c0, b + i + 1, b + i); }
    if (capBot) { const c0 = this.v(cx, y0, cz, 0, -1, 0, .5, .5); const b = this.nv; for (let i = 0; i <= seg; i++) { const a = i / seg * TAU; this.v(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0, .5, .5); } for (let i = 0; i < seg; i++) this.tri(c0, b + i, b + i + 1); }
  }
  // surface of revolution around Y. profile = [[r,y],...] bottom→top
  lathe(cx, cy, cz, prof, seg = 16, sx = 1, sz = 1) {
    const base = this.nv, np = prof.length;
    for (let j = 0; j < np; j++) {
      const a = prof[Math.max(0, j - 1)], b = prof[Math.min(np - 1, j + 1)];
      let dr = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dr, dy) || 1; const nr = dy / l, ny = -dr / l;
      for (let i = 0; i <= seg; i++) {
        const an = i / seg * TAU, c = Math.cos(an), s = Math.sin(an);
        this.v(cx + c * prof[j][0] * sx, cy + prof[j][1], cz + s * prof[j][0] * sz, c * nr, ny, s * nr, i / seg, j / (np - 1));
      }
    }
    for (let j = 0; j < np - 1; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i; this.quad(a, a + seg + 1, a + seg + 2, a + 1); }
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, seg = 14, rings = 9) {
    const base = this.nv;
    for (let j = 0; j <= rings; j++) {
      const ph = -PI / 2 + j / rings * PI, cp = Math.cos(ph), sp = Math.sin(ph);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU, c = Math.cos(a), s = Math.sin(a);
        let nx = c * cp / rx, ny = sp / ry, nz = s * cp / rz; const l = Math.hypot(nx, ny, nz) || 1;
        this.v(cx + c * cp * rx, cy + sp * ry, cz + s * cp * rz, nx / l, ny / l, nz / l, i / seg, j / rings);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i; this.quad(a, a + seg + 1, a + seg + 2, a + 1); }
  }
  append(o) { // append another MB (already transformed)
    const base = this.nv;
    while (this.nv + o.nv > this.cap) this._grow();
    while (this.ni + o.ni > this.icap) this._growI();
    this.p.set(o.p.subarray(0, o.nv * 3), this.nv * 3); this.n.set(o.n.subarray(0, o.nv * 3), this.nv * 3);
    this.t.set(o.t.subarray(0, o.nv * 3), this.nv * 3); this.c.set(o.c.subarray(0, o.nv * 4), this.nv * 4);
    for (let k = 0; k < o.ni; k++) this.i[this.ni + k] = o.i[k] + base;
    this.nv += o.nv; this.ni += o.ni;
  }
  bounds() {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9; const p = this.p;
    for (let k = 0; k < this.nv; k++) { const x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    return { cx, cy, cz, r: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 };
  }
  build() {
    if (!this.nv) return null;
    const idx = this.nv < 65536 ? new Uint16Array(this.i.subarray(0, this.ni)) : this.i.slice(0, this.ni);
    const m = mkVAO([
      { loc: 0, data: this.p.subarray(0, this.nv * 3), size: 3 },
      { loc: 1, data: this.n.subarray(0, this.nv * 3), size: 3 },
      { loc: 2, data: this.t.subarray(0, this.nv * 3), size: 3 },
      { loc: 3, data: this.c.subarray(0, this.nv * 4), size: 4, type: gl.UNSIGNED_BYTE, norm: true }
    ], idx);
    Object.assign(m, this.bounds());
    return m;
  }
}

// ───────────────────────── textures & framebuffers ─────────────────────────
function texParams(target, o) {
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, o.wrap || gl.REPEAT);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, o.wrapT || o.wrap || gl.REPEAT);
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, o.min || (o.mip === false ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR));
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, o.mag || gl.LINEAR);
  if (CAPS.aniso && o.aniso !== false && o.mip !== false) gl.texParameterf(target, CAPS.aniso.TEXTURE_MAX_ANISOTROPY_EXT, o.aniso || CAPS.maxAniso);
}
function texFromCanvas(cv, o = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, o.srgb === false ? gl.RGBA8 : gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  texParams(gl.TEXTURE_2D, o);
  if (o.mip !== false) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
function texFromData(w, h, data, o = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, o.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  texParams(gl.TEXTURE_2D, o);
  if (o.mip !== false) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
// layers: array of canvases or Uint8Array RGBA (all size×size)
function texArray(layers, w, h, o = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  const levels = o.mip === false ? 1 : Math.floor(Math.log2(Math.max(w, h))) + 1;
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, o.srgb === false ? gl.RGBA8 : gl.SRGB8_ALPHA8, w, h, layers.length);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  // flipV：畫布直接上傳時畫布頂端是 v=0，但路牌／建築／路面噴字的模型貼圖座標都以「v=1 在上」寫成（見 canvasPixels），
  // 不翻轉的話所有中文字會上下顛倒，所以這幾組貼圖上傳前先把畫布上下翻成 v=1 在頂端。
  if (o.flipV) layers = layers.map(L => (L instanceof Uint8Array || L instanceof Uint8ClampedArray) ? L : canvasPixels(L));
  layers.forEach((L, i) => {
    if (L instanceof Uint8Array || L instanceof Uint8ClampedArray) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, L);
    else gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, L);
  });
  texParams(gl.TEXTURE_2D_ARRAY, o);
  if (o.mip !== false) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  return t;
}
function bindTex(unit, tex, target) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target || gl.TEXTURE_2D, tex); }

function mkColorTex(w, h, hdr, linear = true) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  if (hdr && CAPS.halfRT) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function mkFBO(w, h, o = {}) {
  const f = { w, h, fb: gl.createFramebuffer(), tex: null, depth: null };
  gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
  f.tex = mkColorTex(w, h, o.hdr !== false);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
  if (o.depthTex) { // 可取樣的深度貼圖（SSAO、光束遮罩用）
    f.dtex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, f.dtex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, f.dtex, 0);
  } else if (o.depth) {
    f.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, f.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.depth);
  }
  f.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}
function mkMSAAFBO(w, h, samples) {
  const f = { w, h, fb: gl.createFramebuffer() };
  gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
  f.color = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, f.color);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, CAPS.halfRT ? gl.RGBA16F : gl.RGBA8, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, f.color);
  f.depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, f.depth);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.depth);
  f.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}
function delFBO(f) {
  if (!f) return;
  gl.deleteFramebuffer(f.fb);
  if (f.tex) gl.deleteTexture(f.tex);
  if (f.dtex) gl.deleteTexture(f.dtex);
  if (f.depth) gl.deleteRenderbuffer(f.depth);
  if (f.color) gl.deleteRenderbuffer(f.color);
}
function mkShadowMap(size) {
  const s = { size, fb: gl.createFramebuffer(), tex: gl.createTexture() };
  gl.bindTexture(gl.TEXTURE_2D, s.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, s.tex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return s;
}
// fullscreen triangle
let FSQ = null;
function drawFSQ() {
  if (!FSQ) FSQ = mkVAO([{ loc: 0, data: new Float32Array([-1, -1, 3, -1, -1, 3]), size: 2 }], null);
  gl.bindVertexArray(FSQ.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
}
const FSQ_VS = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos, 0., 1.); }`;
