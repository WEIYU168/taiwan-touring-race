// 把 src/js/*.js 依檔名順序合併進 src/index.html，輸出 public/index.html（並同步一份到 docs/index.html 給 GitHub Pages）
// 同時產生內容安全政策（CSP）：內嵌腳本用 sha256 雜湊放行，所以頁面上其他地方就算被塞進 <script> 也不會執行。
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname, dir = path.join(root, 'src/js');
let js = '';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) js += '\n// ==== ' + f + ' ====\n' + fs.readFileSync(path.join(dir, f), 'utf8');
js = '(function(){\n' + js + '\n})();';
if (/<\/script/i.test(js)) throw new Error('JS 內不可出現 </script');
let out = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8').replace('/*__JS__*/', () => js);

// ── CSP：script 只放行這一段內嵌腳本的雜湊
const m = out.match(/<script>([\s\S]*?)<\/script>/); if (!m) throw new Error('找不到內嵌 <script>');
const hash = 'sha256-' + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
const CSP = [
  "default-src 'none'", `script-src '${hash}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",   // 頁面用 Google Fonts；內嵌 style／style 屬性需要 unsafe-inline
  "img-src 'self' data: blob:", "connect-src 'self' ws: wss:", "media-src 'self' blob: data:",              // 連線只准回本站（API + WebSocket）
  "base-uri 'none'", "form-action 'none'", "object-src 'none'"
].join('; ');
if (!/<meta charset="utf-8">/i.test(out)) throw new Error('找不到 <meta charset>');
out = out.replace(/<meta charset="utf-8">/i, '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + CSP + '">');

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/index.html'), out);
// Cloudflare Workers 靜態檔的回應標頭（GitHub Pages 不支援自訂標頭，只吃上面 meta 裡的 CSP）
fs.writeFileSync(path.join(root, 'public/_headers'), [
  '/*',
  '  Content-Security-Policy: ' + CSP + "; frame-ancestors 'none'",
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  '  Cross-Origin-Opener-Policy: same-origin',
  '  Strict-Transport-Security: max-age=31536000',
  ''
].join('\n'));
// 同步一份到 docs/，供 GitHub Pages（設定為從 main 的 /docs 發佈）使用
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), out);
console.log('built public/index.html + docs/index.html + public/_headers', Math.round(out.length / 1024) + ' KB', hash.slice(0, 18) + '…');
