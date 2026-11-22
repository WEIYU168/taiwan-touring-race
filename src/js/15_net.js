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
  if (NET.room) netStatus('房號 ' + NET.room + '　目前 ' + NET.players.length + '／8 人。' + (NET.quick ? '自動配對湊滿 8 人會自動出發；' : '') + '想和朋友同組，請把房號告訴他們，輸入後按「連線」。' + (me && NET.id !== NET.host ? '等待房主出發。' : ''));
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
    try { const r = await fetch('/api/match', { cache: 'no-store' }); if (r.ok) { room = (await r.json()).room; quick = true; } } catch (e) { }
    if (!room) room = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  }
  let ws; try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + room + (quick ? '&q=1' : '')); } catch (e) { netStatus('這個頁面無法連到對戰伺服器。'); return; }
  NET.ws = ws; NET.quick = quick; let full = false;
  ws.onopen = () => netSend({ t: 'join', room, name, liv: GAME.livery, car: GAME.carModel || 0 });
  ws.onclose = () => {
    if (NET.ws !== ws) return;
    if (full && quick && retry < 3) { netConnect(retry + 1); return; } // 剛好被搶滿或已開賽：重新配對
    const was = NET.room; NET.room = null; NET.players = []; netRender();
    if (!full) netStatus(was ? '連線中斷，請重新連線。' : '找不到對戰伺服器。請用 Cloudflare 的遊戲網址開啟，或在本機執行 node server.js。');
    if (GAME.online && GAME.state !== 'menu') showMenu();
  };
  ws.onerror = () => { };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'err' && m.full) full = true; netHandle(m); };
}
function netHandle(m) {
  if (m.t === 'room') {
    NET.id = m.you; NET.host = m.host; NET.room = m.room; NET.players = m.players; $('mpRoom').value = m.room; netRender();
    if (GAME.online) GAME.cars = GAME.cars.filter(c => !c.remote || NET.players.some(p => p.id === c.netId));
  } else if (m.t === 'load') {
    netStatus('房主已出發，載入路線中…');
    (async () => { if (!ROUTE || ROUTE.key !== m.route) await loadRoute(m.route); GAME.tod = m.tod; setTimeOfDay(m.tod); setSeg('sTod', m.tod); REN.forceFar = true; setSeg('sMode', 'online'); GAME.selMode = 'online'; document.body.classList.add('mp'); netRender(); netSend({ t: 'ready' }); })().catch(e => netStatus('路線載入失敗：' + e.message));
  } else if (m.t === 'go') {
    NET.fins = {}; if (AUDIO.ctx && AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume();
    document.body.classList.remove('show-menu', 'show-result', 'show-pause'); GAME.paused = false; CS.init = false; startSession('online');
  } else if (m.t === 's') {
    const c = GAME.cars.find(c => c.netId === m.id); if (!c || !c.remote) return;
    c.ns = m.s; c.nd = m.d; c.nv = m.v; c.nrel = m.r; c.nt = performance.now(); c.steer = m.st; c.brakeLight = m.b;
    c.nro = +m.ro || 0; c.nay = +m.ay || 0;
    c.dmg = m.k | 0; if (m.h && m.h.length === 40) c.dents = Float32Array.from(m.h); if (m.bk && !c.broken) { c.broken = true; c.brokenT = 0; }
    if (c.fresh) { c.s = m.s; c.d = m.d; c.v = m.v; c.fresh = false; }
  } else if (m.t === 'fin') {
    NET.fins[m.id] = m.time; const c = GAME.cars.find(c => c.netId === m.id); if (c && m.time >= 0) { c.finished = true; c.ftime = m.time; } netResults();
  } else if (m.t === 'auto') {
    if (m.sec > 0) netStatus('已湊滿 8 人，' + m.sec + ' 秒後自動出發（房主也可以提前按出發）。'); else netRender();
  } else if (m.t === 'err') netStatus(m.msg);
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
function goPressed() { if (GAME.selMode === 'online') { if (NET.room && NET.id === NET.host) netSend({ t: 'start', route: ROUTE.key, tod: GAME.tod }); } else beginRace(); }
