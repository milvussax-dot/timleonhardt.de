// Reich: Land und Grenzen, Erkundung, fremde Stämme, Soldaten und Kämpfe, Boote, Ausbau, Schatztruhen, Ziele.
// Die Methoden werden in sim.js an die Klasse Game gehängt und arbeiten mit deren Zustand.
import { G, BUILDINGS, ITEMS, TERRITORY, HOUSE_LEVELS, UPGRADE, UNITS, TRAIN_TIME, BARRACKS_LEVELS, SHIPYARD_LEVELS, TOWER_LEVELS, ATTACK_RANGE, CATAPULT, CAMP_BUILD, RAM, RAM_RECIPE, THIEF, WARSHIP, TRIBES, FOE, QUESTS, SEC_PER_HOUR, SETTLER_SPEED, SETTLER_VALUE, STOCK_ORDER } from './data.js?v=19';
import { findPath, nextToRect, mulberry, hash, pickTribeSites, sprinkleChests, carveTrails } from './world.js?v=19';

export const CAMP_R = 12;       // so weit reicht das Land eines Stammes
export const FIRST_RAID = 10;   // vorher greift niemand an
const RAID_CALM = 5;            // nach einem Überfall so viele Tage (plus 0–2) keiner mehr, egal von welchem Stamm
const RAID_EVERY = 10;          // derselbe Stamm frühestens nach so vielen Tagen wieder (plus Weg / 30, plus 0–3)
const RAID_MAX = 16;            // mehr Krieger schickt ein Stamm nie auf einmal
const CAMP_EXTRA = 12;          // so viele Krieger mehr als zu Beginn passen ins Lager (wächst mit Tag und Heer)
const BALANCE = 3;              // Stand der Spielbalance; ältere Spielstände werden beim Laden einmal angepasst
const HUT_SPOTS = [[-5, -3], [4, -3], [-5, 2], [4, 2], [-1, -5], [-8, -1], [7, -1], [-4, 5], [3, 5], [-4, -7], [3, -7]];
const ISLAND_HUT_SPOTS = [[-4, -1], [3, -1], [-1, -4], [-4, 1], [3, 1]];
const HOUSE_SPOTS = [[-10, -5], [9, -5], [-1, -9], [-10, 3], [9, 3]], TOWER_SPOTS = [[-7, 6], [6, 6], [-8, -8], [7, -8]];
const ISLAND_BUILD_SPOTS = [[-4, 1], [3, 1], [-6, -3], [5, -3], [-1, -6]];
const ALARM_R = 10;             // kommen Soldaten so nah, verteidigt sich das Lager
const CONTACT_R = 5;            // treffen Truppen so nah aufeinander, kämpfen sie (Bogenschützen: Schussweite)
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
    this.tribes = []; this.soldiers = []; this.boats = 0; this.fleet = [0, 0, 0, 0]; this.quests = []; this.stats = { ...STATS0 }; this.catapults = 0; this.rams = 0; this.thieves = []; this.sieges = []; this.ships = [];
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
    const t = {
      key: def.key, name: def.name, color: def.color, atk: def.atk, hp: def.hp, grow: def.grow, cap: def.start + CAMP_EXTRA, cap0: def.start + CAMP_EXTRA, chiefDead: false, chiefOut: false,
      cx: hx + 1, cy: hy + 1, hall, huts: [], island, warriors: def.start, acc: 0, discovered: false, defeated: false,
      raidIn: 1 + ti * 2 + Math.floor(rnd() * 3), raidAt: null, peaceUntil: 0, gifts: 0, raid: null,
    };
    this.campHuts(t, ti, false);
    this.campBuilds(t, ti, false);
    t.weapons = 5; t.goods = { coins: 60, bread: 10, wood: 15 };
    w.touchAll();
    return t;
  },
  // belegt 2 × 2 Felder an einer Stelle ums Lager, wenn sie frei sind. `later`: im laufenden Spiel
  // (weder Wege, Truhen, eigenes Land noch Figuren überbauen)
  campPlacer(t, ti, later) {
    const w = this.world;
    const units = later ? [this.player, ...(this.settlers || []), ...(this.soldiers || []), ...(this.foes || [])].filter(Boolean) : [];
    const near = (x, y) => this.buildings.some((b) => x >= b.x - 3 && x < b.x + b.w + 3 && y >= b.y - 3 && y < b.y + b.h + 3);
    const ok = (x, y) => {
      if (!w.inb(x, y) || w.isWater(x, y)) return false;
      const k = w.i(x, y), gr = w.ground[k];
      if (gr === G.MOUNTAIN || gr === G.BRIDGE || w.bld[k] >= 0 || w.tstruct[k] >= 0) return false;
      return !later || (gr !== G.DIRT && gr !== G.PATH && w.land[k] !== 1 && !(w.obj[k] && w.obj[k].t === 'chest') && !near(x, y));
    };
    return (ox, oy) => {
      const x = t.cx + ox, y = t.cy + oy;
      if (!(ok(x, y) && ok(x + 1, y) && ok(x, y + 1) && ok(x + 1, y + 1))) return null;
      if (units.some((u) => u.x > x - 0.6 && u.x < x + 2.6 && u.y > y - 0.6 && u.y < y + 2.6)) return null;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const k = w.i(x + dx, y + dy);
        w.tstruct[k] = ti; w.obj[k] = null;
        if (w.ground[k] === G.FOREST) w.ground[k] = G.GRASS;
        if (later) w.touch(x + dx, y + dy);
      }
      return { x, y, w: 2, h: 2 };
    };
  },
  // Häuser und Wachtürme rund ums Lager (Land: 3 Häuser und 2 Türme, Insel: je eins)
  campBuilds(t, ti, later) {
    if (!t.builds) t.builds = [];
    const take = this.campPlacer(t, ti, later);
    const place = (kind, spots, want) => {
      for (const [ox, oy] of spots) {
        if (t.builds.filter((b) => b.kind === kind).length >= want) return;
        const r = take(ox, oy);
        if (r) t.builds.push({ kind, ...r, hp: CAMP_BUILD[kind].hp });
      }
    };
    place('house', t.island ? ISLAND_BUILD_SPOTS : HOUSE_SPOTS, t.island ? 1 : CAMP_BUILD.houses);
    place('tower', t.island ? ISLAND_BUILD_SPOTS : TOWER_SPOTS, t.island ? 1 : CAMP_BUILD.towers);
  },
  // Hütten rund um die Halle (Land bis 7, Insel bis 3). `later`: nachträglich in einem laufenden Spiel,
  // dann weder Wege, Truhen, eigenes Land noch Figuren überbauen.
  campHuts(t, ti, later) {
    const want = t.island ? 3 : 7, take = this.campPlacer(t, ti, later);
    for (const [ox, oy] of t.island ? ISLAND_HUT_SPOTS : HUT_SPOTS) {
      if (t.huts.length >= want) break;
      const r = take(ox, oy);
      if (r) t.huts.push(r);
    }
  },
  // Spielstände von vor dem Umbau: größere Lager, ein paar Hütten mehr und erst einmal Ruhe
  rebalance(from) {
    const rnd = mulberry(hash(this.seed + ':umbau:' + this.day));
    this.tribes.forEach((t, ti) => {
      if (t.defeated) return;
      if (from < 2) {
        t.cap0 = (t.cap0 || t.cap) + 8; t.cap += 8;
        t.warriors += 6;
        this.campHuts(t, ti, true);
        if (!t.island) { t.raidAt = null; t.raidIn = Math.max(t.raidIn, 2 + Math.floor(rnd() * 4)); }
      }
      if (from < 3) {   // Häuser, Wachtürme, Waffen und Vorräte
        this.campBuilds(t, ti, true);
        if (t.weapons == null) t.weapons = 5 + this.day;
        if (!t.goods) t.goods = { coins: 60 + this.day * 6, bread: 10, wood: 15 };
      }
    });
    if (from < 2) this.raidCalm = Math.max(this.raidCalm || 0, this.day + 3);
  },
  markCamps() {   // nach dem Laden: Hütten der Stämme blockieren wieder
    const w = this.world;
    w.tstruct.fill(-1);
    this.tribes.forEach((t, ti) => {
      if (t.defeated) return;
      for (const r of [t.hall, ...t.huts, ...(t.builds || [])]) for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) if (w.inb(r.x + dx, r.y + dy)) w.tstruct[w.i(r.x + dx, r.y + dy)] = ti;
    });
  },
  // flüchtiger Zustand nach Start und Laden
  initRealm() {
    this.foes = []; this.shots = [];
    if (!this.sieges) this.sieges = [];
    if (!this.ships) this.ships = [];
    if (!this.thieves) this.thieves = [];
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
    for (const t of this.tribes) if (t.thiefAt != null && !t.defeated && this.time >= t.thiefAt) { t.thiefAt = null; this.launchThief(t); }
    this.updateSieges(dt);
    this.updateThieves(dt);
    this.updateTowers(dt);
    this.updateTribeTowers(dt);
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
    for (const s of this.settlers) { const jb = s.job != null ? this.byId(s.job) : null; this.reveal(s.x, s.y, jb && jb.type === 'scout' ? 7 : 3.5); }
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
    if (b.type === 'tower') {
      const nx = TOWER_LEVELS[lvl + 1];
      if (!nx) return null;
      const de = (n) => String(n).replace('.', ',');
      const text = lvl < 2 ? `schießt selbst auf Krieger bis ${de(nx.range)} Felder weit, auch ohne Wache (Schaden ${de(nx.atk)} alle ${de(nx.cd)} s)` : `schießt weiter, härter und schneller: ${de(nx.range)} Felder, Schaden ${de(nx.atk)} alle ${de(nx.cd)} s`;
      return { name: nx.name, cost: nx.cost, build: nx.build, text };
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
    else if (b.type === 'tower') this.toast(`Ausgebaut: jetzt ein ${TOWER_LEVELS[b.level].name}. Er schießt selbst auf Krieger in der Nähe.`);
    else if (b.type === 'house') this.toast(`Ausgebaut: jetzt ein ${HOUSE_LEVELS[b.level].name}.`);
    else this.toast(`Ausgebaut: ${BUILDINGS[b.type].name}, Stufe ${b.level}.`);
    this.landDirty = true;
  },
  levelName(b) {
    const lvl = b.level || 1;
    if (b.type === 'house') return HOUSE_LEVELS[lvl].name;
    if (b.type === 'barracks') return BARRACKS_LEVELS[lvl].name;
    if (b.type === 'shipyard') return SHIPYARD_LEVELS[lvl].name;
    if (b.type === 'tower') return TOWER_LEVELS[Math.min(3, lvl)].name;
    return lvl >= 2 ? `${BUILDINGS[b.type].name} · Stufe ${lvl}` : BUILDINGS[b.type].name;
  },
  // alle bezahlten Ausbaukosten (für den Talwert)
  upgradeCosts(b) {
    const out = [], lvl = b.level || 1;
    for (let l = 2; l <= lvl; l++) {
      if (b.type === 'house') out.push(HOUSE_LEVELS[l].cost);
      else if (b.type === 'barracks') out.push(BARRACKS_LEVELS[l].cost);
      else if (b.type === 'shipyard') out.push(SHIPYARD_LEVELS[l].cost);
      else if (b.type === 'tower') out.push(TOWER_LEVELS[l].cost);
      else out.push(UPGRADE.cost);
    }
    return out;
  },
  recipeOf(b) {
    if (b.type === 'siege') return !(b.orders > 0) && b.ramOrders > 0 ? RAM_RECIPE : BUILDINGS.siege.recipe;   // Katapult, sonst Rammbock
    return b.type === 'shipyard' ? SHIPYARD_LEVELS[Math.min(3, b.level || 1)].recipe : BUILDINGS[b.type].recipe;
  },
  speedOf(b) { return b && b.type !== 'house' && b.type !== 'shipyard' && (b.level || 1) >= 2 ? UPGRADE.speed : 1; },
  radiusOf(b) {
    if (b.type === 'tower') return (b.level || 1) >= 2 ? TOWER_LEVELS[Math.min(3, b.level)].range : 0;   // Schussweite
    const def = BUILDINGS[b.type]; return (def.radius || 0) + (def.job && def.job !== 'farm' && (b.level || 1) >= 2 ? UPGRADE.radius : 0);
  },
  // Wachtürme der Stämme schießen auf deine Soldaten, Belagerungsgeräte und entdeckte Diebe
  updateTribeTowers(dt) {
    const B = CAMP_BUILD.tower;
    for (const t of this.tribes) {
      if (t.defeated || !t.builds) continue;
      for (const b of t.builds) {
        if (b.kind !== 'tower') continue;
        if (b.swing > 0) b.swing -= dt;
        if ((b.cd = (b.cd || 0) - dt) > 0) continue;
        const cx = b.x + 1, cy = b.y + 1;
        let tg = null, bd = B.range;
        for (const s of this.soldiers) { if (s.state === 'garrison') continue; const d = Math.hypot(s.x - cx, s.y - cy); if (d <= bd) { bd = d; tg = s; } }
        for (const c of this.sieges) { const d = Math.hypot(c.x - cx, c.y - cy); if (d <= bd) { bd = d; tg = c; } }
        for (const c of this.ships) { const d = Math.hypot(c.x - cx, c.y - cy); if (d <= bd) { bd = d; tg = c; } }
        for (const th of this.thieves || []) { if (!th.spotted) continue; const d = Math.hypot(th.x - cx, th.y - cy); if (d <= bd) { bd = d; tg = th; } }
        if (!tg) { b.cd = 0.4; continue; }
        b.cd = B.cd * (0.9 + this.rng() * 0.2);
        this.shoot({ kind: 'ttower', atk: B.atk * (1 + 0.25 * (this.tribeTier(t) - 1)), x: cx, y: cy }, tg, { x: cx, y: b.y - 0.8 });
        b.swing = 0.3;
      }
    }
  },
  // ausgebaute Wachtürme schießen selbst auf den nächsten Krieger in Reichweite
  updateTowers(dt) {
    for (const b of this.buildings) {
      if (b.type !== 'tower' || !b.built || (b.level || 1) < 2) continue;
      if (b.swing > 0) b.swing -= dt;
      if ((b.cd = (b.cd || 0) - dt) > 0) continue;
      const L = TOWER_LEVELS[Math.min(3, b.level)], cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const f = this.nearestFoe(cx, cy, L.range);
      if (!f) { b.cd = 0.3; continue; }
      b.cd = L.cd * (0.9 + this.rng() * 0.2);
      this.shoot({ kind: 'tower', atk: L.atk, x: cx, y: cy }, f, { x: cx, y: b.y - 0.9 });
      if (b.level >= 3) this.shots[this.shots.length - 1].kind = 'bolt';
      b.swing = 0.3;
    }
  },
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
      let free = this.settlers.filter((s) => s.job == null && s.recruit == null && !s.carry && !s.haul && !(s.task && s.task.site != null));
      if (!free.length) free = this.settlers.filter((s) => s.job == null && s.recruit == null && !s.carry && !(s.task && s.task.site != null));
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
  // liegt ein Militärgebäude nah genug am Lager, um von dort anzugreifen?
  inAttackRange(b, t) { return !!b && b.built && Math.hypot(b.x + b.w / 2 - t.cx - 0.5, b.y + b.h / 2 - t.cy - 0.5) <= (ATTACK_RANGE[b.type] || 0); },
  // für Angriffe: alle aus der Kaserne, aus Türmen und Festungen alle bis auf eine Wache.
  // Mit Lager t nur aus Gebäuden in Reichweite dieses Lagers.
  attackers(t) {
    const out = this.availableSoldiers().filter((s) => !t || this.inAttackRange(this.byId(s.home), t));
    for (const b of this.buildings) {
      if ((b.type !== 'tower' && b.type !== 'fort') || (t && !this.inAttackRange(b, t))) continue;
      const crew = this.soldiers.filter((s) => s.home === b.id && s.state === 'garrison' && s.campaign == null).sort((a, c) => c.hp - a.hp);
      out.push(...crew.slice(1));
    }
    return out;
  },
  // eigene Militärgebäude in Reichweite eines Lagers (für die Anzeige)
  attackSources(t) { return this.buildings.filter((b) => (b.type === 'barracks' || b.type === 'tower' || b.type === 'fort') && this.inAttackRange(b, t)); },
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
        const f = this.nearestFoe(cx, cy, 10, 'raid') || this.nearestFoe(cx, cy, CONTACT_R + 1);
        if (f) { const d = this.door(home); s.x = d.x + 0.5; s.y = d.y + 0.5; s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; }
        return;
      }
      case 'home': {
        s.hp = Math.min(this.maxHp(s), s.hp + dt * 0.6);
        if (s.path && this.follow(s, dt * spd * 0.5) === 'blocked') s.path = null;
        if ((s.think -= dt) > 0) return;
        s.think = 0.5;
        const f = this.raidTarget(s.x, s.y) || this.contactFoe(s);
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
          const r = this.unitGo(s, (x, y) => x === d.x && y === d.y, d.x, d.y, 300000);
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
          const r = this.unitGo(s, nextToRect(t.hall.x, t.hall.y, 3, 3), t.cx, t.cy, 300000);
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
        // aufgeben nur, wenn der Feind nicht mehr nah ist und weit weg vom Platz oder Zuhause (sonst pendelt der Soldat)
        const tooFar = !s.ordered && f && dist(s, f) > CONTACT_R + 2 && (s.post ? Math.hypot(f.x - s.post.x, f.y - s.post.y) > 12
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
        if ((s.think -= dt) <= 0) { s.think = 0.4; const near = this.nearestFoe(s.x, s.y, 1.3); if (near && near !== f && dist(s, f) > 2.5 && !s.ordered) { s.foe = near.id; return; } }
        this.engage(s, f, dt, spd);
        return;
      }
      case 'move': {   // auf dem Weg zum befohlenen Platz; kämpft, sobald Feinde nah kommen
        if ((s.think -= dt) <= 0) {
          s.think = 0.4;
          const f = this.contactFoe(s);
          if (f) { s.foe = f.id; s.state = 'fight'; s.path = null; s.stuckT = 0; return; }
        }
        const p = s.post;
        if (!p) { s.state = 'return'; return; }
        if (!s.path) {
          if ((s.repath = (s.repath || 0) - dt) > 0) return;
          s.repath = 1;
          const r = this.unitGo(s, (x, y) => x === p.x && y === p.y, p.x, p.y, 300000);
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
  // Feind in Kontaktweite eines Soldaten
  contactFoe(s) { return this.nearestFoe(s.x, s.y, s.type === 'archer' ? Math.max(CONTACT_R, this.rangeOf(s) + 1) : CONTACT_R); },
  // wer getroffen wird, wehrt sich (gegen Türme und Schiffe geht das nicht)
  provoke(u, by) {
    if (!by || u.hp <= 0 || u.state === 'fight' || u.state === 'garrison' || u.mode === 'thief') return;
    if (u.kind === 'soldier' && by.kind === 'foe' && this.foes.includes(by)) Object.assign(u, { foe: by.id, state: 'fight', path: null, stuckT: 0 });
    else if (u.kind === 'foe' && by.kind === 'soldier' && this.soldiers.includes(by)) Object.assign(u, { foe: by.id, state: 'fight', path: null, repath: 0, stuckT: 0 });
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
    if (e && (e.kind === 'foe' || e.kind === 'catapult' || e.kind === 'ram')) return null;   // Diebe dürfen mit Booten übers Wasser
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
    if (d.hp <= 0) this.killUnit(d, a); else this.provoke(d, a);
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
      if (sh.kind === 'stone') { this.stoneHit(sh); continue; }
      const list = sh.tkind === 'soldier' ? this.soldiers : sh.tkind === 'catapult' || sh.tkind === 'ram' ? this.sieges : sh.tkind === 'ship' ? this.ships : sh.tkind === 'thief' ? (this.thieves || []) : this.foes;
      const tg = list.find((u) => u.id === sh.tid);
      if (!tg) continue;
      tg.hp -= sh.dmg * (tg.kind === 'ram' ? RAM.armor : 1); tg.hurtT = 0.25;
      if (tg.hp <= 0) { if (list === this.sieges) this.destroySiege(tg); else if (list === this.ships) this.destroyShip(tg); else if (tg.kind === 'thief') this.killThief(tg); else this.killUnit(tg, sh.by); }
      else this.provoke(tg, sh.by);
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
    this.floatText(u.x, u.y - 0.7, u.type === 'chief' ? 'Häuptling besiegt!' : u.mode === 'thief' ? 'Dieb gefasst!' : 'besiegt', '#ffe08a');
    if (u.mode === 'thief') {
      if (u.coinsStolen) { this.coins += u.coinsStolen; u.coinsStolen = 0; }
      this.toast(`Ein Dieb der ${t.name} wurde gefasst${u.loot || u.stole ? '. Die Beute ist zurück' : ''}.`);
    }
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
  warriorAtk(t) { return t.atk * (1 + 0.25 * (this.tribeTier(t) - 1)) * (1 + Math.min(25, t.weapons || 0) * 0.008); },
  chiefHp(t) { return FOE.chiefHp + FOE.chiefHpTier * this.tribeTier(t); },
  foeSpeed(f) { return f.type === 'chief' ? 2.1 : f.mode === 'thief' ? 3 : f.mode === 'raid' ? FOE.raidSpeed : SETTLER_SPEED; },
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
  foesOf(ti) { let n = 0; for (const f of this.foes) if (f.tribe === ti && f.mode !== 'thief') n++; return n; },
  realmNewDay() {
    const army = this.soldiers.length, due = [];
    this.tribes.forEach((t, ti) => {
      if (t.defeated) return;
      // Wettrüsten: je größer dein Heer und je später im Jahr, desto mehr Krieger
      t.cap0 = t.cap0 || t.cap;
      t.cap = t.cap0 + Math.round(this.day * 0.4 + army * 0.25);
      t.acc += t.grow * (1 + this.day / 20);
      t.weapons = Math.min(60, (t.weapons || 0) + 1);
      const tg = t.goods || (t.goods = { coins: 0, bread: 0, wood: 0 }), tier = this.tribeTier(t);
      tg.coins = Math.min(500, (tg.coins || 0) + 8 * tier); tg.bread = Math.min(40, (tg.bread || 0) + 2); tg.wood = Math.min(60, (tg.wood || 0) + 3);
      while (t.acc >= 1) { t.acc--; if (t.warriors + this.foesOf(ti) < t.cap) t.warriors++; }
      if (t.island || this.day < FIRST_RAID || t.peaceUntil >= this.day) return;
      t.raidIn--;
      if (t.raidIn <= 0) due.push(t);
    });
    // ab Tag 6 schleicht sich alle paar Tage ein Dieb eines Stammes zu deinem Lager
    if (this.day >= 6 && this.day >= (this.thiefCalm || 0)) {
      const cands = this.tribes.filter((t) => !t.defeated && !t.island && t.peaceUntil < this.day && t.thiefAt == null);
      if (cands.length) {
        const t = cands[Math.floor(this.rng() * cands.length)];
        t.thiefAt = (3 + this.rng() * 8) * SEC_PER_HOUR;
        this.thiefCalm = this.day + 4 + Math.floor(this.rng() * 4);
      }
    }
    if (!due.length) return;
    // höchstens ein Überfall auf einmal, danach einige Tage Ruhe; wer gerade nicht darf, wartet ein paar Tage
    const busy = this.day < (this.raidCalm || 0) || this.tribes.some((t) => t.raid || t.raidAt != null) || this.foes.some((f) => f.mode === 'raid');
    const pick = busy ? null : due[Math.floor(this.rng() * due.length)];
    const hut = this.buildings.find((b) => b.type === 'hut') || this.buildings[0];
    for (const t of due) {
      if (t !== pick) { t.raidIn = 1 + Math.floor(this.rng() * 3); continue; }
      t.raidAt = (2 + this.rng() * 6) * SEC_PER_HOUR;
      t.raidIn = RAID_EVERY + Math.floor(Math.hypot(t.cx - hut.x, t.cy - hut.y) / 30) + Math.floor(this.rng() * 4);   // weit entfernte Stämme kommen seltener
      this.raidCalm = this.day + RAID_CALM + Math.floor(this.rng() * 3);
    }
  },
  launchRaid(t) {
    const ti = this.tribes.indexOf(t);
    const stores = this.buildings.filter((b) => b.type === 'storage' && b.built);
    if (!stores.length || t.raid) return false;
    const target = stores.sort((a, c) => Math.hypot(a.x - t.cx, a.y - t.cy) - Math.hypot(c.x - t.cx, c.y - t.cy))[0];
    const n = Math.min(t.warriors - 3, RAID_MAX, 3 + Math.floor(Math.max(0, this.day - FIRST_RAID) * 0.4));
    if (n < 2) return false;
    const d = this.campDoor(t);
    const goal = nextToRect(target.x, target.y, target.w, target.h);
    const path = findPath(this.world, d.x, d.y, goal, target.x + 1, target.y + 1, 300000);
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
    else if (f.mode === 'thief') { if (f.coinsStolen && t.goods) t.goods.coins = (t.goods.coins || 0) + f.coinsStolen; }
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
      const tooFar = f.mode === 'defend' && tg && dist(f, tg) > CONTACT_R + 2 && Math.hypot(tg.x - t.cx - 0.5, tg.y - t.cy - 0.5) > ALARM_R + 3;
      if (!tg || tg.state === 'garrison' || tooFar || (f.stuckT || 0) > 3) {
        f.foe = null; f.stuckT = 0; f.path = null;
        f.state = f.mode === 'defend' ? 'guard' : f.mode === 'sally' ? 'sally' : f.loot ? 'flee' : 'march';
        return;
      }
      if ((f.think -= dt) <= 0) { f.think = 0.4; const near = this.nearestSoldier(f.x, f.y, 1.3); if (near && near !== tg && dist(f, tg) > 2.5) { f.foe = near.id; return; } }
      this.engage(f, tg, dt, this.foeSpeed(f));
      return;
    }
    if (f.mode === 'thief') return this.updateFoeThief(f, t, door, dt);
    if ((f.think -= dt) <= 0) {
      f.think = 0.4;
      const s = this.nearestSoldier(f.x, f.y, f.mode === 'defend' ? 8 : f.range > 1.5 ? Math.max(CONTACT_R, f.range + 1) : CONTACT_R);
      if (s && (f.mode !== 'defend' || Math.hypot(s.x - t.cx - 0.5, s.y - t.cy - 0.5) <= ALARM_R + 2)) { f.foe = s.id; f.state = 'fight'; f.path = null; f.repath = 0; f.stuckT = 0; return; }
    }
    if (f.mode === 'sally') {   // aus dem Lager gestürmt, um ein Katapult zu zerschlagen
      const c = this.sieges.find((x) => x.id === f.target) || this.thieves.find((x) => x.id === f.target && x.state !== 'home');
      if (!c || t.defeated) { f.mode = 'raid'; f.state = 'flee'; f.path = null; return; }
      const dc = dist(f, c);
      if (dc > 1.1 && dc < 2.2) {   // letztes Stück direkt heran (auch schräg neben dem Katapult)
        const step = Math.min(dc - 0.9, dt * this.foeSpeed(f));
        f.x += (c.x - f.x) / dc * step; f.y += (c.y - f.y) / dc * step; f.walkT = (f.walkT || 0) + 0.15; f.path = null;
        f.facing = Math.abs(c.x - f.x) > Math.abs(c.y - f.y) ? (c.x > f.x ? 1 : 3) : (c.y > f.y ? 2 : 0);
        return;
      }
      if (dc <= 1.1) {
        f.path = null;
        if (f.cd <= 0) { f.cd = (f.cdT || HIT_CD) * (0.9 + this.rng() * 0.2); f.swing = 0.3; c.hp -= f.atk * (0.75 + this.rng() * 0.5) * (c.kind === 'ram' ? RAM.armor : 1); c.hurtT = 0.25; this.sound('clash', c.x, c.y); if (c.hp <= 0) { if (c.kind === 'thief') this.killThief(c); else this.destroySiege(c); } }
        return;
      }
      if (!f.path || (f.repath = (f.repath || 0) - dt) <= 0) { f.repath = 1; this.unitGo(f, (x, y) => Math.max(Math.abs(x - Math.floor(c.x)), Math.abs(y - Math.floor(c.y))) <= 1, Math.floor(c.x), Math.floor(c.y), 30000); }
      if (f.path && this.follow(f, dt * this.foeSpeed(f)) === 'blocked') f.path = null;
      return;
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
        const r = this.unitGo(f, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 300000);
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
      const r = this.unitGo(f, (x, y) => x === door.x && y === door.y, door.x, door.y, 300000);
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
    for (const r of [t.hall, ...t.huts, ...(t.builds || [])]) for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) { w.tstruct[w.i(r.x + dx, r.y + dy)] = -1; w.touch(r.x + dx, r.y + dy); }
    const fort = this.forcePlace('fort', t.hall.x, t.hall.y, true);
    fort.tribe = ti;
    const tg = t.goods || {};
    const all = { iron: 4, sword: 2 + Math.floor((t.weapons || 0) / 3), bread: 8 + (tg.bread || 0), plank: 10, wood: tg.wood || 0 }, loot = {};
    for (const k in all) if (all[k] > 0) loot[k] = all[k];
    const coins = 80 + 30 * this.stats.conquered + (tg.coins || 0);
    t.weapons = 0; t.goods = { coins: 0, bread: 0, wood: 0 };
    for (const k in loot) this.stock[k] = (this.stock[k] || 0) + loot[k];
    this.coins += coins;
    const here = this.soldiers.filter((s) => s.campaign === ti).sort((a, c) => Math.hypot(a.x - t.cx, a.y - t.cy) - Math.hypot(c.x - t.cx, c.y - t.cy));
    here.forEach((s, i) => {
      s.campaign = null; s.foe = null; s.path = null;
      if (i < (BUILDINGS.fort.garrison || 3)) { s.home = fort.id; s.arrived = false; s.state = 'toGarrison'; } else s.state = 'return';
    });
    this.stats.conquered++;
    this.landDirty = true;
    // die anderen rüsten auf, der nächste Nachbar sinnt auf Rache (aber auch er wartet die Ruhezeit ab)
    let next = null;
    for (const o of this.tribes) {
      if (o.defeated || o === t) continue;
      o.warriors += 4;
      if (!o.island && (!next || Math.hypot(o.cx - t.cx, o.cy - t.cy) < Math.hypot(next.cx - t.cx, next.cy - t.cy))) next = o;
    }
    if (next) next.raidIn = Math.min(next.raidIn, 3);
    const msg = `Du hast das Lager der ${t.name} erobert! Beute: ${coins} Münzen, ${Object.keys(loot).map((k) => `${loot[k]} ${ITEMS[k].name}`).join(', ')}.`;
    this.toast(`Lager der ${t.name} erobert!`);
    this.sound('quest');
    this.today.events.push(msg);
  },
  // want: Anzahl oder { sword, archer }
  attackTribe(ti, want, list) {
    const t = this.tribes[ti];
    if (!t || t.defeated) return 'Dieses Lager gibt es nicht mehr.';
    const avail = list || this.attackers(t);
    if (!avail.length) return list || this.attackSources(t).length ? 'Keine freien Soldaten in der Nähe. Bilde in der Kaserne welche aus. Jeder Turm behält eine Wache.' : 'Kein eigenes Militärgebäude in Reichweite. Bau einen Wachturm näher am Lager.';
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
      const r = this.unitGo(s, goal, t.cx, t.cy, 300000);
      if (!r) { s.campaign = null; continue; }
      s.state = 'march'; s.think = 0; sent++;
    }
    if (!sent) return 'Deine Soldaten finden keinen Weg dorthin.';
    const fleet = this.coastal(t) ? this.ships.filter((x) => x.campaign == null && (x.state === 'dock' || x.state === 'hold')).slice(0, 2) : [];
    for (const x of fleet) Object.assign(x, { campaign: ti, auto: true, state: 'attack', path: null, repath: 0, post: null, foeTarget: null });
    const ships = fleet.length;
    this.toast(`${sent} ${sent === 1 ? 'Soldat zieht' : 'Soldaten ziehen'} gegen die ${t.name}.${ships ? ` ${ships === 1 ? 'Ein Kriegsschiff schießt' : `${ships} Kriegsschiffe schießen`} von der Küste mit.` : ''}`);
    return null;
  },
  // Kriegsschiffe: liegen an der Werft, segeln auf Befehl und schießen auf Krieger und Lagergebäude in Reichweite
  updateShips(dt) {
    for (const sh of this.ships.slice()) {
      if (!this.ships.includes(sh)) continue;
      if (sh.cd > 0) sh.cd -= dt;
      if (sh.swing > 0) sh.swing -= dt;
      if (sh.hurtT > 0) sh.hurtT -= dt;
      let t = sh.campaign != null ? this.tribes[sh.campaign] : null;
      // bei einem Angriff mitgeschickt: zurück an die Werft, wenn der Angriff vorbei ist
      if (sh.auto && (!t || t.defeated || !this.soldiers.some((s) => s.campaign === sh.campaign))) { sh.auto = false; sh.campaign = null; t = null; if (sh.state !== 'dock') { sh.state = 'return'; sh.path = null; } }
      if (sh.campaign != null && (!t || t.defeated)) { sh.campaign = null; t = null; if (sh.state === 'attack') { sh.state = 'hold'; sh.path = null; } }
      if (sh.cd <= 0) {   // schießen: erst Krieger, im Halten auch auf Gebäude eines Lagers
        let f = null, bd = WARSHIP.range;
        if (sh.state === 'hunt') { const o = this.foes.find((x) => x.id === sh.foeTarget); if (o && Math.hypot(o.x - sh.x, o.y - sh.y) <= bd) f = o; }
        if (!f) for (const o of this.foes) { const d = Math.hypot(o.x - sh.x, o.y - sh.y); if (d <= bd) { bd = d; f = o; } }
        if (f) { sh.cd = WARSHIP.cd; sh.facing = f.x >= sh.x ? 1 : 3; this.shoot(sh, f); }
        else if (sh.state === 'hold' || (sh.state === 'attack' && !sh.path)) {
          const near = this.structureInRange(sh.x, sh.y, WARSHIP.range);
          if (near) { sh.cd = WARSHIP.cd * 1.4; this.fireStone(sh, near.ti, near.s.x + 1, near.s.y + 1, near.s.x, near.s.y); } else sh.cd = 0.3;
        } else sh.cd = 0.3;
      }
      if (sh.state === 'dock' || sh.state === 'hold') continue;
      if (sh.state === 'hunt') {
        const o = this.foes.find((x) => x.id === sh.foeTarget);
        if (!o) { Object.assign(sh, { foeTarget: null, state: 'hold', path: null }); continue; }
        if (Math.hypot(o.x - sh.x, o.y - sh.y) <= WARSHIP.range - 0.5) { sh.path = null; continue; }
      }
      if (!sh.path) {
        if ((sh.repath = (sh.repath || 0) - dt) > 0) continue;
        sh.repath = 1.5;
        let r = null;
        if (sh.state === 'sail') { const p = sh.post; r = this.unitGo(sh, (x, y) => x === p.x && y === p.y, p.x, p.y, 80000); }
        else if (sh.state === 'attack') r = this.unitGo(sh, (x, y) => Math.hypot(x - t.cx, y - t.cy) <= WARSHIP.range - 0.5, t.cx, t.cy, 80000);
        else if (sh.state === 'hunt') { const o = this.foes.find((x) => x.id === sh.foeTarget); r = this.unitGo(sh, (x, y) => Math.hypot(x - o.x, y - o.y) <= WARSHIP.range - 1, Math.floor(o.x), Math.floor(o.y), 80000); }
        else {   // return
          const home = this.byId(sh.home) || this.vehicleHome('ship'), p = home && this.dockSpot(home, sh);
          if (p) { sh.home = home.id; r = this.unitGo(sh, (x, y) => x === p.x && y === p.y, p.x, p.y, 80000); }
        }
        if (r === 'here') this.shipArrived(sh);
        else if (!r) {
          if (sh.state === 'return') sh.state = 'dock';   // kein Weg zurück: bleibt, wo es ist
          else { if (!sh.auto) this.toast('Das Kriegsschiff kommt dort nicht hin, das Wasser hängt nicht zusammen.'); Object.assign(sh, { state: sh.auto ? 'return' : 'hold', campaign: null, auto: false, foeTarget: null }); }
        }
        continue;
      }
      const r = this.follow(sh, dt * WARSHIP.speed);
      if (r === true) { sh.path = null; this.shipArrived(sh); } else if (r === 'blocked') sh.path = null;
    }
  },
  shipArrived(sh) { if (sh.state === 'sail' || sh.state === 'attack') sh.state = 'hold'; else if (sh.state === 'return') sh.state = 'dock'; },
  destroyShip(sh) {
    this.ships = this.ships.filter((x) => x !== sh);
    this.fleet[3] = Math.max(0, (this.fleet[3] || 0) - 1); this.boats = this.fleet.reduce((a, n) => a + n, 0);
    this.sound('crash', sh.x, sh.y);
    this.floatText(sh.x, sh.y - 0.6, 'versenkt', '#ff9a8a');
    this.toast('Ein Kriegsschiff wurde versenkt.');
  },
  addBoat(tier) { this.fleet[tier] = (this.fleet[tier] || 0) + 1; this.boats = this.fleet.reduce((a, n) => a + n, 0); },
  recall(ti) {
    let n = 0;
    for (const s of this.soldiers) if (s.campaign === ti) { s.campaign = null; s.foe = null; s.state = 'return'; s.path = null; n++; }
    for (const c of [...this.sieges, ...this.ships]) if (c.campaign === ti) Object.assign(c, { campaign: null, order: null, auto: false, state: 'return', path: null });
    return n;
  },
  /* ---------- Belagerung ---------- */
  // Ziele im Lager: erst Wachtürme, dann Häuser, dann Hütten
  campTargets(t) { const b = t.builds || []; return [...b.filter((x) => x.kind === 'tower'), ...b.filter((x) => x.kind === 'house'), ...t.huts]; },
  firstTargets(t) { const all = this.campTargets(t); if (!all.length) return all; const kind = all[0].kind || 'hut'; return all.filter((x) => (x.kind || 'hut') === kind); },
  /* ---------- Fahrzeuge: Katapulte, Rammböcke, Kriegsschiffe ---------- */
  // Zuhause eines Fahrzeugs: Geschützbauer (sonst Kaserne oder Lager), Schiffe an der Werft
  vehicleHome(kind) {
    if (kind === 'ship') return this.buildings.find((b) => b.type === 'shipyard' && b.built) || null;
    return this.buildings.find((b) => b.type === 'siege' && b.built) || this.buildings.find((b) => b.type === 'barracks' && b.built) || this.buildings.find((b) => b.type === 'storage' && b.built) || this.buildings[0];
  },
  // freier Parkplatz neben dem Gebäude
  parkSpot(home, c) {
    const w = this.world, d = this.door(home);
    const used = new Set(this.sieges.filter((o) => o !== c && o.state === 'park').map((o) => Math.floor(o.y) * 4096 + Math.floor(o.x)));
    for (let r = 1; r <= 7; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = d.x + dx, y = d.y + dy;
      if (w.walkable(x, y) && !used.has(y * 4096 + x)) return { x, y };
    }
    return { x: d.x, y: d.y };
  },
  // Liegeplatz auf dem Wasser nahe der Werft
  dockSpot(home, sh) {
    const w = this.world, cx = home.x + 1, cy = home.y + 1;
    const used = new Set(this.ships.filter((o) => o !== sh && o.state === 'dock').map((o) => Math.floor(o.y) * 4096 + Math.floor(o.x)));
    for (let r = 1; r <= 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (w.inb(x, y) && w.isWater(x, y) && !used.has(y * 4096 + x)) return { x, y };
    }
    return null;
  },
  addVehicle(kind, home, at) {
    const hp = kind === 'ram' ? RAM.hp : CATAPULT.hp;
    const c = { id: this.nextId++, kind, x: 0, y: 0, home: home ? home.id : null, state: 'park', campaign: null, order: null, post: null, foeTarget: null, target: null, hp, maxHp: hp, cd: 0, path: null, pi: 0, facing: 2, swing: 0, hurtT: 0, walkT: 0, repath: 0, skip: [] };
    const p = at || (home ? this.parkSpot(home, c) : { x: Math.floor(this.player.x), y: Math.floor(this.player.y) });
    c.x = p.x + 0.5; c.y = p.y + 0.5;
    this.sieges.push(c);
    return c;
  },
  addShip(home, at) {
    const sh = { id: this.nextId++, kind: 'ship', x: 0, y: 0, home: home ? home.id : null, state: 'dock', campaign: null, post: null, foeTarget: null, auto: false, hp: WARSHIP.hp, maxHp: WARSHIP.hp, cd: 0, path: null, pi: 0, facing: 1, swing: 0, hurtT: 0, walkT: 0, repath: 0 };
    const p = at || (home && this.dockSpot(home, sh));
    if (!p) return null;
    sh.x = p.x + 0.5; sh.y = p.y + 0.5;
    this.ships.push(sh);
    return sh;
  },
  syncVehicleCounts() { this.catapults = this.sieges.filter((c) => c.kind === 'catapult').length; this.rams = this.sieges.filter((c) => c.kind === 'ram').length; },
  idleVehicles(kind) { return this.sieges.filter((c) => c.kind === kind && c.campaign == null && (c.state === 'park' || c.state === 'hold' || c.state === 'return')); },
  coastal(t) {
    const w = this.world;
    for (let y = t.cy - 8; y <= t.cy + 8; y++) for (let x = t.cx - 8; x <= t.cx + 8; x++) if (w.inb(x, y) && w.isWater(x, y) && Math.hypot(x - t.cx, y - t.cy) <= WARSHIP.range - 0.5) return true;
    return false;
  },
  // Katapulte rollen in Schussweite, Rammböcke bis an die Gebäude (aus dem Fenster eines Stammes)
  siegeTribe(ti, n) {
    const t = this.tribes[ti];
    if (!t || t.defeated) return 'Dieses Lager gibt es nicht mehr.';
    if (t.island) return 'Auf die Insel kommen keine Belagerungsgeräte.';
    const cats = this.idleVehicles('catapult').slice(0, n), rams = this.idleVehicles('ram').slice(0, 2);
    if (!cats.length && !rams.length) return 'Kein Katapult und kein Rammbock bereit. Bestell sie beim Geschützbauer.';
    if (!this.attackSources(t).length) return 'Kein eigenes Militärgebäude in Reichweite. Bau einen Wachturm näher am Lager.';
    if (!this.campTargets(t).length) return 'In diesem Lager steht nichts mehr, was man zerstören könnte.';
    this.orderVehicleAttack([...cats, ...rams], ti, null);
    const kc = cats.length, kr = rams.length, word = (k, one, many) => (k === 1 ? one : `${k} ${many}`);
    const parts = [kc ? word(kc, 'ein Katapult', 'Katapulte') : '', kr ? word(kr, 'ein Rammbock', 'Rammböcke') : ''].filter(Boolean).join(' und ');
    this.toast(`${parts[0].toUpperCase()}${parts.slice(1)} ${kc + kr === 1 ? 'rollt' : 'rollen'} zum Lager der ${t.name}. Schick Soldaten zum Schutz mit.`);
    return null;
  },
  // Befehle (Truppensteuerung) für Katapulte, Rammböcke und Kriegsschiffe
  orderVehicleMove(list, tx, ty) {
    let n = 0;
    for (const c of list) {
      if (c.kind === 'ship') {
        const p = this.waterNear(tx, ty);
        if (!p) continue;
        Object.assign(c, { post: p, campaign: null, foeTarget: null, auto: false, state: 'sail', path: null, repath: 0 });
      } else Object.assign(c, { post: { x: tx, y: ty }, campaign: null, order: null, foeTarget: null, state: 'move', path: null, repath: 0, skip: [] });
      n++;
    }
    return n;
  },
  orderVehicleAttack(list, ti, structure) {
    for (const c of list) {
      if (c.kind === 'ship') Object.assign(c, { campaign: ti, post: null, foeTarget: null, auto: false, state: 'attack', path: null, repath: 0 });
      else Object.assign(c, { campaign: ti, order: structure ? { x: structure.x, y: structure.y } : null, post: null, foeTarget: null, state: 'roll', path: null, repath: 0, skip: [] });
    }
  },
  orderVehicleAttackFoe(list, foe) {
    for (const c of list) {
      if (c.kind === 'ram') Object.assign(c, { post: { x: Math.floor(foe.x), y: Math.floor(foe.y) }, campaign: null, order: null, foeTarget: null, state: 'move', path: null, repath: 0 });
      else Object.assign(c, { foeTarget: foe.id, campaign: null, order: null, post: null, auto: false, state: 'hunt', path: null, repath: 0 });
    }
  },
  orderVehicleRelease(list) {
    for (const c of list) Object.assign(c, { post: null, campaign: null, order: null, foeTarget: null, auto: false, state: 'return', path: null, repath: 0 });
  },
  // Wasserfeld nahe (tx, ty); ob das Schiff hinkommt, zeigt die Wegsuche
  waterNear(tx, ty) {
    const w = this.world;
    for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (w.inb(x, y) && w.isWater(x, y)) return { x, y };
    }
    return null;
  },
  // nächstes Gebäude eines entdeckten Lagers in Reichweite
  structureInRange(x, y, range) {
    let best = null, bd = range;
    this.tribes.forEach((t, ti) => {
      if (t.defeated || !this.world.seen[this.world.i(t.cx, t.cy)] || Math.hypot(t.cx - x, t.cy - y) > range + 14) return;
      for (const s of this.campTargets(t)) { const d = Math.hypot(s.x + 1 - x, s.y + 1 - y); if (d < bd) { bd = d; best = { ti, s }; } }
    });
    return best;
  },
  // Gebäude, an dem ein Rammbock gerade steht
  adjacentStructure(c) {
    for (let ti = 0; ti < this.tribes.length; ti++) {
      const t = this.tribes[ti];
      if (t.defeated || Math.hypot(t.cx - c.x, t.cy - c.y) > 16) continue;
      for (const s of this.campTargets(t)) if (c.x >= s.x - 0.7 && c.x <= s.x + 2.7 && c.y >= s.y - 0.7 && c.y <= s.y + 2.7) return { ti, s };
    }
    return null;
  },
  fireStone(c, ti, x1, y1, hx, hy) {
    const x0 = c.x, y0 = c.y - 0.6;
    this.shots.push({ x0, y0, x1, y1, t: 0, dur: 0.7 + Math.hypot(x1 - x0, y1 - y0) * 0.07, kind: 'stone', tribe: ti, hx, hy });
    c.swing = 0.6; c.facing = x1 >= c.x ? 1 : 3;
    this.sound('catapult', c.x, c.y);
  },
  vehicleArrived(c) {
    if (c.state === 'roll') { c.state = c.kind === 'ram' ? 'ram' : 'fire'; c.cd = Math.max(c.cd || 0, 1.2); }
    else if (c.state === 'move') c.state = 'hold';
    else if (c.state === 'return') this.parkVehicle(c);
  },
  parkVehicle(c) {
    const home = this.byId(c.home) || this.vehicleHome(c.kind);
    if (home) { const p = this.parkSpot(home, c); c.x = p.x + 0.5; c.y = p.y + 0.5; c.home = home.id; }
    Object.assign(c, { state: 'park', path: null, campaign: null, order: null, post: null, foeTarget: null });
  },
  updateSieges(dt) {
    for (const c of this.sieges.slice()) {
      if (!this.sieges.includes(c)) continue;
      if (c.hurtT > 0) c.hurtT -= dt;
      if (c.swing > 0) c.swing -= dt;
      if (c.cd > 0) c.cd -= dt;
      const ram = c.kind === 'ram', speed = ram ? RAM.speed : CATAPULT.speed;
      let t = c.campaign != null ? this.tribes[c.campaign] : null;
      if (c.campaign != null && (!t || t.defeated || !this.campTargets(t).length)) {
        c.campaign = null; c.order = null; t = null;
        if (c.state === 'roll' || c.state === 'fire' || c.state === 'ram') { c.state = c.post ? 'move' : 'return'; c.path = null; }
      }
      if (c.state === 'park') continue;
      if (c.state === 'hold') {   // hält einen befohlenen Platz und greift an, was in Reichweite liegt
        if (ram) { const a = this.adjacentStructure(c); if (a) Object.assign(c, { campaign: a.ti, target: { x: a.s.x, y: a.s.y }, state: 'ram', cd: 0.8 }); continue; }
        if (c.cd > 0) continue;
        const near = this.structureInRange(c.x, c.y, CATAPULT.range);
        if (near) { c.cd = CATAPULT.cd * (0.9 + this.rng() * 0.2); this.fireStone(c, near.ti, near.s.x + 1, near.s.y + 1, near.s.x, near.s.y); this.sallyFor(this.tribes[near.ti], c); }
        else c.cd = 0.5;
        continue;
      }
      if (c.state === 'hunt') {   // Katapult schießt auf einen Krieger
        const f = this.foes.find((x) => x.id === c.foeTarget);
        if (!f) { Object.assign(c, { foeTarget: null, post: { x: Math.floor(c.x), y: Math.floor(c.y) }, state: 'hold', path: null }); continue; }
        if (Math.hypot(f.x - c.x, f.y - c.y) <= CATAPULT.range) { c.path = null; if (c.cd <= 0) { c.cd = CATAPULT.cd; this.fireStone(c, f.tribe, f.x, f.y, null, null); } continue; }
        if (!c.path && (c.repath = (c.repath || 0) - dt) <= 0) { c.repath = 1; this.unitGo(c, (x, y) => Math.hypot(x - f.x, y - f.y) <= CATAPULT.range - 1, Math.floor(f.x), Math.floor(f.y), 60000); }
        if (c.path && this.follow(c, dt * speed) === 'blocked') c.path = null;
        continue;
      }
      if (c.state === 'fire') {   // erst das befohlene Ziel, sonst Türme vor Häusern vor Hütten in Reichweite
        if (c.cd > 0) continue;
        const all = this.campTargets(t), inRange = (x) => Math.hypot(x.x + 1 - c.x, x.y + 1 - c.y) <= CATAPULT.range + 1;
        let h = c.order ? all.find((x) => x.x === c.order.x && x.y === c.order.y) : null;
        if (!h) {
          c.order = null;
          const first = this.firstTargets(t).filter(inRange), any = first.length ? first : all.filter(inRange);
          h = any[Math.floor(this.rng() * any.length)];
          if (!h) { const next = this.firstTargets(t)[0]; c.order = next ? { x: next.x, y: next.y } : null; c.state = 'roll'; c.path = null; c.repath = 0; continue; }   // näher heran
        } else if (!inRange(h)) { c.state = 'roll'; c.path = null; c.repath = 0; continue; }
        c.cd = CATAPULT.cd * (0.9 + this.rng() * 0.2);
        this.fireStone(c, c.campaign, h.x + 1, h.y + 1, h.x, h.y);
        this.sallyFor(t, c);
        continue;
      }
      if (c.state === 'ram') {   // Rammbock stößt gegen das Gebäude, neben dem er steht
        const tg = t && c.target ? this.campTargets(t).find((x) => x.x === c.target.x && x.y === c.target.y) : null;
        if (!tg) { if (t) { c.state = 'roll'; c.path = null; c.repath = 0; } else c.state = c.post ? 'hold' : 'return'; continue; }
        if (c.cd > 0) continue;
        c.cd = RAM.cd; c.swing = 0.5; c.facing = tg.x + 1 >= c.x ? 1 : 3;
        this.sound('crash', c.x, c.y);
        this.damageStructure(t, tg, RAM.dmg);
        this.sallyFor(t, c);
        continue;
      }
      // unterwegs: roll (zum Lager), move (zum befohlenen Platz), return (nach Hause)
      if (!c.path) {
        if ((c.repath = (c.repath || 0) - dt) > 0) continue;
        c.repath = 1;
        let r = null;
        if (c.state === 'roll' && ram) {   // befohlenes Ziel, sonst Türme vor Häusern vor Hütten, nahe zuerst
          const rank = { tower: 0, house: 1 }, skip = c.skip || (c.skip = []), all = this.campTargets(t);
          const ord = c.order ? all.find((x) => x.x === c.order.x && x.y === c.order.y) : null;
          const cands = (ord ? [ord] : []).concat(all.filter((x) => x !== ord && !skip.includes(x.x * 4096 + x.y))
            .sort((a, b) => (rank[a.kind] ?? 2) - (rank[b.kind] ?? 2) || Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)));
          for (const tg of cands.slice(0, 4)) {
            r = this.unitGo(c, nextToRect(tg.x, tg.y, 2, 2), tg.x + 1, tg.y + 1, 300000);
            if (r) { c.target = { x: tg.x, y: tg.y }; break; }
            skip.push(tg.x * 4096 + tg.y);
            if (tg === ord) c.order = null;
          }
          if (!r && cands.length > 4) { c.repath = 0.2; continue; }   // weitere Ziele beim nächsten Mal
        } else if (c.state === 'roll') {   // in Schussweite des befohlenen Ziels oder des Lagers
          const o = c.order ? this.campTargets(t).find((x) => x.x === c.order.x && x.y === c.order.y) : null;
          const ax = o ? o.x + 1 : t.cx, ay = o ? o.y + 1 : t.cy, lo = o ? 0 : 8;
          r = this.unitGo(c, (x, y) => { const dd = Math.hypot(x - ax, y - ay); return dd >= lo && dd <= CATAPULT.range - 1; }, Math.floor(ax), Math.floor(ay), 300000);
        } else if (c.state === 'move') {
          const p = c.post;
          r = this.unitGo(c, (x, y) => Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1, p.x, p.y, 300000);
        } else {
          const home = this.byId(c.home) || this.vehicleHome(c.kind);
          if (home) { c.home = home.id; r = this.unitGo(c, nextToRect(home.x, home.y, home.w, home.h), home.x + 1, home.y + 1, 300000); }
        }
        if (r === 'here') this.vehicleArrived(c);
        else if (!r) {
          if (c.state === 'roll') { this.toast(`${ram ? 'Ein Rammbock' : 'Ein Katapult'} findet keinen Weg zum Lager.`); Object.assign(c, { campaign: null, order: null, state: c.post ? 'hold' : 'return' }); }
          else if (c.state === 'move') { c.post = { x: Math.floor(c.x), y: Math.floor(c.y) }; c.state = 'hold'; this.toast(`${ram ? 'Ein Rammbock' : 'Ein Katapult'} kommt dort nicht hin.`); }
          else this.parkVehicle(c);
        }
        continue;
      }
      const r = this.follow(c, dt * speed);
      if (r === true) { c.path = null; this.vehicleArrived(c); } else if (r === 'blocked') c.path = null;
    }
  },
  // Stein schlägt ein: Gebäude beschädigt, Krieger in der Nähe verletzt
  stoneHit(sh) {
    const t = this.tribes[sh.tribe];
    this.sound('crash', sh.x1, sh.y1);
    if (!t || t.defeated) return;
    for (const f of this.foes.slice()) if (f.tribe === sh.tribe && Math.hypot(f.x - sh.x1, f.y - sh.y1) < 1.6) { f.hp -= CATAPULT.splash; f.hurtT = 0.25; if (f.hp <= 0) this.killUnit(f, null); }
    const h = this.campTargets(t).find((x) => x.x === sh.hx && x.y === sh.hy);
    if (h) this.damageStructure(t, h, 1);
  },
  damageStructure(t, h, dmg) {
    const max = h.kind ? CAMP_BUILD[h.kind].hp : CATAPULT.hutHp;
    h.hp = (h.hp == null ? max : h.hp) - dmg;
    if (h.hp > 0) return;
    const ti = this.tribes.indexOf(t), w = this.world;
    if (h.kind) t.builds = t.builds.filter((x) => x !== h); else t.huts = t.huts.filter((x) => x !== h);
    for (let dy = 0; dy < h.h; dy++) for (let dx = 0; dx < h.w; dx++) { const k = w.i(h.x + dx, h.y + dy); if (w.tstruct[k] === ti) w.tstruct[k] = -1; w.touch(h.x + dx, h.y + dy); }
    const per = h.kind === 'house' ? CAMP_BUILD.house.warriors : h.kind === 'tower' ? 0 : CATAPULT.perHut;
    const lost = Math.min(t.warriors, per);
    t.warriors -= lost;
    if (per) { t.cap0 = Math.max(6, (t.cap0 || t.cap) - per); t.cap = Math.max(t.cap0, t.cap - per); }
    const name = h.kind === 'tower' ? 'Ein Wachturm' : h.kind === 'house' ? 'Ein Haus' : 'Eine Hütte';
    this.floatText(h.x + 1, h.y, 'zerstört', '#ffb35a');
    this.toast(`${name} der ${t.name} ist eingestürzt${lost ? `, ${lost} Krieger weniger` : ''}.`);
    this.today.events.push(`${name} der ${t.name} wurde zerstört.`);
  },
  // das Lager schickt Krieger los, um das Gerät zu zerschlagen (höchstens alle 30 s)
  sallyFor(t, c) {
    if (t.warriors <= 0 || (t.sallyT || 0) > this.clock) return;
    t.sallyT = this.clock + 30;
    const ti = this.tribes.indexOf(t), door = this.campDoor(t), n = Math.min(t.warriors, 2 + this.tribeTier(t));
    for (let i = 0; i < n; i++) {
      const f = this.makeFoe(t, ti, 'sally', door.x + 0.5 + (this.rng() - 0.5) * 0.6, door.y + 0.5, this.warriorType());
      Object.assign(f, { state: 'sally', target: c.id, wait: i * 0.4, think: 0 });
      this.foes.push(f);
    }
    t.warriors -= n;
    if (!t.discovered) this.discoverTribe(t, true);
    this.toast(`Die ${t.name} schicken ${n} Krieger gegen ${c.kind === 'ram' ? 'deinen Rammbock' : c.kind === 'thief' ? 'deinen Dieb' : 'dein Katapult'}!`);
  },
  destroySiege(c) {
    this.sieges = this.sieges.filter((x) => x !== c);
    this.syncVehicleCounts();
    this.sound('crash', c.x, c.y);
    this.floatText(c.x, c.y - 0.6, 'zerschlagen', '#ff9a8a');
    this.toast(c.kind === 'ram' ? 'Ein Rammbock wurde zerschlagen.' : 'Ein Katapult wurde zerschlagen.');
  },
  /* ---------- Diebe ---------- */
  makeThief(home, x, y, id) { return { id: id != null ? id : this.nextId++, kind: 'thief', home, x, y, state: 'home', target: null, loot: null, hp: THIEF.hp, maxHp: THIEF.hp, spotted: false, path: null, pi: 0, facing: 2, walkT: 0, timer: 0, hurtT: 0 }; },
  // ein freier Siedler wird im Diebesversteck zum Dieb
  trainThief(b) {
    if (!b || !b.built) return 'Das Diebesversteck ist noch nicht fertig.';
    if (this.coins < THIEF.coins) return `Ein Dieb kostet ${THIEF.coins} Münzen.`;
    const d = this.door(b);
    const free = this.settlers.filter((s) => s.job == null && s.recruit == null && !s.carry && !s.haul && !(s.task && s.task.site != null))
      .sort((a, c) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(c.x - d.x, c.y - d.y));
    if (!free.length) return 'Kein Siedler ist frei. Bau Wohnhäuser, dann kommen mehr.';
    this.removeSettler(free[0]);
    this.coins -= THIEF.coins;
    this.thieves.push(this.makeThief(b.id, d.x + 0.5, d.y + 0.5));
    this.sound('train', d.x, d.y);
    return null;
  },
  thievesReady() { return this.thieves.filter((h) => h.state === 'home'); },
  sendThief(ti) {
    const t = this.tribes[ti];
    if (!t || t.defeated) return 'Dieses Lager gibt es nicht mehr.';
    const h = this.thievesReady()[0];
    if (!h) return 'Kein Dieb bereit. Bilde einen im Diebesversteck aus.';
    const door = this.campDoor(t);
    const r = this.unitGo(h, (x, y) => Math.abs(x - door.x) <= 1 && Math.abs(y - door.y) <= 1, door.x, door.y, 300000);
    if (!r) return t.island && this.boats <= 0 ? 'Auf die Insel kommt ein Dieb nur mit einem Boot.' : 'Der Dieb findet keinen Weg dorthin.';
    Object.assign(h, { target: ti, state: r === 'here' ? 'steal' : 'sneak', timer: THIEF.steal, spotted: false, loot: null });
    this.toast(`Ein Dieb schleicht sich zum Lager der ${t.name}.`);
    return null;
  },
  // wird der Dieb in der Nähe des Lagers entdeckt? (einmal je Sekunde)
  thiefSpotCheck(h, t, dt, factor = 1) {
    if (h.spotted || Math.hypot(h.x - t.cx, h.y - t.cy) > THIEF.zone) return false;
    h.spotT = (h.spotT || 0) + dt;
    if (h.spotT < 1) return false;
    h.spotT -= 1;
    const towers = (t.builds || []).filter((b) => b.kind === 'tower').length;
    const p = Math.min(THIEF.maxSpot, THIEF.spot + THIEF.spotPer * t.warriors + THIEF.spotTower * towers) * factor;
    if (this.rng() >= p) return false;
    h.spotted = true;
    this.toast(`Dein Dieb wurde bei den ${t.name} entdeckt und rennt davon!`);
    if (h.loot) this.sallyFor(t, h);   // gejagt wird er nur mit Beute; vorher schießen bloß die Türme
    return true;
  },
  thiefHome(h) {
    const home = this.byId(h.home) || this.nearestStorage(h.x, h.y) || this.buildings[0];
    return home;
  },
  updateThieves(dt) {
    for (const h of this.thieves.slice()) {
      if (!this.thieves.includes(h)) continue;
      if (h.hurtT > 0) h.hurtT -= dt;
      const t = h.target != null ? this.tribes[h.target] : null;
      if (h.state === 'home') { h.hp = Math.min(h.maxHp, h.hp + dt * 0.5); continue; }
      if ((h.state === 'sneak' || h.state === 'steal') && (!t || t.defeated)) { h.state = 'escape'; h.path = null; }
      if (h.state === 'sneak') {
        if (this.thiefSpotCheck(h, t, dt)) { h.state = 'escape'; h.path = null; continue; }
        const near = Math.hypot(h.x - t.cx, h.y - t.cy) <= THIEF.zone;
        if (!h.path) { const door = this.campDoor(t); const r = this.unitGo(h, (x, y) => Math.abs(x - door.x) <= 1 && Math.abs(y - door.y) <= 1, door.x, door.y, 300000); if (r === 'here') { h.state = 'steal'; h.timer = THIEF.steal; } else if (!r) { h.state = 'escape'; } continue; }
        const r = this.follow(h, dt * (near ? THIEF.sneak : THIEF.speed));
        if (r === true) { h.path = null; h.state = 'steal'; h.timer = THIEF.steal; } else if (r === 'blocked') h.path = null;
        continue;
      }
      if (h.state === 'steal') {
        if (this.thiefSpotCheck(h, t, dt, 1.5)) { h.state = 'escape'; h.path = null; continue; }
        if ((h.timer -= dt) > 0) continue;
        const T = THIEF.take, g = t.goods || (t.goods = { coins: 0, bread: 0, wood: 0 });
        if ((t.weapons || 0) >= 1) { const n = Math.min(T.weapons, t.weapons); t.weapons -= n; h.loot = { sword: Math.ceil(n / 2), bow: Math.floor(n / 2) }; }
        else if ((g.coins || 0) >= 10) { const n = Math.min(T.coins, g.coins); g.coins -= n; h.loot = { coins: n }; }
        else { const k = (g.bread || 0) >= (g.wood || 0) ? 'bread' : 'wood', n = Math.min(T.goods, g[k] || 0); if (n > 0) { g[k] -= n; h.loot = { [k]: n }; } }
        this.floatText(h.x, h.y - 0.8, h.loot ? 'gestohlen!' : 'nichts zu holen', '#ffd25a');
        h.state = 'escape'; h.path = null;
        continue;
      }
      // escape: zurück ins Versteck, auf dem Weg aus dem Lager kann er noch entdeckt werden
      if (t) this.thiefSpotCheck(h, t, dt);
      const home = this.thiefHome(h);
      if (!home) continue;
      if (!h.path) {
        const r = this.unitGo(h, nextToRect(home.x, home.y, home.w, home.h), home.x + 1, home.y + 1, 300000);
        if (r === 'here' || !r) this.thiefArrives(h);
        continue;
      }
      const r = this.follow(h, dt * (h.spotted ? THIEF.run : THIEF.speed));
      if (r === true) this.thiefArrives(h); else if (r === 'blocked') h.path = null;
    }
  },
  thiefArrives(h) {
    if (h.loot) {
      const parts = [];
      for (const k in h.loot) {
        if (!h.loot[k]) continue;
        if (k === 'coins') this.coins += h.loot[k]; else this.stock[k] = (this.stock[k] || 0) + h.loot[k];
        parts.push(k === 'coins' ? `${h.loot[k]} Münzen` : `${h.loot[k]} ${ITEMS[k].name}`);
      }
      const t = this.tribes[h.target];
      this.toast(`Dein Dieb ist zurück: ${parts.join(', ')}${t ? ` von den ${t.name}` : ''}.`);
      this.today.events.push(`Dein Dieb hat ${parts.join(', ')} gestohlen.`);
      this.sound('coin');
    }
    Object.assign(h, { state: 'home', target: null, loot: null, spotted: false, path: null, spotT: 0 });
  },
  killThief(h) {
    this.thieves = this.thieves.filter((x) => x !== h);
    this.sound('die', h.x, h.y);
    this.floatText(h.x, h.y - 0.7, 'gefasst', '#ff9a8a');
    this.toast('Dein Dieb wurde gefasst.');
  },
  // ein Dieb eines Stammes schleicht zu deinem Lager
  launchThief(t) {
    const ti = this.tribes.indexOf(t), st = this.nearestStorage(t.cx, t.cy);
    if (!st) return;
    const d = this.campDoor(t);
    const f = this.makeFoe(t, ti, 'thief', d.x + 0.5, d.y + 0.5, 'thief');
    Object.assign(f, { state: 'march', target: st.id, hp: 8, maxHp: 8 });
    this.foes.push(f);
  },
  updateFoeThief(f, t, door, dt) {
    if (f.state === 'march') {
      let st = this.byId(f.target);
      if (!st || st.type !== 'storage') { st = this.nearestStorage(f.x, f.y); if (!st) { f.state = 'flee'; return; } f.target = st.id; f.path = null; }
      if (!f.path) {
        const r = this.unitGo(f, nextToRect(st.x, st.y, st.w, st.h), st.x + 1, st.y + 1, 300000);
        if (r === 'here') { f.state = 'steal'; f.timer = 2; } else if (!r) f.state = 'flee';
        return;
      }
      const r = this.follow(f, dt * 2.2);   // schleicht
      if (r === true) { f.state = 'steal'; f.timer = 2; } else if (r === 'blocked') f.path = null;
      return;
    }
    if (f.state === 'steal') {
      if ((f.timer -= dt) > 0) return;
      const n = Math.min(this.coins, Math.max(10, Math.round(this.coins * 0.05)), 120);
      if (n >= 10) { this.coins -= n; f.coinsStolen = n; f.stole = true; this.toast(`Ein Dieb der ${t.name} hat ${n} Münzen gestohlen! Fang ihn, bevor er entkommt.`); }
      else {
        const k = STOCK_ORDER.filter((x) => (this.stock[x] || 0) > 0).sort((a, c) => ITEMS[c].price - ITEMS[a].price)[0];
        if (k) { const m = Math.min(this.stock[k], Math.max(1, Math.ceil(40 / ITEMS[k].price))); this.stock[k] -= m; f.loot = { [k]: m }; f.stole = true; this.toast(`Ein Dieb der ${t.name} hat ${m} ${ITEMS[k].name} gestohlen! Fang ihn, bevor er entkommt.`); }
      }
      this.sound('raid');
      f.state = 'flee'; f.path = null;
      return;
    }
    // flee: schnell zurück ins Lager
    if (t.defeated) { this.foes = this.foes.filter((x) => x !== f); return; }
    if (!f.path) {
      const r = this.unitGo(f, (x, y) => x === door.x && y === door.y, door.x, door.y, 300000);
      if (r !== 'go') this.foeHome(f);
      return;
    }
    const r = this.follow(f, dt * this.foeSpeed(f));
    if (r === true) this.foeHome(f); else if (r === 'blocked') f.path = null;
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
    if (t.raidAt != null || (t.raidIn <= 1 && this.day + 1 >= (this.raidCalm || 0))) return 'Sie planen bald einen Überfall.';
    return 'Sie überfallen ab und zu dein Lager, aber nie mehrere Stämme zugleich.';
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
      tribes: this.tribes.map((t, i) => ({ ...t, raid: null, sallyT: 0, warriors: t.warriors + this.foesOf(i) })),
      raidCalm: this.raidCalm || 0, thiefCalm: this.thiefCalm || 0, bal: BALANCE, catapults: this.catapults || 0, rams: this.rams || 0,
      thieves: (this.thieves || []).map((h) => ({ id: h.id, home: h.home, x: h.x, y: h.y })),
      sieges: this.sieges.map((c) => ({ id: c.id, kind: c.kind, home: c.home, x: c.x, y: c.y, hp: c.hp })),
      ships: this.ships.map((c) => ({ id: c.id, home: c.home, x: c.x, y: c.y, hp: c.hp })),
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
    this.raidCalm = d.raidCalm || 0;
    this.catapults = d.catapults || 0; this.rams = d.rams || 0; this.thiefCalm = d.thiefCalm || 0;
    this.thieves = (d.thieves || []).map((h) => this.makeThief(h.home, h.x, h.y, h.id));
    // Fahrzeuge: gespeicherte Einheiten, sonst (ältere Stände) aus den Zahlen an Geschützbauer und Werft
    this.sieges = []; this.ships = [];
    const far = (c, home) => home && Math.hypot(c.x - home.x - 1, c.y - home.y - 1) > 5;
    if (d.sieges) for (const v of d.sieges) { const home = this.byId(v.home) || this.vehicleHome(v.kind), c = this.addVehicle(v.kind, home, { x: Math.floor(v.x), y: Math.floor(v.y) }); c.id = v.id; c.hp = Math.min(c.maxHp, v.hp || c.maxHp); if (far(c, home)) c.state = 'return'; }
    else { const home = this.vehicleHome('catapult'); for (let i = 0; i < (d.catapults || 0); i++) this.addVehicle('catapult', home); for (let i = 0; i < (d.rams || 0); i++) this.addVehicle('ram', home); }
    if (d.ships) for (const v of d.ships) { const home = this.byId(v.home) || this.vehicleHome('ship'), c = this.addShip(home, { x: Math.floor(v.x), y: Math.floor(v.y) }); if (c) { c.id = v.id; c.hp = Math.min(c.maxHp, v.hp || c.maxHp); if (far(c, home)) c.state = 'return'; } }
    else { const home = this.vehicleHome('ship'); if (home) for (let i = 0; i < (this.fleet[3] || 0); i++) this.addShip(home); }
    this.syncVehicleCounts();
    if ((d.bal || 0) < BALANCE) this.rebalance(d.bal || 0);
  },
};
