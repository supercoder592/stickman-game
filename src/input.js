// 輸入層。
//
// 不論來源是鍵盤、觸控、AI 還是網路對手，最後都收斂成同一個 InputFrame：
//   { x: -1|0|1, up, down, edges: 位元遮罩 }
// 邊緣（按下的那一瞬間）用位元遮罩傳，因為連線時整包只要一個數字。

export const BTN = {
  JUMP: 1,
  LIGHT: 2,
  HEAVY: 4,
  S1: 8,
  S2: 16,
  ULT: 32,
  DASH: 64,
};

export function emptyFrame() {
  return { x: 0, up: false, down: false, edges: 0 };
}

/** 兩套鍵盤配置：同一台電腦就能兩個人打 */
export const BINDINGS = [
  {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['KeyW', 'Space'], light: ['KeyJ'], heavy: ['KeyK'],
    s1: ['KeyU'], s2: ['KeyI'], ult: ['KeyO'], dash: ['KeyL', 'ShiftLeft'],
  },
  {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['ArrowUp', 'Numpad0'], light: ['Numpad1'], heavy: ['Numpad2'],
    s1: ['Numpad4'], s2: ['Numpad5'], ult: ['Numpad6'], dash: ['Numpad3', 'ShiftRight'],
  },
];

const down = new Set();
const edges = new Set();      // 這一幀剛按下的鍵，讀完就清空
const typed = [];             // 這一幀輸入的文字（大廳打中繼位址用）
let touchState = null;        // 觸控層寫入的狀態（見 touch.js）

export function initInput(target = window) {
  target.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // 方向鍵與空白鍵會捲動頁面，一律吃掉
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    down.add(e.code);
    edges.add(e.code);
    // 可列印字元與退格另外收一份，讓輸入框可以真的打字
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) typed.push(e.key);
    else if (e.key === 'Backspace') typed.push('\b');
  });
  target.addEventListener('keyup', (e) => down.delete(e.code));
  target.addEventListener('blur', () => { down.clear(); edges.clear(); });
}

export const isDown = (code) => down.has(code);
export const isEdge = (code) => edges.has(code);

/** 任一鍵被按下（選單用） */
export function anyEdge(codes) {
  return codes.some((c) => edges.has(c));
}

export function menuNav() {
  return {
    up: anyEdge(['KeyW', 'ArrowUp']),
    down: anyEdge(['KeyS', 'ArrowDown']),
    left: anyEdge(['KeyA', 'ArrowLeft']),
    right: anyEdge(['KeyD', 'ArrowRight']),
    // K 是重攻擊、J 是輕攻擊，所以選單的「返回」只認 Esc —— 不然打一拳就退出對戰了
    ok: anyEdge(['Enter', 'NumpadEnter', 'Space']),
    // Backspace 留給大廳刪房號用，所以「返回」只認 Esc
    back: anyEdge(['Escape']),
  };
}

/** 每幀結束後呼叫，清掉邊緣事件 */
export function endFrame() {
  edges.clear();
  typed.length = 0;
  if (touchState) touchState.edges = 0;
}

/** 取走這一幀打的字（含 '\b' 代表退格） */
export function drainTyped() {
  const out = typed.slice();
  typed.length = 0;
  return out;
}

export function setTouchState(state) {
  touchState = state;
}

const anyDown = (codes) => codes.some((c) => down.has(c));
const anyEdgeOf = (codes) => codes.some((c) => edges.has(c));

/** 讀鍵盤（外加第一位玩家的觸控） */
export function readPlayer(index = 0) {
  const b = BINDINGS[index] || BINDINGS[0];
  const f = emptyFrame();
  if (anyDown(b.left)) f.x -= 1;
  if (anyDown(b.right)) f.x += 1;
  f.up = anyDown(b.up);
  f.down = anyDown(b.down);
  if (anyEdgeOf(b.jump)) f.edges |= BTN.JUMP;
  if (anyEdgeOf(b.light)) f.edges |= BTN.LIGHT;
  if (anyEdgeOf(b.heavy)) f.edges |= BTN.HEAVY;
  if (anyEdgeOf(b.s1)) f.edges |= BTN.S1;
  if (anyEdgeOf(b.s2)) f.edges |= BTN.S2;
  if (anyEdgeOf(b.ult)) f.edges |= BTN.ULT;
  if (anyEdgeOf(b.dash)) f.edges |= BTN.DASH;

  // 觸控只驅動第一位玩家
  if (index === 0 && touchState) {
    if (touchState.x) f.x = touchState.x;
    f.up = f.up || touchState.up;
    f.down = f.down || touchState.down;
    f.edges |= touchState.edges;
  }
  return f;
}
