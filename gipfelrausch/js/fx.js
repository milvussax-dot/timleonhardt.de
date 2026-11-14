// Effekte: Schneespray, Landungs-Wolken, Lawine
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let PUFF = null;

export class FX {
  constructor(scene, course) {
    this.scene = scene;
    this.course = course;
    if (!PUFF) PUFF = puffTexture();
    const N = (this.N = 900);
    this.pos = new Float32Array(N * 3).fill(-1e5);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ map: PUFF, color: '#ffffff', size: 0.32, transparent: true, depthWrite: false, opacity: 0.7 });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
    this.rng = mulberry32(3);
    this.av = null;
  }

  emit(x, y, z, vx, vy, vz, spread, life) {
    const i = this.next;
    this.next = (this.next + 1) % this.N;
    const r = this.rng;
    this.pos[i * 3] = x + (r() - 0.5) * 0.3;
    this.pos[i * 3 + 1] = y + 0.05;
    this.pos[i * 3 + 2] = z + (r() - 0.5) * 0.3;
    this.vel[i * 3] = vx + (r() - 0.5) * spread;
    this.vel[i * 3 + 1] = vy + r() * spread * 0.8;
    this.vel[i * 3 + 2] = vz + (r() - 0.5) * spread;
    this.life[i] = life * (0.6 + r() * 0.6);
  }

  // Spray beim Carven/Bremsen
  spray(st, dt) {
    if (st.crash > 0) {
      if ((st.speed || 0) > 1.2 && this.rng() < 0.7) {
        const sx = Math.sin(st.heading), cz = -Math.cos(st.heading);
        this.emit(st.x, st.y + 0.1, st.z, sx * st.speed * 0.4, 1.2, cz * st.speed * 0.4, 2.5, 0.7);
      }
      return;
    }
    if (!st.grounded || st.grind) return;
    const carve = Math.abs(st.steerIn) * Math.min(1, st.speed / 20) + st.brakeIn * Math.min(1, st.speed / 12);
    if (carve < 0.15 || st.speed < 4) return;
    const n = Math.min(6, Math.floor(carve * 60 * dt * 3) + (this.rng() < carve ? 1 : 0));
    const sx = Math.sin(st.heading), cz = -Math.cos(st.heading);
    const side = st.steerIn > 0 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      this.emit(st.x - cz * side * 0.3, st.y, st.z + sx * side * 0.3,
        sx * st.speed * 0.35 - cz * side * 3, 1.5, cz * st.speed * 0.35 + sx * side * 3, 2.2, 0.55);
    }
  }

  burst(x, y, z, n, power = 4) {
    for (let i = 0; i < n; i++) this.emit(x, y, z, 0, power * 0.5, 0, power, 0.9);
  }

  update(dt) {
    const p = this.pos, v = this.vel, l = this.life;
    for (let i = 0; i < this.N; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt;
      if (l[i] <= 0) { p[i * 3 + 1] = -1e5; continue; }
      v[i * 3 + 1] -= 6 * dt;
      v[i * 3] *= 1 - 1.5 * dt;
      v[i * 3 + 2] *= 1 - 1.5 * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  // ---------- Lawine ----------
  enableAvalanche() {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#c9d6ea', emissiveIntensity: 0.45 });
    const matD = new THREE.MeshLambertMaterial({ color: '#eef3fa', emissive: '#aebdd4', emissiveIntensity: 0.35 });
    const r = mulberry32(11);
    const puffs = [];
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(geo, i % 3 ? mat : matD);
      const p = { m, d: r() * 2 - 1, back: r() * 30, h: r() * 6, size: 3 + r() * 7, f: 0.5 + r() * 1.5, ph: r() * 6 };
      m.castShadow = false;
      g.add(m);
      puffs.push(p);
    }
    const cloudMat = new THREE.SpriteMaterial({ map: PUFF, color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 44; i++) {
      const sp = new THREE.Sprite(cloudMat);
      g.add(sp);
      puffs.push({ m: sp, sprite: true, d: r() * 2 - 1, back: r() * 20 - 4, h: 6 + r() * 12, size: 12 + r() * 16, f: 0.3 + r(), ph: r() * 6 });
    }
    this.scene.add(g);
    this.av = { g, puffs, geo, mats: [mat, matD, cloudMat] };
  }

  updateAvalanche(avS, t) {
    if (!this.av) return;
    const c = this.course;
    for (const p of this.av.puffs) {
      const s = avS - p.back;
      const cx = c.cxAt(s), hw = c.wAt(s) / 2 + 14;
      const x = cx + p.d * hw;
      const y = c.heightAt(x, -s) + p.h + Math.sin(t * p.f + p.ph) * 1.2;
      p.m.position.set(x, y, -s);
      const k = p.size * (1 + Math.sin(t * p.f * 2 + p.ph) * 0.12);
      p.m.scale.set(k, k * (p.sprite ? 1 : 0.8), k);
      if (!p.sprite) p.m.rotation.set(t * p.f * 0.5, t * 0.3 + p.ph, 0);
    }
    // Pulverschnee vor der Front
    for (let i = 0; i < 4; i++) {
      const d = this.rng() * 2 - 1;
      const cx = c.cxAt(avS), hw = c.wAt(avS) / 2 + 10;
      const x = cx + d * hw;
      this.emit(x, c.heightAt(x, -avS) + 1, -avS, (this.rng() - 0.5) * 4, 4, -6 - this.rng() * 6, 5, 1.2);
    }
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
    if (this.av) {
      this.scene.remove(this.av.g);
      this.av.geo.dispose();
      for (const m of this.av.mats) m.dispose();
    }
  }
}
