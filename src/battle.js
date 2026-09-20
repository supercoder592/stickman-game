// 一場對戰：兩位角色、一堆招式實體、回合與勝負。
//
// 不論單機、雙人同機還是連線，跑的都是這一支 —— 差別只在「輸入從哪裡來」
// 以及連線時客戶端不自己算傷害（由主機的快照覆蓋）。

import { Fighter, BODY } from './fighter.js';
import { Fx } from './fx.js';
import {
  WORLD, drawSky, drawGround, drawPlatform, drawFighter, drawRain, drawFog, drawForeground, drawGrade,
} from './render.js';
import { clamp } from './util.js';
import { MAX_METER } from './combat.js';
import { runSkill } from './skills.js';

export const ROUND_TIME = 60;
export const WINS_NEEDED = 2;

export const MODE = { SOLO: 'solo', LOCAL: 'local', NET_HOST: 'host', NET_CLIENT: 'client' };

export class Battle {
  constructor(opts) {
    const { chars, mode = MODE.SOLO, audio, onMatchEnd = () => {}, difficulty = 1 } = opts;
    this.mode = mode;
    this.audio = audio;
    this.difficulty = difficulty;
    this.onMatchEnd = onMatchEnd;

    this.fx = new Fx();
    this.entities = [];
    this.platforms = [
      { x: 330, y: 432, w: 250, h: 18 },
      { x: 1320, y: 432, w: 250, h: 18 },
      { x: 825, y: 296, w: 250, h: 18 },
    ];

    this.fighters = [new Fighter(chars[0], 0), new Fighter(chars[1], 1)];
    for (const f of this.fighters) f.battle = this;

    this.time = 0;
    this.roundWins = [0, 0];
    this.round = 1;
    this.timer = ROUND_TIME;
    this.state = 'intro';           // intro → fight → ko → (下一回合 | over)
    this.stateT = 0;
    this.winner = -1;               // 這一回合的勝方
    this.matchWinner = -1;
    this.comboSide = -1;
    this.comboShown = 0;
    this.comboT = 0;
    this.banner = null;             // { text, sub, t, life, color }
    this.slowmo = 1;
    // 連線的客戶端把這個關掉：傷害一律以主機的快照為準
    this.authoritative = true;
    this.onSkill = null;
  }

  // ---------------------------------------------------------------- 查詢
  opponentOf(f) {
    return this.fighters[f.side === 0 ? 1 : 0];
  }

  spawn(e) {
    this.entities.push(e);
    return e;
  }

  /** AI 會被虛影騙走：回傳該陣營「看起來的目標位置」 */
  apparentTarget(forSide) {
    const foe = this.fighters[forSide === 0 ? 1 : 0];
    const decoy = this.entities.find((e) => e.snap && e.user === foe && !e.dead);
    if (decoy) return { x: decoy.snap.x, y: decoy.snap.y, decoy: true };
    return { x: foe.x, y: foe.y, decoy: false };
  }

  paintFighter(ctx, snap, color) {
    drawFighter(ctx, snap, { flat: color, shadow: false });
  }

  // ---------------------------------------------------------------- 回合
  startRound() {
    this.state = 'intro';
    this.stateT = 0;
    this.timer = ROUND_TIME;
    this.winner = -1;
    this.entities.length = 0;
    this.fx.clear();
    this.fighters.forEach((f, i) => {
      f.hp = f.maxHp;
      f.meter = Math.min(f.meter, MAX_METER * 0.5);
      f.x = i === 0 ? WORLD.w * 0.34 : WORLD.w * 0.66;
      f.y = WORLD.ground;
      f.vx = 0; f.vy = 0;
      f.dead = false;
      f.facing = i === 0 ? 1 : -1;
      f.attack = null;
      f.hitstun = 0; f.lock = 0; f.stagger = 0;
      f.bleed = 0; f.marked = 0; f.slow = 0; f.slowMul = 1;
      f.dr = 0; f.drTime = 0; f.armor = 0; f.invuln = 0;
      f.cds = [0, 0];
      f.comboCount = 0;
    });
  }

  showBanner(text, sub, color, life = 1.6) {
    this.banner = { text, sub, color, t: 0, life };
  }

  onKO(loser) {
    if (this.state !== 'fight') return;
    this.state = 'ko';
    this.stateT = 0;
    this.winner = loser.side === 0 ? 1 : 0;
    this.roundWins[this.winner]++;
    this.slowmo = 0.25;
    this.audio.play('ko');
    const champ = this.fighters[this.winner];
    this.showBanner('K.O.', `${champ.char.name} 拿下這回合`, champ.char.color, 2.2);
  }

  onCombo(attacker) {
    if (attacker.comboCount >= 3) {
      this.comboSide = attacker.side;
      this.comboShown = attacker.comboCount;
      this.comboT = 1.2;
    }
  }

  onUlt(user) {
    this.showBanner(user.char.ult.name, `${user.char.name}・必殺`, user.char.accent, 1.3);
    this.fx.quake(10, 0.4);
  }

  // ---------------------------------------------------------------- 更新
  update(dt, inputs) {
    this.time += dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.life) this.banner = null;
    }
    if (this.comboT > 0) this.comboT -= dt;

    // 頓幀：命中瞬間整個世界暫停幾格（特效照跑）
    if (this.fx.hitstop > 0) {
      this.fx.hitstop = Math.max(0, this.fx.hitstop - dt);
      this.fx.update(dt * 0.25);
      return;
    }

    const scale = this.state === 'ko' ? this.slowmo : 1;
    const step = dt * scale;

    switch (this.state) {
      case 'intro':
        this.stateT += dt;
        this.fighters.forEach((f) => f.update(step, EMPTY));
        if (this.stateT > 2.0) {
          this.state = 'fight';
          this.stateT = 0;
          this.showBanner('FIGHT!', '', '#fff27a', 0.9);
          this.audio.play('fight');
        }
        break;
      case 'fight': {
        this.timer = Math.max(0, this.timer - dt);
        this.fighters.forEach((f, i) => f.update(step, inputs[i] || EMPTY));
        this.separate();
        if (this.timer <= 0) this.timeUp();
        break;
      }
      case 'ko':
        this.stateT += dt;
        this.slowmo = clamp(0.25 + this.stateT * 0.5, 0.25, 1);
        this.fighters.forEach((f, i) => f.update(step, EMPTY));
        if (this.stateT > 2.4) this.afterRound();
        break;
      case 'over':
        this.stateT += dt;
        this.fighters.forEach((f) => f.update(step * 0.6, EMPTY));
        break;
      default:
        break;
    }

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.update(step, this);
      if (e.dead) this.entities.splice(i, 1);
    }
    this.fx.update(dt);
  }

  /** 兩個人不能站在同一格：輕輕推開，避免疊在一起看不出誰是誰 */
  separate() {
    const [a, b] = this.fighters;
    if (a.dead || b.dead) return;
    const dx = b.x - a.x;
    const min = BODY.w * 0.82;
    if (Math.abs(dx) < min) {
      const push = (min - Math.abs(dx)) / 2;
      const s = dx >= 0 ? 1 : -1;
      a.x -= s * push;
      b.x += s * push;
      a.x = clamp(a.x, WORLD.left + BODY.w / 2, WORLD.right - BODY.w / 2);
      b.x = clamp(b.x, WORLD.left + BODY.w / 2, WORLD.right - BODY.w / 2);
    }
  }

  timeUp() {
    const [a, b] = this.fighters;
    const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
    this.state = 'ko';
    this.stateT = 0;
    this.slowmo = 0.5;
    if (Math.abs(ra - rb) < 0.001) {
      this.winner = -1;
      this.showBanner('DRAW', '時間到，雙方血量相同', '#9fb4ff', 2.2);
    } else {
      this.winner = ra > rb ? 0 : 1;
      this.roundWins[this.winner]++;
      const champ = this.fighters[this.winner];
      this.showBanner('TIME UP', `${champ.char.name} 血量較高`, champ.char.color, 2.2);
    }
    this.audio.play('ko');
  }

  afterRound() {
    const done = this.roundWins.some((w) => w >= WINS_NEEDED);
    if (done) {
      this.state = 'over';
      this.stateT = 0;
      this.matchWinner = this.roundWins[0] >= WINS_NEEDED ? 0 : 1;
      const champ = this.fighters[this.matchWinner];
      this.showBanner('WIN', `${champ.char.name}　${this.roundWins[0]} - ${this.roundWins[1]}`, champ.char.accent, 3);
      this.onMatchEnd(this.matchWinner);
    } else {
      this.round++;
      this.startRound();
      this.showBanner(`ROUND ${this.round}`, '', '#7ef1ff', 1.4);
    }
  }

  // ---------------------------------------------------------------- 連線
  /** 客戶端的每幀：不跑模擬，只補間位置、跑特效與招式實體 */
  updateRemote(dt) {
    this.time += dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.life) this.banner = null;
    }
    if (this.comboT > 0) this.comboT -= dt;
    if (this.state === 'intro') this.stateT += dt;
    for (const f of this.fighters) f.updateRemote(dt);
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.update(dt, this);
      if (e.dead) this.entities.splice(i, 1);
    }
    this.fx.update(dt);
  }

  /** 客戶端收到「對方放招」：在本地重跑同一招，但不造成傷害（authoritative = false） */
  replayCast(side, kind, params) {
    const f = this.fighters[side];
    if (!f) return;
    runSkill(kind, f, params || {}, {});
    this.audio.play(params && params.ult ? 'ult' : 'skill');
  }

  collectSnapshot() {
    return {
      f: [this.fighters[0].snapshot(), this.fighters[1].snapshot()],
      s: this.state,
      t: Math.round(this.timer * 10) / 10,
      w: this.roundWins.slice(),
      r: this.round,
    };
  }

  applySnapshot(s) {
    if (!s || !s.f) return;
    this.fighters[0].applySnapshot(s.f[0]);
    this.fighters[1].applySnapshot(s.f[1]);
    if (s.s !== this.state) {
      // 主機宣告回合結束／新回合時，客戶端跟著切
      if (s.s === 'intro' && this.state !== 'intro') {
        this.entities.length = 0;
        this.fx.clear();
      }
      this.state = s.s;
      this.stateT = 0;
    }
    this.timer = s.t;
    this.roundWins = s.w;
    this.round = s.r;
  }

  // ---------------------------------------------------------------- 鏡頭
  /**
   * 格鬥遊戲的鏡頭：夾住兩個人、越近拉越大。
   * 沒有鏡頭的話角色只佔畫面 15%，看起來像在看螞蟻打架。
   */
  camera() {
    const [a, b] = this.fighters;
    const mid = (a.x + b.x) / 2;
    const spread = Math.abs(a.x - b.x);
    const zoom = clamp(2.25 - spread / 860, 1.36, 2.05);
    this.zoom = this.zoom ? lerpNum(this.zoom, zoom, 0.06) : zoom;
    const visW = WORLD.view / this.zoom;
    const visH = WORLD.h / this.zoom;
    const focusY = Math.min(a.y, b.y) - 40;
    let x = clamp(mid - visW / 2, -30, WORLD.w - visW + 30);
    let y = clamp(focusY - visH * 0.56, -140, WORLD.ground + 116 - visH);
    this.camX = this.camX === undefined ? x : lerpNum(this.camX, x, 0.12);
    this.camY = this.camY === undefined ? y : lerpNum(this.camY, y, 0.09);
    return { x: this.camX, y: this.camY, zoom: this.zoom };
  }

  // ---------------------------------------------------------------- 繪製
  draw(ctx) {
    const shake = this.fx.shakeOffset();
    const cam = this.camera();

    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    drawSky(ctx, this.time, this.fighters[0].char.color, cam.x);
    drawGround(ctx, this.time);
    for (const p of this.platforms) drawPlatform(ctx, p, this.time);

    // 濕地板上的倒影（畫在角色之前，才會被角色蓋住下緣）
    // 木地板不做鏡面倒影：接地陰影就夠了（見 drawFighter 的 groundShadow）

    drawFog(ctx, this.time, cam.x);
    this.fx.draw(ctx, 'back');
    for (const e of this.entities) if (e.layer === 'back') e.draw(ctx, this);

    for (const f of this.fighters) {
      // 快倒的人身上冒煙，遠遠就看得出戰況
      if (!f.dead && f.hp / f.maxHp < 0.3 && Math.random() < 0.16) {
        this.fx.smoke(f.x + (Math.random() - 0.5) * 20, f.y - 70, {
          count: 1, color: '#6a635c', r: 9, rise: 50, life: 0.9,
        });
      }
      this.drawWeaponTrail(ctx, f);
      drawFighter(ctx, f);
    }

    for (const e of this.entities) if (e.layer !== 'back') e.draw(ctx, this);
    this.fx.draw(ctx, 'front');
    drawRain(ctx, this.time, cam.x, 0);
    drawForeground(ctx, cam.x);
    ctx.restore();

    this.fx.drawFlash(ctx, WORLD.view, WORLD.h);
    drawGrade(ctx, WORLD.view, WORLD.h, { grain: 0, vignette: 0.18 });
  }

  /** 武器尖端的殘影：出招時才留，收招就散掉 */
  drawWeaponTrail(ctx, f) {
    const local = f._tipLocal;
    const scale = (f.char.build.scale || 1) * 1.12;
    if (local) {
      const pt = {
        x: f.x + f.facing * scale * local.x,
        y: f.y + scale * local.y,
      };
      f.tipTrail = f.tipTrail || [];
      f.tipTrail.push(pt);
      if (f.tipTrail.length > 6) f.tipTrail.shift();
    }
    const swinging = !!f.attack;
    if (!swinging) {
      if (f.tipTrail && f.tipTrail.length) f.tipTrail.shift();
      return;
    }
    const pts = f.tipTrail;
    if (!pts || pts.length < 4) return;
    // 移動距離太小就不畫，免得站著也拖一條
    const span = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
    if (span < 60 || span > 420) return;   // 太短沒必要、太長是瞬移
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const col = f.char.accent;
    for (const [w, a] of [[13, 0.07], [6, 0.13], [2, 0.32]]) {
      ctx.strokeStyle = a === 0.32 ? `rgba(255,248,230,${a})` : withAlphaLocal(col, a);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const EMPTY = { x: 0, up: false, down: false, edges: 0 };
const withAlphaLocal = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const lerpNum = (a, b, t) => a + (b - a) * t;
