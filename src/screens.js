// 選單畫面：主畫面、選角、連線大廳、結算。
//
// 每個畫面都是 { update(dt), draw(ctx), onPointer(x,y) }，由 main.js 切換。
// 滑鼠／觸控靠 Taps：畫的時候順手登記可點區域，點下去就轉成和鍵盤一樣的動作。

import { ROSTER, IDS, getChar, statRatio, randomId } from './characters.js';
import { drawArena, drawPortrait, WORLD } from './render.js';
import { panel, stencil, text, measure, neonStroke, glowFill, circlePath, ngonPath, polyPath } from './gfx.js';
import { menuNav, isEdge, anyEdge, drainTyped } from './input.js';
import { clamp, withAlpha, lerp, isTouch } from './util.js';
import { Net } from './net.js';

/** 畫面寬度（世界比畫面寬，選單與 HUD 都用畫面座標） */
const VIEW = WORLD.view;

export class Taps {
  constructor() { this.zones = []; this.building = []; }
  begin() { this.building = []; }
  add(x, y, w, h, action) { this.building.push({ x, y, w, h, action }); }
  commit() { this.zones = this.building; }
  hit(px, py) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) return z.action;
    }
    return null;
  }
}

// ==================================================================
export class TitleScreen {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.index = 0;
    this.taps = new Taps();
    this.showHelp = false;
    this.items = [
      { label: '單機對戰', sub: '一個人打 AI', action: 'solo' },
      { label: '雙人同機', sub: '同一個鍵盤兩個人', action: 'local' },
      { label: '連線對戰', sub: '四位數房號配對', action: 'online' },
      { label: '操作說明', sub: '按鍵與規則', action: 'help' },
    ];
  }

  onEnter() { this.t = 0; }

  update(dt) {
    this.t += dt;
    const nav = menuNav();
    if (this.showHelp) {
      if (nav.ok || nav.back) { this.showHelp = false; this.game.audio.play('menu'); }
      return;
    }
    if (nav.up) { this.index = (this.index + this.items.length - 1) % this.items.length; this.game.audio.play('menu'); }
    if (nav.down) { this.index = (this.index + 1) % this.items.length; this.game.audio.play('menu'); }
    if (nav.ok) this.choose(this.items[this.index].action);
  }

  choose(action) {
    this.game.audio.play('select');
    if (action === 'help') { this.showHelp = true; return; }
    if (action === 'online') { this.game.goto('lobby'); return; }
    this.game.goto('select', { mode: action });
  }

  onPointer(x, y) {
    const a = this.taps.hit(x, y);
    if (this.showHelp) { this.showHelp = false; return; }
    if (a) this.choose(a);
  }

  draw(ctx) {
    this.taps.begin();
    drawArena(ctx, this.t * 0.6, '#5a2a8b');

    // 背景：兩位角色的剪影在對峙
    const a = ROSTER[Math.floor(this.t / 3) % ROSTER.length];
    const b = ROSTER[(Math.floor(this.t / 3) + 5) % ROSTER.length];
    ctx.save();
    ctx.globalAlpha = 0.42;
    drawPortrait(ctx, a, 186, 636, 1.28, this.t, 'idle');
    ctx.translate(1094, 0);
    ctx.scale(-1, 1);
    drawPortrait(ctx, b, 0, 636, 1.28, this.t + 1, 'idle');
    ctx.restore();

    // 標題
    const cx = VIEW / 2;
    const bob = Math.sin(this.t * 1.6) * 4;
    // 刻在鋼板上的標題：先一道暗影、再一道受光的亮邊
    text(ctx, 'STEEL CLASH', cx, 170 + bob, {
      size: 84, color: '#0a0c11', align: 'center', weight: 900, letter: 10, shadow: null,
    });
    text(ctx, 'STEEL CLASH', cx, 168 + bob, {
      size: 84, color: '#c8d2e4', align: 'center', weight: 900, letter: 10, shadow: null,
    });
    text(ctx, '鋼　鐵　亂　鬥', cx, 216 + bob, {
      size: 26, color: '#c1553a', align: 'center', weight: 700, letter: 8,
    });
    text(ctx, '十位鬥士・近戰街機・單機或連線', cx, 248 + bob, {
      size: 15, color: '#8b96b4', align: 'center', letter: 1,
    });

    if (this.showHelp) { this.drawHelp(ctx); this.taps.commit(); return; }

    // 選單
    this.items.forEach((item, i) => {
      const w = 340, h = 54;
      const x = cx - w / 2, y = 300 + i * 66;
      const on = i === this.index;
      panel(ctx, x, y, w, h, on ? '#c9541f' : '#4a5168', { glow: on ? 1 : 0 });
      if (on) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.09 + 0.04 * Math.sin(this.t * 6);
        ctx.fillStyle = '#ffb27a';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        glowFill(ctx, ngonPath(x + 26, y + h / 2, 6, 3, this.t * 1.2), '#ff9a4d', 0.9);
      }
      text(ctx, item.label, x + 52, y + 35, { size: 24, color: on ? '#ffffff' : '#aeb7d8' });
      text(ctx, item.sub, x + w - 16, y + 34, { size: 13, color: '#7b86ad', align: 'right' });
      this.taps.add(x, y, w, h, item.action);
    });

    // 角色跑馬燈
    const stripY = 600;
    ROSTER.forEach((c, i) => {
      const x = 90 + i * 122;
      const wob = Math.sin(this.t * 2 + i) * 3;
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawPortrait(ctx, c, x, stripY + wob, 0.52, this.t + i, 'idle');
      ctx.restore();
      text(ctx, c.name, x, stripY + 30, { size: 14, color: c.color, align: 'center' });
    });

    text(ctx, isTouch() ? '點一下選單開始　左上角可以靜音' : '↑↓ 選擇　Enter 確定　M 靜音　H 說明', cx, 700, {
      size: 14, color: '#6f7aa3', align: 'center',
    });
    this.taps.commit();
  }

  drawHelp(ctx) {
    const w = 900, h = 440, x = (VIEW - w) / 2, y = 180;
    panel(ctx, x, y, w, h, '#8f9bb5');
    text(ctx, '操作說明', x + 40, y + 52, { size: 30, color: '#e2e8f4' });
    const rows = [
      ['移動 / 跳躍', 'A D / W（空中再按一次＝二段跳，限疾翎）'],
      ['輕攻擊', 'J　連按三下是連段，第三段打飛'],
      ['重攻擊', 'K　慢但有霸體，打中直接把人轟開'],
      ['技能一 / 二', 'U / I　各自有冷卻'],
      ['必殺', 'O　氣條滿了才能放'],
      ['衝刺閃避', 'L　有短暫無敵，空中也能用一次'],
      ['格擋', '往後推（遠離對手的方向）就會自動格擋'],
      ['第二位玩家', '方向鍵移動、Numpad 1/2/4/5/6/3'],
    ];
    rows.forEach((r, i) => {
      const ry = y + 100 + i * 40;
      text(ctx, r[0], x + 44, ry, { size: 18, color: '#ffffff' });
      text(ctx, r[1], x + 240, ry, { size: 16, color: '#9fb4ff' });
    });
    text(ctx, '勝負：三回合兩勝，每回合 60 秒，時間到血多的人贏。', x + 44, y + h - 40, {
      size: 15, color: '#ffd24d',
    });
    this.taps.add(x, y, w, h, 'close');
  }
}

// ==================================================================
export class SelectScreen {
  constructor(game) {
    this.game = game;
    this.taps = new Taps();
    this.t = 0;
  }

  onEnter(opts = {}) {
    this.mode = opts.mode || 'solo';       // solo | local | net
    this.net = opts.net || null;
    this.picks = [null, null];
    this.cursor = [0, 5];
    this.ready = [false, false];
    this.phase = 0;                        // solo/local：目前輪到誰選
    this.t = 0;
    this.foeReady = false;
    this.mySide = this.mode === 'net' ? (this.net.isHost ? 0 : 1) : 0;
    this.status = '';
  }

  get columns() { return 5; }

  update(dt) {
    this.t += dt;
    const nav = menuNav();
    if (this.mode === 'net') {
      this.updateNet(nav);
      return;
    }
    const side = this.phase;
    if (nav.left) this.move(side, -1);
    if (nav.right) this.move(side, 1);
    if (nav.up) this.move(side, -this.columns);
    if (nav.down) this.move(side, this.columns);
    if (nav.back) {
      if (this.phase === 1) { this.phase = 0; this.picks[0] = null; }
      else this.game.goto('title');
      this.game.audio.play('menu');
    }
    if (nav.ok) this.confirm(side);

    // 第二位玩家在雙人同機時用自己的方向鍵（第一位用 WASD）
    if (this.mode === 'local' && this.phase === 1) {
      if (anyEdge(['ArrowLeft'])) this.move(1, -1);
      if (anyEdge(['ArrowRight'])) this.move(1, 1);
    }
  }

  updateNet(nav) {
    const side = this.mySide;
    if (nav.left) this.move(side, -1);
    if (nav.right) this.move(side, 1);
    if (nav.up) this.move(side, -this.columns);
    if (nav.down) this.move(side, this.columns);
    if (nav.back) { this.game.leaveNet(); return; }
    if (nav.ok) {
      this.ready[side] = !this.ready[side];
      this.game.audio.play(this.ready[side] ? 'select' : 'menu');
      this.pushNet();
    }
  }

  pushNet() {
    const side = this.mySide;
    this.picks[side] = IDS[this.cursor[side]];
    this.net.send({ t: 'lobby', char: this.picks[side], ready: this.ready[side] });
    this.game.tryStartNet(this.picks, this.ready);
  }

  onNetLobby(msg) {
    const other = this.mySide === 0 ? 1 : 0;
    this.picks[other] = msg.char;
    this.cursor[other] = Math.max(0, IDS.indexOf(msg.char));
    this.ready[other] = !!msg.ready;
    this.game.tryStartNet(this.picks, this.ready);
  }

  move(side, delta) {
    const n = IDS.length;
    this.cursor[side] = (this.cursor[side] + delta + n * 2) % n;
    this.game.audio.play('menu');
    if (this.mode === 'net') {
      this.ready[side] = false;
      this.pushNet();
    }
  }

  confirm(side) {
    const id = IDS[this.cursor[side]];
    this.picks[side] = id;
    this.game.audio.play('select');
    if (this.mode === 'solo') {
      if (this.phase === 0) {
        this.phase = 1;
        this.cursor[1] = Math.floor(Math.random() * IDS.length);
      } else {
        this.game.startBattle({ mode: 'solo', chars: [this.picks[0], this.picks[1]] });
      }
    } else if (this.mode === 'local') {
      if (this.phase === 0) this.phase = 1;
      else this.game.startBattle({ mode: 'local', chars: [this.picks[0], this.picks[1]] });
    }
  }

  onPointer(x, y) {
    const a = this.taps.hit(x, y);
    if (!a) return;
    if (a === 'back') {
      if (this.mode === 'net') this.game.leaveNet();
      else if (this.phase === 1) { this.phase = 0; this.picks[0] = null; }
      else this.game.goto('title');
      return;
    }
    if (a === 'ok') {
      if (this.mode === 'net') { this.ready[this.mySide] = !this.ready[this.mySide]; this.pushNet(); }
      else this.confirm(this.phase);
      return;
    }
    if (a === 'random') {
      const side = this.mode === 'net' ? this.mySide : this.phase;
      this.cursor[side] = Math.floor(Math.random() * IDS.length);
      if (this.mode === 'net') this.pushNet();
      else this.confirm(side);
      return;
    }
    if (typeof a === 'number') {
      const side = this.mode === 'net' ? this.mySide : this.phase;
      if (this.cursor[side] === a) {
        if (this.mode === 'net') { this.ready[side] = !this.ready[side]; this.pushNet(); }
        else this.confirm(side);
      } else {
        this.cursor[side] = a;
        this.game.audio.play('menu');
        if (this.mode === 'net') { this.ready[side] = false; this.pushNet(); }
      }
    }
  }

  draw(ctx) {
    this.taps.begin();
    ctx.fillStyle = '#06080f';
    ctx.fillRect(0, 0, VIEW, WORLD.h);
    drawArena(ctx, this.t * 0.4, '#3a2a6b');
    ctx.fillStyle = 'rgba(4,6,14,0.72)';
    ctx.fillRect(0, 0, VIEW, WORLD.h);

    const title = this.mode === 'net' ? '選擇角色（連線）'
      : this.mode === 'local' ? (this.phase === 0 ? '玩家 1 選擇角色' : '玩家 2 選擇角色')
        : (this.phase === 0 ? '選擇你的角色' : '選擇對手');
    text(ctx, title, 60, 60, { size: 30, color: '#e8edf8', letter: 2 });
    const hint = isTouch()
      ? (this.mode === 'net' ? '點角色卡選擇　再點一次＝準備' : '點角色卡選擇　再點一次＝確定')
      : (this.mode === 'net'
        ? '↑↓←→ 選擇　Enter 準備／取消　Esc 離開房間'
        : '↑↓←→ 選擇　Enter 確定　Esc 返回');
    text(ctx, hint, 60, 86, { size: 14, color: '#8a93c0' });

    if (this.mode === 'net') {
      const st = this.net.peerHere ? '對手已連線' : '等待對手加入…';
      text(ctx, `房號 ${this.net.room}　${st}　延遲 ${this.net.rtt}ms`, VIEW - 60, 60, {
        size: 16, color: '#b9c4dc', align: 'right',
      });
    }

    // 角色卡片
    const cardW = 200, cardH = 132, gap = 14;
    const gridW = this.columns * cardW + (this.columns - 1) * gap;
    const gx = (VIEW - gridW) / 2, gy = 110;
    ROSTER.forEach((c, i) => {
      const col = i % this.columns, row = Math.floor(i / this.columns);
      const x = gx + col * (cardW + gap), y = gy + row * (cardH + gap);
      const sel0 = this.cursor[0] === i && (this.mode !== 'solo' || this.phase === 0 || this.picks[0] === c.id);
      const sel1 = this.cursor[1] === i && (this.mode === 'net' || this.phase === 1);
      this.drawCard(ctx, c, x, y, cardW, cardH, sel0, sel1, i);
      this.taps.add(x, y, cardW, cardH, i);
    });

    // 詳細資料
    const side = this.mode === 'net' ? this.mySide : this.phase;
    const cur = getChar(IDS[this.cursor[side]]);
    this.drawDetail(ctx, cur, gx, gy + 2 * (cardH + gap) + 8, gridW);

    // 底部按鈕
    const okLabel = this.mode === 'net' ? (this.ready[this.mySide] ? '取消準備' : '準備') : '確定';
    this.button(ctx, VIEW - 260, WORLD.h - 68, 200, 46, okLabel, '#4cff9d', 'ok');
    this.button(ctx, 60, WORLD.h - 68, 140, 46, '返回', '#8a93c0', 'back');
    this.button(ctx, 220, WORLD.h - 68, 140, 46, '隨機', '#ffd24d', 'random');

    // 雙方選擇狀態
    const p0 = this.picks[0] ? getChar(this.picks[0]) : null;
    const p1 = this.picks[1] ? getChar(this.picks[1]) : null;
    const label = (p, who, ready) => p ? `${who}：${p.name}${ready ? '（已準備）' : ''}` : `${who}：選擇中…`;
    text(ctx, label(p0, this.mode === 'solo' ? '你' : 'P1', this.ready[0]), VIEW / 2 - 200, WORLD.h - 92, {
      size: 16, color: '#b9c4dc', align: 'right',
    });
    text(ctx, 'VS', VIEW / 2, WORLD.h - 92, { size: 20, color: '#ffd24d', align: 'center' });
    text(ctx, label(p1, this.mode === 'solo' ? '對手' : 'P2', this.ready[1]), VIEW / 2 + 200, WORLD.h - 92, {
      size: 16, color: '#ff5ec4', align: 'left',
    });

    this.taps.commit();
  }

  drawCard(ctx, c, x, y, w, h, sel0, sel1, i) {
    const on = sel0 || sel1;
    const col = on ? c.color : '#39405e';
    panel(ctx, x, y, w, h, col, { glow: on ? 1 : 0, cut: 10 });
    if (on) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(this.t * 6);
      ctx.fillStyle = c.color;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    drawPortrait(ctx, c, x + 52, y + h - 12, 0.58, this.t + i, 'idle');
    text(ctx, c.name, x + w - 14, y + 34, { size: 22, color: on ? '#ffffff' : c.color, align: 'right' });
    text(ctx, c.en, x + w - 14, y + 54, { size: 12, color: '#8a93c0', align: 'right' });
    text(ctx, c.title, x + w - 14, y + h - 16, { size: 13, color: '#9fb4ff', align: 'right' });
    if (sel0) this.cursorFrame(ctx, x, y, w, h, '#ffb45c', 'P1');
    if (sel1) this.cursorFrame(ctx, x, y, w, h, '#ff5ec4', 'P2');
  }

  cursorFrame(ctx, x, y, w, h, color, tag) {
    const o = tag === 'P1' ? 0 : 5;
    const p = polyPath([
      { x: x - 4 + o, y: y - 4 + o }, { x: x + w + 4 - o, y: y - 4 + o },
      { x: x + w + 4 - o, y: y + h + 4 - o }, { x: x - 4 + o, y: y + h + 4 - o },
    ]);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.stroke(p);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke(p);
    ctx.restore();
    text(ctx, tag, x + w - 8 + (tag === 'P1' ? 0 : 0), y - 10, { size: 12, color, align: 'right' });
  }

  drawDetail(ctx, c, x, y, w) {
    const h = 196;
    panel(ctx, x, y, w, h, c.color, { glow: 0.35 });
    drawPortrait(ctx, c, x + 82, y + h - 18, 0.92, this.t, 'idle');

    text(ctx, c.name, x + 180, y + 44, { size: 30, color: c.color });
    const nw = measure(ctx, c.name, 30);
    text(ctx, `${c.en}・${c.title}`, x + 190 + nw, y + 42, { size: 15, color: '#9fb4ff' });
    text(ctx, c.tagline, x + 180, y + 68, { size: 14, color: '#c3cbe8' });

    // 數值條
    const stats = [['hp', '血量'], ['speed', '移速'], ['jump', '跳躍'], ['atk', '攻擊'], ['def', '耐打']];
    stats.forEach((s, i) => {
      const sy = y + 92 + i * 20;
      text(ctx, s[1], x + 180, sy + 10, { size: 13, color: '#9fb4ff' });
      const bx = x + 228, bw = 150;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, sy, bw, 10);
      ctx.fillStyle = c.color;
      ctx.fillRect(bx, sy, bw * statRatio(c, s[0]), 10);
    });

    // 被動與招式
    const tx = x + 420;
    text(ctx, `被動・${c.passive.name}`, tx, y + 44, { size: 17, color: c.accent });
    text(ctx, c.passive.desc, tx, y + 66, { size: 13, color: '#c3cbe8' });
    const moves = [['U', c.skills[0]], ['I', c.skills[1]], ['O', c.ult]];
    moves.forEach((m, i) => {
      const my = y + 100 + i * 32;
      const key = m[0];
      const s = m[1];
      ctx.fillStyle = withAlpha(c.color, 0.18);
      ctx.fillRect(tx, my - 14, 26, 22);
      text(ctx, key, tx + 13, my + 2, { size: 13, color: c.color, align: 'center' });
      text(ctx, s.name, tx + 36, my + 2, { size: 16, color: '#ffffff' });
      const nw2 = measure(ctx, s.name, 16);
      text(ctx, s.desc, tx + 46 + nw2, my + 1, { size: 12.5, color: '#9fb4ff' });
      if (s.cd) text(ctx, `CD ${s.cd}s`, x + w - 16, my + 2, { size: 12, color: '#7b86ad', align: 'right' });
      else text(ctx, '需要滿氣', x + w - 16, my + 2, { size: 12, color: '#ffd24d', align: 'right' });
    });
  }

  button(ctx, x, y, w, h, label, color, action) {
    panel(ctx, x, y, w, h, color, { glow: 0.6 });
    text(ctx, label, x + w / 2, y + h / 2 + 7, { size: 19, color: '#ffffff', align: 'center' });
    this.taps.add(x, y, w, h, action);
  }
}

// ==================================================================
export class LobbyScreen {
  constructor(game) {
    this.game = game;
    this.taps = new Taps();
    this.t = 0;
    this.field = 'room';                  // room | address
    this.room = '';
    this.address = localStorage.getItem('neon.relay') || '';
    this.status = '';
    this.busy = false;
  }

  onEnter() {
    this.t = 0;
    this.status = '';
    this.busy = false;
    this.room = String(1000 + Math.floor(Math.random() * 9000));
  }

  update(dt) {
    this.t += dt;
    // 這個畫面要打字，所以不吃 WASD 當方向鍵 —— 不然打 wss:// 的 s 會變成切換欄位
    if (isEdge('Escape')) { this.game.goto('title'); return; }
    if (isEdge('ArrowUp') || isEdge('ArrowDown') || isEdge('Tab')) {
      this.field = this.field === 'room' ? 'address' : 'room';
      this.game.audio.play('menu');
    }
    // 位址欄可以打空白（wss:// 網址雖然沒有空白，但別讓空白鍵變成「連線」）
    if ((isEdge('Enter') || isEdge('NumpadEnter')) && !this.busy) { this.join(); return; }

    // 真正的打字：房號只收數字，位址什麼都收
    for (const ch of drainTyped()) {
      if (ch === '\b') {
        if (this.field === 'room') this.room = this.room.slice(0, -1);
        else this.address = this.address.slice(0, -1);
      } else {
        this.type(ch);
      }
    }
  }

  type(ch) {
    if (this.field === 'room') {
      if (this.room.length < 4 && /\d/.test(ch)) this.room += ch;
    } else if (this.address.length < 56 && ch !== ' ') {
      this.address += ch;
    }
  }

  async join() {
    if (this.room.length !== 4) { this.status = '房號要四位數字'; return; }
    this.busy = true;
    this.status = '連線中…';
    localStorage.setItem('neon.relay', this.address);
    try {
      await this.game.connectNet(this.address, this.room);
    } catch (e) {
      this.status = this.game.net.error || '連線失敗';
      this.busy = false;
    }
  }

  onPointer(x, y) {
    const a = this.taps.hit(x, y);
    if (!a) return;
    if (a === 'back') { this.game.goto('title'); return; }
    if (a === 'join') { this.join(); return; }
    if (a === 'room' || a === 'address') { this.field = a; return; }
    if (a.startsWith && a.startsWith('k')) {
      const ch = a.slice(1);
      if (ch === 'del') {
        if (this.field === 'room') this.room = this.room.slice(0, -1);
        else this.address = this.address.slice(0, -1);
      } else this.type(ch);
    }
  }

  draw(ctx) {
    this.taps.begin();
    drawArena(ctx, this.t * 0.4, '#2a2a6b');
    ctx.fillStyle = 'rgba(4,6,14,0.78)';
    ctx.fillRect(0, 0, VIEW, WORLD.h);

    const cx = VIEW / 2;
    stencil(ctx, '連線對戰', cx, 92, { size: 38, color: '#e8edf8', letter: 6 });
    text(ctx, '兩邊輸入同一組房號就會配對，先連進來的自動當主機。', cx, 124, {
      size: 15, color: '#8b96b4', align: 'center', letter: 1,
    });

    // 房號
    const boxW = 92, boxH = 108;
    const totalW = boxW * 4 + 18 * 3;
    const bx = cx - totalW / 2;
    for (let i = 0; i < 4; i++) {
      const x = bx + i * (boxW + 18);
      const y = 170;
      const active = this.field === 'room' && i === this.room.length;
      panel(ctx, x, y, boxW, boxH, active ? '#ffb45c' : (this.field === 'room' ? '#8f9bb5' : '#4a5168'), { glow: active ? 1 : 0.4 });
      text(ctx, this.room[i] || '_', x + boxW / 2, y + 74, {
        size: 56, color: this.room[i] ? '#ffffff' : '#39405e', align: 'center', weight: 900,
      });
      this.taps.add(x, y, boxW, boxH, 'room');
    }

    // 中繼位址
    const ax = cx - 300, ay = 310;
    text(ctx, '中繼伺服器位址（留空 = 跟遊戲同一台主機）', ax, ay - 12, { size: 14, color: '#9fb4ff' });
    panel(ctx, ax, ay, 600, 48, this.field === 'address' ? '#ffb45c' : '#4a5168', { glow: this.field === 'address' ? 0.8 : 0 });
    text(ctx, this.address || 'ws://（本機）', ax + 16, ay + 32, {
      size: 18, color: this.address ? '#ffffff' : '#6f7aa3',
    });
    this.taps.add(ax, ay, 600, 48, 'address');

    // 數字鍵盤（手機用）
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', ':'];
    keys.forEach((k, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const kx = cx - 168 + col * 116, ky = 384 + row * 64;
      panel(ctx, kx, ky, 104, 54, '#4a5168', { glow: 0 });
      text(ctx, k === 'del' ? '←' : k, kx + 52, ky + 36, { size: 22, color: '#dfe6ff', align: 'center' });
      this.taps.add(kx, ky, 104, 54, `k${k}`);
    });

    if (this.status) {
      text(ctx, this.status, cx, 646, { size: 17, color: '#ffd24d', align: 'center' });
    }
    text(ctx, isTouch() ? '點數字鍵輸入房號　再點「連線」' : '數字鍵輸入房號　↑↓ 切換欄位　Enter 連線　Esc 返回', cx, 676, {
      size: 14, color: '#6f7aa3', align: 'center',
    });

    panel(ctx, cx + 200, 384, 150, 54, '#5fa36a', { glow: 0.8 });
    text(ctx, '連線', cx + 275, 420, { size: 22, color: '#ffffff', align: 'center' });
    this.taps.add(cx + 200, 384, 150, 54, 'join');

    panel(ctx, cx - 350, 384, 150, 54, '#6b748f', { glow: 0 });
    text(ctx, '返回', cx - 275, 420, { size: 22, color: '#dfe6ff', align: 'center' });
    this.taps.add(cx - 350, 384, 150, 54, 'back');

    this.taps.commit();
  }
}

// ==================================================================
export class ResultScreen {
  constructor(game) {
    this.game = game;
    this.taps = new Taps();
    this.t = 0;
  }

  onEnter(opts = {}) {
    this.t = 0;
    this.winner = opts.winner;
    this.battle = opts.battle;
    this.mode = opts.mode;
  }

  update(dt) {
    this.t += dt;
    const nav = menuNav();
    if (nav.ok) this.again();
    if (nav.back) this.game.goto('title');
  }

  again() {
    this.game.audio.play('select');
    if (this.mode === 'net') this.game.goto('title');
    else this.game.goto('select', { mode: this.mode });
  }

  onPointer(x, y) {
    const a = this.taps.hit(x, y);
    if (a === 'again') this.again();
    if (a === 'title') this.game.goto('title');
  }

  draw(ctx) {
    this.taps.begin();
    this.battle.draw(ctx);
    ctx.fillStyle = 'rgba(4,6,14,0.78)';
    ctx.fillRect(0, 0, VIEW, WORLD.h);

    const win = this.battle.fighters[this.winner];
    const lose = this.battle.fighters[this.winner === 0 ? 1 : 0];
    const cx = VIEW / 2;

    stencil(ctx, 'K.O.', cx, 130, { size: 92, color: win.char.color, letter: 10 });
    text(ctx, `${win.char.name} 獲勝`, cx, 180, { size: 30, color: '#ffffff', align: 'center' });
    text(ctx, `${this.battle.roundWins[0]} - ${this.battle.roundWins[1]}`, cx, 216, {
      size: 22, color: '#9fb4ff', align: 'center',
    });

    // 勝者站左、敗者倒在右邊；兩邊都往外靠，武器才不會擋到字
    const bob = Math.sin(this.t * 2) * 6;
    drawPortrait(ctx, win.char, cx - 372, 556 + bob, 1.75, this.t, 'idle');
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawPortrait(ctx, lose.char, cx + 372, 556, 1.5, this.t, 'ko');
    ctx.restore();

    const stats = [
      ['總傷害', `${Math.round(win.dmgDealt)}`, `${Math.round(lose.dmgDealt)}`],
      ['最高連段', `${win.maxCombo}`, `${lose.maxCombo}`],
      ['剩餘血量', `${Math.max(0, Math.round(win.hp))}`, `${Math.max(0, Math.round(lose.hp))}`],
    ];
    stats.forEach((s, i) => {
      const y = 300 + i * 40;
      text(ctx, s[1], cx - 60, y, { size: 22, color: win.char.color, align: 'right' });
      text(ctx, s[0], cx, y, { size: 15, color: '#9fb4ff', align: 'center' });
      text(ctx, s[2], cx + 60, y, { size: 22, color: lose.char.color, align: 'left' });
    });

    panel(ctx, cx - 230, 600, 200, 54, '#5fa36a', { glow: 0.8 });
    text(ctx, '再打一場', cx - 130, 636, { size: 20, color: '#ffffff', align: 'center' });
    this.taps.add(cx - 230, 600, 200, 54, 'again');

    panel(ctx, cx + 30, 600, 200, 54, '#6b748f', { glow: 0 });
    text(ctx, '回主畫面', cx + 130, 636, { size: 20, color: '#dfe6ff', align: 'center' });
    this.taps.add(cx + 30, 600, 200, 54, 'title');

    this.taps.commit();
  }
}
