// Spieldaten: Boden, Gegenstände, Pflanzen, Gebäude, Zeit
export const MAP_W = 80;
export const MAP_H = 64;
export const TILE = 32;

// Bodenarten
export const G = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, MEADOW: 4, FOREST: 5, MOUNTAIN: 6, BRIDGE: 7, PATH: 8, SOIL: 9, DIRT: 10 };
export const BLOCK_GROUND = new Set([G.DEEP, G.WATER, G.MOUNTAIN]);
export const FREE_GROUND = new Set([G.GRASS, G.MEADOW, G.FOREST, G.DIRT]);   // bebaubar, hackbar
export const BLOCK_OBJ = new Set(['tree', 'rock', 'bush']);

// Zeit: ein Tag läuft von 6 bis 24 Uhr, 10 Sekunden pro Stunde bei 1×
export const DAY_START = 6, DAY_END = 24, SEC_PER_HOUR = 10;
export const DAYS_PER_SEASON = 7;
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
  seed_wheat:   { name: 'Weizensaat',  price: 2,  color: '#cdb46a', seed: 'wheat' },
  seed_carrot:  { name: 'Karottensaat', price: 4, color: '#d9a06a', seed: 'carrot' },
  seed_pumpkin: { name: 'Kürbissaat',  price: 12, color: '#d98a4a', seed: 'pumpkin' },
};
export const STOCK_ORDER = ['wood', 'stone', 'plank', 'wheat', 'flour', 'bread', 'berry', 'fish', 'carrot', 'pumpkin'];
export const FOOD_ORDER = ['berry', 'carrot', 'fish', 'bread', 'pumpkin'];   // Reihenfolge beim Essen

export const CROPS = {
  wheat:   { name: 'Weizen',  seasons: [0, 1, 2], days: 4, yield: ['wheat', 3], seed: 'seed_wheat' },
  carrot:  { name: 'Karotte', seasons: [0, 2],    days: 3, yield: ['carrot', 2], seed: 'seed_carrot' },
  pumpkin: { name: 'Kürbis',  seasons: [1, 2],    days: 6, yield: ['pumpkin', 1], seed: 'seed_pumpkin' },
};

// Gebäude. job: was der Arbeiter tut. recipe: Weiterverarbeitung (in → out in time Sekunden)
export const BUILDINGS = {
  storage:    { name: 'Lager',        w: 2, h: 2, cost: { wood: 20, stone: 10 }, build: 30, roof: '#8d5a3b', desc: 'Hier landen alle Waren. Weitere Lager verkürzen die Wege.' },
  hut:        { name: 'Deine Hütte',  w: 2, h: 2, cost: null, roof: '#b5523b', desc: 'Hier schläfst du. Klick drauf, um den Tag zu beenden.' },
  house:      { name: 'Wohnhaus',     w: 2, h: 2, cost: { wood: 15, stone: 5 }, build: 25, beds: 3, roof: '#c0583f', desc: 'Platz für 3 Siedler. Neue kommen, wenn es Betten und genug Essen gibt.' },
  woodcutter: { name: 'Holzfäller',   w: 2, h: 2, cost: { wood: 10, stone: 4 }, build: 20, job: 'chop', radius: 8, roof: '#6b8e3d', hat: '#4f7a2e', desc: 'Fällt Bäume in der Nähe und bringt Holz ins Lager.' },
  forester:   { name: 'Förster',      w: 2, h: 2, cost: { wood: 8, stone: 4 }, build: 20, job: 'plant', radius: 6, roof: '#3f8a5a', hat: '#2f6b45', desc: 'Pflanzt neue Bäume. Gut neben einem Holzfäller.' },
  quarry:     { name: 'Steinbruch',   w: 2, h: 2, cost: { wood: 12 }, build: 20, job: 'mine', radius: 8, roof: '#7d8088', hat: '#6b6f78', desc: 'Baut Felsen und Bergwände in der Nähe ab.' },
  fisher:     { name: 'Fischerhütte', w: 2, h: 2, cost: { wood: 10 }, build: 20, job: 'fish', radius: 7, nearWater: 4, roof: '#3f7fb5', hat: '#2f6a9a', desc: 'Fängt Fische. Muss nah am Wasser stehen.' },
  farm:       { name: 'Bauernhof',    w: 2, h: 2, cost: { wood: 10, plank: 6 }, build: 30, job: 'farm', radius: 3, fields: 6, roof: '#c99a3a', hat: '#d9b45a', desc: 'Legt bis zu 6 Weizenfelder an, gießt und erntet sie. Im Winter ruht er.' },
  sawmill:    { name: 'Sägewerk',     w: 2, h: 2, cost: { wood: 15, stone: 10 }, build: 30, job: 'process', recipe: { in: { wood: 2 }, out: { plank: 1 }, time: 7 }, roof: '#9a6a3a', hat: '#7a5230', desc: 'Macht aus 2 Holz 1 Brett.' },
  mill:       { name: 'Mühle',        w: 2, h: 2, cost: { plank: 10, stone: 10 }, build: 35, job: 'process', recipe: { in: { wheat: 2 }, out: { flour: 1 }, time: 7 }, roof: '#d9cfb8', hat: '#e8dcc0', desc: 'Mahlt 2 Weizen zu 1 Mehl.' },
  bakery:     { name: 'Bäckerei',     w: 2, h: 2, cost: { plank: 10, stone: 15 }, build: 35, job: 'process', recipe: { in: { flour: 1 }, out: { bread: 2 }, time: 9 }, roof: '#d07a4a', hat: '#f5f0e6', desc: 'Backt aus 1 Mehl 2 Brote. Brot macht richtig satt.' },
  market:     { name: 'Markt',        w: 2, h: 2, cost: { plank: 12, stone: 8 }, build: 30, roof: '#b03a5a', desc: 'Kaufen und verkaufen. Überschüsse kann er jeden Abend automatisch verkaufen.' },
  path:       { name: 'Weg',          w: 1, h: 1, cost: { stone: 1 }, build: 0, desc: 'Auf Wegen laufen alle schneller.' },
};
export const BUILD_MENU = ['house', 'woodcutter', 'forester', 'quarry', 'fisher', 'farm', 'sawmill', 'mill', 'bakery', 'market', 'storage', 'path'];

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
};
export const MAX_ENERGY = 100, CAN_SIZE = 20;
export const SETTLER_SPEED = 2.3, PLAYER_SPEED = 4.2, PATH_BONUS = 1.6;
export const WORK_TIME = { chop: 4, mine: 5, fish: 11, plant: 3, till: 2.5, sow: 2, water: 1.5, harvest: 2 };

export const START_STOCK = { wood: 30, stone: 15, berry: 10, bread: 4, seed_wheat: 10, seed_carrot: 6 };
export const START_COINS = 50;
export const SETTLER_VALUE = 40;
