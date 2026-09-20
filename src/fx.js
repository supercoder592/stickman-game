// 特效系統：粒子、幾何特效、傷害數字，以及頓幀／震屏／白閃。
//
// 兩種東西：
//   1. 粒子（大量、規格一致）—— 存在扁平陣列裡，一次畫完。
//   2. 特效（少量、每個長得都不一樣）—— 用 closure 帶自己的 draw()，
//      這樣招式檔案就能把「它該長什麼樣」寫在招式旁邊，而不是散落在繪圖層。

import { TAU, circlePath, ngonPath, crescentPath, glowFill, neonStroke, polyPath, text } from './gfx.js';
import { rand, randInt, clamp, withAlpha, easeOut } from './util.js';

export class Fx {
  constructor() {
    this.parts = [];
    this.effects = [];
    this.texts = [];
    this.shake = 0;
    this.shakeDur = 0.001;
    this.shakeT = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.hitstop = 0;
    this.time = 0;
  }

  clear() {
    this.parts.length = 0;
    this.effects.length = 0;
    this.texts.length = 0;
    this.shakeT = 0;
    this.flash = 0;
    this.hitstop = 0;
  }

  // ---------------------------------------------------------------- 畫面級
  quake(amount, dur = 0.24) {
    // 已經在震、而且震得比較大時不要被小震蓋掉
    const cur = this.shake * (this.shakeT / this.shakeDur);
    if (amount < cur) return;
    this.shake = amount;
    this.shakeDur = Math.max(0.001, dur);
    this.shakeT = this.shakeDur;
  }

  /** 命中瞬間把世界凍住幾格 —— 格鬥遊戲打擊感的一半來自這個 */
  stop(sec) {
    this.hitstop = Math.max(this.hitstop, sec);
  }

  flashScreen(alpha = 0.4, color = '#ffffff') {
    this.flash = Math.max(this.flash, alpha);
    this.flashColor = color;
  }

  shakeOffset() {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const k = this.shakeT / this.shakeDur;
    const a = this.shake * k * k;
    return { x: rand(-a, a), y: rand(-a, a) };
  }

  // ---------------------------------------------------------------- 粒子
  particle(o) {
    if (this.parts.length > 900) this.parts.shift();
    this.parts.push({
      x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0,
      g: o.g === undefined ? 900 : o.g,
      drag: o.drag === undefined ? 0.94 : o.drag,
      life: o.life || 0.5, t: 0,
      size: o.size || 3, color: o.color || '#ffffff',
      shape: o.shape || 'dot', rot: o.rot || 0, spin: o.spin || 0,
      layer: o.layer || 'front',
    });
  }

  burst(x, y, color, opts = {}) {
    const {
      count = 14, speed = 320, spread = TAU, dir = 0, size = 3.5,
      life = 0.45, g = 900, shape = 'dot', layer = 'front', drag = 0.92,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * rand(0.35, 1);
      this.particle({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g, drag,
        life: life * rand(0.7, 1.3), size: size * rand(0.6, 1.4),
        color, shape, spin: rand(-8, 8), layer,
      });
    }
  }

  /** 命中火花：白芯 + 角色色碎片 */
  spark(x, y, color, power = 1) {
    this.burst(x, y, '#ffffff', { count: 5 + (power * 4) | 0, speed: 380 * power, size: 3, life: 0.22, g: 200 });
    this.burst(x, y, color, { count: 8 + (power * 6) | 0, speed: 300 * power, size: 4, life: 0.45, shape: 'hex' });
    this.effect({
      life: 0.22, layer: 'front',
      draw: (ctx, k) => {
        const r = 14 + 46 * power * easeOut(k);
        glowFill(ctx, circlePath(x, y, r * 0.35), '#ffffff', (1 - k) * 0.7);
        neonStroke(ctx, circlePath(x, y, r), color, 3 * (1 - k), 1.2);
      },
    });
  }

  /** 招式命中的放射線（漫畫集中線的霓虹版） */
  rays(x, y, color, count = 10, len = 80, life = 0.24) {
    const seed = rand(TAU);
    this.effect({
      life, layer: 'back',
      draw: (ctx, k) => {
        const a0 = 1 - k;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < count; i++) {
          const a = seed + (TAU * i) / count;
          const r0 = 10 + len * 0.5 * k;
          const r1 = r0 + len * (0.5 + 0.5 * k);
          ctx.strokeStyle = withAlpha(color, 0.5 * a0);
          ctx.lineWidth = 3 * a0;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
          ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  ring(x, y, color, opts = {}) {
    const { r0 = 10, r1 = 120, life = 0.35, width = 4, layer = 'front', squash = 1 } = opts;
    this.effect({
      life, layer,
      draw: (ctx, k) => {
        const r = r0 + (r1 - r0) * easeOut(k);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, squash);
        neonStroke(ctx, circlePath(0, 0, r), color, width * (1 - k), 1.3);
        ctx.restore();
      },
    });
  }

  slash(x, y, color, opts = {}) {
    const { r = 70, a0 = -1.1, a1 = 1.1, width = 16, life = 0.22, layer = 'front' } = opts;
    this.effect({
      life, layer,
      draw: (ctx, k) => {
        const rr = r * (0.82 + 0.3 * k);
        glowFill(ctx, crescentPath(x, y, rr, a0, a1, width * (1 - k * 0.5)), color, 0.9 * (1 - k));
        glowFill(ctx, crescentPath(x, y, rr, a0 + 0.1, a1 - 0.1, width * 0.3 * (1 - k)), '#ffffff', 0.8 * (1 - k));
      },
    });
  }

  /** 角色殘影：把骨架的一瞬間留在原地淡出 */
  afterimage(drawFn, color, life = 0.26) {
    this.effect({
      life, layer: 'back',
      draw: (ctx, k) => {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.globalCompositeOperation = 'lighter';
        drawFn(ctx, color);
        ctx.restore();
      },
    });
  }

  dust(x, y, dirX = 0, amount = 8, color = '#9fb4ff') {
    this.burst(x, y, color, {
      count: amount, speed: 140, dir: dirX === 0 ? -Math.PI / 2 : (dirX > 0 ? 0 : Math.PI),
      spread: dirX === 0 ? Math.PI : 1.2, size: 3, life: 0.4, g: 500, layer: 'back',
    });
  }

  damageNumber(x, y, value, color = '#ffffff', big = false) {
    this.texts.push({
      x: x + rand(-10, 10), y, vx: rand(-24, 24), vy: -150,
      t: 0, life: 0.7, str: Math.round(value).toString(),
      color, size: big ? 34 : 22,
    });
  }

  floatText(x, y, str, color = '#ffffff', size = 22) {
    this.texts.push({ x, y, vx: 0, vy: -110, t: 0, life: 0.8, str, color, size });
  }

  effect(e) {
    this.effects.push({ t: 0, layer: 'front', ...e });
  }

  // ---------------------------------------------------------------- 更新
  update(dt) {
    this.time += dt;
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    this.flash = Math.max(0, this.flash - dt * 3.2);

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.update) e.update(dt, e);
      if (e.t >= e.life) this.effects.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const s = this.texts[i];
      s.t += dt;
      if (s.t >= s.life) { this.texts.splice(i, 1); continue; }
      s.vy += 300 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  // ---------------------------------------------------------------- 繪製
  drawParticles(ctx, layer) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (p.layer !== layer) continue;
      const k = p.t / p.life;
      const a = 1 - k;
      const s = p.size * (p.shape === 'dot' ? 1 - k * 0.4 : 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'hex') {
        ctx.fill(ngonPath(p.x, p.y, s, 6, p.rot));
      } else if (p.shape === 'shard') {
        ctx.fill(polyPath([
          { x: p.x + Math.cos(p.rot) * s * 2, y: p.y + Math.sin(p.rot) * s * 2 },
          { x: p.x + Math.cos(p.rot + 2.4) * s, y: p.y + Math.sin(p.rot + 2.4) * s },
          { x: p.x + Math.cos(p.rot - 2.4) * s, y: p.y + Math.sin(p.rot - 2.4) * s },
        ]));
      } else if (p.shape === 'line') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = s * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else {
        ctx.fill(circlePath(p.x, p.y, s));
      }
    }
    ctx.restore();
  }

  draw(ctx, layer) {
    for (const e of this.effects) {
      if (e.layer !== layer) continue;
      ctx.save();
      e.draw(ctx, clamp(e.t / e.life, 0, 1), e);
      ctx.restore();
    }
    this.drawParticles(ctx, layer);
    if (layer === 'front') {
      for (const s of this.texts) {
        const a = clamp(1 - (s.t / s.life) * 1.3, 0, 1);
        text(ctx, s.str, s.x, s.y, {
          size: s.size, color: withAlpha(s.color[0] === '#' ? s.color : '#ffffff', a),
          align: 'center', weight: 900, shadow: `rgba(0,0,0,${0.6 * a})`,
        });
      }
    }
  }

  /** 全畫面白閃，在最後一層蓋上去 */
  drawFlash(ctx, w, h) {
    if (this.flash <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(this.flash, 0, 1);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

export const randomSpin = () => rand(-6, 6);
export const someInt = randInt;
