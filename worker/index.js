// Cloudflare Worker：靜態遊戲檔（由 assets 提供）＋線上對戰中繼（Durable Object）
// 協定與 server.js 完全相同（見 src/js/15_net.js 檔頭），所以前端不用改。
//   → join{room,name,liv,car}  start{route,tod}  ready  s{...}  fin{time}
//   ← room{...}  load{route,tod}  go  s{id,...}  fin{id,time}  err{msg}
// 房間狀態放在名為 "hub" 的單一 Durable Object 裡（記憶體＋連線），房間用 4 碼房號區分。

const ROUTES = ['r139', 'kenting', 'dapeng'], TODS = ['dawn', 'day', 'dusk'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket 連線', { status: 426 });
      return env.HUB.get(env.HUB.idFromName('hub')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class Hub {
  constructor(state, env) {
    this.rooms = new Map();
    this.nextId = 1;
  }

  fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.attach(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  newCode() {
    let c;
    do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.random() * 32 | 0]).join(''); } while (this.rooms.has(c));
    return c;
  }

  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { } }
  cast(room, obj, except) { const s = JSON.stringify(obj); for (const p of room.players) if (p !== except) this.send(p.ws, s); }
  sendRoom(room) {
    for (const p of room.players) this.send(p.ws, { t: 'room', room: room.code, you: p.id, host: room.host, phase: room.phase, players: room.players.map(q => ({ id: q.id, name: q.name, slot: q.slot, liv: q.liv, car: q.car | 0 })) });
  }
  go(room) { if (room.phase !== 'loading') return; clearTimeout(room.timer); room.phase = 'racing'; this.cast(room, { t: 'go' }); }

  attach(ws) {
    const me = { id: this.nextId++, ws, name: '車手', slot: 0, liv: 0, car: 0, room: null };
    ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      const room = me.room;
      if (m.t === 'join' && !room) {
        const c = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || this.newCode();
        let r = this.rooms.get(c);
        if (!r) { r = { code: c, players: [], host: me.id, phase: 'lobby', ready: new Set(), timer: null }; this.rooms.set(c, r); }
        if (r.players.length >= 8) return this.send(ws, { t: 'err', msg: '房間已滿（最多 8 人）。' });
        me.name = String(m.name || '車手').slice(0, 8); me.liv = (m.liv | 0) & 7; me.car = Math.max(0, Math.min(5, m.car | 0));
        const used = new Set(r.players.map(p => p.slot)); me.slot = 0; while (used.has(me.slot)) me.slot++;
        const usedLiv = new Set(r.players.map(p => p.liv)); while (usedLiv.has(me.liv) && usedLiv.size < 8) me.liv = (me.liv + 1) & 7;
        me.room = r; r.players.push(me); r.players.sort((a, b) => a.slot - b.slot); this.sendRoom(r);
      } else if (!room) return;
      else if (m.t === 'start' && me.id === room.host) {
        const route = ROUTES.includes(m.route) ? m.route : 'r139', tod = TODS.includes(m.tod) ? m.tod : 'day';
        room.phase = 'loading'; room.ready = new Set(); this.cast(room, { t: 'load', route, tod });
        clearTimeout(room.timer); room.timer = setTimeout(() => this.go(room), 25000);
      } else if (m.t === 'ready' && room.phase === 'loading') {
        room.ready.add(me.id); if (room.players.every(p => room.ready.has(p.id))) this.go(room);
      } else if (m.t === 's') {
        const o = { t: 's', id: me.id, s: +m.s, d: +m.d, v: +m.v, r: +m.r, st: +m.st, b: m.b ? 1 : 0, k: Math.min(10, m.k | 0), bk: m.bk ? 1 : 0, ro: +m.ro || 0, ay: +m.ay || 0 };
        if (Array.isArray(m.h) && m.h.length === 40) o.h = m.h.map(Number);
        this.cast(room, o, me);
      } else if (m.t === 'fin') this.cast(room, { t: 'fin', id: me.id, time: +m.time }, me);
    });
    const leave = () => {
      const room = me.room; if (!room) return; me.room = null;
      room.players = room.players.filter(p => p !== me);
      if (!room.players.length) { clearTimeout(room.timer); this.rooms.delete(room.code); return; }
      if (room.host === me.id) room.host = room.players[0].id;
      this.sendRoom(room);
      if (room.phase === 'loading' && room.players.every(p => room.ready.has(p.id))) this.go(room);
    };
    ws.addEventListener('close', leave);
    ws.addEventListener('error', leave);
  }
}
