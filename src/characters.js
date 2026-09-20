// 十位霓虹鬥士。
//
// 每位角色 = 一組數值 + 一副剪影 + 兩個專屬技能 + 一招必殺 + 一個被動。
// 這裡只有「資料」，技能的實作在 skills.js（用 kind 對應過去），
// 身體的畫法在 render.js（用 look 的零件名對應過去）。
//
// 平衡基準：血量 100、移速 300、跳躍 880、攻防倍率 1.0。
// 十位角色都落在基準的 ±25% 之內，沒有純粹的上位相容。

export const ROSTER = [
  {
    id: 'volt',
    name: '伏特', en: 'VOLT', title: '電光拳手',
    color: '#5ad8ff', accent: '#fff27a',
    tagline: '最快的拳，擦到就麻',
    stats: { hp: 95, speed: 340, jump: 920, weight: 0.95, atk: 0.94, def: 1.06, dash: 1.15 },
    build: { scale: 0.96, limb: 0.92, head: 1.0, torso: 0.96 },
    look: { head: 'visor', back: 'coil', weapon: 'gauntlet', shoulder: 'slim', trail: true },
    passive: { name: '超載', desc: '輕攻擊第三段必定麻痺，普攻節奏全場最快。' },
    skills: [
      {
        name: '閃擊衝拳', desc: '化為電弧向前衝，命中麻痺並穿到對手身後。',
        cd: 3.2, kind: 'dashStrike',
        params: { dist: 300, dur: 0.2, dmg: 13, kbx: 260, kby: -180, stun: 0.35, pass: true },
      },
      {
        name: '雷幕', desc: '在身邊炸開電網，把近身的對手彈開並麻痺。',
        cd: 5.5, kind: 'burst',
        params: { radius: 130, dmg: 11, kbx: 320, kby: -300, stun: 0.45 },
      },
    ],
    ult: {
      name: '十萬伏特', desc: '抓住對手連續電擊八下，最後一擊把人轟飛。',
      kind: 'flurry', params: { hits: 8, dmg: 5, interval: 0.07, radius: 150, finishKb: 620, stun: 0.12 },
    },
  },
  {
    id: 'ember',
    name: '燼火', en: 'EMBER', title: '烈焰劍士',
    color: '#ff7a3c', accent: '#ffd23f',
    tagline: '四平八穩的起手，越打越燙',
    stats: { hp: 100, speed: 300, jump: 880, weight: 1.0, atk: 1.0, def: 1.0, dash: 1.0 },
    build: { scale: 1.0, limb: 1.0, head: 1.0, torso: 1.0 },
    look: { head: 'crown', back: 'cape', weapon: 'blade', shoulder: 'plate' },
    passive: { name: '延燒', desc: '所有命中都附帶灼燒；對燃燒中的目標傷害 +15%。' },
    skills: [
      {
        name: '炎斬波', desc: '揮出貼地飛行的火焰新月斬。',
        cd: 2.6, kind: 'projectile',
        params: { speed: 620, dmg: 12, kbx: 220, kby: -140, shape: 'crescent', life: 1.1, burn: 2.5 },
      },
      {
        name: '昇龍焰', desc: '帶霸體的上昇斬，把對手高高打飛。',
        cd: 5.0, kind: 'uppercut',
        params: { rise: 760, dmg: 16, kbx: 140, kby: -620, armor: 0.35, burn: 3 },
      },
    ],
    ult: {
      name: '紅蓮亂舞', desc: '瞬間拉近後連斬六刀，最後一刀引爆火柱。',
      kind: 'rushCombo', params: { hits: 6, dmg: 7, dash: 360, finishDmg: 18, burn: 4 },
    },
  },
  {
    id: 'azure',
    name: '蒼瀧', en: 'AZURE', title: '長槍守衛',
    color: '#4d8bff', accent: '#9df1ff',
    tagline: '不讓你靠近的那根槍',
    stats: { hp: 105, speed: 285, jump: 860, weight: 1.05, atk: 1.02, def: 0.95, dash: 0.95 },
    build: { scale: 1.02, limb: 1.05, head: 0.98, torso: 1.02 },
    look: { head: 'mask', back: 'banner', weapon: 'spear', shoulder: 'plate' },
    passive: { name: '間合', desc: '普攻距離最長；對手距離越遠傷害越高（最多 +20%）。' },
    skills: [
      {
        name: '水龍突', desc: '前衝長距離刺擊，貫穿途中的一切。',
        cd: 3.4, kind: 'dashStrike',
        params: { dist: 340, dur: 0.24, dmg: 15, kbx: 380, kby: -120, pass: true, slow: 1.2 },
      },
      {
        name: '渦流盾', desc: '展開水渦：減傷 60%，並把貼近的對手推開。',
        cd: 7.5, kind: 'ward',
        params: { dur: 3.0, dr: 0.6, push: 340, radius: 120 },
      },
    ],
    ult: {
      name: '蒼海之槍', desc: '貫穿全場的巨大水柱，把路徑上的一切轟開。',
      kind: 'beam', params: { dmg: 34, width: 96, dur: 0.6, kbx: 560, kby: -220 },
    },
  },
  {
    id: 'gale',
    name: '疾翎', en: 'GALE', title: '風刃遊俠',
    color: '#5bffa8', accent: '#d8ff6b',
    tagline: '待在空中的時間比誰都長',
    stats: { hp: 90, speed: 325, jump: 960, weight: 0.86, atk: 0.95, def: 1.08, dash: 1.1 },
    build: { scale: 0.95, limb: 0.9, head: 1.02, torso: 0.94 },
    look: { head: 'antenna', back: 'wings', weapon: 'claws', shoulder: 'slim', trail: true },
    passive: { name: '輕身', desc: '可在空中再跳一次，下墜速度較慢。' },
    skills: [
      {
        name: '迴旋風刃', desc: '擲出會飛回來的風輪，去程與回程都會打中。',
        cd: 3.0, kind: 'boomerang',
        params: { speed: 620, dmg: 10, range: 380, kbx: 180, kby: -120 },
      },
      {
        name: '滯空踢', desc: '空中向斜下俯衝踢擊，落地激起衝擊波。',
        cd: 4.2, kind: 'divekick',
        params: { speed: 900, dmg: 14, kbx: 260, kby: -260, quake: 90 },
      },
    ],
    ult: {
      name: '暴風連斬', desc: '捲起龍捲風把對手吸住，連續割裂十下。',
      kind: 'vortex', params: { dur: 1.4, dmg: 4, interval: 0.12, radius: 190, pull: 420 },
    },
  },
  {
    id: 'frost',
    name: '霜稜', en: 'FROST', title: '冰結術士',
    color: '#9be8ff', accent: '#ffffff',
    tagline: '先凍住，再慢慢處理',
    stats: { hp: 96, speed: 280, jump: 860, weight: 1.0, atk: 1.0, def: 0.98, dash: 0.95 },
    build: { scale: 1.0, limb: 0.96, head: 1.04, torso: 1.0 },
    look: { head: 'prism', back: 'drone', weapon: 'staff', shoulder: 'slim', aura: true },
    passive: { name: '凍甲', desc: '被打中時反噬寒氣，攻擊者移速降為 70%。' },
    skills: [
      {
        name: '冰棘地', desc: '地面竄出一排冰刺，命中者被凍住。',
        cd: 4.0, kind: 'spikes',
        params: { count: 5, step: 86, dmg: 9, freeze: 0.9, kby: -280 },
      },
      {
        name: '絕對冷卻', desc: '射出緩慢的冰核，命中直接凍結 1.4 秒。',
        cd: 6.0, kind: 'projectile',
        params: { speed: 360, dmg: 12, kbx: 120, kby: -80, shape: 'shard', life: 2.0, freeze: 1.4 },
      },
    ],
    ult: {
      name: '絕對零度', desc: '整片戰場結霜，凍結對手後冰晶爆碎。',
      kind: 'fieldFreeze', params: { dmg: 30, freeze: 1.6, kbx: 260, kby: -420 },
    },
  },
  {
    id: 'venom',
    name: '蝕紫', en: 'VENOM', title: '疫毒刺客',
    color: '#b46bff', accent: '#8dff5a',
    tagline: '毒進去之後，怎麼打都痛',
    stats: { hp: 94, speed: 310, jump: 890, weight: 0.95, atk: 0.98, def: 1.02, dash: 1.05 },
    build: { scale: 0.98, limb: 0.95, head: 1.0, torso: 0.98 },
    look: { head: 'hood', back: 'tail', weapon: 'claws', shoulder: 'slim' },
    passive: { name: '毒素共鳴', desc: '對中毒目標傷害 +25%，毒層數越多掉血越快。' },
    skills: [
      {
        name: '毒霧陷阱', desc: '在腳下留一團毒霧，踏入者持續中毒並減速。',
        cd: 4.5, kind: 'zone',
        params: { radius: 110, dur: 5, tick: 0.5, dmg: 2.5, poison: 1, slow: 0.7, follow: false },
      },
      {
        name: '腐蝕爪', desc: '突進三連爪，每一爪疊一層毒。',
        cd: 3.6, kind: 'rushCombo',
        params: { hits: 3, dmg: 6, dash: 200, finishDmg: 8, poison: 1 },
      },
    ],
    ult: {
      name: '疫病領域', desc: '展開巨大毒界，期間對手每秒流失血量。',
      kind: 'zone', params: { radius: 260, dur: 6, tick: 0.35, dmg: 3.4, poison: 2, slow: 0.72, follow: true, ult: true },
    },
  },
  {
    id: 'magma',
    name: '熔岳', en: 'MAGMA', title: '熔岩重錘',
    color: '#ff5a3c', accent: '#ffb03a',
    tagline: '一錘下去，地都裂開',
    stats: { hp: 118, speed: 262, jump: 810, weight: 1.2, atk: 1.12, def: 0.88, dash: 0.85 },
    build: { scale: 1.12, limb: 1.25, head: 0.96, torso: 1.1 },
    look: { head: 'horns', back: 'core', weapon: 'hammer', shoulder: 'bulk' },
    passive: { name: '熔岩之軀', desc: '受傷降低 12%；被近身打中時反燒攻擊者。' },
    skills: [
      {
        name: '地裂錘', desc: '重錘砸地，前方裂出一道岩漿衝擊波。',
        cd: 4.4, kind: 'slam',
        params: { radius: 220, dmg: 18, kbx: 340, kby: -420, burn: 3, quake: 160 },
      },
      {
        name: '熔岩噴發', desc: '前方地面連續噴出三道岩漿柱。',
        cd: 5.2, kind: 'spikes',
        params: { count: 3, step: 110, dmg: 12, kby: -460, burn: 3, style: 'lava' },
      },
    ],
    ult: {
      name: '火山崩落', desc: '天降隕石覆蓋整片戰場。',
      kind: 'rain', params: { count: 9, dmg: 9, radius: 90, interval: 0.14, burn: 3 },
    },
  },
  {
    id: 'titan',
    name: '鋼獄', en: 'TITAN', title: '重裝壁壘',
    color: '#ffd24d', accent: '#9fb4ff',
    tagline: '推不動，也繞不過',
    stats: { hp: 125, speed: 250, jump: 790, weight: 1.28, atk: 1.0, def: 0.8, dash: 0.8 },
    build: { scale: 1.16, limb: 1.3, head: 1.0, torso: 1.14 },
    look: { head: 'helm', back: 'jets', weapon: 'shield', shoulder: 'bulk' },
    passive: { name: '鋼體', desc: '受到的傷害永久降低 20%，但機動性最差。' },
    skills: [
      {
        name: '盾衝', desc: '扛著盾牌全程霸體向前撞，撞到就把人壓著跑。',
        cd: 4.0, kind: 'dashStrike',
        params: { dist: 320, dur: 0.34, dmg: 16, kbx: 420, kby: -180, armor: 0.5, carry: true },
      },
      {
        name: '鋼壁', desc: '架起護盾：減傷 75% 且全程霸體。',
        cd: 8.0, kind: 'ward',
        params: { dur: 3.2, dr: 0.75, armor: 3.2, push: 0, radius: 0 },
      },
    ],
    ult: {
      name: '終結重砲', desc: '肩砲蓄力後轟出巨大能量彈。',
      kind: 'projectile',
      params: { speed: 520, dmg: 36, kbx: 620, kby: -320, shape: 'orb', life: 2.2, big: true, ult: true },
    },
  },
  {
    id: 'nova',
    name: '星蝕', en: 'NOVA', title: '星塵術師',
    color: '#c58cff', accent: '#ffe27a',
    tagline: '打得比誰都痛，也比誰都痛',
    stats: { hp: 92, speed: 295, jump: 880, weight: 0.98, atk: 1.22, def: 1.12, dash: 1.0 },
    build: { scale: 1.0, limb: 0.98, head: 1.0, torso: 1.0 },
    look: { head: 'halo', back: 'wings', weapon: 'orbstaff', shoulder: 'slim', aura: true },
    passive: { name: '星威', desc: '造成的傷害 +20%，受到的傷害也 +12%。' },
    skills: [
      {
        name: '星辰彈', desc: '射出會追蹤的星核，命中爆散。',
        cd: 3.2, kind: 'projectile',
        params: { speed: 420, dmg: 14, kbx: 240, kby: -200, shape: 'star', life: 2.4, homing: 2.6, boom: 90 },
      },
      {
        name: '重力塌縮', desc: '製造引力井把對手吸過來並上浮。',
        cd: 5.6, kind: 'gravity',
        params: { radius: 300, dur: 0.9, pull: 560, dmg: 8, lift: -200 },
      },
    ],
    ult: {
      name: '超新星', desc: '在前方壓縮出一顆星，然後讓它炸開。',
      kind: 'supernova', params: { charge: 0.55, radius: 320, dmg: 40, kbx: 640, kby: -520 },
    },
  },
  {
    id: 'shade',
    name: '夜刃', en: 'SHADE', title: '影狩刺客',
    color: '#ff5ec4', accent: '#7ef1ff',
    tagline: '閃掉一拳，從背後回敬',
    stats: { hp: 93, speed: 320, jump: 900, weight: 0.94, atk: 1.05, def: 1.04, dash: 1.2 },
    build: { scale: 0.97, limb: 0.94, head: 1.0, torso: 0.97 },
    look: { head: 'oni', back: 'blades', weapon: 'twin', shoulder: 'slim', trail: true },
    passive: { name: '殘影', desc: '15% 機率完全閃避；閃過之後 1 秒內移速大增。' },
    skills: [
      {
        name: '影步斬', desc: '瞬移到對手背後斬擊，背刺傷害 +30%。',
        cd: 3.6, kind: 'blink',
        params: { dmg: 15, kbx: 300, kby: -220, backstab: 1.3, offset: 66 },
      },
      {
        name: '虛影誘餌', desc: '留下一個假影子：對手的 AI 會被它騙走。',
        cd: 6.5, kind: 'decoy',
        params: { dur: 3.5, dr: 0.35 },
      },
    ],
    ult: {
      name: '千影亂舞', desc: '化為無數殘影往返斬擊，最後一刀收尾。',
      kind: 'flurry', params: { hits: 10, dmg: 4.5, interval: 0.06, radius: 170, finishKb: 560, teleport: true },
    },
  },
];

export const BY_ID = Object.fromEntries(ROSTER.map((c) => [c.id, c]));
export const IDS = ROSTER.map((c) => c.id);

export const getChar = (id) => BY_ID[id] || ROSTER[0];
export const randomId = () => IDS[Math.floor(Math.random() * IDS.length)];

/** 選角畫面的數值條：回傳 0~1。防禦倍率越低越耐打，所以要反過來。 */
const RANGE = {
  hp: [88, 128], speed: [240, 350], jump: [780, 970],
  atk: [0.9, 1.25], def: [0.78, 1.14],
};
export function statRatio(char, key) {
  const [lo, hi] = RANGE[key];
  const v = char.stats[key];
  const r = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return key === 'def' ? 1 - r : r;
}
