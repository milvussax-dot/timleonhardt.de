// Online-Bestenliste der Website (../lb.js auf timleonhardt.de, Listen "gipfelrausch:<boardKey>").
// Fehlt sie, etwa beim lokalen Start im Ordner Game, bleibt alles wie bisher lokal.
const POINTS = new Set(['freestyle', 'lawine']);

export const OnlineBoard = {
  get ok() { return !!(window.TLBoard && window.TLBoard.configured); },
  id(key) { return 'gipfelrausch:' + key; },
  // Zeiten gehen als Millisekunden in die Liste, Punkte und Meter als ganze Zahlen
  toScore(mode, v) { return POINTS.has(mode) ? Math.round(v) : Math.round(v * 1000); },
  fromScore(mode, s) { return POINTS.has(mode) ? s : s / 1000; },
  name(store) {
    const n = (store.profile.name || '').trim() || (window.TLBoard ? window.TLBoard.getName() : '');
    return String(n || '').trim().slice(0, 16);
  },
  setName(store, n) {
    n = String(n || '').trim().slice(0, 16);
    if (!n) return '';
    store.profile.name = n;
    store.save();
    if (window.TLBoard) window.TLBoard.setName(n);
    return n;
  },
  submit(store, key, mode, value) {
    if (!this.ok) return Promise.resolve(false);
    const n = this.name(store), score = this.toScore(mode, value);
    if (!n || !(score >= 1)) return Promise.resolve(false);
    return window.TLBoard.submit(this.id(key), n, score).then(() => true, () => false);
  },
  top(key, limit) {
    if (!this.ok) return Promise.reject(new Error('offline'));
    return window.TLBoard.board(this.id(key), limit || 10);
  },
};
