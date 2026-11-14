// App: Renderer, Spielschleife, Navigation zwischen Menü, Spiel und Online-Raum
import * as THREE from 'three';
import { Session } from './game.js';
import { UI, Hud } from './ui.js';
import { Input } from './input.js';
import { AudioFX } from './audio.js';
import { Store } from './storage.js';
import { Net } from './net.js';
import { TRACKS } from './course.js';

// Gerät: Touch/Handy und schwache Hardware erkennen
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
// nur wirklich schwache Geräte (iPhones melden im Browser oft nur 4 Kerne, sind aber schnell)
const weakDevice = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
document.body.classList.toggle('is-touch', isTouch);

const app = {
  store: Store.load(),
  isTouch,
  input: new Input(),
  audio: new AudioFX(),
  net: null,
  netResults: null,
  session: null,
  lastCfg: null,
  // 'auto' wählt je nach Gerät; auf Handys ohne Schatten und mit geringerer Auflösung
  get qualitySetting() { return this.store.profile.quality || 'auto'; },
  get quality() {
    const q = this.qualitySetting;
    if (q !== 'auto') return q;
    return isTouch && weakDevice ? 'mittel' : 'hoch';
  },
  resScale: 1,
};
// früher war 'hoch' voreingestellt, ohne dass man es gewählt hat -> auf Auto umstellen
if (!app.store.profile.qualityChosen && app.store.profile.quality === 'hoch') { app.store.profile.quality = 'auto'; app.store.save(); }
window.__gipfelrausch = app;

// ---------- Renderer ----------
// Kantenglättung ist auf Handy-GPUs (Tile-Rendering) günstig -> überall an, außer auf sehr schwachen Geräten
const renderer = new THREE.WebGLRenderer({ antialias: !(isTouch && weakDevice), powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 6000);
app.renderer = renderer;
app.camera = camera;

// nie unter 1,0 (bzw. die echte Pixeldichte, falls kleiner) – sonst wird es matschig
app.pixelRatio = function () {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(Math.min(dpr, 1), this.prCap * this.resScale);
};
app.applyQuality = function () {
  const q = this.quality;
  const dpr = window.devicePixelRatio || 1;
  const cap = q === 'hoch' ? 2 : q === 'mittel' ? (isTouch ? 1.6 : 1.25) : (isTouch ? 1.1 : 0.9);
  this.prCap = Math.min(dpr, cap);
  if (this.qualitySetting !== 'auto') this.resScale = 1;
  renderer.setPixelRatio(this.pixelRatio());
  const sh = q !== 'niedrig' && !(q === 'mittel' && isTouch);
  if (renderer.shadowMap.enabled !== sh) {
    renderer.shadowMap.enabled = sh;
    this.materialsDirty = true;
  }
  resize();
};
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

app.ui = new UI(app);
app.hud = new Hud();
app.audio.enabled = app.store.profile.sound !== false;

// ---------- Touch-Steuerung ----------
// Lenkung per Wischen (analog), Neigen oder Tasten; rechts die Aktionstasten im Daumenbogen
const touchEl = document.getElementById('touch');
touchEl.innerHTML = `
  <div class="t-pad" id="t-pad"><div class="t-track"><i class="t-knob" id="t-knob"></i></div><span class="t-hint">Wischen zum Lenken</span></div>
  <div class="t-left t-btns"><button data-key="ArrowLeft" aria-label="Links">◀</button><button data-key="ArrowRight" aria-label="Rechts">▶</button></div>
  <div class="t-right">
    <button data-key="TouchTrickL" class="tb tr1" aria-label="Trick links / Grab">↺<small>Trick</small></button>
    <button data-key="TouchTrickR" class="tb tr2" aria-label="Trick rechts / Grab">↻<small>Trick</small></button>
    <button data-key="TouchBoost" class="tb boost" aria-label="Boost">Boost</button>
    <button data-key="ArrowUp" class="tb tuck" aria-label="Hocke / Frontflip">Hocke<small>Frontflip</small></button>
    <button data-key="ArrowDown" class="tb brake" aria-label="Bremsen / Backflip">Bremse<small>Backflip</small></button>
    <button data-key="Space" class="tb jump" aria-label="Springen">Sprung</button>
  </div>`;
app.input.bindTouch(touchEl);
touchEl.addEventListener('contextmenu', (e) => e.preventDefault());
app.steerMode = () => app.store.profile.steer || 'wischen';
app.applySteerMode = function () {
  const m = this.steerMode();
  touchEl.dataset.steer = m;
  this.input.analog = 0;
};
app.applySteerMode();
{
  const pad = document.getElementById('t-pad'), knob = document.getElementById('t-knob');
  const R = 52;
  let pid = null, x0 = 0;
  const set = (v) => { app.input.analog = v; knob.style.transform = `translateX(${(v * R).toFixed(1)}px)`; };
  pad.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    e.preventDefault();
    pid = e.pointerId; x0 = e.clientX;
    try { pad.setPointerCapture(pid); } catch (err) { /* manche Browser erlauben das nicht */ }
    pad.classList.add('on', 'used');
    set(0);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - x0;
    // Ursprung wandert mit, damit ein Richtungswechsel sofort greift
    if (dx > R) { x0 = e.clientX - R; dx = R; } else if (dx < -R) { x0 = e.clientX + R; dx = -R; }
    const v = dx / R;
    set(Math.abs(v) < 0.08 ? 0 : v);
  });
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; pad.classList.remove('on'); set(0); };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}
// Neigen: Handy wie ein Lenkrad kippen (Quer- und Hochformat)
addEventListener('deviceorientation', (e) => {
  if (!isTouch || app.steerMode() !== 'neigen') return;
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let v = ang === 90 ? e.beta : (ang === -90 || ang === 270) ? -e.beta : ang === 180 ? -e.gamma : e.gamma;
  if (v == null) return;
  const dead = 2.5;
  v = Math.abs(v) < dead ? 0 : v - Math.sign(v) * dead;
  app.input.analog = Math.max(-1, Math.min(1, v / 20));
});
app.requestTilt = async function () {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      return (await DeviceOrientationEvent.requestPermission()) === 'granted';
    }
  } catch (e) { return false; }
  return true;
};
const showTouch = (b) => { touchEl.classList.toggle('hidden', !(b && isTouch)); if (!b) app.input.analog = 0; };

// ---------- Ablauf ----------
app.setSession = function (s) {
  if (this.session) this.session.dispose();
  this.session = s;
  if (this.materialsDirty) {
    s.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    this.materialsDirty = false;
  }
};

const ATTRACT_WEATHER = ['abend', 'sonne', 'nacht', 'abend', 'nebel', 'sturm'];
app.nextAttract = function () {
  const tr = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  const w = ATTRACT_WEATHER[Math.floor(Math.random() * ATTRACT_WEATHER.length)];
  this.setSession(new Session(this, { attract: true, mode: 'bots', trackId: tr.id, weather: w, botDiff: 2 }));
};
app.startAttract = function () {
  this.hud.hide();
  showTouch(false);
  this.audio.silence();
  this.nextAttract();
};

app.startGame = function (cfg) {
  // Handy: Vollbild (wo erlaubt) und einmalig der Tipp, quer zu halten
  if (isTouch && document.fullscreenEnabled && !document.fullscreenElement && this.store.profile.fullscreen !== false) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  if (isTouch && innerHeight > innerWidth * 1.2 && (this.store.profile.rotHint || 0) < 2) {
    this.store.profile.rotHint = (this.store.profile.rotHint || 0) + 1;
    this.store.save();
    setTimeout(() => this.ui.toast('Tipp: Handy quer halten – dann siehst du mehr vom Hang'), 600);
  }
  this.audio.init();
  this.audio.setEnabled(this.store.profile.sound !== false);
  this.lastCfg = cfg;
  this.ui.hide();
  this.input.clearEdges();
  const s = new Session(this, cfg);
  this.setSession(s);
  this.hud.setup(s);
  this.hud.show();
  showTouch(true);
};

app.restart = function () {
  if (!this.lastCfg || this.lastCfg.online) return;
  this.startGame(this.lastCfg);
};

// Kamera: Ich-Perspektive (POV) an/aus
app.togglePov = function () {
  const p = this.store.profile;
  p.pov = !p.pov;
  this.store.save();
  if (this.session) this.session.pov = p.pov;
  this.ui.toast(p.pov ? 'Ich-Perspektive an' : 'Verfolger-Kamera');
  if (this.ui.current === 'pause') this.ui.pause();
  if (this.hud && this.hud.syncCam) this.hud.syncCam();
};

app.showResults = function (res) {
  showTouch(false);
  this.hud.hide();
  this.audio.silence();
  this.ui.results(res);
};

app.toMenu = function (silent = false) {
  if (this.net && this.session && this.session.online) { this.leaveRoom(); return; }
  this.startAttract();
  if (!silent) this.ui.menu();
};

app.togglePause = function () {
  const s = this.session;
  if (!s || s.attract) return;
  if (s.paused) this.resume();
  else if (s.setPaused(true)) { this.ui.pause(); showTouch(false); }
};
app.resume = function () {
  const s = this.session;
  if (!s) return;
  s.setPaused(false);
  this.ui.hide();
  this.input.clearEdges();
  showTouch(true);
};

// ---------- Online ----------
function bindNet(net) {
  net.on('room', () => { if (app.ui.current === 'lobby') app.ui.lobby(); });
  net.on('start', (m) => {
    app.netResults = null;
    const s = m.settings;
    app.startGame({ mode: s.mode, trackId: s.trackId, weather: s.weather, seed: s.seed, online: true });
  });
  net.on('sts', (m) => { if (app.session && app.session.online) app.session.onNetStates(m.l); });
  net.on('results', (m) => { app.netResults = m; });
  net.on('lobby', () => { app.startAttract(); app.ui.lobby(); });
  net.on('toast', (msg) => app.ui.toast(msg));
  net.on('closed', (msg) => { app.ui.toast(msg, 'bad'); app.leaveRoom(); });
}

app.hostRoom = async function () {
  this.audio.init();
  const net = new Net();
  await net.host(this.store.profile);
  this.net = net;
  bindNet(net);
  this.ui.lobby();
};

app.joinRoom = async function (code) {
  this.audio.init();
  const net = new Net();
  await net.join(code, this.store.profile);
  this.net = net;
  bindNet(net);
  history.replaceState(null, '', location.pathname);
  if (net.phase === 'race') this.ui.toast('Ein Rennen läuft gerade – du bist beim nächsten dabei.');
  this.ui.lobby();
};

app.leaveRoom = function () {
  if (this.net) { this.net.leave(); this.net = null; }
  this.netResults = null;
  this.startAttract();
  this.ui.menu();
};

// ---------- Tastatur global ----------
addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  const s = app.session;
  const inGame = s && !s.attract;
  if (e.code === 'Escape') {
    if (inGame && app.ui.current === 'pause') app.resume();
    else if (inGame && !app.ui.current) app.togglePause();
    else if (app.ui.current === 'results' && !(s && s.online)) app.toMenu();
    else app.ui.back();
  } else if (e.code === 'KeyP' && inGame && (!app.ui.current || app.ui.current === 'pause')) {
    app.togglePause();
  } else if (e.code === 'KeyR' && inGame && !s.online && (!app.ui.current || app.ui.current === 'pause' || app.ui.current === 'results')) {
    app.restart();
  } else if (e.code === 'Enter') {
    if (app.ui.current === 'setup') { e.preventDefault(); app.ui.startFromSetup(); }
    else if (app.ui.current === 'results' && !(s && s.online)) { e.preventDefault(); app.restart(); }
  } else if (e.code === 'KeyV' && !(app.ui.current === 'setup' || app.ui.current === 'settings')) {
    app.togglePov();
  } else if (e.code === 'KeyM') {
    const p = app.store.profile;
    p.sound = !p.sound;
    app.store.save();
    app.audio.setEnabled(p.sound);
    app.ui.toast(p.sound ? 'Ton an' : 'Ton aus');
  }
});
document.addEventListener('visibilitychange', () => {
  const s = app.session;
  if (document.hidden && s && !s.attract && !s.online && !s.paused && !app.ui.current && s.state !== 'done') app.togglePause();
});
addEventListener('pointerdown', () => app.audio.init(), { once: true });
addEventListener('keydown', () => app.audio.init(), { once: true });

// ---------- Schleife ----------
let last = performance.now();
let lastW = 0, lastH = 0, winW = 0, winH = 0;
let gAcc = 0, gN = 0, gLow = 0, gPrev = null, gCapped = false;
// Auto-Grafik: Auflösung nur senken, wenn das wirklich mehr Bilder pro Sekunde bringt.
// Begrenzt das Gerät selbst (z. B. Stromsparmodus mit 30 fps), wird die Senkung zurückgenommen.
function governor(dt) {
  if (app.qualitySetting !== 'auto' || document.hidden || !app.session || app.session.attract || app.session.paused) { gAcc = 0; gN = 0; return; }
  gAcc += dt; gN++;
  if (gAcc < 2) return;
  const fps = gN / gAcc;
  gAcc = 0; gN = 0;
  const s0 = app.resScale;
  let s1 = s0;
  if (gPrev && gPrev.scale > s0) {
    // letzte Senkung prüfen: hat sie etwas gebracht?
    if (fps < gPrev.fps + 3) { s1 = gPrev.scale; gCapped = true; }
    gPrev = null;
  } else if (fps < 45 && !gCapped) {
    gLow++;
    if (gLow >= 2 && s0 > 0.6) { s1 = Math.max(0.6, s0 - 0.1); gPrev = { scale: s0, fps }; gLow = 0; }
    else if (gLow >= 2 && renderer.shadowMap.enabled) {
      // Auflösung schon unten und immer noch zu langsam: lieber Schatten aus als noch unschärfer
      renderer.shadowMap.enabled = false;
      app.session.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
      gLow = 0;
    }
  } else {
    gLow = 0;
    if (fps > 56 && s0 < 1) s1 = Math.min(1, s0 + 0.1);
  }
  if (s1 !== s0) { app.resScale = s1; renderer.setPixelRatio(app.pixelRatio()); resize(); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (renderer.domElement.clientWidth !== lastW || renderer.domElement.clientHeight !== lastH || innerWidth !== winW || innerHeight !== winH) {
    winW = innerWidth; winH = innerHeight;
    resize();
    lastW = renderer.domElement.clientWidth; lastH = renderer.domElement.clientHeight;
  }
  if (app.session) {
    try {
      app.session.update(dt);
    } catch (err) {
      console.error(err);
    }
    renderer.render(app.session.scene, camera);
    governor(dt);
  }
}

// ---------- Start ----------
app.applyQuality();
app.startAttract();
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) app.ui.online(roomParam.toUpperCase().slice(0, 5));
else app.ui.menu();
document.getElementById('loading').remove();
requestAnimationFrame(frame);
