// 手機觸控層：左邊虛擬搖桿、右邊按鈕、左上角暫停鍵。
//
// 觸控狀態直接寫進 input.js 的共用狀態，所以戰鬥端完全不知道玩家是用手指還是鍵盤。
//
// 尺寸的考量：畫布是固定的 1280×720 邏輯解析度，用 CSS 等比縮到手機螢幕上。
// 一支 844×390 的手機會縮成 664 CSS px 寬，也就是 1 邏輯單位 ≈ 0.52 CSS px；
// 所以按鈕半徑要 56 以上，摸起來才有 58 CSS px，達到可以安心按的大小。

import { setTouchState, BTN } from './input.js';
import { circlePath, text } from './gfx.js';
import { WORLD } from './render.js';
import { clamp, withAlpha } from './util.js';

const VIEW = WORLD.view;

/** 右手的按鈕群：主攻擊在最順手的位置，技能排在外圈 */
const BUTTONS = [
  { id: 'light', label: '輕', key: BTN.LIGHT, x: 1012, y: 592, r: 56, color: '#f2f5fa' },
  { id: 'heavy', label: '重', key: BTN.HEAVY, x: 1130, y: 524, r: 56, color: '#ffc233' },
  { id: 'jump', label: '跳', key: BTN.JUMP, x: 1194, y: 636, r: 48, color: '#7ed0ff' },
  { id: 'dash', label: '閃', key: BTN.DASH, x: 1046, y: 670, r: 40, color: '#6ee08a' },
  { id: 's1', label: 'U', key: BTN.S1, slot: 0, x: 898, y: 534, r: 42, color: '#8fd4ff' },
  { id: 's2', label: 'I', key: BTN.S2, slot: 1, x: 928, y: 648, r: 42, color: '#c39bff' },
  { id: 'ult', label: '必殺', key: BTN.ULT, slot: 2, x: 1212, y: 470, r: 44, color: '#ff8fc4' },
];

const STICK = { x: 172, y: 528, r: 104 };
const PAUSE = { x: 549, y: 36, r: 22 };   // 塞在血條與計時器中間的空隙

export class TouchPad {
  constructor() {
    this.enabled = typeof window !== 'undefined'
      && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.state = { x: 0, up: false, down: false, edges: 0 };
    setTouchState(this.state);
    this.pointers = new Map();
    this.stickId = null;
    this.stickPos = { x: STICK.x, y: STICK.y };
    this.pressed = new Set();
    this.side = 0;
    this.onPause = null;          // 由 main.js 接上「離開對戰」
    this.fighter = null;          // 本機角色：用來把冷卻畫在按鈕上
  }

  setSide(side) { this.side = side; }

  /** 把本機角色交給觸控層，讓技能鍵可以顯示冷卻 */
  watch(fighter) { this.fighter = fighter; }

  /** 桌機想測手機介面時可以手動打開 */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  onDown(id, x, y) {
    if (!this.enabled) return;
    if (Math.hypot(x - PAUSE.x, y - PAUSE.y) <= PAUSE.r + 10) {
      this.pointers.set(id, { type: 'pause' });
      this.onPause?.();
      return;
    }
    for (const b of BUTTONS) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 10) {
        this.state.edges |= b.key;
        this.pressed.add(b.id);
        this.pointers.set(id, { type: 'btn', id: b.id });
        return;
      }
    }
    if (x < VIEW * 0.45) {
      // 搖桿以「手指按下的那一點」為圓心，不必先找到固定的圈圈
      this.stickId = id;
      this.pointers.set(id, { type: 'stick', ox: x, oy: y });
      this.stickPos = { x, y };
      this.onMove(id, x, y);
    }
  }

  onMove(id, x, y) {
    const p = this.pointers.get(id);
    if (!p || p.type !== 'stick') return;
    const dx = x - p.ox;
    const dy = y - p.oy;
    this.state.x = Math.abs(dx) < 18 ? 0 : clamp(dx / 76, -1, 1);
    this.state.down = dy > 50;
    this.stickPos = {
      x: p.ox + clamp(dx, -STICK.r, STICK.r),
      y: p.oy + clamp(dy, -STICK.r, STICK.r),
    };
  }

  onUp(id) {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (p.type === 'stick') {
      this.state.x = 0;
      this.state.down = false;
      this.stickId = null;
    } else if (p.type === 'btn') {
      this.pressed.delete(p.id);
    }
  }

  /**
   * 街機圓鈕。要在打得亂七八糟的畫面上一眼看清楚，靠三件事：
   * 不透明的深色底（不是半透明，否則背景會穿過來）、一圈粗的彩色外環、
   * 以及描了黑邊的粗體字。
   */
  pad(ctx, x, y, r, color, label, on, size) {
    const p = circlePath(x, y, r);
    // 底：幾乎不透明，讓按鈕自己成為一塊實心的東西
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, on ? withAlpha(color, 0.95) : 'rgba(26,30,40,0.94)');
    g.addColorStop(1, on ? withAlpha(color, 0.66) : 'rgba(9,11,16,0.94)');
    ctx.fillStyle = g;
    ctx.fill(p);
    // 外圈：先一圈黑把按鈕從背景切開，再疊上粗的彩色環
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.stroke(p);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = on ? '#ffffff' : color;
    ctx.stroke(p);
    // 上緣的受光弧
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 4, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.stroke();
    ctx.restore();
    if (!label) return;
    // 字：先描黑邊再填色，壓在任何背景上都讀得出來
    ctx.save();
    ctx.font = `800 ${size}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.3;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(label, x, y + size * 0.36);
    ctx.fillStyle = on ? '#ffffff' : '#f2f5fa';
    ctx.fillText(label, x, y + size * 0.36);
    ctx.restore();
  }

  /** 技能鍵的冷卻：從下往上補滿的一層暗色 + 剩餘秒數 */
  cooldown(ctx, b) {
    const f = this.fighter;
    if (!f) return;
    let k = 0, label = '';
    if (b.slot === 2) {
      k = 1 - clamp(f.meter / 100, 0, 1);
      if (k > 0) label = `${Math.floor((1 - k) * 100)}%`;
    } else {
      const max = f.char.skills[b.slot]?.cd || 1;
      k = clamp(f.cds[b.slot] / max, 0, 1);
      if (k > 0) label = f.cds[b.slot].toFixed(1);
    }
    if (k <= 0) return;
    const p = circlePath(b.x, b.y, b.r);
    ctx.save();
    ctx.clip(p);
    ctx.fillStyle = 'rgba(4,6,11,0.82)';
    ctx.fillRect(b.x - b.r, b.y - b.r + b.r * 2 * (1 - k), b.r * 2, b.r * 2 * k);
    ctx.restore();
    ctx.save();
    ctx.font = '800 20px "Noto Sans TC","PingFang TC",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(label, b.x, b.y + 7);
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(label, b.x, b.y + 7);
    ctx.restore();
  }

  draw(ctx) {
    if (!this.enabled) return;
    ctx.save();
    ctx.globalAlpha = 0.95;

    // 搖桿：底座 + 會跟著手指跑的桿頭
    const base = this.pointers.get(this.stickId) || { ox: STICK.x, oy: STICK.y };
    const ring = circlePath(base.ox, base.oy, STICK.r);
    ctx.fillStyle = 'rgba(10,12,18,0.55)';
    ctx.fill(ring);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.stroke(ring);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(223,232,245,0.8)';
    ctx.stroke(ring);
    this.pad(ctx, this.stickPos.x, this.stickPos.y, 40, '#dfe8f5', '', this.stickId !== null, 1);
    // 左右的提示箭頭
    ctx.fillStyle = 'rgba(223,232,245,0.7)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(base.ox + s * (STICK.r - 12), base.oy);
      ctx.lineTo(base.ox + s * (STICK.r - 28), base.oy - 11);
      ctx.lineTo(base.ox + s * (STICK.r - 28), base.oy + 11);
      ctx.closePath();
      ctx.fill();
    }

    for (const b of BUTTONS) {
      this.pad(ctx, b.x, b.y, b.r, b.color, b.label, this.pressed.has(b.id), b.r > 50 ? 30 : 24);
      if (b.slot !== undefined) this.cooldown(ctx, b);
    }

    // 暫停／離開
    this.pad(ctx, PAUSE.x, PAUSE.y, PAUSE.r, '#dfe8f5', '‖', false, 24);
    ctx.restore();
  }
}
