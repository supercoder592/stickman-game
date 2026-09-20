// 連線對戰的客戶端。
//
// 架構刻意選最簡單、也最好維護的一種：
//   中繼伺服器只做「同一個房號的兩個人互轉封包」，不懂遊戲規則；
//   先連進房間的人當**主機**，主機跑完整模擬並每秒送 20 次快照，
//   另一邊只送輸入、照著快照畫。所有傷害判定只有主機算，不會分歧。
//
// 房號＝四位數字，兩邊輸入同一組就會配對。

export class Net {
  constructor() {
    this.ws = null;
    this.role = null;        // 'host' | 'guest'
    this.room = '';
    this.peerHere = false;
    this.status = 'idle';    // idle | connecting | waiting | ready | closed | error
    this.error = '';
    this.handlers = new Map();
    this.lastPing = 0;
    this.rtt = 0;
  }

  get isHost() { return this.role === 'host'; }
  get connected() { return this.ws && this.ws.readyState === WebSocket.OPEN; }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return this;
  }

  emit(type, payload) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list) fn(payload);
  }

  /**
   * 位址寫法三種都收：
   *   （空白）          → 和遊戲同一台主機（用 relay 伺服器直接開遊戲時最方便）
   *   example.com:8787  → ws://example.com:8787
   *   wss://x.y.z       → 原樣使用（雲端平台都是這種）
   */
  static resolveUrl(address) {
    const a = (address || '').trim();
    const secure = location.protocol === 'https:';
    if (!a) {
      const proto = secure ? 'wss:' : 'ws:';
      return `${proto}//${location.host}`;
    }
    if (a.startsWith('ws://') || a.startsWith('wss://')) return a;
    const proto = secure ? 'wss:' : 'ws:';
    return a.includes(':') ? `${proto}//${a}` : `${proto}//${a}:8787`;
  }

  connect(address, room) {
    this.close();
    this.room = room;
    this.status = 'connecting';
    this.error = '';
    let url;
    try {
      url = Net.resolveUrl(address);
    } catch (e) {
      this.status = 'error';
      this.error = '位址看不懂';
      return Promise.reject(e);
    }

    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        this.status = 'error';
        this.error = '無法建立連線';
        reject(e);
        return;
      }
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (this.status === 'connecting') {
          this.error = '連不上中繼伺服器';
          this.status = 'error';
          try { ws.close(); } catch (e) { /* 已經關了就算了 */ }
          reject(new Error(this.error));
        }
      }, 8000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ t: 'join', room }));
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        switch (msg.t) {
          case 'role':
            clearTimeout(timeout);
            this.role = msg.role;
            this.status = msg.peers >= 2 ? 'ready' : 'waiting';
            this.peerHere = msg.peers >= 2;
            this.emit('role', msg);
            resolve(msg);
            break;
          case 'peer':
            this.peerHere = msg.joined;
            this.status = msg.joined ? 'ready' : 'waiting';
            this.emit('peer', msg);
            break;
          case 'full':
            clearTimeout(timeout);
            this.error = '這個房號已經有兩個人了';
            this.status = 'error';
            this.emit('error', this.error);
            reject(new Error(this.error));
            break;
          case 'pong':
            this.rtt = Math.round(performance.now() - msg.ts);
            break;
          default:
            this.emit('msg', msg);
            break;
        }
      };
      ws.onerror = () => {
        if (this.status === 'connecting') {
          this.error = '連不上中繼伺服器';
          this.status = 'error';
          clearTimeout(timeout);
          reject(new Error(this.error));
        }
        this.emit('error', this.error || '連線發生錯誤');
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        if (this.status !== 'error') this.status = 'closed';
        this.peerHere = false;
        this.emit('close');
      };
    });
  }

  send(obj) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify(obj));
  }

  ping() {
    const now = performance.now();
    if (now - this.lastPing < 2000) return;
    this.lastPing = now;
    this.send({ t: 'ping', ts: now });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* 忽略 */ }
      this.ws = null;
    }
    this.role = null;
    this.peerHere = false;
    if (this.status !== 'error') this.status = 'idle';
  }
}

/** 輸入壓成四個數字，一秒 60 次也才幾 KB */
export const packInput = (f) => [f.x, f.up ? 1 : 0, f.down ? 1 : 0, f.edges];
export const unpackInput = (a) => ({ x: a[0], up: !!a[1], down: !!a[2], edges: a[3] });
