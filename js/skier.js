// Skifahrer-Physik (fester Zeitschritt)
import { clamp, lerp, wrapAngle, smoothstep } from './rng.js';

export const DT = 1 / 120;
const G = 9.81;
const TAU = Math.PI * 2;
const grad = [0, 0];

export function createSkierState(course, x, s) {
  const st = {
    x, z: -s, y: 0, s, heading: course.trackHeading(s), speed: 0,
    vx: 0, vy: 0, vz: 0, grounded: true, air: 0,
    pitch: 0, spin: 0, pitchVel: 0, spinVel: 0, grab: 0, grabT: 0,
    crash: 0, crashDur: 1.5, tuckIn: 0, steerIn: 0, brakeIn: 0,
    grind: null, boost: 0, groundPitch: 0, events: [], finished: false,
    butter: null, jumped: false, grabKind: 0, grabTimes: [0, 0, 0], meter: 0, boosting: false,
    edge: 0, edgeSide: 0, edgeHold: 0, pump: 0, pumpCd: 0,
  };
  st.y = course.heightAt(x, -s);
  return st;
}

// Ohne Eingabe: angefangene Drehung zu Ende bringen oder zurück in die Senkrechte
function settleRate(a, vel, max) {
  const e = wrapAngle(a);
  if (Math.abs(e) > 1.2 && Math.abs(vel) > 0.5) return Math.sign(vel) * max;
  return clamp(-e * 6, -max, max);
}

export function settle(st, course) {
  st.y = course.heightAt(st.x, st.z);
  st.vy = groundVy(st, course);
}

function groundVy(st, course) {
  course.gradient(st.x, st.z, grad);
  return (grad[0] * Math.sin(st.heading) - grad[1] * Math.cos(st.heading)) * st.speed;
}

export function crash(st, reason) {
  if (st.crash > 0) return;
  st.crash = st.crashDur = 1.8;
  st.crashReason = reason;
  st.grind = null;
  st.grounded = true;
  st.pitch = 0; st.spin = 0; st.pitchVel = 0; st.spinVel = 0;
  st.butter = null; st.grab = 0; st.boosting = false;
  st.edge = 0; st.edgeSide = 0; st.edgeHold = 0; st.pump = 0;
  st.events.push({ type: 'crash', reason });
}

export function stepSkier(st, inp, course, dt, env) {
  st.steerIn = inp.steer || 0;
  st.tuckIn = inp.tuck ? 1 : 0;
  st.brakeIn = inp.brake ? 1 : 0;
  if (st.crash > 0) { stepCrash(st, course, dt); return; }
  if (st.grind) { stepGrind(st, inp, course, dt); return; }
  if (st.grounded) stepGround(st, inp, course, dt, env);
  else stepAir(st, inp, course, dt, env);
  st.s = -st.z;
  if (st.crash <= 0 && !st.grind) {
    checkObstacles(st, course);
    if (course.rails.length) checkRails(st, course);
  }
}

function takeoff(st, sinH, cosH) {
  st.grounded = false;
  st.vx = sinH * st.speed;
  st.vz = -cosH * st.speed;
  st.air = 0; st.pitch = 0; st.spin = 0; st.pitchVel = 0; st.spinVel = 0; st.grabT = 0;
  st.grabTimes[1] = 0; st.grabTimes[2] = 0; st.jumped = false; st.butter = null; st.boosting = false; st.flHold = 0; st.spHold = 0;
  st.events.push({ type: 'takeoff', vy: st.vy });
}

function stepGround(st, inp, course, dt, env) {
  const v = st.speed;
  let steer = inp.steer || 0;
  // Boden-Trick: Butter 360
  if (!st.butter && (inp.trickL || inp.trickR) && v > 5) {
    st.butter = { dir: inp.trickL ? 1 : -1, t: 0 };
    st.events.push({ type: 'butterStart' });
  }
  if (st.butter) {
    const B = st.butter;
    B.t += dt;
    const p = Math.min(1, B.t / 0.8);
    st.spin = B.dir * TAU * (p * p * (3 - 2 * p));
    steer *= 0.3;
    if (p >= 1) {
      st.spin = 0;
      st.butter = null;
      st.events.push({ type: 'groundTrick', name: B.dir > 0 ? 'Butter 360 links' : 'Butter 360 rechts', pts: 260 });
    }
  }
  const s0 = -st.z;
  const ice = course.iceAt(s0);
  // Kante: die Lenkung baut sich kurz auf (Gewicht im Schwung) statt sofort voll zu greifen
  const prevEdge = st.edge || 0;
  st.edge = prevEdge + (steer - prevEdge) * Math.min(1, dt * 12);
  const edge = st.edge;
  // Kantenwechsel nach einem sauber gehaltenen Schwung gibt Schub (rhythmisch carven lohnt sich)
  if (Math.abs(edge) > 0.45) {
    const side = Math.sign(edge);
    if (side !== st.edgeSide) {
      if (st.edgeSide && st.edgeHold > 0.3 && !(st.pumpCd > 0) && v > 8 && !inp.brake && !st.butter && ice < 0.5) {
        st.pump = 0.3;
        st.pumpCd = 0.75; // kein Dauer-Wackeln: höchstens ein Schub pro Schwungpaar
        st.meter = Math.min(1, st.meter + 0.04);
        st.events.push({ type: 'carve', speed: v });
      }
      st.edgeSide = side;
      st.edgeHold = 0;
    } else st.edgeHold = (st.edgeHold || 0) + dt;
  }
  let turnRate = (inp.tuck ? 1.45 : 2.35) * (1 - Math.min(0.3, v / 110));
  if (inp.brake) turnRate += 0.5;
  turnRate *= 1 - 0.4 * ice;
  st.heading = clamp(st.heading + edge * turnRate * dt, -1.5, 1.5);
  const sinH = Math.sin(st.heading), cosH = Math.cos(st.heading);
  course.gradient(st.x, st.z, grad);
  const gx = grad[0], gz = grad[1];
  const along = -(gx * sinH - gz * cosH);
  const norm = 1 / Math.sqrt(1 + gx * gx + gz * gz);
  const s = -st.z;
  const off = !course.onPiste(st.x, s);
  let mu = off ? 0.13 : 0.03;
  mu = lerp(mu, 0.012, ice);
  if (inp.brake) mu += 0.3 * (1 - 0.7 * ice);
  if (course.slowAt(st.x, s)) mu += 0.35;
  let k = inp.tuck ? 0.0021 : 0.004;
  if (off) k += 0.0035;
  // Kurven kosten weniger Tempo als früher (0.028), der Schub beim Kantenwechsel holt den Rest zurück
  let a = G * along * norm - mu * G * norm - k * v * v - Math.abs(edge) * v * 0.018 * (1 - 0.6 * ice);
  // Anschieben: aus dem Stand und nach Stürzen schnell wieder auf Tempo
  if (!inp.brake && !off && v < 9) a += (9 - v) * 0.45;
  if (st.pumpCd > 0) st.pumpCd -= dt;
  if (st.pump > 0) { a += 2.8 * (1 - clamp((v - 18) / 14, 0, 0.7)); st.pump -= dt; }
  if (st.boost > 0) { a += 8; st.boost -= dt; }
  st.boosting = false;
  if (inp.boost && st.meter > 0.01) { a += 5; st.meter = Math.max(0, st.meter - dt * 0.65); st.boosting = true; }
  if (st.butter) a -= 0.12 * v;
  st.speed = Math.max(0, v + a * dt);
  if (st.speed < 2.5 && along < 0.04) {
    const th = course.trackHeading(s);
    st.heading += clamp(th - st.heading, -1, 1) * dt * 1.2;
  }
  const px = st.x, pz = st.z;
  st.x += sinH * st.speed * dt;
  st.z -= cosH * st.speed * dt;
  if (env && env.wind) st.x += env.wind * dt * 0.35;
  const gy = course.heightAt(st.x, st.z);
  if (gy - st.y > 0.9) { st.x = px; st.z = pz; st.speed *= 0.3; crash(st, 'wall'); return; }
  if (gy < course.hAt(-st.z) - 4) { st.y = gy; crash(st, 'fall'); return; }
  const nvy = (gy - st.y) / dt;
  if (st.speed > 5 && nvy < st.vy - G * dt * 1.7) {
    takeoff(st, sinH, cosH);
    st.y += st.vy * dt;
  } else {
    st.vy = nvy;
    st.y = gy;
  }
  st.groundPitch = lerp(st.groundPitch, -Math.atan(along), Math.min(1, dt * 10));
  if (inp.jump && st.grounded) {
    takeoff(st, sinH, cosH);
    st.vy += 5.6;
    st.jumped = true;
    st.events.push({ type: 'jump' });
  }
}

function stepAir(st, inp, course, dt, env) {
  st.vy -= G * dt;
  st.px = st.x; st.pz = st.z;
  const hs = Math.hypot(st.vx, st.vz);
  const drag = (inp.tuck ? 0.0012 : 0.0022) * hs;
  st.vx -= st.vx * drag * dt;
  st.vz -= st.vz * drag * dt;
  st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
  if (env && env.wind) st.x += env.wind * dt * 0.6;
  st.air += dt;
  // Drehungen erst nach kurzem Halten starten (keine versehentlichen Flips beim Gegenlenken)
  const fl = inp.flip || 0, sp = inp.spin || 0;
  st.flHold = fl && fl === st.flDir ? (st.flHold || 0) + dt : fl ? dt : 0; st.flDir = fl;
  st.spHold = sp && sp === st.spDir ? (st.spHold || 0) + dt : sp ? dt : 0; st.spDir = sp;
  const flOn = fl !== 0 && (st.flHold > 0.15 || Math.abs(st.pitchVel) > 1.5);
  const spOn = sp !== 0 && (st.spHold > 0.15 || Math.abs(st.spinVel) > 1.5);
  st.pitchVel += ((flOn ? fl * 5.4 : settleRate(st.pitch, st.pitchVel, 5)) - st.pitchVel) * Math.min(1, dt * 9);
  st.spinVel += ((spOn ? sp * 7.0 : settleRate(st.spin, st.spinVel, 6.5)) - st.spinVel) * Math.min(1, dt * 9);
  st.pitch += st.pitchVel * dt;
  st.spin += st.spinVel * dt;
  // Lenkhilfe: bei weiten Sprüngen sanft dem Pistenverlauf folgen
  if (!sp && st.air > 0.3) {
    const want = course.trackHeading(-st.z);
    const velH = Math.atan2(st.vx, -st.vz);
    const turn = clamp(wrapAngle(want - velH), -1, 1) * 0.35 * dt;
    const c = Math.cos(turn), s = Math.sin(turn);
    const vx = st.vx, vz = st.vz;
    st.vx = vx * c - vz * s; st.vz = vx * s + vz * c;
    st.heading = clamp(st.heading + turn, -1.5, 1.5);
  }
  // kurzes Tippen links/rechts = leicht in der Luft lenken
  if (sp && !spOn) {
    const turn = sp * 0.55 * dt, c = Math.cos(turn), s = Math.sin(turn);
    const vx = st.vx, vz = st.vz;
    st.vx = vx * c - vz * s; st.vz = vx * s + vz * c;
    st.heading = clamp(st.heading + turn, -1.5, 1.5);
  }
  st.grab = inp.grab ? (inp.grab === 2 ? 2 : 1) : 0;
  if (st.grab) { st.grabT += dt; st.grabTimes[st.grab] += dt; }
  st.groundPitch = lerp(st.groundPitch, clamp(Math.atan2(st.vy, hs) * 0.6, -0.6, 0.4), Math.min(1, dt * 3));
  const gy = course.heightAt(st.x, st.z);
  if (st.y <= gy) land(st, course, gy);
}

function land(st, course, gy) {
  if (gy - st.y > 1.2 && st.px != null) {
    st.x = st.px; st.z = st.pz;
    st.y = course.heightAt(st.x, st.z);
    st.speed = Math.hypot(st.vx, st.vz) * 0.3;
    crash(st, 'wall');
    return;
  }
  if (gy < course.hAt(-st.z) - 4) { st.y = gy; st.speed = Math.hypot(st.vx, st.vz) * 0.3; crash(st, 'fall'); return; }
  const pE = Math.abs(wrapAngle(st.pitch)), sE = Math.abs(wrapAngle(st.spin));
  const flips = Math.round(st.pitch / TAU), spins = Math.round(st.spin / TAU);
  course.gradient(st.x, st.z, grad);
  const gvy = grad[0] * st.vx + grad[1] * st.vz;
  const impact = gvy - st.vy;
  st.y = gy;
  st.grounded = true;
  const hs = Math.hypot(st.vx, st.vz);
  const bad = Math.max(pE, sE * 0.6);
  const ev = {
    type: 'land', air: st.air, flips: Math.abs(flips), flipDir: Math.sign(flips), spins: Math.abs(spins),
    grab: st.grabT, grabKind: st.grabTimes[2] > st.grabTimes[1] ? 2 : 1, jumped: st.jumped, impact, sketchy: bad > 0.5 || impact > 22, clean: true,
  };
  st.jumped = false;
  st.pitch = 0; st.spin = 0; st.pitchVel = 0; st.spinVel = 0; st.grab = 0;
  if (bad > 1.15 || impact > 32) {
    st.speed = hs * 0.5;
    ev.clean = false;
    st.events.push(ev);
    crash(st, bad > 1.15 ? 'landing' : 'impact');
    return;
  }
  const velH = Math.atan2(st.vx, -st.vz);
  st.speed = hs * Math.max(0.35, Math.cos(wrapAngle(velH - st.heading)));
  if (impact > 12) st.speed *= 1 - clamp((impact - 12) / 45, 0, 0.35);
  if (ev.sketchy) st.speed *= 0.88;
  st.vy = (grad[0] * Math.sin(st.heading) - grad[1] * Math.cos(st.heading)) * st.speed;
  st.events.push(ev);
}

function stepCrash(st, course, dt) {
  st.crash -= dt;
  st.speed *= Math.exp(-2.8 * dt);
  st.x += Math.sin(st.heading) * st.speed * dt;
  st.z -= Math.cos(st.heading) * st.speed * dt;
  st.y = course.heightAt(st.x, st.z);
  st.s = -st.z;
  if (st.crash <= 0) {
    st.crash = 0;
    let s = st.s;
    const c = course.cxAt(s), hw = course.wAt(s) / 2;
    const d = st.x - c;
    if (course.heightAt(st.x, st.z) < course.hAt(s) - 3) {
      // aus Spalte / vom Grat holen: nach vorn auf sicheren Grund
      for (let k = 0; k < 40; k++) {
        const ss = s + k * 1.5, lx = course.lineAt(ss);
        if (course.heightAt(lx, -ss) > course.hAt(ss) - 1.2) { st.x = lx; st.z = -ss; s = ss; break; }
      }
      st.s = s;
      st.events.push({ type: 'rescued' });
    } else if (Math.abs(d) > hw + 10) {
      st.x = c + Math.sign(d) * (hw - 3);
      st.events.push({ type: 'rescued' });
    }
    pushOutOfObstacles(st, course);
    st.y = course.heightAt(st.x, st.z);
    st.heading = course.trackHeading(s);
    st.speed = Math.min(st.speed, 5);
    st.vy = groundVy(st, course);
    st.events.push({ type: 'recover' });
  }
}

function pushOutOfObstacles(st, course) {
  course.forObstacles(-st.z, (o) => {
    const dx = st.x - o.x, dz = st.z - o.z, rr = o.r + 0.6;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1;
      st.x = o.x + (dx / d) * rr;
      st.z = o.z + (dz / d) * rr;
    }
  });
}

function checkObstacles(st, course) {
  let hit = null;
  course.forObstacles(-st.z, (o) => {
    if (hit) return;
    const dx = st.x - o.x, dz = st.z - o.z, rr = o.r + 0.35;
    if (dx * dx + dz * dz < rr * rr) {
      const top = o.type === 'tree' ? 7 * o.sc : o.type === 'hut' ? 7 : 1.5 * o.sc;
      if (st.y - o.y < top) hit = o;
    }
  });
  if (hit) {
    const dx = st.x - hit.x, dz = st.z - hit.z;
    const d = Math.hypot(dx, dz) || 1;
    const rr = hit.r + 0.5;
    st.x = hit.x + (dx / d) * rr;
    st.z = hit.z + (dz / d) * rr;
    st.speed *= 0.35;
    crash(st, hit.type);
  }
}

function checkRails(st, course) {
  const s = -st.z;
  for (const r of course.rails) {
    if (r.y1 == null || s < r.s1 - 1 || s > r.s2 + 1) continue;
    const ax = r.x2 - r.x1, az = r.z2 - r.z1;
    const L2 = ax * ax + az * az;
    const t = ((st.x - r.x1) * ax + (st.z - r.z1) * az) / L2;
    if (t < 0 || t > 1) continue;
    const px = r.x1 + ax * t, pz = r.z1 + az * t;
    const dist = Math.hypot(st.x - px, st.z - pz);
    const top = lerp(r.y1, r.y2, t);
    if (st.grounded) {
      if (dist < 0.55) {
        const dh = Math.abs(wrapAngle(st.heading - r.heading));
        if (dh < 0.65 && t < 0.3) startGrind(st, r, t);
        else if (st.y < top - 0.1) {
          // quer erwischt: drüberhüpfen statt Sturz
          st.speed *= 0.82;
          takeoff(st, Math.sin(st.heading), Math.cos(st.heading));
          st.vy = Math.max(st.vy, 0) + 3.2;
          st.y = top + 0.05;
        }
        return;
      }
    } else if (st.vy < 0 && dist < 0.7 && st.y < top + 0.45 && st.y > top - 0.35) {
      const bad = Math.max(Math.abs(wrapAngle(st.pitch)), Math.abs(wrapAngle(st.spin)) * 0.6);
      if (bad > 1.15) { crash(st, 'rail'); return; }
      st.speed = Math.hypot(st.vx, st.vz) * 0.95;
      startGrind(st, r, t);
      return;
    }
  }
}

function startGrind(st, r, t) {
  st.grind = { r, t, time: 0 };
  st.grounded = true;
  st.heading = r.heading;
  st.pitch = 0; st.spin = 0; st.pitchVel = 0; st.spinVel = 0;
  st.events.push({ type: 'grindStart' });
}

function stepGrind(st, inp, course, dt) {
  const g = st.grind, r = g.r;
  const slope = (r.y1 - r.y2) / r.len;
  st.speed = Math.max(4, st.speed + (G * slope - 0.03 * G - 0.003 * st.speed * st.speed) * dt);
  g.t += (st.speed * dt) / r.len;
  g.time += dt;
  const t = Math.min(1, g.t);
  st.x = lerp(r.x1, r.x2, t); st.z = lerp(r.z1, r.z2, t); st.y = lerp(r.y1, r.y2, t);
  st.heading = r.heading;
  st.s = -st.z;
  st.groundPitch = lerp(st.groundPitch, -Math.atan(slope), 0.2);
  if (g.t >= 1 || inp.jump) {
    st.grind = null;
    st.vy = -slope * st.speed + (inp.jump ? 4.5 : 2.2);
    takeoff(st, Math.sin(st.heading), Math.cos(st.heading));
    st.events.push({ type: 'grindEnd', time: g.time });
  }
}
