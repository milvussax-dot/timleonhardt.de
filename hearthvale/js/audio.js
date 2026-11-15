// Ton: Musik und Geräusche, alles live im Browser erzeugt (Web Audio), ohne Dateien.
// Die Musik ist eine kleine, immer neue Melodie über einer Akkordfolge. Stimmung: Tag, Nacht, Winter, Kampf.
const KEY = 'hearthvale.audio';
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);   // MIDI-Nummer → Hz
const MUSIC_VOL = 0.55, SFX_VOL = 0.7;

const MOODS = {
  day:    { bpm: 92,  chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], scale: [60, 62, 64, 67, 69, 72, 74, 76, 79], lead: 'triangle', density: 0.5, cut: 2600 },
  night:  { bpm: 64,  chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 55, 59]], scale: [57, 60, 62, 64, 67, 69, 72], lead: 'sine', density: 0.28, cut: 1600 },
  winter: { bpm: 70,  chords: [[57, 60, 64], [52, 55, 59], [53, 57, 60], [50, 53, 57]], scale: [69, 71, 72, 76, 79, 81, 83, 84], lead: 'sine', density: 0.32, cut: 3000, bell: true },
  battle: { bpm: 118, chords: [[50, 53, 57], [48, 52, 55], [46, 50, 53], [48, 52, 55]], scale: [62, 64, 65, 67, 69, 72, 74], lead: 'sawtooth', density: 0.55, cut: 1400, drums: true },
};
// wie oft dasselbe Geräusch höchstens kommt (Sekunden)
const GAP = { clash: 0.09, arrow: 0.1, hammer: 0.2, chop: 0.08, mine: 0.08, die: 0.15, splash: 0.2, harvest: 0.06 };

export class Sound {
  constructor() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    this.music = s.music !== false;
    this.sfx = s.sfx !== false;
    this.ctx = null; this.last = {}; this.step = 0; this.next = 0; this.mood = 'day'; this.want = 'day'; this.melody = 4;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ music: this.music, sfx: this.sfx })); } catch (e) { /* egal */ } }
  // erst nach einer Berührung oder Taste darf der Browser Ton abspielen
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 1; this.master.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.music ? MUSIC_VOL : 0; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfx ? SFX_VOL : 0; this.sfxBus.connect(this.master);
    const verb = c.createConvolver(), wet = c.createGain();
    verb.buffer = this.impulse(2.2); wet.gain.value = 0.4;
    this.musicBus.connect(verb); verb.connect(wet); wet.connect(this.master);
    this.noise = this.noiseBuffer();
    this.next = c.currentTime + 0.15;
  }
  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }
  noiseBuffer() {
    const c = this.ctx, n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  setMusic(on) { this.music = on; this.save(); if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, this.ctx.currentTime, 0.3); }
  setSfx(on) { this.sfx = on; this.save(); if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? SFX_VOL : 0, this.ctx.currentTime, 0.05); }
  get muted() { return !this.music && !this.sfx; }

  /* ---------- Bausteine ---------- */
  out(bus, pan) {
    if (!pan || !this.ctx.createStereoPanner) return bus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    p.connect(bus);
    return p;
  }
  tone(bus, o) {
    const c = this.ctx, t0 = o.at != null ? o.at : c.currentTime + (o.t || 0), a = o.a || 0.005, d = o.d || 0.2;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + a + d);
    if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = o.vib; l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + a + d + 0.1); }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.2), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    let node = osc;
    if (o.filter) { const fl = c.createBiquadFilter(); fl.type = o.filter.type; fl.frequency.value = o.filter.f; fl.Q.value = o.filter.q || 0.8; node.connect(fl); node = fl; }
    node.connect(g); g.connect(this.out(bus, o.pan));
    osc.start(t0); osc.stop(t0 + a + d + 0.05);
  }
  hit(bus, o) {
    const c = this.ctx, t0 = o.at != null ? o.at : c.currentTime + (o.t || 0), d = o.d || 0.1;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(o.f || 1000, t0); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + d); fl.Q.value = o.q || 1;
    g.gain.setValueAtTime(o.v || 0.3, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    s.connect(fl); fl.connect(g); g.connect(this.out(bus, o.pan));
    s.start(t0, Math.random() * 0.5); s.stop(t0 + d + 0.05);
  }

  /* ---------- Geräusche ---------- */
  play(name, vol = 1, pan = 0) {
    if (!this.ctx || !this.sfx || vol < 0.05) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < (GAP[name] || 0.05)) return;
    this.last[name] = now;
    const B = this.sfxBus, v = vol;
    switch (name) {
      case 'chop': this.hit(B, { d: 0.12, v: 0.5 * v, f: 900, q: 2, pan }); this.tone(B, { f: 150, f2: 70, d: 0.12, v: 0.35 * v, pan }); break;
      case 'mine': this.tone(B, { f: 1250, f2: 1150, type: 'square', d: 0.08, v: 0.1 * v, pan, filter: { type: 'bandpass', f: 1600, q: 4 } }); this.hit(B, { d: 0.06, v: 0.25 * v, type: 'highpass', f: 2500, pan }); break;
      case 'hammer': this.tone(B, { f: 430, f2: 300, type: 'triangle', d: 0.06, v: 0.22 * v, pan }); this.hit(B, { d: 0.04, v: 0.12 * v, f: 1800, q: 3, pan }); break;
      case 'pick': case 'harvest': this.tone(B, { f: 660, f2: 990, type: 'triangle', d: 0.12, v: 0.2 * v, pan }); break;
      case 'till': this.hit(B, { d: 0.14, v: 0.4 * v, type: 'lowpass', f: 500, pan }); break;
      case 'water': case 'splash': this.hit(B, { d: 0.35, v: 0.28 * v, f: 2200, f2: 500, q: 1.5, pan }); break;
      case 'plant': this.tone(B, { f: 520, f2: 380, d: 0.1, v: 0.18 * v, pan }); break;
      case 'coin': this.tone(B, { f: 1318, d: 0.12, v: 0.16 * v }); this.tone(B, { f: 1760, t: 0.07, d: 0.25, v: 0.14 * v }); break;
      case 'chest': [0, 4, 7, 12].forEach((s, i) => this.tone(B, { f: NOTE(84 + s), t: i * 0.06, d: 0.35, v: 0.13 * v })); break;
      case 'build': [0, 4, 7].forEach((s, i) => this.tone(B, { f: NOTE(72 + s), t: i * 0.09, d: 0.6, v: 0.16 * v, type: 'triangle' })); break;
      case 'quest': [0, 4, 7, 12, 16].forEach((s, i) => this.tone(B, { f: NOTE(67 + s), t: i * 0.1, d: i === 4 ? 0.9 : 0.25, v: 0.18 * v, type: 'triangle' })); break;
      case 'raid': [[50, 0], [57, 0.45], [50, 0.9]].forEach(([m, t]) => this.tone(B, { f: NOTE(m), t, a: 0.08, d: 0.45, v: 0.25 * v, type: 'sawtooth', vib: 3, filter: { type: 'lowpass', f: 900 } })); break;
      case 'clash': this.hit(B, { d: 0.07, v: 0.32 * v, type: 'highpass', f: 2500, pan }); this.tone(B, { f: 1900 + Math.random() * 500, type: 'square', d: 0.07, v: 0.05 * v, pan, filter: { type: 'bandpass', f: 2400, q: 6 } }); break;
      case 'arrow': this.hit(B, { d: 0.18, v: 0.2 * v, f: 3200, f2: 900, q: 3, pan }); break;
      case 'die': this.tone(B, { f: 230, f2: 80, type: 'triangle', d: 0.35, v: 0.2 * v, pan }); break;
      case 'train': this.tone(B, { f: 110, f2: 60, d: 0.25, v: 0.35 * v }); this.tone(B, { f: 110, f2: 60, t: 0.18, d: 0.25, v: 0.3 * v }); break;
      case 'boat': this.tone(B, { f: NOTE(43), a: 0.1, d: 0.9, v: 0.28 * v, type: 'sawtooth', vib: 2, filter: { type: 'lowpass', f: 500 } }); break;
      case 'day': this.tone(B, { f: NOTE(79), d: 1.6, v: 0.16 * v }); this.tone(B, { f: NOTE(79) * 2.76, d: 1.0, v: 0.04 * v }); break;
      case 'eat': this.tone(B, { f: 300, f2: 450, type: 'triangle', d: 0.1, v: 0.18 * v }); this.tone(B, { f: 350, f2: 520, type: 'triangle', t: 0.12, d: 0.1, v: 0.18 * v }); break;
      default: break;
    }
  }

  /* ---------- Musik ---------- */
  setMood(mood) { this.want = MOODS[mood] ? mood : 'day'; }
  update() {
    if (!this.ctx || !this.music || this.ctx.state !== 'running') return;
    const c = this.ctx;
    if (this.next < c.currentTime - 0.1) this.next = c.currentTime + 0.05;   // nach einer Pause nicht nachholen
    while (this.next < c.currentTime + 1.2) {   // gut eine Sekunde im Voraus, damit es bei ruckelnden Bildern nicht stockt
      if (this.step % 8 === 0 && this.want !== this.mood) this.mood = this.want;   // Wechsel nur am Taktanfang
      const M = MOODS[this.mood], eighth = 60 / M.bpm / 2;
      this.beat(this.step, this.next, M, eighth);
      this.next += eighth * (this.step % 2 === 0 ? 1.06 : 0.94);   // ein wenig Schwung
      this.step++;
    }
  }
  beat(step, at, M, eighth) {
    const B = this.musicBus, inBar = step % 8, bar = Math.floor(step / 8), chord = M.chords[Math.floor(bar / 2) % M.chords.length];
    // Flächenklang alle zwei Takte, Bass zu Beginn jedes Takts
    if (step % 16 === 0) for (const n of chord) this.tone(B, { at, f: NOTE(n), a: 0.5, d: eighth * 15, v: 0.05, type: 'triangle', filter: { type: 'lowpass', f: 900 } });
    if (inBar === 0) this.tone(B, { at, f: NOTE(chord[0] - 12), a: 0.02, d: eighth * 6, v: 0.12, type: M.drums ? 'sawtooth' : 'sine', filter: { type: 'lowpass', f: 400 } });
    if (inBar === 4 && !M.drums) this.tone(B, { at, f: NOTE(chord[2] - 12), a: 0.02, d: eighth * 3, v: 0.06, type: 'sine' });
    // Trommeln im Kampf
    if (M.drums) {
      if (inBar === 0 || inBar === 4 || inBar === 5) this.tone(B, { at, f: 120, f2: 45, d: 0.22, v: 0.35 });
      if (inBar === 2 || inBar === 6) this.hit(B, { at, d: 0.12, v: 0.18, f: 1800, q: 0.7 });
      this.hit(B, { at, d: 0.03, v: inBar % 2 ? 0.05 : 0.08, type: 'highpass', f: 6000 });
    }
    // Melodie: Zufallsweg durch die Tonleiter, betonte Schläge bevorzugt, Pausen zwischen den Phrasen
    const phrase = [1, 0.95, 1, 0.35][bar % 4];
    const strong = inBar === 0 || inBar === 4 ? 1.4 : inBar % 2 ? 0.6 : 1;
    if (Math.random() < M.density * phrase * strong) {
      const sc = M.scale;
      this.melody = Math.max(0, Math.min(sc.length - 1, this.melody + Math.round((Math.random() - 0.5) * 4)));
      let n = sc[this.melody];
      if (inBar === 0) { const ct = chord.map((x) => x + 12).filter((x) => x >= sc[0] - 2); if (ct.length) n = ct.reduce((a, x) => (Math.abs(x - n) < Math.abs(a - n) ? x : a), ct[0]); }
      const len = eighth * (Math.random() < 0.3 ? 3 : 1.6);
      this.tone(B, { at, f: NOTE(n), a: 0.01, d: len, v: M.drums ? 0.07 : 0.11, type: M.lead, filter: { type: 'lowpass', f: M.cut } });
      if (M.bell) this.tone(B, { at, f: NOTE(n) * 2.76, a: 0.005, d: len * 0.6, v: 0.025, type: 'sine' });
    }
  }
}
