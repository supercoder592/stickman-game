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
  shade, shadeLimb, creaseLine, groundShadow, puff, bloom, grainPattern,
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
  sky.addColorStop(0, '#2a5c96');
  sky.addColorStop(0.38, '#5c8fc4');
  sky.addColorStop(0.66, '#a9c1d8');
  sky.addColorStop(0.85, '#f0c48a');
  sky.addColorStop(1, '#f5d9a8');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  // 雲：拉長的柔邊橢圓
  for (let i = 0; i < 26; i++) {
    const x = rng() * w;
    const y = 60 + rng() * (h * 0.5);
    const rx = 120 + rng() * 260;
    const ry = 14 + rng() * 26;
    const a = 0.16 + rng() * 0.2;
    const g = c.createRadialGradient(x, y, 0, x, y, rx);
    const col = y > h * 0.4 ? '#fff0d8' : '#eaf1fb';
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
  drawBlocks(WORLD.ground - 120, 120, 300, '#8fa6c4', 0.55, 90);   // 最遠：被天光洗淡
  drawBlocks(WORLD.ground - 60, 90, 240, '#647ea3', 0.34, 110);
  drawBlocks(WORLD.ground - 10, 70, 190, '#42557a', 0.16, 130);    // 最近：顏色最實

  // 大氣透視：靠近地平線越濁，遠景自然退後
  const haze = c.createLinearGradient(0, WORLD.ground - 340, 0, WORLD.ground);
  haze.addColorStop(0, 'rgba(230,220,210,0)');
  haze.addColorStop(0.55, 'rgba(240,215,180,0.2)');
  haze.addColorStop(1, 'rgba(250,225,185,0.4)');
  c.fillStyle = haze;
  c.fillRect(0, WORLD.ground - 340, w, 340);

  // --- 工業結構：吊車與鐵塔 ---
  const steel = '#3a4560';
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
    c.fillStyle = '#44506b';
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
  c.strokeStyle = '#2e3850';
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
  c.fillStyle = '#2e3850';
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
  sink.addColorStop(0, 'rgba(40,52,74,0)');
  sink.addColorStop(1, 'rgba(40,52,74,0.24)');
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
  // 街機格鬥的舞台不擋視線：前景只留一點點地面的邊緣陰影
  ctx.save();
  ctx.translate(-camX * 0.4, 0);
  const g = ctx.createLinearGradient(0, WORLD.h - 70, 0, WORLD.h + 20);
  g.addColorStop(0, 'rgba(90,58,30,0)');
  g.addColorStop(1, 'rgba(90,58,30,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(-600, WORLD.h - 70, WORLD.w + 1200, 120);
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
  ctx.fillStyle = '#5c8fc4';
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
  g.addColorStop(0, '#c99a62');
  g.addColorStop(0.3, '#b07f4c');
  g.addColorStop(1, '#8a5f36');
  ctx.fillStyle = g;
  ctx.fillRect(-400, ground, w + 800, h - ground + 400);

  // 地磚縫與裂痕
  ctx.save();
  ctx.strokeStyle = 'rgba(70,40,18,0.35)';
  ctx.lineWidth = 2;
  for (let x = -400; x < w + 400; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.lineTo(x - 60, h + 200);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,240,215,0.14)';
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
  hl.addColorStop(0, 'rgba(255,240,210,0.3)');
  hl.addColorStop(0.35, 'rgba(255,230,190,0.1)');
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
    pg.addColorStop(0, 'rgba(255,238,205,0.1)');
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
    skin: p.skin ? tint(MAT.skin, p.skin, 0.4) : MAT.skin,
    // 主色直接當衣服的顏色：街機格鬥就是靠一件鮮豔的衣服認人
    cloth: tint(MAT.cloth, c, 0.72),
    cloth2: tint(MAT.cloth, p.cloth || char.accent, 0.66),
    armor: tint(p.armorMat ? MAT[p.armorMat] : MAT.iron, p.armor || char.accent, 0.5),
    metal: p.metalMat ? MAT[p.metalMat] : MAT.steel,
    iron: MAT.iron,
    darkIron: MAT.darkIron,
    bone: MAT.bone,
    strap: MAT.leather,
    rubber: MAT.rubber,
    glove: tint(MAT.rubber, char.accent, 0.62),
    wrap: { base: '#ded6c4', light: '#f6f1e6', dark: '#9d9482', spec: 0.06, rough: 0.95 },
    shoe: tint(MAT.leather, p.shoe || '#2b2a2e', 0.6),
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
    drawBody(ctx, char, J, f, { flat, alpha });
    // 受擊白閃：整個人變白一格，不是蓋一塊白方塊
    const hurt = f.hitFlash || 0;
    if (hurt > 0.02 && !flat) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.8, hurt * 0.8) * alpha;
      drawBody(ctx, char, J, f, { flat: '#ffffff', alpha: 1 });
      ctx.restore();
    }
    ctx.restore();
  }

  if (reflection && !flat && f.y >= WORLD.ground - 2) {
    // 濕地板倒影：上下翻轉、壓扁、淡出
    ctx.save();
    ctx.globalAlpha = 0.07 * alpha;
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

  const mat = (m) => (flat ? { base: flat, light: flat, dark: flat, spec: 0, rough: 1 } : m);
  // outfit: 'gi' 開襟道服／'vest' 無袖背心／'sash' 打赤膊只繫腰帶／'robe' 長袍
  const outfit = gear.outfit || 'gi';
  const opt = (cx, cy, r, extra = {}) => ({ cx, cy, r, rim, alpha, ...extra });

  // ---------- 背後的裝備 ----------
  drawBackGear(ctx, char, J, M, { mat, opt, t, bulk, flat });

  // ---------- 後側手腳（壓暗） ----------
  const backDim = (m) => (flat ? mat(m) : {
    ...m, base: mixColor(m.base, '#000000', 0.42), light: mixColor(m.light, '#000000', 0.4),
    dark: mixColor(m.dark, '#000000', 0.3),
  });
  drawLeg(ctx, J.hip, J.kneeB, J.footB, M, {
    mat: (m) => mat(backDim(m)), opt, bulk, flat,
    outfit: (char.gear && char.gear.outfit) || 'gi', sway: 0, dim: true, char,
  });
  shade(ctx, limbPath(J.shoulderB, J.elbowB, J.handB, 8 * bulk, 6.4 * bulk, 3.8 * bulk),
    backDim(M.skin), opt(J.elbowB.x, J.elbowB.y, 22));
  shade(ctx, capsule(J.handB.x, J.handB.y, J.handB.x + 1, J.handB.y + 1, 4.6 * bulk), backDim(M.glove), opt(J.handB.x, J.handB.y, 8));

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
  const bareChest = gear.chest === 'bare';
  shade(ctx, torsoPath, mat(bareChest ? M.skin : M.cloth), opt(chest.x, (hip.y + chest.y) / 2, 28 * bulk, { ao: 0.2 }));
  if (!flat) {
    // 胸肌的下緣、胸口中線、腹肌的橫溝 —— 街機 sprite 的肌肉就是靠這幾條線
    creaseLine(ctx, torsoPath, [P(36, -10 * W), P(33, 0), P(35, 11 * W)], 'rgba(0,0,0,0.3)', 2.2);
    creaseLine(ctx, torsoPath, [P(43, 1 * W), P(30, 1.5 * W)], 'rgba(0,0,0,0.26)', 2);
    if (bareChest) {
      for (const a of [25, 18, 11]) {
        creaseLine(ctx, torsoPath, [P(a, -7 * W), P(a, 8 * W)], 'rgba(0,0,0,0.22)', 1.8);
      }
    }
  }

  // ---------- 武術道服 ----------
  const cloth2 = mat(M.cloth2);
  const sway = Math.sin(t * 2.4) * 2.2;

  if (outfit !== 'sash') {
    // 上衣本體：從肩線罩到腰，下襬比腰寬一點（布是垂下來的）
    const jacket = smooth([
      P(41, 10.5 * W), P(43, 3 * W),
      P(37, -1 * W),                       // 前襟的開口往內收
      P(24, -3 * W), P(9, -4 * W),         // 開襟的邊緣一路往下
      P(2, -12 * W + sway), P(6, -14.5 * W),
      P(24, -15 * W), P(37, -13.5 * W),
      P(43, -6 * W),
    ], 0.55);
    shade(ctx, jacket, mat(M.cloth), opt(chest.x, (hip.y + chest.y) / 2, 26 * bulk, { ao: 0.3 }));

    if (outfit === 'gi' || outfit === 'robe') {
      // 另一側的前襟疊上去：兩片交叉成 V 領，這是道服的招牌
      const lapel = smooth([
        P(42, 9 * W), P(38, 2 * W), P(22, 6 * W), P(6, 9.5 * W),
        P(2, 13 * W - sway), P(10, 14 * W), P(30, 13 * W), P(41, 13.5 * W),
      ], 0.5);
      shade(ctx, lapel, cloth2, opt(chest.x, chest.y - 4, 24 * bulk, { ao: 0.25 }));
      if (!flat) {
        // 領口的滾邊
        creaseLine(ctx, lapel, [P(42, 9 * W), P(36, 2.6 * W), P(20, 6.4 * W), P(5, 10 * W)],
          'rgba(0,0,0,0.34)', 2.4);
      }
    }
    if (!flat) {
      // 衣褶：斜斜的幾條，布才不是一塊板子
      creaseLine(ctx, jacket, [P(30, -12 * W), P(20, -6 * W)], 'rgba(0,0,0,0.22)', 2);
      creaseLine(ctx, jacket, [P(18, -13 * W), P(9, -7 * W)], 'rgba(0,0,0,0.18)', 1.8);
    }
  }

  // 下襬：蓋過髖部往下垂的一圈布（長袍垂得更長）
  if (outfit === 'gi' || outfit === 'robe') {
    const drop = outfit === 'robe' ? -40 : -24;
    // 前後各一片垂下來的衣襬，中間開衩 —— 腿才踢得出去
    for (const s3 of [1, -1]) {
      const flap = smooth([
        P(6, s3 * 12.5 * W), P(-4, s3 * 13.5 * W),
        P(drop, s3 * (11 * W) + sway * s3), P(drop - 2, s3 * 5 * W + sway * s3),
        P(-2, s3 * 4 * W), P(6, s3 * 5.5 * W),
      ], 0.35);
      shade(ctx, flap, mat(M.cloth), opt(hip.x, hip.y + 12, 22 * bulk, { ao: 0.42 }));
      if (!flat) creaseLine(ctx, flap, [P(2, s3 * 9 * W), P(drop + 2, s3 * 8 * W)], 'rgba(0,0,0,0.26)', 2);
    }
  }

  // ---------- 前腿 ----------
  // 先畫裸露的整條腿，再把寬鬆的道服褲罩上去，褲口束在小腿肚
  drawLeg(ctx, J.hip, J.kneeF, J.footF, M, { mat, opt, bulk, flat, outfit, sway, dim: false, char });

  // ---------- 腰帶：寬布帶 + 結 + 兩條垂下來的帶尾 ----------
  const beltMat = {
    base: char.accent, light: mixColor(char.accent, '#ffffff', 0.32),
    dark: mixColor(char.accent, '#000000', 0.42), spec: 0.08, rough: 0.9,
  };
  shade(ctx, smooth([P(13, 12.8 * W), P(13, -13.2 * W), P(-2, -13.6 * W), P(-2, 13.2 * W)], 0.25),
    mat(beltMat), opt(hip.x, hip.y + 5, 16, { ao: 0.3 }));
  if (!flat) {
    // 結
    shade(ctx, smooth([P(12, 8.6 * W), P(12, 0.6 * W), P(-1, 0), P(-1, 9.2 * W)], 0.55),
      beltMat, opt(hip.x, hip.y + 5, 11, { ao: 0.28 }));
    // 帶尾：跟著呼吸擺
    for (const k of [0, 1]) {
      const s0 = 6 * W - k * 5 * W;
      shade(ctx, smooth([
        P(2, s0), P(-14 - k * 4, s0 + 2 * W + sway * (k ? -1 : 1)),
        P(-17 - k * 4, s0 - 1.5 * W + sway * (k ? -1 : 1)), P(2, s0 - 3.4 * W),
      ], 0.4), beltMat, opt(hip.x - 10, hip.y + 6, 14, { ao: 0.4 }));
    }
  }


  // ---------- 頭 ----------
  drawHead(ctx, char, J, M, { mat, opt, bulk, flat, t });

  // ---------- 前臂 ----------
  drawShoulderPad(ctx, char, J.shoulderF, M, { mat, opt, bulk, flat });
  // 裸露的手臂：上臂有二頭肌的鼓起、前臂往手腕收
  {
    const bi = { x: lerp(J.shoulderF.x, J.elbowF.x, 0.52), y: lerp(J.shoulderF.y, J.elbowF.y, 0.52) };
    const armPath = limbPath(J.shoulderF, bi, J.elbowF, 7.6 * bulk, 8.2 * bulk, 5.2 * bulk);
    shade(ctx, armPath, mat(M.skin), opt(bi.x, bi.y, 20));
    if (!flat) creaseLine(ctx, armPath, [
      { x: bi.x - 4 * bulk, y: bi.y - 5 }, { x: bi.x + 2 * bulk, y: bi.y + 4 },
    ]);
    const fm = { x: lerp(J.elbowF.x, J.handF.x, 0.42), y: lerp(J.elbowF.y, J.handF.y, 0.42) };
    shade(ctx, limbPath(J.elbowF, fm, J.handF, 5.3 * bulk, 5.4 * bulk, 3.7 * bulk),
      mat(M.skin), opt(fm.x, fm.y, 14));
  }
  // 拳帶：白布一圈一圈纏到手腕，武術裝扮的標配
  const fa0 = { x: lerp(J.elbowF.x, J.handF.x, 0.3), y: lerp(J.elbowF.y, J.handF.y, 0.3) };
  const fa1 = { x: lerp(J.elbowF.x, J.handF.x, 0.94), y: lerp(J.elbowF.y, J.handF.y, 0.94) };
  const wrapPath = capsule(fa0.x, fa0.y, fa1.x, fa1.y, 5.2 * bulk, 4.4 * bulk);
  shade(ctx, wrapPath, mat(M.wrap), opt(fa0.x, fa0.y, 12, { ao: 0.3 }));
  if (!flat) {
    // 纏繞的縫：三道斜線就看得出是布條不是護具
    const wn = { x: -(fa1.y - fa0.y), y: fa1.x - fa0.x };
    const wl = Math.hypot(wn.x, wn.y) || 1;
    for (const k of [0.25, 0.5, 0.75]) {
      const c0 = { x: lerp(fa0.x, fa1.x, k), y: lerp(fa0.y, fa1.y, k) };
      creaseLine(ctx, wrapPath, [
        { x: c0.x + (wn.x / wl) * 6 * bulk, y: c0.y + (wn.y / wl) * 6 * bulk },
        { x: c0.x - (wn.x / wl) * 6 * bulk - (fa1.x - fa0.x) * 0.09, y: c0.y - (wn.y / wl) * 6 * bulk - (fa1.y - fa0.y) * 0.09 },
      ], 'rgba(90,80,64,0.45)', 1.8);
    }
  }
  // 手套
  shade(ctx, capsule(J.handF.x, J.handF.y, J.handF.x + 2, J.handF.y + 2, 5 * bulk), mat(M.glove), opt(J.handF.x, J.handF.y, 8));

  // ---------- 武器 ----------
  drawWeapon(ctx, char, J, M, { mat, opt, bulk, flat, t, f });

}

/**
 * 一條腿：裸露的腿 → 寬鬆的道服褲 → 褲口束帶 → 綁腿 → 布鞋。
 * 武術裝扮的重點就在褲子：要寬、要垂、褲口要束起來。
 */
function drawLeg(ctx, hip, knee, foot, M, { mat, opt, bulk, flat, outfit, sway, dim, char }) {
  const root = { x: hip.x, y: hip.y - 3 };
  // 1. 腿本身
  shade(ctx, limbPath(root, knee, foot, 9.4 * bulk, 6.2 * bulk, 4.2 * bulk),
    mat(M.skin), opt(knee.x, knee.y, 28, { ao: 0.24 }));

  // 2. 褲子：包到小腿肚，外側比內側寬一點（布會被甩出去）
  const cuff = {
    x: knee.x + (foot.x - knee.x) * 0.62,
    y: knee.y + (foot.y - knee.y) * 0.62,
  };
  if (outfit !== 'shorts') {
    const dx = foot.x - knee.x, dy = foot.y - knee.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const pant = smooth([
      { x: root.x + 10 * bulk, y: root.y - 2 },
      { x: knee.x + 9.2 * bulk, y: knee.y - 2 },
      { x: cuff.x + nx * 7 * bulk + sway * 0.4, y: cuff.y + ny * 7 * bulk },
      { x: cuff.x + nx * 5 * bulk, y: cuff.y + ny * 5 * bulk },
      { x: cuff.x - nx * 5 * bulk, y: cuff.y - ny * 5 * bulk },
      { x: knee.x - 8 * bulk, y: knee.y - 2 },
      { x: root.x - 9.5 * bulk, y: root.y - 2 },
    ], 0.32);
    shade(ctx, pant, mat(M.cloth), opt(knee.x, knee.y, 30, { ao: 0.34 }));
    if (!flat) {
      creaseLine(ctx, pant, [
        { x: root.x + 3 * bulk, y: root.y + 4 },
        { x: knee.x + 2 * bulk, y: knee.y - 2 },
        { x: cuff.x, y: cuff.y },
      ], 'rgba(0,0,0,0.24)', 2.2);
    }
    // 褲口的束帶
    shade(ctx, capsule(
      cuff.x - nx * 5.6 * bulk, cuff.y - ny * 5.6 * bulk,
      cuff.x + nx * 6.4 * bulk, cuff.y + ny * 6.4 * bulk, 2.6 * bulk,
    ), mat(M.strap), opt(cuff.x, cuff.y, 8, { ao: 0.3 }));
  }

  // 3. 腳踝的綁布 + 布鞋
  shade(ctx, capsule(cuff.x, cuff.y, foot.x, foot.y - 2, 4.4 * bulk, 4 * bulk),
    mat(M.wrap), opt(foot.x, foot.y, 10, { ao: 0.3 }));
  drawBoot(ctx, foot, mat(M.shoe), bulk, opt(foot.x, foot.y, 12));
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
  if (style === 'sleeve') {
    // 道服的短袖：從肩頭垂下來一小截布
    const w2 = 11 * bulk, h2 = 13 * bulk;
    const p2 = smooth([
      { x: s.x - w2 * 0.95, y: s.y - h2 * 0.42 },
      { x: s.x - w2 * 0.1, y: s.y - h2 * 0.78 },
      { x: s.x + w2 * 0.9, y: s.y - h2 * 0.4 },
      { x: s.x + w2 * 1.0, y: s.y + h2 * 0.75 },
      { x: s.x - w2 * 0.1, y: s.y + h2 * 0.95 },
      { x: s.x - w2 * 0.95, y: s.y + h2 * 0.6 },
    ], 0.8);
    shade(ctx, p2, mat(M.cloth), { ...opt(s.x, s.y, w2 * 1.6), ao: 0.3 });
    if (!flat) creaseLine(ctx, p2, [{ x: s.x - w2 * 0.6, y: s.y + h2 * 0.7 }, { x: s.x + w2 * 0.8, y: s.y + h2 * 0.6 }], 'rgba(0,0,0,0.28)', 2.2);
    return;
  }
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

/**
 * 臉。街機格鬥的角色一定看得到表情 —— 眉毛壓得越低越兇。
 * 本地座標永遠朝右，所以只畫看得見的那隻眼睛（3/4 側臉）。
 */
function drawFace(ctx, h, r, char, flat) {
  if (flat) return;
  const ink = '#241a22';
  const P = (fx, fy) => ({ x: h.x + r * fx, y: h.y + r * fy });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // --- 顴骨與下顎的陰影：臉要有立體感，靠的是這兩塊，不是漸層 ---
  ctx.fillStyle = 'rgba(120,68,44,0.26)';
  ctx.beginPath();
  const cheek = [P(-0.2, -0.06), P(0.5, 0.06), P(0.66, 0.36), P(0.3, 0.66), P(-0.28, 0.52)];
  ctx.moveTo(cheek[0].x, cheek[0].y);
  for (const q of cheek.slice(1)) ctx.lineTo(q.x, q.y);
  ctx.closePath();
  ctx.fill();

  // --- 眼窩：比膚色深一階的一塊，眼睛坐在裡面 ---
  ctx.fillStyle = 'rgba(110,60,38,0.3)';
  ctx.beginPath();
  ctx.ellipse(h.x + r * 0.46, h.y - r * 0.07, r * 0.32, r * 0.24, -0.14, 0, Math.PI * 2);
  ctx.fill();

  // --- 眼白 ---
  const eye = new Path2D();
  eye.moveTo(h.x + r * 0.24, h.y - r * 0.04);
  eye.quadraticCurveTo(h.x + r * 0.46, h.y - r * 0.28, h.x + r * 0.7, h.y - r * 0.06);
  eye.quadraticCurveTo(h.x + r * 0.48, h.y + r * 0.13, h.x + r * 0.24, h.y - r * 0.04);
  eye.closePath();
  ctx.fillStyle = '#f7f3ec';
  ctx.fill(eye);

  // --- 虹膜與瞳孔：靠前，像在瞪著對手 ---
  ctx.save();
  ctx.clip(eye);
  ctx.fillStyle = mixColor(char.accent || '#7a6048', '#4a3524', 0.55);
  ctx.beginPath();
  ctx.ellipse(h.x + r * 0.54, h.y - r * 0.03, r * 0.14, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(h.x + r * 0.57, h.y - r * 0.03, r * 0.08, r * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  // 眼神光
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(h.x + r * 0.5, h.y - r * 0.1, r * 0.045, r * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- 上眼瞼：一條粗黑，眼睛的重量全在這裡 ---
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(h.x + r * 0.23, h.y - r * 0.05);
  ctx.quadraticCurveTo(h.x + r * 0.46, h.y - r * 0.3, h.x + r * 0.71, h.y - r * 0.07);
  ctx.stroke();
  // 下眼瞼：細一點
  ctx.lineWidth = r * 0.05;
  ctx.strokeStyle = 'rgba(36,26,34,0.5)';
  ctx.beginPath();
  ctx.moveTo(h.x + r * 0.27, h.y + r * 0.01);
  ctx.quadraticCurveTo(h.x + r * 0.48, h.y + r * 0.12, h.x + r * 0.68, h.y - r * 0.03);
  ctx.stroke();

  // --- 眉毛：畫成一塊楔形，內側粗外側細，壓得越低越兇 ---
  ctx.fillStyle = ink;
  ctx.beginPath();
  const brow = [P(0.14, -0.46), P(0.74, -0.26), P(0.72, -0.14), P(0.16, -0.3)];
  ctx.moveTo(brow[0].x, brow[0].y);
  for (const q of brow.slice(1)) ctx.lineTo(q.x, q.y);
  ctx.closePath();
  ctx.fill();

  // --- 鼻子：鼻樑的暗面 + 鼻孔 ---
  ctx.strokeStyle = 'rgba(120,64,40,0.5)';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.moveTo(h.x + r * 0.72, h.y - r * 0.12);
  ctx.lineTo(h.x + r * 0.86, h.y + r * 0.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(60,32,24,0.65)';
  ctx.beginPath();
  ctx.ellipse(h.x + r * 0.78, h.y + r * 0.28, r * 0.07, r * 0.05, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // --- 嘴：上唇一條實線，下唇一道陰影 ---
  ctx.strokeStyle = 'rgba(96,44,40,0.9)';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.moveTo(h.x + r * 0.4, h.y + r * 0.52);
  ctx.quadraticCurveTo(h.x + r * 0.6, h.y + r * 0.56, h.x + r * 0.78, h.y + r * 0.47);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,64,40,0.34)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(h.x + r * 0.46, h.y + r * 0.64);
  ctx.quadraticCurveTo(h.x + r * 0.62, h.y + r * 0.66, h.x + r * 0.74, h.y + r * 0.58);
  ctx.stroke();
  ctx.restore();

  // --- 耳朵：外廓 + 內耳的一道線 ---
  const ear = smooth([
    P(-0.56, -0.02), P(-0.38, 0.02), P(-0.36, 0.26), P(-0.54, 0.28),
  ], 0.9);
  shade(ctx, ear, MAT.skin, {
    cx: h.x - r * 0.46, cy: h.y + r * 0.12, r: r * 0.3, outline: 0.55, outlineWidth: 1.1,
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(120,64,40,0.45)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(h.x - r * 0.5, h.y + r * 0.04);
  ctx.quadraticCurveTo(h.x - r * 0.42, h.y + r * 0.12, h.x - r * 0.46, h.y + r * 0.22);
  ctx.stroke();
  ctx.restore();
}

/** 頭髮：一大塊實色 + 幾撮尖角，用剪影做造型 */
function drawHair(ctx, h, r, style, color, flat) {
  const hairMat = {
    base: color, light: mixColor(color, '#ffffff', 0.3),
    dark: mixColor(color, '#000000', 0.42), spec: 0.25, rough: 0.5,
  };
  const o = { cx: h.x, cy: h.y - r * 0.4, r: r * 1.4 };
  switch (style) {
    case 'bald': {      // 光頭：頭皮的反光 + 後腦的鬍渣陰影
      if (flat) break;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.ellipse(h.x - r * 0.1, h.y - r * 0.78, r * 0.34, r * 0.16, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,26,20,0.22)';
      ctx.beginPath();
      ctx.ellipse(h.x - r * 0.42, h.y - r * 0.2, r * 0.38, r * 0.48, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'wild': {       // 爆炸頭：往後掃的大尖角
        const pts = [
          { x: h.x + r * 0.9, y: h.y - r * 0.55 },
          { x: h.x + r * 0.3, y: h.y - r * 1.3 },
          { x: h.x - r * 0.1, y: h.y - r * 0.85 },
          { x: h.x - r * 0.5, y: h.y - r * 1.5 },
          { x: h.x - r * 0.8, y: h.y - r * 0.8 },
          { x: h.x - r * 1.5, y: h.y - r * 1.15 },
          { x: h.x - r * 1.05, y: h.y - r * 0.25 },
          { x: h.x - r * 1.5, y: h.y + r * 0.2 },
          { x: h.x - r * 0.85, y: h.y + r * 0.45 },
          { x: h.x - r * 0.55, y: h.y - r * 0.35 },
        ];
        shade(ctx, poly(pts), hairMat, o);
        break;
      }
    case 'ponytail': {   // 束起來的馬尾
        shade(ctx, poly([
          { x: h.x - r * 1.05, y: h.y - r * 0.2 },
          { x: h.x - r * 1.9, y: h.y + r * 0.5 },
          { x: h.x - r * 1.75, y: h.y + r * 0.95 },
          { x: h.x - r * 0.9, y: h.y + r * 0.2 },
        ]), hairMat, o);
        shade(ctx, smooth([
          { x: h.x + r * 0.74, y: h.y - r * 0.56 },
          { x: h.x + r * 0.16, y: h.y - r * 1.16 },
          { x: h.x - r * 0.7, y: h.y - r * 0.92 },
          { x: h.x - r * 0.92, y: h.y - r * 0.16 },
          { x: h.x - r * 0.42, y: h.y - r * 0.56 },
          { x: h.x + r * 0.44, y: h.y - r * 0.34 },
        ], 0.75), hairMat, o);
        break;
      }
    case 'short':
    default: {           // 貼頭皮的短髮，前額留幾撮
        shade(ctx, poly([
          { x: h.x + r * 0.78, y: h.y - r * 0.52 },
          { x: h.x + r * 0.42, y: h.y - r * 0.78 },
          { x: h.x + r * 0.5, y: h.y - r * 1.02 },
          { x: h.x + r * 0.02, y: h.y - r * 0.86 },
          { x: h.x + r * 0.06, y: h.y - r * 1.2 },
          { x: h.x - r * 0.5, y: h.y - r * 1.06 },
          { x: h.x - r * 0.95, y: h.y - r * 0.46 },
          { x: h.x - r * 0.86, y: h.y + r * 0.16 },
          { x: h.x - r * 0.64, y: h.y - r * 0.42 },
        ]), hairMat, o);
        break;
      }
  }
}

function drawHead(ctx, char, J, M, { mat, opt, bulk, flat, t }) {
  const h = J.head;
  const r = 12.2 * (char.build.headScale || 1) * bulk;
  const gear = (char.gear && char.gear.head) || 'none';
  const hair = (char.gear && char.gear.hair) || 'short';
  const hairColor = (char.palette && char.palette.hair) || '#2b1f1a';

  // 脖子
  shadeLimb(ctx, J.neck.x, J.neck.y + 3, h.x, h.y + r * 0.66, 6 * bulk, 5 * bulk, mat(M.skin), opt(J.neck.x, J.neck.y, 12, { ao: 0.3 }));

  // 頭顱：額頭 → 眉弓 → 眼窩凹 → 鼻樑 → 鼻尖 → 人中 → 唇 → 下巴 → 下顎角 → 後腦
  const F = (fx, fy) => ({ x: h.x + r * fx, y: h.y + r * fy });
  const skull = smooth([
    F(-0.36, -1.12), F(0.3, -1.08),          // 頭頂
    F(0.7, -0.74),                            // 額頭
    F(0.79, -0.36),                           // 眉弓
    F(0.73, -0.14),                           // 眼窩凹進去
    F(0.93, 0.08),                            // 鼻樑
    F(1.05, 0.26),                            // 鼻尖
    F(0.8, 0.34),                             // 鼻底
    F(0.88, 0.46),                            // 上唇
    F(0.84, 0.56),                            // 唇縫
    F(0.88, 0.64),                            // 下唇
    F(0.8, 0.82),                             // 下巴
    F(0.46, 1.0),                             // 下巴底
    F(-0.12, 0.9),                            // 下顎角
    F(-0.62, 0.46),                           // 下顎後緣
    F(-0.84, -0.06), F(-0.76, -0.66),         // 後腦
  ], 0.38);
  shade(ctx, skull, mat(M.skin), opt(h.x, h.y, r * 1.7, { ao: 0.18 }));

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
    case 'goggles': {     // 護目鏡推在額頭上，臉看得見
      drawHair(ctx, h, r, hair, hairColor, flat);
      drawFace(ctx, h, r, char, flat);
      shade(ctx, smooth([
        { x: h.x - r * 1.0, y: h.y - r * 0.95 }, { x: h.x + r * 0.95, y: h.y - r * 0.82 },
        { x: h.x + r * 0.9, y: h.y - r * 0.44 }, { x: h.x - r * 0.98, y: h.y - r * 0.58 },
      ], 0.35), mat(M.strap), opt(h.x, h.y - r * 0.7, r * 0.7));
      if (!flat) {
        for (const s2 of [-0.3, 0.42]) {
          const gx = h.x + r * s2, gy = h.y - r * 0.68;
          shade(ctx, capsule(gx, gy, gx + 0.3, gy, r * 0.24), mat(M.metal), opt(gx, gy, r * 0.4));
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
    case 'headband': {    // 綁頭帶：街機格鬥的經典造型，帶尾會飄
      drawHair(ctx, h, r, hair, hairColor, flat);
      drawFace(ctx, h, r, char, flat);
      const band = {
        base: char.color, light: mixColor(char.color, '#ffffff', 0.35),
        dark: mixColor(char.color, '#000000', 0.4), spec: 0.1, rough: 0.9,
      };
      shade(ctx, poly([
        { x: h.x - r * 1.02, y: h.y - r * 0.62 }, { x: h.x + r * 0.92, y: h.y - r * 0.5 },
        { x: h.x + r * 0.88, y: h.y - r * 0.18 }, { x: h.x - r * 1.0, y: h.y - r * 0.28 },
      ]), band, opt(h.x, h.y - r * 0.4, r));
      if (!flat) {
        const sway = Math.sin(t * 3.4) * r * 0.3;
        for (const k of [0, 1]) {
          shade(ctx, poly([
            { x: h.x - r * 0.95, y: h.y - r * 0.55 + k * r * 0.22 },
            { x: h.x - r * 2.3, y: h.y - r * 0.2 + sway + k * r * 0.5 },
            { x: h.x - r * 2.25, y: h.y + r * 0.08 + sway + k * r * 0.5 },
            { x: h.x - r * 0.95, y: h.y - r * 0.25 + k * r * 0.22 },
          ]), band, opt(h.x - r * 1.5, h.y, r));
        }
      }
      break;
    }
    case 'none':
    default:
      // 素顏：頭髮 + 臉
      drawHair(ctx, h, r, hair, hairColor, flat);
      drawFace(ctx, h, r, char, flat);
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
  const wrapM = mat(M.wrap);
  const brass = mat(MAT.brass);
  let tip = h;

  // --- 武器細節的共用零件 ---
  /** 纏在握把上的皮繩：一圈一圈的斜紋 */
  const gripWrap = (d0, d1, w, turns = 5) => {
    const a = along(d0), b2 = along(d1);
    const path = capsule(a.x, a.y, b2.x, b2.y, w);
    shade(ctx, path, wrapM, opt(a.x, a.y, 10, { ao: 0.3 }));
    if (flat) return;
    for (let i = 1; i < turns; i++) {
      const k = i / turns;
      creaseLine(ctx, path, [
        along(lerp(d0, d1, k) + 1.4, -w), along(lerp(d0, d1, k) - 1.4, w),
      ], 'rgba(60,48,34,0.55)', 1.6);
    }
  };
  /** 鉚釘：金屬件固定在一起的痕跡 */
  const rivets = (ds, off, r2 = 2) => {
    if (flat) return;
    for (const d of ds) {
      const p0 = along(d, off);
      shade(ctx, capsule(p0.x, p0.y, p0.x + 0.4, p0.y, r2 * bulk), brass, opt(p0.x, p0.y, 4));
    }
  };
  /** 刃面的斜切：沿著刃長畫一條亮線，看起來才是開過鋒的 */
  const bevel = (path, a, b2, alpha = 0.5) => {
    if (flat) return;
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();
    ctx.restore();
  };

  switch (spec.kind) {
    case 'hammer': {          // 破壞錘：包鐵的木柄 + 帶箍的方錘頭 + 底部的尖釘
      const head = along(66 * bulk);
      const tail = along(-30 * bulk);
      shade(ctx, capsule(tail.x, tail.y, head.x, head.y, 4.6 * bulk, 4.2 * bulk), wood, opt(h.x, h.y, 30, { ao: 0.3 }));
      gripWrap(-26 * bulk, 4 * bulk, 5.2 * bulk, 6);
      // 柄尾的配重球
      shade(ctx, capsule(tail.x, tail.y, tail.x + 0.5, tail.y, 5.4 * bulk), dark, opt(tail.x, tail.y, 8, { ao: 0.3 }));
      // 錘頭：本體 + 上下兩道箍 + 中央的加強肋
      const hw = 20 * bulk, hh = 14.5 * bulk;
      const block = poly([
        along(52 * bulk, -hh), along(78 * bulk, -hh * 0.88),
        along(78 * bulk, hh * 0.88), along(52 * bulk, hh),
      ]);
      shade(ctx, block, metal, { ...opt(head.x, head.y, hw * 1.4), ao: 0.45 });
      for (const d of [58, 72]) {
        shade(ctx, poly([
          along(d * bulk, -hh * 0.94), along((d + 3) * bulk, -hh * 0.92),
          along((d + 3) * bulk, hh * 0.92), along(d * bulk, hh * 0.94),
        ]), dark, opt(head.x, head.y, 14));
      }
      rivets([59.5, 73.5], -hh * 0.6, 1.8);
      rivets([59.5, 73.5], hh * 0.6, 1.8);
      // 柄與頭的接合套
      shade(ctx, poly([along(48 * bulk, -hh * 0.62), along(53 * bulk, -hh * 0.62), along(53 * bulk, hh * 0.62), along(48 * bulk, hh * 0.62)]), dark, opt(head.x, head.y, 14));
      if (!flat) {
        // 撞擊面的磨亮痕跡與缺角
        ctx.save();
        ctx.clip(block);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2.4;
        const a1 = along(77 * bulk, -hh * 0.66), a2 = along(77 * bulk, hh * 0.66);
        ctx.beginPath();
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.stroke();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#12141a';
        const c1 = along(78 * bulk, -hh * 0.2), c2 = along(72 * bulk, -hh * 0.1), c3 = along(78 * bulk, hh * 0.05);
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
        ctx.fill();
        ctx.restore();
      }
      tip = along(80 * bulk);
      break;
    }
    case 'grapple': {         // 鉤爪：護臂發射器（含排氣孔與齒輪）+ 有倒鉤的三爪 + 鎖鏈
      const barrel = along(26 * bulk);
      shade(ctx, capsule(h.x, h.y, barrel.x, barrel.y, 7.5 * bulk, 6.5 * bulk), dark, opt(h.x, h.y, 16, { ao: 0.3 }));
      // 機身上的導軌
      shade(ctx, capsule(along(8 * bulk, -6).x, along(8 * bulk, -6).y, along(25 * bulk, -6).x, along(25 * bulk, -6).y, 2.6 * bulk), metal, opt(h.x, h.y, 10));
      // 排氣孔
      if (!flat) {
        for (const d of [10, 15, 20]) {
          const v = along(d * bulk, 4.4 * bulk);
          shade(ctx, capsule(v.x, v.y, v.x + 0.4, v.y, 1.4 * bulk), mat(M.iron), opt(v.x, v.y, 3));
        }
        // 捲線的齒輪
        const g0 = along(2 * bulk, -2 * bulk);
        shade(ctx, capsule(g0.x, g0.y, g0.x + 0.4, g0.y, 4.6 * bulk), brass, opt(g0.x, g0.y, 7));
        for (let i = 0; i < 6; i++) {
          const a2 = (i / 6) * Math.PI * 2 + t * 1.2;
          const gx = g0.x + Math.cos(a2) * 5 * bulk, gy = g0.y + Math.sin(a2) * 5 * bulk;
          shade(ctx, capsule(gx, gy, gx + 0.3, gy, 1.2 * bulk), brass, opt(gx, gy, 2));
        }
      }
      // 三爪：每一爪都有倒鉤
      for (let i = -1; i <= 1; i++) {
        const c0 = along(26 * bulk, i * 4.5 * bulk);
        const c1 = along(40 * bulk, i * 8 * bulk);
        const claw = capsule(c0.x, c0.y, c1.x, c1.y, 2.8 * bulk, 1.2 * bulk);
        shade(ctx, claw, metal, opt(c0.x, c0.y, 8));
        bevel(claw, c0, c1, 0.45);
        // 倒鉤
        shade(ctx, poly([
          along(35 * bulk, i * 6.6 * bulk), along(33 * bulk, i * 10.4 * bulk),
          along(37.5 * bulk, i * 7.6 * bulk),
        ]), metal, opt(c1.x, c1.y, 6));
      }
      if (!flat) drawChain(ctx, h, { x: h.x - 26 * bulk, y: h.y + 30 * bulk }, metal, bulk, opt, 6);
      tip = along(42 * bulk);
      break;
    }
    case 'chainsaw': {        // 鏈鋸：引擎機殼（拉繩、排氣、握把）+ 導板 + 跑動的鏈條
      const body = along(14 * bulk);
      shade(ctx, poly([
        along(-10 * bulk, -11 * bulk), along(20 * bulk, -9 * bulk),
        along(20 * bulk, 9 * bulk), along(-10 * bulk, 11 * bulk),
      ]), dark, opt(body.x, body.y, 20, { ao: 0.4 }));
      // 上方的護手弓
      shade(ctx, capsule(along(-4 * bulk, -13 * bulk).x, along(-4 * bulk, -13 * bulk).y,
        along(16 * bulk, -12 * bulk).x, along(16 * bulk, -12 * bulk).y, 2.4 * bulk), mat(M.iron), opt(body.x, body.y, 12));
      if (!flat) {
        // 拉繩的把手
        const pr = along(-12 * bulk, -2 * bulk);
        shade(ctx, capsule(pr.x, pr.y, pr.x - 5 * bulk, pr.y + 2, 2 * bulk), wrapM, opt(pr.x, pr.y, 5));
        // 排氣口
        for (const d of [0, 5, 10]) {
          const v = along(d * bulk, 7 * bulk);
          shade(ctx, capsule(v.x, v.y, v.x + 0.4, v.y, 1.5 * bulk), mat(M.iron), opt(v.x, v.y, 3));
        }
        // 火星塞
        const sp = along(4 * bulk, -8 * bulk);
        shade(ctx, capsule(sp.x, sp.y, sp.x + 0.4, sp.y, 2 * bulk), brass, opt(sp.x, sp.y, 4));
      }
      // 導板
      const bar = poly([
        along(20 * bulk, -7 * bulk), along(70 * bulk, -5 * bulk),
        along(76 * bulk, 0), along(70 * bulk, 5 * bulk), along(20 * bulk, 7 * bulk),
      ]);
      shade(ctx, bar, metal, { ...opt(along(46 * bulk).x, along(46 * bulk).y, 26), ao: 0.3 });
      if (!flat) {
        // 導板中央的長槽
        ctx.save();
        ctx.clip(bar);
        ctx.fillStyle = 'rgba(20,22,28,0.55)';
        const s0 = along(28 * bulk, -1.6 * bulk), s1 = along(66 * bulk, -1.2 * bulk);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(s1.x + (s1.y - s0.y) * 0.08, s1.y - (s1.x - s0.x) * 0.08);
        ctx.lineTo(s0.x + (s1.y - s0.y) * 0.08, s0.y - (s1.x - s0.x) * 0.08);
        ctx.fill();
        ctx.restore();
        // 鋸齒：一節鏈條 + 一顆切刀，跟著時間跑
        const phase = (t * 40) % 8;
        for (let d = 22; d < 72; d += 8) {
          for (const sd of [-1, 1]) {
            const p0 = along((d + phase) * bulk, sd * 6.6 * bulk);
            const p1 = along((d + phase + 4.4) * bulk, sd * 6.6 * bulk);
            shade(ctx, capsule(p0.x, p0.y, p1.x, p1.y, 1.7 * bulk), mat(M.iron), opt(p0.x, p0.y, 3));
            const q0 = along((d + phase + 1) * bulk, sd * 7.2 * bulk);
            const q1 = along((d + phase + 3.4) * bulk, sd * 7.2 * bulk);
            const q2 = along((d + phase + 2.2) * bulk, sd * 11 * bulk);
            shade(ctx, poly([q0, q1, q2]), metal, opt(q0.x, q0.y, 4));
          }
        }
      }
      tip = along(78 * bulk);
      break;
    }
    case 'chainscythe': {     // 鎖鏈鐮：手上握鏈 + 甩在外面的鐮刀（刃有血槽與內刃亮線）
      const anchor = along(10 * bulk);
      const swinging = f && (f.attack || f.lock > 0);
      const sw = swinging ? (f.poseK || 0) * 6.0 - 1.2 : 1.15 + Math.sin(t * 1.4) * 0.12;
      const bladeC = {
        x: h.x + Math.cos(sw) * 64 * bulk,
        y: h.y + Math.sin(sw) * 48 * bulk - 10,
      };
      if (!flat) drawChain(ctx, anchor, bladeC, metal, bulk, opt, 8);
      const ba = Math.atan2(bladeC.y - h.y, bladeC.x - h.x);
      const at = (d, o = 0) => ({
        x: bladeC.x + Math.cos(ba) * d - Math.sin(ba) * o,
        y: bladeC.y + Math.sin(ba) * d + Math.cos(ba) * o,
      });
      // 柄：纏繩 + 兩端的金屬箍
      shade(ctx, capsule(at(-14 * bulk).x, at(-14 * bulk).y, at(6 * bulk).x, at(6 * bulk).y, 3.6 * bulk), wood, opt(bladeC.x, bladeC.y, 14));
      shade(ctx, capsule(at(-12 * bulk).x, at(-12 * bulk).y, at(2 * bulk).x, at(2 * bulk).y, 4 * bulk), wrapM, opt(bladeC.x, bladeC.y, 12, { ao: 0.3 }));
      for (const d of [-13, 3]) {
        const r0 = at(d * bulk);
        shade(ctx, capsule(r0.x, r0.y, r0.x + 0.4, r0.y, 4.4 * bulk), brass, opt(r0.x, r0.y, 6));
      }
      // 鐮刃：外弧厚、內刃薄
      const bl = poly([
        at(2 * bulk, 2 * bulk),
        at(20 * bulk, -22 * bulk), at(38 * bulk, -26 * bulk),
        at(46 * bulk, -12 * bulk), at(30 * bulk, -4 * bulk), at(10 * bulk, 6 * bulk),
      ]);
      shade(ctx, bl, metal, { ...opt(bladeC.x, bladeC.y, 30), ao: 0.2 });
      bevel(bl, at(10 * bulk, -6 * bulk), at(42 * bulk, -14 * bulk), 0.55);
      if (!flat) {
        // 血槽
        creaseLine(ctx, bl, [at(14 * bulk, -12 * bulk), at(36 * bulk, -18 * bulk)], 'rgba(0,0,0,0.32)', 2.4);
      }
      tip = at(46 * bulk, -12 * bulk);
      break;
    }
    case 'daggers': {         // 雙匕：護手 + 血槽 + 纏繩握把 + 尾錘
      for (const [hand, elbow, len] of [[J.handF, J.elbowF, 30], [J.handB, J.elbowB, 26]]) {
        const a2 = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
        const at = (d, o = 0) => ({
          x: hand.x + Math.cos(a2) * d - Math.sin(a2) * o,
          y: hand.y + Math.sin(a2) * d + Math.cos(a2) * o,
        });
        const tipP = at(len * bulk);
        const blade = bladeShape(at(6 * bulk).x, at(6 * bulk).y, tipP.x, tipP.y, 4.6 * bulk);
        shade(ctx, blade, metal, { ...opt(hand.x, hand.y, 18), ao: 0.2 });
        bevel(blade, at(8 * bulk, 1 * bulk), at((len - 4) * bulk, 0.6 * bulk), 0.55);
        // 護手
        shade(ctx, poly([
          at(4 * bulk, -5.5 * bulk), at(7 * bulk, -5 * bulk),
          at(7 * bulk, 5 * bulk), at(4 * bulk, 5.5 * bulk),
        ]), brass, opt(hand.x, hand.y, 8));
        // 握把 + 尾錘
        shade(ctx, capsule(at(-9 * bulk).x, at(-9 * bulk).y, at(3 * bulk).x, at(3 * bulk).y, 3 * bulk), wrapM, opt(hand.x, hand.y, 8, { ao: 0.3 }));
        const pom = at(-11 * bulk);
        shade(ctx, capsule(pom.x, pom.y, pom.x + 0.4, pom.y, 3.2 * bulk), brass, opt(pom.x, pom.y, 5));
      }
      tip = along(32 * bulk);
      break;
    }
    case 'axe': {             // 戰斧：夾住木柄的斧頭（有鉚釘與護條）+ 背面的尖刺 + 纏繩
      const head = along(54 * bulk);
      shade(ctx, capsule(along(-26 * bulk).x, along(-26 * bulk).y, along(74 * bulk).x, along(74 * bulk).y, 4.4 * bulk, 3.6 * bulk), wood, opt(h.x, h.y, 26, { ao: 0.3 }));
      gripWrap(-22 * bulk, 8 * bulk, 5 * bulk, 6);
      // 斧刃
      const blade = poly([
        along(40 * bulk, -4 * bulk), along(46 * bulk, -26 * bulk),
        along(62 * bulk, -32 * bulk), along(72 * bulk, -18 * bulk),
        along(70 * bulk, 4 * bulk), along(50 * bulk, 10 * bulk),
      ]);
      shade(ctx, blade, metal, { ...opt(head.x, head.y, 34), ao: 0.25 });
      bevel(blade, along(60 * bulk, -27 * bulk), along(68 * bulk, -2 * bulk), 0.6);
      if (!flat) creaseLine(ctx, blade, [along(46 * bulk, -8 * bulk), along(58 * bulk, -20 * bulk)], 'rgba(0,0,0,0.3)', 2.4);
      // 夾住木柄的護條 + 鉚釘
      shade(ctx, poly([
        along(38 * bulk, -7 * bulk), along(56 * bulk, -9 * bulk),
        along(56 * bulk, 9 * bulk), along(38 * bulk, 7 * bulk),
      ]), dark, opt(head.x, head.y, 16));
      rivets([42, 52], -5 * bulk, 1.8);
      rivets([42, 52], 5 * bulk, 1.8);
      // 背面的尖刺
      shade(ctx, poly([along(42 * bulk, 6 * bulk), along(56 * bulk, 20 * bulk), along(46 * bulk, 14 * bulk)]), dark, opt(head.x, head.y, 14));
      tip = along(70 * bulk, -26 * bulk);
      break;
    }
    case 'shieldmace': {      // 塔盾（木板 + 鐵框 + 盾心凸起）+ 後手的釘錘
      const c0 = along(16 * bulk);
      const sh = poly([
        along(2 * bulk, -34 * bulk), along(26 * bulk, -30 * bulk),
        along(30 * bulk, 18 * bulk), along(12 * bulk, 36 * bulk),
        along(-4 * bulk, 24 * bulk), along(-6 * bulk, -20 * bulk),
      ]);
      shade(ctx, sh, mat(M.armor), { ...opt(c0.x, c0.y, 40), ao: 0.4 });
      if (!flat) {
        // 木板的拼縫
        for (const o of [-20, -8, 6, 20]) {
          creaseLine(ctx, sh, [along(-8 * bulk, o * bulk), along(32 * bulk, o * bulk)], 'rgba(0,0,0,0.26)', 2);
        }
        // 鐵框
        ctx.save();
        ctx.clip(sh);
        ctx.strokeStyle = 'rgba(200,214,238,0.35)';
        ctx.lineWidth = 4;
        ctx.stroke(sh);
        ctx.restore();
        // 斜的加強條 + 鉚釘
        shade(ctx, capsule(along(4 * bulk, -26 * bulk).x, along(4 * bulk, -26 * bulk).y,
          along(20 * bulk, 26 * bulk).x, along(20 * bulk, 26 * bulk).y, 4 * bulk), metal, opt(c0.x, c0.y, 20));
        rivets([6, 12, 18], -20 * bulk, 1.8);
        rivets([8, 14, 20], 20 * bulk, 1.8);
        // 盾心
        shade(ctx, capsule(c0.x, c0.y, c0.x + 0.5, c0.y, 8 * bulk), metal, opt(c0.x, c0.y, 12, { ao: 0.3 }));
        shade(ctx, capsule(c0.x, c0.y, c0.x + 0.4, c0.y, 3.4 * bulk), brass, opt(c0.x, c0.y, 6));
      }
      // 後手的釘錘：柄 + 帶稜的錘頭
      const hb = J.handB, eb = J.elbowB;
      const ab = Math.atan2(hb.y - eb.y, hb.x - eb.x);
      const mtip = { x: hb.x + Math.cos(ab) * 34 * bulk, y: hb.y + Math.sin(ab) * 34 * bulk };
      shade(ctx, capsule(hb.x, hb.y, mtip.x, mtip.y, 3.4 * bulk), wood, opt(hb.x, hb.y, 16));
      shade(ctx, capsule(hb.x, hb.y, hb.x + Math.cos(ab) * 12 * bulk, hb.y + Math.sin(ab) * 12 * bulk, 3.8 * bulk), wrapM, opt(hb.x, hb.y, 10));
      shade(ctx, capsule(mtip.x, mtip.y, mtip.x + 1, mtip.y + 1, 9 * bulk), dark, opt(mtip.x, mtip.y, 14, { ao: 0.3 }));
      if (!flat) {
        // 錘頭的四道稜
        for (let i = 0; i < 4; i++) {
          const a3 = ab + (i / 4) * Math.PI * 2;
          const f0 = { x: mtip.x + Math.cos(a3) * 6 * bulk, y: mtip.y + Math.sin(a3) * 6 * bulk };
          const f1 = { x: mtip.x + Math.cos(a3) * 12 * bulk, y: mtip.y + Math.sin(a3) * 12 * bulk };
          shade(ctx, capsule(f0.x, f0.y, f1.x, f1.y, 3 * bulk, 1.2 * bulk), metal, opt(f0.x, f0.y, 5));
        }
      }
      tip = along(30 * bulk);
      break;
    }
    case 'halberd': {         // 長戟：矛尖 + 開了月牙口的側斧 + 背鉤 + 護柄鐵條 + 纏繩
      const tipP = along(112 * bulk);
      const tail = along(-46 * bulk);
      shade(ctx, capsule(tail.x, tail.y, tipP.x, tipP.y, 3.6 * bulk, 3.2 * bulk), wood, opt(h.x, h.y, 50, { ao: 0.25 }));
      gripWrap(-14 * bulk, 16 * bulk, 4.6 * bulk, 6);
      // 柄尾的鐵套
      shade(ctx, capsule(tail.x, tail.y, along(-38 * bulk).x, along(-38 * bulk).y, 4 * bulk), dark, opt(tail.x, tail.y, 8));
      // 護柄鐵條（langet）
      for (const o of [-1, 1]) {
        shade(ctx, capsule(along(70 * bulk, o * 3.6 * bulk).x, along(70 * bulk, o * 3.6 * bulk).y,
          along(92 * bulk, o * 3.6 * bulk).x, along(92 * bulk, o * 3.6 * bulk).y, 1.6 * bulk), dark, opt(tipP.x, tipP.y, 16));
      }
      // 矛尖
      const spear = poly([
        along(92 * bulk, -5.5 * bulk), along(104 * bulk, -3 * bulk),
        { x: tipP.x, y: tipP.y }, along(104 * bulk, 3 * bulk), along(92 * bulk, 5.5 * bulk),
      ]);
      shade(ctx, spear, metal, { ...opt(tipP.x, tipP.y, 24), ao: 0.2 });
      bevel(spear, along(94 * bulk, -1 * bulk), along(109 * bulk, 0), 0.6);
      // 側斧：刃上開一個月牙口
      const axeBlade = poly([
        along(80 * bulk, -4 * bulk), along(84 * bulk, -26 * bulk),
        along(100 * bulk, -22 * bulk), along(103 * bulk, -12 * bulk),
        along(94 * bulk, -14 * bulk), along(92 * bulk, -2 * bulk),
      ]);
      shade(ctx, axeBlade, metal, opt(along(90 * bulk, -14 * bulk).x, along(90 * bulk, -14 * bulk).y, 20));
      bevel(axeBlade, along(86 * bulk, -24 * bulk), along(100 * bulk, -20 * bulk), 0.5);
      // 背面的鉤
      shade(ctx, poly([
        along(82 * bulk, 4 * bulk), along(94 * bulk, 16 * bulk),
        along(88 * bulk, 18 * bulk), along(80 * bulk, 8 * bulk),
      ]), dark, opt(tipP.x, tipP.y, 18));
      tip = tipP;
      break;
    }
    case 'knuckles': {        // 鐵指虎：纏布的拳 + 四個指節環 + 護手背板 + 腕帶
      for (const [hand, elbow, dim] of [[J.handF, J.elbowF, false], [J.handB, J.elbowB, true]]) {
        const a2 = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
        const back = { x: hand.x - Math.cos(a2) * 8 * bulk, y: hand.y - Math.sin(a2) * 8 * bulk };
        const front = { x: hand.x + Math.cos(a2) * 8 * bulk, y: hand.y + Math.sin(a2) * 8 * bulk };
        const mm = dim ? dark : metal;
        // 拳頭：纏布
        const fist = capsule(back.x, back.y, front.x, front.y, 7.6 * bulk, 7 * bulk);
        shade(ctx, fist, dim ? dark : wrapM, opt(hand.x, hand.y, 16, { ao: 0.35 }));
        if (!flat && !dim) {
          creaseLine(ctx, fist, [
            { x: hand.x - Math.sin(a2) * 7 * bulk, y: hand.y + Math.cos(a2) * 7 * bulk },
            { x: hand.x + Math.sin(a2) * 7 * bulk, y: hand.y - Math.cos(a2) * 7 * bulk },
          ], 'rgba(80,68,52,0.5)', 1.8);
        }
        // 四個指節環
        for (let i = -1.5; i <= 1.5; i++) {
          const k0 = {
            x: front.x - Math.sin(a2) * i * 3.6 * bulk,
            y: front.y + Math.cos(a2) * i * 3.6 * bulk,
          };
          const k1 = { x: k0.x + Math.cos(a2) * 2.8 * bulk, y: k0.y + Math.sin(a2) * 2.8 * bulk };
          shade(ctx, capsule(k0.x, k0.y, k1.x, k1.y, 2.7 * bulk), mm, opt(k0.x, k0.y, 6, { ao: 0.3 }));
          if (!flat && !dim) bevel(capsule(k0.x, k0.y, k1.x, k1.y, 2.7 * bulk), k0, k1, 0.45);
        }
        // 護手背板 + 鉚釘
        const plate = poly([
          { x: back.x - Math.sin(a2) * 6 * bulk, y: back.y + Math.cos(a2) * 6 * bulk },
          { x: front.x - Math.sin(a2) * 5 * bulk, y: front.y + Math.cos(a2) * 5 * bulk },
          { x: front.x - Math.sin(a2) * 1 * bulk, y: front.y + Math.cos(a2) * 1 * bulk },
          { x: back.x - Math.sin(a2) * 2 * bulk, y: back.y + Math.cos(a2) * 2 * bulk },
        ]);
        shade(ctx, plate, mm, opt(hand.x, hand.y, 12));
        if (!flat && !dim) {
          const rv = { x: hand.x - Math.sin(a2) * 3.4 * bulk, y: hand.y + Math.cos(a2) * 3.4 * bulk };
          shade(ctx, capsule(rv.x, rv.y, rv.x + 0.4, rv.y, 1.5 * bulk), brass, opt(rv.x, rv.y, 3));
        }
        // 腕帶
        const wr = { x: back.x - Math.cos(a2) * 3 * bulk, y: back.y - Math.sin(a2) * 3 * bulk };
        shade(ctx, capsule(wr.x, wr.y, back.x, back.y, 6.4 * bulk, 6.8 * bulk), dim ? dark : mat(M.strap), opt(wr.x, wr.y, 8, { ao: 0.3 }));
      }
      tip = along(16 * bulk);
      break;
    }
    case 'crowbar': {         // 撬棍：六角斷面的扁鋼、彎折處有稜、一端鴨嘴一端尖爪
      const bend = along(34 * bulk);
      const tipP = along(52 * bulk, 16 * bulk);
      const tail = along(-24 * bulk);
      const shaft = capsule(tail.x, tail.y, bend.x, bend.y, 4 * bulk, 3.6 * bulk);
      shade(ctx, shaft, dark, opt(h.x, h.y, 26, { ao: 0.3 }));
      bevel(shaft, along(-20 * bulk, -1.4 * bulk), along(30 * bulk, -1.2 * bulk), 0.35);
      const knee = capsule(bend.x, bend.y, tipP.x, tipP.y, 3.6 * bulk, 3 * bulk);
      shade(ctx, knee, dark, opt(bend.x, bend.y, 16, { ao: 0.3 }));
      bevel(knee, along(36 * bulk, -1.2 * bulk), along(50 * bulk, 14 * bulk), 0.35);
      // 鴨嘴：末端劈開的扁頭
      const duck = poly([
        along(48 * bulk, 12 * bulk), along(62 * bulk, 21 * bulk),
        along(59 * bulk, 26 * bulk), along(45 * bulk, 17 * bulk),
      ]);
      shade(ctx, duck, metal, opt(tipP.x, tipP.y, 14));
      bevel(duck, along(50 * bulk, 15 * bulk), along(60 * bulk, 22 * bulk), 0.55);
      if (!flat) {
        // 劈開的縫
        creaseLine(ctx, duck, [along(54 * bulk, 17 * bulk), along(61 * bulk, 22.5 * bulk)], 'rgba(10,12,16,0.8)', 2.2);
      }
      // 尾端的尖爪（拔釘用的 V 形開口）
      const claw = poly([
        along(-22 * bulk, -3.2 * bulk), along(-36 * bulk, -8 * bulk),
        along(-35 * bulk, 1.5 * bulk), along(-22 * bulk, 3.2 * bulk),
      ]);
      shade(ctx, claw, metal, opt(tail.x, tail.y, 12));
      if (!flat) creaseLine(ctx, claw, [along(-28 * bulk, -2 * bulk), along(-35 * bulk, -3 * bulk)], 'rgba(10,12,16,0.8)', 2.4);
      // 防滑的纏帶
      gripWrap(-6 * bulk, 12 * bulk, 4.8 * bulk, 5);
      if (!flat) {
        // 掉漆露出的鐵色
        ctx.save();
        ctx.clip(shaft);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#9aa4b4';
        for (const d of [16, 24]) {
          const w0 = along(d * bulk, -2 * bulk);
          ctx.beginPath();
          ctx.ellipse(w0.x, w0.y, 3 * bulk, 1.4 * bulk, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      tip = { x: tipP.x, y: tipP.y };
      break;
    }
    default:
      break;
  }

  // 雙手武器：後手也扶在柄上，看起來才有重量
  if (spec.twoHand && !flat) {
    const grip = along(-18 * bulk);
    shade(ctx, capsule(grip.x, grip.y, grip.x + 1, grip.y + 1, 5.6 * bulk), mat(M.glove), opt(grip.x, grip.y, 9, { ao: 0.3 }));
  }
  // 前手的拳頭最後蓋上去，手指才是包住武器柄的
  if (spec.kind && spec.kind !== 'knuckles') {
    const g0 = along(-4 * bulk), g1 = along(5 * bulk);
    shade(ctx, capsule(g0.x, g0.y, g1.x, g1.y, 5 * bulk, 4.5 * bulk), mat(M.glove), opt(h.x, h.y, 9, { ao: 0.3 }));
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
  drawBody(ctx, char, poseFor(pose, 0.35, t * 2.4), fake, {});
  ctx.restore();
}

/** 畫面級：底片顆粒 + 暗角 + 色偏，最後一層疊上去 */
export function drawGrade(ctx, w, h, opts = {}) {
  const { grain = 0, vignette = 0.16, shift = 0 } = opts;
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
