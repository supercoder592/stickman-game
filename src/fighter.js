// 戰鬥單位。
//
// 一位 Fighter 不在乎操作是誰給的 —— 鍵盤、AI、還是網路對手，
// 通通只是每幀丟進來的一個 InputFrame，所以單機、雙人同機、連線走的是同一條路。
//
// 傷害的結算集中在兩個函式：
//   dealDamage()    我方打出去（攻擊倍率、角色被動的加成都在這）
//   receiveHit()    對方打進來（閃避、格擋、減傷、擊退、狀態異常都在這）
// 招式與普攻都呼叫這兩支，所以之後加新招不必重寫任何結算邏輯。

import { BASIC, WEAPON_REACH, MAX_METER, knockbackScale } from './combat.js';
import { getChar } from './characters.js';
import { BTN } from './input.js';
import { WORLD } from './render.js';
import { clamp, sign, rect, overlaps, rand, approach } from './util.js';
import { runSkill } from './skills.js';

const GRAVITY = 2400;
const MAX_FALL = 1500;
export const BODY = { w: 44, h: 104 };

let nextId = 1;

export class Fighter {
  constructor(charId, side) {
    this.id = nextId++;
    this.char = getChar(charId);
    this.side = side;                  // 0 = 左邊那位，1 = 右邊那位
    this.team = side;
    this.battle = null;

    const s = this.char.stats;
    this.maxHp = s.hp;
    this.hp = s.hp;
    this.meter = 0;

    this.x = side === 0 ? WORLD.w * 0.34 : WORLD.w * 0.66;
    this.y = WORLD.ground;
    this.vx = 0;
    this.vy = 0;
    this.facing = side === 0 ? 1 : -1;
    this.onGround = true;

    this.pose = 'idle';
    this.poseK = 0;
    this.phase = 0;
    this.animTime = 0;
    this.hitFlash = 0;

    this.attack = null;                // { def, t, hits:Set, key }
    this.comboKey = null;              // 可以接的下一段
    this.comboWindow = 0;
    this.lock = 0;                     // 不能操作的時間（施法、衝刺）
    this.poseLock = null;              // { pose, t, dur }
    this.hitstun = 0;
    this.hitstunMax = 0.2;

    this.invuln = 0;
    this.armor = 0;                    // 霸體
    this.dr = 0;                       // 減傷 0~1
    this.drTime = 0;
    this.guarding = false;

    this.burn = 0; this.burnDps = 0;
    this.freeze = 0;
    this.shockTime = 0;
    this.slow = 0; this.slowMul = 1;
    this.poison = 0; this.poisonTime = 0;
    this.haste = 0;

    this.cds = [0, 0];
    this.dashCd = 0;
    this.airJumps = 0;
    this.airJumpsMax = this.char.passive.name === '輕身' ? 1 : 0;
    this.airDashes = 1;
    this.dead = false;
    this.trailT = 0;
    this.carry = null;                 // 盾衝把人壓著跑
    this.lastHitBy = null;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.wins = 0;
    this.name = this.char.name;
    this.dmgDealt = 0;
    this.maxCombo = 0;
    this.netX = this.x;
    this.netY = this.y;
  }

  // ---------------------------------------------------------------- 查詢
  get speed() {
    return this.char.stats.speed * this.slowMul * (this.haste > 0 ? 1.4 : 1);
  }

  bodyRect() {
    return rect(this.x - BODY.w / 2, this.y - BODY.h, BODY.w, BODY.h);
  }

  center() {
    return { x: this.x, y: this.y - BODY.h * 0.55 };
  }

  get foe() {
    return this.battle ? this.battle.opponentOf(this) : null;
  }

  reachMul() {
    return (WEAPON_REACH[this.char.look.weapon] || 1) * (this.char.build.scale || 1);
  }

  atkMul() {
    return this.char.stats.atk;
  }

  defMul() {
    return this.char.stats.def;
  }

  canAct() {
    return !this.dead && this.hitstun <= 0 && this.freeze <= 0 && this.shockTime <= 0
      && this.lock <= 0 && !this.attack;
  }

  // ---------------------------------------------------------------- 每幀
  update(dt, input) {
    this.animTime += dt;
    this.tickTimers(dt);
    if (this.dead) {
      this.physics(dt);
      this.pose = 'ko';
      this.poseK = 1;
      return;
    }
    this.tickDots(dt);

    const stunned = this.hitstun > 0 || this.freeze > 0 || this.shockTime > 0;
    if (stunned) {
      this.attack = null;
      this.guarding = false;
      this.lock = 0;
    }

    if (this.attack) this.updateAttack(dt);
    else if (!stunned && this.lock <= 0) this.handleInput(input, dt);
    else this.guarding = false;

    this.physics(dt);
    this.updatePose(dt);
    this.updateTrail(dt);
  }

  tickTimers(dt) {
    const dec = (v) => Math.max(0, v - dt);
    this.lock = dec(this.lock);
    this.hitstun = dec(this.hitstun);
    this.invuln = dec(this.invuln);
    this.armor = dec(this.armor);
    this.freeze = dec(this.freeze);
    this.shockTime = dec(this.shockTime);
    this.haste = dec(this.haste);
    this.dashCd = dec(this.dashCd);
    this.comboWindow = dec(this.comboWindow);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.drTime = dec(this.drTime);
    if (this.drTime <= 0) this.dr = 0;
    this.slow = dec(this.slow);
    if (this.slow <= 0) this.slowMul = 1;
    this.cds[0] = dec(this.cds[0]);
    this.cds[1] = dec(this.cds[1]);
    this.comboTimer = dec(this.comboTimer);
    if (this.comboTimer <= 0) this.comboCount = 0;
    if (this.comboWindow <= 0) this.comboKey = null;
    if (this.poseLock) {
      this.poseLock.t += dt;
      if (this.poseLock.t >= this.poseLock.dur) this.poseLock = null;
    }
  }

  tickDots(dt) {
    if (this.burn > 0) {
      this.burn -= dt;
      this.damageOverTime(this.burnDps * dt, '#ff7a3c');
    }
    if (this.poison > 0) {
      this.poisonTime -= dt;
      this.damageOverTime(this.poison * 1.6 * dt, '#b46bff');
      if (this.poisonTime <= 0) this.poison = 0;
    }
  }

  damageOverTime(amount, color) {
    if (this.dead || amount <= 0) return;
    this.hp -= amount;
    if (Math.random() < 0.08 && this.battle) {
      this.battle.fx.particle({
        x: this.x + rand(-16, 16), y: this.y - rand(20, 80),
        vx: rand(-20, 20), vy: -rand(40, 90), g: -60, life: 0.5,
        size: 3, color, shape: 'hex',
      });
    }
    if (this.hp <= 0) this.die();
  }

  // ---------------------------------------------------------------- 操作
  handleInput(input, dt) {
    const foe = this.foe;
    // 自動面向對手（格鬥遊戲的標準行為），衝刺與出招期間不轉身
    if (foe && !this.dead) {
      const want = foe.x >= this.x ? 1 : -1;
      if (this.onGround || Math.abs(this.vx) < 40) this.facing = want;
    }

    // 往後推＝格擋（不佔一顆按鍵，街機的老規矩）
    const back = -this.facing;
    this.guarding = this.onGround && input.x !== 0 && sign(input.x) === back;

    const accel = this.onGround ? 2600 : 1500;
    if (input.x !== 0 && !this.guarding) {
      this.vx = approach(this.vx, input.x * this.speed, accel * dt);
    } else {
      const fr = this.onGround ? (this.guarding ? 4200 : 2800) : 700;
      this.vx = approach(this.vx, 0, fr * dt);
    }

    if (input.edges & BTN.JUMP) this.tryJump();
    if (input.edges & BTN.DASH) this.tryDash(input);
    if (input.edges & BTN.LIGHT) this.tryLight();
    if (input.edges & BTN.HEAVY) this.tryHeavy();
    if (input.edges & BTN.S1) this.trySkill(0);
    if (input.edges & BTN.S2) this.trySkill(1);
    if (input.edges & BTN.ULT) this.tryUlt();

    // 空中按住下 = 快速落地
    if (!this.onGround && input.down && this.vy > -50) this.vy += 2600 * dt;
  }

  tryJump() {
    if (this.onGround) {
      this.vy = -this.char.stats.jump;
      this.onGround = false;
      this.airJumps = this.airJumpsMax;
      this.airDashes = 1;
      this.battle?.fx.dust(this.x, this.y, 0, 7, this.char.color);
      this.battle?.audio.play('jump');
    } else if (this.airJumps > 0) {
      this.airJumps--;
      this.vy = -this.char.stats.jump * 0.92;
      this.battle?.fx.ring(this.x, this.y - 10, this.char.accent, { r0: 8, r1: 54, life: 0.3, width: 3, squash: 0.4 });
      this.battle?.audio.play('jump');
    }
  }

  tryDash(input) {
    if (this.dashCd > 0) return;
    if (!this.onGround && this.airDashes <= 0) return;
    if (!this.onGround) this.airDashes--;
    const dir = input.x !== 0 ? sign(input.x) : this.facing;
    const power = 720 * (this.char.stats.dash || 1);
    this.vx = dir * power;
    if (!this.onGround) this.vy = Math.min(this.vy, -60);
    this.dashCd = 0.62;
    this.lock = 0.16;
    this.invuln = Math.max(this.invuln, 0.14);
    this.setPose('dash', 0.22);
    this.battle?.fx.dust(this.x - dir * 12, this.y, -dir, 8, this.char.color);
    this.battle?.audio.play('dash');
  }

  tryLight() {
    const key = this.comboWindow > 0 && this.comboKey ? this.comboKey
      : (this.onGround ? 'light1' : 'airLight');
    this.startAttack(key);
  }

  tryHeavy() {
    this.startAttack(this.onGround ? 'heavy' : 'airHeavy');
  }

  trySkill(slot) {
    const skill = this.char.skills[slot];
    if (!skill || this.cds[slot] > 0) return;
    this.cds[slot] = skill.cd;
    runSkill(skill.kind, this, skill.params || {}, { slot, skill });
    this.battle?.onSkill?.(this, skill.kind, skill.params || {});
    this.battle?.audio.play('skill');
  }

  tryUlt() {
    if (this.meter < MAX_METER) return;
    this.meter = 0;
    const ult = this.char.ult;
    this.battle?.onUlt(this);
    const params = { ...(ult.params || {}), ult: true };
    runSkill(ult.kind, this, params, { ult: true, skill: ult });
    this.battle?.onSkill?.(this, ult.kind, params);
    this.battle?.audio.play('ult');
  }

  // ---------------------------------------------------------------- 普攻
  startAttack(key) {
    const def = BASIC[key];
    if (!def) return;
    if (def.air && this.onGround) return;
    if (!def.air && !this.onGround) return;
    this.attack = { def, key, t: 0, hits: new Set() };
    this.guarding = false;
    this.comboKey = null;
    this.comboWindow = 0;
    // 伏特的被動：出招速度更快
    if (this.char.passive.name === '超載') this.attack.rate = 1.18;
    if (def.step && this.onGround) this.vx = this.facing * def.step;
    this.battle?.audio.play('swing');
  }

  updateAttack(dt) {
    const a = this.attack;
    const rate = a.rate || 1;
    a.t += dt * rate;
    const def = a.def;
    const k = a.t / def.dur;

    if (def.armorFrom && a.t >= def.armorFrom) this.armor = Math.max(this.armor, 0.08);

    if (a.t >= def.hit[0] && a.t <= def.hit[1]) {
      const r = this.attackRect(def);
      const foe = this.foe;
      if (foe && !a.hits.has(foe.id) && overlaps(r, foe.bodyRect())) {
        a.hits.add(foe.id);
        const landed = this.dealDamage(foe, {
          dmg: def.dmg,
          kbx: def.kb[0], kby: def.kb[1],
          hitstun: def.hitstun,
          heavy: def.heavy,
          shock: this.char.passive.name === '超載' && a.key === 'light3' ? 0.45 : 0,
        });
        if (landed) {
          this.meter = Math.min(MAX_METER, this.meter + (def.meter || 4));
          this.onAttackLanded(def, r);
        }
      }
    }

    if (a.t >= def.dur) {
      if (def.next) {
        this.comboKey = def.next;
        this.comboWindow = 0.28;
      }
      this.attack = null;
    }
  }

  attackRect(def) {
    const m = this.reachMul();
    const [ox, oy, w, h] = def.reach;
    const cx = this.x + this.facing * ox * m;
    const cy = this.y + oy;
    return rect(cx - (w * m) / 2, cy - h / 2, w * m, h);
  }

  /** 命中的演出：刀光、火花、頓幀，武器不同刀光也不同 */
  onAttackLanded(def, r) {
    const fx = this.battle.fx;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const face = this.facing;
    const big = !!def.heavy;
    fx.slash(this.x + face * 44, this.y - 58, this.char.accent, {
      r: big ? 96 : 68, width: big ? 22 : 14,
      a0: face > 0 ? -1.25 : Math.PI + 1.25,
      a1: face > 0 ? 1.15 : Math.PI - 1.15,
      life: 0.2,
    });
    fx.spark(cx, cy, this.char.color, big ? 1.6 : 1);
    fx.stop(big ? 0.09 : 0.045);
    fx.quake(big ? 10 : 4.5, 0.2);
    this.battle.audio.play(big ? 'hitHeavy' : 'hit');
  }

  // ---------------------------------------------------------------- 傷害
  /** 我方造成傷害（所有招式的唯一入口） */
  dealDamage(target, o) {
    if (!target || target.dead || this.dead) return false;
    // 連線的客戶端只負責重播特效，傷害一律由主機算
    if (this.battle && this.battle.authoritative === false) return false;
    let dmg = (o.dmg || 0) * this.atkMul();

    // 角色被動的加成
    const p = this.char.passive.name;
    if (p === '延燒' && target.burn > 0) dmg *= 1.15;
    if (p === '毒素共鳴' && target.poison > 0) dmg *= 1.25;
    if (p === '間合') {
      const d = Math.abs(target.x - this.x);
      dmg *= 1 + clamp(d / 520, 0, 1) * 0.2;
    }

    const hit = { ...o, dmg };
    if (p === '延燒' && !hit.burn) hit.burn = 1.6;

    const landed = target.receiveHit(this, hit);
    if (landed) {
      this.meter = Math.min(MAX_METER, this.meter + dmg * 0.9);
      this.dmgDealt += dmg;
      this.comboCount++;
      this.maxCombo = Math.max(this.maxCombo, this.comboCount);
      this.comboTimer = 1.2;
      this.battle?.onCombo(this);
    }
    return landed;
  }

  /** 對方打進來 */
  receiveHit(from, hit) {
    if (this.dead) return false;
    if (this.invuln > 0) return false;
    const fx = this.battle?.fx;

    // 夜刃的殘影：機率完全閃掉
    if (this.char.passive.name === '殘影' && Math.random() < 0.15) {
      this.haste = 1.0;
      this.invuln = Math.max(this.invuln, 0.12);
      fx?.floatText(this.x, this.y - 118, '閃避', this.char.color, 20);
      fx?.afterimage((c, col) => this.paint(c, col), this.char.color, 0.3);
      this.battle?.audio.play('dodge');
      return false;
    }

    let dmg = hit.dmg * this.defMul();
    if (this.dr > 0) dmg *= 1 - clamp(this.dr, 0, 0.9);

    // 格擋：面向攻擊者且正在後退 → 大幅減傷，不吃硬直
    const fromFront = sign(from.x - this.x) === this.facing || from.x === this.x;
    const blocked = this.guarding && fromFront && !hit.unblockable;
    if (blocked) dmg *= 0.28;

    this.hp -= dmg;
    this.hitFlash = 1;
    this.lastHitBy = from;

    // 狀態異常（DoT 類即使霸體或格擋也會附著）
    if (hit.burn) { this.burn = Math.max(this.burn, hit.burn); this.burnDps = Math.max(this.burnDps, 4.5); }
    if (hit.poison) { this.poison = Math.min(10, this.poison + hit.poison); this.poisonTime = 5; }
    if (hit.slow) { this.slow = Math.max(this.slow, hit.slow); this.slowMul = Math.min(this.slowMul, hit.slowMul || 0.7); }

    const armored = this.armor > 0 && !hit.ignoreArmor;
    if (!armored && !blocked) {
      if (hit.freeze) { this.freeze = Math.max(this.freeze, hit.freeze); this.attack = null; }
      if (hit.shock) this.shockTime = Math.max(this.shockTime, hit.shock);
      const kbs = knockbackScale(this) * (this.char.passive.name === '鋼體' ? 0.6 : 1);
      const dirX = hit.kbDir !== undefined ? hit.kbDir : sign(this.x - from.x) || from.facing;
      this.vx = (hit.kbx || 0) * kbs * dirX;
      this.vy = (hit.kby || 0) * kbs;
      if (this.vy < 0) this.onGround = false;
      this.hitstun = Math.max(this.hitstun, hit.hitstun || 0.22);
      this.hitstunMax = Math.max(0.05, this.hitstun);
      this.attack = null;
      this.lock = 0;
    } else if (blocked) {
      this.vx = sign(this.x - from.x) * 180;
      this.meter = Math.min(MAX_METER, this.meter + dmg * 0.6);
      fx?.floatText(this.x, this.y - 118, '格擋', '#9fb4ff', 18);
      fx?.ring(this.x + this.facing * 26, this.y - 56, '#9fb4ff', { r0: 10, r1: 46, life: 0.22, width: 3 });
      this.battle?.audio.play('block');
    }

    this.meter = Math.min(MAX_METER, this.meter + dmg * 0.7);
    fx?.damageNumber(this.x, this.y - 118, dmg, blocked ? '#9fb4ff' : (hit.big ? '#fff27a' : '#ffffff'), !!hit.big);

    // 反制型被動
    this.counterPassives(from, dmg);

    if (this.hp <= 0) this.die();
    return true;
  }

  counterPassives(from, dmg) {
    if (!from || from === this || from.dead) return;
    const p = this.char.passive.name;
    if (p === '凍甲') {
      from.slow = Math.max(from.slow, 1.4);
      from.slowMul = Math.min(from.slowMul, 0.7);
      this.battle?.fx.ring(from.x, from.y - 50, '#9be8ff', { r0: 10, r1: 60, life: 0.3, width: 2 });
    }
    if (p === '熔岩之軀' && Math.abs(from.x - this.x) < 150) {
      from.burn = Math.max(from.burn, 2);
      from.burnDps = Math.max(from.burnDps, 4.5);
    }
  }

  heal(v) {
    this.hp = Math.min(this.maxHp, this.hp + v);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.attack = null;
    this.vy = -320;
    this.vx = -this.facing * 220;
    const fx = this.battle?.fx;
    if (fx) {
      fx.burst(this.x, this.y - 60, this.char.color, { count: 30, speed: 460, size: 5, life: 0.8, shape: 'hex' });
      fx.ring(this.x, this.y - 60, this.char.color, { r0: 20, r1: 260, life: 0.6, width: 6 });
      fx.flashScreen(0.5, '#ffffff');
      fx.quake(18, 0.5);
    }
    this.battle?.onKO(this);
  }

  // ---------------------------------------------------------------- 物理
  physics(dt) {
    const gmul = this.char.passive.name === '輕身' ? 0.86 : (this.char.stats.weight > 1.1 ? 1.08 : 1);
    if (!this.onGround) {
      this.vy = Math.min(this.vy + GRAVITY * gmul * dt, MAX_FALL);
    }
    if (this.freeze > 0) this.vx = approach(this.vx, 0, 2000 * dt);

    const prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 牆
    const half = BODY.w / 2;
    if (this.x < WORLD.left + half) { this.x = WORLD.left + half; this.vx = Math.max(0, this.vx); }
    if (this.x > WORLD.right - half) { this.x = WORLD.right - half; this.vx = Math.min(0, this.vx); }

    // 地板
    let landed = false;
    if (this.y >= WORLD.ground) {
      this.y = WORLD.ground;
      landed = true;
    } else if (this.vy > 0 && this.battle) {
      // 單向平台：只有從上面掉下來才會踩到
      for (const p of this.battle.platforms) {
        if (this.x < p.x - 6 || this.x > p.x + p.w + 6) continue;
        if (prevY <= p.y + 2 && this.y >= p.y) {
          this.y = p.y;
          landed = true;
          break;
        }
      }
    }

    if (landed) {
      if (!this.onGround) this.onLand();
      this.onGround = true;
      this.vy = 0;
      this.airJumps = this.airJumpsMax;
      this.airDashes = 1;
    } else if (this.y < WORLD.ground) {
      this.onGround = false;
    }
  }

  onLand() {
    const heavy = this.vy > 700;
    this.battle?.fx.dust(this.x, this.y, 0, heavy ? 12 : 6, this.char.color);
    if (heavy) {
      this.battle?.fx.ring(this.x, this.y, this.char.color, { r0: 10, r1: 70, life: 0.26, width: 3, squash: 0.35 });
      this.battle?.audio.play('land');
    }
    if (!this.attack && !this.dead && this.hitstun <= 0) this.setPose('land', 0.12);
  }

  // ---------------------------------------------------------------- 表現
  setPose(pose, dur) {
    this.poseLock = { pose, t: 0, dur };
  }

  updatePose(dt) {
    if (this.attack) {
      this.pose = this.attack.def.pose;
      this.poseK = clamp(this.attack.t / this.attack.def.dur, 0, 1);
      return;
    }
    if (this.poseLock) {
      this.pose = this.poseLock.pose;
      this.poseK = clamp(this.poseLock.t / this.poseLock.dur, 0, 1);
      return;
    }
    if (this.freeze > 0 || this.shockTime > 0 || this.hitstun > 0) {
      this.pose = 'hurt';
      this.poseK = 1 - clamp(this.hitstun / this.hitstunMax, 0, 1);
      return;
    }
    if (this.guarding) { this.pose = 'guard'; this.poseK = 0; return; }
    if (!this.onGround) {
      this.pose = this.vy < 0 ? 'jump' : 'fall';
      this.poseK = 0;
      return;
    }
    if (Math.abs(this.vx) > 26) {
      this.pose = 'run';
      this.phase += dt * (6 + Math.abs(this.vx) * 0.026);
    } else {
      this.pose = 'idle';
      this.phase += dt * 2.4;
    }
    this.poseK = 0;
  }

  updateTrail(dt) {
    if (!this.char.look.trail || !this.battle) return;
    if (Math.abs(this.vx) < 320 && Math.abs(this.vy) < 420) return;
    this.trailT += dt;
    if (this.trailT < 0.045) return;
    this.trailT = 0;
    this.battle.fx.afterimage((c, col) => this.paint(c, col), this.char.color, 0.22);
  }

  /** 把自己畫成單色剪影（殘影、虛影、瞬移用） */
  paint(ctx, color) {
    const snap = {
      char: this.char, x: this.x, y: this.y, facing: this.facing,
      pose: this.pose, poseK: this.poseK, phase: this.phase, animTime: this.animTime,
    };
    this.battle.paintFighter(ctx, snap, color);
  }

  /** 連線快照：只帶「畫得出來、判得了勝負」的最小集合 */
  snapshot() {
    return [
      Math.round(this.x), Math.round(this.y), this.facing,
      Math.round(this.hp * 10) / 10, Math.round(this.meter),
      this.poseIndex(), Math.round(this.poseK * 100) / 100,
      Math.round(this.phase * 100) / 100,
      this.burn > 0 ? 1 : 0, this.freeze > 0 ? 1 : 0,
      this.poison, this.dr > 0 ? 1 : 0, this.dead ? 1 : 0,
      Math.round(this.hitFlash * 100) / 100,
    ];
  }

  /** 連線客戶端：不跑物理，只把自己補間到主機給的位置並繼續播動畫 */
  updateRemote(dt) {
    this.animTime += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    const k = Math.min(1, dt * 18);
    this.x += (this.netX - this.x) * k;
    this.y += (this.netY - this.y) * k;
    if (this.pose === 'run') this.phase += dt * 9;
    else if (this.pose === 'idle') this.phase += dt * 2.4;
  }

  applySnapshot(s) {
    const first = this.netX === undefined;
    this.netX = s[0]; this.netY = s[1];
    if (first || Math.hypot(this.netX - this.x, this.netY - this.y) > 260) {
      this.x = this.netX; this.y = this.netY;
    }
    this.facing = s[2];
    this.hp = s[3]; this.meter = s[4];
    this.pose = POSE_LIST[s[5]] || 'idle';
    this.poseK = s[6]; this.phase = s[7];
    this.burn = s[8] ? 1 : 0; this.freeze = s[9] ? 1 : 0;
    this.poison = s[10]; this.dr = s[11] ? 0.5 : 0;
    this.drTime = s[11] ? 1 : 0;
    this.hitFlash = s[13];
    if (s[12] && !this.dead) { this.dead = true; this.hp = 0; }
  }

  poseIndex() {
    const i = POSE_LIST.indexOf(this.pose);
    return i < 0 ? 0 : i;
  }
}

export const POSE_LIST = [
  'idle', 'run', 'jump', 'fall', 'land', 'crouch', 'guard', 'dash',
  'light1', 'light2', 'light3', 'heavy', 'cast', 'uppercut', 'dive', 'ult', 'hurt', 'ko',
];
