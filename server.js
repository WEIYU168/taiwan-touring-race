#!/usr/bin/env node
// 台灣房車賽：靜態檔案 + 線上對戰中繼伺服器（零相依，只用 Node.js 內建模組）
// 用法：node server.js [port]    預設 8139
//   預設監聽所有網卡（同一個 Wi-Fi 的朋友才連得到）；只想自己用：HOST=127.0.0.1 node server.js
// 注意：這是本機／區網用的小伺服器，沒有帳號與加密（http）。要給網友玩請用 Cloudflare 版（worker/index.js）。
// 資安防護與 worker/index.js 相同：同源檢查、訊息大小／頻率限制、數值與名稱清理、單一 IP 連線上限、連線逾時。
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const PORT = +(process.argv[2] || process.env.PORT || 8139), HOST = process.env.HOST || '0.0.0.0', PUB = path.resolve(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Cross-Origin-Opener-Policy': 'same-origin', 'Content-Security-Policy': "frame-ancestors 'none'" };
const MAX_PER_IP = 24, MAX_SOCKETS = 400, MSG_MAX = 4096, MSG_RATE = 50, MSG_BURST = 90, JOIN_TIMEOUT_MS = 10000;

// 一個壞掉的請求不該讓整個伺服器掛掉
process.on('uncaughtException', e => console.error('uncaught:', e && e.message));
const plain = (res, status, text, extra) => { res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC, extra)); res.end(text); };

const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'method not allowed', { Allow: 'GET, HEAD' });
    let p; try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { return plain(res, 400, '網址格式錯誤'); } // 例如 /%：以前會直接丟例外讓伺服器當機
    if (p.includes('\0') || p.includes('\\')) return plain(res, 400, '網址格式錯誤');
    if (p === '/') p = '/index.html';
    const f = path.resolve(PUB, '.' + p);
    if (f !== PUB && !f.startsWith(PUB + path.sep)) return plain(res, 403, 'forbidden'); // 以前用 startsWith(PUB)，會被 public-xxx 之類同名前綴的資料夾繞過
    const base = path.basename(f); if (base.startsWith('.') || base.startsWith('_')) return plain(res, 404, '找不到檔案'); // 不提供 .xxx、_headers 這類檔案
    fs.readFile(f, (err, data) => {
      if (err) return plain(res, 404, '找不到檔案');
      res.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }, SEC));
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  } catch (e) { try { plain(res, 500, 'server error'); } catch (e2) { } }
});
server.on('clientError', (e, sock) => { try { sock.destroy(); } catch (e2) { } });
server.headersTimeout = 15000; server.requestTimeout = 30000;

// ── 輸入清理（同 worker/index.js）
const num = (v, lo, hi, d = 0) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const int = (v, lo, hi, d = 0) => Math.round(num(v, lo, hi, d));
// 名稱清理：去掉控制字元、零寬字元、文字方向控制字元（用字元編碼比對，檔案裡不放不可見字元）
const isBadCp = c => c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0xad || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff || (c >= 0xfff9 && c <= 0xfffb);
const cleanName = v => { const s = Array.from(String(v == null ? '' : v)).filter(ch => !isBadCp(ch.codePointAt(0))).slice(0, 24).join('').trim(); return Array.from(s).slice(0, 8).join('') || '車手'; };

// ── 最小 WebSocket 實作（文字訊框）
function wsSend(sock, obj) {
  if (sock.destroyed) return; const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)); const n = data.length; let head;
  if (n < 126) head = Buffer.from([0x81, n]); else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); } else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  try { sock.write(Buffer.concat([head, data])); } catch (e) { }
}
function wsAttach(sock, onMsg, onClose) {
  let buf = Buffer.alloc(0), closed = false, tok = MSG_BURST, tt = Date.now(), over = 0;
  const close = () => { if (closed) return; closed = true; onClose(); try { sock.destroy(); } catch (e) { } };
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]); if (buf.length > 1 << 16) return close();
    for (;;) {
      if (buf.length < 2) return; const op = buf[0] & 15, masked = buf[1] & 128; let len = buf[1] & 127, off = 2;
      if (!masked) return close();                                       // 瀏覽器送出的訊框一定有遮罩，沒有就是怪東西
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) return close();
      if (len > MSG_MAX) return close();                                  // 單則訊息太大
      const need = off + 4 + len; if (buf.length < need) return;
      const mk = buf.subarray(off, off + 4), payload = Buffer.from(buf.subarray(off + 4, need)); for (let i = 0; i < payload.length; i++) payload[i] ^= mk[i & 3];
      buf = buf.subarray(need);
      if (op === 8) return close();
      if (op === 9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, Math.min(payload.length, 125)]), payload.subarray(0, 125)])); } catch (e) { } continue; }
      if (op !== 1) continue;
      const now = Date.now(); tok = Math.min(MSG_BURST, tok + (now - tt) / 1000 * MSG_RATE); tt = now;   // 訊息頻率限制：超量丟棄、持續超量踢掉
      if (tok < 1) { if (++over > 300) return close(); continue; } tok -= 1; if (tok > MSG_BURST / 2) over = 0;
      let m; try { m = JSON.parse(payload.toString()); } catch (e) { continue; } if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      onMsg(m);
    }
  });
  sock.on('close', close); sock.on('error', close);
}

// ── 房間
const rooms = new Map(); let nextId = 1, sockets = 0; const perIp = new Map();
const ROUTES = ['r139', 'kenting', 'dapeng'], TODS = ['dawn', 'day', 'dusk'];
const code = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join(''); } while (rooms.has(c)); return c; };
const cast = (room, obj, except) => { const s = JSON.stringify(obj); for (const p of room.players) if (p !== except) wsSend(p.sock, s); };
const sendRoom = room => { for (const p of room.players) wsSend(p.sock, { t: 'room', room: room.code, you: p.id, host: room.host, phase: room.phase, route: room.route || 'kenting', players: room.players.map(q => ({ id: q.id, name: q.name, slot: q.slot, liv: q.liv, car: q.car | 0 })) }); };
function go(room) { if (room.phase !== 'loading') return; clearTimeout(room.timer); room.phase = 'racing'; cast(room, { t: 'go' }); }

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'], ip = sock.remoteAddress || '';
  // 只接受本站頁面（Origin 的主機必須等於 Host）：不讓別的網站的頁面借你的伺服器連線
  let originOk = false; try { originOk = !!req.headers.origin && new URL(req.headers.origin).host === req.headers.host; } catch (e) { }
  if (!key || !/^\/ws(\?|$)/.test(req.url || '') || !originOk) { try { sock.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); } catch (e) { sock.destroy(); } return; }
  if (sockets >= MAX_SOCKETS || (perIp.get(ip) || 0) >= MAX_PER_IP) { try { sock.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); } catch (e) { sock.destroy(); } return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  sock.setNoDelay(true); sockets++; perIp.set(ip, (perIp.get(ip) || 0) + 1);
  const me = { id: nextId++, sock, name: '車手', slot: 0, liv: 0, car: 0, room: null }, jt = setTimeout(() => { if (!me.room) sock.destroy(); }, JOIN_TIMEOUT_MS); // 一直不加入房間就斷線
  wsAttach(sock, m => {
    const room = me.room;
    if (m.t === 'join' && !room) {
      let c = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || code();
      let r = rooms.get(c); if (!r) { if (rooms.size >= 200) return wsSend(sock, { t: 'err', msg: '伺服器房間數已達上限。' }); r = { code: c, players: [], host: me.id, phase: 'lobby', ready: new Set(), timer: null }; rooms.set(c, r); }
      if (r.players.length >= 8) return wsSend(sock, { t: 'err', msg: '房間已滿（最多 8 人）。', full: 1 });
      if (r.phase !== 'lobby') return wsSend(sock, { t: 'err', msg: '這個房間比賽已經開始，請稍後再加入。', full: 1 });
      clearTimeout(jt); me.name = cleanName(m.name); me.liv = int(m.liv, 0, 7) & 7; me.car = int(m.car, 0, 5);
      const used = new Set(r.players.map(p => p.slot)); me.slot = 0; while (used.has(me.slot)) me.slot++;
      const usedLiv = new Set(r.players.map(p => p.liv)); while (usedLiv.has(me.liv) && usedLiv.size < 8) me.liv = (me.liv + 1) & 7;
      me.room = r; r.players.push(me); r.players.sort((a, b) => a.slot - b.slot); sendRoom(r);
    } else if (!room) return;
    else if (m.t === 'route' && me.id === room.host && room.phase === 'lobby' && ROUTES.includes(m.route)) { room.route = m.route; cast(room, { t: 'route', route: room.route }); }
    else if (m.t === 'start' && me.id === room.host && room.phase === 'lobby') {
      if (ROUTES.includes(m.route)) room.route = m.route;
      const route = room.route || 'kenting', tod = TODS.includes(m.tod) ? m.tod : 'day'; // 房主沒選賽道就是墾丁
      room.phase = 'loading'; room.ready = new Set(); cast(room, { t: 'load', route, tod, bots: Math.max(0, 8 - room.players.length) });
      clearTimeout(room.timer); room.timer = setTimeout(() => go(room), 25000);
    } else if (m.t === 'ready' && room.phase === 'loading') { room.ready.add(me.id); if (room.players.every(p => room.ready.has(p.id))) go(room); }
    else if (m.t === 's') { const o = { t: 's', id: me.id, s: num(m.s, 0, 30000), d: num(m.d, -40, 40), v: num(m.v, -80, 120), r: num(m.r, -7, 7), st: num(m.st, -1, 1), b: m.b ? 1 : 0, k: int(m.k, 0, 15), bk: m.bk ? 1 : 0, ro: num(m.ro, -60, 60), ay: num(m.ay, -30, 60) }; if (Array.isArray(m.h) && m.h.length === 40) o.h = m.h.map(x => num(x, -6, 6)); cast(room, o, me); }
    else if (m.t === 'b' && me.id === room.host && room.phase === 'racing' && Array.isArray(m.b)) { const b = m.b.slice(0, 7).filter(e => Array.isArray(e) && e.length >= 9).map(e => [int(e[0], -7, -1, -1), num(e[1], 0, 30000), num(e[2], -40, 40), num(e[3], -80, 120), num(e[4], -7, 7), num(e[5], -1, 1), e[6] ? 1 : 0, int(e[7], 0, 10), e[8] ? 1 : 0]); if (b.length) cast(room, { t: 'b', b }, me); }
    else if (m.t === 'fin') cast(room, { t: 'fin', id: me.id, time: Math.round(num(m.time, -1, 36000, -1) * 100) / 100 }, me);
  }, () => {
    clearTimeout(jt); sockets = Math.max(0, sockets - 1); const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
    const room = me.room; if (!room) return; me.room = null;
    room.players = room.players.filter(p => p !== me);
    if (!room.players.length) { clearTimeout(room.timer); rooms.delete(room.code); return; }
    if (room.host === me.id) room.host = room.players[0].id;
    sendRoom(room); if (room.phase === 'loading' && room.players.every(p => room.ready.has(p.id))) go(room);
  });
});

server.listen(PORT, HOST, () => {
  console.log('台灣房車賽伺服器已啟動');
  console.log('  本機：     http://localhost:' + PORT);
  if (HOST === '0.0.0.0') for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log('  區域網路： http://' + a.address + ':' + PORT + '   （同一個 Wi-Fi 的朋友用這個網址）');
  console.log('按 Ctrl+C 結束');
});
