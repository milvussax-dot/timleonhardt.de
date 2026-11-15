// Karte: Zufall, Rauschen, Generator, Begehbarkeit und Wegsuche
import { MAP_W, MAP_H, G, BLOCK_GROUND, BLOCK_OBJ, FREE_GROUND } from './data.js?v=5';

export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Wert pro Feld, immer gleich für dieselbe Position (für Grafik-Variation)
export function cellRand(x, y, salt = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function makeNoise(seed) {
  const lat = (ix, iy) => cellRand(ix, iy, seed);
  const sm = (t) => t * t * (3 - 2 * t);
  const value = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = lat(ix, iy), b = lat(ix + 1, iy), c = lat(ix, iy + 1), d = lat(ix + 1, iy + 1);
    const u = sm(fx), v = sm(fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, oct = 4) => { let s = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += amp * value(x * f, y * f); n += amp; amp *= 0.5; f *= 2; } return s / n; };
}

export class World {
  constructor(w = MAP_W, h = MAP_H) {
    this.w = w; this.h = h;
    this.ground = new Uint8Array(w * h);
    this.wet = new Uint8Array(w * h);
    this.obj = new Array(w * h).fill(null);
    this.bld = new Int16Array(w * h).fill(-1);
    this.tstruct = new Int16Array(w * h).fill(-1);   // Hütten und Lager fremder Stämme
    this.seen = new Uint8Array(w * h);                // schon erkundet
    this.land = new Uint8Array(w * h);                // 0 frei, 1 dein Land, 2+i Land von Stamm i
    this.dirty = new Set();        // Kacheln (Chunks), die neu gezeichnet werden müssen
  }
  i(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  g(x, y) { return this.inb(x, y) ? this.ground[y * this.w + x] : G.MOUNTAIN; }
  o(x, y) { return this.inb(x, y) ? this.obj[y * this.w + x] : null; }
  walkable(x, y) {
    if (!this.inb(x, y)) return false;
    const k = y * this.w + x;
    if (BLOCK_GROUND.has(this.ground[k]) || this.bld[k] >= 0 || this.tstruct[k] >= 0) return false;
    const o = this.obj[k];
    return !(o && BLOCK_OBJ.has(o.t));
  }
  isFree(x, y) {   // freier Boden ohne Objekt und Gebäude
    if (!this.inb(x, y)) return false;
    const k = y * this.w + x;
    return FREE_GROUND.has(this.ground[k]) && !this.obj[k] && this.bld[k] < 0 && this.tstruct[k] < 0;
  }
  setGround(x, y, g) { this.ground[y * this.w + x] = g; this.touch(x, y); }
  touch(x, y) { this.dirty.add(((y >> 4) << 8) | (x >> 4)); }
  touchAll() { for (let y = 0; y < this.h; y += 16) for (let x = 0; x < this.w; x += 16) this.touch(x, y); }
  nearWater(x, y, r) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const g = this.g(x + dx, y + dy);
      if (g === G.WATER || g === G.DEEP) return true;
    }
    return false;
  }
  isWater(x, y) { const g = this.g(x, y); return g === G.WATER || g === G.DEEP; }
}

/* ---------- Generator ---------- */
export function generate(seedStr) {
  const seed = hash(seedStr);
  const rnd = mulberry(seed);
  const W = MAP_W, H = MAP_H, w = new World(W, H);
  const elevN = makeNoise(seed % 100000), moistN = makeNoise((seed >>> 7) % 100000 + 17), detailN = makeNoise((seed >>> 13) % 100000 + 91);
  const elev = new Float32Array(W * H), moist = new Float32Array(W * H);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x / (W - 1)) * 2 - 1, ny = (y / (H - 1)) * 2 - 1;
    const edge = Math.max(0, Math.sqrt(nx * nx * 0.9 + ny * ny * 1.1) - 0.55);
    const e = elevN(x * 0.07, y * 0.07, 4) * 0.75 + edge * edge * 3.2 + detailN(x * 0.2, y * 0.2, 2) * 0.12;
    elev[y * W + x] = e;
    moist[y * W + x] = moistN(x * 0.08 + 40, y * 0.08 + 40, 3);
  }
  for (let k = 0; k < W * H; k++) {
    const e = elev[k], m = moist[k];
    let g = G.GRASS;
    if (e > 0.86) g = G.MOUNTAIN;
    else if (m > 0.6) g = G.FOREST;
    else if (m < 0.36) g = G.MEADOW;
    w.ground[k] = g;
  }

  // Fluss: von oben nach unten, schlängelnd, schneidet auch durch die Berge
  let rx = Math.floor(W * (0.52 + (rnd() - 0.5) * 0.18));
  const riverX = new Int16Array(H);
  for (let y = 0; y < H; y++) {
    rx += Math.round((elevN(y * 0.11, 3.7, 2) - 0.5) * 3 + (rnd() - 0.5) * 1.2);
    rx = Math.max(Math.floor(W * 0.35), Math.min(Math.floor(W * 0.68), rx));
    riverX[y] = rx;
    const width = 2 + (elevN(y * 0.05, 9.1, 2) > 0.55 ? 1 : 0);
    for (let dx = -width; dx <= width; dx++) {
      const x = rx + dx;
      if (!w.inb(x, y)) continue;
      w.ground[y * W + x] = Math.abs(dx) <= width - 2 ? G.DEEP : G.WATER;
    }
  }
  // Startplatz: offenes Gelände nahe der Mitte, links oder rechts vom Fluss
  const side = rnd() < 0.5 ? -1 : 1;
  let start = null, bestScore = -1;
  for (let t = 0; t < 600; t++) {
    const y = Math.floor(H * 0.3 + rnd() * H * 0.4);
    const x = riverX[y] + side * (8 + Math.floor(rnd() * 10));
    if (!w.inb(x - 6, y - 6) || !w.inb(x + 6, y + 6)) continue;
    let ok = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const g = w.g(x + dx, y + dy);
      if (g === G.GRASS || g === G.MEADOW || g === G.FOREST) ok++;
    }
    if (ok > bestScore) { bestScore = ok; start = { x, y }; }
  }
  // Großer See mit einer Insel, abseits des Flusses
  let best = null, island = null;
  for (let t = 0; t < 400; t++) {
    const x = 16 + Math.floor(rnd() * (W - 32)), y = 14 + Math.floor(rnd() * (H - 28));
    if (Math.abs(x - riverX[y]) < 20 || Math.hypot(x - start.x, y - start.y) < 34) continue;
    const e = elev[y * W + x];
    if (e < 0.75 && (!best || e < best.e)) best = { x, y, e };
  }
  if (best) {
    const R = 8 + rnd() * 2.5, IR = 3.4;
    for (let dy = -14; dy <= 14; dy++) for (let dx = -16; dx <= 16; dx++) {
      const x = best.x + dx, y = best.y + dy;
      if (!w.inb(x, y)) continue;
      const wob = (detailN(x * 0.35, y * 0.35, 2) - 0.5) * 2.6;
      const d = Math.sqrt(dx * dx * 0.75 + dy * dy) + wob;
      const di = Math.sqrt(dx * dx * 0.75 + dy * dy) + wob * 0.4;
      if (di < IR) { w.ground[y * W + x] = G.MEADOW; continue; }
      if (d < R - 1.6) w.ground[y * W + x] = G.DEEP;
      else if (d < R) w.ground[y * W + x] = G.WATER;
    }
    island = { x: best.x, y: best.y };
  }
  // Strand an Wasserrändern
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (w.ground[k] === G.MOUNTAIN || w.isWater(x, y)) continue;
    let nearW = false;
    for (let d = 0; d < 4 && !nearW; d++) { const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][d]; if (w.isWater(x + dx, y + dy)) nearW = true; }
    if (nearW && rnd() < 0.7) w.ground[k] = G.SAND;
  }
  // Brücken über den Fluss: dort, wo beide Ufer begehbar sind
  const bridgeRows = [];
  for (let tries = 0; tries < 400 && bridgeRows.length < 3; tries++) {
    const y = 6 + Math.floor(rnd() * (H - 12));
    if (bridgeRows.some((r) => Math.abs(r - y) < 12)) continue;
    let x0 = riverX[y], x1 = riverX[y];
    while (w.isWater(x0 - 1, y)) x0--;
    while (w.isWater(x1 + 1, y)) x1++;
    const left = w.g(x0 - 1, y), right = w.g(x1 + 1, y);
    if (left === G.MOUNTAIN || right === G.MOUNTAIN || x1 - x0 > 6) continue;
    for (let x = x0; x <= x1; x++) w.ground[y * W + x] = G.BRIDGE;
    bridgeRows.push(y);
  }

  // Objekte: Wälder, Felsen, Beerensträucher
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, g = w.ground[k], e = elev[k], r = rnd();
    if (g === G.FOREST && r < 0.55) w.obj[k] = { t: 'tree', kind: e > 0.62 || rnd() < 0.3 ? 'pine' : 'oak', age: 9 };
    else if ((g === G.GRASS || g === G.MEADOW) && r < 0.035) w.obj[k] = { t: 'tree', kind: rnd() < 0.7 ? 'oak' : 'pine', age: 9 };
    else if (g !== G.SAND && g !== G.BRIDGE && !w.isWater(x, y) && g !== G.MOUNTAIN) {
      const nearMountain = e > 0.7;
      if (r > 1 - (nearMountain ? 0.1 : 0.012)) w.obj[k] = { t: 'rock', size: rnd() < 0.3 ? 2 : 1 };
      else if (g === G.MEADOW && r > 0.955 && r < 0.98) w.obj[k] = { t: 'bush', berries: true, regrow: 0 };
    }
  }

  // Lichtung freiräumen
  for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) {
    const x = start.x + dx, y = start.y + dy;
    if (!w.inb(x, y)) continue;
    const k = y * W + x;
    if (dx * dx / 40 + dy * dy / 28 > 1) continue;
    if (w.ground[k] === G.MOUNTAIN || w.isWater(x, y)) continue;
    if (w.ground[k] === G.FOREST) w.ground[k] = G.GRASS;
    w.obj[k] = null;
  }
  // in jedem Tal ein paar Felsen und Beerensträucher in Laufweite des Starts
  const sprinkle = (want, rMin, rMax, make) => {
    let n = 0;
    for (let t = 0; t < 400 && n < want; t++) {
      const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
      const x = Math.round(start.x + Math.cos(a) * r), y = Math.round(start.y + Math.sin(a) * r * 0.8);
      if (!w.isFree(x, y)) continue;
      w.obj[y * W + x] = make(); n++;
    }
  };
  sprinkle(7, 7, 13, () => ({ t: 'rock', size: 2 }));
  sprinkle(4, 6, 12, () => ({ t: 'bush', berries: true, regrow: 0 }));
  // Lagerplätze fremder Stämme: drei an Land, einer auf der Insel
  const sites = pickTribeSites(w, start, rnd, 3);
  if (island) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = island.x + dx, y = island.y + dy; if (w.inb(x, y) && !w.isWater(x, y)) w.obj[w.i(x, y)] = null; }
    sites.push({ x: island.x, y: island.y, island: true });
  }
  if (island) for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2], [3, 0], [-3, 0]]) {
    const x = island.x + dx, y = island.y + dy;
    if (w.inb(x, y) && !w.isWater(x, y) && !w.obj[w.i(x, y)] && Math.abs(dx) + Math.abs(dy) >= 3) { w.obj[w.i(x, y)] = { t: 'chest' }; break; }
  }
  sprinkleChests(w, rnd, [{ x: start.x, y: start.y, r: 16 }, ...sites.map((p) => ({ x: p.x, y: p.y, r: 7 }))], 14);
  w.touchAll();
  return { world: w, start, riverX, sites };
}

// Freie, per Land erreichbare Plätze für Stammeslager, weit weg vom Start und voneinander
export function pickTribeSites(w, start, rnd, n, avoid = []) {
  const sites = [];
  const okArea = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!w.inb(x, y)) return false;
      const k = w.i(x, y), g = w.ground[k];
      if (g === G.MOUNTAIN || g === G.BRIDGE || w.isWater(x, y) || w.bld[k] >= 0 || w.tstruct[k] >= 0) return false;
    }
    return true;
  };
  const minStart = Math.max(26, Math.round((w.w + w.h) * 0.2));
  for (let t = 0; t < 3000 && sites.length < n; t++) {
    const x = 6 + Math.floor(rnd() * (w.w - 12)), y = 6 + Math.floor(rnd() * (w.h - 12));
    if (Math.abs(x - start.x) + Math.abs(y - start.y) < minStart) continue;
    if (sites.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 24)) continue;
    if (avoid.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 16)) continue;
    if (!okArea(x, y)) continue;
    if (!findPath(w, start.x, start.y, (xx, yy) => Math.abs(xx - x) <= 4 && Math.abs(yy - y) <= 4, x, y, 40000)) continue;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const xx = x + dx, yy = y + dy; if (w.inb(xx, yy) && !w.isWater(xx, yy)) { const k = w.i(xx, yy); if (w.obj[k]) w.obj[k] = null; if (w.ground[k] === G.FOREST) w.ground[k] = G.GRASS; } }
    sites.push({ x, y });
  }
  return sites;
}
// Schatztruhen auf freiem Land, nicht zu nah an den Punkten in avoid
export function sprinkleChests(w, rnd, avoid, n) {
  let placed = 0;
  for (let t = 0; t < 5000 && placed < n; t++) {
    const x = 2 + Math.floor(rnd() * (w.w - 4)), y = 2 + Math.floor(rnd() * (w.h - 4));
    if (!w.isFree(x, y)) continue;
    if (avoid.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < (p.r || 14))) continue;
    if (placed && avoid.length && rnd() < 0.2) continue;
    w.obj[w.i(x, y)] = { t: 'chest' };
    placed++;
  }
  return placed;
}

/* ---------- Wegsuche (A*, 8 Richtungen, keine Ecken abschneiden) ---------- */
class Heap {
  constructor() { this.a = []; this.f = []; }
  push(v, f) {
    const a = this.a, fs = this.f; a.push(v); fs.push(f);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (fs[p] <= fs[i]) break; [a[p], a[i]] = [a[i], a[p]]; [fs[p], fs[i]] = [fs[i], fs[p]]; i = p; }
  }
  pop() {
    const a = this.a, fs = this.f, top = a[0], last = a.pop(), lf = fs.pop();
    if (a.length) {
      a[0] = last; fs[0] = lf;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && fs[l] < fs[m]) m = l;
        if (r < a.length && fs[r] < fs[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [fs[m], fs[i]] = [fs[i], fs[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}
const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
let POOL = null;
function pool(N) {
  if (!POOL || POOL.N !== N) POOL = { N, gs: new Float32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0 };
  if (++POOL.gen > 0xfffffff0) { POOL.stamp.fill(0); POOL.closed.fill(0); POOL.gen = 1; }
  return POOL;
}

// goal(x, y) → true am Ziel. (hx, hy) ist die Richtung für die Schätzung.
export function findPath(w, sx, sy, goal, hx, hy, maxNodes = 8000, pass = null) {
  const W = w.w, N = w.w * w.h;
  const ok = pass || ((x, y) => w.walkable(x, y));
  if (!w.inb(sx, sy)) return null;
  const P = pool(N), gen = P.gen, gs = P.gs, came = P.came, stamp = P.stamp, closed = P.closed;
  const h = (x, y) => { const dx = Math.abs(x - hx), dy = Math.abs(y - hy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const s = sy * W + sx;
  gs[s] = 0; stamp[s] = gen; came[s] = -1;
  const open = new Heap();
  open.push(s, h(sx, sy));
  let n = 0;
  while (open.size && n++ < maxNodes) {
    const c = open.pop();
    if (closed[c] === gen) continue;
    closed[c] = gen;
    const cx = c % W, cy = (c / W) | 0;
    if (goal(cx, cy)) {
      const path = [];
      let k = c;
      while (k !== s) { path.push({ x: k % W, y: (k / W) | 0 }); k = came[k]; }
      return path.reverse();
    }
    for (const [dx, dy, cost] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (!ok(nx, ny)) continue;
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
      const nk = ny * W + nx;
      if (closed[nk] === gen) continue;
      const gk = w.ground[nk];
      const tileCost = gk === G.PATH || gk === G.BRIDGE ? 0.6 : gk === G.WATER || gk === G.DEEP ? 1.6 : 1;
      const ng = gs[c] + cost * tileCost;
      if (stamp[nk] !== gen || ng < gs[nk]) { gs[nk] = ng; stamp[nk] = gen; came[nk] = c; open.push(nk, ng + h(nx, ny) * 0.6); }
    }
  }
  return null;
}
// Ziel: ein begehbares Feld direkt neben (tx, ty)
export const nextTo = (tx, ty) => (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) === 1;
// Ziel: ein Feld direkt neben einem Rechteck (Gebäude)
export const nextToRect = (bx, by, bw, bh) => (x, y) => x >= bx - 1 && x <= bx + bw && y >= by - 1 && y <= by + bh && !(x >= bx && x < bx + bw && y >= by && y < by + bh);
