// Grafik: Boden-Kacheln, Objekte, Gebäude, Stammeslager, Figuren, Grenzen, Nebel, Licht, Wetter, Minikarte
import { G, TILE, BUILDINGS, CROPS, ITEMS, TERRITORY } from './data.js?v=6';
import { cellRand } from './world.js?v=6';

const SEASON = {
  grass:  ['#86c35a', '#6cb04a', '#b3ad4e', '#eef3f6'],
  forest: ['#5f9e45', '#4f8f3c', '#8f8a3c', '#dfe8ee'],
  meadow: ['#9ccd62', '#86bf54', '#c3b55a', '#eef3f6'],
  sand:   ['#e8d59c', '#ecd796', '#e3cf98', '#e9e2cf'],
  water:  ['#4aa3d8', '#46a0d6', '#4596cb', '#9cc9e3'],
  deep:   ['#2f7fb8', '#2b7bb5', '#2c72a8', '#7fb3d6'],
  canopy: [['#5aa83e', '#7cc35a'], ['#3e8a33', '#5aa648'], ['#d9822b', '#e8a44a'], null],
  pine:   ['#2f6b45', '#2a6340', '#3a6a45', '#2f5f42'],
};
const C = { dirt: '#b48a5c', path: '#cbb48c', soil: '#8b5e34', soilWet: '#5c3b20', mountain: '#80828a', mountainDark: '#5f6168', plank: '#a0703c', trunk: '#7a5230', wall: '#efe2c8', stoneWall: '#b9b3a7', door: '#6b4228', glow: 'rgba(255,214,120,0.95)', banner: '#c0392b', fog: [16, 22, 18] };
const STONE_TYPES = new Set(['quarry', 'mill', 'bakery', 'smelter', 'smithy', 'barracks']);

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export class Renderer {
  constructor(canvas, mini) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.mini = mini; this.mctx = mini.getContext('2d');
    this.chunks = new Map();
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.season = -1;
    this.miniT = 0;
    this.rain = [];
  }
  resize() {
    const r = this.cv.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
  }
  get S() { return TILE * this.cam.zoom; }
  screenToTile(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const x = (cx - r.left - this.W / 2) / this.S + this.cam.x, y = (cy - r.top - this.H / 2) / this.S + this.cam.y;
    return { x: Math.floor(x), y: Math.floor(y), fx: x, fy: y };
  }
  follow(game, dt) {
    const p = game.player, w = game.world, S = this.S;
    if (!this.free) {   // im Truppen-Modus steht die Kamera frei
      const k = Math.min(1, dt * 6);
      this.cam.x += (p.x - this.cam.x) * k; this.cam.y += (p.y - this.cam.y) * k;
    }
    const hw = this.W / 2 / S, hh = this.H / 2 / S;
    this.cam.x = hw * 2 >= w.w ? w.w / 2 : Math.max(hw, Math.min(w.w - hw, this.cam.x));
    this.cam.y = hh * 2 >= w.h ? w.h / 2 : Math.max(hh, Math.min(w.h - hh, this.cam.y));
  }
  snap(game) { this.cam.x = game.player.x; this.cam.y = game.player.y; }

  /* ---------- Boden ---------- */
  chunk(game, cx, cy) {
    const key = (cy << 8) | cx;
    let ch = this.chunks.get(key);
    const w = game.world;
    if (ch) { this.chunks.delete(key); this.chunks.set(key, ch); }   // zuletzt benutzt nach hinten
    if (!ch || w.dirty.has(key)) {
      if (!ch) {   // höchstens 64 Kacheln im Speicher, die älteste wird wiederverwendet
        if (this.chunks.size >= 64) { const old = this.chunks.keys().next().value; ch = this.chunks.get(old); this.chunks.delete(old); }
        else { ch = document.createElement('canvas'); ch.width = ch.height = 16 * TILE; }
        this.chunks.set(key, ch);
      }
      const g = ch.getContext('2d');
      g.clearRect(0, 0, ch.width, ch.height);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const tx = cx * 16 + x, ty = cy * 16 + y;
        if (tx < w.w && ty < w.h) this.groundTile(g, game, tx, ty, x * TILE, y * TILE);
      }
      w.dirty.delete(key);
    }
    return ch;
  }
  groundTile(g, game, x, y, px, py) {
    const w = game.world, t = w.ground[y * w.w + x], s = game.season, S = TILE, r = cellRand(x, y, 3), v = (r - 0.5) * 0.1;
    const fill = (c) => { g.fillStyle = c; g.fillRect(px, py, S, S); };
    const dot = (c, dx, dy, rad) => { g.fillStyle = c; g.beginPath(); g.arc(px + dx, py + dy, rad, 0, 7); g.fill(); };
    switch (t) {
      case G.GRASS: case G.FOREST: case G.MEADOW: {
        const base = (t === G.FOREST ? SEASON.forest : t === G.MEADOW ? SEASON.meadow : SEASON.grass)[s];
        fill(shade(base, v));
        g.strokeStyle = shade(base, s === 3 ? -0.08 : -0.18); g.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { const a = cellRand(x, y, 10 + i), b = cellRand(x, y, 20 + i); g.beginPath(); g.moveTo(px + a * S, py + b * S); g.lineTo(px + a * S + 1.5, py + b * S - 4); g.stroke(); }
        if (t === G.MEADOW && s < 3) {
          const cols = s === 0 ? ['#ffffff', '#ffd1e3', '#fff27a'] : s === 1 ? ['#fff27a', '#c9a0ff', '#ffffff'] : ['#d9a35c', '#c9844a'];
          for (let i = 0; i < 3; i++) if (cellRand(x, y, 30 + i) < 0.6) dot(cols[i % cols.length], cellRand(x, y, 40 + i) * S, cellRand(x, y, 50 + i) * S, 1.8);
        }
        break;
      }
      case G.SAND: fill(shade(SEASON.sand[s], v)); for (let i = 0; i < 4; i++) dot(shade(SEASON.sand[s], -0.12), cellRand(x, y, 60 + i) * S, cellRand(x, y, 70 + i) * S, 0.9); break;
      case G.DIRT: fill(shade(C.dirt, v)); for (let i = 0; i < 3; i++) dot(shade(C.dirt, -0.2), cellRand(x, y, 60 + i) * S, cellRand(x, y, 70 + i) * S, 1.2); break;
      case G.WATER: case G.DEEP: case G.BRIDGE: {
        const deep = t === G.DEEP || (t === G.BRIDGE && cellRand(x, y, 1) < 0.5 && false);
        fill(shade((deep ? SEASON.deep : SEASON.water)[s], v * 0.5));
        // Ufer-Schaum
        g.fillStyle = s === 3 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)';
        if (!w.isWater(x, y - 1) && w.g(x, y - 1) !== G.BRIDGE) g.fillRect(px, py, S, 2);
        if (!w.isWater(x - 1, y) && w.g(x - 1, y) !== G.BRIDGE) g.fillRect(px, py, 2, S);
        if (!w.isWater(x + 1, y) && w.g(x + 1, y) !== G.BRIDGE) g.fillRect(px + S - 2, py, 2, S);
        if (t === G.BRIDGE) {
          const horiz = w.isWater(x - 1, y) || w.g(x - 1, y) === G.BRIDGE || w.isWater(x + 1, y) || w.g(x + 1, y) === G.BRIDGE;
          g.fillStyle = C.plank; g.fillRect(px, py + S * 0.12, S, S * 0.76);
          g.strokeStyle = shade(C.plank, -0.3); g.lineWidth = 1;
          for (let i = 1; i < 5; i++) { g.beginPath(); if (horiz) { g.moveTo(px + i * S / 5, py + S * 0.12); g.lineTo(px + i * S / 5, py + S * 0.88); } else { g.moveTo(px, py + i * S / 5); g.lineTo(px + S, py + i * S / 5); } g.stroke(); }
          g.fillStyle = shade(C.plank, -0.35); g.fillRect(px, py + S * 0.1, S, 3); g.fillRect(px, py + S * 0.86, S, 3);
        }
        break;
      }
      case G.MOUNTAIN: {
        fill(shade(C.mountain, v));
        g.fillStyle = shade(C.mountain, 0.18); g.beginPath(); g.moveTo(px + S * 0.1, py + S * 0.5); g.lineTo(px + S * 0.45, py + S * 0.12); g.lineTo(px + S * 0.75, py + S * 0.4); g.lineTo(px + S * 0.9, py + S * 0.3); g.lineTo(px + S, py + S * 0.6); g.lineTo(px + S * 0.1, py + S * 0.7); g.fill();
        if (s === 3) { g.fillStyle = '#f4f7f9'; g.beginPath(); g.moveTo(px + S * 0.3, py + S * 0.3); g.lineTo(px + S * 0.45, py + S * 0.12); g.lineTo(px + S * 0.62, py + S * 0.32); g.fill(); }
        if (w.g(x, y + 1) !== G.MOUNTAIN) { g.fillStyle = C.mountainDark; g.fillRect(px, py + S * 0.7, S, S * 0.3); g.fillStyle = shade(C.mountainDark, -0.2); g.fillRect(px, py + S - 3, S, 3); }
        g.strokeStyle = shade(C.mountain, -0.25); g.lineWidth = 1; g.beginPath(); g.moveTo(px + r * S, py + S * 0.2); g.lineTo(px + r * S + 4, py + S * 0.5); g.stroke();
        break;
      }
      case G.PATH: {
        fill(s === 3 ? '#d9d2c4' : shade(C.path, v));
        for (let i = 0; i < 4; i++) { g.fillStyle = shade(C.path, i % 2 ? 0.12 : -0.08); g.beginPath(); g.ellipse(px + (i % 2 ? 0.7 : 0.3) * S, py + (i < 2 ? 0.3 : 0.72) * S, S * 0.17, S * 0.12, 0, 0, 7); g.fill(); }
        break;
      }
      case G.SOIL: {
        const wet = w.wet[y * w.w + x] || game.weather === 'rain';
        fill(wet ? C.soilWet : C.soil);
        g.strokeStyle = shade(wet ? C.soilWet : C.soil, -0.3); g.lineWidth = 2;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(px + 4, py + S * (0.25 + i * 0.25)); g.lineTo(px + S - 4, py + S * (0.25 + i * 0.25)); g.stroke(); }
        break;
      }
    }
  }

  /* ---------- Objekte ---------- */
  tree(g, o, X, Y, S, season, t) {
    const grow = o.age >= 4 ? 1 : 0.35 + o.age * 0.15;
    const cx = X + S / 2, base = Y + S * 0.92;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(cx, base, S * 0.34 * grow, S * 0.12 * grow, 0, 0, 7); g.fill();
    const sway = Math.sin(t * 1.3 + X * 0.05) * 1.2 * grow;
    if (o.kind === 'pine') {
      g.fillStyle = C.trunk; g.fillRect(cx - S * 0.06 * grow, base - S * 0.3 * grow, S * 0.12 * grow, S * 0.3 * grow);
      const col = SEASON.pine[season];
      for (let i = 0; i < 3; i++) {
        const w2 = S * (0.46 - i * 0.11) * grow, yb = base - S * (0.22 + i * 0.32) * grow, h = S * 0.5 * grow;
        g.fillStyle = shade(col, i * 0.06); g.beginPath(); g.moveTo(cx - w2 + sway * i * 0.3, yb); g.lineTo(cx + sway * (i + 1) * 0.4, yb - h); g.lineTo(cx + w2 + sway * i * 0.3, yb); g.fill();
        if (season === 3) { g.fillStyle = '#f4f8fb'; g.beginPath(); g.moveTo(cx - w2 * 0.45 + sway * i * 0.3, yb - h * 0.55); g.lineTo(cx + sway * (i + 1) * 0.4, yb - h); g.lineTo(cx + w2 * 0.45 + sway * i * 0.3, yb - h * 0.55); g.fill(); }
      }
      return;
    }
    g.fillStyle = C.trunk; g.fillRect(cx - S * 0.07 * grow, base - S * 0.5 * grow, S * 0.14 * grow, S * 0.5 * grow);
    const cols = SEASON.canopy[season];
    const cyy = base - S * 0.78 * grow;
    if (!cols) {   // Winter: kahle Äste mit Schnee
      g.strokeStyle = C.trunk; g.lineWidth = Math.max(1.5, S * 0.05 * grow);
      for (const [a, l] of [[-0.9, 0.36], [-0.3, 0.42], [0.4, 0.4], [1.0, 0.32]]) { g.beginPath(); g.moveTo(cx, base - S * 0.45 * grow); g.lineTo(cx + Math.sin(a) * S * l * grow, base - S * (0.45 + Math.cos(a) * l) * grow); g.stroke(); }
      g.fillStyle = '#f4f8fb'; g.beginPath(); g.ellipse(cx, cyy + S * 0.05, S * 0.26 * grow, S * 0.08 * grow, 0, 0, 7); g.fill();
      return;
    }
    const R = S * 0.36 * grow;
    g.fillStyle = shade(cols[0], -0.12); g.beginPath(); g.arc(cx - R * 0.55 + sway, cyy + R * 0.25, R * 0.75, 0, 7); g.arc(cx + R * 0.55 + sway, cyy + R * 0.25, R * 0.75, 0, 7); g.fill();
    g.fillStyle = cols[0]; g.beginPath(); g.arc(cx + sway, cyy - R * 0.1, R, 0, 7); g.fill();
    g.fillStyle = cols[1]; g.beginPath(); g.arc(cx - R * 0.3 + sway, cyy - R * 0.4, R * 0.45, 0, 7); g.fill();
  }
  rock(g, o, X, Y, S, season) {
    const big = o.size > 1, cx = X + S / 2, by = Y + S * 0.85, rw = S * (big ? 0.42 : 0.32), rh = S * (big ? 0.5 : 0.34);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cx, by, rw * 1.05, S * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = '#8e939b'; g.beginPath(); g.moveTo(cx - rw, by); g.lineTo(cx - rw * 0.8, by - rh * 0.7); g.lineTo(cx - rw * 0.2, by - rh); g.lineTo(cx + rw * 0.6, by - rh * 0.85); g.lineTo(cx + rw, by - rh * 0.2); g.lineTo(cx + rw * 0.9, by); g.closePath(); g.fill();
    g.fillStyle = '#b1b6bd'; g.beginPath(); g.moveTo(cx - rw * 0.7, by - rh * 0.65); g.lineTo(cx - rw * 0.2, by - rh * 0.95); g.lineTo(cx + rw * 0.5, by - rh * 0.8); g.lineTo(cx, by - rh * 0.45); g.closePath(); g.fill();
    if (season === 3) { g.fillStyle = '#f4f8fb'; g.beginPath(); g.ellipse(cx - rw * 0.1, by - rh * 0.85, rw * 0.5, rh * 0.14, 0, 0, 7); g.fill(); }
  }
  bush(g, o, X, Y, S, season) {
    const cx = X + S / 2, cy = Y + S * 0.62;
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(cx, Y + S * 0.86, S * 0.32, S * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = season === 3 ? '#8a7a5a' : season === 2 ? '#7a8f3a' : '#3f8a3a';
    g.beginPath(); g.arc(cx - S * 0.14, cy, S * 0.2, 0, 7); g.arc(cx + S * 0.14, cy, S * 0.2, 0, 7); g.arc(cx, cy - S * 0.12, S * 0.22, 0, 7); g.fill();
    if (o.berries && season !== 3) { g.fillStyle = '#d93a5a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + Math.cos(i * 2.1) * S * 0.2, cy - S * 0.05 + Math.sin(i * 2.1) * S * 0.14, S * 0.045, 0, 7); g.fill(); } }
  }
  chest(g, X, Y, S, t) {
    const cx = X + S / 2, by = Y + S * 0.82, w = S * 0.56, h = S * 0.34;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cx, by + 2, w * 0.6, S * 0.08, 0, 0, 7); g.fill();
    g.fillStyle = '#8a5528'; g.fillRect(cx - w / 2, by - h, w, h);
    g.fillStyle = '#a8692f'; g.beginPath(); g.moveTo(cx - w / 2, by - h); g.quadraticCurveTo(cx, by - h - S * 0.2, cx + w / 2, by - h); g.closePath(); g.fill();
    g.fillStyle = '#e8b73a'; g.fillRect(cx - w / 2, by - h * 0.62, w, S * 0.05); g.fillRect(cx - S * 0.05, by - h * 0.8, S * 0.1, S * 0.14);
    const ph = (t * 0.7 + cellRand(Math.floor(X), Math.floor(Y), 4) * 5) % 3;
    if (ph < 0.6) { const a = 1 - Math.abs(ph - 0.3) / 0.3; g.fillStyle = `rgba(255,240,170,${a})`; const sx = cx + w * 0.3, sy = by - h - S * 0.12; g.beginPath(); g.moveTo(sx, sy - 5); g.lineTo(sx + 1.5, sy - 1.5); g.lineTo(sx + 5, sy); g.lineTo(sx + 1.5, sy + 1.5); g.lineTo(sx, sy + 5); g.lineTo(sx - 1.5, sy + 1.5); g.lineTo(sx - 5, sy); g.lineTo(sx - 1.5, sy - 1.5); g.fill(); }
  }
  crop(g, o, X, Y, S) {
    const c = CROPS[o.kind], f = Math.min(1, o.grown / c.days), ripe = o.grown >= c.days, cx = X + S / 2, by = Y + S * 0.82;
    if (o.kind === 'wheat') {
      g.strokeStyle = ripe ? '#e3b84a' : f > 0.5 ? '#9cbf4a' : '#6fb04a'; g.lineWidth = 2;
      const h = S * (0.18 + f * 0.5);
      for (let i = 0; i < 5; i++) { const xx = X + S * (0.2 + i * 0.15); g.beginPath(); g.moveTo(xx, by); g.lineTo(xx + 1, by - h); g.stroke(); if (ripe || f > 0.6) { g.fillStyle = ripe ? '#f0c95a' : '#b5cf5a'; g.beginPath(); g.ellipse(xx + 1, by - h, 2, 4, 0, 0, 7); g.fill(); } }
    } else if (o.kind === 'carrot') {
      g.fillStyle = '#4f9a3a';
      const n = 2 + Math.round(f * 3);
      for (let i = 0; i < n; i++) { const xx = cx + (i - n / 2) * S * 0.12; g.beginPath(); g.ellipse(xx, by - S * 0.12 * (0.5 + f), S * 0.05, S * 0.16 * (0.5 + f), (i - n / 2) * 0.3, 0, 7); g.fill(); }
      if (ripe) { g.fillStyle = '#ee8a2a'; g.beginPath(); g.ellipse(cx, by - 1, S * 0.1, S * 0.06, 0, 0, 7); g.fill(); }
    } else {
      g.strokeStyle = '#4f9a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + S * 0.15, by); g.quadraticCurveTo(cx, by - S * 0.3 * (0.5 + f), X + S * 0.85, by - 2); g.stroke();
      const r = S * (0.08 + f * 0.2);
      g.fillStyle = ripe ? '#e8762a' : f > 0.4 ? '#c9b04a' : '#7fbf4a'; g.beginPath(); g.ellipse(cx, by - r * 0.8, r * 1.15, r, 0, 0, 7); g.fill();
      if (ripe) { g.strokeStyle = '#c45a1a'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, by - r * 1.8); g.lineTo(cx, by); g.stroke(); }
    }
  }

  /* ---------- Gebäude ---------- */
  building(g, b, X, Y, S, t, game) {
    const def = BUILDINGS[b.type], Wd = b.w * S, Ht = b.h * S;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(X + Wd / 2, Y + Ht * 0.95, Wd * 0.48, S * 0.18, 0, 0, 7); g.fill();
    if (!b.built) {
      g.fillStyle = '#c9a77a'; g.fillRect(X + S * 0.1, Y + Ht * 0.35, Wd - S * 0.2, Ht * 0.6);
      g.strokeStyle = '#8a5a30'; g.lineWidth = 3;
      const top = Y + Ht * (0.9 - 0.65 * b.progress);
      for (const xx of [X + S * 0.18, X + Wd - S * 0.18]) { g.beginPath(); g.moveTo(xx, Y + Ht * 0.92); g.lineTo(xx, top); g.stroke(); }
      g.beginPath(); g.moveTo(X + S * 0.18, top); g.lineTo(X + Wd - S * 0.18, top); g.moveTo(X + S * 0.18, Y + Ht * 0.92); g.lineTo(X + Wd - S * 0.18, top); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(X + S * 0.2, Y + Ht * 0.18, Wd - S * 0.4, 6);
      g.fillStyle = '#ffd25a'; g.fillRect(X + S * 0.2, Y + Ht * 0.18, (Wd - S * 0.4) * b.progress, 6);
      return;
    }
    if (b.type === 'tower') return this.tower(g, b, X, Y, S, t, game);
    if (b.type === 'fort') return this.fort(g, b, X, Y, S, t, game);
    if (b.type === 'mine') return this.mine(g, b, X, Y, S, t, game);
    if (b.type === 'charcoal') return this.kiln(g, b, X, Y, S, t, game);
    const lvl = b.level || 1, tall = b.type === 'house' && lvl >= 3;
    const stone = STONE_TYPES.has(b.type) || (b.type === 'house' && lvl >= 2);
    const wallC = stone ? C.stoneWall : C.wall;
    const roofC = b.type === 'house' && lvl === 2 ? '#5e6b7d' : tall ? '#9c3b2e' : def.roof;
    const bx = X + S * 0.14, bw = Wd - S * 0.28, by = Y + Ht * (tall ? 0.22 : 0.42), bh = Ht * (tall ? 0.72 : 0.52);
    const working = b.worker != null && game.settlers.some((s) => s.id === b.worker && s.state === 'working');
    if (b.type === 'market') {
      g.fillStyle = '#8a5a30'; g.fillRect(X + S * 0.2, Y + Ht * 0.4, 4, Ht * 0.52); g.fillRect(X + Wd - S * 0.2 - 4, Y + Ht * 0.4, 4, Ht * 0.52);
      g.fillStyle = '#c99a5a'; g.fillRect(X + S * 0.15, Y + Ht * 0.68, Wd - S * 0.3, Ht * 0.14);
      const goods = ['#e8762a', '#c23a5a', '#e8c25a', '#6aa8d8', '#c9843f'];
      goods.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(X + S * 0.3 + i * (Wd - S * 0.6) / 4, Y + Ht * 0.66, S * 0.08, 0, 7); g.fill(); });
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffffff' : def.roof; g.beginPath(); const x0 = X + S * 0.08 + i * (Wd - S * 0.16) / 6; g.moveTo(x0, Y + Ht * 0.22); g.lineTo(x0 + (Wd - S * 0.16) / 6, Y + Ht * 0.22); g.lineTo(x0 + (Wd - S * 0.16) / 6, Y + Ht * 0.44); g.lineTo(x0, Y + Ht * 0.44); g.fill(); }
      return;
    }
    if (b.type === 'mill') {
      g.fillStyle = wallC; g.beginPath(); g.moveTo(X + Wd * 0.28, Y + Ht * 0.94); g.lineTo(X + Wd * 0.36, Y + Ht * 0.3); g.lineTo(X + Wd * 0.64, Y + Ht * 0.3); g.lineTo(X + Wd * 0.72, Y + Ht * 0.94); g.fill();
      g.fillStyle = def.roof; g.beginPath(); g.moveTo(X + Wd * 0.32, Y + Ht * 0.32); g.lineTo(X + Wd / 2, Y + Ht * 0.14); g.lineTo(X + Wd * 0.68, Y + Ht * 0.32); g.fill();
      g.fillStyle = C.door; g.fillRect(X + Wd / 2 - S * 0.14, Y + Ht * 0.72, S * 0.28, Ht * 0.22);
      const hub = { x: X + Wd / 2, y: Y + Ht * 0.34 }, ang = (b.worker != null && game.fed ? t * 1.6 : t * 0.2);
      g.strokeStyle = '#6b4a2b'; g.lineWidth = 3; g.fillStyle = 'rgba(245,240,225,0.95)';
      for (let i = 0; i < 4; i++) { const a = ang + i * Math.PI / 2, ex = hub.x + Math.cos(a) * S * 0.95, ey = hub.y + Math.sin(a) * S * 0.95; g.beginPath(); g.moveTo(hub.x, hub.y); g.lineTo(ex, ey); g.stroke(); g.save(); g.translate(hub.x, hub.y); g.rotate(a); g.fillRect(S * 0.2, 2, S * 0.72, S * 0.18); g.restore(); }
      g.fillStyle = '#6b4a2b'; g.beginPath(); g.arc(hub.x, hub.y, 4, 0, 7); g.fill();
      return;
    }
    // Wände, Dach, Tür, Fenster
    g.fillStyle = wallC; g.fillRect(bx, by, bw, bh);
    if (stone) { g.strokeStyle = shade(wallC, -0.14); g.lineWidth = 1; for (let yy = by + S * 0.22; yy < by + bh - 4; yy += S * 0.22) { g.beginPath(); g.moveTo(bx, yy); g.lineTo(bx + bw, yy); g.stroke(); } }
    g.fillStyle = shade(wallC, -0.12); g.fillRect(bx, by + bh - 4, bw, 4);
    const apex = tall ? Y - S * 0.32 : Y + S * 0.08;
    g.fillStyle = roofC; g.beginPath(); g.moveTo(X + S * 0.04, by + 4); g.lineTo(X + Wd / 2, apex); g.lineTo(X + Wd - S * 0.04, by + 4); g.closePath(); g.fill();
    if (b.type === 'house' && lvl >= 2) { g.strokeStyle = shade(roofC, -0.2); g.lineWidth = 1; for (let i = 1; i < 4; i++) { const yy = apex + (by + 4 - apex) * i / 4, half = (Wd / 2 - S * 0.04) * i / 4; g.beginPath(); g.moveTo(X + Wd / 2 - half, yy); g.lineTo(X + Wd / 2 + half, yy); g.stroke(); } }
    g.fillStyle = shade(roofC, -0.25); g.fillRect(X + S * 0.04, by, Wd - S * 0.08, 5);
    g.fillStyle = C.door; g.fillRect(X + Wd / 2 - S * 0.16, by + bh - Ht * 0.3, S * 0.32, Ht * 0.3);
    const night = game.hour >= 19;
    g.fillStyle = night ? C.glow : '#8fc4e0';
    const rows = tall ? [0.12, 0.45] : [0.25];
    b._windows = [];
    for (const ry of rows) {
      g.fillRect(bx + bw * 0.12, by + bh * ry, S * 0.24, S * 0.22);
      g.fillRect(bx + bw * 0.88 - S * 0.24, by + bh * ry, S * 0.24, S * 0.22);
      b._windows.push([bx + bw * 0.12 + S * 0.12, by + bh * ry + S * 0.11], [bx + bw * 0.88 - S * 0.12, by + bh * ry + S * 0.11]);
    }
    // Details je Gebäudeart
    const prop = (fn) => { g.save(); fn(); g.restore(); };
    if (b.type === 'house' || b.type === 'hut' || b.type === 'bakery' || b.type === 'smelter' || b.type === 'smithy') {
      const top = tall ? Y - S * 0.2 : b.type === 'smelter' ? Y - S * 0.25 : Y + S * 0.18;
      g.fillStyle = b.type === 'smelter' ? '#6a5a50' : '#7a6a5a'; g.fillRect(X + Wd * 0.68, top, S * (b.type === 'smelter' ? 0.24 : 0.18), Y + S * 0.6 - top);
      if (b.type === 'smelter' && working) { g.fillStyle = `rgba(255,${140 + Math.round(Math.sin(t * 9) * 40)},60,0.95)`; g.fillRect(X + Wd * 0.68 + 2, top - 2, S * 0.24 - 4, 4); }
      const smoking = b.type === 'bakery' || b.type === 'smelter' || b.type === 'smithy' ? working : night || game.season === 3;
      if (smoking) for (let i = 0; i < 3; i++) { const ph = (t * 0.6 + i / 3) % 1; g.fillStyle = b.type === 'smelter' ? `rgba(90,90,90,${0.5 * (1 - ph)})` : `rgba(230,230,230,${0.5 * (1 - ph)})`; g.beginPath(); g.arc(X + Wd * 0.77 + Math.sin(ph * 6 + i) * 3, top - 6 - ph * S * 0.8, 3 + ph * 5, 0, 7); g.fill(); }
    }
    if (b.type === 'smithy') prop(() => {
      g.fillStyle = '#3d4248'; g.fillRect(X - S * 0.22, Y + Ht * 0.8, S * 0.34, S * 0.1); g.fillRect(X - S * 0.12, Y + Ht * 0.86, S * 0.14, S * 0.1); g.fillRect(X - S * 0.2, Y + Ht * 0.94, S * 0.3, S * 0.05);
      if (working) { g.fillStyle = `rgba(255,150,60,${0.55 + Math.sin(t * 11) * 0.25})`; g.fillRect(X + Wd / 2 - S * 0.12, by + bh - Ht * 0.25, S * 0.24, Ht * 0.2); }
    });
    if (b.type === 'barracks') prop(() => {
      this.flag(g, X + Wd - S * 0.12, Y + Ht * 0.92, S * 1.25, C.banner, t);
      g.strokeStyle = '#6b4a2b'; g.lineWidth = 2; g.beginPath(); g.moveTo(X - S * 0.25, Y + Ht * 0.7); g.lineTo(X + S * 0.05, Y + Ht * 0.7); g.stroke();
      for (let i = 0; i < 3; i++) { const xx = X - S * 0.2 + i * S * 0.1; g.strokeStyle = '#7a5a3a'; g.beginPath(); g.moveTo(xx, Y + Ht * 0.95); g.lineTo(xx, Y + Ht * 0.48); g.stroke(); g.fillStyle = '#c8ccd2'; g.beginPath(); g.moveTo(xx - 3, Y + Ht * 0.5); g.lineTo(xx, Y + Ht * 0.4); g.lineTo(xx + 3, Y + Ht * 0.5); g.fill(); }
    });
    if (b.type === 'shipyard') prop(() => {
      g.strokeStyle = '#8a5a30'; g.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) { const xx = X + Wd + S * 0.02 + i * S * 0.13; g.beginPath(); g.arc(xx, Y + Ht * 0.7, S * 0.2, 0.2, Math.PI - 0.2); g.stroke(); }
      g.beginPath(); g.moveTo(X + Wd - S * 0.05, Y + Ht * 0.88); g.lineTo(X + Wd + S * 0.5, Y + Ht * 0.88); g.stroke();
      if (game.fleet && game.fleet[3] > 0) this.warship(g, X - S * 0.35, Y + Ht * 0.92, S * 0.6, 1, t, 0);
      else if (game.boats > 0) this.boat(g, X - S * 0.25, Y + Ht * 0.92, S * (lvl >= 2 ? 1.1 : 0.9));
    });
    if (lvl >= 2 && b.type !== 'house') prop(() => { this.flag(g, X + S * 0.16, by + 2, S * 0.55, '#f2b84b', t); if (lvl >= 3) this.flag(g, X + S * 0.42, by + 2, S * 0.7, '#f2b84b', t + 1); });
    if (b.type === 'storage') prop(() => { for (const [dx, c] of [[-0.05, '#b07a42'], [0.18, '#9a6a3a']]) { g.fillStyle = c; g.fillRect(X + Wd + S * dx - S * 0.4, Y + Ht * 0.7, S * 0.3, S * 0.3); g.strokeStyle = '#6b4228'; g.strokeRect(X + Wd + S * dx - S * 0.4, Y + Ht * 0.7, S * 0.3, S * 0.3); } });
    if (b.type === 'woodcutter' || b.type === 'sawmill') prop(() => { g.fillStyle = '#8a5a30'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(X - S * 0.02, Y + Ht * 0.92 - i * S * 0.13, S * 0.2, S * 0.07, 0, 0, 7); g.fill(); g.fillStyle = '#c9a06a'; g.beginPath(); g.arc(X - S * 0.2, Y + Ht * 0.92 - i * S * 0.13, S * 0.06, 0, 7); g.fill(); g.fillStyle = '#8a5a30'; } });
    if (b.type === 'sawmill') prop(() => { const ang = b.worker != null ? t * 6 : 0; g.translate(X + Wd - S * 0.1, Y + Ht * 0.78); g.rotate(ang); g.fillStyle = '#c8ccd2'; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r = i % 2 ? S * 0.18 : S * 0.24; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
    if (b.type === 'quarry') prop(() => { g.fillStyle = '#9aa0a8'; g.fillRect(X - S * 0.15, Y + Ht * 0.72, S * 0.3, S * 0.22); g.fillStyle = '#b8bec6'; g.fillRect(X - S * 0.02, Y + Ht * 0.6, S * 0.26, S * 0.18); });
    if (b.type === 'fisher') prop(() => { g.strokeStyle = '#6b4a2b'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + Wd, Y + Ht * 0.9); g.lineTo(X + Wd + S * 0.2, Y + Ht * 0.35); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(X + Wd - S * 0.25 + i * 5, Y + Ht * 0.55); g.lineTo(X + Wd - S * 0.25 + i * 5, Y + Ht * 0.85); g.stroke(); } });
    if (b.type === 'farm') prop(() => { g.fillStyle = '#e3c25a'; g.beginPath(); g.ellipse(X - S * 0.05, Y + Ht * 0.85, S * 0.22, S * 0.16, 0, 0, 7); g.fill(); g.strokeStyle = '#c9a03a'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - S * 0.25, Y + Ht * 0.85); g.lineTo(X + S * 0.15, Y + Ht * 0.85); g.stroke(); });
    if (b.type === 'forester') prop(() => { g.fillStyle = '#3f8a3a'; g.beginPath(); g.moveTo(X - S * 0.2, Y + Ht * 0.92); g.lineTo(X - S * 0.05, Y + Ht * 0.55); g.lineTo(X + S * 0.1, Y + Ht * 0.92); g.fill(); });
    if (b.upgrading) this.scaffold(g, b, X, Y, S, Wd, Ht);
    if (BUILDINGS[b.type].job && b.worker == null) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(X + Wd - S * 0.2, Y + S * 0.25, S * 0.2, 0, 7); g.fill(); g.fillStyle = '#ffd25a'; g.font = `700 ${Math.round(S * 0.3)}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', X + Wd - S * 0.2, Y + S * 0.26); }
  }

  scaffold(g, b, X, Y, S, Wd, Ht) {
    g.strokeStyle = '#a0703c'; g.lineWidth = 2;
    for (const xx of [X + S * 0.1, X + Wd / 2, X + Wd - S * 0.1]) { g.beginPath(); g.moveTo(xx, Y + Ht * 0.95); g.lineTo(xx, Y + Ht * 0.2); g.stroke(); }
    for (const yy of [Y + Ht * 0.45, Y + Ht * 0.7]) { g.beginPath(); g.moveTo(X + S * 0.05, yy); g.lineTo(X + Wd - S * 0.05, yy); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(X + S * 0.2, Y + Ht * 0.1, Wd - S * 0.4, 6);
    g.fillStyle = '#7ee0a0'; g.fillRect(X + S * 0.2, Y + Ht * 0.1, (Wd - S * 0.4) * b.upgrading.progress, 6);
  }
  flag(g, x, y, h, color, t) {
    g.strokeStyle = '#5a4030'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    const wv = Math.sin(t * 4 + x * 0.07) * h * 0.05, fw = h * 0.5;
    g.fillStyle = color; g.beginPath(); g.moveTo(x, y - h); g.quadraticCurveTo(x + fw * 0.5, y - h - wv, x + fw, y - h + h * 0.1 + wv); g.lineTo(x + fw * 0.95, y - h + h * 0.28 + wv); g.quadraticCurveTo(x + fw * 0.5, y - h + h * 0.2 - wv, x, y - h + h * 0.3); g.closePath(); g.fill();
  }
  boat(g, x, y, w) {   // (x, y): Mitte der Wasserlinie
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x, y + w * 0.06, w * 0.55, w * 0.12, 0, 0, 7); g.fill();
    g.fillStyle = '#8a5528'; g.beginPath(); g.moveTo(x - w * 0.5, y - w * 0.12); g.quadraticCurveTo(x - w * 0.4, y + w * 0.12, x, y + w * 0.12); g.quadraticCurveTo(x + w * 0.4, y + w * 0.12, x + w * 0.5, y - w * 0.14); g.closePath(); g.fill();
    g.fillStyle = '#b07a42'; g.fillRect(x - w * 0.46, y - w * 0.14, w * 0.92, w * 0.05);
  }
  tower(g, b, X, Y, S, t, game) {
    const Wd = b.w * S, Ht = b.h * S, tx = X + Wd * 0.2, tw = Wd * 0.6, top = Y - S * 0.75, bot = Y + Ht * 0.95;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(X + Wd / 2, bot, Wd * 0.4, S * 0.16, 0, 0, 7); g.fill();
    g.fillStyle = C.stoneWall; g.fillRect(tx, top, tw, bot - top);
    g.fillStyle = shade(C.stoneWall, -0.12); g.fillRect(tx + tw * 0.75, top, tw * 0.25, bot - top);
    g.strokeStyle = shade(C.stoneWall, -0.2); g.lineWidth = 1;
    for (let yy = top + S * 0.3; yy < bot - 2; yy += S * 0.26) { g.beginPath(); g.moveTo(tx, yy); g.lineTo(tx + tw, yy); g.stroke(); }
    g.fillStyle = shade(C.stoneWall, -0.05); g.fillRect(tx - S * 0.08, top, tw + S * 0.16, S * 0.14);
    const bw = (tw + S * 0.16) / 5;
    for (let i = 0; i < 5; i += 2) g.fillRect(tx - S * 0.08 + i * bw, top - S * 0.2, bw, S * 0.2);
    g.fillStyle = C.door; g.beginPath(); g.moveTo(X + Wd / 2 - S * 0.17, bot); g.lineTo(X + Wd / 2 - S * 0.17, bot - S * 0.38); g.arc(X + Wd / 2, bot - S * 0.38, S * 0.17, Math.PI, 0); g.lineTo(X + Wd / 2 + S * 0.17, bot); g.fill();
    const manned = game.manned(b), night = game.hour >= 19;
    g.fillStyle = manned && night ? C.glow : '#3a3d48';
    g.fillRect(X + Wd / 2 - S * 0.08, top + S * 0.4, S * 0.16, S * 0.28);
    b._windows = manned ? [[X + Wd / 2, top + S * 0.54]] : [];
    if (manned) this.flag(g, X + Wd / 2, top - S * 0.2, S * 0.75, C.banner, t);
    if (game.soldiers.some((s) => s.home === b.id && s.state === 'garrison' && s.type === 'archer')) {
      const ax = X + Wd / 2 - S * 0.22, ay = top - S * 0.16;
      g.fillStyle = '#2f5a2c'; g.beginPath(); g.arc(ax, ay - S * 0.06, S * 0.09, Math.PI, 0); g.fill();
      g.fillStyle = '#f1c9a0'; g.beginPath(); g.arc(ax, ay - S * 0.02, S * 0.06, 0, Math.PI); g.fill();
      g.strokeStyle = '#8a5a30'; g.lineWidth = 1.6; g.beginPath(); g.arc(ax - S * 0.12, ay - S * 0.05, S * 0.12, -1.1, 1.1); g.stroke();
    }
    if (b.upgrading) this.scaffold(g, b, X, Y, S, Wd, Ht);
  }
  fort(g, b, X, Y, S, t, game) {
    const Wd = b.w * S, Ht = b.h * S;
    g.fillStyle = 'rgba(140,105,70,0.45)'; g.fillRect(X + S * 0.12, Y + S * 0.4, Wd - S * 0.24, Ht - S * 0.45);
    const stake = (x, y, h) => { g.fillStyle = '#8a5a30'; g.fillRect(x - S * 0.07, y - h, S * 0.14, h); g.fillStyle = '#6a4220'; g.beginPath(); g.moveTo(x - S * 0.07, y - h); g.lineTo(x, y - h - S * 0.12); g.lineTo(x + S * 0.07, y - h); g.fill(); };
    for (let x = X + S * 0.15; x <= X + Wd - S * 0.14; x += S * 0.15) stake(x, Y + S * 0.5, S * 0.55);
    // Bergfried
    const kx = X + Wd * 0.3, kw = Wd * 0.4, ky = Y + Ht * 0.32, kh = Ht * 0.38;
    g.fillStyle = C.stoneWall; g.fillRect(kx, ky, kw, kh);
    g.fillStyle = '#7a4a2f'; g.beginPath(); g.moveTo(kx - S * 0.08, ky + 3); g.lineTo(kx + kw / 2, ky - S * 0.45); g.lineTo(kx + kw + S * 0.08, ky + 3); g.closePath(); g.fill();
    g.fillStyle = C.door; g.fillRect(kx + kw / 2 - S * 0.13, ky + kh - S * 0.38, S * 0.26, S * 0.38);
    const night = game.hour >= 19; g.fillStyle = night ? C.glow : '#8fc4e0'; g.fillRect(kx + kw * 0.15, ky + kh * 0.25, S * 0.18, S * 0.16); g.fillRect(kx + kw * 0.85 - S * 0.18, ky + kh * 0.25, S * 0.18, S * 0.16);
    b._windows = [[kx + kw * 0.15 + S * 0.09, ky + kh * 0.25 + S * 0.08], [kx + kw * 0.85 - S * 0.09, ky + kh * 0.25 + S * 0.08]];
    this.flag(g, kx + kw / 2, ky - S * 0.45, S * 0.8, C.banner, t);
    for (let y = Y + S * 0.6; y <= Y + Ht * 0.9; y += S * 0.15) { stake(X + S * 0.15, y, S * 0.5); stake(X + Wd - S * 0.15, y, S * 0.5); }
    for (let x = X + S * 0.15; x <= X + Wd - S * 0.14; x += S * 0.15) if (Math.abs(x - (X + Wd / 2)) > S * 0.42) stake(x, Y + Ht * 0.97, S * 0.55);
    g.fillStyle = '#5a3a20'; g.fillRect(X + Wd / 2 - S * 0.46, Y + Ht * 0.97 - S * 0.75, S * 0.12, S * 0.75); g.fillRect(X + Wd / 2 + S * 0.34, Y + Ht * 0.97 - S * 0.75, S * 0.12, S * 0.75);
  }
  mine(g, b, X, Y, S, t, game) {
    const Wd = b.w * S, Ht = b.h * S, bot = Y + Ht * 0.95;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(X + Wd / 2, bot, Wd * 0.5, S * 0.16, 0, 0, 7); g.fill();
    g.fillStyle = '#7d756a'; g.beginPath(); g.moveTo(X, bot); g.quadraticCurveTo(X + Wd * 0.15, Y + Ht * 0.2, X + Wd * 0.48, Y + Ht * 0.18); g.quadraticCurveTo(X + Wd * 0.9, Y + Ht * 0.12, X + Wd, bot); g.closePath(); g.fill();
    g.fillStyle = '#958c80'; g.beginPath(); g.moveTo(X + Wd * 0.2, Y + Ht * 0.45); g.quadraticCurveTo(X + Wd * 0.35, Y + Ht * 0.22, X + Wd * 0.55, Y + Ht * 0.25); g.lineTo(X + Wd * 0.45, Y + Ht * 0.42); g.closePath(); g.fill();
    if (game.season === 3) { g.fillStyle = '#eef3f6'; g.beginPath(); g.ellipse(X + Wd * 0.5, Y + Ht * 0.22, Wd * 0.26, S * 0.1, 0, 0, 7); g.fill(); }
    const ex = X + Wd / 2, ew = S * 0.34;
    g.fillStyle = '#1d1814'; g.beginPath(); g.moveTo(ex - ew, bot); g.lineTo(ex - ew, bot - S * 0.55); g.arc(ex, bot - S * 0.55, ew, Math.PI, 0); g.lineTo(ex + ew, bot); g.fill();
    g.strokeStyle = '#8a5a30'; g.lineWidth = 4; g.beginPath(); g.moveTo(ex - ew - 2, bot); g.lineTo(ex - ew - 2, bot - S * 0.62); g.lineTo(ex + ew + 2, bot - S * 0.62); g.lineTo(ex + ew + 2, bot); g.stroke();
    g.fillStyle = '#5a4a3a'; g.fillRect(X + Wd - S * 0.45, bot - S * 0.28, S * 0.36, S * 0.2);
    g.fillStyle = '#8a6a5a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(X + Wd - S * 0.38 + i * S * 0.11, bot - S * 0.3, S * 0.06, 0, 7); g.fill(); }
    g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(X + Wd - S * 0.4, bot - S * 0.06, S * 0.05, 0, 7); g.arc(X + Wd - S * 0.15, bot - S * 0.06, S * 0.05, 0, 7); g.fill();
    b._windows = game.hour >= 19 ? [[ex, bot - S * 0.4]] : [];
    if (b.upgrading) this.scaffold(g, b, X, Y, S, Wd, Ht);
    if ((b.level || 1) >= 2) this.flag(g, X + S * 0.25, Y + Ht * 0.45, S * 0.55, '#f2b84b', t);
    if (b.worker == null) this.badge(g, X + Wd - S * 0.2, Y + S * 0.25, S);
  }
  kiln(g, b, X, Y, S, t, game) {
    const Wd = b.w * S, Ht = b.h * S, bot = Y + Ht * 0.95, working = b.worker != null && game.settlers.some((s) => s.id === b.worker && s.state === 'working');
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(X + Wd / 2, bot, Wd * 0.48, S * 0.16, 0, 0, 7); g.fill();
    g.fillStyle = '#5e5044'; g.beginPath(); g.ellipse(X + Wd * 0.58, bot, Wd * 0.36, Ht * 0.5, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#6e6052'; g.beginPath(); g.ellipse(X + Wd * 0.52, bot - Ht * 0.12, Wd * 0.2, Ht * 0.24, 0, Math.PI, 0); g.fill();
    g.fillStyle = working ? `rgba(255,${130 + Math.round(Math.sin(t * 8) * 40)},50,0.95)` : '#2a221c';
    g.beginPath(); g.ellipse(X + Wd * 0.58, bot - 2, S * 0.18, S * 0.22, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#8a5a30'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(X + S * 0.25, bot - S * 0.08 - i * S * 0.13, S * 0.2, S * 0.07, 0, 0, 7); g.fill(); }
    if (working || b.worker != null) for (let i = 0; i < 4; i++) { const ph = (t * 0.45 + i / 4) % 1; g.fillStyle = `rgba(70,70,70,${0.55 * (1 - ph)})`; g.beginPath(); g.arc(X + Wd * 0.58 + Math.sin(ph * 5 + i) * 4, bot - Ht * 0.5 - ph * S * 1.1, 4 + ph * 7, 0, 7); g.fill(); }
    b._windows = working ? [[X + Wd * 0.58, bot - S * 0.1]] : [];
    if (b.upgrading) this.scaffold(g, b, X, Y, S, Wd, Ht);
    if ((b.level || 1) >= 2) this.flag(g, X + S * 0.1, Y + Ht * 0.5, S * 0.55, '#f2b84b', t);
    if (b.worker == null) this.badge(g, X + Wd - S * 0.2, Y + S * 0.25, S);
  }
  badge(g, x, y, S) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x, y, S * 0.2, 0, 7); g.fill(); g.fillStyle = '#ffd25a'; g.font = `700 ${Math.round(S * 0.3)}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x, y + 1); }

  /* ---------- Stammeslager ---------- */
  hall(g, tr, X, Y, S, t, season) {
    const Wd = 3 * S, Ht = 3 * S, bot = Y + Ht * 0.96;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(X + Wd / 2, bot, Wd * 0.48, S * 0.2, 0, 0, 7); g.fill();
    g.fillStyle = '#7a5236'; g.fillRect(X + S * 0.2, Y + Ht * 0.48, Wd - S * 0.4, Ht * 0.48);
    g.strokeStyle = '#5e3e28'; g.lineWidth = 1.5;
    for (let yy = Y + Ht * 0.56; yy < bot; yy += S * 0.2) { g.beginPath(); g.moveTo(X + S * 0.2, yy); g.lineTo(X + Wd - S * 0.2, yy); g.stroke(); }
    const thatch = season === 3 ? '#e9eef1' : '#c9a65a';
    g.fillStyle = thatch; g.beginPath(); g.moveTo(X - S * 0.05, Y + Ht * 0.56); g.lineTo(X + Wd / 2, Y + S * 0.05); g.lineTo(X + Wd + S * 0.05, Y + Ht * 0.56); g.closePath(); g.fill();
    g.strokeStyle = shade(thatch, -0.18); g.lineWidth = 1;
    for (let i = 1; i < 7; i++) { const xx = X - S * 0.05 + (Wd + S * 0.1) * i / 7; g.beginPath(); g.moveTo(xx, Y + Ht * 0.56); g.lineTo(X + Wd / 2 + (xx - X - Wd / 2) * 0.25, Y + S * 0.3); g.stroke(); }
    g.strokeStyle = tr.color; g.lineWidth = 3;
    g.beginPath(); g.moveTo(X + S * 0.3, Y + Ht * 0.48); g.lineTo(X + Wd / 2, Y + S * 0.45); g.lineTo(X + Wd - S * 0.3, Y + Ht * 0.48); g.stroke();
    g.strokeStyle = '#5e3e28'; g.lineWidth = 3; g.beginPath(); g.moveTo(X + Wd / 2 - S * 0.35, Y - S * 0.25); g.lineTo(X + Wd / 2 + S * 0.1, Y + S * 0.25); g.moveTo(X + Wd / 2 + S * 0.35, Y - S * 0.25); g.lineTo(X + Wd / 2 - S * 0.1, Y + S * 0.25); g.stroke();
    g.fillStyle = '#2a1c12'; g.beginPath(); g.moveTo(X + Wd / 2 - S * 0.28, bot); g.lineTo(X + Wd / 2 - S * 0.28, bot - S * 0.5); g.arc(X + Wd / 2, bot - S * 0.5, S * 0.28, Math.PI, 0); g.lineTo(X + Wd / 2 + S * 0.28, bot); g.fill();
    for (const px of [X + S * 0.12, X + Wd - S * 0.12]) {
      g.fillStyle = '#6b4a2b'; g.fillRect(px - S * 0.08, bot - S * 1.3, S * 0.16, S * 1.3);
      g.fillStyle = tr.color; g.fillRect(px - S * 0.12, bot - S * 1.3, S * 0.24, S * 0.22);
      g.fillStyle = '#f3e9d8'; g.fillRect(px - S * 0.07, bot - S * 1.22, S * 0.05, S * 0.05); g.fillRect(px + S * 0.02, bot - S * 1.22, S * 0.05, S * 0.05);
      g.fillStyle = shade(tr.color, -0.25); g.fillRect(px - S * 0.1, bot - S * 0.85, S * 0.2, S * 0.12);
    }
    this.flag(g, X + Wd / 2, Y + S * 0.08, S * 0.8, tr.color, t);
  }
  tent(g, tr, X, Y, S, season) {
    const Wd = 2 * S, Ht = 2 * S, bot = Y + Ht * 0.94;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(X + Wd / 2, bot, Wd * 0.44, S * 0.16, 0, 0, 7); g.fill();
    g.strokeStyle = '#5e3e28'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + Wd / 2 - S * 0.25, Y + S * 0.05); g.lineTo(X + Wd / 2 + S * 0.05, Y + S * 0.4); g.moveTo(X + Wd / 2 + S * 0.25, Y + S * 0.05); g.lineTo(X + Wd / 2 - S * 0.05, Y + S * 0.4); g.stroke();
    g.fillStyle = season === 3 ? '#e4dccb' : '#d9c4a0'; g.beginPath(); g.moveTo(X + S * 0.12, bot); g.lineTo(X + Wd / 2, Y + S * 0.3); g.lineTo(X + Wd - S * 0.12, bot); g.closePath(); g.fill();
    g.fillStyle = shade('#d9c4a0', -0.15); g.beginPath(); g.moveTo(X + Wd / 2, Y + S * 0.3); g.lineTo(X + Wd - S * 0.12, bot); g.lineTo(X + Wd * 0.62, bot); g.closePath(); g.fill();
    g.strokeStyle = tr.color; g.lineWidth = 3; g.beginPath();
    const yb = Y + Ht * 0.62, half = (Wd / 2 - S * 0.12) * (yb - Y - S * 0.3) / (bot - Y - S * 0.3);
    for (let i = 0; i <= 6; i++) { const xx = X + Wd / 2 - half + (half * 2) * i / 6, yy = yb + (i % 2 ? -4 : 3); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
    g.stroke();
    g.fillStyle = '#2a1c12'; g.beginPath(); g.moveTo(X + Wd / 2 - S * 0.2, bot); g.lineTo(X + Wd / 2, bot - S * 0.55); g.lineTo(X + Wd / 2 + S * 0.2, bot); g.fill();
  }
  fire(g, x, y, S, t) {
    g.fillStyle = '#5a3a22'; g.save(); g.translate(x, y); g.rotate(0.5); g.fillRect(-S * 0.22, -S * 0.04, S * 0.44, S * 0.08); g.rotate(-1); g.fillRect(-S * 0.22, -S * 0.04, S * 0.44, S * 0.08); g.restore();
    for (let i = 0; i < 3; i++) {
      const f = Math.sin(t * 12 + i * 2.1) * 0.15 + 0.85, h = S * (0.32 - i * 0.07) * f;
      g.fillStyle = ['#e8622a', '#f29a2e', '#ffd25a'][i];
      g.beginPath(); g.moveTo(x - S * (0.13 - i * 0.03), y); g.quadraticCurveTo(x, y - h * 1.6, x + S * (0.13 - i * 0.03), y); g.fill();
    }
  }

  /* ---------- Figuren ---------- */
  person(g, e, S, opts) {
    const x = (e.x + (opts.ox || 0) - this.cam.x) * S + this.W / 2, y = (e.y + (opts.oy || 0) - this.cam.y) * S + this.H / 2;
    const sc = opts.player ? 1.15 : 0.9, bob = opts.boat ? Math.sin((opts.t || 0) * 2 + e.x) * 1.2 : e.moving || e.state === 'walk' || e.path ? Math.abs(Math.sin(e.walkT || 0)) * 2 : 0;
    if (opts.boat) this.boat(g, x, y + S * 0.16, S * 0.95);
    else { g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x, y + S * 0.22, S * 0.2 * sc, S * 0.07 * sc, 0, 0, 7); g.fill(); }
    const by = y - bob - (opts.boat ? S * 0.05 : 0);
    if (opts.weapon && !opts.swing) this.weapon(g, opts.weapon, x + S * 0.17 * sc, by - S * 0.05, S, opts.weapon === 'bow' ? -0.2 : -0.35);
    g.fillStyle = opts.shirt; g.beginPath(); g.roundRect ? g.roundRect(x - S * 0.15 * sc, by - S * 0.2 * sc, S * 0.3 * sc, S * 0.38 * sc, S * 0.08) : g.rect(x - S * 0.15 * sc, by - S * 0.2 * sc, S * 0.3 * sc, S * 0.38 * sc); g.fill();
    if (opts.player) { g.fillStyle = '#7a5230'; g.fillRect(x - S * 0.13 * sc + (e.facing === 1 ? -S * 0.08 : e.facing === 3 ? S * 0.08 : 0), by - S * 0.16 * sc, S * 0.26 * sc, S * 0.2 * sc); g.fillStyle = opts.shirt; g.fillRect(x - S * 0.12 * sc, by - S * 0.18 * sc, S * 0.24 * sc, S * 0.12 * sc); }
    g.fillStyle = '#f1c9a0'; g.beginPath(); g.arc(x, by - S * 0.3 * sc, S * 0.13 * sc, 0, 7); g.fill();
    if (opts.shield) { const sx = x - S * 0.15 * sc * (e.facing === 3 ? -1 : 1); g.fillStyle = opts.shield; g.beginPath(); g.ellipse(sx, by - S * 0.02, S * 0.1, S * 0.13, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 1; g.stroke(); g.fillStyle = 'rgba(255,240,200,0.9)'; g.beginPath(); g.arc(sx, by - S * 0.02, S * 0.025, 0, 7); g.fill(); }
    if (opts.hood) { g.fillStyle = opts.hood; g.beginPath(); g.arc(x, by - S * 0.32 * sc, S * 0.15 * sc, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(x + S * 0.03, by - S * 0.56 * sc); g.closePath(); g.fill(); if (opts.crest) { g.fillStyle = opts.crest; g.beginPath(); g.ellipse(x + S * 0.12 * sc, by - S * 0.47 * sc, S * 0.025, S * 0.09, 0.5, 0, 7); g.fill(); } }
    else if (opts.helmet) { g.fillStyle = '#aab3bf'; g.beginPath(); g.arc(x, by - S * 0.36 * sc, S * 0.14 * sc, Math.PI, 0); g.fill(); g.fillRect(x - S * 0.16 * sc, by - S * 0.37 * sc, S * 0.32 * sc, S * 0.04 * sc); g.fillStyle = opts.crest || C.banner; g.fillRect(x - S * 0.02, by - S * 0.53 * sc, S * 0.04, S * 0.08); }
    else if (opts.band) { g.fillStyle = opts.band; g.fillRect(x - S * 0.13 * sc, by - S * 0.37 * sc, S * 0.26 * sc, S * 0.05 * sc); g.fillStyle = '#f3ead8'; g.beginPath(); g.ellipse(x + S * 0.1 * sc, by - S * 0.5 * sc, S * 0.035, S * 0.12, 0.35, 0, 7); g.fill(); g.fillStyle = opts.band; g.beginPath(); g.ellipse(x + S * 0.12 * sc, by - S * 0.58 * sc, S * 0.025, S * 0.05, 0.35, 0, 7); g.fill(); }
    else if (opts.hat) { g.fillStyle = opts.hat; g.beginPath(); g.ellipse(x, by - S * 0.39 * sc, S * 0.17 * sc, S * 0.06 * sc, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x, by - S * 0.41 * sc, S * 0.1 * sc, Math.PI, 0); g.fill(); }
    if (opts.rank) { g.strokeStyle = '#ffd25a'; g.lineWidth = 1.5; for (let i = 0; i < opts.rank; i++) { const yy = by - S * 0.08 + i * 3.5; g.beginPath(); g.moveTo(x - 4, yy - 2); g.lineTo(x, yy + 1); g.lineTo(x + 4, yy - 2); g.stroke(); } }
    if (opts.weapon === 'bow' && opts.swing) this.weapon(g, 'bow', x + S * 0.08 * (e.facing === 3 ? -1 : e.facing === 1 ? 1 : 0), by - S * 0.12, S, [-Math.PI / 2, 0, Math.PI / 2, Math.PI][e.facing || 0]);
    else if (opts.weapon && opts.swing) this.weapon(g, opts.weapon, x + S * 0.14 * sc * (e.facing === 3 ? -1 : 1), by - S * 0.1, S, (e.facing === 3 ? -1 : 1) * (1.6 - opts.swing * 5));
    if (opts.hp != null && opts.hp < 0.999) { const w = S * 0.42; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - w / 2, by - S * 0.72 * sc, w, 4); g.fillStyle = opts.hp > 0.5 ? '#7ee07e' : opts.hp > 0.25 ? '#f2c14b' : '#f06a5a'; g.fillRect(x - w / 2, by - S * 0.72 * sc, w * Math.max(0, opts.hp), 4); }
    if (opts.hurt) { g.fillStyle = 'rgba(255,80,60,0.35)'; g.beginPath(); g.arc(x, by - S * 0.15, S * 0.28, 0, 7); g.fill(); }
    if (e.facing !== 0) { g.fillStyle = '#3a2a1a'; const fx = e.facing === 1 ? 0.05 : e.facing === 3 ? -0.05 : 0; g.fillRect(x + S * (fx - 0.05) * sc, by - S * 0.31 * sc, 2, 2); g.fillRect(x + S * (fx + 0.04) * sc, by - S * 0.31 * sc, 2, 2); }
    if (opts.carry) { g.fillStyle = ITEMS[opts.carry].color; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.fillRect(x - S * 0.1, by - S * 0.66 * sc, S * 0.2, S * 0.16); g.strokeRect(x - S * 0.1, by - S * 0.66 * sc, S * 0.2, S * 0.16); }
    if (opts.working) { const a = Math.sin(opts.t * 12) * 0.8; g.strokeStyle = '#5a4a3a'; g.lineWidth = 2.5; g.beginPath(); const hx = x + S * 0.16, hy = by - S * 0.1; g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a - 1) * S * 0.26, hy + Math.sin(a - 1) * S * 0.26); g.stroke(); }
    if (opts.progress != null) { g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4; g.beginPath(); g.arc(x, by - S * 0.85, S * 0.14, 0, 7); g.stroke(); g.strokeStyle = '#ffd25a'; g.beginPath(); g.arc(x, by - S * 0.85, S * 0.14, -Math.PI / 2, -Math.PI / 2 + opts.progress * Math.PI * 2); g.stroke(); }
    return { x, y: by };
  }
  weapon(g, kind, x, y, S, ang) {
    g.save(); g.translate(x, y); g.rotate(ang);
    if (kind === 'bow') {
      const cx = -S * 0.1, cy = -S * 0.12, r = S * 0.22;
      g.strokeStyle = '#8a5a30'; g.lineWidth = 2.2; g.beginPath(); g.arc(cx, cy, r, -1.1, 1.1); g.stroke();
      g.strokeStyle = 'rgba(245,240,225,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx + Math.cos(-1.1) * r, cy + Math.sin(-1.1) * r); g.lineTo(cx + Math.cos(1.1) * r, cy + Math.sin(1.1) * r); g.stroke();
    } else if (kind === 'spear') { g.strokeStyle = '#7a5a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, S * 0.18); g.lineTo(0, -S * 0.5); g.stroke(); g.fillStyle = '#c8ccd2'; g.beginPath(); g.moveTo(-3, -S * 0.46); g.lineTo(0, -S * 0.6); g.lineTo(3, -S * 0.46); g.fill(); }
    else { g.fillStyle = '#dfe4ec'; g.fillRect(-1.5, -S * 0.42, 3, S * 0.36); g.fillStyle = '#6b4a2b'; g.fillRect(-4, -S * 0.07, 8, 2.5); g.fillRect(-1.5, -S * 0.05, 3, S * 0.09); }
    g.restore();
  }

  shot(g, sh, ox, oy, S) {
    const p = Math.min(1, sh.t / sh.dur), len = Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0), arc = len * 0.12;
    const px = sh.x0 + (sh.x1 - sh.x0) * p, py = sh.y0 + (sh.y1 - sh.y0) * p - arc * 4 * p * (1 - p);
    const a = Math.atan2((sh.y1 - sh.y0) - arc * 4 * (1 - 2 * p), sh.x1 - sh.x0), bolt = sh.kind === 'bolt', L = (bolt ? 0.45 : 0.3) * S;
    g.save(); g.translate(ox + px * S, oy + py * S); g.rotate(a);
    g.strokeStyle = bolt ? '#4a3a2a' : '#7a5a3a'; g.lineWidth = bolt ? 3 : 1.6;
    g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
    g.fillStyle = '#d8dde4'; g.beginPath(); g.moveTo(bolt ? 4 : 3, 0); g.lineTo(-3, -2.4); g.lineTo(-3, 2.4); g.fill();
    if (!bolt) { g.strokeStyle = '#f3ead8'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); g.lineTo(-L - 3, -2); g.moveTo(-L, 0); g.lineTo(-L - 3, 2); g.stroke(); }
    g.restore();
  }
  warship(g, x, y, S, facing, t, swing) {
    const dir = facing === 3 ? -1 : 1;
    g.save(); g.translate(x, y + Math.sin(t * 2 + x * 0.05) * 1.5); g.scale(dir, 1);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(0, S * 0.2, S * 0.85, S * 0.15, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-S * 0.85, S * 0.12, S * 0.18, S * 0.05, 0, 0, 7); g.fill();
    g.fillStyle = '#6b4222'; g.beginPath(); g.moveTo(-S * 0.82, -S * 0.06); g.quadraticCurveTo(-S * 0.6, S * 0.22, 0, S * 0.22); g.quadraticCurveTo(S * 0.6, S * 0.22, S * 0.92, -S * 0.16); g.lineTo(S * 0.74, -S * 0.12); g.lineTo(-S * 0.76, -S * 0.08); g.closePath(); g.fill();
    g.fillStyle = '#9a6a3a'; g.fillRect(-S * 0.74, -S * 0.12, S * 1.48, S * 0.06);
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#f3ead8' : C.banner; g.beginPath(); g.arc(-S * 0.5 + i * S * 0.24, -S * 0.02, S * 0.065, 0, 7); g.fill(); }
    g.strokeStyle = '#5a3a20'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-S * 0.12, -S * 0.1); g.lineTo(-S * 0.12, -S * 1.05); g.stroke();
    const wv = Math.sin(t * 3) * S * 0.04;
    g.fillStyle = '#ece0c6'; g.beginPath(); g.moveTo(-S * 0.12, -S * 1.0); g.quadraticCurveTo(S * 0.36 + wv, -S * 0.68, -S * 0.12, -S * 0.3); g.closePath(); g.fill();
    g.fillStyle = C.banner; g.fillRect(-S * 0.1, -S * 0.72, S * 0.2, S * 0.06);
    g.strokeStyle = '#3d2e20'; g.lineWidth = 2; g.beginPath(); g.moveTo(S * 0.42, -S * 0.14); g.lineTo(S * 0.6, -S * 0.3 + (swing > 0 ? S * 0.07 : 0)); g.stroke();
    g.beginPath(); g.arc(S * 0.6, -S * 0.3, S * 0.13, -1.2, 1.2); g.stroke();
    g.restore();
  }

  /* ---------- Bild zeichnen ---------- */
  draw(game, ui, t) {
    const g = this.ctx, S = this.S, w = game.world, season = game.season;
    if (this.season !== season) { this.season = season; w.touchAll(); }
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#2b3a2a'; g.fillRect(0, 0, this.W, this.H);
    const ox = this.W / 2 - this.cam.x * S, oy = this.H / 2 - this.cam.y * S;
    const x0 = Math.max(0, Math.floor(this.cam.x - this.W / 2 / S) - 1), x1 = Math.min(w.w - 1, Math.ceil(this.cam.x + this.W / 2 / S) + 1);
    const y0 = Math.max(0, Math.floor(this.cam.y - this.H / 2 / S) - 1), y1 = Math.min(w.h - 1, Math.ceil(this.cam.y + this.H / 2 / S) + 2);
    // Boden
    for (let cy = y0 >> 4; cy <= y1 >> 4; cy++) for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) {
      const ch = this.chunk(game, cx, cy);
      g.drawImage(ch, ox + cx * 16 * S, oy + cy * 16 * S, 16 * S, 16 * S);
    }
    // Wasser glitzert
    g.strokeStyle = season === 3 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.28)'; g.lineWidth = 1.5;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!w.isWater(x, y) || cellRand(x, y, 7) > 0.35) continue;
      const ph = (t * 0.5 + cellRand(x, y, 8) * 6) % 6;
      if (ph > 1.2) continue;
      const X = ox + x * S + cellRand(x, y, 9) * S * 0.6, Y = oy + y * S + cellRand(x, y, 11) * S;
      g.beginPath(); g.moveTo(X, Y); g.lineTo(X + S * 0.3 * Math.sin(ph * 2.6), Y); g.stroke();
    }
    // Pflanzen (flach)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const o = w.obj[y * w.w + x]; if (o && o.t === 'crop') this.crop(g, o, ox + x * S, oy + y * S, S); }
    // Felder des Bauernhofs markieren
    if (ui.selected && ui.selected.type === 'farm') { g.strokeStyle = 'rgba(255,230,120,0.7)'; g.lineWidth = 2; for (const k of ui.selected.fields) g.strokeRect(ox + (k % w.w) * S + 2, oy + ((k / w.w) | 0) * S + 2, S - 4, S - 4); }
    // Tiefensortierte Dinge
    const list = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = w.obj[y * w.w + x];
      if (o && o.t !== 'crop') list.push({ y: y + 0.9, k: 'o', o, x, ty: y });
    }
    for (const b of game.buildings) if (b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1 + 2) list.push({ y: b.y + b.h - 0.05, k: 'b', b });
    for (const s of game.settlers) list.push({ y: s.y, k: 's', s });
    list.push({ y: game.player.y, k: 'p' });
    const inView = (e, m = 2) => e.x >= x0 - m && e.x <= x1 + m && e.y >= y0 - m && e.y <= y1 + m;
    for (const tr of game.tribes) {
      if (tr.defeated || tr.hall.x > x1 + 2 || tr.hall.x + 3 < x0 - 6 || tr.hall.y > y1 + 2 || tr.hall.y + 3 < y0 - 6) continue;
      list.push({ y: tr.hall.y + 2.95, k: 'hall', tr });
      for (const h of tr.huts) list.push({ y: h.y + 1.95, k: 'tent', tr, h });
      const fx = tr.hall.x + 2.6, fy = tr.hall.y + 3.55;
      list.push({ y: fy, k: 'fire', x: fx, fy });
      const n = Math.min(tr.warriors, 6);
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.15 + 0.7 * i / Math.max(1, n - 1)), ex = fx + Math.cos(a) * 1.1 + 0.3, ey = fy + Math.sin(a) * 0.7 + 0.1;
        list.push({ y: ey, k: 'idle', tr, e: { x: ex, y: ey, facing: ex > fx + 0.4 ? 3 : 1, walkT: 0 } });
      }
    }
    for (const s of game.soldiers) if (s.state !== 'garrison' && inView(s)) list.push({ y: s.y, k: 'm', s });
    for (const f of game.foes) if (inView(f)) list.push({ y: f.y, k: 'f', f });
    for (const sh of game.ships || []) if (inView(sh)) list.push({ y: sh.y, k: 'ship', sh });
    list.sort((a, c) => a.y - c.y);
    for (const d of list) {
      if (d.k === 'o') {
        const X = ox + d.x * S, Y = oy + d.ty * S;
        if (d.o.t === 'tree') this.tree(g, d.o, X, Y, S, season, t);
        else if (d.o.t === 'rock') this.rock(g, d.o, X, Y, S, season);
        else if (d.o.t === 'bush') this.bush(g, d.o, X, Y, S, season);
        else if (d.o.t === 'chest') this.chest(g, X, Y, S, t);
      } else if (d.k === 'b') this.building(g, d.b, ox + d.b.x * S, oy + d.b.y * S, S, t, game);
      else if (d.k === 's') {
        const s = d.s, job = s.job != null ? game.byId(s.job) : null;
        const hat = job ? BUILDINGS[job.type].hat : (s.task && s.task.site != null ? '#e8a23a' : s.recruit != null ? '#aab3bf' : null);
        this.person(g, s, S, { shirt: '#5b7fa6', hat: hat || s.hat, carry: s.carry && s.carry.item, working: s.state === 'working' || s.state === 'building', boat: w.isWater(Math.floor(s.x), Math.floor(s.y)), t });
      } else if (d.k === 'p') {
        const p = game.player;
        this.person(g, p, S, { player: true, shirt: '#c0392b', hat: '#6b4a2b', working: !!p.action, progress: p.action ? p.action.t / p.action.total : null, boat: w.isWater(Math.floor(p.x), Math.floor(p.y)), t });
      } else if (d.k === 'm') {
        const s = d.s, archer = s.type === 'archer', drill = s.drill || 1, crest = ['#c0392b', '#c0392b', '#3d85c6', '#f2b84b'][drill];
        if (ui.sel && ui.sel.has(s.id)) {
          const X = ox + (s.x + (cellRand(s.id, 1, 5) - 0.5) * 0.35) * S, Y = oy + (s.y + (cellRand(s.id, 2, 5) - 0.5) * 0.25 + 0.2) * S;
          g.strokeStyle = '#ffd25a'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(X, Y, S * 0.3, S * 0.12, 0, 0, 7); g.stroke();
        }
        this.person(g, s, S, { shirt: archer ? '#3f6f3a' : '#3a5f9a', helmet: !archer, hood: archer ? '#2f5a2c' : null, crest, shield: !archer && drill >= 2 ? crest : null, weapon: archer ? 'bow' : 'sword', swing: s.swing > 0 ? s.swing : 0, rank: s.rank, hp: s.hp / game.maxHp(s), hurt: s.hurtT > 0, ox: (cellRand(s.id, 1, 5) - 0.5) * 0.35, oy: (cellRand(s.id, 2, 5) - 0.5) * 0.25, boat: w.isWater(Math.floor(s.x), Math.floor(s.y)), t });
      } else if (d.k === 'ship') {
        const sh = d.sh;
        this.warship(g, ox + sh.x * S, oy + sh.y * S, S, sh.facing, t, sh.swing || 0);
      } else if (d.k === 'f') {
        const f = d.f, tr = game.tribes[f.tribe];
        this.person(g, f, S, { shirt: tr.color, band: shade(tr.color, -0.3), weapon: 'spear', swing: f.swing > 0 ? f.swing : 0, hp: f.hp / f.maxHp, hurt: f.hurtT > 0, carry: f.loot ? Object.keys(f.loot)[0] : null, ox: (cellRand(f.id, 1, 6) - 0.5) * 0.35, oy: (cellRand(f.id, 2, 6) - 0.5) * 0.25, t });
      } else if (d.k === 'hall') this.hall(g, d.tr, ox + d.tr.hall.x * S, oy + d.tr.hall.y * S, S, t, season);
      else if (d.k === 'tent') this.tent(g, d.tr, ox + d.h.x * S, oy + d.h.y * S, S, season);
      else if (d.k === 'fire') this.fire(g, ox + d.x * S, oy + d.fy * S, S, t);
      else if (d.k === 'idle') { d.e.walkT = 0; this.person(g, d.e, S * 0.9, { shirt: d.tr.color, band: shade(d.tr.color, -0.3), weapon: 'spear', t }); }
    }
    for (const sh of game.shots || []) this.shot(g, sh, ox, oy, S);
    if (ui.sel && ui.sel.size) this.posts(g, game, ui.sel, ox, oy, S, t);
    if (ui.ping) {
      const age = t - ui.ping.t;
      if (age < 0.8) { g.strokeStyle = ui.ping.attack ? `rgba(255,110,90,${1 - age / 0.8})` : `rgba(255,220,110,${1 - age / 0.8})`; g.lineWidth = 3; g.beginPath(); g.ellipse(ox + (ui.ping.x + 0.5) * S, oy + (ui.ping.y + 0.6) * S, S * (0.2 + age * 0.9), S * (0.08 + age * 0.35), 0, 0, 7); g.stroke(); }
    }
    // Grenzen: dein Land gestrichelt hell, Stämme in ihrer Farbe
    this.drawBorders(g, game, ox, oy, S, x0, x1, y0, y1);
    if (ui.ghost || ui.buildMode) {   // beim Bauen: fremdes und freies Land abdunkeln
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.land[y * w.w + x] !== 1) g.fillRect(ox + x * S, oy + y * S, S + 0.5, S + 0.5);
    }
    // Hover und Bau-Vorschau
    if (ui.ghost) {
      const gh = ui.ghost, def = BUILDINGS[gh.type];
      g.fillStyle = gh.ok ? 'rgba(120,230,120,0.35)' : 'rgba(240,90,90,0.35)'; g.strokeStyle = gh.ok ? '#7ee07e' : '#f06060'; g.lineWidth = 2;
      g.fillRect(ox + gh.x * S, oy + gh.y * S, def.w * S, def.h * S); g.strokeRect(ox + gh.x * S, oy + gh.y * S, def.w * S, def.h * S);
      if (def.radius) { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.setLineDash([6, 6]); g.beginPath(); g.arc(ox + (gh.x + 1) * S, oy + (gh.y + 1) * S, def.radius * S, 0, 7); g.stroke(); g.setLineDash([]); }
      const terr = gh.type === 'path' || gh.type === 'field' ? 0 : TERRITORY[gh.type] || 3;
      if (terr) { g.strokeStyle = 'rgba(255,236,170,0.55)'; g.setLineDash([3, 6]); g.beginPath(); g.arc(ox + (gh.x + def.w / 2) * S, oy + (gh.y + def.h / 2) * S, terr * S, 0, 7); g.stroke(); g.setLineDash([]); }
    } else if (ui.hover) {
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.strokeRect(ox + ui.hover.x * S + 1, oy + ui.hover.y * S + 1, S - 2, S - 2);
    }
    if (ui.selected && BUILDINGS[ui.selected.type].radius) { const b = ui.selected; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.arc(ox + (b.x + 1) * S, oy + (b.y + 1) * S, game.radiusOf(b) * S, 0, 7); g.stroke(); g.setLineDash([]); }
    // schwebende Zahlen
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${Math.round(12 + S * 0.12)}px Nunito, sans-serif`;
    for (const f of game.fx) {
      const X = ox + f.x * S, Y = oy + f.y * S - f.t * S * 0.6;
      g.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(f.text, X + 1, Y + 1);
      g.fillStyle = f.color; g.fillText(f.text, X, Y);
    }
    g.globalAlpha = 1;
    // Wetter
    if (game.weather === 'rain' || game.weather === 'snow') this.weatherFx(g, game.weather, t);
    // Nacht
    const h = game.hour;
    const dark = h < 7 ? 0.3 * (7 - h) : h < 18 ? 0 : h < 21 ? (h - 18) / 3 * 0.42 : 0.42 + (h - 21) / 3 * 0.12;
    const cloudy = game.weather === 'rain' ? 0.12 : 0;
    if (dark + cloudy > 0.01) {
      g.fillStyle = `rgba(12,18,48,${Math.min(0.6, dark + cloudy)})`; g.fillRect(0, 0, this.W, this.H);
      if (dark > 0.15) {
        g.globalCompositeOperation = 'lighter';
        const glow = (X, Y, r, a) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, `rgba(255,190,90,${a})`); gr.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill(); };
        for (const b of game.buildings) if (b.built && b._windows && b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1) for (const [wx, wy] of b._windows) glow(wx, wy, S * 0.9, dark * 0.5);
        for (const tr of game.tribes) if (!tr.defeated && tr.hall.x + 3 >= x0 && tr.hall.x <= x1 && tr.hall.y + 4 >= y0 && tr.hall.y <= y1) glow(ox + (tr.hall.x + 2.6) * S, oy + (tr.hall.y + 3.4) * S, S * 2.6, dark * 0.7);
        const p = game.player; glow((p.x - this.cam.x) * S + this.W / 2, (p.y - this.cam.y) * S + this.H / 2 - S * 0.3, S * 2.4, dark * 0.45);
        g.globalCompositeOperation = 'source-over';
      }
    }
    this.drawFog(g, game, ox, oy, S);
    if (ui.box) { const b = ui.box; g.fillStyle = 'rgba(255,210,90,0.12)'; g.strokeStyle = 'rgba(255,210,90,0.9)'; g.lineWidth = 1.5; g.fillRect(b.x, b.y, b.w, b.h); g.strokeRect(b.x, b.y, b.w, b.h); }
  }
  // kleine Fähnchen an den Plätzen, die ausgewählte Soldaten halten sollen
  posts(g, game, sel, ox, oy, S, t) {
    const done = new Set();
    for (const s of game.soldiers) {
      if (!sel.has(s.id) || !s.post) continue;
      const k = s.post.y * 4096 + s.post.x;
      if (done.has(k)) continue;
      done.add(k);
      const X = ox + (s.post.x + 0.5) * S, Y = oy + (s.post.y + 0.75) * S;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(X, Y, S * 0.12, S * 0.05, 0, 0, 7); g.fill();
      g.strokeStyle = '#5a4030'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, Y); g.lineTo(X, Y - S * 0.42); g.stroke();
      g.fillStyle = '#ffd25a'; g.beginPath(); g.moveTo(X, Y - S * 0.42); g.lineTo(X + S * 0.2, Y - S * 0.34 + Math.sin(t * 4 + X) * 1.5); g.lineTo(X, Y - S * 0.26); g.fill();
    }
  }
  drawBorders(g, game, ox, oy, S, x0, x1, y0, y1) {
    const b = game.borders;
    if (!b) return;
    const seen = game.world.seen, W = game.world.w;
    g.lineWidth = 2; g.setLineDash([3, 4]);
    let last = -1;
    for (let i = 0; i < b.length; i += 4) {
      const x = b[i], y = b[i + 1];
      if (x < x0 || x > x1 || y < y0 || y > y1 || !seen[y * W + x]) continue;
      const o = b[i + 3];
      if (o !== last) {
        if (last !== -1) g.stroke();
        last = o;
        const tr = o >= 2 ? game.tribes[o - 2] : null;
        g.strokeStyle = tr ? tr.color : 'rgba(255,236,170,0.75)';
        g.beginPath();
      }
      const X = ox + x * S, Y = oy + y * S, inset = 3;
      switch (b[i + 2]) {
        case 0: g.moveTo(X + inset, Y + inset); g.lineTo(X + S - inset, Y + inset); break;
        case 1: g.moveTo(X + S - inset, Y + inset); g.lineTo(X + S - inset, Y + S - inset); break;
        case 2: g.moveTo(X + inset, Y + S - inset); g.lineTo(X + S - inset, Y + S - inset); break;
        default: g.moveTo(X + inset, Y + inset); g.lineTo(X + inset, Y + S - inset);
      }
    }
    if (last !== -1) g.stroke();
    g.setLineDash([]);
  }
  drawFog(g, game, ox, oy, S) {
    const w = game.world, F = 4;
    if (!this.fogSm || this.fogSm.width !== w.w + 2 || this.fogSm.height !== w.h + 2) {
      this.fogSm = document.createElement('canvas'); this.fogSm.width = w.w + 2; this.fogSm.height = w.h + 2;
      this.fogBig = document.createElement('canvas'); this.fogBig.width = (w.w + 2) * F; this.fogBig.height = (w.h + 2) * F;
      this.fogKey = null;
    }
    const key = game.fogVer + ':' + game.seed;
    if (this.fogKey !== key || this.fogWorld !== w) {
      const W2 = w.w + 2, H2 = w.h + 2, fc = this.fogSm.getContext('2d'), img = fc.createImageData(W2, H2), d = img.data;
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        const i4 = (y * W2 + x) * 4, inside = x > 0 && y > 0 && x <= w.w && y <= w.h;
        d[i4] = C.fog[0]; d[i4 + 1] = C.fog[1]; d[i4 + 2] = C.fog[2];
        d[i4 + 3] = inside && w.seen[(y - 1) * w.w + x - 1] ? 0 : 255;
      }
      fc.putImageData(img, 0, 0);
      const bg = this.fogBig.getContext('2d');
      bg.clearRect(0, 0, this.fogBig.width, this.fogBig.height);
      bg.imageSmoothingEnabled = true;
      bg.filter = 'blur(3px)';
      bg.drawImage(this.fogSm, 0, 0, this.fogBig.width, this.fogBig.height);
      bg.filter = 'none';
      this.fogKey = key; this.fogWorld = w;
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogBig, ox - S, oy - S, (w.w + 2) * S, (w.h + 2) * S);
  }
  /* ---------- Minikarte ---------- */
  drawMini(game, dt) {
    this.miniT -= dt;
    if (this.miniT > 0) return;
    this.miniT = 0.4;
    const w = game.world, m = this.mctx, s = game.season;
    const sx = this.mini.width / w.w, sy = this.mini.height / w.h;
    const key = [s, game.day, game.fogVer, game.landVer, w.w, w.h, game.seed].join(':');
    this.miniCount = (this.miniCount || 0) + 1;
    if (this.miniKey !== key || this.miniCount % 10 === 0) {
      const img = m.createImageData(w.w, w.h);
      const col = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const pal = {
        [G.GRASS]: col(SEASON.grass[s]), [G.MEADOW]: col(SEASON.meadow[s]), [G.FOREST]: col(SEASON.forest[s]), [G.SAND]: col(SEASON.sand[s]), [G.WATER]: col(SEASON.water[s]), [G.DEEP]: col(SEASON.deep[s]),
        [G.MOUNTAIN]: col('#80828a'), [G.BRIDGE]: col('#a0703c'), [G.PATH]: col('#cbb48c'), [G.SOIL]: col('#8b5e34'), [G.DIRT]: col('#b48a5c'),
      };
      const tree = col(s === 3 ? '#8a9a8a' : '#2f6b3a'), rock = col('#9aa0a8'), chest = col('#f2b84b');
      for (let k = 0; k < w.w * w.h; k++) {
        const o = w.obj[k], i4 = k * 4;
        if (!w.seen[k]) { img.data[i4] = 12; img.data[i4 + 1] = 17; img.data[i4 + 2] = 14; img.data[i4 + 3] = 255; continue; }
        const c = o && o.t === 'tree' ? tree : o && o.t === 'rock' ? rock : o && o.t === 'chest' ? chest : pal[w.ground[k]] || [0, 0, 0];
        const mine = w.land[k] === 1 ? 0.14 : 0;
        img.data[i4] = c[0] + (255 - c[0]) * mine; img.data[i4 + 1] = c[1] + (240 - c[1]) * mine; img.data[i4 + 2] = c[2] + (190 - c[2]) * mine; img.data[i4 + 3] = 255;
      }
      if (!this.miniBuf || this.miniBuf.width !== w.w || this.miniBuf.height !== w.h) { this.miniBuf = document.createElement('canvas'); this.miniBuf.width = w.w; this.miniBuf.height = w.h; }
      this.miniBuf.getContext('2d').putImageData(img, 0, 0);
      this.miniKey = key;
    }
    m.imageSmoothingEnabled = false;
    m.drawImage(this.miniBuf, 0, 0, this.mini.width, this.mini.height);
    for (const b of game.buildings) { m.fillStyle = b.built ? BUILDINGS[b.type].roof || '#cbb48c' : '#e8c27a'; m.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy); }
    for (const tr of game.tribes) {
      if (tr.defeated || !w.seen[w.i(tr.cx, tr.cy)]) continue;
      m.fillStyle = tr.color; m.fillRect((tr.hall.x - 0.5) * sx, (tr.hall.y - 0.5) * sy, 4 * sx, 4 * sy);
      m.strokeStyle = 'rgba(0,0,0,0.6)'; m.lineWidth = 1; m.strokeRect((tr.hall.x - 0.5) * sx, (tr.hall.y - 0.5) * sy, 4 * sx, 4 * sy);
    }
    m.fillStyle = '#ffffff';
    for (const st of game.settlers) m.fillRect(st.x * sx - 1, st.y * sy - 1, 2, 2);
    m.fillStyle = '#9fd4ff';
    for (const so of game.soldiers) if (so.state !== 'garrison') m.fillRect(so.x * sx - 1.5, so.y * sy - 1.5, 3, 3);
    m.fillStyle = '#ffd25a';
    for (const sh of game.ships || []) m.fillRect(sh.x * sx - 2, sh.y * sy - 2, 4, 4);
    const blink = Math.floor(performance.now() / 300) % 2;
    for (const f of game.foes) { const tr = game.tribes[f.tribe]; m.fillStyle = f.mode === 'raid' && blink ? '#ffffff' : tr.color; m.fillRect(f.x * sx - 1.5, f.y * sy - 1.5, 3, 3); }
    m.fillStyle = '#ff3b30'; m.beginPath(); m.arc(game.player.x * sx, game.player.y * sy, 3, 0, 7); m.fill();
    m.strokeStyle = 'rgba(255,255,255,0.85)'; m.lineWidth = 1;
    const vw = this.W / this.S, vh = this.H / this.S;
    m.strokeRect((this.cam.x - vw / 2) * sx, (this.cam.y - vh / 2) * sy, vw * sx, vh * sy);
  }
}
