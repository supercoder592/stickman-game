// 手機觸控層：左邊虛擬搖桿、右邊按鈕。
//
// 觸控狀態直接寫進 input.js 的共用狀態，所以戰鬥端完全不知道玩家是用手指還是鍵盤。

import { setTouchState, BTN } from './input.js';
import { circlePath, neonStroke, glowFill, text } from './gfx.js';
import { WORLD } from './render.js';
import { clamp, withAlpha } from './util.js';

/** 畫面寬度（世界比畫面寬，選單與 HUD 都用畫面座標） */
const VIEW = WORLD.view;

const BUTTONS = [
  { id: 'jump', label: '跳', key: BTN.JUMP, x: 1148, y: 470, r: 46, color: '#7ef1ff' },
  { id: 'light', label: '輕', key: BTN.LIGHT, x: 1040, y: 560, r: 44, color: '#ffffff' },
  { id: 'heavy', label: '重', key: BTN.HEAVY, x: 1148, y: 596, r: 44, color: '#ffd24d' },
  { id: 's1', label: 'U', key: BTN.S1, x: 930, y: 520, r: 38, color: '#5ad8ff' },
  { id: 's2', label: 'I', key: BTN.S2, x: 900, y: 618, r: 38, color: '#b46bff' },
  { id: 'ult', label: '必殺', key: BTN.ULT, x: 1226, y: 520, r: 38, color: '#ff5ec4' },
  { id: 'dash', label: '閃', key: BTN.DASH, x: 1010, y: 664, r: 34, color: '#4cff9d' },
];

const STICK = { x: 160, y: 560, r: 92 };

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
  }

  setSide(side) { this.side = side; }

  /** 桌機想測手機介面時可以手動打開 */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  onDown(id, x, y) {
    if (!this.enabled) return;
    for (const b of BUTTONS) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 8) {
        this.state.edges |= b.key;
        this.pressed.add(b.id);
        this.pointers.set(id, { type: 'btn', id: b.id });
        return;
      }
    }
    if (x < VIEW * 0.45) {
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
    this.state.x = Math.abs(dx) < 16 ? 0 : clamp(dx / 70, -1, 1);
    this.state.down = dy > 44;
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
    } else {
      this.pressed.delete(p.id);
    }
  }

  draw(ctx) {
    if (!this.enabled) return;
    const base = this.pointers.get(this.stickId) || { ox: STICK.x, oy: STICK.y };
    ctx.save();
    ctx.globalAlpha = 0.5;
    neonStroke(ctx, circlePath(base.ox, base.oy, STICK.r), '#7ef1ff', 2, 0.8);
    glowFill(ctx, circlePath(this.stickPos.x, this.stickPos.y, 32), '#7ef1ff', 0.5);
    for (const b of BUTTONS) {
      const on = this.pressed.has(b.id);
      glowFill(ctx, circlePath(b.x, b.y, b.r), b.color, on ? 0.55 : 0.18);
      neonStroke(ctx, circlePath(b.x, b.y, b.r), b.color, 2, 0.8);
      text(ctx, b.label, b.x, b.y + 7, { size: b.r > 40 ? 20 : 16, color: '#ffffff', align: 'center' });
    }
    ctx.restore();
  }
}
