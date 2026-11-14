// Prozeduraler Sound mit WebAudio (keine Audiodateien nötig)
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.loops = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.75 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(0, Math.random() * 1.5);
      return { src, f, g };
    };
    this.loops = {
      wind: loop('bandpass', 500, 0.6),
      carve: loop('bandpass', 2200, 0.9),
      rumble: loop('lowpass', 130, 0.7),
      grind: loop('bandpass', 3400, 6),
    };
  }

  setEnabled(b) {
    this.enabled = b;
    if (this.master) this.master.gain.setTargetAtTime(b ? 0.75 : 0, this.ctx.currentTime, 0.05);
  }

  engine({ speed = 0, carve = 0, air = false, rumble = 0, grind = false, active = true }) {
    if (!this.loops) return;
    const t = this.ctx.currentTime;
    const L = this.loops;
    const sp = Math.min(1, speed / 38);
    L.wind.g.gain.setTargetAtTime(active ? 0.05 + sp * 0.32 : 0, t, 0.15);
    L.wind.f.frequency.setTargetAtTime(300 + sp * 900 + (air ? 300 : 0), t, 0.2);
    L.carve.g.gain.setTargetAtTime(active && !air ? Math.min(0.35, carve * 0.4) : 0, t, 0.05);
    L.carve.f.frequency.setTargetAtTime(1600 + sp * 1600, t, 0.1);
    L.rumble.g.gain.setTargetAtTime(active ? Math.min(1.2, rumble) : 0, t, 0.2);
    L.grind.g.gain.setTargetAtTime(active && grind ? 0.22 : 0, t, 0.03);
  }

  silence() { this.engine({ active: false }); }

  tone(freq, dur, { type = 'sine', vol = 0.25, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  hiss(dur, { freq = 1000, q = 1, vol = 0.3, type = 'bandpass', sweep = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  click() { this.tone(880, 0.06, { type: 'triangle', vol: 0.12 }); }
  count(n) { this.tone(n > 0 ? 620 : 1240, n > 0 ? 0.18 : 0.45, { type: 'square', vol: 0.12 }); }
  jump() { this.hiss(0.25, { freq: 900, sweep: 1600, vol: 0.25 }); }
  takeoff() { this.hiss(0.35, { freq: 700, sweep: 900, vol: 0.18 }); }
  land(impact = 5) {
    const v = Math.min(0.6, 0.15 + impact * 0.03);
    this.hiss(0.25, { freq: 380, type: 'lowpass', vol: v });
    this.tone(90, 0.18, { vol: v * 0.8, slide: -40 });
  }
  crash() {
    this.hiss(0.7, { freq: 600, type: 'lowpass', vol: 0.6, sweep: -400 });
    this.tone(70, 0.4, { vol: 0.5, slide: -30 });
  }
  gate() { this.tone(1320, 0.12, { type: 'triangle', vol: 0.18 }); this.tone(1760, 0.14, { type: 'triangle', vol: 0.14, delay: 0.06 }); }
  miss() { this.tone(180, 0.32, { type: 'sawtooth', vol: 0.16, slide: -60 }); }
  trick(level = 1) {
    const base = 660;
    for (let i = 0; i < Math.min(4, level + 1); i++) this.tone(base * Math.pow(1.26, i), 0.14, { type: 'triangle', vol: 0.14, delay: i * 0.06 });
  }
  pickup() { this.tone(990, 0.1, { type: 'sine', vol: 0.2 }); this.tone(1480, 0.2, { type: 'sine', vol: 0.18, delay: 0.07 }); }
  finish() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.18, delay: i * 0.1 })); }
  fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.16, delay: i * 0.13 })); }
  medal() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.35, { type: 'sine', vol: 0.16, delay: 0.5 + i * 0.09 })); }
}
