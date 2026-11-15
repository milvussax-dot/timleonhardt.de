// Spieldaten: Boden, Gegenstände, Pflanzen, Gebäude, Militär, Stämme, Ziele, Zeit
export const MAP_W = 112;   // neue Täler; ältere Spielstände behalten ihre Größe
export const MAP_H = 84;
export const TILE = 32;

// Bodenarten
export const G = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, MEADOW: 4, FOREST: 5, MOUNTAIN: 6, BRIDGE: 7, PATH: 8, SOIL: 9, DIRT: 10 };
export const BLOCK_GROUND = new Set([G.DEEP, G.WATER, G.MOUNTAIN]);
export const FREE_GROUND = new Set([G.GRASS, G.MEADOW, G.FOREST, G.DIRT]);   // bebaubar, hackbar
export const BLOCK_OBJ = new Set(['tree', 'rock', 'bush', 'chest']);

// Zeit: ein Tag läuft von 6 bis 24 Uhr, 10 Sekunden pro Stunde bei 1×
export const DAY_START = 6, DAY_END = 24, SEC_PER_HOUR = 10;
export const DAYS_PER_SEASON = 10;
export const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
export const YEAR_DAYS = DAYS_PER_SEASON * 4;

export const ITEMS = {
  wood:   { name: 'Holz',     price: 2,  color: '#a0703c' },
  stone:  { name: 'Stein',    price: 2,  color: '#9aa0a8' },
  plank:  { name: 'Bretter',  price: 6,  color: '#d9a35c' },
  wheat:  { name: 'Weizen',   price: 4,  color: '#e8c25a' },
  flour:  { name: 'Mehl',     price: 9,  color: '#f2ead8' },
  bread:  { name: 'Brot',     price: 15, color: '#c9843f', food: 3 },
  berry:  { name: 'Beeren',   price: 3,  color: '#c23a5a', food: 1 },
  fish:   { name: 'Fisch',    price: 8,  color: '#6aa8d8', food: 2 },
  carrot: { name: 'Karotten', price: 6,  color: '#ee8a2a', food: 1 },
  pumpkin:{ name: 'Kürbisse', price: 30, color: '#e8762a', food: 4 },
  ore:    { name: 'Erz',      price: 5,  color: '#8a6a5a' },
  coal:   { name: 'Kohle',    price: 4,  color: '#3a3a3a' },
  iron:   { name: 'Eisen',    price: 14, color: '#b8c0cc' },
  sword:  { name: 'Schwerter', price: 30, color: '#dfe4ec' },
  bow:    { name: 'Bögen',     price: 16, color: '#b07a42' },
  seed_wheat:   { name: 'Weizensaat',  price: 2,  color: '#cdb46a', seed: 'wheat' },
  seed_carrot:  { name: 'Karottensaat', price: 4, color: '#d9a06a', seed: 'carrot' },
  seed_pumpkin: { name: 'Kürbissaat',  price: 12, color: '#d98a4a', seed: 'pumpkin' },
};
export const STOCK_ORDER = ['wood', 'stone', 'plank', 'wheat', 'flour', 'bread', 'berry', 'fish', 'carrot', 'pumpkin', 'ore', 'coal', 'iron', 'sword', 'bow'];
export const FOOD_ORDER = ['berry', 'carrot', 'fish', 'bread', 'pumpkin'];   // Reihenfolge beim Essen

export const CROPS = {
  wheat:   { name: 'Weizen',  seasons: [0, 1, 2], days: 4, yield: ['wheat', 3], seed: 'seed_wheat' },
  carrot:  { name: 'Karotte', seasons: [0, 2],    days: 3, yield: ['carrot', 2], seed: 'seed_carrot' },
  pumpkin: { name: 'Kürbis',  seasons: [1, 2],    days: 6, yield: ['pumpkin', 1], seed: 'seed_pumpkin' },
};

// Gebäude. job: was der Arbeiter tut. recipe: Weiterverarbeitung (in → out in time Sekunden)
export const BUILDINGS = {
  storage:    { name: 'Lager',        w: 2, h: 2, cost: { wood: 20, stone: 10 }, build: 30, roof: '#8d5a3b', desc: 'Hier landen alle Waren. Weitere Lager verkürzen die Wege und vergrößern dein Land.' },
  hut:        { name: 'Deine Hütte',  w: 2, h: 2, cost: null, roof: '#b5523b', desc: 'Hier schläfst du. Klick drauf, um den Tag zu beenden.' },
  house:      { name: 'Wohnhaus',     w: 2, h: 2, cost: { wood: 15, stone: 5 }, build: 25, roof: '#c0583f', desc: 'Platz für Siedler. Neue kommen, wenn es Betten und genug Essen gibt. Lässt sich zum Stein- und Stadthaus ausbauen.' },
  woodcutter: { name: 'Holzfäller',   w: 2, h: 2, cost: { wood: 10, stone: 4 }, build: 20, job: 'chop', radius: 8, roof: '#6b8e3d', hat: '#4f7a2e', desc: 'Fällt Bäume in der Nähe und bringt Holz ins Lager.' },
  forester:   { name: 'Förster',      w: 2, h: 2, cost: { wood: 8, stone: 4 }, build: 20, job: 'plant', radius: 6, roof: '#3f8a5a', hat: '#2f6b45', desc: 'Pflanzt neue Bäume. Gut neben einem Holzfäller.' },
  quarry:     { name: 'Steinbruch',   w: 2, h: 2, cost: { wood: 12 }, build: 20, job: 'mine', radius: 8, roof: '#7d8088', hat: '#6b6f78', desc: 'Baut Felsen und Bergwände in der Nähe ab.' },
  mine:       { name: 'Erzmine',      w: 2, h: 2, cost: { wood: 12, plank: 4 }, build: 30, job: 'ore', radius: 6, roof: '#5a4a40', hat: '#5a4a40', desc: 'Schürft Erz aus Bergwänden, zur Not auch aus Felsen. Am Berg bringt jeder Abbau doppelt so viel.' },
  fisher:     { name: 'Fischerhütte', w: 2, h: 2, cost: { wood: 10 }, build: 20, job: 'fish', radius: 7, nearWater: 4, roof: '#3f7fb5', hat: '#2f6a9a', desc: 'Fängt Fische. Muss nah am Wasser stehen.' },
  farm:       { name: 'Bauernhof',    w: 2, h: 2, cost: { wood: 10, plank: 6 }, build: 30, job: 'farm', radius: 3, fields: 6, roof: '#c99a3a', hat: '#d9b45a', desc: 'Legt bis zu 6 Weizenfelder an, gießt und erntet sie. Gehackten Boden in der Nähe übernimmt er. Im Winter ruht er.' },
  sawmill:    { name: 'Sägewerk',     w: 2, h: 2, cost: { wood: 15, stone: 10 }, build: 30, job: 'process', recipe: { in: { wood: 2 }, out: { plank: 1 }, time: 7 }, roof: '#9a6a3a', hat: '#7a5230', desc: 'Macht aus 2 Holz 1 Brett.' },
  mill:       { name: 'Mühle',        w: 2, h: 2, cost: { plank: 10, stone: 10 }, build: 35, job: 'process', recipe: { in: { wheat: 2 }, out: { flour: 1 }, time: 7 }, roof: '#d9cfb8', hat: '#e8dcc0', desc: 'Mahlt 2 Weizen zu 1 Mehl.' },
  bakery:     { name: 'Bäckerei',     w: 2, h: 2, cost: { plank: 10, stone: 15 }, build: 35, job: 'process', recipe: { in: { flour: 1 }, out: { bread: 2 }, time: 9 }, roof: '#d07a4a', hat: '#f5f0e6', desc: 'Backt aus 1 Mehl 2 Brote. Brot macht richtig satt.' },
  charcoal:   { name: 'Köhlerei',     w: 2, h: 2, cost: { wood: 10, stone: 6 }, build: 25, job: 'process', recipe: { in: { wood: 3 }, out: { coal: 2 }, time: 9 }, roof: '#4a4a4a', hat: '#3a3a3a', desc: 'Brennt aus 3 Holz 2 Kohle.' },
  smelter:    { name: 'Schmelze',     w: 2, h: 2, cost: { stone: 15, plank: 6 }, build: 35, job: 'process', recipe: { in: { ore: 1, coal: 1 }, out: { iron: 1 }, time: 10 }, roof: '#8a3a2a', hat: '#6a3a2a', desc: 'Schmilzt Erz mit Kohle zu Eisen.' },
  smithy:     { name: 'Waffenschmiede', w: 2, h: 2, cost: { stone: 12, plank: 10 }, build: 35, job: 'process', recipe: { in: { iron: 1, wood: 1 }, out: { sword: 1 }, time: 12 }, roof: '#4a5a6a', hat: '#4a5a6a', desc: 'Schmiedet aus Eisen und Holz Schwerter für Schwertkämpfer.' },
  bowyer:     { name: 'Bogenmacher',  w: 2, h: 2, cost: { wood: 12, plank: 6 }, build: 25, job: 'process', recipe: { in: { plank: 2 }, out: { bow: 1 }, time: 10 }, roof: '#6f8a3a', hat: '#5a7a2a', desc: 'Schnitzt aus 2 Brettern einen Bogen für Bogenschützen.' },
  market:     { name: 'Markt',        w: 2, h: 2, cost: { plank: 12, stone: 8 }, build: 30, roof: '#b03a5a', desc: 'Kaufen und verkaufen. Überschüsse kann er jeden Abend automatisch verkaufen.' },
  barracks:   { name: 'Kaserne',      w: 2, h: 2, cost: { stone: 20, plank: 12 }, build: 45, roof: '#7a2a2a', desc: 'Bildet aus freien Siedlern Schwertkämpfer (mit Schwert) und Bogenschützen (mit Bogen) aus. Ausgebaut macht sie ihre Soldaten stärker. Soldaten wohnen hier und brauchen kein Bett.' },
  tower:      { name: 'Wachturm',     w: 2, h: 2, cost: { stone: 14, plank: 6 }, build: 35, garrison: 2, roof: '#5a5a6a', desc: 'Vergrößert dein Land, sobald ein Soldat darin Wache hält, und sieht weit ins Tal.' },
  shipyard:   { name: 'Werft',        w: 2, h: 2, cost: { wood: 15, plank: 8 }, build: 35, job: 'process', recipe: { in: { plank: 12 }, out: { boat: 1 }, time: 30 }, nearWater: 3, roof: '#3f6f9a', hat: '#2f5a80', desc: 'Baut auf Bestellung Boote. Mit Booten kommen du, deine Siedler und Soldaten übers Wasser, auch zur Insel. Ausgebaut baut sie Langboote und Kriegsschiffe.' },
  fort:       { name: 'Eroberte Festung', w: 3, h: 3, cost: null, garrison: 3, roof: '#8d5a3b', desc: 'Ein erobertes Stammeslager. Es sichert dir das Land ringsum.' },
  path:       { name: 'Weg',          w: 1, h: 1, cost: { stone: 1 }, build: 0, desc: 'Auf Wegen laufen alle schneller.' },
  field:      { name: 'Acker',        w: 1, h: 1, cost: {}, build: 0, desc: 'Du gehst hin und hackst den Boden. Auf dem Acker säst du mit der Hand, ein Bauernhof in der Nähe übernimmt ihn.' },
};
export const BUILD_GROUPS = [
  ['Wohnen & Lager', ['house', 'storage', 'path']],
  ['Rohstoffe', ['woodcutter', 'forester', 'quarry', 'mine']],
  ['Nahrung', ['field', 'fisher', 'farm', 'mill', 'bakery']],
  ['Handwerk & Handel', ['sawmill', 'charcoal', 'smelter', 'smithy', 'bowyer', 'market']],
  ['Militär & Wasser', ['barracks', 'tower', 'shipyard']],
];
export const BUILD_MENU = BUILD_GROUPS.flatMap((g) => g[1]);

// Land: so weit reicht dein Gebiet um ein Gebäude (andere Gebäude: 3)
export const TERRITORY = { hut: 12, storage: 10, house: 7, barracks: 8, tower: 13, fort: 14 };

// Ausbau
export const HOUSE_LEVELS = [
  null,
  { name: 'Wohnhaus', beds: 3 },
  { name: 'Steinhaus', beds: 5, cost: { plank: 8, stone: 10 }, build: 25 },
  { name: 'Stadthaus', beds: 8, cost: { plank: 12, stone: 15, iron: 3 }, build: 35 },
];
export const UPGRADE = { cost: { plank: 8, stone: 8 }, build: 20, speed: 1.6, radius: 2, fields: 9 };   // Werkstätten Stufe 2

// Militär: zwei Arten von Soldaten
export const UNITS = {
  sword:  { name: 'Schwertkämpfer', plural: 'Schwertkämpfer', weapon: 'sword', hp: 14, atk: 3,   range: 0.95, cd: 0.9, speed: 2.6 },
  archer: { name: 'Bogenschütze',   plural: 'Bogenschützen',  weapon: 'bow',   hp: 10, atk: 2.2, range: 4.5,  cd: 1.6, speed: 2.7 },
};
export const TRAIN_TIME = 12;
// Kaserne: jede Stufe macht ihre Soldaten stärker, die Ausbildung kostet dann aber mehr
export const BARRACKS_LEVELS = [
  null,
  { name: 'Kaserne', cap: 8, hp: 0, atk: 0, extra: {} },
  { name: 'Garnison', cost: { stone: 25, plank: 15, iron: 4 }, build: 40, cap: 10, hp: 4, atk: 0.7, extra: { bread: 2 } },
  { name: 'Kriegsschule', cost: { stone: 40, plank: 25, iron: 10, coal: 10 }, build: 60, cap: 12, hp: 8, atk: 1.4, extra: { bread: 3, iron: 1 } },
];
// Werft: jede Stufe baut größere, aber teurere Boote, zuletzt Kriegsschiffe mit Wurfgeschütz
export const SHIPYARD_LEVELS = [
  null,
  { name: 'Werft', boat: 'Ruderboot', boats: 'Ruderboote', seats: 4, recipe: { in: { plank: 12 }, out: { boat: 1 }, time: 30 }, value: 72 },
  { name: 'Werft, Stufe 2', boat: 'Langboot', boats: 'Langboote', seats: 6, cost: { plank: 20, stone: 12, iron: 3 }, build: 40, recipe: { in: { plank: 16, iron: 1 }, out: { boat: 1 }, time: 36 }, value: 110 },
  { name: 'Werft, Stufe 3', boat: 'Kriegsschiff', boats: 'Kriegsschiffe', seats: 8, armed: true, cost: { plank: 30, stone: 20, iron: 8 }, build: 55, recipe: { in: { plank: 20, iron: 3 }, out: { boat: 1 }, time: 45 }, value: 162 },
];
export const WARSHIP = { atk: 5, range: 7.5, cd: 2.2, speed: 2.2 };
export const TRIBES = [
  { key: 'rotfedern',    name: 'Rotfedern',    color: '#d9483b', atk: 2.2, hp: 9,  start: 6, grow: 0.4 },
  { key: 'moorhueter',   name: 'Moorhüter',    color: '#8a5bd6', atk: 2.0, hp: 10, start: 5, grow: 0.35 },
  { key: 'steinbrecher', name: 'Steinbrecher', color: '#d08a2b', atk: 2.6, hp: 11, start: 7, grow: 0.45 },
  { key: 'nebelfischer', name: 'Nebelfischer', color: '#2f9fbf', atk: 2.1, hp: 9,  start: 5, grow: 0.3 },
];

// Ziele, der Reihe nach
export const QUESTS = [
  { id: 'bread',     text: 'Back dein erstes Brot', reward: 30 },
  { id: 'explore25', text: 'Erkunde ein Viertel des Tals', reward: 40 },
  { id: 'tribe',     text: 'Entdecke einen fremden Stamm', reward: 30 },
  { id: 'stonehouse',text: 'Bau ein Wohnhaus zum Steinhaus aus', reward: 50 },
  { id: 'iron',      text: 'Schmilz dein erstes Eisen', reward: 40 },
  { id: 'soldiers',  text: 'Bilde 3 Soldaten aus', reward: 60 },
  { id: 'archers',   text: 'Bilde 3 Bogenschützen aus', reward: 50 },
  { id: 'tower',     text: 'Besetz einen Wachturm', reward: 40 },
  { id: 'treasure',  text: 'Finde 3 Schatztruhen', reward: 60 },
  { id: 'boat',      text: 'Bau ein Boot', reward: 50 },
  { id: 'drill',     text: 'Bau die Kaserne zur Garnison aus', reward: 60 },
  { id: 'raid',      text: 'Wehre einen Überfall ab', reward: 60 },
  { id: 'conquer',   text: 'Erobere ein Stammeslager', reward: 150 },
  { id: 'townhouse', text: 'Bau ein Stadthaus', reward: 100 },
  { id: 'warship',   text: 'Bau ein Kriegsschiff', reward: 80 },
  { id: 'explore60', text: 'Erkunde 60 Prozent des Tals', reward: 100 },
  { id: 'allTribes', text: 'Besiege alle Stämme', reward: 400 },
];

// Energie und Dauer der eigenen Aktionen (Sekunden bei 1×)
export const ACTIONS = {
  chop:    { energy: 6, time: 1.2, label: 'Baum fällen' },
  mine:    { energy: 8, time: 1.4, label: 'Stein abbauen' },
  pick:    { energy: 1, time: 0.5, label: 'Beeren pflücken' },
  till:    { energy: 2, time: 0.45, label: 'Boden hacken' },
  water:   { energy: 1, time: 0.35, label: 'Gießen' },
  refill:  { energy: 0, time: 0.6, label: 'Kanne füllen' },
  plant:   { energy: 1, time: 0.35, label: 'Säen' },
  harvest: { energy: 1, time: 0.4, label: 'Ernten' },
  open:    { energy: 1, time: 0.8, label: 'Truhe öffnen' },
};
export const MAX_ENERGY = 100, CAN_SIZE = 20;
export const SETTLER_SPEED = 2.3, PLAYER_SPEED = 4.2, PATH_BONUS = 1.6;
export const WORK_TIME = { chop: 4, mine: 5, ore: 7, fish: 11, plant: 3, till: 2.5, sow: 2, water: 1.5, harvest: 2 };

export const START_STOCK = { wood: 30, stone: 15, berry: 10, bread: 4, seed_wheat: 10, seed_carrot: 6 };
export const START_COINS = 50;
export const SETTLER_VALUE = 40;
