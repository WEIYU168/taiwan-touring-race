// Cloudflare Worker：靜態遊戲檔（assets）＋線上對戰
//
// 架構（可同時容納 100 人以上，每 8 人一組）：
//   GET  /api/match   → Lobby（單一 Durable Object，只做配對、流量極小）回傳一個還沒滿的房號
//   WS   /ws?room=XXXX[&q=1] → Room（每個房號各一個 Durable Object，最多 8 人，負責轉送車輛狀態）
// 房間彼此獨立，所以 100 人 ≈ 13 個房間，各自跑在不同的 Durable Object 上，不會互相拖慢。
// 協定與 server.js 相同（見 src/js/15_net.js 檔頭）。

const ROUTES = ['r139', 'kenting', 'dapeng'], TODS = ['dawn', 'day', 'dusk'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_MAX = 8, AUTO_START_MS = 8000, PENDING_MS = 20000;
const json = (o, init) => new Response(JSON.stringify(o), { ...init, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const lobbyOf = env => env.LOBBY.get(env.LOBBY.idFromName('lobby'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket 連線', { status: 426 });
      const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) return new Response('缺少房號', { status: 400 });
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
    this.open = new Map(); // code → { count, phase, pend: [時間戳…] }（只記「自動配對」的房間）
  }
  size(e, now) { e.pend = e.pend.filter(t => now - t < PENDING_MS); return e.count + e.pend.length; }
  newCode() { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.random() * 32 | 0]).join(''); } while (this.open.has(c)); return c; }

  async fetch(request) {
    const path = new URL(request.url).pathname, now = Date.now();
    if (path === '/match') {
      // 先塞進「最滿但還沒滿」的房間，湊滿 8 人；沒有就開新房
      let best = null, bestN = -1;
      for (const [c, e] of this.open) { const n = this.size(e, now); if (e.phase === 'lobby' && n < ROOM_MAX && n > bestN) { best = c; bestN = n; } }
      if (best === null) { best = this.newCode(); this.open.set(best, { count: 0, phase: 'lobby', pend: [] }); }
      this.open.get(best).pend.push(now);
      return json({ room: best });
    }
    if (path === '/report' && request.method === 'POST') {
      const m = await request.json().catch(() => null); if (!m || !m.code) return json({ ok: false }, { status: 400 });
      const e = this.open.get(m.code);
      if (e) {
        if (m.count > e.count) e.pend.shift();           // 有人真的進房了，消耗一個預約名額
        e.count = m.count | 0; e.phase = m.phase;
        if (e.count === 0 || e.phase !== 'lobby') this.open.delete(m.code); // 空了或已開賽就不再配對進去
      }
      return json({ ok: true });
    }
    if (path === '/stats') {
      let waiting = 0; for (const e of this.open.values()) waiting += e.count;
      return json({ openRooms: this.open.size, waitingPlayers: waiting });
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
    for (const p of this.players) this.send(p.ws, { t: 'room', room: this.code, you: p.id, host: this.host, phase: this.phase, players: list });
  }
  report() { // 通知大廳目前人數與階段（只有自動配對房間需要）
    if (!this.quick || !this.env.LOBBY) return;
    try { lobbyOf(this.env).fetch('https://lobby/report', { method: 'POST', body: JSON.stringify({ code: this.code, count: this.players.length, phase: this.phase }) }).catch(() => { }); } catch (e) { }
  }
  begin(route, tod) {
    clearTimeout(this.auto); this.auto = null;
    this.phase = 'loading'; this.ready = new Set(); this.cast({ t: 'load', route, tod }); this.report();
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
          this.auto = setTimeout(() => { this.auto = null; if (this.phase === 'lobby') this.begin('r139', 'day'); }, AUTO_START_MS);
        }
        return;
      }
      if (!me.joined) return;
      if (m.t === 'start' && me.id === this.host && this.phase === 'lobby') {
        this.begin(ROUTES.includes(m.route) ? m.route : 'r139', TODS.includes(m.tod) ? m.tod : 'day');
      } else if (m.t === 'ready' && this.phase === 'loading') {
        this.ready.add(me.id); if (this.players.every(p => this.ready.has(p.id))) this.go();
      } else if (m.t === 's') {
        const o = { t: 's', id: me.id, s: +m.s, d: +m.d, v: +m.v, r: +m.r, st: +m.st, b: m.b ? 1 : 0, k: Math.min(10, m.k | 0), bk: m.bk ? 1 : 0, ro: +m.ro || 0, ay: +m.ay || 0 };
        if (Array.isArray(m.h) && m.h.length === 40) o.h = m.h.map(Number);
        this.cast(o, me);
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
