// 繪製層：場景與角色（寫實路線）。
//
// 角色不是線條人，而是一塊一塊上了光的body：每根骨頭畫成有體積的膠囊，
// 盔甲是分片的金屬板，武器有金屬高光，背光側有一道角色色的輪廓光，
// 腳下有接地陰影、濕地板上有倒影。材質與打光的工具在 material.js。
//
// 場景是黃昏的工業廢場：遠景大樓、鐵塔與吊車、探照燈光柱、鐵網圍欄、
// 積水的水泥地。靜態的部分只畫一次進 offscreen canvas，每幀只疊動態的霧、雨與燈光。

import {
  MAT, LIGHT, RIM, tint, mixColor, capsule, poly, smooth, ovalPath, limbPath, bladeShape,
  shade, shadeLimb, groundShadow, puff, bloom, grainPattern,
} from './material.js';
import { poseFor } from './rig.js';
import { withAlpha, lerp, clamp, makeRng, rand } from './util.js';
import { text } from './gfx.js';

export const WORLD = { w: 1900, h: 720, ground: 600, left: 40, right: 1860, view: 1280 };

// ==================================================================
// 場景
// ==================================================================
let backdrop = null;      // 預先畫好的靜態背景
let backdropW = 0;

function buildBackdrop() {
  const w = WORLD.w + 200;
  const h = WORLD.ground + 40;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  const rng = makeRng(88123);

  // --- 天空：黃昏的髒橘到夜藍 ---
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b1020');
  sky.addColorStop(0.42, '#243048');
  sky.addColorStop(0.72, '#6b5a5a');
  sky.addColorStop(0.88, '#b2765a');
  sky.addColorStop(1, '#d99a63');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  // 雲：拉長的柔邊橢圓
  for (let i = 0; i < 26; i++) {
    const x = rng() * w;
    const y = 60 + rng() * (h * 0.5);
    const rx = 120 + rng() * 260;
    const ry = 14 + rng() * 26;
    const a = 0.05 + rng() * 0.10;
    const g = c.createRadialGradient(x, y, 0, x, y, rx);
    const col = y > h * 0.4 ? '#d9a57a' : '#2b3550';
    g.addColorStop(0, withAlpha(col, a));
    g.addColorStop(1, withAlpha(col, 0));
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // --- 遠景城市（霧化） ---
  const drawBlocks = (baseY, minH, maxH, col, fog, step) => {
    let x = -60;
    while (x < w + 60) {
      const bw = step * (0.6 + rng() * 0.9);
      const bh = minH + rng() * (maxH - minH);
      // 每棟樓自己有明暗：頂端受天光、底部沉進陰影，才不是一塊紙板
      const bg = c.createLinearGradient(x, baseY - bh, x + bw * 0.6, baseY);
      bg.addColorStop(0, mixColor(col, '#8fa0c0', 0.3 - fog * 0.2));
      bg.addColorStop(0.35, col);
      bg.addColorStop(1, mixColor(col, '#05070c', 0.45));
      c.fillStyle = bg;
      c.fillRect(x, baseY - bh, bw, bh);
      // 受光側的邊緣亮線
      c.fillStyle = withAlpha('#c9d6ef', 0.1 + (1 - fog) * 0.08);
      c.fillRect(x, baseY - bh, 1.5, bh);
      c.fillRect(x, baseY - bh, bw, 1.5);
      // 屋頂設備
      c.fillStyle = mixColor(col, '#05070c', 0.3);
      if (rng() > 0.6) c.fillRect(x + bw * 0.2, baseY - bh - 8 - rng() * 14, bw * 0.25, 14);
      // 窗光
      if (fog < 0.5) {
        for (let wy = baseY - bh + 10; wy < baseY - 8; wy += 13) {
          for (let wx = x + 5; wx < x + bw - 6; wx += 10) {
            if (rng() > 0.86) {
              c.fillStyle = withAlpha(rng() > 0.5 ? '#ffd9a0' : '#9fd8ff', 0.5 + rng() * 0.4);
              c.fillRect(wx, wy, 3, 5);
            }
          }
        }
      }
      x += bw + 4 + rng() * 18;
    }
  };
  drawBlocks(WORLD.ground - 120, 120, 300, '#39435c', 0.55, 90);   // 最遠：被霧洗淡
  drawBlocks(WORLD.ground - 60, 90, 240, '#242c3d', 0.34, 110);
  drawBlocks(WORLD.ground - 10, 70, 190, '#141922', 0.16, 130);    // 最近：幾乎全黑

  // 大氣透視：靠近地平線越濁，遠景自然退後
  const haze = c.createLinearGradient(0, WORLD.ground - 340, 0, WORLD.ground);
  haze.addColorStop(0, 'rgba(120,120,140,0)');
  haze.addColorStop(0.55, 'rgba(150,130,120,0.18)');
  haze.addColorStop(1, 'rgba(190,150,120,0.34)');
  c.fillStyle = haze;
  c.fillRect(0, WORLD.ground - 340, w, 340);

  // --- 工業結構：吊車與鐵塔 ---
  const steel = '#141922';
  const drawCrane = (x, baseY, scale) => {
    c.save();
    c.translate(x, baseY);
    c.scale(scale, scale);
    c.fillStyle = steel;
    c.fillRect(-9, -260, 18, 260);
    for (let i = 0; i < 9; i++) {
      c.fillRect(-9, -250 + i * 28, 18, 3);
      c.save();
      c.translate(0, -250 + i * 28);
      c.rotate(0.5);
      c.fillRect(-1.5, 0, 3, 30);
      c.restore();
    }
    c.fillRect(-140, -268, 300, 12);           // 吊臂
    c.fillRect(70, -256, 6, 60);               // 吊索
    c.fillRect(56, -196, 34, 18);              // 吊鉤
    c.restore();
  };
  drawCrane(250, WORLD.ground - 40, 1);
  drawCrane(1500, WORLD.ground - 30, 0.85);

  // 煙囪 + 排煙
  for (const [cx, sc] of [[760, 1], [1180, 0.8]]) {
    c.fillStyle = '#171d27';
    c.fillRect(cx - 16 * sc, WORLD.ground - 300 * sc, 32 * sc, 300 * sc);
    for (let i = 0; i < 6; i++) {
      const g = c.createRadialGradient(cx, WORLD.ground - 300 * sc - i * 26, 0, cx, WORLD.ground - 300 * sc - i * 26, 40 + i * 12);
      g.addColorStop(0, `rgba(190,190,200,${0.10 - i * 0.012})`);
      g.addColorStop(1, 'rgba(190,190,200,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, WORLD.ground - 300 * sc - i * 26, 40 + i * 12, 0, Math.PI * 2);
      c.fill();
    }
  }

  // --- 鐵網圍欄（中景）---
  // 矮一點、淡一點：它是場地的邊界，不該比打架的人還搶眼
  c.save();
  c.globalAlpha = 0.34;
  c.strokeStyle = '#0b0e14';
  c.lineWidth = 1;
  for (let x = -40; x < w + 40; x += 16) {
    c.beginPath();
    c.moveTo(x, WORLD.ground - 104);
    c.lineTo(x + 16, WORLD.ground);
    c.moveTo(x + 16, WORLD.ground - 104);
    c.lineTo(x, WORLD.ground);
    c.stroke();
  }
  c.globalAlpha = 0.85;
  c.fillStyle = '#0b0e15';
  for (let x = -40; x < w + 60; x += 210) {
    c.fillRect(x, WORLD.ground - 118, 5, 118);
    c.fillStyle = 'rgba(190,205,235,0.12)';     // 柱子受光的那一側
    c.fillRect(x, WORLD.ground - 118, 1.2, 118);
    c.fillStyle = '#0b0e15';
  }
  c.fillRect(0, WORLD.ground - 120, w, 4);
  c.restore();

  // --- 落在地面前的整體陰影：背景越靠近腳邊越沉，人物才跳得出來 ---
  const sink = c.createLinearGradient(0, WORLD.ground - 170, 0, WORLD.ground);
  sink.addColorStop(0, 'rgba(6,8,14,0)');
  sink.addColorStop(1, 'rgba(6,8,14,0.4)');
  c.fillStyle = sink;
  c.fillRect(0, WORLD.ground - 170, w, 170);

  backdrop = cv;
  backdropW = w;
  return cv;
}

/** 探照燈的光柱（動態，每幀畫） */
function drawLightShafts(ctx, t) {
  const lights = [
    { x: 340, y: WORLD.ground - 330, a: 0.22, spread: 90, col: '#ffd9a0' },
    { x: 980, y: WORLD.ground - 380, a: 0.16, spread: 110, col: '#cfe4ff' },
    { x: 1560, y: WORLD.ground - 320, a: 0.2, spread: 84, col: '#ffc98a' },
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 模糊一下，光柱才不會是一塊硬邊的梯形
  if (typeof ctx.filter === 'string') ctx.filter = 'blur(16px)';
  for (const L of lights) {
    const flick = 0.82 + 0.18 * Math.sin(t * 7.3 + L.x);
    const g = ctx.createLinearGradient(L.x, L.y, L.x, WORLD.ground);
    g.addColorStop(0, withAlpha(L.col, 0.12 * L.a * flick));
    g.addColorStop(1, withAlpha(L.col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(L.x - 16, L.y);
    ctx.lineTo(L.x + 16, L.y);
    ctx.lineTo(L.x + L.spread, WORLD.ground);
    ctx.lineTo(L.x - L.spread, WORLD.ground);
    ctx.closePath();
    ctx.fill();
  }
  if (typeof ctx.filter === 'string') ctx.filter = 'none';
  for (const L of lights) {
    const flick = 0.82 + 0.18 * Math.sin(t * 7.3 + L.x);
    bloom(ctx, L.x, L.y, 14 * flick, L.col, 0.5 * L.a);
  }
  ctx.restore();
}

/**
 * 前景：鏡頭前方那一層失焦的鐵件。
 * 打完人物之後再壓上去，畫面立刻有「前／中／後」三層深度。
 */
export function drawForeground(ctx, camX) {
  ctx.save();
  ctx.translate(-camX * 0.4, 0);
  // 頭頂的鋼樑：只壓畫面上緣，不擋住打架的人
  ctx.fillStyle = 'rgba(4,5,9,0.92)';
  for (const bx of [-300, 900, 2100]) {
    ctx.fillRect(bx, -240, 1100, 210);
    ctx.fillStyle = 'rgba(150,168,200,0.08)';
    ctx.fillRect(bx, -32, 1100, 3);
    ctx.fillStyle = 'rgba(4,5,9,0.92)';
    // 垂下來的吊索
    ctx.fillRect(bx + 260, -30, 4, 60);
    ctx.fillRect(bx + 700, -30, 4, 96);
  }
  // 腳前的地面陰影，人物才像站在坑裡打
  const g = ctx.createLinearGradient(0, WORLD.h - 120, 0, WORLD.h + 40);
  g.addColorStop(0, 'rgba(3,4,8,0)');
  g.addColorStop(1, 'rgba(3,4,8,0.8)');
  ctx.fillStyle = g;
  ctx.fillRect(-600, WORLD.h - 120, WORLD.w + 1200, 200);
  ctx.restore();
}

/** 飄動的霧層 */
function drawFog(ctx, t, camX) {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const y = WORLD.ground - 40 - i * 46;
    const off = ((t * (9 + i * 7) - camX * 0.1) % (WORLD.w + 600)) - 300;
    const g = ctx.createLinearGradient(0, y - 60, 0, y + 40);
    g.addColorStop(0, 'rgba(150,160,180,0)');
    g.addColorStop(0.5, `rgba(150,160,180,${0.05 + i * 0.015})`);
    g.addColorStop(1, 'rgba(150,160,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-400 + off * 0.2, y - 60, WORLD.w + 800, 100);
  }
  ctx.restore();
}

/**
 * 背景。**畫在世界座標裡**（和地面同一個鏡頭變換），
 * 只在水平方向做視差位移 —— 這樣地平線永遠貼齊地面，
 * 鏡頭拉遠拉近都不會出現「天空和地板對不上」的接縫。
 */
export function drawSky(ctx, t, tintColor = '#3a2a6b', camX = 0) {
  if (!backdrop) buildBackdrop();
  ctx.save();
  // 鏡頭可能拍到世界上方，先鋪滿夜空底色
  ctx.fillStyle = '#0a0e1c';
  ctx.fillRect(-600, -700, WORLD.w + 1200, 1400);
  ctx.translate(camX * 0.22, 0);
  ctx.drawImage(backdrop, -100, 0);
  drawLightShafts(ctx, t);
  ctx.restore();
}

/** 地面：濕水泥、裂縫、積水與倒影用的資訊 */
export function drawGround(ctx, t) {
  const { w, ground, h } = WORLD;
  // 地板本體
  const g = ctx.createLinearGradient(0, ground, 0, h + 120);
  g.addColorStop(0, '#22242a');
  g.addColorStop(0.25, '#15171b');
  g.addColorStop(1, '#090a0d');
  ctx.fillStyle = g;
  ctx.fillRect(-400, ground, w + 800, h - ground + 400);

  // 地磚縫與裂痕
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  for (let x = -400; x < w + 400; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.lineTo(x - 60, h + 200);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const yy = ground + 18 + i * 34;
    ctx.beginPath();
    ctx.moveTo(-400, yy);
    ctx.lineTo(w + 400, yy + 6);
    ctx.stroke();
  }
  ctx.restore();

  // 濕柏油：地平線附近反射一點天光，越往前越暗
  const hl = ctx.createLinearGradient(0, ground - 2, 0, ground + 90);
  hl.addColorStop(0, 'rgba(210,160,120,0.18)');
  hl.addColorStop(0.35, 'rgba(120,110,120,0.06)');
  hl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-400, ground - 2, w + 800, 92);

  // 積水
  const rng = makeRng(4242);
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const px = rng() * w;
    const py = ground + 20 + rng() * 90;
    const rx = 40 + rng() * 90;
    const ry = rx * 0.16;
    const pg = ctx.createRadialGradient(px, py, 0, px, py, rx);
    pg.addColorStop(0, 'rgba(150,180,220,0.18)');
    pg.addColorStop(1, 'rgba(150,180,220,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 場地邊界：水泥護欄
  for (const wx of [WORLD.left, WORLD.right]) {
    const dir = wx === WORLD.left ? 1 : -1;
    ctx.save();
    const wall = poly([
      { x: wx - dir * 40, y: ground + 10 },
      { x: wx - dir * 40, y: ground - 150 },
      { x: wx, y: ground - 140 },
      { x: wx, y: ground + 10 },
    ]);
    shade(ctx, wall, MAT.rust, { cx: wx, cy: ground - 70, r: 90, ao: 0.5 });
    ctx.restore();
  }
}

export function drawPlatform(ctx, p, t) {
  // 工字鋼平台
  const body = poly([
    { x: p.x, y: p.y },
    { x: p.x + p.w, y: p.y },
    { x: p.x + p.w - 6, y: p.y + p.h },
    { x: p.x + 6, y: p.y + p.h },
  ]);
  shade(ctx, body, MAT.iron, { cx: p.x + p.w / 2, cy: p.y + p.h / 2, r: p.h * 2, ao: 0.6 });
  // 表面止滑紋
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = p.x + 8; x < p.x + p.w - 8; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, p.y + 2);
    ctx.lineTo(x + 6, p.y + p.h - 3);
    ctx.stroke();
  }
  ctx.restore();
  // 底下的支撐與陰影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(p.x + 14, p.y + p.h, p.w - 28, 6);
}

/** 雨：畫在最前面，帶速度線與地面濺起 */
export function drawRain(ctx, t, camX, intensity = 1) {
  const rng = makeRng(777);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(180,205,235,0.30)';
  ctx.lineWidth = 1.2;
  const count = Math.floor(150 * intensity);
  for (let i = 0; i < count; i++) {
    const sp = 700 + rng() * 500;
    const x0 = rng() * (WORLD.view + 300) - 150 + camX * 0.9;
    const y0 = ((rng() * 900 + t * sp) % 900) - 120;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 - 7, y0 + 26);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawArena(ctx, t, tintColor = '#3a2a6b') {
  ctx.save();
  ctx.translate(-(WORLD.w - WORLD.view) / 2, 0);
  drawSky(ctx, t, tintColor, 0);
  drawGround(ctx, t);
  drawFog(ctx, t, 0);
  ctx.restore();
}

export { drawFog };

// ==================================================================
// 角色
// ==================================================================

/** 依角色資料組出這個人身上所有材質 */
function materials(char) {
  const c = char.color;
  const p = char.palette || {};
  return {
    skin: MAT.skin,
    cloth: tint(MAT.cloth, p.cloth || c, 0.4),
    armor: tint(p.armorMat ? MAT[p.armorMat] : MAT.iron, p.armor || c, 0.32),
    metal: p.metalMat ? MAT[p.metalMat] : MAT.steel,
    iron: MAT.iron,
    darkIron: MAT.darkIron,
    bone: MAT.bone,
    strap: MAT.leather,
    rubber: MAT.rubber,
    accent: char.accent,
    rim: c,
  };
}

/**
 * 畫一位角色。
 * f 可以是活的 Fighter，也可以是靜態快照 { char, x, y, facing, pose, poseK, phase, animTime }
 */
export function drawFighter(ctx, f, opts = {}) {
  const { flat = null, alpha = 1, shadow = true, reflection = false, onlyReflection = false } = opts;
  const char = f.char;
  const J = poseFor(f.pose, f.poseK, f.phase);
  const scale = (char.build.scale || 1) * 1.12;

  if (shadow && !flat) {
    const height = WORLD.ground - f.y;
    groundShadow(ctx, f.x, WORLD.ground + 4, height, scale * 1.15);
  }

  if (!onlyReflection) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.facing * scale, scale);
    if (!flat) {
      // 輪廓光：整個人先用邊光色畫一次、往背光側推一點，
      // 正常的身體再蓋上去 —— 只有外框會露出那一圈光，不是每塊零件都在發光。
      ctx.save();
      ctx.translate(RIM.x * -2.2, RIM.y * -2.2);
      drawBody(ctx, char, J, f, { flat: mixColor(char.color, '#ffe4c4', 0.55), alpha: alpha * 0.55 });
      ctx.restore();
    }
    drawBody(ctx, char, J, f, { flat, alpha });
    ctx.restore();
  }

  if (reflection && !flat && f.y >= WORLD.ground - 2) {
    // 濕地板倒影：上下翻轉、壓扁、淡出
    ctx.save();
    ctx.globalAlpha = 0.16 * alpha;
    ctx.translate(f.x, WORLD.ground + 6);
    ctx.scale(f.facing * scale, -scale * 0.62);
    drawBody(ctx, char, J, f, { flat: null, alpha: 1, noRim: true });
    ctx.restore();
  }
}

function drawBody(ctx, char, J, f, { flat = null, alpha = 1, noRim = false } = {}) {
  const M = materials(char);
  const b = char.build;
  const bulk = b.bulk || 1;
  const rim = null;   // 邊光改成整體輪廓一次過（見 drawFighter），不再逐塊描邊
  const gear = char.gear || {};
  const t = f.animTime || 0;
  const hurt = f.hitFlash || 0;

  const mat = (m) => (flat ? { base: flat, light: flat, dark: flat, spec: 0, rough: 1 } : m);
  const opt = (cx, cy, r, extra = {}) => ({ cx, cy, r, rim, alpha, ...extra });

  // ---------- 背後的裝備 ----------
  drawBackGear(ctx, char, J, M, { mat, opt, t, bulk, flat });

  // ---------- 後側手腳（壓暗） ----------
  const backDim = (m) => (flat ? mat(m) : {
    ...m, base: mixColor(m.base, '#000000', 0.42), light: mixColor(m.light, '#000000', 0.4),
    dark: mixColor(m.dark, '#000000', 0.3),
  });
  shade(ctx, limbPath({ x: J.hip.x, y: J.hip.y - 3 }, J.kneeB, J.footB, 8.8 * bulk, 6 * bulk, 4 * bulk),
    backDim(M.cloth), opt(J.kneeB.x, J.kneeB.y, 26));
  drawBoot(ctx, J.footB, backDim(M.armor), bulk, opt(J.footB.x, J.footB.y, 12));
  shade(ctx, limbPath(J.shoulderB, J.elbowB, J.handB, 7.4 * bulk, 5.2 * bulk, 4 * bulk),
    backDim(M.cloth), opt(J.elbowB.x, J.elbowB.y, 22));
  shade(ctx, capsule(J.handB.x, J.handB.y, J.handB.x + 1, J.handB.y + 1, 4.4 * bulk), backDim(M.rubber), opt(J.handB.x, J.handB.y, 8));

  // ---------- 軀幹 ----------
  // 沿著髖→胸的軸線長出來，所以前傾／後仰時身體是整塊轉，不是方塊疊方塊。
  const hip = J.hip, chest = J.chest;
  const ux = chest.x - hip.x, uy = chest.y - hip.y;
  const ul = Math.hypot(ux, uy) || 1;
  const U = { x: ux / ul, y: uy / ul };
  const N = { x: -U.y, y: U.x };                 // 指向前方（面朝的一側）
  const W = bulk;
  const P = (a, s2) => ({ x: hip.x + U.x * a + N.x * s2, y: hip.y + U.y * a + N.y * s2 });

  // 骨盆 → 腰（收）→ 肋骨 → 胸 → 肩：寬肩細腰的人體輪廓
  const torsoPath = smooth([
    P(-7, 10.2 * W), P(8, 8.8 * W), P(20, 12.4 * W), P(30, 15 * W),
    P(38, 10.6 * W), P(42, 4.6 * W),
    P(42, -5.6 * W), P(36, -13.2 * W), P(24, -13.4 * W),
    P(10, -9.6 * W), P(-7, -11 * W),
  ], 0.92);
  shade(ctx, torsoPath, mat(M.cloth), opt(chest.x, (hip.y + chest.y) / 2, 28 * bulk, { ao: 0.35 }));

  // 胸甲／背心
  if (gear.chest !== 'bare') {
    // 胸甲是一片有稜有角的鐵板，不是圓球
    const cp = smooth([
      P(41, 9 * W), P(43, 0), P(40, -8 * W), P(29, -12 * W),
      P(16, -9.5 * W), P(12, 0), P(16, 10 * W), P(29, 13.5 * W),
    ], 0.3);
    shade(ctx, cp, mat(M.armor), opt(chest.x, chest.y + 4, 24 * bulk, { ao: 0.32 }));
    if (!flat) {
      ctx.save();
      ctx.clip(cp);
      // 胸口的隊色塗裝（磨損過的噴漆，不是發光貼紙）
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = char.color;
      ctx.fill(poly([P(44, 3.4 * W), P(44, -3.4 * W), P(12, -4 * W), P(12, 4 * W)]));
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = char.accent;
      ctx.fill(poly([P(26, 18 * W), P(26, -18 * W), P(23, -18 * W), P(23, 18 * W)]));
      // 甲片分線
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.2;
      for (const a of [21, 31]) {
        const p0 = P(a, 18 * W), p1 = P(a, -18 * W);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // 腰帶
  shade(ctx, smooth([P(3, 11.4 * W), P(3, -11.4 * W), P(-5, -11.4 * W), P(-5, 11.4 * W)], 0.45),
    mat(M.strap), opt(hip.x, hip.y, 13, { ao: 0.4 }));

  // ---------- 前腿 ----------
  // 髖 → 膝 → 踝 一條到底：大腿粗、膝蓋收、小腿再放出去一點
  shade(ctx, limbPath({ x: J.hip.x, y: J.hip.y - 3 }, J.kneeF, J.footF, 9.8 * bulk, 6.4 * bulk, 4.3 * bulk),
    mat(M.cloth), opt(J.kneeF.x, J.kneeF.y, 30, { ao: 0.28 }));
  // 護膝
  shade(ctx, smooth([
    { x: J.kneeF.x - 4.4 * bulk, y: J.kneeF.y - 5.6 }, { x: J.kneeF.x + 5.6 * bulk, y: J.kneeF.y - 4.6 },
    { x: J.kneeF.x + 6.2 * bulk, y: J.kneeF.y + 1.6 }, { x: J.kneeF.x + 3.4 * bulk, y: J.kneeF.y + 5.4 },
    { x: J.kneeF.x - 4.6 * bulk, y: J.kneeF.y + 4.4 },
  ], 0.35), mat(M.armor), opt(J.kneeF.x, J.kneeF.y, 10, { ao: 0.3 }));
  drawBoot(ctx, J.footF, mat(M.armor), bulk, opt(J.footF.x, J.footF.y, 12));

  // ---------- 頭 ----------
  drawHead(ctx, char, J, M, { mat, opt, bulk, flat, t });

  // ---------- 前臂 ----------
  drawShoulderPad(ctx, char, J.shoulderF, M, { mat, opt, bulk, flat });
  // 上臂（布）與前臂（裸露）分開畫，但各自是一條連續的形狀
  shade(ctx, limbPath(J.shoulderF, J.elbowF, J.handF, 8 * bulk, 5.4 * bulk, 4.2 * bulk),
    mat(M.cloth), opt(J.elbowF.x, J.elbowF.y, 24, { ao: 0.2 }));
  {
    const fm = { x: lerp(J.elbowF.x, J.handF.x, 0.5), y: lerp(J.elbowF.y, J.handF.y, 0.5) };
    shade(ctx, limbPath(J.elbowF, fm, J.handF, 5.2 * bulk, 4.5 * bulk, 3.7 * bulk),
      mat(M.skin), opt(fm.x, fm.y, 14, { ao: 0.25 }));
  }
  // 護腕：從手肘下方一路包到手腕，手臂才不會是全身最亮的一塊
  const fa0 = { x: lerp(J.elbowF.x, J.handF.x, 0.18), y: lerp(J.elbowF.y, J.handF.y, 0.18) };
  const fa1 = { x: lerp(J.elbowF.x, J.handF.x, 0.86), y: lerp(J.elbowF.y, J.handF.y, 0.86) };
  shade(ctx, capsule(fa0.x, fa0.y, fa1.x, fa1.y, 5.4 * bulk, 4.2 * bulk), mat(M.strap), opt(fa0.x, fa0.y, 12, { ao: 0.35 }));
  shade(ctx, capsule(fa0.x, fa0.y, lerp(fa0.x, fa1.x, 0.4), lerp(fa0.y, fa1.y, 0.4), 5.5 * bulk, 5 * bulk), mat(M.armor), opt(fa0.x, fa0.y, 10, { ao: 0.3 }));
  // 手套
  shade(ctx, capsule(J.handF.x, J.handF.y, J.handF.x + 2, J.handF.y + 2, 4.8 * bulk), mat(M.rubber), opt(J.handF.x, J.handF.y, 8));

  // ---------- 武器 ----------
  drawWeapon(ctx, char, J, M, { mat, opt, bulk, flat, t, f });

  // ---------- 受擊白閃 ----------
  if (hurt > 0.02 && !flat) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.75, hurt * 0.75);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-60, -160, 120, 170);
    ctx.restore();
  }
}

function drawBoot(ctx, foot, m, bulk, o) {
  // 腳踝包住 → 腳背斜下 → 鞋尖 → 鞋底平貼地面
  const p = smooth([
    { x: foot.x - 4.6 * bulk, y: foot.y - 8 },
    { x: foot.x + 4 * bulk, y: foot.y - 7 },
    { x: foot.x + 9.6 * bulk, y: foot.y + 0.5 },
    { x: foot.x + 9.2 * bulk, y: foot.y + 6 },
    { x: foot.x - 5.6 * bulk, y: foot.y + 6.5 },
    { x: foot.x - 6 * bulk, y: foot.y - 2 },
  ], 0.55);
  shade(ctx, p, m, { ...o, ao: 0.6 });
}

function drawShoulderPad(ctx, char, s, M, { mat, opt, bulk, flat }) {
  const style = (char.gear && char.gear.shoulder) || 'plate';
  if (style === 'none') return;
  const big = style === 'heavy';
  const w = (big ? 13 : 9.5) * bulk;
  const h = (big ? 11 : 8.5) * bulk;
  // 覆在肩頭上的一片甲：上緣貼著肩線，下緣往外翻
  const p = smooth([
    { x: s.x - w * 0.9, y: s.y - h * 0.5 },
    { x: s.x - w * 0.2, y: s.y - h * 1.05 },
    { x: s.x + w * 0.85, y: s.y - h * 0.7 },
    { x: s.x + w * 1.05, y: s.y + h * 0.5 },
    { x: s.x + w * 0.5, y: s.y + h * 0.95 },
    { x: s.x - w * 0.8, y: s.y + h * 0.7 },
  ], 0.45);
  shade(ctx, p, mat(M.armor), { ...opt(s.x, s.y, w * 1.6), ao: 0.35 });
  if (big && !flat) {
    // 鉚釘
    for (let i = -1; i <= 1; i++) {
      const rx = s.x + i * w * 0.42, ry = s.y - h * 0.2;
      shade(ctx, capsule(rx, ry, rx + 0.5, ry + 0.5, 1.7 * bulk), mat(M.metal), opt(rx, ry, 4));
    }
  }
}

function drawHead(ctx, char, J, M, { mat, opt, bulk, flat, t }) {
  const h = J.head;
  const r = 10.6 * (char.build.headScale || 1) * bulk;
  const gear = (char.gear && char.gear.head) || 'none';

  // 脖子
  shadeLimb(ctx, J.neck.x, J.neck.y + 3, h.x, h.y + r * 0.75, 5.4 * bulk, 4.6 * bulk, mat(M.skin), opt(J.neck.x, J.neck.y, 11, { ao: 0.7 }));

  // 頭顱
  // 顱骨上寬、下顎收尖、鼻樑往前凸一點：正面看是蛋形，側看有人臉的稜線
  const skull = smooth([
    { x: h.x - r * 0.78, y: h.y - r * 0.5 },
    { x: h.x - r * 0.42, y: h.y - r * 1.02 },
    { x: h.x + r * 0.38, y: h.y - r * 1.05 },
    { x: h.x + r * 0.86, y: h.y - r * 0.4 },
    { x: h.x + r * 0.92, y: h.y + r * 0.12 },
    { x: h.x + r * 0.66, y: h.y + r * 0.72 },
    { x: h.x + r * 0.05, y: h.y + r * 1.02 },
    { x: h.x - r * 0.62, y: h.y + r * 0.62 },
  ], 1);
  shade(ctx, skull, mat(M.skin), opt(h.x, h.y, r * 1.6, { ao: 0.25 }));
  if (!flat) {
    // 眼窩陰影：暗一點的橫帶，臉才有結構
    ctx.save();
    ctx.clip(skull);
    const eg = ctx.createLinearGradient(0, h.y - r * 0.5, 0, h.y + r * 0.1);
    eg.addColorStop(0, 'rgba(0,0,0,0)');
    eg.addColorStop(0.6, 'rgba(0,0,0,0.42)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(h.x - r * 1.2, h.y - r * 0.6, r * 2.4, r * 0.8);
    ctx.restore();
  }

  switch (gear) {
    case 'welder': {      // 焊工面罩：一片方形擋板 + 觀察窗
      const p = smooth([
        { x: h.x - r * 0.82, y: h.y - r * 0.9 }, { x: h.x + r * 0.2, y: h.y - r * 1.12 },
        { x: h.x + r * 0.9, y: h.y - r * 0.7 }, { x: h.x + r * 0.95, y: h.y + r * 0.4 },
        { x: h.x + r * 0.6, y: h.y + r * 0.95 }, { x: h.x - r * 0.72, y: h.y + r * 0.8 },
      ], 0.5);
      shade(ctx, p, mat(M.armor), opt(h.x, h.y, r * 1.5, { ao: 0.4 }));
      if (!flat) {
        ctx.save();
        ctx.clip(p);
        ctx.fillStyle = 'rgba(10,14,20,0.92)';
        ctx.fillRect(h.x - r * 0.9, h.y - r * 0.42, r * 1.9, r * 0.44);
        ctx.fillStyle = withAlpha(char.accent, 0.4);
        ctx.fillRect(h.x - r * 0.9, h.y - r * 0.36, r * 1.9, r * 0.1);
        ctx.restore();
      }
      break;
    }
    case 'gasmask': {     // 防毒面具：兩個濾罐 + 鏡片
      shade(ctx, poly([
        { x: h.x - r * 0.9, y: h.y - r * 0.7 }, { x: h.x + r * 0.95, y: h.y - r * 0.6 },
        { x: h.x + r * 0.85, y: h.y + r * 0.75 }, { x: h.x - r * 0.85, y: h.y + r * 0.6 },
      ]), mat(M.rubber), opt(h.x, h.y, r * 1.4));
      if (!flat) {
        for (const s2 of [-0.3, 0.44]) {
          const gx = h.x + r * s2, gy = h.y - r * 0.14;
          shade(ctx, capsule(gx, gy, gx + 0.4, gy, r * 0.2), mat(M.metal), opt(gx, gy, r * 0.4));
          bloom(ctx, gx, gy, r * 0.32, char.accent, 0.2);
        }
        shade(ctx, capsule(h.x + r * 0.55, h.y + r * 0.55, h.x + r * 0.9, h.y + r * 0.8, r * 0.34), mat(M.iron), opt(h.x, h.y, r));
      }
      break;
    }
    case 'hood': {        // 兜帽：布料蓋住上半臉
      const p = poly([
        { x: h.x - r * 1.15, y: h.y + r * 0.9 },
        { x: h.x - r * 1.05, y: h.y - r * 0.5 },
        { x: h.x - r * 0.1, y: h.y - r * 1.5 },
        { x: h.x + r * 1.05, y: h.y - r * 0.5 },
        { x: h.x + r * 0.85, y: h.y + r * 0.45 },
        { x: h.x + r * 0.2, y: h.y + r * 0.2 },
      ]);
      shade(ctx, p, mat(M.cloth), opt(h.x, h.y - r * 0.3, r * 1.7, { ao: 0.5 }));
      if (!flat) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.ellipse(h.x + r * 0.15, h.y + r * 0.02, r * 0.62, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        bloom(ctx, h.x + r * 0.3, h.y, r * 0.34, char.accent, 0.45);
      }
      break;
    }
    case 'helmet': {      // 全罩鋼盔 + 護目鏡
      const p = smooth([
        { x: h.x - r * 0.92, y: h.y + r * 0.6 },
        { x: h.x - r * 0.98, y: h.y - r * 0.3 },
        { x: h.x - r * 0.2, y: h.y - r * 1.15 },
        { x: h.x + r * 0.8, y: h.y - r * 0.72 },
        { x: h.x + r * 0.98, y: h.y + r * 0.2 },
        { x: h.x + r * 0.7, y: h.y + r * 0.8 },
      ], 0.55);
      shade(ctx, p, mat(M.metal), opt(h.x, h.y - r * 0.2, r * 1.6, { ao: 0.35 }));
      if (!flat) {
        ctx.fillStyle = 'rgba(8,10,16,0.95)';
        ctx.fillRect(h.x - r * 0.2, h.y - r * 0.25, r * 1.2, r * 0.42);
        bloom(ctx, h.x + r * 0.5, h.y - r * 0.05, r * 0.4, char.accent, 0.4);
      }
      break;
    }
    case 'goggles': {     // 頭巾 + 護目鏡
      // 包住頭頂的布
      shade(ctx, smooth([
        { x: h.x - r * 0.9, y: h.y - r * 0.25 }, { x: h.x - r * 0.45, y: h.y - r * 1.08 },
        { x: h.x + r * 0.45, y: h.y - r * 1.05 }, { x: h.x + r * 0.92, y: h.y - r * 0.4 },
        { x: h.x + r * 0.8, y: h.y - r * 0.05 }, { x: h.x - r * 0.7, y: h.y - r * 0.1 },
      ], 0.9), mat(M.cloth), opt(h.x, h.y - r * 0.6, r * 1.2, { ao: 0.3 }));
      // 鏡帶
      shade(ctx, smooth([
        { x: h.x - r * 0.86, y: h.y - r * 0.4 }, { x: h.x + r * 0.9, y: h.y - r * 0.34 },
        { x: h.x + r * 0.86, y: h.y + r * 0.02 }, { x: h.x - r * 0.84, y: h.y - r * 0.04 },
      ], 0.35), mat(M.strap), opt(h.x, h.y - r * 0.2, r * 0.6));
      if (!flat) {
        for (const s2 of [-0.26, 0.44]) {
          const gx = h.x + r * s2, gy = h.y - r * 0.19;
          shade(ctx, capsule(gx, gy, gx + 0.3, gy, r * 0.21), mat(M.metal), opt(gx, gy, r * 0.4));
          bloom(ctx, gx, gy, r * 0.3, char.accent, 0.4);
        }
      }
      break;
    }
    case 'horned': {      // 角盔
      const p = smooth([
        { x: h.x - r * 0.9, y: h.y + r * 0.5 }, { x: h.x - r * 0.95, y: h.y - r * 0.4 },
        { x: h.x + r * 0.15, y: h.y - r * 1.12 }, { x: h.x + r * 0.95, y: h.y - r * 0.2 },
        { x: h.x + r * 0.76, y: h.y + r * 0.72 },
      ], 0.6);
      shade(ctx, p, mat(M.armor), opt(h.x, h.y, r * 1.5, { ao: 0.35 }));
      for (const s of [-1, 1]) {
        const horn = poly([
          { x: h.x + s * r * 0.7, y: h.y - r * 0.5 },
          { x: h.x + s * r * 1.5, y: h.y - r * 1.4 },
          { x: h.x + s * r * 0.9, y: h.y - r * 0.12 },
        ]);
        shade(ctx, horn, mat(M.bone), opt(h.x + s * r, h.y - r, r));
      }
      if (!flat) bloom(ctx, h.x + r * 0.45, h.y - r * 0.05, r * 0.36, char.accent, 0.4);
      break;
    }
    case 'mask': {        // 半罩戰術面罩
      shade(ctx, poly([
        { x: h.x - r * 0.75, y: h.y - r * 0.1 }, { x: h.x + r * 0.95, y: h.y - r * 0.05 },
        { x: h.x + r * 0.8, y: h.y + r * 0.85 }, { x: h.x - r * 0.5, y: h.y + r * 0.9 },
      ]), mat(M.rubber), opt(h.x, h.y + r * 0.3, r));
      if (!flat) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(h.x - r * 0.5, h.y - r * 0.45, r * 1.3, r * 0.28);
        bloom(ctx, h.x + r * 0.45, h.y - r * 0.3, r * 0.32, char.accent, 0.45);
      }
      // 頭髮
      shade(ctx, poly([
        { x: h.x - r * 0.9, y: h.y - r * 0.5 }, { x: h.x - r * 0.2, y: h.y - r * 1.2 },
        { x: h.x + r * 0.8, y: h.y - r * 0.75 }, { x: h.x + r * 0.4, y: h.y - r * 0.45 },
      ]), mat(M.cloth), opt(h.x, h.y - r * 0.7, r));
      break;
    }
    default:
      // 光頭 + 一點鬍渣陰影
      if (!flat) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(h.x + r * 0.1, h.y + r * 0.45, r * 0.6, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
}

function drawBackGear(ctx, char, J, M, { mat, opt, t, bulk, flat }) {
  const style = (char.gear && char.gear.back) || 'none';
  const c = J.chest;
  switch (style) {
    case 'toolbelt': {   // 背在腰後的工具：鐵管、扳手、備用指虎
      const bx = c.x - 16 * bulk, by = c.y + 30;
      shade(ctx, capsule(bx - 8 * bulk, by - 10, bx + 6 * bulk, by + 12, 4.2 * bulk, 3.4 * bulk),
        mat(M.metal), opt(bx, by, 14, { ao: 0.4 }));
      shade(ctx, capsule(bx - 3 * bulk, by - 16, bx + 9 * bulk, by + 4, 3.2 * bulk, 2.6 * bulk),
        mat(M.darkIron), opt(bx, by, 12, { ao: 0.35 }));
      shade(ctx, poly([
        { x: bx - 12 * bulk, y: by + 14 }, { x: bx + 10 * bulk, y: by + 12 },
        { x: bx + 10 * bulk, y: by + 20 }, { x: bx - 12 * bulk, y: by + 22 },
      ]), mat(M.strap), opt(bx, by + 16, 14, { ao: 0.45 }));
      break;
    }
    case 'coil': {        // 盤起來的鎖鏈（鉤索）
      if (flat) break;
      for (let i = 0; i < 3; i++) {
        const rr = 11 * bulk - i * 2.4;
        ctx.save();
        ctx.translate(c.x - 17 * bulk, c.y + 10 + i * 2);
        ctx.scale(1, 0.45);
        shade(ctx, capsule(-rr, 0, rr, 0, 3.4 * bulk), mat(M.metal), opt(0, 0, rr));
        ctx.restore();
      }
      break;
    }
    case 'cloak': {       // 破布斗篷
      const sway = Math.sin(t * 2.2) * 7;
      const p = poly([
        { x: c.x + 4, y: c.y - 8 },
        { x: c.x - 12 * bulk, y: c.y - 6 },
        { x: c.x - 30 * bulk - sway, y: c.y + 46 },
        { x: c.x - 16 * bulk - sway * 0.6, y: c.y + 56 },
        { x: c.x - 4, y: c.y + 40 },
        { x: c.x + 10, y: c.y + 22 },
      ]);
      shade(ctx, p, mat(M.cloth), opt(c.x - 14, c.y + 20, 40, { ao: 0.5 }));
      break;
    }
    case 'sheath': {      // 背後的刀鞘（雙匕）
      for (const s of [-1, 1]) {
        const a = { x: c.x - 6, y: c.y + 2 };
        const bpt = { x: c.x - 26 * bulk, y: c.y - 16 * s * bulk };
        shade(ctx, capsule(a.x, a.y, bpt.x, bpt.y, 4 * bulk, 3 * bulk), mat(M.strap), opt(a.x, a.y, 16));
      }
      break;
    }
    case 'shieldback':    // 盾牌掛在背後（壁壘拿在手上時不畫）
    default:
      break;
  }
}

// ------------------------------------------------------------------ 武器
/**
 * 武器全部從「前手」長出來，並回傳刀尖／錘頭的位置（給殘影軌跡用）。
 * 每把武器的造型差異就是角色的辨識度：破壞錘一看就重、鉤爪一看就遠。
 */
function drawWeapon(ctx, char, J, M, { mat, opt, bulk, flat, t, f }) {
  const spec = char.weapon || {};
  const h = J.handF;
  const e = J.elbowF;
  // hold：武器相對前臂的握持角度（重錘扛在肩上、長戟斜舉、盾牌正面朝前）
  const ang = Math.atan2(h.y - e.y, h.x - e.x) + (spec.hold || 0);
  const along = (d, o = 0) => ({
    x: h.x + Math.cos(ang) * d - Math.sin(ang) * o,
    y: h.y + Math.sin(ang) * d + Math.cos(ang) * o,
  });
  const metal = mat(M.metal);
  const dark = mat(M.darkIron);
  const wood = mat(MAT.leather);
  let tip = h;

  switch (spec.kind) {
    case 'hammer': {          // 破壞錘：長柄 + 巨大方錘頭
      const head = along(66 * bulk);
      const tail = along(-30 * bulk);
      shade(ctx, capsule(tail.x, tail.y, head.x, head.y, 4.6 * bulk, 4.2 * bulk), wood, opt(h.x, h.y, 30, { ao: 0.3 }));
      // 錘頭：兩塊金屬 + 加強肋
      const hw = 20 * bulk, hh = 14.5 * bulk;
      const block = poly([
        along(52 * bulk, -hh), along(78 * bulk, -hh * 0.88),
        along(78 * bulk, hh * 0.88), along(52 * bulk, hh),
      ]);
      shade(ctx, block, metal, { ...opt(head.x, head.y, hw * 1.4), ao: 0.45 });
      shade(ctx, poly([along(48 * bulk, -hh * 0.62), along(53 * bulk, -hh * 0.62), along(53 * bulk, hh * 0.62), along(48 * bulk, hh * 0.62)]), dark, opt(head.x, head.y, 14));
      if (!flat) {
        // 撞擊面的磨損
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.4;
        const a1 = along(78 * bulk, -hh * 0.7), a2 = along(78 * bulk, hh * 0.7);
        ctx.beginPath();
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.stroke();
        ctx.restore();
      }
      tip = along(80 * bulk);
      break;
    }
    case 'grapple': {         // 鉤爪：護臂發射器 + 垂下來的鎖鏈與三爪鉤
      const barrel = along(26 * bulk);
      shade(ctx, capsule(h.x, h.y, barrel.x, barrel.y, 7.5 * bulk, 6.5 * bulk), dark, opt(h.x, h.y, 16, { ao: 0.3 }));
      shade(ctx, capsule(along(10 * bulk, -6).x, along(10 * bulk, -6).y, along(24 * bulk, -6).x, along(24 * bulk, -6).y, 2.6 * bulk), metal, opt(h.x, h.y, 10));
      // 爪
      for (let i = -1; i <= 1; i++) {
        const c0 = along(26 * bulk, i * 4.5 * bulk);
        const c1 = along(40 * bulk, i * 8 * bulk);
        shade(ctx, capsule(c0.x, c0.y, c1.x, c1.y, 2.8 * bulk, 1.4 * bulk), metal, opt(c0.x, c0.y, 8));
      }
      // 鎖鏈垂下
      if (!flat) drawChain(ctx, h, { x: h.x - 26 * bulk, y: h.y + 30 * bulk }, metal, bulk, opt, 6);
      tip = along(42 * bulk);
      break;
    }
    case 'chainsaw': {        // 鏈鋸：機身 + 導板 + 轉動的鋸齒
      const body = along(14 * bulk);
      shade(ctx, poly([
        along(-8 * bulk, -10 * bulk), along(20 * bulk, -9 * bulk),
        along(20 * bulk, 9 * bulk), along(-8 * bulk, 10 * bulk),
      ]), dark, opt(body.x, body.y, 20, { ao: 0.4 }));
      const bar = poly([
        along(20 * bulk, -7 * bulk), along(70 * bulk, -5 * bulk),
        along(76 * bulk, 0), along(70 * bulk, 5 * bulk), along(20 * bulk, 7 * bulk),
      ]);
      shade(ctx, bar, metal, { ...opt(along(46 * bulk).x, along(46 * bulk).y, 26), ao: 0.3 });
      if (!flat) {
        // 鋸齒：跑動的三角形
        ctx.save();
        ctx.fillStyle = '#d8dee8';
        const phase = (t * 40) % 8;
        for (let d = 22; d < 72; d += 8) {
          for (const s of [-1, 1]) {
            const p0 = along((d + phase) * bulk, s * 6.6 * bulk);
            const p1 = along((d + phase + 4) * bulk, s * 6.6 * bulk);
            const p2 = along((d + phase + 2) * bulk, s * 10 * bulk);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      tip = along(78 * bulk);
      break;
    }
    case 'chainscythe': {     // 鎖鏈鐮：手上握鏈，鐮刀甩在外面
      const anchor = along(10 * bulk);
      const swing = spec.swing || 0;
      const swinging = f && (f.attack || f.lock > 0);
      const sw = swinging ? (f.poseK || 0) * 6.0 - 1.2 : 1.15 + Math.sin(t * 1.4) * 0.12;
      const bladeC = {
        x: h.x + Math.cos(sw) * 64 * bulk,
        y: h.y + Math.sin(sw) * 48 * bulk - 10,
      };
      if (!flat) drawChain(ctx, anchor, bladeC, metal, bulk, opt, 8);
      // 鐮刀本體
      const ba = Math.atan2(bladeC.y - h.y, bladeC.x - h.x);
      const handle = {
        x: bladeC.x - Math.cos(ba) * 10 * bulk,
        y: bladeC.y - Math.sin(ba) * 10 * bulk,
      };
      shade(ctx, capsule(handle.x, handle.y, bladeC.x, bladeC.y, 3.4 * bulk), wood, opt(bladeC.x, bladeC.y, 12));
      const bl = poly([
        { x: bladeC.x, y: bladeC.y },
        { x: bladeC.x + Math.cos(ba - 1.1) * 34 * bulk, y: bladeC.y + Math.sin(ba - 1.1) * 34 * bulk },
        { x: bladeC.x + Math.cos(ba - 0.2) * 44 * bulk, y: bladeC.y + Math.sin(ba - 0.2) * 44 * bulk },
        { x: bladeC.x + Math.cos(ba + 0.5) * 12 * bulk, y: bladeC.y + Math.sin(ba + 0.5) * 12 * bulk },
      ]);
      shade(ctx, bl, metal, { ...opt(bladeC.x, bladeC.y, 30), ao: 0.2 });
      tip = { x: bladeC.x + Math.cos(ba - 0.2) * 44 * bulk, y: bladeC.y + Math.sin(ba - 0.2) * 44 * bulk };
      break;
    }
    case 'daggers': {         // 雙匕：前後手各一把
      for (const [hand, elbow, len] of [[J.handF, J.elbowF, 30], [J.handB, J.elbowB, 26]]) {
        const a2 = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
        const tipP = { x: hand.x + Math.cos(a2) * len * bulk, y: hand.y + Math.sin(a2) * len * bulk };
        shade(ctx, bladeShape(hand.x, hand.y, tipP.x, tipP.y, 4.6 * bulk), metal, { ...opt(hand.x, hand.y, 18), ao: 0.2 });
        shade(ctx, capsule(hand.x, hand.y, hand.x - Math.cos(a2) * 8 * bulk, hand.y - Math.sin(a2) * 8 * bulk, 3 * bulk), dark, opt(hand.x, hand.y, 8));
      }
      tip = along(32 * bulk);
      break;
    }
    case 'axe': {             // 戰斧：厚柄 + 單邊大斧刃
      const head = along(54 * bulk);
      shade(ctx, capsule(along(-26 * bulk).x, along(-26 * bulk).y, head.x, head.y, 4.4 * bulk, 4 * bulk), wood, opt(h.x, h.y, 26, { ao: 0.3 }));
      const blade = poly([
        along(40 * bulk, -4 * bulk), along(48 * bulk, -30 * bulk),
        along(72 * bulk, -20 * bulk), along(70 * bulk, 6 * bulk),
        along(50 * bulk, 10 * bulk),
      ]);
      shade(ctx, blade, metal, { ...opt(head.x, head.y, 34), ao: 0.25 });
      shade(ctx, poly([along(40 * bulk, 2 * bulk), along(52 * bulk, 14 * bulk), along(44 * bulk, 16 * bulk)]), dark, opt(head.x, head.y, 14));
      tip = along(74 * bulk, -20 * bulk);
      break;
    }
    case 'shieldmace': {      // 塔盾 + 釘錘（盾在前手、錘在後手）
      const c0 = along(16 * bulk);
      const sh = poly([
        along(2 * bulk, -34 * bulk), along(26 * bulk, -30 * bulk),
        along(30 * bulk, 18 * bulk), along(12 * bulk, 36 * bulk),
        along(-4 * bulk, 24 * bulk), along(-6 * bulk, -20 * bulk),
      ]);
      shade(ctx, sh, mat(M.armor), { ...opt(c0.x, c0.y, 40), ao: 0.4 });
      // 盾面加強條與凸起
      if (!flat) {
        shade(ctx, capsule(along(6 * bulk, -20 * bulk).x, along(6 * bulk, -20 * bulk).y, along(18 * bulk, 22 * bulk).x, along(18 * bulk, 22 * bulk).y, 4 * bulk), metal, opt(c0.x, c0.y, 20));
        shade(ctx, capsule(c0.x, c0.y, c0.x + 0.5, c0.y, 7 * bulk), metal, opt(c0.x, c0.y, 12));
      }
      // 後手的釘錘
      const hb = J.handB, eb = J.elbowB;
      const ab = Math.atan2(hb.y - eb.y, hb.x - eb.x);
      const mtip = { x: hb.x + Math.cos(ab) * 34 * bulk, y: hb.y + Math.sin(ab) * 34 * bulk };
      shade(ctx, capsule(hb.x, hb.y, mtip.x, mtip.y, 3.4 * bulk), wood, opt(hb.x, hb.y, 16));
      shade(ctx, capsule(mtip.x, mtip.y, mtip.x + 1, mtip.y + 1, 9 * bulk), dark, opt(mtip.x, mtip.y, 14, { ao: 0.3 }));
      tip = along(30 * bulk);
      break;
    }
    case 'halberd': {         // 長戟：最長的柄 + 矛尖 + 側斧
      const tipP = along(112 * bulk);
      const tail = along(-46 * bulk);
      shade(ctx, capsule(tail.x, tail.y, tipP.x, tipP.y, 3.6 * bulk, 3.2 * bulk), wood, opt(h.x, h.y, 50, { ao: 0.25 }));
      shade(ctx, poly([
        along(92 * bulk, -5 * bulk), { x: tipP.x, y: tipP.y }, along(92 * bulk, 5 * bulk),
      ]), metal, { ...opt(tipP.x, tipP.y, 24), ao: 0.2 });
      shade(ctx, poly([
        along(80 * bulk, -4 * bulk), along(88 * bulk, -24 * bulk),
        along(100 * bulk, -18 * bulk), along(92 * bulk, -2 * bulk),
      ]), metal, opt(along(90 * bulk, -12 * bulk).x, along(90 * bulk, -12 * bulk).y, 20));
      tip = tipP;
      break;
    }
    case 'knuckles': {        // 鐵指虎：厚重護拳 + 四顆指節鐵疙瘩
      for (const [hand, elbow, dim] of [[J.handF, J.elbowF, false], [J.handB, J.elbowB, true]]) {
        const a2 = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
        const back = { x: hand.x - Math.cos(a2) * 8 * bulk, y: hand.y - Math.sin(a2) * 8 * bulk };
        const front = { x: hand.x + Math.cos(a2) * 8 * bulk, y: hand.y + Math.sin(a2) * 8 * bulk };
        // 拳頭本體（纏了布條的手）
        shade(ctx, capsule(back.x, back.y, front.x, front.y, 7.6 * bulk, 7 * bulk),
          dim ? dark : mat(M.strap), opt(hand.x, hand.y, 16, { ao: 0.35 }));
        // 指節上的鐵疙瘩
        for (let i = -1.5; i <= 1.5; i++) {
          const k0 = {
            x: front.x - Math.sin(a2) * i * 3.6 * bulk,
            y: front.y + Math.cos(a2) * i * 3.6 * bulk,
          };
          shade(ctx, capsule(k0.x, k0.y, k0.x + Math.cos(a2) * 2.4 * bulk, k0.y + Math.sin(a2) * 2.4 * bulk, 2.6 * bulk),
            dim ? dark : metal, opt(k0.x, k0.y, 6, { ao: 0.3 }));
        }
        // 護住手背的鐵板
        shade(ctx, poly([
          { x: back.x - Math.sin(a2) * 6 * bulk, y: back.y + Math.cos(a2) * 6 * bulk },
          { x: front.x - Math.sin(a2) * 5 * bulk, y: front.y + Math.cos(a2) * 5 * bulk },
          { x: front.x - Math.sin(a2) * 1 * bulk, y: front.y + Math.cos(a2) * 1 * bulk },
          { x: back.x - Math.sin(a2) * 2 * bulk, y: back.y + Math.cos(a2) * 2 * bulk },
        ]), dim ? dark : metal, opt(hand.x, hand.y, 12));
      }
      tip = along(16 * bulk);
      break;
    }
    case 'crowbar': {         // 撬棍：一根彎折的扁鋼，一端鴨嘴、一端尖爪
      const bend = along(34 * bulk);
      const tipP = along(52 * bulk, 16 * bulk);
      const tail = along(-24 * bulk);
      // 直段
      shade(ctx, capsule(tail.x, tail.y, bend.x, bend.y, 4 * bulk, 3.6 * bulk), dark, opt(h.x, h.y, 26, { ao: 0.3 }));
      // 彎折的那一段
      shade(ctx, capsule(bend.x, bend.y, tipP.x, tipP.y, 3.6 * bulk, 3 * bulk), dark, opt(bend.x, bend.y, 16, { ao: 0.3 }));
      // 鴨嘴：末端劈開的扁頭
      shade(ctx, poly([
        along(48 * bulk, 12 * bulk), along(60 * bulk, 20 * bulk),
        along(58 * bulk, 25 * bulk), along(45 * bulk, 17 * bulk),
      ]), metal, opt(tipP.x, tipP.y, 14));
      // 尾端的尖爪
      shade(ctx, poly([
        along(-22 * bulk, -3 * bulk), along(-34 * bulk, -7 * bulk),
        along(-33 * bulk, 1 * bulk), along(-22 * bulk, 3 * bulk),
      ]), metal, opt(tail.x, tail.y, 12));
      // 握把的防滑纏帶
      shade(ctx, capsule(along(-6 * bulk).x, along(-6 * bulk).y, along(10 * bulk).x, along(10 * bulk).y, 4.6 * bulk, 4.2 * bulk),
        mat(M.strap), opt(h.x, h.y, 12, { ao: 0.3 }));
      tip = { x: tipP.x, y: tipP.y };
      break;
    }
    default:
      break;
  }

  // 雙手武器：後手也扶在柄上，看起來才有重量
  if (spec.twoHand && !flat) {
    const grip = along(-18 * bulk);
    shade(ctx, capsule(grip.x, grip.y, grip.x + 1, grip.y + 1, 5.6 * bulk), mat(M.rubber), opt(grip.x, grip.y, 9, { ao: 0.3 }));
  }
  // 前手的拳頭最後蓋上去，手指才是包住武器柄的
  if (spec.kind && spec.kind !== 'knuckles') {
    const g0 = along(-4 * bulk), g1 = along(5 * bulk);
    shade(ctx, capsule(g0.x, g0.y, g1.x, g1.y, 4.8 * bulk, 4.3 * bulk), mat(M.rubber), opt(h.x, h.y, 9, { ao: 0.35 }));
  }

  // 記下武器尖端（世界座標由呼叫端換算），給揮擊殘影用
  if (f && !flat) f._tipLocal = tip;
}

/** 鎖鏈：一節一節的橢圓，比直線有份量 */
function drawChain(ctx, a, b, m, bulk, opt, links = 7) {
  const dx = b.x - a.x, dy = b.y - a.y;
  for (let i = 0; i < links; i++) {
    const k0 = i / links, k1 = (i + 0.72) / links;
    const x0 = a.x + dx * k0, y0 = a.y + dy * k0 + Math.sin(k0 * 3) * 2;
    const x1 = a.x + dx * k1, y1 = a.y + dy * k1 + Math.sin(k1 * 3) * 2;
    shade(ctx, capsule(x0, y0, x1, y1, (i % 2 ? 2.6 : 3.2) * bulk), m, opt(x0, y0, 6));
  }
}

// ------------------------------------------------------------------ 選單用
export function drawPortrait(ctx, char, x, y, scale, t, pose = 'idle') {
  const fake = {
    char, x: 0, y: 0, facing: 1, pose, poseK: 0.35, phase: t * 2.4,
    animTime: t, hitFlash: 0,
  };
  ctx.save();
  ctx.translate(x, y);
  const s = scale * (char.build.scale || 1) * 1.12;
  ctx.scale(s, s);
  const J = poseFor(pose, 0.35, t * 2.4);
  ctx.save();
  ctx.translate(RIM.x * -2.2, RIM.y * -2.2);
  drawBody(ctx, char, J, fake, { flat: mixColor(char.color, '#ffe4c4', 0.55), alpha: 0.55 });
  ctx.restore();
  drawBody(ctx, char, J, fake, {});
  ctx.restore();
}

/** 畫面級：底片顆粒 + 暗角 + 色偏，最後一層疊上去 */
export function drawGrade(ctx, w, h, opts = {}) {
  const { grain = 0.05, vignette = 0.55, shift = 0 } = opts;
  if (grain > 0) {
    const pat = grainPattern(ctx);
    ctx.save();
    ctx.globalAlpha = grain;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.92);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
