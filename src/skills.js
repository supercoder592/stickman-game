// 招式元件庫。
//
// 二十位角色技能 + 十招必殺，如果每一招都從零寫起會又長又不一致，
// 所以拆成可組合的元件：彈道／場域／地刺／光束／突進／連打／天降／引力…
// 角色資料只填 kind 與參數，視覺再用自己的顏色與形狀做出辨識度。
//
// 兩種元件：
//   Entity   有自己生命週期的東西（飛行物、場域、光束）
//   Routine  一段時間內「操控施放者」的腳本（突進、連斬、瞬移）

import {
  TAU, circlePath, ngonPath, polyPath, crescentPath, linePath, taperPath,
  neonStroke, glowFill, joltPath, starPath,
} from './gfx.js';
import { clamp, rand, sign, rect, overlaps, easeOut, withAlpha, dist } from './util.js';
import { WORLD } from './render.js';

// ------------------------------------------------------------------ 基底
class Entity {
  constructor(o = {}) {
    Object.assign(this, { t: 0, life: 1, dead: false, layer: 'front' }, o);
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.life) this.dead = true;
  }
  draw() {}
}

/** 一段時間內操控施放者的腳本 */
class Routine extends Entity {
  constructor(o) { super(o); }
  update(dt, battle) {
    this.t += dt;
    if (this.step) this.step(dt, this, battle);
    if (this.t >= this.life) {
      if (this.finish) this.finish(this, battle);
      this.dead = true;
    }
  }
}

const foeOf = (user) => user.battle.opponentOf(user);

/** 對指定矩形內的敵人造成一次傷害 */
function hitRect(user, r, hit) {
  const foe = foeOf(user);
  if (!foe || foe.dead) return false;
  if (!overlaps(r, foe.bodyRect())) return false;
  return user.dealDamage(foe, hit);
}

function hitCircle(user, x, y, radius, hit) {
  const foe = foeOf(user);
  if (!foe || foe.dead) return false;
  const b = foe.bodyRect();
  const cx = clamp(x, b.x, b.x + b.w);
  const cy = clamp(y, b.y, b.y + b.h);
  if (dist(x, y, cx, cy) > radius) return false;
  return user.dealDamage(foe, hit);
}

// ------------------------------------------------------------------ 飛行物
export class Projectile extends Entity {
  constructor(o) {
    super({ layer: 'front', radius: 16, gravity: 0, homing: 0, pierce: false, ...o });
    this.hitIds = new Set();
    this.trail = [];
  }
  update(dt, battle) {
    this.t += dt;
    if (this.t >= this.life) { this.explode(battle); return; }
    const foe = foeOf(this.user);
    if (this.homing > 0 && foe && !foe.dead) {
      const c = foe.center();
      const want = Math.atan2(c.y - this.y, c.x - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      let d = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
      const turn = clamp(d, -this.homing * dt, this.homing * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(cur + turn) * sp;
      this.vy = Math.sin(cur + turn) * sp;
    }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.pop();

    if (foe && !foe.dead && !this.hitIds.has(foe.id)) {
      const b = foe.bodyRect();
      const cx = clamp(this.x, b.x, b.x + b.w);
      const cy = clamp(this.y, b.y, b.y + b.h);
      if (dist(this.x, this.y, cx, cy) <= this.radius) {
        this.hitIds.add(foe.id);
        this.user.dealDamage(foe, { ...this.hit, kbDir: sign(this.vx) || this.user.facing });
        battle.fx.spark(this.x, this.y, this.color, this.big ? 1.8 : 1);
        battle.fx.stop(this.big ? 0.08 : 0.04);
        if (!this.pierce) { this.explode(battle); return; }
      }
    }
    if (this.x < WORLD.left - 120 || this.x > WORLD.right + 120 || this.y > WORLD.ground + 60 || this.y < -200) {
      this.explode(battle);
    }
  }
  explode(battle) {
    if (this.dead) return;
    this.dead = true;
    if (this.boom) {
      hitCircle(this.user, this.x, this.y, this.boom, { ...this.hit, dmg: this.hit.dmg * 0.6 });
      battle.fx.ring(this.x, this.y, this.color, { r0: 10, r1: this.boom * 1.4, life: 0.3, width: 5 });
    }
    battle.fx.burst(this.x, this.y, this.color, { count: this.big ? 26 : 12, speed: 320, shape: 'hex', life: 0.5 });
    if (this.big) battle.fx.quake(8, 0.2);
  }
  draw(ctx) {
    const c = this.color;
    // 尾跡
    if (this.trail.length > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < this.trail.length; i++) {
        const a = (1 - i / this.trail.length) * 0.5;
        ctx.strokeStyle = withAlpha(c, a);
        ctx.lineWidth = this.radius * (1 - i / this.trail.length) * 1.2;
        ctx.beginPath();
        ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }
    const r = this.radius;
    const ang = Math.atan2(this.vy, this.vx);
    switch (this.shape) {
      case 'crescent':
        glowFill(ctx, crescentPath(this.x, this.y, r * 1.1, ang - 1.1, ang + 1.1, r * 0.5), c, 0.95);
        glowFill(ctx, crescentPath(this.x, this.y, r * 1.1, ang - 0.9, ang + 0.9, r * 0.2), '#ffffff', 0.8);
        break;
      case 'shard':
        glowFill(ctx, polyPath([
          { x: this.x + Math.cos(ang) * r * 1.8, y: this.y + Math.sin(ang) * r * 1.8 },
          { x: this.x + Math.cos(ang + 2.1) * r, y: this.y + Math.sin(ang + 2.1) * r },
          { x: this.x + Math.cos(ang - 2.1) * r, y: this.y + Math.sin(ang - 2.1) * r },
        ]), c, 0.95);
        glowFill(ctx, circlePath(this.x, this.y, r * 0.4), '#ffffff', 0.9);
        break;
      case 'star':
        glowFill(ctx, starPath(this.x, this.y, 5, r * 1.5, r * 0.6, this.t * 6), c, 0.9);
        glowFill(ctx, circlePath(this.x, this.y, r * 0.45), '#ffffff', 0.95);
        break;
      case 'meteor':
        glowFill(ctx, ngonPath(this.x, this.y, r, 6, this.t * 4), c, 0.95);
        glowFill(ctx, circlePath(this.x, this.y, r * 0.5), '#fff27a', 0.9);
        break;
      default:
        glowFill(ctx, circlePath(this.x, this.y, r * 1.5), c, 0.25);
        glowFill(ctx, circlePath(this.x, this.y, r), c, 0.85);
        glowFill(ctx, circlePath(this.x, this.y, r * 0.45), '#ffffff', 0.95);
        neonStroke(ctx, circlePath(this.x, this.y, r * (1.6 + Math.sin(this.t * 14) * 0.12)), c, 2, 1.2);
        break;
    }
  }
}

// ------------------------------------------------------------------ 場域
export class Zone extends Entity {
  constructor(o) {
    super({ layer: 'back', tick: 0.5, tickT: 0, ...o });
  }
  update(dt, battle) {
    this.t += dt;
    if (this.follow && !this.follow.dead) {
      this.x = this.follow.x;
      this.y = this.follow.y - 40;
    }
    if (this.t >= this.life) { this.dead = true; return; }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = this.tick;
      hitCircle(this.user, this.x, this.y, this.radius, this.hit);
    }
    if (this.pull) {
      const foe = foeOf(this.user);
      if (foe && !foe.dead) {
        const c = foe.center();
        const d = dist(this.x, this.y, c.x, c.y);
        if (d < this.radius) {
          foe.vx += sign(this.x - c.x) * this.pull * dt;
          if (this.lift) foe.vy = Math.min(foe.vy, this.lift);
        }
      }
    }
    if (this.push) {
      const foe = foeOf(this.user);
      if (foe && !foe.dead && Math.abs(foe.x - this.x) < this.radius) {
        foe.vx = sign(foe.x - this.x) * this.push;
      }
    }
    if (Math.random() < 0.5) {
      battle.fx.particle({
        x: this.x + rand(-this.radius, this.radius),
        y: this.y + rand(-this.radius * 0.6, this.radius * 0.6),
        vx: rand(-20, 20), vy: -rand(20, 70), g: -40, life: 0.8,
        size: 3.5, color: this.color, shape: 'hex', layer: 'back',
      });
    }
  }
  draw(ctx) {
    const k = this.t / this.life;
    const a = clamp(Math.min(this.t * 4, 1) * (1 - Math.max(0, k - 0.8) * 5), 0, 1);
    if (this.style === 'fire') {
      // 地上的火海：一排翻滾的火舌
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const fx2 = this.x - this.radius + (i / 13) * this.radius * 2;
        const h = 40 + Math.sin(this.t * 9 + i * 1.7) * 26 + Math.sin(this.t * 3 + i) * 14;
        const g = ctx.createLinearGradient(fx2, this.y + 30, fx2, this.y + 30 - h);
        g.addColorStop(0, `rgba(255,220,150,${0.5 * a})`);
        g.addColorStop(0.4, `rgba(255,140,40,${0.42 * a})`);
        g.addColorStop(1, 'rgba(180,40,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(fx2, this.y + 30 - h / 2, 22, h / 2, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = a;
    for (let i = 0; i < 3; i++) {
      const rr = this.radius * (0.55 + i * 0.22);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, 0.55);
      glowFill(ctx, circlePath(0, 0, rr), this.color, 0.1);
      neonStroke(ctx, circlePath(0, 0, rr), this.color, 1.6, 1);
      ctx.restore();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ 地刺
export class SpikeRow extends Entity {
  constructor(o) {
    super({ layer: 'front', life: 1.6, spawned: 0, spikes: [], ...o });
  }
  update(dt, battle) {
    this.t += dt;
    const want = Math.min(this.count, Math.floor(this.t / 0.09) + 1);
    while (this.spawned < want) {
      const i = this.spawned++;
      const x = this.x + this.dir * this.step * (i + 1);
      if (x < WORLD.left || x > WORLD.right) continue;
      this.spikes.push({ x, t: 0, h: this.height * rand(0.85, 1.2) });
      hitCircle(this.user, x, WORLD.ground - 40, 64, this.hit);
      battle.fx.burst(x, WORLD.ground, this.color, { count: 8, speed: 260, dir: -Math.PI / 2, spread: 1.4, shape: 'shard', life: 0.5 });
      battle.fx.quake(4, 0.12);
    }
    for (const s of this.spikes) s.t += dt;
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx) {
    for (const s of this.spikes) {
      const grow = clamp(s.t / 0.12, 0, 1);
      const fade = clamp((this.life - this.t) / 0.4, 0, 1);
      const h = s.h * easeOut(grow) * fade;
      const p = this.style === 'lava'
        ? polyPath([
          { x: s.x - 26, y: WORLD.ground },
          { x: s.x - 10, y: WORLD.ground - h },
          { x: s.x + 6, y: WORLD.ground - h * 0.8 },
          { x: s.x + 24, y: WORLD.ground },
        ])
        : polyPath([
          { x: s.x - 18, y: WORLD.ground },
          { x: s.x, y: WORLD.ground - h },
          { x: s.x + 18, y: WORLD.ground },
        ]);
      glowFill(ctx, p, this.color, 0.55);
      neonStroke(ctx, p, this.color, 2.4, 1.2);
    }
  }
}

// ------------------------------------------------------------------ 光束
export class Beam extends Entity {
  constructor(o) { super({ layer: 'front', life: 0.6, hitDone: false, ...o }); }
  update(dt, battle) {
    this.t += dt;
    if (!this.hitDone && this.t > 0.12) {
      this.hitDone = true;
      const y = this.y;
      const r = this.dir > 0
        ? rect(this.x, y - this.width / 2, WORLD.right - this.x + 100, this.width)
        : rect(WORLD.left - 100, y - this.width / 2, this.x - WORLD.left + 100, this.width);
      hitRect(this.user, r, { ...this.hit, kbDir: this.dir });
      battle.fx.quake(14, 0.35);
      battle.fx.flashScreen(0.28, this.color);
    }
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx) {
    const k = this.t / this.life;
    const grow = clamp(k / 0.2, 0, 1);
    const fade = clamp((1 - k) / 0.4, 0, 1);
    const w = this.width * grow * fade;
    const x2 = this.dir > 0 ? WORLD.right + 100 : WORLD.left - 100;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(this.x, 0, x2, 0);
    grad.addColorStop(0, withAlpha(this.color, 0.95));
    grad.addColorStop(1, withAlpha(this.color, 0.1));
    ctx.fillStyle = grad;
    ctx.fillRect(Math.min(this.x, x2), this.y - w / 2, Math.abs(x2 - this.x), w);
    ctx.fillStyle = withAlpha('#ffffff', 0.9 * fade);
    ctx.fillRect(Math.min(this.x, x2), this.y - w * 0.16, Math.abs(x2 - this.x), w * 0.32);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ 虛影
export class Decoy extends Entity {
  constructor(o) { super({ layer: 'back', life: 3.5, ...o }); }
  update(dt) {
    this.t += dt;
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx, battle) {
    const k = this.t / this.life;
    const a = clamp(Math.min(this.t * 3, 1) * (1 - k) * 0.65, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'lighter';
    battle.paintFighter(ctx, this.snap, this.color);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ 衝擊波
export class Wave extends Entity {
  constructor(o) { super({ layer: 'front', life: 0.9, hitIds: new Set(), ...o }); }
  update(dt, battle) {
    this.t += dt;
    this.x += this.dir * this.speed * dt;
    const foe = foeOf(this.user);
    if (foe && !foe.dead && !this.hitIds.has(foe.id)) {
      if (Math.abs(foe.x - this.x) < 46 && foe.y >= WORLD.ground - 40) {
        this.hitIds.add(foe.id);
        this.user.dealDamage(foe, { ...this.hit, kbDir: this.dir });
        battle.fx.spark(foe.x, foe.y - 40, this.color, 1.5);
      }
    }
    if (this.t >= this.life || this.x < WORLD.left - 80 || this.x > WORLD.right + 80) this.dead = true;
  }
  draw(ctx) {
    const k = this.t / this.life;
    const h = 90 * (1 - k * 0.5);
    const p = polyPath([
      { x: this.x - this.dir * 40, y: WORLD.ground },
      { x: this.x - this.dir * 10, y: WORLD.ground - h },
      { x: this.x + this.dir * 16, y: WORLD.ground - h * 0.7 },
      { x: this.x + this.dir * 40, y: WORLD.ground },
    ]);
    glowFill(ctx, p, this.color, 0.85 * (1 - k));
    neonStroke(ctx, p, '#ffffff', 2 * (1 - k), 1);
  }
}

// ------------------------------------------------------------------ 鉤索
/** 飛出去的抓鉤：帶著一條鎖鏈，勾到人就把人拉回來，沒勾到就收回 */
export class Hook extends Entity {
  constructor(o) {
    super({ layer: 'front', life: 1.2, state: 'out', ...o });
    this.x = o.x; this.y = o.y;
    this.startX = o.x; this.startY = o.y;
  }
  update(dt, battle) {
    this.t += dt;
    const user = this.user;
    if (!user || user.dead) { this.dead = true; return; }
    const hand = { x: user.x + user.facing * 30, y: user.y - 62 };

    if (this.state === 'out') {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const foe = foeOf(user);
      if (foe && !foe.dead) {
        const b = foe.bodyRect();
        if (this.x > b.x - 12 && this.x < b.x + b.w + 12 && this.y > b.y - 12 && this.y < b.y + b.h + 12) {
          this.state = 'caught';
          this.caught = foe;
          user.dealDamage(foe, { dmg: this.dmg, kbx: 0, kby: 0, hitstun: 0.5, shock: this.stun || 0 });
          foe.marked = 3;                       // 鉤索的被動：被標記的人吃更多傷害
          battle.fx.spark(this.x, this.y, '#d8ffe8', 1.2, WORLD.ground);
          battle.audio.play('hit');
          return;
        }
      }
      const dist2 = Math.hypot(this.x - this.startX, this.y - this.startY);
      if (dist2 > this.range || this.x < WORLD.left || this.x > WORLD.right) {
        if (this.mode === 'zip') {
          // 沒勾到人就勾牆：把自己拉過去
          this.state = 'zip';
          this.anchor = { x: this.x, y: this.y };
        } else {
          this.state = 'back';
        }
      }
    } else if (this.state === 'caught') {
      // 把對手拉到面前
      const foe = this.caught;
      if (!foe || foe.dead) { this.dead = true; return; }
      const target = user.x + user.facing * 62;
      foe.x += (target - foe.x) * Math.min(1, dt * 12);
      foe.vy = Math.min(foe.vy, -60);
      foe.hitstun = Math.max(foe.hitstun, 0.18);
      this.x = foe.x; this.y = foe.y - 60;
      if (Math.abs(foe.x - target) < 26 || this.t > 0.8) {
        user.dealDamage(foe, { dmg: this.dmg * 0.6, kbx: 60, kby: -180, hitstun: 0.35, big: true });
        battle.fx.spark(foe.x, foe.y - 50, this.color, 1.4, WORLD.ground);
        battle.fx.stop(0.06);
        this.dead = true;
      }
    } else if (this.state === 'zip') {
      // 把自己拉向鉤點
      const a = this.anchor;
      user.x += (a.x - user.x) * Math.min(1, dt * 9);
      user.y += (a.y + 40 - user.y) * Math.min(1, dt * 7);
      user.vy = 0;
      user.lock = Math.max(user.lock, 0.1);
      if (this.t % 0.05 < dt) battle.fx.afterimage((c, col) => user.paint(c, col), this.color, 0.2);
      const foe = foeOf(user);
      if (foe && !foe.dead && overlaps(user.bodyRect(), foe.bodyRect())) {
        user.dealDamage(foe, { dmg: this.dmg, kbx: this.kbx, kby: this.kby, hitstun: 0.35, big: true, kbDir: user.facing });
        battle.fx.spark(foe.x, foe.y - 50, this.color, 1.5, WORLD.ground);
        battle.fx.stop(0.07);
        this.dead = true;
        return;
      }
      if (Math.abs(a.x - user.x) < 40 || this.t > 0.9) {
        this.dead = true;
        user.lock = 0;
      }
    } else {
      // 收回
      this.x += (hand.x - this.x) * Math.min(1, dt * 14);
      this.y += (hand.y - this.y) * Math.min(1, dt * 14);
      if (Math.hypot(hand.x - this.x, hand.y - this.y) < 18) this.dead = true;
    }
  }
  draw(ctx) {
    const user = this.user;
    if (!user) return;
    const hand = { x: user.x + user.facing * 30, y: user.y - 62 };
    // 鎖鏈
    ctx.save();
    ctx.strokeStyle = '#8b939f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hand.x, hand.y);
    const midX = (hand.x + this.x) / 2;
    const midY = (hand.y + this.y) / 2 + 10;
    ctx.quadraticCurveTo(midX, midY, this.x, this.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 鉤頭
    const a = Math.atan2(this.vy, this.vx);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.state === 'back' ? a + Math.PI : a);
    ctx.fillStyle = '#b8c0cc';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ 招式派送
export function runSkill(kind, user, params, info = {}) {
  const battle = user.battle;
  if (!battle) return;
  const fx = battle.fx;
  const c = user.char.color;
  const ac = user.char.accent;
  const foe = foeOf(user);
  const face = user.facing;
  const isUlt = !!params.ult || !!info.ult;

  // 必殺一律有開場演出
  if (isUlt) {
    // 必殺起手：腳下塵土炸開、碎石彈起、畫面壓一下
    fx.flashScreen(0.22, '#ffe6c0');
    fx.dustRing(user.x, WORLD.ground, { r: 220, life: 0.7 });
    fx.debris(user.x, WORLD.ground, { count: 16, color: '#4a443c', speed: 520, groundY: WORLD.ground });
    fx.smoke(user.x, WORLD.ground - 20, { count: 8, color: '#6f675e', r: 24, rise: 110, life: 1.3 });
    fx.quake(12, 0.5);
    user.setPose('ult', 0.5);
    user.invuln = Math.max(user.invuln, 0.35);
  } else {
    user.setPose('cast', 0.32);
  }

  switch (kind) {
    // ---------------------------------------------------------- 突進
    case 'dashStrike': {
      const dur = params.dur || 0.22;
      user.lock = dur + 0.08;
      user.invuln = Math.max(user.invuln, params.armor ? 0 : dur * 0.7);
      if (params.armor) user.armor = Math.max(user.armor, params.armor);
      user.setPose('dash', dur + 0.1);
      const from = user.x;
      const target = clamp(from + face * params.dist, WORLD.left + 30, WORLD.right - 30);
      const hitIds = new Set();
      battle.spawn(new Routine({
        life: dur,
        step: (dt, self) => {
          const k = clamp(self.t / dur, 0, 1);
          user.x = from + (target - from) * easeOut(k, 1.6);
          user.vy = Math.min(user.vy, 0);
          if (self.t % 0.04 < dt) fx.afterimage((cx, col) => user.paint(cx, col), c, 0.24);
          const f = foeOf(user);
          if (f && !f.dead && !hitIds.has(f.id) && overlaps(user.bodyRect(), f.bodyRect())) {
            hitIds.add(f.id);
            user.dealDamage(f, {
              dmg: params.dmg, kbx: params.kbx, kby: params.kby,
              hitstun: 0.3, shock: params.stun || 0, big: true,
              slow: params.slow, slowMul: 0.65, kbDir: face,
            });
            fx.spark(f.x, f.y - 50, c, 1.6);
            fx.stop(0.07);
            if (params.carry) f.vx = face * 420;
          }
        },
        finish: () => { user.vx = face * 160; },
      }));
      fx.rays(user.x, user.y - 50, c, 8, 90, 0.25);
      break;
    }

    // ---------------------------------------------------------- 周身爆發
    case 'burst': {
      user.lock = 0.24;
      const cx = user.x, cy = user.y - 50;
      hitCircle(user, cx, cy, params.radius, {
        dmg: params.dmg, kbx: params.kbx, kby: params.kby,
        hitstun: 0.34, shock: params.stun || 0, big: true,
      });
      fx.ring(cx, cy, c, { r0: 12, r1: params.radius * 1.3, life: 0.36, width: 6 });
      fx.burst(cx, cy, ac, { count: 26, speed: 420, shape: 'hex', life: 0.5, g: 200 });
      fx.quake(9, 0.25);
      for (let i = 0; i < 6; i++) {
        const a = (TAU * i) / 6 + rand(0.4);
        fx.effect({
          life: 0.3, layer: 'front',
          draw: (ctx, k) => {
            neonStroke(ctx, joltPath(cx, cy, cx + Math.cos(a) * params.radius, cy + Math.sin(a) * params.radius, 6, 12), ac, 2.4 * (1 - k), 1.4);
          },
        });
      }
      break;
    }

    // ---------------------------------------------------------- 彈道
    case 'projectile': {
      user.lock = isUlt ? 0.45 : 0.22;
      const big = !!params.big;
      const r = params.radius || (big ? 34 : 18);
      const spawn = () => {
        const p = new Projectile({
          user, color: c, big,
          x: user.x + face * 46, y: user.y - 58,
          vx: face * params.speed, vy: params.vy || 0,
          gravity: params.gravity || 0,
          life: params.life || 1.6,
          radius: r, shape: params.shape || 'orb',
          homing: params.homing || 0,
          pierce: !!params.pierce,
          boom: params.boom || (big ? 110 : 0),
          hit: {
            dmg: params.dmg, kbx: params.kbx, kby: params.kby,
            hitstun: big ? 0.5 : 0.3, burn: params.burn, freeze: params.freeze,
            poison: params.poison, big,
          },
        });
        battle.spawn(p);
        fx.burst(p.x, p.y, c, { count: 10, speed: 200, dir: face > 0 ? 0 : Math.PI, spread: 1.2, life: 0.3 });
      };
      if (isUlt) {
        // 必殺的彈道會先蓄力
        battle.spawn(new Routine({
          life: 0.35,
          step: (dt, self) => {
            fx.particle({
              x: user.x + face * 60 + rand(-60, 60), y: user.y - 60 + rand(-50, 50),
              vx: 0, vy: 0, g: 0, life: 0.2, size: 4, color: ac, shape: 'hex',
            });
          },
          finish: spawn,
        }));
        user.lock = 0.5;
      } else spawn();
      break;
    }

    // ---------------------------------------------------------- 昇龍
    case 'uppercut': {
      user.lock = 0.34;
      user.vy = -params.rise;
      user.onGround = false;
      user.armor = Math.max(user.armor, params.armor || 0.3);
      user.setPose('uppercut', 0.5);
      const hitIds = new Set();
      battle.spawn(new Routine({
        life: 0.3,
        step: (dt, self) => {
          const r = rect(user.x + (face > 0 ? 0 : -80), user.y - 130, 80, 130);
          const f = foeOf(user);
          if (f && !f.dead && !hitIds.has(f.id) && overlaps(r, f.bodyRect())) {
            hitIds.add(f.id);
            user.dealDamage(f, {
              dmg: params.dmg, kbx: params.kbx, kby: params.kby,
              hitstun: 0.45, burn: params.burn, big: true, kbDir: face,
            });
            fx.stop(0.09);
            fx.quake(10, 0.25);
          }
          if (self.t % 0.05 < dt) {
            fx.slash(user.x + face * 20, user.y - 70, ac, {
              r: 70, width: 18, a0: face > 0 ? -2.2 : Math.PI + 2.2, a1: face > 0 ? -0.2 : Math.PI + 0.2, life: 0.24,
            });
          }
        },
      }));
      fx.burst(user.x, user.y, ac, { count: 18, speed: 300, dir: -Math.PI / 2, spread: 1.6, life: 0.5, shape: 'shard' });
      break;
    }

    // ---------------------------------------------------------- 護盾／架勢
    case 'ward': {
      user.dr = params.dr;
      user.drTime = params.dur;
      if (params.armor) user.armor = Math.max(user.armor, params.armor);
      user.setPose('guard', 0.4);
      if (params.radius) {
        battle.spawn(new Zone({
          user, x: user.x, y: user.y - 40, radius: params.radius, life: params.dur,
          follow: user, color: c, tick: 0.4, push: params.push,
          hit: { dmg: 0 },
        }));
      }
      fx.ring(user.x, user.y - 50, ac, { r0: 20, r1: 120, life: 0.4, width: 5 });
      break;
    }

    // ---------------------------------------------------------- 光束
    case 'beam': {
      user.lock = 0.55;
      user.setPose('cast', 0.55);
      battle.spawn(new Routine({
        life: 0.22,
        step: () => {
          fx.particle({
            x: user.x + face * 70 + rand(-30, 30), y: user.y - 58 + rand(-30, 30),
            vx: -face * 200, vy: 0, g: 0, life: 0.2, size: 4, color: ac, shape: 'shard',
          });
        },
        finish: () => {
          battle.spawn(new Beam({
            user, color: c, x: user.x + face * 40, y: user.y - 58,
            dir: face, width: params.width, life: params.dur + 0.3,
            hit: { dmg: params.dmg, kbx: params.kbx, kby: params.kby, hitstun: 0.5, big: true },
          }));
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 迴旋刃
    case 'boomerang': {
      user.lock = 0.22;
      const start = { x: user.x + face * 40, y: user.y - 60 };
      const p = new Projectile({
        user, color: c, x: start.x, y: start.y,
        vx: face * params.speed, vy: 0, life: 2.2, radius: 20, shape: 'shard',
        pierce: true,
        hit: { dmg: params.dmg, kbx: params.kbx, kby: params.kby, hitstun: 0.24 },
      });
      // 去程到底後轉頭飛回來，回程會再打中一次
      const range = params.range;
      p.update = function (dt, b) {
        this.t += dt;
        if (this.t >= this.life) { this.dead = true; return; }
        const travelled = (this.x - start.x) * face;
        if (travelled > range) { this.vx = -face * params.speed * 1.1; this.hitIds.clear(); }
        if (this.vx * face < 0 && (this.x - user.x) * face < -20) { this.dead = true; return; }
        this.x += this.vx * dt;
        this.y = start.y + Math.sin(this.t * 10) * 10;
        this.rot = this.t * 18;
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > 8) this.trail.pop();
        const f = foeOf(this.user);
        if (f && !f.dead && !this.hitIds.has(f.id)) {
          const bb = f.bodyRect();
          const cx = clamp(this.x, bb.x, bb.x + bb.w);
          const cy = clamp(this.y, bb.y, bb.y + bb.h);
          if (dist(this.x, this.y, cx, cy) <= this.radius) {
            this.hitIds.add(f.id);
            this.user.dealDamage(f, { ...this.hit, kbDir: sign(this.vx) });
            b.fx.spark(this.x, this.y, this.color, 1);
          }
        }
      };
      p.draw = function (ctx) {
        for (let i = 0; i < 3; i++) {
          const a = this.rot + (TAU * i) / 3;
          glowFill(ctx, crescentPath(this.x, this.y, 22, a - 0.7, a + 0.7, 7), this.color, 0.9);
        }
        glowFill(ctx, circlePath(this.x, this.y, 6), '#ffffff', 0.9);
      };
      battle.spawn(p);
      break;
    }

    // ---------------------------------------------------------- 俯衝踢
    case 'divekick': {
      user.lock = 0.5;
      user.setPose('dive', 0.7);
      if (user.onGround) { user.vy = -420; user.onGround = false; }
      const hitIds = new Set();
      battle.spawn(new Routine({
        life: 1.0,
        step: (dt, self) => {
          user.vy = Math.max(user.vy, params.speed * 0.7);
          user.vx = face * params.speed * 0.42;
          if (self.t % 0.04 < dt) fx.afterimage((cx, col) => user.paint(cx, col), c, 0.2);
          const f = foeOf(user);
          if (f && !f.dead && !hitIds.has(f.id) && overlaps(user.bodyRect(), f.bodyRect())) {
            hitIds.add(f.id);
            user.dealDamage(f, { dmg: params.dmg, kbx: params.kbx, kby: params.kby, hitstun: 0.32, big: true, kbDir: face });
            fx.stop(0.07);
          }
          if (user.onGround) {
            self.dead = true;
            user.lock = 0.16;
            fx.ring(user.x, user.y, c, { r0: 10, r1: params.quake * 1.6, life: 0.3, width: 5, squash: 0.35 });
            fx.quake(12, 0.3);
            hitCircle(user, user.x, user.y - 20, params.quake, {
              dmg: params.dmg * 0.6, kbx: 260, kby: -300, hitstun: 0.3,
            });
            battle.audio.play('land');
          }
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 龍捲
    case 'vortex': {
      user.lock = 0.4;
      battle.spawn(new Zone({
        user, x: user.x + face * 90, y: user.y - 70, radius: params.radius,
        life: params.dur, color: c, tick: params.interval, pull: params.pull, lift: -120,
        hit: { dmg: params.dmg, kbx: 40, kby: -60, hitstun: 0.1 },
      }));
      for (let i = 0; i < 5; i++) {
        fx.effect({
          life: params.dur, layer: 'front',
          draw: (ctx, k) => {
            const a = k * 14 + i;
            const rr = params.radius * (0.3 + 0.6 * ((i + 1) / 5));
            ctx.save();
            ctx.translate(user.x + face * 90, user.y - 70);
            ctx.scale(1, 1.25);
            neonStroke(ctx, crescentPath(0, 0, rr, a, a + 2.4, 8 * (1 - k * 0.4)), i % 2 ? ac : c, 2, 1.2);
            ctx.restore();
          },
        });
      }
      fx.quake(6, params.dur);
      break;
    }

    // ---------------------------------------------------------- 地刺
    case 'spikes': {
      user.lock = 0.3;
      battle.spawn(new SpikeRow({
        user, color: c, x: user.x, dir: face, step: params.step, count: params.count,
        height: params.style === 'lava' ? 120 : 150, style: params.style,
        life: 1.4,
        hit: {
          dmg: params.dmg, kbx: 120, kby: params.kby, hitstun: 0.4,
          freeze: params.freeze, burn: params.burn, big: true, kbDir: face,
        },
      }));
      fx.quake(6, 0.2);
      break;
    }

    // ---------------------------------------------------------- 全場凍結
    case 'fieldFreeze': {
      user.lock = 0.6;
      fx.flashScreen(0.5, '#9be8ff');
      fx.quake(16, 0.5);
      for (let i = 0; i < 14; i++) {
        const x = rand(WORLD.left, WORLD.right);
        fx.effect({
          life: 0.9, layer: 'back',
          draw: (ctx, k) => {
            const h = 220 * easeOut(clamp(k * 2, 0, 1)) * (1 - Math.max(0, k - 0.7) * 3);
            const p = polyPath([
              { x: x - 26, y: WORLD.ground }, { x, y: WORLD.ground - h }, { x: x + 26, y: WORLD.ground },
            ]);
            glowFill(ctx, p, '#9be8ff', 0.4);
            neonStroke(ctx, p, '#ffffff', 2, 1.2);
          },
        });
      }
      if (foe && !foe.dead) {
        user.dealDamage(foe, {
          dmg: params.dmg, kbx: params.kbx, kby: params.kby,
          hitstun: 0.6, freeze: params.freeze, big: true,
        });
      }
      break;
    }

    // ---------------------------------------------------------- 場域
    case 'zone': {
      user.lock = isUlt ? 0.5 : 0.26;
      battle.spawn(new Zone({
        user, x: user.x, y: user.y - 40, radius: params.radius, life: params.dur,
        color: c, tick: params.tick, follow: params.follow ? user : null,
        hit: {
          dmg: params.dmg, kbx: 0, kby: 0, hitstun: 0,
          poison: params.poison, slow: 0.8, slowMul: params.slow,
        },
      }));
      fx.ring(user.x, user.y - 30, c, { r0: 10, r1: params.radius, life: 0.5, width: 4, squash: 0.45 });
      break;
    }

    // ---------------------------------------------------------- 連斬
    case 'rushCombo': {
      const hits = params.hits;
      const step = 0.1;
      user.lock = hits * step + 0.3;
      user.invuln = Math.max(user.invuln, isUlt ? hits * step : 0.1);
      const from = user.x;
      const targetX = foe ? foe.x - face * 60 : from + face * params.dash;
      const target = clamp(targetX, WORLD.left + 30, WORLD.right - 30);
      battle.spawn(new Routine({
        life: hits * step + 0.2,
        step: (dt, self) => {
          const k = clamp(self.t / 0.16, 0, 1);
          if (self.t < 0.16) user.x = from + (target - from) * easeOut(k);
          const idx = Math.floor(self.t / step);
          if (idx !== self.lastIdx && idx < hits && self.t >= 0.12) {
            self.lastIdx = idx;
            user.setPose(idx % 2 ? 'light2' : 'light1', step);
            const f = foeOf(user);
            if (f && !f.dead && Math.abs(f.x - user.x) < 130) {
              user.dealDamage(f, {
                dmg: params.dmg, kbx: 40, kby: -40, hitstun: 0.12,
                poison: params.poison, burn: params.burn, kbDir: face,
              });
              fx.slash(f.x, f.y - 56, ac, {
                r: 60, width: 12, a0: rand(-3, 3), a1: rand(-3, 3) + 2, life: 0.18,
              });
              fx.stop(0.03);
            }
          }
        },
        finish: () => {
          const f = foeOf(user);
          if (f && !f.dead && Math.abs(f.x - user.x) < 150) {
            user.dealDamage(f, {
              dmg: params.finishDmg, kbx: 520, kby: -360, hitstun: 0.5,
              burn: params.burn, poison: params.poison, big: true, kbDir: face,
            });
            fx.spark(f.x, f.y - 50, ac, 2);
            fx.quake(12, 0.3);
            fx.stop(0.1);
          }
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 砸地
    case 'slam': {
      user.lock = 0.5;
      user.setPose('heavy', 0.55);
      user.armor = Math.max(user.armor, 0.4);
      battle.spawn(new Routine({
        life: 0.26,
        finish: () => {
          hitCircle(user, user.x + face * 40, user.y - 20, params.radius * 0.5, {
            dmg: params.dmg, kbx: params.kbx, kby: params.kby, hitstun: 0.45,
            burn: params.burn, big: true, kbDir: face,
          });
          battle.spawn(new Wave({
            user, color: c, x: user.x + face * 50, dir: face, speed: 620, life: 0.8,
            hit: { dmg: params.dmg * 0.7, kbx: params.kbx * 0.8, kby: params.kby * 0.7, hitstun: 0.35, burn: params.burn },
          }));
          fx.ring(user.x + face * 30, WORLD.ground, c, { r0: 10, r1: params.radius, life: 0.4, width: 7, squash: 0.3 });
          fx.burst(user.x + face * 40, WORLD.ground, ac, { count: 24, speed: 420, dir: -Math.PI / 2, spread: 2, shape: 'shard', life: 0.6 });
          fx.quake(params.quake / 8, 0.4);
          fx.stop(0.08);
          battle.audio.play('slam');
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 天降
    case 'rain': {
      user.lock = 0.5;
      const cx = foe ? foe.x : user.x + face * 200;
      battle.spawn(new Routine({
        life: params.count * params.interval + 0.2,
        step: (dt, self) => {
          const idx = Math.floor(self.t / params.interval);
          if (idx !== self.lastIdx && idx < params.count) {
            self.lastIdx = idx;
            const x = clamp(cx + rand(-260, 260), WORLD.left + 40, WORLD.right - 40);
            battle.spawn(new Projectile({
              user, color: c, x, y: -60, vx: rand(-40, 40), vy: 520,
              gravity: 900, life: 2.4, radius: 20, shape: 'meteor',
              boom: params.radius,
              hit: { dmg: params.dmg, kbx: 200, kby: -380, hitstun: 0.3, burn: params.burn, big: true },
            }));
          }
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 引力井
    case 'gravity': {
      user.lock = 0.35;
      const gx = foe ? foe.x : user.x + face * 220;
      const gy = WORLD.ground - 150;
      battle.spawn(new Zone({
        user, x: gx, y: gy, radius: params.radius, life: params.dur,
        color: c, tick: 0.3, pull: params.pull, lift: params.lift,
        hit: { dmg: params.dmg * 0.34, kbx: 0, kby: 0, hitstun: 0.08 },
      }));
      fx.effect({
        life: params.dur, layer: 'back',
        draw: (ctx, k) => {
          for (let i = 0; i < 4; i++) {
            const rr = params.radius * (1 - k) * (0.4 + i * 0.2);
            neonStroke(ctx, circlePath(gx, gy, rr), i % 2 ? ac : c, 2, 1.2);
          }
        },
      });
      break;
    }

    // ---------------------------------------------------------- 超新星
    case 'supernova': {
      user.lock = params.charge + 0.35;
      const cx = user.x + face * 150, cy = user.y - 90;
      battle.spawn(new Routine({
        life: params.charge,
        step: (dt, self) => {
          const k = self.t / params.charge;
          fx.particle({
            x: cx + rand(-260, 260), y: cy + rand(-200, 200),
            vx: 0, vy: 0, g: 0, life: 0.22, size: 4 + k * 4, color: ac, shape: 'hex',
          });
        },
        finish: () => {
          hitCircle(user, cx, cy, params.radius, {
            dmg: params.dmg, kbx: params.kbx, kby: params.kby, hitstun: 0.6, big: true,
          });
          fx.ring(cx, cy, ac, { r0: 20, r1: params.radius * 1.2, life: 0.5, width: 10 });
          fx.ring(cx, cy, '#ffffff', { r0: 10, r1: params.radius * 0.8, life: 0.35, width: 6 });
          fx.burst(cx, cy, c, { count: 46, speed: 620, shape: 'hex', life: 0.8, g: 100 });
          fx.flashScreen(0.6, '#ffffff');
          fx.quake(22, 0.6);
          fx.stop(0.12);
          battle.audio.play('boom');
        },
      }));
      fx.effect({
        life: params.charge, layer: 'front',
        draw: (ctx, k) => {
          glowFill(ctx, circlePath(cx, cy, 20 + 40 * k), c, 0.5 + 0.4 * k);
          glowFill(ctx, circlePath(cx, cy, (20 + 40 * k) * 0.4), '#ffffff', 0.9);
        },
      });
      break;
    }

    // ---------------------------------------------------------- 瞬移斬
    case 'blink': {
      user.lock = 0.3;
      const f = foe;
      fx.afterimage((cx, col) => user.paint(cx, col), c, 0.3);
      fx.burst(user.x, user.y - 50, c, { count: 16, speed: 260, shape: 'hex', life: 0.4 });
      if (f && !f.dead) {
        const behind = -f.facing;
        user.x = clamp(f.x + behind * params.offset, WORLD.left + 30, WORLD.right - 30);
        user.y = f.y;
        user.facing = sign(f.x - user.x) || user.facing;
        user.vy = 0;
        const backstab = behind === -f.facing;
        user.dealDamage(f, {
          dmg: params.dmg * (backstab ? params.backstab : 1),
          kbx: params.kbx, kby: params.kby, hitstun: 0.45, big: true, kbDir: user.facing,
        });
        fx.slash(f.x, f.y - 56, ac, { r: 84, width: 18, a0: -1.4, a1: 1.4, life: 0.24 });
        fx.slash(f.x, f.y - 56, c, { r: 76, width: 14, a0: 1.4, a1: -1.4, life: 0.26 });
        fx.stop(0.1);
        fx.quake(10, 0.28);
      } else {
        user.x = clamp(user.x + face * 180, WORLD.left + 30, WORLD.right - 30);
      }
      fx.burst(user.x, user.y - 50, ac, { count: 18, speed: 320, shape: 'hex', life: 0.45 });
      user.setPose('light3', 0.3);
      break;
    }

    // ---------------------------------------------------------- 虛影
    case 'decoy': {
      user.lock = 0.2;
      user.dr = Math.max(user.dr, params.dr);
      user.drTime = Math.max(user.drTime, params.dur);
      battle.spawn(new Decoy({
        user, color: c, life: params.dur,
        snap: {
          char: user.char, x: user.x, y: user.y, facing: user.facing,
          pose: 'idle', poseK: 0, phase: user.phase, animTime: user.animTime,
        },
      }));
      user.x = clamp(user.x - face * 90, WORLD.left + 30, WORLD.right - 30);
      fx.burst(user.x, user.y - 50, c, { count: 14, speed: 240, shape: 'hex', life: 0.4 });
      break;
    }

    // ---------------------------------------------------------- 連打
    case 'flurry': {
      const n = params.hits;
      const step = params.interval;
      user.lock = n * step + 0.35;
      user.invuln = Math.max(user.invuln, n * step + 0.2);
      const f = foe;
      if (f && !f.dead) {
        user.x = clamp(f.x - user.facing * 70, WORLD.left + 30, WORLD.right - 30);
        user.facing = sign(f.x - user.x) || user.facing;
      }
      battle.spawn(new Routine({
        life: n * step + 0.25,
        step: (dt, self) => {
          const idx = Math.floor(self.t / step);
          if (idx === self.lastIdx || idx >= n) return;
          self.lastIdx = idx;
          const t2 = foeOf(user);
          if (!t2 || t2.dead) return;
          if (params.teleport) {
            const s = idx % 2 ? 1 : -1;
            user.x = clamp(t2.x + s * 60, WORLD.left + 30, WORLD.right - 30);
            user.facing = -s;
            fx.afterimage((cx, col) => user.paint(cx, col), c, 0.22);
          }
          user.setPose(idx % 2 ? 'light1' : 'light2', step);
          user.dealDamage(t2, {
            dmg: params.dmg, kbx: 30, kby: -30, hitstun: 0.1,
            shock: params.stun || 0, kbDir: user.facing,
          });
          fx.spark(t2.x + rand(-20, 20), t2.y - 50 + rand(-20, 20), idx % 2 ? c : ac, 1);
          fx.stop(0.02);
        },
        finish: () => {
          const t2 = foeOf(user);
          if (t2 && !t2.dead) {
            user.dealDamage(t2, {
              dmg: params.dmg * 2.4, kbx: params.finishKb, kby: -420,
              hitstun: 0.6, big: true, kbDir: user.facing,
            });
            fx.spark(t2.x, t2.y - 50, ac, 2.4);
            fx.rays(t2.x, t2.y - 50, ac, 14, 160, 0.35);
            fx.quake(16, 0.4);
            fx.stop(0.12);
            fx.flashScreen(0.35, '#ffffff');
          }
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 鉤索擒拿
    case 'grapple': {
      user.lock = 0.3;
      user.setPose('cast', 0.3);
      battle.spawn(new Hook({
        user, color: c, mode: 'pull',
        x: user.x + face * 32, y: user.y - 62,
        vx: face * params.speed, vy: 0,
        range: params.range, dmg: params.dmg, stun: params.stun,
      }));
      fx.sparks(user.x + face * 34, user.y - 62, { count: 6, color: '#cfe8ff', speed: 200, dir: face > 0 ? 0 : Math.PI, spread: 1 });
      break;
    }

    // ---------------------------------------------------------- 飛索突進
    case 'zipline': {
      user.lock = 0.9;
      user.setPose('dash', 0.9);
      user.invuln = Math.max(user.invuln, 0.2);
      battle.spawn(new Hook({
        user, color: c, mode: 'zip',
        x: user.x + face * 32, y: user.y - 70,
        vx: face * params.speed, vy: -120,
        range: params.range, dmg: params.dmg, kbx: params.kbx, kby: params.kby,
      }));
      break;
    }

    // ---------------------------------------------------------- 持續切割（鏈鋸）
    case 'sustained': {
      const dur = params.dur;
      user.lock = dur + 0.15;
      user.setPose(params.spin ? 'light3' : 'heavy', dur + 0.2);
      if (params.spin) user.armor = Math.max(user.armor, dur);
      battle.spawn(new Routine({
        life: dur,
        step: (dt, self) => {
          // 鋸的時候可以緩慢推進
          if (params.move) user.vx = face * params.move;
          self.tick = (self.tick || 0) - dt;
          const f2 = foeOf(user);
          const cx = params.spin ? user.x : user.x + face * params.reach * 0.6;
          const cy = user.y - 56;
          if (params.pull && f2 && !f2.dead) {
            const d = Math.abs(f2.x - cx);
            if (d < params.reach * 1.6) f2.vx += sign(cx - f2.x) * params.pull * dt;
          }
          if (self.tick <= 0) {
            self.tick = params.tick;
            const hit = hitCircle(user, cx, cy, params.reach, {
              dmg: params.dmg, kbx: params.spin ? 120 : 40, kby: -40,
              hitstun: 0.1, bleed: params.bleed, kbDir: face,
            });
            if (hit) {
              const f3 = foeOf(user);
              fx.sparks(f3.x, f3.y - 52, { count: 8, color: '#ffd9a0', speed: 420, dir: -Math.PI / 2 + face * 0.6, spread: 1.4, groundY: WORLD.ground });
              fx.stop(0.02);
            }
          }
          // 鋸齒噴出的火花與煙
          if (Math.random() < 0.55) {
            fx.sparks(cx + rand(-20, 20), cy + rand(-16, 16), {
              count: 2, color: '#ffe9c0', speed: 360, dir: face > 0 ? -0.6 : Math.PI + 0.6, spread: 1.2, groundY: WORLD.ground,
            });
          }
          if (Math.random() < 0.12) fx.smoke(cx, cy, { count: 1, color: '#6d6a66', r: 10, rise: 60, life: 0.6 });
          if (params.spin && self.t % 0.06 < dt) {
            fx.afterimage((cc, col) => user.paint(cc, col), c, 0.2);
          }
        },
        finish: () => { user.vx *= 0.3; },
      }));
      battle.audio.play('skill');
      break;
    }

    // ---------------------------------------------------------- 鎖鏈鐮迴旋
    case 'chainSwing': {
      const turns = params.turns || 2;
      const dur = 0.22 * turns + 0.2;
      user.lock = dur;
      user.armor = Math.max(user.armor, dur * 0.7);
      user.setPose('light3', dur);
      const hitIds = new Set();
      battle.spawn(new Routine({
        life: dur,
        step: (dt, self) => {
          const a = self.t / dur * Math.PI * 2 * turns;
          const px = user.x + Math.cos(a) * params.radius;
          const py = user.y - 60 + Math.sin(a) * params.radius * 0.72;
          self.pts = self.pts || [];
          self.pts.push({ x: px, y: py });
          if (self.pts.length > 12) self.pts.shift();
          const f2 = foeOf(user);
          if (f2 && !f2.dead) {
            const b = f2.bodyRect();
            const inside = px > b.x - 14 && px < b.x + b.w + 14 && py > b.y - 14 && py < b.y + b.h + 14;
            const key = Math.floor(self.t / (dur / turns));
            if (inside && !hitIds.has(key)) {
              hitIds.add(key);
              user.dealDamage(f2, {
                dmg: params.dmg, kbx: params.kbx, kby: params.kby,
                hitstun: 0.3, big: true, kbDir: sign(f2.x - user.x) || face,
              });
              fx.spark(px, py, c, 1.5, WORLD.ground);
              fx.stop(0.05);
              fx.quake(7, 0.2);
            }
          }
          if (self.pts.length > 3 && self.t % 0.05 < dt) {
            fx.weaponTrail(self.pts.slice(), c, 0.22, 20);
          }
        },
      }));
      battle.audio.play('swing');
      break;
    }

    // ---------------------------------------------------------- 蓄力重擊
    case 'charge': {
      const ct = params.charge;
      user.lock = ct + 0.45;
      user.armor = Math.max(user.armor, params.armor || ct);
      user.setPose('charge', ct);
      battle.spawn(new Routine({
        life: ct,
        step: (dt, self) => {
          const k = self.t / ct;
          if (Math.random() < 0.5) {
            fx.particle({
              x: user.x + rand(-40, 40), y: user.y - rand(10, 90),
              vx: rand(-20, 20), vy: -rand(40, 120), g: -40, life: 0.4,
              size: rand(2, 4), color: ac, shape: 'dot', blend: 'add',
            });
          }
          if (self.t % 0.12 < dt) fx.dustRing(user.x, WORLD.ground, { r: 60 + k * 60, life: 0.4 });
        },
        finish: () => {
          user.setPose('heavy', 0.4);
          const cx = user.x + face * 70;
          const cy = user.y - 50;
          const landed = hitCircle(user, cx, cy, params.radius, {
            dmg: params.dmg, kbx: params.kbx, kby: params.kby,
            hitstun: 0.55, big: true, kbDir: face,
          });
          fx.weaponTrail([
            { x: user.x + face * 20, y: user.y - 150 },
            { x: user.x + face * 90, y: user.y - 110 },
            { x: user.x + face * 120, y: user.y - 40 },
            { x: user.x + face * 96, y: user.y - 6 },
          ], ac, 0.3, 30);
          fx.dustRing(user.x + face * 60, WORLD.ground, { r: params.radius * 1.4, life: 0.6 });
          fx.debris(user.x + face * 60, WORLD.ground, { count: 14, color: '#4a4640', speed: 460, groundY: WORLD.ground });
          fx.smoke(user.x + face * 60, WORLD.ground - 10, { count: 6, color: '#7a736a', r: 20, rise: 70, life: 1.2 });
          fx.quake(landed ? 18 : 12, 0.4);
          fx.stop(landed ? 0.12 : 0.05);
          battle.audio.play('slam');
          if (params.wave) {
            battle.spawn(new Wave({
              user, color: ac, x: user.x + face * 90, dir: face, speed: 700, life: 0.8,
              hit: { dmg: params.dmg * 0.5, kbx: 320, kby: -300, hitstun: 0.3 },
            }));
          }
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 橫掃
    case 'sweep': {
      user.lock = 0.42;
      user.setPose('light3', 0.45);
      user.armor = Math.max(user.armor, 0.2);
      const cx = user.x + face * 40, cy = user.y - 56;
      const landed = hitCircle(user, cx, cy, params.radius, {
        dmg: params.dmg, kbx: params.kbx, kby: params.kby, hitstun: 0.45, big: true, kbDir: face,
      });
      const arcPts = [];
      for (let i = 0; i <= 10; i++) {
        const a = -params.arc / 2 + (params.arc * i) / 10;
        arcPts.push({
          x: cx + Math.cos(a) * params.radius * face,
          y: cy + Math.sin(a) * params.radius * 0.6,
        });
      }
      fx.weaponTrail(arcPts, ac, 0.28, 26);
      fx.dustRing(user.x + face * 50, WORLD.ground, { r: params.radius, life: 0.5 });
      fx.quake(landed ? 10 : 5, 0.25);
      if (landed) fx.stop(0.08);
      battle.audio.play('swing');
      break;
    }

    // ---------------------------------------------------------- 噴火
    case 'cone': {
      const dur = params.dur;
      user.lock = dur + 0.1;
      user.setPose('cast', dur + 0.2);
      battle.spawn(new Routine({
        life: dur,
        step: (dt, self) => {
          self.tick = (self.tick || 0) - dt;
          const ox = user.x + face * 34, oy = user.y - 58;
          // 火舌
          for (let i = 0; i < 3; i++) {
            const a = (face > 0 ? 0 : Math.PI) + rand(-params.spread, params.spread);
            const sp = rand(260, 620);
            fx.particle({
              x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
              g: -260, drag: 0.94, life: rand(0.25, 0.5),
              size: rand(8, 18), grow: 46,
              color: i === 0 ? '#ffe9a8' : (i === 1 ? '#ff9a30' : '#ff5a18'),
              shape: 'smoke', blend: 'add',
            });
          }
          if (Math.random() < 0.3) {
            fx.smoke(ox + face * rand(60, 200), oy - rand(0, 40), { count: 1, color: '#3b332c', r: 16, rise: 70, life: 1.1 });
          }
          if (self.tick <= 0) {
            self.tick = params.tick;
            const r = rect(
              face > 0 ? ox : ox - params.range,
              oy - params.range * params.spread,
              params.range, params.range * params.spread * 2
            );
            hitRect(user, r, {
              dmg: params.dmg, kbx: 60, kby: -30, hitstun: 0.08,
              burn: params.burn, kbDir: face,
            });
          }
        },
      }));
      battle.audio.play('skill');
      break;
    }

    // ---------------------------------------------------------- 連續砸地
    case 'quake': {
      user.lock = params.count * params.interval + 0.4;
      user.setPose('heavy', 0.6);
      user.armor = Math.max(user.armor, params.count * params.interval);
      battle.spawn(new Routine({
        life: params.count * params.interval + 0.2,
        step: (dt, self) => {
          const idx = Math.floor(self.t / params.interval);
          if (idx === self.lastIdx || idx >= params.count) return;
          self.lastIdx = idx;
          const x = clamp(user.x + face * params.step * (idx + 1), WORLD.left + 30, WORLD.right - 30);
          hitCircle(user, x, WORLD.ground - 40, 80, {
            dmg: params.dmg, kbx: 200, kby: params.kby, hitstun: 0.35, big: true, kbDir: face,
          });
          fx.dustRing(x, WORLD.ground, { r: 130, life: 0.55 });
          fx.debris(x, WORLD.ground, { count: 12, color: '#4d4740', speed: 520, groundY: WORLD.ground });
          fx.smoke(x, WORLD.ground - 20, { count: 4, color: '#7d766c', r: 22, rise: 90, life: 1.1 });
          fx.effect({
            life: 0.5, layer: 'back',
            draw: (ctx2, k) => {
              const a = 1 - k;
              ctx2.save();
              ctx2.strokeStyle = `rgba(20,16,12,${a})`;
              ctx2.lineWidth = 3;
              ctx2.beginPath();
              ctx2.moveTo(x - 40, WORLD.ground);
              ctx2.lineTo(x - 10, WORLD.ground - 6 - 30 * (1 - a));
              ctx2.lineTo(x + 16, WORLD.ground);
              ctx2.stroke();
              ctx2.restore();
            },
          });
          fx.quake(14, 0.3);
          fx.stop(0.04);
          battle.audio.play('slam');
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 裂地斬
    case 'cleave': {
      user.lock = 0.95;
      user.setPose('charge', 0.35);
      user.vy = -520;
      user.onGround = false;
      user.armor = Math.max(user.armor, 1.0);
      battle.spawn(new Routine({
        life: 0.42,
        step: (dt, self) => {
          if (self.t > 0.2) user.vy = Math.max(user.vy, 900);
        },
        finish: () => {
          user.setPose('heavy', 0.4);
          const gx = user.x + face * 40;
          hitCircle(user, gx, WORLD.ground - 50, params.radius, {
            dmg: params.dmg, kbx: params.kbx, kby: params.kby, hitstun: 0.6, big: true, kbDir: face,
          });
          for (let i = 0; i < params.waves; i++) {
            const d = i % 2 === 0 ? 1 : -1;
            battle.spawn(new Wave({
              user, color: ac, x: gx + d * 40, dir: d, speed: 640 + i * 40, life: 0.9,
              hit: { dmg: params.dmg * 0.35, kbx: 300, kby: -320, hitstun: 0.3 },
            }));
          }
          fx.dustRing(gx, WORLD.ground, { r: params.radius * 1.6, life: 0.7 });
          fx.debris(gx, WORLD.ground, { count: 26, color: '#4a443c', speed: 620, spread: 2.6, groundY: WORLD.ground });
          fx.smoke(gx, WORLD.ground - 20, { count: 10, color: '#6f675e', r: 28, rise: 120, life: 1.5 });
          fx.flashScreen(0.3, '#ffd9a0');
          fx.quake(24, 0.6);
          fx.stop(0.14);
          battle.audio.play('boom');
        },
      }));
      break;
    }

    // ---------------------------------------------------------- 全場貫穿衝刺
    case 'lanceRush': {
      const dur = 0.5;
      user.lock = dur + 0.2;
      user.invuln = Math.max(user.invuln, dur);
      user.armor = Math.max(user.armor, dur);
      user.setPose('dash', dur + 0.1);
      const from = user.x;
      const to = clamp(from + face * 900, WORLD.left + 40, WORLD.right - 40);
      const hitIds = new Set();
      battle.spawn(new Routine({
        life: dur,
        step: (dt, self) => {
          const k = clamp(self.t / dur, 0, 1);
          user.x = from + (to - from) * easeOut(k, 1.4);
          user.vy = 0;
          if (self.t % 0.03 < dt) fx.afterimage((cc, col) => user.paint(cc, col), c, 0.26);
          const f2 = foeOf(user);
          if (f2 && !f2.dead && !hitIds.has(f2.id) && overlaps(user.bodyRect().grow ? user.bodyRect() : user.bodyRect(), f2.bodyRect())) {
            hitIds.add(f2.id);
            user.dealDamage(f2, {
              dmg: params.dmg, kbx: params.kbx, kby: params.kby,
              hitstun: 0.6, big: true, kbDir: face,
            });
            fx.spark(f2.x, f2.y - 50, ac, 2.2, WORLD.ground);
            fx.stop(0.12);
            fx.quake(16, 0.4);
          }
        },
        finish: () => { user.vx = face * 120; },
      }));
      fx.weaponTrail([
        { x: from, y: user.y - 60 }, { x: (from + to) / 2, y: user.y - 60 }, { x: to, y: user.y - 60 },
      ], ac, 0.35, 22);
      break;
    }

    // ---------------------------------------------------------- 火海
    case 'inferno': {
      user.lock = 0.6;
      const zx = user.x + face * 150;
      battle.spawn(new Zone({
        user, x: zx, y: WORLD.ground - 40, radius: params.radius, life: params.dur,
        color: '#ff7a2a', tick: params.tick, style: 'fire',
        hit: { dmg: params.dmg, kbx: 0, kby: 0, hitstun: 0, burn: params.burn },
      }));
      fx.fireBurst(zx, WORLD.ground - 40, { r: params.radius * 0.8, life: 0.8 });
      fx.flashScreen(0.3, '#ff9a3c');
      fx.quake(14, 0.5);
      battle.audio.play('boom');
      break;
    }

    // ---------------------------------------------------------- 收割
    case 'reap': {
      user.lock = 0.5;
      const f2 = foe;
      fx.afterimage((cc, col) => user.paint(cc, col), c, 0.3);
      fx.smoke(user.x, user.y - 50, { count: 6, color: '#2a2438', r: 16, rise: 40, life: 0.6 });
      if (f2 && !f2.dead) {
        const behind = -f2.facing;
        user.x = clamp(f2.x + behind * 66, WORLD.left + 30, WORLD.right - 30);
        user.y = f2.y;
        user.facing = sign(f2.x - user.x) || user.facing;
        user.setPose('heavy', 0.5);
        battle.spawn(new Routine({
          life: 0.22,
          finish: () => {
            const t2 = foeOf(user);
            if (!t2 || t2.dead) return;
            user.dealDamage(t2, {
              dmg: params.dmg * params.backstab, kbx: params.kbx, kby: params.kby,
              hitstun: 0.7, big: true, kbDir: user.facing,
            });
            const cx = t2.x, cy = t2.y - 56;
            fx.weaponTrail([
              { x: cx - user.facing * 120, y: cy - 90 },
              { x: cx, y: cy },
              { x: cx + user.facing * 110, y: cy + 70 },
            ], ac, 0.3, 30);
            fx.spark(cx, cy, ac, 2.4, WORLD.ground);
            fx.flashScreen(0.35, '#ffffff');
            fx.stop(0.16);
            fx.quake(18, 0.45);
            battle.audio.play('hitHeavy');
          },
        }));
      }
      break;
    }

    default:
      break;
  }
}
