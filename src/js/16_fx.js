// ───────────────────────── 碰撞毀損、冒煙粒子、拋錨 ─────────────────────────
// 撞擊 1–8 次：外觀逐次凹損、刮痕、灰塵，性能不變
// 第 9 次：接近全毀外觀，動力大幅下降（極速約 70 km/h），引擎冒煙
// 第 10 次：拋錨冒濃煙、雙黃燈閃爍，車主下車站在一旁雙手一攤
const FX = { max: 700, n: 0, p: null, inst: null, vao: null };
const FX_VS = GLSL_HEAD + `
layout(location=0) in vec2 aQ; layout(location=5) in vec4 iA; layout(location=6) in vec4 iB;
uniform vec3 uCR, uCU;
out vec2 vQ; out vec4 vB; out vec3 vW;
void main(){
  float c = cos(iB.z), s = sin(iB.z); vec2 q = mat2(c, -s, s, c) * aQ;
  vec3 w = iA.xyz + (uCR*q.x + uCU*q.y)*iA.w;
  vQ = aQ; vB = iB; vW = w; gl_Position = uViewProj * vec4(w, 1.);
}`;
const FX_FS = GLSL_HEAD + GLSL_LIGHT + `
in vec2 vQ; in vec4 vB; in vec3 vW; out vec4 oCol;
void main(){
  float d = length(vQ);
  float n = texture(uNoise, vQ*.32 + vec2(vB.z*.17, vB.x*.4)).r;
  float a = smoothstep(1., .2, d + (n - .5)*.75) * vB.w;
  if(a < .004) discard;
  if(vB.y < -1.5){ oCol = vec4(vec3(1.,.3,.5)*3.2*(1.2 - d), a*1.3); return; }
  vec3 tint = vB.y < 0. ? vec3(.5,.42,.32) : mix(vec3(.86,.85,.83), vec3(.07,.068,.065), vB.y);
  float lightK = .5 + .5*smoothstep(-.6, .6, dot(vec3(vQ, .4), normalize(vec3(.3, .7, .5))));
  vec3 lit = tint * (uSunCol.rgb * max(uSun.y, .05) * .55 * lightK + ambientL(vec3(0., 1., 0.)) * 1.05);
  oCol = vec4(fogged(lit, vW), a);
}`;
function initFX() {
  mkProg('fx', FX_VS, FX_FS);
  FX.p = new Float32Array(FX.max * 12); FX.inst = new Float32Array(FX.max * 8);
  const q = mkVAO([{ loc: 0, data: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), size: 2 }], new Uint16Array([0, 1, 2, 0, 2, 3]));
  q.instBuf = gl.createBuffer(); gl.bindVertexArray(q.vao); gl.bindBuffer(gl.ARRAY_BUFFER, q.instBuf);
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(5, 1);
  gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(6, 1);
  gl.bindVertexArray(null); FX.vao = q;
}
// 粒子：x y z vx vy vz age life s0 s1 dark rot
function fxSpawn(x, y, z, vx, vy, vz, life, s0, s1, dark) {
  if (FX.n >= FX.max) return;
  const o = FX.n++ * 12, p = FX.p;
  p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = vx; p[o + 4] = vy; p[o + 5] = vz; p[o + 6] = 0; p[o + 7] = life; p[o + 8] = s0; p[o + 9] = s1; p[o + 10] = dark; p[o + 11] = Math.random() * TAU;
}
const _fxo = [0, 0, 0];
function fxEmitCar(c, dt) {
  const k = c.dmg || 0; let rate = 0, dark = 0, sz = 1, life = 2.4;
  if (c.broken) { rate = 30; dark = 0.8; sz = 1.25; life = 4; }
  else if (k >= 9) { rate = 16; dark = 0.55; sz = 1.1; life = 3; }
  else if (k >= 7) { rate = 4; dark = 0.05; sz = 0.8; life = 2; }
  if (!rate) return;
  c.smAcc = (c.smAcc || 0) + rate * dt;
  if (c.smAcc < 1) return;
  carMatrix(c, _cm);
  while (c.smAcc >= 1) {
    c.smAcc -= 1;
    M4.tp(_cm, (Math.random() - 0.5) * 0.7, 0.85 + Math.random() * 0.1, 1.35 + Math.random() * 0.6, _fxo);
    const up = 0.7 + Math.random() * 0.9;
    fxSpawn(_fxo[0], _fxo[1], _fxo[2], c.vx * 0.2 + (Math.random() - 0.5) * 0.5 + 0.35, up, c.vz * 0.2 + (Math.random() - 0.5) * 0.5 + 0.2, life * (0.7 + Math.random() * 0.6), 0.28 * sz, 2.3 * sz, dark * (0.85 + Math.random() * 0.3));
  }
}
function stepFX(dt) {
  for (const c of GAME.cars) { if (c.hitCD > 0) c.hitCD -= dt; if (c.broken) c.brokenT = (c.brokenT || 0) + dt; fxEmitCar(c, dt); }
  const p = FX.p; let w = 0;
  for (let r = 0; r < FX.n; r++) {
    const o = r * 12; p[o + 6] += dt / p[o + 7]; if (p[o + 6] >= 1) continue;
    const drag = Math.exp(-dt * 1.4);
    p[o + 3] *= drag; p[o + 5] *= drag; p[o + 4] = p[o + 4] * Math.exp(-dt * 0.6) + (p[o + 10] < -1.5 ? -0.6 : p[o + 10] < 0 ? -1.2 : 0.25) * dt;
    p[o] += p[o + 3] * dt; p[o + 1] += p[o + 4] * dt; p[o + 2] += p[o + 5] * dt; p[o + 11] += dt * 0.4;
    if (w !== r) p.copyWithin(w * 12, o, o + 12);
    w++;
  }
  FX.n = w;
}
function drawFX() {
  if (!FX.n) return;
  const P = useProg(PROGS.fx), d = FX.inst, p = FX.p;
  gl.uniform3f(P.u('uCR'), CAM.r[0], CAM.r[1], CAM.r[2]); gl.uniform3f(P.u('uCU'), CAM.u[0], CAM.u[1], CAM.u[2]);
  for (let i = 0; i < FX.n; i++) {
    const o = i * 12, q = i * 8, a = p[o + 6];
    d[q] = p[o]; d[q + 1] = p[o + 1]; d[q + 2] = p[o + 2]; d[q + 3] = lerp(p[o + 8], p[o + 9], 1 - (1 - a) * (1 - a));
    d[q + 4] = a; d[q + 5] = p[o + 10]; d[q + 6] = p[o + 11];
    d[q + 7] = Math.min(1, a * 10) * Math.pow(1 - a, 1.4) * (p[o + 10] < -1.5 ? 1 : p[o + 10] < 0 ? 0.55 : 0.25 + 0.4 * p[o + 10]);
  }
  gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(FX.vao.vao); gl.bindBuffer(gl.ARRAY_BUFFER, FX.vao.instBuf); gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, FX.n * 8), gl.DYNAMIC_DRAW);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, FX.n);
  gl.enable(gl.CULL_FACE);
}
function fxClear() { FX.n = 0; }

// ── 撞擊登錄：dirX/dirZ 為世界座標中「接觸點相對車身」的方向
function registerHit(c, dirX, dirZ, speed) {
  if (!c || c.remote || c.broken || c.finished || (c.hitCD || 0) > 0 || GAME.state !== 'racing') return false;
  if (c.ai && (c.dmg || 0) >= 8) return false;
  c.hitCD = 0.75; c.dmg = (c.dmg || 0) + 1;
  if (!c.dents) c.dents = new Float32Array(40);
  // 換到車身局部座標（+X 左、+Z 前）
  const lx = dirX * Math.cos(c.yaw) - dirZ * Math.sin(c.yaw), lz = dirX * Math.sin(c.yaw) + dirZ * Math.cos(c.yaw);
  const a = Math.atan2(lx, lz);
  let px = Math.sin(a) * 0.93, pz = Math.cos(a) * 2.2;
  if (Math.abs(lx) > 0.75) pz = clamp(pz + (Math.random() - 0.5) * 1.6, -1.9, 1.9);
  const py = 0.42 + Math.random() * 0.3, str = clamp(speed / 9, 0.55, 1.35);
  const slot = (c.dmg - 1) % 10; c.dents.set([px, py, pz, str], slot * 4); c.dentVer = (c.dentVer || 0) + 1;
  // 撞擊點揚起塵土
  carMatrix(c, _cm); M4.tp(_cm, px * 1.05, 0.35, pz * 1.02, _fxo);
  for (let i = 0; i < 7; i++) fxSpawn(_fxo[0] + (Math.random() - 0.5) * 0.4, _fxo[1] + Math.random() * 0.3, _fxo[2] + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 2.2 + c.vx * 0.3, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 2.2 + c.vz * 0.3, 0.9 + Math.random() * 0.6, 0.25, 1.3, -1);
  if (c === GAME.player) {
    if (c.dmg >= DMG_MAX) breakDown(c);
    else if (c.dmg === 9) toast('第 9 次撞擊：車輛嚴重受損，動力下降！');
    else if (c.dmg >= 7) toast('撞擊 ' + c.dmg + '／10　引擎開始冒煙');
    else toast('撞擊 ' + c.dmg + '／10');
  }
  return true;
}
function breakDown(c) {
  c.broken = true; c.brokenT = 0; c.dmg = DMG_MAX;
  toast('車輛拋錨了…');
  AUDIO.hit(1); GAME.shake = 1;
}
// 拋錨後的流程：停車 → 切換環景鏡頭 → 車主下車 → 顯示結果
function stepBreakdown(p, dt) {
  if (!p.broken || p.remote) return;
  const t = p.brokenT || 0;
  if (t > 1.4 && !p.brokeCam) { p.brokeCam = true; GAME.camMode = 4; GAME.camDist = 1; GAME.camPitch = 0; GAME.camYaw = 0; }
  if (t > 1.6 && !p.brokeMsg) { p.brokeMsg = true; toast('車主下車了，看起來不知如何是好…'); }
  if (t > 7.5 && !p.brokeShown && GAME.state === 'racing') {
    p.brokeShown = true; GAME.state = 'finish';
    $('resPos').textContent = '拋錨退賽'; $('resTime').textContent = fmtTime(GAME.time);
    $('resBest').textContent = '撞擊 10 次，車輛無法行駛';
    $('resAvg').textContent = '已完成 ' + Math.round(sat((p.s - S_START) / (S_FINISH - S_START)) * 100) + '% 路程';
    $('resList').textContent = '';
    if (GAME.online) { NET.fins[NET.id] = -1; netSend({ t: 'fin', time: -1 }); netResults(); }
    document.body.classList.add('show-result');
  }
}
