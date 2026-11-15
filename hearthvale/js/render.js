// Grafik: Boden-Kacheln, Objekte, Gebäude, Figuren, Licht, Wetter, Minikarte
import { G, TILE, BUILDINGS, CROPS, ITEMS } from './data.js';
import { cellRand } from './world.js';

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
const C = { dirt: '#b48a5c', path: '#cbb48c', soil: '#8b5e34', soilWet: '#5c3b20', mountain: '#80828a', mountainDark: '#5f6168', plank: '#a0703c', trunk: '#7a5230', wall: '#efe2c8', stoneWall: '#b9b3a7', door: '#6b4228', glow: 'rgba(255,214,120,0.95)' };

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
    const k = Math.min(1, dt * 6);
    this.cam.x += (p.x - this.cam.x) * k; this.cam.y += (p.y - this.cam.y) * k;
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
    if (!ch || w.dirty.has(key)) {
      if (!ch) { ch = document.createElement('canvas'); ch.width = ch.height = 16 * TILE; this.chunks.set(key, ch); }
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
    const stone = b.type === 'quarry' || b.type === 'mill' || b.type === 'bakery';
    const wallC = stone ? C.stoneWall : C.wall;
    const bx = X + S * 0.14, bw = Wd - S * 0.28, by = Y + Ht * 0.42, bh = Ht * 0.52;
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
    g.fillStyle = shade(wallC, -0.12); g.fillRect(bx, by + bh - 4, bw, 4);
    g.fillStyle = def.roof; g.beginPath(); g.moveTo(X + S * 0.04, by + 4); g.lineTo(X + Wd / 2, Y + S * 0.08); g.lineTo(X + Wd - S * 0.04, by + 4); g.closePath(); g.fill();
    g.fillStyle = shade(def.roof, -0.25); g.fillRect(X + S * 0.04, by, Wd - S * 0.08, 5);
    g.fillStyle = C.door; g.fillRect(X + Wd / 2 - S * 0.16, by + bh - Ht * 0.3, S * 0.32, Ht * 0.3);
    const night = game.hour >= 19;
    g.fillStyle = night ? C.glow : '#8fc4e0';
    g.fillRect(bx + bw * 0.12, by + bh * 0.25, S * 0.24, S * 0.22);
    g.fillRect(bx + bw * 0.88 - S * 0.24, by + bh * 0.25, S * 0.24, S * 0.22);
    b._windows = [[bx + bw * 0.12 + S * 0.12, by + bh * 0.36], [bx + bw * 0.88 - S * 0.12, by + bh * 0.36]];
    // Details je Gebäudeart
    const prop = (fn) => { g.save(); fn(); g.restore(); };
    if (b.type === 'house' || b.type === 'hut' || b.type === 'bakery') {
      g.fillStyle = '#7a6a5a'; g.fillRect(X + Wd * 0.68, Y + S * 0.18, S * 0.18, S * 0.42);
      const smoking = b.type === 'bakery' ? b.worker != null : night || game.season === 3;
      if (smoking) for (let i = 0; i < 3; i++) { const ph = (t * 0.6 + i / 3) % 1; g.fillStyle = `rgba(230,230,230,${0.5 * (1 - ph)})`; g.beginPath(); g.arc(X + Wd * 0.77 + Math.sin(ph * 6 + i) * 3, Y + S * 0.12 - ph * S * 0.8, 3 + ph * 5, 0, 7); g.fill(); }
    }
    if (b.type === 'storage') prop(() => { for (const [dx, c] of [[-0.05, '#b07a42'], [0.18, '#9a6a3a']]) { g.fillStyle = c; g.fillRect(X + Wd + S * dx - S * 0.4, Y + Ht * 0.7, S * 0.3, S * 0.3); g.strokeStyle = '#6b4228'; g.strokeRect(X + Wd + S * dx - S * 0.4, Y + Ht * 0.7, S * 0.3, S * 0.3); } });
    if (b.type === 'woodcutter' || b.type === 'sawmill') prop(() => { g.fillStyle = '#8a5a30'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(X - S * 0.02, Y + Ht * 0.92 - i * S * 0.13, S * 0.2, S * 0.07, 0, 0, 7); g.fill(); g.fillStyle = '#c9a06a'; g.beginPath(); g.arc(X - S * 0.2, Y + Ht * 0.92 - i * S * 0.13, S * 0.06, 0, 7); g.fill(); g.fillStyle = '#8a5a30'; } });
    if (b.type === 'sawmill') prop(() => { const ang = b.worker != null ? t * 6 : 0; g.translate(X + Wd - S * 0.1, Y + Ht * 0.78); g.rotate(ang); g.fillStyle = '#c8ccd2'; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r = i % 2 ? S * 0.18 : S * 0.24; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
    if (b.type === 'quarry') prop(() => { g.fillStyle = '#9aa0a8'; g.fillRect(X - S * 0.15, Y + Ht * 0.72, S * 0.3, S * 0.22); g.fillStyle = '#b8bec6'; g.fillRect(X - S * 0.02, Y + Ht * 0.6, S * 0.26, S * 0.18); });
    if (b.type === 'fisher') prop(() => { g.strokeStyle = '#6b4a2b'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + Wd, Y + Ht * 0.9); g.lineTo(X + Wd + S * 0.2, Y + Ht * 0.35); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(X + Wd - S * 0.25 + i * 5, Y + Ht * 0.55); g.lineTo(X + Wd - S * 0.25 + i * 5, Y + Ht * 0.85); g.stroke(); } });
    if (b.type === 'farm') prop(() => { g.fillStyle = '#e3c25a'; g.beginPath(); g.ellipse(X - S * 0.05, Y + Ht * 0.85, S * 0.22, S * 0.16, 0, 0, 7); g.fill(); g.strokeStyle = '#c9a03a'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - S * 0.25, Y + Ht * 0.85); g.lineTo(X + S * 0.15, Y + Ht * 0.85); g.stroke(); });
    if (b.type === 'forester') prop(() => { g.fillStyle = '#3f8a3a'; g.beginPath(); g.moveTo(X - S * 0.2, Y + Ht * 0.92); g.lineTo(X - S * 0.05, Y + Ht * 0.55); g.lineTo(X + S * 0.1, Y + Ht * 0.92); g.fill(); });
    if (BUILDINGS[b.type].job && b.worker == null) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(X + Wd - S * 0.2, Y + S * 0.25, S * 0.2, 0, 7); g.fill(); g.fillStyle = '#ffd25a'; g.font = `700 ${Math.round(S * 0.3)}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', X + Wd - S * 0.2, Y + S * 0.26); }
  }

  /* ---------- Figuren ---------- */
  person(g, e, S, opts) {
    const x = (e.x - this.cam.x) * S + this.W / 2, y = (e.y - this.cam.y) * S + this.H / 2;
    const sc = opts.player ? 1.15 : 0.9, bob = e.moving || e.state === 'walk' ? Math.abs(Math.sin(e.walkT || 0)) * 2 : 0;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x, y + S * 0.22, S * 0.2 * sc, S * 0.07 * sc, 0, 0, 7); g.fill();
    const by = y - bob;
    g.fillStyle = opts.shirt; g.beginPath(); g.roundRect ? g.roundRect(x - S * 0.15 * sc, by - S * 0.2 * sc, S * 0.3 * sc, S * 0.38 * sc, S * 0.08) : g.rect(x - S * 0.15 * sc, by - S * 0.2 * sc, S * 0.3 * sc, S * 0.38 * sc); g.fill();
    if (opts.player) { g.fillStyle = '#7a5230'; g.fillRect(x - S * 0.13 * sc + (e.facing === 1 ? -S * 0.08 : e.facing === 3 ? S * 0.08 : 0), by - S * 0.16 * sc, S * 0.26 * sc, S * 0.2 * sc); g.fillStyle = opts.shirt; g.fillRect(x - S * 0.12 * sc, by - S * 0.18 * sc, S * 0.24 * sc, S * 0.12 * sc); }
    g.fillStyle = '#f1c9a0'; g.beginPath(); g.arc(x, by - S * 0.3 * sc, S * 0.13 * sc, 0, 7); g.fill();
    if (opts.hat) { g.fillStyle = opts.hat; g.beginPath(); g.ellipse(x, by - S * 0.39 * sc, S * 0.17 * sc, S * 0.06 * sc, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x, by - S * 0.41 * sc, S * 0.1 * sc, Math.PI, 0); g.fill(); }
    if (e.facing !== 0) { g.fillStyle = '#3a2a1a'; const fx = e.facing === 1 ? 0.05 : e.facing === 3 ? -0.05 : 0; g.fillRect(x + S * (fx - 0.05) * sc, by - S * 0.31 * sc, 2, 2); g.fillRect(x + S * (fx + 0.04) * sc, by - S * 0.31 * sc, 2, 2); }
    if (opts.carry) { g.fillStyle = ITEMS[opts.carry].color; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.fillRect(x - S * 0.1, by - S * 0.66 * sc, S * 0.2, S * 0.16); g.strokeRect(x - S * 0.1, by - S * 0.66 * sc, S * 0.2, S * 0.16); }
    if (opts.working) { const a = Math.sin(opts.t * 12) * 0.8; g.strokeStyle = '#5a4a3a'; g.lineWidth = 2.5; g.beginPath(); const hx = x + S * 0.16, hy = by - S * 0.1; g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a - 1) * S * 0.26, hy + Math.sin(a - 1) * S * 0.26); g.stroke(); }
    if (opts.progress != null) { g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4; g.beginPath(); g.arc(x, by - S * 0.85, S * 0.14, 0, 7); g.stroke(); g.strokeStyle = '#ffd25a'; g.beginPath(); g.arc(x, by - S * 0.85, S * 0.14, -Math.PI / 2, -Math.PI / 2 + opts.progress * Math.PI * 2); g.stroke(); }
    return { x, y: by };
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
    list.sort((a, c) => a.y - c.y);
    for (const d of list) {
      if (d.k === 'o') {
        const X = ox + d.x * S, Y = oy + d.ty * S;
        if (d.o.t === 'tree') this.tree(g, d.o, X, Y, S, season, t);
        else if (d.o.t === 'rock') this.rock(g, d.o, X, Y, S, season);
        else if (d.o.t === 'bush') this.bush(g, d.o, X, Y, S, season);
      } else if (d.k === 'b') this.building(g, d.b, ox + d.b.x * S, oy + d.b.y * S, S, t, game);
      else if (d.k === 's') {
        const s = d.s, job = s.job != null ? game.byId(s.job) : null;
        const hat = job ? BUILDINGS[job.type].hat : (s.task && s.task.site != null ? '#e8a23a' : null);
        this.person(g, s, S, { shirt: '#5b7fa6', hat: hat || s.hat, carry: s.carry && s.carry.item, working: s.state === 'working' || s.state === 'building', t });
      } else {
        const p = game.player;
        this.person(g, p, S, { player: true, shirt: '#c0392b', hat: '#6b4a2b', working: !!p.action, progress: p.action ? p.action.t / p.action.total : null, t });
      }
    }
    // Hover und Bau-Vorschau
    if (ui.ghost) {
      const gh = ui.ghost, def = BUILDINGS[gh.type];
      g.fillStyle = gh.ok ? 'rgba(120,230,120,0.35)' : 'rgba(240,90,90,0.35)'; g.strokeStyle = gh.ok ? '#7ee07e' : '#f06060'; g.lineWidth = 2;
      g.fillRect(ox + gh.x * S, oy + gh.y * S, def.w * S, def.h * S); g.strokeRect(ox + gh.x * S, oy + gh.y * S, def.w * S, def.h * S);
      if (def.radius) { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.setLineDash([6, 6]); g.beginPath(); g.arc(ox + (gh.x + 1) * S, oy + (gh.y + 1) * S, def.radius * S, 0, 7); g.stroke(); g.setLineDash([]); }
    } else if (ui.hover) {
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.strokeRect(ox + ui.hover.x * S + 1, oy + ui.hover.y * S + 1, S - 2, S - 2);
    }
    if (ui.selected && BUILDINGS[ui.selected.type].radius) { const b = ui.selected; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.arc(ox + (b.x + 1) * S, oy + (b.y + 1) * S, BUILDINGS[b.type].radius * S, 0, 7); g.stroke(); g.setLineDash([]); }
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
        const p = game.player; glow((p.x - this.cam.x) * S + this.W / 2, (p.y - this.cam.y) * S + this.H / 2 - S * 0.3, S * 2.4, dark * 0.45);
        g.globalCompositeOperation = 'source-over';
      }
    }
  }
  weatherFx(g, kind, t) {
    const n = kind === 'rain' ? 140 : 90;
    if (this.rain.length !== n) this.rain = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
    g.strokeStyle = 'rgba(200,220,255,0.5)'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
    for (const d of this.rain) {
      if (kind === 'rain') { d.y += 0.02 * d.s; d.x -= 0.004 * d.s; } else { d.y += 0.004 * d.s; d.x += Math.sin(t + d.s * 10) * 0.0008; }
      if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
      if (d.x < 0) d.x += 1;
      const X = d.x * this.W, Y = d.y * this.H;
      if (kind === 'rain') { g.beginPath(); g.moveTo(X, Y); g.lineTo(X - 3, Y + 10); g.stroke(); } else { g.beginPath(); g.arc(X, Y, 1.6 * d.s, 0, 7); g.fill(); }
    }
  }

  /* ---------- Minikarte ---------- */
  drawMini(game, dt) {
    this.miniT -= dt;
    if (this.miniT > 0) return;
    this.miniT = 0.4;
    const w = game.world, m = this.mctx, s = game.season;
    const sx = this.mini.width / w.w, sy = this.mini.height / w.h;
    if (!this.miniImg || this.miniSeason !== s || this.miniDay !== game.day || (this.miniCount = (this.miniCount || 0) + 1) % 10 === 0) {
      const img = m.createImageData(w.w, w.h);
      const col = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const pal = {
        [G.GRASS]: col(SEASON.grass[s]), [G.MEADOW]: col(SEASON.meadow[s]), [G.FOREST]: col(SEASON.forest[s]), [G.SAND]: col(SEASON.sand[s]), [G.WATER]: col(SEASON.water[s]), [G.DEEP]: col(SEASON.deep[s]),
        [G.MOUNTAIN]: col('#80828a'), [G.BRIDGE]: col('#a0703c'), [G.PATH]: col('#cbb48c'), [G.SOIL]: col('#8b5e34'), [G.DIRT]: col('#b48a5c'),
      };
      const tree = col(s === 3 ? '#8a9a8a' : '#2f6b3a'), rock = col('#9aa0a8');
      for (let k = 0; k < w.w * w.h; k++) {
        const o = w.obj[k];
        const c = o && o.t === 'tree' ? tree : o && o.t === 'rock' ? rock : pal[w.ground[k]] || [0, 0, 0];
        img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = 255;
      }
      if (!this.miniBuf) { this.miniBuf = document.createElement('canvas'); this.miniBuf.width = w.w; this.miniBuf.height = w.h; }
      this.miniBuf.getContext('2d').putImageData(img, 0, 0);
      this.miniImg = true; this.miniSeason = s; this.miniDay = game.day;
    }
    m.imageSmoothingEnabled = false;
    m.drawImage(this.miniBuf, 0, 0, this.mini.width, this.mini.height);
    for (const b of game.buildings) { m.fillStyle = b.built ? BUILDINGS[b.type].roof || '#cbb48c' : '#e8c27a'; m.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy); }
    m.fillStyle = '#ffffff';
    for (const st of game.settlers) m.fillRect(st.x * sx - 1, st.y * sy - 1, 2, 2);
    m.fillStyle = '#ff3b30'; m.beginPath(); m.arc(game.player.x * sx, game.player.y * sy, 3, 0, 7); m.fill();
    m.strokeStyle = 'rgba(255,255,255,0.85)'; m.lineWidth = 1;
    const vw = this.W / this.S, vh = this.H / this.S;
    m.strokeRect((this.cam.x - vw / 2) * sx, (this.cam.y - vh / 2) * sy, vw * sx, vh * sy);
  }
}
