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
    if (this.parts.length > 1100) this.parts.shift();
    this.parts.push({
      x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0,
      g: o.g === undefined ? 900 : o.g,
      drag: o.drag === undefined ? 0.94 : o.drag,
      life: o.life || 0.5, t: 0,
      size: o.size || 3, color: o.color || '#ffffff',
      shape: o.shape || 'dot', rot: o.rot || 0, spin: o.spin || 0,
      layer: o.layer || 'front',
      blend: o.blend || 'add',          // add = 火花／火焰，normal = 煙塵／碎塊
      grow: o.grow || 0,                // 每秒放大（煙）
      fade: o.fade === undefined ? 1 : o.fade,
      bounce: o.bounce || 0,            // 碰到地面彈一下
      groundY: o.groundY,
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

  /** 命中：金屬火花 + 白色衝擊閃 + 一小撮煙 */
  spark(x, y, color, power = 1, groundY) {
    this.sparks(x, y, {
      count: Math.round(10 + power * 14), color: '#ffe0a8', speed: 460 * power,
      dir: -Math.PI / 2, spread: Math.PI * 1.6, life: 0.45, groundY,
    });
    this.burst(x, y, color, { count: Math.round(4 + power * 4), speed: 240 * power, size: 3, life: 0.3 });
    this.effect({
      life: 0.16 + 0.06 * power, layer: 'front',
      draw: (ctx, k) => {
        const a = 1 - k;
        const r = (16 + 40 * power) * easeOut(k, 2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.4, withAlpha(color, a * 0.6));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        // 十字光芒
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
        ctx.lineWidth = 2 * a;
        ctx.beginPath();
        ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x + r * 1.6, y);
        ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x, y + r * 1.1);
        ctx.stroke();
        ctx.restore();
      },
    });
    if (power > 1.2) this.smoke(x, y, { count: 3, color: '#6b645c', r: 10, rise: 50, life: 0.7 });
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

  // ---------------------------------------------------------------- 寫實特效
  /** 煙塵：慢慢上升並擴散，不發光 */
  smoke(x, y, opts = {}) {
    const {
      count = 8, color = '#9aa2ae', r = 14, rise = 40, life = 1.1, spread = 30, alpha = 1,
    } = opts;
    for (let i = 0; i < count; i++) {
      this.particle({
        x: x + rand(-spread, spread), y: y + rand(-spread * 0.4, spread * 0.4),
        vx: rand(-30, 30), vy: -rise * rand(0.5, 1.2),
        g: -12, drag: 0.97, life: life * rand(0.7, 1.4),
        size: r * rand(0.6, 1.5), grow: r * 1.2, color,
        shape: 'smoke', blend: 'normal', layer: 'back',
      });
    }
  }

  /** 火花：亮、快、帶拖尾，撞到地面會彈 */
  sparks(x, y, opts = {}) {
    const {
      count = 18, color = '#ffd9a0', speed = 520, dir = -Math.PI / 2, spread = Math.PI,
      life = 0.5, groundY,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = speed * rand(0.3, 1);
      this.particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: 1300, drag: 0.99, life: life * rand(0.5, 1.3),
        size: rand(1.4, 3), color, shape: 'line', blend: 'add',
        bounce: 0.4, groundY,
      });
    }
  }

  /** 碎塊：水泥、鐵屑，會旋轉並落地 */
  debris(x, y, opts = {}) {
    const {
      count = 10, color = '#4a4640', speed = 420, dir = -Math.PI / 2, spread = 2.2,
      size = 5, life = 1.6, groundY,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = speed * rand(0.4, 1);
      this.particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: 1500, drag: 0.995, life: life * rand(0.7, 1.3),
        size: size * rand(0.5, 1.4), color, shape: 'chunk', blend: 'normal',
        spin: rand(-14, 14), bounce: 0.35, groundY, layer: 'front',
      });
    }
  }

  /** 地面塵環：衝擊往外推開的一圈灰 */
  dustRing(x, y, opts = {}) {
    const { r = 120, life = 0.5, color = '#8d8578' } = opts;
    this.effect({
      life, layer: 'back',
      draw: (ctx, k) => {
        const rr = r * easeOut(k, 2);
        const a = (1 - k) * 0.5;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.26);
        const g = ctx.createRadialGradient(0, 0, rr * 0.55, 0, 0, rr);
        g.addColorStop(0, withAlpha(color, 0));
        g.addColorStop(0.7, withAlpha(color, a));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });
  }

  /** 火球／爆燃：亮核 + 翻滾的火舌 + 黑煙 */
  fireBurst(x, y, opts = {}) {
    const { r = 90, life = 0.55, count = 14 } = opts;
    this.effect({
      life, layer: 'front',
      draw: (ctx, k) => {
        const rr = r * easeOut(k, 1.8);
        const a = 1 - k;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(255,250,220,${a})`);
        g.addColorStop(0.35, `rgba(255,170,60,${a * 0.85})`);
        g.addColorStop(0.7, `rgba(220,80,30,${a * 0.5})`);
        g.addColorStop(1, 'rgba(60,20,10,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      this.particle({
        x, y, vx: Math.cos(a) * rand(60, 260), vy: Math.sin(a) * rand(60, 200) - 60,
        g: -120, drag: 0.93, life: rand(0.4, 0.9), size: rand(6, 16), grow: 30,
        color: i % 3 === 0 ? '#ffd27a' : '#ff8a30', shape: 'smoke', blend: 'add',
      });
    }
    this.smoke(x, y, { count: 6, color: '#3a3128', r: 18, rise: 60, life: 1.4 });
  }

  /** 電弧：從 a 點打到 b 點的鋸齒閃電 */
  arc(ax, ay, bx, by, color = '#9fe8ff', life = 0.14) {
    const rng = new Array(5).fill(0).map(() => rand(-1, 1));
    this.effect({
      life, layer: 'front',
      draw: (ctx, k) => {
        const a = 1 - k;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [w, col] of [[6, withAlpha(color, 0.25 * a)], [2.4, withAlpha(color, 0.8 * a)], [1, `rgba(255,255,255,${a})`]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          for (let i = 0; i < 5; i++) {
            const t2 = (i + 1) / 6;
            const nx = -(by - ay), ny = bx - ax;
            const len = Math.hypot(nx, ny) || 1;
            const off = rng[i] * 16 * Math.sin(t2 * Math.PI);
            ctx.lineTo(ax + (bx - ax) * t2 + (nx / len) * off, ay + (by - ay) * t2 + (ny / len) * off);
          }
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  /** 武器揮擊的殘影帶：沿著一串點畫出漸細的拖尾 */
  weaponTrail(points, color, life = 0.2, width = 16) {
    if (points.length < 3) return;
    const pts = points.map((p) => ({ x: p.x, y: p.y }));
    this.effect({
      life, layer: 'front',
      draw: (ctx, k) => {
        const a = (1 - k) * 0.75;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [w, col] of [[width, withAlpha(color, a * 0.25)], [width * 0.45, withAlpha(color, a * 0.6)], [width * 0.14, `rgba(255,255,255,${a})`]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
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
      if (p.grow) p.size += p.grow * dt;
      // 碎塊落地會彈起來再滾一下，比直接穿過地板真實得多
      if (p.bounce && p.groundY !== undefined && p.y > p.groundY) {
        p.y = p.groundY;
        p.vy *= -p.bounce;
        p.vx *= 0.6;
        p.spin *= 0.5;
        if (Math.abs(p.vy) < 40) { p.vy = 0; p.g = 0; p.vx *= 0.3; }
      }
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
    this.drawParticlePass(ctx, layer, 'normal');
    this.drawParticlePass(ctx, layer, 'add');
  }

  drawParticlePass(ctx, layer, blend) {
    ctx.save();
    ctx.globalCompositeOperation = blend === 'add' ? 'lighter' : 'source-over';
    for (const p of this.parts) {
      if (p.layer !== layer || p.blend !== blend) continue;
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
      } else if (p.shape === 'smoke') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s);
        g.addColorStop(0, withAlpha(p.color, a * 0.55));
        g.addColorStop(0.6, withAlpha(p.color, a * 0.22));
        g.addColorStop(1, withAlpha(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, TAU);
        ctx.fill();
      } else if (p.shape === 'chunk') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.7);
        ctx.lineTo(s * 0.9, -s);
        ctx.lineTo(s, s * 0.6);
        ctx.lineTo(-s * 0.7, s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-s * 0.9, -s * 0.7, s * 1.2, s * 0.35);
        ctx.restore();
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
