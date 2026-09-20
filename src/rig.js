// 骨架與姿勢。
//
// 角色完全由程式畫出來，沒有任何圖檔：這支檔案負責「骨頭在哪裡」，
// render.js 負責「骨頭長什麼樣」。座標是角色本地空間 —— 原點在腳底中心，
// y 軸向上為負；面向由 render.js 用 scale(-1,1) 處理，所以這裡一律朝右。
//
// 角度定義：0 = 正下方，正值往前（+x）。dir(a) = (sin a, cos a)。

const L = {
  hipY: -62,      // 髖高（腿佔身高的一半左右，才像真人）
  torso: 30,      // 髖 → 胸
  neck: 43,       // 髖 → 頸
  headY: -122,    // 頭心高度（脖子只露一小截）
  thigh: 31,
  shin: 31,
  upper: 25,
  fore: 24,
  shoulderW: 11,
};

const dir = (a) => ({ x: Math.sin(a), y: Math.cos(a) });

function chain(root, a1, l1, a2, l2) {
  const d1 = dir(a1);
  const mid = { x: root.x + d1.x * l1, y: root.y + d1.y * l1 };
  const d2 = dir(a1 + a2);
  const end = { x: mid.x + d2.x * l2, y: mid.y + d2.y * l2 };
  return { mid, end };
}

/**
 * 組出一副骨架。
 * spec 用四肢的角度描述姿勢，其他（頭、胸、髖）由 lean / crouch / bob 推出來。
 */
function assemble(spec) {
  const {
    lean = 0, crouch = 0, bob = 0, headTilt = 0,
    armF = [0.4, 0.5], armB = [-0.4, 0.5],
    legF = [0.25, 0.3], legB = [-0.25, 0.3],
    armLen = 1, legLen = 1,
  } = spec;

  const hip = { x: lean * 6, y: L.hipY + crouch + bob };
  const chestDir = dir(Math.PI + lean * 0.35);      // 往上、隨 lean 前傾
  const chest = { x: hip.x + chestDir.x * L.torso, y: hip.y + chestDir.y * L.torso };
  const neck = { x: hip.x + chestDir.x * L.neck, y: hip.y + chestDir.y * L.neck };
  const head = {
    x: neck.x + Math.sin(lean * 0.5 + headTilt) * 14,
    y: neck.y - 15 + Math.abs(bob) * 0.2,
  };

  const shF = { x: chest.x + L.shoulderW * 0.5, y: chest.y };
  const shB = { x: chest.x - L.shoulderW * 0.5, y: chest.y + 1 };

  const aF = chain(shF, armF[0], L.upper * armLen, armF[1], L.fore * armLen);
  const aB = chain(shB, armB[0], L.upper * armLen, armB[1], L.fore * armLen);
  const lF = chain(hip, legF[0], L.thigh * legLen, legF[1], L.shin * legLen);
  const lB = chain(hip, legB[0], L.thigh * legLen, legB[1], L.shin * legLen);

  return {
    hip, chest, neck, head,
    shoulderF: shF, elbowF: aF.mid, handF: aF.end,
    shoulderB: shB, elbowB: aB.mid, handB: aB.end,
    kneeF: lF.mid, footF: lF.end,
    kneeB: lB.mid, footB: lB.end,
    lean,
  };
}

const sin = Math.sin;

/**
 * 依狀態取得骨架。
 *   state  動作名稱
 *   k      這個動作的進度 0→1（攻擊類動作用它做出「蓄力→打出→收手」）
 *   phase  持續累加的相位（走路擺動、待機呼吸）
 */
export function poseFor(state, k = 0, phase = 0) {
  // 出招的節奏：ease-in 蓄力 → 爆發 → 慢慢收。三段各自用不同的曲線，
  // 打出去那一格才會「快」，收招才會「沉」。
  const anticipate = (p) => p * p;                       // 蓄力：越後面越快
  const snap = (p) => 1 - Math.pow(1 - p, 3);            // 打出：一瞬間到位
  const settle = (p) => 1 - Math.pow(1 - p, 1.6);        // 收招：慢慢回來
  /** 三段式的進度：k<a 蓄力（-1→0），a~b 打出（0→1），之後收回（1→0） */
  const swingK = (a, b) => (k < a ? -anticipate(k / a)
    : k < b ? snap((k - a) / (b - a))
      : 1 - settle((k - b) / (1 - b)) * 0.95);

  switch (state) {
    case 'run': {
      const s = sin(phase), c = Math.cos(phase);
      return assemble({
        lean: 0.56, bob: -Math.abs(c) * 4,
        // 手臂大幅擺動、手肘跟著收放，跑起來才有推進感
        armF: [0.25 - s * 1.25, 0.6 + Math.max(0, s) * 0.5],
        armB: [0.25 + s * 1.25, 0.6 + Math.max(0, -s) * 0.5],
        legF: [s * 1.05, 0.45 + Math.max(0, c) * 0.7],
        legB: [-s * 1.05, 0.45 + Math.max(0, -c) * 0.7],
        headTilt: -0.08,
      });
    }
    case 'jump':
      return assemble({
        lean: 0.2, bob: -3,
        armF: [2.1, 0.45], armB: [2.4, 0.55],
        legF: [1.05, 1.35], legB: [-0.2, 0.75],   // 前腿收、後腿蹬
      });
    case 'fall':
      return assemble({
        lean: -0.14,
        armF: [2.6, 0.28], armB: [2.85, 0.32],
        legF: [0.42, 0.3], legB: [-0.7, 0.62],
      });
    case 'land':
      return assemble({
        crouch: 16, lean: 0.28,
        armF: [1.3, 0.55], armB: [-1.05, 0.65],
        legF: [0.75, 1.2], legB: [-0.75, 1.2],
      });
    case 'crouch':
      return assemble({
        crouch: 20, lean: 0.34,
        armF: [0.95, 0.85], armB: [-0.5, 0.95],
        legF: [0.85, 1.35], legB: [-0.85, 1.35],
      });
    case 'guard': {
      // 武術的防禦架勢：重心後坐、兩手交疊護在身前
      const b = sin(phase * 2.2) * 0.02;
      return assemble({
        crouch: 8, lean: -0.22,
        armF: [1.32 + b, 1.62], armB: [1.5 + b, 1.7],
        legF: [0.38, 0.62], legB: [-0.62, 0.7],
        headTilt: 0.1,
      });
    }
    case 'dash':
      return assemble({
        lean: 1.05, bob: -5,
        armF: [-0.62, 0.3], armB: [-1.15, 0.34],
        legF: [1.35, 0.42], legB: [-0.65, 1.5],
        headTilt: -0.14,
      });
    case 'light1': {
      // 直拳：身體跟著轉、後手收在下巴旁
      const p = swingK(0.32, 0.5);
      return assemble({
        lean: 0.26 + Math.max(0, p) * 0.2,
        armF: [1.45 + p * 0.28, Math.max(0.06, 1.35 - Math.max(0, p) * 1.3)],
        armB: [-0.85 - Math.max(0, p) * 0.2, 1.25],
        legF: [0.34 + Math.max(0, p) * 0.12, 0.42], legB: [-0.52, 0.6],
        headTilt: -0.05,
      });
    }
    case 'light2': {
      // 後手的交叉拳：腰轉得更多
      const p = swingK(0.3, 0.5);
      return assemble({
        lean: 0.34 + Math.max(0, p) * 0.26,
        armF: [-0.55 - Math.max(0, p) * 0.35, 1.15],
        armB: [1.42 + p * 0.3, Math.max(0.06, 1.35 - Math.max(0, p) * 1.3)],
        legF: [0.5 + Math.max(0, p) * 0.16, 0.44], legB: [-0.62, 0.56],
      });
    }
    case 'light3': {
      // 迴旋踢：支撐腿轉、上身往後倒配重
      const p = k < 0.3 ? anticipate(k / 0.3) : 1 - settle((k - 0.3) / 0.7) * 0.95;
      return assemble({
        lean: 0.22 - p * 0.72, crouch: -p * 8,
        armF: [-0.95 - p * 0.75, 0.62], armB: [0.95 + p * 0.6, 0.72],
        legF: [0.28 + p * 1.62, Math.max(0.04, 0.95 - p * 0.92)],
        legB: [-0.32 - p * 0.28, 0.3],
        headTilt: -p * 0.2,
      });
    }
    case 'heavy': {
      // 大迴旋斬：後拉得更深、劈下去整個人壓進去
      const p = swingK(0.44, 0.62);
      const swing = p < 0 ? -1.25 + p * 0.5 : -0.75 + p * 3.3;
      return assemble({
        lean: p < 0 ? -0.42 + p * 0.12 : -0.3 + p * 0.92,
        crouch: p < 0 ? -4 : -2 + p * 12,
        armF: [swing, 0.3], armB: [swing - 0.28, 0.46],
        legF: [0.5 + Math.max(0, p) * 0.2, 0.48], legB: [-0.72 - Math.max(0, p) * 0.2, 0.8],
        headTilt: p < 0 ? 0.12 : -0.1,
      });
    }
    case 'cast': {
      const p = snap(Math.min(1, k * 2.2));
      return assemble({
        lean: -0.28 + p * 0.56,
        armF: [1.3 + p * 0.32, 0.22], armB: [1.05 + p * 0.34, 0.42],
        legF: [0.42, 0.46], legB: [-0.62, 0.62],
      });
    }
    case 'uppercut': {
      // 昇龍：蹲下蓄力 → 整個人拔起來
      const p = k < 0.22 ? -anticipate(k / 0.22) : snap((k - 0.22) / 0.4);
      const up = Math.max(0, p);
      return assemble({
        lean: -0.22 - up * 0.2, crouch: p < 0 ? 12 : 10 - up * 22,
        armF: [2.9 + up * 0.35, -0.22], armB: [-0.55, 0.85],
        legF: [0.22 - up * 0.1, 0.24], legB: [-0.85 - up * 0.25, 1.05],
        headTilt: -up * 0.12,
      });
    }
    case 'dive':
      return assemble({
        lean: 0.95,
        armF: [-1.15, 0.36], armB: [-1.65, 0.46],
        legF: [1.55, 0.12], legB: [0.65, 0.92],
        headTilt: -0.12,
      });
    case 'charge': {
      // 蓄力：重心壓低、武器拉到身後，越蓄越緊，還會微微發抖
      const p = Math.min(1, k * 1.4);
      return assemble({
        lean: -0.48 - p * 0.22, crouch: 6 + p * 8, bob: sin(k * 44) * 1.1 * p,
        armF: [-1.55 - p * 0.55, 0.48], armB: [-1.95 - p * 0.45, 0.58],
        legF: [0.78, 0.95], legB: [-0.9, 1.05],
        headTilt: 0.14 * p,
      });
    }
    case 'ult': {
      const p = snap(Math.min(1, k * 3));
      return assemble({
        lean: -0.42 + p * 0.22, crouch: 4 - p * 8, bob: -p * 4,
        armF: [2.6 - p * 0.65, 0.65], armB: [-2.6 + p * 0.65, 0.65],
        legF: [0.58, 0.48], legB: [-0.68, 0.62],
        headTilt: -0.1,
      });
    }
    case 'hurt': {
      // 被打中：頭先甩出去，身體才跟上（k 是剩餘硬直的進度）
      const p = 1 - k;
      return assemble({
        lean: -0.62 * p, crouch: 5 * p, headTilt: -0.42 * p,
        armF: [-1.35 * p - 0.18, 0.55], armB: [-1.75 * p - 0.18, 0.66],
        legF: [0.24 - 0.38 * p, 0.38], legB: [-0.44 - 0.1 * p, 0.5],
      });
    }
    case 'ko':
      return assemble({
        lean: -1.0, crouch: 32, headTilt: -0.7,
        armF: [-2.3, 0.26], armB: [-2.7, 0.36],
        legF: [1.4, 1.55], legB: [-1.3, 1.55],
      });
    case 'idle':
    default: {
      const b = sin(phase * 0.9);
      const b2 = sin(phase * 0.9 + 0.7);
      // 武術的預備架勢：側身、重心微沉、前手在前護著、後手收在腰側
      return assemble({
        lean: 0.14, bob: b * 1.6, crouch: 3,
        armF: [0.88 + b * 0.06, 1.05 + b2 * 0.05],
        armB: [-0.55 - b * 0.05, 1.1 + b2 * 0.04],
        legF: [0.32, 0.36], legB: [-0.36, 0.42],
        headTilt: b2 * 0.03,
      });
    }
  }
}

/**
 * 兩副骨架之間的內插。
 * 動作切換時如果直接換一副骨架，畫面上會「啪」地跳一下；
 * 每一幀往目標靠近一點點，轉場就順了（a 越大越快跟上）。
 */
export function blendRig(prev, next, a) {
  if (!prev) return next;
  const out = {};
  for (const key of Object.keys(next)) {
    const v = next[key];
    if (typeof v === 'number') {
      out[key] = prev[key] === undefined ? v : prev[key] + (v - prev[key]) * a;
    } else if (v && typeof v.x === 'number') {
      const p = prev[key] || v;
      out[key] = { x: p.x + (v.x - p.x) * a, y: p.y + (v.y - p.y) * a };
    } else {
      out[key] = v;
    }
  }
  return out;
}

export const RIG_LENGTHS = L;
