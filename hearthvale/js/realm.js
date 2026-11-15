// Reich: Land und Grenzen, Erkundung, fremde Stämme, Soldaten und Kämpfe, Boote, Ausbau, Schatztruhen, Ziele.
// Die Methoden werden in sim.js an die Klasse Game gehängt und arbeiten mit deren Zustand.
import { G, BUILDINGS, ITEMS, TERRITORY, HOUSE_LEVELS, UPGRADE, UNITS, TRAIN_TIME, BARRACKS_LEVELS, SHIPYARD_LEVELS, WARSHIP, TRIBES, FOE, QUESTS, SEC_PER_HOUR, SETTLER_SPEED, SETTLER_VALUE, STOCK_ORDER } from './data.js?v=11';
import { findPath, nextToRect, mulberry, hash, pickTribeSites, sprinkleChests, carveTrails } from './world.js?v=11';

export const CAMP_R = 8;        // so weit reicht das Land eines Stammes
export const FIRST_RAID = 8;    // vorher greift niemand an
const ALARM_R = 10;             // kommen Soldaten so nah, verteidigt sich das Lager
const REACH = 0.95, HIT_CD = 0.9;
const RANKS = [2, 5, 9];        // Siege bis zum nächsten Rang
const COMPASS = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const STATS0 = { bread: 0, iron: 0, chests: 0, repelled: 0, conquered: 0, trained: 0, archers: 0, boats: 0 };
const costText = (c) => Object.keys(c || {}).map((k) => `${c[k]} ${ITEMS[k].name}`).join(', ');

export const QUEST_TEST = {
  bread: (g) => g.stats.bread > 0,
  explore25: (g) => g.explored() >= 0.1,
  tribe: (g) => g.tribes.some((t) => t.discovered),
  stonehouse: (g) => g.buildings.some((b) => b.type === 'house' && (b.level || 1) >= 2),
  iron: (g) => g.stats.iron > 0,
  soldiers: (g) => g.stats.trained >= 3,
  archers: (g) => g.stats.archers >= 3,
  drill: (g) => g.buildings.some((b) => b.type === 'barracks' && (b.level || 1) >= 2),
  warship: (g) => g.fleet[3] > 0,
  tower: (g) => g.buildings.some((b) => b.type === 'tower' && g.manned(b)),
  treasure: (g) => g.stats.chests >= 3,
  boat: (g) => g.boats > 0,
  raid: (g) => g.stats.repelled > 0,
  conquer: (g) => g.stats.conquered > 0,
  townhouse: (g) => g.buildings.some((b) => b.type === 'house' && (b.level || 1) >= 3),
  explore60: (g) => g.explored() >= 0.3,
  allTribes: (g) => g.tribes.length > 0 && g.tribes.every((t) => t.defeated),
};

export const Realm = {
  /* ---------- Einrichtung ---------- */
  setupRealm(sites) {
    this.tribes = []; this.soldiers = []; this.boats = 0; this.fleet = [0, 0, 0, 0]; this.quests = []; this.stats = { ...STATS0 };
    if (this.seenCount == null) this.seenCount = 0;
    const rnd = mulberry(hash(this.seed + ':stämme'));
    const pool = TRIBES.filter((t) => t.key !== 'nebelfischer');
    for (const p of sites) {
      const def = p.island ? TRIBES.find((t) => t.key === 'nebelfischer') : pool.shift();
      if (!def) continue;
      const t = this.makeCamp(def, p.x, p.y, !!p.island, rnd);
      if (t) this.tribes.push(t);
    }
  },
  // Ältere Spielstände bekommen Stämme, Truhen und eine erkundete Umgebung
  upgradeOld() {
    const hut = this.buildings.find((b) => b.type === 'hut') || this.buildings[0];
    const start = { x: hut.x + 1, y: hut.y + hut.h };   // vor der Tür, nicht im Gebäude
    const rnd = mulberry(hash(this.seed + ':ausbau'));
    const avoid = this.buildings.map((b) => ({ x: b.x, y: b.y }));
    const sites = pickTribeSites(this.world, start, rnd, 3, avoid);
    carveTrails(this.world, start, sites);
    this.seenCount = 0;
    this.setupRealm(sites);
    sprinkleChests(this.world, rnd, [...avoid.map((p) => ({ ...p, r: 12 })), ...sites.map((p) => ({ ...p, r: 7 }))], 9);
    for (const b of this.buildings) this.reveal(b.x + b.w / 2, b.y + b.h / 2, 12);
    this.reveal(this.player.x, this.player.y, 9);
    this.world.touchAll();
  },
  makeCamp(def, cx, cy, island, rnd) {
    const w = this.world, ti = this.tribes.length;
    const ok = (x, y) => w.inb(x, y) && !w.isWater(x, y) && w.g(x, y) !== G.MOUNTAIN && w.g(x, y) !== G.BRIDGE && w.bld[w.i(x, y)] < 0 && w.tstruct[w.i(x, y)] < 0;
    const fits = (x, y, ww, hh) => { for (let dy = 0; dy < hh; dy++) for (let dx = 0; dx < ww; dx++) if (!ok(x + dx, y + dy)) return false; return true; };
    let hx = null, hy = null;
    for (const [ox, oy] of [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx - 1 + ox, y = cy - 1 + oy;
      if (fits(x, y, 3, 3) && ok(x + 1, y + 3)) { hx = x; hy = y; break; }
    }
    if (hx == null) return null;
    const mark = (r) => { for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) { const k = w.i(r.x + dx, r.y + dy); w.tstruct[k] = ti; w.obj[k] = null; if (w.ground[k] === G.FOREST) w.ground[k] = G.GRASS; } };
    const hall = { x: hx, y: hy, w: 3, h: 3 };
    mark(hall);
    for (let dx = -1; dx <= 1; dx++) { const x = hx + 1 + dx, y = hy + 3; if (w.inb(x, y) && w.obj[w.i(x, y)] && w.obj[w.i(x, y)].t !== 'chest') w.obj[w.i(x, y)] = null; }
    const ccx = hx + 1, ccy = hy + 1, huts = [];
    const spots = island ? [[-4, -1], [3, -1], [-1, -4], [-4, 1], [3, 1]] : [[-5, -3], [4, -3], [-5, 2], [4, 2], [-1, -5]];
    for (const [ox, oy] of spots) {
      if (huts.length >= (island ? 2 : 4)) break;
      const x = ccx + ox, y = ccy + oy;
      if (!fits(x, y, 2, 2)) continue;
      const r = { x, y, w: 2, h: 2 }; mark(r); huts.push(r);
    }
    w.touchAll();
    return {
      key: def.key, name: def.name, color: def.color, atk: def.atk, hp: def.hp, grow: def.grow, cap: def.start + 8, cap0: def.start + 8, chiefDead: false, chiefOut: false,
      cx: ccx, cy: ccy, hall, huts, island, warriors: def.start, acc: 0, discovered: false, defeated: false,
      raidIn: 1 + ti * 2 + Math.floor(rnd() * 3), raidAt: null, peaceUntil: 0, gifts: 0, raid: null,
    };
  },
  markCamps() {   // nach dem Laden: Hütten der Stämme blockieren wieder
    const w = this.world;
    w.tstruct.fill(-1);
    this.tribes.forEach((t, ti) => {
      if (t.defeated) return;
      for (const r of [t.hall, ...t.huts]) for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) if (w.inb(r.x + dx, r.y + dy)) w.tstruct[w.i(r.x + dx, r.y + dy)] = ti;
    });
  },
  // flüchtiger Zustand nach Start und Laden
  initRealm() {
    this.foes = []; this.ships = []; this.shots = [];
    this.realmT = 0; this.garT = 1; this.questT = 1;
    this.fogVer = (this.fogVer || 0) + 1;
    for (const t of this.tribes) t.raid = null;
    this.recomputeLand();
    this.updateVision();
  },
  updateRealm(dt) {
    for (const t of this.tribes) if (t.raidAt != null && !t.defeated && this.time >= t.raidAt) { t.raidAt = null; this.launchRaid(t); }
    this.updateBarracks(dt);
    for (const s of this.soldiers.slice()) if (this.soldiers.includes(s)) this.updateSoldier(s, dt);
    for (const f of this.foes.slice()) if (this.foes.includes(f)) this.updateFoe(f, dt);
    this.updateShips(dt);
    this.updateShots(dt);
    if ((this.realmT -= dt) <= 0) { this.realmT = 0.5; this.updateVision(); }
    if ((this.garT -= dt) <= 0) { this.garT = 2; this.assignGarrisons(); }
    if ((this.questT -= dt) <= 0) { this.questT = 1; this.checkQuests(); }
    if (this.landDirty) { this.landDirty = false; this.recomputeLand(); }
  },

  /* ---------- Land ---------- */
  territoryOf(b) {
    if (!b.built) return 0;
    if (b.type === 'tower' || b.type === 'fort') return this.manned(b) ? TERRITORY[b.type] : 3;
    if (b.type === 'house') return TERRITORY.house + (b.level || 1) - 1;
    return TERRITORY[b.type] || 3;
  },
  manned(b) { return this.soldiers.some((s) => s.home === b.id && s.arrived); },
  recomputeLand() {
    const w = this.world, W = w.w, H = w.h, land = w.land;
    land.fill(0);
    const disc = (cx, cy, r, val, force) => {
      const r2 = r * r;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > r2) continue;
          if (force || land[y * W + x] === 0) land[y * W + x] = val;
        }
    };
    this.tribes.forEach((t, i) => { if (!t.defeated) disc(t.cx + 0.5, t.cy + 0.5, CAMP_R, 2 + i, true); });
    for (const b of this.buildings) {
      const r = this.territoryOf(b);
      if (!r) continue;
      disc(b.x + b.w / 2, b.y + b.h / 2, r, 1, false);
      this.reveal(b.x + b.w / 2, b.y + b.h / 2, r + (b.type === 'tower' && this.manned(b) ? 5 : 3));
    }
    const segs = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = land[y * W + x];
      if (!a) continue;
      if (y === 0 || land[(y - 1) * W + x] !== a) segs.push(x, y, 0, a);
      if (x === W - 1 || land[y * W + x + 1] !== a) segs.push(x, y, 1, a);
      if (y === H - 1 || land[(y + 1) * W + x] !== a) segs.push(x, y, 2, a);
      if (x === 0 || land[y * W + x - 1] !== a) segs.push(x, y, 3, a);
    }
    this.borders = segs;
    this.landVer = (this.landVer || 0) + 1;
  },
  inLand(x, y) { const w = this.world; return w.inb(x, y) && w.land[w.i(x, y)] === 1; },
  landOwner(x, y) { const w = this.world; return w.inb(x, y) ? w.land[w.i(x, y)] : 0; },

  /* ---------- Erkundung ---------- */
  reveal(cx, cy, r) {
    const w = this.world, W = w.w, seen = w.seen, r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(w.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = y * W + x;
      if (seen[k]) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      seen[k] = 1; this.seenCount++; this.fogVer++;
    }
  },
  updateVision() {
    const p = this.player;
    this.reveal(p.x, p.y, 8.5);
    for (const s of this.settlers) this.reveal(s.x, s.y, 3.5);
    for (const s of this.soldiers) if (s.state !== 'garrison') this.reveal(s.x, s.y, 5.5);
    const w = this.world;
    for (const t of this.tribes) if (!t.discovered && w.seen[w.i(t.cx, t.cy)]) this.discoverTribe(t, false);
  },
  explored() { return this.seenCount / (this.world.w * this.world.h); },
  discoverTribe(t, byRaid) {
    if (t.discovered) return;
    t.discovered = true;
    this.reveal(t.cx + 0.5, t.cy + 0.5, 5);
    const msg = t.island ? `Auf der Insel im See lebt ein Stamm: die ${t.name}.` : `Du hast das Lager eines fremden Stammes entdeckt: die ${t.name}.`;
    if (!byRaid) this.toast(msg);
    this.today.events.push(msg);
  },
  direction(x, y) {
    const hut = this.buildings.find((b) => b.type === 'hut') || this.buildings[0];
    const a = Math.atan2(y - (hut.y + 1), x - (hut.x + 1));
    return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  },

  /* ---------- Ziele ---------- */
  checkQuests() {
    for (const q of QUESTS) {
      if (this.quests.includes(q.id) || !QUEST_TEST[q.id](this)) continue;
      this.quests.push(q.id);
      this.coins += q.reward;
      this.sound('quest');
      this.toast(`Ziel erreicht: ${q.text}. +${q.reward} Münzen`);
      this.today.events.push(`Ziel erreicht: ${q.text} (+${q.reward} Münzen).`);
    }
  },
  openQuests(n) { return QUESTS.filter((q) => !this.quests.includes(q.id)).slice(0, n); },

  /* ---------- Ausbau ---------- */
  upgradeInfo(b) {
    if (!b.built) return null;
    const def = BUILDINGS[b.type], lvl = b.level || 1;
    if (b.type === 'house') {
      const nx = HOUSE_LEVELS[lvl + 1];
      return nx ? { name: nx.name, cost: nx.cost, build: nx.build, text: `${nx.beds} statt ${HOUSE_LEVELS[lvl].beds} Betten` } : null;
    }
    if (b.type === 'barracks') {
      const nx = BARRACKS_LEVELS[lvl + 1], cur = BARRACKS_LEVELS[lvl];
      return nx ? { name: nx.name, cost: nx.cost, build: nx.build, text: `Alle Soldaten dieser Kaserne bekommen +${nx.hp - cur.hp} Leben und schlagen härter zu, Platz für ${nx.cap}. Jede Ausbildung kostet dann zusätzlich ${costText(nx.extra)}` } : null;
    }
    if (b.type === 'shipyard') {
      const nx = SHIPYARD_LEVELS[lvl + 1];
      return nx ? { name: nx.name, cost: nx.cost, build: nx.build, text: `baut ${nx.boats} mit ${nx.seats} Plätzen${nx.armed ? ' und Wurfgeschütz, das bei Angriffen von der Küste aus mitschießt' : ''}. Ein Boot kostet dann ${costText(nx.recipe.in)}` } : null;
    }
    if (def.job && lvl < 2) {
      const text = def.job === 'process' ? 'arbeitet 60 Prozent schneller' : def.job === 'farm' ? `${UPGRADE.fields} statt ${def.fields} Felder, schnellere Feldarbeit` : `arbeitet schneller, Reichweite +${UPGRADE.radius}`;
      return { name: `${def.name}, Stufe 2`, cost: UPGRADE.cost, build: UPGRADE.build, text };
    }
    return null;
  },
  startUpgrade(b) {
    const u = this.upgradeInfo(b);
    if (!u) return 'Weiter ausbauen geht nicht.';
    if (b.upgrading) return 'Wird schon ausgebaut.';
    if (!this.has(u.cost)) return 'Dafür fehlen Rohstoffe.';
    this.pay(u.cost);
    b.upgrading = { progress: 0, build: u.build };
    b.blockedUntil = 0;
    return null;
  },
  finishUpgrade(b) {
    b.level = (b.level || 1) + 1;
    b.upgrading = null;
    this.sound('build');
    if (b.type === 'barracks') {
      for (const s of this.soldiers) if (s.home === b.id && (s.drill || 1) < b.level) { const before = this.maxHp(s); s.drill = b.level; s.hp += this.maxHp(s) - before; }
      this.toast(`Ausgebaut: jetzt eine ${BARRACKS_LEVELS[b.level].name}. Ihre Soldaten sind stärker.`);
    } else if (b.type === 'shipyard') this.toast(`Ausgebaut: Die Werft baut jetzt ${SHIPYARD_LEVELS[b.level].boats}.`);
    else if (b.type === 'house') this.toast(`Ausgebaut: jetzt ein ${HOUSE_LEVELS[b.level].name}.`);
    else this.toast(`Ausgebaut: ${BUILDINGS[b.type].name}, Stufe ${b.level}.`);
    this.landDirty = true;
  },
  levelName(b) {
    const lvl = b.level || 1;
    if (b.type === 'house') return HOUSE_LEVELS[lvl].name;
    if (b.type === 'barracks') return BARRACKS_LEVELS[lvl].name;
    if (b.type === 'shipyard') return SHIPYARD_LEVELS[lvl].name;
    return lvl >= 2 ? `${BUILDINGS[b.type].name} · Stufe ${lvl}` : BUILDINGS[b.type].name;
  },
  // alle bezahlten Ausbaukosten (für den Talwert)
  upgradeCosts(b) {
    const out = [], lvl = b.level || 1;
    for (let l = 2; l <= lvl; l++) {
      if (b.type === 'house') out.push(HOUSE_LEVELS[l].cost);
      else if (b.type === 'barracks') out.push(BARRACKS_LEVELS[l].cost);
      else if (b.type === 'shipyard') out.push(SHIPYARD_LEVELS[l].cost);
      else out.push(UPGRADE.cost);
    }
    return out;
  },
  recipeOf(b) { return b.type === 'shipyard' ? SHIPYARD_LEVELS[Math.min(3, b.level || 1)].recipe : BUILDINGS[b.type].recipe; },
  speedOf(b) { return b && b.type !== 'house' && b.type !== 'shipyard' && (b.level || 1) >= 2 ? UPGRADE.speed : 1; },
  radiusOf(b) { const def = BUILDINGS[b.type]; return (def.radius || 0) + (def.job && def.job !== 'farm' && (b.level || 1) >= 2 ? UPGRADE.radius : 0); },
  fieldsOf(b) { return (b.level || 1) >= 2 ? UPGRADE.fields : BUILDINGS.farm.fields; },
  bedsOf(b) { return HOUSE_LEVELS[Math.min(HOUSE_LEVELS.length - 1, b.level || 1)].beds; },

  /* ---------- Soldaten ---------- */
  soldierCap(b) { return b.type === 'barracks' ? BARRACKS_LEVELS[Math.min(3, b.level || 1)].cap : BUILDINGS[b.type].garrison || 0; },
  assignedTo(b) { let n = 0; for (const s of this.soldiers) if (s.home === b.id) n++; return n; },
  unitOf(s) { return UNITS[s.type] || UNITS.sword; },
  maxHp(s) { return this.unitOf(s).hp + s.rank * 3 + BARRACKS_LEVELS[s.drill || 1].hp * (s.type === 'archer' ? 0.75 : 1); },
  atkOf(u) {
    if (u.kind === 'soldier') return this.unitOf(u).atk + u.rank * 0.6 + BARRACKS_LEVELS[u.drill || 1].atk * (u.type === 'archer' ? 0.7 : 1);
    if (u.kind === 'ship') return WARSHIP.atk;
    return u.atk;
  },
  rangeOf(u) { return u.kind === 'soldier' ? this.unitOf(u).range + (u.type === 'archer' ? ((u.drill || 1) - 1) * 0.5 : 0) : u.kind === 'ship' ? WARSHIP.range : u.range || REACH; },
  cdOf(u) { return u.kind === 'soldier' ? this.unitOf(u).cd : u.kind === 'ship' ? WARSHIP.cd : u.cdT || HIT_CD; },
  unitSpeed(s) { return this.unitOf(s).speed; },
  newSoldier(b, type = 'sword') {
    const d = this.door(b);
    const s = { id: this.nextId++, kind: 'soldier', type, drill: b.level || 1, x: d.x + 0.5, y: d.y + 0.5, hp: 1, rank: 0, kills: 0, home: b.id, arrived: false, state: 'home', path: null, pi: 0, cd: 0, think: 0, campaign: null, foe: null, walkT: 0, facing: 2 };
    s.hp = this.maxHp(s);
    this.soldiers.push(s);
    return s;
  },
  ordersOf(b) {
    if (!b.orders || typeof b.orders !== 'object') b.orders = { sword: Number(b.orders) || 0, archer: 0 };
    return b.orders;
  },
  // Waffe plus Zusatzkosten der Kasernenstufe
  trainCost(b, type) {
    const c = { ...BARRACKS_LEVELS[Math.min(3, b.level || 1)].extra }, wpn = UNITS[type].weapon;
    c[wpn] = (c[wpn] || 0) + 1;
    return c;
  },
  trainWhy(b, type) {
    const c = this.trainCost(b, type), miss = Object.keys(c).filter((k) => (this.stock[k] || 0) < c[k]);
    if (miss.includes('sword')) return 'Es fehlt ein Schwert. Erzmine, Köhlerei, Schmelze und Waffenschmiede stellen welche her.';
    if (miss.includes('bow')) return 'Es fehlt ein Bogen. Der Bogenmacher schnitzt welche aus Brettern.';
    return `Für die Ausbildung fehlt noch: ${costText(Object.fromEntries(miss.map((k) => [k, c[k] - (this.stock[k] || 0)])))}.`;
  },
  updateBarracks(dt) {
    for (const b of this.buildings) {
      if (b.type !== 'barracks' || !b.built) continue;
      if (b.training) {
        b.training.t += dt;
        if (b.training.t >= TRAIN_TIME) {
          const type = b.training.type || 'sword';
          b.training = null; this.newSoldier(b, type); this.stats.trained++; this.sound('train');
          if (type === 'archer') this.stats.archers++;
          this.toast(`${UNITS[type].name} ausgebildet.`);
        }
        continue;
      }
      const ord = this.ordersOf(b);
      const want = ['sword', 'archer'].filter((k) => ord[k] > 0);
      if (!want.length) { b.why = ''; continue; }
      if (this.assignedTo(b) >= this.soldierCap(b)) { b.why = 'Die Kaserne ist voll. Bau sie aus, bau eine weitere oder schick Soldaten in Wachtürme.'; continue; }
      const ready = want.find((k) => this.has(this.trainCost(b, k)));
      if (!ready) { b.why = this.trainWhy(b, want[0]); continue; }
      if (this.settlers.some((s) => s.recruit === b.id)) { b.why = 'Ein Siedler ist auf dem Weg zur Ausbildung.'; continue; }
      let free = this.settlers.filter((s) => s.job == null && s.recruit == null && !s.carry && !(s.task && s.task.site != null));
      if (!free.length) {   // keiner frei: einen Arbeiter holen, zuerst von pausierten oder wartenden Arbeitsplätzen
        const rank = (s) => { const jb = this.byId(s.job); return (jb && jb.paused ? 0 : 2) + (s.state === 'seek' && s.timer > 0 ? 0 : 1); };
        free = this.settlers.filter((s) => s.job != null && s.recruit == null && !s.carry && s.state !== 'working').sort((a, c) => rank(a) - rank(c)).slice(0, 1);
      }
      if (!free.length) { b.why = 'Gerade ist kein Siedler abkömmlich. Bau Wohnhäuser, dann kommen mehr.'; continue; }
      const d = this.door(b);
      free.sort((a, c) => (Math.abs(a.x - d.x) + Math.abs(a.y - d.y)) - (Math.abs(c.x - d.x) + Math.abs(c.y - d.y)));
      const s = free[0];
      this.resetSettler(s);
      s.recruit = b.id; s.recruitType = ready; s.state = 'recruit';
      b.why = 'Ein Siedler ist auf dem Weg zur Ausbildung.';
    }
  },
  thinkRecruit(s) {
    const b = this.byId(s.recruit), type = s.recruitType || 'sword';
    const ord = b ? this.ordersOf(b) : null;
    if (!b || !b.built || b.training || !(ord[type] > 0)) { s.recruit = null; s.state = 'idle'; return; }
    if (!this.atDoor(s, b)) {
      const d = this.door(b);
      if (!this.goTo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 'recruit')) this.unstick(s, b);
      return;
    }
    const cost = this.trainCost(b, type);
    if (!this.has(cost)) { s.recruit = null; s.state = 'idle'; return; }
    this.pay(cost); ord[type]--;
    b.training = { t: 0, type };
    this.removeSettler(s);
  },
  // freie Soldaten in der Kaserne (für Türme und Angriffe)
  availableSoldiers() {
    return this.soldiers.filter((s) => s.campaign == null && (s.state === 'home' || s.state === 'return') && (this.byId(s.home) || {}).type === 'barracks').sort((a, c) => c.hp - a.hp);
  },
  // für Angriffe: alle aus der Kaserne und aus Türmen und Festungen alle bis auf eine Wache
  attackers() {
    const out = this.availableSoldiers();
    for (const b of this.buildings) {
      if (b.type !== 'tower' && b.type !== 'fort') continue;
      const crew = this.soldiers.filter((s) => s.home === b.id && s.state === 'garrison' && s.campaign == null).sort((a, c) => c.hp - a.hp);
      out.push(...crew.slice(1));
    }
    return out;
  },
  assignGarrisons() {
    for (const b of this.buildings) {
      if (!b.built || (b.type !== 'tower' && b.type !== 'fort')) continue;
      let need = this.soldierCap(b) - this.assignedTo(b);
      while (need > 0) {
        const pool = this.availableSoldiers().filter((x) => x.state === 'home');
        const s = (b.type === 'tower' && pool.find((x) => x.type === 'archer')) || pool[0];   // Bogenschützen schießen vom Turm
        if (!s) return;
        s.home = b.id; s.arrived = false; s.state = 'toGarrison'; s.path = null; need--;
      }
    }
  },
  arriveHome(s, home) {
    s.path = null;
    if (home.type === 'barracks') { s.state = 'home'; return; }
    s.state = 'garrison';
    if (!s.arrived) { s.arrived = true; this.landDirty = true; }
  },
  // Die Heimat ist weg (abgerissen): eine andere suchen, sonst wieder Siedler werden
  rehome(s) {
    const opts = this.buildings.filter((b) => b.built && (b.type === 'barracks' || b.type === 'tower' || b.type === 'fort') && this.assignedTo(b) < this.soldierCap(b));
    if (opts.length) {
      opts.sort((a, c) => (Math.abs(a.x - s.x) + Math.abs(a.y - s.y)) - (Math.abs(c.x - s.x) + Math.abs(c.y - s.y)));
      s.home = opts[0].id; s.arrived = false; s.state = 'return'; s.path = null;
      return;
    }
    this.soldiers = this.soldiers.filter((x) => x !== s);
    if (this.settlers.length < this.beds) { const n = this.spawnSettler(null); n.x = s.x; n.y = s.y; }
  },
  updateSoldier(s, dt) {
    s.cd = Math.max(0, s.cd - dt);
    if (s.swing > 0) s.swing -= dt;
    if (s.hurtT > 0) s.hurtT -= dt;
    const home = this.byId(s.home), spd = this.unitSpeed(s);
    if (!home && !['march', 'fight', 'move', 'hold'].includes(s.state)) { this.rehome(s); return; }
    switch (s.state) {
      case 'garrison': {
        s.hp = Math.min(this.maxHp(s), s.hp + dt * 0.6);
        if ((s.think -= dt) > 0) return;
        s.think = 0.25;
        const cx = home.x + home.w / 2, cy = home.y + home.h / 2;
        if (s.type === 'archer') {   // schießt von oben, ohne hinauszugehen
          const f = this.nearestFoe(cx, cy, this.rangeOf(s) + 2);
          if (f && s.cd <= 0) { s.cd = this.cdOf(s); this.shoot(s, f, { x: cx, y: home.y - (home.type === 'tower' ? 0.6 : 0.2) }); }
          return;
        }
        const f = this.nearestFoe(cx, cy, 10, 'raid');
        if (f) { const d = this.door(home); s.x = d.x + 0.5; s.y = d.y + 0.5; s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; }
        return;
      }
      case 'home': {
        s.hp = Math.min(this.maxHp(s), s.hp + dt * 0.6);
        if (s.path && this.follow(s, dt * spd * 0.5) === 'blocked') s.path = null;
        if ((s.think -= dt) > 0) return;
        s.think = 0.5;
        const f = this.raidTarget(s.x, s.y);
        if (f) { s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; return; }
        if (!s.path && this.rng() < 0.12) {
          const d = this.door(home), tx = d.x + Math.floor(this.rng() * 5) - 2, ty = d.y + Math.floor(this.rng() * 2);
          if (this.world.walkable(tx, ty)) this.unitGo(s, (x, y) => x === tx && y === ty, tx, ty, 200);
        }
        return;
      }
      case 'toGarrison': case 'return': {
        if ((s.think -= dt) <= 0) {
          s.think = 0.5;
          const f = this.nearestFoe(s.x, s.y, 6);
          if (f) { s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; return; }
        }
        const d = this.door(home);
        if (!s.path) {
          const r = this.unitGo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 150000);
          if (r !== 'go') { if (!r) { s.x = d.x + 0.5; s.y = d.y + 0.5; } this.arriveHome(s, home); }
          return;
        }
        const r = this.follow(s, dt * spd);
        if (r === true) this.arriveHome(s, home); else if (r === 'blocked') s.path = null;
        return;
      }
      case 'march': {
        const t = this.tribes[s.campaign];
        if (!t || t.defeated) { s.campaign = null; s.state = 'return'; s.path = null; return; }
        if ((s.think -= dt) <= 0) {
          s.think = 0.4;
          if (t.warriors > 0 && Math.hypot(s.x - t.cx - 0.5, s.y - t.cy - 0.5) < ALARM_R) this.alarmCamp(t);
          const f = this.nearestFoe(s.x, s.y, 6);
          if (f) { s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; return; }
        }
        if (!s.path) {
          if ((s.repath = (s.repath || 0) - dt) > 0) return;
          s.repath = 1;
          const r = this.unitGo(s, nextToRect(t.hall.x, t.hall.y, 3, 3), t.cx, t.cy, 150000);
          if (r === 'here') this.tryCapture(t);
          else if (!r) { s.campaign = null; s.state = 'return'; this.toast('Ein Soldat findet keinen Weg zum Lager und kehrt um.'); }
          return;
        }
        const r = this.follow(s, dt * spd);
        if (r === true) { s.path = null; s.repath = 0; this.tryCapture(t); } else if (r === 'blocked') s.path = null;
        return;
      }
      case 'fight': {
        const f = this.foes.find((x) => x.id === s.foe);
        const tooFar = !s.ordered && f && (s.post ? Math.hypot(f.x - s.post.x, f.y - s.post.y) > 12
          : s.campaign == null && home && Math.hypot(f.x - home.x, f.y - home.y) > 30 && !this.inLand(Math.floor(f.x), Math.floor(f.y)));
        const giveUp = !f || (s.stuckT || 0) > 3 || tooFar;
        if (giveUp) {
          s.foe = null; s.stuckT = 0; s.path = null; s.ordered = false;
          const n = s.campaign != null ? this.nearestFoe(s.x, s.y, 9)
            : s.post ? this.nearestFoe(s.post.x + 0.5, s.post.y + 0.5, s.type === 'archer' ? this.rangeOf(s) + 1.5 : 6)
            : this.nearestFoe(s.x, s.y, 8) || (home && home.type === 'barracks' ? this.raidTarget(s.x, s.y) : null);
          if (n && n !== f) { s.foe = n.id; return; }
          s.state = s.campaign != null ? 'march' : s.post ? 'move' : 'return';
          return;
        }
        this.engage(s, f, dt, spd);
        return;
      }
      case 'move': {   // auf dem Weg zum befohlenen Platz; wehrt sich unterwegs
        if ((s.think -= dt) <= 0) {
          s.think = 0.4;
          const f = this.nearestFoe(s.x, s.y, s.type === 'archer' ? this.rangeOf(s) : 3);
          if (f) { s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; return; }
        }
        const p = s.post;
        if (!p) { s.state = 'return'; return; }
        if (!s.path) {
          if ((s.repath = (s.repath || 0) - dt) > 0) return;
          s.repath = 1;
          const r = this.unitGo(s, (x, y) => x === p.x && y === p.y, p.x, p.y, 150000);
          if (r === 'here') s.state = 'hold';
          else if (!r) { s.post = { x: Math.floor(s.x), y: Math.floor(s.y) }; s.state = 'hold'; }
          return;
        }
        const r = this.follow(s, dt * spd);
        if (r === true) { s.path = null; s.state = 'hold'; } else if (r === 'blocked') s.path = null;
        return;
      }
      case 'hold': {   // hält die Stellung und kämpft gegen alles, was in Reichweite kommt
        s.hp = Math.min(this.maxHp(s), s.hp + dt * 0.25);
        if ((s.think -= dt) > 0) return;
        s.think = 0.4;
        const f = this.nearestFoe(s.x, s.y, s.type === 'archer' ? this.rangeOf(s) + 1.5 : 6);
        if (f) { s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; return; }
        if (!s.post) { s.state = 'return'; return; }
        if (Math.hypot(s.x - s.post.x - 0.5, s.y - s.post.y - 0.5) > 1.2) { s.state = 'move'; s.path = null; s.repath = 0; }
        return;
      }
      default: s.state = 'return';
    }
  },
  /* ---------- Befehle an ausgewählte Soldaten ---------- */
  canStand(x, y) { return this.world.walkable(x, y); },
  // hingehen und dort die Stellung halten; Schwertkämpfer nach vorn, Bogenschützen dahinter
  orderMove(list, tx, ty) {
    const spots = [];
    for (let r = 0; r <= 8 && spots.length < list.length; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (this.canStand(tx + dx, ty + dy)) spots.push({ x: tx + dx, y: ty + dy });
    }
    if (!spots.length) return 'Dort können keine Soldaten stehen.';
    const sorted = [...list].sort((a, c) => (a.type === 'archer') - (c.type === 'archer'));
    sorted.forEach((s, i) => {
      if (s.state === 'garrison') { const home = this.byId(s.home), d = home && this.door(home); if (d) { s.x = d.x + 0.5; s.y = d.y + 0.5; } }
      const p = spots[Math.min(i, spots.length - 1)];
      Object.assign(s, { post: { x: p.x, y: p.y }, campaign: null, foe: null, ordered: false, state: 'move', path: null, repath: 0, stuckT: 0 });
    });
    return null;
  },
  orderAttackFoe(list, foe) {
    for (const s of list) {
      if (s.state === 'garrison') { const home = this.byId(s.home), d = home && this.door(home); if (d) { s.x = d.x + 0.5; s.y = d.y + 0.5; } }
      Object.assign(s, { campaign: null, foe: foe.id, ordered: true, state: 'fight', path: null, repath: 0, stuckT: 0 });
    }
  },
  // zurück nach Hause (Kaserne, Turm oder Festung)
  orderRelease(list) {
    for (const s of list) Object.assign(s, { post: null, campaign: null, foe: null, ordered: false, state: s.state === 'garrison' ? 'garrison' : 'return', path: null });
  },
  // Feinde in deinem Land oder in der Nähe der Kaserne
  raidTarget(x, y) {
    let best = null, bd = Infinity;
    for (const f of this.foes) {
      if (f.mode !== 'raid' || f.wait > 0) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d > 22 && !this.inLand(Math.floor(f.x), Math.floor(f.y))) continue;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  },
  nearestFoe(x, y, r, mode) {
    let best = null, bd = r;
    for (const f of this.foes) {
      if (mode && f.mode !== mode) continue;
      if (f.wait > 0) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d <= bd) { bd = d; best = f; }
    }
    return best;
  },
  nearestSoldier(x, y, r) {
    let best = null, bd = r;
    for (const s of this.soldiers) {
      if (s.state === 'garrison') continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= bd) { bd = d; best = s; }
    }
    return best;
  },

  /* ---------- Bewegung und Kampf ---------- */
  // mit Boot (ab dem ersten fertigen Boot) auch übers Wasser; fremde Krieger nur zu Fuß
  passFor(e) {
    if (e && e.kind === 'foe') return null;
    if (e && e.kind === 'ship') return this.shipPass || (this.shipPass = (x, y) => this.world.isWater(x, y) || this.world.g(x, y) === G.BRIDGE);
    if (this.boats > 0) return this.sailPass || (this.sailPass = (x, y) => this.world.walkable(x, y) || this.world.isWater(x, y));
    return null;
  },
  unitGo(u, goal, hx, hy, max = 20000) {
    const sx = Math.floor(u.x), sy = Math.floor(u.y);
    if (goal(sx, sy)) { u.path = null; return 'here'; }
    const p = findPath(this.world, sx, sy, goal, hx, hy, max, this.passFor(u));
    if (!p) return null;
    if (!p.length) { u.path = null; return 'here'; }
    u.path = p; u.pi = 0; u.dest = { goal, hx, hy };
    return 'go';
  },
  engage(u, tg, dt, speed) {
    const d = dist(u, tg), range = this.rangeOf(u);
    if (d <= range) {
      u.path = null;
      const dx = tg.x - u.x, dy = tg.y - u.y;
      u.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      if (u.cd <= 0) { u.cd = this.cdOf(u) * (0.9 + this.rng() * 0.2); if (range > 1.5) this.shoot(u, tg); else this.strike(u, tg); }
      return;
    }
    const pass = this.passFor(u) || ((x, y) => this.world.walkable(x, y));
    const direct = () => {
      const step = Math.min(d - range * 0.85, dt * speed);
      const nx = u.x + (tg.x - u.x) / d * step, ny = u.y + (tg.y - u.y) / d * step;
      if (!pass(Math.floor(nx), Math.floor(ny))) return false;
      u.x = nx; u.y = ny; u.walkT = (u.walkT || 0) + 0.15; u.path = null;
      const dx = tg.x - u.x, dy = tg.y - u.y;
      u.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      return true;
    };
    if (d < range + 0.75 && direct()) return;
    u.repath = (u.repath || 0) - dt;
    if (u.repath <= 0) {
      u.repath = 0.8;
      const tx = Math.floor(tg.x), ty = Math.floor(tg.y);
      const r = this.unitGo(u, (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1, tx, ty, 3000);
      if (r === 'here') { if (!direct()) u.stuckT = (u.stuckT || 0) + 0.8; return; }
      if (!r) { u.stuckT = (u.stuckT || 0) + 0.8; return; }
      u.stuckT = 0;
    }
    if (u.path) { const r = this.follow(u, dt * speed); if (r === 'blocked') u.path = null; }
    else direct();
  },
  strike(a, d) {
    const dmg = this.atkOf(a) * (0.75 + this.rng() * 0.5);
    d.hp -= dmg; d.hurtT = 0.25; a.swing = 0.3;
    this.sound('clash', d.x, d.y);
    if (d.hp <= 0) this.killUnit(d, a);
  },
  // Pfeil oder Bolzen: fliegt kurz, trifft dann (das Ziel kann nicht ausweichen)
  shoot(a, tg, from) {
    const x0 = from ? from.x : a.x, y0 = from ? from.y : a.y - 0.35;
    const len = Math.hypot(tg.x - x0, tg.y - y0);
    this.shots.push({ x0, y0, x1: tg.x, y1: tg.y - 0.3, t: 0, dur: 0.15 + len * 0.06, tid: tg.id, tkind: tg.kind, dmg: this.atkOf(a) * (0.75 + this.rng() * 0.5), by: a, kind: a.kind === 'ship' ? 'bolt' : 'arrow' });
    this.sound('arrow', x0, y0);
    a.swing = 0.3;
  },
  updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.t += dt;
      if (sh.t < sh.dur) continue;
      this.shots.splice(i, 1);
      const tg = (sh.tkind === 'soldier' ? this.soldiers : this.foes).find((u) => u.id === sh.tid);
      if (!tg) continue;
      tg.hp -= sh.dmg; tg.hurtT = 0.25;
      if (tg.hp <= 0) this.killUnit(tg, sh.by);
    }
  },
  killUnit(u, by) {
    this.sound('die', u.x, u.y);
    if (u.kind === 'soldier') {
      this.soldiers = this.soldiers.filter((x) => x !== u);
      this.floatText(u.x, u.y - 0.7, 'gefallen', '#ff9a8a');
      this.today.lost = (this.today.lost || 0) + 1;
      if (u.arrived) this.landDirty = true;
      if (u.campaign != null && !this.soldiers.some((s) => s.campaign === u.campaign)) {
        const t = this.tribes[u.campaign];
        this.toast(`Der Angriff auf die ${t.name} ist gescheitert.`);
        this.today.events.push(`Dein Angriff auf die ${t.name} ist gescheitert. Sie haben noch ${t.warriors + this.foesOf(u.campaign)} Krieger.`);
      }
      return;
    }
    this.foes = this.foes.filter((x) => x !== u);
    const t = this.tribes[u.tribe];
    this.floatText(u.x, u.y - 0.7, u.type === 'chief' ? 'Häuptling besiegt!' : 'besiegt', '#ffe08a');
    if (u.type === 'chief') { t.chiefDead = true; t.chiefOut = false; this.toast(`Der Häuptling der ${t.name} ist gefallen!`); }
    this.today.beaten = (this.today.beaten || 0) + 1;
    if (u.loot) {
      for (const k in u.loot) { this.stock[k] = (this.stock[k] || 0) + u.loot[k]; if (t.raid && t.raid.stolen[k]) t.raid.stolen[k] -= u.loot[k]; }
      this.floatText(u.x, u.y - 1.1, 'Beute zurück', '#9fe08a');
      u.loot = null;
    }
    if (by && by.kind === 'soldier') {
      by.kills++;
      const r = RANKS.filter((n) => by.kills >= n).length;
      if (r > by.rank) { by.rank = r; by.hp = Math.min(this.maxHp(by), by.hp + 3); this.floatText(by.x, by.y - 1.1, 'Befördert!', '#9fd4ff'); }
    }
    if (u.mode === 'raid' && t.raid) { t.raid.killed++; this.raidCheck(t); }
  },

  /* ---------- Stämme ---------- */
  // jede Jahreszeit eine Stufe stärker (1 bis 4)
  tribeTier(t) { return Math.min(4, 1 + Math.floor((this.day - 1) / 10) + (t.bonus || 0)); },
  warriorHp(t) { return t.hp * (1 + 0.35 * (this.tribeTier(t) - 1)); },
  warriorAtk(t) { return t.atk * (1 + 0.25 * (this.tribeTier(t) - 1)); },
  chiefHp(t) { return FOE.chiefHp + FOE.chiefHpTier * this.tribeTier(t); },
  foeSpeed(f) { return f.type === 'chief' ? 2.1 : f.mode === 'raid' ? FOE.raidSpeed : SETTLER_SPEED; },
  // ein Krieger: Speer, Bogen oder der Häuptling
  makeFoe(t, ti, mode, x, y, type) {
    const tier = this.tribeTier(t), hp = this.warriorHp(t), atk = this.warriorAtk(t);
    const f = { id: this.nextId++, kind: 'foe', type, tribe: ti, mode, x, y, cd: 0, think: this.rng() * 0.4, path: null, pi: 0, walkT: 0, facing: 2 };
    if (type === 'bow') Object.assign(f, { hp: hp * 0.7, atk: atk * 0.85, range: FOE.archerRange, cdT: 1.6 });
    else if (type === 'chief') Object.assign(f, { hp: this.chiefHp(t), atk: FOE.chiefAtk + FOE.chiefAtkTier * tier, cdT: 1.0 });
    else Object.assign(f, { hp, atk });
    f.maxHp = f.hp;
    return f;
  },
  warriorType() { return this.rng() < FOE.archerShare ? 'bow' : 'spear'; },
  // zündet ein Gebäude nahe dem geplünderten Lager an; freie Siedler bauen es wieder auf
  burnNear(st, t) {
    const cx = st.x + 1, cy = st.y + 1;
    const cands = this.buildings.filter((b) => b.built && !['hut', 'storage', 'fort', 'barracks', 'tower'].includes(b.type) && Math.hypot(b.x + 1 - cx, b.y + 1 - cy) <= 10);
    if (!cands.length) return;
    const b = cands[Math.floor(this.rng() * cands.length)];
    b.built = false; b.progress = 0.35; b.upgrading = null; b.paused = false; b.blockedUntil = 0;
    for (const s of this.settlers) if (s.job === b.id) this.resetSettler(s);
    b.worker = null;
    this.landDirty = true;
    const name = this.levelName(b);
    this.toast(`Die ${t.name} haben ${name} angezündet!`);
    this.today.events.push(`Die ${t.name} haben ${name} angezündet. Freie Siedler bauen es wieder auf.`);
    this.floatText(b.x + 1, b.y, 'brennt!', '#ff8a5a');
  },
  campDoor(t) { return { x: t.hall.x + 1, y: t.hall.y + 3 }; },
  foesOf(ti) { let n = 0; for (const f of this.foes) if (f.tribe === ti) n++; return n; },
  realmNewDay() {
    const army = this.soldiers.length;
    this.tribes.forEach((t, ti) => {
      if (t.defeated) return;
      // Wettrüsten: je größer dein Heer und je später im Jahr, desto mehr Krieger
      t.cap0 = t.cap0 || t.cap;
      t.cap = t.cap0 + Math.round(this.day * 0.8 + army * 0.5);
      t.acc += t.grow * (1 + this.day / 20);
      while (t.acc >= 1) { t.acc--; if (t.warriors + this.foesOf(ti) < t.cap) t.warriors++; }
      if (t.island || this.day < FIRST_RAID || t.peaceUntil >= this.day) return;
      t.raidIn--;
      if (t.raidIn <= 0) {   // weit entfernte Stämme kommen seltener
        const hut = this.buildings.find((b) => b.type === 'hut') || this.buildings[0];
        t.raidAt = (2 + this.rng() * 6) * SEC_PER_HOUR;
        t.raidIn = 4 + Math.floor(Math.hypot(t.cx - hut.x, t.cy - hut.y) / 40) + Math.floor(this.rng() * 3);
      }
    });
  },
  launchRaid(t) {
    const ti = this.tribes.indexOf(t);
    const stores = this.buildings.filter((b) => b.type === 'storage' && b.built);
    if (!stores.length || t.raid) return false;
    const target = stores.sort((a, c) => Math.hypot(a.x - t.cx, a.y - t.cy) - Math.hypot(c.x - t.cx, c.y - t.cy))[0];
    const n = Math.min(t.warriors - 3, 3 + Math.floor(Math.max(0, this.day - FIRST_RAID) * 0.5));
    if (n < 2) return false;
    const d = this.campDoor(t);
    const goal = nextToRect(target.x, target.y, target.w, target.h);
    const path = findPath(this.world, d.x, d.y, goal, target.x + 1, target.y + 1, 150000);
    if (!path || !path.length) return false;
    t.warriors -= n;
    t.raid = { n, killed: 0, home: 0, stolen: {}, warned: false, burned: false };
    for (let i = 0; i < n; i++) {
      const f = this.makeFoe(t, ti, 'raid', d.x + 0.5, d.y + 0.5, this.warriorType());
      Object.assign(f, { state: 'march', target: target.id, think: i * 0.1, wait: i * 0.6, path, pi: 0, dest: { goal, hx: target.x + 1, hy: target.y + 1 } });
      this.foes.push(f);
    }
    if (!t.discovered) this.discoverTribe(t, true);
    const from = this.direction(t.cx, t.cy);
    this.toast(`Überfall! ${n} Krieger der ${t.name} ziehen von ${from} gegen dein Lager.`);
    this.sound('raid');
    this.today.events.push(`Die ${t.name} haben dich mit ${n} Kriegern überfallen.`);
    this.alert = { text: `Überfall der ${t.name}`, color: t.color, until: this.clock + 40 };
    return true;
  },
  plunder(f) {
    const t = this.tribes[f.tribe];
    let budget = 60;
    const items = STOCK_ORDER.filter((k) => (this.stock[k] || 0) > 0).sort((a, c) => this.stock[c] * ITEMS[c].price - this.stock[a] * ITEMS[a].price);
    f.loot = {};
    for (const k of items) {
      if (budget <= 0) break;
      const n = Math.min(this.stock[k], Math.max(1, Math.floor(budget / ITEMS[k].price)), Math.ceil(this.stock[k] * 0.4));
      if (n <= 0) continue;
      this.stock[k] -= n; f.loot[k] = n; budget -= n * ITEMS[k].price;
      if (t.raid) t.raid.stolen[k] = (t.raid.stolen[k] || 0) + n;
    }
    this.floatText(f.x, f.y - 0.7, 'plündert!', '#ff8a7a');
    if (t.raid && !t.raid.warned) { t.raid.warned = true; this.toast(`Die ${t.name} plündern dein Lager!`); }
    if (t.raid && !t.raid.burned) { t.raid.burned = true; const st = this.byId(f.target); if (st) this.burnNear(st, t); }
  },
  foeHome(f) {
    const t = this.tribes[f.tribe];
    this.foes = this.foes.filter((x) => x !== f);
    if (f.type === 'chief') t.chiefOut = false;
    else if (!t.defeated) t.warriors++;
    if (f.mode === 'raid' && t.raid) { t.raid.home++; this.raidCheck(t); }
  },
  raidCheck(t) {
    const r = t.raid;
    if (!r || r.killed + r.home < r.n) return;
    t.raid = null;
    if (this.alert && this.alert.text.endsWith(t.name)) this.alert = null;
    const stolen = Object.keys(r.stolen).filter((k) => r.stolen[k] > 0);
    if (r.killed >= r.n) {
      this.stats.repelled++;
      this.toast(`Überfall der ${t.name} abgewehrt!`);
      this.today.events.push(`Deine Soldaten haben den Überfall der ${t.name} abgewehrt.`);
    } else if (stolen.length) this.today.events.push(`Die ${t.name} haben ${stolen.map((k) => `${r.stolen[k]} ${ITEMS[k].name}`).join(', ')} geraubt.`);
    else this.today.events.push(`Die ${t.name} sind wieder abgezogen.`);
  },
  updateFoe(f, dt) {
    f.cd = Math.max(0, f.cd - dt);
    if (f.swing > 0) f.swing -= dt;
    if (f.hurtT > 0) f.hurtT -= dt;
    if (f.wait > 0) { f.wait -= dt; return; }
    const t = this.tribes[f.tribe], door = this.campDoor(t);
    if (f.state === 'fight') {
      const tg = this.soldiers.find((s) => s.id === f.foe);
      const tooFar = f.mode === 'defend' && tg && Math.hypot(tg.x - t.cx - 0.5, tg.y - t.cy - 0.5) > ALARM_R + 3;
      if (!tg || tg.state === 'garrison' || tooFar || (f.stuckT || 0) > 3) {
        f.foe = null; f.stuckT = 0; f.path = null;
        f.state = f.mode === 'defend' ? 'guard' : f.loot ? 'flee' : 'march';
        return;
      }
      this.engage(f, tg, dt, this.foeSpeed(f));
      return;
    }
    if ((f.think -= dt) <= 0) {
      f.think = 0.4;
      const s = this.nearestSoldier(f.x, f.y, f.mode === 'defend' ? 8 : f.range > 1.5 ? f.range + 1 : 4);
      if (s && (f.mode !== 'defend' || Math.hypot(s.x - t.cx - 0.5, s.y - t.cy - 0.5) <= ALARM_R + 2)) { f.foe = s.id; f.state = 'fight'; f.path = null; f.repath = 0; f.stuckT = 0; return; }
    }
    if (f.mode === 'defend') {
      const threat = this.soldiers.some((s) => s.campaign === f.tribe) || this.nearestSoldier(t.cx + 0.5, t.cy + 0.5, ALARM_R + 2);
      if (!threat) { f.idle = (f.idle || 0) + dt; if (f.idle > 5) { this.foeHome(f); return; } } else f.idle = 0;
      if (!f.path && Math.hypot(f.x - door.x - 0.5, f.y - door.y - 0.5) > 2.5) this.unitGo(f, (x, y) => Math.abs(x - door.x) <= 1 && Math.abs(y - door.y) <= 1 && this.world.walkable(x, y), door.x, door.y, 2000);
      if (f.path && this.follow(f, dt * this.foeSpeed(f)) === 'blocked') f.path = null;
      return;
    }
    if (f.state === 'march') {
      let st = this.byId(f.target);
      if (!st || st.type !== 'storage') { st = this.nearestStorage(f.x, f.y); if (!st) { f.state = 'flee'; return; } f.target = st.id; f.path = null; }
      if (!f.path) {
        const r = this.unitGo(f, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 150000);
        if (r === 'here') { f.state = 'plunder'; f.timer = 3; } else if (!r) f.state = 'flee';
        return;
      }
      const r = this.follow(f, dt * this.foeSpeed(f));
      if (r === true) { f.state = 'plunder'; f.timer = 3; } else if (r === 'blocked') f.path = null;
      return;
    }
    if (f.state === 'plunder') {
      f.timer -= dt;
      if (f.timer <= 0) { this.plunder(f); f.state = 'flee'; f.path = null; }
      return;
    }
    // flee: mit oder ohne Beute zurück ins Lager
    if (t.defeated) { this.foes = this.foes.filter((x) => x !== f); if (t.raid) { t.raid.home++; this.raidCheck(t); } return; }
    if (!f.path) {
      const r = this.unitGo(f, (x, y) => x === door.x && y === door.y, door.x, door.y, 150000);
      if (r !== 'go') this.foeHome(f);
      return;
    }
    const r = this.follow(f, dt * this.foeSpeed(f));
    if (r === true) this.foeHome(f); else if (r === 'blocked') f.path = null;
  },
  alarmCamp(t) {
    if (t.defeated || (t.warriors <= 0 && (t.chiefDead || t.chiefOut))) return;
    const ti = this.tribes.indexOf(t), w = this.world, door = this.campDoor(t);
    const spots = [];
    for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (w.walkable(door.x + dx, door.y + dy)) spots.push({ x: door.x + dx, y: door.y + dy });
    }
    if (!spots.length) spots.push(door);
    const n = t.warriors;
    for (let i = 0; i < n; i++) {
      const p = spots[i % spots.length];
      const f = this.makeFoe(t, ti, 'defend', p.x + 0.5 + (this.rng() - 0.5) * 0.4, p.y + 0.5 + (this.rng() - 0.5) * 0.4, this.warriorType());
      f.state = 'guard';
      this.foes.push(f);
    }
    t.warriors = 0;
    let chief = '';
    if (!t.chiefDead && !t.chiefOut) {
      const f = this.makeFoe(t, ti, 'defend', door.x + 0.5, door.y + 0.5, 'chief');
      f.state = 'guard'; t.chiefOut = true; this.foes.push(f);
      chief = ' und ihr Häuptling';
    }
    this.toast(`Die ${t.name} greifen zu den Waffen: ${n} Krieger${chief} verteidigen ihr Lager.`);
  },
  tryCapture(t) {
    const ti = this.tribes.indexOf(t);
    if (t.defeated) return true;
    if (t.warriors > 0 || (!t.chiefDead && !t.chiefOut)) { this.alarmCamp(t); return false; }
    if (this.foes.some((f) => f.tribe === ti && f.mode === 'defend')) return false;
    this.captureCamp(t);
    return true;
  },
  captureCamp(t) {
    const ti = this.tribes.indexOf(t), w = this.world;
    t.defeated = true; t.warriors = 0; t.raidAt = null;
    for (const r of [t.hall, ...t.huts]) for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) { w.tstruct[w.i(r.x + dx, r.y + dy)] = -1; w.touch(r.x + dx, r.y + dy); }
    const fort = this.forcePlace('fort', t.hall.x, t.hall.y, true);
    fort.tribe = ti;
    const loot = { iron: 4, sword: 2, bread: 8, plank: 10 };
    const coins = 80 + 30 * this.stats.conquered;
    for (const k in loot) this.stock[k] = (this.stock[k] || 0) + loot[k];
    this.coins += coins;
    const here = this.soldiers.filter((s) => s.campaign === ti).sort((a, c) => Math.hypot(a.x - t.cx, a.y - t.cy) - Math.hypot(c.x - t.cx, c.y - t.cy));
    here.forEach((s, i) => {
      s.campaign = null; s.foe = null; s.path = null;
      if (i < (BUILDINGS.fort.garrison || 3)) { s.home = fort.id; s.arrived = false; s.state = 'toGarrison'; } else s.state = 'return';
    });
    this.stats.conquered++;
    this.landDirty = true;
    for (const o of this.tribes) if (!o.defeated && o !== t) { o.warriors += 4; o.raidIn = Math.min(o.raidIn, 2); }
    const msg = `Du hast das Lager der ${t.name} erobert! Beute: ${coins} Münzen, ${Object.keys(loot).map((k) => `${loot[k]} ${ITEMS[k].name}`).join(', ')}.`;
    this.toast(`Lager der ${t.name} erobert!`);
    this.sound('quest');
    this.today.events.push(msg);
  },
  // want: Anzahl oder { sword, archer }
  attackTribe(ti, want, list) {
    const t = this.tribes[ti];
    if (!t || t.defeated) return 'Dieses Lager gibt es nicht mehr.';
    const avail = list || this.attackers();
    if (!avail.length) return 'Keine freien Soldaten. Bilde in der Kaserne welche aus. Jeder Turm behält eine Wache.';
    if (t.island && this.boats <= 0) return 'Die Insel erreichst du nur mit einem Boot. Bau eine Werft und bestell eins.';
    let pick = list ? list.slice() : typeof want === 'number' ? avail.slice(0, want)
      : [...avail.filter((s) => s.type !== 'archer').slice(0, want.sword || 0), ...avail.filter((s) => s.type === 'archer').slice(0, want.archer || 0)];
    if (t.island) pick = pick.slice(0, this.boatSeats());
    if (!pick.length) return 'Wähl mindestens einen Soldaten aus.';
    const goal = nextToRect(t.hall.x, t.hall.y, 3, 3);
    let sent = 0;
    for (const s of pick) {
      if (s.state === 'garrison') { const home = this.byId(s.home), d = home && this.door(home); if (d) { s.x = d.x + 0.5; s.y = d.y + 0.5; } }
      s.campaign = ti; s.foe = null; s.post = null; s.ordered = false;
      const r = this.unitGo(s, goal, t.cx, t.cy, 150000);
      if (!r) { s.campaign = null; continue; }
      s.state = 'march'; s.think = 0; sent++;
    }
    if (!sent) return 'Deine Soldaten finden keinen Weg dorthin.';
    const ships = this.fleet[3] > 0 && !this.ships.some((x) => x.campaign === ti) ? this.launchShips(ti, Math.min(2, this.fleet[3])) : 0;
    this.toast(`${sent} ${sent === 1 ? 'Soldat zieht' : 'Soldaten ziehen'} gegen die ${t.name}.${ships ? ` ${ships === 1 ? 'Ein Kriegsschiff schießt' : `${ships} Kriegsschiffe schießen`} von der Küste mit.` : ''}`);
    return null;
  },
  // Kriegsschiffe fahren übers Wasser nahe ans Lager und schießen mit dem Wurfgeschütz
  launchShips(ti, n) {
    const t = this.tribes[ti], w = this.world;
    let best = null, bd = Infinity;
    for (let y = t.cy - 8; y <= t.cy + 8; y++) for (let x = t.cx - 8; x <= t.cx + 8; x++) {
      if (!w.inb(x, y) || !w.isWater(x, y)) continue;
      const d = Math.hypot(x - t.cx, y - t.cy);
      if (d < bd && d <= WARSHIP.range - 0.5) { bd = d; best = { x, y }; }
    }
    if (!best) return 0;
    const pass = this.passFor({ kind: 'ship' }), W = w.w;
    const depth = new Map([[best.y * W + best.x, 0]]), q = [best];
    let far = best, fd = 0;
    while (q.length) {
      const c = q.shift(), cd = depth.get(c.y * W + c.x);
      if (cd > fd) { fd = cd; far = c; }
      if (cd >= 14) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c.x + dx, y = c.y + dy, k = y * W + x;
        if (!w.inb(x, y) || depth.has(k) || !pass(x, y)) continue;
        depth.set(k, cd + 1); q.push({ x, y });
      }
    }
    let launched = 0;
    for (let i = 0; i < n; i++) {
      const sh = { id: this.nextId++, kind: 'ship', campaign: ti, x: far.x + 0.5, y: far.y + 0.5, spawn: { x: far.x, y: far.y }, state: 'sail', cd: 1 + i, path: null, pi: 0, walkT: 0, facing: best.x >= far.x ? 1 : 3 };
      const r = this.unitGo(sh, (x, y) => Math.hypot(x - best.x, y - best.y) <= 1.5 + i, best.x, best.y, 6000);
      if (r === null) continue;
      this.ships.push(sh); launched++;
    }
    return launched;
  },
  updateShips(dt) {
    for (const sh of this.ships.slice()) {
      sh.cd = Math.max(0, sh.cd - dt);
      if (sh.swing > 0) sh.swing -= dt;
      const t = this.tribes[sh.campaign];
      const active = t && !t.defeated && this.soldiers.some((s) => s.campaign === sh.campaign);
      if (!active && sh.state !== 'leave') { sh.state = 'leave'; sh.path = null; }
      if (sh.state === 'sail' || sh.state === 'leave') {
        if (!sh.path) {
          if (sh.state === 'sail') { sh.state = 'fire'; continue; }
          const r = this.unitGo(sh, (x, y) => x === sh.spawn.x && y === sh.spawn.y, sh.spawn.x, sh.spawn.y, 6000);
          if (r !== 'go') this.ships = this.ships.filter((x) => x !== sh);
          continue;
        }
        const r = this.follow(sh, dt * WARSHIP.speed);
        if (r === true) { if (sh.state === 'leave') this.ships = this.ships.filter((x) => x !== sh); else sh.state = 'fire'; }
        else if (r === 'blocked') sh.path = null;
        continue;
      }
      if (sh.cd > 0) continue;
      let f = null, bd = WARSHIP.range;
      for (const o of this.foes) { if (o.tribe !== sh.campaign) continue; const d = Math.hypot(o.x - sh.x, o.y - sh.y); if (d <= bd) { bd = d; f = o; } }
      if (f) { sh.cd = WARSHIP.cd; sh.facing = f.x >= sh.x ? 1 : 3; this.shoot(sh, f); }
    }
  },
  addBoat(tier) { this.fleet[tier] = (this.fleet[tier] || 0) + 1; this.boats = this.fleet.reduce((a, n) => a + n, 0); },
  recall(ti) {
    let n = 0;
    for (const s of this.soldiers) if (s.campaign === ti) { s.campaign = null; s.foe = null; s.state = 'return'; s.path = null; n++; }
    return n;
  },
  boatSeats() { let n = 0; for (let t = 1; t < this.fleet.length; t++) n += (this.fleet[t] || 0) * SHIPYARD_LEVELS[t].seats; return n; },
  fleetText() { return [3, 2, 1].filter((t) => this.fleet[t] > 0).map((t) => `${this.fleet[t]} ${this.fleet[t] === 1 ? SHIPYARD_LEVELS[t].boat : SHIPYARD_LEVELS[t].boats}`).join(', ') || 'keine Boote'; },
  giftCost(t) { return Math.round(40 * Math.pow(1.6, t.gifts || 0)); },
  sendGift(ti) {
    const t = this.tribes[ti], cost = this.giftCost(t);
    if (this.coins < cost) return `Ein Geschenk kostet ${cost} Münzen.`;
    this.coins -= cost; t.gifts = (t.gifts || 0) + 1;
    t.peaceUntil = this.day + 8; t.raidAt = null;
    this.toast(`Die ${t.name} nehmen dein Geschenk an und halten 8 Tage Frieden.`);
    return null;
  },
  raidInfo(t) {
    if (t.defeated) return 'Besiegt.';
    if (t.island) return 'Fischer ohne Boote. Sie greifen dich nicht an.';
    if (t.raid) return 'Ihre Krieger sind gerade auf Raubzug.';
    if (t.peaceUntil >= this.day) return `Friedlich bis Tag ${t.peaceUntil}.`;
    if (this.day < FIRST_RAID - 1) return `Vor Tag ${FIRST_RAID} greifen sie nicht an. Mit jeder Jahreszeit werden ihre Krieger stärker.`;
    if (t.raidAt != null || t.raidIn <= 1) return 'Sie planen bald einen Überfall.';
    return 'Sie überfallen ab und zu dein Lager.';
  },

  /* ---------- Schatztruhen ---------- */
  openChest() {
    const r = this.rng();
    let item = null, n = 0;
    if (r < 0.25) { n = 25 + Math.floor(this.rng() * 40); this.coins += n; this.stats.chests++; return `+${n} Münzen`; }
    if (r < 0.45) { item = 'iron'; n = 3; } else if (r < 0.6) { item = 'sword'; n = 2; } else if (r < 0.75) { item = 'plank'; n = 12; } else if (r < 0.9) { item = 'seed_pumpkin'; n = 4; } else { item = 'bread'; n = 6; }
    this.stock[item] = (this.stock[item] || 0) + n;
    this.stats.chests++;
    return `+${n} ${ITEMS[item].name}`;
  },

  /* ---------- Wert, Speichern ---------- */
  militaryValue() {
    const forts = this.buildings.filter((b) => b.type === 'fort').length;
    let v = forts * 250;
    for (const s of this.soldiers) v += SETTLER_VALUE + ITEMS[this.unitOf(s).weapon].price + ((s.drill || 1) - 1) * 25;
    for (let t = 1; t < this.fleet.length; t++) v += (this.fleet[t] || 0) * SHIPYARD_LEVELS[t].value;
    return v;
  },
  saveRealm() {
    return {
      tribes: this.tribes.map((t, i) => ({ ...t, raid: null, warriors: t.warriors + this.foesOf(i) })),
      soldiers: this.soldiers.map((s) => ({ id: s.id, type: s.type || 'sword', drill: s.drill || 1, x: s.x, y: s.y, hp: s.hp, rank: s.rank, kills: s.kills, home: s.home, arrived: !!s.arrived, post: s.post || null })),
      boats: this.boats, fleet: this.fleet, quests: this.quests, stats: this.stats,
    };
  },
  loadRealm(d) {
    this.tribes = (d.tribes || []).map((t) => ({ ...t, raid: null }));
    this.fleet = Array.isArray(d.fleet) ? [0, d.fleet[1] || 0, d.fleet[2] || 0, d.fleet[3] || 0] : [0, d.boats || 0, 0, 0];
    this.boats = this.fleet.reduce((a, n) => a + n, 0);
    this.quests = d.quests || [];
    this.stats = { ...STATS0, ...(d.stats || {}) };
    this.soldiers = (d.soldiers || []).map((s) => {
      const home = this.byId(s.home);
      const inside = home && home.type !== 'barracks' && s.arrived;
      return { ...s, kind: 'soldier', type: s.type || 'sword', drill: s.drill || 1, post: s.post || null, state: s.post ? 'move' : inside ? 'garrison' : 'return', path: null, pi: 0, cd: 0, think: 0, campaign: null, foe: null, walkT: 0, facing: 2 };
    });
    this.markCamps();
  },
};
