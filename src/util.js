// 通用小工具：數學、亂數、計時。整個專案共用。

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 0→1 的緩動，用在出招的加速與特效的收斂 */
export const easeOut = (t, p = 2) => 1 - Math.pow(1 - t, p);
export const easeIn = (t, p = 2) => Math.pow(t, p);

/** 矩形重疊（打擊判定用，全部都是 AABB） */
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rect(x, y, w, h) {
  return { x, y, w, h };
}

/** 以中心點與尺寸建立矩形 */
export function rectAt(cx, cy, w, h) {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** 可重現的亂數（連線時雙方要看到同一組粒子時使用） */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** 顏色：#rrggbb → rgba(...)，特效大量用到透明度 */
export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 兩個十六進位色的線性混合 */
export function mixHex(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const ch = (sh) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** 這台裝置是不是用手指操作的（手機／平板） */
export const isTouch = () => typeof window !== 'undefined'
  && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
