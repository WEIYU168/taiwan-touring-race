'use strict';
// ───────────────────────── math & noise ─────────────────────────
const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { x = sat((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const sign = x => x < 0 ? -1 : 1;
const fract = x => x - Math.floor(x);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul((seed | 0) + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, oct, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function ridged(x, z, oct, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(vnoise(x * f, z * f, seed + i * 31) * 2 - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}
function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash2(i, 77, seed), hash2(i + 1, 77, seed), u);
}

// ───────────────────────── mat4 (column-major) ─────────────────────────
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  },
  ortho(out, l, r, b, t, n, f) {
    out.fill(0);
    out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = -2 / (f - n);
    out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = -(f + n) / (f - n); out[15] = 1;
    return out;
  },
  lookAt(out, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  },
  mul(out, a, b) {
    const o = M4._t;
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    out.set(o); return out;
  },
  _t: new Float32Array(16),
  invert(out, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  // rotation basis (columns r,u,f = local X,Y,Z axes in world) + translation
  fromBasis(out, rx, ry, rz, ux, uy, uz, fx, fy, fz, px, py, pz) {
    out[0] = rx; out[1] = ry; out[2] = rz; out[3] = 0;
    out[4] = ux; out[5] = uy; out[6] = uz; out[7] = 0;
    out[8] = fx; out[9] = fy; out[10] = fz; out[11] = 0;
    out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
    return out;
  },
  translate(out, x, y, z) { M4.identity(out); out[12] = x; out[13] = y; out[14] = z; return out; },
  rotX(out, a) { M4.identity(out); const c = Math.cos(a), s = Math.sin(a); out[5] = c; out[6] = s; out[9] = -s; out[10] = c; return out; },
  rotY(out, a) { M4.identity(out); const c = Math.cos(a), s = Math.sin(a); out[0] = c; out[2] = -s; out[8] = s; out[10] = c; return out; },
  rotZ(out, a) { M4.identity(out); const c = Math.cos(a), s = Math.sin(a); out[0] = c; out[1] = s; out[4] = -s; out[5] = c; return out; },
  scale(out, x, y, z) { M4.identity(out); out[0] = x; out[5] = y; out[10] = z; return out; },
  tp(m, x, y, z, o) { // transform point
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return o;
  },
  td(m, x, y, z, o) { // transform direction
    o[0] = m[0] * x + m[4] * y + m[8] * z;
    o[1] = m[1] * x + m[5] * y + m[9] * z;
    o[2] = m[2] * x + m[6] * y + m[10] * z;
    return o;
  }
};
const V3 = {
  norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; },
  cross(a, b, o) { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
};
// frustum planes from viewProj (for sphere culling)
function frustumPlanes(vp, out) {
  const p = out;
  const set = (i, a, b, c, d) => { const l = Math.hypot(a, b, c) || 1; p[i * 4] = a / l; p[i * 4 + 1] = b / l; p[i * 4 + 2] = c / l; p[i * 4 + 3] = d / l; };
  set(0, vp[3] + vp[0], vp[7] + vp[4], vp[11] + vp[8], vp[15] + vp[12]);
  set(1, vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8], vp[15] - vp[12]);
  set(2, vp[3] + vp[1], vp[7] + vp[5], vp[11] + vp[9], vp[15] + vp[13]);
  set(3, vp[3] - vp[1], vp[7] - vp[5], vp[11] - vp[9], vp[15] - vp[13]);
  set(4, vp[3] + vp[2], vp[7] + vp[6], vp[11] + vp[10], vp[15] + vp[14]);
  set(5, vp[3] - vp[2], vp[7] - vp[6], vp[11] - vp[10], vp[15] - vp[14]);
  return p;
}
function sphereInFrustum(p, x, y, z, r) {
  for (let i = 0; i < 6; i++) if (p[i * 4] * x + p[i * 4 + 1] * y + p[i * 4 + 2] * z + p[i * 4 + 3] < -r) return false;
  return true;
}
