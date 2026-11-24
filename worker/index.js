// Cloudflare Worker：靜態遊戲檔（assets）＋線上對戰
//
// 架構（人數上限 96 人 = 12 組 × 8 人）：
//   GET  /api/match   → Lobby（單一 Durable Object，只做配對、流量極小）回傳一個還沒滿的房號
//   WS   /ws?room=XXXX[&q=1] → Room（每個房號各一個 Durable Object，最多 8 人，負責轉送車輛狀態）
// 房間彼此獨立，所以 96 人 = 12 個房間，各自跑在不同的 Durable Object 上，不會互相拖慢。
// 協定與 server.js 相同（見 src/js/15_net.js 檔頭）。

const ROUTES = ['r139', 'kenting', 'dapeng'], TODS = ['dawn', 'day', 'dusk'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_MAX = 8, MAX_PLAYERS = 96, AUTO_START_MS = 8000, PENDING_MS = 20000, STALE_MS = 40 * 60 * 1000; // 96 人 = 剛好 12 組 × 8 人
const CAP_MSG = '目前線上已有 96 人在玩（人數上限 96 人，共 12 組），請稍後再試。';
const json = (o, init) => new Response(JSON.stringify(o), { ...init, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const lobbyOf = env => env.LOBBY.get(env.LOBBY.idFromName('lobby'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket 連線', { status: 426 });
      const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) return new Response('缺少房號', { status: 400 });
      // 自動配對的人在 /api/match 已經檢查過人數上限；手動輸入房號加入的人在這裡檢查
      if (url.searchParams.get('q') !== '1') {
        const ok = await lobbyOf(env).fetch('https://lobby/admit').then(r => r.json()).catch(() => ({ ok: true }));
        if (!ok.ok) { // 回一個馬上關閉、附帶說明的 WebSocket，前端才讀得到原因
          const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
          server.accept(); server.send(JSON.stringify({ t: 'err', msg: CAP_MSG, cap: 1 })); server.close(1000, 'cap');
          return new Response(null, { status: 101, webSocket: client });
        }
      }
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
    }
    if (url.pathname === '/api/match') return lobbyOf(env).fetch('https://lobby/match');
    if (url.pathname === '/api/stats') return lobbyOf(env).fetch('https://lobby/stats');
    return env.ASSETS.fetch(request);
  },
};

// ───────────────────────── 大廳：自動配對（8 人一組） ─────────────────────────
export class Lobby {
  constructor(state, env) {
    // code → { count, phase, quick, pend: [預約時間戳…], ts }；記錄所有房間（含已開賽的），才算得出總人數
    this.rooms = new Map();
    this.lastSeq = new Map(); // 房號 → 最後處理的回報序號（防亂序）
  }
  size(e, now) { e.pend = e.pend.filter(t => now - t < PENDING_MS); return e.count + e.pend.length; }
  total(now) { // 目前線上總人數（含已預約、正要連進來的人）；順便清掉很久沒回報的殭屍房間
    let n = 0;
    for (const [c, e] of this.rooms) { if (now - e.ts > STALE_MS && !e.pend.length) { this.rooms.delete(c); continue; } n += this.size(e, now); }
    for (const [c, s] of this.lastSeq) if (!this.rooms.has(c) && now - s > 5 * 60 * 1000) this.lastSeq.delete(c); // 序號以毫秒時間為底，超過 5 分鐘的已關房紀錄可清掉
    return n;
  }
  newCode() { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.random() * 32 | 0]).join(''); } while (this.rooms.has(c)); return c; }

  async fetch(request) {
    const path = new URL(request.url).pathname, now = Date.now();
    if (path === '/match') {
      // 人數上限 96（12 組）：滿了就不再配對，請玩家稍後再試
      if (this.total(now) >= MAX_PLAYERS) return json({ full: true, msg: CAP_MSG });
      // 先塞進「最滿但還沒滿」的房間，湊滿 8 人；沒有就開新房。人不用湊滿 96，最後一房不足 8 人由電腦補位
      let best = null, bestN = -1;
      for (const [c, e] of this.rooms) { const n = this.size(e, now); if (e.quick && e.phase === 'lobby' && n < ROOM_MAX && n > bestN) { best = c; bestN = n; } }
      if (best === null) { best = this.newCode(); this.rooms.set(best, { count: 0, phase: 'lobby', quick: true, pend: [], ts: now }); }
      this.rooms.get(best).pend.push(now);
      return json({ room: best });
    }
    if (path === '/admit') return json({ ok: this.total(now) < MAX_PLAYERS }); // 手動輸入房號加入的人
    if (path === '/report' && request.method === 'POST') {
      const m = await request.json().catch(() => null); if (!m || !m.code) return json({ ok: false }, { status: 400 });
      // 回報可能亂序到達：每則帶遞增序號（時間為底，重啟後仍遞增），比最後處理的舊就忽略
      if (m.seq <= (this.lastSeq.get(m.code) || 0)) return json({ ok: true, stale: true });
      this.lastSeq.set(m.code, m.seq);
      let e = this.rooms.get(m.code);
      if (!e && m.count > 0) { e = { count: 0, phase: 'lobby', quick: !!m.quick, pend: [], ts: now }; this.rooms.set(m.code, e); }
      if (e) {
        const delta = (m.count | 0) - e.count; if (delta > 0) e.pend.splice(0, delta); // 有人真的進房了，消耗對應數量的預約名額
        e.count = m.count | 0; e.phase = m.phase; e.ts = now;
        if (e.count === 0 && !e.pend.length) this.rooms.delete(m.code); // 空了就移除；已開賽的房間留著算人數、但不再配對
      }
      return json({ ok: true });
    }
    if (path === '/stats') {
      let rooms = 0, racing = 0; for (const e of this.rooms.values()) { rooms++; if (e.phase !== 'lobby') racing++; }
      return json({ players: this.total(now), max: MAX_PLAYERS, rooms, racing });
    }
    return new Response('not found', { status: 404 });
  }
}

// ───────────────────────── 房間：一個房號一個 Durable Object ─────────────────────────
export class Room {
  constructor(state, env) {
    this.env = env;
    this.code = ''; this.quick = false;
    this.players = []; this.host = 0; this.phase = 'lobby'; this.ready = new Set();
    this.route = 'kenting'; // 房主沒選賽道就是墾丁；房主選了就記在這裡（自動出發也用它）
    this.timer = null; this.auto = null; this.nextId = 1;
  }

  fetch(request) {
    const url = new URL(request.url);
    this.code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (url.searchParams.get('q') === '1') this.quick = true;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.attach(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { } }
  cast(obj, except) { const s = JSON.stringify(obj); for (const p of this.players) if (p !== except) this.send(p.ws, s); }
  sendRoom() {
    const list = this.players.map(q => ({ id: q.id, name: q.name, slot: q.slot, liv: q.liv, car: q.car | 0 }));
    for (const p of this.players) this.send(p.ws, { t: 'room', room: this.code, you: p.id, host: this.host, phase: this.phase, route: this.route, players: list });
  }
  report() { // 通知大廳目前人數與階段（所有房間都回報，大廳才算得出總人數上限）
    if (!this.env.LOBBY) return;
    this.seq = Math.max((this.seq || 0) + 1, Date.now()); // 嚴格遞增，且以時間為底，Room 重啟後也不會倒退
    try { lobbyOf(this.env).fetch('https://lobby/report', { method: 'POST', body: JSON.stringify({ code: this.code, count: this.players.length, phase: this.phase, quick: this.quick, seq: this.seq }) }).catch(() => { }); } catch (e) { }
  }
  begin(route, tod) {
    clearTimeout(this.auto); this.auto = null;
    // 湊不滿 8 人就由電腦補足：bots＝要補幾台（由房主的電腦模擬並同步給大家）
    this.phase = 'loading'; this.ready = new Set(); this.cast({ t: 'load', route, tod, bots: Math.max(0, ROOM_MAX - this.players.length) }); this.report();
    clearTimeout(this.timer); this.timer = setTimeout(() => this.go(), 25000);
  }
  go() { if (this.phase !== 'loading') return; clearTimeout(this.timer); this.phase = 'racing'; this.cast({ t: 'go' }); this.report(); }

  attach(ws) {
    const me = { id: this.nextId++, ws, name: '車手', slot: 0, liv: 0, car: 0, joined: false };
    ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'join' && !me.joined) {
        if (this.players.length >= ROOM_MAX) { this.send(ws, { t: 'err', msg: '房間已滿（最多 8 人）。', full: 1 }); try { ws.close(1000, 'full'); } catch (e) { } return; }
        if (this.phase !== 'lobby') { this.send(ws, { t: 'err', msg: '這個房間比賽已經開始，請稍後再加入。', full: 1 }); try { ws.close(1000, 'started'); } catch (e) { } return; }
        me.joined = true;
        me.name = String(m.name || '車手').slice(0, 8); me.liv = (m.liv | 0) & 7; me.car = Math.max(0, Math.min(5, m.car | 0));
        const used = new Set(this.players.map(p => p.slot)); me.slot = 0; while (used.has(me.slot)) me.slot++;
        const usedLiv = new Set(this.players.map(p => p.liv)); while (usedLiv.has(me.liv) && usedLiv.size < 8) me.liv = (me.liv + 1) & 7;
        if (!this.players.length) this.host = me.id;
        this.players.push(me); this.players.sort((a, b) => a.slot - b.slot); this.sendRoom(); this.report();
        // 自動配對房間湊滿 8 人：8 秒後自動出發（房主可提前出發）
        if (this.quick && this.players.length >= ROOM_MAX && !this.auto && this.phase === 'lobby') {
          this.cast({ t: 'auto', sec: AUTO_START_MS / 1000 });
          this.auto = setTimeout(() => { this.auto = null; if (this.phase === 'lobby') this.begin(this.route, 'day'); }, AUTO_START_MS);
        }
        return;
      }
      if (!me.joined) return;
      if (m.t === 'route' && me.id === this.host && this.phase === 'lobby' && ROUTES.includes(m.route)) {
        this.route = m.route; this.cast({ t: 'route', route: this.route }); // 房主換賽道：通知房間所有人
      } else if (m.t === 'start' && me.id === this.host && this.phase === 'lobby') {
        if (ROUTES.includes(m.route)) this.route = m.route;
        this.begin(this.route, TODS.includes(m.tod) ? m.tod : 'day');
      } else if (m.t === 'ready' && this.phase === 'loading') {
        this.ready.add(me.id); if (this.players.every(p => this.ready.has(p.id))) this.go();
      } else if (m.t === 's') {
        const o = { t: 's', id: me.id, s: +m.s, d: +m.d, v: +m.v, r: +m.r, st: +m.st, b: m.b ? 1 : 0, k: Math.min(10, m.k | 0), bk: m.bk ? 1 : 0, ro: +m.ro || 0, ay: +m.ay || 0 };
        if (Array.isArray(m.h) && m.h.length === 40) o.h = m.h.map(Number);
        this.cast(o, me);
      } else if (m.t === 'b' && me.id === this.host && this.phase === 'racing' && Array.isArray(m.b)) {
        // 房主送來的電腦車狀態：[id, s, d, v, r, st, brake, k, bk]，最多 7 台
        const b = m.b.slice(0, 7).filter(e => Array.isArray(e) && e.length >= 9).map(e => e.slice(0, 9).map(Number));
        if (b.length) this.cast({ t: 'b', b }, me);
      } else if (m.t === 'fin') this.cast({ t: 'fin', id: me.id, time: +m.time }, me);
    });
    const leave = () => {
      if (!me.joined) return; me.joined = false;
      this.players = this.players.filter(p => p !== me);
      if (!this.players.length) { clearTimeout(this.timer); clearTimeout(this.auto); this.auto = null; this.phase = 'lobby'; this.report(); return; }
      if (this.host === me.id) this.host = this.players[0].id;
      if (this.auto && this.players.length < ROOM_MAX) { clearTimeout(this.auto); this.auto = null; this.cast({ t: 'auto', sec: 0 }); }
      this.sendRoom(); this.report();
      if (this.phase === 'loading' && this.players.every(p => this.ready.has(p.id))) this.go();
    };
    ws.addEventListener('close', leave);
    ws.addEventListener('error', leave);
  }
}
