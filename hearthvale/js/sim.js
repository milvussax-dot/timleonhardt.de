// Spielzustand und Simulation: Zeit, Wetter, Farm, Siedler, Gebäude, Wirtschaft, Speichern
import {
  G, ITEMS, CROPS, BUILDINGS, ACTIONS, FREE_GROUND, BLOCK_OBJ, DAY_START, DAY_END, SEC_PER_HOUR, DAYS_PER_SEASON, YEAR_DAYS,
  MAX_ENERGY, CAN_SIZE, SETTLER_SPEED, PLAYER_SPEED, PATH_BONUS, WORK_TIME, START_STOCK, START_COINS, SETTLER_VALUE, FOOD_ORDER, STOCK_ORDER,
} from './data.js';
import { World, generate, findPath, nextTo, nextToRect, mulberry, hash } from './world.js';

const DAY_LEN = (DAY_END - DAY_START) * SEC_PER_HOUR;
const HAT_COLORS = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9c6ade', '#e9c46a', '#2a9d8f'];
const ENERGY_FOOD = { bread: 25, pumpkin: 30, fish: 12, carrot: 6, berry: 5 };

export class Game {
  /* ---------- Neues Spiel ---------- */
  static create(seed, mode, week) {
    const { world, start } = generate(seed);
    const g = new Game();
    Object.assign(g, {
      world, seed, mode, week, day: 1, time: 0, weather: 'sun', coins: START_COINS, energy: MAX_ENERGY, water: CAN_SIZE,
      stock: {}, buildings: [], settlers: [], nextId: 1, seedKind: 'wheat', autoSell: {}, yearScore: null, submitted: false,
      fed: true, starving: 0, totals: { harvested: 0, produced: 0, sold: 0 },
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
  }
  resetDayStats() { this.today = { gathered: {}, produced: {}, harvested: {}, eaten: 0, needed: 0, born: 0, left: 0, earned: 0, sold: {} }; }

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
    this.builderCheck = (this.builderCheck || 0) - dt;
    if (this.builderCheck <= 0) { this.builderCheck = 1.5; this.ensureBuilder(); }
    for (const b of this.buildings) if (b.anim != null) b.anim += dt;
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].t += dt; if (this.fx[i].t > 1.4) this.fx.splice(i, 1); }
    if (this.time >= DAY_LEN) return this.endDay();
    return null;
  }

  toast(msg) { this.toasts.push({ msg, t: performance.now() }); }
  floatText(x, y, text, color) { this.fx.push({ x, y, text, color: color || '#fff', t: 0 }); }

  /* ---------- Lager und Wirtschaft ---------- */
  add(item, n, kind) {
    this.stock[item] = (this.stock[item] || 0) + n;
    if (kind) this.today[kind][item] = (this.today[kind][item] || 0) + n;
  }
  has(cost) { for (const k in cost) if ((this.stock[k] || 0) < cost[k]) return false; return true; }
  pay(cost) { for (const k in cost) this.stock[k] -= cost[k]; }
  get beds() { return this.buildings.filter((b) => b.type === 'house' && b.built).length * BUILDINGS.house.beds; }
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
  buy(item, n) {
    const price = ITEMS[item].price * n;
    if (this.coins < price) return false;
    this.coins -= price; this.stock[item] += n;
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
    let bV = 0;
    for (const b of this.buildings) if (b.built && BUILDINGS[b.type].cost) for (const k in BUILDINGS[b.type].cost) bV += BUILDINGS[b.type].cost[k] * ITEMS[k].price;
    let paths = 0;
    for (let i = 0; i < this.world.ground.length; i++) if (this.world.ground[i] === G.PATH) paths++;
    bV += paths * ITEMS.stone.price;
    const sV = this.settlers.length * SETTLER_VALUE;
    return { coins: this.coins, stock: stockV, buildings: bV, settlers: sV, total: Math.round(this.coins + stockV + bV + sV) };
  }

  /* ---------- Gebäude ---------- */
  buildingAt(x, y) { const id = this.world.inb(x, y) ? this.world.bld[y * this.world.w + x] : -1; return id >= 0 ? this.byId(id) : null; }
  byId(id) { return this.buildings.find((b) => b.id === id) || null; }
  canPlace(type, x, y) {
    const def = BUILDINGS[type], w = this.world;
    if (type === 'path') {
      if (!w.inb(x, y)) return 'Außerhalb der Karte.';
      const gr = w.g(x, y);
      if (!(FREE_GROUND.has(gr) || gr === G.SAND) || w.o(x, y) || w.bld[w.i(x, y)] >= 0) return 'Hier geht kein Weg.';
      return null;
    }
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      if (!w.isFree(x + dx, y + dy)) return 'Der Platz ist nicht frei.';
      const px = Math.floor(this.player.x), py = Math.floor(this.player.y);
      if (px === x + dx && py === y + dy) return 'Du stehst im Weg.';
    }
    // die Tür (unten Mitte) muss erreichbar sein
    if (!w.walkable(x + (def.w >> 1), y + def.h)) return 'Unter dem Gebäude braucht es ein freies Feld für die Tür.';
    if (def.nearWater && !w.nearWater(x + 1, y + 1, def.nearWater)) return 'Die Fischerhütte muss nah am Wasser stehen.';
    if (!this.stillConnected(x, y, def.w, def.h)) return 'So wären Türen oder du selbst eingesperrt. Lass einen Weg frei.';
    return null;
  }
  // Prüft, ob nach dem Bauen alle Türen und der Spieler noch zusammenhängend erreichbar sind
  stillConnected(bx, by, bw, bh) {
    const w = this.world, W = w.w;
    const inFoot = (x, y) => x >= bx && x < bx + bw && y >= by && y < by + bh;
    const ok = (x, y) => w.walkable(x, y) && !inFoot(x, y);
    const targets = this.buildings.map((b) => this.door(b));
    if (targets.some((t) => inFoot(t.x, t.y))) return false;   // eine Tür zubauen geht nie
    targets.push({ x: bx + (bw >> 1), y: by + bh });
    const p = { x: Math.floor(this.player.x), y: Math.floor(this.player.y) };
    if (ok(p.x, p.y)) targets.push(p);
    const start = targets.find((t) => ok(t.x, t.y));
    if (!start) return false;
    const seen = new Uint8Array(W * w.h), q = [start.y * W + start.x];
    seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(), cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!ok(nx, ny) || seen[ny * W + nx]) continue;
        if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
        seen[ny * W + nx] = 1; q.push(ny * W + nx);
      }
    }
    return targets.every((t) => !ok(t.x, t.y) || seen[t.y * W + t.x]);
  }
  place(type, x, y) {
    const def = BUILDINGS[type];
    const err = this.canPlace(type, x, y);
    if (err) return err;
    if (!this.has(def.cost)) return 'Dafür fehlen Rohstoffe.';
    this.pay(def.cost);
    if (type === 'path') { this.world.setGround(x, y, G.PATH); return null; }
    const b = this.forcePlace(type, x, y, false);
    // Siedler, die jetzt im Gebäude stehen, an die Seite schieben
    for (const s of this.settlers) if (this.world.bld[this.world.i(Math.floor(s.x), Math.floor(s.y))] === b.id) { s.x = b.x + (b.w >> 1) + 0.5; s.y = b.y + b.h + 0.5; s.path = null; }
    return null;
  }
  forcePlace(type, x, y, built = true) {
    const def = BUILDINGS[type], w = this.world;
    const b = { id: this.nextId++, type, x, y, w: def.w, h: def.h, built, progress: built ? 1 : 0, worker: null, in: {}, out: {}, fields: [], anim: 0 };
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
    // Siedler ohne Bett ziehen weiter, wenn es zu wenig Betten gibt
    while (this.settlers.length > Math.max(this.beds, 0) && this.settlers.length > 0 && b.type === 'house') this.removeSettler(this.settlers[this.settlers.length - 1]);
    return null;
  }
  door(b) { return { x: b.x + (b.w >> 1), y: b.y + b.h }; }
  // wie viele Ziele (Bäume, Felsen, Wasser, freie Plätze) ein Sammelgebäude an dieser Stelle hätte
  targetsInRange(type, bx, by) {
    const def = BUILDINGS[type];
    if (!def.radius || def.job === 'farm') return null;
    const w = this.world, cx = bx + 1, cy = by + 1, R = def.radius;
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
    const open = this.buildings.some((b) => !b.built && !(b.blockedUntil > this.clock));
    if (!open || this.settlers.some((s) => s.job == null)) return;
    const rank = (s) => { const b = this.byId(s.job); return (b && b.paused ? 0 : 2) + (s.state === 'seek' && s.timer > 0 ? 0 : 1); };
    const cand = this.settlers.filter((s) => !s.carry && s.state !== 'working').sort((a, c) => rank(a) - rank(c))[0];
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
  removeSettler(s) {
    this.resetSettler(s);
    this.settlers = this.settlers.filter((o) => o !== s);
  }
  resetSettler(s) {
    if (s.target != null) this.reserved.delete(s.target);
    if (s.carry) { this.add(s.carry.item, s.carry.n); s.carry = null; }
    if (s.job != null) { const b = this.byId(s.job); if (b && b.worker === s.id) b.worker = null; }
    Object.assign(s, { job: null, state: 'idle', path: null, pi: 0, after: null, dest: null, timer: 0, task: null, target: null, carry: null, work: null });
  }
  goTo(s, goal, hx, hy, after) {
    const sx = Math.floor(s.x), sy = Math.floor(s.y);
    if (goal(sx, sy)) { s.state = after; s.path = null; return true; }
    const path = findPath(this.world, sx, sy, goal, hx, hy);
    if (!path) return false;
    s.path = path; s.pi = 0; s.after = after; s.dest = { goal, hx, hy };
    s.state = 'walk';
    return true;
  }
  // bewegt ein Wesen (Siedler oder Spieler) am Pfad entlang. Liefert true, wenn angekommen.
  follow(e, dist) {
    while (dist > 0 && e.path) {
      const n = e.path[e.pi];
      if (!this.world.walkable(n.x, n.y)) {   // Weg versperrt: neu suchen
        const d = e.dest;
        const p = d ? findPath(this.world, Math.floor(e.x), Math.floor(e.y), d.goal, d.hx, d.hy) : null;
        if (p && p.length) { e.path = p; e.pi = 0; continue; }
        e.path = null; return 'blocked';
      }
      const tx = n.x + 0.5, ty = n.y + 0.5, dx = tx - e.x, dy = ty - e.y, len = Math.hypot(dx, dy);
      const g = this.world.g(Math.floor(e.x), Math.floor(e.y));
      const bonus = g === G.PATH || g === G.BRIDGE ? PATH_BONUS : 1, step = dist * bonus;
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
  isBad(k) { const t = this.bad.get(k); if (t == null) return false; if (t < this.clock) { this.bad.delete(k); return false; } return true; }

  think(s) {
    // Job weg? (abgerissen)
    if (s.job != null && !this.byId(s.job)) this.resetSettler(s);
    if (s.state === 'atTarget') return this.startWork(s);
    if (s.state === 'working' && !s.work) s.state = 'seek';
    if (s.state === 'deliver') {   // Ware ins Lager bringen
      const st = this.nearestStorage(s.x, s.y);
      if (!st) { s.timer = 2; return; }
      if (!this.goTo(s, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 'drop')) { s.timer = 2; }
      return;
    }
    if (s.state === 'drop') {
      if (s.carry) { this.add(s.carry.item, s.carry.n, s.carry.kind || 'gathered'); this.floatText(s.x, s.y - 0.6, `+${s.carry.n} ${ITEMS[s.carry.item].name}`, ITEMS[s.carry.item].color); s.carry = null; }
      s.state = s.job != null ? 'seek' : 'idle';
      return;
    }
    if (s.job == null) return this.thinkIdle(s);
    const b = this.byId(s.job), def = BUILDINGS[b.type];
    if (b.paused && !s.carry) {
      const d = this.door(b);
      if (Math.abs(s.x - d.x - 0.5) + Math.abs(s.y - d.y - 0.5) > 1.5) { if (this.goTo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 'seek')) return; }
      s.state = 'seek'; s.timer = 2; return;
    }
    if (def.job === 'process') return this.thinkProcess(s, b, def);
    if (def.job === 'farm') return this.thinkFarm(s, b, def);
    return this.thinkGather(s, b, def);
  }

  thinkIdle(s) {
    // 1. weiterbauen oder eine Baustelle übernehmen
    if (s.task && s.task.site != null) {
      const site = this.byId(s.task.site);
      if (site && !site.built && s.state === 'building') return this.buildTick(s, site);
      s.task = null;
    }
    for (const site of this.buildings) {
      if (site.built || site.blockedUntil > this.clock) continue;
      const builders = this.settlers.filter((o) => o !== s && o.task && o.task.site === site.id).length;
      if (builders >= 2) continue;
      if (this.goTo(s, nextToRect(site.x, site.y, site.w, site.h), site.x + 1, site.y + 1, 'building')) {
        s.task = { site: site.id };
        if (s.state === 'building') this.buildTick(s, site);
        return;
      }
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
    // 3. herumschlendern
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
    const target = this.findTarget(s, b, def);
    if (!target) {   // nichts zu tun: an der Hütte warten
      const d = this.door(b);
      if (Math.abs(s.x - d.x - 0.5) + Math.abs(s.y - d.y - 0.5) > 1.5) this.goTo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 'seek');
      s.timer = 3;
      return;
    }
    s.target = target.k; this.reserved.add(target.k);
    s.task = { job: def.job, x: target.x, y: target.y, k: target.k };
    s.state = 'walk'; s.after = 'atTarget';
    s.path = target.path; s.pi = 0; s.dest = { goal: nextTo(target.x, target.y), hx: target.x, hy: target.y };
    if (!s.path.length) { s.path = null; s.state = 'atTarget'; }
  }
  // sucht das nächste passende Ziel im Radius des Gebäudes, das erreichbar ist
  findTarget(s, b, def) {
    const w = this.world, cx = b.x + 1, cy = b.y + 1, R = def.radius;
    const cands = [];
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (!w.inb(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      const k = w.i(x, y);
      if (this.reserved.has(k) || this.isBad(k)) continue;
      if (this.validTarget(def.job, x, y, b)) cands.push({ x, y, k, d: Math.abs(x - s.x) + Math.abs(y - s.y) });
    }
    cands.sort((a, c) => a.d - c.d);
    for (let i = 0; i < Math.min(cands.length, 6); i++) {
      const c = cands[i];
      const path = findPath(w, Math.floor(s.x), Math.floor(s.y), nextTo(c.x, c.y), c.x, c.y, 3000);
      if (path) return { ...c, path };
      this.markBad(c.k);
    }
    return null;
  }
  validTarget(job, x, y, b) {
    const w = this.world, o = w.o(x, y), g = w.g(x, y);
    if (job === 'chop') return o && o.t === 'tree' && o.age >= 4;
    if (job === 'mine') {
      if (o && o.t === 'rock') return true;
      if (g !== G.MOUNTAIN) return false;
      return w.walkable(x + 1, y) || w.walkable(x - 1, y) || w.walkable(x, y + 1) || w.walkable(x, y - 1);
    }
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
    const w = this.world, season = this.season;
    // Felder aufräumen
    b.fields = b.fields.filter((k) => w.ground[k] === G.SOIL && (!w.obj[k] || w.obj[k].t === 'crop') && w.bld[k] < 0);
    const tasks = [];
    for (const k of b.fields) {
      if (this.reserved.has(k)) continue;
      const o = w.obj[k], x = k % w.w, y = (k / w.w) | 0;
      if (o && o.t === 'crop' && o.grown >= CROPS[o.kind].days) tasks.push({ x, y, k, task: 'harvest', p: 0 });
      else if (!o && CROPS.wheat.seasons.includes(season)) tasks.push({ x, y, k, task: 'sow', p: 1 });
      else if (o && o.t === 'crop' && !w.wet[k] && this.weather !== 'rain') tasks.push({ x, y, k, task: 'water', p: 2 });
    }
    if (!tasks.length && b.fields.length < def.fields && CROPS.wheat.seasons.includes(season)) {
      const cx = b.x + 1, cy = b.y + 1, R = def.radius + 1;
      for (let y = cy - R; y <= cy + R && tasks.length < 3; y++) for (let x = cx - R; x <= cx + R; x++) {
        if (!w.isFree(x, y) || this.reserved.has(w.i(x, y)) || this.isBad(w.i(x, y))) continue;
        let nearBld = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.inb(x + dx, y + dy) && w.bld[w.i(x + dx, y + dy)] >= 0 && !(dx === 0 && dy === 0)) {
          const ob = this.byId(w.bld[w.i(x + dx, y + dy)]);
          if (ob && ob !== b) nearBld = true;
        }
        const dd = this.door(b);
        if (nearBld || (Math.abs(x - dd.x) <= 1 && y === dd.y)) continue;
        tasks.push({ x, y, k: w.i(x, y), task: 'till', p: 3 });
      }
    }
    tasks.sort((a, c) => a.p - c.p || (Math.abs(a.x - s.x) + Math.abs(a.y - s.y)) - (Math.abs(c.x - s.x) + Math.abs(c.y - s.y)));
    for (const t of tasks.slice(0, 5)) {
      const path = findPath(w, Math.floor(s.x), Math.floor(s.y), nextTo(t.x, t.y), t.x, t.y, 3000);
      if (!path) { this.markBad(t.k); continue; }
      s.target = t.k; this.reserved.add(t.k);
      s.task = { job: 'farm', farmTask: t.task, x: t.x, y: t.y, k: t.k };
      s.path = path; s.pi = 0; s.after = 'atTarget'; s.dest = { goal: nextTo(t.x, t.y), hx: t.x, hy: t.y };
      s.state = path.length ? 'walk' : 'atTarget';
      if (!path.length) s.path = null;
      return;
    }
    const d = this.door(b);
    if (Math.abs(s.x - d.x - 0.5) + Math.abs(s.y - d.y - 0.5) > 1.5) this.goTo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 'seek');
    s.timer = 3;
  }

  thinkProcess(s, b, def) {
    const r = def.recipe, w = this.world;
    if (s.state === 'working') return;
    const atB = nextToRect(b.x, b.y, b.w, b.h)(Math.floor(s.x), Math.floor(s.y));
    // Fertige Ware wegbringen
    const outItem = Object.keys(r.out)[0];
    if ((b.out[outItem] || 0) > 0 && !s.carry) {
      if (!atB) { if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'seek')) s.timer = 2; return; }
      s.carry = { item: outItem, n: b.out[outItem], kind: 'produced' }; b.out[outItem] = 0;
      s.state = 'deliver';
      return;
    }
    // Zutaten mitgebracht? abliefern
    if (s.carry && s.state === 'bring') {
      if (!atB) { if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'bring')) s.timer = 2; return; }
      b.in[s.carry.item] = (b.in[s.carry.item] || 0) + s.carry.n; s.carry = null; s.state = 'seek';
      return;
    }
    const hasIn = Object.keys(r.in).every((k) => (b.in[k] || 0) >= r.in[k]);
    if (hasIn) {
      if (!atB) { if (!this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'seek')) s.timer = 2; return; }
      s.state = 'working'; s.work = { type: 'process', b: b.id }; s.timer = r.time; b.anim = b.anim || 0;
      return;
    }
    // Zutaten aus dem Lager holen
    const need = {};
    for (const k in r.in) need[k] = r.in[k] - (b.in[k] || 0);
    const item = Object.keys(need).find((k) => need[k] > 0);
    const amount = need[item] * 2;   // gleich für zwei Durchgänge
    if (s.state === 'fetched') {
      const n = Math.min(amount, this.stock[item] || 0);
      if (n >= need[item]) { this.stock[item] -= n; s.carry = { item, n }; s.state = 'bring'; return; }
      s.state = 'seek'; s.timer = 3; return;
    }
    if ((this.stock[item] || 0) >= need[item]) {
      const st = this.nearestStorage(s.x, s.y);
      if (st && this.goTo(s, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 'fetched')) return;
    }
    // nichts da: warten
    if (!atB) this.goTo(s, nextToRect(b.x, b.y, b.w, b.h), b.x + 1, b.y + 1, 'seek');
    s.timer = 3;
  }

  // nach Ankunft am Ziel: Arbeit beginnen (aus think heraus über state 'atTarget')
  startWork(s) {
    const t = s.task, w = this.world;
    if (!t) { s.state = 'seek'; return; }
    const job = t.job === 'farm' ? t.farmTask : t.job;
    const valid = t.job === 'farm' ? true : this.validTarget(t.job, t.x, t.y, this.byId(s.job));
    if (!valid) { this.releaseTarget(s); s.state = 'seek'; return; }
    s.state = 'working';
    s.work = { type: 'job', job, x: t.x, y: t.y };
    s.timer = WORK_TIME[job] || 2;
    const dx = t.x + 0.5 - s.x, dy = t.y + 0.5 - s.y;
    s.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  }

  finishWork(s, work) {
    const w = this.world;
    if (work.type === 'build') {
      const site = this.byId(work.site);
      if (site && !site.built) {
        site.progress += 1 / Math.max(1, BUILDINGS[site.type].build);
        if (site.progress >= 1) { site.built = true; site.progress = 1; this.toast(`${BUILDINGS[site.type].name} ist fertig.`); for (let dy = 0; dy < site.h; dy++) for (let dx = 0; dx < site.w; dx++) w.touch(site.x + dx, site.y + dy); }
      }
      if (site && !site.built) { s.state = 'building'; } else { s.state = 'idle'; s.task = null; }
      return;
    }
    if (work.type === 'process') {
      const b = this.byId(work.b);
      if (b) {
        const r = BUILDINGS[b.type].recipe;
        if (Object.keys(r.in).every((k) => (b.in[k] || 0) >= r.in[k])) {
          for (const k in r.in) b.in[k] -= r.in[k];
          for (const k in r.out) b.out[k] = (b.out[k] || 0) + r.out[k];
        }
      }
      s.state = 'seek';
      return;
    }
    // Sammel- und Feldarbeit
    const { job, x, y } = work, k = w.i(x, y), o = w.obj[k];
    this.releaseTarget(s);
    s.state = 'seek';
    if (job === 'chop' && o && o.t === 'tree') { w.obj[k] = null; s.carry = { item: 'wood', n: o.kind === 'oak' ? 3 : 2, kind: 'gathered' }; s.state = 'deliver'; }
    else if (job === 'mine') {
      if (o && o.t === 'rock') { if (o.size > 1) o.size--; else w.obj[k] = null; s.carry = { item: 'stone', n: 3, kind: 'gathered' }; }
      else s.carry = { item: 'stone', n: 2, kind: 'gathered' };
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
      const r = 0.28, ok = (x, y) => this.world.walkable(Math.floor(x - r), Math.floor(y - r)) && this.world.walkable(Math.floor(x + r), Math.floor(y - r)) && this.world.walkable(Math.floor(x - r), Math.floor(y + r * 0.6)) && this.world.walkable(Math.floor(x + r), Math.floor(y + r * 0.6));
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
    const o = w.o(tx, ty), g = w.g(tx, ty), k = w.i(tx, ty);
    let act = null;
    if (o && o.t === 'tree') act = 'chop';
    else if (o && o.t === 'rock') act = 'mine';
    else if (o && o.t === 'bush') { if (o.berries) act = 'pick'; else return { msg: 'Der Strauch trägt gerade keine Beeren.' }; }
    else if (o && o.t === 'crop') {
      const c = CROPS[o.kind];
      if (o.grown >= c.days) act = 'harvest';
      else if (tool === 'can') act = 'water';
      else return { msg: `${c.name}: ${o.grown} von ${c.days} Tagen gewachsen, ${w.wet[k] || this.weather === 'rain' ? 'heute gegossen' : 'heute noch nicht gegossen'}.` };
    }
    else if (w.isWater(tx, ty)) { if (tool === 'can') act = 'refill'; else return this.walkTo(tx, ty); }
    else if (g === G.SOIL) {
      if (tool === 'seed') act = 'plant';
      else if (tool === 'can') act = 'water';
      else if (tool !== 'hoe') return { msg: 'Gehackter Boden. Wähl Saatgut, um hier zu säen.' };
    }
    else if (tool === 'hoe' && w.isFree(tx, ty)) act = 'till';
    if (!act) return this.walkTo(tx, ty);
    // Voraussetzungen
    const A = ACTIONS[act];
    if (this.energy < A.energy) return { msg: 'Du bist zu müde. Iss etwas (Energie antippen) oder geh schlafen.' };
    if (act === 'water' && this.water <= 0) return { msg: 'Die Gießkanne ist leer. Füll sie am Wasser auf.' };
    if (act === 'plant') {
      const c = CROPS[this.seedKind];
      if (!c.seasons.includes(this.season)) return { msg: `${c.name} wächst nicht im ${['Frühling', 'Sommer', 'Herbst', 'Winter'][this.season]}.` };
      if ((this.stock[c.seed] || 0) <= 0) return { msg: `Keine ${ITEMS[c.seed].name} mehr. Am Markt gibt es Nachschub.` };
    }
    const a = { type: act, x: tx, y: ty };
    const px = Math.floor(p.x), py = Math.floor(p.y);
    if (Math.max(Math.abs(px - tx), Math.abs(py - ty)) === 1) { this.beginAction(a); return null; }
    const path = findPath(w, px, py, nextTo(tx, ty), tx, ty);
    if (!path) return { msg: 'Da kommst du nicht hin.' };
    p.path = path.length ? path : null; p.pi = 0; p.dest = { goal: nextTo(tx, ty), hx: tx, hy: ty };
    if (!p.path) this.beginAction(a); else p.pending = a;
    return null;
  }
  walkTo(tx, ty) {
    const p = this.player, w = this.world;
    const goal = w.walkable(tx, ty) ? (x, y) => x === tx && y === ty : nextTo(tx, ty);
    const path = findPath(w, Math.floor(p.x), Math.floor(p.y), goal, tx, ty);
    if (!path) return { msg: 'Da kommst du nicht hin.' };
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
    const done = (msg, item, n) => { this.energy = Math.max(0, this.energy - A.energy); if (item) { this.add(item, n, a.type === 'harvest' ? 'harvested' : 'gathered'); this.floatText(a.x + 0.5, a.y, `+${n} ${ITEMS[item].name}`, ITEMS[item].color); } };
    switch (a.type) {
      case 'chop': if (o && o.t === 'tree') { const n = o.age < 4 ? 1 : (o.kind === 'oak' ? 3 : 2); w.obj[k] = null; done('', 'wood', n); } break;
      case 'mine': if (o && o.t === 'rock') { if (o.size > 1) o.size--; else w.obj[k] = null; done('', 'stone', 3); } break;
      case 'pick': if (o && o.t === 'bush' && o.berries) { o.berries = false; o.regrow = 3; done('', 'berry', 3); } break;
      case 'till': if (w.isFree(a.x, a.y)) { w.setGround(a.x, a.y, G.SOIL); done(); } break;
      case 'water': if (w.ground[k] === G.SOIL && this.water > 0) { w.wet[k] = 1; w.touch(a.x, a.y); this.water--; done(); } break;
      case 'refill': this.water = CAN_SIZE; this.floatText(a.x + 0.5, a.y, 'Kanne voll', '#9fd4ff'); break;
      case 'plant': { const c = CROPS[this.seedKind]; if (w.ground[k] === G.SOIL && !o && this.stock[c.seed] > 0) { this.stock[c.seed]--; w.obj[k] = { t: 'crop', kind: this.seedKind, grown: 0 }; done(); } break; }
      case 'harvest': if (o && o.t === 'crop' && o.grown >= CROPS[o.kind].days) { const [item, n] = CROPS[o.kind].yield; w.obj[k] = null; done('', item, n); if (this.rng() < 0.5) this.stock[CROPS[o.kind].seed]++; } break;
    }
  }

  /* ---------- Tagesende ---------- */
  endDay() {
    const w = this.world, season = this.season, rained = this.weather === 'rain';
    const sum = { day: this.day, season, ...this.today, harvestTotal: 0, events: [] };
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
    const need = this.settlers.length;
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
        const home = houses.find((h) => this.settlers.filter((s) => s.home === h.id).length < BUILDINGS.house.beds) || houses[0];
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
    this.rng = mulberry(hash(this.seed + ':' + this.day));
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
    const enc = (arr) => { let s = ''; for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000)); return btoa(s); };
    const objs = [];
    w.obj.forEach((o, k) => { if (o) objs.push([k, o]); });
    return JSON.stringify({
      v: 1, seed: this.seed, mode: this.mode, week: this.week, day: this.day, time: this.time, weather: this.weather,
      coins: this.coins, energy: this.energy, water: this.water, stock: this.stock, seedKind: this.seedKind, autoSell: this.autoSell,
      yearScore: this.yearScore, submitted: this.submitted, fed: this.fed, starving: this.starving, totals: this.totals, nextId: this.nextId,
      ground: enc(w.ground), wet: enc(w.wet), objs,
      buildings: this.buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, built: b.built, progress: b.progress, in: b.in, out: b.out, fields: b.fields, paused: !!b.paused })),
      settlers: this.settlers.map((s) => ({ id: s.id, x: s.x, y: s.y, home: s.home, hat: s.hat })),
      player: { x: this.player.x, y: this.player.y },
    });
  }
  static load(json) {
    const d = JSON.parse(json);
    if (!d || d.v !== 1) return null;
    const g = new Game();
    const w = new World();
    const dec = (s, arr) => { const bin = atob(s); for (let i = 0; i < arr.length; i++) arr[i] = bin.charCodeAt(i); };
    dec(d.ground, w.ground); dec(d.wet, w.wet);
    for (const [k, o] of d.objs) w.obj[k] = o;
    Object.assign(g, {
      world: w, seed: d.seed, mode: d.mode, week: d.week, day: d.day, time: d.time, weather: d.weather, coins: d.coins, energy: d.energy, water: d.water,
      stock: d.stock, seedKind: d.seedKind || 'wheat', autoSell: d.autoSell || {}, yearScore: d.yearScore, submitted: d.submitted, fed: d.fed !== false, starving: d.starving || 0,
      totals: d.totals || { harvested: 0, produced: 0, sold: 0 }, nextId: d.nextId, buildings: [], settlers: [],
    });
    for (const k in ITEMS) if (g.stock[k] == null) g.stock[k] = 0;
    for (const b of d.buildings) {
      const def = BUILDINGS[b.type];
      const nb = { ...b, w: def.w, h: def.h, worker: null, in: b.in || {}, out: b.out || {}, fields: b.fields || [], anim: 0 };
      g.buildings.push(nb);
      for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) w.bld[w.i(b.x + dx, b.y + dy)] = b.id;
    }
    for (const s of d.settlers) g.settlers.push({ ...s, walkT: 0 });
    g.player = { x: d.player.x, y: d.player.y, path: null, pi: 0, facing: 2, action: null, moving: false, walkT: 0 };
    g.resetDayStats();
    g.init();
    w.touchAll();
    return g;
  }
}
