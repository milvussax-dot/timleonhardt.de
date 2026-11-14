// Realistischere Skifahrer-Figur: Gelenke mit 2-Knochen-IK, Carving-Haltung, Stockeinsatz, Grabs, Hocke
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, smoothstep } from './rng.js';

const SHIN = 0.43, THIGH = 0.45, UARM = 0.29, FARM = 0.27, POLE = 1.18;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const tA = new THREE.Vector3(), tB = new THREE.Vector3();
const vHip = new THREE.Vector3(), vAnk = new THREE.Vector3(), vKnee = new THREE.Vector3(), vPole = new THREE.Vector3();
const vSh = new THREE.Vector3(), vHand = new THREE.Vector3(), vElb = new THREE.Vector3(), vDir = new THREE.Vector3();

// Zwei-Knochen-IK: setzt out auf das Mittelgelenk, kürzt das Ziel b falls unerreichbar
function solve2(a, b, l1, l2, pole, out) {
  tA.subVectors(b, a);
  let d = tA.length();
  const dc = clamp(d, 0.02, l1 + l2 - 0.002);
  tA.multiplyScalar(1 / (d || 1));
  if (dc !== d) b.copy(a).addScaledVector(tA, dc);
  const cosA = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  tB.copy(pole).addScaledVector(tA, -pole.dot(tA));
  if (tB.lengthSq() < 1e-6) tB.set(0, 0, -1);
  tB.normalize();
  out.copy(a).addScaledVector(tA, cosA * l1).addScaledVector(tB, sinA * l1);
}

function place(mesh, a, b) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  vDir.subVectors(b, a).normalize();
  mesh.quaternion.setFromUnitVectors(UP, vDir);
}

function makeSkiGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.86, 0.0);
  s.lineTo(0.7, 0.0);
  s.quadraticCurveTo(0.88, 0.005, 0.97, 0.11);
  s.lineTo(0.955, 0.126);
  s.quadraticCurveTo(0.86, 0.03, 0.7, 0.022);
  s.lineTo(-0.8, 0.022);
  s.quadraticCurveTo(-0.88, 0.024, -0.925, 0.065);
  s.lineTo(-0.94, 0.055);
  s.quadraticCurveTo(-0.9, 0.0, -0.86, 0.0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.0425);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

let G = null;
function geos() {
  if (G) return G;
  G = {};
  G.ski = makeSkiGeo();
  G.boot = new RoundedBoxGeometry(0.13, 0.21, 0.31, 2, 0.04);
  G.bootTop = new THREE.CylinderGeometry(0.068, 0.072, 0.12, 12);
  G.binding = new RoundedBoxGeometry(0.09, 0.045, 0.46, 1, 0.015);
  G.shin = new THREE.CapsuleGeometry(0.064, SHIN - 0.04, 4, 12);
  G.thigh = new THREE.CapsuleGeometry(0.08, THIGH - 0.07, 4, 12);
  G.knee = new THREE.SphereGeometry(0.072, 12, 10);
  G.hips = new THREE.SphereGeometry(1, 18, 12);
  G.abdomen = new THREE.CapsuleGeometry(0.13, 0.12, 4, 16);
  G.chest = new THREE.CapsuleGeometry(0.15, 0.18, 4, 16);
  G.collar = new THREE.CylinderGeometry(0.075, 0.1, 0.09, 16, 1, true);
  G.shoulder = new THREE.SphereGeometry(0.07, 14, 10);
  G.uarm = new THREE.CapsuleGeometry(0.054, UARM - 0.05, 4, 12);
  G.farm = new THREE.CapsuleGeometry(0.048, FARM - 0.06, 4, 12);
  G.cuff = new THREE.CylinderGeometry(0.056, 0.052, 0.06, 12);
  G.glove = new RoundedBoxGeometry(0.08, 0.11, 0.095, 2, 0.032);
  G.neck = new THREE.CylinderGeometry(0.048, 0.056, 0.1, 12);
  G.head = new THREE.SphereGeometry(0.104, 20, 16);
  G.helmet = new THREE.SphereGeometry(0.128, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
  G.goggle = new THREE.CylinderGeometry(0.134, 0.13, 0.072, 26, 1, true, Math.PI - 1.2, 2.4);
  G.goggleFrame = new THREE.CylinderGeometry(0.137, 0.133, 0.088, 26, 1, true, Math.PI - 1.28, 2.56);
  G.strap = new THREE.CylinderGeometry(0.129, 0.129, 0.034, 24, 1, true);
  G.stripe = new THREE.CapsuleGeometry(0.152, 0.02, 4, 16);
  G.zip = new THREE.BoxGeometry(0.012, 0.3, 0.012);
  G.pole = new THREE.CylinderGeometry(0.009, 0.007, POLE, 6).translate(0, -POLE / 2, 0);
  G.grip = new THREE.CylinderGeometry(0.018, 0.015, 0.14, 8).translate(0, -0.03, 0);
  G.basket = new THREE.CylinderGeometry(0.045, 0.045, 0.008, 14).translate(0, -POLE + 0.1, 0);
  G.pack = new RoundedBoxGeometry(0.26, 0.3, 0.1, 2, 0.04);
  return G;
}

export const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.32, depthWrite: false });

function shade(hex, f) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp(hsl.l * f, 0, 1));
  return c;
}

export class Skier3D {
  constructor({ jacket = '#ff5a36', helmet = '#f5f7fa', pants = null, ghost = false, name = null, shadows = true } = {}) {
    const g = geos();
    this.mats = [];
    const mat = (color, rough = 0.8, metal = 0, extra = {}) => {
      if (ghost) return GHOST_MAT;
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
      this.mats.push(m);
      return m;
    };
    const PANTS = ['#1d2230', '#262b36', '#1b2d45', '#2e2a33', '#141820'];
    let hsh = 0;
    for (const ch of jacket) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const pantsCol = pants || PANTS[hsh % PANTS.length];
    const M = {
      jacket: mat(jacket, 0.72),
      jacketDark: mat(shade(jacket, 0.7), 0.75),
      accent: mat(helmet, 0.6),
      pants: mat(pantsCol, 0.85),
      skin: mat('#e7b48f', 0.6),
      helmet: mat(helmet, 0.28, 0.1),
      goggle: mat('#ffb347', 0.08, 0.9, { emissive: '#7a2d00', emissiveIntensity: 0.35, side: THREE.DoubleSide }),
      frame: mat('#15171c', 0.5, 0, { side: THREE.DoubleSide }),
      strap: mat(shade(helmet, 0.45), 0.7, 0, { side: THREE.DoubleSide }),
      boot: mat('#1e232c', 0.35, 0.15),
      bootAcc: mat(jacket, 0.4),
      skiTop: mat(jacket, 0.35, 0.1),
      skiSide: mat('#101318', 0.5),
      binding: mat('#c9ced6', 0.3, 0.7),
      glove: mat('#16181d', 0.7),
      pole: mat('#d6dce4', 0.3, 0.8),
      grip: mat('#111', 0.6),
      pack: mat('#2a3142', 0.8),
    };
    const mk = (geo, m) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = !ghost && shadows;
      return mesh;
    };

    this.root = new THREE.Group();
    this.align = new THREE.Group();
    this.align.rotation.order = 'YXZ';
    this.root.add(this.align);
    this.tilt = new THREE.Group();
    this.tilt.position.y = 0.9;
    this.tilt.rotation.order = 'YXZ';
    this.align.add(this.tilt);
    this.body = new THREE.Group();
    this.body.position.y = -0.9;
    this.tilt.add(this.body);

    // Ski + Schuhe
    this.skis = [];
    for (const side of [-1, 1]) {
      const sk = new THREE.Group();
      sk.rotation.order = 'YXZ';
      sk.position.set(side * 0.11, 0, 0);
      const ski = mk(g.ski, ghost ? GHOST_MAT : [M.skiSide, M.skiTop]);
      sk.add(ski);
      const bind = mk(g.binding, M.binding);
      bind.position.set(0, 0.04, 0.02);
      sk.add(bind);
      sk.userData.parts = [ski, bind];
      const boot = mk(g.boot, M.boot);
      boot.position.set(0, 0.155, 0.015);
      sk.add(boot);
      const cuff = mk(g.bootTop, M.bootAcc);
      cuff.position.set(0, 0.29, 0.03);
      sk.add(cuff);
      this.body.add(sk);
      this.skis.push(sk);
    }
    // Beine
    this.legs = [-1, 1].map((side) => {
      const thigh = mk(g.thigh, M.pants);
      const shin = mk(g.shin, M.pants);
      const knee = mk(g.knee, M.pants);
      this.body.add(thigh, shin, knee);
      return { side, thigh, shin, knee };
    });
    // Rumpf
    this.torso = new THREE.Group();
    this.torso.rotation.order = 'YXZ';
    this.body.add(this.torso);
    const hips = mk(g.hips, M.pants);
    hips.scale.set(0.17, 0.12, 0.13);
    this.torso.add(hips);
    const abd = mk(g.abdomen, M.jacket);
    abd.position.y = 0.17;
    abd.scale.set(1.12, 1, 0.82);
    this.torso.add(abd);
    const chest = mk(g.chest, M.jacket);
    chest.position.y = 0.34;
    chest.scale.set(1.2, 1, 0.84);
    this.torso.add(chest);
    const stripe = mk(g.stripe, M.accent);
    stripe.position.y = 0.36;
    stripe.scale.set(1.215, 0.42, 0.85);
    this.torso.add(stripe);
    const zip = mk(g.zip, M.jacketDark);
    zip.position.set(0, 0.3, -0.128);
    this.torso.add(zip);
    const collar = mk(g.collar, M.jacketDark);
    collar.position.y = 0.53;
    this.torso.add(collar);
    const pack = mk(g.pack, M.pack);
    pack.position.set(0, 0.33, 0.15);
    this.torso.add(pack);
    for (const side of [-1, 1]) {
      const sh = mk(g.shoulder, M.jacket);
      sh.position.set(side * 0.185, 0.44, 0.01);
      this.torso.add(sh);
    }
    // Kopf
    this.head = new THREE.Group();
    this.head.position.set(0, 0.56, -0.01);
    this.torso.add(this.head);
    const neck = mk(g.neck, M.jacketDark);
    neck.position.y = 0.02;
    this.head.add(neck);
    const head = mk(g.head, M.skin);
    head.position.y = 0.13;
    head.scale.set(0.95, 1.08, 1);
    this.head.add(head);
    const hel = mk(g.helmet, M.helmet);
    hel.position.set(0, 0.145, 0.008);
    hel.scale.set(1, 1.05, 1.1);
    this.head.add(hel);
    const strap = mk(g.strap, M.strap);
    strap.position.set(0, 0.165, 0.005);
    this.head.add(strap);
    const frame = mk(g.goggleFrame, M.frame);
    frame.position.set(0, 0.165, 0.004);
    this.head.add(frame);
    const gog = mk(g.goggle, M.goggle);
    gog.position.set(0, 0.165, 0.002);
    this.head.add(gog);
    // Arme + Stöcke
    this.arms = [-1, 1].map((side) => {
      const uarm = mk(g.uarm, M.jacket);
      const farm = mk(g.farm, M.jacket);
      const cuff = mk(g.cuff, M.jacketDark);
      const glove = mk(g.glove, M.glove);
      const pole = new THREE.Group();
      pole.add(mk(g.pole, M.pole), mk(g.grip, M.grip), mk(g.basket, M.grip));
      this.body.add(uarm, farm, cuff, glove, pole);
      return { side, uarm, farm, cuff, glove, pole };
    });

    this.p = { tuck: 0, lean: 0, plow: 0, air: 0, grab: 0, grabKind: 1, phase: 0, plantL: 0, plantR: 0 };
    this.ghost = ghost;
    this.M = M;
    this.cr = null;
    this.label = null;
    if (name) this.setName(name, jacket);
  }

  setName(name, color = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = '700 30px "Barlow Condensed", sans-serif';
    const w = Math.min(240, x.measureText(name).width + 28);
    x.fillStyle = 'rgba(8,14,28,0.72)';
    const rx = (256 - w) / 2;
    x.beginPath(); x.roundRect(rx, 10, w, 44, 12); x.fill();
    x.fillStyle = color; x.fillRect(rx + 10, 26, 6, 12);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, 128 + 6, 33);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false });
    const sp = new THREE.Sprite(m);
    sp.scale.set(0.16, 0.04, 1);
    sp.position.y = 2.25;
    sp.renderOrder = 10;
    this.root.add(sp);
    this.label = sp;
  }

  // ---------- Sturz: Überschlag, Ski und Stöcke fliegen weg, rutschen, aufstehen ----------
  _startCrash(st, course) {
    const r = Math.random;
    const reason = st.crashReason || '';
    let style;
    if (reason === 'landing' || reason === 'impact' || reason === 'fall' || reason === 'avalanche') style = r() < 0.75 ? 'tumble' : 'side';
    else if (reason === 'tree' || reason === 'rock' || reason === 'hut' || reason === 'wall') style = r() < 0.6 ? 'back' : 'side';
    else style = ['tumble', 'side', 'back'][Math.floor(r() * 3)];
    this.cr = { style, side: r() < 0.5 ? -1 : 1, debris: [], t: 0 };
    if (this.ghost || !this.root.parent || !course) return;
    this.root.updateMatrixWorld(true);
    const sp = Math.max(4, (st.speed || 0) * 2);
    const fx = Math.sin(st.heading) * sp, fz = -Math.cos(st.heading) * sp;
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    const throwIt = (obj, src) => {
      src.getWorldPosition(obj.position);
      src.getWorldQuaternion(q);
      e.setFromQuaternion(q, 'YXZ');
      obj.rotation.copy(e);
      this.root.parent.add(obj);
      this.cr.debris.push({
        obj, src, rest: false,
        vel: new THREE.Vector3(fx * (0.5 + r() * 0.5) + (r() - 0.5) * 5, 3.5 + r() * 4.5, fz * (0.5 + r() * 0.5) + (r() - 0.5) * 5),
        av: new THREE.Vector3((r() - 0.5) * 16, (r() - 0.5) * 12, (r() - 0.5) * 12),
      });
    };
    const g = geos();
    this.skis.forEach((sk, i) => {
      if (i === 1 && r() < 0.3) return; // manchmal bleibt ein Ski dran
      const m = new THREE.Mesh(g.ski, [this.M.skiSide, this.M.skiTop]);
      m.castShadow = true;
      const grp = new THREE.Group();
      grp.add(m);
      throwIt(grp, sk);
      for (const part of sk.userData.parts) part.visible = false;
    });
    this.arms.forEach((A) => {
      if (r() < 0.35) return;
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g.pole, this.M.pole), new THREE.Mesh(g.grip, this.M.grip), new THREE.Mesh(g.basket, this.M.grip));
      throwIt(grp, A.pole);
      A.pole.visible = false;
    });
  }

  _endCrash() {
    if (!this.cr) return;
    for (const d of this.cr.debris) {
      if (d.obj.parent) d.obj.parent.remove(d.obj);
      if (d.src.userData.parts) for (const part of d.src.userData.parts) part.visible = true;
      else d.src.visible = true;
    }
    this.cr = null;
  }

  _updateDebris(pr, dt, course) {
    const back = smoothstep(0.8, 0.97, pr);
    const tq = new THREE.Quaternion(), tp = new THREE.Vector3();
    for (const d of this.cr.debris) {
      const o = d.obj;
      if (back > 0) {
        d.src.getWorldPosition(tp);
        d.src.getWorldQuaternion(tq);
        o.position.lerp(tp, Math.min(1, dt * 10 * back + back * 0.1));
        o.quaternion.slerp(tq, Math.min(1, dt * 10 * back + back * 0.1));
        continue;
      }
      if (d.rest) continue;
      d.vel.y -= 9.81 * dt;
      o.position.addScaledVector(d.vel, dt);
      o.rotation.x += d.av.x * dt; o.rotation.y += d.av.y * dt; o.rotation.z += d.av.z * dt;
      const gy = course.heightAt(o.position.x, o.position.z) + 0.04;
      if (o.position.y < gy) {
        o.position.y = gy;
        if (d.vel.y < -2) {
          d.vel.y *= -0.32; d.vel.x *= 0.55; d.vel.z *= 0.55; d.av.multiplyScalar(0.45);
        } else {
          d.vel.y = 0;
          const f = Math.exp(-3.5 * dt);
          d.vel.x *= f; d.vel.z *= f;
          o.rotation.x *= 0.85; o.rotation.z *= 0.85; d.av.multiplyScalar(0.8);
          if (Math.hypot(d.vel.x, d.vel.z) < 0.3) d.rest = true;
        }
      }
    }
  }

  _crashPose(pr, dt) {
    const C = this.cr, s = C.side;
    C.t += dt;
    const T = C.t;
    const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    const up = smoothstep(0.78, 1, pr); // Aufstehen
    let rx = 0, ry = 0, rz = 0, y = 0.9;
    if (C.style === 'tumble') {
      const p1 = clamp(pr / 0.42, 0, 1);
      rx = p1 < 1 ? -Math.PI * 2.5 * ease(p1) : -Math.PI * 0.5;
      rz = Math.sin(p1 * 9) * 0.45 * (1 - p1);
      y = 0.9 + Math.sin(p1 * Math.PI) * 0.55 - ease(p1) * 0.6;
      rx = lerp(rx, 0, up);
    } else if (C.style === 'side') {
      const p1 = clamp(pr / 0.25, 0, 1);
      rz = s * Math.PI * 0.48 * ease(p1);
      ry = s * ease(clamp(pr / 0.7, 0, 1)) * 1.4;
      y = 0.9 - ease(p1) * 0.62;
      rz = lerp(rz, 0, up); ry = lerp(ry, 0, up * 0.6);
    } else {
      const p1 = clamp(pr / 0.3, 0, 1);
      rx = Math.PI * 0.46 * ease(p1);
      rz = Math.sin(T * 7) * 0.12 * (1 - p1);
      y = 0.9 - ease(p1) * 0.58;
      rx = lerp(rx, 0, up);
    }
    y = lerp(y, 0.9, up);
    // leichtes Wackeln beim Rutschen
    if (pr > 0.3 && pr < 0.78) { rz += Math.sin(T * 5) * 0.04; rx += Math.sin(T * 4.3) * 0.03; }
    this.tilt.rotation.set(rx, ry, rz);
    this.tilt.position.y = y;
    // Gliedmaßen: in der Luft rudern, liegend ausgestreckt, beim Aufstehen abstützen
    const flail = 1 - smoothstep(0.3, 0.45, pr);
    for (const sk of this.skis) {
      const side = sk === this.skis[0] ? -1 : 1;
      sk.position.set(side * (0.16 + 0.12 * Math.sin(T * 11 + side) * flail), 0.1 + (0.18 + 0.15 * Math.sin(T * 13 + side * 2)) * flail * (1 - up), 0.12 * Math.sin(T * 9 + side) * flail);
      sk.rotation.set(Math.sin(T * 10 + side) * 0.5 * flail, side * 0.25 * (1 - up), Math.sin(T * 12) * 0.4 * flail);
      sk.updateMatrix();
    }
    return { flail, up, T };
  }

  update(st, dt, course) {
    if (st.crash > 0 && !this.cr) this._startCrash(st, course);
    else if (st.crash <= 0 && this.cr) this._endCrash();
    const P = this.p;
    this.root.position.set(st.x, st.y, st.z);
    this.align.rotation.set(st.groundPitch || 0, -st.heading, 0);
    const k = Math.min(1, dt * 10);
    const grounded = st.grounded || !!st.grind;
    P.air = lerp(P.air, grounded ? 0 : 1, Math.min(1, dt * 6));
    P.tuck = lerp(P.tuck, st.tuckIn && grounded ? 1 : 0, k);
    const leanT = grounded && !st.grind && !st.butter ? clamp(-st.steerIn * Math.min(1, (st.speed || 0) / 16), -1, 1) : 0;
    P.lean = lerp(P.lean, leanT, Math.min(1, dt * 5));
    P.plow = lerp(P.plow, st.brakeIn && grounded ? 1 : 0, Math.min(1, dt * 8));
    if (st.grab) P.grabKind = st.grab;
    P.grab = lerp(P.grab, st.grab ? 1 : 0, Math.min(1, dt * 12));
    const sp = st.speed || 0;
    if (grounded && P.tuck < 0.5 && sp > 3) P.phase += dt * (1.6 + Math.abs(P.lean) * 2.5);
    const plantOn = grounded && P.tuck < 0.5 && sp > 3 && sp < 24;
    P.plantL = lerp(P.plantL, plantOn ? Math.max(0, Math.sin(P.phase * 2.2)) : 0, Math.min(1, dt * 8));
    P.plantR = lerp(P.plantR, plantOn ? Math.max(0, Math.sin(P.phase * 2.2 + Math.PI)) : 0, Math.min(1, dt * 8));

    const lean = P.lean, t = P.tuck, a = P.air, gr = P.grab;
    // Neigung/Rotationen am Schwerpunkt
    let cp = null;
    if (this.cr) {
      const pr = 1 - st.crash / (st.crashDur || 1.8);
      cp = this._crashPose(pr, dt);
      if (this.cr.debris.length && course) this._updateDebris(pr, dt, course);
    } else {
      this.tilt.rotation.set(st.pitch || 0, st.spin || 0, lean * 0.42);
      this.tilt.position.y = 0.9;
      // Ski: Pflug, Aufkanten, im Sprung anziehen
      const skiLift = a * 0.08 + gr * 0.3;
      for (const sk of this.skis) {
        const side = sk === this.skis[0] ? -1 : 1;
        sk.position.set(side * (0.11 + P.plow * 0.1), skiLift, 0);
        sk.rotation.set(gr * (P.grabKind === 2 ? -0.25 : 0.25), side * P.plow * 0.3, lean * 0.55 * (1 - a));
        sk.updateMatrix();
      }
    }

    // Hüfte und Rumpf
    const crouch = cp ? 0.75 - cp.up * 0.3 : clamp(0.16 + t * 0.84 + a * 0.25 + gr * 0.45, 0, 1.4);
    const hipH = 0.94 - crouch * 0.33;
    const hipZ = 0.03 + crouch * 0.1;
    const hipX = -lean * 0.1;
    const pitch = 0.3 + crouch * 0.68 + P.plow * 0.1;
    this.torso.position.set(hipX, hipH, hipZ);
    this.torso.rotation.set(-pitch, lean * 0.18, -lean * 0.26);
    this.torso.updateMatrix();
    this.head.rotation.set(pitch * 0.78, lean * 0.3, lean * 0.2);

    // Beine (IK)
    for (const L of this.legs) {
      const sk = this.skis[L.side < 0 ? 0 : 1];
      vHip.set(hipX + L.side * 0.095, hipH - 0.03, hipZ);
      vAnk.set(0, 0.2, 0.02).applyMatrix4(sk.matrix);
      vPole.set(L.side * 0.12 - lean * 0.45, 0, -1);
      solve2(vHip, vAnk, THIGH, SHIN, vPole, vKnee);
      place(L.thigh, vHip, vKnee);
      place(L.shin, vKnee, vAnk);
      L.knee.position.copy(vKnee);
    }

    // Arme (IK) + Stöcke
    for (const A of this.arms) {
      const s = A.side;
      const plant = s < 0 ? P.plantL : P.plantR;
      vSh.set(s * 0.185, 0.44, 0.01).applyMatrix4(this.torso.matrix);
      if (cp) {
        const fl = cp.flail;
        vHand.set(
          s * (0.42 + 0.08 * Math.sin(cp.T * 14 + s) * fl) * (1 - cp.up * 0.4),
          0.42 * fl + 0.15 * (1 - fl) + 0.18 * Math.sin(cp.T * 12 + s * 1.7) * fl - cp.up * 0.35,
          -0.12 - cp.up * 0.15,
        ).applyMatrix4(this.torso.matrix);
      } else vHand.set(
        s * lerp(0.23, 0.11, t),
        lerp(0.15, 0.36, t) - plant * 0.07,
        lerp(-0.34, -0.3, t) - plant * 0.09,
      ).applyMatrix4(this.torso.matrix);
      if (gr > 0.01 && s > 0) {
        const sk = this.skis[1];
        tA.set(0.03, 0.12, P.grabKind === 2 ? 0.5 : -0.32).applyMatrix4(sk.matrix);
        vHand.lerp(tA, gr);
      }
      vPole.set(s * 0.7, -0.6, 0.35);
      solve2(vSh, vHand, UARM, FARM, vPole, vElb);
      place(A.uarm, vSh, vElb);
      place(A.farm, vElb, vHand);
      A.cuff.position.lerpVectors(vElb, vHand, 0.82);
      A.cuff.quaternion.copy(A.farm.quaternion);
      A.glove.position.copy(vHand);
      A.glove.quaternion.copy(A.farm.quaternion);
      // Stockrichtung
      vDir.set(s * 0.1, -0.88, 0.47);
      tB.set(s * 0.06, -0.97, -0.22);
      vDir.lerp(tB, plant);
      tB.set(s * 0.12, -0.18, 1);
      vDir.lerp(tB, Math.max(t, a * 0.6)).normalize();
      A.pole.position.copy(vHand);
      A.pole.quaternion.setFromUnitVectors(DOWN, vDir);
    }
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this._endCrash();
    for (const m of this.mats) m.dispose();
    if (this.label) { this.label.material.map.dispose(); this.label.material.dispose(); }
  }
}
