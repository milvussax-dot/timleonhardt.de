// Lokaler Speicher: Profil, Bestenliste, Medaillen, Ghosts, Tages-Challenges
const KEY = 'gipfelrausch.v1';
const GHOST_PREFIX = 'gipfelrausch.ghost2.';

const defaults = () => ({
  profile: { name: '', jacket: '#ff5a36', helmet: '#f5f7fa', sound: true, quality: 'auto', seenHelp: false, pov: false },
  best: {},
  boards: {},
  medals: {},
  daily: { date: '', done: [] },
  streak: { last: '', count: 0 },
  stats: { runs: 0, flips: 0, meters: 0, wins: 0 },
});

export const Store = {
  data: defaults(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const def = defaults();
        this.data = { ...def, ...d, profile: { ...def.profile, ...(d.profile || {}) }, stats: { ...def.stats, ...(d.stats || {}) } };
      }
    } catch (e) { this.data = defaults(); }
    return this;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* voll oder gesperrt */ }
  },

  get profile() { return this.data.profile; },

  // value: Zeit (kleiner besser) oder Punkte/Distanz (größer besser)
  submit(key, value, lowerBetter, meta = {}) {
    const d = this.data;
    const prev = d.best[key];
    const better = prev == null || (lowerBetter ? value < prev.v : value > prev.v);
    if (better) d.best[key] = { v: value, date: Date.now(), ...meta };
    const board = d.boards[key] || (d.boards[key] = []);
    const entry = { name: d.profile.name || 'Du', v: value, date: Date.now(), ...meta };
    board.push(entry);
    board.sort((a, b) => (lowerBetter ? a.v - b.v : b.v - a.v));
    const rank = board.indexOf(entry) + 1;
    if (board.length > 10) board.length = 10;
    this.save();
    return { pb: better, prev: prev ? prev.v : null, rank: rank <= 10 ? rank : null, entry };
  },

  best(key) { const b = this.data.best[key]; return b ? b.v : null; },
  board(key) { return this.data.boards[key] || []; },

  medal(key) { return this.data.medals[key] || 0; },
  setMedal(key, tier) {
    if (tier > (this.data.medals[key] || 0)) { this.data.medals[key] = tier; this.save(); return true; }
    return false;
  },

  saveGhost(key, ghost) {
    try {
      const bytes = new Uint8Array(ghost.data.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      localStorage.setItem(GHOST_PREFIX + key, JSON.stringify({ time: ghost.time, hz: ghost.hz, stride: ghost.stride, b64: btoa(bin) }));
    } catch (e) { /* zu groß – Ghost wird übersprungen */ }
  },

  loadGhost(key) {
    try {
      const raw = localStorage.getItem(GHOST_PREFIX + key);
      if (!raw) return null;
      const g = JSON.parse(raw);
      const bin = atob(g.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { time: g.time, hz: g.hz, stride: g.stride, data: new Float32Array(bytes.buffer) };
    } catch (e) { return null; }
  },
};
