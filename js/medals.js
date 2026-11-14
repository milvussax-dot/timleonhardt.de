// Medaillen-Schwellen
export const MEDALS = [
  null,
  { id: 1, name: 'Bronze', color: '#d9925a' },
  { id: 2, name: 'Silber', color: '#cdd6e2' },
  { id: 3, name: 'Gold', color: '#ffcc33' },
  { id: 4, name: 'Platin', color: '#a5f3ff' },
];

export const TIME_RATIOS = [Infinity, 1.3, 1.17, 1.07, 1.0];

export function timeThresholds(par) {
  return [null, par * TIME_RATIOS[1], par * TIME_RATIOS[2], par * TIME_RATIOS[3], par * TIME_RATIOS[4]];
}

export function timeMedal(time, par) {
  if (!par || time == null) return 0;
  const r = time / par;
  for (let m = 4; m >= 1; m--) if (r <= TIME_RATIOS[m]) return m;
  return 0;
}

export const SCORE_THRESHOLDS = {
  kristall: [null, 2500, 6000, 10000, 15000],
  monster: [null, 4000, 9000, 15000, 22000],
};

export function scoreMedal(parkId, score) {
  const th = SCORE_THRESHOLDS[parkId] || SCORE_THRESHOLDS.kristall;
  for (let m = 4; m >= 1; m--) if (score >= th[m]) return m;
  return 0;
}

export const DIST_THRESHOLDS = [null, 700, 1500, 2600, 4000];

export function distMedal(d) {
  for (let m = 4; m >= 1; m--) if (d >= DIST_THRESHOLDS[m]) return m;
  return 0;
}

export function medalSvg(tier, size = 28) {
  if (!tier) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2" stroke-dasharray="3 3"/></svg>`;
  }
  const c = MEDALS[tier].color;
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="M10 2h5l3 9h-5zM22 2h-5l-3 9h5z" fill="${tier === 4 ? '#5b8cff' : '#e2483d'}"/><circle cx="16" cy="20" r="10" fill="${c}"/><circle cx="16" cy="20" r="7" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/><text x="16" y="24" text-anchor="middle" font-size="10" font-weight="800" font-family="Barlow Condensed, sans-serif" fill="rgba(0,0,0,.55)">${['', 'B', 'S', 'G', 'P'][tier]}</text></svg>`;
}
