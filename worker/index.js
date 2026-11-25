// Cloudflare Worker：靜態遊戲檔（assets）＋線上對戰
//
// 架構（人數上限 96 人 = 12 組 × 8 人）：
//   GET  /api/match   → Lobby（單一 Durable Object，只做配對、流量極小）回傳一個還沒滿的房號
//   WS   /ws?room=XXXX[&q=1] → Room（每個房號各一個 Durable Object，最多 8 人，負責轉送車輛狀態）
// 房間彼此獨立，所以 96 人 = 12 個房間，各自跑在不同的 Durable Object 上，不會互相拖慢。
// 協定與 server.js 相同（見 src/js/15_net.js 檔頭）。
//
// 資安防護（見 SECURITY.md）：
//   · WebSocket／API 只接受同源（防別的網站拿你的伺服器來用）
//   · 每條連線的訊息大小與頻率限制；超量丟棄、持續超量踢掉
//   · 所有轉送的數值都先轉成有限數字並夾在合理範圍（惡意玩家塞 null／1e308 不會傳給別人）
//   · 玩家名稱去掉控制字元與文字方向反轉字元
//   · 每個 IP 的同時在線人數與請求頻率上限；連線後 10 秒內沒加入房間就斷線

const ROUTES = ['r139', 'kenting', 'dapeng'], TODS = ['dawn', 'day', 'dusk'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_MAX = 8, MAX_PLAYERS = 96, AUTO_START_MS = 8000, PENDING_MS = 20000, STALE_MS = 40 * 60 * 1000; // 96 人 = 剛好 12 組 × 8 人
const MAX_PER_IP = 24;                                  // 同一個 IP 同時最多幾人（含預約）；學校／家裡共用 IP 也夠用，單一攻擊者佔不滿 96 人
const RATE_CAP = 60, RATE_REFILL = 1;                   // 每個 IP 的 /api/match、連線請求：可連發 60 次，之後每秒補 1 次
const MSG_MAX = 4096, MSG_RATE = 50, MSG_BURST = 90;    // 單條連線：訊息最大 4 KB；每秒補 50 則、最多連發 90 則（正常最多約 30 則／秒）
const JOIN_TIMEOUT_MS = 10000;
const CAP_MSG = '目前線上已有 96 人在玩（人數上限 96 人，共 12 組），請稍後再試。';
const IP_MSG = '你這個網路同時連線的人數過多，請稍後再試。';
const RATE_MSG = '操作太頻繁，請稍後再試。';

const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };
const json = (o, init = {}) => new Response(JSON.stringify(o), { ...init, headers: { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const deny = (status, text) => new Response(text, { status, headers: { ...SEC, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const lobbyOf = env => env.LOBBY.get(env.LOBBY.idFromName('lobby'));

// ── 輸入清理
const num = (v, lo, hi, d = 0) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const int = (v, lo, hi, d = 0) => Math.round(num(v, lo, hi, d));
// 名稱清理：去掉控制字元、零寬字元、文字方向控制字元（用字元編碼比對，檔案裡不放不可見字元）
const isBadCp = c => c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0xad || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff || (c >= 0xfff9 && c <= 0xfffb);
const cleanName = v => { const s = Array.from(String(v == null ? '' : v)).filter(ch => !isBadCp(ch.codePointAt(0))).slice(0, 24).join('').trim(); return Array.from(s).slice(0, 8).join('') || '車手'; };
const sameHost = (headerValue, url) => { if (!headerValue) return false; try { return new URL(headerValue).host === url.host; } catch (e) { return false; } };
const clientIp = request => (request.headers.get('CF-Connecting-IP') || '').slice(0, 64);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return deny(426, '需要 WebSocket 連線');
      // 瀏覽器連 WebSocket 一定會帶 Origin；不是本站來的一律拒絕（防止別的網站偷用你的伺服器）
      if (!sameHost(request.headers.get('Origin'), url)) return deny(403, 'forbidden');
      const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) return deny(400, '缺少房號');
      const q = url.searchParams.get('q') === '1' ? 1 : 0;
      const a = await lobbyOf(env).fetch('https://lobby/admit?ip=' + encodeURIComponent(clientIp(request)) + '&room=' + code + '&q=' + q).then(r => r.json()).catch(() => ({ ok: true }));
      if (!a.ok) { // 回一個馬上關閉、附帶說明的 WebSocket，前端才讀得到原因
        const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
        server.accept(); server.send(JSON.stringify({ t: 'err', msg: a.reason === 'ip' ? IP_MSG : a.reason === 'rate' ? RATE_MSG : CAP_MSG, cap: 1 })); server.close(1000, 'denied');
        return new Response(null, { status: 101, webSocket: client });
      }
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405, 'method not allowed');
      // 只允許本站頁面呼叫：擋掉別的網站用瀏覽器偷偷預約名額
      const sfs = request.headers.get('Sec-Fetch-Site');
      if ((sfs && sfs !== 'same-origin' && sfs !== 'none') || (request.headers.get('Origin') && !sameHost(request.headers.get('Origin'), url))) return deny(403, 'forbidden');
      const ip = encodeURIComponent(clientIp(request));
      if (url.pathname === '/api/match') { const r = await lobbyOf(env).fetch('https://lobby/match?ip=' + ip); return new Response(r.body, { status: r.status, headers: { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
      if (url.pathname === '/api/stats') return lobbyOf(env).fetch('https://lobby/stats');
      return deny(404, 'not found');
    }
    return env.ASSETS.fetch(request);
  },
};

// ───────────────────────── 大廳：自動配對（8 人一組）與流量管制 ─────────────────────────
export class Lobby {
  constructor(state, env) {
    // code → { count, phase, quick, pend: [{t, ip}…], ips: {ip: 人數}, ts }；記錄所有房間（含已開賽的），才算得出總人數
    this.rooms = new Map();
    this.lastSeq = new Map(); // 房號 → 最後處理的回報序號（防亂序）
    this.buckets = new Map(); // ip → 請求頻率桶
  }
  size(e, now) { e.pend = e.pend.filter(p => now - p.t < PENDING_MS); return e.count + e.pend.length; }
  total(now) { // 目前線上總人數（含已預約、正要連進來的人）；順便清掉很久沒回報的殭屍房間
    let n = 0;
    for (const [c, e] of this.rooms) { if (now - e.ts > STALE_MS && !e.pend.length) { this.rooms.delete(c); continue; } n += this.size(e, now); }
    for (const [c, s] of this.lastSeq) if (!this.rooms.has(c) && now - s > 5 * 60 * 1000) this.lastSeq.delete(c); // 序號以毫秒時間為底，超過 5 分鐘的已關房紀錄可清掉
    return n;
  }
  ipCount(ip, now) { let n = 0; for (const e of this.rooms.values()) { n += (e.ips && e.ips[ip]) || 0; for (const p of e.pend) if (p.ip === ip && now - p.t < PENDING_MS) n++; } return n; }
  allow(ip, now) { // 每個 IP 的請求頻率（token bucket）
    if (!ip) return true;
    let b = this.buckets.get(ip) || { tok: RATE_CAP, t: now };
    b.tok = Math.min(RATE_CAP, b.tok + (now - b.t) / 1000 * RATE_REFILL); b.t = now;
    if (this.buckets.size > 4000) for (const [k, v] of this.buckets) if (now - v.t > 120000) this.buckets.delete(k);
    this.buckets.set(ip, b); if (b.tok < 1) return false; b.tok -= 1; return true;
  }
  newCode() { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.random() * 32 | 0]).join(''); } while (this.rooms.has(c)); return c; }

  async fetch(request) {
    const u = new URL(request.url), path = u.pathname, now = Date.now(), ip = (u.searchParams.get('ip') || '').slice(0, 64);
    if (path === '/match') {
      if (!this.allow(ip, now)) return json({ full: true, msg: RATE_MSG }, { status: 429 });
      // 人數上限 96（12 組）：滿了就不再配對，請玩家稍後再試
      if (this.total(now) >= MAX_PLAYERS) return json({ full: true, msg: CAP_MSG });
      if (ip && this.ipCount(ip, now) >= MAX_PER_IP) return json({ full: true, msg: IP_MSG });
      // 先塞進「最滿但還沒滿」的房間，湊滿 8 人；沒有就開新房。人不用湊滿 96，最後一房不足 8 人由電腦補位
      let best = null, bestN = -1;
      for (const [c, e] of this.rooms) { const n = this.size(e, now); if (e.quick && e.phase === 'lobby' && n < ROOM_MAX && n > bestN) { best = c; bestN = n; } }
      if (best === null) { best = this.newCode(); this.rooms.set(best, { count: 0, phase: 'lobby', quick: true, pend: [], ips: {}, ts: now }); }
      this.rooms.get(best).pend.push({ t: now, ip });
      return json({ room: best });
    }
    if (path === '/admit') { // WebSocket 連線前的檢查：頻率、總人數、單一 IP 人數
      const room = (u.searchParams.get('room') || '').slice(0, 6), q = u.searchParams.get('q') === '1';
      if (!this.allow(ip, now)) return json({ ok: false, reason: 'rate' });
      const e = this.rooms.get(room);
      if (q && e && e.pend.some(p => p.ip === ip && now - p.t < PENDING_MS)) return json({ ok: true }); // 自動配對的人：/api/match 已經檢查並預約過
      if (this.total(now) >= MAX_PLAYERS) return json({ ok: false, reason: 'cap' });
      if (ip && this.ipCount(ip, now) >= MAX_PER_IP) return json({ ok: false, reason: 'ip' });
      return json({ ok: true });
    }
    if (path === '/report' && request.method === 'POST') {
      const m = await request.json().catch(() => null); if (!m || typeof m.code !== 'string' || !m.code) return json({ ok: false }, { status: 400 });
      // 回報可能亂序到達：每則帶遞增序號（時間為底，重啟後仍遞增），比最後處理的舊就忽略
      if (!(m.seq > (this.lastSeq.get(m.code) || 0))) return json({ ok: true, stale: true });
      this.lastSeq.set(m.code, m.seq);
      const count = int(m.count, 0, ROOM_MAX), ips = {}; let k = 0;
      if (m.ips && typeof m.ips === 'object') for (const [a, n] of Object.entries(m.ips)) { if (k++ >= 16) break; ips[String(a).slice(0, 64)] = int(n, 0, ROOM_MAX); }
      let e = this.rooms.get(m.code);
      if (!e && count > 0) { e = { count: 0, phase: 'lobby', quick: !!m.quick, pend: [], ips: {}, ts: now }; this.rooms.set(m.code, e); }
      if (e) {
        const delta = count - e.count; if (delta > 0) e.pend.splice(0, delta); // 有人真的進房了，消耗對應數量的預約名額
        e.count = count; e.phase = m.phase === 'lobby' ? 'lobby' : String(m.phase || 'racing').slice(0, 12); e.ips = ips; e.ts = now;
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
    this.attach(server, clientIp(request));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { } }
  cast(obj, except) { const s = JSON.stringify(obj); for (const p of this.players) if (p !== except) this.send(p.ws, s); }
  sendRoom() {
    const list = this.players.map(q => ({ id: q.id, name: q.name, slot: q.slot, liv: q.liv, car: q.car | 0 }));
    for (const p of this.players) this.send(p.ws, { t: 'room', room: this.code, you: p.id, host: this.host, phase: this.phase, route: this.route, players: list });
  }
  report() { // 通知大廳目前人數、階段與各 IP 人數（所有房間都回報，大廳才算得出總人數與單一 IP 上限）
    if (!this.env.LOBBY) return;
    this.seq = Math.max((this.seq || 0) + 1, Date.now()); // 嚴格遞增，且以時間為底，Room 重啟後也不會倒退
    const ips = {}; for (const p of this.players) if (p.ip) ips[p.ip] = (ips[p.ip] || 0) + 1;
    try { lobbyOf(this.env).fetch('https://lobby/report', { method: 'POST', body: JSON.stringify({ code: this.code, count: this.players.length, phase: this.phase, quick: this.quick, seq: this.seq, ips }) }).catch(() => { }); } catch (e) { }
  }
  begin(route, tod) {
    clearTimeout(this.auto); this.auto = null;
    // 湊不滿 8 人就由電腦補足：bots＝要補幾台（由房主的電腦模擬並同步給大家）
    this.phase = 'loading'; this.ready = new Set(); this.cast({ t: 'load', route, tod, bots: Math.max(0, ROOM_MAX - this.players.length) }); this.report();
    clearTimeout(this.timer); this.timer = setTimeout(() => this.go(), 25000);
  }
  go() { if (this.phase !== 'loading') return; clearTimeout(this.timer); this.phase = 'racing'; this.cast({ t: 'go' }); this.report(); }

  attach(ws, ip = '') {
    const me = { id: this.nextId++, ws, ip, name: '車手', slot: 0, liv: 0, car: 0, joined: false, tok: MSG_BURST, tt: Date.now(), over: 0, bad: 0, jt: null };
    const kick = why => { try { ws.close(1008, why); } catch (e) { } };
    me.jt = setTimeout(() => { if (!me.joined) kick('join timeout'); }, JOIN_TIMEOUT_MS); // 連線後一直不加入房間 → 斷線，避免有人開一堆空連線
    ws.addEventListener('message', ev => {
      // ── 大小與頻率限制：超量的訊息直接丟掉，持續超量就踢掉
      const raw = ev.data;
      if (typeof raw !== 'string' || raw.length > MSG_MAX) { if (++me.bad > 10) kick('bad message'); return; }
      const now = Date.now(); me.tok = Math.min(MSG_BURST, me.tok + (now - me.tt) / 1000 * MSG_RATE); me.tt = now;
      if (me.tok < 1) { if (++me.over > 300) kick('rate limit'); return; }
      me.tok -= 1; if (me.tok > MSG_BURST / 2) me.over = 0;
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      if (m.t === 'join' && !me.joined) {
        if (this.players.length >= ROOM_MAX) { this.send(ws, { t: 'err', msg: '房間已滿（最多 8 人）。', full: 1 }); try { ws.close(1000, 'full'); } catch (e) { } return; }
        if (this.phase !== 'lobby') { this.send(ws, { t: 'err', msg: '這個房間比賽已經開始，請稍後再加入。', full: 1 }); try { ws.close(1000, 'started'); } catch (e) { } return; }
        me.joined = true; clearTimeout(me.jt);
        me.name = cleanName(m.name); me.liv = int(m.liv, 0, 7) & 7; me.car = int(m.car, 0, 5);
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
        // 所有數值轉成有限數字並夾在合理範圍：惡意玩家塞 NaN／null／1e308 不會傳給別人
        const o = { t: 's', id: me.id, s: num(m.s, 0, 30000), d: num(m.d, -40, 40), v: num(m.v, -80, 120), r: num(m.r, -7, 7), st: num(m.st, -1, 1), b: m.b ? 1 : 0, k: int(m.k, 0, 15), bk: m.bk ? 1 : 0, ro: num(m.ro, -60, 60), ay: num(m.ay, -30, 60) };
        if (Array.isArray(m.h) && m.h.length === 40) o.h = m.h.map(x => num(x, -6, 6));
        this.cast(o, me);
      } else if (m.t === 'b' && me.id === this.host && this.phase === 'racing' && Array.isArray(m.b)) {
        // 房主送來的電腦車狀態：[id, s, d, v, r, st, brake, k, bk]，最多 7 台
        const b = m.b.slice(0, 7).filter(e => Array.isArray(e) && e.length >= 9).map(e => [int(e[0], -7, -1, -1), num(e[1], 0, 30000), num(e[2], -40, 40), num(e[3], -80, 120), num(e[4], -7, 7), num(e[5], -1, 1), e[6] ? 1 : 0, int(e[7], 0, 10), e[8] ? 1 : 0]);
        if (b.length) this.cast({ t: 'b', b }, me);
      } else if (m.t === 'fin') this.cast({ t: 'fin', id: me.id, time: Math.round(num(m.time, -1, 36000, -1) * 100) / 100 }, me);
    });
    const leave = () => {
      clearTimeout(me.jt);
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
