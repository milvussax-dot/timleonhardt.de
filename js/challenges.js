// Tages-Challenges: jeden Tag drei neue, für alle gleich (aus dem Datum gewürfelt)
import { TRACKS, PARKS } from './course.js';
import { WEATHERS, WEATHER_LIST } from './weather.js';
import { BOT_DIFFS } from './bot.js';
import { MEDALS } from './medals.js';
import { mulberry32, hashString, todayStr } from './rng.js';

const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

const GENERATORS = [
  (r) => {
    const tr = pick(TRACKS, r), tier = 1 + Math.floor(r() * 3);
    return { id: `medal-${tr.id}-${tier}`, text: `Hol ${MEDALS[tier].name} auf „${tr.name}“`, hint: 'Zeitfahren oder Bot-Rennen',
      check: (x) => x.course === 'race' && x.trackId === tr.id && x.medal >= tier };
  },
  (r) => {
    const n = 2 + Math.floor(r() * 4);
    return { id: `flips-${n}`, text: `Stehe ${n} Flips in einem Lauf`, hint: 'In der Luft ↓ / ↑ halten',
      check: (x) => x.flips >= n };
  },
  (r) => {
    const p = pick(PARKS, r), n = (p.big ? 7000 : 4000) + Math.floor(r() * 4) * 1000;
    return { id: `fs-${p.id}-${n}`, text: `${n.toLocaleString('de-DE')} Punkte im „${p.name}“`, hint: 'Freestyle',
      check: (x) => x.mode === 'freestyle' && x.trackId === p.id && x.score >= n };
  },
  (r) => {
    const n = 800 + Math.floor(r() * 8) * 200;
    return { id: `lawine-${n}`, text: `Entkomme der Lawine ${n.toLocaleString('de-DE')} m weit`, hint: 'Lawinen-Flucht',
      check: (x) => x.mode === 'lawine' && x.distance >= n };
  },
  (r) => {
    const tr = pick(TRACKS.slice(0, 3), r);
    return { id: `slalom-${tr.id}`, text: `Slalom „${tr.name}“ ohne verpasstes Tor`, hint: 'Slalom',
      check: (x) => x.mode === 'slalom' && x.trackId === tr.id && x.finished && x.missed === 0 };
  },
  (r) => {
    const d = Math.floor(r() * 3);
    return { id: `bots-${d}`, text: `Gewinne ein Bot-Rennen (${BOT_DIFFS[d].name} oder härter)`, hint: 'Bot-Rennen',
      check: (x) => x.mode === 'bots' && x.position === 1 && x.botDiff >= d };
  },
  (r) => {
    const w = pick(WEATHER_LIST.filter((k) => k !== 'sonne'), r);
    return { id: `weather-${w}`, text: `Fahr eine Strecke bei „${WEATHERS[w].name}“ zu Ende`, hint: 'Wetter beim Start wählen',
      check: (x) => x.finished && x.weather === w && x.mode !== 'lawine' };
  },
  (r) => {
    const n = 95 + Math.floor(r() * 6) * 5;
    return { id: `speed-${n}`, text: `Erreiche ${n} km/h`, hint: 'In der Hocke (↑) wirst du schneller',
      check: (x) => x.maxSpeed * 3.6 >= n };
  },
  (r) => {
    const n = 6 + Math.floor(r() * 5) * 2;
    return { id: `air-${n}`, text: `Sammle ${n} s Airtime in einem Lauf`, hint: 'Kicker, Felsstufen, Sprungtaste',
      check: (x) => x.airTime >= n };
  },
  (r) => {
    const tr = pick(TRACKS.slice(1), r);
    return { id: `clean-${tr.id}`, text: `„${tr.name}“ ohne Sturz`, hint: 'Zeitfahren oder Bot-Rennen',
      check: (x) => x.course === 'race' && x.trackId === tr.id && x.finished && x.crashes === 0 };
  },
  () => ({ id: 'online', text: 'Fahr ein Online-Rennen mit Freunden', hint: 'Online-Raum erstellen und Link teilen',
    check: (x) => !!x.online && x.finished !== undefined }),
];

export function dailyChallenges(date = todayStr()) {
  const r = mulberry32(hashString('daily|' + date));
  const idx = [];
  while (idx.length < 3) {
    const i = Math.floor(r() * GENERATORS.length);
    if (!idx.includes(i)) idx.push(i);
  }
  return idx.map((i) => GENERATORS[i](r));
}

// Prüft ein Laufergebnis gegen die heutigen Challenges, speichert neu erfüllte
export function checkChallenges(store, result) {
  const date = todayStr();
  const d = store.data;
  if (d.daily.date !== date) d.daily = { date, done: [] };
  const list = dailyChallenges(date);
  const newly = [];
  for (const c of list) {
    if (d.daily.done.includes(c.id)) continue;
    try { if (c.check(result)) { d.daily.done.push(c.id); newly.push(c); } } catch (e) { /* ignorieren */ }
  }
  if (newly.length && list.every((c) => d.daily.done.includes(c.id))) {
    const yesterday = todayStr(-1);
    if (d.streak.last !== date) {
      d.streak.count = d.streak.last === yesterday ? d.streak.count + 1 : 1;
      d.streak.last = date;
    }
  }
  store.save();
  return newly;
}

export function dailyState(store) {
  const date = todayStr();
  const list = dailyChallenges(date);
  const done = store.data.daily.date === date ? store.data.daily.done : [];
  return list.map((c) => ({ ...c, done: done.includes(c.id) }));
}
