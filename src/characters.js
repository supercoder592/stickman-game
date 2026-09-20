// 十位鬥士 —— 每個人由「一把武器」定義。
//
// 辨識度的三層：
//   1. 武器（weapon.kind）：破壞錘、鉤爪、鏈鋸、鎖鏈鐮、雙匕、戰斧、塔盾釘錘、長戟、鐵指虎、撬棍
//      —— 剪影完全不同，遠遠一眼就知道誰在場上
//   2. 裝備（gear）：焊工面罩、防毒面具、兜帽、鋼盔、護目鏡、角盔、戰術面罩 + 背後的工具腰帶／鎖鏈盤／斗篷／刀鞘
//   3. 數值與招式：重的真的重、遠的真的遠
//
// 招式的 kind 對應 skills.js 的元件，look 的零件名對應 render.js 的畫法。
// 平衡基準：血量 100、移速 300、跳躍 880、攻防倍率 1.0。

export const ROSTER = [
  {
    id: 'anvil',
    name: '鐵砧', en: 'ANVIL', title: '破壞錘',
    color: '#ff7a3c', accent: '#ffca6b',
    tagline: '一錘下去，地板跟著裂',
    stats: { hp: 128, speed: 248, jump: 800, weight: 1.3, atk: 1.14, def: 0.86, dash: 0.82 },
    build: { scale: 1.12, bulk: 1.22, headScale: 0.98 },
    gear: { head: 'none', hair: 'bald', shoulder: 'heavy', back: 'none', chest: 'bare', outfit: 'sash' },
    palette: { armor: '#c9bda6', cloth: '#8a4a1c', hair: '#3a2a20', skin: '#c98a52', armorMat: 'rust', metalMat: 'iron' },
    weapon: { kind: 'hammer', reach: 1.34, hold: -1.05, twoHand: true },
    passive: { name: '重量級', desc: '出招途中自帶霸體，被打退的距離減少 40%。' },
    skills: [
      {
        name: '碎地重擊', desc: '把錘子砸進地面，前方裂開一道衝擊波。',
        cd: 4.2, kind: 'slam',
        params: { radius: 230, dmg: 20, kbx: 360, kby: -430, quake: 170, debris: 1 },
      },
      {
        name: '全力掄擊', desc: '蓄力旋轉一圈，打中直接把人轟到場邊。',
        cd: 5.6, kind: 'charge',
        params: { charge: 0.5, dmg: 30, kbx: 640, kby: -320, radius: 130, armor: 1.0 },
      },
    ],
    ult: {
      name: '拆樓作業', desc: '連續砸地七下，整片場地崩裂。',
      kind: 'quake', params: { count: 7, step: 120, dmg: 13, kby: -480, interval: 0.16 },
    },
  },
  {
    id: 'hook',
    name: '鉤索', en: 'HOOK', title: '鉤爪',
    color: '#38e1b0', accent: '#d8ff7a',
    tagline: '躲得再遠也會被拉回來',
    stats: { hp: 98, speed: 326, jump: 930, weight: 0.92, atk: 0.95, def: 1.05, dash: 1.16 },
    build: { scale: 0.98, bulk: 0.94, headScale: 1.0 },
    gear: { head: 'goggles', hair: 'short', shoulder: 'sleeve', back: 'coil', chest: 'bare', outfit: 'vest' },
    palette: { armor: '#2f6f5f', cloth: '#1f5a4c', hair: '#1f1a16', skin: '#d9a06c', armorMat: 'iron', metalMat: 'steel' },
    weapon: { kind: 'grapple', reach: 0.95, hold: 0 },
    passive: { name: '索敵', desc: '鉤中之後 3 秒內，對該目標的傷害提升 20%。' },
    skills: [
      {
        name: '鉤索擒拿', desc: '射出抓鉤，命中就把對手整個拉到面前。',
        cd: 3.6, kind: 'grapple',
        params: { range: 520, speed: 1250, dmg: 10, pull: 1, stagger: 0.3 },
      },
      {
        name: '飛索突進', desc: '把自己拉向前方，落地帶一記踢擊。',
        cd: 4.2, kind: 'zipline',
        params: { range: 460, speed: 1400, dmg: 14, kbx: 300, kby: -260 },
      },
    ],
    ult: {
      name: '鎖鏈亂舞', desc: '鉤住對手後高速甩打十次，最後砸向地面。',
      kind: 'flurry', params: { hits: 10, dmg: 5, interval: 0.07, finishKb: 600, chain: true },
    },
  },
  {
    id: 'ripper',
    name: '裂齒', en: 'RIPPER', title: '鏈鋸',
    color: '#c9ff3d', accent: '#ff5a3c',
    tagline: '貼上來就別想走',
    stats: { hp: 106, speed: 300, jump: 870, weight: 1.02, atk: 1.02, def: 0.98, dash: 1.0 },
    build: { scale: 1.02, bulk: 1.06, headScale: 1.0 },
    gear: { head: 'none', hair: 'wild', shoulder: 'none', back: 'none', chest: 'bare', outfit: 'vest' },
    palette: { armor: '#6b7a2a', cloth: '#4a5220', hair: '#8f3a1c', skin: '#e0b184', armorMat: 'rust', metalMat: 'steel' },
    weapon: { kind: 'chainsaw', reach: 1.06, hold: -0.18, twoHand: true },
    passive: { name: '撕裂', desc: '命中造成流血：持續掉血，且可以疊。' },
    skills: [
      {
        name: '鏈鋸猛攻', desc: '往前壓著切 1.2 秒，期間可以繼續走。',
        cd: 4.6, kind: 'sustained',
        params: { dur: 1.2, tick: 0.12, dmg: 4.2, reach: 92, bleed: 1, move: 120 },
      },
      {
        name: '撕裂突進', desc: '高速突進，鋸齒穿過對手。',
        cd: 3.4, kind: 'dashStrike',
        params: { dist: 300, dur: 0.2, dmg: 15, kbx: 240, kby: -160, pass: true, bleed: 2 },
      },
    ],
    ult: {
      name: '血肉磨坊', desc: '原地高速迴旋切割兩秒，把靠近的人全部絞進去。',
      kind: 'sustained',
      params: { dur: 2.0, tick: 0.1, dmg: 4.5, reach: 120, spin: true, bleed: 1, pull: 220 },
    },
  },
  {
    id: 'reaper',
    name: '鉤魂', en: 'REAPER', title: '鎖鏈鐮',
    color: '#9a6bff', accent: '#4dffd2',
    tagline: '半徑之內，沒有安全的位置',
    stats: { hp: 100, speed: 296, jump: 890, weight: 0.98, atk: 1.04, def: 1.0, dash: 1.04 },
    build: { scale: 1.0, bulk: 0.98, headScale: 1.0 },
    gear: { head: 'hood', hair: 'short', shoulder: 'none', back: 'cloak', chest: 'bare', outfit: 'robe' },
    palette: { armor: '#4a3a6e', cloth: '#2a2438', hair: '#e8e4d8', skin: '#c99a76', armorMat: 'darkIron', metalMat: 'steel' },
    weapon: { kind: 'chainscythe', reach: 1.22, hold: 0 },
    passive: { name: '死神凝視', desc: '對血量低於 35% 的目標，傷害提升 30%。' },
    skills: [
      {
        name: '迴旋鐮', desc: '以自己為中心甩一整圈，前後都打得到。',
        cd: 3.8, kind: 'chainSwing',
        params: { radius: 175, dmg: 16, kbx: 320, kby: -300, turns: 2 },
      },
      {
        name: '拋鐮', desc: '把鐮刀連著鏈子丟出去，回來時再割一次。',
        cd: 3.2, kind: 'boomerang',
        params: { speed: 700, dmg: 12, range: 430, kbx: 200, kby: -140 },
      },
    ],
    ult: {
      name: '收割', desc: '瞬移到對手背後，一鐮斬斷。',
      kind: 'reap', params: { dmg: 42, kbx: 520, kby: -360, backstab: 1.35 },
    },
  },
  {
    id: 'wraith',
    name: '疾影', en: 'WRAITH', title: '雙匕',
    color: '#ff4d88', accent: '#7ef1ff',
    tagline: '閃掉一刀，換你吃三刀',
    stats: { hp: 92, speed: 345, jump: 910, weight: 0.88, atk: 1.0, def: 1.06, dash: 1.22 },
    build: { scale: 0.96, bulk: 0.9, headScale: 1.0 },
    gear: { head: 'mask', hair: 'ponytail', shoulder: 'none', back: 'sheath', chest: 'bare', outfit: 'vest' },
    palette: { armor: '#7a3050', cloth: '#2a2430', hair: '#1a1620', skin: '#dda57c', armorMat: 'darkIron', metalMat: 'steel' },
    weapon: { kind: 'daggers', reach: 0.86, hold: 0 },
    passive: { name: '殘影', desc: '15% 機率完全閃避；閃掉之後 1 秒內移速大增。' },
    skills: [
      {
        name: '影襲', desc: '瞬移到對手背後刺擊，背刺傷害 +30%。',
        cd: 3.4, kind: 'blink',
        params: { dmg: 16, kbx: 280, kby: -200, backstab: 1.3, offset: 62 },
      },
      {
        name: '亂刺', desc: '突進後五連刺。',
        cd: 3.8, kind: 'rushCombo',
        params: { hits: 5, dmg: 5.5, dash: 240, finishDmg: 12, bleed: 1 },
      },
    ],
    ult: {
      name: '千刺', desc: '化為殘影來回突刺十二次。',
      kind: 'flurry', params: { hits: 12, dmg: 4.2, interval: 0.055, finishKb: 520, teleport: true },
    },
  },
  {
    id: 'cleaver',
    name: '斷頭', en: 'CLEAVER', title: '戰斧',
    color: '#e02020', accent: '#ffb03a',
    tagline: '蓄滿的那一斧沒人接得住',
    stats: { hp: 114, speed: 268, jump: 830, weight: 1.18, atk: 1.1, def: 0.9, dash: 0.9 },
    build: { scale: 1.08, bulk: 1.16, headScale: 1.02 },
    gear: { head: 'horned', hair: 'wild', shoulder: 'heavy', back: 'none', chest: 'bare', outfit: 'sash' },
    palette: { armor: '#9a2626', cloth: '#5a2020', hair: '#241a18', skin: '#c4804c', armorMat: 'iron', metalMat: 'steel' },
    weapon: { kind: 'axe', reach: 1.2, hold: -0.85, twoHand: true },
    passive: { name: '處刑', desc: '對硬直中的目標傷害提升 25%。' },
    skills: [
      {
        name: '蓄力劈', desc: '按住蓄力再劈，蓄越久越痛、附帶地裂。',
        cd: 4.8, kind: 'charge',
        params: { charge: 0.65, dmg: 34, kbx: 500, kby: -420, radius: 120, armor: 0.9, wave: 1 },
      },
      {
        name: '上挑斬', desc: '由下往上一斧，把對手挑到空中。',
        cd: 4.4, kind: 'uppercut',
        params: { rise: 700, dmg: 18, kbx: 160, kby: -640, armor: 0.35 },
      },
    ],
    ult: {
      name: '裂地斬', desc: '躍起後全力劈下，地面炸開一整排。',
      kind: 'cleave', params: { dmg: 40, kbx: 520, kby: -480, radius: 220, waves: 6 },
    },
  },
  {
    id: 'bulwark',
    name: '壁壘', en: 'BULWARK', title: '塔盾釘錘',
    color: '#ffc233', accent: '#9fd8ff',
    tagline: '推不動、繞不過、打不穿',
    stats: { hp: 132, speed: 242, jump: 780, weight: 1.34, atk: 0.98, def: 0.78, dash: 0.8 },
    build: { scale: 1.14, bulk: 1.26, headScale: 1.0 },
    gear: { head: 'helmet', hair: 'short', shoulder: 'heavy', back: 'none', chest: 'bare', outfit: 'gi' },
    palette: { armor: '#b08a22', cloth: '#4a5262', hair: '#3a2e22', skin: '#d6a274', armorMat: 'iron', metalMat: 'steel' },
    weapon: { kind: 'shieldmace', reach: 0.98, hold: 0.55 },
    passive: { name: '鋼體', desc: '受到的傷害永久降低 20%，擊退距離減少 40%。' },
    skills: [
      {
        name: '盾牌衝撞', desc: '扛著盾全程霸體往前撞，撞到就把人推著跑。',
        cd: 4.0, kind: 'dashStrike',
        params: { dist: 330, dur: 0.34, dmg: 17, kbx: 420, kby: -180, armor: 0.55, carry: true },
      },
      {
        name: '鐵壁', desc: '架起塔盾：減傷 75%、全程霸體。',
        cd: 8.0, kind: 'ward',
        params: { dur: 3.2, dr: 0.75, armor: 3.2, push: 220, radius: 110 },
      },
    ],
    ult: {
      name: '盾擊崩地', desc: '盾牌砸地引發環形衝擊，再一記釘錘收尾。',
      kind: 'slam',
      params: { radius: 300, dmg: 36, kbx: 520, kby: -520, quake: 220, debris: 2, ring: true },
    },
  },
  {
    id: 'lancer',
    name: '長戟', en: 'LANCER', title: '長柄戟',
    color: '#3d8bff', accent: '#e8f1ff',
    tagline: '你永遠進不到我的圈內',
    stats: { hp: 104, speed: 288, jump: 870, weight: 1.04, atk: 1.02, def: 0.96, dash: 0.98 },
    build: { scale: 1.04, bulk: 1.0, headScale: 0.98 },
    gear: { head: 'headband', hair: 'ponytail', shoulder: 'sleeve', back: 'none', chest: 'bare', outfit: 'gi' },
    palette: { armor: '#2f5aa0', cloth: '#2b3448', hair: '#1c1a24', skin: '#e3b184', armorMat: 'steel', metalMat: 'steel' },
    weapon: { kind: 'halberd', reach: 1.5, hold: -1.25, twoHand: true },
    passive: { name: '間合', desc: '攻擊距離全場最長；離對手越遠，傷害越高（最多 +20%）。' },
    skills: [
      {
        name: '貫穿突刺', desc: '長距離前衝突刺，穿過途中的一切。',
        cd: 3.4, kind: 'dashStrike',
        params: { dist: 380, dur: 0.24, dmg: 16, kbx: 380, kby: -140, pass: true },
      },
      {
        name: '橫掃', desc: '一記大迴旋橫掃，把周圍的人全掃開。',
        cd: 4.4, kind: 'sweep',
        params: { radius: 190, dmg: 15, kbx: 420, kby: -280, arc: 2.4 },
      },
    ],
    ult: {
      name: '一閃', desc: '全場貫穿衝刺，路徑上的一切被戳穿。',
      kind: 'lanceRush', params: { dmg: 40, kbx: 560, kby: -240 },
    },
  },
  {
    id: 'brawler',
    name: '鐵拳', en: 'BRAWLER', title: '鐵指虎',
    color: '#b8642a', accent: '#e8c98a',
    tagline: '貼上來，就沒人能把我推開',
    stats: { hp: 110, speed: 280, jump: 850, weight: 1.1, atk: 1.04, def: 0.94, dash: 0.92 },
    build: { scale: 1.06, bulk: 1.12, headScale: 1.0 },
    gear: { head: 'headband', hair: 'short', shoulder: 'sleeve', back: 'toolbelt', chest: 'bare', outfit: 'sash' },
    palette: { armor: '#8a5a2a', cloth: '#5a3a20', hair: '#161216', skin: '#b87840', armorMat: 'rust', metalMat: 'iron' },
    weapon: { kind: 'knuckles', reach: 0.86, hold: 0 },
    passive: { name: '近身壓制', desc: '離對手越近，傷害越高（最多 +25%）。' },
    skills: [
      {
        name: '震腳', desc: '重重踏地，把貼身的人震開。',
        cd: 5.0, kind: 'burst',
        params: { radius: 150, dmg: 20, kbx: 380, kby: -340 },
      },
      {
        name: '衝拳', desc: '一步踏進去，一記直拳把人打退。',
        cd: 3.6, kind: 'dashStrike',
        params: { dist: 250, dur: 0.2, dmg: 16, kbx: 330, kby: -200, stagger: 0.3 },
      },
    ],
    ult: {
      name: '百裂拳', desc: '揪住對手，近身連續重拳。',
      kind: 'flurry', params: { hits: 12, dmg: 4.4, interval: 0.07, finishKb: 540 },
    },
  },
  {
    id: 'prybar',
    name: '撬棍', en: 'PRYBAR', title: '鐵撬',
    color: '#9fae62', accent: '#dfe8ef',
    tagline: '打斷你的節奏，然後接管它',
    stats: { hp: 96, speed: 318, jump: 900, weight: 0.94, atk: 0.96, def: 1.04, dash: 1.12 },
    build: { scale: 0.99, bulk: 0.96, headScale: 1.0 },
    gear: { head: 'none', hair: 'ponytail', shoulder: 'sleeve', back: 'toolbelt', chest: 'bare', outfit: 'gi' },
    palette: { armor: '#5f6a34', cloth: '#3a4030', hair: '#4a3a24', skin: '#dcae80', armorMat: 'darkIron', metalMat: 'steel' },
    weapon: { kind: 'crowbar', reach: 1.06, hold: -0.35 },
    passive: { name: '打樁', desc: '輕攻擊第三段必定暈眩，普攻節奏全場最快。' },
    skills: [
      {
        name: '撬擊突進', desc: '低身衝進去，一記橫撬把人敲暈。',
        cd: 3.2, kind: 'dashStrike',
        params: { dist: 300, dur: 0.2, dmg: 13, kbx: 260, kby: -180, stagger: 0.42, pass: true },
      },
      {
        name: '鐵蒺藜', desc: '往腳下撒一地鐵刺，踩到就流血又拖慢。',
        cd: 5.2, kind: 'zone',
        params: { radius: 140, dur: 4, tick: 0.5, dmg: 3.4, bleed: 1, slow: 0.75 },
      },
    ],
    ult: {
      name: '亂棍', desc: '把人逼到牆角，一棍接一棍敲到底。',
      kind: 'rushCombo', params: { hits: 11, dmg: 5.2, dash: 200, finishKb: 520 },
    },
  },
];

export const BY_ID = Object.fromEntries(ROSTER.map((c) => [c.id, c]));
export const IDS = ROSTER.map((c) => c.id);

export const getChar = (id) => BY_ID[id] || ROSTER[0];
export const randomId = () => IDS[Math.floor(Math.random() * IDS.length)];

/** 選角畫面的數值條：回傳 0~1。受傷倍率越低越耐打，所以要反過來。 */
const RANGE = {
  hp: [88, 136], speed: [235, 350], jump: [770, 940],
  atk: [0.92, 1.18], def: [0.75, 1.1],
};
export function statRatio(char, key) {
  const [lo, hi] = RANGE[key];
  const v = char.stats[key];
  const r = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return key === 'def' ? 1 - r : r;
}
