// 3D-Welt: Gelände in Abschnitten, Bäume, Felsen, Kicker, Rails, Tore, Start/Ziel
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK } from './course.js';
import { mulberry32, lerp, smoothstep } from './rng.js';

const C = (hex) => new THREE.Color(hex);
const UP = new THREE.Vector3(0, 1, 0);

const COL = {
  piste: C('#f6f9fd'),
  off: C('#dfe7f3'),
  offFar: C('#cfd9e8'),
  edge: C('#b9c8de'),
  kick: C('#dce9ff'),
  lip: C('#2f6bff'),
  rock: C('#8892a3'),
  finish: C('#e0312f'),
  start: C('#2563eb'),
  ice: C('#cfe9f7'),
  iceCrack: C('#8fc2dd'),
  deep: C('#4f86b0'),
  water: C('#9fd3ec'),
  rockA: C('#57524d'),
  rockB: C('#756e66'),
};
const TOWER_SP = 70, TOWER_OFF = 40, MAX_CHAIRS = 90;
const vA = new THREE.Vector3(), vB = new THREE.Vector3();

let S = null;
function shared() {
  if (S) return S;
  S = {};
  S.snowTex = makeSnowTexture();
  S.snowNormal = makeSnowNormal();
  S.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: S.snowTex, normalMap: S.snowNormal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.9, metalness: 0 });
  S.hutGeo = makeHutGeo();
  S.hutMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  S.windowGeo = makeWindowGeo();
  S.windowMat = new THREE.MeshStandardMaterial({ color: '#3a2a18', emissive: '#ffb45a', emissiveIntensity: 0.25, roughness: 0.4 });
  S.towerGeo = makeTowerGeo();
  S.towerMat = new THREE.MeshStandardMaterial({ color: '#8b95a3', roughness: 0.5, metalness: 0.6 });
  S.chairGeo = makeChairGeo();
  S.chairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
  S.cableMat = new THREE.LineBasicMaterial({ color: '#1b1e24' });
  S.treeGeo = makeTreeGeo();
  S.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  S.rockGeo = makeRockGeo();
  S.rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  S.poleGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6).translate(0, 0.85, 0);
  S.poleMat = new THREE.MeshLambertMaterial({ color: '#ff6a1a' });
  S.postGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
  S.postMat = new THREE.MeshLambertMaterial({ color: '#2d3442' });
  S.woodMat = new THREE.MeshLambertMaterial({ color: '#5b3b26' });
  S.gatePoleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6).translate(0, 0.95, 0);
  S.gatePoleMat = new THREE.MeshLambertMaterial({ color: '#f4f4f4' });
  S.flagGeo = new THREE.PlaneGeometry(0.85, 0.65);
  S.red = new THREE.MeshLambertMaterial({ color: '#e8322f', side: THREE.DoubleSide });
  S.blue = new THREE.MeshLambertMaterial({ color: '#2563eb', side: THREE.DoubleSide });
  S.green = new THREE.MeshLambertMaterial({ color: '#2fd47a', side: THREE.DoubleSide, emissive: '#0d6b36', emissiveIntensity: 0.6 });
  S.grey = new THREE.MeshLambertMaterial({ color: '#8a94a6', side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
  S.metal = new THREE.MeshLambertMaterial({ color: '#c3ccd8', emissive: '#30384a' });
  S.boxMat = new THREE.MeshLambertMaterial({ color: '#2b6cff' });
  S.coneGeo = new THREE.ConeGeometry(0.22, 0.6, 8).translate(0, 0.3, 0);
  S.coneMat = new THREE.MeshLambertMaterial({ color: '#ff6a1a' });
  S.glowTex = makeGlowTexture();
  S.torchMat = new THREE.SpriteMaterial({ map: S.glowTex, color: '#ffb35c', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  S.crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
  S.crystalMat = new THREE.MeshLambertMaterial({ color: '#7ff3ff', emissive: '#1aa8ff', emissiveIntensity: 1.3 });
  S.crystalGlow = new THREE.SpriteMaterial({ map: S.glowTex, color: '#6fe6ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  S.signTex = makeSignTexture();
  S.signMat = new THREE.MeshLambertMaterial({ map: S.signTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  S.signGeo = new THREE.PlaneGeometry(1.3, 1.3);
  S.stoneMat = new THREE.MeshStandardMaterial({ color: '#8a8f99', roughness: 0.9 });
  S.snowTopMat = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.9 });
  S.plankMat = new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.85 });
  S.unitBox = new THREE.BoxGeometry(1, 1, 1);
  S.fencePost = new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(0, 0.55, 0);
  S.fenceRail = new THREE.BoxGeometry(0.06, 0.09, 1).translate(0, 0, 0);
  S.boardGeo = new THREE.PlaneGeometry(3.2, 1.0);
  S.bannerMats = {};
  return S;
}

function makeSnowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const img = x.createImageData(256, 256);
  const d = img.data;
  const rng = mulberry32(42);
  for (let i = 0; i < d.length; i += 4) {
    const n = 238 + rng() * 17;
    d[i] = n - 3; d[i + 1] = n - 1; d[i + 2] = 255; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 256; i += 4) {
    x.fillStyle = 'rgba(150,172,212,0.07)';
    x.fillRect(i, 0, 2, 256);
  }
  for (let i = 0; i < 260; i++) {
    x.fillStyle = 'rgba(255,255,255,0.95)';
    x.fillRect(rng() * 256, rng() * 256, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeSnowNormal() {
  const N = 256;
  const h = new Float32Array(N * N);
  const rng = mulberry32(77);
  // weiche Buckel + feine Körnung
  const blobs = [];
  for (let i = 0; i < 70; i++) blobs.push([rng() * N, rng() * N, 6 + rng() * 22, rng() * 0.8 + 0.2]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [bx, by, r, a] of blobs) {
      let dx = Math.abs(x - bx), dy = Math.abs(y - by);
      dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
      const d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 < 1) v += a * (1 - d2) * (1 - d2);
    }
    h[y * N + x] = v + rng() * 0.08;
  }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x2 = c.getContext('2d');
  const img = x2.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hl = h[y * N + ((x - 1 + N) % N)], hr = h[y * N + ((x + 1) % N)];
    const hu = h[((y - 1 + N) % N) * N + x], hd = h[((y + 1) % N) * N + x];
    let nx = (hl - hr) * 2.2, ny = (hu - hd) * 2.2, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function boardTexture(name, hint) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#6b4428';
  x.fillRect(0, 0, 512, 160);
  for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#5d3a22' : '#734a2c'; x.fillRect(0, i * 32, 512, 30); }
  x.strokeStyle = '#3d2614'; x.lineWidth = 8; x.strokeRect(4, 4, 504, 152);
  x.fillStyle = '#fff4e0';
  x.font = 'italic 800 64px "Barlow Condensed", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name.toUpperCase(), 256, hint ? 62 : 82);
  if (hint) { x.font = '600 26px Inter, sans-serif'; x.fillStyle = '#ffd9a8'; x.fillText(hint.length > 38 ? hint.slice(0, 37) + '…' : hint, 256, 120); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function boxPainted(w, h, d, color, tx = 0, ty = 0, tz = 0) {
  const g = new THREE.BoxGeometry(w, h, d).translate(tx, ty, tz);
  return paint(g.toNonIndexed(), (x, y, z, c) => c.set(color));
}

function makeHutGeo() {
  const parts = [];
  parts.push(boxPainted(7.4, 2.2, 5.4, '#7f8590', 0, -0.5, 0)); // Steinsockel
  // Holzwände mit Balkenstreifen
  const wall = new THREE.BoxGeometry(7, 3.0, 5, 1, 8, 1).translate(0, 2.1, 0).toNonIndexed();
  paint(wall, (x, y, z, c) => c.set(Math.floor((y - 0.6) / 0.375) % 2 ? '#6b4428' : '#5a371f'));
  parts.push(wall);
  // Dach (Satteldach) + Schnee
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-4.4, 0); roofShape.lineTo(4.4, 0); roofShape.lineTo(0, 2.7); roofShape.lineTo(-4.4, 0);
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 6.2, bevelEnabled: false }).translate(0, 3.55, -3.1).toNonIndexed();
  paint(roof, (x, y, z, c) => c.set('#4a2e1a'));
  parts.push(roof);
  const snowShape = new THREE.Shape();
  snowShape.moveTo(-4.6, -0.05); snowShape.lineTo(4.6, -0.05); snowShape.lineTo(0, 2.95); snowShape.lineTo(-4.6, -0.05);
  const snow = new THREE.ExtrudeGeometry(snowShape, { depth: 6.0, bevelEnabled: false }).translate(0, 3.75, -3.0).toNonIndexed();
  paint(snow, (x, y, z, c) => c.set('#f4f8ff'));
  parts.push(snow);
  parts.push(boxPainted(0.7, 2.2, 0.7, '#6d6f76', 2.2, 6.0, 1.2)); // Kamin
  parts.push(boxPainted(0.9, 0.2, 0.9, '#f4f8ff', 2.2, 7.15, 1.2));
  parts.push(boxPainted(1.3, 2.1, 0.12, '#3a2414', 0, 1.65, -2.56)); // Tür
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  g.computeVertexNormals();
  return g;
}

function makeWindowGeo() {
  const parts = [];
  for (const x of [-2.4, 2.4]) parts.push(new THREE.PlaneGeometry(1.1, 0.9).rotateY(Math.PI).translate(x, 2.4, -2.53));
  for (const z of [-1.2, 1.2]) {
    parts.push(new THREE.PlaneGeometry(1.0, 0.9).rotateY(Math.PI / 2).translate(3.53, 2.4, z));
    parts.push(new THREE.PlaneGeometry(1.0, 0.9).rotateY(-Math.PI / 2).translate(-3.53, 2.4, z));
  }
  return mergeGeometries(parts);
}

function makeTowerGeo() {
  const parts = [
    new THREE.CylinderGeometry(0.22, 0.36, 11, 10).translate(0, 5.5, 0),
    new THREE.BoxGeometry(5.0, 0.32, 0.32).translate(0, 11, 0),
    new THREE.BoxGeometry(0.5, 0.5, 1.4).translate(-2.3, 10.75, 0),
    new THREE.BoxGeometry(0.5, 0.5, 1.4).translate(2.3, 10.75, 0),
    new THREE.CylinderGeometry(0.6, 0.6, 0.6, 10).translate(0, 0.3, 0),
  ];
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

function makeChairGeo() {
  const parts = [
    boxPainted(0.06, 1.8, 0.06, '#2b2f36', 0, -0.9, 0),
    boxPainted(1.5, 0.06, 0.06, '#2b2f36', 0, -1.8, 0),
    boxPainted(1.5, 0.1, 0.5, '#1f6fd1', 0, -2.15, 0.05),
    boxPainted(1.5, 0.55, 0.08, '#1f6fd1', 0, -1.85, 0.3),
    boxPainted(0.05, 0.5, 0.05, '#2b2f36', -0.72, -1.95, 0.1),
    boxPainted(0.05, 0.5, 0.05, '#2b2f36', 0.72, -1.95, 0.1),
    boxPainted(1.3, 0.04, 0.3, '#2b2f36', 0, -2.55, -0.25),
  ];
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  g.computeVertexNormals();
  return g;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSignTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  x.rotate(Math.PI / 4);
  x.fillStyle = '#111';
  x.fillRect(-44, -44, 88, 88);
  x.fillStyle = '#ffd21f';
  x.fillRect(-38, -38, 76, 76);
  x.rotate(-Math.PI / 4);
  x.fillStyle = '#111';
  x.font = '900 64px "Barlow Condensed", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('!', 0, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerMat(text, bg, fg) {
  const key = text + bg + fg;
  if (S.bannerMats[key]) return S.bannerMats[key];
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 1024, 128);
  if (text === 'ZIEL') {
    for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) {
      if ((i + j) % 2) continue;
      x.fillStyle = 'rgba(255,255,255,0.16)';
      x.fillRect(i * 16, j * 16, 16, 16);
      x.fillRect(i * 16, 96 + j * 16, 16, 16);
    }
  }
  x.fillStyle = fg;
  x.font = 'italic 800 84px "Barlow Condensed", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(`${text}  ·  GIPFELRAUSCH  ·  ${text}`, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const front = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25 });
  const side = new THREE.MeshLambertMaterial({ color: bg });
  return (S.bannerMats[key] = [side, side, side, side, front, front]);
}

function paint(geo, fn) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function makeTreeGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.13, 0.2, 1.5, 6).translate(0, 0.75, 0);
  paint(trunk, (x, y, z, c) => c.set('#4a3020'));
  parts.push(trunk);
  const dark = C('#173d2c'), mid = C('#2b5e43'), snow = C('#eef4ff');
  const tiers = [[1.75, 2.5, 1.0], [1.35, 2.2, 2.2], [0.95, 1.9, 3.3], [0.55, 1.4, 4.3]];
  for (const [r, h, y] of tiers) {
    const g = new THREE.ConeGeometry(r, h, 12, 3).translate(0, y + h / 2, 0);
    // gezackte, hängende Zweigspitzen
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const px = pa.getX(i), py = pa.getY(i), pz = pa.getZ(i);
      const t = (py - y) / h;
      const ang = Math.atan2(pz, px);
      const jag = 1 + 0.22 * Math.sin(ang * 12) * (1 - t);
      const droop = t < 0.05 ? -0.25 * (0.5 + 0.5 * Math.sin(ang * 12)) : 0;
      pa.setXYZ(i, px * jag, py + droop, pz * jag);
    }
    g.computeVertexNormals();
    paint(g, (px, py, pz, c) => {
      const t = (py - y) / h;
      if (t > 0.9) c.copy(snow);
      else if (t > 0.4) c.copy(mid).lerp(snow, (t - 0.4) * 0.9);
      else c.copy(dark).lerp(mid, t / 0.4);
    });
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  return geo;
}

function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function makeRockGeo() {
  // kantiger Felsblock: dunkler Stein, Schnee nur auf flachen Oberseiten
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 0.7 + hash3(x, y, z) * 0.55;
    p.setXYZ(i, x * f * 1.1, y * f * 0.78, z * f);
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  const rockA = C('#4b4743'), rockB = C('#6a645d'), rockC = C('#3e3b38'), snow = C('#eef3fb'), c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(d.clone().sub(a)).normalize();
    if (n.dot(a.clone().add(b).add(d)) < 0) n.negate();
    const cy = (a.y + b.y + d.y) / 3;
    const hsh = hash3(a.x + b.x, a.y + d.y, a.z + d.z);
    if (n.y > 0.78 && cy > 0.15) c.copy(snow);
    else c.copy(hsh < 0.33 ? rockA : hsh < 0.66 ? rockB : rockC).lerp(snow, n.y > 0.55 && cy > 0.3 ? 0.35 : 0);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function buildColumns(course, quality) {
  const wide = course.def.width * (course.wMul || 1);
  const maxHW = Math.max(wide * 1.05, wide * 0.5 * 1.4 * 1.14) + 8;
  let step = wide > 45 ? 1.5 : 1.25;
  if (quality === 'niedrig') step = 2; else if (quality === 'mittel' && wide > 45) step = 1.75;
  const n = Math.ceil(maxHW / step);
  const D = [];
  for (let i = -n; i <= n; i++) D.push(i * step);
  const edge = n * step;
  for (const o of [4, 9, 15, 22, 30, 40, 52, 66, 82, 100, 125, 160]) {
    D.push(edge + o);
    D.unshift(-(edge + o));
  }
  return D;
}

export class World {
  constructor(scene, course, opts = {}) {
    this.scene = scene;
    this.course = course;
    this.opts = opts;
    this.sh = shared();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = new Map();
    this.D = buildColumns(course, opts.quality);
    this.viewAhead = opts.quality === 'niedrig' ? 480 : 700;
    this.shadows = opts.quality !== 'niedrig';
    this.night = !!opts.night;
    this.pickupObjs = [];
    this.gateFlags = new Map();
    this.maxK = course.endless ? Infinity : Math.floor((course.length + 260) / CHUNK);
    this.towerCache = new Map();
    S.windowMat.emissiveIntensity = this.night ? 2.6 : 0.3;
    this.chairs = new THREE.InstancedMesh(S.chairGeo, S.chairMat, MAX_CHAIRS);
    this.chairs.frustumCulled = false;
    this.chairs.castShadow = this.shadows;
    this.chairs.count = 0;
    this.group.add(this.chairs);
  }

  towerPos(i, out) {
    let p = this.towerCache.get(i);
    if (!p) {
      const c = this.course;
      const s = i * TOWER_SP - TOWER_OFF;
      const x = c.cxAt(s) + c.liftSide * (c.wAt(s) / 2 + 24);
      p = new THREE.Vector3(x, c.heightAt(x, -s), -s);
      this.towerCache.set(i, p);
      if (this.towerCache.size > 400) this.towerCache.delete(this.towerCache.keys().next().value);
    }
    return out.copy(p);
  }

  updateChairs(s, t) {
    const c = this.course, sp = 18, speed = 3.2;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    let n = 0;
    const s0 = s - 120, s1 = s + 520;
    for (const dir of [-1, 1]) {
      const off = (((dir * t * speed) % sp) + sp) % sp;
      for (let cs = Math.floor(s0 / sp) * sp + off; cs < s1 && n < MAX_CHAIRS; cs += sp) {
        if (cs < -TOWER_OFF + 2 || (!c.endless && cs > c.length + 55)) continue;
        const fi = (cs + TOWER_OFF) / TOWER_SP;
        const i = Math.floor(fi), f = fi - i;
        const A = this.towerPos(i, vA), B = this.towerPos(i + 1, vB);
        const hd = Math.atan2(B.x - A.x, -(B.z - A.z));
        const lat = dir < 0 ? -2.3 : 2.3;
        pos.set(lerp(A.x, B.x, f) + Math.cos(hd) * lat, lerp(A.y, B.y, f) + 10.75 - 0.9 * 4 * f * (1 - f), lerp(A.z, B.z, f) + Math.sin(hd) * lat);
        q.setFromAxisAngle(UP, -hd + (dir < 0 ? Math.PI : 0));
        m.compose(pos, q, one);
        this.chairs.setMatrixAt(n++, m);
      }
    }
    this.chairs.count = n;
    this.chairs.instanceMatrix.needsUpdate = true;
  }

  prebuild(s) {
    for (let k = Math.floor((s - 100) / CHUNK); k <= Math.floor((s + 450) / CHUNK); k++) this._ensureChunk(k);
  }

  update(s, t) {
    const k0 = Math.floor((s - 140) / CHUNK), k1 = Math.floor((s + this.viewAhead) / CHUNK);
    let built = 0;
    for (let k = k0; k <= k1 && built < 1; k++) if (this._ensureChunk(k)) built++;
    for (const [k, ch] of this.chunks) {
      if (k < k0 - 1 || k > k1 + 2) { this._disposeChunk(ch); this.chunks.delete(k); }
    }
    this.updateChairs(s, t);
    for (const p of this.pickupObjs) {
      if (!p.obj.parent || !p.obj.visible) continue;
      p.mesh.rotation.y = t * 2;
      p.mesh.position.y = 1.2 + Math.sin(t * 3 + p.phase) * 0.2;
    }
  }

  markGate(g, ok) {
    g.state = ok ? 1 : 2;
    const flags = this.gateFlags.get(g.idx);
    if (flags) for (const f of flags) f.material = ok ? S.green : S.grey;
  }

  hidePickup(p) {
    for (const o of this.pickupObjs) if (o.p === p) o.obj.visible = false;
  }

  _ensureChunk(k) {
    if (k < -1 || k > this.maxK || this.chunks.has(k)) return false;
    this.chunks.set(k, this._buildChunk(k));
    return true;
  }

  _disposeChunk(ch) {
    this.group.remove(ch.group);
    for (const d of ch.disposables) d.dispose();
    this.pickupObjs = this.pickupObjs.filter((p) => p.chunk !== ch);
    for (const idx of ch.gates) this.gateFlags.delete(idx);
  }

  _buildChunk(k) {
    const c = this.course, Sh = this.sh;
    const s0 = k * CHUNK, s1 = s0 + CHUNK;
    c.ensure(s1 + 60);
    const g = new THREE.Group();
    const ch = { group: g, disposables: [], gates: [] };
    const L = c.length;

    // --- Gelände ---
    const D = this.D, cols = D.length, rows = CHUNK + 1;
    const n = rows * cols;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
    const tmp = new THREE.Color();
    const feats = c.featuresIn(s0 - 15, s1 + 15);
    const kickers = feats.filter((f) => f.type === 'kicker');
    const drops = feats.filter((f) => f.type === 'drop');
    const gapsHere = feats.filter((f) => f.type === 'gap');
    const islands = feats.filter((f) => f.type === 'island' && f.c != null);
    const ramps = feats.filter((f) => f.type === 'ramp');
    const gr = [0, 0];
    let vi = 0;
    for (let r = 0; r < rows; r++) {
      const s = s0 + r;
      const cx = c.cxAt(s), hw = c.wAt(s) / 2;
      for (let j = 0; j < cols; j++) {
        const d = D[j];
        const x = cx + d;
        const y = c.heightAt(x, -s);
        pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = -s;
        uv[vi * 2] = x * 0.25; uv[vi * 2 + 1] = s * 0.25;
        c.gradient(x, -s, gr);
        const il = 1 / Math.sqrt(gr[0] * gr[0] + 1 + gr[1] * gr[1]);
        nor[vi * 3] = -gr[0] * il; nor[vi * 3 + 1] = il; nor[vi * 3 + 2] = -gr[1] * il;
        const ad = Math.abs(d);
        if (ad <= hw) tmp.copy(COL.piste);
        else {
          const e = ad - hw;
          tmp.copy(COL.piste).lerp(COL.off, Math.min(1, e / 3));
          if (e > 25) tmp.lerp(COL.offFar, Math.min(1, (e - 25) / 40));
        }
        if (Math.abs(ad - hw) < 0.7) tmp.lerp(COL.edge, 0.35);
        // Inseln zwischen den Wegen: unpräparierter Schnee mit Kante
        for (const f of islands) {
          if (s < f.s1 + 4 || s > f.s2 - 4) continue;
          const di = Math.abs(d - f.c);
          if (di < f.half + 0.6) tmp.lerp(COL.off, di < f.half - 1.2 ? 0.75 : 0.4);
          if (Math.abs(di - f.half) < 0.6) tmp.lerp(COL.edge, 0.4);
        }
        if (ad > hw + 2) {
          const steep = Math.hypot(gr[0], gr[1]);
          const rn = c.n2.at(x * 0.07 + 11, s * 0.07);
          const rock = smoothstep(0.5, 0.85, steep + rn * 0.25);
          if (rock > 0) tmp.lerp(rn > 0.05 ? COL.rockA : COL.rockB, rock * 0.9);
        }
        for (const f of kickers) {
          const t = f.s - s;
          if (t > -0.5 && t < f.len && Math.abs(d - f.d) < f.w * 0.5) {
            if (t < 0.9) tmp.copy(COL.lip); else tmp.lerp(COL.kick, 0.6);
          }
        }
        for (const f of drops) {
          if (s < f.s - 0.5 || s > f.s + (f.w || 2) + 0.5) continue;
          if (ramps.some((rp) => rp.s === f.s && Math.abs(d - rp.c) < rp.half - 1)) continue;
          tmp.lerp(COL.rockA, ad > hw ? 0.85 : f.small ? 0.25 : 0.4);
        }
        const ice = c.iceAt(s);
        if (ice > 0.02 && ad < hw + 6) {
          const cr = Math.abs(c.n2.at(x * 0.18 + 3, s * 0.18));
          tmp.lerp(cr < 0.05 ? COL.iceCrack : COL.ice, ice * (1 - smoothstep(hw, hw + 6, ad)));
        }
        if (gapsHere.length) {
          const below = c.hAt(s) - y;
          if (below > 0.5) {
            const g0 = gapsHere[0];
            tmp.lerp(g0.kind === 'creek' ? COL.water : COL.deep, Math.min(1, below / (g0.kind === 'creek' ? 1.0 : 2.5)));
          }
        }
        if (!c.endless && Math.abs(s - L) < 1.0 && ad < hw) tmp.copy(COL.finish);
        if (Math.abs(s) < 0.6 && ad < hw) tmp.copy(COL.start);
        col[vi * 3] = tmp.r; col[vi * 3 + 1] = tmp.g; col[vi * 3 + 2] = tmp.b;
        vi++;
      }
    }
    const IdxT = n > 65535 ? Uint32Array : Uint16Array;
    const idx = new IdxT((rows - 1) * (cols - 1) * 6);
    let ii = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = r * cols + j, b = a + 1, cc = a + cols, d = cc + 1;
        idx[ii++] = a; idx[ii++] = b; idx[ii++] = cc;
        idx[ii++] = b; idx[ii++] = d; idx[ii++] = cc;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const terrain = new THREE.Mesh(geo, Sh.terrainMat);
    terrain.receiveShadow = this.shadows;
    g.add(terrain);
    ch.disposables.push(geo);

    // --- Bäume und Felsen ---
    const trees = [], rocks = [];
    for (let kk = Math.floor(s0 / 10); kk < Math.floor(s1 / 10); kk++) {
      const b = c.oB.get(kk);
      if (b) for (const o of b) { if (o.type === 'tree') trees.push(o); else if (o.type === 'rock') rocks.push(o); }
    }
    const rng = mulberry32(k * 977 + 13);
    for (const f of drops) {
      if (f.s < s0 || f.s >= s1) continue;
      const cx = c.cxAt(f.s + 1), hw = c.wAt(f.s + 1) / 2;
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const x = cx + side * (hw + 1 + rng() * 7), z = -(f.s + 1 + rng() * 1.5);
        rocks.push({ x, z, y: c.heightAt(x, z), sc: 1 + rng() * 1.4, rot: rng() * 6 });
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const icol = new THREE.Color();
    if (trees.length) {
      const im = new THREE.InstancedMesh(Sh.treeGeo, Sh.treeMat, trees.length);
      trees.forEach((o, i) => {
        q.setFromAxisAngle(UP, o.rot);
        sc.set(o.sc, o.sc * (0.9 + ((o.rot * 3.7) % 1) * 0.35), o.sc);
        p.set(o.x, o.y - 0.25, o.z);
        m4.compose(p, q, sc);
        im.setMatrixAt(i, m4);
        icol.setRGB(0.82 + ((o.rot * 7.1) % 1) * 0.18, 0.86 + ((o.rot * 5.3) % 1) * 0.14, 0.86 + ((o.rot * 2.9) % 1) * 0.14);
        im.setColorAt(i, icol);
      });
      im.castShadow = this.shadows;
      im.computeBoundingSphere();
      g.add(im);
      ch.disposables.push(im);
    }
    if (rocks.length) {
      const im = new THREE.InstancedMesh(Sh.rockGeo, Sh.rockMat, rocks.length);
      rocks.forEach((o, i) => {
        q.setFromAxisAngle(UP, o.rot);
        sc.set(o.sc * 1.1, o.sc * 0.85, o.sc);
        p.set(o.x, o.y - 0.15 * o.sc, o.z);
        m4.compose(p, q, sc);
        im.setMatrixAt(i, m4);
      });
      im.castShadow = this.shadows;
      im.receiveShadow = this.shadows;
      im.computeBoundingSphere();
      g.add(im);
      ch.disposables.push(im);
    }

    // --- Pistenmarkierungen / Fackeln ---
    const poles = [];
    const torches = [];
    for (let s = Math.ceil(s0 / 18) * 18; s < s1; s += 18) {
      if (s < 0 || (!c.endless && s > L + 40)) continue;
      const cx = c.cxAt(s), hw = c.wAt(s) / 2;
      for (const side of [-1, 1]) {
        const x = cx + side * (hw + 0.9);
        const y = c.heightAt(x, -s);
        poles.push([x, y, -s]);
        if (this.night && (s / 18) % 2 === 0) torches.push([x, y, -s]);
      }
    }
    if (poles.length) {
      const im = new THREE.InstancedMesh(Sh.poleGeo, Sh.poleMat, poles.length);
      poles.forEach(([x, y, z], i) => {
        m4.makeTranslation(x, y, z);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      g.add(im);
      ch.disposables.push(im);
    }
    for (const [x, y, z] of torches) {
      const sp = new THREE.Sprite(Sh.torchMat);
      sp.position.set(x, y + 1.85, z);
      sp.scale.set(2.4, 2.4, 1);
      g.add(sp);
    }

    // --- Kicker-Markierungen ---
    for (const f of kickers) {
      if (f.s < s0 || f.s >= s1) continue;
      const cx = c.cxAt(f.s);
      for (const side of [-1, 1]) {
        const x = cx + f.d + side * (f.w / 2 + 0.4);
        const cone = new THREE.Mesh(Sh.coneGeo, Sh.coneMat);
        cone.position.set(x, c.heightAt(x, -f.s), -f.s);
        g.add(cone);
      }
    }

    // --- Rails ---
    for (const r of c.rails) {
      if (r.s1 < s0 || r.s1 >= s1 || r.y1 == null) continue;
      const isBox = r.kind === 'box';
      const w = isBox ? 0.9 : 0.12, h = isBox ? 0.42 : 0.1;
      const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1, r.z2 - r.z1);
      const bg = new THREE.BoxGeometry(w, h, len);
      ch.disposables.push(bg);
      const mesh = new THREE.Mesh(bg, isBox ? Sh.boxMat : Sh.metal);
      mesh.position.set((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2 - h / 2, (r.z1 + r.z2) / 2);
      mesh.lookAt(r.x2, r.y2 - h / 2, r.z2);
      mesh.castShadow = this.shadows;
      g.add(mesh);
      for (let t = 0.04; t <= 0.97; t += 0.31) {
        const px = lerp(r.x1, r.x2, t), pz = lerp(r.z1, r.z2, t);
        const top = lerp(r.y1, r.y2, t) - h;
        const gy = c.heightAt(px, pz);
        const leg = new THREE.Mesh(Sh.postGeo, Sh.postMat);
        leg.position.set(px, gy - 0.1, pz);
        leg.scale.set(0.09, Math.max(0.05, top - gy + 0.1), 0.09);
        g.add(leg);
      }
    }

    // --- Slalomtore ---
    for (const gt of c.gates) {
      if (gt.s < s0 || gt.s >= s1) continue;
      const flags = [];
      const mat = gt.state === 1 ? S.green : gt.state === 2 ? S.grey : gt.color === 'red' ? S.red : S.blue;
      for (const side of [-1, 1]) {
        const x = gt.x + side * gt.w / 2;
        const y = c.heightAt(x, -gt.s);
        const pole = new THREE.Mesh(Sh.gatePoleGeo, Sh.gatePoleMat);
        pole.position.set(x, y, -gt.s);
        g.add(pole);
        const flag = new THREE.Mesh(Sh.flagGeo, mat);
        flag.position.set(x - side * 0.45, y + 1.5, -gt.s);
        flag.castShadow = this.shadows;
        g.add(flag);
        flags.push(flag);
      }
      this.gateFlags.set(gt.idx, flags);
      ch.gates.push(gt.idx);
    }

    // --- Boost-Kristalle ---
    for (const pk of c.pickups) {
      if (pk.s < s0 || pk.s >= s1 || pk.taken) continue;
      const obj = new THREE.Group();
      obj.position.set(pk.x, pk.y, pk.z);
      const mesh = new THREE.Mesh(Sh.crystalGeo, Sh.crystalMat);
      mesh.position.y = 1.2;
      obj.add(mesh);
      const glow = new THREE.Sprite(Sh.crystalGlow);
      glow.scale.set(3, 3, 1);
      glow.position.y = 1.2;
      obj.add(glow);
      g.add(obj);
      this.pickupObjs.push({ p: pk, obj, mesh, phase: pk.s, chunk: ch });
    }

    // --- Warnschilder ---
    for (const sg of c.signs) {
      if (sg.s < s0 || sg.s >= s1) continue;
      const cx = c.cxAt(sg.s), hw = c.wAt(sg.s) / 2;
      const x = cx + sg.side * (hw + 2.4);
      const y = c.heightAt(x, -sg.s);
      const post = new THREE.Mesh(Sh.postGeo, Sh.postMat);
      post.position.set(x, y, -sg.s);
      post.scale.set(0.07, 2.2, 0.07);
      g.add(post);
      const sign = new THREE.Mesh(Sh.signGeo, Sh.signMat);
      sign.position.set(x, y + 2.3, -sg.s);
      g.add(sign);
    }

    // --- Brücken über Spalten und Bäche ---
    for (const gp of gapsHere) {
      if (gp.s < s0 || gp.s >= s1) continue;
      const cx = c.cxAt(gp.s);
      const bx = cx + gp.bridgeD;
      const len = gp.half * 2 + gp.wallW * 2 + 2.4;
      const deckY = c.heightAt(bx, -gp.s);
      const chasm = gp.kind === 'chasm';
      const mat = chasm ? Sh.stoneMat : Sh.plankMat;
      const add = (sx, sy, sz, x, y, z, m = mat) => {
        const b = new THREE.Mesh(Sh.unitBox, m);
        b.scale.set(sx, sy, sz);
        b.position.set(x, y, z);
        b.castShadow = this.shadows;
        b.receiveShadow = this.shadows;
        g.add(b);
        return b;
      };
      const bw = gp.bridgeHalf * 2 + 0.5;
      const sA = gp.s - len / 2, sB = gp.s + len / 2;
      const ax = c.cxAt(sA) + gp.bridgeD, bxx = c.cxAt(sB) + gp.bridgeD;
      const A3 = new THREE.Vector3(ax, c.heightAt(ax, -sA), -sA), B3 = new THREE.Vector3(bxx, c.heightAt(bxx, -sB), -sB);
      // Quader entlang der Brücke von A nach B
      const span = (w, h, yOff, latOff, m) => {
        const b = new THREE.Mesh(Sh.unitBox, m);
        b.scale.set(w, h, A3.distanceTo(B3));
        b.position.set((A3.x + B3.x) / 2 + latOff, (A3.y + B3.y) / 2 + yOff, (A3.z + B3.z) / 2);
        b.lookAt(B3.x + latOff, B3.y + yOff, B3.z);
        b.castShadow = this.shadows;
        b.receiveShadow = this.shadows;
        g.add(b);
      };
      if (chasm) {
        span(bw, 0.8, -0.38, 0, Sh.stoneMat);
        span(bw - 0.1, 0.06, 0.03, 0, Sh.snowTopMat);
        for (const sd of [-1, 1]) {
          span(0.35, 0.55, 0.25, sd * (bw / 2 + 0.1), Sh.stoneMat);
          // Widerlager an beiden Spaltwänden
          const ws = gp.s + sd * (gp.half + 0.3);
          const wx = c.cxAt(ws) + gp.bridgeD, wy = c.heightAt(wx, -ws);
          add(bw + 0.8, gp.depth + 2, 1.6, wx, wy - (gp.depth + 2) / 2 - 0.35, -ws);
        }
        const my = c.heightAt(bx, -gp.s);
        add(bw * 0.7, gp.depth * 0.8, 1.2, bx, my - gp.depth * 0.62, -gp.s);
        // Absperrstangen an der Abbruchkante
        const hw = c.wAt(gp.s) / 2;
        for (let d = -hw; d <= hw; d += 2.2) {
          if (Math.abs(d - gp.bridgeD) < gp.bridgeHalf + 1) continue;
          const sE = gp.s - gp.half - 1.2;
          const x = c.cxAt(sE) + d;
          const pole = new THREE.Mesh(Sh.poleGeo, Sh.poleMat);
          pole.position.set(x, c.heightAt(x, -sE), -sE);
          g.add(pole);
        }
      } else {
        span(bw, 0.12, 0.03, 0, Sh.plankMat);
        for (const sd of [-1, 1]) {
          add(0.12, 0.12, len, bx + sd * (bw / 2), deckY + 0.85, -gp.s);
          for (const ps of [-1, 1]) add(0.14, 0.95, 0.14, bx + sd * (bw / 2), deckY + 0.45, -gp.s + ps * (len / 2 - 0.4));
        }
      }
    }

    // --- Zäune (Almwiese) ---
    const posts = [], rails = [];
    for (const fe of c.fences) {
      const a = Math.max(s0, fe.s1), b = Math.min(s1, fe.s2);
      if (b <= a) continue;
      let prev = null;
      for (let s = Math.ceil(a / 2.6) * 2.6; s < b; s += 2.6) {
        const x = c.cxAt(s) + fe.side * (c.wAt(s) / 2 + 2.2);
        const y = c.heightAt(x, -s);
        posts.push([x, y, -s]);
        if (prev) rails.push([prev, [x, y, -s]]);
        prev = [x, y, -s];
      }
    }
    if (posts.length) {
      const im = new THREE.InstancedMesh(Sh.fencePost, Sh.plankMat, posts.length);
      posts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
      im.computeBoundingSphere();
      g.add(im);
      ch.disposables.push(im);
    }
    if (rails.length) {
      const im = new THREE.InstancedMesh(Sh.fenceRail, Sh.plankMat, rails.length * 2);
      const pa = new THREE.Vector3(), pb = new THREE.Vector3(), dir = new THREE.Vector3();
      rails.forEach(([A, B], i) => {
        pa.set(...A); pb.set(...B);
        dir.subVectors(pb, pa);
        const l = dir.length();
        dir.normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        for (let r2 = 0; r2 < 2; r2++) {
          p.addVectors(pa, pb).multiplyScalar(0.5);
          p.y += 0.45 + r2 * 0.4;
          sc.set(1, 1, l);
          m4.compose(p, q, sc);
          im.setMatrixAt(i * 2 + r2, m4);
        }
      });
      im.computeBoundingSphere();
      g.add(im);
      ch.disposables.push(im);
    }

    // --- Abschnittsschilder ---
    for (const sec of c.secs) {
      if (sec.s1 < s0 || sec.s1 >= s1 || sec.type === 'start' || sec.type === 'finish') continue;
      const ss = sec.s1 + 4;
      const side = c.liftSide * -1;
      const x = c.cxAt(ss) + side * (c.wAt(ss) / 2 + 3.2);
      const y = c.heightAt(x, -ss);
      for (const px of [-1.3, 1.3]) {
        const post = new THREE.Mesh(Sh.postGeo, Sh.woodMat);
        post.scale.set(0.08, 2.6, 0.08);
        post.position.set(x + px, y - 0.2, -ss);
        g.add(post);
      }
      const tex = boardTexture(sec.name, sec.hint);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide });
      const board = new THREE.Mesh(Sh.boardGeo, mat);
      board.position.set(x, y + 2.0, -ss);
      board.castShadow = this.shadows;
      g.add(board);
      ch.disposables.push(tex, mat);
    }

    // --- Almhütten ---
    for (const h of c.huts) {
      if (h.s < s0 || h.s >= s1) continue;
      const hut = new THREE.Mesh(Sh.hutGeo, Sh.hutMat);
      hut.position.set(h.x, h.y, h.z);
      hut.rotation.y = h.rot;
      hut.castShadow = this.shadows;
      hut.receiveShadow = this.shadows;
      const win = new THREE.Mesh(Sh.windowGeo, Sh.windowMat);
      hut.add(win);
      g.add(hut);
    }

    // --- Sessellift ---
    const i0 = Math.ceil((s0 + TOWER_OFF) / TOWER_SP), i1 = Math.floor((s1 - 1 + TOWER_OFF) / TOWER_SP);
    const towers = [];
    for (let i = i0; i <= i1; i++) {
      const ts = i * TOWER_SP - TOWER_OFF;
      if (ts < -TOWER_OFF || (!c.endless && ts > L + 60)) continue;
      towers.push(i);
    }
    if (towers.length) {
      const im = new THREE.InstancedMesh(Sh.towerGeo, Sh.towerMat, towers.length);
      const cab = [];
      towers.forEach((i, n) => {
        const A = this.towerPos(i, vA), B = this.towerPos(i + 1, vB);
        const hd = Math.atan2(B.x - A.x, -(B.z - A.z));
        q.setFromAxisAngle(UP, -hd);
        sc.set(1, 1, 1);
        m4.compose(A, q, sc);
        im.setMatrixAt(n, m4);
        const nextS = (i + 1) * TOWER_SP - TOWER_OFF;
        if (!c.endless && nextS > L + 60) return;
        const px = Math.cos(hd), pz = Math.sin(hd);
        for (const lat of [-2.3, 2.3]) {
          let lx = A.x + px * lat, ly = A.y + 10.75, lz = A.z + pz * lat;
          for (let k2 = 1; k2 <= 8; k2++) {
            const f = k2 / 8;
            const nx = lerp(A.x, B.x, f) + px * lat, nz = lerp(A.z, B.z, f) + pz * lat;
            const ny = lerp(A.y, B.y, f) + 10.75 - 0.9 * 4 * f * (1 - f);
            cab.push(lx, ly, lz, nx, ny, nz);
            lx = nx; ly = ny; lz = nz;
          }
        }
      });
      im.castShadow = this.shadows;
      im.computeBoundingSphere();
      g.add(im);
      ch.disposables.push(im);
      if (cab.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(cab, 3));
        const lines = new THREE.LineSegments(lg, Sh.cableMat);
        g.add(lines);
        ch.disposables.push(lg);
      }
    }

    // --- Start und Ziel ---
    if (s0 <= 0 && s1 > 0) this._arch(g, ch, 0, 'START', '#1d4ed8');
    if (!c.endless && s0 <= L && s1 > L) this._arch(g, ch, L, 'ZIEL', '#d62828');

    this.group.add(g);
    return ch;
  }

  _arch(g, ch, s, text, bg) {
    const c = this.course, Sh = this.sh;
    const cx = c.cxAt(s), hw = c.wAt(s) / 2 + 1.4;
    let top = -Infinity;
    for (const side of [-1, 1]) {
      const x = cx + side * hw;
      const y = c.heightAt(x, -s);
      top = Math.max(top, y);
      const post = new THREE.Mesh(Sh.postGeo, Sh.postMat);
      post.position.set(x, y - 0.5, -s);
      post.scale.set(0.36, 6.2, 0.36);
      post.castShadow = this.shadows;
      g.add(post);
    }
    const bgeo = new THREE.BoxGeometry(hw * 2 + 0.6, 1.25, 0.2);
    ch.disposables.push(bgeo);
    const banner = new THREE.Mesh(bgeo, bannerMat(text, bg, '#ffffff'));
    banner.position.set(cx, top + 5.1, -s);
    banner.castShadow = this.shadows;
    g.add(banner);
  }

  dispose() {
    this.chairs.dispose();
    for (const ch of this.chunks.values()) this._disposeChunk(ch);
    this.chunks.clear();
    this.scene.remove(this.group);
  }
}
