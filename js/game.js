// Eine Spielrunde: Strecke, Fahrer, Bots, Ghost, Lawine, Online-Gegner, Kamera, Wertung
import * as THREE from 'three';
import { Course, findDef, ENDLESS_DEF } from './course.js';
import { World } from './world.js';
import { Environment } from './weather.js';
import { FX } from './fx.js';
import { createSkierState, stepSkier, settle, DT, crash } from './skier.js';
import { Skier3D } from './model.js';
import { BotBrain, BOT_PROFILES, BOT_DIFFS, computePar } from './bot.js';
import { clamp, lerp, mulberry32, shuffle, wrapAngle } from './rng.js';
import { timeMedal, scoreMedal, distMedal } from './medals.js';
import { checkChallenges } from './challenges.js';

export const MODES = [
  { id: 'zeit', name: 'Zeitfahren', desc: 'Jag deine Bestzeit. Dein Ghost fährt mit.', course: 'race' },
  { id: 'bots', name: 'Bot-Rennen', desc: 'Bis zu sechs Bots, jeder mit eigenem Fahrstil.', course: 'race' },
  { id: 'slalom', name: 'Slalom', desc: 'Durch alle Tore. Jedes verpasste kostet 3 Sekunden.', course: 'slalom' },
  { id: 'freestyle', name: 'Freestyle', desc: 'Kicker, Rails, Flips, Spins und Combos.', course: 'freestyle' },
  { id: 'lawine', name: 'Lawinen-Flucht', desc: 'Endlos bergab. Die Lawine wird immer schneller.', course: 'endless' },
];
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

export function boardKey(mode, trackId) {
  // "2:" = kürzere Strecken; alte Bestzeiten und Ghosts passen nicht mehr dazu
  if (mode === 'zeit' || mode === 'bots') return 'race2:' + trackId;
  if (mode === 'slalom') return 'slalom2:' + trackId;
  if (mode === 'freestyle') return 'freestyle2:' + trackId;
  return 'lawine';
}

const AUTO_BRAKE = { steer: 0, tuck: false, brake: true, jump: false, flip: 0, spin: 0, grab: false };
const IDLE = { steer: 0, tuck: false, brake: false, jump: false, flip: 0, spin: 0, grab: false };
const GHOST_HZ = 30;
const STRIDE = 9;
const CRASH_TEXT = {
  tree: 'Baum geküsst!', rock: 'Felsen erwischt!', landing: 'Landung verpatzt!', impact: 'Zu hart gelandet!',
  rail: 'Vom Rail gerutscht!', avalanche: 'Von der Lawine erwischt!', hut: 'Hütte gerammt!', wall: 'Gegen die Wand!', fall: 'Abgestürzt!',
};
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class Session {
  constructor(app, cfg) {
    this.app = app;
    this.cfg = cfg;
    this.mode = cfg.mode;
    const mode = modeById(cfg.mode);
    this.courseMode = mode.course;
    const def = cfg.mode === 'lawine' ? ENDLESS_DEF : findDef(cfg.trackId);
    this.def = def;
    const seed = cfg.mode === 'lawine' ? (cfg.seed != null ? cfg.seed : (Math.random() * 1e9) | 0) : undefined;
    this.course = new Course(def, mode.course, { seed });
    this.scene = new THREE.Scene();
    this.env = new Environment(this.scene, cfg.weather, app.quality, app.renderer);
    this.world = new World(this.scene, this.course, { night: !!this.env.def.night, quality: app.quality });
    this.fx = new FX(this.scene, this.course);
    this.camera = app.camera;
    this.attract = !!cfg.attract;
    this.online = cfg.online ? app.net : null;
    this.t = 0;
    this.time = 0;
    this.state = this.attract ? 'run' : 'countdown';
    this.countdown = 3.5;
    this.lastCount = null;
    this.acc = 0;
    this.paused = false;
    this.stepCount = 0;
    this.gateIdx = 0;
    this.avGap = null;
    this.stats = {
      flips: 0, spins: 0, airTime: 0, maxSpeed: 0, crashes: 0, score: 0, combo: 0, comboTimer: 0,
      missed: 0, passed: 0, distance: 0, pickups: 0, bestTrick: null, bestTrickPts: 0, grinds: 0,
    };
    this.racers = [];
    this.remotes = new Map();
    this.cs = { h: 0, look: new THREE.Vector3(), shake: 0, init: false, orbit: Math.random() * 6, focus: 0, switchT: 0 };
    const shadows = app.quality !== 'niedrig';

    const startS = -1.5;
    const c0 = this.course.cxAt(0);
    const nBots = this.attract ? 4 : cfg.mode === 'bots' ? clamp(cfg.bots != null ? cfg.bots : 4, 1, 6) : 0;
    const total = nBots + (this.attract ? 0 : 1);
    const lanes = [];
    for (let i = 0; i < total; i++) lanes.push(c0 + (i - (total - 1) / 2) * 2.8);
    if (!this.attract) {
      const prof = app.store.profile;
      const pl = Math.floor(total / 2);
      const st = createSkierState(this.course, lanes[pl], startS);
      const model = new Skier3D({ jacket: prof.jacket, helmet: prof.helmet, shadows });
      this.scene.add(model.root);
      this.player = { isPlayer: true, name: prof.name || 'Du', jacket: prof.jacket, st, model, finished: false, finishTime: null };
      this.racers.push(this.player);
      lanes.splice(pl, 1);
    }
    const rng = mulberry32((Math.random() * 1e9) | 0);
    const profs = shuffle(BOT_PROFILES.slice(), rng).slice(0, nBots);
    const diffMul = BOT_DIFFS[cfg.botDiff != null ? cfg.botDiff : 1].mul;
    profs.forEach((p, i) => {
      const st = createSkierState(this.course, lanes[i], startS);
      const model = new Skier3D({ jacket: p.jacket, helmet: p.helmet, name: this.attract ? null : p.name, shadows });
      this.scene.add(model.root);
      this.racers.push({
        isPlayer: false, name: p.name, jacket: p.jacket, st, model, finished: false, finishTime: null,
        brain: new BotBrain(p, this.course, (rng() * 1e9) | 0, this.attract ? 0.97 : diffMul),
      });
    });
    if (this.attract) for (const r of this.racers) { r.st.speed = 5; settle(r.st, this.course); }

    // Ghost der Bestzeit
    this.ghost = null;
    if (!this.attract && !this.online && (cfg.mode === 'zeit' || cfg.mode === 'slalom')) {
      const g = app.store.loadGhost(boardKey(cfg.mode, def.id));
      if (g && g.stride === STRIDE && g.data.length >= STRIDE * 4) {
        g.n = Math.floor(g.data.length / g.stride);
        g.model = new Skier3D({ ghost: true });
        g.st = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, spin: 0, tuckIn: 0, crash: 0, crashDur: 1.8, groundPitch: 0, grounded: true, steerIn: 0, speed: 0, grab: 0 };
        this.scene.add(g.model.root);
        this.ghost = g;
      }
    }
    this.rec = this.attract ? null : [];

    if (cfg.mode === 'lawine') {
      this.av = { s: -75, v: 11 };
      this.fx.enableAvalanche();
    }
    this.par = !this.attract && ['zeit', 'bots', 'slalom'].includes(cfg.mode) ? computePar(this.course) : null;
    this.world.prebuild(startS);
    this.updateCamera(0.016);
  }

  focus() {
    if (this.player) return this.player;
    return this.racers[this.cs.focus % this.racers.length];
  }

  setPaused(b) {
    if (this.online || this.attract || this.state === 'done') return false;
    this.paused = b;
    if (b) this.app.audio.silence();
    return true;
  }

  // ---------------- Hauptschleife ----------------
  update(dt) {
    dt = Math.min(dt, 0.05);
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
    const app = this.app;
    if (!this.paused) {
      if (this.state === 'countdown') {
        this.countdown -= dt;
        const n = Math.ceil(this.countdown - 0.5);
        if (n !== this.lastCount && n >= 1 && n <= 3) { this.lastCount = n; app.hud.count(n); app.audio.count(n); }
        if (this.countdown <= 0.5) this.go();
      }
      if (this.state === 'run' || this.state === 'done') {
        this.acc += dt;
        let k = 0;
        while (this.acc >= DT && k < 10) { this.step(DT); this.acc -= DT; k++; }
        if (k >= 10) this.acc = 0;
      }
      this.t += dt;
      if (this.attract) this.attractLogic(dt);
    }
    this.updateVisuals(this.paused ? 0 : dt);
  }

  go() {
    this.state = 'run';
    for (const r of this.racers) { r.st.speed = 5; settle(r.st, this.course); }
    this.app.hud.count(0);
    this.app.audio.count(0);
    this.app.input.clearEdges();
  }

  step(dt) {
    const running = this.state === 'run';
    if (running) this.time += dt;
    this.stepCount++;
    const env = { wind: this.env.wind };
    for (const r of this.racers) {
      const st = r.st;
      let inp;
      if (r.finished) inp = AUTO_BRAKE;
      else if (r.isPlayer) inp = running ? this.app.input.read(st) : IDLE;
      else inp = r.brain.think(st, { rubber: this.rubber(r) });
      stepSkier(st, inp, this.course, dt, env);
      if (r.isPlayer && !this.attract) this.handleEvents(r);
      else st.events.length = 0;
      if (!r.finished && (running || this.attract)) this.checkProgress(r);
    }
    if (this.av && running) this.stepAvalanche(dt);
    const p = this.player;
    if (p && running && !p.finished) {
      const st = p.st;
      if (st.speed > this.stats.maxSpeed) this.stats.maxSpeed = st.speed;
      if (this.stats.combo > 0) {
        this.stats.comboTimer -= dt;
        if (this.stats.comboTimer <= 0) this.stats.combo = 0;
      }
      if (this.rec && this.stepCount % 4 === 1) this.rec.push(st.x, st.y, st.z, st.heading, st.pitch, st.spin, st.tuckIn, st.crash, st.groundPitch);
    }
    if (this.online && p && (running || this.state === 'done')) {
      this.netTimer = (this.netTimer || 0) - dt;
      if (this.netTimer <= 0) { this.netTimer = 0.066; this.sendNetState(); }
    }
  }

  rubber(r) {
    if (this.mode !== 'bots' || !this.player || this.player.finished) return 1;
    const d = r.st.s - this.player.st.s;
    return d > 60 ? 0.95 : d < -60 ? 1.06 : 1;
  }

  handleEvents(r) {
    const st = r.st, app = this.app, S = this.stats;
    for (const ev of st.events) {
      switch (ev.type) {
        case 'takeoff': app.input.lockAll(); app.audio.takeoff(); break;
        case 'jump': app.audio.jump(); break;
        case 'land':
          S.airTime += ev.air;
          if (ev.clean) {
            app.audio.land(ev.impact);
            if (ev.air > 0.45) this.fx.burst(st.x, st.y, st.z, Math.min(40, 10 + ev.air * 12), 4);
            if (ev.impact > 12) this.cs.shake = Math.min(1, ev.impact / 30);
            this.scoreTrick(ev);
          }
          break;
        case 'crash':
          S.crashes++;
          S.combo = 0;
          if (!this.online && ev.reason !== 'avalanche') this.slowmo = 0.55;
          app.audio.crash();
          this.fx.burst(st.x, st.y + 0.5, st.z, 50, 6);
          this.cs.shake = 1;
          app.hud.popup(CRASH_TEXT[ev.reason] || 'Sturz!', 'bad');
          break;
        case 'rescued': app.hud.popup('Bergwacht hat dich zurückgebracht', 'info'); break;
        case 'carve':
          app.audio.hiss(0.22, { freq: 1500, sweep: -700, vol: 0.13 });
          this.cs.kick = Math.min(1, ev.speed / 25);
          break;
        case 'grindStart': app.audio.click(); break;
        case 'butterStart': app.audio.jump(); break;
        case 'groundTrick': this.addScore(ev.name, ev.pts, false); break;
        case 'grindEnd': this.scoreGrind(ev.time); break;
        default: break;
      }
    }
    st.events.length = 0;
  }

  addScore(name, pts, sketchy) {
    const S = this.stats;
    S.combo = Math.min(S.combo + 1, 8);
    S.comboTimer = 7;
    const mult = 1 + (S.combo - 1) * 0.5;
    pts = Math.round((pts * mult) / 10) * 10;
    S.score += pts;
    S.tricks = (S.tricks || 0) + 1;
    if (pts > S.bestTrickPts) { S.bestTrickPts = pts; S.bestTrick = name; }
    const st = this.player.st;
    const before = st.meter;
    st.meter = Math.min(1, st.meter + pts / 1900);
    if (before < 1 && st.meter >= 1 && this.mode !== 'freestyle') this.app.hud.popup('Boost voll – Shift!', 'good');
    this.app.hud.trick(name, pts, mult, sketchy);
    this.app.audio.trick(Math.min(3, S.combo));
  }

  scoreTrick(ev) {
    const parts = [];
    let pts = 0;
    if (ev.flips) {
      const n = ev.flips;
      parts.push((n === 2 ? 'Doppel-' : n === 3 ? 'Triple-' : n > 3 ? n + 'x ' : '') + (ev.flipDir > 0 ? 'Backflip' : 'Frontflip'));
      pts += 320 * n * (1 + (n - 1) * 0.35);
      this.stats.flips += n;
    }
    if (ev.spins) {
      parts.push(ev.spins * 360 + '°');
      pts += 160 * ev.spins * (1 + (ev.spins - 1) * 0.3);
      this.stats.spins += ev.spins;
    }
    if (ev.grab > 0.25) { parts.push(ev.grabKind === 2 ? 'Tail Grab' : 'Mute Grab'); pts += 80 + ev.grab * 150; }
    if (!parts.length && ev.air > 0.9) { parts.push('Big Air'); pts += ev.air * 60; }
    if (!parts.length && ev.jumped && ev.air > 0.35) { parts.push('Ollie'); pts += 40; }
    if (!parts.length) return;
    pts += ev.air * 40;
    if (ev.sketchy) pts *= 0.5;
    this.addScore(parts.join(' + '), pts, ev.sketchy);
  }

  scoreGrind(time) {
    if (time < 0.2) return;
    this.stats.grinds++;
    this.addScore('Rail ' + time.toFixed(1) + ' s', 100 + time * 220, false);
  }

  checkProgress(r) {
    const st = r.st, s = -st.z, c = this.course;
    if (r.isPlayer) {
      const sec = c.secAt(s);
      if (sec !== this.curSec) {
        this.curSec = sec;
        if (sec.type !== 'start' && this.state === 'run') this.app.hud.banner(sec.name, sec.hint);
      }
      if (c.gates.length) this.checkGates(st);
      if (c.pickups.length) this.checkPickups(st);
      if (s > this.stats.distance) this.stats.distance = s;
    }
    if (!c.endless && s >= c.length) {
      r.finished = true;
      r.finishTime = this.time + (r.isPlayer ? this.stats.missed * 3 : 0);
      if (r.isPlayer) this.finishPlayer(false);
    }
  }

  checkGates(st) {
    const gates = this.course.gates;
    const s = -st.z;
    while (this.gateIdx < gates.length && s >= gates[this.gateIdx].s) {
      const g = gates[this.gateIdx++];
      const ok = Math.abs(st.x - g.x) <= g.w / 2 + 0.25;
      if (ok) { this.stats.passed++; this.app.audio.gate(); }
      else { this.stats.missed++; this.app.audio.miss(); this.app.hud.popup('Tor verpasst  +3 s', 'bad'); }
      this.world.markGate(g, ok);
    }
  }

  checkPickups(st) {
    const s = -st.z;
    for (const p of this.course.pickups) {
      if (p.taken || Math.abs(p.s - s) > 3) continue;
      const dx = p.x - st.x, dz = p.z - st.z;
      if (dx * dx + dz * dz < 2.6 * 2.6 && st.y - p.y < 3.5) {
        p.taken = true;
        st.boost = 1.6;
        this.world.hidePickup(p);
        this.app.audio.pickup();
        this.app.hud.popup('Boost!', 'good');
        this.stats.pickups++;
      }
    }
  }

  stepAvalanche(dt) {
    const av = this.av;
    av.v = Math.min(46, 11 + this.time * 0.16);
    av.s += av.v * dt;
    const p = this.player;
    if (!p || p.finished) return;
    this.avGap = p.st.s - av.s;
    if (this.avGap < 1.5) {
      p.finished = true;
      crash(p.st, 'avalanche');
      p.st.crashDur = p.st.crash = 4;
      this.handleEvents(p);
      this.finishPlayer(true);
    }
  }

  finishPlayer(caught) {
    const app = this.app, S = this.stats, p = this.player;
    this.state = 'done';
    this.doneAt = this.t;
    const mode = this.mode;
    const res = {
      mode, course: this.courseMode, trackId: this.def.id, trackName: this.def.name, weather: this.cfg.weather,
      online: !!this.online, time: p.finishTime, score: Math.round(S.score), distance: Math.round(S.distance),
      flips: S.flips, spins: S.spins, airTime: S.airTime, maxSpeed: S.maxSpeed, crashes: S.crashes,
      missed: S.missed, passed: S.passed, gates: this.course.gates.length, pickups: S.pickups, grinds: S.grinds,
      bestTrick: S.bestTrick, finished: !caught, caught, botDiff: this.cfg.botDiff != null ? this.cfg.botDiff : 1,
      bots: this.racers.length - 1, par: this.par, position: null,
    };
    if (mode === 'bots') res.position = 1 + this.racers.filter((r) => !r.isPlayer && r.finished && r.finishTime < p.finishTime).length;
    let value, lower;
    if (mode === 'freestyle') { value = res.score; lower = false; res.medal = scoreMedal(this.def.id, value); }
    else if (mode === 'lawine') { value = res.distance; lower = false; res.medal = distMedal(value); }
    else { value = res.time; lower = true; res.medal = timeMedal(value, this.par); }
    res.value = value;
    const st = app.store.data.stats;
    st.runs++; st.flips += S.flips; st.meters += Math.round(S.distance);
    if (res.position === 1) st.wins++;
    if (!this.online) {
      const key = boardKey(mode, this.def.id);
      res.boardKey = key;
      const sub = app.store.submit(key, value, lower, { w: this.cfg.weather, m: mode });
      res.pb = sub.pb; res.prev = sub.prev; res.rank = sub.rank;
      res.newMedal = app.store.setMedal(key, res.medal);
      if (sub.pb && this.rec && this.rec.length && (mode === 'zeit' || mode === 'slalom' || mode === 'bots')) {
        app.store.saveGhost(key, { time: value, hz: GHOST_HZ, stride: STRIDE, data: new Float32Array(this.rec) });
      }
    } else {
      this.online.sendFinish(value, false);
      this.sendNetState();
    }
    app.store.save();
    res.newChallenges = checkChallenges(app.store, res);
    if (caught) app.audio.fail(); else app.audio.finish();
    if (res.medal) app.audio.medal();
    app.hud.finish(caught ? 'Erwischt!' : mode === 'bots' ? `${res.position}. Platz` : 'Ziel!');
    this.result = res;
    setTimeout(() => { if (app.session === this) app.showResults(res); }, caught ? 2200 : 1600);
  }

  standings() {
    const list = this.racers.map((r) => ({ name: r.isPlayer ? r.name + ' (du)' : r.name, jacket: r.jacket, isPlayer: r.isPlayer, time: r.finished ? r.finishTime : null, s: r.st.s }));
    list.sort((a, b) => {
      if (a.time != null && b.time != null) return a.time - b.time;
      if (a.time != null) return -1;
      if (b.time != null) return 1;
      return b.s - a.s;
    });
    return list;
  }

  // ---------------- Online ----------------
  sendNetState() {
    if (!this.online || !this.player) return;
    const st = this.player.st;
    const r2 = (v) => Math.round(v * 100) / 100;
    this.online.sendState([
      r2(st.x), r2(st.y), r2(st.z), r2(st.heading), r2(st.pitch), r2(st.spin), st.tuckIn, r2(st.crash),
      r2(st.groundPitch), r2(st.steerIn), this.player.finished ? 1 : 0, Math.round(this.stats.score),
      st.grab || 0, st.brakeIn || 0, r2(st.speed),
    ]);
  }

  onNetStates(list) {
    if (!this.online) return;
    const me = this.online.myId;
    const shadows = this.app.quality !== 'niedrig';
    for (const e of list) {
      const [id, x, y, z, h, p, sp, tk, cr, gp, steer, fin, score, grab, brake, speed] = e;
      if (id === me) continue;
      let rm = this.remotes.get(id);
      if (!rm) {
        const info = (this.online.playerList || []).find((q) => q.id === id) || { name: 'Gast', jacket: '#8fdcff', helmet: '#ffffff' };
        const model = new Skier3D({ jacket: info.jacket, helmet: info.helmet, name: info.name, shadows });
        this.scene.add(model.root);
        rm = { id, name: info.name, jacket: info.jacket, model, tgt: {}, st: { x, y, z, heading: h, pitch: p, spin: sp, tuckIn: tk, crash: cr, crashDur: 1.8, groundPitch: gp, steerIn: steer, speed: 20, grounded: true, grab: 0 }, seen: 0 };
        this.remotes.set(id, rm);
      }
      Object.assign(rm.tgt, { x, y, z, h, p, sp, tk, cr, gp, steer, grab: grab || 0, brake: brake || 0, speed: speed || 0 });
      rm.fin = !!fin;
      rm.score = score;
      rm.seen = this.t;
    }
  }

  // ---------------- Darstellung ----------------
  updateVisuals(dt) {
    for (const r of this.racers) {
      r.model.update(r.st, dt, this.course);
      if (dt > 0) this.fx.spray(r.st, dt);
    }
    if (this.ghost) this.updateGhost(dt);
    for (const rm of this.remotes.values()) {
      const k = 1 - Math.exp(-dt * 12);
      const s = rm.st, t = rm.tgt;
      s.x = lerp(s.x, t.x, k); s.y = lerp(s.y, t.y, k); s.z = lerp(s.z, t.z, k);
      s.heading += wrapAngle(t.h - s.heading) * k;
      s.pitch = lerp(s.pitch, t.p, k); s.spin = lerp(s.spin, t.sp, k);
      s.tuckIn = t.tk; s.crash = t.cr; s.groundPitch = t.gp; s.steerIn = t.steer;
      s.grab = t.grab; s.brakeIn = t.brake; s.speed = t.speed;
      s.grounded = Math.abs(t.p) < 0.05 && Math.abs(t.sp) < 0.05;
      rm.model.update(s, dt, this.course);
      rm.model.root.visible = this.t - rm.seen < 4;
    }
    const f = this.focus().st;
    this.world.update(f.s != null ? f.s : -f.z, this.t);
    this.env.update(dt, this.camera, f, f.heading);
    this.fx.update(dt);
    if (this.av) this.fx.updateAvalanche(this.av.s, this.t);
    this.updateCamera(dt);
    if (!this.attract && this.player) {
      const st = this.player.st;
      const audioOn = !this.paused && this.state !== 'countdown';
      this.app.audio.engine({
        active: audioOn,
        speed: st.speed,
        carve: st.grounded && !st.grind ? Math.abs(st.steerIn) * Math.min(1, st.speed / 18) + st.brakeIn * Math.min(1, st.speed / 10) : 0,
        air: !st.grounded,
        grind: !!st.grind,
        rumble: this.av ? clamp(1.2 - (this.avGap || 200) / 110, 0, 1.1) : 0,
      });
      this.app.hud.update(this);
    }
  }

  updateGhost() {
    const g = this.ghost, D = g.data, n = g.n;
    const f = Math.max(0, this.time * g.hz);
    const i0 = Math.min(n - 1, Math.floor(f)), i1 = Math.min(n - 1, i0 + 1), a = Math.min(1, f - i0);
    const A = i0 * STRIDE, B = i1 * STRIDE;
    const L = (o) => D[A + o] + (D[B + o] - D[A + o]) * a;
    const s = g.st;
    s.x = L(0); s.y = L(1); s.z = L(2); s.heading = L(3); s.pitch = L(4); s.spin = L(5);
    s.tuckIn = D[A + 6]; s.crash = D[A + 7]; s.groundPitch = L(8);
    s.grounded = Math.abs(s.pitch) < 0.02 && Math.abs(s.spin) < 0.02;
    g.model.update(s, 0.016, this.course);
    const pl = this.player && this.player.st;
    const near = pl ? Math.hypot(pl.x - s.x, pl.z - s.z) : 99;
    g.model.root.visible = near > 2.2 && this.state !== 'countdown';
  }

  ghostDelta(s) {
    const g = this.ghost;
    if (!g || s < 5) return null;
    const D = g.data;
    const S = (i) => -D[i * STRIDE + 2];
    let lo = 0, hi = g.n - 1;
    if (S(hi) < s) return null;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S(mid) < s) lo = mid + 1; else hi = mid; }
    if (lo === 0) return null;
    const s0 = S(lo - 1), s1 = S(lo);
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    return this.time - (lo - 1 + f) / g.hz;
  }

  attractLogic(dt) {
    const cs = this.cs;
    cs.switchT += dt;
    if (cs.switchT > 14) { cs.switchT = 0; cs.focus++; cs.init = false; }
    const allDone = this.racers.every((r) => r.finished || r.st.s > this.course.length);
    if (allDone || this.t > 140) this.app.nextAttract();
  }

  updateCamera(dt) {
    const cam = this.camera, cs = this.cs;
    const st = this.focus().st;
    let hd = st.heading;
    if (!st.grounded && !st.grind && st.crash <= 0) hd = Math.atan2(st.vx, -st.vz);
    if (!cs.init) cs.h = hd;
    cs.h += wrapAngle(hd - cs.h) * Math.min(1, dt * 3.2);
    const sp = st.speed || 0;
    const sx = Math.sin(cs.h), cz = -Math.cos(cs.h);
    let px, py, pz, lx, ly, lz, lagK = 9;
    if (this.attract) {
      cs.orbit += dt * 0.1;
      const a = cs.orbit;
      const off = 8 + Math.sin(a * 0.7) * 3;
      px = st.x + Math.sin(a) * off; pz = st.z + Math.cos(a) * off; py = st.y + 2.4 + Math.sin(a * 0.5) * 1.2;
      lx = st.x; ly = st.y + 1; lz = st.z;
      lagK = 4;
    } else if (this.state === 'countdown') {
      const k = clamp((this.countdown - 0.5) / 3, 0, 1);
      const ang = k * 2.4, dist = 6.5 + k * 2.5;
      px = st.x - Math.sin(cs.h + ang) * dist; pz = st.z + Math.cos(cs.h + ang) * dist; py = st.y + 2.2 + k * 0.8;
      lx = st.x + sx * 2 * (1 - k); ly = st.y + 1.1; lz = st.z + cz * 2 * (1 - k);
      lagK = 6;
    } else if (this.state === 'done' && this.player && this.player.finished) {
      cs.orbit += dt * 0.35;
      const a = cs.orbit;
      px = st.x + Math.sin(a) * 7; pz = st.z + Math.cos(a) * 7; py = st.y + 2.6;
      lx = st.x; ly = st.y + 1; lz = st.z;
      lagK = 3;
    } else {
      const crashing = st.crash > 0 ? 1 : 0;
      const dist = 5.0 + Math.min(2.6, sp * 0.06) + crashing * 2.2;
      const h = 2.2 + Math.min(1.2, sp * 0.025) + crashing * 1.2;
      lagK = 12;
      px = st.x - sx * dist; pz = st.z - cz * dist; py = st.y + h;
      lx = st.x + sx * 6; ly = st.y + 1.0; lz = st.z + cz * 6;
    }
    const gy = this.course.heightAt(px, pz) + 1.3;
    if (py < gy) py = gy;
    tmpV.set(px, py, pz);
    if (!cs.init) { cam.position.copy(tmpV); cs.look.set(lx, ly, lz); cs.init = true; }
    else {
      cam.position.lerp(tmpV, 1 - Math.exp(-dt * lagK));
      cs.look.lerp(tmpV2.set(lx, ly, lz), 1 - Math.exp(-dt * 12));
    }
    let shake = cs.shake;
    if (this.av && this.avGap != null && !this.player.finished) shake = Math.max(shake, clamp(1 - this.avGap / 70, 0, 1) * 0.5);
    // leichtes Rütteln ab ca. 85 km/h
    const ride = !this.attract && this.state !== 'countdown' && st.grounded && !st.grind && st.crash <= 0;
    if (ride && sp > 23.5) shake = Math.max(shake, Math.min(0.28, (sp - 23.5) / 40));
    if (shake > 0 && dt > 0) {
      const s = shake * 0.22;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cs.shake = Math.max(0, cs.shake - dt * 2);
    cam.lookAt(cs.look);
    // Kamera legt sich mit in die Kurve
    const rollT = ride ? -(st.edge || 0) * clamp(sp / 26, 0, 1) * 0.13 : 0;
    cs.roll = lerp(cs.roll || 0, rollT, Math.min(1, dt * 4));
    if (Math.abs(cs.roll) > 0.0005) cam.rotateZ(cs.roll);
    // Sichtfeld: Tempo, Boost und Schub aus dem Kantenwechsel
    cs.kick = Math.max(0, (cs.kick || 0) - dt * 2.2);
    const fov = 66 + clamp(sp - 8, 0, 34) * 0.62 + (st.boosting || st.boost > 0 ? 6 : 0) + cs.kick * 4;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 4));
      cam.updateProjectionMatrix();
    }
  }

  dispose() {
    this.world.dispose();
    this.env.dispose();
    this.fx.dispose();
    for (const r of this.racers) r.model.dispose();
    for (const rm of this.remotes.values()) rm.model.dispose();
  }
}
