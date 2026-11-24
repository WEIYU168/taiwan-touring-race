// ───────────────────────── 線上對戰（Cloudflare Worker 或本機 server.js） ─────────────────────────
// 連線：GET /api/match 取得自動配對房號 → WebSocket /ws?room=XXXX（Cloudflare 版，見 worker/index.js）
// 協定（JSON over WebSocket）：
//   → join{room,name,liv}  start{route,tod}  ready  s{s,d,v,r,st,b}  fin{time}
//   ← room{room,you,host,players[],phase}  load{route,tod}  go  s{id,…}  fin{id,time}  err{msg}
const NET = { ws: null, id: null, host: null, room: null, players: [], acc: 0, fins: {} };
const netOpen = () => NET.ws && NET.ws.readyState === 1;
const netSend = o => { if (netOpen()) NET.ws.send(JSON.stringify(o)); };
function netStatus(t) { $('mpStat').textContent = t; }
function netRender() {
  const me = NET.players.find(p => p.id === NET.id);
  $('mpList').innerHTML = NET.players.map(p => '<li>' + (p.id === NET.host ? '<b>房主</b>' : '<b>車手</b>') + '<span></span></li>').join('');
  [...$('mpList').children].forEach((li, i) => { li.lastChild.textContent = NET.players[i].name + (NET.players[i].id === NET.id ? '（你）' : ''); });
  const rn = k => (ROUTES[k] ? ROUTES[k].title : k);
  if (NET.room) netStatus('房號 ' + NET.room + '　目前 ' + NET.players.length + '／8 人。賽道：' + rn(NET.route || 'kenting') + (NET.id === NET.host ? '（你是房主，可在上方「路線」更換，沒選就是墾丁）。' : '（由房主決定）。') + (NET.quick ? '自動配對湊滿 8 人會自動出發；' : '') + '想和朋友同組，請把房號告訴他們，輸入後按「連線」。' + (me && NET.id !== NET.host ? '等待房主出發。' : ''));
  updateGoLabel();
}
function updateGoLabel() {
  const g = $('go'); if (GAME.selMode !== 'online') { g.textContent = '出　發'; g.disabled = false; return; }
  if (!NET.room) { g.textContent = '請先連線加入房間'; g.disabled = true; }
  else if (NET.id === NET.host) { g.textContent = '出　發（' + NET.players.length + ' 人）'; g.disabled = false; }
  else { g.textContent = '等待房主出發'; g.disabled = true; }
}
// 房號留空＝自動配對（每 8 人一組，伺服器自動分房）；輸入房號＝和朋友進同一個房間。
// 本機 node server.js 沒有 /api/match，會退回「房號留空＝開新房」的舊行為。
async function netConnect(retry = 0) {
  AUDIO.init();
  if (!/^https?:$/.test(location.protocol)) { netStatus('線上對戰需要透過伺服器開啟：用 Cloudflare 的遊戲網址，或在本機執行 node server.js 再開它顯示的網址。'); return; }
  if (NET.ws) { const old = NET.ws; NET.ws = null; try { old.close(); } catch (e) { } }
  const name = ($('mpName').value || '車手').slice(0, 8); let room = $('mpRoom').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6), quick = false;
  try { localStorage.setItem('r139_name', name); } catch (e) { }
  netStatus(room ? '連線中…' : '自動配對中…');
  if (!room) {
    try {
      const r = await fetch('/api/match', { cache: 'no-store' });
      if (r.status === 429 || r.status === 403) { let j = {}; try { j = await r.json(); } catch (e) { } netStatus(j.msg || '操作太頻繁，請稍後再試。'); return; } // 被伺服器限流／拒絕：不要自己亂開房間繞過
      if (r.ok) { const j = await r.json(); if (j.full) { netStatus(j.msg || '目前線上人數已滿（上限 96 人），請稍後再試。'); return; } if (typeof j.room === 'string' && /^[A-Z0-9]{1,6}$/.test(j.room)) { room = j.room; quick = true; } }
    } catch (e) { }
    if (!room) room = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  }
  let ws; try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + room + (quick ? '&q=1' : '')); } catch (e) { netStatus('這個頁面無法連到對戰伺服器。'); return; }
  NET.ws = ws; NET.quick = quick; let full = false, capped = false;
  ws.onopen = () => netSend({ t: 'join', room, name, liv: GAME.livery, car: GAME.carModel || 0 });
  ws.onclose = () => {
    if (NET.ws !== ws) return;
    if (full && !capped && quick && retry < 3) { netConnect(retry + 1); return; } // 剛好被搶滿或已開賽：重新配對
    const was = NET.room; NET.room = null; NET.players = []; netRender();
    if (!full && !capped) netStatus(was ? '連線中斷，請重新連線。' : '找不到對戰伺服器。請用 Cloudflare 的遊戲網址開啟，或在本機執行 node server.js。');
    if (GAME.online && GAME.state !== 'menu') showMenu();
  };
  ws.onerror = () => { };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'err') { if (m.full) full = true; if (m.cap) capped = true; } netHandle(m); };
}
function netHandle(m) {
  if (m.t === 'room') {
    const wasHost = NET.id !== null && NET.host === NET.id;
    NET.id = m.you; NET.host = m.host; NET.room = m.room; NET.players = (Array.isArray(m.players) ? m.players : []).slice(0, 8).map(p => ({ id: p.id | 0, name: String(p && p.name != null ? p.name : '車手').slice(0, 16), slot: p.slot | 0, liv: (p.liv | 0) & 7, car: Math.max(0, Math.min(5, p.car | 0)) })); // 收到的資料一律當成不可信：只留需要的欄位、限制型別與長度
    if (typeof m.route === 'string' && ROUTES[m.route]) NET.route = m.route; $('mpRoom').value = m.room; netRender();
    // 當上房主（或剛連線就是房主）而且之前選過賽道：把選擇告訴伺服器，自動出發也會用它
    if (NET.host === NET.id && !wasHost && NET.routeChosen && ROUTE && NET.route !== ROUTE.key) netSend({ t: 'route', route: ROUTE.key });
    if (GAME.online) {
      GAME.cars = GAME.cars.filter(c => !c.remote || c.bot || NET.players.some(p => p.id === c.netId));
      // 房主離線、換我當房主：接手模擬補位的電腦車（從牠們目前的位置繼續跑）
      if (NET.host === NET.id) for (const c of GAME.cars) if (c.bot && c.remote) { c.remote = false; c.ai = true; c.vcap = 99; }
    }
  } else if (m.t === 'load') {
    if (typeof m.route !== 'string' || !ROUTES[m.route] || typeof m.tod !== 'string' || !TOD[m.tod]) return; // 不認得的賽道／時段就忽略，避免載入失敗卡死
    NET.bots = Math.max(0, Math.min(7, m.bots | 0));
    netStatus('房主已出發，載入路線中…' + (NET.bots ? '（' + NET.bots + ' 台電腦車補位）' : ''));
    (async () => { if (!ROUTE || ROUTE.key !== m.route) await loadRoute(m.route); GAME.tod = m.tod; setTimeOfDay(m.tod); setSeg('sTod', m.tod); REN.forceFar = true; setSeg('sMode', 'online'); GAME.selMode = 'online'; document.body.classList.add('mp'); netRender(); netSend({ t: 'ready' }); })().catch(e => netStatus('路線載入失敗：' + e.message));
  } else if (m.t === 'go') {
    NET.fins = {}; if (AUDIO.ctx && AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume();
    document.body.classList.remove('show-menu', 'show-result', 'show-pause'); GAME.paused = false; CS.init = false; startSession('online');
  } else if (m.t === 's') {
    const c = GAME.cars.find(c => c.netId === m.id); if (!c || !c.remote) return;
    netApply(c, m);
  } else if (m.t === 'b') { // 房主模擬的電腦車：[id, s, d, v, r, st, brake, k, bk]
    for (const e of m.b || []) { const c = GAME.cars.find(c => c.netId === e[0]); if (c && c.remote) netApply(c, { s: e[1], d: e[2], v: e[3], r: e[4], st: e[5], b: e[6], k: e[7], bk: e[8] }); }
  } else if (m.t === 'fin') {
    const ft = +m.time; if (!isFinite(ft)) return;
    NET.fins[m.id] = ft; const c = GAME.cars.find(c => c.netId === m.id); if (c && ft >= 0) { c.finished = true; c.ftime = ft; } netResults();
  } else if (m.t === 'route') { if (typeof m.route === 'string' && ROUTES[m.route]) { NET.route = m.route; netRender(); }
  } else if (m.t === 'auto') {
    if (m.sec > 0) netStatus('已湊滿 8 人，' + m.sec + ' 秒後自動出發（房主也可以提前按出發）。'); else netRender();
  } else if (m.t === 'err') netStatus(m.msg);
}
// 別人送來的車輛狀態一律當成不可信：非數字／超大數字會被換成安全值（伺服器也會先擋一次，這裡是第二道防線）
const nfin = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d;
function netApply(c, m) {
  const s = nfin(m.s, 0, TR.len || 30000), d = nfin(m.d, -40, 40), v = nfin(m.v, -80, 120);
  c.ns = s; c.nd = d; c.nv = v; c.nrel = nfin(m.r, -7, 7); c.nt = performance.now(); c.steer = nfin(m.st, -1, 1); c.brakeLight = m.b ? 1 : 0;
  c.nro = nfin(m.ro, -60, 60); c.nay = nfin(m.ay, -30, 60);
  c.dmg = Math.max(0, Math.min(10, m.k | 0)); if (Array.isArray(m.h) && m.h.length === 40) c.dents = Float32Array.from(m.h, x => nfin(x, -6, 6)); if (m.bk && !c.broken) { c.broken = true; c.brokenT = 0; }
  if (c.fresh) { c.s = s; c.d = d; c.v = v; c.fresh = false; }
}
function netResults() {
  const T = id => NET.fins[id] < 0 ? 1e9 : NET.fins[id];
  const rows = NET.players.filter(p => NET.fins[p.id] !== undefined).sort((a, b) => T(a.id) - T(b.id));
  $('resList').textContent = rows.map((p, i) => (NET.fins[p.id] < 0 ? '— ' : (i + 1) + '. ') + p.name + ' ' + (NET.fins[p.id] < 0 ? '拋錨' : fmtTime(NET.fins[p.id]))).join('　');
}
function netTick(dt) {
  if (!GAME.online || !netOpen()) return;
  NET.acc += dt; if (NET.acc < 0.066) return; NET.acc = 0;
  const p = GAME.player; if (!p) return;
  const sendH = p.dentVer !== NET.dentVer || (NET.hTick = (NET.hTick || 0) + 1) % 30 === 0; NET.dentVer = p.dentVer;
  // 房主負責把補位電腦車的狀態一起送出去
  if (NET.id === NET.host && GAME.state === 'racing') {
    const b = []; for (const c of GAME.cars) if (c.bot && c.ai) b.push([c.netId, +c.s.toFixed(2), +c.d.toFixed(2), +c.v.toFixed(2), +angDiff(c.yaw, trackAt(c.s, _at).th).toFixed(3), +(c.steer || 0).toFixed(2), c.brakeLight ? 1 : 0, c.dmg | 0, 0]);
    if (b.length) netSend({ t: 'b', b });
  }
  netSend({ t: 's', ro: p.air ? +p.roll.toFixed(2) : 0, ay: p.air ? +(p.y - trackAt(p.s, _at).y).toFixed(2) : 0, k: p.dmg || 0, bk: p.broken ? 1 : 0, h: sendH && p.dents ? Array.from(p.dents, v => +v.toFixed(2)) : undefined, s: +p.s.toFixed(2), d: +p.d.toFixed(2), v: +p.v.toFixed(2), r: +angDiff(p.yaw, trackAt(p.s, _at).th).toFixed(3), st: +p.steer.toFixed(2), b: p.brakeLight });
}
// 遠端車輛：依最後收到的狀態沿賽道外插，再平滑追上
const _rt = {};
function stepRemote(c, dt) {
  if (c.nt === undefined) { settleCar(c, dt, trackAt(c.s, _rt)); return; }
  const age = Math.min(0.5, (performance.now() - c.nt) / 1000);
  const ps = c.ns + c.nv * age;
  c.v += (c.nv - c.v) * Math.min(1, dt * 8);
  c.s += c.v * dt; c.s += (ps - c.s) * Math.min(1, dt * 5);
  c.d += (c.nd - c.d) * Math.min(1, dt * 8);
  c.s = clamp(c.s, 0, TR.len - 2);
  const t = trackAt(c.s, _rt);
  c.x = t.x + t.nx * c.d; c.z = t.z + t.nz * c.d;
  c.yaw += angDiff(t.th + (c.nrel || 0), c.yaw) * Math.min(1, dt * 10);
  c.vx = t.tx * c.v; c.vz = t.tz * c.v; c.latG = c.v * c.v * t.k; c.slip = 0; c.offroad = false;
  c.gear = c.v < 18 ? 1 : c.v < 28 ? 2 : c.v < 38 ? 3 : c.v < 48 ? 4 : c.v < 58 ? 5 : 6;
  settleCar(c, dt, t);
  if (c.nro) { c.roll = c.nro; c.y += c.nay; }
}
function goPressed() { if (GAME.selMode === 'online') { if (NET.room && NET.id === NET.host) netSend({ t: 'start', route: NET.routeChosen ? ROUTE.key : (NET.route || 'kenting'), tod: GAME.tod }); } else beginRace(); } // 房主沒選賽道就是墾丁
