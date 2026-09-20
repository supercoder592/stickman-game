// 音效與音樂，全部用 WebAudio 即時合成 —— 專案裡沒有任何音檔。
//
// 瀏覽器規定要有使用者互動才能出聲，所以 AudioContext 延到第一次按鍵／點擊才建立。

const NOTES = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.0, A: 440.0, B: 493.88 };

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.musicOn = true;
    this.step = 0;
    this.nextNote = 0;
    this.timer = null;
  }

  /** 第一次互動時呼叫 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  }

  // ---------------------------------------------------------------- 合成零件
  env(node, t, { attack = 0.005, decay = 0.12, peak = 1 }) {
    const g = node.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone({ freq = 440, type = 'sine', dur = 0.12, gain = 0.5, slide = 0, delay = 0, dest }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    this.env(g, t, { decay: dur, peak: gain });
    osc.connect(g).connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.12, gain = 0.4, freq = 1200, q = 1, type = 'bandpass', slide = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    if (slide) filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), t + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, { decay: dur, peak: gain });
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- 音效表
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'hit':
        this.noise({ dur: 0.09, gain: 0.5, freq: 1800, slide: -1400, q: 1.2 });
        this.tone({ freq: 220, type: 'square', dur: 0.07, gain: 0.25, slide: -120 });
        break;
      case 'hitHeavy':
        this.noise({ dur: 0.18, gain: 0.6, freq: 900, slide: -700, q: 0.8 });
        this.tone({ freq: 90, type: 'sawtooth', dur: 0.2, gain: 0.4, slide: -50 });
        break;
      case 'swing':
        this.noise({ dur: 0.1, gain: 0.16, freq: 900, slide: 1800, q: 3, type: 'bandpass' });
        break;
      case 'jump':
        this.tone({ freq: 320, type: 'triangle', dur: 0.14, gain: 0.22, slide: 260 });
        break;
      case 'land':
        this.noise({ dur: 0.14, gain: 0.3, freq: 300, slide: -180, q: 0.7, type: 'lowpass' });
        break;
      case 'dash':
        this.noise({ dur: 0.16, gain: 0.22, freq: 600, slide: 2200, q: 2 });
        break;
      case 'block':
        this.tone({ freq: 880, type: 'square', dur: 0.08, gain: 0.2, slide: -300 });
        this.noise({ dur: 0.06, gain: 0.2, freq: 2600, q: 2 });
        break;
      case 'dodge':
        this.tone({ freq: 1200, type: 'sine', dur: 0.12, gain: 0.18, slide: 600 });
        break;
      case 'skill':
        this.tone({ freq: 300, type: 'sawtooth', dur: 0.22, gain: 0.22, slide: 500 });
        this.noise({ dur: 0.2, gain: 0.14, freq: 1400, slide: 900, q: 2 });
        break;
      case 'ult':
        [0, 0.09, 0.18].forEach((d, i) => this.tone({
          freq: 200 * Math.pow(1.5, i), type: 'sawtooth', dur: 0.5, gain: 0.22, delay: d, slide: 120,
        }));
        this.noise({ dur: 0.6, gain: 0.2, freq: 400, slide: 3000, q: 1.4 });
        break;
      case 'slam':
      case 'boom':
        this.tone({ freq: 70, type: 'sine', dur: 0.5, gain: 0.5, slide: -40 });
        this.noise({ dur: 0.4, gain: 0.4, freq: 500, slide: -420, q: 0.6, type: 'lowpass' });
        break;
      case 'ko':
        [0, 0.12, 0.26].forEach((d, i) => this.tone({
          freq: 440 / Math.pow(1.35, i), type: 'square', dur: 0.4, gain: 0.26, delay: d, slide: -60,
        }));
        break;
      case 'fight':
        [0, 0.1].forEach((d, i) => this.tone({
          freq: i ? NOTES.G * 2 : NOTES.C * 2, type: 'square', dur: 0.26, gain: 0.24, delay: d,
        }));
        break;
      case 'menu':
        this.tone({ freq: 760, type: 'square', dur: 0.05, gain: 0.14 });
        break;
      case 'select':
        this.tone({ freq: NOTES.E * 2, type: 'square', dur: 0.1, gain: 0.2 });
        this.tone({ freq: NOTES.G * 2, type: 'square', dur: 0.12, gain: 0.18, delay: 0.07 });
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- 背景音樂
  /** 16 步的合成器循環：低音線 + 琶音，音量壓得很低當底噪 */
  startMusic() {
    if (!this.ctx || this.timer) return;
    const bass = [0, 0, 3, 0, 5, 0, 3, 0, 7, 0, 5, 0, 3, 0, 1, 0];
    const arp = [12, 15, 19, 15, 12, 17, 19, 17, 12, 15, 22, 15, 12, 17, 19, 22];
    const root = 110;
    const stepDur = 0.15;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      while (this.nextNote < this.ctx.currentTime + 0.3) {
        const s = this.step % 16;
        const t = this.nextNote;
        const semi = (n) => root * Math.pow(2, n / 12);
        if (bass[s]) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(semi(bass[s]) / 2, t);
          const f = this.ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(420, t);
          this.env(g, t, { decay: stepDur * 1.6, peak: 0.5 });
          o.connect(f).connect(g).connect(this.musicGain);
          o.start(t); o.stop(t + stepDur * 2);
        }
        if (s % 2 === 0) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'square';
          o.frequency.setValueAtTime(semi(arp[s]), t);
          this.env(g, t, { decay: stepDur * 0.8, peak: 0.12 });
          o.connect(g).connect(this.musicGain);
          o.start(t); o.stop(t + stepDur);
        }
        this.step++;
        this.nextNote += stepDur;
      }
    }, 60);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }
}
