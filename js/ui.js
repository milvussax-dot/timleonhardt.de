// Menüs, Lobby, Ergebnisse und HUD (DOM-Overlay über der 3D-Szene)
import { TRACKS, PARKS } from './course.js';
import { WEATHERS, WEATHER_LIST } from './weather.js';
import { BOT_DIFFS } from './bot.js';
import { MEDALS, medalSvg, timeThresholds, SCORE_THRESHOLDS, DIST_THRESHOLDS } from './medals.js';
import { MODES, modeById, boardKey } from './game.js';
import { dailyState } from './challenges.js';
import { ONLINE_MODES, higherIsBetter } from './net.js';
import { fmtTime, fmtDelta, escapeHtml as esc } from './rng.js';
import { computePar } from './bot.js';
import { Course } from './course.js';

const ICON = {
  zeit: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="27" r="15" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M24 27v-8M19 6h10M24 6v6M37 14l3-3" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  bots: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="15" width="30" height="24" rx="7" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="18.5" cy="27" r="3" fill="currentColor"/><circle cx="29.5" cy="27" r="3" fill="currentColor"/><path d="M24 15V8M20 8h8M5 25v6M43 25v6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  slalom: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 42V8M36 42V8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M12 9h13l-3 5 3 5H12zM36 22H23l3 5-3 5h13z" fill="currentColor"/></svg>',
  freestyle: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 30a15 15 0 1 1 9 13" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M5 25l5 6 6-5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25" cy="25" r="4" fill="currentColor"/></svg>',
  lawine: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 40L19 14l8 12 5-7 12 21z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="M6 33c5-4 9 2 14-1s7-6 12-3 8 2 10 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};
const WICON = {
  sonne: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  abend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16a6 6 0 0 1 12 0z" fill="currentColor"/><path d="M2 19h20M12 4v3M4.5 9l2 1.5M19.5 9l-2 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  nacht: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>',
  sturm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  nebel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h18M5 12h14M3 16h18M7 20h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
const SEC_LABEL = { open: 'Hang', woods: 'Wald', boulders: 'Felsen', fork: 'Gabelung', drops: 'Stufen', gully: 'Rinne', moguls: 'Buckel', jumps: 'Sprünge', ridge: 'Grat', meadow: 'Alm', lake: 'Eissee', chasm: 'Spalte', creek: 'Bach' };
const COLORS = ['#ff5a36', '#ffb547', '#3ee08f', '#22c3ee', '#3b82f6', '#a855f7', '#ec4899', '#f5f7fa', '#1f2937'];
const HELMETS = ['#f5f7fa', '#1f2937', '#ff5a36', '#ffd23f', '#22c3ee', '#a855f7'];

export function valueStr(mode, v) {
  if (v == null) return '–';
  if (mode === 'freestyle') return Math.round(v).toLocaleString('de-DE') + ' Pkt';
  if (mode === 'lawine') return Math.round(v).toLocaleString('de-DE') + ' m';
  return fmtTime(v);
}

const parCache = {};
function parFor(mode, trackId) {
  const k = mode + trackId;
  if (parCache[k] == null) {
    const def = TRACKS.find((t) => t.id === trackId);
    parCache[k] = computePar(new Course(def, mode === 'slalom' ? 'slalom' : 'race'));
  }
  return parCache[k];
}

function nextGoal(mode, trackId, medal) {
  if (medal >= 4) return null;
  const tier = medal + 1;
  if (mode === 'freestyle') return `${MEDALS[tier].name}: ${SCORE_THRESHOLDS[trackId][tier].toLocaleString('de-DE')} Pkt`;
  if (mode === 'lawine') return `${MEDALS[tier].name}: ${DIST_THRESHOLDS[tier].toLocaleString('de-DE')} m`;
  const th = timeThresholds(parFor(mode, trackId));
  return `${MEDALS[tier].name}: ${fmtTime(th[tier])}`;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.toastEl = document.getElementById('toast');
    this.current = null;
    this.timer = null;
    this.setupState = { mode: 'zeit', trackId: 'edelweiss', parkId: 'kristall', weather: 'sonne', bots: 4, botDiff: 1 };
  }

  show(name, html, bind) {
    clearInterval(this.timer);
    this.root.innerHTML = `<div class="screen screen-${name}">${html}</div>`;
    this.current = name;
    const el = this.root.firstElementChild;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button, [data-act]');
      if (b && !b.disabled) this.app.audio.click();
    });
    if (bind) bind(el);
    const first = el.querySelector('[data-autofocus]');
    if (first) first.focus();
  }

  hide() {
    clearInterval(this.timer);
    this.root.innerHTML = '';
    this.current = null;
  }

  toast(msg, type = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + type;
    d.textContent = msg;
    this.toastEl.appendChild(d);
    setTimeout(() => d.classList.add('out'), 2800);
    setTimeout(() => d.remove(), 3300);
  }

  back() {
    const map = { modes: 'menu', setup: 'modes', online: 'menu', challenges: 'menu', board: 'menu', settings: 'menu' };
    const to = map[this.current];
    if (to === 'menu') this.menu();
    else if (to === 'modes') this.modes();
  }

  // ---------------- Hauptmenü ----------------
  menu() {
    const app = this.app;
    const daily = dailyState(app.store);
    const doneN = daily.filter((d) => d.done).length;
    const medals = Object.values(app.store.data.medals).filter((m) => m > 0).length;
    const name = app.store.profile.name;
    this.show('menu', `
      <div class="menu-wrap">
        <div class="brand">
          <div class="eyebrow">Ski-Arcade · Saison 2026</div>
          <h1 class="logo"><span>Gipfel</span><span>rausch</span></h1>
          <p class="tag">${name ? `Servus, <b>${esc(name)}</b>. ` : ''}Fünf Modi, fünf Wetterlagen und Online-Rennen gegen Freunde.</p>
        </div>
        <nav class="menu-list">
          <button class="btn-big primary" data-act="play" data-autofocus><span>Spielen</span><small>Zeitfahren · Bots · Slalom · Freestyle · Lawine</small></button>
          <button class="btn-big" data-act="online"><span>Online</span><small>Raum erstellen oder per Code beitreten</small></button>
          <button class="btn-big" data-act="challenges"><span>Challenges</span><small>${doneN}/3 heute erledigt · ${medals} Medaillen</small></button>
          <button class="btn-big" data-act="board"><span>Bestenliste</span><small>Deine Top-Läufe pro Strecke</small></button>
          <button class="btn-big" data-act="settings"><span>Einstellungen</span><small>Name, Outfit, Grafik, Sound</small></button>
        </nav>
        <div class="menu-foot"><kbd>←</kbd><kbd>→</kbd> lenken · <kbd>↑</kbd> Hocke · <kbd>↓</kbd> bremsen · <kbd>Leertaste</kbd> springen · <kbd>Q</kbd><kbd>E</kbd> Tricks · <kbd>Shift</kbd> Boost<br>In der Luft: <kbd>↑</kbd><kbd>↓</kbd> Flips · <kbd>←</kbd><kbd>→</kbd> Spins · <kbd>Q</kbd><kbd>E</kbd> halten = Grabs</div>
      </div>`, (el) => {
      el.querySelector('[data-act=play]').onclick = () => this.modes();
      el.querySelector('[data-act=online]').onclick = () => this.online();
      el.querySelector('[data-act=challenges]').onclick = () => this.challenges();
      el.querySelector('[data-act=board]').onclick = () => this.board();
      el.querySelector('[data-act=settings]').onclick = () => this.settings();
    });
  }

  topbar(title) {
    return `<header class="topbar"><button class="back" data-act="back">← Zurück</button><h2>${title}</h2></header>`;
  }

  bindBack(el) {
    el.querySelectorAll('[data-act=back]').forEach((b) => (b.onclick = () => this.back()));
  }

  // ---------------- Modi ----------------
  modes() {
    const app = this.app;
    this.show('modes', `${this.topbar('Modus wählen')}
      <div class="mode-grid">
        ${MODES.map((m, i) => `
          <button class="mode-card" data-mode="${m.id}" ${i === 0 ? 'data-autofocus' : ''}>
            <span class="mode-ico">${ICON[m.id]}</span>
            <span class="mode-name">${m.name}</span>
            <span class="mode-desc">${m.desc}</span>
            <span class="mode-best">${this.modeBestLine(m.id)}</span>
          </button>`).join('')}
      </div>`, (el) => {
      this.bindBack(el);
      el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { this.setupState.mode = b.dataset.mode; this.setup(); }));
    });
  }

  modeBestLine(mode) {
    const s = this.app.store;
    if (mode === 'lawine') { const b = s.best('lawine'); return b ? `Rekord ${valueStr('lawine', b)}` : 'Noch kein Lauf'; }
    const list = mode === 'freestyle' ? PARKS : TRACKS;
    const n = list.filter((t) => s.medal(boardKey(mode, t.id)) > 0).length;
    return `${n}/${list.length} Strecken mit Medaille`;
  }

  // ---------------- Setup ----------------
  setup() {
    const app = this.app, S = this.setupState, store = app.store;
    const mode = S.mode;
    const m = modeById(mode);
    const tracks = mode === 'freestyle' ? PARKS : mode === 'lawine' ? [] : TRACKS;
    const selId = mode === 'freestyle' ? S.parkId : S.trackId;
    const trackCards = tracks.map((t) => {
      const key = boardKey(mode, t.id);
      const medal = store.medal(key);
      const best = store.best(key);
      return `<button class="track-card ${t.id === selId ? 'sel' : ''}" data-track="${t.id}">
        <span class="tc-top"><span class="diff d${t.tier}">${t.diff}</span>${medalSvg(medal, 26)}</span>
        <span class="tc-name">${t.name}</span>
        <span class="tc-meta">${(t.length / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2 })} km · ${best != null ? 'Best ' + valueStr(mode, best) : 'noch kein Lauf'}</span>
        ${t.recipe && (mode === 'zeit' || mode === 'bots') ? `<span class="tc-secs">${[...new Set(t.recipe)].map((r) => SEC_LABEL[r] || r).join(' · ')}</span>` : ''}
      </button>`;
    }).join('');
    const lawineInfo = mode === 'lawine' ? `<div class="info-card">
        <p>Die Strecke ist endlos und wird mit jedem Meter enger und wilder. Hinter dir rollt eine Lawine, die stetig schneller wird. Blaue Kristalle geben dir einen Boost.</p>
        <p class="muted">Rekord: <b>${valueStr('lawine', store.best('lawine'))}</b> · Medaillen ab ${DIST_THRESHOLDS.slice(1).map((d) => d.toLocaleString('de-DE') + ' m').join(' / ')}</p>
      </div>` : '';
    const botsRow = mode === 'bots' ? `
      <div class="setup-row">
        <h4>Gegner</h4>
        <div class="stepper"><button data-bots="-1" aria-label="Weniger Bots">−</button><span id="bots-n">${S.bots}</span><button data-bots="1" aria-label="Mehr Bots">+</button></div>
        <div class="seg">${BOT_DIFFS.map((d, i) => `<button class="${i === S.botDiff ? 'sel' : ''}" data-diff="${i}">${d.name}</button>`).join('')}</div>
      </div>` : '';
    const goalLine = tracks.length ? (() => { const g = nextGoal(mode, selId, store.medal(boardKey(mode, selId))); return g ? `Nächstes Ziel – ${g}` : 'Alle Medaillen geholt. Respekt!'; })() : '';
    this.show('setup', `${this.topbar(m.name)}
      <div class="setup">
        ${tracks.length ? `<h4>Strecke</h4><div class="track-grid">${trackCards}</div><div class="goal">${goalLine}</div>` : lawineInfo}
        <h4>Wetter &amp; Tageszeit</h4>
        <div class="chips">${WEATHER_LIST.map((w) => `<button class="chip ${w === S.weather ? 'sel' : ''}" data-weather="${w}">${WICON[w]}<span>${WEATHERS[w].name}</span></button>`).join('')}</div>
        ${botsRow}
        <div class="setup-go"><button class="btn primary big" data-act="start" data-autofocus>Start <kbd>Enter</kbd></button></div>
      </div>`, (el) => {
      this.bindBack(el);
      el.querySelectorAll('[data-track]').forEach((b) => (b.onclick = () => { if (mode === 'freestyle') S.parkId = b.dataset.track; else S.trackId = b.dataset.track; this.setup(); }));
      el.querySelectorAll('[data-weather]').forEach((b) => (b.onclick = () => { S.weather = b.dataset.weather; el.querySelectorAll('[data-weather]').forEach((x) => x.classList.toggle('sel', x === b)); }));
      el.querySelectorAll('[data-bots]').forEach((b) => (b.onclick = () => { S.bots = Math.max(1, Math.min(6, S.bots + +b.dataset.bots)); el.querySelector('#bots-n').textContent = S.bots; }));
      el.querySelectorAll('[data-diff]').forEach((b) => (b.onclick = () => { S.botDiff = +b.dataset.diff; el.querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('sel', x === b)); }));
      el.querySelector('[data-act=start]').onclick = () => this.startFromSetup();
    });
  }

  startFromSetup() {
    const S = this.setupState;
    this.app.startGame({ mode: S.mode, trackId: S.mode === 'freestyle' ? S.parkId : S.trackId, weather: S.weather, bots: S.bots, botDiff: S.botDiff });
  }

  // ---------------- Online ----------------
  online(prefill = '') {
    const app = this.app, p = app.store.profile;
    this.show('online', `${this.topbar('Online mit Freunden')}
      <div class="panel narrow">
        <label class="field"><span>Dein Name</span><input id="on-name" maxlength="16" placeholder="z. B. Pistensau" value="${esc(p.name || '')}" autocomplete="off"></label>
        <div class="online-actions">
          <button class="btn primary big" data-act="host">Raum erstellen</button>
          <div class="or"><span>oder beitreten</span></div>
          <div class="join-row"><input id="on-code" maxlength="5" placeholder="CODE" value="${esc(prefill)}" autocomplete="off" spellcheck="false"><button class="btn" data-act="join">Beitreten</button></div>
        </div>
        <p class="note">Peer-to-Peer über WebRTC, bis zu 8 Spieler. Wer den Raum erstellt, ist Host und wählt Modus, Strecke und Wetter. Teile einfach den Einladungslink.</p>
        <div class="status" id="on-status" role="status"></div>
      </div>`, (el) => {
      this.bindBack(el);
      const nameEl = el.querySelector('#on-name');
      const codeEl = el.querySelector('#on-code');
      const status = el.querySelector('#on-status');
      codeEl.addEventListener('input', () => { codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      const saveName = () => {
        const n = nameEl.value.trim().slice(0, 16);
        if (!n) { status.textContent = 'Bitte gib zuerst einen Namen ein.'; status.className = 'status bad'; nameEl.focus(); return false; }
        app.store.profile.name = n;
        app.store.save();
        return true;
      };
      const busy = (b, msg) => { el.querySelectorAll('button').forEach((x) => (x.disabled = b)); status.textContent = msg || ''; status.className = 'status'; };
      el.querySelector('[data-act=host]').onclick = async () => {
        if (!saveName()) return;
        busy(true, 'Raum wird erstellt …');
        try { await app.hostRoom(); } catch (e) { busy(false); status.textContent = e.message; status.className = 'status bad'; }
      };
      const join = async () => {
        if (!saveName()) return;
        busy(true, 'Verbinde …');
        try { await app.joinRoom(codeEl.value); } catch (e) { busy(false); status.textContent = e.message; status.className = 'status bad'; }
      };
      el.querySelector('[data-act=join]').onclick = join;
      codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
      if (prefill) codeEl.focus(); else nameEl.focus();
    });
  }

  lobby() {
    const app = this.app, net = app.net;
    if (!net) return this.menu();
    const s = net.settings;
    const host = net.isHost;
    const players = net.playerList || [];
    const tracks = s.mode === 'freestyle' ? PARKS : s.mode === 'lawine' ? [] : TRACKS;
    const trackName = s.mode === 'lawine' ? 'Lawinenhang (endlos)' : (tracks.find((t) => t.id === s.trackId) || {}).name || '–';
    const racing = net.phase === 'race';
    this.show('lobby', `
      <header class="topbar"><button class="back" data-act="leave">← Raum verlassen</button><h2>Online-Raum</h2></header>
      <div class="lobby">
        <div class="lobby-code">
          <span class="eyebrow">Raumcode</span>
          <div class="code">${esc(net.code || '')}</div>
          <button class="btn small" data-act="copy">Einladungslink kopieren</button>
          <div class="muted small link">${esc(net.inviteLink())}</div>
        </div>
        <div class="lobby-cols">
          <div class="panel">
            <h4>Spieler (${players.length}/8)</h4>
            <ul class="plist">${players.map((p) => `<li><i style="background:${esc(p.jacket || '#fff')}"></i><span>${esc(p.name)}</span>${p.isHost ? '<em>Host</em>' : ''}${p.id === net.myId ? '<em class="me">du</em>' : ''}${p.inRace && racing ? '<em class="race">fährt</em>' : ''}</li>`).join('')}</ul>
          </div>
          <div class="panel">
            <h4>Rennen</h4>
            ${host ? `
              <div class="seg wrap">${ONLINE_MODES.map((m) => `<button class="${m.id === s.mode ? 'sel' : ''}" data-omode="${m.id}">${m.name}</button>`).join('')}</div>
              ${tracks.length ? `<div class="seg wrap">${tracks.map((t) => `<button class="${t.id === s.trackId ? 'sel' : ''}" data-otrack="${t.id}">${t.name}</button>`).join('')}</div>` : ''}
              <div class="chips">${WEATHER_LIST.map((w) => `<button class="chip ${w === s.weather ? 'sel' : ''}" data-oweather="${w}">${WICON[w]}<span>${WEATHERS[w].short}</span></button>`).join('')}</div>
              <button class="btn primary big" data-act="ostart" ${racing ? 'disabled' : ''}>${racing ? 'Rennen läuft …' : 'Rennen starten'}</button>
            ` : `
              <dl class="kv"><dt>Modus</dt><dd>${(ONLINE_MODES.find((m) => m.id === s.mode) || {}).name}</dd><dt>Strecke</dt><dd>${esc(trackName)}</dd><dt>Wetter</dt><dd>${WEATHERS[s.weather] ? WEATHERS[s.weather].name : ''}</dd></dl>
              <p class="waiting">${racing ? 'Ein Rennen läuft gerade. Du bist beim nächsten dabei.' : 'Warte, bis der Host das Rennen startet …'}</p>
            `}
          </div>
        </div>
      </div>`, (el) => {
      el.querySelector('[data-act=leave]').onclick = () => app.leaveRoom();
      el.querySelector('[data-act=copy]').onclick = () => {
        const link = net.inviteLink();
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => this.toast('Link kopiert'), () => this.toast('Kopieren nicht möglich – Link markieren'));
      };
      if (host) {
        el.querySelectorAll('[data-omode]').forEach((b) => (b.onclick = () => {
          const mode = b.dataset.omode;
          const patch = { mode };
          if (mode === 'freestyle' && !PARKS.find((p) => p.id === s.trackId)) patch.trackId = PARKS[0].id;
          if ((mode === 'zeit' || mode === 'slalom') && !TRACKS.find((t) => t.id === s.trackId)) patch.trackId = TRACKS[0].id;
          net.setSettings(patch);
        }));
        el.querySelectorAll('[data-otrack]').forEach((b) => (b.onclick = () => net.setSettings({ trackId: b.dataset.otrack })));
        el.querySelectorAll('[data-oweather]').forEach((b) => (b.onclick = () => net.setSettings({ weather: b.dataset.oweather })));
        const st = el.querySelector('[data-act=ostart]');
        if (st) st.onclick = () => net.startRace();
      }
    });
  }

  // ---------------- Challenges & Medaillen ----------------
  challenges() {
    const app = this.app, store = app.store;
    const daily = dailyState(store);
    const streak = store.data.streak;
    const row = (mode, list) => list.map((t) => {
      const key = boardKey(mode, t.id);
      return `<div class="mrow"><span>${t.name}</span><span class="mbest">${valueStr(mode, store.best(key))}</span>${medalSvg(store.medal(key), 26)}</div>`;
    }).join('');
    this.show('challenges', `${this.topbar('Challenges & Medaillen')}
      <div class="ch-wrap">
        <div class="panel">
          <div class="ch-head"><h4>Heute</h4><span class="streak">${streak.count > 0 ? `Serie: ${streak.count} ${streak.count === 1 ? 'Tag' : 'Tage'}` : 'Schaff alle drei für eine Serie'}</span></div>
          <ul class="daily">${daily.map((c) => `<li class="${c.done ? 'done' : ''}"><i>${c.done ? '✓' : ''}</i><div><b>${esc(c.text)}</b><small>${esc(c.hint)}</small></div></li>`).join('')}</ul>
          <p class="muted small">Neue Challenges gibt es jeden Tag um Mitternacht.</p>
        </div>
        <div class="panel medals">
          <h4>Medaillen</h4>
          <div class="mgroup"><h5>Rennen (Zeitfahren &amp; Bots)</h5>${row('zeit', TRACKS)}</div>
          <div class="mgroup"><h5>Slalom</h5>${row('slalom', TRACKS)}</div>
          <div class="mgroup"><h5>Freestyle</h5>${row('freestyle', PARKS)}</div>
          <div class="mgroup"><h5>Lawinen-Flucht</h5><div class="mrow"><span>Lawinenhang</span><span class="mbest">${valueStr('lawine', store.best('lawine'))}</span>${medalSvg(store.medal('lawine'), 26)}</div></div>
        </div>
      </div>`, (el) => this.bindBack(el));
  }

  // ---------------- Bestenliste ----------------
  board(tab = 'zeit', trackId = null) {
    const store = this.app.store;
    const tabs = [['zeit', 'Rennen'], ['slalom', 'Slalom'], ['freestyle', 'Freestyle'], ['lawine', 'Lawine']];
    const list = tab === 'freestyle' ? PARKS : tab === 'lawine' ? [] : TRACKS;
    if (list.length && !list.find((t) => t.id === trackId)) trackId = list[0].id;
    const key = boardKey(tab, trackId);
    const rows = store.board(key);
    this.show('board', `${this.topbar('Bestenliste')}
      <div class="board">
        <div class="seg">${tabs.map(([id, n]) => `<button class="${id === tab ? 'sel' : ''}" data-tab="${id}">${n}</button>`).join('')}</div>
        ${list.length ? `<div class="seg wrap light">${list.map((t) => `<button class="${t.id === trackId ? 'sel' : ''}" data-btrack="${t.id}">${t.name}</button>`).join('')}</div>` : ''}
        <table class="tbl">
          <thead><tr><th>#</th><th>Name</th><th>${tab === 'freestyle' ? 'Punkte' : tab === 'lawine' ? 'Distanz' : 'Zeit'}</th><th>Wetter</th><th>Datum</th></tr></thead>
          <tbody>${rows.length ? rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${valueStr(tab, r.v)}</td><td>${WEATHERS[r.w] ? WEATHERS[r.w].short : ''}</td><td>${new Date(r.date).toLocaleDateString('de-DE')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Noch keine Läufe. Ab auf die Piste!</td></tr>'}</tbody>
        </table>
        <p class="muted small">Die Bestenliste wird lokal in diesem Browser gespeichert.</p>
      </div>`, (el) => {
      this.bindBack(el);
      el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => this.board(b.dataset.tab, null)));
      el.querySelectorAll('[data-btrack]').forEach((b) => (b.onclick = () => this.board(tab, b.dataset.btrack)));
    });
  }

  // ---------------- Einstellungen ----------------
  settings() {
    const app = this.app, p = app.store.profile;
    const sw = (arr, cur, attr) => arr.map((c) => `<button class="swatch ${c === cur ? 'sel' : ''}" data-${attr}="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('');
    this.show('settings', `${this.topbar('Einstellungen')}
      <div class="panel narrow settings">
        <label class="field"><span>Name</span><input id="st-name" maxlength="16" value="${esc(p.name || '')}" placeholder="Dein Fahrername" autocomplete="off"></label>
        <div class="field"><span>Jacke</span><div class="swatches">${sw(COLORS, p.jacket, 'jacket')}</div></div>
        <div class="field"><span>Helm</span><div class="swatches">${sw(HELMETS, p.helmet, 'helmet')}</div></div>
        <div class="field"><span>Grafik</span><div class="seg">${['hoch', 'mittel', 'niedrig'].map((q) => `<button class="${q === p.quality ? 'sel' : ''}" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
        <div class="field"><span>Sound</span><div class="seg"><button class="${p.sound ? 'sel' : ''}" data-sound="1">An</button><button class="${!p.sound ? 'sel' : ''}" data-sound="0">Aus</button></div></div>
        <h4>Steuerung</h4>
        <table class="keys">
          <tr><td><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd></td><td>Lenken · im Rhythmus links/rechts carven gibt Schub · in der Luft: Spin</td></tr>
          <tr><td><kbd>↑</kbd> / <kbd>W</kbd></td><td>Hocke (schneller) · in der Luft: Frontflip</td></tr>
          <tr><td><kbd>↓</kbd> / <kbd>S</kbd></td><td>Bremsen · in der Luft: Backflip</td></tr>
          <tr><td><kbd>Leertaste</kbd></td><td>Springen (Ollie) · vom Rail abspringen</td></tr>
          <tr><td><kbd>Q</kbd> / <kbd>E</kbd></td><td>Am Boden: Butter-360 links/rechts · in der Luft halten: Mute- / Tail-Grab</td></tr>
          <tr><td><kbd>Shift</kbd></td><td>Boost – wird durch Tricks und saubere Schwünge aufgeladen</td></tr>
          <tr><td><kbd>Esc</kbd> · <kbd>R</kbd> · <kbd>M</kbd></td><td>Pause · Neustart · Ton an/aus</td></tr>
        </table>
        <p class="muted small">Tricks zählen in jedem Modus: Sie füllen deine Boost-Leiste und landen als Trickpunkte in der Wertung. Wer beim Absprung noch eine Taste hält, muss sie erst loslassen, bevor sie in der Luft wirkt – so gibt es keine ungewollten Flips.</p>
      </div>`, (el) => {
      this.bindBack(el);
      const nameEl = el.querySelector('#st-name');
      nameEl.addEventListener('input', () => { p.name = nameEl.value.trim().slice(0, 16); app.store.save(); });
      el.querySelectorAll('[data-jacket]').forEach((b) => (b.onclick = () => { p.jacket = b.dataset.jacket; app.store.save(); this.settings(); }));
      el.querySelectorAll('[data-helmet]').forEach((b) => (b.onclick = () => { p.helmet = b.dataset.helmet; app.store.save(); this.settings(); }));
      el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { p.quality = b.dataset.q; app.store.save(); app.applyQuality(); this.settings(); }));
      el.querySelectorAll('[data-sound]').forEach((b) => (b.onclick = () => { p.sound = b.dataset.sound === '1'; app.store.save(); app.audio.setEnabled(p.sound); this.settings(); }));
    });
  }

  // ---------------- Pause ----------------
  pause() {
    this.show('pause', `
      <div class="modal">
        <h2>Pause</h2>
        <button class="btn primary big" data-act="resume" data-autofocus>Weiter <kbd>Esc</kbd></button>
        <button class="btn big" data-act="restart">Neustart <kbd>R</kbd></button>
        <button class="btn big ghost" data-act="menu">Zum Menü</button>
      </div>`, (el) => {
      el.querySelector('[data-act=resume]').onclick = () => this.app.resume();
      el.querySelector('[data-act=restart]').onclick = () => this.app.restart();
      el.querySelector('[data-act=menu]').onclick = () => this.app.toMenu();
    });
  }

  // ---------------- Ergebnis ----------------
  results(res) {
    const app = this.app;
    const m = modeById(res.mode);
    const W = WEATHERS[res.weather] || WEATHERS.sonne;
    let title;
    if (res.caught) title = 'Von der Lawine erwischt';
    else if (res.online) title = 'Im Ziel';
    else if (res.mode === 'bots') title = res.position === 1 ? 'Sieg!' : `${res.position}. Platz`;
    else title = res.pb && res.prev != null ? (res.mode === 'freestyle' ? 'Neuer Highscore!' : 'Neue Bestzeit!') : 'Im Ziel';
    const medal = res.medal || 0;
    const goal = !res.online ? nextGoal(res.mode, res.trackId, medal) : null;
    const prevLine = res.online ? '' : res.prev == null ? 'Erster Lauf auf dieser Strecke' : res.pb
      ? `Vorher: ${valueStr(res.mode, res.prev)} (${fmtDelta(res.mode === 'zeit' || res.mode === 'bots' || res.mode === 'slalom' ? res.value - res.prev : res.prev - res.value).replace('.', ',')})`
      : `Deine Bestmarke: ${valueStr(res.mode, res.prev)}`;
    const stats = [
      ['Höchstgeschwindigkeit', Math.round(res.maxSpeed * 3.6) + ' km/h'],
      ['Airtime', res.airTime.toFixed(1).replace('.', ',') + ' s'],
      ['Flips / Spins', `${res.flips} / ${res.spins}`],
      ['Stürze', res.crashes],
    ];
    if (res.mode === 'slalom') stats.push(['Tore', `${res.passed}/${res.gates}${res.missed ? ` (+${res.missed * 3} s)` : ''}`]);
    if (res.mode === 'freestyle' && res.bestTrick) stats.push(['Bester Trick', esc(res.bestTrick)]);
    if (res.mode === 'lawine') stats.push(['Boosts', res.pickups]);
    if (res.mode !== 'freestyle' && res.mode !== 'lawine' && res.score) stats.push(['Trick-Punkte', res.score.toLocaleString('de-DE')]);

    const sideHtml = () => {
      if (res.online) return this.netResultsHtml();
      if (res.mode === 'bots') {
        const sess = app.session;
        const list = sess && sess.standings ? sess.standings() : [];
        return `<h4>Rangliste</h4><ol class="rank">${list.map((r) => `<li class="${r.isPlayer ? 'me' : ''}"><i style="background:${r.jacket}"></i><span>${esc(r.name)}</span><b>${r.time != null ? fmtTime(r.time) : 'fährt …'}</b></li>`).join('')}</ol>`;
      }
      const rows = app.store.board(res.boardKey).slice(0, 6);
      return `<h4>Deine Top-Läufe</h4><ol class="rank">${rows.map((r, i) => `<li class="${i + 1 === res.rank && r.date === (rows[i] || {}).date ? '' : ''}${res.rank === i + 1 ? ' me' : ''}"><span>${esc(r.name)}</span><small>${WEATHERS[r.w] ? WEATHERS[r.w].short : ''}</small><b>${valueStr(res.mode, r.v)}</b></li>`).join('')}</ol>`;
    };
    const net = app.net;
    const actions = res.online
      ? (net && net.isHost
        ? `<button class="btn primary big" data-act="rematch" ${net.phase === 'results' ? '' : 'disabled'}>Revanche</button><button class="btn big" data-act="lobby">Zur Lobby</button>`
        : `<button class="btn big" data-act="leave">Raum verlassen</button><span class="muted">Der Host startet die nächste Runde.</span>`)
      : `<button class="btn primary big" data-act="again" data-autofocus>Nochmal <kbd>R</kbd></button><button class="btn big" data-act="setup">Strecke ändern</button><button class="btn big ghost" data-act="menu">Menü</button>`;
    const chHtml = res.newChallenges && res.newChallenges.length
      ? `<div class="res-ch">${res.newChallenges.map((c) => `<div><i>✓</i> Challenge geschafft: <b>${esc(c.text)}</b></div>`).join('')}</div>` : '';

    this.show('results', `
      <div class="results">
        <div class="res-head">
          <div class="eyebrow">${m.name} · ${esc(res.trackName)} · ${W.name}</div>
          <h2>${title}</h2>
        </div>
        <div class="res-main">
          <div class="res-medal ${medal ? 'm' + medal : 'none'}">${medalSvg(medal, 76)}<span>${medal ? MEDALS[medal].name : 'Keine Medaille'}</span></div>
          <div class="res-value">${valueStr(res.mode, res.value)}</div>
          <div class="res-sub">${prevLine}${goal ? ` · Nächstes Ziel – ${goal}` : ''}</div>
        </div>
        ${chHtml}
        <div class="res-cols">
          <dl class="res-stats">${stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          <div class="res-side" id="res-side">${sideHtml()}</div>
        </div>
        <div class="res-actions">${actions}</div>
      </div>`, (el) => {
      const on = (act, fn) => { const b = el.querySelector(`[data-act=${act}]`); if (b) b.onclick = fn; };
      on('again', () => app.restart());
      on('setup', () => { app.toMenu(true); this.setup(); });
      on('menu', () => app.toMenu());
      on('rematch', () => net && net.startRace());
      on('lobby', () => net && net.backToLobby());
      on('leave', () => app.leaveRoom());
    });
    if (res.mode === 'bots' || res.online) {
      this.timer = setInterval(() => {
        const side = this.root.querySelector('#res-side');
        if (side) side.innerHTML = sideHtml();
        const rm = this.root.querySelector('[data-act=rematch]');
        if (rm && net) rm.disabled = net.phase !== 'results';
      }, 500);
    }
  }

  netResultsHtml() {
    const r = this.app.netResults;
    if (!r) return '<h4>Ergebnisse</h4><p class="muted">Warte auf die anderen …</p>';
    const me = this.app.net && this.app.net.myId;
    return `<h4>Ergebnisse${r.final ? '' : ' <small class="muted">(live)</small>'}</h4><ol class="rank">${r.list.map((p) => `<li class="${p.id === me ? 'me' : ''}"><i style="background:${esc(p.jacket || '#fff')}"></i><span>${esc(p.name)}</span><b>${p.pending ? 'fährt …' : p.dnf ? 'DNF' : valueStr(r.mode, p.v)}</b></li>`).join('')}</ol>`;
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.cache = {};
  }

  setup(sess) {
    this.sess = sess;
    const mode = sess.mode;
    this.mode = mode;
    this.cache = {};
    const showProgress = !sess.course.endless;
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-label" id="h-tlabel">${mode === 'lawine' ? 'Distanz' : mode === 'freestyle' ? 'Punkte' : 'Zeit'}</div>
        <div class="hud-time" id="h-main">0:00.00</div>
        <div class="hud-sub"><span id="h-delta" class="delta"></span><span id="h-section" class="section"></span></div>
      </div>
      ${showProgress ? '<div class="hud-tc"><div class="progress"><div class="bar"></div><div id="h-marks"></div><span class="flag">ZIEL</span></div></div>' : '<div class="hud-tc"><div class="avgap"><span>Lawine</span><div class="avbar"><i id="h-avbar"></i></div><b id="h-avtxt"></b></div></div>'}
      <div class="hud-tr"><div class="hud-big" id="h-big"></div><div class="hud-label" id="h-blabel"></div></div>
      <div class="hud-bl"><div class="speed"><span id="h-speed">0</span><small>km/h</small></div><div class="speedbar"><i id="h-speedbar"></i></div>
        <div class="meter" id="h-meterbox"><span>Boost <kbd>Shift</kbd></span><div class="meterbar"><i id="h-meter"></i></div></div></div>
      <div class="hud-center" id="h-center"></div>
      <div class="hud-tricks" id="h-tricks"></div>
      <div class="hud-popups" id="h-popups"></div>
      <div class="hud-banner" id="h-banner"></div>
      ${mode === 'lawine' ? '<div class="vignette" id="h-vig"></div>' : ''}
      <button class="hud-pause" id="h-pause" aria-label="Pause">II</button>
    `;
    this.$ = (id) => this.el.querySelector('#' + id);
    this.marks = null;
    const pb = this.$('h-pause');
    if (pb) pb.onclick = () => sess.app.togglePause();
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  set(id, val, prop = 'textContent') {
    if (this.cache[id] === val) return;
    this.cache[id] = val;
    const e = this.$(id);
    if (e) e[prop] = val;
  }

  update(sess) {
    if (!this.$) return;
    const p = sess.player;
    if (!p) return;
    const st = p.st, S = sess.stats, mode = sess.mode;
    const t = sess.state === 'countdown' ? 0 : p.finished && p.finishTime != null ? p.finishTime : sess.time + S.missed * 3;
    if (mode === 'lawine') this.set('h-main', Math.round(S.distance).toLocaleString('de-DE') + ' m');
    else if (mode === 'freestyle') this.set('h-main', Math.round(S.score).toLocaleString('de-DE'));
    else this.set('h-main', fmtTime(t));
    this.set('h-section', sess.course.sectionAt(st.s));
    // Delta zum Ghost / Info
    if (sess.ghost && sess.state === 'run' && !p.finished) {
      const now = performance.now();
      if (!this.lastDelta || now - this.lastDelta > 250) {
        this.lastDelta = now;
        const d = sess.ghostDelta(st.s);
        if (d != null) {
          this.set('h-delta', fmtDelta(d).replace('.', ','));
          this.$('h-delta').className = d <= 0 ? 'delta good' : 'delta bad';
        }
      }
    } else if (mode === 'freestyle') {
      this.set('h-delta', fmtTime(sess.time));
    } else if (mode !== 'lawine' && !sess.ghost) {
      this.set('h-delta', '');
    }
    // rechts oben
    if (mode === 'bots' || sess.online) {
      let pos = 1, total = 1;
      if (mode === 'bots') {
        const list = sess.standings();
        total = list.length;
        pos = list.findIndex((r) => r.isPlayer) + 1;
      } else {
        total = 1 + sess.remotes.size;
        const hib = mode === 'freestyle';
        for (const rm of sess.remotes.values()) {
          if (hib ? rm.score > S.score : (rm.fin && !p.finished) || (!rm.fin && !p.finished && -rm.tgt.z > st.s)) pos++;
        }
      }
      this.set('h-big', `${pos}/${total}`);
      this.set('h-blabel', 'Platz');
    } else if (mode === 'slalom') {
      this.set('h-big', `${S.passed + S.missed}/${sess.course.gates.length}`);
      this.set('h-blabel', S.missed ? `Tore · ${S.missed} verpasst` : 'Tore');
    } else if (mode === 'freestyle') {
      this.set('h-big', S.combo > 1 ? `×${(1 + (S.combo - 1) * 0.5).toLocaleString('de-DE')}` : '');
      this.set('h-blabel', S.combo > 1 ? 'Combo' : '');
    } else if (mode === 'lawine') {
      this.set('h-big', Math.round(st.speed * 3.6) > 0 ? '' : '');
    }
    // Speed
    const kmh = Math.round(st.speed * 3.6);
    this.set('h-speed', String(kmh));
    const bar = this.$('h-speedbar');
    if (bar) bar.style.transform = `scaleX(${Math.min(1, st.speed / 40)})`;
    const mt = this.$('h-meter');
    if (mt) {
      mt.style.transform = `scaleX(${st.meter.toFixed(3)})`;
      const cls = 'meter' + (st.meter >= 0.999 ? ' full' : '') + (st.boosting ? ' on' : '');
      this.set('h-meterbox-cls', cls);
      this.$('h-meterbox').className = cls;
    }
    if (mode !== 'freestyle' && mode !== 'lawine' && S.score > 0 && !sess.ghost) this.set('h-delta', Math.round(S.score).toLocaleString('de-DE') + ' Trickpunkte');
    // Fortschritt
    const marks = this.$('h-marks');
    if (marks) {
      const L = sess.course.length;
      const items = [];
      if (sess.ghost) items.push({ f: -sess.ghost.st.z / L, c: '#9fe8ff', cls: 'ghost' });
      for (const r of sess.racers) if (!r.isPlayer) items.push({ f: r.st.s / L, c: r.jacket, cls: '' });
      for (const rm of sess.remotes.values()) items.push({ f: -rm.st.z / L, c: rm.jacket, cls: '' });
      items.push({ f: st.s / L, c: p.jacket, cls: 'me' });
      if (!this.marks || this.marks.length !== items.length) {
        marks.innerHTML = items.map((it) => `<i class="${it.cls}" style="background:${it.c}"></i>`).join('');
        this.marks = [...marks.children];
      }
      items.forEach((it, i) => { this.marks[i].style.left = (Math.max(0, Math.min(1, it.f)) * 100).toFixed(2) + '%'; });
    }
    const avb = this.$('h-avbar');
    if (avb && sess.avGap != null) {
      const g = Math.max(0, sess.avGap);
      avb.style.transform = `scaleX(${Math.min(1, g / 150)})`;
      avb.className = g < 35 ? 'danger' : g < 70 ? 'warn' : '';
      this.set('h-avtxt', Math.round(g) + ' m');
      const vig = this.$('h-vig');
      if (vig) vig.style.opacity = Math.max(0, Math.min(1, 1 - (g - 8) / 55)).toFixed(2);
    }
  }

  count(n) {
    const c = this.$ && this.$('h-center');
    if (!c) return;
    c.innerHTML = `<div class="count ${n === 0 ? 'go' : ''}">${n === 0 ? 'Los!' : n}</div>`;
    if (n === 0) setTimeout(() => { if (c.firstChild && c.firstChild.classList.contains('go')) c.innerHTML = ''; }, 900);
  }

  finish(text) {
    const c = this.$ && this.$('h-center');
    if (c) c.innerHTML = `<div class="count finish">${esc(text)}</div>`;
  }

  banner(name, hint) {
    const b = this.$ && this.$('h-banner');
    if (!b) return;
    b.innerHTML = `<b>${esc(name)}</b>${hint ? `<span>${esc(hint)}</span>` : ''}`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  popup(text, cls = '') {
    const box = this.$ && this.$('h-popups');
    if (!box) return;
    const d = document.createElement('div');
    d.className = 'pop ' + cls;
    d.textContent = text;
    box.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  trick(name, pts, mult, sketchy) {
    const box = this.$ && this.$('h-tricks');
    if (!box) return;
    const d = document.createElement('div');
    d.className = 'trick' + (sketchy ? ' sketchy' : '');
    d.innerHTML = `<b>${esc(name)}</b>${pts != null ? `<span>+${pts.toLocaleString('de-DE')}${mult > 1 ? ` <em>×${mult.toLocaleString('de-DE')}</em>` : ''}</span>` : ''}${sketchy ? '<small>wackelig</small>' : ''}`;
    box.prepend(d);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 1800);
    setTimeout(() => d.remove(), 2300);
  }
}
