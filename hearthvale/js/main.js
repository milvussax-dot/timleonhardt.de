// Oberfläche, Eingabe, Spielschleife, Speichern, Bestenliste
import { Game } from './sim.js';
import { Renderer } from './render.js';
import { ITEMS, BUILDINGS, BUILD_MENU, CROPS, STOCK_ORDER, SEASONS, MAX_ENERGY, CAN_SIZE, ACTIONS, G, YEAR_DAYS } from './data.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'hearthvale.save';
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.6, 2];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = (inner) => `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
const ICON = {
  wood: svg('<rect x="2" y="7" width="14" height="7" rx="3.5" fill="#a0703c"/><circle cx="15.5" cy="10.5" r="3.5" fill="#d9a35c"/><circle cx="15.5" cy="10.5" r="1.4" fill="#a0703c"/>'),
  stone: svg('<path d="M3 15 5 7l6-3 6 4 1 7z" fill="#9aa0a8"/><path d="M5 7l6-3 6 4-6 2z" fill="#c1c6cc"/>'),
  plank: svg('<rect x="2" y="5" width="16" height="4" rx="1" fill="#d9a35c"/><rect x="2" y="11" width="16" height="4" rx="1" fill="#c48c48"/>'),
  wheat: svg('<path d="M10 18V5" stroke="#b8932a" stroke-width="1.6"/><g fill="#e8c25a"><ellipse cx="8" cy="8" rx="1.8" ry="3" transform="rotate(-25 8 8)"/><ellipse cx="12" cy="8" rx="1.8" ry="3" transform="rotate(25 12 8)"/><ellipse cx="8" cy="12" rx="1.8" ry="3" transform="rotate(-25 8 12)"/><ellipse cx="12" cy="12" rx="1.8" ry="3" transform="rotate(25 12 12)"/><ellipse cx="10" cy="4.5" rx="1.6" ry="2.6"/></g>'),
  flour: svg('<path d="M5 7h10l1 10H4z" fill="#f2ead8" stroke="#c9bfa5"/><path d="M6 7c1-3 7-3 8 0" fill="#e6dcc4"/>'),
  bread: svg('<path d="M3 14c0-5 3-7 7-7s7 2 7 7v1H3z" fill="#c9843f"/><path d="M7 9l-1 3M10 8v3M13 9l1 3" stroke="#f0c48a" stroke-width="1.4" stroke-linecap="round"/>'),
  berry: svg('<circle cx="7.5" cy="12" r="4" fill="#c23a5a"/><circle cx="13" cy="11" r="3.5" fill="#d9486a"/><path d="M10 7c0-2 2-4 4-4" stroke="#3f8a3a" stroke-width="1.6" fill="none"/>'),
  fish: svg('<path d="M3 10c3-5 9-5 12 0-3 5-9 5-12 0z" fill="#6aa8d8"/><path d="M15 10l3-3v6z" fill="#4a88b8"/><circle cx="6.5" cy="9.3" r="1" fill="#1d3a55"/>'),
  carrot: svg('<path d="M6 8l9 2-8 8z" fill="#ee8a2a"/><path d="M13 7l4-4M12 6l1-4M14 8l4-1" stroke="#4f9a3a" stroke-width="1.6" stroke-linecap="round"/>'),
  pumpkin: svg('<ellipse cx="10" cy="12" rx="7" ry="5.5" fill="#e8762a"/><path d="M10 7v10M6 8c-1 3-1 6 0 8M14 8c1 3 1 6 0 8" stroke="#c45a1a" stroke-width="1" fill="none"/><path d="M10 7c0-2 1-3 2-3" stroke="#4f9a3a" stroke-width="1.6" fill="none"/>'),
  seed: svg('<path d="M5 8h10l1.5 9h-13z" fill="#cdb46a"/><circle cx="10" cy="12.5" r="1.8" fill="#7a5a2a"/>'),
  coin: svg('<circle cx="10" cy="10" r="8" fill="#f2b84b"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#c98a1b" stroke-width="1.5"/>'),
};
const icon = (k) => ICON[k] || (ITEMS[k] && ITEMS[k].seed ? ICON.seed : '');
const chip = (k, n, miss) => `<span class="chip${miss ? ' miss' : ''}">${icon(k)}${n}</span>`;
const costChips = (cost, game) => Object.keys(cost || {}).map((k) => chip(k, cost[k], game && (game.stock[k] || 0) < cost[k])).join('');

let game = null, R = null, speed = 1, tool = 'hand', buildType = null, ghost = null, hover = null, selected = null, panelMode = null;
let modalOpen = false, hudT = 0, panelT = 0, saveT = 45, lastStock = {}, touchGhost = null;
let active = false;   // erst gespeichert wird, wenn wirklich gespielt wird (nicht die Vorschau hinter dem Startbildschirm)
const keys = new Set();

/* ---------- Woche und Bestenliste ---------- */
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return { key: `${t.getUTCFullYear()}-w${String(wk).padStart(2, '0')}`, n: wk };
}
const TB = window.TLBoard || null, ONLINE = !!(TB && TB.configured);
const LB = { tab: 'week', data: {}, state: {} };
const boardId = (tab, week) => (tab === 'week' ? `hearthvale:week:${week || isoWeek().key}` : 'hearthvale');
async function loadLb(tab, week) {
  if (!ONLINE) { LB.state[tab] = 'off'; return; }
  LB.state[tab] = LB.state[tab] || 'loading';
  try { LB.data[tab] = await TB.board(boardId(tab, week), 10); LB.state[tab] = 'live'; } catch (e) { LB.state[tab] = 'offline'; }
}
function lbHtml(tab) {
  const d = LB.data[tab], st = LB.state[tab] || 'loading';
  const rows = d ? d.top : [];
  const list = rows.length ? rows.map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="r">${i + 1}</span><span>${esc(r.name)}</span><span class="s">${Math.round(r.score).toLocaleString('de-DE')}</span></li>`).join('')
    : `<li><span></span><span class="muted">${st === 'loading' ? 'Bestenliste lädt …' : st === 'offline' ? 'Gerade nicht erreichbar.' : st === 'off' ? 'Noch nicht verbunden.' : tab === 'week' ? 'Diese Woche hat noch niemand ein Jahr beendet.' : 'Noch keine Einträge.'}</span><span></span></li>`;
  const mine = d && d.me && !rows.some((r) => r.me) ? `<p class="muted">Du: Platz ${d.me.rank} mit ${Math.round(d.me.score).toLocaleString('de-DE')}</p>` : '';
  return `<div class="tabs" role="tablist"><button type="button" data-lbtab="week" aria-selected="${tab === 'week'}">Tal der Woche</button><button type="button" data-lbtab="all" aria-selected="${tab === 'all'}">Allzeit</button></div><ol>${list}</ol>${mine}`;
}
function bindLb(root, rerender) {
  root.querySelectorAll('[data-lbtab]').forEach((b) => b.addEventListener('click', async () => { LB.tab = b.dataset.lbtab; rerender(); await loadLb(LB.tab, game && game.week); rerender(); }));
}

/* ---------- Start ---------- */
function savedGame() { try { const s = localStorage.getItem(SAVE_KEY); return s ? Game.load(s) : null; } catch (e) { return null; } }
function saveNow() { if (!game || !active) return; try { localStorage.setItem(SAVE_KEY, game.save()); } catch (e) { /* Speicher voll oder gesperrt */ } }

function showStart() {
  active = false;
  const saved = savedGame();
  const wk = isoWeek();
  openModal(() => `
    <h1>Hearthvale</h1>
    <p class="lead">Ein Tal, ein Jahr. Bestell Felder, fäll Bäume und bau eine Siedlung, in der deine Siedler selbst arbeiten. Holz wird zu Brettern, Weizen zu Mehl und Brot. Nach 28 Tagen zählt der Talwert.</p>
    <div class="actions">
      ${saved ? `<button class="btn primary" data-act="continue" type="button">Weiterspielen · Tag ${saved.day}</button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" data-act="week" type="button">Tal der Woche (KW ${wk.n})</button>
      <button class="btn" data-act="random" type="button">Zufälliges Tal</button>
    </div>
    <p class="muted" id="startNote">${saved ? 'Ein neues Tal ersetzt deinen Spielstand.' : 'Im Tal der Woche spielen alle auf derselben Karte. Nur dort zählt die Bestenliste.'}</p>
    <div class="grid2">
      <div class="box"><h3>So geht's</h3><div class="keys">
        <kbd>Klick</kbd><span>hingehen oder etwas tun</span>
        <kbd>WASD</kbd><span>laufen, <b>E</b> benutzt das Feld vor dir</span>
        <kbd>1–4</kbd><span>Hand, Hacke, Kanne, Saat</span>
        <kbd>B</kbd><span>Bauen</span>
        <kbd>Leertaste</kbd><span>Pause</span>
      </div></div>
      <div class="box lb" id="lbBox">${lbHtml(LB.tab)}</div>
    </div>`, (card) => {
    const act = (a, fn) => { const b = card.querySelector(`[data-act=${a}]`); if (b) b.addEventListener('click', fn); };
    let armed = null;
    const guard = (what, fn) => () => {
      if (saved && armed !== what) { armed = what; card.querySelector('#startNote').textContent = 'Nochmal klicken, um deinen Spielstand zu ersetzen.'; return; }
      fn();
    };
    act('continue', () => { game = saved; startGame(); });
    act('week', guard('week', () => { game = Game.create(`hearthvale:${wk.key}`, 'week', wk.key); startGame(true); }));
    act('random', guard('random', () => { game = Game.create(`zufall:${Date.now()}:${Math.random()}`, 'random', null); startGame(true); }));
    const rer = () => { const box = card.querySelector('#lbBox'); if (box) { box.innerHTML = lbHtml(LB.tab); bindLb(box, rer); } };
    bindLb(card.querySelector('#lbBox'), rer);
    loadLb(LB.tab, wk.key).then(rer);
  });
}
function startGame(fresh) {
  active = true;
  closeModal();
  R.resize(); R.snap(game);
  speed = 1; setSpeed(1); setTool('hand'); closePanel();
  lastStock = { ...game.stock };
  renderHud(true);
  if (fresh) { saveNow(); showHelp(true); }
}

/* ---------- Modals ---------- */
function openModal(html, bind) {
  modalOpen = true;
  const card = $('card');
  card.innerHTML = typeof html === 'function' ? html() : html;
  $('modal').hidden = false;
  if (bind) bind(card);
  const f = card.querySelector('.btn.primary'); if (f) f.focus({ preventScroll: true });
}
function closeModal() { modalOpen = false; $('modal').hidden = true; }

function showHelp(first) {
  openModal(`
    <h2>${first ? 'Willkommen im Tal' : 'Hilfe'}</h2>
    <p class="lead">Du hast eine Hütte, ein Lager und ein Wohnhaus mit zwei Siedlern. Der Rest liegt bei dir.</p>
    <div class="grid2">
      <div class="box"><h3>Du selbst</h3><ul>
        <li>Klick auf Bäume, Felsen und Beeren, um sie zu sammeln.</li>
        <li>Mit der <b>Hacke</b> legst du Felder an, mit <b>Saat</b> säst du, die <b>Kanne</b> füllst du am Wasser.</li>
        <li>Gegossene Pflanzen wachsen über Nacht. Regen gießt für dich.</li>
        <li>Jede Arbeit kostet Energie. Tipp auf die Energieanzeige, um etwas zu essen.</li>
      </ul></div>
      <div class="box"><h3>Deine Siedlung</h3><ul>
        <li>Unter <b>Bauen</b> stellst du Gebäude auf. Freie Siedler bauen sie und arbeiten danach darin.</li>
        <li>Jeder Siedler isst abends 1 Portion. Satte Siedler holen neue ins Tal, solange es Betten gibt.</li>
        <li>Mit dem <b>Markt</b> verkaufst du Überschüsse, auch automatisch.</li>
        <li>Im Winter wächst nichts. Leg Vorräte an.</li>
      </ul></div>
    </div>
    <div class="actions"><button class="btn primary" data-act="ok" type="button">Los geht's</button></div>`, (card) => card.querySelector('[data-act=ok]').addEventListener('click', closeModal));
}

function showMenu() {
  openModal(`
    <h2>Menü</h2>
    <p>Tag ${game.day} · ${game.mode === 'week' ? `Tal der Woche (${esc(game.week)})` : 'Zufälliges Tal'} · Talwert ${game.talwert().total.toLocaleString('de-DE')}</p>
    <p class="muted">Dein Spiel wird jeden Abend und zwischendurch automatisch gespeichert.</p>
    <div class="actions">
      <button class="btn primary" data-act="back" type="button">Weiterspielen</button>
      <button class="btn" data-act="save" type="button">Jetzt speichern</button>
      <button class="btn" data-act="start" type="button">Startbildschirm</button>
      <a class="btn" href="../">Alle Spiele</a>
    </div>`, (card) => {
    card.querySelector('[data-act=back]').addEventListener('click', closeModal);
    card.querySelector('[data-act=save]').addEventListener('click', (e) => { saveNow(); e.target.textContent = 'Gespeichert'; });
    card.querySelector('[data-act=start]').addEventListener('click', () => { saveNow(); showStart(); });
  });
}

function mergeCounts(...objs) { const out = {}; for (const o of objs) for (const k in o) out[k] = (out[k] || 0) + o[k]; return out; }
function onDayEnd(sum) {
  saveNow();
  const brought = mergeCounts(sum.gathered, sum.harvested);
  const made = sum.produced;
  const chips = (o) => Object.keys(o).length ? `<div class="chips">${Object.keys(o).map((k) => chip(k, o[k])).join('')}</div>` : '<p class="muted">nichts</p>';
  const eaten = sum.eatenItems || {};
  const weatherTxt = { sun: 'sonnig', rain: 'Regen, die Felder werden gegossen', snow: 'Schnee' }[sum.weather];
  const tv = game.talwert().total;
  openModal(`
    <h2>Tag ${sum.day} ist vorbei</h2>
    <p class="muted">${SEASONS[sum.season]} · morgen: ${weatherTxt}</p>
    <div class="grid2">
      <div class="box"><h3>Gesammelt und geerntet</h3>${chips(brought)}</div>
      <div class="box"><h3>Hergestellt</h3>${chips(made)}</div>
      <div class="box"><h3>Essen</h3><p>${sum.needed} ${sum.needed === 1 ? 'Siedler brauchte' : 'Siedler brauchten'} Essen.</p>${chips(eaten)}</div>
      <div class="box"><h3>Talwert</h3><div class="big">${tv.toLocaleString('de-DE')}</div>${sum.earned ? `<p>Heute verdient: ${sum.earned} Münzen</p>` : ''}</div>
    </div>
    ${sum.events.length ? `<ul style="margin-top:12px">${sum.events.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    <div class="actions"><button class="btn primary" data-act="next" type="button">${sum.yearEnd ? 'Zur Jahresbilanz' : `Tag ${sum.day + 1} beginnen`}</button></div>`, (card) => {
    card.querySelector('[data-act=next]').addEventListener('click', () => { if (sum.yearEnd) showYearEnd(sum.yearEnd); else closeModal(); });
  });
}

function showYearEnd(score) {
  const ranked = game.mode === 'week';
  LB.tab = ranked ? 'week' : 'all';
  const render = () => `
    <h2>Ein Jahr in ${game.mode === 'week' ? 'deinem Tal der Woche' : 'deinem Tal'}</h2>
    <div class="big">${score.total.toLocaleString('de-DE')}</div>
    <p class="muted">Talwert nach 28 Tagen</p>
    <dl><dt>Münzen</dt><dd>${Math.round(score.coins).toLocaleString('de-DE')}</dd><dt>Vorräte</dt><dd>${Math.round(score.stock).toLocaleString('de-DE')}</dd><dt>Gebäude und Wege</dt><dd>${Math.round(score.buildings).toLocaleString('de-DE')}</dd><dt>Siedler (${game.settlers.length})</dt><dd>${Math.round(score.settlers).toLocaleString('de-DE')}</dd></dl>
    ${ranked ? (game.submitted ? '<p>Du stehst in der Bestenliste.</p>' : ONLINE ? `<p>Trag dich in die Bestenliste ein:</p><div class="namerow"><input id="nameIn" maxlength="16" autocomplete="nickname" placeholder="Dein Name" value="${esc(TB.getName())}"><button class="btn primary" data-act="submit" type="button">Eintragen</button></div><p class="muted" id="subMsg"></p>` : '') : '<p class="muted">Im zufälligen Tal gibt es keine Bestenliste. Spiel das Tal der Woche, um dich zu vergleichen.</p>'}
    <div class="lb" id="lbBox" style="margin-top:10px">${lbHtml(LB.tab)}</div>
    <div class="actions"><button class="btn ${ranked && !game.submitted ? '' : 'primary'}" data-act="cont" type="button">Weiterspielen</button><button class="btn" data-act="new" type="button">Startbildschirm</button></div>`;
  const bind = (card) => {
    card.querySelector('[data-act=cont]').addEventListener('click', closeModal);
    card.querySelector('[data-act=new]').addEventListener('click', () => { saveNow(); showStart(); });
    const sb = card.querySelector('[data-act=submit]');
    if (sb) sb.addEventListener('click', async () => {
      const name = TB.cleanName(card.querySelector('#nameIn').value);
      if (!name) { card.querySelector('#subMsg').textContent = 'Gib einen Namen ein.'; return; }
      sb.disabled = true; card.querySelector('#subMsg').textContent = 'Wird eingetragen …';
      try {
        await TB.submit(boardId('week', game.week), name, score.total);
        await TB.submit(boardId('all'), name, score.total);
        game.submitted = true; saveNow();
      } catch (e) { sb.disabled = false; card.querySelector('#subMsg').textContent = 'Das hat nicht geklappt. Versuch es gleich nochmal.'; return; }
      await loadLb(LB.tab, game.week);
      openModal(render, bind);
    });
    const rer = () => { const box = card.querySelector('#lbBox'); if (box) { box.innerHTML = lbHtml(LB.tab); bindLb(box, rer); } };
    bindLb(card.querySelector('#lbBox'), rer);
  };
  openModal(render, bind);
  loadLb(LB.tab, game.week).then(() => { const box = $('card').querySelector('#lbBox'); if (box) { box.innerHTML = lbHtml(LB.tab); bindLb(box, () => { box.innerHTML = lbHtml(LB.tab); }); } });
}

/* ---------- HUD ---------- */
function renderHud(force) {
  if (!game) return;
  const h = game.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  $('hDay').textContent = `Tag ${game.day} · ${SEASONS[game.season]} ${game.dayOfSeason}/7`;
  $('hTime').textContent = `${hh}:${String(mm).padStart(2, '0')} · ${{ sun: 'sonnig', rain: 'Regen', snow: 'Schnee' }[game.weather]}${game.day > YEAR_DAYS ? ` · Jahr ${game.year}` : ` · noch ${YEAR_DAYS - game.day + 1} Tage`}`;
  $('hCoins').textContent = game.coins.toLocaleString('de-DE');
  $('hEnergyBar').style.width = `${(game.energy / MAX_ENERGY) * 100}%`;
  $('hEnergy').classList.toggle('low', game.energy < 20);
  $('hPeople').textContent = `${game.workers()}/${game.settlers.length} · ${game.beds} Betten`;
  $('tWater').textContent = `${game.water}/${CAN_SIZE}`;
  const c = CROPS[game.seedKind];
  $('tSeedName').textContent = c.name;
  $('tSeed').textContent = `${game.stock[c.seed] || 0} Saat`;
  const res = $('res');
  if (force || !res.children.length) res.innerHTML = STOCK_ORDER.map((k) => `<span class="chip" data-k="${k}" title="${ITEMS[k].name}">${icon(k)}<b>0</b></span>`).join('');
  for (const el of res.children) {
    const k = el.dataset.k, n = game.stock[k] || 0;
    el.querySelector('b').textContent = n;
    el.classList.toggle('zero', n === 0);
    if (n > (lastStock[k] || 0)) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  }
  lastStock = { ...game.stock };
  // Toasts
  // höchstens drei Meldungen gleichzeitig; viele fertige Gebäude werden zusammengefasst
  if (game.toasts.length > 3) {
    const done = game.toasts.filter((t) => t.msg.endsWith(' ist fertig.'));
    if (done.length > 1) game.toasts = [...game.toasts.filter((t) => !t.msg.endsWith(' ist fertig.')), { msg: `${done.length} Gebäude sind fertig.` }];
    game.toasts = game.toasts.slice(-3);
  }
  while (game.toasts.length) {
    const t = game.toasts.shift(), el = document.createElement('div');
    el.className = 'toast'; el.textContent = t.msg; $('toasts').append(el);
    setTimeout(() => el.remove(), 3200);
  }
  const box = $('toasts');
  while (box.children.length > 3) box.firstChild.remove();
}
function hint(text) { $('hint').textContent = text; }

function describe(tx, ty) {
  const w = game.world;
  if (!w.inb(tx, ty)) return '';
  if (buildType) {
    if (!ghost) return '';
    const def = BUILDINGS[buildType];
    if (!game.has(def.cost)) return `${def.name}: Dafür fehlen Rohstoffe.`;
    if (!ghost.ok) return ghost.err;
    const n = game.targetsInRange(buildType, ghost.x, ghost.y);
    const what = { chop: 'Bäume', mine: 'Felsen und Bergwände', fish: 'Wasserfelder', plant: 'freie Plätze' }[def.job];
    if (n === 0) return `Achtung: keine ${what} in Reichweite. Der Arbeiter hätte hier nichts zu tun.`;
    return `${def.name} hier bauen${n != null ? ` · ${n} ${what} in Reichweite` : ''}. Esc bricht ab.`;
  }
  const b = game.buildingAt(tx, ty);
  if (b) return `${BUILDINGS[b.type].name}${b.built ? '' : ' (Baustelle)'}: Klick für Details`;
  const o = w.o(tx, ty), g = w.g(tx, ty), k = w.i(tx, ty);
  if (o && o.t === 'tree') return `Baum fällen: +${o.age < 4 ? 1 : o.kind === 'oak' ? 3 : 2} Holz, ${ACTIONS.chop.energy} Energie`;
  if (o && o.t === 'rock') return `Stein abbauen: +3 Stein, ${ACTIONS.mine.energy} Energie`;
  if (o && o.t === 'bush') return o.berries ? 'Beeren pflücken: +3 Beeren' : 'Der Strauch trägt gerade keine Beeren.';
  if (o && o.t === 'crop') {
    const c = CROPS[o.kind];
    if (o.grown >= c.days) return `Ernten: +${c.yield[1]} ${ITEMS[c.yield[0]].name}`;
    const wet = w.wet[k] || game.weather === 'rain';
    return `${c.name}: ${o.grown} von ${c.days} Tagen${wet ? ', gegossen' : tool === 'can' ? ', jetzt gießen' : ', braucht Wasser (Kanne)'}`;
  }
  if (w.isWater(tx, ty)) return tool === 'can' ? 'Gießkanne auffüllen' : 'Wasser. Mit der Kanne füllst du hier auf.';
  if (g === G.SOIL) {
    if (tool === 'seed') { const c = CROPS[game.seedKind]; return c.seasons.includes(game.season) ? `${c.name} säen (${game.stock[c.seed] || 0} Saat übrig)` : `${c.name} wächst jetzt nicht. Tipp nochmal auf Saat für eine andere Sorte.`; }
    if (tool === 'can') return 'Boden gießen';
    return 'Gehackter Boden. Wähl Saat (4), um zu säen.';
  }
  if (tool === 'hoe' && w.isFree(tx, ty)) return `Boden hacken: ${ACTIONS.till.energy} Energie`;
  if (g === G.MOUNTAIN) return 'Berg. Ein Steinbruch daneben baut hier Stein ab.';
  return 'Hierhin gehen';
}

/* ---------- Werkzeuge und Tempo ---------- */
function setTool(t) {
  if (t === 'seed' && tool === 'seed') {   // nochmal tippen: Sorte wechseln
    const kinds = Object.keys(CROPS), i = kinds.indexOf(game.seedKind);
    for (let n = 1; n <= kinds.length; n++) { const k = kinds[(i + n) % kinds.length]; if (CROPS[k].seasons.includes(game.season) || n === kinds.length) { game.seedKind = k; break; } }
  }
  tool = t;
  if (t !== 'build') { buildType = null; ghost = null; if (panelMode === 'build') closePanel(); }
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('sel', b.dataset.tool === t));
  if (t === 'build') openBuildMenu();
  renderHud();
}
function setSpeed(s) { speed = s; document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('sel', Number(b.dataset.speed) === s)); }

/* ---------- Seitenpanel ---------- */
function closePanel() { $('panel').hidden = true; panelMode = null; selected = null; }
function openBuildMenu() {
  panelMode = 'build'; selected = null;
  renderPanel();
}
function openBuilding(b) { panelMode = 'building'; selected = b; buildType = null; ghost = null; if (tool === 'build') { tool = 'hand'; document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('sel', x.dataset.tool === 'hand')); } renderPanel(); }
let confirmDemolish = false;
function renderPanel() {
  const p = $('panel');
  if (!panelMode) { p.hidden = true; return; }
  if (p.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // nicht beim Tippen stören
  p.hidden = false;
  if (panelMode === 'build') {
    p.innerHTML = `<div class="head"><h2>Bauen</h2><button class="x" data-close aria-label="Schließen">×</button></div>
      <p>Wähl ein Gebäude und klick auf die Karte. Freie Siedler bauen es auf.</p>
      <div class="blist">${BUILD_MENU.map((k) => { const d = BUILDINGS[k]; return `<button class="bitem" data-build="${k}" type="button"${buildType === k ? ' style="border-color:var(--honey)"' : ''}><b>${d.name}</b><span class="cost">${costChips(d.cost, game)}</span><span class="desc">${esc(d.desc)}</span></button>`; }).join('')}</div>`;
    p.querySelectorAll('[data-build]').forEach((b) => b.addEventListener('click', () => { buildType = b.dataset.build; hint(`${BUILDINGS[buildType].name}: Klick auf die Karte, um es zu platzieren. Esc bricht ab.`); renderPanel(); }));
  } else {
    const b = selected;
    if (!game.buildings.includes(b)) { closePanel(); return; }
    const def = BUILDINGS[b.type];
    let body = `<p>${esc(def.desc)}</p>`;
    if (!b.built) {
      const builders = game.settlers.filter((s) => s.task && s.task.site === b.id).length;
      body += `<div class="prog"><i style="width:${Math.round(b.progress * 100)}%"></i></div><p>Baustelle: ${Math.round(b.progress * 100)} %. ${builders ? `${builders} ${builders === 1 ? 'Siedler baut' : 'Siedler bauen'} gerade.` : 'Wartet auf einen freien Siedler.'}</p>`;
    } else {
      if (def.job) {
        const s = game.settlers.find((x) => x.id === b.worker);
        body += `<div class="row"><span>Arbeiter</span><b>${s ? (s.state === 'working' ? 'arbeitet' : s.carry ? 'trägt Ware' : s.state === 'walk' ? 'unterwegs' : 'wartet') : 'keiner frei'}</b></div>`;
        if (!s) body += '<p>Alle Siedler sind beschäftigt. Bau ein Wohnhaus und sorg für Essen, dann kommen neue.</p>';
        const n = game.targetsInRange(b.type, b.x, b.y);
        if (n != null) body += `<div class="row"><span>In Reichweite</span><b>${n} ${{ chop: 'Bäume', mine: 'Felsen', fish: 'Wasserfelder', plant: 'freie Plätze' }[def.job]}</b></div>${n === 0 ? '<p>Hier gibt es nichts zu tun. Reiß das Gebäude ab und bau es an einer besseren Stelle neu.</p>' : ''}`;
      }
      if (def.recipe) {
        const r = def.recipe, ins = Object.keys(r.in), outs = Object.keys(r.out);
        body += `<div class="row"><span>Rezept</span><span class="cost">${ins.map((k) => chip(k, r.in[k])).join('')} → ${outs.map((k) => chip(k, r.out[k])).join('')}</span></div>`;
        body += `<div class="row"><span>Im Gebäude</span><span class="cost">${ins.map((k) => chip(k, b.in[k] || 0)).join('')} ${outs.map((k) => chip(k, b.out[k] || 0)).join('')}</span></div>`;
        if (ins.some((k) => (game.stock[k] || 0) < r.in[k]) && ins.some((k) => (b.in[k] || 0) < r.in[k])) body += `<p>Im Lager fehlt ${ins.map((k) => ITEMS[k].name).join(' und ')}.</p>`;
      }
      if (b.type === 'farm') body += `<div class="row"><span>Felder</span><b>${b.fields.length} / ${def.fields}</b></div>${game.season === 3 ? '<p>Im Winter ruht der Hof.</p>' : ''}`;
      if (b.type === 'house') body += `<div class="row"><span>Bewohner</span><b>${game.settlers.filter((s) => s.home === b.id).length} / ${def.beds}</b></div>`;
      if (b.type === 'hut') body += `<div class="actions"><button class="btn primary" data-act="sleep" type="button">Schlafen gehen (Tag beenden)</button></div>`;
      if (b.type === 'storage' || b.type === 'hut') {
        body += `<div class="row"><span>Vorräte</span><span></span></div><div class="cost" style="display:flex;flex-wrap:wrap;gap:4px">${[...STOCK_ORDER, 'seed_wheat', 'seed_carrot', 'seed_pumpkin'].map((k) => `<span class="chip" title="${ITEMS[k].name}">${icon(k)}${game.stock[k] || 0}</span>`).join('')}</div>
          <div class="actions"><button class="btn" data-act="eat" type="button">Etwas essen</button></div>`;
      }
      if (b.type === 'market') {
        body += `<div class="row"><b>Verkaufen</b><span class="muted" style="color:var(--muted)">Preis je Stück</span></div>`;
        body += STOCK_ORDER.map((k) => {
          const n = game.stock[k] || 0, auto = game.autoSell[k];
          return `<div class="sellrow"><span class="n">${icon(k)}<span>${ITEMS[k].name} · ${n}</span></span><span class="b"><span class="chip">${icon('coin')}${ITEMS[k].price}</span><button class="btn small" data-sell="${k}" data-n="1" ${n ? '' : 'disabled'}>1</button><button class="btn small" data-sell="${k}" data-n="10" ${n >= 10 ? '' : 'disabled'}>10</button><button class="btn small" data-sell="${k}" data-n="all" ${n ? '' : 'disabled'}>Alle</button></span>
            <label class="auto"><input type="checkbox" data-auto="${k}" ${auto != null ? 'checked' : ''}> jeden Abend verkaufen, behalten: <input type="number" min="0" max="999" data-keep="${k}" value="${auto != null ? auto : 20}"></label></div>`;
        }).join('');
        body += `<div class="row" style="margin-top:8px"><b>Saatgut kaufen</b><span></span></div>`;
        body += ['seed_wheat', 'seed_carrot', 'seed_pumpkin'].map((k) => `<div class="sellrow"><span class="n">${icon(k)}<span>${ITEMS[k].name} · ${game.stock[k] || 0}</span></span><span class="b"><span class="chip">${icon('coin')}${ITEMS[k].price}</span><button class="btn small" data-buy="${k}" data-n="1" ${game.coins >= ITEMS[k].price ? '' : 'disabled'}>1</button><button class="btn small" data-buy="${k}" data-n="5" ${game.coins >= ITEMS[k].price * 5 ? '' : 'disabled'}>5</button></span></div>`).join('');
      }
    }
    if (b.built && def.job) body += `<div class="actions"><button class="btn small" data-act="pause" type="button">${b.paused ? 'Weiterarbeiten' : 'Arbeit pausieren'}</button></div>${b.paused ? '<p>Pausiert. Der Arbeiter wartet an der Tür.</p>' : ''}`;
    const canDemolish = b.type !== 'hut';
    body += canDemolish ? `<div class="actions"><button class="btn small danger" data-act="demolish" type="button">${confirmDemolish ? 'Wirklich abreißen? Du bekommst die Hälfte zurück.' : 'Abreißen'}</button></div>` : '';
    p.innerHTML = `<div class="head"><h2>${def.name}</h2><button class="x" data-close aria-label="Schließen">×</button></div>${body}`;
    const on = (sel, fn) => p.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));
    on('[data-act=sleep]', () => { game.sleep(); closePanel(); });
    on('[data-act=pause]', () => { b.paused = !b.paused; renderPanel(); });
    on('[data-act=eat]', () => { game.toast(game.eat()); renderHud(); renderPanel(); });
    on('[data-act=demolish]', () => { if (!confirmDemolish) { confirmDemolish = true; renderPanel(); return; } confirmDemolish = false; const err = game.demolish(b); if (err) game.toast(err); closePanel(); });
    on('[data-sell]', (e) => { const k = e.currentTarget.dataset.sell, n = e.currentTarget.dataset.n === 'all' ? game.stock[k] : Number(e.currentTarget.dataset.n); const got = game.sell(k, n); if (got) game.toast(`${n} ${ITEMS[k].name} für ${got} Münzen verkauft`); renderHud(); renderPanel(); });
    on('[data-buy]', (e) => { const k = e.currentTarget.dataset.buy, n = Number(e.currentTarget.dataset.n); if (game.buy(k, n)) game.toast(`${n} ${ITEMS[k].name} gekauft`); renderHud(); renderPanel(); });
    p.querySelectorAll('[data-auto]').forEach((cb) => cb.addEventListener('change', () => { const k = cb.dataset.auto, keep = Number(p.querySelector(`[data-keep="${k}"]`).value) || 0; if (cb.checked) game.autoSell[k] = keep; else delete game.autoSell[k]; }));
    p.querySelectorAll('[data-keep]').forEach((inp) => inp.addEventListener('change', () => { const k = inp.dataset.keep; if (game.autoSell[k] != null) game.autoSell[k] = Math.max(0, Number(inp.value) || 0); inp.blur(); }));
  }
  p.querySelector('[data-close]').addEventListener('click', () => { if (panelMode === 'build') setTool('hand'); closePanel(); });
}

/* ---------- Eingabe ---------- */
function ghostAt(fx, fy) {
  const def = BUILDINGS[buildType];
  const x = Math.round(fx - def.w / 2), y = Math.round(fy - def.h / 2);
  const err = game.canPlace(buildType, x, y);
  return { type: buildType, x, y, ok: !err && game.has(def.cost), err: err || (game.has(def.cost) ? '' : 'Dafür fehlen Rohstoffe.') };
}
function onPointerMove(e) {
  if (!game || modalOpen) return;
  const t = R.screenToTile(e.clientX, e.clientY);
  hover = { x: t.x, y: t.y };
  if (buildType && e.pointerType !== 'touch') ghost = ghostAt(t.fx, t.fy);
  hint(describe(t.x, t.y));
}
function onTap(e) {
  if (!game || modalOpen) return;
  const t = R.screenToTile(e.clientX, e.clientY);
  hover = { x: t.x, y: t.y };
  if (buildType) {
    const gh = ghostAt(t.fx, t.fy);
    if (e.pointerType === 'touch' && (!touchGhost || touchGhost.x !== gh.x || touchGhost.y !== gh.y)) { touchGhost = gh; ghost = gh; hint(gh.ok ? `Nochmal tippen, um ${BUILDINGS[buildType].name} hier zu bauen.` : gh.err); return; }
    touchGhost = null;
    const err = game.place(buildType, gh.x, gh.y);
    if (err) { game.toast(err); return; }
    if (buildType !== 'path') { game.toast(`${BUILDINGS[buildType].name} geplant. Freie Siedler bauen es auf.`); buildType = null; ghost = null; setTool('hand'); }
    else ghost = ghostAt(t.fx, t.fy);
    renderHud();
    return;
  }
  const r = game.interact(t.x, t.y, tool);
  if (r && r.open) openBuilding(r.open);
  else if (r && r.msg) game.toast(r.msg);
}
function updateMove() {
  if (!game) return;
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x--;
  if (keys.has('d') || keys.has('arrowright')) x++;
  if (keys.has('w') || keys.has('arrowup')) y--;
  if (keys.has('s') || keys.has('arrowdown')) y++;
  game.player.move = { x, y };
  if (x || y) { game.player.path = null; game.player.pending = null; }
}
function onKey(e) {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (modalOpen) { if (k === 'enter') { const b = $('card').querySelector('.btn.primary'); if (b) { e.preventDefault(); b.click(); } } return; }
  if (!game) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); keys.add(k); updateMove(); return; }
  if (k === 'e') { const p = game.player, d = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.facing || 2]; const r = game.interact(Math.floor(p.x) + d[0], Math.floor(p.y) + d[1], tool); if (r && r.open) openBuilding(r.open); else if (r && r.msg) game.toast(r.msg); return; }
  if (k === '1') setTool('hand'); else if (k === '2') setTool('hoe'); else if (k === '3') setTool('can'); else if (k === '4') setTool('seed');
  else if (k === 'b') setTool(tool === 'build' ? 'hand' : 'build');
  else if (k === 'escape') { if (buildType) { buildType = null; ghost = null; renderPanel(); } else { if (panelMode === 'build') setTool('hand'); closePanel(); } }
  else if (k === ' ') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
  else if (k === '+' || k === '=') zoom(1); else if (k === '-') zoom(-1);
}
function zoom(d) { const i = ZOOMS.indexOf(R.cam.zoom); R.cam.zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + d))]; }

/* ---------- Schleife ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!game) return;
  if (!modalOpen && speed > 0) {
    const sum = game.update(dt * speed);
    if (sum) { closePanel(); onDayEnd(sum); }
  }
  R.follow(game, dt);
  R.draw(game, { hover: modalOpen ? null : hover, ghost, selected }, now / 1000);
  R.drawMini(game, dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.2; renderHud(); }
  panelT -= dt; if (panelT <= 0) { panelT = 0.6; if (panelMode === 'building') renderPanel(); }
  saveT -= dt; if (saveT <= 0) { saveT = 45; saveNow(); }
}

/* ---------- Start ---------- */
function boot() {
  R = new Renderer($('world'), $('mini'));
  R.resize();
  window.addEventListener('resize', () => R.resize());
  const cv = $('world');
  cv.addEventListener('pointermove', onPointerMove);
  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12) onTap(e); down = null; });
  cv.addEventListener('pointerleave', () => { hover = null; if (buildType && !touchGhost) ghost = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); updateMove(); });
  window.addEventListener('blur', () => { keys.clear(); updateMove(); });
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool === tool && tool === 'build' ? 'hand' : b.dataset.tool)));
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
  $('hEnergy').addEventListener('click', () => { if (game) { game.toast(game.eat()); renderHud(); } });
  $('zoomIn').addEventListener('click', () => zoom(1));
  $('zoomOut').addEventListener('click', () => zoom(-1));
  $('helpBtn').addEventListener('click', () => game && showHelp(false));
  $('menuBtn').addEventListener('click', () => game && showMenu());
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  if (window.innerWidth >= 1200) R.cam.zoom = 1.25;
  // Hintergrund für den Startbildschirm: dein Spielstand oder das Tal der Woche
  game = savedGame() || Game.create(`hearthvale:${isoWeek().key}`, 'week', isoWeek().key);
  R.snap(game);
  showStart();
  requestAnimationFrame(frame);
  window.__hv = { get game() { return game; }, R };   // für Tests
}
boot();
