// 單機對手。
//
// AI 不碰戰鬥邏輯，只產生和玩家一模一樣的 InputFrame —— 所以它會受同樣的
// 冷卻、硬直與格擋規則限制，不會作弊。難度只改「反應間隔」與「積極度」。

import { BTN, emptyFrame } from './input.js';
import { sign, clamp, rand } from './util.js';
import { MAX_METER } from './combat.js';

export class AI {
  constructor(fighter, difficulty = 1) {
    this.f = fighter;
    this.difficulty = difficulty;
    this.think = 0;
    this.plan = 'approach';
    this.planT = 0;
    this.holdX = 0;
    this.jumpT = 0;
  }

  get reaction() { return clamp(0.42 - 0.16 * this.difficulty, 0.1, 0.5); }
  get aggression() { return clamp(0.45 + 0.35 * this.difficulty, 0.3, 0.95); }

  update(dt, battle) {
    const f = this.f;
    const frame = emptyFrame();
    if (f.dead || battle.state !== 'fight') return frame;

    const foe = battle.opponentOf(f);
    const target = battle.apparentTarget(f.side);
    const dx = target.x - f.x;
    const d = Math.abs(dx);
    const dir = sign(dx) || 1;

    this.planT -= dt;
    this.think -= dt;
    this.jumpT -= dt;

    // ---- 決策 ----
    if (this.think <= 0) {
      this.think = this.reaction * rand(0.8, 1.3);
      const hpRatio = f.hp / f.maxHp;

      if (f.meter >= MAX_METER && d < 260 && Math.random() < 0.8) {
        frame.edges |= BTN.ULT;
      } else if (foe.attack && d < 150 && Math.random() < 0.45 * this.difficulty) {
        // 對手在出招 → 往後退＝格擋
        this.plan = 'block';
        this.planT = 0.45;
      } else if (d < 120) {
        if (Math.random() < this.aggression) {
          frame.edges |= Math.random() < 0.3 ? BTN.HEAVY : BTN.LIGHT;
          this.plan = 'attack';
          this.planT = 0.3;
        } else if (Math.random() < 0.25) {
          this.plan = 'retreat';
          this.planT = 0.5;
        }
      } else if (d < 340) {
        const s = this.pickSkill(d);
        if (s >= 0 && Math.random() < this.aggression) {
          frame.edges |= s === 0 ? BTN.S1 : BTN.S2;
          this.planT = 0.3;
        } else if (Math.random() < 0.5) {
          this.plan = 'approach';
          this.planT = 0.6;
        } else if (Math.random() < 0.3 && f.dashCd <= 0) {
          frame.edges |= BTN.DASH;
          this.plan = 'approach';
          this.planT = 0.3;
        }
      } else {
        const s = this.pickSkill(d);
        if (s >= 0 && Math.random() < this.aggression * 0.8) {
          frame.edges |= s === 0 ? BTN.S1 : BTN.S2;
        } else {
          this.plan = 'approach';
          this.planT = 0.7;
        }
      }

      // 血量低時偶爾拉開距離喘口氣
      if (hpRatio < 0.3 && Math.random() < 0.3) {
        this.plan = 'retreat';
        this.planT = 0.7;
      }
    }

    if (this.planT <= 0) this.plan = 'approach';

    // ---- 執行 ----
    switch (this.plan) {
      case 'block':
        frame.x = -dir;
        break;
      case 'retreat':
        frame.x = -dir;
        if (d > 420) this.plan = 'approach';
        break;
      case 'attack':
        frame.x = d > 70 ? dir : 0;
        break;
      case 'approach':
      default:
        frame.x = d > 64 ? dir : 0;
        break;
    }

    // 對手在上面 → 跳上去；掉出平台 → 往回跳
    if (this.jumpT <= 0 && f.onGround) {
      const above = target.y < f.y - 70;
      if ((above && d < 260) || (d < 40 && Math.random() < 0.1)) {
        frame.edges |= BTN.JUMP;
        this.jumpT = 0.9;
      }
    }
    frame.up = false;
    return frame;
  }

  /** 挑一個冷卻好了、距離也合適的技能 */
  pickSkill(d) {
    const f = this.f;
    const opts = [];
    for (let i = 0; i < 2; i++) {
      if (f.cds[i] > 0) continue;
      const kind = f.char.skills[i].kind;
      const near = ['burst', 'uppercut', 'blink', 'rushCombo', 'slam', 'divekick'].includes(kind);
      const far = ['projectile', 'beam', 'rain', 'spikes', 'boomerang', 'gravity', 'supernova'].includes(kind);
      const any = ['ward', 'zone', 'decoy', 'dashStrike', 'vortex', 'fieldFreeze'].includes(kind);
      if ((near && d < 170) || (far && d > 150) || any) opts.push(i);
    }
    if (!opts.length) return -1;
    return opts[Math.floor(Math.random() * opts.length)];
  }
}
