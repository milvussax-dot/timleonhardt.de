// App: Renderer, Spielschleife, Navigation zwischen Menü, Spiel und Online-Raum
import * as THREE from 'three';
import { Session } from './game.js';
import { UI, Hud } from './ui.js';
import { Input } from './input.js';
import { AudioFX } from './audio.js';
import { Store } from './storage.js';
import { Net } from './net.js';
import { TRACKS } from './course.js';

const app = {
  store: Store.load(),
  input: new Input(),
  audio: new AudioFX(),
  net: null,
  netResults: null,
  session: null,
  lastCfg: null,
  get quality() { return this.store.profile.quality || 'hoch'; },
};
window.__gipfelrausch = app;

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 6000);
app.renderer = renderer;
app.camera = camera;

app.applyQuality = function () {
  const q = this.quality;
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(q === 'hoch' ? Math.min(dpr, 2) : q === 'mittel' ? Math.min(dpr, 1.25) : Math.min(dpr, 0.9));
  const sh = q !== 'niedrig';
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
const touchEl = document.getElementById('touch');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
touchEl.innerHTML = `
  <div class="t-left"><button data-key="ArrowLeft" aria-label="Links">◀</button><button data-key="ArrowRight" aria-label="Rechts">▶</button></div>
  <div class="t-right">
    <div class="t-col">
      <button data-key="TouchTrickL" class="sm" aria-label="Trick links">Trick ↺<br><small>Grab</small></button>
      <button data-key="ArrowDown" class="sm" aria-label="Bremsen / Backflip">Brems<br><small>Backflip</small></button>
    </div>
    <div class="t-col">
      <button data-key="TouchTrickR" class="sm" aria-label="Trick rechts">Trick ↻<br><small>Grab</small></button>
      <button data-key="ArrowUp" class="sm" aria-label="Hocke / Frontflip">Hocke<br><small>Frontflip</small></button>
    </div>
    <div class="t-col">
      <button data-key="TouchBoost" class="sm boost" aria-label="Boost">Boost</button>
      <button data-key="Space" class="jump" aria-label="Springen">Sprung</button>
    </div>
  </div>`;
app.input.bindTouch(touchEl);
const showTouch = (b) => touchEl.classList.toggle('hidden', !(b && isTouch));

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
  } else if (e.code === 'KeyM') {
    const p = app.store.profile;
    p.sound = !p.sound;
    app.store.save();
    app.audio.setEnabled(p.sound);
    app.ui.toast(p.sound ? 'Ton an' : 'Ton aus');
  }
});
addEventListener('pointerdown', () => app.audio.init(), { once: true });
addEventListener('keydown', () => app.audio.init(), { once: true });

// ---------- Schleife ----------
let last = performance.now();
let lastW = 0, lastH = 0, winW = 0, winH = 0;
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
