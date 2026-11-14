// Wetter und Tageszeit: Himmel, Licht, Nebel, Berge, Schneefall, Wind, Stirnlampe
import * as THREE from 'three';
import { mulberry32, Noise1D, clamp } from './rng.js';

export const WEATHERS = {
  sonne: {
    name: 'Sonnig', short: 'Sonne', top: '#2a6fd6', horizon: '#bfe2ff', bottom: '#e9f3ff', fog: '#d9ecff', fogNear: 140, fogFar: 760,
    sun: '#fff3dc', sunInt: 2.6, sunDir: [0.35, 0.8, 0.45], sunSky: 1.0, hemiSky: '#d4ebff', hemiGround: '#8a9ab8', hemiInt: 1.15,
    mountain: '#e3ecff', snow: 0, fall: 0, wind: 0, exposure: 0.95, cloud: '#ffffff', clouds: 10, env: 0.55,
  },
  abend: {
    name: 'Sonnenuntergang', short: 'Abend', top: '#2d3a7c', horizon: '#ff9a5c', bottom: '#ffc9a0', fog: '#f3b08f', fogNear: 110, fogFar: 640,
    sun: '#ffb56b', sunInt: 2.4, sunDir: [-0.45, 0.16, -0.88], sunSky: 1.4, hemiSky: '#ffc9a6', hemiGround: '#6b5b8f', hemiInt: 1.0,
    mountain: '#ffc3a8', snow: 0, fall: 0, wind: 0, exposure: 1.0, cloud: '#ffb89a', clouds: 14, env: 0.6,
  },
  nacht: {
    name: 'Nachtfahrt', short: 'Nacht', top: '#02040c', horizon: '#0f1d3a', bottom: '#0a1328', fog: '#0b1630', fogNear: 25, fogFar: 260,
    sun: '#a9c2ff', sunInt: 0.45, sunDir: [0.3, 0.55, -0.6], sunSky: 0.5, hemiSky: '#3a4f80', hemiGround: '#0b1020', hemiInt: 0.45,
    mountain: '#33446e', snow: 400, fall: 1.2, wind: 0, exposure: 1.1, night: true, stars: true, moon: true, cloud: '#26324d', clouds: 6, env: 0.35,
  },
  sturm: {
    name: 'Schneesturm', short: 'Sturm', top: '#7f8b9b', horizon: '#c6cfda', bottom: '#d6dde6', fog: '#c8d1dc', fogNear: 12, fogFar: 150,
    sun: '#eef2f8', sunInt: 0.9, sunDir: [0.2, 0.9, 0.2], sunSky: 0.0, hemiSky: '#e0e7f0', hemiGround: '#8e98a8', hemiInt: 1.25,
    mountain: '#c6cfda', snow: 7000, fall: 5, wind: 7, exposure: 1.0, gusts: true, clouds: 0, env: 0.6,
  },
  nebel: {
    name: 'Nebelsuppe', short: 'Nebel', top: '#b8c2cf', horizon: '#dde3ea', bottom: '#e6ebf0', fog: '#dfe5ec', fogNear: 6, fogFar: 125,
    sun: '#fbfcff', sunInt: 1.0, sunDir: [0.3, 0.85, 0.3], sunSky: 0.0, hemiSky: '#eef2f7', hemiGround: '#9aa5b5', hemiInt: 1.3,
    mountain: '#dfe5ec', snow: 900, fall: 0.8, wind: 0.5, exposure: 1.0, clouds: 0, env: 0.65,
  },
};
export const WEATHER_LIST = ['sonne', 'abend', 'nacht', 'sturm', 'nebel'];

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunStrength; uniform float moon;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  float disk = moon > 0.5 ? smoothstep(0.9993, 0.9996, sd) * 1.6 : pow(sd, 1400.0) * 6.0;
  c += sunColor * (disk + pow(sd, 10.0) * 0.32 * sunStrength + pow(sd, 3.0) * 0.08 * sunStrength);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let DOT = null;
let CLOUD = null;

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const r = mulberry32(4);
  for (let i = 0; i < 26; i++) {
    const cx = 40 + r() * 176, cy = 52 + r() * 40, rad = 18 + r() * 34;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ring aus Bergen: Grate per Rauschen, Schnee oben, Fels unten, Dunst je nach Entfernung
function makeRange(R, H, seed, haze, hz) {
  const rng = mulberry32(seed);
  const n1 = new Noise1D(rng, 512), n2 = new Noise1D(rng, 512);
  const SEG = 220, ROWS = 7;
  const pos = [], col = [], idx = [];
  const rock = new THREE.Color('#4c5566'), rock2 = new THREE.Color('#6b7180'), snow = new THREE.Color('#ffffff'), tmp = new THREE.Color();
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const u = (i / SEG) * 64;
    const ridge = 1 - Math.abs(n1.at(u * 0.35));
    const h = H * (0.32 + 0.68 * Math.pow(ridge, 1.8)) * (0.75 + 0.25 * n2.at(u * 0.12));
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const y = -280 + (h + 280) * t + (j > 0 && j < ROWS ? (n2.at(u * 1.7 + j * 3.1) * 0.06) * H : 0);
      const r = R + t * h * 0.9 + n1.at(u * 2.3 + j) * 30;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const snowLine = 0.45 + 0.2 * n2.at(u * 0.9 + j * 0.7);
      const tt = (y + 280) / (h + 280);
      tmp.copy(j % 2 ? rock : rock2).lerp(snow, clamp((tt - snowLine) * 5, 0, 1));
      tmp.lerp(haze, hz);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < ROWS; j++) {
    const A = i * (ROWS + 1) + j, B = A + ROWS + 1;
    idx.push(A, A + 1, B, B, A + 1, B + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  g.dispose();
  return ng;
}
const wrap = (v, s) => v - s * Math.floor(v / s + 0.5);

export class Environment {
  constructor(scene, key, quality = 'hoch', renderer = null) {
    this.key = WEATHERS[key] ? key : 'sonne';
    const W = (this.def = WEATHERS[this.key]);
    this.scene = scene;
    this.disposables = [];
    this.t = 0;
    this.wind = 0;
    scene.fog = new THREE.Fog(W.fog, W.fogNear, W.fogFar);
    scene.background = new THREE.Color(W.horizon);
    if (renderer) renderer.toneMappingExposure = W.exposure;

    // Himmel
    const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
    this.sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(W.top) }, horizon: { value: new THREE.Color(W.horizon) }, bottom: { value: new THREE.Color(W.bottom) },
        sunColor: { value: new THREE.Color(W.sun) }, sunDir: { value: new THREE.Vector3(...W.sunDir).normalize() },
        sunStrength: { value: W.sunSky }, moon: { value: W.moon ? 1 : 0 },
      },
    }));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.disposables.push(skyGeo, this.sky.material);
    if (renderer) {
      try {
        const pm = new THREE.PMREMGenerator(renderer);
        const envScene = new THREE.Scene();
        const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.sky.material.clone());
        envSky.material.uniforms.sunStrength.value = W.sunSky * 0.5;
        envScene.add(envSky);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(W.fog).multiplyScalar(0.9) }));
        ground.position.y = -0.5;
        envScene.add(ground);
        this.envRT = pm.fromScene(envScene, 0.02, 0.1, 50);
        scene.environment = this.envRT.texture;
        scene.environmentIntensity = W.env;
        envSky.geometry.dispose(); envSky.material.dispose(); ground.geometry.dispose(); ground.material.dispose();
        pm.dispose();
      } catch (e) { console.warn('env map', e); }
    }

    // Sterne
    if (W.stars) {
      const rng = mulberry32(7);
      const N = 1600;
      const p = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const u = rng() * Math.PI * 2, v = Math.acos(rng() * 0.95);
        p[i * 3] = Math.cos(u) * Math.sin(v) * 3500;
        p[i * 3 + 1] = Math.cos(v) * 3500;
        p[i * 3 + 2] = Math.sin(u) * Math.sin(v) * 3500;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const m = new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
      this.stars = new THREE.Points(g, m);
      this.stars.frustumCulled = false;
      scene.add(this.stars);
      this.disposables.push(g, m);
    }

    // Bergketten rundherum (drei Staffeln mit Dunst)
    this.mountains = new THREE.Group();
    const mMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, flatShading: true, color: W.mountain });
    this.disposables.push(mMat);
    const haze = new THREE.Color(W.horizon);
    const ranges = [[1150, 430, 0.18, 11], [1750, 640, 0.38, 23], [2600, 920, 0.58, 37]];
    for (const [R, H, hz, seed] of ranges) {
      const geo = makeRange(R, H, seed, haze, hz);
      this.mountains.add(new THREE.Mesh(geo, mMat));
      this.disposables.push(geo);
    }
    // Wolken
    if (W.clouds) {
      if (!CLOUD) CLOUD = cloudTexture();
      const cm = new THREE.SpriteMaterial({ map: CLOUD, color: W.cloud, transparent: true, opacity: W.night ? 0.5 : 0.85, fog: false, depthWrite: false });
      this.disposables.push(cm);
      const rc = mulberry32(21);
      for (let i = 0; i < W.clouds; i++) {
        const sp = new THREE.Sprite(cm);
        const ang = rc() * Math.PI * 2, dist = 1500 + rc() * 1300;
        sp.position.set(Math.cos(ang) * dist, 260 + rc() * 380, Math.sin(ang) * dist);
        const w = 500 + rc() * 700;
        sp.scale.set(w, w * (0.22 + rc() * 0.12), 1);
        sp.renderOrder = -5;
        this.mountains.add(sp);
      }
    }
    this.mountains.visible = W.fogFar > 200;
    scene.add(this.mountains);

    // Licht
    this.hemi = new THREE.HemisphereLight(W.hemiSky, W.hemiGround, W.hemiInt);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(W.sun, W.sunInt);
    this.sunDir = new THREE.Vector3(...W.sunDir).normalize();
    const shadows = quality !== 'niedrig';
    this.sun.castShadow = shadows;
    if (shadows) {
      // Handys: kleinere Schattenkarte, spart viel Rechenzeit bei kaum sichtbarem Unterschied
      const sz = quality === 'hoch' && !matchMedia('(pointer: coarse)').matches ? 2048 : 1024;
      this.sun.shadow.mapSize.set(sz, sz);
      const cam = this.sun.shadow.camera;
      cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45; cam.near = 1; cam.far = 320;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Stirnlampe (Nacht)
    if (W.night) {
      this.lamp = new THREE.SpotLight('#fff1d6', 220, 95, 0.55, 0.65, 1.15);
      this.lamp.castShadow = false;
      scene.add(this.lamp);
      scene.add(this.lamp.target);
    }

    // Schneefall
    const N = Math.round(W.snow * (quality === 'niedrig' ? 0.45 : 1));
    if (N > 0) {
      if (!DOT) DOT = dotTexture();
      const rngS = mulberry32(5);
      this.snowBox = { w: 80, h: 44, d: 90 };
      const p = new Float32Array(N * 3);
      this.snowSeed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        p[i * 3] = (rngS() - 0.5) * this.snowBox.w;
        p[i * 3 + 1] = (rngS() - 0.5) * this.snowBox.h;
        p[i * 3 + 2] = (rngS() - 0.5) * this.snowBox.d;
        this.snowSeed[i] = rngS();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const m = new THREE.PointsMaterial({ map: DOT, color: '#ffffff', size: W.wind > 3 ? 0.22 : 0.16, transparent: true, depthWrite: false, opacity: 0.95 });
      this.snow = new THREE.Points(g, m);
      this.snow.frustumCulled = false;
      this.snowOrigin = new THREE.Vector3();
      scene.add(this.snow);
      this.disposables.push(g, m);
    }
  }

  update(dt, camera, focus, heading = 0) {
    const W = this.def;
    this.t += dt;
    const cp = camera.position;
    this.sky.position.copy(cp);
    if (this.stars) this.stars.position.copy(cp);
    this.mountains.position.set(cp.x, cp.y, cp.z);
    // Sonne folgt dem Fahrer, damit der Schattenbereich passt
    this.sun.position.set(focus.x + this.sunDir.x * 140, focus.y + this.sunDir.y * 140, focus.z + this.sunDir.z * 140);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    // Wind
    if (W.gusts) this.wind = W.wind * (0.45 * Math.sin(this.t * 0.31) + 0.35 * Math.sin(this.t * 1.13 + 1.7) + 0.2 * Math.sin(this.t * 2.7));
    else this.wind = W.wind * 0.15 * Math.sin(this.t * 0.2);
    if (this.lamp) {
      const sx = Math.sin(heading), cz = -Math.cos(heading);
      this.lamp.position.set(focus.x - sx * 0.6, focus.y + 2.2, focus.z - cz * 0.6);
      this.lamp.target.position.set(focus.x + sx * 22, focus.y - 3, focus.z + cz * 22);
    }
    if (this.snow) {
      const pa = this.snow.geometry.attributes.position;
      const arr = pa.array;
      const B = this.snowBox;
      const fall = W.fall, wind = this.wind * 1.4 + W.wind * 0.6;
      const n = arr.length / 3;
      for (let i = 0; i < n; i++) {
        const sd = this.snowSeed[i];
        arr[i * 3] += (wind + Math.sin(this.t * 1.5 + sd * 40) * 0.6) * dt;
        arr[i * 3 + 1] -= fall * (0.7 + sd * 0.6) * dt;
        // um die Kamera herum einwickeln
        arr[i * 3] = cp.x + wrap(arr[i * 3] - cp.x, B.w);
        arr[i * 3 + 1] = cp.y + wrap(arr[i * 3 + 1] - cp.y, B.h);
        arr[i * 3 + 2] = cp.z + wrap(arr[i * 3 + 2] - cp.z, B.d);
      }
      pa.needsUpdate = true;
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    if (this.envRT) this.envRT.dispose();
    this.scene.fog = null;
  }
}
