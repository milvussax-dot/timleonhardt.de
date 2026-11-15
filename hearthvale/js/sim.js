// Spielzustand und Simulation: Zeit, Wetter, Farm, Siedler, Gebäude, Wirtschaft, Speichern.
// Land, Stämme, Soldaten, Boote und Ziele stehen in realm.js und werden unten an Game gehängt.
import {
  G, ITEMS, CROPS, BUILDINGS, ACTIONS, FREE_GROUND, BLOCK_OBJ, DAY_START, DAY_END, SEC_PER_HOUR, DAYS_PER_SEASON, YEAR_DAYS,
  MAX_ENERGY, CAN_SIZE, SETTLER_SPEED, PLAYER_SPEED, PATH_BONUS, WORK_TIME, START_STOCK, START_COINS, SETTLER_VALUE, FOOD_ORDER, STOCK_ORDER,
  HOUSE_LEVELS, UPGRADE, CARRY_MAX, CARRIER_ROAD, OUT_MAX,
} from './data.js?v=17';
import { World, generate, findPath, nextTo, nextToRect, mulberry, hash } from './world.js?v=17';
import { Realm } from './realm.js?v=17';

const DAY_LEN = (DAY_END - DAY_START) * SEC_PER_HOUR;
const toB64 = (arr) => { let s = ''; for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (str, arr) => { const bin = atob(str); for (let i = 0; i < arr.length; i++) arr[i] = bin.charCodeAt(i); };
// "R…": Paare aus Wert und Anzahl, "B…": roh. Gewählt wird, was kürzer ist.
function pack(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) { const v = arr[i]; let n = 1; while (i + n < arr.length && arr[i + n] === v && n < 255) n++; out.push(v, n); i += n; }
  const rle = toB64(Uint8Array.from(out)), raw = toB64(arr);
  return rle.length < raw.length ? 'R' + rle : 'B' + raw;
}
function unpack(str, arr) {
  if (str[0] === 'B') { fromB64(str.slice(1), arr); return; }
  const bin = atob(str.slice(1));
  let k = 0;
  for (let i = 0; i + 1 < bin.length && k < arr.length; i += 2) { const v = bin.charCodeAt(i), n = bin.charCodeAt(i + 1); for (let j = 0; j < n && k < arr.length; j++) arr[k++] = v; }
}
// Bäume (1–20), Felsen (21–22) und Sträucher (23–27) passen in ein Byte
const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(v || 0)));
function objCode(o) {
  if (o.t === 'tree') return (o.kind === 'pine' ? 11 : 1) + clampI(o.age, 0, 9);
  if (o.t === 'rock') return 20 + clampI(o.size, 1, 2);
  if (o.t === 'bush') return o.berries ? 23 : 24 + clampI(o.regrow, 0, 3);
  return 0;
}
function objFromCode(c) {
  if (c <= 10) return { t: 'tree', kind: 'oak', age: c - 1 };
  if (c <= 20) return { t: 'tree', kind: 'pine', age: c - 11 };
  if (c <= 22) return { t: 'rock', size: c - 20 };
  if (c === 23) return { t: 'bush', berries: true, regrow: 0 };
  return { t: 'bush', berries: false, regrow: c - 24 };
}
const HAT_COLORS = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9c6ade', '#e9c46a', '#2a9d8f'];
const ENERGY_FOOD = { bread: 25, pumpkin: 30, fish: 12, carrot: 6, berry: 5 };

export class Game {
  /* ---------- Neues Spiel ---------- */
  static create(seed, mode, week) {
    const { world, start, sites } = generate(seed);
    const g = new Game();
    Object.assign(g, {
      world, seed, mode, week, day: 1, time: 0, weather: 'sun', coins: START_COINS, energy: MAX_ENERGY, water: CAN_SIZE,
      stock: {}, buildings: [], settlers: [], nextId: 1, seedKind: 'wheat', autoSell: {}, yearScore: null, submitted: false,
      fed: true, starving: 0, totals: { harvested: 0, produced: 0, sold: 0 }, seenCount: 0, fogVer: 0,
    });
    for (const k in ITEMS) g.stock[k] = 0;
    for (const k in START_STOCK) g.stock[k] = START_STOCK[k];
    g.resetDayStats();
    const S = start;
    g.forcePlace('storage', S.x - 4, S.y - 1);
    g.forcePlace('hut', S.x + 1, S.y - 3);
    g.forcePlace('house', S.x + 1, S.y + 1);
    const hut = g.buildings[1];
    g.player = { x: hut.x + 1, y: hut.y + hut.h + 0.5, path: null, pi: 0, facing: 2, action: null, moving: false, walkT: 0 };
    const house = g.buildings[2];
    g.spawnSettler(house); g.spawnSettler(house);
    g.setupRealm(sites || []);
    g.init();
    return g;
  }
  init() {
    this.reserved = new Set();
    this.bad = new Map();       // Ziel-Felder, die gerade nicht erreichbar sind → Zeitpunkt
    this.toasts = [];
    this.fx = [];               // kleine Effekte (Zahlen über Köpfen)
    this.clock = 0;
    this.rng = mulberry(hash(this.seed + ':' + this.day));
    for (const s of this.settlers) this.resetSettler(s);
    this.player.path = null; this.player.action = null;
    this.initRealm();
  }
  resetDayStats() { this.today = { gathered: {}, produced: {}, harvested: {}, eaten: 0, needed: 0, born: 0, left: 0, earned: 0, sold: {}, events: [], beaten: 0, lost: 0 }; }

  /* ---------- Zeit ---------- */
  get hour() { return DAY_START + this.time / SEC_PER_HOUR; }
  get season() { return Math.floor(((this.day - 1) % (DAYS_PER_SEASON * 4)) / DAYS_PER_SEASON); }
  get dayOfSeason() { return ((this.day - 1) % DAYS_PER_SEASON) + 1; }
  get year() { return Math.floor((this.day - 1) / YEAR_DAYS) + 1; }

  // Hauptschleife. Gibt eine Tageszusammenfassung zurück, wenn der Tag zu Ende ist.
  update(dt) {
    this.clock += dt;
    this.time += dt;
    this.updatePlayer(dt);
    for (const s of this.settlers) this.updateSettler(s, dt);
    this.updateRealm(dt);
    this.builderCheck = (this.builderCheck || 0) - dt;
    if (this.builderCheck <= 0) { this.builderCheck = 1.5; this.ensureBuilder(); }
    for (const b of this.buildings) if (b.anim != null) b.anim += dt;
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].t += dt; if (this.fx[i].t > 1.4) this.fx.splice(i, 1); }
    if (this.time >= DAY_LEN) return this.endDay();
    return null;
  }

  toast(msg) { this.toasts.push({ msg, t: performance.now() }); }
  floatText(x, y, text, color) { this.fx.push({ x, y, text, color: color || '#fff', t: 0 }); }
  // Geräusch für die Oberfläche (ohne Ort: überall gleich laut)
  sound(n, x, y) { const q = this.sfx || (this.sfx = []); q.push({ n, x, y }); if (q.length > 48) q.shift(); }

  /* ---------- Lager und Wirtschaft ---------- */
  add(item, n, kind) {
    this.stock[item] = (this.stock[item] || 0) + n;
    if (kind) this.today[kind][item] = (this.today[kind][item] || 0) + n;
  }
  has(cost) { for (const k in cost) if ((this.stock[k] || 0) < cost[k]) return false; return true; }
  pay(cost) { for (const k in cost) this.stock[k] -= cost[k]; }
  get beds() { let n = 0; for (const b of this.buildings) if (b.type === 'house' && b.built) n += this.bedsOf(b); return n; }
  get hasMarket() { return this.buildings.some((b) => b.type === 'market' && b.built); }
  sell(item, n) {
    n = Math.min(n, this.stock[item] || 0);
    if (n <= 0) return 0;
    this.stock[item] -= n;
    const earned = n * ITEMS[item].price;
    this.coins += earned; this.today.earned += earned; this.totals.sold += earned;
    this.today.sold[item] = (this.today.sold[item] || 0) + n;
    return earned;
  }
  // Kaufen kostet rund die Hälfte mehr als Verkaufen bringt (Saatgut zum normalen Preis)
  buyPrice(item) { const p = ITEMS[item].price; return ITEMS[item].seed ? p : Math.max(p + 1, Math.ceil(p * 1.5)); }
  buy(item, n) {
    const price = this.buyPrice(item) * n;
    if (n <= 0 || this.coins < price) return false;
    this.coins -= price; this.stock[item] = (this.stock[item] || 0) + n;
    return true;
  }
  eat() {
    for (const k of ['bread', 'pumpkin', 'fish', 'carrot', 'berry']) {
      if (this.stock[k] > 0 && this.energy < MAX_ENERGY) {
        this.stock[k]--;
        this.energy = Math.min(MAX_ENERGY, this.energy + ENERGY_FOOD[k]);
        return `${ITEMS[k].name} gegessen: +${ENERGY_FOOD[k]} Energie`;
      }
    }
    return this.energy >= MAX_ENERGY ? 'Du bist schon voller Energie.' : 'Nichts zu essen im Lager.';
  }
  talwert() {
    let stockV = 0;
    for (const k of STOCK_ORDER) stockV += (this.stock[k] || 0) * ITEMS[k].price;
    for (const k in ITEMS) if (ITEMS[k].seed) stockV += (this.stock[k] || 0) * ITEMS[k].price;
    const val = (cost) => { let v = 0; for (const k in cost || {}) v += cost[k] * ITEMS[k].price; return v; };
    let bV = 0;
    for (const b of this.buildings) {
      if (!b.built) continue;
      bV += val(BUILDINGS[b.type].cost);
      const lvl = b.level || 1;
      if (lvl >= 2) for (const c of this.upgradeCosts(b)) bV += val(c);
    }
    let paths = 0;
    for (let i = 0; i < this.world.ground.length; i++) if (this.world.ground[i] === G.PATH) paths++;
    bV += paths * ITEMS.stone.price;
    const sV = this.settlers.length * SETTLER_VALUE;
    const mV = this.militaryValue();
    return { coins: this.coins, stock: stockV, buildings: bV, settlers: sV, military: mV, total: Math.round(this.coins + stockV + bV + sV + mV) };
  }

  /* ---------- Gebäude ---------- */
  buildingAt(x, y) { const id = this.world.inb(x, y) ? this.world.bld[y * this.world.w + x] : -1; return id >= 0 ? this.byId(id) : null; }
  byId(id) { return this.buildings.find((b) => b.id === id) || null; }
  canPlace(type, x, y) {
    const def = BUILDINGS[type], w = this.world;
    if (type === 'field') {
      if (!w.inb(x, y)) return 'Außerhalb der Karte.';
      if (w.ground[w.i(x, y)] === G.SOIL) return 'Hier ist schon Acker.';
      if (!w.isFree(x, y)) return 'Ein Acker geht nur auf freiem Gras.';
      return null;
    }
    if (type === 'path') {
      if (!w.inb(x, y)) return 'Außerhalb der Karte.';
      const gr = w.g(x, y);
      if (!(FREE_GROUND.has(gr) || gr === G.SAND) || w.o(x, y) || w.bld[w.i(x, y)] >= 0 || w.tstruct[w.i(x, y)] >= 0) return 'Hier geht kein Weg.';
      if (!this.inLand(x, y)) return 'Wege gehen nur in deinem Land.';
      return null;
    }
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const owner = this.landOwner(x + dx, y + dy);
      if (owner === 1) continue;
      if (owner >= 2 && this.tribes[owner - 2]) return `Das ist das Land der ${this.tribes[owner - 2].name}.`;
      return 'Das liegt außerhalb deines Landes. Lager, Wohnhäuser und besetzte Wachtürme vergrößern es.';
    }
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      if (!w.isFree(x + dx, y + dy)) return 'Der Platz ist nicht frei.';
      const px = Math.floor(this.player.x), py = Math.floor(this.player.y);
      if (px === x + dx && py === y + dy) return 'Du stehst im Weg.';
    }
    // die Tür (unten Mitte) muss erreichbar sein
    if (!w.walkable(x + (def.w >> 1), y + def.h)) return 'Unter dem Gebäude braucht es ein freies Feld für die Tür.';
    if (def.nearWater && !w.nearWater(x + 1, y + 1, def.nearWater)) return `${def.name}: muss nah am Wasser stehen.`;
    if (!this.stillConnected(x, y, def.w, def.h)) return 'So wären Türen oder du selbst eingesperrt. Lass einen Weg frei.';
    return null;
  }
  // Sperrt das neue Gebäude etwas ein? Geprüft wird nur die Umgebung des Bauplatzes: Felder rund um den
  // Bauplatz, die vorher zusammenhingen, müssen es danach noch tun, sofern sie zu Türen, zu dir oder aus der
  // Umgebung hinaus führen. So stören Gebäude, die nur per Boot erreichbar sind, nicht mehr.
  stillConnected(bx, by, bw, bh) {
    const w = this.world, R = 6;
    const inFoot = (x, y) => x >= bx && x < bx + bw && y >= by && y < by + bh;
    if (this.buildings.some((b) => { const d = this.door(b); return inFoot(d.x, d.y); })) return false;   // eine Tür zubauen geht nie
    const x0 = bx - R, y0 = by - R, WW = bw + 2 * R, HH = bh + 2 * R;
    const inWin = (x, y) => x >= x0 && y >= y0 && x < x0 + WW && y < y0 + HH;
    const label = (blockFoot) => {
      const lab = new Int16Array(WW * HH).fill(-1);
      const ok = (x, y) => inWin(x, y) && w.walkable(x, y) && !(blockFoot && inFoot(x, y));
      let id = 0;
      for (let yy = 0; yy < HH; yy++) for (let xx = 0; xx < WW; xx++) {
        if (lab[yy * WW + xx] >= 0 || !ok(x0 + xx, y0 + yy)) continue;
        const q = [yy * WW + xx]; lab[q[0]] = id;
        while (q.length) {
          const c = q.pop(), cx = x0 + (c % WW), cy = y0 + ((c / WW) | 0);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (!ok(nx, ny) || (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy)))) continue;
            const k = (ny - y0) * WW + (nx - x0);
            if (lab[k] >= 0) continue;
            lab[k] = id; q.push(k);
          }
        }
        id++;
      }
      return lab;
    };
    const before = label(false), after = label(true);
    const idx = (x, y) => (y - y0) * WW + (x - x0);
    // wichtig sind Gruppen, die aus der Umgebung hinaus führen oder eine Tür bzw. dich enthalten
    const relevant = new Set();
    const mark = (x, y) => { if (inWin(x, y) && after[idx(x, y)] >= 0) relevant.add(after[idx(x, y)]); };
    for (let xx = 0; xx < WW; xx++) { mark(x0 + xx, y0); mark(x0 + xx, y0 + HH - 1); }
    for (let yy = 0; yy < HH; yy++) { mark(x0, y0 + yy); mark(x0 + WW - 1, y0 + yy); }
    for (const b of this.buildings) { const d = this.door(b); mark(d.x, d.y); }
    mark(bx + (bw >> 1), by + bh);
    mark(Math.floor(this.player.x), Math.floor(this.player.y));
    const groups = new Map();
    for (let y = by - 1; y <= by + bh; y++) for (let x = bx - 1; x <= bx + bw; x++) {
      if (inFoot(x, y)) continue;
      const k = idx(x, y), a2 = after[k];
      if (a2 < 0 || !relevant.has(a2)) continue;
      const b0 = before[k];
      if (!groups.has(b0)) groups.set(b0, a2);
      else if (groups.get(b0) !== a2) return false;
    }
    return true;
  }
  place(type, x, y) {
    const def = BUILDINGS[type];
    const err = this.canPlace(type, x, y);
    if (err) return err;
    if (!this.has(def.cost)) return 'Dafür fehlen Rohstoffe.';
    if (type === 'field') { const r = this.interact(x, y, 'hoe'); return r && r.msg ? r.msg : null; }
    this.pay(def.cost);
    if (type === 'path') { this.world.setGround(x, y, G.PATH); return null; }
    const b = this.forcePlace(type, x, y, false);
    // Siedler, die jetzt im Gebäude stehen, an die Seite schieben
    for (const s of this.settlers) if (this.world.bld[this.world.i(Math.floor(s.x), Math.floor(s.y))] === b.id) { s.x = b.x + (b.w >> 1) + 0.5; s.y = b.y + b.h + 0.5; s.path = null; }
    return null;
  }
  forcePlace(type, x, y, built = true) {
    const def = BUILDINGS[type], w = this.world;
    const b = { id: this.nextId++, type, x, y, w: def.w, h: def.h, built, progress: built ? 1 : 0, worker: null, in: {}, out: {}, fields: [], anim: 0, level: 1, orders: 0 };
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const k = w.i(x + dx, y + dy);
      w.obj[k] = null;
      if (!FREE_GROUND.has(w.ground[k])) w.ground[k] = G.GRASS;
      w.bld[k] = b.id;
      w.touch(x + dx, y + dy);
    }
    const dx = x + (def.w >> 1), dy = y + def.h;
    if (w.inb(dx, dy)) { w.obj[w.i(dx, dy)] = null; if (!FREE_GROUND.has(w.ground[w.i(dx, dy)]) && w.ground[w.i(dx, dy)] !== G.PATH) w.ground[w.i(dx, dy)] = G.DIRT; w.touch(dx, dy); }
    this.buildings.push(b);
    return b;
  }
  demolish(b) {
    if (b.type === 'hut') return 'Deine Hütte bleibt stehen.';
    if (b.type === 'fort') return 'Die eroberte Festung bleibt stehen.';
    if (b.type === 'storage' && this.buildings.filter((o) => o.type === 'storage' && o.built).length <= 1 && b.built) return 'Das letzte Lager kann nicht weg.';
    const def = BUILDINGS[b.type];
    if (def.cost) for (const k in def.cost) this.stock[k] += Math.floor(def.cost[k] * (b.built ? 0.5 : 1));
    for (const k in b.in) this.stock[k] += b.in[k];
    for (const k in b.out) this.stock[k] += b.out[k];
    const w = this.world;
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) { w.bld[w.i(b.x + dx, b.y + dy)] = -1; w.touch(b.x + dx, b.y + dy); }
    for (const s of this.settlers) {
      if (s.job === b.id || (s.task && s.task.site === b.id)) this.resetSettler(s);
      if (s.home === b.id) s.home = null;
    }
    this.buildings = this.buildings.filter((o) => o !== b);
    this.landDirty = true;
    // Siedler ohne Bett ziehen weiter, wenn es zu wenig Betten gibt
    while (this.settlers.length > Math.max(this.beds, 0) && this.settlers.length > 0 && b.type === 'house') this.removeSettler(this.settlers[this.settlers.length - 1]);
    return null;
  }
  door(b) { return { x: b.x + (b.w >> 1), y: b.y + b.h }; }
  // wie viele Ziele (Bäume, Felsen, Wasser, freie Plätze) ein Sammelgebäude an dieser Stelle hätte
  targetsInRange(type, bx, by, b) {
    const def = BUILDINGS[type];
    if (!def.radius || def.job === 'farm') return null;
    const w = this.world, cx = bx + 1, cy = by + 1, R = b ? this.radiusOf(b) : def.radius;
    let n = 0;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (!w.inb(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      if (def.job === 'plant' ? w.isFree(x, y) : this.validTarget(def.job, x, y)) n++;
    }
    return n;
  }
  nearestStorage(x, y) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) if (b.type === 'storage' && b.built) { const d = Math.abs(b.x + 1 - x) + Math.abs(b.y + 1 - y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  workers() { return this.settlers.filter((s) => s.job != null).length; }
  // Baustellen bauen nur Siedler ohne Arbeitsplatz. Haben alle einen Job, legt einer ihn kurz nieder,
  // baut die Baustelle fertig und sucht sich danach wieder einen Arbeitsplatz (meist seinen alten).
  ensureBuilder() {
    const open = this.buildings.some((b) => (!b.built || b.upgrading) && !(b.blockedUntil > this.clock));
    if (!open || this.settlers.some((s) => s.job == null && s.recruit == null)) return;
    const rank = (s) => { const b = this.byId(s.job); return (b && b.paused ? 0 : 2) + (s.state === 'seek' && s.timer > 0 ? 0 : 1); };
    const cand = this.settlers.filter((s) => !s.carry && s.state !== 'working' && s.recruit == null).sort((a, c) => rank(a) - rank(c))[0];
    if (cand) this.resetSettler(cand);
  }

  /* ---------- Siedler ---------- */
  spawnSettler(home) {
    const d = home ? this.door(home) : this.door(this.buildings[0]);
    const s = { id: this.nextId++, x: d.x + 0.5, y: d.y + 0.5, home: home ? home.id : null, job: null, hat: HAT_COLORS[this.settlers.length % HAT_COLORS.length], walkT: 0 };
    this.resetSettler(s);
    this.settlers.push(s);
    return s;
  }
  // alle freien Betten auf einmal belegen (Code im Menü). Liefert die Zahl der neuen Siedler.
  fillBeds() {
    const houses = this.buildings.filter((b) => b.type === 'house' && b.built);
    let n = 0;
    while (this.settlers.length < this.beds && n < 1000) {
      const home = houses.find((h) => this.settlers.filter((s) => s.home === h.id).length < this.bedsOf(h));
      if (!home) break;
      this.spawnSettler(home); n++;
    }
    return n;
  }
  // viele Siedler auf einmal (Code im Menü): erst freie Betten, dann reihum in die Wohnhäuser, auch über die Betten hinaus.
  // Ohne Wohnhaus wohnen sie an der Hütte. Liefert die Zahl der neuen Siedler.
  addSettlers(n) {
    const houses = this.buildings.filter((b) => b.type === 'house' && b.built);
    const count = new Map(houses.map((h) => [h.id, 0]));
    for (const s of this.settlers) if (count.has(s.home)) count.set(s.home, count.get(s.home) + 1);
    for (let i = 0; i < n; i++) {
      let home = null, best = Infinity;
      for (const h of houses) { const load = count.get(h.id) / this.bedsOf(h); if (load < best) { best = load; home = h; } }
      this.spawnSettler(home);
      if (home) count.set(home.id, count.get(home.id) + 1);
    }
    return n;
  }
  removeSettler(s) {
    this.resetSettler(s);
    this.settlers = this.settlers.filter((o) => o !== s);
  }
  resetSettler(s) {
    this.endHaul(s);
    if (s.target != null) this.reserved.delete(s.target);
    if (s.carry) { this.add(s.carry.item, s.carry.n); s.carry = null; }
    if (s.job != null) { const b = this.byId(s.job); if (b && b.worker === s.id) b.worker = null; }
    Object.assign(s, { job: null, state: 'idle', path: null, pi: 0, after: null, dest: null, timer: 0, task: null, target: null, carry: null, work: null, recruit: null });
  }
  goTo(s, goal, hx, hy, after) {
    const sx = Math.floor(s.x), sy = Math.floor(s.y);
    if (goal(sx, sy)) { s.state = after; s.path = null; return true; }
    const path = findPath(this.world, sx, sy, goal, hx, hy, 20000, this.passFor(s));
    if (!path) return false;
    s.path = path; s.pi = 0; s.after = after; s.dest = { goal, hx, hy };
    s.state = 'walk';
    return true;
  }
  // bewegt ein Wesen (Siedler oder Spieler) am Pfad entlang. Liefert true, wenn angekommen.
  follow(e, dist) {
    const pass = this.passFor(e);
    while (dist > 0 && e.path) {
      const n = e.path[e.pi];
      if (!(pass ? pass(n.x, n.y) : this.world.walkable(n.x, n.y))) {   // Weg versperrt: neu suchen
        const d = e.dest;
        const p = d ? findPath(this.world, Math.floor(e.x), Math.floor(e.y), d.goal, d.hx, d.hy, 20000, pass) : null;
        if (p && p.length) { e.path = p; e.pi = 0; continue; }
        e.path = null; return 'blocked';
      }
      const tx = n.x + 0.5, ty = n.y + 0.5, dx = tx - e.x, dy = ty - e.y, len = Math.hypot(dx, dy);
      const g = this.world.g(Math.floor(e.x), Math.floor(e.y));
      const bonus = g === G.PATH || g === G.BRIDGE ? PATH_BONUS * (e.haul ? CARRIER_ROAD : 1) : 1, step = dist * bonus;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) e.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      if (len <= step) { e.x = tx; e.y = ty; dist -= len / bonus; e.pi++; if (e.pi >= e.path.length) { e.path = null; return true; } }
      else { e.x += dx / len * step; e.y += dy / len * step; dist = 0; }
      e.walkT = (e.walkT || 0) + 0.15;
    }
    return false;
  }

  updateSettler(s, dt) {
    const spd = this.fed ? 1 : 0.55;
    if (s.state === 'walk') {
      const r = this.follow(s, dt * SETTLER_SPEED * spd);
      if (r === true) s.state = s.after;
      else if (r === 'blocked') { this.releaseTarget(s); s.state = s.carry ? 'deliver' : (s.job != null ? 'seek' : 'idle'); s.timer = 0.5; }
      return;
    }
    if (s.timer > 0) {
      s.timer -= dt * spd;
      if (s.timer > 0) return;
      s.timer = 0;
      if (s.work) { const w = s.work; s.work = null; this.finishWork(s, w); return; }
    }
    this.think(s);
  }
  releaseTarget(s) { if (s.target != null) { this.reserved.delete(s.target); s.target = null; } }
  markBad(k) { this.bad.set(k, this.clock + 20); }
  atDoor(s, b) { const d = this.door(b); return Math.abs(s.x - d.x - 0.5) + Math.abs(s.y - d.y - 0.5) <= 1.5; }
  // Ein Siedler, der von nirgends mehr wegkommt (z. B. zwischen Gebäuden eingeklemmt), wird an eine Tür gesetzt.
  unstick(s, b) {
    const target = b || this.nearestStorage(s.x, s.y) || this.buildings[0];
    const d = this.door(target);
    if (!this.world.walkable(d.x, d.y)) { s.timer = 3; return; }
    s.x = d.x + 0.5; s.y = d.y + 0.5; s.path = null;
    if (s.state === 'walk') s.state = s.carry ? 'deliver' : (s.job != null ? 'seek' : 'idle');
    s.timer = 0.3;
  }
  // true, wenn der Siedler eingesperrt war (und jetzt befreit ist)
  stuckCheck(s) {
    const st = this.nearestStorage(s.x, s.y) || this.buildings[0];
    if (!st) return false;
    const d = this.door(st);
    if (findPath(this.world, Math.floor(s.x), Math.floor(s.y), (x, y) => x === d.x && y === d.y, d.x, d.y, 20000, this.passFor(s))) return false;
    this.unstick(s, s.job != null ? this.byId(s.job) : st);
    return true;
  }
  // Weit weg vom Arbeitsplatz? Erst hingehen. true = damit beschäftigt.
  commute(s, b, def) {
    if (Math.abs(s.x - (b.x + 1)) + Math.abs(s.y - (b.y + 1)) <= (def.radius || 2) + 6) return false;
    const d = this.door(b);
    s.why = 'Ist auf dem Weg zur Arbeit.';
    if (!this.goTo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 'seek')) this.unstick(s, b);
    return true;
  }
  // An der Tür warten. Kommt er nicht einmal dorthin, sitzt er fest und wird befreit.
  waitAtDoor(s, b, why, secs = 3) {
    s.why = why;
    if (!this.atDoor(s, b)) {
      const d = this.door(b);
      if (!this.goTo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 'seek')) { this.unstick(s, b); return; }
      if (s.state === 'walk') return;
    }
    s.state = 'seek'; s.timer = secs;
  }
  // gehackten Boden in Reichweite übernehmen, der noch keinem Hof gehört (z. B. selbst gehackt)
  adoptSoil(b, def) {
    const w = this.world, owned = new Set();
    for (const o of this.buildings) if (o.type === 'farm') for (const k of o.fields) owned.add(k);
    const cx = b.x + 1, cy = b.y + 1, R = def.radius + 1, found = [];
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (!w.inb(x, y)) continue;
      const k = w.i(x, y), o = w.obj[k];
      if (w.ground[k] !== G.SOIL || w.bld[k] >= 0 || owned.has(k)) continue;
      if (o && (o.t !== 'crop' || (o.farm != null && o.farm !== b.id))) continue;
      found.push({ k, d: Math.abs(x - cx) + Math.abs(y - cy) });
    }
    found.sort((a, c) => a.d - c.d);
    const max = this.fieldsOf(b);
    for (const f of found) { if (b.fields.length >= max) break; b.fields.push(f.k); }
  }
  isBad(k) { const t = this.bad.get(k); if (t == null) return false; if (t < this.clock) { this.bad.delete(k); return false; } return true; }

  think(s) {
    // Job weg? (abgerissen)
    if (s.job != null && !this.byId(s.job)) this.resetSettler(s);
    if (s.state === 'atTarget') return this.startWork(s);
    if (s.state === 'working' && !s.work) s.state = 'seek';
    if (s.state === 'haulPick' || s.state === 'haulFetch' || s.state === 'haulDrop') return this.haulArrive(s);
    if (s.state === 'stash') {   // Ware am eigenen Gebäude ablegen, ein Träger bringt sie ins Lager
      const b = s.job != null ? this.byId(s.job) : null;
      if (!b || !s.carry) { s.state = s.carry ? 'deliver' : 'seek'; return; }
      if (nextToRect(b.x, b.y, b.w, b.h)(Math.floor(s.x), Math.floor(s.y))) { b.out[s.carry.item] = (b.out[s.carry.item] || 0) + s.carry.n; s.carry = null; s.state = 'seek'; return; }
      if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'stash')) s.state = 'deliver';
      return;
    }
    if (s.state === 'deliver') {   // Ware ins Lager bringen
      const st = this.nearestStorage(s.x, s.y);
      if (!st) { s.timer = 2; return; }
      if (!this.goTo(s, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 'drop')) { s.timer = 2; }
      return;
    }
    if (s.state === 'drop') {
      if (s.carry) { this.add(s.carry.item, s.carry.n, s.carry.kind || 'gathered'); this.floatText(s.x, s.y - 0.6, `+${s.carry.n} ${ITEMS[s.carry.item].name}`, ITEMS[s.carry.item].color); s.carry = null; }
      this.endHaul(s);
      s.state = s.job != null ? 'seek' : 'idle';
      return;
    }
    if (s.recruit != null) return this.thinkRecruit(s);
    if (s.job == null) return this.thinkIdle(s);
    const b = this.byId(s.job), def = BUILDINGS[b.type];
    if (b.paused && !s.carry) {
      s.why = 'Pausiert.';
      const d = this.door(b);
      if (Math.abs(s.x - d.x - 0.5) + Math.abs(s.y - d.y - 0.5) > 1.5) { if (this.goTo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 'seek')) return; }
      s.state = 'seek'; s.timer = 2; return;
    }
    if (def.job === 'process') return this.thinkProcess(s, b, def);
    if (def.job === 'farm') return this.thinkFarm(s, b, def);
    if (def.job === 'scout') return this.thinkScout(s, b, def);
    return this.thinkGather(s, b, def);
  }

  thinkIdle(s) {
    // 1. weiterbauen oder eine Baustelle übernehmen
    if (s.task && s.task.site != null) {
      const site = this.byId(s.task.site);
      if (site && (!site.built || site.upgrading) && s.state === 'building') return this.buildTick(s, site);
      s.task = null;
    }
    for (const site of this.buildings) {
      if ((site.built && !site.upgrading) || site.blockedUntil > this.clock) continue;
      const builders = this.settlers.filter((o) => o !== s && o.task && o.task.site === site.id).length;
      if (builders >= 2) continue;
      if (this.goTo(s, nextToRect(site.x, site.y, site.w, site.h), site.x + 1, site.y + 1, 'building')) {
        s.task = { site: site.id };
        if (s.state === 'building') this.buildTick(s, site);
        return;
      }
      if (this.stuckCheck(s)) return;   // er selbst sitzt fest, nicht die Baustelle
      site.blockedUntil = this.clock + 15;
    }
    // 2. freie Arbeitsplätze
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (!b.built || b.worker != null || !BUILDINGS[b.type].job) continue;
      const d = Math.abs(b.x - s.x) + Math.abs(b.y - s.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.worker = s.id; s.job = best.id; s.state = 'seek'; return; }
    // 3. als Träger Waren abholen oder Zutaten bringen
    if (this.thinkCarry(s)) return;
    // 4. herumschlendern
    const home = s.home != null ? this.byId(s.home) : this.buildings[0];
    const base = home ? this.door(home) : { x: Math.floor(s.x), y: Math.floor(s.y) };
    const tx = base.x + Math.floor(this.rng() * 7) - 3, ty = base.y + Math.floor(this.rng() * 4);
    s.state = 'idle';
    if (this.world.walkable(tx, ty) && this.rng() < 0.6 && this.goTo(s, (x, y) => x === tx && y === ty, tx, ty, 'idle')) return;
    s.timer = 1.5 + this.rng() * 3;
  }
  buildTick(s, site) {
    s.state = 'building';
    s.work = { type: 'build', site: site.id };
    s.timer = 1;
  }

  thinkGather(s, b, def) {
    if (s.state === 'working') return;   // wartet auf finishWork
    if (this.commute(s, b, def)) return;
    const target = this.findTarget(s, b, def);
    if (!target) {
      const noun = { chop: 'ausgewachsenen Bäume', mine: 'Felsen oder Bergwände', ore: 'Bergwände oder Felsen', fish: 'Wasserstellen am Ufer', plant: 'freien Plätze für neue Bäume' }[def.job];
      const extra = def.job === 'chop' ? ' Junge Bäume brauchen 4 Tage.' : def.job === 'plant' && this.season === 3 ? ' Im Winter pflanzt der Förster nicht.' : '';
      return this.waitAtDoor(s, b, `Nichts zu tun: keine ${noun} in Reichweite.${extra}`);
    }
    if (target.blocked) return this.waitAtDoor(s, b, 'Sucht nach einem Ziel, das er erreichen kann …', 0.3);
    s.why = '';
    s.target = target.k; this.reserved.add(target.k);
    s.task = { job: def.job, x: target.x, y: target.y, k: target.k };
    s.state = 'walk'; s.after = 'atTarget';
    s.path = target.path; s.pi = 0; s.dest = { goal: nextTo(target.x, target.y), hx: target.x, hy: target.y };
    if (!s.path.length) { s.path = null; s.state = 'atTarget'; }
  }
  // Erkunder: läuft zu einer unerkundeten Stelle im Umkreis der Späherhütte und schaut sich dort um
  thinkScout(s, b, def) {
    if (s.state === 'working') return;
    const w = this.world, cx = b.x + 1, cy = b.y + 1, R = this.radiusOf(b);
    let goal = null;
    for (let i = 0; i < 60 && !goal; i++) {
      const a = this.rng() * Math.PI * 2, r = 5 + this.rng() * (R - 5);
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      if (w.inb(x, y) && !w.seen[w.i(x, y)] && w.walkable(x, y) && !this.isBad(w.i(x, y))) goal = { x, y };
    }
    if (!goal) return this.waitAtDoor(s, b, 'Rund um die Späherhütte gibt es gerade nichts Unerkundetes, das er erreicht. Bau eine weitere weiter draußen.', 4);
    const path = findPath(w, Math.floor(s.x), Math.floor(s.y), (x, y) => x === goal.x && y === goal.y, goal.x, goal.y, 30000, this.passFor(s));
    if (!path) { this.markBad(w.i(goal.x, goal.y)); s.timer = 0.3; return; }
    s.why = 'Erkundet das Tal.';
    s.task = { job: 'scout', x: goal.x, y: goal.y };
    s.path = path.length ? path : null; s.pi = 0; s.after = 'atTarget'; s.dest = { goal: (x, y) => x === goal.x && y === goal.y, hx: goal.x, hy: goal.y };
    s.state = path.length ? 'walk' : 'atTarget';
  }
  // sucht das nächste passende Ziel im Radius des Gebäudes, das erreichbar ist
  findTarget(s, b, def) {
    const w = this.world, cx = b.x + 1, cy = b.y + 1, R = this.radiusOf(b);
    const cands = [];
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (!w.inb(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const k = w.i(x, y);
      if (this.reserved.has(k) || this.isBad(k)) continue;
      if (this.validTarget(def.job, x, y, b)) cands.push({ x, y, k, d: Math.abs(x - s.x) + Math.abs(y - s.y) });
    }
    cands.sort((a, c) => a.d - c.d);
    let tried = 0;
    for (let i = 0; i < Math.min(cands.length, 6); i++) {
      const c = cands[i];
      const path = findPath(w, Math.floor(s.x), Math.floor(s.y), nextTo(c.x, c.y), c.x, c.y, 3000, this.passFor(s));
      if (path) return { ...c, path };
      this.markBad(c.k); tried++;
    }
    return tried ? { blocked: true } : null;
  }
  validTarget(job, x, y, b) {
    const w = this.world, o = w.o(x, y), g = w.g(x, y);
    if (job === 'chop') return o && o.t === 'tree' && o.age >= 4;
    if (job === 'mine') {
      if (o && o.t === 'rock') return true;
      if (g !== G.MOUNTAIN) return false;
      return w.walkable(x + 1, y) || w.walkable(x - 1, y) || w.walkable(x, y + 1) || w.walkable(x, y - 1);
    }
    if (job === 'ore') return (o && o.t === 'rock') || (g === G.MOUNTAIN && (w.walkable(x + 1, y) || w.walkable(x - 1, y) || w.walkable(x, y + 1) || w.walkable(x, y - 1)));
    if (job === 'scout') return !w.seen[w.i(x, y)];
    if (job === 'fish') return (g === G.WATER) && (w.walkable(x + 1, y) || w.walkable(x - 1, y) || w.walkable(x, y + 1) || w.walkable(x, y - 1));
    if (job === 'plant') {
      if (!w.isFree(x, y) || this.season === 3) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (w.inb(x + dx, y + dy) && w.bld[w.i(x + dx, y + dy)] >= 0) return false;
        const oo = w.o(x + dx, y + dy);
        if ((dx === 0) !== (dy === 0) && oo && oo.t === 'tree') return false;
      }
      const gg = w.g(x, y + 1);
      return gg !== G.PATH && gg !== G.DIRT;
    }
    return false;
  }

  thinkFarm(s, b, def) {
    if (s.state === 'working') return;
    if (this.commute(s, b, def)) return;
    const w = this.world, season = this.season, canSow = CROPS.wheat.seasons.includes(season);
    // Felder aufräumen und freien gehackten Boden in Reichweite übernehmen
    b.fields = b.fields.filter((k) => w.ground[k] === G.SOIL && (!w.obj[k] || w.obj[k].t === 'crop') && w.bld[k] < 0);
    if (b.fields.length < this.fieldsOf(b)) this.adoptSoil(b, def);
    const tasks = [];
    const maxFields = this.fieldsOf(b);
    for (const k of b.fields) {
      if (this.reserved.has(k) || this.isBad(k)) continue;
      const o = w.obj[k], x = k % w.w, y = (k / w.w) | 0;
      if (o && o.t === 'crop' && o.grown >= CROPS[o.kind].days) tasks.push({ x, y, k, task: 'harvest', p: 0 });
      else if (!o && canSow) tasks.push({ x, y, k, task: 'sow', p: 1 });
      else if (o && o.t === 'crop' && !w.wet[k] && this.weather !== 'rain') tasks.push({ x, y, k, task: 'water', p: 2 });
    }
    if (!tasks.length && b.fields.length < maxFields && canSow) {
      const cx = b.x + 1, cy = b.y + 1, R = def.radius + 1, dd = this.door(b);
      for (let y = cy - R; y <= cy + R && tasks.length < 3; y++) for (let x = cx - R; x <= cx + R; x++) {
        if (!w.isFree(x, y) || this.reserved.has(w.i(x, y)) || this.isBad(w.i(x, y))) continue;
        let nearBld = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && w.inb(x + dx, y + dy) && w.bld[w.i(x + dx, y + dy)] >= 0) {
          const ob = this.byId(w.bld[w.i(x + dx, y + dy)]);
          if (ob && ob !== b) nearBld = true;
        }
        if (nearBld || (Math.abs(x - dd.x) <= 1 && y === dd.y)) continue;
        tasks.push({ x, y, k: w.i(x, y), task: 'till', p: 3 });
      }
    }
    tasks.sort((a, c) => a.p - c.p || (Math.abs(a.x - s.x) + Math.abs(a.y - s.y)) - (Math.abs(c.x - s.x) + Math.abs(c.y - s.y)));
    let tried = 0;
    for (const t of tasks.slice(0, 5)) {
      const path = findPath(w, Math.floor(s.x), Math.floor(s.y), nextTo(t.x, t.y), t.x, t.y, 3000, this.passFor(s));
      if (!path) { this.markBad(t.k); tried++; continue; }
      s.why = '';
      s.target = t.k; this.reserved.add(t.k);
      s.task = { job: 'farm', farmTask: t.task, x: t.x, y: t.y, k: t.k };
      s.path = path; s.pi = 0; s.after = 'atTarget'; s.dest = { goal: nextTo(t.x, t.y), hx: t.x, hy: t.y };
      s.state = path.length ? 'walk' : 'atTarget';
      if (!path.length) s.path = null;
      return;
    }
    let why;
    if (tried) why = 'Sucht einen Weg zu den Feldern …';
    else if (season === 3) why = 'Im Winter ruht der Hof. Im Frühling legt er wieder Felder an.';
    else if (b.fields.length >= maxFields) why = 'Alle Felder sind bestellt und gegossen. Der Weizen wächst über Nacht.';
    else why = 'Kein freier Platz für neue Felder in Reichweite. Räum rund um den Hof auf oder hack dort selbst Boden, den er übernimmt.';
    this.waitAtDoor(s, b, why, tried ? 0.3 : 3);
  }

  thinkProcess(s, b, def) {
    const r = this.recipeOf(b), w = this.world;
    if (s.state === 'working') return;
    if (b.type === 'shipyard' && !(b.orders > 0) && !s.carry) return this.waitAtDoor(s, b, 'Kein Boot bestellt. Bestell eins hier im Menü der Werft.');
    if (b.type === 'siege' && !(b.orders > 0) && !(b.ramOrders > 0) && !s.carry) return this.waitAtDoor(s, b, 'Nichts bestellt. Bestell hier im Menü ein Katapult oder einen Rammbock.');
    const atB = nextToRect(b.x, b.y, b.w, b.h)(Math.floor(s.x), Math.floor(s.y));
    // Fertige Ware wegbringen
    const outItem = Object.keys(r.out)[0];
    if ((b.out[outItem] || 0) > 0 && !s.carry && (!this.carriersOn() || b.out[outItem] >= OUT_MAX)) {
      if (!atB) { if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'seek')) this.unstick(s, b); return; }
      s.carry = { item: outItem, n: b.out[outItem], kind: 'produced' }; b.out[outItem] = 0;
      s.state = 'deliver';
      return;
    }
    // Zutaten mitgebracht? abliefern
    if (s.carry && s.state === 'bring') {
      if (!atB) { if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'bring')) this.unstick(s, b); return; }
      b.in[s.carry.item] = (b.in[s.carry.item] || 0) + s.carry.n; s.carry = null; s.state = 'seek';
      return;
    }
    const hasIn = Object.keys(r.in).every((k) => (b.in[k] || 0) >= r.in[k]);
    if (hasIn) {
      b.waitIn = null;
      if (!atB) { if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'seek')) this.unstick(s, b); return; }
      s.why = '';
      s.state = 'working'; s.work = { type: 'process', b: b.id }; s.timer = r.time / this.speedOf(b); b.anim = b.anim || 0;
      return;
    }
    // Zutaten aus dem Lager holen
    const need = {};
    for (const k in r.in) need[k] = r.in[k] - (b.in[k] || 0);
    const item = Object.keys(need).find((k) => need[k] > 0);
    const amount = r.in[item] >= 4 ? need[item] : need[item] * 2;   // kleine Mengen gleich für zwei Durchgänge
    if (s.state === 'fetched') {
      const n = Math.min(amount, this.stock[item] || 0);
      if (n >= need[item]) { this.stock[item] -= n; s.carry = { item, n }; s.state = 'bring'; return; }
      s.state = 'seek'; s.timer = 3; return;
    }
    if ((this.stock[item] || 0) >= need[item]) {
      // gibt es Träger, bringen die es; kommt 15 s lang keiner, holt er es selbst
      if (this.carriersOn() && s.state !== 'fetched') {
        if (b.waitIn == null) b.waitIn = this.clock;
        if (this.clock - b.waitIn < 15) return this.waitAtDoor(s, b, `Wartet auf einen Träger mit ${ITEMS[item].name}.`, 1);
      }
      b.waitIn = null;
      const st = this.nearestStorage(s.x, s.y);
      if (st && this.goTo(s, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 'fetched')) return;
    }
    // nichts da: warten
    s.why = `Im Lager fehlt ${ITEMS[item].name}. Er holt es, sobald genug da ist.`;
    if (!atB && !this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'seek')) { this.unstick(s, b); return; }
    if (s.state === 'walk') return;
    s.timer = 3;
  }

  // nach Ankunft am Ziel: Arbeit beginnen (aus think heraus über state 'atTarget')
  startWork(s) {
    const t = s.task, w = this.world;
    if (!t) { s.state = 'seek'; return; }
    if (t.job === 'scout') { this.reveal(t.x + 0.5, t.y + 0.5, 10); s.task = null; s.state = 'seek'; s.timer = 1.2; return; }   // umschauen
    const job = t.job === 'farm' ? t.farmTask : t.job;
    const valid = t.job === 'farm' ? true : this.validTarget(t.job, t.x, t.y, this.byId(s.job));
    if (!valid) { this.releaseTarget(s); s.state = 'seek'; return; }
    s.state = 'working'; s.why = '';
    s.work = { type: 'job', job, x: t.x, y: t.y };
    s.timer = (WORK_TIME[job] || 2) / this.speedOf(this.byId(s.job));
    const dx = t.x + 0.5 - s.x, dy = t.y + 0.5 - s.y;
    s.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  }

  finishWork(s, work) {
    const w = this.world;
    if (work.type === 'build') {
      const site = this.byId(work.site);
      if (site) this.sound('hammer', site.x + site.w / 2, site.y + site.h / 2);
      if (site && site.built && site.upgrading) {
        site.upgrading.progress += 1 / Math.max(1, site.upgrading.build);
        if (site.upgrading.progress >= 1) this.finishUpgrade(site);
      } else if (site && !site.built) {
        site.progress += 1 / Math.max(1, BUILDINGS[site.type].build);
        if (site.progress >= 1) { site.built = true; site.progress = 1; this.landDirty = true; this.sound('build'); this.toast(`${BUILDINGS[site.type].name} ist fertig.`); for (let dy = 0; dy < site.h; dy++) for (let dx = 0; dx < site.w; dx++) w.touch(site.x + dx, site.y + dy); }
      }
      if (site && (!site.built || site.upgrading)) { s.state = 'building'; } else { s.state = 'idle'; s.task = null; }
      return;
    }
    if (work.type === 'process') {
      const b = this.byId(work.b);
      if (b) {
        const r = this.recipeOf(b);
        if (Object.keys(r.in).every((k) => (b.in[k] || 0) >= r.in[k])) {
          for (const k in r.in) b.in[k] -= r.in[k];
          if (r.out.boat) {
            const tier = Math.min(3, b.level || 1);
            this.addBoat(tier); this.stats.boats++; b.orders = Math.max(0, (Number(b.orders) || 0) - 1); this.sound('boat');
            this.toast(this.boats === 1 ? 'Dein erstes Boot ist fertig. Jetzt geht es übers Wasser.' : tier === 3 ? 'Ein Kriegsschiff ist fertig.' : tier === 2 ? 'Ein Langboot ist fertig.' : 'Ein Boot ist fertig.');
          } else if (r.out.ram) {
            this.rams = (this.rams || 0) + 1; b.ramOrders = Math.max(0, (Number(b.ramOrders) || 0) - 1); this.sound('build');
            this.toast('Ein Rammbock ist fertig. Schick ihn im Fenster eines Stammes los.');
          } else if (r.out.catapult) {
            this.catapults = (this.catapults || 0) + 1; b.orders = Math.max(0, (Number(b.orders) || 0) - 1); this.sound('build');
            this.toast('Ein Katapult ist fertig. Schick es im Fenster eines Stammes los.');
          } else for (const k in r.out) b.out[k] = (b.out[k] || 0) + r.out[k];
          if (r.out.bread) this.stats.bread += r.out.bread;
          if (r.out.iron) this.stats.iron += r.out.iron;
        }
      }
      s.state = 'seek';
      return;
    }
    // Sammel- und Feldarbeit
    const { job, x, y } = work, k = w.i(x, y), o = w.obj[k];
    this.releaseTarget(s);
    s.state = 'seek';
    if (job === 'chop' || job === 'mine' || job === 'ore' || job === 'harvest') this.sound(job === 'ore' ? 'mine' : job, x + 0.5, y + 0.5);
    if (job === 'chop' && o && o.t === 'tree') { w.obj[k] = null; s.carry = { item: 'wood', n: o.kind === 'oak' ? 3 : 2, kind: 'gathered' }; s.state = 'deliver'; }
    else if (job === 'mine') {
      if (o && o.t === 'rock') { if (o.size > 1) o.size--; else w.obj[k] = null; s.carry = { item: 'stone', n: 3, kind: 'gathered' }; }
      else s.carry = { item: 'stone', n: 2, kind: 'gathered' };
      s.state = 'deliver';
    }
    else if (job === 'ore') {
      if (o && o.t === 'rock') { if (o.size > 1) o.size--; else w.obj[k] = null; s.carry = { item: 'ore', n: 1, kind: 'gathered' }; }
      else s.carry = { item: 'ore', n: 2, kind: 'gathered' };
      s.state = 'deliver';
    }
    else if (job === 'fish') { s.carry = { item: 'fish', n: 1 + (this.rng() < 0.2 ? 1 : 0), kind: 'gathered' }; s.state = 'deliver'; }
    else if (job === 'plant') { if (w.isFree(x, y)) w.obj[k] = { t: 'tree', kind: this.rng() < 0.6 ? 'oak' : 'pine', age: 0 }; }
    else if (job === 'till') { if (w.isFree(x, y)) { w.setGround(x, y, G.SOIL); const b = this.byId(s.job); if (b) b.fields.push(k); } }
    else if (job === 'sow') { if (w.ground[k] === G.SOIL && !o) w.obj[k] = { t: 'crop', kind: 'wheat', grown: 0, farm: s.job }; }
    else if (job === 'water') { if (w.ground[k] === G.SOIL) { w.wet[k] = 1; w.touch(x, y); } }
    else if (job === 'harvest' && o && o.t === 'crop' && o.grown >= CROPS[o.kind].days) {
      const [item, n] = CROPS[o.kind].yield;
      w.obj[k] = null;
      s.carry = { item, n, kind: 'harvested' };
      s.state = 'deliver';
    }
    if (s.state === 'deliver' && s.carry && s.job != null && this.carriersOn()) {
      const b = this.byId(s.job);
      if (b && this.outCount(b) < OUT_MAX) s.state = 'stash';
    }
  }

  /* ---------- Träger ---------- */
  // Siedler ohne Arbeit, Baustelle oder Ausbildung tragen Waren. Gibt es gerade welche?
  carriersOn() {
    if (this.carrierT === this.clock) return this.carrierOk;
    this.carrierT = this.clock;
    return (this.carrierOk = this.settlers.some((o) => o.job == null && o.recruit == null && !(o.task && o.task.site != null)));
  }
  // Zutaten für so viele Durchgänge bringen Träger; Werft und Geschützbauer nur für offene Bestellungen
  supplyBatches(b) {
    if (b.type === 'siege') return Math.min(2, Number(b.orders > 0 ? b.orders : b.ramOrders) || 0);
    return b.type === 'shipyard' ? Math.min(2, Number(b.orders) || 0) : 2;
  }
  outCount(b) { let n = 0; for (const k in b.out || {}) n += b.out[k] || 0; return n; }
  // Tür an einem gebauten Weg?
  roadLinked(b) {
    const d = this.door(b), w = this.world;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = d.x + dx, y = d.y + dy; if (w.inb(x, y) && w.ground[w.i(x, y)] === G.PATH) return true; }
    return false;
  }
  // ist der vermerkte Träger noch für dieses Gebäude unterwegs?
  haulBusy(b, key) {
    const id = b[key];
    if (id == null) return false;
    const s = this.settlers.find((o) => o.id === id);
    if (s && s.haul && s.haul.b === b.id) return true;
    b[key] = null;
    return false;
  }
  endHaul(s) {
    const h = s.haul;
    s.haul = null;
    if (!h || h.b == null) return;
    const b = this.byId(h.b);
    if (b) { if (b.pickBy === s.id) b.pickBy = null; if (b.supplyBy === s.id) b.supplyBy = null; }
  }
  thinkCarry(s) {
    if (!this.nearestStorage(s.x, s.y)) return false;
    // fertige Ware abholen: volle Gebäude zuerst, nahe bevorzugt
    let best = null, bv = -Infinity;
    for (const b of this.buildings) {
      if (!b.built || b.type === 'storage' || (b.haulBlocked || 0) > this.clock) continue;
      const n = this.outCount(b);
      if (!n || this.haulBusy(b, 'pickBy')) continue;
      const v = Math.min(n, CARRY_MAX) * 8 - (Math.abs(b.x - s.x) + Math.abs(b.y - s.y));
      if (v > bv) { bv = v; best = b; }
    }
    if (best) {
      if (this.goTo(s, nextToRect(best.x, best.y, best.w, best.h), best.x + 1, best.y + 1, 'haulPick')) { best.pickBy = s.id; s.haul = { kind: 'pick', b: best.id }; return true; }
      best.haulBlocked = this.clock + 15;
    }
    // Zutaten aus dem Lager in Werkstätten bringen (Vorrat für zwei Durchgänge)
    for (const b of this.buildings) {
      if (!b.built || BUILDINGS[b.type].job !== 'process' || b.paused || (b.haulBlocked || 0) > this.clock || this.haulBusy(b, 'supplyBy')) continue;
      if ((b.type === 'shipyard' || b.type === 'siege') && !(b.orders > 0) && !(b.ramOrders > 0)) continue;
      const r = this.recipeOf(b), batches = this.supplyBatches(b);
      const item = Object.keys(r.in).find((k) => (b.in[k] || 0) < r.in[k] * batches && (this.stock[k] || 0) >= Math.max(1, r.in[k] - (b.in[k] || 0)));
      if (!item) continue;
      const st = this.nearestStorage(b.x, b.y);
      if (st && this.goTo(s, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 'haulFetch')) { b.supplyBy = s.id; s.haul = { kind: 'supply', b: b.id, item }; return true; }
      b.haulBlocked = this.clock + 15;
    }
    return false;
  }
  // Träger ist angekommen: am Gebäude (abholen oder abliefern) oder am Lager (Zutaten holen)
  haulArrive(s) {
    const h = s.haul, b = h && h.b != null ? this.byId(h.b) : null;
    if (!b) { this.endHaul(s); s.state = s.carry ? 'deliver' : 'idle'; return; }
    if (s.state === 'haulPick') {
      let item = null, n = 0;
      for (const k in b.out) if ((b.out[k] || 0) > n) { n = b.out[k]; item = k; }
      this.endHaul(s);
      if (!item) { s.state = 'idle'; return; }
      const take = Math.min(n, CARRY_MAX), job = BUILDINGS[b.type].job;
      b.out[item] -= take;
      s.carry = { item, n: take, kind: job === 'process' ? 'produced' : job === 'farm' ? 'harvested' : 'gathered' };
      s.haul = { kind: 'deliver' };
      s.state = 'deliver';
      return;
    }
    if (s.state === 'haulFetch') {
      const r = this.recipeOf(b), have = b.in[h.item] || 0;
      const n = Math.min(this.stock[h.item] || 0, Math.max(CARRY_MAX, r.in[h.item]), r.in[h.item] * this.supplyBatches(b) - have);
      if (n <= 0) { this.endHaul(s); s.state = 'idle'; return; }
      this.stock[h.item] -= n; s.carry = { item: h.item, n };
      if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'haulDrop')) { this.stock[h.item] += n; s.carry = null; b.haulBlocked = this.clock + 15; this.endHaul(s); s.state = 'idle'; }
      return;
    }
    if (s.carry) { b.in[s.carry.item] = (b.in[s.carry.item] || 0) + s.carry.n; s.carry = null; }
    this.endHaul(s);
    s.state = 'idle';
  }

  /* ---------- Spieler ---------- */
  updatePlayer(dt) {
    const p = this.player;
    if (p.action) {
      p.action.t += dt;
      if (p.action.t >= p.action.total) { const a = p.action; p.action = null; this.applyAction(a); }
      return;
    }
    if (p.path) {
      const r = this.follow(p, dt * PLAYER_SPEED);
      p.moving = true;
      if (r === true && p.pending) { const a = p.pending; p.pending = null; this.beginAction(a); }
      else if (r === 'blocked') { p.pending = null; }
      return;
    }
    if (p.move && (p.move.x || p.move.y)) {
      const len = Math.hypot(p.move.x, p.move.y), sp = PLAYER_SPEED * dt * (this.world.g(Math.floor(p.x), Math.floor(p.y)) === G.PATH ? PATH_BONUS : 1);
      const nx = p.x + p.move.x / len * sp, ny = p.y + p.move.y / len * sp;
      const pass = this.passFor(p) || ((x, y) => this.world.walkable(x, y));
      const r = 0.28, ok = (x, y) => pass(Math.floor(x - r), Math.floor(y - r)) && pass(Math.floor(x + r), Math.floor(y - r)) && pass(Math.floor(x - r), Math.floor(y + r * 0.6)) && pass(Math.floor(x + r), Math.floor(y + r * 0.6));
      if (ok(nx, p.y)) p.x = nx;
      if (ok(p.x, ny)) p.y = ny;
      p.facing = Math.abs(p.move.x) > Math.abs(p.move.y) ? (p.move.x > 0 ? 1 : 3) : (p.move.y > 0 ? 2 : 0);
      p.walkT += 0.25; p.moving = true;
    } else p.moving = false;
  }

  // Klick/Tipp auf ein Feld. Liefert {msg} oder {open: building} oder nichts.
  interact(tx, ty, tool) {
    const w = this.world, p = this.player;
    if (!w.inb(tx, ty)) return null;
    const b = this.buildingAt(tx, ty);
    if (b) return { open: b };
    const ts = w.tstruct[w.i(tx, ty)];
    if (ts >= 0) return w.seen[w.i(tx, ty)] ? { tribe: ts } : this.walkTo(tx, ty);
    const o = w.o(tx, ty), g = w.g(tx, ty), k = w.i(tx, ty);
    let act = null;
    if (o && o.t === 'chest') act = 'open';
    else if (o && o.t === 'tree') act = 'chop';
    else if (o && o.t === 'rock') act = 'mine';
    else if (o && o.t === 'bush') { if (o.berries) act = 'pick'; else return { msg: 'Der Strauch trägt gerade keine Beeren.' }; }
    else if (o && o.t === 'crop') {
      const c = CROPS[o.kind], wet = w.wet[k] || this.weather === 'rain';
      if (o.grown >= c.days) act = 'harvest';
      else if (!wet) act = 'water';
      else return { msg: `${c.name}: ${o.grown} von ${c.days} Tagen gewachsen, heute schon gegossen.` };
    }
    else if (w.isWater(tx, ty)) { if (this.water < CAN_SIZE) act = 'refill'; else return this.walkTo(tx, ty); }
    else if (g === G.SOIL) {
      if (tool === 'hoe') return { msg: 'Hier ist schon Acker.' };
      if (!this.pickSeed()) return { msg: this.seedHint() };
      act = 'plant';
    }
    else if (tool === 'hoe' && w.isFree(tx, ty)) act = 'till';
    if (!act) return this.walkTo(tx, ty);
    // Voraussetzungen
    const A = ACTIONS[act];
    if (this.energy < A.energy) return { msg: 'Du bist zu müde. Iss etwas (Energie antippen) oder geh schlafen.' };
    if (act === 'water' && this.water <= 0) return { msg: 'Die Gießkanne ist leer. Klick aufs Wasser, um sie zu füllen. Über Nacht wird sie von selbst voll.' };
    if (act === 'plant') {
      const c = CROPS[this.seedKind];
      if (!c.seasons.includes(this.season)) return { msg: `${c.name} wächst nicht im ${['Frühling', 'Sommer', 'Herbst', 'Winter'][this.season]}.` };
      if ((this.stock[c.seed] || 0) <= 0) return { msg: `Keine ${ITEMS[c.seed].name} mehr. Am Markt gibt es Nachschub.` };
    }
    const a = { type: act, x: tx, y: ty };
    const px = Math.floor(p.x), py = Math.floor(p.y);
    if (Math.max(Math.abs(px - tx), Math.abs(py - ty)) === 1) { this.beginAction(a); return null; }
    const path = findPath(w, px, py, nextTo(tx, ty), tx, ty, 300000, this.passFor(p));
    if (!path) return { msg: this.boats > 0 ? 'Da kommst du nicht hin.' : 'Da kommst du nicht hin. Mit einem Boot kämst du übers Wasser.' };
    p.path = path.length ? path : null; p.pi = 0; p.dest = { goal: nextTo(tx, ty), hx: tx, hy: ty };
    if (!p.path) this.beginAction(a); else p.pending = a;
    return null;
  }
  // Saat für die Hand: die gewählte Sorte, sonst eine, die jetzt wächst und im Lager ist
  pickSeed() {
    const ok = (k) => CROPS[k].seasons.includes(this.season) && (this.stock[CROPS[k].seed] || 0) > 0;
    if (ok(this.seedKind)) return this.seedKind;
    const k = Object.keys(CROPS).find(ok);
    if (k) this.seedKind = k;
    return k || null;
  }
  seedHint() {
    if (this.season === 3) return 'Im Winter wächst auf dem Acker nichts.';
    const now = Object.keys(CROPS).filter((k) => CROPS[k].seasons.includes(this.season)).map((k) => CROPS[k].name);
    return `Keine passende Saat im Lager. Jetzt wachsen ${now.join(' und ')}. Saat gibt es am Markt.`;
  }
  walkTo(tx, ty) {
    const p = this.player, w = this.world, pass = this.passFor(p);
    const goal = (pass ? pass(tx, ty) : w.walkable(tx, ty)) ? (x, y) => x === tx && y === ty : nextTo(tx, ty);
    const path = findPath(w, Math.floor(p.x), Math.floor(p.y), goal, tx, ty, 300000, pass);
    if (!path) return { msg: this.boats > 0 ? 'Da kommst du nicht hin.' : 'Da kommst du nicht hin. Mit einem Boot kämst du übers Wasser.' };
    p.path = path.length ? path : null; p.pi = 0; p.pending = null; p.dest = { goal, hx: tx, hy: ty };
    return null;
  }
  beginAction(a) {
    const p = this.player;
    const dx = a.x + 0.5 - p.x, dy = a.y + 0.5 - p.y;
    p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    p.action = { ...a, t: 0, total: ACTIONS[a.type].time };
  }
  applyAction(a) {
    const w = this.world, k = w.i(a.x, a.y), o = w.obj[k], A = ACTIONS[a.type];
    this.sound({ refill: 'splash', open: 'chest' }[a.type] || a.type, a.x + 0.5, a.y + 0.5);
    const done = (msg, item, n) => { this.energy = Math.max(0, this.energy - A.energy); if (item) { this.add(item, n, a.type === 'harvest' ? 'harvested' : 'gathered'); this.floatText(a.x + 0.5, a.y, `+${n} ${ITEMS[item].name}`, ITEMS[item].color); } };
    switch (a.type) {
      case 'chop': if (o && o.t === 'tree') { const n = o.age < 4 ? 1 : (o.kind === 'oak' ? 3 : 2); w.obj[k] = null; done('', 'wood', n); } break;
      case 'mine': if (o && o.t === 'rock') { if (o.size > 1) o.size--; else w.obj[k] = null; done('', 'stone', 3); } break;
      case 'pick': if (o && o.t === 'bush' && o.berries) { o.berries = false; o.regrow = 3; done('', 'berry', 3); } break;
      case 'till': if (w.isFree(a.x, a.y)) { w.setGround(a.x, a.y, G.SOIL); done(); } break;
      case 'water': if (w.ground[k] === G.SOIL && this.water > 0) { w.wet[k] = 1; w.touch(a.x, a.y); this.water--; done(); } break;
      case 'refill': this.water = CAN_SIZE; this.floatText(a.x + 0.5, a.y, 'Kanne voll', '#9fd4ff'); break;
      case 'plant': { const c = CROPS[this.seedKind]; if (w.ground[k] === G.SOIL && !o && this.stock[c.seed] > 0) { this.stock[c.seed]--; w.obj[k] = { t: 'crop', kind: this.seedKind, grown: 0 }; done(); } break; }
      case 'open': if (o && o.t === 'chest') { w.obj[k] = null; this.energy = Math.max(0, this.energy - A.energy); const got = this.openChest(); this.floatText(a.x + 0.5, a.y, got, '#ffd25a'); this.toast(`Schatztruhe geöffnet: ${got}`); } break;
      case 'harvest': if (o && o.t === 'crop' && o.grown >= CROPS[o.kind].days) { const [item, n] = CROPS[o.kind].yield; w.obj[k] = null; done('', item, n); if (this.rng() < 0.5) this.stock[CROPS[o.kind].seed]++; } break;
    }
  }

  /* ---------- Tagesende ---------- */
  endDay() {
    const w = this.world, season = this.season, rained = this.weather === 'rain';
    const sum = { day: this.day, season, ...this.today, harvestTotal: 0, events: [...this.today.events] };
    if (this.today.beaten || this.today.lost) sum.events.push(`Kämpfe heute: ${this.today.beaten} ${this.today.beaten === 1 ? 'Krieger' : 'Krieger'} besiegt, ${this.today.lost} ${this.today.lost === 1 ? 'Soldat' : 'Soldaten'} gefallen.`);
    // Pflanzen wachsen
    let died = 0;
    for (let k = 0; k < w.obj.length; k++) {
      const o = w.obj[k];
      if (!o) continue;
      if (o.t === 'crop') {
        const c = CROPS[o.kind];
        if (o.grown >= c.days) continue;
        if (!c.seasons.includes(season) || season === 3) { w.obj[k] = null; died++; continue; }
        if (w.wet[k] || rained) o.grown++;
      } else if (o.t === 'tree' && o.age < 9 && season !== 3) o.age++;
      else if (o.t === 'bush' && !o.berries && season !== 3) { o.regrow--; if (o.regrow <= 0) o.berries = true; }
    }
    if (died) sum.events.push(`${died} ${died === 1 ? 'Pflanze ist' : 'Pflanzen sind'} eingegangen, weil die Jahreszeit nicht passt.`);
    // ein paar Bäume säen sich von selbst aus
    if (season < 2) for (let i = 0; i < 10; i++) {
      const x = Math.floor(this.rng() * w.w), y = Math.floor(this.rng() * w.h), o = w.o(x, y);
      if (o && o.t === 'tree') { const nx = x + Math.floor(this.rng() * 3) - 1, ny = y + Math.floor(this.rng() * 3) - 1; if (w.isFree(nx, ny) && w.g(nx, ny) === G.FOREST) w.obj[w.i(nx, ny)] = { t: 'tree', kind: o.kind, age: 0 }; }
    }
    w.wet.fill(0);
    // Essen
    const need = this.settlers.length + this.soldiers.length;
    let got = 0;
    const eaten = {};
    for (const k of FOOD_ORDER) {
      while (got < need && this.stock[k] > 0) { this.stock[k]--; got += ITEMS[k].food; eaten[k] = (eaten[k] || 0) + 1; }
    }
    sum.needed = need; sum.eatenItems = eaten;
    const wasFed = got >= need;
    this.fed = wasFed;
    if (!wasFed) {
      this.starving++;
      sum.events.push('Es gab nicht genug zu essen. Morgen arbeiten alle langsamer.');
      if (this.starving >= 2 && this.settlers.length) { this.removeSettler(this.settlers[this.settlers.length - 1]); sum.left = 1; sum.events.push('Ein hungriger Siedler hat das Tal verlassen.'); }
    } else this.starving = 0;
    // Zuzug
    const houses = this.buildings.filter((b) => b.type === 'house' && b.built);
    let born = 0;
    if (wasFed) {
      const foodLeft = FOOD_ORDER.reduce((a, k) => a + this.stock[k] * ITEMS[k].food, 0);
      const want = foodLeft >= need * 2 ? 2 : 1;
      for (let i = 0; i < want && this.settlers.length < this.beds; i++) {
        const home = houses.find((h) => this.settlers.filter((s) => s.home === h.id).length < this.bedsOf(h)) || houses[0];
        this.spawnSettler(home); born++;
      }
    }
    sum.born = born;
    if (born) sum.events.push(born === 1 ? 'Ein neuer Siedler ist eingezogen.' : `${born} neue Siedler sind eingezogen.`);
    else if (wasFed && this.settlers.length >= this.beds) sum.events.push('Alle Betten sind belegt. Bau ein Wohnhaus, damit mehr Siedler kommen.');
    // automatischer Verkauf am Markt
    if (this.hasMarket) {
      let earned = 0;
      for (const item in this.autoSell) { const keep = this.autoSell[item]; if (keep == null) continue; const n = (this.stock[item] || 0) - keep; if (n > 0) earned += this.sell(item, n); }
      if (earned) sum.events.push(`Der Markt hat Überschüsse für ${earned} Münzen verkauft.`);
    }
    sum.earned = this.today.earned;
    // neuer Tag
    this.day++;
    this.time = 0;
    this.energy = MAX_ENERGY;
    this.water = CAN_SIZE;
    this.rng = mulberry(hash(this.seed + ':' + this.day));
    this.realmNewDay();
    const s2 = this.season, r = this.rng();
    this.weather = s2 === 3 ? (r < 0.35 ? 'snow' : 'sun') : r < [0.3, 0.12, 0.35][s2] ? 'rain' : 'sun';
    if (this.weather === 'rain') for (let k = 0; k < w.ground.length; k++) if (w.ground[k] === G.SOIL) w.wet[k] = 1;
    if (s2 !== season) { w.touchAll(); sum.events.push(`Der ${['Frühling', 'Sommer', 'Herbst', 'Winter'][s2]} beginnt.${s2 === 3 ? ' Auf den Feldern wächst jetzt nichts mehr.' : ''}`); }
    else w.touchAll();
    // Spieler schläft in der Hütte
    const hut = this.buildings.find((b) => b.type === 'hut');
    if (hut) { const d = this.door(hut); Object.assign(this.player, { x: d.x + 0.5, y: d.y + 0.5, path: null, pending: null, action: null }); }
    // Jahresende
    if (this.day === YEAR_DAYS + 1 && !this.yearScore) { this.yearScore = this.talwert(); sum.yearEnd = this.yearScore; }
    this.resetDayStats();
    sum.weather = this.weather;
    return sum;
  }
  sleep() { this.time = DAY_LEN; }

  /* ---------- Speichern ---------- */
  save() {
    const w = this.world;
    const enc = pack;
    const objs = [], tr = new Uint8Array(w.w * w.h);
    w.obj.forEach((o, k) => { if (!o) return; const c = objCode(o); if (c) tr[k] = c; else objs.push([k, o]); });
    return JSON.stringify({
      v: 2, w: w.w, h: w.h, seed: this.seed, mode: this.mode, week: this.week, name: this.name || '', gift: !!this.gift, day: this.day, time: this.time, weather: this.weather,
      coins: this.coins, energy: this.energy, water: this.water, stock: this.stock, seedKind: this.seedKind, autoSell: this.autoSell,
      yearScore: this.yearScore, submitted: this.submitted, fed: this.fed, starving: this.starving, totals: this.totals, nextId: this.nextId,
      ground: enc(w.ground), wet: enc(w.wet), seen: enc(w.seen), seenCount: this.seenCount, objs, tr: enc(tr), pack: 1,
      buildings: this.buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, built: b.built, progress: b.progress, in: b.in, out: b.out, fields: b.fields, paused: !!b.paused, level: b.level || 1, upgrading: b.upgrading || null, orders: b.orders || 0, ramOrders: b.ramOrders || 0, training: b.training || null, tribe: b.tribe })),
      settlers: this.settlers.map((s) => ({ id: s.id, x: s.x, y: s.y, home: s.home, hat: s.hat })),
      player: { x: this.player.x, y: this.player.y },
      realm: this.saveRealm(),
    });
  }
  static load(json) {
    const d = JSON.parse(json);
    if (!d || (d.v !== 1 && d.v !== 2)) return null;
    const g = new Game();
    let W = d.w, H = d.h;
    if (!W || !H) { W = 80; H = Math.round(atob(d.ground).length / W); }   // ältere Täler: 80 × 64
    const w = new World(W, H);
    const dec = d.pack ? unpack : fromB64;   // ältere Spielstände: rohes Base64
    dec(d.ground, w.ground); dec(d.wet, w.wet);
    if (d.seen) dec(d.seen, w.seen);
    if (d.tr) { const codes = new Uint8Array(W * H); dec(d.tr, codes); for (let k = 0; k < codes.length; k++) if (codes[k]) w.obj[k] = objFromCode(codes[k]); }
    for (const [k, o] of d.objs) w.obj[k] = o;
    Object.assign(g, {
      world: w, seed: d.seed, mode: d.mode, week: d.week, day: d.day, time: d.time, weather: d.weather, coins: d.coins, energy: d.energy, water: d.water,
      name: typeof d.name === 'string' ? d.name : '', gift: !!d.gift,
      stock: d.stock, seedKind: d.seedKind || 'wheat', autoSell: d.autoSell || {}, yearScore: d.yearScore, submitted: d.submitted, fed: d.fed !== false, starving: d.starving || 0,
      totals: d.totals || { harvested: 0, produced: 0, sold: 0 }, nextId: d.nextId, buildings: [], settlers: [], seenCount: 0, fogVer: 0,
    });
    for (const k in ITEMS) if (g.stock[k] == null) g.stock[k] = 0;
    for (const b of d.buildings) {
      const def = BUILDINGS[b.type];
      const nb = { ...b, w: def.w, h: def.h, worker: null, in: b.in || {}, out: b.out || {}, fields: b.fields || [], anim: 0, level: b.level || 1, upgrading: b.upgrading || null, orders: b.orders || 0, training: b.training || null };
      g.buildings.push(nb);
      for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) w.bld[w.i(b.x + dx, b.y + dy)] = b.id;
    }
    for (const s of d.settlers) g.settlers.push({ ...s, walkT: 0 });
    g.player = { x: d.player.x, y: d.player.y, path: null, pi: 0, facing: 2, action: null, moving: false, walkT: 0 };
    g.resetDayStats();
    if (d.v === 2 && d.realm) {
      let n = 0; for (let i = 0; i < w.seen.length; i++) n += w.seen[i];
      g.seenCount = n;
      g.loadRealm(d.realm);
    } else g.upgradeOld();
    g.init();
    w.touchAll();
    return g;
  }
}
Object.assign(Game.prototype, Realm);
