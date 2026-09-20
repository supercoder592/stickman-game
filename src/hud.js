// 對戰 HUD：血條、氣條、計時、回合數、技能冷卻、連段數與大字幕。

import { panel, text, measure, neonStroke, glowFill, circlePath, ngonPath, polyPath, linePath } from './gfx.js';
import { WORLD } from './render.js';
import { clamp, withAlpha, lerp } from './util.js';
import { MAX_METER } from './combat.js';
import { WINS_NEEDED } from './battle.js';

/** 畫面寬度（世界比畫面寬，選單與 HUD 都用畫面座標） */
const VIEW = WORLD.view;

const BAR_W = 470;
const BAR_H = 26;

const ghost = [1, 1];

export function drawHud(ctx, battle, opts = {}) {
  const { localSides = [0] } = opts;
  const t = battle.time;

  battle.fighters.forEach((f, i) => {
    const ratio = clamp(f.hp / f.maxHp, 0, 1);
    ghost[i] = ghost[i] < ratio ? ratio : Math.max(ratio, ghost[i] - 0.006);
    drawFighterBar(ctx, f, i, ratio, ghost[i], battle, t);
  });

  drawTimer(ctx, battle);

  // 本機玩家的技能格（雙人同機時兩邊都畫）
  localSides.forEach((side, idx) => {
    const f = battle.fighters[side];
    if (!f) return;
    const x = localSides.length > 1 ? (side === 0 ? 150 : VIEW - 150 - 330) : VIEW / 2 - 165;
    drawSkillBar(ctx, f, x, WORLD.h - 92, t);
  });

  if (battle.comboT > 0 && battle.comboShown >= 3) {
    const side = battle.comboSide;
    const f = battle.fighters[side];
    const x = side === 0 ? 210 : VIEW - 210;
    const a = clamp(battle.comboT, 0, 1);
    const pop = 1 + Math.max(0, 0.25 - (1.2 - battle.comboT)) * 2;
    ctx.save();
    ctx.translate(x, 210);
    ctx.scale(pop, pop);
    text(ctx, `${battle.comboShown}`, 0, 0, {
      size: 54, color: withAlpha(f.char.accent, a), align: 'center', weight: 900, glow: 1,
    });
    text(ctx, 'COMBO', 0, 26, { size: 18, color: withAlpha('#ffffff', a * 0.8), align: 'center' });
    ctx.restore();
  }

  drawBanner(ctx, battle);
  if (battle.state === 'intro') drawCountdown(ctx, battle);
}

function drawFighterBar(ctx, f, side, ratio, ghostRatio, battle, t) {
  const right = side === 1;
  const x = right ? VIEW - 40 - BAR_W : 40;
  const y = 42;
  const c = f.char.color;

  // 外框
  const frame = polyPath(right ? [
    { x: x + BAR_W, y }, { x: x + BAR_W, y: y + BAR_H },
    { x: x + 16, y: y + BAR_H }, { x, y: y + BAR_H / 2 }, { x: x + 16, y },
  ] : [
    { x, y }, { x: x + BAR_W - 16, y }, { x: x + BAR_W, y: y + BAR_H / 2 },
    { x: x + BAR_W - 16, y: y + BAR_H }, { x, y: y + BAR_H },
  ]);
  ctx.fillStyle = 'rgba(6,8,18,0.9)';
  ctx.fill(frame);

  // 血量（受傷後殘影條先退）
  ctx.save();
  ctx.clip(frame);
  const gw = BAR_W * ghostRatio;
  const hw = BAR_W * ratio;
  ctx.fillStyle = 'rgba(255,90,120,0.55)';
  ctx.fillRect(right ? x + BAR_W - gw : x, y, gw, BAR_H);
  const grad = ctx.createLinearGradient(x, 0, x + BAR_W, 0);
  grad.addColorStop(0, right ? c : withAlpha(c, 0.75));
  grad.addColorStop(1, right ? withAlpha(c, 0.75) : c);
  ctx.fillStyle = grad;
  ctx.fillRect(right ? x + BAR_W - hw : x, y, hw, BAR_H);
  // 斜線紋理
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 6;
  for (let i = -BAR_H; i < BAR_W + BAR_H; i += 16) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + BAR_H);
    ctx.lineTo(x + i + BAR_H, y);
    ctx.stroke();
  }
  ctx.restore();
  neonStroke(ctx, frame, c, 2, 0.9);

  // 氣條
  const my = y + BAR_H + 6;
  const mw = BAR_W * 0.62;
  const mx = right ? x + BAR_W - mw : x;
  ctx.fillStyle = 'rgba(6,8,18,0.9)';
  ctx.fillRect(mx, my, mw, 9);
  const meter = clamp(f.meter / MAX_METER, 0, 1);
  const full = meter >= 1;
  ctx.fillStyle = full ? '#fff27a' : withAlpha(f.char.accent, 0.9);
  const fw = mw * meter;
  ctx.fillRect(right ? mx + mw - fw : mx, my, fw, 9);
  if (full) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 8);
    ctx.fillStyle = '#fff27a';
    ctx.fillRect(mx, my - 2, mw, 13);
    ctx.restore();
    text(ctx, '必殺 READY', right ? mx + mw : mx, my + 30, {
      size: 13, color: '#fff27a', align: right ? 'right' : 'left', glow: 1,
    });
  }

  // 名牌
  const label = `${f.char.name}`;
  const sub = `${f.char.en}・${f.char.title}`;
  text(ctx, label, right ? x + BAR_W : x, y - 10, {
    size: 22, color: c, align: right ? 'right' : 'left', glow: 0.6,
  });
  const lw = measure(ctx, label, 22);
  text(ctx, sub, right ? x + BAR_W - lw - 10 : x + lw + 10, y - 11, {
    size: 12, color: '#93a0cc', align: right ? 'right' : 'left',
  });

  // 回合勝利點數
  for (let i = 0; i < WINS_NEEDED; i++) {
    const px = right ? x + BAR_W - 12 - i * 22 : x + 12 + i * 22;
    const won = battle.roundWins[side] > i;
    const p = circlePath(px, y + BAR_H + 30, 7);
    ctx.fillStyle = won ? c : 'rgba(255,255,255,0.10)';
    ctx.fill(p);
    neonStroke(ctx, p, won ? c : '#4a5480', 1.6, won ? 1 : 0);
  }

  // 狀態圖示
  const chips = [];
  if (f.burn > 0) chips.push(['灼燒', '#ff7a3c']);
  if (f.freeze > 0) chips.push(['凍結', '#9be8ff']);
  if (f.shockTime > 0) chips.push(['麻痺', '#fff27a']);
  if (f.poison > 0) chips.push([`毒 ${f.poison}`, '#b46bff']);
  if (f.slow > 0) chips.push(['減速', '#9fb4ff']);
  if (f.dr > 0 && f.drTime > 0) chips.push(['護盾', '#7ef1ff']);
  chips.slice(0, 4).forEach((chip, i) => {
    const w = 58;
    const cx = right ? x + BAR_W - w - i * (w + 6) : x + i * (w + 6);
    const cy = y + BAR_H + 44;
    ctx.fillStyle = withAlpha(chip[1], 0.18);
    ctx.fillRect(cx, cy, w, 18);
    ctx.strokeStyle = withAlpha(chip[1], 0.7);
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, w - 1, 17);
    text(ctx, chip[0], cx + w / 2, cy + 13, { size: 11, color: chip[1], align: 'center' });
  });
}

function drawTimer(ctx, battle) {
  const cx = VIEW / 2;
  const secs = Math.ceil(battle.timer);
  const urgent = secs <= 10 && battle.state === 'fight';
  const hex = ngonPath(cx, 64, 46, 6, Math.PI / 6);
  ctx.fillStyle = 'rgba(6,8,18,0.92)';
  ctx.fill(hex);
  neonStroke(ctx, hex, urgent ? '#ff4d6d' : '#7ef1ff', 2.2, 1);
  text(ctx, String(secs).padStart(2, '0'), cx, 76, {
    size: 40, color: urgent ? '#ff8095' : '#ffffff', align: 'center', weight: 900,
    glow: urgent ? 1.4 : 0.4,
  });
  text(ctx, `ROUND ${battle.round}`, cx, 122, { size: 13, color: '#93a0cc', align: 'center' });
}

function drawSkillBar(ctx, f, x, y, t) {
  const slots = [
    { key: 'U', s: f.char.skills[0], cd: f.cds[0], max: f.char.skills[0].cd },
    { key: 'I', s: f.char.skills[1], cd: f.cds[1], max: f.char.skills[1].cd },
    { key: 'O', s: f.char.ult, cd: 0, max: 0, ult: true },
  ];
  slots.forEach((slot, i) => {
    const sx = x + i * 112;
    const w = 100, h = 62;
    const ready = slot.ult ? f.meter >= MAX_METER : slot.cd <= 0;
    const col = slot.ult ? '#fff27a' : f.char.color;
    panel(ctx, sx, y, w, h, ready ? col : '#39405e', { glow: ready ? 0.9 : 0, cut: 8 });
    // 冷卻遮罩
    if (!ready && !slot.ult) {
      const k = clamp(slot.cd / slot.max, 0, 1);
      ctx.fillStyle = 'rgba(4,6,14,0.72)';
      ctx.fillRect(sx, y + h * (1 - k), w, h * k);
      text(ctx, slot.cd.toFixed(1), sx + w / 2, y + h / 2 + 8, { size: 20, color: '#ffffff', align: 'center' });
    } else if (!ready) {
      const k = clamp(f.meter / MAX_METER, 0, 1);
      ctx.fillStyle = 'rgba(4,6,14,0.72)';
      ctx.fillRect(sx, y + h * (1 - k), w, h * k);
      text(ctx, `${Math.floor(k * 100)}%`, sx + w / 2, y + h / 2 + 8, { size: 18, color: '#ffe27a', align: 'center' });
    }
    text(ctx, slot.key, sx + 8, y + 18, { size: 13, color: ready ? col : '#6b7599' });
    const name = slot.s.name;
    const size = name.length > 5 ? 13 : 15;
    text(ctx, name, sx + w / 2, y + h - 12, {
      size, color: ready ? '#e7ecff' : '#767f9f', align: 'center',
    });
    if (ready && slot.ult) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 7);
      ctx.fillStyle = '#fff27a';
      ctx.fillRect(sx, y, w, h);
      ctx.restore();
    }
  });
}

function drawBanner(ctx, battle) {
  const b = battle.banner;
  if (!b) return;
  const k = b.t / b.life;
  const a = clamp(Math.min(b.t * 5, 1) * (1 - Math.max(0, k - 0.72) * 3.6), 0, 1);
  const pop = 1 + Math.max(0, 0.18 - b.t) * 3;
  const cx = VIEW / 2, cy = 260;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  ctx.globalAlpha = a;
  text(ctx, b.text, 0, 0, { size: 72, color: b.color, align: 'center', weight: 900, glow: 1.4, letter: 4 });
  if (b.sub) text(ctx, b.sub, 0, 40, { size: 20, color: '#dfe6ff', align: 'center' });
  ctx.restore();
}

function drawCountdown(ctx, battle) {
  const left = 2.0 - battle.stateT;
  if (left <= 0) return;
  const n = Math.ceil(left);
  const frac = left - Math.floor(left);
  const pop = 1 + (1 - frac) * 0.5;
  ctx.save();
  ctx.translate(VIEW / 2, 300);
  ctx.scale(pop, pop);
  ctx.globalAlpha = clamp(frac * 2.2, 0, 1);
  text(ctx, String(n), 0, 0, { size: 120, color: '#7ef1ff', align: 'center', weight: 900, glow: 1.6 });
  ctx.restore();
}
