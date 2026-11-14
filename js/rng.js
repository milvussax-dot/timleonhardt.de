// Kleine Mathe- und Zufallshelfer (deterministisch, damit alle Spieler dieselbe Strecke sehen)

export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapAngle(a) {
  const TAU = Math.PI * 2;
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export class Noise1D {
  constructor(rng, size = 2048) {
    this.n = size;
    this.v = new Float32Array(size);
    for (let i = 0; i < size; i++) this.v[i] = rng() * 2 - 1;
  }
  at(x) {
    const n = this.n;
    const fi = Math.floor(x);
    const f = x - fi;
    const i = ((fi % n) + n) % n;
    const a = this.v[i], b = this.v[(i + 1) % n];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  }
}

export class Noise2D {
  constructor(rng) {
    this.p = new Uint16Array(512);
    this.v = new Float32Array(256);
    const p = [];
    for (let i = 0; i < 256; i++) { p.push(i); this.v[i] = rng() * 2 - 1; }
    shuffle(p, rng);
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
  }
  _v(ix, iy) { return this.v[this.p[this.p[ix & 255] + (iy & 255)]]; }
  at(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this._v(ix, iy), b = this._v(ix + 1, iy);
    const c = this._v(ix, iy + 1), d = this._v(ix + 1, iy + 1);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }
}

export function fmtTime(t) {
  if (t == null || !isFinite(t)) return '–:––.––';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + s.toFixed(2).padStart(5, '0');
}

export function fmtDelta(d) {
  const sign = d >= 0 ? '+' : '−';
  return sign + Math.abs(d).toFixed(2);
}

export function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
