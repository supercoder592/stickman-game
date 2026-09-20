// 繪圖工具組。
//
// 招式特效走「深色實心 + 描邊 + 加法光暈」；UI 走舊鋼板質感（見 panel）。
// 光暈不用 ctx.shadowBlur（在低階裝置上很貴），改成「同一條路徑描三次」：
// 最外圈粗而淡、中圈中等、最內圈是亮芯，疊出發光管的感覺。

import { withAlpha } from './util.js';

export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ 路徑
export function polyPath(pts, close = true) {
  const p = new Path2D();
  if (!pts.length) return p;
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
  if (close) p.closePath();
  return p;
}

export function linePath(...pts) {
  return polyPath(pts, false);
}

export function circlePath(x, y, r) {
  const p = new Path2D();
  p.arc(x, y, Math.max(0.01, r), 0, TAU);
  return p;
}

export function arcPath(x, y, r, a0, a1) {
  const p = new Path2D();
  p.arc(x, y, Math.max(0.01, r), a0, a1);
  return p;
}

/** 錐形肢體：從 a 到 b，兩端寬度可不同，是角色身上所有骨架的基本形 */
export function taperPath(ax, ay, bx, by, w1, w2 = w1 * 0.7) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return polyPath([
    { x: ax + nx * w1, y: ay + ny * w1 },
    { x: bx + nx * w2, y: by + ny * w2 },
    { x: bx - nx * w2, y: by - ny * w2 },
    { x: ax - nx * w1, y: ay - ny * w1 },
  ]);
}

/** 正多邊形（六角形＝這套美術的招牌形狀） */
export function ngonPath(x, y, r, sides = 6, rot = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (TAU * i) / sides;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return polyPath(pts);
}

export function starPath(x, y, points, outer, inner, rot = 0) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (Math.PI * i) / points;
    const r = i % 2 === 0 ? outer : inner;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return polyPath(pts);
}

/** 新月形斬擊：沿圓弧鋪一條中間厚、兩端尖的帶子 */
export function crescentPath(cx, cy, r, a0, a1, width, steps = 20) {
  const outer = [], inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const w = width * Math.pow(Math.sin(t * Math.PI), 0.6);
    const c = Math.cos(a), s = Math.sin(a);
    outer.push({ x: cx + c * (r + w), y: cy + s * (r + w) });
    inner.push({ x: cx + c * (r - w), y: cy + s * (r - w) });
  }
  inner.reverse();
  return polyPath(outer.concat(inner));
}

/** 鋸齒線（電流、裂縫） */
export function joltPath(ax, ay, bx, by, segs = 8, amp = 10, rng = Math.random) {
  const pts = [{ x: ax, y: ay }];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const o = (rng() * 2 - 1) * amp * Math.sin(t * Math.PI);
    pts.push({ x: ax + dx * t + nx * o, y: ay + dy * t + ny * o });
  }
  pts.push({ x: bx, y: by });
  return polyPath(pts, false);
}

// ------------------------------------------------------------------ 上色
/** 霓虹描邊：外光暈 → 主色 → 亮芯 */
export function neonStroke(ctx, path, color, width = 4, glow = 1) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = width * 4.2;
    ctx.strokeStyle = withAlpha(color, 0.07 * glow);
    ctx.stroke(path);
    ctx.lineWidth = width * 2.1;
    ctx.strokeStyle = withAlpha(color, 0.16 * glow);
    ctx.stroke(path);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke(path);
  if (width > 2.4) {
    ctx.lineWidth = width * 0.3;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke(path);
  }
}

/** 深色實心 + 霓虹邊：角色身上每一塊板子都用這個 */
export function neonPlate(ctx, path, color, opts = {}) {
  const { core = '#0a0c18', width = 3, glow = 1, alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = core;
  ctx.fill(path);
  neonStroke(ctx, path, color, width, glow);
  ctx.restore();
}

/** 純發光填色（特效用，走加法混色） */
export function glowFill(ctx, path, color, alpha = 0.8, bloom = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (bloom > 0) {
    ctx.globalAlpha = alpha * 0.25 * bloom;
    ctx.fillStyle = color;
    ctx.fill(path);
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
}

/** 畫一段文字（街機字重＋陰影），回傳量到的寬度 */
export function text(ctx, str, x, y, opts = {}) {
  const {
    size = 20, color = '#e7ecff', align = 'left', weight = 700,
    shadow = 'rgba(0,0,0,.75)', letter = 0, baseline = 'alphabetic', glow = 0,
  } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (letter && ctx.letterSpacing !== undefined) ctx.letterSpacing = `${letter}px`;
  if (glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(typeof color === 'string' && color[0] === '#' ? color : '#ffffff', 0.25 * glow);
    ctx.fillText(str, x, y);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(str, x + 2, y + 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

export function measure(ctx, str, size = 20, weight = 700) {
  ctx.save();
  ctx.font = `${weight} ${size}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

/**
 * 面板：一塊有切角的舊鋼板。
 * 深色金屬漸層 + 上緣受光的亮邊 + 下緣的暗邊 + 一道主題色的噴漆，
 * 整套 UI（HUD、選單、觸控鍵）共用同一個質感，跟角色的寫實打光對得上。
 */
export function platePath(x, y, w, h, cut = 12) {
  const p = new Path2D();
  p.moveTo(x + cut, y);
  p.lineTo(x + w, y);
  p.lineTo(x + w, y + h - cut);
  p.lineTo(x + w - cut, y + h);
  p.lineTo(x, y + h);
  p.lineTo(x, y + cut);
  p.closePath();
  return p;
}

export function panel(ctx, x, y, w, h, color = '#8f9bb5', opts = {}) {
  const { fill = null, width = 1.6, glow = 0.8, cut = 12 } = opts;
  const p = platePath(x, y, w, h, cut);
  ctx.save();

  // 鋼板本體
  if (fill) {
    ctx.fillStyle = fill;
  } else {
    const g = ctx.createLinearGradient(x, y, x + w * 0.25, y + h);
    g.addColorStop(0, 'rgba(46,52,64,0.95)');
    g.addColorStop(0.45, 'rgba(26,30,38,0.95)');
    g.addColorStop(1, 'rgba(13,15,20,0.96)');
    ctx.fillStyle = g;
  }
  ctx.fill(p);

  // 斜向的刷紋
  ctx.save();
  ctx.clip(p);
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#cdd6e8';
  ctx.lineWidth = 1;
  for (let i = -h; i < w + h; i += 7) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  // 上緣的主題色噴漆
  ctx.globalAlpha = 0.5 + glow * 0.3;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 3);
  ctx.globalAlpha = 0.12;
  ctx.fillRect(x, y, w, Math.min(h * 0.34, 22));
  ctx.restore();

  // 邊緣：受光的上緣亮、背光的下緣暗
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.stroke(p);
  ctx.save();
  ctx.clip(p);
  ctx.strokeStyle = 'rgba(210,222,245,0.28)';
  ctx.lineWidth = 1.4;
  ctx.translate(0.8, 0.8);
  ctx.stroke(p);
  ctx.restore();

  ctx.restore();
  return p;
}

/** 鏤空模板字：工業感的標題與數字 */
export function stencil(ctx, str, x, y, opts = {}) {
  const { size = 30, color = '#e8edf8', align = 'center', weight = 900, letter = 2, alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  text(ctx, str, x, y, { size, color, align, weight, letter, shadow: 'rgba(0,0,0,0.85)' });
  ctx.restore();
}
