// 把 src/js/*.js 依檔名順序合併進 src/index.html，輸出 public/index.html
const fs = require('fs'), path = require('path');
const root = __dirname, dir = path.join(root, 'src/js');
let js = '';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) js += '\n// ==== ' + f + ' ====\n' + fs.readFileSync(path.join(dir, f), 'utf8');
js = '(function(){\n' + js + '\n})();';
if (/<\/script/i.test(js)) throw new Error('JS 內不可出現 </script');
const out = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8').replace('/*__JS__*/', () => js);
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/index.html'), out);
// 同步一份到 docs/，供 GitHub Pages（設定為從 main 的 /docs 發佈）使用
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), out);
console.log('built public/index.html + docs/index.html', Math.round(out.length / 1024) + ' KB');
