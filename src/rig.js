// 骨架與姿勢。
//
// 角色完全由程式畫出來，沒有任何圖檔：這支檔案負責「骨頭在哪裡」，
// render.js 負責「骨頭長什麼樣」。座標是角色本地空間 —— 原點在腳底中心，
// y 軸向上為負；面向由 render.js 用 scale(-1,1) 處理，所以這裡一律朝右。
//
// 角度定義：0 = 正下方，正值往前（+x）。dir(a) = (sin a, cos a)。

const L = {
  hipY: -54,      // 髖高
  torso: 26,      // 髖 → 胸
  neck: 38,       // 髖 → 頸
  headY: -104,    // 頭心高度
  thigh: 27,
  shin: 27,
  upper: 23,
  fore: 23,
  shoulderW: 9,
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
    y: neck.y - 14 + Math.abs(bob) * 0.2,
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
  switch (state) {
    case 'run': {
      const s = sin(phase), c = Math.cos(phase);
      return assemble({
        lean: 0.5, bob: -Math.abs(c) * 3,
        armF: [0.2 - s * 1.1, 0.7], armB: [0.2 + s * 1.1, 0.7],
        legF: [s * 0.95, 0.55 + Math.max(0, c) * 0.5],
        legB: [-s * 0.95, 0.55 + Math.max(0, -c) * 0.5],
      });
    }
    case 'jump':
      return assemble({
        lean: 0.18, bob: -2,
        armF: [1.9, 0.5], armB: [2.2, 0.6],
        legF: [0.9, 1.2], legB: [-0.3, 0.9],
      });
    case 'fall':
      return assemble({
        lean: -0.12,
        armF: [2.5, 0.3], armB: [2.7, 0.35],
        legF: [0.5, 0.35], legB: [-0.6, 0.5],
      });
    case 'land':
      return assemble({
        crouch: 14, lean: 0.25,
        armF: [1.2, 0.6], armB: [-1.0, 0.7],
        legF: [0.7, 1.1], legB: [-0.7, 1.1],
      });
    case 'crouch':
      return assemble({
        crouch: 18, lean: 0.3,
        armF: [0.9, 0.8], armB: [-0.5, 0.9],
        legF: [0.8, 1.3], legB: [-0.8, 1.3],
      });
    case 'guard':
      return assemble({
        crouch: 6, lean: -0.18,
        armF: [1.15, 1.5], armB: [1.35, 1.6],
        legF: [0.45, 0.55], legB: [-0.55, 0.6],
      });
    case 'dash':
      return assemble({
        lean: 1.0, bob: -4,
        armF: [-0.5, 0.35], armB: [-1.0, 0.4],
        legF: [1.25, 0.5], legB: [-0.6, 1.4],
      });
    case 'light1': {
      // 直拳：k<0.35 收手，0.35~0.6 打出去，之後收回
      const p = k < 0.3 ? -0.5 * (k / 0.3) : k < 0.55 ? -0.5 + 2.3 * ((k - 0.3) / 0.25) : 1.8 - 1.2 * ((k - 0.55) / 0.45);
      return assemble({
        lean: 0.3 + Math.min(p, 1.6) * 0.12,
        armF: [1.55 + (p - 1) * 0.1, Math.max(0.05, 1.5 - p)],
        armB: [-0.9, 1.0],
        legF: [0.35, 0.4], legB: [-0.5, 0.55],
      });
    }
    case 'light2': {
      const p = k < 0.3 ? -0.4 * (k / 0.3) : k < 0.55 ? -0.4 + 2.2 * ((k - 0.3) / 0.25) : 1.8 - 1.4 * ((k - 0.55) / 0.45);
      return assemble({
        lean: 0.42,
        armF: [-0.6, 1.2],
        armB: [1.5 + (p - 1) * 0.12, Math.max(0.05, 1.5 - p)],
        legF: [0.5, 0.45], legB: [-0.6, 0.5],
      });
    }
    case 'light3': {
      // 迴旋踢
      const p = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
      return assemble({
        lean: 0.2 - p * 0.55, crouch: -p * 6,
        armF: [-0.9 - p * 0.6, 0.7], armB: [0.9 + p * 0.5, 0.8],
        legF: [0.3 + p * 1.5, Math.max(0.05, 0.9 - p * 0.85)],
        legB: [-0.35 - p * 0.2, 0.35],
      });
    }
    case 'heavy': {
      // 大迴旋斬：後拉 → 劈下
      const p = k < 0.42 ? -1.0 * (k / 0.42) : Math.min(1, (k - 0.42) / 0.22);
      const swing = k < 0.42 ? -1.1 + p * 0.5 : -0.6 + p * 3.0;
      return assemble({
        lean: k < 0.42 ? -0.35 : 0.55, crouch: k < 0.42 ? -2 : 6,
        armF: [swing, 0.35], armB: [swing - 0.3, 0.5],
        legF: [0.55, 0.5], legB: [-0.7, 0.75],
      });
    }
    case 'cast': {
      const p = Math.sin(Math.min(1, k * 2) * Math.PI * 0.5);
      return assemble({
        lean: -0.25 + p * 0.5,
        armF: [1.35 + p * 0.25, 0.25], armB: [1.1 + p * 0.3, 0.45],
        legF: [0.4, 0.45], legB: [-0.6, 0.6],
      });
    }
    case 'uppercut': {
      const p = Math.min(1, k * 2.2);
      return assemble({
        lean: -0.25 - p * 0.15, crouch: 8 - p * 18,
        armF: [3.05 + p * 0.1, -0.25], armB: [-0.6, 0.8],
        legF: [0.2, 0.25], legB: [-0.9, 1.0],
      });
    }
    case 'dive':
      return assemble({
        lean: 0.9,
        armF: [-1.1, 0.4], armB: [-1.6, 0.5],
        legF: [1.5, 0.15], legB: [0.6, 0.9],
      });
    case 'ult': {
      const p = Math.min(1, k * 3);
      return assemble({
        lean: -0.4 + p * 0.2, crouch: 4 - p * 6, bob: -p * 3,
        armF: [2.5 - p * 0.6, 0.7], armB: [-2.5 + p * 0.6, 0.7],
        legF: [0.55, 0.5], legB: [-0.65, 0.6],
      });
    }
    case 'hurt': {
      const p = 1 - k;
      return assemble({
        lean: -0.5 * p, crouch: 4 * p, headTilt: -0.3 * p,
        armF: [-1.2 * p - 0.2, 0.6], armB: [-1.6 * p - 0.2, 0.7],
        legF: [0.25 - 0.3 * p, 0.4], legB: [-0.45, 0.5],
      });
    }
    case 'ko':
      return assemble({
        lean: -0.9, crouch: 30, headTilt: -0.6,
        armF: [-2.2, 0.3], armB: [-2.6, 0.4],
        legF: [1.3, 1.5], legB: [-1.2, 1.5],
      });
    case 'idle':
    default: {
      const b = sin(phase * 0.9);
      return assemble({
        lean: 0.06, bob: b * 1.6,
        armF: [0.55 + b * 0.08, 0.72], armB: [-0.42 - b * 0.08, 0.66],
        legF: [0.22, 0.28], legB: [-0.24, 0.3],
      });
    }
  }
}

export const RIG_LENGTHS = L;
