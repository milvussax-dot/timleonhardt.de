// Oberfläche, Eingabe, Spielschleife, Speichern, Bestenliste
import { Game } from './sim.js?v=20';
import { Renderer } from './render.js?v=20';
import { cellRand } from './world.js?v=20';
import { Sound } from './audio.js?v=20';
import { FIRST_RAID } from './realm.js?v=20';
const audio = new Sound();
import { ITEMS, BUILDINGS, BUILD_GROUPS, CROPS, STOCK_ORDER, SEASONS, MAX_ENERGY, CAN_SIZE, ACTIONS, G, YEAR_DAYS, DAYS_PER_SEASON, QUESTS, UNITS, TRAIN_TIME, BARRACKS_LEVELS, SHIPYARD_LEVELS, TOWER_LEVELS, ATTACK_RANGE, CATAPULT, CAMP_BUILD, RAM_RECIPE, THIEF } from './data.js?v=20';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'hearthvale.save';        // alte Version: ein einziger Spielstand
const INDEX_KEY = 'hearthvale.saves';      // Liste aller Spielstände
const SLOT_KEY = 'hearthvale.slot.';
const MAX_SLOTS = 5;
// Codes: nur ihre Prüfsummen stehen hier, die Codes selbst nicht.
// Münzen gibt es ein einziges Mal pro Browser, der Siedler-Code füllt jedes Mal alle freien Betten,
// der große Code bringt jedes Mal 100 Siedler und 100.000 Münzen.
const CODES = { '85d5518962cbbcec9d9dae0f15d1722133e47de1e366cb86f3c1ab3a56072768': 'coins', '5fc6e8b91dbabeb654e4eeb85964611633ad4a7581ba0b2dbdc91c38c3dd5063': 'settlers', '9f19421c46c6ed5c708bdc60b0a1bcfd557625cdc750eed67872132dd232f1b8': 'boost' };
const BOOST_SETTLERS = 100, BOOST_COINS = 100000;
const GIFT_KEY = 'hearthvale.gift', GIFT_COINS = 100000;
const cleanSaveName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 30);
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
  ore: svg('<path d="M3 15 6 7l5-3 6 5-1 6z" fill="#7a6a5e"/><circle cx="8" cy="10" r="1.6" fill="#c9824a"/><circle cx="12.5" cy="12" r="1.3" fill="#d9925a"/><circle cx="11" cy="7.5" r="1" fill="#c9824a"/>'),
  coal: svg('<path d="M3 14 5 8l5-3 5 3 2 6-7 3z" fill="#2e2e30"/><path d="M5 8l5-3 5 3-5 2z" fill="#4a4a4e"/>'),
  iron: svg('<path d="M2 13l3-6h10l3 6z" fill="#b8c0cc"/><path d="M5 7h10l-1.5 3h-7z" fill="#dfe4ec"/>'),
  sword: svg('<path d="M14.5 2.5 17 3l.5 2.5L8 15l-3-3z" fill="#dfe4ec"/><path d="M4 11l5 5-1.2 1.2-5-5z" fill="#8a5a30"/><path d="M3 15.5 4.5 17l-2 1z" fill="#6b4228"/>'),
  boat: svg('<path d="M2 11h16l-3 5H5z" fill="#8a5528"/><path d="M10 2v8H5z" fill="#f3ead8"/><path d="M10 2v9" stroke="#6b4228" stroke-width="1.2"/>'),
  soldier: svg('<circle cx="10" cy="6" r="3.5" fill="#f1c9a0"/><path d="M6.3 5.5a3.7 3.7 0 0 1 7.4 0z" fill="#aab3bf"/><path d="M4 18c0-4 2.5-6.5 6-6.5s6 2.5 6 6.5z" fill="#3a5f9a"/>'),
  bow: svg('<path d="M6 2c7 3 7 13 0 16" fill="none" stroke="#a0703c" stroke-width="2.2" stroke-linecap="round"/><path d="M6 2v16" stroke="#e8e0cc" stroke-width="1"/><path d="M3 10h13" stroke="#6b4228" stroke-width="1.4"/><path d="M16 10l-3-2v4z" fill="#c8ccd2"/>'),
  catapult: svg('<path d="M2 15h15" stroke="#6b4228" stroke-width="2.2"/><circle cx="5.5" cy="16" r="2" fill="#4a3020"/><circle cx="13.5" cy="16" r="2" fill="#4a3020"/><path d="M6.5 14 15 4.5" stroke="#a0703c" stroke-width="2" stroke-linecap="round"/><circle cx="15.5" cy="4" r="2.2" fill="#9aa0a8"/>'),
  ram: svg('<path d="M3 9 10 4l7 5z" fill="#5e3e28"/><rect x="4" y="9" width="12" height="6" fill="#7a5230"/><path d="M2 12h15" stroke="#5a3a20" stroke-width="2.4"/><circle cx="17.5" cy="12" r="1.8" fill="#7a7f88"/><circle cx="6" cy="16" r="1.8" fill="#3a2618"/><circle cx="14" cy="16" r="1.8" fill="#3a2618"/>'),
  thief: svg('<circle cx="10" cy="6.5" r="3.4" fill="#f1c9a0"/><path d="M5.8 7.5a4.3 4.3 0 0 1 8.4 0L10 1.8z" fill="#22222a"/><path d="M4.5 18c0-5 2.5-8 5.5-8s5.5 3 5.5 8z" fill="#34343c"/><ellipse cx="14.5" cy="13" rx="2.6" ry="3" fill="#9a7a4a"/>'),
  flag: svg('<path d="M5 2v16" stroke="#6b4228" stroke-width="1.6"/><path d="M6 3h10l-2.5 3.5L16 10H6z" fill="#c0392b"/>'),
};
const icon = (k) => ICON[k] || (ITEMS[k] && ITEMS[k].seed ? ICON.seed : '');
const chip = (k, n, miss) => `<span class="chip${miss ? ' miss' : ''}">${icon(k)}${n}</span>`;
const costChips = (cost, game) => Object.keys(cost || {}).map((k) => chip(k, cost[k], game && (game.stock[k] || 0) < cost[k])).join('');

let game = null, R = null, speed = 1, tool = 'hand', buildType = null, ghost = null, hover = null, selected = null, panelMode = null, selTribe = null, attackW = { sword: 99, archer: 99 };
let look = false;   // frei umschauen: die Ansicht folgt dir gerade nicht (Minikarte angeklickt oder Karte gezogen)
const HINT0 = 'Klick auf Bäume, Steine oder Beeren. Felder legst du unter Bauen mit „Acker“ an.';
const LOOK_HINT = 'Du schaust dich um: Ziehen verschiebt die Ansicht, Mausrad, zwei Finger oder + und − zoomen. Esc oder „Zurück zu dir“ holt dich zurück.';
let modalOpen = false, hudT = 0, panelT = 0, saveT = 45, lastStock = {}, touchGhost = null, marketTab = 'sell';
let troopMode = false, box = null, ping = null;   // Truppen steuern: freie Kamera, Auswahl, Rahmen, Zielmarker
const sel = new Set();
const HUD_ITEMS = STOCK_ORDER.filter((k) => k !== 'sword' && k !== 'bow');   // Waffen stehen bei den Truppen und in der Kaserne
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
/* ---------- Spielstände ---------- */
let slot = null;   // Spielstand, in den gerade gespeichert wird
function readIndex() { try { const a = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); return Array.isArray(a) ? a.filter((m) => m && m.id) : []; } catch (e) { return []; } }
function writeIndex(list) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
const slotList = () => readIndex().sort((a, b) => (b.updated || 0) - (a.updated || 0));
const newSlotId = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
function metaOf(g, id) { return { id, name: g.name || '', mode: g.mode, week: g.week, day: g.day, value: g.talwert().total, settlers: g.settlers.length, updated: Date.now() }; }
// Namen ändern, auch für Spielstände, die gerade nicht geladen sind
function renameSlot(id, name) {
  name = cleanSaveName(name);
  try {
    const raw = localStorage.getItem(SLOT_KEY + id);
    if (raw) { const d = JSON.parse(raw); d.name = name; localStorage.setItem(SLOT_KEY + id, JSON.stringify(d)); }
    writeIndex(readIndex().map((m) => (m.id === id ? { ...m, name } : m)));
  } catch (e) { return false; }
  if (game && slot === id) game.name = name;
  return true;
}
function loadSlot(id) { try { const s = localStorage.getItem(SLOT_KEY + id); return s ? Game.load(s) : null; } catch (e) { return null; } }
function deleteSlot(id) { try { localStorage.removeItem(SLOT_KEY + id); } catch (e) { /* egal */ } writeIndex(readIndex().filter((m) => m.id !== id)); }
// Der Spielstand der alten Version (nur einer) wird zum ersten Eintrag der Liste. Geht etwas schief, bleibt er unangetastet.
function migrateOldSave() {
  let old = null, g = null;
  try { old = localStorage.getItem(SAVE_KEY); } catch (e) { return; }
  if (!old) return;
  try { g = Game.load(old); } catch (e) { g = null; }
  if (!g) return;
  const id = newSlotId();
  try {
    localStorage.setItem(SLOT_KEY + id, old);
    if (!writeIndex([...readIndex(), metaOf(g, id)])) throw new Error('index');
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { try { localStorage.removeItem(SLOT_KEY + id); } catch (e2) { /* egal */ } }
}
function saveNow() {
  if (!game || !active || !slot) return;
  try {
    localStorage.setItem(SLOT_KEY + slot, game.save());
    writeIndex([...readIndex().filter((m) => m.id !== slot), metaOf(game, slot)]);
  } catch (e) { game.toast('Speichern hat nicht geklappt, der Speicher ist voll. Lösch einen alten Spielstand.'); }
}
function slotKind(m) { return m.mode === 'week' ? `Tal der Woche · KW ${Number(String(m.week || '').split('-w')[1]) || '?'}` : 'Zufälliges Tal'; }
function slotTitle(m) { return m.name || slotKind(m); }
let renaming = null;
function whenText(t) {
  const d = new Date(t), now = new Date(), hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `heute, ${hm}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `gestern, ${hm}`;
  return `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${hm}`;
}
let confirmDel = null;

function showStart() {
  active = false;
  if (renaming && !readIndex().some((m) => m.id === renaming)) renaming = null;
  const list = slotList();
  const wk = isoWeek();
  const full = list.length >= MAX_SLOTS;
  openModal(() => `
    <h1>Hearthvale</h1>
    <p class="lead">Ein Tal, ein Jahr. Bestell Felder, bau eine Siedlung, in der deine Siedler selbst arbeiten, und erkunde das große Tal. Dort leben fremde Stämme, die dich überfallen. Bilde Soldaten aus, bau Boote und erobere ihre Lager. Nach ${YEAR_DAYS} Tagen zählt der Talwert.</p>
    <p class="muted"><b>Neu:</b> riesiges Tal mit Nebel, Gebirgen, Seen und Insel, neun starke Stämme mit Häuptlingen, Musik, Schwertkämpfer und Bogenschützen, die du selbst steuerst, Kaserne und Werft zum Ausbauen, Kriegsschiffe, Markt zum Einkaufen, Spielstände mit eigenem Namen und ${QUESTS.length} Ziele.</p>
    ${list.length ? `<div class="box" style="margin-top:12px"><h3>Deine Spielstände</h3><div class="slots">${list.map((m, i) => `
      <div class="slot">${renaming === m.id ? `
        <div class="namerow slot-name"><input data-name-in="${esc(m.id)}" maxlength="30" placeholder="${esc(slotKind(m))}" value="${esc(m.name || '')}" aria-label="Name des Spielstands"><button class="btn primary" data-name-ok="${esc(m.id)}" type="button">OK</button></div>` : `
        <div class="slot-info"><b>${esc(slotTitle(m))}</b><span class="muted">${m.name ? `${esc(slotKind(m))} · ` : ''}Tag ${Number(m.day) || 1} · ${Number(m.settlers) || 0} Siedler · Talwert ${Number(m.value || 0).toLocaleString('de-DE')} · ${esc(whenText(m.updated || Date.now()))}</span></div>
        <div class="slot-btns"><button class="btn ${i === 0 ? 'primary' : ''}" data-load="${esc(m.id)}" type="button">Weiterspielen</button><button class="btn small" data-ren="${esc(m.id)}" type="button">Umbenennen</button><button class="btn small" data-del="${esc(m.id)}" type="button">${confirmDel === m.id ? 'Wirklich löschen?' : 'Löschen'}</button></div>`}
      </div>`).join('')}</div></div>` : ''}
    <div class="box" style="margin-top:12px"><h3>Neues Tal anfangen</h3>
      ${full ? '' : '<div class="namerow"><input id="newName" maxlength="30" placeholder="Name für das neue Tal (freiwillig)" aria-label="Name für das neue Tal"></div>'}
      <div class="actions" style="margin-top:4px">
        <button class="btn ${list.length ? '' : 'primary'}" data-act="week" type="button" ${full ? 'disabled' : ''}>Tal der Woche (KW ${wk.n})</button>
        <button class="btn" data-act="random" type="button" ${full ? 'disabled' : ''}>Zufälliges Tal</button>
      </div>
      <p class="muted">${full ? `Du hast schon ${MAX_SLOTS} Spielstände. Lösch einen, um ein neues Tal anzufangen.` : list.length ? 'Ein neues Tal bekommt einen eigenen Spielstand, deine anderen bleiben erhalten. Nur im Tal der Woche zählt die Bestenliste.' : 'Im Tal der Woche spielen alle auf derselben Karte. Nur dort zählt die Bestenliste.'}</p>
    </div>
    <div class="grid2">
      <div class="box"><h3>So geht's</h3><div class="keys">
        <kbd>Klick</kbd><span>hingehen oder etwas tun</span>
        <kbd>WASD</kbd><span>laufen, <b>E</b> benutzt das Feld vor dir</span>
        <kbd>1</kbd><span>Hand: sammeln, säen, gießen, ernten</span>
        <kbd>B</kbd><span>Bauen</span>
        <kbd>Leertaste</kbd><span>Pause</span>
      </div></div>
      <div class="box lb" id="lbBox">${lbHtml(LB.tab)}</div>
    </div>`, (card) => {
    const act = (a, fn) => { const b = card.querySelector(`[data-act=${a}]`); if (b) b.addEventListener('click', fn); };
    card.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => {
      const g = loadSlot(b.dataset.load);
      if (!g) { b.textContent = 'Spielstand beschädigt'; b.disabled = true; return; }
      confirmDel = null; game = g; slot = b.dataset.load; startGame();
    }));
    card.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', () => { renaming = b.dataset.ren; confirmDel = null; showStart(); const inp = $('card').querySelector('[data-name-in]'); if (inp) { inp.focus(); inp.select(); } }));
    card.querySelectorAll('[data-name-ok]').forEach((b) => {
      const inp = card.querySelector(`[data-name-in="${b.dataset.nameOk}"]`);
      const done = () => { renameSlot(b.dataset.nameOk, inp.value); renaming = null; showStart(); };
      b.addEventListener('click', done);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { renaming = null; showStart(); } });
    });
    card.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.del;
      if (confirmDel !== id) { confirmDel = id; showStart(); return; }
      confirmDel = null; deleteSlot(id); showStart();
    }));
    const startNew = (make) => {
      if (slotList().length >= MAX_SLOTS) return;
      const nm = card.querySelector('#newName');
      confirmDel = null; renaming = null; game = make(); game.name = cleanSaveName(nm && nm.value); slot = newSlotId(); startGame(true);
    };
    act('week', () => startNew(() => Game.create(`hearthvale:${wk.key}`, 'week', wk.key)));
    act('random', () => startNew(() => Game.create(`zufall:${Date.now()}:${Math.random()}`, 'random', null)));
    const rer = () => { const box = card.querySelector('#lbBox'); if (box) { box.innerHTML = lbHtml(LB.tab); bindLb(box, rer); } };
    bindLb(card.querySelector('#lbBox'), rer);
    loadLb(LB.tab, wk.key).then(rer);
  });
}
function fitMini() {
  const m = $('mini'), w = game.world, H = Math.round(160 * w.h / w.w);
  if (m.width !== 160 || m.height !== H) { m.width = 160; m.height = H; R.miniKey = null; }
  m.style.height = 'auto';
}
function startGame(fresh) {
  active = true;
  closeModal();
  R.resize(); R.snap(game); fitMini(); setLook(false);
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
    <p class="lead">Du hast eine Hütte, ein Lager und ein Wohnhaus mit zwei Siedlern. Der Rest liegt bei dir. Oben links stehen deine nächsten Ziele.</p>
    <div class="grid2">
      <div class="box"><h3>Du selbst</h3><ul>
        <li>Klick auf Bäume, Felsen und Beeren, um sie zu sammeln.</li>
        <li>Felder legst du unter <b>Bauen</b> mit <b>Acker</b> an. Klick auf den Acker, um zu säen, und auf Pflanzen, um sie zu gießen. Welche Saat, wählst du in deiner Hütte.</li>
        <li>Gegossene Pflanzen wachsen über Nacht. Die Kanne füllst du am Wasser, über Nacht wird sie von selbst voll. Regen gießt für dich.</li>
        <li>Jede Arbeit kostet Energie. Tipp auf die Energieanzeige, um etwas zu essen.</li>
      </ul></div>
      <div class="box"><h3>Deine Siedlung</h3><ul>
        <li>Unter <b>Bauen</b> stellst du Gebäude auf. Freie Siedler bauen sie und arbeiten danach darin. Beim Bauen kannst du die Karte ziehen oder auf die Minikarte klicken, um weiter weg zu bauen.</li>
        <li>Jeder Siedler isst abends 1 Portion. Reicht das Essen auch für morgen, ziehen nachts bis zu 5 neue Siedler ein, solange es Betten gibt.</li>
        <li><b>Zufriedenheit</b> (Smiley oben): Schmuck, Feste im Gasthaus, Badehaus, abwechslungsreiches Essen und schöne Häuser machen deine Siedler zufriedener. Dann arbeiten sie schneller, es ziehen mehr zu und deine Soldaten kämpfen stärker.</li>
        <li>Siedler ohne Arbeitsplatz werden <b>Träger</b>: Sie holen die Ware an den Gebäuden ab und bringen Zutaten in die Werkstätten. So können die Arbeiter weiterarbeiten.</li>
        <li>Auf gebauten <b>Wegen</b> laufen alle schneller, Träger noch einmal deutlich. Verbinde Lager und Werkstätten mit Wegen.</li>
        <li>Mit dem <b>Markt</b> verkaufst du Überschüsse, auch automatisch.</li>
        <li>Im Winter wächst nichts. Leg Vorräte an.</li>
        <li>Wohnhäuser lassen sich zum Steinhaus und Stadthaus ausbauen, Werkstätten auf Stufe 2.</li>
      </ul></div>
      <div class="box"><h3>Land und Erkundung</h3><ul>
        <li>Bauen kannst du nur in deinem Land, der hellen gestrichelten Grenze. Lager, Wohnhäuser und besetzte Wachtürme vergrößern es.</li>
        <li>Das Tal liegt im Nebel. Geh los, um es zu erkunden, und öffne Schatztruhen.</li>
        <li>Aus einer <b>Späherhütte</b> zieht ein Erkunder los und lichtet den Nebel weit im Umkreis.</li>
        <li>Klick auf die Minikarte oben rechts, um dort hinzuschauen, oder zieh die Karte mit der Maus. Mausrad, zwei Finger oder + und − zoomen. „Zurück zu dir“ oder Esc bringt die Ansicht zurück.</li>
        <li>Mit einem Boot aus der Werft kommen alle übers Wasser, auch zur Insel im See.</li>
      </ul></div>
      <div class="box"><h3>Stämme und Soldaten</h3><ul>
        <li>Ab Tag ${FIRST_RAID} überfällt ab und zu ein Stamm dein Lager, raubt Vorräte und zündet ein Gebäude an. Es kommt immer nur ein Stamm, danach ist einige Tage Ruhe. Ein Geschenk bringt 8 Tage Frieden.</li>
        <li>Die Lager der Stämme sind groß, für eine Eroberung brauchst du ein starkes Heer. Mit jeder Jahreszeit werden ihre Krieger stärker, und je größer dein Heer, desto mehr rüsten sie auf.</li>
        <li>Jedes Lager hat einen Häuptling und Bogenschützen. Erst wenn der Häuptling gefallen ist, gehört dir das Lager.</li>
        <li>Erzmine, Köhlerei, Schmelze und Waffenschmiede machen Schwerter, der Bogenmacher Bögen. Die Kaserne bildet daraus mit freien Siedlern Schwertkämpfer und Bogenschützen aus.</li>
        <li>Bau die Kaserne aus, dann werden alle ihre Soldaten stärker. Die Ausbildung kostet dann aber mehr.</li>
        <li>Die Dörfer der Stämme haben Häuser, Wachtürme, die auf deine Truppen schießen, und ein Waffenlager, das ihre Krieger stärker macht.</li>
        <li>Im <b>Diebesversteck</b> bildest du Diebe aus. Sie stehlen in fremden Lagern Waffen, Münzen und Vorräte. Aber auch die Stämme schicken Diebe zu dir, und deine Soldaten und Türme können sie fangen.</li>
        <li>Der <b>Geschützbauer</b> baut auf Bestellung auch gepanzerte Rammböcke, die Türme und Häuser aus nächster Nähe zerschlagen.</li>
        <li>Katapulte, Rammböcke und Kriegsschiffe steuerst du wie Soldaten mit dem Werkzeug <b>Truppen</b>: auswählen, auf die Karte tippen zum Hinschicken, auf ein Lager oder einen Turm tippen zum Angreifen.</li>
        <li>Der <b>Geschützbauer</b> baut auf Bestellung Katapulte. Im Fenster eines Stammes schickst du sie zur Belagerung los: Sie zerstören die Hütten aus der Ferne, jede kostet den Stamm Krieger. Das Lager stürmt heraus, um sie zu zerschlagen, also schick Soldaten mit.</li>
        <li>Wachtürme lassen sich teuer zum Wehrturm und zum Bollwerk ausbauen. Dann schießen sie selbst auf Krieger in der Nähe, auch ohne Wache.</li>
        <li>Angreifen kannst du ein Lager nur aus deinen Militärgebäuden in der Nähe: Kaserne bis ${ATTACK_RANGE.barracks}, Festung bis ${ATTACK_RANGE.fort}, Wachturm bis ${ATTACK_RANGE.tower} Felder entfernt. Schieb deine Grenze mit Wachtürmen an die Stämme heran. Mit dem Werkzeug Truppen steuerst du Soldaten aber überallhin.</li>
        <li><b>Taktik</b>: Angriffe von der Seite treffen härter, von hinten noch mehr. Schwertkämpfer treffen nach einem Anlauf mit Sturmangriff. Im Wald schützen Bäume vor Pfeilen, in deinem Land kämpfen deine Soldaten besser. Fällt ein Häuptling, wanken seine Krieger, schwer Verwundete fliehen. Im Truppen-Fenster wählst du die Haltung: Angriff, Normal oder Stellung halten.</li>
        <li>Katapulte und Rammböcke zerstören auch das Haupthaus. Stürzt es ein, stürmen alle Krieger heraus und es kommen keine neuen mehr.</li>
        <li>Soldaten verteidigen dein Land, Bogenschützen schießen auch von Wachtürmen. Klick auf ein Stammeslager, um es anzugreifen. Erobert gehört dir das Land ringsum.</li>
        <li>Eine ausgebaute Werft baut Langboote mit mehr Plätzen und Kriegsschiffe, die bei Angriffen von der Küste aus mitschießen.</li>
      </ul></div>
    </div>
    <div class="actions"><button class="btn primary" data-act="ok" type="button">Los geht's</button></div>`, (card) => card.querySelector('[data-act=ok]').addEventListener('click', closeModal));
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// liefert { ok } oder { err }
async function redeemCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return { err: 'Gib einen Code ein.' };
  let h = '';
  try { h = await sha256('hearthvale:' + code); } catch (e) { return { err: 'Das geht hier gerade nicht.' }; }
  const kind = CODES[h];
  if (!kind) return { err: 'Diesen Code gibt es nicht.' };
  const note = ' Dieses Tal zählt jetzt nicht mehr für die Bestenliste.';
  if (kind === 'coins') {
    let used = null;
    try { used = localStorage.getItem(GIFT_KEY); } catch (e) { /* egal */ }
    if (used) return { err: 'Dieser Code wurde schon eingelöst.' };
    game.coins += GIFT_COINS; game.gift = true;
    try { localStorage.setItem(GIFT_KEY, String(Date.now())); } catch (e) { /* egal */ }
    saveNow(); renderHud();
    game.toast(`+${GIFT_COINS.toLocaleString('de-DE')} Münzen`);
    return { ok: `${GIFT_COINS.toLocaleString('de-DE')} Münzen gutgeschrieben.${note}` };
  }
  if (kind === 'boost') {
    game.coins += BOOST_COINS; game.gift = true;
    const n = game.addSettlers(BOOST_SETTLERS);
    saveNow(); renderHud();
    game.toast(`+${n} Siedler, +${BOOST_COINS.toLocaleString('de-DE')} Münzen`);
    const meals = game.settlers.length + game.soldiers.length;
    return { ok: `${n} neue Siedler sind eingezogen und ${BOOST_COINS.toLocaleString('de-DE')} Münzen gutgeschrieben. Alle zusammen essen jeden Abend ${meals} Portionen. Kauf Essen im Markt, sonst ziehen Hungrige wieder weg.${note}` };
  }
  // Siedler: alle freien Betten auf einmal
  const n = game.fillBeds();
  if (!n) return { err: game.beds ? `Alle ${game.beds} Betten sind schon belegt. Bau mehr Wohnhäuser, dann bringt der Code wieder Siedler.` : 'Es gibt noch keine Betten. Bau zuerst ein Wohnhaus.' };
  game.gift = true;
  saveNow(); renderHud();
  game.toast(`+${n} Siedler`);
  return { ok: `${n} ${n === 1 ? 'neuer Siedler ist' : 'neue Siedler sind'} eingezogen, jetzt sind alle ${game.beds} Betten belegt. Sorg für genug Essen, hungrige Siedler ziehen wieder weg.${note}` };
}
function showMenu() {
  openModal(`
    <h2>Menü</h2>
    <p>${esc(game.name || (game.mode === 'week' ? `Tal der Woche (${game.week})` : 'Zufälliges Tal'))} · Tag ${game.day} · Talwert ${game.talwert().total.toLocaleString('de-DE')}</p>
    <p class="muted">Dein Spiel wird jeden Abend und zwischendurch automatisch gespeichert.</p>
    <div class="actions">
      <button class="btn primary" data-act="back" type="button">Weiterspielen</button>
      <button class="btn" data-act="save" type="button">Jetzt speichern</button>
      <button class="btn" data-act="start" type="button">Startbildschirm</button>
      <a class="btn" href="../">Alle Spiele</a>
    </div>
    <div class="box" style="margin-top:12px"><h3>Name dieses Spielstands</h3>
      <div class="namerow"><input id="saveName" maxlength="30" placeholder="${esc(game.mode === 'week' ? `Tal der Woche (${game.week})` : 'Zufälliges Tal')}" value="${esc(game.name || '')}"><button class="btn" data-act="rename" type="button">Speichern</button></div>
    </div>
    <div class="box" style="margin-top:12px"><h3>Ton</h3>
      <label class="check"><input type="checkbox" id="optMusic" ${audio.music ? 'checked' : ''}> Musik</label>
      <label class="check"><input type="checkbox" id="optSfx" ${audio.sfx ? 'checked' : ''}> Geräusche</label>
    </div>
    <div class="box" style="margin-top:12px"><h3>Code einlösen</h3>
      <div class="namerow"><input id="giftIn" maxlength="20" autocomplete="off" placeholder="Code"><button class="btn" data-act="redeem" type="button">Einlösen</button></div>
      <p class="muted" id="giftMsg"></p>
    </div>`, (card) => {
    card.querySelector('[data-act=back]').addEventListener('click', closeModal);
    card.querySelector('[data-act=save]').addEventListener('click', (e) => { saveNow(); e.target.textContent = 'Gespeichert'; });
    card.querySelector('[data-act=start]').addEventListener('click', () => { saveNow(); showStart(); });
    const nameIn = card.querySelector('#saveName'), renameBtn = card.querySelector('[data-act=rename]');
    const doRename = () => { game.name = cleanSaveName(nameIn.value); nameIn.value = game.name; saveNow(); renameBtn.textContent = 'Gespeichert'; };
    renameBtn.addEventListener('click', doRename);
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doRename(); } });
    card.querySelector('#optMusic').addEventListener('change', (e) => { audio.unlock(); audio.setMusic(e.target.checked); soundIcon(); });
    card.querySelector('#optSfx').addEventListener('change', (e) => { audio.unlock(); audio.setSfx(e.target.checked); soundIcon(); });
    const giftIn = card.querySelector('#giftIn'), giftBtn = card.querySelector('[data-act=redeem]'), giftMsg = card.querySelector('#giftMsg');
    const doRedeem = async () => {
      giftBtn.disabled = true;
      const r = await redeemCode(giftIn.value);
      giftBtn.disabled = false;
      giftMsg.textContent = r.err || r.ok;
      if (r.ok) giftIn.value = '';
    };
    giftBtn.addEventListener('click', doRedeem);
    giftIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doRedeem(); } });
  });
}

function mergeCounts(...objs) { const out = {}; for (const o of objs) for (const k in o) out[k] = (out[k] || 0) + o[k]; return out; }
function onDayEnd(sum) {
  saveNow();
  audio.play('day');
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
  const ranked = game.mode === 'week' && !game.gift;
  LB.tab = ranked ? 'week' : 'all';
  const render = () => `
    <h2>Ein Jahr in ${game.mode === 'week' ? 'deinem Tal der Woche' : 'deinem Tal'}</h2>
    <div class="big">${score.total.toLocaleString('de-DE')}</div>
    <p class="muted">Talwert nach ${YEAR_DAYS} Tagen</p>
    <dl><dt>Münzen</dt><dd>${Math.round(score.coins).toLocaleString('de-DE')}</dd><dt>Vorräte</dt><dd>${Math.round(score.stock).toLocaleString('de-DE')}</dd><dt>Gebäude und Wege</dt><dd>${Math.round(score.buildings).toLocaleString('de-DE')}</dd><dt>Siedler (${game.settlers.length})</dt><dd>${Math.round(score.settlers).toLocaleString('de-DE')}</dd><dt>Soldaten, Festungen, Boote</dt><dd>${Math.round(score.military || 0).toLocaleString('de-DE')}</dd></dl>
    <p class="muted">Ziele erreicht: ${game.quests.length} von ${QUESTS.length} · erkundet: ${Math.round(game.explored() * 100)} % · Stämme besiegt: ${game.tribes.filter((t) => t.defeated).length} von ${game.tribes.length}</p>
    ${ranked ? (game.submitted ? '<p>Du stehst in der Bestenliste.</p>' : ONLINE ? `<p>Trag dich in die Bestenliste ein:</p><div class="namerow"><input id="nameIn" maxlength="16" autocomplete="nickname" placeholder="Dein Name" value="${esc(TB.getName())}"><button class="btn primary" data-act="submit" type="button">Eintragen</button></div><p class="muted" id="subMsg"></p>` : '') : `<p class="muted">${game.gift ? 'In diesem Tal wurde ein Code eingelöst, darum zählt es nicht für die Bestenliste.' : 'Im zufälligen Tal gibt es keine Bestenliste. Spiel das Tal der Woche, um dich zu vergleichen.'}</p>`}
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

/* ---------- Ziele ---------- */
function showQuests() {
  openModal(`
    <h2>Ziele</h2>
    <p class="lead">Jedes erreichte Ziel bringt Münzen. Die Reihenfolge ist ein Vorschlag, du kannst alle jederzeit schaffen.</p>
    <ul class="qlist">${QUESTS.map((q) => { const done = game.quests.includes(q.id); return `<li class="${done ? 'done' : ''}"><span class="q">${done ? '✓' : '○'}</span><span>${esc(q.text)}</span><span class="chip">${icon('coin')}${q.reward}</span></li>`; }).join('')}</ul>
    <p class="muted">Erkundet: ${Math.round(game.explored() * 100)} % des Tals · Schatztruhen: ${game.stats.chests} · Stämme besiegt: ${game.tribes.filter((t) => t.defeated).length} von ${game.tribes.length}</p>
    <div class="actions"><button class="btn primary" data-act="ok" type="button">Weiter</button></div>`, (card) => card.querySelector('[data-act=ok]').addEventListener('click', closeModal));
}

/* ---------- Truppen ---------- */
// Zufriedenheit: woraus sie besteht und was sie bewirkt
function showMood() {
  game.computeHappiness();
  const h = Math.round(game.happiness), parts = game.happyParts || [];
  const work = Math.round((game.moodMul() - 1) * 100), fight = Math.round((game.moraleMul() - 1) * 100);
  const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
  openModal(`
    <h2>Zufriedenheit: ${h} %</h2>
    <p class="lead">Je zufriedener deine Siedler, desto schneller arbeiten sie, desto mehr ziehen nachts zu und desto stärker kämpfen deine Soldaten.</p>
    <div class="grid2">
      <div class="box"><h3>Woraus sie besteht</h3><ul>${parts.map((p) => `<li>${esc(p.label)}: <b>${sign(p.v)}</b></li>`).join('')}</ul></div>
      <div class="box"><h3>Was sie bewirkt</h3><ul>
        <li>Arbeitstempo: <b>${sign(work)} %</b></li>
        <li>Kampfkraft der Soldaten: <b>${sign(fight)} %</b></li>
        <li>Neue Siedler je Nacht: <b>${h >= 75 ? 'bis zu 6' : h < 30 ? 'höchstens 2' : 'bis zu 5'}</b></li>
        ${h < 20 ? '<li><b>Achtung:</b> Bleibt die Stimmung so schlecht, ziehen Siedler weg.</li>' : ''}
      </ul></div>
    </div>
    <div class="box"><h3>So wird sie besser</h3><ul>
      <li>Schmuck unter <b>Bauen › Wohlstand</b>: Brunnen, Blumengarten, Statue, Kapelle. Je mehr Siedler, desto mehr Schmuck brauchen sie.</li>
      <li>Ein <b>Gasthaus</b> feiert jeden Abend ein Fest, wenn Bier aus der <b>Brauerei</b> und Brot da sind. Das <b>Badehaus</b> braucht abends Holz.</li>
      <li>Abwechslung beim Essen: Beeren, Fisch, Brot, Karotten und Kürbisse zählen einzeln.</li>
      <li>Wohnhäuser zu Stein- und Stadthäusern ausbauen. Genug Betten bauen.</li>
    </ul></div>
    <div class="actions"><button class="btn primary" data-act="ok" type="button">Schließen</button></div>
  `, (card) => card.querySelector('[data-act=ok]').addEventListener('click', closeModal));
}
function showTroops() {
  const ar = game.soldiers.filter((s) => s.type === 'archer').length, sw = game.soldiers.length - ar;
  const places = game.buildings.filter((b) => b.type === 'barracks' || b.type === 'tower' || b.type === 'fort');
  const row = (name, list) => { const a = list.filter((s) => s.type === 'archer').length; return `<li><span class="q">⚑</span><span>${esc(name)}</span><span class="pair">${icon('sword')}${list.length - a} ${icon('bow')}${a}</span></li>`; };
  const seenNames = {};
  let rows = places.map((b) => { const nm = game.levelName(b), n = (seenNames[nm] = (seenNames[nm] || 0) + 1), many = places.filter((o) => game.levelName(o) === nm).length > 1; return row(many ? `${nm} ${n}` : nm, game.soldiers.filter((s) => s.home === b.id && s.campaign == null)); }).join('');
  game.tribes.forEach((t, i) => { const list = game.soldiers.filter((s) => s.campaign === i); if (list.length) rows += row(`Feldzug gegen die ${t.name}`, list); });
  const training = game.buildings.filter((b) => b.type === 'barracks' && b.training).length;
  const veterans = game.soldiers.filter((s) => s.rank > 0).length;
  openModal(`
    <h2>Deine Truppen</h2>
    <div class="grid2">
      <div class="box"><h3>${icon('sword')} Schwertkämpfer</h3><div class="big">${sw}</div><p class="muted">Halten viel aus und kämpfen Mann gegen Mann.</p></div>
      <div class="box"><h3>${icon('bow')} Bogenschützen</h3><div class="big">${ar}</div><p class="muted">Schießen aus der Ferne und von Wachtürmen.</p></div>
    </div>
    ${rows ? `<h3 class="mh">Wo sie sind</h3><ul class="qlist">${rows}</ul>` : '<p>Noch keine Kaserne. Du findest sie unter Bauen bei Militär &amp; Wasser.</p>'}
    <p class="muted">${training ? `${training} in Ausbildung · ` : ''}${veterans ? `${veterans} mit Rangstreifen · ` : ''}Flotte: ${esc(game.fleetText())}${game.boats ? ` (${game.boatSeats()} Plätze)` : ''} · Waffen im Lager: ${game.stock.sword || 0} Schwerter, ${game.stock.bow || 0} Bögen</p>
    <div class="actions"><button class="btn primary" data-act="ok" type="button">Weiter</button>${game.soldiers.length ? '<button class="btn" data-act="steer" type="button">Truppen steuern</button>' : ''}</div>`, (card) => {
    card.querySelector('[data-act=ok]').addEventListener('click', closeModal);
    const st = card.querySelector('[data-act=steer]');
    if (st) st.addEventListener('click', () => { closeModal(); setTool('troops'); });
  });
}

/* ---------- HUD ---------- */
function renderHud(force) {
  if (!game) return;
  const h = game.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  $('hDay').textContent = `Tag ${game.day} · ${SEASONS[game.season]} ${game.dayOfSeason}/${DAYS_PER_SEASON}`;
  $('hTime').textContent = `${hh}:${String(mm).padStart(2, '0')} · ${{ sun: 'sonnig', rain: 'Regen', snow: 'Schnee' }[game.weather]}${game.day > YEAR_DAYS ? ` · Jahr ${game.year}` : ` · noch ${YEAR_DAYS - game.day + 1} Tage`}`;
  $('hCoins').textContent = game.coins.toLocaleString('de-DE');
  $('hEnergyBar').style.width = `${(game.energy / MAX_ENERGY) * 100}%`;
  $('hEnergy').classList.toggle('low', game.energy < 20);
  $('hPeople').textContent = `${game.workers()}/${game.settlers.length} · ${game.beds} Betten`;
  const mood = Math.round(game.happiness == null ? 50 : game.happiness);
  $('hMoodV').textContent = `${mood} %`;
  $('hMood').classList.toggle('good', mood >= 70); $('hMood').classList.toggle('bad', mood < 35);
  $('hMoodMouth').setAttribute('d', mood >= 60 ? 'M6.5 12.2q3.5 3.2 7 0' : mood >= 35 ? 'M6.8 13h6.4' : 'M6.5 14.2q3.5 -3 7 0');
  const tp = $('troops'), mil = game.soldiers.length || game.boats || game.buildings.some((b) => b.type === 'barracks');
  tp.hidden = !mil;
  if (mil) {
    const ar = game.soldiers.filter((s) => s.type === 'archer').length, sw = game.soldiers.length - ar, away = game.soldiers.filter((s) => s.campaign != null).length;
    const key = [sw, ar, game.boats, away].join('|');
    if (tp.dataset.k !== key) {
      tp.dataset.k = key;
      tp.innerHTML = `<b>Truppen</b><span title="Schwertkämpfer">${icon('sword')}${sw}<i class="lbl"> Schwertkämpfer</i></span><span title="Bogenschützen">${icon('bow')}${ar}<i class="lbl"> Bogenschützen</i></span>${game.boats ? `<span title="Boote">${icon('boat')}${game.boats}<i class="lbl"> ${game.boats === 1 ? 'Boot' : 'Boote'}</i></span>` : ''}${away ? `<span class="away">${away} auf Feldzug</span>` : ''}`;
    }
  }
  const qs = game.openQuests(2), gq = $('goals');
  const qKey = qs.map((q) => q.id).join(',') + game.quests.length;
  if (gq.dataset.k !== qKey) { gq.dataset.k = qKey; gq.innerHTML = qs.length ? `<b>Ziele</b>${qs.map((q) => `<span>${icon('flag')}${esc(q.text)} <i>+${q.reward}</i></span>`).join('')}` : '<b>Ziele</b><span>Alle Ziele erreicht!</span>'; }
  const raid = game.foes.some((f) => f.mode === 'raid') && game.alert;
  const al = $('alert');
  al.hidden = !raid;
  if (raid) { al.textContent = `⚔ ${game.alert.text}!`; al.style.borderColor = game.alert.color; }
  const res = $('res');
  if (force || !res.children.length) res.innerHTML = HUD_ITEMS.map((k) => `<span class="chip" data-k="${k}" title="${ITEMS[k].name}">${icon(k)}<b>0</b></span>`).join('');
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
    if (buildType === 'field') return ghost.ok ? `Acker anlegen: Du gehst hin und hackst den Boden (${ACTIONS.till.energy} Energie). Esc beendet.` : ghost.err;
    if (!game.has(def.cost)) return `${def.name}: Dafür fehlen Rohstoffe.`;
    if (!ghost.ok) return ghost.err;
    const n = game.targetsInRange(buildType, ghost.x, ghost.y);
    const what = { chop: 'Bäume', mine: 'Felsen und Bergwände', ore: 'Bergwände und Felsen', fish: 'Wasserfelder', plant: 'freie Plätze', scout: 'unerkundete Felder' }[def.job];
    if (n === 0) return `Achtung: keine ${what} in Reichweite. Der Arbeiter hätte hier nichts zu tun.`;
    return `${def.name} hier bauen${n != null ? ` · ${n} ${what} in Reichweite` : ''}. Esc bricht ab.`;
  }
  const k = w.i(tx, ty);
  if (!w.seen[k]) return 'Unerkundet. Geh hin, um es zu erkunden.';
  const b = game.buildingAt(tx, ty);
  if (b) return `${game.levelName(b)}${b.built ? '' : ' (Baustelle)'}: Klick für Details`;
  const ts = w.tstruct[k];
  if (ts >= 0) return `Lager der ${game.tribes[ts].name}: Klick für Details`;
  const o = w.o(tx, ty), g = w.g(tx, ty);
  if (o && o.t === 'chest') return `Schatztruhe öffnen: ${ACTIONS.open.energy} Energie`;
  if (o && o.t === 'tree') return `Baum fällen: +${o.age < 4 ? 1 : o.kind === 'oak' ? 3 : 2} Holz, ${ACTIONS.chop.energy} Energie`;
  if (o && o.t === 'rock') return `Stein abbauen: +3 Stein, ${ACTIONS.mine.energy} Energie`;
  if (o && o.t === 'bush') return o.berries ? 'Beeren pflücken: +3 Beeren' : 'Der Strauch trägt gerade keine Beeren.';
  if (o && o.t === 'crop') {
    const c = CROPS[o.kind];
    if (o.grown >= c.days) return `Ernten: +${c.yield[1]} ${ITEMS[c.yield[0]].name}`;
    const wet = w.wet[k] || game.weather === 'rain';
    return wet ? `${c.name}: ${o.grown} von ${c.days} Tagen, heute gegossen` : `${c.name} gießen (Kanne ${game.water}/${CAN_SIZE}): ${o.grown} von ${c.days} Tagen`;
  }
  if (w.isWater(tx, ty)) return game.water < CAN_SIZE ? `Gießkanne füllen (${game.water}/${CAN_SIZE})` : game.boats ? 'Mit dem Boot hinfahren' : 'Wasser. Hier füllst du die Gießkanne.';
  if (g === G.SOIL) {
    const sk = game.pickSeed();
    return sk ? `${CROPS[sk].name} säen (${game.stock[CROPS[sk].seed] || 0} Saat). Die Sorte wählst du in deiner Hütte.` : game.seedHint();
  }
  if (g === G.MOUNTAIN) return 'Berg. Steinbruch und Erzmine daneben bauen hier Stein und Erz ab.';
  const owner = game.landOwner(tx, ty);
  if (owner >= 2 && game.tribes[owner - 2]) return `Land der ${game.tribes[owner - 2].name}. Hierhin gehen`;
  return 'Hierhin gehen';
}

/* ---------- Werkzeuge und Tempo ---------- */
function setTool(t) {
  tool = t;
  if (troopMode && t !== 'troops') { troopMode = false; R.free = look; sel.clear(); box = null; if (panelMode === 'troops') closePanel(); }
  if (t === 'troops' && !troopMode) { troopMode = true; setLook(false); R.free = true; if (game) game.player.move = { x: 0, y: 0 }; panelMode = 'troops'; selected = null; renderPanel(); }
  if (t !== 'build') { buildType = null; ghost = null; if (panelMode === 'build') closePanel(); }
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('sel', b.dataset.tool === t));
  if (t === 'build') openBuildMenu();
  renderHud();
}
function setSpeed(s) { speed = s; document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('sel', Number(b.dataset.speed) === s)); }

/* ---------- Seitenpanel ---------- */
function closePanel() { $('panel').hidden = true; panelMode = null; selected = null; selTribe = null; }
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
  p.classList.toggle('troopmode', panelMode === 'troops');
  if (panelMode === 'build') {
    p.innerHTML = `<div class="head"><h2>Bauen</h2><button class="x" data-close aria-label="Schließen">×</button></div>
      <p>Wähl ein Gebäude und klick auf die Karte. Freie Siedler bauen es auf.</p>
      <div class="blist">${BUILD_GROUPS.map(([title, list]) => `<h3>${esc(title)}</h3>` + list.map((k) => { const d = BUILDINGS[k]; return `<button class="bitem" data-build="${k}" type="button"${buildType === k ? ' style="border-color:var(--honey)"' : ''}><b>${d.name}</b><span class="cost">${costChips(d.cost, game)}</span><span class="desc">${esc(d.desc)}</span></button>`; }).join('')).join('')}</div>`;
    p.querySelectorAll('[data-build]').forEach((b) => b.addEventListener('click', () => { buildType = b.dataset.build; hint(`${BUILDINGS[buildType].name}: Klick auf die Karte, um es zu platzieren. Zieh die Karte, um weiter weg zu bauen. Esc bricht ab.`); renderPanel(); }));
  } else if (panelMode === 'tribe') {
    renderTribe(p);
    return;
  } else if (panelMode === 'troops') {
    renderTroopPanel(p);
    return;
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
        if (s && s.why && s.state !== 'working' && !s.carry) body += `<p>${esc(s.why)}</p>`;
        if (!s) body += '<p>Alle Siedler sind beschäftigt. Bau ein Wohnhaus und sorg für Essen, dann kommen neue.</p>';
        const n = game.targetsInRange(b.type, b.x, b.y, b);
        if (n != null) body += `<div class="row"><span>In Reichweite</span><b>${n} ${{ chop: 'Bäume', mine: 'Felsen', ore: 'Bergwände und Felsen', fish: 'Wasserfelder', plant: 'freie Plätze', scout: 'unerkundete Felder' }[def.job]}</b></div>${n === 0 ? (def.job === 'scout' ? '<p>Im Umkreis ist alles erkundet. Bau eine Späherhütte weiter draußen.</p>' : '<p>Hier gibt es nichts zu tun. Reiß das Gebäude ab und bau es an einer besseren Stelle neu.</p>') : ''}`;
      }
      if (def.recipe) {
        const r = game.recipeOf(b), ins = Object.keys(r.in), outs = Object.keys(r.out);
        body += `<div class="row"><span>Rezept</span><span class="cost">${ins.map((k) => chip(k, r.in[k])).join('')} → ${outs.map((k) => chip(k, r.out[k])).join('')}</span></div>`;
        body += `<div class="row"><span>Im Gebäude</span><span class="cost">${ins.map((k) => chip(k, b.in[k] || 0)).join('')} ${outs.map((k) => chip(k, b.out[k] || 0)).join('')}</span></div>`;
        if (ins.some((k) => (game.stock[k] || 0) < r.in[k]) && ins.some((k) => (b.in[k] || 0) < r.in[k])) body += `<p>Im Lager fehlt ${ins.map((k) => ITEMS[k].name).join(' und ')}.</p>`;
      }
      if (b.type === 'farm') body += `<div class="row"><span>Felder</span><b>${b.fields.length} / ${game.fieldsOf(b)}</b></div>${game.season === 3 ? '<p>Im Winter ruht der Hof.</p>' : ''}`;
      if (def.job) {   // Träger und Wege
        const out = def.recipe ? [] : Object.keys(b.out || {}).filter((k) => b.out[k] > 0);
        if (out.length) body += `<div class="row"><span>Abholbereit für Träger</span><span class="cost">${out.map((k) => chip(k, b.out[k])).join('')}</span></div>`;
        body += `<div class="row"><span>Weg an der Tür</span><b>${game.roadLinked(b) ? 'ja, Träger sind schneller' : 'nein'}</b></div>`;
      }
      if (b.type === 'house') body += `<div class="row"><span>Bewohner</span><b>${game.settlers.filter((s) => s.home === b.id).length} / ${game.bedsOf(b)}</b></div>`;
      if (def.decor) body += `<div class="row"><span>Schmuck</span><b>+${def.decor} Punkte</b></div><div class="row"><span>Zufriedenheit im Dorf</span><b>${Math.round(game.happiness == null ? 50 : game.happiness)} %</b></div>`;
      if (b.type === 'tavern') { const need = Math.max(1, Math.ceil(game.settlers.length / 10)); body += `<div class="row"><span>Fest heute Abend</span><span class="cost">${chip('beer', need)}${chip('bread', need)}</span></div><p>${(game.stock.beer || 0) >= need && (game.stock.bread || 0) >= need ? 'Genug im Lager, heute Abend wird gefeiert.' : 'Im Lager fehlt noch Bier oder Brot. Bau eine Brauerei.'}</p>`; }
      if (b.type === 'bathhouse') { const need = 2 + Math.ceil(game.settlers.length / 20); body += `<div class="row"><span>Holz heute Abend</span><span class="cost">${chip('wood', need)}</span></div>`; }
      if (b.type === 'barracks') {
        const mine = game.soldiers.filter((s) => s.home === b.id), lvl = b.level || 1, L = BARRACKS_LEVELS[lvl], ord = game.ordersOf(b);
        const away = game.soldiers.filter((s) => s.campaign != null).length, elsewhere = game.soldiers.filter((s) => s.home !== b.id).length;
        body += `<div class="troopbox">${['sword', 'archer'].map((type) => {
          const U = UNITS[type], n = mine.filter((s) => (s.type === 'archer') === (type === 'archer')).length;
          const hp = Math.round(U.hp + L.hp * (type === 'archer' ? 0.75 : 1)), atk = U.atk + L.atk * (type === 'archer' ? 0.7 : 1);
          return `<div class="tb"><span class="tbicon">${icon(U.weapon)}</span><span class="tbname">${U.plural}</span><b class="tbn">${n}</b><span class="tbstat">Leben ${hp} · Kraft ${atk.toFixed(1).replace('.', ',')}${type === 'archer' ? ' · schießt' : ''}</span></div>`;
        }).join('')}</div>`;
        body += `<div class="row"><span>Platz</span><b>${mine.length} / ${game.soldierCap(b)}</b></div>`;
        if (elsewhere) body += `<div class="row"><span>Woanders (Türme, Festungen, Feldzug)</span><b>${elsewhere}</b></div>`;
        body += `<div class="row"><span>Stufe</span><b>${lvl} von 3 · ${esc(L.name)}</b></div>`;
        if (b.training) { const pct = Math.min(100, Math.round(b.training.t / TRAIN_TIME * 100)); body += `<div class="row"><span>In Ausbildung: ${UNITS[b.training.type || 'sword'].name}</span><b>${pct} %</b></div><div class="prog"><i style="width:${pct}%"></i></div>`; }
        body += '<h3 class="sub">Ausbilden</h3>';
        for (const type of ['sword', 'archer']) {
          const U = UNITS[type];
          body += `<div class="orow"><span class="n">${icon(U.weapon)} ${U.name}</span><span class="stepper"><button class="btn small" data-order="${type}" data-n="-1" type="button" aria-label="Weniger">−</button><b>${ord[type] || 0}</b><button class="btn small" data-order="${type}" data-n="1" type="button" aria-label="Mehr">+</button><button class="btn small" data-order="${type}" data-n="5" type="button">+5</button></span><span class="auto">Je Soldat ${costChips(game.trainCost(b, type), game)} und 1 freier Siedler</span></div>`;
        }
        if ((ord.sword || ord.archer) && !b.training && b.why) body += `<p>${esc(b.why)}</p>`;
        body += `<div class="row"><span>Waffen im Lager</span><span class="cost">${chip('sword', game.stock.sword || 0)}${chip('bow', game.stock.bow || 0)}</span></div>`;
        if (away) body += `<div class="row"><span>Auf Feldzug</span><b>${away}</b></div><div class="actions"><button class="btn small" data-act="recallAll" type="button">Alle zurückrufen</button></div>`;
        body += `<div class="actions">${mine.some((s) => s.state !== 'garrison') ? '<button class="btn small" data-act="steer" type="button">Diese Truppen steuern</button>' : ''}<button class="btn small" data-act="troops" type="button">Alle Truppen ansehen</button></div>`;
      }
      if (b.type === 'tower' || b.type === 'fort') {
        const crew = game.soldiers.filter((s) => s.home === b.id);
        body += `<div class="row"><span>Wache</span><b>${crew.filter((s) => s.arrived).length} / ${def.garrison}</b></div>`;
        body += game.manned(b) ? '<p>Besetzt. Das Land ringsum gehört dir, und die Wache verteidigt es.</p>' : `<p>${crew.length ? 'Ein Soldat ist auf dem Weg hierher.' : 'Noch unbesetzt. Freie Soldaten aus einer Kaserne kommen von selbst.'}</p>`;
        if (b.type === 'tower' && (b.level || 1) >= 2) { const L = TOWER_LEVELS[Math.min(3, b.level)]; body += `<div class="row"><span>Geschütz</span><b>Schaden ${String(L.atk).replace('.', ',')} alle ${String(L.cd).replace('.', ',')} s · ${String(L.range).replace('.', ',')} Felder</b></div><p>Schießt selbst auf jeden Krieger in Reichweite, auch ohne Wache.</p>`; }
      }
      if (b.type === 'shipyard') {
        const L = SHIPYARD_LEVELS[Math.min(3, b.level || 1)];
        if ((game.ships || []).length) { const away = game.ships.filter((s) => s.state !== 'dock').length; body += `<div class="row"><span>${icon('boat')} Kriegsschiffe</span><b>${game.ships.length}${away ? ` (${away} unterwegs)` : ''}</b></div><p>Kriegsschiffe steuerst du mit dem Werkzeug Truppen. Sie schießen auf jeden Krieger in Reichweite, auch vor deiner Küste.</p>`; }
        body += `<div class="row"><span>Deine Flotte</span><b>${esc(game.fleetText())}</b></div><div class="row"><span>Plätze für Soldaten</span><b>${game.boatSeats()}</b></div><div class="row"><span>Bestellt: ${L.boats}</span><b>${b.orders || 0}</b></div>`;
        body += `<div class="actions"><button class="btn small" data-boat="1" type="button">${L.boat} bestellen</button>${b.orders ? '<button class="btn small" data-boat="0" type="button">Abbestellen</button>' : ''}</div><p>Ein ${L.boat} hat ${L.seats} Plätze${L.armed ? ' und ein Wurfgeschütz. Bei Angriffen auf Lager am Wasser schießen bis zu 2 Kriegsschiffe mit' : ''}. Mit Booten fahren alle übers Wasser.</p>`;
      }
      if (b.type === 'siege') {
        const out = (k) => (game.sieges || []).filter((c) => c.kind === k && c.state !== 'park').length;
        body += `<div class="row"><span>${icon('catapult')} Katapulte</span><b>${game.catapults || 0}${out('catapult') ? ` (${out('catapult')} unterwegs)` : ''} · bestellt ${b.orders || 0}</b></div>`;
        body += `<div class="row"><span>${icon('ram')} Rammböcke</span><b>${game.rams || 0}${out('ram') ? ` (${out('ram')} unterwegs)` : ''} · bestellt ${b.ramOrders || 0}</b></div>`;
        body += `<div class="row"><span>Ein Rammbock braucht</span><span class="cost">${costChips(RAM_RECIPE.in, game)}</span></div>`;
        body += `<div class="actions"><button class="btn small" data-boat="1" type="button">Katapult bestellen</button><button class="btn small" data-ram="1" type="button">Rammbock bestellen</button>${b.orders || b.ramOrders ? '<button class="btn small" data-act="unorder" type="button">Alles abbestellen</button>' : ''}</div>`;
        body += `<p>Katapulte beschießen ein Lager aus der Ferne, erst die Wachtürme, dann Häuser und Hütten. Rammböcke sind gepanzert, rollen bis an die Gebäude und zerschlagen sie. Jedes eingestürzte Haus oder jede Hütte kostet den Stamm Krieger. Losschicken kannst du beides im Fenster eines Stammes.</p>`;
      }
      if (b.type === 'hideout') {
        const mine = game.thieves || [], ready = mine.filter((h) => h.state === 'home').length;
        body += `<div class="row"><span>${icon('thief')} Deine Diebe</span><b>${mine.length}${mine.length - ready ? ` (${mine.length - ready} unterwegs)` : ''}</b></div>`;
        body += `<div class="actions"><button class="btn small" data-act="trainThief" type="button" ${game.coins >= THIEF.coins ? '' : 'disabled'}>Dieb ausbilden: ${THIEF.coins} Münzen und 1 freier Siedler</button></div>`;
        body += '<p>Diebe schleichen sich in ein Lager, stehlen erst Waffen, dann Münzen oder Vorräte und rennen heim. Je mehr Krieger und Türme ein Lager hat, desto eher werden sie entdeckt. Losschicken kannst du sie im Fenster eines Stammes.</p>';
      }
      const up = game.upgradeInfo(b);
      if (b.upgrading) body += `<div class="row"><span>Ausbau</span><b>${Math.round(b.upgrading.progress * 100)} %</b></div><div class="prog"><i style="width:${Math.round(b.upgrading.progress * 100)}%"></i></div><p>Freie Siedler bauen aus. Das Gebäude bleibt in Betrieb.</p>`;
      else if (up) body += `<div class="row"><span>Ausbau: ${esc(up.name)}</span><span class="cost">${costChips(up.cost, game)}</span></div><p>${esc(up.text)}.</p><div class="actions"><button class="btn small" data-act="upgrade" type="button" ${game.has(up.cost) ? '' : 'disabled'}>Ausbauen</button></div>`;
      if (b.type === 'hut') body += `<div class="actions"><button class="btn primary" data-act="sleep" type="button">Schlafen gehen (Tag beenden)</button></div>`;
      if (b.type === 'hut') body += `<div class="row"><span>Du säst</span><span class="stepper">${Object.keys(CROPS).map((k) => `<button class="btn small${game.seedKind === k ? ' on' : ''}" data-seed="${k}" type="button">${CROPS[k].name} · ${game.stock[CROPS[k].seed] || 0}</button>`).join('')}</span></div><div class="row"><span>Gießkanne</span><b>${game.water} / ${CAN_SIZE}</b></div>`;
      if (b.type === 'storage') {
        const hauling = game.settlers.filter((s) => s.haul).length, idle = game.settlers.filter((s) => s.job == null && s.recruit == null && !(s.task && s.task.site != null)).length;
        body += `<div class="row"><span>Träger</span><b>${hauling} unterwegs · ${idle} ohne Arbeit</b></div><p>Siedler ohne Arbeitsplatz tragen Waren von den Gebäuden hierher und Zutaten in die Werkstätten. Auf gebauten Wegen sind sie viel schneller.</p>`;
      }
      if (b.type === 'storage' || b.type === 'hut') {
        body += `<div class="row"><span>Vorräte</span><span></span></div><div class="cost" style="display:flex;flex-wrap:wrap;gap:4px">${[...STOCK_ORDER, 'seed_wheat', 'seed_carrot', 'seed_pumpkin'].map((k) => `<span class="chip" title="${ITEMS[k].name}">${icon(k)}${game.stock[k] || 0}</span>`).join('')}</div>
          <div class="actions"><button class="btn" data-act="eat" type="button">Etwas essen</button></div>`;
      }
      if (b.type === 'market') body += `<div class="mtabs"><button class="btn small${marketTab === 'sell' ? ' on' : ''}" data-mtab="sell" type="button">Verkaufen</button><button class="btn small${marketTab === 'buy' ? ' on' : ''}" data-mtab="buy" type="button">Kaufen</button></div>`;
      if (b.type === 'market' && marketTab === 'buy') {
        body += `<p>Hier kaufst du jede Ware mit Münzen. Kaufen kostet rund die Hälfte mehr, als Verkaufen bringt. Du hast ${game.coins.toLocaleString('de-DE')} Münzen.</p>`;
        body += [...STOCK_ORDER, 'seed_wheat', 'seed_carrot', 'seed_pumpkin'].map((k) => {
          const pr = game.buyPrice(k), can = Math.floor(game.coins / pr);
          return `<div class="sellrow"><span class="n">${icon(k)}<span>${ITEMS[k].name} · ${game.stock[k] || 0}</span></span><span class="b"><span class="chip">${icon('coin')}${pr}</span><button class="btn small" data-buy="${k}" data-n="1" type="button" ${can >= 1 ? '' : 'disabled'}>+1</button><button class="btn small" data-buy="${k}" data-n="10" type="button" ${can >= 10 ? '' : 'disabled'}>+10</button><button class="btn small" data-buy="${k}" data-n="50" type="button" ${can >= 50 ? '' : 'disabled'}>+50</button></span></div>`;
        }).join('');
      }
      if (b.type === 'market' && marketTab === 'sell') {
        body += `<div class="row"><b>Verkaufen</b><span class="muted" style="color:var(--muted)">Preis je Stück</span></div>`;
        body += STOCK_ORDER.map((k) => {
          const n = game.stock[k] || 0, auto = game.autoSell[k];
          return `<div class="sellrow"><span class="n">${icon(k)}<span>${ITEMS[k].name} · ${n}</span></span><span class="b"><span class="chip">${icon('coin')}${ITEMS[k].price}</span><button class="btn small" data-sell="${k}" data-n="1" ${n ? '' : 'disabled'}>1</button><button class="btn small" data-sell="${k}" data-n="10" ${n >= 10 ? '' : 'disabled'}>10</button><button class="btn small" data-sell="${k}" data-n="all" ${n ? '' : 'disabled'}>Alle</button></span>
            <label class="auto"><input type="checkbox" data-auto="${k}" ${auto != null ? 'checked' : ''}> jeden Abend verkaufen, behalten: <input type="number" min="0" max="999" data-keep="${k}" value="${auto != null ? auto : 20}"></label></div>`;
        }).join('');
      }
    }
    if (b.built && def.job) body += `<div class="actions"><button class="btn small" data-act="pause" type="button">${b.paused ? 'Weiterarbeiten' : 'Arbeit pausieren'}</button></div>${b.paused ? '<p>Pausiert. Der Arbeiter wartet an der Tür.</p>' : ''}`;
    const canDemolish = b.type !== 'hut' && b.type !== 'fort';
    body += canDemolish ? `<div class="actions"><button class="btn small danger" data-act="demolish" type="button">${confirmDemolish ? 'Wirklich abreißen? Du bekommst die Hälfte zurück.' : 'Abreißen'}</button></div>` : '';
    const title = game.levelName(b);
    p.innerHTML = `<div class="head"><h2>${title}</h2><button class="x" data-close aria-label="Schließen">×</button></div>${body}`;
    const on = (sel, fn) => p.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));
    on('[data-act=sleep]', () => { game.sleep(); closePanel(); });
    on('[data-act=pause]', () => { b.paused = !b.paused; renderPanel(); });
    on('[data-act=upgrade]', () => { const err = game.startUpgrade(b); game.toast(err || 'Ausbau geplant. Freie Siedler bauen ihn.'); renderHud(); renderPanel(); });
    on('[data-order]', (e) => { const type = e.currentTarget.dataset.order, n = Number(e.currentTarget.dataset.n), ord = game.ordersOf(b); ord[type] = Math.max(0, (ord[type] || 0) + n); renderPanel(); });
    on('[data-act=troops]', () => showTroops());
    on('[data-act=steer]', () => { const ids = game.soldiers.filter((s) => s.home === b.id && s.state !== 'garrison').map((s) => s.id); setTool('troops'); sel.clear(); ids.forEach((id) => sel.add(id)); renderPanel(); });
    on('[data-seed]', (e) => { game.seedKind = e.currentTarget.dataset.seed; renderPanel(); });
    on('[data-boat]', (e) => { const n = Number(e.currentTarget.dataset.boat); b.orders = n ? (b.orders || 0) + n : 0; renderPanel(); });
    on('[data-ram]', (e) => { b.ramOrders = (b.ramOrders || 0) + Number(e.currentTarget.dataset.ram); renderPanel(); });
    on('[data-act=unorder]', () => { b.orders = 0; b.ramOrders = 0; renderPanel(); });
    on('[data-act=trainThief]', () => { const err = game.trainThief(b); game.toast(err || 'Ein Siedler ist jetzt ein Dieb.'); renderHud(); renderPanel(); });
    on('[data-act=recallAll]', () => { let n = 0; game.tribes.forEach((t, i) => { n += game.recall(i); }); game.toast(n ? `${n} Soldaten kehren zurück.` : 'Niemand ist unterwegs.'); renderPanel(); });
    on('[data-act=eat]', () => { game.toast(game.eat()); audio.play('eat'); renderHud(); renderPanel(); });
    on('[data-act=demolish]', () => { if (!confirmDemolish) { confirmDemolish = true; renderPanel(); return; } confirmDemolish = false; const err = game.demolish(b); if (err) game.toast(err); closePanel(); });
    on('[data-sell]', (e) => { const k = e.currentTarget.dataset.sell, n = e.currentTarget.dataset.n === 'all' ? game.stock[k] : Number(e.currentTarget.dataset.n); const got = game.sell(k, n); if (got) { game.toast(`${n} ${ITEMS[k].name} für ${got} Münzen verkauft`); audio.play('coin'); } renderHud(); renderPanel(); });
    on('[data-buy]', (e) => { const k = e.currentTarget.dataset.buy, n = Number(e.currentTarget.dataset.n), cost = n * game.buyPrice(k); const okBuy = game.buy(k, n); game.toast(okBuy ? `${n} ${ITEMS[k].name} für ${cost} Münzen gekauft` : 'Dafür reichen die Münzen nicht.'); if (okBuy) audio.play('coin'); renderHud(); renderPanel(); });
    on('[data-mtab]', (e) => { marketTab = e.currentTarget.dataset.mtab; renderPanel(); });
    p.querySelectorAll('[data-auto]').forEach((cb) => cb.addEventListener('change', () => { const k = cb.dataset.auto, keep = Number(p.querySelector(`[data-keep="${k}"]`).value) || 0; if (cb.checked) game.autoSell[k] = keep; else delete game.autoSell[k]; }));
    p.querySelectorAll('[data-keep]').forEach((inp) => inp.addEventListener('change', () => { const k = inp.dataset.keep; if (game.autoSell[k] != null) game.autoSell[k] = Math.max(0, Number(inp.value) || 0); inp.blur(); }));
  }
  p.querySelector('[data-close]').addEventListener('click', () => { if (panelMode === 'build') setTool('hand'); closePanel(); });
}
/* ---------- Truppen steuern ---------- */
const VNAME = { catapult: 'Katapult', ram: 'Rammbock', ship: 'Kriegsschiff' }, VNAMES = { catapult: 'Katapulte', ram: 'Rammböcke', ship: 'Kriegsschiffe' };
const allVehicles = () => [...(game.sieges || []), ...(game.ships || [])];
const vehicleById = (id) => allVehicles().find((v) => v.id === id);
function selList() {
  const out = [];
  for (const id of [...sel]) {
    const s = game.soldiers.find((x) => x.id === id);
    if (s && s.state !== 'garrison') out.push(s);
    else if (s || !vehicleById(id)) sel.delete(id);
  }
  return out;
}
// ausgewählte Katapulte, Rammböcke und Kriegsschiffe
function selVehicles() { return allVehicles().filter((v) => sel.has(v.id)); }
function pickVehicle(fx, fy) {
  let best = null, bd = 0.8;
  for (const v of allVehicles()) { const d = Math.hypot(v.x - fx, v.y - 0.3 - fy); if (d < bd) { bd = d; best = v; } }
  return best;
}
// Gebäude eines Lagers unter dem Zeiger (Turm, Haus, Hütte); die Halle heißt: das ganze Lager
function structureAt(ti, x, y) {
  const t = game.tribes[ti];
  return game.campTargets(t).find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) || null;
}
// Soldat oder Krieger unter dem Zeiger (mit demselben Versatz wie beim Zeichnen)
function pickUnit(list, fx, fy, salt) {
  let best = null, bd = 0.6;
  for (const u of list) {
    const ux = u.x + (cellRand(u.id, 1, salt) - 0.5) * 0.35, uy = u.y + (cellRand(u.id, 2, salt) - 0.5) * 0.25 - 0.3;
    const d = Math.hypot(ux - fx, uy - fy);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
const visibleSoldiers = () => game.soldiers.filter((s) => s.state !== 'garrison');
function troopHint(t) {
  const v = pickVehicle(t.fx, t.fy);
  if (v) return `${VNAME[v.kind]} · Leben ${Math.ceil(v.hp)}/${v.maxHp} · ${sel.has(v.id) ? 'ausgewählt, tippen zum Abwählen' : 'tippen zum Auswählen'}`;
  const s = pickUnit(visibleSoldiers(), t.fx, t.fy, 5);
  if (s) return `${UNITS[s.type || 'sword'].name} · Leben ${Math.ceil(s.hp)}/${Math.round(game.maxHp(s))}${s.rank ? ` · Rang ${s.rank}` : ''} · ${sel.has(s.id) ? 'ausgewählt, tippen zum Abwählen' : 'tippen zum Auswählen'}`;
  if (!sel.size) return 'Tipp auf Soldaten oder Fahrzeuge, um sie auszuwählen. Am Rechner: Shift halten und einen Rahmen ziehen.';
  const f = pickUnit(game.foes, t.fx, t.fy, 6);
  if (f) return `Angreifen: Krieger der ${game.tribes[f.tribe].name}`;
  const w = game.world;
  if (!w.inb(t.x, t.y)) return '';
  const k = w.i(t.x, t.y);
  if (w.tstruct[k] >= 0 && w.seen[k]) {
    const st = selVehicles().length ? structureAt(w.tstruct[k], t.x, t.y) : null, nm = game.tribes[w.tstruct[k]].name;
    return st ? `${st.kind === 'tower' ? 'Wachturm' : st.kind === 'house' ? 'Haus' : 'Hütte'} der ${nm} angreifen` : `Lager der ${nm} angreifen`;
  }
  return `${sel.size === 1 ? 'Hierhin schicken' : `${sel.size} hierhin schicken`} und die Stellung halten`;
}
function troopTap(e) {
  const t = R.screenToTile(e.clientX, e.clientY), now = performance.now() / 1000;
  const hv = pickVehicle(t.fx, t.fy);
  if (hv) { if (sel.has(hv.id)) sel.delete(hv.id); else sel.add(hv.id); renderPanel(); hint(troopHint(t)); return; }
  const hit = pickUnit(visibleSoldiers(), t.fx, t.fy, 5);
  if (hit) { if (sel.has(hit.id)) sel.delete(hit.id); else sel.add(hit.id); renderPanel(); hint(troopHint(t)); return; }
  const list = selList(), vl = selVehicles(), n = list.length + vl.length;
  if (!n) { hint('Tipp zuerst auf Soldaten oder Fahrzeuge, um sie auszuwählen.'); return; }
  const foe = pickUnit(game.foes, t.fx, t.fy, 6);
  if (foe) {
    if (list.length) game.orderAttackFoe(list, foe);
    if (vl.length) game.orderVehicleAttackFoe(vl, foe);
    ping = { x: Math.floor(foe.x), y: Math.floor(foe.y), t: now, attack: true };
    game.toast(n === 1 ? 'Angriff auf den Krieger.' : `${n} greifen den Krieger an.`);
    renderPanel(); return;
  }
  const w = game.world;
  if (!w.inb(t.x, t.y)) return;
  const k = w.i(t.x, t.y);
  if (w.tstruct[k] >= 0 && w.seen[k]) {
    const ti = w.tstruct[k];
    if (list.length) { const err = game.attackTribe(ti, null, list); if (err) game.toast(err); }
    if (vl.length) { const st = structureAt(ti, t.x, t.y); game.orderVehicleAttack(vl, ti, st); game.toast(`${vl.length === 1 ? VNAME[vl[0].kind] : `${vl.length} Fahrzeuge`} gegen ${st ? (st.kind === 'tower' ? 'den Wachturm' : st.kind === 'house' ? 'das Haus' : 'die Hütte') : 'das Lager'} der ${game.tribes[ti].name}.`); }
    ping = { x: t.x, y: t.y, t: now, attack: true };
    renderPanel(); return;
  }
  if (list.length) { const err = game.orderMove(list, t.x, t.y); if (err) game.toast(err); }
  if (vl.length) { const moved = game.orderVehicleMove(vl, t.x, t.y); if (moved < vl.length && vl.some((v) => v.kind === 'ship')) game.toast('Kriegsschiffe fahren nur übers Wasser. Tipp näher ans Wasser.'); }
  ping = { x: t.x, y: t.y, t: now };
  renderPanel();
}
function selectBox(b) {
  const a = R.screenToTile(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), c = R.screenToTile(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
  sel.clear();
  for (const s of visibleSoldiers()) {
    const ux = s.x + (cellRand(s.id, 1, 5) - 0.5) * 0.35, uy = s.y + (cellRand(s.id, 2, 5) - 0.5) * 0.25 - 0.3;
    if (ux >= a.fx - 0.3 && ux <= c.fx + 0.3 && uy >= a.fy - 0.4 && uy <= c.fy + 0.4) sel.add(s.id);
  }
  for (const v of allVehicles()) if (v.x >= a.fx - 0.4 && v.x <= c.fx + 0.4 && v.y - 0.3 >= a.fy - 0.5 && v.y - 0.3 <= c.fy + 0.5) sel.add(v.id);
  renderPanel();
}
function renderTroopPanel(p) {
  const list = selList(), vl = selVehicles(), ar = list.filter((s) => s.type === 'archer').length, sw = list.length - ar, all = visibleSoldiers(), allV = allVehicles();
  const nV = (k) => vl.filter((v) => v.kind === k).length, hasV = (k) => allV.some((v) => v.kind === k);
  const count = (fn) => list.filter(fn).length + vl.filter(fn).length;
  const states = [['halten Stellung', count((s) => s.state === 'hold')], ['unterwegs', count((s) => ['move', 'march', 'return', 'toGarrison', 'roll', 'sail', 'attack'].includes(s.state))], ['kämpfen', count((s) => ['fight', 'fire', 'ram', 'hunt'].includes(s.state))], ['zu Hause', count((s) => ['home', 'park', 'dock'].includes(s.state))]].filter((x) => x[1]);
  let body = '';
  if (list.length || vl.length) {
    const parts = [sw ? `${sw} Schwertkämpfer` : '', ar ? `${ar} Bogenschützen` : '', ...['catapult', 'ram', 'ship'].map((k) => nV(k) ? `${nV(k)} ${nV(k) === 1 ? VNAME[k] : VNAMES[k]}` : '')].filter(Boolean);
    const boxes = [['sword', sw, UNITS.sword.weapon, UNITS.sword.plural], ['archer', ar, UNITS.archer.weapon, UNITS.archer.plural], ...['catapult', 'ram', 'ship'].filter(hasV).map((k) => [k, nV(k), k === 'ship' ? 'boat' : k, VNAMES[k]])];
    body += `<p class="selsum">${parts.join(' · ')} ausgewählt</p><div class="troopbox">${boxes.map(([, n, ic, name]) => `<div class="tb"><span class="tbicon">${icon(ic)}</span><span class="tbname">${name}</span><b class="tbn">${n}</b><span class="tbstat">ausgewählt</span></div>`).join('')}</div>${states.length ? `<p>${states.map(([txt, n]) => `${n} ${txt}`).join(' · ')}</p>` : ''}`;
  } else body += `<p>${all.length || allV.length ? 'Noch nichts ausgewählt.' : 'Du hast noch keine Soldaten. Bilde in der Kaserne welche aus.'}</p>`;
  if (all.length || allV.length) body += `<div class="actions"><button class="btn small" data-pick="all" type="button">Alle (${all.length + allV.length})</button>${all.length ? `<button class="btn small" data-pick="sword" type="button">${icon('sword')} Schwertkämpfer</button><button class="btn small" data-pick="archer" type="button">${icon('bow')} Bogenschützen</button>` : ''}${['catapult', 'ram', 'ship'].filter(hasV).map((k) => `<button class="btn small" data-pick="${k}" type="button">${icon(k === 'ship' ? 'boat' : k)} ${VNAMES[k]}</button>`).join('')}${list.length || vl.length ? '<button class="btn small" data-pick="none" type="button">Keine</button>' : ''}</div>`;
  if (list.length) {   // Haltung der ausgewählten Soldaten
    const st = (k) => list.filter((s) => (s.stance || 'normal') === k).length;
    const cur = ['aggressive', 'normal', 'hold'].find((k) => st(k) === list.length) || 'gemischt';
    body += `<div class="row"><span>Haltung</span><span class="stepper">${[['aggressive', 'Angriff'], ['normal', 'Normal'], ['hold', 'Stellung']].map(([k, n]) => `<button class="btn small${cur === k ? ' on' : ''}" data-stance="${k}" type="button">${n}</button>`).join('')}</span></div>`;
  }
  if (list.length || vl.length) body += '<div class="actions"><button class="btn small" data-act="find" type="button">Zu ihnen springen</button><button class="btn small" data-act="release" type="button">Zurück nach Hause</button></div>';
  body += '<ul class="tips"><li>Tipp auf Soldaten, Katapulte, Rammböcke oder Kriegsschiffe, um sie aus- oder abzuwählen. Am Rechner: Shift halten und einen Rahmen ziehen.</li><li>Dann tipp auf die Karte: Sie gehen oder segeln hin und halten dort die Stellung. Katapulte und Schiffe schießen dann auf alles in Reichweite.</li><li>Tipp auf ein Lager oder gezielt auf einen Turm, ein Haus oder eine Hütte: Angriff. Tipp auf einen Krieger: Katapulte und Schiffe schießen auf ihn.</li><li>Taktik: Greif von der Seite oder von hinten an, das trifft härter. Schwertkämpfer treffen nach einem Anlauf mit Sturmangriff. Im Wald schützen Bäume vor Pfeilen. Fällt der Häuptling, wanken seine Krieger.</li><li>Ziehen oder WASD verschiebt die Ansicht, die Minikarte springt hin. Esc oder die Hand beendet das Steuern.</li></ul>';
  p.innerHTML = `<div class="head"><h2>Truppen steuern</h2><button class="x" data-close aria-label="Schließen">×</button></div>${body}`;
  const on = (q, fn) => p.querySelectorAll(q).forEach((el) => el.addEventListener('click', fn));
  on('[data-pick]', (e) => {
    const k = e.currentTarget.dataset.pick;
    sel.clear();
    if (k === 'all' || k === 'sword' || k === 'archer') for (const s of all) if (k === 'all' || (k === 'archer') === (s.type === 'archer')) sel.add(s.id);
    if (k === 'all' || k === 'catapult' || k === 'ram' || k === 'ship') for (const v of allV) if (k === 'all' || v.kind === k) sel.add(v.id);
    renderPanel();
  });
  on('[data-stance]', (e) => { const k = e.currentTarget.dataset.stance; game.setStance(selList(), k); game.toast(k === 'aggressive' ? 'Haltung Angriff: Sie jagen Feinde weit.' : k === 'hold' ? 'Haltung Stellung: Sie bleiben an ihrem Platz.' : 'Haltung Normal.'); renderPanel(); });
  on('[data-act=find]', () => { const l = [...selList(), ...selVehicles()]; if (!l.length) return; R.cam.x = l.reduce((a, s) => a + s.x, 0) / l.length; R.cam.y = l.reduce((a, s) => a + s.y, 0) / l.length; });
  on('[data-act=release]', () => { const l = selList(), v = selVehicles(), n = l.length + v.length; game.orderRelease(l); game.orderVehicleRelease(v); game.toast(n === 1 ? 'Geht zurück nach Hause.' : `${n} gehen zurück nach Hause.`); sel.clear(); renderPanel(); });
  p.querySelector('[data-close]').addEventListener('click', () => setTool('hand'));
}
function openTribe(i) { panelMode = 'tribe'; selTribe = i; selected = null; buildType = null; ghost = null; attackW = { sword: 99, archer: 99 }; renderPanel(); }
// grobe Kampfkraft: Leben mal Schaden pro Sekunde
const power = (hp, atk, cd, ranged) => hp * atk / cd * (ranged ? 1.5 : 1);
function renderTribe(p) {
  const t = game.tribes[selTribe];
  if (!t || t.defeated) { closePanel(); return; }
  const att = game.attackers(t), sources = game.attackSources(t);
  const swords = att.filter((s) => s.type !== 'archer'), archers = att.filter((s) => s.type === 'archer');
  attackW.sword = Math.max(0, Math.min(attackW.sword, swords.length));
  attackW.archer = Math.max(0, Math.min(attackW.archer, archers.length));
  let pick = [...swords.slice(0, attackW.sword), ...archers.slice(0, attackW.archer)];
  if (t.island) pick = pick.slice(0, game.boatSeats());
  const away = game.soldiers.filter((s) => s.campaign === selTribe).length;
  const fighting = game.foes.filter((f) => f.tribe === selTribe && f.mode === 'defend').length;
  const raiding = game.foes.filter((f) => f.tribe === selTribe && f.mode === 'raid').length;
  const total = t.warriors + fighting;
  const w = game.world;
  let coast = false;
  for (let y = t.cy - 7; y <= t.cy + 7 && !coast; y++) for (let x = t.cx - 7; x <= t.cx + 7; x++) if (w.isWater(x, y) && Math.hypot(x - t.cx, y - t.cy) <= 7) { coast = true; break; }
  const ships = coast ? Math.min(2, game.fleet[3] || 0) : 0;
  const mine = pick.reduce((a, s) => a + power(game.maxHp(s), game.atkOf(s), game.cdOf(s), s.type === 'archer'), 0) + ships * 40;
  const tier = game.tribeTier(t);
  const theirs = total * power(game.warriorHp(t), game.warriorAtk(t), 0.9, false) * 1.05 + (t.chiefDead ? 0 : power(game.chiefHp(t), 5 + 1.2 * tier, 1.0, false));
  let body = `<p>${t.island ? 'Ein Fischerstamm auf der Insel im See.' : 'Ein fremder Stamm mit eigenem Land.'} ${esc(game.raidInfo(t))}</p>`;
  body += `<div class="row"><span>Krieger im Lager</span><b>${total}${fighting ? ` (${fighting} kämpfen)` : ''}</b></div>`;
  body += `<div class="row"><span>Stärke</span><b>Stufe ${tier} von 4</b></div>`;
  body += `<div class="row"><span>Häuptling</span><b>${t.chiefDead ? 'gefallen' : 'lebt'}</b></div>`;
  const tb = t.builds || [], nT = tb.filter((b) => b.kind === 'tower').length, nH = tb.filter((b) => b.kind === 'house').length;
  body += `<div class="row"><span>Bauten</span><b>${nT} ${nT === 1 ? 'Wachturm' : 'Wachtürme'} · ${nH} ${nH === 1 ? 'Haus' : 'Häuser'} · ${t.huts.length} ${t.huts.length === 1 ? 'Hütte' : 'Hütten'}</b></div>`;
  body += `<div class="row"><span>Waffen im Lager</span><b>${t.weapons || 0}${t.weapons ? ` (Krieger +${Math.round(Math.min(25, t.weapons) * 0.8)} % stärker)` : ''}</b></div>`;
  if (nT) body += `<p>Die Wachtürme schießen auf alles, was dir gehört und näher als ${CAMP_BUILD.tower.range} Felder kommt. Katapulte und Rammböcke holen sie herunter.</p>`;
  if (raiding) body += `<div class="row"><span>Auf Raubzug</span><b>${raiding}</b></div>`;
  if (away) body += `<div class="row"><span>Angriff läuft</span><b>${away} ${away === 1 ? 'Soldat' : 'Soldaten'}</b></div><div class="actions"><button class="btn small" data-act="recall" type="button">Zurückrufen</button></div>`;
  if (sources.length) {
    const names = {}; for (const b of sources) { const n = game.levelName(b); names[n] = (names[n] || 0) + 1; }
    body += `<div class="row"><span>Greifen an aus</span><b>${Object.keys(names).map((n) => names[n] > 1 ? `${names[n]} × ${esc(n)}` : esc(n)).join(', ')}</b></div>`;
  }
  if (t.island && game.boats <= 0) body += '<p>Auf die Insel kommst du nur mit einem Boot. Bau eine Werft am Ufer und bestell eins.</p>';
  else if (!sources.length) body += `<p>Kein eigenes Militärgebäude in Reichweite. Angreifen kannst du nur aus Gebäuden in der Nähe: Kaserne bis ${ATTACK_RANGE.barracks}, Festung bis ${ATTACK_RANGE.fort}, Wachturm bis ${ATTACK_RANGE.tower} Felder vom Lager. Bau einen Wachturm näher heran.</p>`;
  else if (att.length) {
    const row = (type, n) => `<div class="row"><span>${icon(UNITS[type].weapon)} ${UNITS[type].plural} (${n} frei)</span><span class="stepper"><button class="btn small" data-t="${type}" data-n="-1" type="button" aria-label="Weniger">−</button><b>${attackW[type]}</b><button class="btn small" data-t="${type}" data-n="1" type="button" aria-label="Mehr">+</button><button class="btn small" data-t="${type}" data-n="all" type="button">Alle</button></span></div>`;
    body += row('sword', swords.length) + row('archer', archers.length);
    if (t.island) body += `<p>Deine Boote bringen höchstens ${game.boatSeats()} Soldaten hinüber.</p>`;
    if (ships) body += `<p>${ships === 1 ? 'Ein Kriegsschiff schießt' : `${ships} Kriegsschiffe schießen`} vom Wasser aus mit.</p>`;
    const verdict = !total ? 'Das Lager ist ohne Verteidiger. Ein Soldat reicht.' : !pick.length ? 'Wähl Soldaten für den Angriff aus.' : mine >= theirs * 1.8 ? 'Das reicht sicher.' : mine >= theirs * 1.1 ? 'Das könnte knapp werden.' : 'Das reicht wohl nicht. Nimm mehr Soldaten mit oder bau die Kaserne aus.';
    body += `<p><b>${esc(verdict)}</b></p><div class="actions"><button class="btn primary" data-act="attack" type="button" ${pick.length ? '' : 'disabled'}>Angreifen mit ${pick.length}</button></div>`;
  } else body += '<p>In den Gebäuden in Reichweite sind keine freien Soldaten. Bilde in einer Kaserne welche aus. Jeder Wachturm und jede Festung behält eine Wache.</p>';
  if (!t.island && ((game.catapults || 0) > 0 || (game.rams || 0) > 0)) {   // Belagerung
    const sg = game.sieges || [], readyC = game.idleVehicles('catapult').length, readyR = game.idleVehicles('ram').length;
    const here = sg.filter((c) => c.campaign === selTribe).length, kc = Math.min(readyC, 3), kr = Math.min(readyR, 2);
    body += `<div class="row"><span>${icon('catapult')} Katapulte · ${icon('ram')} Rammböcke bereit</span><b>${readyC} · ${readyR}${here ? ` (${here} belagern)` : ''}</b></div>`;
    const what = [kc ? `${kc} ${kc === 1 ? 'Katapult' : 'Katapulten'}` : '', kr ? `${kr} ${kr === 1 ? 'Rammbock' : 'Rammböcken'}` : ''].filter(Boolean).join(' und ');
    if ((kc || kr) && sources.length && (tb.length || t.huts.length)) body += `<div class="actions"><button class="btn small" data-act="siege" type="button">Belagern mit ${what}</button></div><p>Die Krieger stürmen heraus, um die Geräte zu zerschlagen, und die Türme schießen. Schick Soldaten zum Schutz mit.</p>`;
  }
  const th = game.thieves || [], readyT = th.filter((h) => h.state === 'home').length, outT = th.filter((h) => h.target === selTribe && h.state !== 'home').length;
  if (th.length) {   // Diebe
    const p = Math.min(THIEF.maxSpot, THIEF.spot + THIEF.spotPer * t.warriors + THIEF.spotTower * nT);
    body += `<div class="row"><span>${icon('thief')} Diebe bereit</span><b>${readyT}${outT ? ` · ${outT} hier unterwegs` : ''}</b></div>`;
    if (readyT) body += `<div class="actions"><button class="btn small" data-act="sendThief" type="button">Dieb losschicken</button></div><p>Gefahr, entdeckt zu werden: ${p < 0.06 ? 'gering' : p < 0.1 ? 'mittel' : 'hoch'}. Er stiehlt erst Waffen, dann Münzen oder Vorräte.</p>`;
  }
  if (!t.island) { const c = game.giftCost(t); body += `<div class="actions"><button class="btn small" data-act="gift" type="button" ${game.coins >= c ? '' : 'disabled'}>Geschenk schicken: ${c} Münzen, 8 Tage Frieden</button></div>`; }
  body += '<p>Erobert ist das Lager, wenn kein Krieger mehr steht und der Häuptling gefallen ist. Dann wird es deine Festung und das Land ringsum gehört dir.</p>';
  p.innerHTML = `<div class="head"><h2><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</h2><button class="x" data-close aria-label="Schließen">×</button></div>${body}`;
  const on = (sel, fn) => p.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));
  on('[data-n]', (e) => { const type = e.currentTarget.dataset.t, v = e.currentTarget.dataset.n, max = type === 'archer' ? archers.length : swords.length; attackW[type] = v === 'all' ? max : Math.max(0, Math.min(max, attackW[type] + Number(v))); renderPanel(); });
  on('[data-act=attack]', () => { const err = game.attackTribe(selTribe, { sword: attackW.sword, archer: attackW.archer }); if (err) game.toast(err); renderPanel(); });
  on('[data-act=siege]', () => { const err = game.siegeTribe(selTribe, 3); if (err) game.toast(err); renderPanel(); });
  on('[data-act=sendThief]', () => { const err = game.sendThief(selTribe); if (err) game.toast(err); renderPanel(); });
  on('[data-act=recall]', () => { const n = game.recall(selTribe); game.toast(`${n} ${n === 1 ? 'Soldat kehrt' : 'Soldaten kehren'} zurück.`); renderPanel(); });
  on('[data-act=gift]', () => { const err = game.sendGift(selTribe); if (err) game.toast(err); renderHud(); renderPanel(); });
  p.querySelector('[data-close]').addEventListener('click', closePanel);
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
  hint(troopMode ? troopHint(t) : describe(t.x, t.y));
}
function onTap(e) {
  if (!game || modalOpen) return;
  if (troopMode) { troopTap(e); return; }
  const t = R.screenToTile(e.clientX, e.clientY);
  hover = { x: t.x, y: t.y };
  if (buildType) {
    const gh = ghostAt(t.fx, t.fy);
    if (e.pointerType === 'touch' && (!touchGhost || touchGhost.x !== gh.x || touchGhost.y !== gh.y)) { touchGhost = gh; ghost = gh; hint(gh.ok ? `Nochmal tippen, um ${BUILDINGS[buildType].name} hier zu bauen.` : gh.err); return; }
    touchGhost = null;
    const err = game.place(buildType, gh.x, gh.y);
    if (err) { game.toast(err); return; }
    if (buildType !== 'path' && buildType !== 'field') { game.toast(`${BUILDINGS[buildType].name} geplant. Freie Siedler bauen es auf.`); buildType = null; ghost = null; setTool('hand'); }
    else ghost = ghostAt(t.fx, t.fy);
    renderHud();
    return;
  }
  const r = game.interact(t.x, t.y, tool);
  if (r && r.open) openBuilding(r.open);
  else if (r && r.tribe != null) openTribe(r.tribe);
  else if (r && r.msg) game.toast(r.msg);
}
function updateMove() {
  if (!game) return;
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x--;
  if (keys.has('d') || keys.has('arrowright')) x++;
  if (keys.has('w') || keys.has('arrowup')) y--;
  if (keys.has('s') || keys.has('arrowdown')) y++;
  if (troopMode) { game.player.move = { x: 0, y: 0 }; return; }   // im Truppen-Modus verschieben die Tasten die Ansicht
  game.player.move = { x, y };
  if (x || y) { game.player.path = null; game.player.pending = null; }
}
function onKey(e) {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (modalOpen) { if (k === 'enter') { const b = $('card').querySelector('.btn.primary'); if (b) { e.preventDefault(); b.click(); } } return; }
  if (!game) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); keys.add(k); if (look) setLook(false); updateMove(); return; }
  if (k === 'e' && !troopMode) { const p = game.player, d = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.facing || 2]; const r = game.interact(Math.floor(p.x) + d[0], Math.floor(p.y) + d[1], tool); if (r && r.open) openBuilding(r.open); else if (r && r.tribe != null) openTribe(r.tribe); else if (r && r.msg) game.toast(r.msg); return; }
  if (k === '1') setTool('hand');
  else if (k === 'b') setTool(tool === 'build' ? 'hand' : 'build');
  else if (k === 't') setTool(tool === 'troops' ? 'hand' : 'troops');
  else if (k === 'escape') {
    if (look && !buildType) { setLook(false); return; }   // beim Bauen bricht Esc zuerst das Bauen ab
    if (troopMode) { if (sel.size) { sel.clear(); renderPanel(); } else setTool('hand'); return; }
    if (buildType) { buildType = null; ghost = null; renderPanel(); } else { if (panelMode === 'build') setTool('hand'); closePanel(); }
  }
  else if (k === ' ') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
  else if (k === '+' || k === '=') zoom(1); else if (k === '-') zoom(-1);
}
function zoom(d, at) {
  const i = ZOOMS.indexOf(R.cam.zoom), z = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + d))];
  if (z === R.cam.zoom) return;
  if (!at || !R.free || !Number.isFinite(at.x) || !Number.isFinite(at.y)) { R.cam.zoom = z; return; }
  // in der freien Ansicht bleibt der Punkt unter dem Mauszeiger stehen
  const mx = at.x - R.W / 2, my = at.y - R.H / 2, wx = R.cam.x + mx / R.S, wy = R.cam.y + my / R.S;
  R.cam.zoom = z; R.cam.x = wx - mx / R.S; R.cam.y = wy - my / R.S;
}
// frei umschauen an/aus. Aus: die Ansicht gleitet zurück zu dir.
function setLook(on) {
  look = !!on && !troopMode;
  R.free = troopMode || look;
  $('backBtn').hidden = !look;
  if (look) hint(LOOK_HINT); else if (!troopMode) hint(HINT0);
}
// was liegt ungefähr an dieser Stelle? (Zeiger über der Minikarte)
function whatsThere(tx, ty) {
  const w = game.world;
  if (!w.inb(tx, ty)) return '';
  if (!w.seen[w.i(tx, ty)]) return 'Unerkundet';
  for (const t of game.tribes) if (!t.defeated && Math.hypot(t.cx - tx, t.cy - ty) <= 6 && w.seen[w.i(t.cx, t.cy)]) return `Lager der ${t.name}`;
  let best = null, bd = 3.5;
  for (const b of game.buildings) { const d = Math.hypot(b.x + b.w / 2 - tx, b.y + b.h / 2 - ty); if (d < bd) { bd = d; best = b; } }
  if (best) return game.levelName(best);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = tx + dx, y = ty + dy;
    if (w.inb(x, y) && w.seen[w.i(x, y)] && w.obj[w.i(x, y)] && w.obj[w.i(x, y)].t === 'chest') return 'Schatztruhe';
  }
  const g = w.g(tx, ty), o = w.obj[w.i(tx, ty)];
  if (g === G.WATER || g === G.DEEP) return 'Wasser';
  if (g === G.MOUNTAIN) return 'Berge';
  if (g === G.BRIDGE) return 'Brücke';
  if (g === G.SAND) return 'Strand';
  if (g === G.PATH || g === G.DIRT) return 'Weg';
  if (g === G.SOIL) return 'Acker';
  if (g === G.FOREST || (o && o.t === 'tree')) return 'Wald';
  return g === G.MEADOW ? 'Wiese' : 'Grasland';
}

function soundIcon() {
  const b = $('soundBtn'); if (!b) return;
  b.innerHTML = audio.muted
    ? '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  b.setAttribute('aria-label', audio.muted ? 'Ton an' : 'Ton aus');
  b.title = audio.muted ? 'Ton an' : 'Ton aus';
}

/* ---------- Schleife ---------- */
let last = performance.now(), drawFailed = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!game) return;
  if (!modalOpen && speed > 0) {
    const sum = game.update(dt * speed);
    if (sum) { if (troopMode) setTool('hand'); closePanel(); onDayEnd(sum); }
  }
  if (troopMode && !modalOpen) {   // Ansicht mit WASD verschieben
    const v = 18 / R.cam.zoom * dt;
    if (keys.has('a') || keys.has('arrowleft')) R.cam.x -= v;
    if (keys.has('d') || keys.has('arrowright')) R.cam.x += v;
    if (keys.has('w') || keys.has('arrowup')) R.cam.y -= v;
    if (keys.has('s') || keys.has('arrowdown')) R.cam.y += v;
  }
  R.follow(game, dt);
  const cr = $('world').getBoundingClientRect();
  const boxUi = box ? { x: Math.min(box.x0, box.x1) - cr.left, y: Math.min(box.y0, box.y1) - cr.top, w: Math.abs(box.x1 - box.x0), h: Math.abs(box.y1 - box.y0) } : null;
  // ein Zeichenfehler darf Anzeige, Töne und Speichern nicht mitreißen
  try {
    R.draw(game, { hover: modalOpen ? null : hover, ghost, selected, buildMode: !!buildType, sel: troopMode ? sel : null, box: boxUi, ping }, now / 1000);
    R.drawMini(game, dt);
  } catch (e) { if (!drawFailed) { drawFailed = true; console.error(e); } }
  hudT -= dt; if (hudT <= 0) { hudT = 0.2; renderHud(); }
  panelT -= dt; if (panelT <= 0) { panelT = 0.6; if (panelMode === 'building' || panelMode === 'tribe' || panelMode === 'troops') renderPanel(); }
  saveT -= dt; if (saveT <= 0) { saveT = 45; saveNow(); }
  if (active) playSounds(); else if (game.sfx) game.sfx.length = 0;
}
function playSounds() {
  const q = game.sfx;
  if (q && q.length) {
    const view = Math.max(R.W, R.H) / R.S / 2;
    for (const e of q) {
      if (e.x == null) { audio.play(e.n, 1, 0); continue; }
      const dx = e.x - R.cam.x, dy = e.y - R.cam.y;
      audio.play(e.n, 1 - Math.hypot(dx, dy) / (view * 1.3), dx / view);
    }
    q.length = 0;
  }
  const fighting = game.foes.some((f) => f.mode === 'raid' || f.state === 'fight') || game.soldiers.some((s) => s.state === 'fight');
  audio.setMood(fighting ? 'battle' : game.season === 3 ? 'winter' : game.hour >= 20 || game.hour < 7 ? 'night' : 'day');
  audio.update();
}

/* ---------- Start ---------- */
function boot() {
  R = new Renderer($('world'), $('mini'));
  R.resize();
  window.addEventListener('resize', () => R.resize());
  const cv = $('world');
  cv.addEventListener('pointermove', onPointerMove);
  let down = null;
  const canPan = () => true;   // Ziehen verschiebt die Karte immer, auch beim Bauen; ein kurzer Klick setzt das Gebäude
  cv.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, shift: e.shiftKey, cx: R.cam.x, cy: R.cam.y, drag: false };
    if (canPan() && cv.setPointerCapture) try { cv.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down || !canPan() || modalOpen) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.drag && Math.hypot(dx, dy) < 12) return;
    if (!down.drag && !troopMode) { setLook(true); down.cx = R.cam.x; down.cy = R.cam.y; }   // Karte ziehen = umschauen
    down.drag = true;
    if (down.shift && troopMode) box = { x0: down.x, y0: down.y, x1: e.clientX, y1: e.clientY };
    else { R.cam.x = down.cx - dx / R.S; R.cam.y = down.cy - dy / R.S; }
  });
  cv.addEventListener('pointerup', (e) => {
    if (down && down.drag && box) { selectBox(box); box = null; }
    else if (down && !down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12) onTap(e);
    down = null;
  });
  cv.addEventListener('pointerleave', () => { hover = null; if (buildType && !touchGhost) ghost = null; });
  // Mausrad und Trackpad: höchstens eine Zoomstufe alle 0,22 s, sonst rauscht ein Wisch durch alle Stufen
  let wheelT = 0;
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (Math.abs(e.deltaY) < 1 || now - wheelT < 220) return;
    wheelT = now;
    const r = cv.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1 : -1, { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });
  // Safari: Zwei-Finger-Zoom auf dem Trackpad zoomt die Karte statt der ganzen Seite
  let gScale = 1;
  cv.addEventListener('gesturestart', (e) => { e.preventDefault(); gScale = 1; });
  cv.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), at = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (e.scale / gScale > 1.25) { zoom(1, at); gScale = e.scale; } else if (e.scale / gScale < 0.8) { zoom(-1, at); gScale = e.scale; }
  });
  cv.addEventListener('gestureend', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
  // Ton darf erst nach einer Berührung oder Taste starten
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock); window.addEventListener('touchend', unlock);
  $('soundBtn').addEventListener('click', () => { audio.unlock(); const on = audio.muted; audio.setMusic(on); audio.setSfx(on); soundIcon(); });
  soundIcon();
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); updateMove(); });
  window.addEventListener('blur', () => { keys.clear(); updateMove(); });
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool === tool && (tool === 'build' || tool === 'troops') ? 'hand' : b.dataset.tool)));
  // Minikarte: Klick oder Ziehen schaut dorthin; der Zeiger darüber verrät, was da liegt
  const mini = $('mini');
  let miniDown = false;
  const miniTile = (e) => { const r = mini.getBoundingClientRect(); return { x: Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width)) * game.world.w, y: Math.max(0, Math.min(0.9999, (e.clientY - r.top) / r.height)) * game.world.h }; };
  mini.addEventListener('pointerdown', (e) => {
    if (!game || modalOpen || !active) return;
    e.preventDefault();
    miniDown = true;
    try { mini.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    if (!troopMode) setLook(true);
    const p = miniTile(e); R.cam.x = p.x; R.cam.y = p.y;
  });
  mini.addEventListener('pointermove', (e) => {
    if (!game || modalOpen || !active) return;
    const p = miniTile(e);
    if (miniDown) { R.cam.x = p.x; R.cam.y = p.y; return; }
    if (e.pointerType === 'mouse') hint(`Dort: ${whatsThere(Math.floor(p.x), Math.floor(p.y))}. Klick, um hinzuschauen.`);
  });
  const miniUp = () => { miniDown = false; };
  mini.addEventListener('pointerup', miniUp); mini.addEventListener('pointercancel', miniUp);
  mini.addEventListener('pointerleave', () => { if (!miniDown && !troopMode && game) hint(look ? LOOK_HINT : HINT0); });
  $('backBtn').addEventListener('click', () => setLook(false));
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
  $('hEnergy').addEventListener('click', () => { if (game) { game.toast(game.eat()); audio.play('eat'); renderHud(); } });
  $('hMood').addEventListener('click', () => game && showMood());
  $('zoomIn').addEventListener('click', () => zoom(1));
  $('zoomOut').addEventListener('click', () => zoom(-1));
  $('helpBtn').addEventListener('click', () => game && showHelp(false));
  $('menuBtn').addEventListener('click', () => game && showMenu());
  $('goals').addEventListener('click', () => game && showQuests());
  $('troops').addEventListener('click', () => game && showTroops());
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  if (window.innerWidth >= 1200) R.cam.zoom = 1.25;
  // Hintergrund für den Startbildschirm: dein Spielstand oder das Tal der Woche
  migrateOldSave();
  const recent = slotList()[0];
  game = (recent && loadSlot(recent.id)) || Game.create(`hearthvale:${isoWeek().key}`, 'week', isoWeek().key);
  R.snap(game); fitMini();
  showStart();
  requestAnimationFrame(frame);
  window.__hv = { get game() { return game; }, R, audio };   // für Tests
}
boot();
