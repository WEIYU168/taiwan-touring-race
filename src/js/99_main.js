// ───────────────────────── 啟動與路線載入 ─────────────────────────
const tick = () => new Promise(r => setTimeout(r, 0));
let WORLD_READY = false;
const prog = async (p, s) => { $('barI').style.width = p + '%'; $('loadTxt').textContent = s; await tick(); await tick(); };
async function loadRoute(key) {
  WORLD_READY = false; document.body.classList.remove('ready', 'show-menu', 'hud-on', 'show-result', 'show-pause');
  GAME.cars = []; GAME.player = null; GAME.state = 'boot';
  await prog(22, '測繪路線'); freeWorld(); RES.on = true;
  applyRoute(key);
  buildTrack(); ROUTE.init(); planHazards(); buildTerrainData(); prepareJunctions(); planProps();
  await prog(46, '堆疊地形與海岸');
  buildTerrainMeshes(); buildRoad();
  await prog(64, '種下沿線植被');
  placeVegetation();
  await prog(84, '豎立地標、護欄與標誌');
  buildProps(); buildHazards(); RES.on = false;
  await prog(96, '暖車');
  buildMinimap();
  document.querySelectorAll('.shield').forEach(e => { e.textContent = ROUTE.shield; e.style.fontSize = ROUTE.shield.length > 2 && !/^\d+$/.test(ROUTE.shield) ? '.62em' : ''; });
  $('rTitle').textContent = ROUTE.title; $('rSub').textContent = ROUTE.sub; $('rDesc').textContent = ROUTE.desc; $('rNote').textContent = ROUTE.note;
  $('route').innerHTML = SECTIONS.map(s => '<li><b>' + s.k0.toFixed(s.k0 % 1 ? 1 : 0) + '–' + s.k1.toFixed(s.k1 % 1 ? 1 : 0) + 'K</b><span>' + s.name + '</span></li>').join('');
  for (const o of $('sRoute').children) o.setAttribute('aria-pressed', o.dataset.v === key ? 'true' : 'false');
  for (const k in HUDC) delete HUDC[k];
  try { localStorage.setItem('r139_route', key); } catch (e) { }
  CS.init = false; REN.forceFar = true; WORLD_READY = true;
  showMenu(); document.body.classList.add('ready');
}
async function boot() {
  const canvas = $('gl');
  if (!initGL(canvas)) { $('loadTxt').textContent = '此瀏覽器不支援 WebGL2，請改用新版 Chrome、Edge、Firefox 或 Safari。'; return; }
  await prog(5, '調製天空與材質');
  initRender(); initSky();
  buildNoiseTex(); buildGroundTex(); buildLeafTex(); buildPropTex(); buildDecalTex();
  await prog(14, '組裝房車與樹種');
  buildVegMeshes(); buildCarMeshes(); buildHeartMesh(); initFX();
  SCENE.opaque.push(drawCars, drawProps, drawHazards, drawVegMain); SCENE.shadow.push(drawCarsShadow, drawPropsShadow, drawHazardsShadow, drawVegShadow); SCENE.cockpit.push(drawCockpit); SCENE.blend.push(drawFX);
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0; REN.touch = touch; if (touch) document.body.classList.add('touch');
  const small = Math.min(window.innerWidth, window.innerHeight) < 520;
  let qk = touch ? (small ? 'min' : 'low') : 'med', rk = 'kenting'; // 沒選過賽道時預設墾丁
  try { const s = localStorage.getItem('r139_q'); if (s && QUALITY[s]) qk = s; } catch (e) { } // 賽道每次開啟都從墾丁開始（沒選賽道的預設），不再沿用上次的選擇
  GAME.aid = 1; GAME.autoThr = touch; GAME.carModel = 0; GAME.steerSens = 1;
  try { const c = +localStorage.getItem('r139_car'); if (c >= 0 && c < CAR_MODELS.length) GAME.carModel = c; const st = localStorage.getItem('r139_steer'); if (st !== null && STEER[+st]) GAME.steerSens = +st; } catch (e) { }
  setQuality(qk); setTimeOfDay('day'); resizeRender(canvas);
  setupUI(canvas, qk);
  await loadRoute(rk);
  let last = performance.now(), acc = 0, slow = 0, fast = 0, n = 0;
  const TIERS = ['high', 'med', 'low', 'min'];
  function frame(t) {
    requestAnimationFrame(frame);
    if (!WORLD_READY) { last = t; return; }
    if (window.__manual && !window.__once) return; window.__once = false;
    const raw = (t - last) / 1000; let dt = Math.min(0.05, raw); last = t; if (window.__dt) dt = window.__dt;
    resizeRender(canvas);
    CAM.time += GAME.paused ? 0 : dt;
    stepGame(dt); updateGameCamera(dt);
    if (window.__cam) { const c = window.__cam; setCameraLook(c[0], c[1], c[2], c[3], c[4], c[5]); CAM.fov = 55 * DEG; REN.focus = [c[3], c[4], c[5]]; }
    updateHUD(dt);
    REN.stats.tris = 0; renderFrame(dt); updateNameTags();
    // 動態解析度 → 仍卡頓則自動降一級畫質
    if (!window.__manual && raw < 0.5) { n++; if (raw > 0.027) slow++; else if (raw < 0.019) fast++; acc += raw;
      if (acc > 2) { if (slow > n * 0.45) { if (REN.scale > 0.62) REN.scale *= 0.86; else { const i = TIERS.indexOf(REN.qkey); if (i < TIERS.length - 1) { setQuality(TIERS[i + 1]); REN.scale = 1; setSeg('sQ', TIERS[i + 1]); toast('已自動調整畫質為「' + QUALITY[TIERS[i + 1]].name + '」以維持流暢'); } } }
        else if (fast > n * 0.9 && REN.scale < 1) REN.scale = Math.min(1, REN.scale * 1.07); acc = 0; slow = 0; fast = 0; n = 0; } }
    window.READY = true;
  }
  requestAnimationFrame(frame);
  // 除錯介面（可傳送車子、改物理等）只在本機開發（localhost）或網址加 #debug 時開放，正式網站上不暴露
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hash === '#debug') window.G = { HAZ, launch: launchCar, spinOil: startSpin, hit: registerHit, FX, PROPS, sim: (n, dt) => { for (let i = 0; i < n; i++) stepGame(dt || 1 / 60); }, GAME, REN, CAM, TR, VEG, INP, SKY, begin: beginRace, place: placeOnTrack, tod: setTimeOfDay, quality: k => { setQuality(k); }, NET, netHandle, loadRoute, route: () => ROUTE, groundY };
}
// 車款介紹卡：pinned＝展示間停妥後顯示（滑鼠移開不會消失）
const CARD = { i: -1, pinned: false };
function showCarCard(i, pinned) {
  if (!pinned && CARD.pinned && CARD.i !== i && !$('carCard').hidden) { /* 預覽其他車款時暫時覆蓋 */ }
  const m = CAR_MODELS[i]; CARD.i = i; if (pinned) CARD.pinned = true;
  $('ccType').textContent = m.type; $('ccName').textContent = m.name; $('ccEn').textContent = m.en; $('ccLayout').textContent = m.layout; $('ccDesc').textContent = m.desc;
  $('ccStats').innerHTML = m.stats.map((v, k) => '<dt>' + STAT_NAMES[k] + '</dt><dd>' + '<i class="on"></i>'.repeat(v) + '<i></i>'.repeat(5 - v) + '</dd>').join('');
  $('ccGo').hidden = !document.body.classList.contains('show-menu');
  $('carCard').hidden = false;
}
function hideCarCard(force) {
  if (force) { CARD.pinned = false; $('carCard').hidden = true; return; }
  if (CARD.pinned && GAME.show && GAME.show.card) { showCarCard(GAME.show.model, true); return; }
  if (!CARD.pinned) $('carCard').hidden = true;
}
function setSeg(id, v) { for (const o of $(id).children) o.setAttribute('aria-pressed', o.dataset.v === String(v) ? 'true' : 'false'); }
function setupUI(canvas, qk) {
  const seg = (id, cb, init) => { const el = $(id); el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setSeg(id, b.dataset.v); cb(b.dataset.v); }); if (init !== undefined) setSeg(id, init); };
  GAME.selMode = 'race';
  const routeFail = e => { console.error('ROUTE FAIL', e && e.stack || e); $('loadTxt').textContent = '路線載入失敗：' + (e && e.message || e); };
  seg('sRoute', v => {
    // 連線對戰：只有房主決定賽道；房主沒選就是墾丁
    if (GAME.selMode === 'online' && NET.room && NET.id !== NET.host) { setSeg('sRoute', ROUTE.key); toast('只有房主可以選擇賽道'); return; }
    NET.routeChosen = true; if (netOpen() && NET.room && NET.id === NET.host) netSend({ t: 'route', route: v });
    if (ROUTE && v === ROUTE.key) { netRender(); return; } loadRoute(v).then(() => netRender()).catch(routeFail);
  });
  seg('sMode', v => {
    GAME.selMode = v; document.body.classList.toggle('mp', v === 'online'); updateGoLabel();
    if (v === 'online' && !NET.routeChosen && ROUTE && ROUTE.key !== 'kenting') loadRoute('kenting').then(() => netRender()).catch(routeFail); // 房主沒選賽道 → 預設墾丁
    else netRender();
  });
  seg('sTod', v => { GAME.tod = v; setTimeOfDay(v); REN.forceFar = true; });
  seg('sDiff', v => { GAME.diff = +v; });
  seg('sAid', v => { GAME.aid = +v; }, 1);
  seg('sAuto', v => { GAME.autoThr = v === '1'; document.body.classList.toggle('autothr', GAME.autoThr); }, GAME.autoThr ? 1 : 0);
  document.body.classList.toggle('autothr', GAME.autoThr);
  seg('sQ', v => { setQuality(v); REN.scale = 1; try { localStorage.setItem('r139_q', v); } catch (e) { } }, qk);
  const sl = $('sLiv'); LIVERIES.forEach((L, i) => { const b = document.createElement('button'); const c = v => 'rgb(' + v.map(x => Math.round(Math.pow(x, 1 / 2.2) * 255)).join(',') + ')'; b.style.background = c(L.body); b.innerHTML = '<i style="background:' + c(L.accent) + '"></i>'; b.dataset.v = i; b.title = L.name; b.setAttribute('aria-label', L.name); b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false'); sl.appendChild(b); });
  // 車款按鈕與介紹卡
  const sc = $('sCar');
  CAR_MODELS.forEach((m, i) => { const b = document.createElement('button'); b.dataset.v = i; b.setAttribute('aria-pressed', i === GAME.carModel ? 'true' : 'false'); b.innerHTML = '<span></span><small></small>'; b.firstChild.textContent = m.name; b.lastChild.textContent = m.type; sc.appendChild(b);
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showCarCard(i, false); });
    b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideCarCard(false); });
    b.addEventListener('focus', () => showCarCard(i, false)); b.addEventListener('blur', () => hideCarCard(false)); });
  seg('sCar', v => { GAME.carModel = +v; try { localStorage.setItem('r139_car', v); } catch (e) { } if (GAME.state === 'menu') startShowroom(+v); else showCarCard(+v, true); });
  $('ccBack').onclick = () => { hideCarCard(true); document.body.classList.remove('showroom'); };
  $('ccX').onclick = () => { hideCarCard(true); document.body.classList.remove('showroom'); };
  $('ccGo').onclick = () => { const i = CARD.i; if (i !== GAME.carModel) { GAME.carModel = i; setSeg('sCar', i); try { localStorage.setItem('r139_car', i); } catch (e) { } } hideCarCard(true); goPressed(); };
  seg('sSteer', v => { GAME.steerSens = +v; try { localStorage.setItem('r139_steer', v); } catch (e) { } toast('方向盤：' + STEER[+v].name); }, GAME.steerSens);
  seg('sLiv', v => { GAME.livery = +v; if (GAME.player) GAME.player.liv = LIVERIES[+v]; });
  const rp = $('rpm'); for (let i = 0; i < 18; i++) rp.appendChild(document.createElement('i'));
  $('go').onclick = goPressed; $('bAgain').onclick = () => { if (GAME.online) showMenu(); else beginRace(); };
  $('mpJoin').onclick = () => netConnect(); try { $('mpName').value = localStorage.getItem('r139_name') || ''; } catch (e) { } $('bMenu1').onclick = showMenu; $('bMenu2').onclick = showMenu; $('bResume').onclick = togglePause;
  $('bCam').onclick = cycleCam; $('bReset').onclick = resetCar; $('bPause').onclick = togglePause;
  window.addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; } INP.keys[e.code] = true;
    if (e.code === 'KeyC') cycleCam(); else if (e.code === 'KeyR') resetCar(); else if (e.code === 'KeyP' || e.code === 'Escape') togglePause(); else if (e.code === 'KeyM') { GAME.muted = !GAME.muted; toast(GAME.muted ? '靜音' : '聲音開啟'); } else if (e.code === 'KeyH') { GAME.hud = !GAME.hud; }
    else if (e.code === 'Enter' && document.body.classList.contains('show-menu')) goPressed();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
  window.addEventListener('keyup', e => { INP.keys[e.code] = false; });
  window.addEventListener('blur', () => { INP.keys = {}; INP.touch.g = INP.touch.b = 0; INP.touch.active = 0; });
  let px = 0, py = 0, pid = -1;
  canvas.addEventListener('pointerdown', e => { pid = e.pointerId; px = e.clientX; py = e.clientY; GAME.drag = true; try { canvas.setPointerCapture(pid); } catch (er) { } canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => { if (!GAME.drag || e.pointerId !== pid) return; GAME.camYaw -= (e.clientX - px) * 0.006; GAME.camPitch = clamp(GAME.camPitch + (e.clientY - py) * 0.004, -0.5, 1.1); px = e.clientX; py = e.clientY; });
  const up = e => { if (e.pointerId === pid) { GAME.drag = false; canvas.style.cursor = 'grab'; } }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { GAME.camDist = clamp(GAME.camDist * (e.deltaY > 0 ? 1.1 : 0.9), 0.6, 2.4); e.preventDefault(); }, { passive: false });
  // 觸控：踏板
  const tb = (id, key) => { const b = $(id); const on = e => { INP.touch[key] = 1; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) { } }, off = e => { INP.touch[key] = 0; e.preventDefault(); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('contextmenu', e => e.preventDefault()); };
  tb('tG', 'g'); tb('tB', 'b');
  // 觸控：左半邊類比轉向（按下處為中心，左右滑動）
  const sz = $('steer'), knob = $('knob'); let sid = -1, sx0 = 0;
  const setK = v => { knob.style.transform = 'translateX(' + (v * 70) + 'px)'; };
  sz.addEventListener('pointerdown', e => { sid = e.pointerId; sx0 = e.clientX; INP.touch.active = 1; INP.touch.sx = 0; knob.classList.add('on'); try { sz.setPointerCapture(sid); } catch (er) { } e.preventDefault(); });
  sz.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; const v = clamp((e.clientX - sx0) / STEER[GAME.steerSens === undefined ? 1 : GAME.steerSens].px, -1, 1); INP.touch.sx = -Math.sign(v) * Math.pow(Math.abs(v), 1.25); setK(v); });
  const sup = e => { if (e.pointerId !== sid) return; sid = -1; INP.touch.active = 0; INP.touch.sx = 0; knob.classList.remove('on'); setK(0); };
  sz.addEventListener('pointerup', sup); sz.addEventListener('pointercancel', sup);
  document.addEventListener('contextmenu', e => { if (REN.touch) e.preventDefault(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && GAME.state === 'racing' && !GAME.paused && GAME.mode !== 'cruise') togglePause(); else if (!document.hidden && REN.touch && (GAME.state === 'racing' || GAME.state === 'count')) keepAwake(true); }); // 切回來時重新要求螢幕不休眠（切走時系統會自動放開）
  // 全螢幕：Android／iPad 用全螢幕 API（並嘗試鎖橫向）；iPhone 的 Safari 沒有這個功能，改顯示「加入主畫面」說明
  { const de = document.documentElement, rf = de.requestFullscreen || de.webkitRequestFullscreen, bf = $('bFull'), ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (rf) { bf.hidden = false; bf.onclick = async () => { try { if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else { await rf.call(de); try { await screen.orientation.lock('landscape'); } catch (e) { } } } catch (e) { } }; }
    if (ios && !(rf && !/iPhone/.test(navigator.userAgent))) $('fsTip').hidden = false; }
}
window.addEventListener('error', e => console.error('ERR', e.message, e.lineno));
boot().catch(e => { console.error('BOOT FAIL', e && e.stack || e); const l = $('loadTxt'); if (l) l.textContent = '載入失敗：' + (e && e.message || e); });
