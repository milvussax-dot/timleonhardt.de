// Karte: Zufall, Rauschen, Generator, Begehbarkeit und Wegsuche
import { MAP_W, MAP_H, G, BLOCK_GROUND, BLOCK_OBJ, FREE_GROUND } from './data.js?v=14';

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
export function generate(seedStr, attempt = 0) {
  const seed = hash(attempt ? `${seedStr}~${attempt}` : seedStr);
  const rnd = mulberry(seed);
  const W = MAP_W, H = MAP_H, w = new World(W, H);
  const elevN = makeNoise(seed % 100000), moistN = makeNoise((seed >>> 7) % 100000 + 17), detailN = makeNoise((seed >>> 13) % 100000 + 91);
  const elev = new Float32Array(W * H), moist = new Float32Array(W * H);

  // Höhe: Bergmassive verteilt im Tal, kein Bergrand ringsum
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    elev[y * W + x] = elevN(x * 0.055, y * 0.055, 4) * 0.82 + detailN(x * 0.2, y * 0.2, 2) * 0.18;
    moist[y * W + x] = moistN(x * 0.07 + 40, y * 0.07 + 40, 3);
  }
  const sorted = Float32Array.from(elev).sort();
  const MOUNT = sorted[Math.floor(sorted.length * 0.925)], HILL = sorted[Math.floor(sorted.length * 0.84)];   // rund 7,5 % Berg
  for (let k = 0; k < W * H; k++) {
    const e = elev[k], m = moist[k];
    let g = G.GRASS;
    if (e >= MOUNT) g = G.MOUNTAIN;
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
  // Seen: ein großer mit Insel weit weg vom Start, dazu ein kleinerer
  const carve = (cx, cy, R, IR) => {
    for (let dy = -Math.ceil(R + 4); dy <= Math.ceil(R + 4); dy++) for (let dx = -Math.ceil(R * 1.2 + 4); dx <= Math.ceil(R * 1.2 + 4); dx++) {
      const x = cx + dx, y = cy + dy;
      if (!w.inb(x, y)) continue;
      const wob = (detailN(x * 0.35, y * 0.35, 2) - 0.5) * 2.6;
      const d = Math.sqrt(dx * dx * 0.75 + dy * dy) + wob;
      const di = Math.sqrt(dx * dx * 0.75 + dy * dy) + wob * 0.4;
      if (IR && di < IR) { w.ground[y * W + x] = G.MEADOW; continue; }
      if (d < R - 1.6) w.ground[y * W + x] = G.DEEP;
      else if (d < R) w.ground[y * W + x] = G.WATER;
    }
  };
  const lakeSpot = (minStart, avoid) => {
    let best = null;
    for (let t = 0; t < 500; t++) {
      const x = 18 + Math.floor(rnd() * (W - 36)), y = 16 + Math.floor(rnd() * (H - 32));
      if (Math.abs(x - riverX[y]) < 20 || Math.hypot(x - start.x, y - start.y) < minStart) continue;
      if (avoid.some((a) => Math.hypot(x - a.x, y - a.y) < 34)) continue;
      const e = elev[y * W + x];
      if (e < MOUNT && (!best || e < best.e)) best = { x, y, e };
    }
    return best;
  };
  let island = null;
  const lakes = [];
  const big = lakeSpot(45, lakes);
  if (big) { carve(big.x, big.y, 11 + rnd() * 3, 4.6); island = { x: big.x, y: big.y }; lakes.push(big); }
  const smallLakes = Math.max(1, Math.round(W * H / 25000));   // auf großen Karten mehr Seen
  for (let i = 0; i < smallLakes; i++) { const l = lakeSpot(22, lakes); if (!l) break; carve(l.x, l.y, 5 + rnd() * 3, 0); lakes.push(l); }
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
  const bridgeMax = Math.max(3, Math.round(H / 26));
  for (let tries = 0; tries < 900 && bridgeRows.length < bridgeMax; tries++) {
    const y = 6 + Math.floor(rnd() * (H - 12));
    if (bridgeRows.some((r) => Math.abs(r - y) < 16)) continue;
    let x0 = riverX[y], x1 = riverX[y];
    while (w.isWater(x0 - 1, y)) x0--;
    while (w.isWater(x1 + 1, y)) x1++;
    const left = w.g(x0 - 1, y), right = w.g(x1 + 1, y);
    if (left === G.MOUNTAIN || right === G.MOUNTAIN || x1 - x0 > 6) continue;
    for (let x = x0; x <= x1; x++) w.ground[y * W + x] = G.BRIDGE;
    bridgeRows.push(y);
  }

  // Abgeschnittene Landstücke (zwischen Bergen) bekommen einen Pass zum Hauptland, der Start immer
  connectLand(w, start);
  // liegt der Start trotzdem abgeschnitten (nur übers Wasser erreichbar), ein anderes Tal aus demselben Namen
  if (attempt < 4 && landShare(w, start) < 0.4) return generate(seedStr, attempt + 1);

  // Objekte: Wälder, Felsen, Beerensträucher
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, g = w.ground[k], e = elev[k], r = rnd();
    if (g === G.FOREST && r < 0.55) w.obj[k] = { t: 'tree', kind: e > HILL || rnd() < 0.3 ? 'pine' : 'oak', age: 9 };
    else if ((g === G.GRASS || g === G.MEADOW) && r < 0.035) w.obj[k] = { t: 'tree', kind: rnd() < 0.7 ? 'oak' : 'pine', age: 9 };
    else if (g !== G.SAND && g !== G.BRIDGE && !w.isWater(x, y) && g !== G.MOUNTAIN) {
      const nearMountain = e > HILL;
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
  // Lagerplätze fremder Stämme: acht an Land, einer auf der Insel, dazu Trampelpfade ins Tal
  const sites = pickTribeSites(w, start, rnd, W * H > 40000 ? 8 : 5);
  carveTrails(w, start, sites);
  if (island) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = island.x + dx, y = island.y + dy; if (w.inb(x, y) && !w.isWater(x, y)) w.obj[w.i(x, y)] = null; }
    sites.push({ x: island.x, y: island.y, island: true });
  }
  if (island) for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2], [3, 0], [-3, 0]]) {
    const x = island.x + dx, y = island.y + dy;
    if (w.inb(x, y) && !w.isWater(x, y) && !w.obj[w.i(x, y)] && Math.abs(dx) + Math.abs(dy) >= 3) { w.obj[w.i(x, y)] = { t: 'chest' }; break; }
  }
  sprinkleChests(w, rnd, [{ x: start.x, y: start.y, r: 16 }, ...sites.map((p) => ({ x: p.x, y: p.y, r: 7 }))], Math.round(W * H / 750));
  w.touchAll();
  return { world: w, start, riverX, sites };
}

const D4X = [1, -1, 0, 0], D4Y = [0, 0, 1, -1];
// Flutfüllung ab einem Feld über alles, was pass erlaubt (4 Richtungen). Liefert Markierungen und Anzahl.
function flood(w, sx, sy, pass) {
  const W = w.w, H = w.h, mark = new Uint8Array(W * H), q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  if (!pass(sx, sy)) return { mark, n: 0 };
  q[qt++] = sy * W + sx; mark[sy * W + sx] = 1;
  while (qh < qt) {
    const c = q[qh++], cx = c % W, cy = (c / W) | 0;
    for (let d = 0; d < 4; d++) {
      const x = cx + D4X[d], y = cy + D4Y[d];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (mark[k] || !pass(x, y)) continue;
      mark[k] = 1; q[qt++] = k;
    }
  }
  return { mark, n: qt };
}
const groundLand = (w) => (x, y) => { const g = w.ground[y * w.w + x]; return g !== G.MOUNTAIN && g !== G.WATER && g !== G.DEEP; };
function landShare(w, start) {
  let total = 0;
  const land = groundLand(w);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (land(x, y)) total++;
  return flood(w, start.x, start.y, land).n / Math.max(1, total);
}
// Zusammenhang über Land (Bäume zählen nicht, die kann man fällen). Größere getrennte Stücke werden
// durch einen Pass mit dem Hauptland verbunden: auf dem kürzesten Weg durch die Berge wird Gras.
function connectLand(w, start) {
  const W = w.w, H = w.h, N = W * H, gr = w.ground;
  const isLand = (k) => { const g = gr[k]; return g !== G.MOUNTAIN && g !== G.WATER && g !== G.DEEP; };
  const comp = new Int32Array(N).fill(-1), sizes = [], q = new Int32Array(N);
  for (let k0 = 0; k0 < N; k0++) {
    if (comp[k0] >= 0 || !isLand(k0)) continue;
    const id = sizes.length;
    let qh = 0, qt = 0; q[qt++] = k0; comp[k0] = id;
    while (qh < qt) {
      const c = q[qh++], cx = c % W, cy = (c / W) | 0;
      for (let d = 0; d < 4; d++) {
        const x = cx + D4X[d], y = cy + D4Y[d];
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = y * W + x;
        if (comp[k] >= 0 || !isLand(k)) continue;
        comp[k] = id; q[qt++] = k;
      }
    }
    sizes.push(qt);
  }
  if (!sizes.length) return;
  let main = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;
  const startComp = comp[start.y * W + start.x];
  const order = sizes.map((n, i) => i).filter((i) => i !== main && (sizes[i] >= 120 || i === startComp)).sort((a, b) => sizes[b] - sizes[a]);
  const conn = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (comp[k] === main) conn[k] = 1;
  const dist = new Int32Array(N), prev = new Int32Array(N);
  for (const id of order) {
    dist.fill(1 << 29); prev.fill(-1);
    const dq = [], front = [];   // 0-1-Breitensuche: Land kostet nichts, Berg 1, Wasser ist tabu
    for (let k = 0; k < N; k++) if (comp[k] === id) { dist[k] = 0; dq.push(k); }
    let head = 0, hit = -1;
    while (head < dq.length || front.length) {
      const c = front.length ? front.pop() : dq[head++];
      if (conn[c]) { hit = c; break; }
      const cx = c % W, cy = (c / W) | 0, dc = dist[c];
      for (let d = 0; d < 4; d++) {
        const x = cx + D4X[d], y = cy + D4Y[d];
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = y * W + x, g = gr[k];
        if (g === G.WATER || g === G.DEEP) continue;
        const cost = g === G.MOUNTAIN ? 1 : 0, nd = dc + cost;
        if (nd >= dist[k]) continue;
        dist[k] = nd; prev[k] = c;
        if (cost) dq.push(k); else front.push(k);
      }
    }
    if (hit < 0) continue;   // nur übers Wasser erreichbar
    for (let k = hit; k >= 0; k = prev[k]) { if (gr[k] === G.MOUNTAIN) gr[k] = G.GRASS; conn[k] = 1; }
    for (let k = 0; k < N; k++) if (comp[k] === id) conn[k] = 1;
  }
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
  const minStart = Math.min(70, Math.max(26, Math.round((w.w + w.h) * 0.2)));
  const reach = flood(w, start.x, start.y, terrainPass(w)).mark;
  for (let t = 0; t < 3000 && sites.length < n; t++) {
    const x = 6 + Math.floor(rnd() * (w.w - 12)), y = 6 + Math.floor(rnd() * (w.h - 12));
    if (Math.abs(x - start.x) + Math.abs(y - start.y) < minStart) continue;
    if (sites.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 24)) continue;
    if (avoid.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 16)) continue;
    if (!okArea(x, y)) continue;
    if (!reach[y * w.w + x]) continue;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const xx = x + dx, yy = y + dy; if (w.inb(xx, yy) && !w.isWater(xx, yy)) { const k = w.i(xx, yy); if (w.obj[k]) w.obj[k] = null; if (w.ground[k] === G.FOREST) w.ground[k] = G.GRASS; } }
    sites.push({ x, y });
  }
  return sites;
}
// begehbar, wenn man Bäume und Felsen wegdenkt (nicht durch Gebäude, Lager oder Truhen)
export function terrainPass(w) {
  return (x, y) => {
    if (!w.inb(x, y)) return false;
    const k = w.i(x, y), g = w.ground[k], o = w.obj[k];
    return g !== G.MOUNTAIN && g !== G.WATER && g !== G.DEEP && w.bld[k] < 0 && w.tstruct[k] < 0 && !(o && o.t === 'chest');
  };
}
// Trampelpfade von jedem Stammeslager ins Tal: Bäume und Felsen weg, Boden wird Erde
export function carveTrails(w, start, sites) {
  const pass = terrainPass(w), W = w.w, H = w.h, N = W * H;
  const clear = (x, y) => {
    const k = y * W + x, g = w.ground[k];
    if (w.obj[k] && w.obj[k].t !== 'chest') w.obj[k] = null;
    if (g === G.GRASS || g === G.MEADOW || g === G.FOREST) w.ground[k] = G.DIRT;
    w.touch(x, y);
  };
  if (!pass(start.x, start.y)) return;
  // eine Breitensuche vom Start aus liefert den kürzesten Weg zu jedem Lager
  const prev = new Int32Array(N).fill(-1), q = new Int32Array(N), s0 = start.y * W + start.x;
  let qh = 0, qt = 0;
  q[qt++] = s0; prev[s0] = s0;
  const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];
  while (qh < qt) {
    const c = q[qh++], cx = c % W, cy = (c / W) | 0;
    for (let d = 0; d < 8; d++) {
      const dx = DX8[d], dy = DY8[d], x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (prev[k] >= 0 || !pass(x, y)) continue;
      if (dx && dy && (!pass(cx + dx, cy) || !pass(cx, cy + dy))) continue;
      prev[k] = c; q[qt++] = k;
    }
  }
  for (const p of sites) {
    if (p.island) continue;
    let k = p.y * W + p.x;
    if (prev[k] < 0) continue;
    let px = p.x, py = p.y;
    while (k !== s0) {
      const x = k % W, y = (k / W) | 0;
      if (x !== px && y !== py && pass(x, py)) clear(x, py);   // diagonale Schritte bekommen eine freie Ecke
      clear(x, y);
      px = x; py = y; k = prev[k];
    }
  }
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
class Heap {   // Binärheap ohne Hilfs-Arrays beim Tauschen
  constructor() { this.a = []; this.f = []; this.n = 0; }
  push(v, f) {
    const a = this.a, fs = this.f;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fs[p] <= f) break;
      a[i] = a[p]; fs[i] = fs[p]; i = p;
    }
    a[i] = v; fs[i] = f;
  }
  pop() {
    const a = this.a, fs = this.f, top = a[0], n = --this.n;
    if (n > 0) {
      const v = a[n], f = fs[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1, c = r < n && fs[r] < fs[l] ? r : l;
        if (fs[c] >= f) break;
        a[i] = a[c]; fs[i] = fs[c]; i = c;
      }
      a[i] = v; fs[i] = f;
    }
    return top;
  }
  get size() { return this.n; }
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];
let POOL = null;
function pool(N) {
  if (!POOL || POOL.N !== N) POOL = { N, gs: new Float32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0 };
  if (++POOL.gen > 0xfffffff0) { POOL.stamp.fill(0); POOL.closed.fill(0); POOL.gen = 1; }
  return POOL;
}

// goal(x, y) → true am Ziel. (hx, hy) ist die Richtung für die Schätzung.
// Die Schätzung ist leicht gewichtet: schneller, die Wege sind trotzdem fast immer die kürzesten.
export function findPath(w, sx, sy, goal, hx, hy, maxNodes = 20000, pass = null) {
  const W = w.w, N = w.w * w.h, ground = w.ground;
  const ok = pass || ((x, y) => w.walkable(x, y));
  if (!w.inb(sx, sy)) return null;
  const P = pool(N), gen = P.gen, gs = P.gs, came = P.came, stamp = P.stamp, closed = P.closed;
  const s = sy * W + sx;
  gs[s] = 0; stamp[s] = gen; came[s] = -1;
  const open = new Heap();
  const hOf = (x, y) => { const dx = Math.abs(x - hx), dy = Math.abs(y - hy); return (dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx) * 0.85; };
  open.push(s, hOf(sx, sy));
  let n = 0;
  while (open.n && n++ < maxNodes) {
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
    const gc = gs[c];
    for (let d = 0; d < 8; d++) {
      const dx = DX[d], dy = DY[d], nx = cx + dx, ny = cy + dy;
      if (!ok(nx, ny)) continue;
      if (d >= 4 && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
      const nk = ny * W + nx;
      if (closed[nk] === gen) continue;
      const gk = ground[nk];
      const ng = gc + DC[d] * (gk === G.PATH || gk === G.BRIDGE ? 0.6 : gk === G.WATER || gk === G.DEEP ? 1.6 : 1);
      if (stamp[nk] !== gen || ng < gs[nk]) { gs[nk] = ng; stamp[nk] = gen; came[nk] = c; open.push(nk, ng + hOf(nx, ny)); }
    }
  }
  return null;
}
// Ziel: ein begehbares Feld direkt neben (tx, ty)
export const nextTo = (tx, ty) => (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) === 1;
// Ziel: ein Feld direkt neben einem Rechteck (Gebäude)
export const nextToRect = (bx, by, bw, bh) => (x, y) => x >= bx - 1 && x <= bx + bw && y >= by - 1 && y <= by + bh && !(x >= bx && x < bx + bw && y >= by && y < by + bh);
