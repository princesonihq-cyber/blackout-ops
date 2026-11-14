/* ============================================================
   Fully synthesised audio — no external assets.
   ============================================================ */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ready = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this._makeNoise(2.0);
    this.ready = true;
    this._startAmbient();
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _makeNoise(seconds) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = white * 0.85 + last * 0.6;
    }
    return buffer;
  }

  _noise(dur, opts = {}) {
    if (!this.ctx || !this.noiseBuffer) return;
    const { gain = 0.2, freq = 1000, q = 0.7, type = 'bandpass', rate = 1, delay = 0 } = opts;
    const t0 = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  _tone(freq, dur, opts = {}) {
    if (!this.ctx) return;
    const { gain = 0.1, type = 'sine', to = null, delay = 0 } = opts;
    const t0 = this.t + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  _startAmbient() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(filter).connect(g).connect(this.master);
    src.start();

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 46;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 110;
    const og = this.ctx.createGain();
    og.gain.value = 0.018;
    osc.connect(lp).connect(og).connect(this.master);
    osc.start();

    // Slow wind swell so the yard never feels silent.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
  }

  /* ------------------------- weapons ------------------------- */

  shot(kind = 'rifle', vol = 1) {
    if (!this.ctx) return;
    if (kind === 'shotgun') {
      this._noise(0.34, { gain: 0.5 * vol, freq: 620, q: 0.7, type: 'lowpass' });
      this._noise(0.1, { gain: 0.32 * vol, freq: 2400, q: 0.9, type: 'highpass' });
      this._tone(74, 0.32, { gain: 0.42 * vol, to: 30, type: 'sine' });
      this._noise(0.5, { gain: 0.06 * vol, freq: 900, type: 'lowpass' });
    } else if (kind === 'pistol') {
      this._noise(0.12, { gain: 0.3 * vol, freq: 1800, q: 0.8, type: 'bandpass' });
      this._noise(0.04, { gain: 0.2 * vol, freq: 3200, type: 'highpass' });
      this._tone(110, 0.14, { gain: 0.26 * vol, to: 44, type: 'triangle' });
    } else {
      this._noise(0.16, { gain: 0.4 * vol, freq: 1500, q: 0.55, type: 'bandpass' });
      this._noise(0.035, { gain: 0.28 * vol, freq: 3400, type: 'highpass' });
      this._tone(92, 0.19, { gain: 0.34 * vol, to: 36, type: 'sine' });
      this._noise(0.3, { gain: 0.05 * vol, freq: 700, type: 'lowpass' });
    }
  }

  enemyShot(dist = 10) {
    const vol = Math.max(0.05, Math.min(1, 1 - dist / 70)) * 0.55;
    this._noise(0.2, { gain: 0.3 * vol, freq: 950, q: 0.6, type: 'lowpass' });
    this._noise(0.05, { gain: 0.12 * vol, freq: 2200, type: 'highpass' });
    this._tone(70, 0.2, { gain: 0.14 * vol, to: 30, type: 'sine' });
  }

  pump() {
    this._noise(0.08, { gain: 0.16, freq: 700, q: 2, type: 'bandpass' });
    this._noise(0.07, { gain: 0.14, freq: 500, q: 2, type: 'bandpass', delay: 0.13 });
  }

  switchWeapon() {
    this._noise(0.045, { gain: 0.14, freq: 1900, q: 3, type: 'bandpass' });
    this._noise(0.05, { gain: 0.1, freq: 1100, q: 3, type: 'bandpass', delay: 0.09 });
  }

  empty() {
    this._noise(0.03, { gain: 0.16, freq: 3200, q: 2, type: 'highpass' });
  }

  reloadStart() {
    this._noise(0.06, { gain: 0.16, freq: 1600, q: 2, type: 'bandpass' });
    this._noise(0.05, { gain: 0.12, freq: 900, q: 2, type: 'bandpass', delay: 0.28 });
  }

  reloadEnd() {
    this._noise(0.05, { gain: 0.18, freq: 2200, q: 2.5, type: 'bandpass' });
    this._noise(0.06, { gain: 0.16, freq: 700, q: 2, type: 'bandpass', delay: 0.1 });
  }

  hitmarker(head = false) {
    if (head) {
      this._tone(1800, 0.05, { gain: 0.09, type: 'square' });
      this._tone(2400, 0.06, { gain: 0.06, type: 'square', delay: 0.03 });
    } else {
      this._tone(1350, 0.04, { gain: 0.055, type: 'square' });
    }
  }

  kill() {
    this._tone(150, 0.16, { gain: 0.12, to: 70, type: 'triangle' });
    this._tone(900, 0.12, { gain: 0.06, to: 500, type: 'sine', delay: 0.02 });
  }

  footstep(sprint = false) {
    this._noise(0.09, { gain: sprint ? 0.13 : 0.085, freq: sprint ? 340 : 280, q: 0.8, type: 'lowpass', rate: 0.9 + Math.random() * 0.2 });
  }

  jump() {
    this._noise(0.1, { gain: 0.08, freq: 500, type: 'lowpass' });
  }

  land() {
    this._noise(0.14, { gain: 0.16, freq: 260, type: 'lowpass' });
    this._tone(90, 0.12, { gain: 0.08, to: 45 });
  }

  hurt() {
    this._tone(170, 0.22, { gain: 0.16, to: 60, type: 'sawtooth' });
    this._noise(0.16, { gain: 0.1, freq: 500, type: 'lowpass' });
  }

  death() {
    this._tone(220, 1.2, { gain: 0.18, to: 40, type: 'sawtooth' });
    this._noise(0.8, { gain: 0.14, freq: 400, type: 'lowpass' });
    this._tone(80, 1.4, { gain: 0.18, to: 30, type: 'sine', delay: 0.15 });
  }

  enemyDeath(dist = 10) {
    const vol = Math.max(0.15, Math.min(1, 1 - dist / 60));
    this._noise(0.3, { gain: 0.14 * vol, freq: 500, type: 'lowpass' });
    this._tone(220, 0.4, { gain: 0.06 * vol, to: 60, type: 'sawtooth' });
  }

  waveStart() {
    this._tone(110, 0.7, { gain: 0.16, type: 'sawtooth' });
    this._tone(220, 0.7, { gain: 0.09, type: 'sawtooth', delay: 0.02 });
    this._tone(440, 0.5, { gain: 0.07, type: 'square', delay: 0.25 });
    this._tone(660, 0.6, { gain: 0.07, type: 'square', delay: 0.5 });
  }

  waveClear() {
    this._tone(523, 0.16, { gain: 0.08, type: 'sine' });
    this._tone(659, 0.16, { gain: 0.08, type: 'sine', delay: 0.14 });
    this._tone(784, 0.3, { gain: 0.09, type: 'sine', delay: 0.28 });
  }

  uiClick() {
    this._tone(1000, 0.035, { gain: 0.04, type: 'square' });
  }

  /* ---------------------- equipment / streaks ---------------------- */

  explosion(dist = 10, scale = 1) {
    if (!this.ctx) return;
    const vol = Math.max(0.12, Math.min(1, 1 - dist / 80)) * scale;
    this._noise(0.55 * scale, { gain: 0.55 * vol, freq: 420, q: 0.5, type: 'lowpass' });
    this._noise(0.18 * scale, { gain: 0.3 * vol, freq: 1600, q: 0.7, type: 'bandpass', delay: 0.01 });
    this._tone(62, 0.55 * scale, { gain: 0.5 * vol, to: 26, type: 'sine' });
    this._tone(38, 0.85 * scale, { gain: 0.32 * vol, to: 20, type: 'sine', delay: 0.05 });
    this._noise(1.1 * scale, { gain: 0.07 * vol, freq: 600, type: 'lowpass', delay: 0.12 });
  }

  airstrike() {
    if (!this.ctx) return;
    // Jet pass overhead, then a rolling carpet of blasts.
    this._noise(1.8, { gain: 0.22, freq: 1100, q: 0.4, type: 'bandpass', rate: 1.6 });
    this._tone(180, 1.6, { gain: 0.1, to: 60, type: 'sawtooth' });
    for (let i = 0; i < 6; i++) {
      this._noise(0.4, { gain: 0.32, freq: 380 + i * 40, type: 'lowpass', delay: 0.55 + i * 0.22 });
      this._tone(56, 0.5, { gain: 0.3, to: 24, type: 'sine', delay: 0.55 + i * 0.22 });
    }
  }

  meleeSwing() {
    this._noise(0.13, { gain: 0.1, freq: 900, q: 0.6, type: 'bandpass', rate: 2.2 });
  }

  meleeHit() {
    this._noise(0.08, { gain: 0.3, freq: 700, q: 1.4, type: 'bandpass' });
    this._tone(140, 0.12, { gain: 0.18, to: 60, type: 'triangle' });
  }

  slide() {
    this._noise(0.5, { gain: 0.13, freq: 480, q: 0.6, type: 'bandpass', rate: 0.7 });
    this._noise(0.3, { gain: 0.06, freq: 180, type: 'lowpass', delay: 0.1 });
  }

  toss() {
    this._noise(0.09, { gain: 0.09, freq: 1200, q: 1.2, type: 'bandpass', rate: 1.4 });
  }

  bounce(dist = 4) {
    const vol = Math.max(0.04, Math.min(0.5, 1 - dist / 30)) * 0.35;
    this._noise(0.045, { gain: vol, freq: 2600, q: 2.5, type: 'bandpass' });
    this._tone(420, 0.06, { gain: vol * 0.5, to: 220, type: 'square' });
  }

  uav() {
    this._tone(880, 0.14, { gain: 0.09, type: 'sine' });
    this._tone(1320, 0.14, { gain: 0.07, type: 'sine', delay: 0.14 });
    this._tone(1760, 0.24, { gain: 0.06, type: 'sine', delay: 0.28 });
    this._tone(440, 0.5, { gain: 0.05, type: 'triangle', delay: 0.1 });
  }

  streakReady() {
    this._tone(660, 0.1, { gain: 0.06, type: 'square' });
    this._tone(990, 0.16, { gain: 0.06, type: 'square', delay: 0.09 });
  }

  juggernaut() {
    this._tone(58, 1.4, { gain: 0.3, to: 34, type: 'sawtooth' });
    this._tone(87, 1.2, { gain: 0.16, to: 46, type: 'square', delay: 0.1 });
  }
}
