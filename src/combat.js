// 基礎攻擊的招式表（時間制，單位是秒）。
//
// 每一招都是「起手 → 判定 → 收招」三段：hit 是判定視窗，reach 是判定框
// （相對角色，x 會乘上面向）。輕攻擊三段可以接續，最後一段打得最遠。
//
// 武器決定攻擊距離與手感：長槍戳得遠、重錘慢而重、爪子快而短。

export const BASIC = {
  light1: {
    pose: 'light1', dur: 0.30, hit: [0.09, 0.15], dmg: 5.5, hitstun: 0.20,
    kb: [170, -40], reach: [40, -60, 58, 42], next: 'light2', step: 70, meter: 5,
  },
  light2: {
    pose: 'light2', dur: 0.32, hit: [0.10, 0.16], dmg: 6, hitstun: 0.22,
    kb: [200, -60], reach: [44, -58, 62, 44], next: 'light3', step: 80, meter: 5,
  },
  light3: {
    pose: 'light3', dur: 0.46, hit: [0.14, 0.24], dmg: 10, hitstun: 0.34,
    kb: [420, -300], reach: [50, -52, 76, 58], next: null, step: 120, meter: 8,
  },
  heavy: {
    pose: 'heavy', dur: 0.62, hit: [0.30, 0.40], dmg: 15, hitstun: 0.42,
    kb: [520, -340], reach: [54, -56, 92, 70], next: null, step: 150,
    armorFrom: 0.22, meter: 10, heavy: true,
  },
  airLight: {
    pose: 'light3', dur: 0.36, hit: [0.08, 0.20], dmg: 7, hitstun: 0.24,
    kb: [240, -180], reach: [42, -46, 70, 60], next: null, step: 0, meter: 5, air: true,
  },
  airHeavy: {
    pose: 'dive', dur: 0.5, hit: [0.10, 0.34], dmg: 12, hitstun: 0.3,
    kb: [280, -120], reach: [34, -30, 72, 76], next: null, step: 0, meter: 8, air: true,
  },
};

export const MAX_METER = 100;

/** 受擊者被打飛的距離會被體重吃掉一部分 */
export function knockbackScale(fighter) {
  return 1 / (fighter.char.stats.weight || 1);
}
