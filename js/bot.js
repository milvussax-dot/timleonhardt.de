// Bot-KI: nutzt dieselbe Physik wie der Spieler und folgt der Ideallinie
import { clamp, wrapAngle, Noise1D, mulberry32 } from './rng.js';
import { createSkierState, stepSkier, DT } from './skier.js';

export const BOT_PROFILES = [
  { name: 'Kaiserschmarrn', jacket: '#f4b400', helmet: '#7a3e00', k: 0.97, wobble: 0.25, tricky: 0.25, sloppy: 0.1 },
  { name: 'Gams-O-Mat', jacket: '#8d6e63', helmet: '#efebe9', k: 1.0, wobble: 0.12, tricky: 0.1, sloppy: 0.02 },
  { name: 'Pistenbully', jacket: '#e53935', helmet: '#212121', k: 0.93, wobble: 0.45, tricky: 0.05, sloppy: 0.1 },
  { name: 'Frau Holle', jacket: '#eceff1', helmet: '#90caf9', k: 0.96, wobble: 0.3, tricky: 0.5, sloppy: 0.12 },
  { name: 'Jodel-3000', jacket: '#00897b', helmet: '#ffeb3b', k: 0.99, wobble: 0.15, tricky: 0.3, sloppy: 0.05 },
  { name: 'Murmel', jacket: '#7e57c2', helmet: '#ff7043', k: 0.92, wobble: 0.6, tricky: 0.7, sloppy: 0.3 },
  { name: 'Graf Glühwein', jacket: '#ad1457', helmet: '#ffd54f', k: 0.95, wobble: 0.5, tricky: 0.4, sloppy: 0.25 },
];

export const BOT_DIFFS = [
  { name: 'Gemütlich', mul: 0.85 },
  { name: 'Sportlich', mul: 0.93 },
  { name: 'Profi', mul: 0.99 },
];

const G = 9.81;

export class BotBrain {
  constructor(profile, course, seed, diffMul = 1) {
    this.p = profile;
    this.course = course;
    this.rng = mulberry32(seed >>> 0);
    this.noise = new Noise1D(this.rng, 256);
    this.mul = diffMul;
    this.plan = null;
    this.forkSide = this.rng() < 0.5 ? 1 : -1;
    this.inp = { steer: 0, tuck: false, brake: false, jump: false, flip: 0, spin: 0, grab: 0, trickL: false, trickR: false, boost: false };
  }

  vTerm(s) {
    const sl = this.course.slopeAt(s);
    return Math.sqrt(Math.max(1, G * (sl - 0.035)) / 0.0024);
  }

  think(st, ctx) {
    const c = this.course, inp = this.inp;
    inp.jump = false; inp.flip = 0; inp.spin = 0; inp.grab = 0; inp.brake = false; inp.trickL = false; inp.trickR = false;
    const s = -st.z, v = st.speed;
    if (!st.grounded) {
      this.air(st);
      inp.steer = 0;
      inp.tuck = true;
      return inp;
    }
    this.plan = null;
    let look = 6 + v * 0.55;
    let tx;
    if (c.gates.length) {
      const g = c.nextGate(s + 1.5);
      if (g && g.s - s < look + 12) { tx = g.x; look = Math.max(3, g.s - s); }
    }
    if (tx === undefined && this.p.name) {
      const fk = c.forkAt(s + look);
      if (fk) tx = c.cxAt(s + look) + this.forkSide * (fk.half + 5.5);
    }
    if (tx === undefined) tx = c.lineAt(s + look) + this.p.wobble * 2.0 * this.noise.at(s / 35);
    // Hindernissen auf dem Weg ausweichen
    let shift = 0;
    const span = Math.min(look + 6, 32);
    for (let ds = 4; ds <= span; ds += 6) {
      const ss = s + ds;
      const px = st.x + (tx - st.x) * (ds / look);
      c.forObstacles(ss, (o) => {
        if (o.s < s + 2 || o.s > s + span) return;
        const dx = px - o.x, need = o.r + 1.9;
        if (Math.abs(dx) < need) { const sh = (dx >= 0 ? 1 : -1) * (need - Math.abs(dx)) * 1.3; if (Math.abs(sh) > Math.abs(shift)) shift = sh; }
      });
    }
    tx += shift;
    const desired = Math.atan2(tx - st.x, look);
    const err = wrapAngle(desired - st.heading);
    inp.steer = clamp(err * 3.5, -1, 1);
    const ps = c.parSpeed;
    const base = ps ? ps[Math.max(0, Math.min(ps.length - 1, Math.round(s) + 100))] || this.vTerm(s) : this.vTerm(s);
    const cap = base * this.p.k * this.mul * ((ctx && ctx.rubber) || 1);
    inp.tuck = Math.abs(err) < 0.1 && v < cap;
    inp.brake = v > cap * 1.08 + 0.5;
    // ab und zu ein Butter-360 auf geraden Stücken
    if (this.p.tricky && !st.butter && v > 12 && Math.abs(err) < 0.05 && this.rng() < this.p.tricky * 0.0025) {
      if (this.rng() < 0.5) inp.trickL = true; else inp.trickR = true;
    }
    return inp;
  }

  air(st) {
    const inp = this.inp;
    if (this.plan === null) {
      const sl = this.course.slopeAt(-st.z);
      const vyRel = st.vy + sl * Math.hypot(st.vx, st.vz);
      const estAir = Math.max(0, (2 * vyRel) / G);
      this.plan = { flip: 0, spin: 0, err: 0 };
      if (this.p.tricky && this.rng() < this.p.tricky) {
        if (estAir > 1.4) this.plan.flip = this.rng() < 0.65 ? 1 : -1;
        else if (estAir > 0.95) this.plan.spin = this.rng() < 0.5 ? 1 : -1;
        if (this.rng() < (this.p.sloppy || 0)) this.plan.err = (this.rng() - 0.5) * 2.4;
      }
    }
    const P = this.plan;
    if (P.grab === undefined) P.grab = this.p.tricky && this.rng() < this.p.tricky ? (this.rng() < 0.5 ? 1 : 2) : 0;
    if (P.grab && st.air > 0.15 && st.air < 0.9) inp.grab = P.grab;
    const target = Math.PI * 2 - 0.3 + P.err;
    if (P.flip && Math.abs(st.pitch) < target) inp.flip = P.flip;
    if (P.spin && Math.abs(st.spin) < target) inp.spin = P.spin;
  }
}

const parCache = new Map();
// "Perfekte" Fahrt simulieren -> Referenzzeit für Medaillen
export function computePar(course) {
  const key = course.def.id + '|' + course.mode + '|' + course.seed;
  const hit = parCache.get(key);
  if (hit) { course.parSpeed = hit.speed; return hit.t; }
  const st = createSkierState(course, course.lineAt(0), -1.5);
  st.speed = 5;
  const brain = new BotBrain({ k: 1.0, wobble: 0, tricky: 0, sloppy: 0 }, course, 1, 1);
  let t = 0;
  const L = course.length;
  const speed = new Float32Array(Math.ceil(L) + 400);
  while (t < 600 && -st.z < L) {
    const inp = brain.think(st, null);
    stepSkier(st, inp, course, DT, null);
    st.events.length = 0;
    t += DT;
    const i = Math.round(-st.z) + 100;
    if (i >= 0 && i < speed.length && st.speed > speed[i]) speed[i] = st.speed;
  }
  for (let i = 1; i < speed.length; i++) if (!speed[i]) speed[i] = speed[i - 1];
  parCache.set(key, { t, speed });
  course.parSpeed = speed;
  return t;
}
