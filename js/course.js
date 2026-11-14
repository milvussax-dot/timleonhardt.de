// Prozedurale Strecken aus Abschnitten mit eigenem Charakter:
// offene Hänge, Waldschneisen, Felsenfelder, Gabelungen, Felsstufen, Rinnen, Buckel, Sprunglinien,
// Grate, Almwiesen, gefrorene Seen, Gletscherspalten mit Brücke und Bachquerungen.
import { mulberry32, hashString, Noise1D, Noise2D, clamp, lerp, smoothstep } from './rng.js';

// Karten: breite Hänge, die sich immer wieder in mehrere Wege teilen (lanes = mögliche Wegtypen der Karte)
export const TRACKS = [
  { id: 'edelweiss', name: 'Edelweiß-Kar', diff: 'Leicht', tier: 0, length: 950, grade: 0.2, amp: 14, width: 62, rocks: 0.6,
    lanes: ['kickers', 'moguls', 'glade'],
    recipe: ['bowl', 'split2', 'creek', 'split3', 'lake', 'split2'] },
  { id: 'sonnenalm', name: 'Sonnenalm', diff: 'Mittel', tier: 1, length: 1050, grade: 0.23, amp: 16, width: 60, rocks: 0.8,
    lanes: ['kickers', 'pipe', 'moguls', 'glade'],
    recipe: ['split3', 'meadow', 'split2', 'terraces', 'bowl', 'split3'] },
  { id: 'zirbenwald', name: 'Zirbenwald', diff: 'Mittel', tier: 1, length: 1150, grade: 0.25, amp: 18, width: 56, rocks: 0.9,
    lanes: ['glade', 'kickers', 'pipe', 'moguls'],
    recipe: ['split3', 'bowl', 'split2', 'terraces', 'split3', 'creek', 'split2'] },
  { id: 'wolfsschlucht', name: 'Wolfsschlucht', diff: 'Schwer', tier: 2, length: 1300, grade: 0.28, amp: 22, width: 54, rocks: 1.1,
    lanes: ['boulders', 'pipe', 'kickers', 'glade', 'moguls'],
    recipe: ['split2', 'chasm', 'split3', 'terraces', 'bowl', 'split3', 'gully', 'split2'] },
  { id: 'gletscherkante', name: 'Gletscherkante', diff: 'Extrem', tier: 3, length: 1500, grade: 0.3, amp: 24, width: 50, rocks: 1.3,
    lanes: ['boulders', 'pipe', 'kickers', 'moguls'],
    recipe: ['ridge', 'split3', 'chasm', 'terraces', 'lake', 'split3', 'bowl', 'split2', 'chasm'] },
];

export const LANE_LABEL = { carve: 'Carving-Piste', kickers: 'Kicker-Linie', moguls: 'Buckelpiste', boulders: 'Felsfeld', glade: 'Waldschneise', pipe: 'Halfpipe-Rinne' };
const LANE_SIDES = { 2: ['Links', 'Rechts'], 3: ['Links', 'Mitte', 'Rechts'] };

export const PARKS = [
  { id: 'kristall', name: 'Snowpark Kristall', diff: 'Leicht', tier: 0, length: 720, grade: 0.17, amp: 10, width: 54, big: false, park: true },
  { id: 'monster', name: 'Monster-Park', diff: 'Schwer', tier: 2, length: 950, grade: 0.21, amp: 14, width: 58, big: true, park: true },
];

export const ENDLESS_DEF = { id: 'lawinenhang', name: 'Lawinenhang', diff: 'Endlos', tier: 2, length: 1000, grade: 0.27, amp: 22, width: 52, rocks: 0.9,
  lanes: ['kickers', 'moguls', 'boulders', 'glade', 'pipe'] };

export function findDef(id) {
  return TRACKS.find((t) => t.id === id) || PARKS.find((t) => t.id === id) || (id === ENDLESS_DEF.id ? ENDLESS_DEF : TRACKS[0]);
}

export const CHUNK = 100;
const CH = CHUNK;
const BLEND = 22;

// w: Breite, amp: Kurvigkeit, slope: Gefälle (+), wall: Talwände (negativ = Grat), forest: Walddichte, ice: Glatteis
export const SECTION_TYPES = {
  start: { len: 0, w: 1.1, amp: 0, slope: 0, wall: 0.7, forest: 0.7, names: ['Start'], hint: '' },
  finish: { len: 0, w: 1.2, amp: 0.4, slope: 0, wall: 0.7, forest: 0.6, names: ['Zielschuss'], hint: '' },
  open: { len: 150, w: 1.35, amp: 0.8, slope: 0, wall: 0.55, forest: 0.3, names: ['Sonnenkar', 'Firnfeld', 'Weiße Mulde', 'Panoramahang', 'Wolkenbank'], hint: 'Viel Platz – volle Hocke!' },
  woods: { len: 190, w: 0.8, amp: 1.15, slope: 0, wall: 1.0, forest: 1.8, names: ['Lärchenschneise', 'Alter Forst', 'Eulenwald', 'Zirbenschneise'], hint: 'Baumgruppen auf der Piste' },
  boulders: { len: 150, w: 1.2, amp: 0.85, slope: 0.02, wall: 0.9, forest: 0.45, names: ['Felsenfeld', 'Steinbockplatte', 'Geröllhang', 'Murmelgarten'], hint: 'Felsbrocken – such dir deinen Weg' },
  fork: { len: 180, w: 1.95, amp: 0.45, slope: 0, wall: 0.9, forest: 0.8, names: ['Gabelung', 'Felsinsel', 'Zwei Wege', 'Teufelsinsel'], hint: 'Links oder rechts? Eine Seite hat Sprünge.' },
  drops: { len: 150, w: 1.1, amp: 0.5, slope: 0.03, wall: 1.3, forest: 0.4, names: ['Felsstufen', 'Kanzelsprung', 'Terrassen'], hint: 'Felsstufen – abheben!' },
  gully: { len: 160, w: 0.62, amp: 0.9, slope: 0.07, wall: 2.4, forest: 0.2, names: ['Kanonenrohr', 'Dohlenrinne', 'Couloir', 'Eisrinne'], hint: 'Eng und schnell' },
  moguls: { len: 130, w: 1.1, amp: 0.8, slope: 0.02, wall: 1.0, forest: 0.9, names: ['Buckelwiese', 'Kuhbuckel', 'Wellental'], hint: 'Buckelpiste' },
  jumps: { len: 170, w: 1.1, amp: 0.35, slope: 0.02, wall: 0.9, forest: 0.8, names: ['Sprunglinie', 'Schanzenhang', 'Air-Strecke'], hint: 'Drei Kicker – Zeit für Tricks!' },
  ridge: { len: 170, w: 0.85, amp: 0.7, slope: 0.02, wall: -1, forest: 0, names: ['Steinbockgrat', 'Messerschneide', 'Adlergrat'], hint: 'Grat – nicht runterfallen!' },
  meadow: { len: 150, w: 1.3, amp: 0.8, slope: -0.04, wall: 0.45, forest: 0.4, names: ['Almwiese', 'Hüttenhang', 'Kuhglockenwiese'], hint: 'Almhütten am Pistenrand' },
  lake: { len: 130, w: 1.7, amp: 0.25, slope: 0, wall: 0.4, forest: 0.15, ice: 1, names: ['Gefrorener See', 'Eisspiegel'], hint: 'Glatteis – Schwung mitnehmen!' },
  chasm: { len: 110, w: 1.2, amp: 0.2, slope: 0, wall: 1.3, forest: 0.4, names: ['Gletscherspalte', 'Steinbrücke', 'Wolfsspalte'], hint: 'Über die Brücke – oder drüberspringen!' },
  creek: { len: 80, w: 1.15, amp: 0.35, slope: 0, wall: 0.9, forest: 0.9, names: ['Bachquerung', 'Eisbach'], hint: 'Bach: Springen spart Tempo' },
  park: { len: 230, w: 1, amp: 1, slope: 0, wall: 0.8, forest: 0.6, names: ['Kicker-Linie', 'Jib-Garten', 'Big-Air-Zone', 'Rail-Allee'], hint: '' },
  // breite Karten-Abschnitte
  bowl: { len: 170, w: 1.3, amp: 0.7, slope: 0, wall: 0.5, forest: 0.35, names: ['Sonnenkar', 'Firnfeld', 'Weiße Mulde', 'Panoramahang', 'Wolkenbank'], hint: 'Freier Hang – such dir deine eigene Linie' },
  split2: { len: 200, w: 1.15, amp: 0.4, slope: 0.01, wall: 0.85, forest: 0.8, lanes: 2, names: ['Gabelung', 'Felsinsel', 'Zwei Wege', 'Teufelsinsel'], hint: '' },
  split3: { len: 220, w: 1.4, amp: 0.35, slope: 0.01, wall: 0.85, forest: 0.8, lanes: 3, names: ['Drei Rinnen', 'Kreuzweg', 'Fächerhang', 'Dreierkar'], hint: '' },
  terraces: { len: 160, w: 1.2, amp: 0.3, slope: 0.03, wall: 1.1, forest: 0.4, names: ['Felsterrassen', 'Kanzelstufen', 'Steinbalkone'], hint: '' },
};
const SLALOM_MAP = { chasm: 'open', creek: 'meadow', fork: 'open', jumps: 'open', drops: 'woods', boulders: 'open', ridge: 'gully', bowl: 'open', split2: 'open', split3: 'woods', terraces: 'open' };
const ENDLESS_POOL = [
  ['bowl', 0], ['split2', 0], ['split2', 0], ['meadow', 0], ['split3', 300], ['split3', 300], ['creek', 500], ['terraces', 800],
  ['gully', 1200], ['lake', 1500], ['chasm', 1800], ['ridge', 2400],
];

function featureHeight(f, s, d) {
  switch (f.type) {
    case 'kicker': {
      const t = f.s - s;
      if (t < -1.2 || t > f.len) return 0;
      const lat = 1 - smoothstep(f.w * 0.5 - 0.8, f.w * 0.5 + 0.7, Math.abs(d - f.d));
      if (lat <= 0) return 0;
      if (t >= 0) { const p = 1 - t / f.len; return f.h * p * p * lat; }
      return f.h * (1 + t / 1.2) * lat;
    }
    case 'moguls': {
      if (s < f.s1 || s > f.s2) return 0;
      let env = smoothstep(f.s1, f.s1 + 12, s) * (1 - smoothstep(f.s2 - 12, f.s2, s));
      if (f.dMin != null) env *= smoothstep(f.dMin - 1, f.dMin + 1, d) * (1 - smoothstep(f.dMax - 1, f.dMax + 1, d));
      return env * f.a * Math.sin(s * 0.52 + d * 0.31) * Math.sin(d * 0.5 - s * 0.17);
    }
    case 'gap': {
      const t = Math.abs(s - f.s);
      if (t > f.half + f.wallW) return 0;
      const prof = t <= f.half ? 1 : 1 - smoothstep(f.half, f.half + f.wallW, t);
      const bm = 1 - smoothstep(f.bridgeHalf - 0.35, f.bridgeHalf + 0.35, Math.abs(d - f.bridgeD));
      const lat = 1 - smoothstep(f.ext - 6, f.ext, Math.abs(d));
      return -f.depth * prof * (1 - bm) * lat;
    }
    case 'roll': {
      const t = (s - f.s) / f.len;
      if (t <= 0 || t >= 1) return 0;
      const sn = Math.sin(Math.PI * t);
      let lat = 1 - smoothstep(f.ext - 8, f.ext, Math.abs(d));
      if (f.dMin != null) lat *= smoothstep(f.dMin - 1.5, f.dMin + 1.5, d) * (1 - smoothstep(f.dMax - 1.5, f.dMax + 1.5, d));
      return f.h * sn * sn * lat;
    }
    case 'island': {
      if (s < f.s1 || s > f.s2) return 0;
      const env = smoothstep(f.s1, f.s1 + 12, s) * (1 - smoothstep(f.s2 - 12, f.s2, s));
      return f.h * env * (1 - smoothstep(f.half - 3, f.half + 0.5, Math.abs(d - (f.c || 0))));
    }
    case 'pipe': {
      // Halfpipe-Rinne: Wände an den Rändern einer Spur
      if (s < f.s1 || s > f.s2) return 0;
      const t = Math.abs(d - f.c) / f.half;
      if (t < 0.4 || t > 1.8) return 0;
      const env = smoothstep(f.s1, f.s1 + 14, s) * (1 - smoothstep(f.s2 - 14, f.s2, s));
      const q = smoothstep(0.4, 1.15, t);
      return f.h * q * q * env * (1 - smoothstep(1.25, 1.8, t));
    }
    case 'ramp': {
      // Umfahrung einer Felsstufe: hier geht es sanft hinunter statt über die Kante
      if (s < f.s - f.R || s > f.s + f.w) return 0;
      const lat = 1 - smoothstep(f.half - 2.5, f.half + 1, Math.abs(d - f.c));
      if (lat <= 0) return 0;
      return f.h * (smoothstep(f.s, f.s + f.w, s) - smoothstep(f.s - f.R, f.s, s)) * lat;
    }
    default: return 0;
  }
}

export class Course {
  constructor(def, mode, opts = {}) {
    this.def = def;
    this.mode = mode; // 'race' | 'slalom' | 'freestyle' | 'endless'
    this.seed = (opts.seed != null ? opts.seed : hashString(def.id + '|' + mode)) >>> 0;
    const rng = mulberry32(this.seed);
    this.endless = mode === 'endless';
    this.length = this.endless ? Infinity : def.length;
    // Slalom bleibt schmal, sonst sind die Karten breit; die Querwölbung wird bei breiten Karten flacher
    this.wMul = mode === 'slalom' && def.width > 40 ? 0.5 : 1;
    this.bowlK = 0.0022 * Math.min(1, Math.pow(32 / (def.width * this.wMul), 2));
    this.S0 = -100;
    this.nCx = new Noise1D(rng); this.nCx2 = new Noise1D(rng); this.nW = new Noise1D(rng);
    this.nSl = new Noise1D(rng); this.nLn = new Noise1D(rng); this.nLn2 = new Noise1D(rng);
    this.n2 = new Noise2D(rng);
    this.srng = mulberry32((this.seed ^ 0x5bd1e995) >>> 0);
    this.cxA = []; this.wA = []; this.lnA = []; this.slA = []; this.wallA = []; this.iceA = []; this.hA = [];
    this.secs = []; this._si = 0; this.secEnd = this.S0; this.featDone = 0; this.baseTo = this.S0;
    this.features = []; this.fB = new Map();
    this.obstacles = []; this.oB = new Map();
    this.gates = []; this.rails = []; this.pickups = []; this.signs = []; this.huts = []; this.gaps = []; this.fences = []; this.drops = []; this.breaks = [];
    this.liftSide = (this.seed & 1) ? 1 : -1;
    this.nextGateS = 70; this.nextParkS = 90;
    this.nextChunk = -1; this.genTo = this.S0;
    this._gen = false;
    this._gi = 0;
    if (!this.endless) this._buildFiniteSections();
    this.ensure(this.endless ? 800 : this.length + 320);
  }

  // ---------- Abschnitte ----------
  _pushSec(type, s1, s2) {
    const T = SECTION_TYPES[type];
    const r = this.srng;
    const prev = this.secs[this.secs.length - 1];
    let name = T.names[Math.floor(r() * T.names.length)];
    if (prev && prev.name === name && T.names.length > 1) name = T.names[(T.names.indexOf(name) + 1) % T.names.length];
    const sec = {
      type, s1, s2, name, hint: T.hint, forest: T.forest, idx: this.secs.length,
      p: { w: T.w, amp: T.amp, slope: T.slope, wall: T.wall, ice: T.ice || 0, absW: type === 'lake' ? 1 : 0, ov: 0, ovD: 0 },
    };
    const raceLike = this.mode === 'race' || this.mode === 'endless';
    if (type === 'fork' && raceLike) {
      sec.side = r() < 0.5 ? -1 : 1;
      sec.half = 6 + r() * 3;
      sec.variant = r() < 0.5 ? 'moguls' : 'boulders';
      sec.p.ov = 1;
      sec.p.ovD = sec.side * (sec.half + 5.5);
    }
    if ((type === 'chasm' || type === 'creek') && raceLike) {
      sec.bridgeSide = r() < 0.5 ? -1 : 1;
      sec.p.ov = 1;
      sec.p.ovD = sec.bridgeSide * this.def.width * T.w * 0.5 * 0.42;
    }
    if (T.lanes && raceLike) this._makeLanes(sec, T, r);
    // Steilstufe: plötzlich steiler – an der Kante hebt man bei Tempo ab
    if (this.mode !== 'freestyle' && ['open', 'bowl', 'gully', 'ridge', 'woods', 'boulders', 'meadow'].includes(type) && r() < 0.7 && s2 - s1 > 110) {
      const len = 30 + r() * 18;
      this.breaks.push({ s: s1 + (s2 - s1) * (0.3 + r() * 0.3), len, add: 0.16 + r() * 0.14 });
    }
    this.secs.push(sec);
    this.secEnd = s2;
    return sec;
  }

  // Abschnitt in 2–3 parallele Wege teilen, getrennt durch Wald-/Felsinseln. Ein Weg ist immer die Carving-Piste.
  _makeLanes(sec, T, r) {
    const n = T.lanes;
    const W = this.def.width * this.wMul * T.w * 0.94;
    const isl = n === 3 ? 4 + r() * 1.6 : 4.5 + r() * 2.5;
    const laneW = (W - 2 * isl * (n - 1)) / n;
    const pool = (this.def.lanes || ['kickers', 'moguls', 'boulders', 'glade', 'pipe']).filter((t) => t !== 'carve');
    const types = ['carve'];
    // Abwechslung: zuerst Wegtypen nehmen, die im letzten geteilten Abschnitt nicht vorkamen
    const last = this._lastLanes || [];
    const fresh = pool.filter((t) => !last.includes(t));
    for (const src of [fresh, pool]) {
      let guard = 0;
      while (types.length < n && guard++ < 40 && src.length) {
        const t = src[Math.floor(r() * src.length)];
        if (!types.includes(t)) types.push(t);
      }
    }
    while (types.length < n) types.push('carve');
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    // die Carving-Piste nicht zweimal hintereinander auf derselben Seite
    if (this._lastCarve != null && types.indexOf('carve') === this._lastCarve && n > 1) {
      const ci = types.indexOf('carve'), j = (ci + 1 + Math.floor(r() * (n - 1))) % n;
      [types[ci], types[j]] = [types[j], types[ci]];
    }
    this._lastLanes = types.slice();
    this._lastCarve = types.indexOf('carve');
    sec.lanes = []; sec.islands = [];
    let x = -W / 2;
    for (let i = 0; i < n; i++) {
      sec.lanes.push({ type: types[i], c: x + laneW / 2, half: laneW / 2, idx: i });
      x += laneW;
      if (i < n - 1) { sec.islands.push({ c: x + isl, half: isl }); x += 2 * isl; }
    }
    const ideal = sec.lanes.find((l) => l.type === 'carve');
    sec.p.ov = 1;
    sec.p.ovD = ideal.c;
    sec.hint = sec.lanes.map((l, i) => `${LANE_SIDES[n][i]}: ${LANE_LABEL[l.type]}`).join(' · ');
  }

  // Abschnitt mit Wegwahl in der Nähe von s (für Bots)
  laneSecAt(s) {
    const sec = this.secAt(s);
    if (!sec.lanes || !sec.span) return null;
    return s > sec.span.s1 - 45 && s < sec.span.s2 + 4 ? sec : null;
  }

  _buildFiniteSections() {
    const L = this.length;
    let recipe = this.def.recipe || ['open', 'woods', 'open'];
    if (this.mode === 'slalom') recipe = recipe.map((t) => SLALOM_MAP[t] || t);
    if (this.mode === 'freestyle') {
      recipe = [];
      for (let i = 0; i < Math.max(2, Math.round((L - 160) / 230)); i++) recipe.push('park');
    }
    const a = 70, b = L - 90;
    const total = recipe.reduce((s, t) => s + SECTION_TYPES[t].len, 0);
    const k = (b - a) / total;
    this._pushSec('start', this.S0, a);
    let s = a;
    for (const t of recipe) { const len = SECTION_TYPES[t].len * k; this._pushSec(t, s, s + len); s += len; }
    this._pushSec('finish', b, L + 700);
  }

  _appendSections(until) {
    if (!this.secs.length) this._pushSec('start', this.S0, 70);
    const r = this.srng;
    while (this.secEnd < until) {
      const s = this.secEnd;
      const pool = ENDLESS_POOL.filter(([t, from]) => s >= from && t !== this.secs[this.secs.length - 1].type);
      const type = pool[Math.floor(r() * pool.length)][0];
      const len = SECTION_TYPES[type].len * (0.85 + r() * 0.3);
      this._pushSec(type, s, s + len);
    }
  }

  _secIndex(s) {
    const S = this.secs;
    let i = Math.min(this._si, S.length - 1);
    while (i > 0 && s < S[i].s1) i--;
    while (i < S.length - 1 && s >= S[i].s2) i++;
    this._si = i;
    return i;
  }
  secAt(s) { return this.secs[this._secIndex(s)]; }

  _param(s, key) {
    const S = this.secs, i = this._secIndex(s), cur = S[i];
    let v = cur.p[key];
    if (i > 0 && s < cur.s1 + BLEND) v = lerp(S[i - 1].p[key], v, smoothstep(cur.s1 - BLEND, cur.s1 + BLEND, s));
    else if (i < S.length - 1 && s > cur.s2 - BLEND) v = lerp(v, S[i + 1].p[key], smoothstep(cur.s2 - BLEND, cur.s2 + BLEND, s));
    return v;
  }

  sectionAt(s) { return this.secAt(s).name; }

  // ---------- Basis-Arrays (Verlauf, Breite, Gefälle, Linie) ----------
  _baseMeter(s) {
    const i = this.cxA.length;
    const L = this.length, def = this.def;
    const fade = smoothstep(0, 150, s);
    const amp = this._param(s, 'amp') * (this.endless ? clamp(0.7 + s / 3500, 0.7, 1.5) : 1);
    let g = fade * amp * def.amp * (this.nCx.at(s / 150) / 95 + (0.35 * this.nCx2.at(s / 60)) / 38);
    if (!this.endless && s > L + 30) g = 0;
    const cx = i === 0 ? 0 : this.cxA[i - 1] + clamp(g, -1.1, 1.1);
    let w = def.width * this.wMul * this._param(s, 'w') * (1 + 0.12 * this.nW.at(s / 230 + 3.3));
    if (this.endless) w *= clamp(1.05 - s / 9000, 0.75, 1.05);
    let br = 0;
    for (let bi = this.breaks.length - 1; bi >= 0; bi--) {
      const b = this.breaks[bi];
      if (s < b.s - 2 || s > b.s + b.len + 2) continue;
      br += b.add * smoothstep(b.s, b.s + 2.5, s) * (1 - smoothstep(b.s + b.len - 14, b.s + b.len, s));
    }
    let sl = clamp(def.grade + 0.08 * this.nSl.at(s / 170 + 7.1) + this._param(s, 'slope') + br, 0.06, 0.7);
    sl = lerp(sl, 0.045, this._param(s, 'absW'));
    if (this.endless) sl = Math.min(0.55, sl + clamp(s / 20000, 0, 0.06));
    sl = lerp(0.07, sl, smoothstep(-30, 70, s));
    if (!this.endless) sl = lerp(sl, -0.07, smoothstep(L + 15, L + 110, s));
    const base = cx + fade * w * 0.28 * (0.8 * this.nLn.at(s / 120 + 1.7) + 0.2 * this.nLn2.at(s / 45 + 5.2));
    const ln = lerp(base, cx + this._param(s, 'ovD'), this._param(s, 'ov'));
    this.cxA.push(cx); this.wA.push(w); this.slA.push(sl); this.lnA.push(ln);
    this.wallA.push(this._param(s, 'wall')); this.iceA.push(this._param(s, 'ice'));
  }

  _ensureBase(sMax) {
    if (this.endless) this._appendSections(sMax + 500);
    while (this.baseTo <= sMax) this._baseMeter(this.baseTo++);
    while (this.featDone < this.secs.length && this.secs[this.featDone].s2 + 80 < this.baseTo) {
      this._sectionFeatures(this.secs[this.featDone]);
      this.featDone++;
    }
  }

  ensure(s) {
    if (this._gen) return;
    this._ensureBase(s + 500);
    while (this.genTo <= s + 2) this._genChunk(this.nextChunk++);
    for (const r of this.rails) {
      if (r.y1 == null && r.s2 < this.genTo - 2) {
        r.y1 = this.heightAt(r.x1, r.z1) + r.h;
        r.y2 = this.heightAt(r.x2, r.z2) + r.h;
      }
    }
  }

  _sample(arr, s) {
    let f = s - this.S0;
    if (f < 0) f = 0;
    if (f > arr.length - 2) {
      if (this.endless && !this._gen) this.ensure(s + 150);
      if (f > arr.length - 2) f = arr.length - 2;
    }
    const i = f | 0, t = f - i;
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  }
  cxAt(s) { return this._sample(this.cxA, s); }
  wAt(s) { return this._sample(this.wA, s); }
  hAt(s) { return this._sample(this.hA, s); }
  lineAt(s) { return this._sample(this.lnA, s); }
  slopeAt(s) { return this._sample(this.slA, s); }
  wallAt(s) { return this._sample(this.wallA, s); }
  iceAt(s) { return this._sample(this.iceA, s); }
  trackHeading(s) { return Math.atan2(this.cxAt(s + 4) - this.cxAt(s - 4), 8); }
  onPiste(x, s) { return Math.abs(x - this.cxAt(s)) <= this.wAt(s) * 0.5 + 0.5; }

  // Bach-Grund bremst
  slowAt(x, s) {
    const b = this.fB.get(Math.floor(s / 20));
    if (!b) return 0;
    for (const f of b) {
      if (f.type !== 'gap' || f.kind !== 'creek') continue;
      if (Math.abs(s - f.s) > f.half + 0.6) continue;
      const d = x - this.cxAt(s);
      if (Math.abs(d - f.bridgeD) < f.bridgeHalf) continue;
      return 1;
    }
    return 0;
  }

  forkAt(s) {
    const sec = this.secAt(s);
    if (sec.type !== 'fork' || !sec.island) return null;
    const isl = sec.island;
    return s > isl.s1 - 45 && s < isl.s2 + 4 ? sec : null;
  }

  heightAt(x, z) {
    const s = -z;
    const base = this.hAt(s), c = this.cxAt(s), hw = this.wAt(s) * 0.5;
    const ice = this.iceAt(s), wall = this.wallAt(s);
    const d = x - c, ad = Math.abs(d);
    let y = base + this.bowlK * d * d * (1 - 0.85 * ice);
    if (ad > hw) {
      const e = ad - hw;
      const lump = Math.min(1, e / 10) * 0.9 * this.n2.at(x * 0.12, s * 0.12);
      if (wall >= 0) {
        y += (e * e * 0.0032 + e * 0.04) * wall + lump;
        if (e > 7 && wall > 0.3) {
          const nb = 0.9 * this.n2.at(x * 0.02 + 1.7, s * 0.02) + 0.9;
          const v = (e - 7) * 0.16 + nb;
          const fv = Math.floor(v), f0 = Math.floor(nb);
          y += ((fv + smoothstep(0.72, 1, v - fv)) - (f0 + smoothstep(0.72, 1, nb - f0))) * 2.4 * Math.min(1, wall);
        }
        if (e > 18) y += (e - 18) * 0.22 * wall * (this.n2.at(x * 0.016 + 7.3, s * 0.016) + 0.45 * this.n2.at(x * 0.05 + 3.1, s * 0.05));
      } else {
        y += (e * e * 0.007 + e * 0.32) * wall + lump * 0.6;
      }
    }
    y += 0.3 * this.n2.at(x * 0.03 + 50, s * 0.03) * (1 - 0.9 * ice);
    const b = this.fB.get(Math.floor(s / 20));
    if (b) for (let i = 0; i < b.length; i++) y += featureHeight(b[i], s, d);
    return y;
  }

  gradient(x, z, out) {
    const e = 0.35;
    out[0] = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    out[1] = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out;
  }

  forObstacles(s, fn) {
    const k0 = Math.floor((s - 3) / 10), k1 = Math.floor((s + 3) / 10);
    for (let k = k0; k <= k1; k++) {
      const b = this.oB.get(k);
      if (b) for (let i = 0; i < b.length; i++) fn(b[i]);
    }
  }

  nextGate(s) {
    const g = this.gates;
    while (this._gi > 0 && g[this._gi - 1].s > s) this._gi--;
    while (this._gi < g.length && g[this._gi].s < s) this._gi++;
    return g[this._gi] || null;
  }

  featuresIn(s0, s1) {
    return this.features.filter((f) => f.s2 >= s0 && f.s1 <= s1);
  }

  // ---------- Generierung ----------
  _addFeature(f, h0, h1) {
    this.features.push(f);
    for (let k = Math.floor(h0 / 20); k <= Math.floor(h1 / 20); k++) {
      let b = this.fB.get(k);
      if (!b) { b = []; this.fB.set(k, b); }
      b.push(f);
    }
  }

  _addObstacle(o) {
    o.y = this.heightAt(o.x, o.z);
    this.obstacles.push(o);
    const k = Math.floor(o.s / 10);
    let b = this.oB.get(k);
    if (!b) { b = []; this.oB.set(k, b); }
    b.push(o);
  }

  _inFeature(s, x) {
    const F = this.features;
    for (let i = Math.max(0, F.length - 40); i < F.length; i++) {
      const f = F[i];
      if (f.type === 'kicker') {
        if (s > f.s - 2 && s < f.s2) return true;
        if (s > f.s1 - 6 && s <= f.s - 2 && Math.abs(x - (this.cxAt(s) + f.d)) < f.w * 0.5 + 4) return true;
      } else if (f.type === 'drop') {
        if (s > f.s - 10 && s < f.s + 45) return true;
      } else if (f.type === 'gap') {
        if (s > f.s - f.half - 25 && s < f.s + f.half + 20) return true;
      }
    }
    return false;
  }

  _clearAt(s, dist) {
    for (const f of this.features) if (s > f.s1 - dist && s < f.s2 + dist) return false;
    for (const b of this.breaks) if (s > b.s - dist && s < b.s + 8) return false;
    return true;
  }

  // Besonderheiten eines Abschnitts (auf Basis der Linie, vor dem Höhenprofil)
  _sectionFeatures(sec) {
    const raceLike = this.mode === 'race' || this.mode === 'endless';
    const r = mulberry32((this.seed ^ Math.imul(sec.idx + 3, 0x27d4eb2d)) >>> 0);
    const s1 = sec.s1, s2 = sec.s2, len = s2 - s1;
    // Wellen / Kuppen quer über die Piste
    const ROLLS = { open: 2, bowl: 2, meadow: 2, woods: 1, gully: 1, ridge: 1, fork: 1, boulders: 1 };
    if (this.mode !== 'freestyle' && ROLLS[sec.type]) {
      for (let j = 0; j < ROLLS[sec.type]; j++) {
        const s = s1 + len * ((j + 0.5) / (ROLLS[sec.type] + 0.4)) + (r() - 0.5) * 12;
        if (sec.type === 'fork' && s > s1 + 20) continue;
        if (!this._clearAt(s, 24)) continue;
        const f = { type: 'roll', s, len: 14 + r() * 9, h: (this.mode === 'slalom' ? 0.7 : 1.0) + r() * 0.9, ext: this.wAt(s) / 2 + 14 };
        f.s1 = s - 4; f.s2 = s + f.len + 10;
        this._addFeature(f, s, s + f.len);
      }
    }
    // kleine Felskanten
    if (raceLike && ['open', 'bowl', 'woods', 'boulders', 'meadow'].includes(sec.type) && r() < 0.6) {
      const s = s1 + len * (0.55 + r() * 0.3);
      if (this._clearAt(s, 30)) {
        const f = { type: 'drop', s, w: 1.3, h: 0.9 + r() * 0.6, s1: s - 4, s2: s + 25, small: true };
        this.drops.push(f);
        this._addFeature(f, s - 4, s + 4);
      }
    }
    if (!raceLike) return;
    const kick = (s, d, big) => {
      const f = { type: 'kicker', s, d, len: big ? 11 : 9, h: big ? 1.6 : 1.15, w: 7 + r() * 2 };
      f.s1 = s - f.len; f.s2 = s + 60;
      this._addFeature(f, s - f.len - 1, s + 2);
      return f;
    };
    const lineD = (s) => this.lineAt(s) - this.cxAt(s);
    switch (sec.type) {
      case 'jumps':
        for (let j = 0; j < 3; j++) { const s = s1 + len * (0.14 + j * 0.36); kick(s, lineD(s), j === 2 || r() < 0.35); }
        break;
      case 'open':
        if (r() < 0.6) { const s = s1 + len * (0.4 + r() * 0.3); kick(s, lineD(s), r() < 0.5); }
        break;
      case 'bowl': {
        // freier Hang: Kicker irgendwo quer verteilt, nicht auf einer Linie
        const hw = this.wAt(s1 + len / 2) / 2;
        for (let j = 0; j < 2; j++) {
          const s = s1 + len * (0.3 + j * 0.38) + (r() - 0.5) * 10;
          if (!this._clearAt(s, 20)) continue;
          kick(s, (r() * 2 - 1) * hw * 0.6, r() < 0.5);
        }
        break;
      }
      case 'split2':
      case 'split3': {
        if (!sec.lanes) break;
        const a = s1 + 26, b = s2 - 24;
        sec.span = { s1: a, s2: b };
        for (const isl of sec.islands) {
          const f = { type: 'island', s1: a, s2: b, s: (a + b) / 2, c: isl.c, half: isl.half, h: 3.2 + r() * 0.8 };
          this._addFeature(f, a, b);
        }
        for (const ln of sec.lanes) {
          const dMin = ln.c - ln.half, dMax = ln.c + ln.half;
          if (ln.type === 'kickers') {
            const m = b - a > 150 ? 3 : 2;
            for (let j = 0; j < m; j++) kick(a + (b - a) * ((j + 0.6) / (m + 0.3)), ln.c, j === m - 1 || r() < 0.3);
          } else if (ln.type === 'moguls') {
            this._addFeature({ type: 'moguls', s1: a, s2: b, s: (a + b) / 2, a: 0.42 + r() * 0.1, dMin, dMax }, a, b);
          } else if (ln.type === 'carve') {
            for (let j = 0; j < 2; j++) {
              const s = a + (b - a) * (0.22 + j * 0.42);
              const f = { type: 'roll', s, len: 13 + r() * 6, h: 0.9 + r() * 0.6, ext: 1e9, dMin, dMax };
              f.s1 = s - 4; f.s2 = s + f.len + 10;
              this._addFeature(f, s, s + f.len);
            }
          } else if (ln.type === 'pipe') {
            this._addFeature({ type: 'pipe', s1: a, s2: b, s: (a + b) / 2, c: ln.c, half: ln.half, h: 2.2 + r() * 0.8 }, a, b);
          }
        }
        break;
      }
      case 'terraces': {
        // Felsstufen über die ganze Breite – an einem Rand führt eine Rampe drumherum
        const n = len > 150 ? 3 : 2;
        const side = r() < 0.5 ? -1 : 1;
        const W = this.def.width * this.wMul * SECTION_TYPES.terraces.w * 0.94;
        const rampHalf = 6.5, rc = side * (W / 2 - rampHalf - 1);
        for (let j = 0; j < n; j++) {
          const s = s1 + len * ((j + 0.55) / n);
          const h = 1.8 + r() * 1.2;
          const f = { type: 'drop', s, h, s1: s - 4, s2: s + 30 };
          this.drops.push(f);
          this._addFeature(f, s - 4, s + 4);
          const rp = { type: 'ramp', s, w: 2, h, R: 24, c: rc, half: rampHalf, s1: s - 25, s2: s + 3 };
          this._addFeature(rp, s - 25, s + 3);
          this.signs.push({ s: s - 38, side: -side, kind: 'drop' });
        }
        sec.rampD = rc;
        sec.hint = `Über die Felsstufen springen – oder ${side < 0 ? 'links' : 'rechts'} die Rampe nehmen`;
        break;
      }
      case 'drops': {
        const n = len > 170 ? 3 : 2;
        for (let j = 0; j < n; j++) {
          const s = s1 + len * ((j + 0.55) / n);
          const f = { type: 'drop', s, h: 1.8 + r() * 1.4, s1: s - 4, s2: s + 30 };
          this.drops.push(f);
          this._addFeature(f, s - 4, s + 4);
          this.signs.push({ s: s - 38, side: r() < 0.5 ? -1 : 1, kind: 'drop' });
        }
        break;
      }
      case 'moguls': {
        const f = { type: 'moguls', s1: s1 + 10, s2: s2 - 10, s: (s1 + s2) / 2, a: 0.32 + r() * 0.14 };
        this._addFeature(f, f.s1, f.s2);
        break;
      }
      case 'fork': {
        const a = s1 + 28, b = s2 - 26, half = sec.half;
        const isl = { type: 'island', s1: a, s2: b, s: (a + b) / 2, half, h: 3.4 };
        this._addFeature(isl, a, b);
        sec.island = isl;
        const lane = sec.side * (half + 5.5);
        kick(a + (b - a) * 0.32, lane, false);
        kick(a + (b - a) * 0.78, lane, true);
        if (sec.variant === 'moguls') {
          const o = -sec.side;
          const f = { type: 'moguls', s1: a, s2: b, s: (a + b) / 2, a: 0.42, dMin: o < 0 ? -(half + 16) : half + 0.5, dMax: o < 0 ? -(half + 0.5) : half + 16 };
          this._addFeature(f, a, b);
        }
        break;
      }
      case 'chasm':
      case 'creek': {
        const chasm = sec.type === 'chasm';
        const s = s1 + len * 0.62;
        const hw = this.wAt(s) / 2;
        const g = {
          type: 'gap', kind: sec.type, s, half: chasm ? 5.5 : 2.2, wallW: chasm ? 0.5 : 1.6, depth: chasm ? 12 : 1.3,
          bridgeD: lineD(s), bridgeHalf: chasm ? 2.6 : 1.5, ext: hw + 14,
        };
        g.s1 = s - g.half - 30; g.s2 = s + g.half + 20;
        this._addFeature(g, s - g.half - g.wallW - 1, s + g.half + g.wallW + 1);
        this.gaps.push(g);
        if (chasm) {
          // Talseite liegt tiefer: Sprünge über die Spalte landen wie auf einer Stufe
          const dr = { type: 'drop', s: s - g.half, w: g.half * 2, h: 2.4, s1: s - g.half, s2: s + g.half + 30, quiet: true };
          this.drops.push(dr);
          const kf = { type: 'kicker', s: s - g.half - 2.5, d: -sec.bridgeSide * hw * 0.5, len: 12, h: 2.0, w: 9 };
          kf.s1 = kf.s - kf.len; kf.s2 = kf.s + 40;
          this._addFeature(kf, kf.s1 - 1, kf.s + 2);
        }
        this.signs.push({ s: s - 55, side: -1, kind: 'gap' }, { s: s - 55, side: 1, kind: 'gap' });
        break;
      }
      default: break;
    }
  }

  _genChunk(k) {
    const def = this.def, L = this.length, mode = this.mode;
    const s0 = k * CH, s1 = s0 + CH;
    this._ensureBase(s1 + 500);
    this._gen = true;
    const rng = mulberry32((this.seed ^ Math.imul(k + 11, 0x9E3779B1)) >>> 0);
    const playable = (s) => s > 80 && (this.endless || s < L - 120);
    const raceLike = mode === 'race' || mode === 'endless';
    const diffMul = this.endless ? clamp(0.55 + Math.max(0, s0) / 2200, 0.55, 2.0) : 1;

    // 1) Höhenprofil inkl. Felsstufen
    for (let s = s0; s < s1; s++) {
      const i = this.hA.length;
      let h = i === 0 ? 0 : this.hA[i - 1] - this.slA[i - 1];
      for (const d of this.drops) { const w = d.w || 2; if (s >= d.s - 1 && s <= d.s + w + 1) h -= d.h * (smoothstep(d.s, d.s + w, s) - smoothstep(d.s, d.s + w, s - 1)); }
      this.hA.push(h);
    }
    this.genTo = s1;

    // 2) Snowpark: Kicker-Reihen und Rails
    if (mode === 'freestyle' && k >= 0) {
      while (this.nextParkS < s1) {
        const s = this.nextParkS;
        if (playable(s) && s >= s0) {
          const hw = this.wAt(s) / 2;
          const lanes = [-hw * 0.55, 0, hw * 0.55];
          if (rng() < 0.62) {
            for (let li = 0; li < 3; li++) {
              if (li !== 1 && rng() > 0.75) continue;
              const big = def.big && rng() < 0.55;
              const ss = s + rng() * 5;
              const f = { type: 'kicker', s: ss, d: lanes[li] + (rng() - 0.5) * 2, len: big ? 13 : 10, h: big ? 2.5 : 1.5 + rng() * 0.4, w: big ? 9 : 7.5 };
              f.s1 = ss - f.len; f.s2 = ss + 40;
              this._addFeature(f, f.s1 - 1, ss + 2);
            }
          } else {
            const used = new Set();
            const n = rng() < 0.5 ? 1 : 2;
            for (let j = 0; j < n; j++) {
              const li = Math.floor(rng() * 3);
              if (used.has(li)) continue;
              used.add(li);
              const len = 14 + rng() * 10;
              const sa = s, sb = s + len;
              const c1 = this.cxAt(sa), c2 = this.cxAt(sb);
              const d = lanes[li];
              const r = { s1: sa, s2: sb, x1: c1 + d, z1: -sa, x2: c2 + d, z2: -sb, h: 0.55, kind: rng() < 0.5 ? 'box' : 'rail' };
              r.len = Math.hypot(r.x2 - r.x1, len);
              r.heading = Math.atan2(r.x2 - r.x1, len);
              r.y1 = null; r.y2 = null;
              this.rails.push(r);
              this.features.push({ type: 'rail', s1: sa - 4, s2: sb + 4, s: sa });
            }
          }
        }
        const lastBig = this.features.length && this.features[this.features.length - 1].h > 2;
        this.nextParkS += (lastBig ? 66 : 48) + rng() * 14;
      }
    }

    // 3) Slalomtore
    if (mode === 'slalom') {
      while (this.nextGateS < s1) {
        const s = this.nextGateS;
        if (s > 60 && s < L - 60) {
          const side = this.gates.length % 2 === 0 ? -1 : 1;
          const c = this.cxAt(s), hw = this.wAt(s) / 2;
          let off = this.lineAt(s) - c + side * (2.2 + rng() * 2.6);
          off = clamp(off, -hw + 4, hw - 4);
          this.gates.push({ s, x: c + off, w: 6, side, idx: this.gates.length, color: side < 0 ? 'blue' : 'red', state: 0 });
        }
        this.nextGateS += 25 + rng() * 9;
      }
    }

    const nearGap = (s) => {
      for (const g of this.gaps) if (Math.abs(s - g.s) < g.half + g.wallW + 3) return true;
      return false;
    };

    // 4) Wald und Felsen neben der Piste – Dichte je nach Abschnitt
    for (const side of [-1, 1]) {
      for (let j = 0; j < 110; j++) {
        const s = s0 + rng() * CH;
        if (s < this.S0 + 1) continue;
        const sec = this.secAt(s);
        const dense = sec.type === 'woods';
        const f = mode === 'freestyle' ? 0.7 : sec.forest;
        if (rng() > f / 1.8) continue;
        const e = (dense ? 0.8 : 3) + Math.pow(rng(), dense ? 2 : 1.4) * 95;
        if (this.wallAt(s) < -0.2 && e < 32) continue;
        if (nearGap(s)) continue;
        const hw = this.wAt(s) / 2;
        const x = this.cxAt(s) + side * (hw + e);
        const sc = 0.7 + rng() * 0.9;
        this._addObstacle({ type: 'tree', x, z: -s, s, r: 0.5 * sc, sc, rot: rng() * 6.283 });
      }
      for (let j = 0; j < 3; j++) {
        const s = s0 + rng() * CH;
        const t = this.secAt(s).type;
        if (!['boulders', 'gully', 'ridge', 'drops'].includes(t) || nearGap(s)) continue;
        const hw = this.wAt(s) / 2;
        const e = 0.8 + rng() * 16;
        const x = this.cxAt(s) + side * (hw + e);
        const sc = 1 + rng() * 1.8;
        this._addObstacle({ type: 'rock', x, z: -s, s, r: 0.9 * sc, sc, rot: rng() * 6.283 });
      }
    }

    // 5) Hindernisse auf der Piste je nach Abschnitt (nie auf der Ideallinie)
    if (raceLike && k >= 0) {
      const dm = diffMul * (def.rocks || 1);
      const tryPlace = (a, b, clear, mk) => {
        for (let tries = 0; tries < 8; tries++) {
          const s = a + rng() * (b - a);
          if (!playable(s)) continue;
          const c = this.cxAt(s), hw = this.wAt(s) / 2;
          const x = c + (rng() * 2 - 1) * (hw - 1.2);
          if (Math.abs(x - this.lineAt(s)) < clear) continue;
          if (this._inFeature(s, x)) continue;
          mk(s, x);
          return true;
        }
        return false;
      };
      const rock = (s, x, sc) => this._addObstacle({ type: 'rock', x, z: -s, s, r: 0.9 * sc, sc, rot: rng() * 6.283, onPiste: true });
      const tree = (s, x, sc) => this._addObstacle({ type: 'tree', x, z: -s, s, r: 0.55 * sc, sc, rot: rng() * 6.283, onPiste: true });
      for (const sec of this.secs) {
        const a = Math.max(s0, sec.s1), b = Math.min(s1, sec.s2);
        if (b <= a) continue;
        const frac = (b - a) / CH;
        const n = (base) => Math.round(base * dm * frac * (0.6 + rng() * 0.8));
        switch (sec.type) {
          case 'woods':
            for (let j = n(2.6); j > 0; j--) {
              tryPlace(a, b, 8, (s, x) => {
                const cnt = 2 + Math.floor(rng() * 4);
                for (let q = 0; q < cnt; q++) tree(s + (rng() - 0.5) * 4, x + (rng() - 0.5) * 4, 0.75 + rng() * 0.5);
                if (rng() < 0.4) rock(s + 2, x + 1.5, 0.6 + rng() * 0.5);
              });
            }
            break;
          case 'boulders':
            for (let j = n(7); j > 0; j--) {
              const sc = 0.6 + Math.pow(rng(), 1.5) * 1.8;
              tryPlace(a, b, 3.6 + sc, (s, x) => rock(s, x, sc));
            }
            break;
          case 'open':
            for (let j = n(0.5); j > 0; j--) tryPlace(a, b, 6.5, (s, x) => rock(s, x, 0.7 + rng() * 0.9));
            break;
          case 'bowl':
            // vereinzelte Baum- und Felsgruppen auf dem freien Hang
            for (let j = n(2.4); j > 0; j--) {
              tryPlace(a, b, 7, (s, x) => {
                if (rng() < 0.55) { const cnt = 2 + Math.floor(rng() * 3); for (let q = 0; q < cnt; q++) tree(s + (rng() - 0.5) * 4, x + (rng() - 0.5) * 4, 0.8 + rng() * 0.5); }
                else rock(s, x, 0.8 + rng() * 1.1);
              });
            }
            break;
          case 'split2':
          case 'split3': {
            const sp = sec.span;
            if (!sp) break;
            const A = Math.max(a, sp.s1), B = Math.min(b, sp.s2);
            if (B <= A) break;
            // Inseln zwischen den Wegen: Felsen am Rand, Bäume obendrauf
            for (const isl of sec.islands) {
              for (let s = A + rng() * 2; s < B; s += 4.2) {
                if (s < sp.s1 + 7 || s > sp.s2 - 7) continue;
                const c = this.cxAt(s) + isl.c;
                for (const sd of [-1, 1]) if (rng() < 0.7) rock(s + rng() * 2, c + sd * (isl.half - 1.6 - rng()), 1.0 + rng() * 0.9);
                const nt = 1 + Math.floor(rng() * 2.5);
                for (let q = 0; q < nt; q++) tree(s + rng() * 3, c + (rng() - 0.5) * 2 * Math.max(0.5, isl.half - 2.6), 1.0 + rng() * 0.7);
              }
            }
            // Felsfeld- und Waldschneisen-Wege: Hindernisse, aber immer mit einer freien, geschwungenen Linie
            for (const ln of sec.lanes) {
              if (ln.type !== 'boulders' && ln.type !== 'glade') continue;
              const glade = ln.type === 'glade';
              const cnt = Math.round(((B - A) / 100) * (glade ? 6 : 9) * (0.8 + rng() * 0.4) * (def.rocks || 1) * (ln.half / 10));
              for (let j = 0; j < cnt; j++) {
                for (let tries = 0; tries < 6; tries++) {
                  const s = A + rng() * (B - A);
                  if (s < sp.s1 + 10 || s > sp.s2 - 6) continue;
                  const free = ln.c + Math.sin(s * 0.045 + ln.idx * 2.1) * ln.half * 0.4;
                  const dd = ln.c + (rng() * 2 - 1) * (ln.half - 1);
                  if (Math.abs(dd - free) < (glade ? 4.6 : 3.4)) continue;
                  const x = this.cxAt(s) + dd;
                  if (glade) {
                    const cntT = 1 + Math.floor(rng() * 3);
                    for (let q = 0; q < cntT; q++) tree(s + (rng() - 0.5) * 2.5, x + (rng() - 0.5) * 2.5, 0.8 + rng() * 0.5);
                  } else rock(s, x, 0.6 + Math.pow(rng(), 1.5) * 1.5);
                  break;
                }
              }
            }
            break;
          }
          case 'gully':
            for (let j = n(1.2); j > 0; j--) tryPlace(a, b, 5, (s, x) => rock(s, x, 0.6 + rng() * 0.6));
            break;
          case 'fork': {
            const isl = sec.island;
            if (!isl) break;
            for (let s = Math.max(a, isl.s1 + 7); s < Math.min(b, isl.s2 - 7); s += 4.2) {
              const c = this.cxAt(s);
              for (const sd of [-1, 1]) if (rng() < 0.75) rock(s + rng() * 2, c + sd * (isl.half - 1.7 - rng()), 1.1 + rng() * 1.0);
              const nt = 1 + Math.floor(rng() * 2.5);
              for (let q = 0; q < nt; q++) tree(s + rng() * 3, c + (rng() - 0.5) * 2 * (isl.half - 3), 1.0 + rng() * 0.7);
            }
            if (sec.variant === 'boulders') {
              const o = -sec.side;
              for (let j = n(7); j > 0; j--) {
                const s = Math.max(a, isl.s1) + rng() * (Math.min(b, isl.s2) - Math.max(a, isl.s1));
                if (s < isl.s1 || s > isl.s2) continue;
                const c = this.cxAt(s);
                const sc = 0.7 + rng() * 0.9;
                const d = isl.half + 1.5 + rng() * 13;
                if (Math.abs(d - (isl.half + 5.5)) < 2.4 + sc * 0.9) continue;
                rock(s, c + o * d, sc);
              }
            }
            break;
          }
          case 'ridge':
            for (let j = n(3); j > 0; j--) {
              const s = a + rng() * (b - a);
              const c = this.cxAt(s), hw = this.wAt(s) / 2;
              rock(s, c + (rng() < 0.5 ? -1 : 1) * (hw + 0.4), 0.8 + rng() * 0.8);
            }
            break;
          case 'meadow': {
            for (const side of [-1, 1]) this.fences.push({ s1: a + 4, s2: b - 4, side });
            const hs = [sec.s1 + (sec.s2 - sec.s1) * 0.3, sec.s1 + (sec.s2 - sec.s1) * 0.72];
            hs.forEach((s, j) => {
              if (s < a || s >= b) return;
              const side = (j % 2 ? 1 : -1) * (sec.idx % 2 ? 1 : -1);
              this._addHut(s, side, 6.5 + rng() * 3);
            });
            break;
          }
          default: break;
        }
      }
    }

    // 6) Starthütte
    if (k === -1) this._addHut(-55, -this.liftSide, 9);

    // 7) Boost-Kristalle (nur Lawinen-Flucht)
    if (this.endless && k >= 1) {
      const s = s0 + 20 + rng() * 60;
      const x = this.lineAt(s) + (rng() - 0.5) * 5;
      if (!this._inFeature(s, x)) this.pickups.push({ s, x, z: -s, y: this.heightAt(x, -s), taken: false });
    }

    this._gen = false;
  }

  _addHut(s, side, e) {
    const hw = this.wAt(s) / 2;
    const x = this.cxAt(s) + side * (hw + e);
    const hut = { s, x, z: -s, side, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
    hut.y = this.heightAt(x, -s);
    this.huts.push(hut);
    this._addObstacle({ type: 'hut', x, z: -s, s, r: 4.4, sc: 1, rot: 0 });
  }
}
