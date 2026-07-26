const STORAGE_KEY = 'pocket-works:kalibr';
const MAGAZINE_SIZE = 24;
const PLAYER_RADIUS = 0.23;
const FOV = 1.05;
const COLUMN_WIDTH = 2;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const angleWrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const byId = (id) => document.getElementById(id);

const elements = {
  canvas: byId('gameCanvas'),
  miniMap: byId('miniMap'),
  menu: byId('menuScreen'),
  briefing: byId('briefingScreen'),
  pause: byId('pauseScreen'),
  result: byId('resultScreen'),
  settings: byId('settingsLayer'),
  hudTop: byId('hudTop'),
  hudBottom: byId('hudBottom'),
  controls: byId('controls'),
  moveZone: byId('moveZone'),
  lookZone: byId('lookZone'),
  stickBase: byId('stickBase'),
  stickKnob: byId('stickKnob'),
  fire: byId('fireButton'),
  reload: byId('reloadButton'),
  crosshair: byId('crosshair'),
  hitMarker: byId('hitMarker'),
  damage: byId('damageVignette'),
  toast: byId('toast'),
  reloadIndicator: byId('reloadIndicator'),
  mapLabel: byId('mapLabel'),
  objectiveLabel: byId('objectiveLabel'),
  enemyCounter: byId('enemyCounter'),
  healthFill: byId('healthFill'),
  healthValue: byId('healthValue'),
  ammoValue: byId('ammoValue'),
  reserveValue: byId('reserveValue'),
  start: byId('startButton'),
  settingsButton: byId('settingsButton'),
  how: byId('howButton'),
  briefingClose: byId('briefingClose'),
  briefingStart: byId('briefingStart'),
  home: byId('homeButton'),
  pauseButton: byId('pauseButton'),
  continueButton: byId('continueButton'),
  restartButton: byId('restartButton'),
  pauseSettingsButton: byId('pauseSettingsButton'),
  menuButton: byId('menuButton'),
  pauseMap: byId('pauseMap'),
  pauseTime: byId('pauseTime'),
  pauseKills: byId('pauseKills'),
  pauseAccuracy: byId('pauseAccuracy'),
  resultKicker: byId('resultKicker'),
  resultGrade: byId('resultGrade'),
  resultScore: byId('resultScore'),
  resultTime: byId('resultTime'),
  resultAccuracy: byId('resultAccuracy'),
  resultHealth: byId('resultHealth'),
  recordNote: byId('recordNote'),
  again: byId('againButton'),
  resultMenu: byId('resultMenuButton'),
  settingsBackdrop: byId('settingsBackdrop'),
  settingsClose: byId('settingsClose'),
  sensitivity: byId('sensitivityRange'),
  sensitivityOutput: byId('sensitivityOutput'),
  assist: byId('assistRange'),
  assistOutput: byId('assistOutput'),
  leftHand: byId('leftHandToggle'),
  audio: byId('audioToggle'),
  haptic: byId('hapticToggle'),
  quality: byId('qualityToggle')
};

const ctx = elements.canvas.getContext('2d', { alpha: false });
const miniCtx = elements.miniMap.getContext('2d');
ctx.imageSmoothingEnabled = false;

function parseMap(rows) {
  const width = rows[0].length;
  if (!rows.every((row) => row.length === width)) throw new Error('Карта КАЛИБР имеет строки разной длины');
  const grid = [];
  const pickups = [];
  let exit = null;
  rows.forEach((row, y) => {
    grid[y] = [];
    [...row].forEach((cell, x) => {
      if (cell === 'A') pickups.push({ type: 'ammo', x: x + 0.5, y: y + 0.5, active: true });
      if (cell === 'H') pickups.push({ type: 'health', x: x + 0.5, y: y + 0.5, active: true });
      if (cell === 'E') exit = { x: x + 0.5, y: y + 0.5 };
      grid[y][x] = /[1-5]/.test(cell) ? Number(cell) : 0;
    });
  });
  return { grid, width, height: rows.length, pickups, exit };
}

const MAPS = {
  terrace: {
    name: 'ТЕРРАСА',
    subtitle: 'БЕТОННЫЙ КОМПЛЕКС',
    colors: ['#708080', '#c99b3d'],
    data: parseMap([
      '111111111111111111',
      '100000000000000001',
      '102222000033330001',
      '102002000030030001',
      '102002000030030001',
      '102002000033330001',
      '102002000000000001',
      '102222000444400001',
      '100000000400400001',
      '100033300400400001',
      '100030300444400001',
      '100030300000000001',
      '100033300022220001',
      '100000000020020001',
      '1000H000A020020001',
      '1000000000222E0001',
      '100000000000000001',
      '111111111111111111'
    ]),
    start: { x: 2.4, y: 15.2, a: -1.18 },
    enemies: [
      [6.5, 2.5], [9.5, 3.5], [14.4, 2.5], [7.6, 8.7],
      [3.5, 10.4], [13.5, 10.5], [5.6, 14.3], [14.5, 14.4]
    ]
  },
  dock: {
    name: 'СУХОЙ ДОК',
    subtitle: 'СЛУЖЕБНЫЕ КОРИДОРЫ',
    colors: ['#3e5d62', '#d46847'],
    data: parseMap([
      '44444444444444444444',
      '40000000000000000004',
      '40555505555505555004',
      '40500505000505005004',
      '40500505000505005004',
      '40500505550505555004',
      '40500500050000000004',
      '40555500055550555504',
      '40000000000050000504',
      '40555505550055550504',
      '40500505000000050504',
      '40500505555550050504',
      '40500500000A00050504',
      '40555505555555550504',
      '400H000000000000E004',
      '44444444444444444444'
    ]),
    start: { x: 1.8, y: 14.2, a: -0.72 },
    enemies: [
      [3.5, 1.5], [9.5, 3.5], [17.5, 4.5], [6.5, 7.6],
      [13.5, 8.5], [1.5, 11.5], [10.5, 12.4], [16.5, 13.5]
    ]
  },
  archive: {
    name: 'АРХИВ',
    subtitle: 'КЕРАМИЧЕСКИЕ ГАЛЕРЕИ',
    colors: ['#6f9794', '#d5d2bd'],
    data: parseMap([
      '333333333333333333',
      '300000000000000003',
      '301111000044440003',
      '301001000040040003',
      '301001000040040003',
      '301111000044440003',
      '300000222200000003',
      '304400200200114403',
      '304000200200100403',
      '304000200200100403',
      '304400222200114403',
      '300000000000000003',
      '301111000044440003',
      '301A01000040040003',
      '301101000044440H03',
      '300000000000000E03',
      '300000000000000003',
      '333333333333333333'
    ]),
    start: { x: 1.8, y: 16.1, a: -0.86 },
    enemies: [
      [4.5, 1.5], [14.5, 2.5], [8.7, 5.5], [4.7, 8.8],
      [11.5, 8.5], [8.8, 11.6], [4.4, 15.3], [14.5, 14.5]
    ]
  }
};
