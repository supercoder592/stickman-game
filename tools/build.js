#!/usr/bin/env node
// 把整個遊戲打包成一個 HTML 檔：dist/neon-clash.html
//
//   node tools/build.js
//
// 為什麼需要打包：瀏覽器用 file:// 開啟時會擋下 ES module（CORS），
// 所以「直接點兩下就能玩」的版本必須把所有模組塞進同一個檔案。
// 做法是把每支模組的原始碼存成字串，在瀏覽器裡轉成 blob: URL 再互相 import ——
// 程式碼一個字都不用改，也就不會有「打包版和開發版行為不同」的問題。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'neon-clash.html');

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
const sources = {};
for (const f of files) sources[f] = fs.readFileSync(path.join(SRC, f), 'utf8');

// 依相依順序排（模組要先變成 blob URL，依賴它的人才能 import 到）
const deps = {};
for (const f of files) {
  deps[f] = [...sources[f].matchAll(/from\s+['"]\.\/([\w.-]+\.js)['"]/g)].map((m) => m[1]);
}
const order = [];
const seen = new Set();
const visiting = new Set();
function visit(f) {
  if (seen.has(f)) return;
  if (visiting.has(f)) {
    throw new Error(`模組互相 import 形成循環：${f} —— 打包器需要無環的相依圖`);
  }
  visiting.add(f);
  for (const d of deps[f] || []) {
    if (!sources[d]) throw new Error(`${f} import 了不存在的 ${d}`);
    visit(d);
  }
  visiting.delete(f);
  seen.add(f);
  order.push(f);
}
for (const f of files) visit(f);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 換掉原本那段「動態 import ./src/main.js」的啟動腳本
const loader = `<script type="module">
  const boot = document.getElementById('boot');
  const SOURCES = ${JSON.stringify(sources, null, 0)};
  const ORDER = ${JSON.stringify(order)};
  try {
    const urls = {};
    for (const name of ORDER) {
      const code = SOURCES[name].replace(
        /from\\s+['"]\\.\\/([\\w.-]+\\.js)['"]/g,
        (m, dep) => \`from "\${urls[dep]}"\`
      );
      urls[name] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    }
    const mod = await import(urls['main.js']);
    await mod.boot(document.getElementById('game'));
    boot.remove();
  } catch (err) {
    boot.innerHTML = '<h1>NEON CLASH</h1><p>啟動失敗：' + (err && err.message ? err.message : err) + '</p>';
  }
</script>`;

const start = html.indexOf('<script type="module">');
const end = html.indexOf('</script>', start) + '</script>'.length;
if (start < 0 || end < start) {
  console.error('index.html 裡找不到啟動用的 <script type="module">');
  process.exit(1);
}
const out = html.slice(0, start) + loader + html.slice(end);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`打包完成：dist/neon-clash.html（${kb} KB，${order.length} 支模組）`);
console.log('這個檔案可以直接用瀏覽器開啟，不需要伺服器（連線對戰仍需要中繼伺服器）。');
