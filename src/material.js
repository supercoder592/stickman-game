// 寫實渲染的材質與打光工具。
//
// 這一層決定整個遊戲「看起來像不像真的」。作法不是描邊，而是**每一塊形狀都上光**：
//   1. 形狀本身（多邊形／膠囊）
//   2. 沿著光線方向的漸層（亮面 → 中間調 → 暗面）
//   3. 背光側的輪廓光（rim light）—— 讓角色從暗背景裡浮出來
//   4. 金屬另外加一道窄而亮的高光帶（specular）
//   5. 接地陰影與遮蔽陰影（ambient occlusion）
//
// 全部用 Canvas 2D 的漸層做，不需要任何貼圖。

import { clamp, lerp, withAlpha } from './util.js';

/** 場景主光源方向（左上打下來），rim 是背後的補光 */
export const LIGHT = { x: -0.5, y: -0.86 };
export const RIM = { x: 0.62, y: -0.78 };

/** 材質：base 中間調、light 亮面、dark 暗面、spec 高光強度、rough 粗糙度（高光越寬） */
export const MAT = {
  steel: { base: '#767d89', light: '#eef3fb', dark: '#1e222a', spec: 0.95, rough: 0.12 },
  iron: { base: '#535964', light: '#a8b1bf', dark: '#16191f', spec: 0.55, rough: 0.3 },
  darkIron: { base: '#3d424a', light: '#868e9c', dark: '#111318', spec: 0.4, rough: 0.35 },
  brass: { base: '#9a7a3c', light: '#f3dc9a', dark: '#2c2110', spec: 0.8, rough: 0.2 },
  rust: { base: '#7e5335', light: '#cf9765', dark: '#281509', spec: 0.22, rough: 0.6 },
  leather: { base: '#634b37', light: '#a9855f', dark: '#211610', spec: 0.18, rough: 0.7 },
  cloth: { base: '#3c4354', light: '#7c8799', dark: '#15181f', spec: 0.06, rough: 0.9 },
  skin: { base: '#8f6242', light: '#caa07a', dark: '#39241a', spec: 0.2, rough: 0.55 },
  rubber: { base: '#2b2e34', light: '#666c76', dark: '#0c0d10', spec: 0.3, rough: 0.45 },
  bone: { base: '#b9b3a4', light: '#f2ece0', dark: '#3b372f', spec: 0.3, rough: 0.5 },
};

/** 依角色的主題色把材質染一下（同一套盔甲，不同人不同顏色） */
export function tint(mat, color, amount = 0.35) {
  return {
    ...mat,
    base: mixColor(mat.base, color, amount),
    light: mixColor(mat.light, color, amount * 0.55),
    dark: mixColor(mat.dark, color, amount * 0.5),
  };
}

export function mixColor(a, b, t) {
  const pa = parseHex(a), pb = parseHex(b);
  return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
}

function parseHex(h) {
  if (h[0] !== '#') {
    const m = h.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ------------------------------------------------------------------ 形狀
/** 膠囊：手腳、刀柄、鎖鏈都用它 */
export function capsule(ax, ay, bx, by, wa, wb = wa) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const p = new Path2D();
  p.moveTo(ax + nx * wa, ay + ny * wa);
  p.lineTo(bx + nx * wb, by + ny * wb);
  p.arc(bx, by, wb, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
  p.lineTo(ax - nx * wa, ay - ny * wa);
  p.arc(ax, ay, wa, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
  p.closePath();
  return p;
}

/**
 * 平滑封閉曲線：把折線的轉角磨圓。
 * 身體、頭顱、靴子這種有機形狀用它，才不會看起來像疊起來的方塊；
 * round = 1 完全圓滑，0 等於直接連折線。
 */
export function smooth(pts, round = 1) {
  const n = pts.length;
  if (n < 3) return poly(pts);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const p = new Path2D();
  let m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const m1 = mid(c, pts[(i + 1) % n]);
    const flat = mid(m0, m1);
    p.quadraticCurveTo(lerp(flat.x, c.x, round), lerp(flat.y, c.y, round), m1.x, m1.y);
    m0 = m1;
  }
  p.closePath();
  return p;
}

/** 橢圓形狀（頭顱、護目鏡、肌肉團塊） */
export function ovalPath(cx, cy, rx, ry, rot = 0) {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

export function poly(pts, close = true) {
  const p = new Path2D();
  if (!pts.length) return p;
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
  if (close) p.closePath();
  return p;
}

/**
 * 一整條四肢（肩→肘→腕 / 髖→膝→踝）畫成單一形狀。
 * 分成兩段膠囊畫的話，關節處會出現一顆球的輪廓，看起來就是玩具人偶；
 * 連成一條有粗細變化的曲線，才有「一隻手臂」的感覺。
 */
export function limbPath(a, b, c, w0, w1, w2) {
  const nrm = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l, ux: dx / l, uy: dy / l };
  };
  const d0 = nrm(a, b), d1 = nrm(b, c);
  const nb = { x: (d0.x + d1.x) / 2, y: (d0.y + d1.y) / 2 };
  const nl = Math.hypot(nb.x, nb.y) || 1;
  nb.x /= nl; nb.y /= nl;
  const off = (p, n, w) => ({ x: p.x + n.x * w, y: p.y + n.y * w });
  return smooth([
    off(a, d0, w0),
    off(b, nb, w1),
    off(c, d1, w2),
    { x: c.x + d1.ux * w2 * 0.9, y: c.y + d1.uy * w2 * 0.9 },
    off(c, d1, -w2),
    off(b, nb, -w1),
    off(a, d0, -w0),
    { x: a.x - d0.ux * w0 * 0.9, y: a.y - d0.uy * w0 * 0.9 },
  ], 0.85);
}

/** 有厚度的刃面：從 a 到 b，一側是刃、一側是背 */
export function bladeShape(ax, ay, bx, by, w, back = 0.4) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return poly([
    { x: ax + nx * w * back, y: ay + ny * w * back },
    { x: ax + nx * w, y: ay + ny * w },
    { x: bx, y: by },
    { x: ax - nx * w * 0.25, y: ay - ny * w * 0.25 },
  ]);
}

// ------------------------------------------------------------------ 上光
/**
 * 把一個形狀上成有體積的樣子。
 * bounds 給漸層用；沒給就從 center/radius 推。
 */
export function shade(ctx, path, mat, opts = {}) {
  const {
    cx = 0, cy = 0, r = 30, light = LIGHT, rim = null, rimWidth = 1.5,
    alpha = 1, spec = true, ao = 0,
  } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 主漸層：亮面在光源側
  const gx0 = cx - light.x * r, gy0 = cy - light.y * r;
  const gx1 = cx + light.x * r, gy1 = cy + light.y * r;
  const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
  g.addColorStop(0, mat.light);
  g.addColorStop(0.3, mixColor(mat.light, mat.base, 0.72));
  g.addColorStop(0.58, mat.base);
  g.addColorStop(1, mat.dark);
  ctx.fillStyle = g;
  ctx.fill(path);

  // 金屬高光：一條窄帶
  if (spec && mat.spec > 0.2) {
    const sg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    const mid = 0.16 + mat.rough * 0.25;
    sg.addColorStop(Math.max(0, mid - 0.12), 'rgba(255,255,255,0)');
    sg.addColorStop(mid, `rgba(255,255,255,${0.55 * mat.spec})`);
    sg.addColorStop(Math.min(1, mid + 0.14), 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fill(path);
  }

  // 遮蔽陰影：形狀下緣壓深一點，看起來有重量
  if (ao > 0) {
    const ag = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    ag.addColorStop(0, 'rgba(0,0,0,0)');
    ag.addColorStop(1, `rgba(0,0,0,${0.38 * ao})`);
    ctx.fillStyle = ag;
    ctx.fill(path);
  }

  // 輪廓光：背光側描一道彩色細邊，角色才不會糊進背景
  if (rim) {
    ctx.save();
    ctx.clip(path);
    ctx.lineWidth = rimWidth * 2;
    ctx.strokeStyle = rim;
    ctx.globalAlpha = alpha * 0.55;
    ctx.translate(RIM.x * rimWidth * 0.8, RIM.y * rimWidth * 0.8);
    ctx.stroke(path);
    ctx.restore();
  }

  // 外緣暗描邊：讓形狀邊界清楚（寫實但不糊）
  ctx.globalAlpha = alpha * (opts.outline === undefined ? 0.6 : opts.outline);
  ctx.lineWidth = opts.outlineWidth || 1.7;
  ctx.strokeStyle = 'rgba(6,7,10,0.9)';
  ctx.stroke(path);
  ctx.restore();
}

/** 手腳：膠囊 + 上光，一行搞定 */
export function shadeLimb(ctx, ax, ay, bx, by, wa, wb, mat, opts = {}) {
  const path = capsule(ax, ay, bx, by, wa, wb);
  shade(ctx, path, mat, {
    cx: (ax + bx) / 2, cy: (ay + by) / 2, r: Math.max(wa, wb) * 1.6, ...opts,
  });
  return path;
}

/** 接地陰影：越高越淡越大 */
export function groundShadow(ctx, x, groundY, height, scale = 1) {
  const h = clamp(height, 0, 300);
  const k = 1 - h / 360;                 // 跳得越高，影子越淡越散
  const rx = 34 * scale * (1 + h / 420);
  const ry = Math.max(4, 9 * scale * (1 - h / 900));
  const g = ctx.createRadialGradient(x, groundY, 0, x, groundY, rx);
  g.addColorStop(0, `rgba(0,0,0,${0.62 * k})`);
  g.addColorStop(0.55, `rgba(0,0,0,${0.3 * k})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, groundY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ 質感
let noiseCanvas = null;
/** 底片顆粒：整個畫面疊一層很淡的雜訊，馬上就沒有「向量圖」的塑膠感 */
export function grainPattern(ctx) {
  if (!noiseCanvas) {
    noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = noiseCanvas.height = 128;
    const c = noiseCanvas.getContext('2d');
    const img = c.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }
  return ctx.createPattern(noiseCanvas, 'repeat');
}

/** 煙霧／塵土：一坨柔邊的徑向漸層 */
export function puff(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(0.55, withAlpha(color, alpha * 0.45));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** 光暈（爆炸、火花、燈光） */
export function bloom(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha('#ffffff', alpha));
  g.addColorStop(0.25, withAlpha(color, alpha * 0.85));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
