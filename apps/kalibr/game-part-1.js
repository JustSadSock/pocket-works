const STORAGE_KEY = 'pocket-works:kalibr';
const PLAYER_RADIUS = 0.23;
const FOV = 1.03;
const COLUMN_WIDTH = 2;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const angleWrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const byId = (id) => document.getElementById(id);
const distance2d = (a, b, c, d) => Math.hypot(c - a, d - b);

const elements = {
  canvas: byId('gameCanvas'), miniMap: byId('miniMap'), menu: byId('menuScreen'), briefing: byId('briefingScreen'),
  pause: byId('pauseScreen'), result: byId('resultScreen'), settings: byId('settingsLayer'), hudTop: byId('hudTop'),
  hudBottom: byId('hudBottom'), controls: byId('controls'), moveZone: byId('moveZone'), lookZone: byId('lookZone'),
  stickBase: byId('stickBase'), stickKnob: byId('stickKnob'), fire: byId('fireButton'), grenade: byId('grenadeButton'),
  weapon: byId('weaponButton'), support: byId('supportButton'), crosshair: byId('crosshair'), hitMarker: byId('hitMarker'),
  damage: byId('damageVignette'), toast: byId('toast'), action: byId('actionIndicator'), actionLabel: byId('actionLabel'),
  actionFill: byId('actionFill'), mapLabel: byId('mapLabel'), objectiveLabel: byId('objectiveLabel'), objectiveMeta: byId('objectiveMeta'),
  objectiveFill: byId('objectiveFill'), healthFill: byId('healthFill'), healthValue: byId('healthValue'), armorFill: byId('armorFill'),
  armorValue: byId('armorValue'), ammoBlock: byId('ammoBlock'), ammoValue: byId('ammoValue'), reserveValue: byId('reserveValue'), weaponName: byId('weaponName'),
  grenadeCount: byId('grenadeCount'), streakValue: byId('streakValue'), start: byId('startButton'), settingsButton: byId('settingsButton'),
  how: byId('howButton'), briefingClose: byId('briefingClose'), briefingStart: byId('briefingStart'), home: byId('homeButton'),
  pauseButton: byId('pauseButton'), continueButton: byId('continueButton'), restartButton: byId('restartButton'),
  pauseSettingsButton: byId('pauseSettingsButton'), menuButton: byId('menuButton'), pauseMap: byId('pauseMap'),
  pauseTime: byId('pauseTime'), pauseKills: byId('pauseKills'), pauseAccuracy: byId('pauseAccuracy'), resultKicker: byId('resultKicker'),
  resultGrade: byId('resultGrade'), resultScore: byId('resultScore'), resultTime: byId('resultTime'), resultAccuracy: byId('resultAccuracy'),
  resultHealth: byId('resultHealth'), resultXp: byId('resultXp'), recordNote: byId('recordNote'), again: byId('againButton'),
  resultMenu: byId('resultMenuButton'), settingsBackdrop: byId('settingsBackdrop'), settingsClose: byId('settingsClose'),
  sensitivity: byId('sensitivityRange'), sensitivityOutput: byId('sensitivityOutput'), assist: byId('assistRange'),
  assistOutput: byId('assistOutput'), smartFire: byId('smartFireToggle'), leftHand: byId('leftHandToggle'), audio: byId('audioToggle'),
  haptic: byId('hapticToggle'), quality: byId('qualityToggle'), levelValue: byId('levelValue'), xpFill: byId('xpFill'),
  xpValue: byId('xpValue'), operationTitle: byId('operationTitle'), operationBrief: byId('operationBrief'), loadoutTitle: byId('loadoutTitle'),
  loadoutStats: byId('loadoutStats'), compass: byId('objectiveCompass'), damageDirection: byId('damageDirection')
};

const ctx = elements.canvas.getContext('2d', { alpha: false });
const miniCtx = elements.miniMap.getContext('2d');
ctx.imageSmoothingEnabled = false;

function parseMap(rows) {
  const width = rows[0].length;
  if (!rows.every((row) => row.length === width)) throw new Error('Карта КАЛИБР имеет строки разной длины');
  const grid = [], pickups = [], markers = {}, props = [];
  rows.forEach((row, y) => {
    grid[y] = [];
    [...row].forEach((cell, x) => {
      if (cell === 'A') pickups.push({ type: 'ammo', x: x + .5, y: y + .5, active: true });
      if (cell === 'H') pickups.push({ type: 'health', x: x + .5, y: y + .5, active: true });
      if (cell === 'G') pickups.push({ type: 'grenade', x: x + .5, y: y + .5, active: true });
      if ('EOQRS'.includes(cell)) markers[cell] = { x: x + .5, y: y + .5 };
      if (cell === 'c') props.push({ type: 'crate', x: x + .5, y: y + .5 });
      if (cell === 'l') props.push({ type: 'lamp', x: x + .5, y: y + .5 });
      grid[y][x] = /[1-7]/.test(cell) ? Number(cell) : 0;
    });
  });
  return { grid, width, height: rows.length, pickups, markers, props };
}

const WEAPONS = {
  ar: { name: 'VKT-31', role: 'ШТУРМОВАЯ ВИНТОВКА', mag: 30, reserve: 150, damage: 31, head: 1.75, interval: 105, spread: .024, reload: 1450, range: 15, recoil: .85, pellets: 1, mobility: 1, color: '#f2b84b' },
  smg: { name: 'K-9', role: 'ПИСТОЛЕТ-ПУЛЕМЁТ', mag: 40, reserve: 200, damage: 20, head: 1.55, interval: 72, spread: .04, reload: 1180, range: 10.5, recoil: .56, pellets: 1, mobility: 1.12, color: '#74c5bb' },
  shotgun: { name: 'M-8', role: 'БОЕВОЙ ДРОБОВИК', mag: 8, reserve: 40, damage: 13, head: 1.25, interval: 570, spread: .095, reload: 1680, range: 7.2, recoil: 1.7, pellets: 7, mobility: .94, color: '#e27c56' },
  pistol: { name: 'P-12', role: 'ПИСТОЛЕТ', mag: 12, reserve: 60, damage: 38, head: 1.9, interval: 215, spread: .018, reload: 930, range: 12, recoil: .48, pellets: 1, mobility: 1.15, color: '#dbe3df' }
};

const LOADOUTS = {
  assault: { name: 'ШТУРМ', primary: 'ar', perk: 'БРОНЯ', description: 'Универсальная винтовка и усиленный бронежилет.', armor: 55, grenades: 2, regen: 1 },
  vanguard: { name: 'АВАНГАРД', primary: 'smg', perk: 'ТЕМП', description: 'Быстрое движение, перезарядка и ближний бой.', armor: 35, grenades: 3, regen: 1.15 },
  breach: { name: 'ПРОРЫВ', primary: 'shotgun', perk: 'УДАР', description: 'Дробовик, стойкость вблизи и тяжёлые гранаты.', armor: 70, grenades: 2, regen: .88 }
};

const ENEMY_TYPES = {
  rifle: { hp: 100, speed: .82, damage: [7, 11], cadence: [1.0, 1.55], range: 10.5, preferred: 5.2, color: '#d5ddd8', score: 120 },
  rusher: { hp: 72, speed: 1.48, damage: [6, 9], cadence: [.48, .8], range: 4.3, preferred: 1.6, color: '#e58a58', score: 140 },
  marksman: { hp: 82, speed: .58, damage: [16, 22], cadence: [1.8, 2.5], range: 15, preferred: 9, color: '#8fc1bd', score: 190 },
  heavy: { hp: 285, speed: .48, damage: [10, 15], cadence: [.72, 1.05], range: 10, preferred: 4.5, color: '#e4b957', score: 420, armor: .28 }
};

const MAPS = {
  terrace: {
    name: 'ТЕРРАСА', operation: 'ГРОМООТВОД', subtitle: 'ШТУРМ РАДИОЛОКАЦИОННОГО УЗЛА', accent: '#f2b84b', sky: ['#263c45', '#7e9998', '#d2b36f'],
    data: parseMap([
      '111111111111111111',
      '100000000000000001',
      '102222000033330001',
      '102002000030030001',
      '102002000030030001',
      '102002000033330001',
      '102002000000000001',
      '102222000444400001',
      '10000c00O400400001',
      '100033300400400l01',
      '100030300444400001',
      '100030300000000001',
      '100033300022220001',
      '100000000020020001',
      '1000H000A020020001',
      '1000000000222E0001',
      '100000G00000000001',
      '111111111111111111'
    ]),
    start: { x: 2.2, y: 15.4, a: -1.12 },
    brief: 'Пробей внешний периметр, заложи импульсный заряд и удержи антенну до перегрузки.',
    stages: [
      { type: 'eliminate', label: 'ПРОБИТЬ ПЕРИМЕТР', groups: [0] },
      { type: 'interact', label: 'ЗАЛОЖИТЬ ЗАРЯД', marker: 'O', hold: 2.4, groups: [1] },
      { type: 'defend', label: 'УДЕРЖАТЬ АНТЕННУ', marker: 'O', duration: 17, groups: [2, 3] },
      { type: 'extract', label: 'ЭВАКУАЦИЯ', marker: 'E' }
    ],
    enemies: [
      [6.5, 2.5, 'rifle', 0], [14.5, 1.5, 'marksman', 0], [6.5, 5.5, 'rifle', 0], [13.5, 6.5, 'rusher', 0],
      [5.5, 8.5, 'rifle', 0], [15.5, 9.5, 'rifle', 0], [9.5, 11.5, 'rusher', 1], [16.5, 11.5, 'rifle', 1],
      [7.5, 13.5, 'rifle', 1], [3.5, 14.5, 'rusher', 2], [14.5, 14.5, 'marksman', 2], [6.5, 15.5, 'rifle', 2],
      [8.5, 16.5, 'rusher', 3], [15.5, 16.5, 'heavy', 3]
    ]
  },
  dock: {
    name: 'СУХОЙ ДОК', operation: 'ЧЁРНАЯ ВОДА', subtitle: 'ПОИСК КОНТЕЙНЕРОВ С ДАННЫМИ', accent: '#e27c56', sky: ['#1e3037', '#536e73', '#b96b4e'],
    data: parseMap([
      '44444444444444444444','40000000000000000004','40555505555505555004','40500505O005050050l4',
      '40500505000505005004','40500505550505555004','40500500050000000004','40555500055550555504',
      '4000000R00005c000504','40555505550055550504','405005050000Q0050504','40500505555550050504',
      '40500500000A000505G4','40555505555555550504','400H000000000000E004','44444444444444444444'
    ]),
    start: { x: 1.8, y: 14.3, a: -.7 }, brief: 'Отключи подавитель, найди два контейнера разведки и уничтожь тяжёлого оператора.',
    stages: [
      { type: 'interact', label: 'ОТКЛЮЧИТЬ ПОМЕХИ', marker: 'O', hold: 2.8, groups: [0] },
      { type: 'collect', label: 'ЗАБРАТЬ ДАННЫЕ', markers: ['Q','R'], groups: [1] },
      { type: 'boss', label: 'ЛИКВИДИРОВАТЬ ТЯЖЁЛОГО', groups: [2] }, { type: 'extract', label: 'ПОКИНУТЬ ДОК', marker: 'E' }
    ],
    enemies: [
      [6.5,2.5,'marksman',0],[8.5,3.5,'rifle',0],[18.5,3.5,'rifle',0],[12.5,4.5,'rifle',0],[8.5,6.5,'rusher',0],[14.5,6.5,'rifle',0],
      [6.5,7.5,'rusher',1],[2.5,8.5,'rifle',1],[13.5,8.5,'marksman',1],[6.5,10.5,'rusher',1],[11.5,12.5,'heavy',2],[18.5,12.5,'rusher',2],[8.5,14.5,'rifle',2]
    ]
  },
  archive: {
    name: 'АРХИВ', operation: 'НУЛЕВАЯ КОПИЯ', subtitle: 'ЗАХВАТ И ПЕРЕДАЧА АРХИВА', accent: '#74c5bb', sky: ['#283d3d', '#779d98', '#d8d4bb'],
    data: parseMap([
      '333333333333333333','300000000000000003','301111O00044440003','301001000040040003','301001000040040003','301111000044440003',
      '3000c0222200000003','304400200200114403','30400020020Q100403','304000200200100403','3044002222001144R3','3000000000000l0003',
      '30111100S044440003','301A01000040040003','301101000044440H03','300000000000000E03','3000000G0000000003','333333333333333333'
    ]),
    start: { x: 1.8, y: 16.1, a: -.82 }, brief: 'Собери три фрагмента, запусти передачу и переживи зачистку центрального зала.',
    stages: [
      { type: 'collect', label: 'СОБРАТЬ ФРАГМЕНТЫ', markers: ['O','Q','R'], groups: [0] },
      { type: 'interact', label: 'НАЧАТЬ ПЕРЕДАЧУ', marker: 'S', hold: 3.2, groups: [1] },
      { type: 'defend', label: 'ЗАЩИЩАТЬ КАНАЛ', marker: 'S', duration: 19, groups: [2,3] }, { type: 'extract', label: 'УЙТИ С КОПИЕЙ', marker: 'E' }
    ],
    enemies: [
      [16.5,2.5,'rifle',0],[15.5,3.5,'marksman',0],[14.5,4.5,'rifle',0],[9.5,5.5,'rusher',0],[4.5,6.5,'rifle',0],[14.5,6.5,'rifle',0],
      [11.5,7.5,'marksman',1],[11.5,9.5,'rusher',1],[7.5,11.5,'rifle',1],[13.5,11.5,'rifle',2],[4.5,13.5,'rusher',2],[15.5,13.5,'marksman',2],
      [9.5,14.5,'heavy',3],[4.5,15.5,'rusher',3],[13.5,16.5,'rifle',3]
    ]
  }
};
