#!/usr/bin/env node
// 中繼伺服器：一支檔案、零相依套件。
//
//   node server/relay.js            # 預設 8787，同時把遊戲本身也一起服務出去
//   PORT=3000 node server/relay.js
//
// 做兩件事：
//   1. 靜態檔案伺服器 —— 直接打開 http://localhost:8787 就能玩（模組載入需要 http）。
//   2. WebSocket 中繼 —— 同一個房號的兩個人互轉封包，伺服器不懂遊戲規則。
//      先進房間的是主機（host），第二位是客人（guest）。
//
// WebSocket 是手寫的（RFC 6455 的必要子集：握手、文字訊框、ping/pong、close），
// 所以不需要 npm install，把整個資料夾丟到任何有 Node 的機器上就能跑。

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(__dirname, '..');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

// ------------------------------------------------------------------ 靜態檔案
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  // 不准跳出專案資料夾
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 找不到：' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
});

// ------------------------------------------------------------------ WebSocket
class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.open = true;
    this.room = null;
    this.role = null;
    this.onMessage = () => {};
    this.onClose = () => {};

    this.lastSeen = Date.now();
    socket.on('data', (chunk) => {
      this.lastSeen = Date.now();
      this.buf = Buffer.concat([this.buf, chunk]);
      try { this.parse(); } catch (e) { this.destroy(); }
    });
    socket.on('error', () => this.destroy());
    socket.on('close', () => this.destroy());
    socket.setNoDelay(true);
  }

  parse() {
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < off + 2) return;
        len = this.buf.readUInt16BE(off);
        off += 2;
      } else if (len === 127) {
        if (this.buf.length < off + 8) return;
        len = Number(this.buf.readBigUInt64BE(off));
        off += 8;
      }
      let mask = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        mask = this.buf.subarray(off, off + 4);
        off += 4;
      }
      if (this.buf.length < off + len) return;
      const payload = Buffer.from(this.buf.subarray(off, off + len));
      this.buf = this.buf.subarray(off + len);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];

      if (opcode === 0x8) { this.destroy(); return; }          // close
      if (opcode === 0x9) { this.frame(payload, 0xa); continue; } // ping → pong
      if (opcode === 0xa) continue;                             // pong
      if (opcode === 0x1 || opcode === 0x0) this.onMessage(payload.toString('utf8'));
    }
  }

  frame(data, opcode = 0x1) {
    if (!this.open) return;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (e) {
      this.destroy();
    }
  }

  send(obj) {
    this.frame(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }

  destroy() {
    if (!this.open) return;
    this.open = false;
    try { this.socket.destroy(); } catch (e) { /* 已經斷了 */ }
    this.onClose();
  }
}

/** room code → [Conn, Conn] */
const rooms = new Map();

server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  if (head && head.length) socket.unshift(head);

  const conn = new Conn(socket);
  conn.onMessage = (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.t === 'join') {
      const code = String(msg.room || '').slice(0, 12) || '0000';
      const peers = rooms.get(code) || [];
      if (peers.length >= 2) {
        conn.send({ t: 'full' });
        return;
      }
      conn.room = code;
      conn.role = peers.length === 0 ? 'host' : 'guest';
      peers.push(conn);
      rooms.set(code, peers);
      log(`房 ${code}：${conn.role} 加入（${peers.length}/2）`);
      for (const p of peers) {
        p.send({ t: 'role', role: p.role, room: code, peers: peers.length });
      }
      if (peers.length === 2) {
        for (const p of peers) p.send({ t: 'peer', joined: true });
      }
      return;
    }

    if (msg.t === 'ping') { conn.send({ t: 'pong', ts: msg.ts }); return; }

    // 其他訊息一律原樣轉給同房間的另一位
    const peers = rooms.get(conn.room) || [];
    for (const p of peers) if (p !== conn) p.send(raw);
  };

  conn.onClose = () => {
    const peers = rooms.get(conn.room);
    if (!peers) return;
    const i = peers.indexOf(conn);
    if (i >= 0) peers.splice(i, 1);
    for (const p of peers) {
      p.send({ t: 'peer', joined: false });
      // 對手離開後，留下的人升格為主機，下一位進來就能直接再打一場
      p.role = 'host';
      p.send({ t: 'role', role: 'host', room: conn.room, peers: peers.length });
    }
    if (!peers.length) rooms.delete(conn.room);
    log(`房 ${conn.room}：有人離開（剩 ${peers.length}）`);
  };
});

// 心跳：瀏覽器分頁被強制關掉時，TCP 不一定會馬上斷。
// 沒有這段的話那個房號會永遠顯示「已經有兩個人」，下一位玩家就進不來了。
setInterval(() => {
  const now = Date.now();
  for (const [code, peers] of rooms) {
    for (const p of peers.slice()) {
      if (now - p.lastSeen > 45000) {
        log(`房 ${code}：連線逾時，踢掉一位`);
        p.destroy();
      } else {
        p.frame(Buffer.alloc(0), 0x9);      // ping
      }
    }
  }
}, 15000);

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

server.listen(PORT, () => {
  log(`NEON CLASH 中繼伺服器啟動`);
  log(`遊戲：http://localhost:${PORT}/`);
  log(`連線：同一台伺服器的 WebSocket，玩家端「中繼位址」留空即可`);
});
