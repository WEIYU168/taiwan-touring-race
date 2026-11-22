#!/usr/bin/env node
// 台灣房車賽：靜態檔案 + 線上對戰中繼伺服器（零相依，只用 Node.js 內建模組）
// 用法：node server.js [port]    預設 8139
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const PORT = +(process.argv[2] || process.env.PORT || 8139), PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('找不到檔案'); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});

// ── 最小 WebSocket 實作（文字訊框）
function wsSend(sock, obj) {
  if (sock.destroyed) return; const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)); const n = data.length; let head;
  if (n < 126) head = Buffer.from([0x81, n]); else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); } else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  try { sock.write(Buffer.concat([head, data])); } catch (e) { }
}
function wsAttach(sock, onMsg, onClose) {
  let buf = Buffer.alloc(0), closed = false;
  const close = () => { if (closed) return; closed = true; onClose(); try { sock.destroy(); } catch (e) { } };
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]); if (buf.length > 1 << 20) return close();
    for (;;) {
      if (buf.length < 2) return; const op = buf[0] & 15, masked = buf[1] & 128; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) return close();
      const need = off + (masked ? 4 : 0) + len; if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const mk = buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mk[i & 3]; }
      buf = buf.subarray(need);
      if (op === 8) return close();
      if (op === 9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) { } continue; }
      if (op === 1) { let m; try { m = JSON.parse(payload.toString()); } catch (e) { continue; } onMsg(m); }
    }
  });
  sock.on('close', close); sock.on('error', close);
}

// ── 房間
const rooms = new Map(); let nextId = 1;
const ROUTES = ['r139', 'kenting', 'dapeng'], TODS = ['dawn', 'day', 'dusk'];
const code = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join(''); } while (rooms.has(c)); return c; };
const cast = (room, obj, except) => { const s = JSON.stringify(obj); for (const p of room.players) if (p !== except) wsSend(p.sock, s); };
const sendRoom = room => { for (const p of room.players) wsSend(p.sock, { t: 'room', room: room.code, you: p.id, host: room.host, phase: room.phase, players: room.players.map(q => ({ id: q.id, name: q.name, slot: q.slot, liv: q.liv, car: q.car | 0 })) }); };
function go(room) { if (room.phase !== 'loading') return; clearTimeout(room.timer); room.phase = 'racing'; cast(room, { t: 'go' }); }

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']; if (!key) return sock.destroy();
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  sock.setNoDelay(true);
  const me = { id: nextId++, sock, name: '車手', slot: 0, liv: 0, room: null };
  wsAttach(sock, m => {
    const room = me.room;
    if (m.t === 'join' && !room) {
      let c = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || code();
      let r = rooms.get(c); if (!r) { r = { code: c, players: [], host: me.id, phase: 'lobby', ready: new Set(), timer: null }; rooms.set(c, r); }
      if (r.players.length >= 8) return wsSend(sock, { t: 'err', msg: '房間已滿（最多 8 人）。' });
      me.name = String(m.name || '車手').slice(0, 8); me.liv = (m.liv | 0) & 7; me.car = Math.max(0, Math.min(5, m.car | 0));
      const used = new Set(r.players.map(p => p.slot)); me.slot = 0; while (used.has(me.slot)) me.slot++;
      const usedLiv = new Set(r.players.map(p => p.liv)); while (usedLiv.has(me.liv) && usedLiv.size < 8) me.liv = (me.liv + 1) & 7;
      me.room = r; r.players.push(me); r.players.sort((a, b) => a.slot - b.slot); sendRoom(r);
    } else if (!room) return;
    else if (m.t === 'start' && me.id === room.host) {
      const route = ROUTES.includes(m.route) ? m.route : 'r139', tod = TODS.includes(m.tod) ? m.tod : 'day';
      room.phase = 'loading'; room.ready = new Set(); cast(room, { t: 'load', route, tod, bots: Math.max(0, 8 - room.players.length) });
      clearTimeout(room.timer); room.timer = setTimeout(() => go(room), 25000);
    } else if (m.t === 'ready' && room.phase === 'loading') { room.ready.add(me.id); if (room.players.every(p => room.ready.has(p.id))) go(room); }
    else if (m.t === 's') { const o = { t: 's', id: me.id, s: +m.s, d: +m.d, v: +m.v, r: +m.r, st: +m.st, b: m.b ? 1 : 0, k: Math.min(10, m.k | 0), bk: m.bk ? 1 : 0, ro: +m.ro || 0, ay: +m.ay || 0 }; if (Array.isArray(m.h) && m.h.length === 40) o.h = m.h.map(Number); cast(room, o, me); }
    else if (m.t === 'b' && me.id === room.host && room.phase === 'racing' && Array.isArray(m.b)) { const b = m.b.slice(0, 7).filter(e => Array.isArray(e) && e.length >= 9).map(e => e.slice(0, 9).map(Number)); if (b.length) cast(room, { t: 'b', b }, me); }
    else if (m.t === 'fin') cast(room, { t: 'fin', id: me.id, time: +m.time }, me);
  }, () => {
    const room = me.room; if (!room) return; me.room = null;
    room.players = room.players.filter(p => p !== me);
    if (!room.players.length) { clearTimeout(room.timer); rooms.delete(room.code); return; }
    if (room.host === me.id) room.host = room.players[0].id;
    sendRoom(room); if (room.phase === 'loading' && room.players.every(p => room.ready.has(p.id))) go(room);
  });
});

server.listen(PORT, () => {
  console.log('台灣房車賽伺服器已啟動');
  console.log('  本機：     http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log('  區域網路： http://' + a.address + ':' + PORT + '   （同一個 Wi-Fi 的朋友用這個網址）');
  console.log('按 Ctrl+C 結束');
});
