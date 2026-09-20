// 進入點：畫布、主迴圈、畫面切換，以及把輸入（鍵盤／觸控／AI／網路）接到戰鬥上。

import { WORLD } from './render.js';
import { Battle, MODE } from './battle.js';
import { AI } from './ai.js';
import { Audio } from './audio.js';
import { Net, packInput, unpackInput } from './net.js';
import { drawHud } from './hud.js';
import { TitleScreen, SelectScreen, LobbyScreen, ResultScreen } from './screens.js';
import { initInput, readPlayer, endFrame, emptyFrame, isEdge, menuNav } from './input.js';
import { TouchPad } from './touch.js';
import { text, panel } from './gfx.js';

/** 畫面寬度（世界比畫面寬，選單與 HUD 都用畫面座標） */
const VIEW = WORLD.view;

const STEP = 1 / 60;

export async function boot(canvas) {
  const game = new Game(canvas);
  game.start();
  window.NEON = game;            // 方便在 console 或自動測試裡戳
  return game;
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = new Audio();
    this.net = new Net();
    this.touch = new TouchPad();
    this.acc = 0;
    this.last = 0;
    this.frames = 0;
    this.fps = 60;
    this.fpsT = 0;
    this.errors = [];

    this.scenes = {
      title: new TitleScreen(this),
      select: new SelectScreen(this),
      lobby: new LobbyScreen(this),
      result: new ResultScreen(this),
    };
    this.scene = this.scenes.title;
    this.scene.onEnter?.();

    initInput(window);
    this.bindPointer();
    this.bindNet();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    const unlock = () => this.audio.unlock();
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  // ---------------------------------------------------------------- 版面
  resize() {
    const pad = 8;
    const sw = window.innerWidth - pad * 2;
    const sh = window.innerHeight - pad * 2;
    const scale = Math.min(sw / VIEW, sh / WORLD.h);
    this.canvas.style.width = `${Math.floor(VIEW * scale)}px`;
    this.canvas.style.height = `${Math.floor(WORLD.h * scale)}px`;
    this.scale = scale;
  }

  toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * VIEW,
      y: ((clientY - r.top) / r.height) * WORLD.h,
    };
  }

  bindPointer() {
    const onDown = (e) => {
      const p = this.toLogical(e.clientX, e.clientY);
      if (this.scene === this.battleScene) this.touch.onDown(e.pointerId, p.x, p.y);
      this.scene?.onPointer?.(p.x, p.y);
    };
    const onMove = (e) => {
      if (this.scene !== this.battleScene) return;
      const p = this.toLogical(e.clientX, e.clientY);
      this.touch.onMove(e.pointerId, p.x, p.y);
    };
    const onUp = (e) => this.touch.onUp(e.pointerId);
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // ---------------------------------------------------------------- 連線
  bindNet() {
    this.net.on('msg', (m) => {
      if (m.t === 'lobby') {
        if (this.scene === this.scenes.select) this.scenes.select.onNetLobby(m);
        return;
      }
      if (m.t === 'start') {
        this.startBattle({ mode: 'net', chars: m.chars, netRole: 'guest' });
        return;
      }
      this.battleScene?.onNetMessage(m);
    });
    this.net.on('peer', (m) => {
      if (!m.joined && this.scene === this.battleScene) {
        this.toast = '對手離線了';
        this.goto('title');
        this.net.close();
      }
    });
    this.net.on('close', () => {
      if (this.scene === this.scenes.select && this.scenes.select.mode === 'net') this.goto('title');
    });
  }

  async connectNet(address, room) {
    await this.net.connect(address, room);
    this.goto('select', { mode: 'net', net: this.net });
  }

  leaveNet() {
    this.net.close();
    this.goto('title');
  }

  /** 主機檢查雙方都選好也都準備了就開打 */
  tryStartNet(picks, ready) {
    if (!this.net.isHost) return;
    if (!picks[0] || !picks[1] || !ready[0] || !ready[1]) return;
    this.net.send({ t: 'start', chars: picks });
    this.startBattle({ mode: 'net', chars: picks, netRole: 'host' });
  }

  // ---------------------------------------------------------------- 場景
  goto(name, opts) {
    this.scene?.onExit?.();
    this.scene = this.scenes[name];
    this.scene.onEnter?.(opts);
  }

  startBattle(opts) {
    this.audio.unlock();
    this.battleScene = new BattleScene(this, opts);
    this.scene?.onExit?.();
    this.scene = this.battleScene;
  }

  // ---------------------------------------------------------------- 主迴圈
  start() {
    this.last = performance.now();
    const frame = (ts) => {
      requestAnimationFrame(frame);
      let dt = (ts - this.last) / 1000;
      this.last = ts;
      if (!Number.isFinite(dt)) dt = STEP;
      dt = Math.min(dt, 0.25);
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 0) endFrame();      // 沒跑到邏輯也要清掉這一幀的按鍵邊緣
      this.render();
      this.fpsT += dt;
      this.frames++;
      if (this.fpsT >= 0.5) {
        this.fps = Math.round(this.frames / this.fpsT);
        this.frames = 0;
        this.fpsT = 0;
      }
    };
    requestAnimationFrame(frame);
  }

  step(dt) {
    try {
      if (isEdge('KeyM')) {
        const muted = this.audio.toggleMute();
        this.toast = muted ? '靜音' : '取消靜音';
        this.toastT = 1.2;
      }
      this.scene?.update?.(dt);
      this.net.ping();
    } catch (err) {
      this.reportError(err);
    }
    if (this.toastT > 0) this.toastT -= dt;
    endFrame();
  }

  render() {
    const ctx = this.ctx;
    // 每幀先把整塊畫布抹掉：戰鬥有鏡頭縮放，某些縮放下天空不會蓋滿整個畫面，
    // 沒抹乾淨的話上一個畫面的殘影會留在下緣。
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, VIEW, WORLD.h);
    try {
      this.scene?.draw?.(ctx);
    } catch (err) {
      this.reportError(err);
      ctx.fillStyle = '#100610';
      ctx.fillRect(0, 0, VIEW, WORLD.h);
    }
    if (this.toastT > 0 && this.toast) {
      panel(ctx, VIEW / 2 - 110, 16, 220, 38, '#ffd24d', { glow: 0.6 });
      text(ctx, this.toast, VIEW / 2, 42, { size: 17, color: '#ffffff', align: 'center' });
    }
    if (this.errors.length) {
      text(ctx, `⚠ ${this.errors[this.errors.length - 1]}`, 12, WORLD.h - 10, { size: 13, color: '#ff8095' });
    }
  }

  reportError(err) {
    const msg = err && err.message ? err.message : String(err);
    if (this.errors[this.errors.length - 1] !== msg) this.errors.push(msg);
    if (this.errors.length > 5) this.errors.shift();
    console.error(err);
  }
}

// ==================================================================
class BattleScene {
  constructor(game, { mode, chars, netRole, difficulty = 1 }) {
    this.game = game;
    this.mode = mode;
    this.netRole = netRole;
    this.chars = chars;
    const battleMode = mode !== 'net' ? (mode === 'local' ? MODE.LOCAL : MODE.SOLO)
      : (netRole === 'host' ? MODE.NET_HOST : MODE.NET_CLIENT);
    this.battle = new Battle({
      chars, mode: battleMode, audio: game.audio, difficulty,
      onMatchEnd: (winner) => this.onMatchEnd(winner),
    });
    this.battle.authoritative = mode !== 'net' || netRole === 'host';
    this.battle.startRound();
    this.battle.showBanner('ROUND 1', `${this.battle.fighters[0].char.name}  VS  ${this.battle.fighters[1].char.name}`, '#7ef1ff', 1.6);

    this.ai = mode === 'solo' ? new AI(this.battle.fighters[1], difficulty) : null;
    this.remote = emptyFrame();
    this.remoteEdges = 0;
    this.snapT = 0;
    this.ended = false;

    // 主機把「誰放了什麼招」轉給客戶端，客戶端在本地重播特效
    if (mode === 'net' && netRole === 'host') {
      this.battle.onSkill = (f, kind, params) => {
        game.net.send({ t: 'cast', side: f.side, kind, params });
      };
    }
    this.localSides = mode === 'local' ? [0, 1] : (mode === 'net' ? [netRole === 'host' ? 0 : 1] : [0]);
    game.touch.setSide(this.localSides[0]);
  }

  // ---------------------------------------------------------------- 更新
  update(dt) {
    const nav = menuNav();
    if (nav.back && !this.ended) {
      if (this.mode === 'net') this.game.leaveNet();
      else this.game.goto('title');
      return;
    }

    if (this.mode === 'net' && this.netRole === 'guest') {
      this.updateGuest(dt);
      return;
    }

    const inputs = [emptyFrame(), emptyFrame()];
    if (this.mode === 'solo') {
      inputs[0] = readPlayer(0);
      inputs[1] = this.ai.update(dt, this.battle);
    } else if (this.mode === 'local') {
      inputs[0] = readPlayer(0);
      inputs[1] = readPlayer(1);
    } else {
      inputs[0] = readPlayer(0);
      inputs[1] = { ...this.remote, edges: this.remoteEdges };
      this.remoteEdges = 0;
    }
    this.battle.update(dt, inputs);

    if (this.mode === 'net') {
      this.snapT += dt;
      if (this.snapT >= 0.05) {      // 20Hz 快照
        this.snapT = 0;
        this.game.net.send({ t: 'snap', s: this.battle.collectSnapshot() });
      }
    }
  }

  updateGuest(dt) {
    // 客戶端：只送輸入、照著主機的快照畫，不自己算傷害
    const f = readPlayer(0);
    this.game.net.send({ t: 'in', f: packInput(f) });
    this.battle.updateRemote(dt);
  }

  onNetMessage(m) {
    if (m.t === 'in' && this.netRole === 'host') {
      const f = unpackInput(m.f);
      this.remote.x = f.x;
      this.remote.up = f.up;
      this.remote.down = f.down;
      this.remoteEdges |= f.edges;
      return;
    }
    if (m.t === 'snap' && this.netRole === 'guest') {
      this.battle.applySnapshot(m.s);
      return;
    }
    if (m.t === 'cast' && this.netRole === 'guest') {
      this.battle.replayCast(m.side, m.kind, m.params);
      return;
    }
    if (m.t === 'end') {
      this.ended = true;
      this.game.goto('result', { winner: m.winner, battle: this.battle, mode: this.mode });
    }
  }

  onMatchEnd(winner) {
    if (this.ended) return;
    this.ended = true;
    if (this.mode === 'net' && this.netRole === 'host') {
      this.game.net.send({ t: 'end', winner });
    }
    setTimeout(() => {
      if (this.game.scene === this) {
        this.game.goto('result', { winner, battle: this.battle, mode: this.mode });
      }
    }, 2200);
  }

  onPointer(x, y) { /* 觸控由 TouchPad 處理 */ }

  // ---------------------------------------------------------------- 繪製
  draw(ctx) {
    this.battle.draw(ctx);
    drawHud(ctx, this.battle, { localSides: this.localSides });
    if (this.mode === 'net') {
      text(ctx, `房 ${this.game.net.room}・${this.netRole === 'host' ? '主機' : '客戶端'}・${this.game.net.rtt}ms`,
        VIEW - 16, WORLD.h - 12, { size: 12, color: '#6f7aa3', align: 'right' });
    }
    this.game.touch.draw(ctx);
  }
}
