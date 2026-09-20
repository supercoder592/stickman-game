// 繪製層：場景背景與角色。
//
// 角色的畫法：骨架（rig.js）→ 每根骨頭畫成「深色實心 + 霓虹描邊」的錐形板子，
// 再依角色的 look 掛上頭部樣式、背部零件、肩甲與武器。
// 十個人的剪影不同，靠的就是這些零件加上體型比例，遠看一眼就認得出誰是誰。

import {
  TAU, circlePath, ngonPath, polyPath, taperPath, linePath, crescentPath,
  neonStroke, neonPlate, glowFill, starPath,
} from './gfx.js';
import { poseFor } from './rig.js';
import { withAlpha, lerp, mixHex, makeRng } from './util.js';

// 世界比畫面寬：鏡頭會夾著兩位角色跑，寬一點才不會老是被牆卡住
export const WORLD = { w: 1900, h: 720, ground: 600, left: 40, right: 1860, view: 1280 };

// ------------------------------------------------------------------ 背景
const cityRng = makeRng(20260920);
const CITY = [];
for (let layer = 0; layer < 2; layer++) {
  const row = [];
  let x = -40;
  while (x < WORLD.w + 80) {
    const w = 40 + cityRng() * 70;
    const h = (layer === 0 ? 90 : 160) + cityRng() * (layer === 0 ? 120 : 190);
    row.push({ x, w, h, lit: cityRng() });
    x += w + 10 + cityRng() * 26;
  }
  CITY.push(row);
}

/** 選單用：天空與地面一起畫，沒有鏡頭。世界比畫面寬，所以置中裁切。 */
export function drawArena(ctx, t, tint = '#3a2a6b') {
  ctx.save();
  ctx.translate(-(WORLD.w - WORLD.view) / 2, 0);
  drawSky(ctx, t, tint, 0);
  drawGround(ctx, t);
  ctx.restore();
}

/** 天空、落日、城市。鏡頭移動時只跟著位移一點點（視差） */
export function drawSky(ctx, t, tint = '#3a2a6b', camX = 0) {
  const { w, h, ground } = WORLD;
  const par = -camX * 0.25;
  ctx.save();
  ctx.translate(par, 0);

  // 夜空
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#07081a');
  sky.addColorStop(0.55, '#150e33');
  sky.addColorStop(1, mixHex('#2a1350', tint, 0.35));
  ctx.fillStyle = sky;
  ctx.fillRect(-500, -200, w + 1000, h + 400);

  // 星點
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const sx = ((i * 197) % w) + Math.sin(i) * 12;
    const sy = (i * 83) % (ground - 240);
    const tw = 0.3 + 0.35 * Math.sin(t * 1.6 + i);
    ctx.fillStyle = `rgba(200,220,255,${tw * 0.5})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.restore();

  // 落日：橫向切線是這個畫風的招牌
  const sunY = ground - 190;
  const sunR = 160;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, ground);
  ctx.clip();
  const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sunGrad.addColorStop(0, '#ffe27a');
  sunGrad.addColorStop(0.5, '#ff6ba8');
  sunGrad.addColorStop(1, '#8b2fff');
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = sunGrad;
  ctx.fill(circlePath(w / 2, sunY, sunR));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 9; i++) {
    const yy = sunY + 16 + i * 17 - ((t * 12) % 17);
    ctx.fillStyle = 'rgba(7,8,26,0.92)';
    ctx.fillRect(w / 2 - sunR - 4, yy, sunR * 2 + 8, 5 + i * 1.3);
  }
  ctx.restore();

  // 城市剪影（兩層）
  const cityColors = ['#120b2c', '#0b0720'];
  const outline = ['#6a3fd0', '#8d5bff'];
  for (let layer = 1; layer >= 0; layer--) {
    const base = ground - (layer === 0 ? 0 : 26);
    ctx.fillStyle = cityColors[layer];
    for (const b of CITY[layer]) {
      ctx.fillRect(b.x, base - b.h, b.w, b.h);
      ctx.strokeStyle = withAlpha(outline[layer], 0.5);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.5, base - b.h + 0.5, b.w - 1, b.h);
      // 窗光
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let wy = base - b.h + 12; wy < base - 10; wy += 16) {
        for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 14) {
          const on = ((wx * 31 + wy * 17 + layer) % 7) < 2;
          if (!on) continue;
          const blink = 0.35 + 0.25 * Math.sin(t * 2 + wx * 0.05 + wy * 0.03);
          ctx.fillStyle = withAlpha(layer === 0 ? '#7ef1ff' : '#ff8fd0', blink);
          ctx.fillRect(wx, wy, 4, 6);
        }
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

/** 地板：畫在世界座標裡，會跟著鏡頭縮放 */
export function drawGround(ctx, t) {
  const { w, h, ground } = WORLD;
  ctx.fillStyle = '#080a18';
  ctx.fillRect(-400, ground, w + 800, h - ground + 400);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha('#ff4fd8', 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-400, ground + 1);
  ctx.lineTo(w + 400, ground + 1);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = -12; i <= 12; i++) {
    ctx.strokeStyle = withAlpha('#5ad8ff', 0.22);
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * 46, ground);
    ctx.lineTo(w / 2 + i * 300, h);
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const yy = ground + Math.pow(i / 7, 2.1) * (h - ground) + ((t * 26) % 18);
    if (yy > h) continue;
    ctx.strokeStyle = withAlpha('#5ad8ff', 0.18);
    ctx.beginPath();
    ctx.moveTo(-400, yy);
    ctx.lineTo(w + 400, yy);
    ctx.stroke();
  }
  ctx.restore();

  // 場地邊界：打到牆的時候要看得出來這裡是牆，而不是畫面剛好切到
  for (const wx of [WORLD.left, WORLD.right]) {
    const p = new Path2D();
    p.moveTo(wx, ground);
    p.lineTo(wx, ground - 300);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha('#ff4fd8', 0.30);
    ctx.lineWidth = 4;
    ctx.stroke(p);
    for (let i = 0; i < 10; i++) {
      const yy = ground - i * 30 - ((t * 40) % 30);
      ctx.fillStyle = withAlpha('#ff4fd8', 0.22 * (1 - i / 10));
      ctx.fillRect(wx - 9, yy, 18, 4);
    }
    ctx.restore();
  }
}

export function drawPlatform(ctx, p, t) {
  const glow = 0.6 + 0.2 * Math.sin(t * 2 + p.x * 0.01);
  const body = polyPath([
    { x: p.x + 10, y: p.y },
    { x: p.x + p.w - 10, y: p.y },
    { x: p.x + p.w, y: p.y + p.h },
    { x: p.x, y: p.y + p.h },
  ]);
  ctx.fillStyle = 'rgba(10,12,26,0.94)';
  ctx.fill(body);
  neonStroke(ctx, linePath({ x: p.x + 8, y: p.y + 0.5 }, { x: p.x + p.w - 8, y: p.y + 0.5 }), '#4de2ff', 3, glow);
  ctx.strokeStyle = withAlpha('#4de2ff', 0.25);
  ctx.lineWidth = 1.2;
  ctx.stroke(body);
}

// ------------------------------------------------------------------ 角色
/** 把骨架畫成一個人。flat 有值時畫成單色剪影（殘影、虛影用）。 */
export function drawRig(ctx, char, joints, opts = {}) {
  const { flat = null, flash = 0, alpha = 1, t = 0 } = opts;
  const color = flat || (flash > 0 ? mixHex(char.color, '#ffffff', Math.min(1, flash)) : char.color);
  const accent = flat || char.accent;
  const core = flat ? withAlpha(flat, 0.18) : '#0a0c18';
  const lw = 2.6 * (char.build.limb || 1);
  const glow = flat ? 1.4 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  const J = joints;
  const plate = (path, c = color, width = lw) => neonPlate(ctx, path, c, { core, width, glow });

  // --- 背部零件（在身體之前） ---
  drawBackPiece(ctx, char, J, { color, accent, core, t, flat });

  // --- 後側手腳（較暗） ---
  const backColor = flat ? flat : withAlpha(char.color, 0.55);
  plate(taperPath(J.hip.x, J.hip.y, J.kneeB.x, J.kneeB.y, 6.5, 5), backColor, lw * 0.9);
  plate(taperPath(J.kneeB.x, J.kneeB.y, J.footB.x, J.footB.y, 5, 3.6), backColor, lw * 0.9);
  plate(taperPath(J.shoulderB.x, J.shoulderB.y, J.elbowB.x, J.elbowB.y, 5.2, 4.2), backColor, lw * 0.85);
  plate(taperPath(J.elbowB.x, J.elbowB.y, J.handB.x, J.handB.y, 4.2, 3.4), backColor, lw * 0.85);

  // --- 軀幹：六角形板 ---
  const torso = polyPath([
    { x: J.hip.x - 9, y: J.hip.y + 2 },
    { x: J.hip.x + 9, y: J.hip.y + 2 },
    { x: J.chest.x + 12, y: J.chest.y + 4 },
    { x: J.chest.x + 10, y: J.chest.y - 6 },
    { x: J.chest.x - 10, y: J.chest.y - 6 },
    { x: J.chest.x - 12, y: J.chest.y + 4 },
  ]);
  plate(torso, color, lw + 0.6);
  // 胸口核心
  glowFill(ctx, ngonPath(lerp(J.hip.x, J.chest.x, 0.55), lerp(J.hip.y, J.chest.y, 0.55), 4.6, 6, t * 1.2), accent, flat ? 0.4 : 0.9);

  // --- 前側手腳 ---
  plate(taperPath(J.hip.x, J.hip.y, J.kneeF.x, J.kneeF.y, 7, 5.4));
  plate(taperPath(J.kneeF.x, J.kneeF.y, J.footF.x, J.footF.y, 5.4, 4));
  drawShoulder(ctx, char, J, { color, accent, core, lw, flat });
  plate(taperPath(J.shoulderF.x, J.shoulderF.y, J.elbowF.x, J.elbowF.y, 5.6, 4.6));
  plate(taperPath(J.elbowF.x, J.elbowF.y, J.handF.x, J.handF.y, 4.6, 3.8));

  // --- 頭 ---
  drawHead(ctx, char, J, { color, accent, core, lw, flat, t });

  // --- 武器（握在前手） ---
  drawWeapon(ctx, char, J, { color, accent, core, lw, flat, t });

  ctx.restore();
}

function drawShoulder(ctx, char, J, { color, accent, core, lw, flat }) {
  const s = J.shoulderF;
  const style = char.look.shoulder || 'slim';
  if (style === 'slim') {
    neonPlate(ctx, circlePath(s.x, s.y, 5.4), color, { core, width: lw });
  } else if (style === 'plate') {
    neonPlate(ctx, polyPath([
      { x: s.x - 8, y: s.y - 7 }, { x: s.x + 9, y: s.y - 5 },
      { x: s.x + 8, y: s.y + 6 }, { x: s.x - 8, y: s.y + 5 },
    ]), color, { core, width: lw });
  } else {
    // bulk：厚重護肩，剪影一眼就是重裝
    neonPlate(ctx, polyPath([
      { x: s.x - 12, y: s.y - 10 }, { x: s.x + 13, y: s.y - 8 },
      { x: s.x + 14, y: s.y + 7 }, { x: s.x - 10, y: s.y + 8 },
    ]), color, { core, width: lw + 0.4 });
    if (!flat) glowFill(ctx, circlePath(s.x + 4, s.y - 1, 2.8), accent, 0.9);
  }
}

function drawHead(ctx, char, J, { color, accent, core, lw, flat, t }) {
  const h = J.head;
  const r = 10.5 * (char.build.head || 1);
  const style = char.look.head;
  const plate = (p, c = color, w = lw) => neonPlate(ctx, p, c, { core, width: w });
  // 脖子
  plate(taperPath(J.neck.x, J.neck.y, h.x, h.y + r * 0.6, 4, 3.4));

  switch (style) {
    case 'visor':
      plate(ngonPath(h.x, h.y, r, 6, 0.5));
      if (!flat) glowFill(ctx, polyPath([
        { x: h.x - 2, y: h.y - 2 }, { x: h.x + r * 0.95, y: h.y - 4 },
        { x: h.x + r * 0.95, y: h.y + 2 }, { x: h.x - 2, y: h.y + 3 },
      ]), accent, 1);
      break;
    case 'crown': {
      plate(circlePath(h.x, h.y, r));
      const spikes = [];
      for (let i = 0; i < 4; i++) {
        const a = -1.5 + i * 0.45;
        spikes.push(polyPath([
          { x: h.x + Math.cos(a) * r * 0.7, y: h.y + Math.sin(a) * r * 0.7 },
          { x: h.x + Math.cos(a - 0.14) * (r + 12 + i * 3), y: h.y + Math.sin(a - 0.14) * (r + 12 + i * 3) },
          { x: h.x + Math.cos(a + 0.2) * r * 0.9, y: h.y + Math.sin(a + 0.2) * r * 0.9 },
        ]));
      }
      for (const s of spikes) neonPlate(ctx, s, accent, { core, width: lw * 0.8 });
      if (!flat) glowFill(ctx, circlePath(h.x + 4, h.y - 1, 2.4), accent, 1);
      break;
    }
    case 'mask':
      plate(polyPath([
        { x: h.x - r * 0.8, y: h.y - r }, { x: h.x + r, y: h.y - r * 0.7 },
        { x: h.x + r * 0.9, y: h.y + r * 0.8 }, { x: h.x - r * 0.9, y: h.y + r * 0.6 },
      ]));
      if (!flat) {
        glowFill(ctx, polyPath([
          { x: h.x + 1, y: h.y - 3 }, { x: h.x + r * 0.95, y: h.y - 5 }, { x: h.x + r * 0.9, y: h.y - 1 },
        ]), accent, 1);
      }
      break;
    case 'antenna':
      plate(ngonPath(h.x, h.y, r * 0.95, 5, -0.3));
      neonStroke(ctx, linePath({ x: h.x - 2, y: h.y - r * 0.7 }, { x: h.x - 12, y: h.y - r - 16 }), accent, 2, 1);
      if (!flat) glowFill(ctx, circlePath(h.x - 12, h.y - r - 17, 3), accent, 1);
      break;
    case 'prism':
      plate(polyPath([
        { x: h.x, y: h.y - r * 1.5 }, { x: h.x + r, y: h.y },
        { x: h.x, y: h.y + r * 1.1 }, { x: h.x - r, y: h.y },
      ]));
      if (!flat) glowFill(ctx, circlePath(h.x, h.y, r * 0.35), '#ffffff', 0.9);
      break;
    case 'hood': {
      plate(polyPath([
        { x: h.x - r * 1.1, y: h.y + r * 0.9 }, { x: h.x - r * 0.9, y: h.y - r * 0.6 },
        { x: h.x + r * 0.2, y: h.y - r * 1.5 }, { x: h.x + r * 1.1, y: h.y - r * 0.2 },
        { x: h.x + r * 0.9, y: h.y + r * 0.9 },
      ]));
      if (!flat) {
        glowFill(ctx, circlePath(h.x + 3, h.y + 1, 2.6), accent, 1);
        glowFill(ctx, circlePath(h.x + 8, h.y + 1, 1.8), accent, 0.8);
      }
      break;
    }
    case 'horns': {
      plate(ngonPath(h.x, h.y, r, 6, 0.2));
      for (const s of [-1, 1]) {
        neonPlate(ctx, polyPath([
          { x: h.x + s * r * 0.5, y: h.y - r * 0.6 },
          { x: h.x + s * (r + 10), y: h.y - r - 12 },
          { x: h.x + s * r * 0.2, y: h.y - r * 0.2 },
        ]), accent, { core, width: lw * 0.8 });
      }
      if (!flat) glowFill(ctx, polyPath([
        { x: h.x - 1, y: h.y }, { x: h.x + r * 0.9, y: h.y - 3 }, { x: h.x + r * 0.9, y: h.y + 3 },
      ]), accent, 1);
      break;
    }
    case 'helm':
      plate(polyPath([
        { x: h.x - r, y: h.y + r * 0.7 }, { x: h.x - r * 0.9, y: h.y - r * 0.8 },
        { x: h.x + r * 0.4, y: h.y - r * 1.2 }, { x: h.x + r * 1.15, y: h.y - r * 0.2 },
        { x: h.x + r, y: h.y + r * 0.8 },
      ]));
      neonPlate(ctx, polyPath([
        { x: h.x - 2, y: h.y - r * 1.15 }, { x: h.x + 2, y: h.y - r * 2.1 }, { x: h.x + 6, y: h.y - r * 1.05 },
      ]), accent, { core, width: lw * 0.7 });
      if (!flat) glowFill(ctx, polyPath([
        { x: h.x + 1, y: h.y - 2 }, { x: h.x + r * 1.05, y: h.y - 4 }, { x: h.x + r, y: h.y + 1 },
      ]), accent, 1);
      break;
    case 'halo':
      plate(circlePath(h.x, h.y, r * 0.92));
      if (!flat) {
        ctx.save();
        ctx.translate(h.x, h.y - r - 8);
        ctx.scale(1, 0.34);
        neonStroke(ctx, circlePath(0, 0, r + 6), accent, 2.4, 1.4);
        ctx.restore();
        glowFill(ctx, circlePath(h.x + 3, h.y, 2.4), accent, 1);
      }
      break;
    case 'oni':
    default:
      plate(polyPath([
        { x: h.x - r * 0.9, y: h.y - r * 0.9 }, { x: h.x + r * 0.95, y: h.y - r * 1.05 },
        { x: h.x + r * 1.05, y: h.y + r * 0.5 }, { x: h.x - r * 0.2, y: h.y + r * 1.1 },
        { x: h.x - r, y: h.y + r * 0.3 },
      ]));
      if (!flat) {
        glowFill(ctx, polyPath([
          { x: h.x - 2, y: h.y - 4 }, { x: h.x + r * 0.95, y: h.y - 6 }, { x: h.x + r * 0.9, y: h.y - 1 },
        ]), accent, 1);
      }
      break;
  }
}

function drawBackPiece(ctx, char, J, { color, accent, core, t, flat }) {
  const style = char.look.back;
  const c = J.chest;
  const lw = 2.4;
  const plate = (p, col = color, w = lw) => neonPlate(ctx, p, col, { core, width: w, alpha: flat ? 0.8 : 1 });
  const flap = Math.sin(t * 3.2) * 0.12;

  switch (style) {
    case 'wings':
      for (const s of [0, 1]) {
        const spread = s === 0 ? 1 : 0.62;
        plate(polyPath([
          { x: c.x - 4, y: c.y - 2 },
          { x: c.x - 34 * spread, y: c.y - 30 * spread - flap * 40 },
          { x: c.x - 44 * spread, y: c.y + 2 * spread },
          { x: c.x - 18 * spread, y: c.y + 16 * spread },
        ]), s === 0 ? color : accent, lw * (s === 0 ? 1 : 0.8));
      }
      break;
    case 'cape': {
      const sway = Math.sin(t * 2.4) * 8;
      plate(polyPath([
        { x: c.x + 2, y: c.y - 6 },
        { x: c.x - 10, y: c.y - 4 },
        { x: c.x - 26 - sway, y: c.y + 40 },
        { x: c.x - 6 - sway * 0.5, y: c.y + 52 },
        { x: c.x + 8, y: c.y + 30 },
      ]), color, lw);
      break;
    }
    case 'banner': {
      const sway = Math.sin(t * 2.0) * 6;
      neonStroke(ctx, linePath({ x: c.x - 6, y: c.y - 14 }, { x: c.x - 10, y: c.y + 54 }), accent, 2, 1);
      plate(polyPath([
        { x: c.x - 8, y: c.y - 10 }, { x: c.x - 30 - sway, y: c.y + 6 },
        { x: c.x - 26 - sway, y: c.y + 30 }, { x: c.x - 9, y: c.y + 26 },
      ]), color, lw * 0.9);
      break;
    }
    case 'coil':
      for (let i = 0; i < 3; i++) {
        const r = 8 + i * 5;
        const a = t * (2 + i) + i;
        ctx.save();
        ctx.translate(c.x - 12, c.y + 4 + i * 4);
        ctx.rotate(a * 0.4);
        ctx.scale(1, 0.4);
        neonStroke(ctx, circlePath(0, 0, r), i === 1 ? accent : color, 2, 1.2);
        ctx.restore();
      }
      break;
    case 'drone': {
      const hover = Math.sin(t * 2.6) * 4;
      const dx = c.x - 34, dy = c.y - 26 + hover;
      plate(ngonPath(dx, dy, 9, 6, t * 0.8), accent, lw);
      if (!flat) {
        glowFill(ctx, circlePath(dx, dy, 3.4), '#ffffff', 0.9);
        neonStroke(ctx, linePath({ x: dx, y: dy }, { x: c.x - 8, y: c.y }), accent, 1.2, 0.8);
      }
      break;
    }
    case 'tail': {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const k = i / 5;
        pts.push({
          x: c.x - 6 - k * 46,
          y: c.y + 18 + Math.sin(t * 3 + k * 3) * 10 * k + k * 18,
        });
      }
      for (let i = 0; i < pts.length - 1; i++) {
        plate(taperPath(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 5.5 - i * 0.8, 4.6 - i * 0.8), color, lw * 0.8);
      }
      break;
    }
    case 'core': {
      const r = 11 + Math.sin(t * 4) * 1.5;
      plate(ngonPath(c.x - 20, c.y + 6, r, 6, t * 0.6), color, lw);
      if (!flat) glowFill(ctx, circlePath(c.x - 20, c.y + 6, r * 0.5), accent, 1);
      break;
    }
    case 'jets': {
      for (const s of [-1, 1]) {
        const jx = c.x - 20, jy = c.y + 2 + s * 9;
        plate(polyPath([
          { x: jx - 12, y: jy - 5 }, { x: jx + 4, y: jy - 6 },
          { x: jx + 4, y: jy + 6 }, { x: jx - 12, y: jy + 5 },
        ]), color, lw * 0.9);
        if (!flat) {
          const len = 10 + Math.sin(t * 18 + s) * 4;
          glowFill(ctx, polyPath([
            { x: jx - 12, y: jy - 4 }, { x: jx - 12 - len, y: jy }, { x: jx - 12, y: jy + 4 },
          ]), accent, 0.85);
        }
      }
      break;
    }
    case 'blades':
      for (const s of [-1, 1]) {
        plate(polyPath([
          { x: c.x - 6, y: c.y + 4 },
          { x: c.x - 30 - s * 6, y: c.y - 24 * s - 6 },
          { x: c.x - 24 - s * 6, y: c.y - 20 * s - 2 },
        ]), s > 0 ? accent : color, lw * 0.8);
      }
      break;
    default:
      break;
  }
}

function drawWeapon(ctx, char, J, { color, accent, core, lw, flat, t }) {
  const h = J.handF;
  const e = J.elbowF;
  const ang = Math.atan2(h.y - e.y, h.x - e.x);
  const style = char.look.weapon;
  const plate = (p, col = color, w = lw) => neonPlate(ctx, p, col, { core, width: w });
  const along = (d, o = 0) => ({
    x: h.x + Math.cos(ang) * d - Math.sin(ang) * o,
    y: h.y + Math.sin(ang) * d + Math.cos(ang) * o,
  });

  switch (style) {
    case 'gauntlet':
      plate(ngonPath(h.x, h.y, 8.5, 6, ang), color, lw + 0.4);
      if (!flat) glowFill(ctx, circlePath(h.x, h.y, 3.4), accent, 1);
      break;
    case 'blade': {
      const tip = along(56), base = along(6);
      plate(polyPath([
        { x: base.x, y: base.y - 3 }, { x: tip.x, y: tip.y },
        { x: base.x, y: base.y + 5 },
      ]), accent, lw);
      plate(circlePath(h.x, h.y, 5.4), color, lw);
      break;
    }
    case 'twin': {
      for (const s of [-1, 1]) {
        const tip = along(34 * 1, s * 9);
        plate(polyPath([
          { x: h.x, y: h.y - 2 }, { x: tip.x, y: tip.y }, { x: h.x + 3, y: h.y + 4 },
        ]), s > 0 ? accent : color, lw * 0.9);
      }
      plate(circlePath(h.x, h.y, 5), color, lw);
      break;
    }
    case 'spear': {
      const tip = along(78), tail = along(-34);
      plate(taperPath(tail.x, tail.y, tip.x, tip.y, 2.6, 2.2), color, lw * 0.8);
      plate(polyPath([
        along(52, -6), { x: tip.x, y: tip.y }, along(52, 6),
      ]), accent, lw * 0.9);
      break;
    }
    case 'claws':
      for (let i = -1; i <= 1; i++) {
        const tip = along(26 + Math.abs(i) * -4, i * 7);
        plate(polyPath([
          { x: h.x, y: h.y + i * 2 }, { x: tip.x, y: tip.y }, { x: h.x + 2, y: h.y + i * 2 + 3 },
        ]), i === 0 ? accent : color, lw * 0.8);
      }
      break;
    case 'staff': {
      const tip = along(48), tail = along(-40);
      plate(taperPath(tail.x, tail.y, tip.x, tip.y, 2.8, 2.4), color, lw * 0.8);
      plate(ngonPath(tip.x, tip.y, 8, 6, t), accent, lw * 0.9);
      if (!flat) glowFill(ctx, circlePath(tip.x, tip.y, 3.6), '#ffffff', 0.85);
      break;
    }
    case 'orbstaff': {
      const tip = along(46), tail = along(-30);
      plate(taperPath(tail.x, tail.y, tip.x, tip.y, 2.6, 2.2), color, lw * 0.8);
      if (!flat) {
        glowFill(ctx, circlePath(tip.x, tip.y, 9 + Math.sin(t * 5) * 1.5), accent, 0.6);
        glowFill(ctx, circlePath(tip.x, tip.y, 4), '#ffffff', 0.9);
      }
      break;
    }
    case 'hammer': {
      const tip = along(48), tail = along(-14);
      plate(taperPath(tail.x, tail.y, tip.x, tip.y, 3.4, 3), color, lw * 0.9);
      plate(polyPath([
        along(38, -16), along(62, -14), along(62, 14), along(38, 16),
      ]), accent, lw + 0.4);
      break;
    }
    case 'shield': {
      const c0 = along(16);
      plate(polyPath([
        { x: c0.x - 6, y: c0.y - 26 }, { x: c0.x + 14, y: c0.y - 18 },
        { x: c0.x + 16, y: c0.y + 16 }, { x: c0.x - 4, y: c0.y + 28 },
        { x: c0.x - 12, y: c0.y + 2 },
      ]), color, lw + 0.6);
      if (!flat) glowFill(ctx, ngonPath(c0.x + 2, c0.y, 6, 6, t * 0.5), accent, 0.9);
      break;
    }
    default:
      plate(circlePath(h.x, h.y, 5.5), color, lw);
      break;
  }
}

/** 角色完整繪製（含影子）。snap 可以是活著的 fighter，也可以是殘影快照。 */
export function drawFighter(ctx, f, opts = {}) {
  const char = f.char;
  const joints = poseFor(f.pose, f.poseK, f.phase);
  const scale = char.build.scale || 1;
  const { flat = null, alpha = 1, shadow = true } = opts;

  if (shadow && !flat) {
    ctx.save();
    ctx.translate(f.x, f.y + 2);
    ctx.scale(1, 0.26);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill(circlePath(0, 0, 26 * scale));
    ctx.restore();
  }

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.facing * scale, scale);
  drawRig(ctx, char, joints, { flat, alpha, flash: f.hitFlash || 0, t: f.animTime || 0 });
  ctx.restore();

  // 狀態異常的附著特效
  if (!flat) drawStatus(ctx, f);
}

function drawStatus(ctx, f) {
  const cx = f.x, cy = f.y - 56;
  if (f.freeze > 0) {
    ctx.save();
    const p = polyPath([
      { x: cx - 26, y: cy + 54 }, { x: cx - 30, y: cy - 16 }, { x: cx - 14, y: cy - 56 },
      { x: cx + 12, y: cy - 60 }, { x: cx + 30, y: cy - 20 }, { x: cx + 26, y: cy + 54 },
    ]);
    ctx.fillStyle = 'rgba(155,232,255,0.22)';
    ctx.fill(p);
    neonStroke(ctx, p, '#9be8ff', 2, 1.2);
    ctx.restore();
  }
  if (f.burn > 0) {
    for (let i = 0; i < 3; i++) {
      const a = f.animTime * 6 + i * 2.1;
      glowFill(ctx, circlePath(cx + Math.sin(a) * 16, cy - 10 + Math.cos(a * 1.3) * 26, 4 + Math.sin(a * 2) * 2), '#ff7a3c', 0.5);
    }
  }
  if (f.poison > 0) {
    for (let i = 0; i < Math.min(6, f.poison); i++) {
      const a = f.animTime * 2 + (TAU * i) / 6;
      glowFill(ctx, ngonPath(cx + Math.cos(a) * 24, cy + Math.sin(a) * 30, 3, 6, a), '#b46bff', 0.7);
    }
  }
  if (f.shockTime > 0) {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU;
      glowFill(ctx, starPath(cx + Math.cos(a) * 22, cy + Math.sin(a) * 30, 4, 9, 3, a), '#fff27a', 0.8);
    }
  }
  if (f.dr > 0 && f.drTime > 0) {
    ctx.save();
    const r = 58 + Math.sin(f.animTime * 5) * 3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    neonStroke(ctx, circlePath(cx, cy - 4, r), f.char.accent, 2, 1.2);
    for (let i = 0; i < 6; i++) {
      const a = f.animTime * 0.8 + (TAU * i) / 6;
      neonStroke(ctx, ngonPath(cx + Math.cos(a) * r * 0.82, cy - 4 + Math.sin(a) * r * 0.82, 9, 6, a), f.char.color, 1.6, 1);
    }
    ctx.restore();
  }
}

/** 給選角／商店用：把角色畫在指定位置（不需要 fighter 實體） */
export function drawPortrait(ctx, char, x, y, scale, t, pose = 'idle') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * (char.build.scale || 1), scale * (char.build.scale || 1));
  drawRig(ctx, char, poseFor(pose, 0.5, t * 3), { t });
  ctx.restore();
}
