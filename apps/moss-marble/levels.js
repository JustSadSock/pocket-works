const rect = (x, y, w, h, extra = {}) => ({ shape: 'rect', x, y, w, h, ...extra });
const circle = (x, y, r, extra = {}) => ({ shape: 'circle', x, y, r, ...extra });
const route = (...points) => points.map(([x, y]) => ({ x, y }));

const VISUALS = {
  rainGarden: {
    skyTop: '#405748', skyMid: '#1f382c', skyBottom: '#0b1711',
    glow: '240,224,161', beam: '243,225,155', pollen: '226,215,145', mist: '142,184,154', rain: 1, flora: 'fern', motif: 'drop', accent: '205,224,180',
    materials: { stone: [.42,.45,.39,1], stoneLight: [.64,.65,.54,1], stoneDark: [.15,.19,.16,1], wood: [.37,.25,.13,1], woodLight: [.63,.44,.23,1], woodTop: [.55,.36,.18,1], soil: [.17,.13,.08,1], leaf: [.22,.44,.20,1], flower: [.84,.82,.60,1], rockMoss: [.24,.43,.20,1] },
    terrain: { grass: [.34,.49,.25,1], grassLight: [.52,.64,.34,1], grassDry: [.45,.51,.27,1], moss: [.15,.34,.17,1], mossLight: [.30,.49,.24,1], sand: [.69,.55,.30,1], sandLight: [.87,.73,.44,1], water: [.13,.39,.40,.88], waterLight: [.29,.58,.56,.88] }
  },
  porcelain: {
    skyTop: '#536258', skyMid: '#2c4038', skyBottom: '#101b16',
    glow: '223,231,197', beam: '232,236,202', pollen: '218,226,188', mist: '170,197,181', rain: .45, flora: 'clover', motif: 'cup', accent: '224,229,204',
    materials: { stone: [.58,.60,.54,1], stoneLight: [.82,.82,.70,1], stoneDark: [.25,.29,.26,1], wood: [.43,.31,.18,1], woodLight: [.68,.51,.30,1], woodTop: [.62,.46,.27,1], soil: [.22,.17,.11,1], leaf: [.30,.48,.28,1], flower: [.91,.88,.68,1], rockMoss: [.34,.48,.28,1] },
    terrain: { grass: [.40,.52,.32,1], grassLight: [.62,.68,.45,1], grassDry: [.52,.55,.33,1], moss: [.19,.36,.23,1], mossLight: [.37,.53,.34,1], sand: [.76,.66,.44,1], sandLight: [.91,.82,.60,1], water: [.25,.48,.50,.88], waterLight: [.42,.66,.65,.88] }
  },
  deepMoss: {
    skyTop: '#29493b', skyMid: '#17352a', skyBottom: '#07140e',
    glow: '185,214,153', beam: '198,222,162', pollen: '174,208,133', mist: '93,153,119', rain: .75, flora: 'fern', motif: 'fern', accent: '158,203,131',
    materials: { stone: [.31,.38,.33,1], stoneLight: [.49,.55,.43,1], stoneDark: [.10,.16,.13,1], wood: [.28,.20,.11,1], woodLight: [.49,.36,.19,1], woodTop: [.42,.31,.16,1], soil: [.12,.11,.07,1], leaf: [.13,.38,.18,1], flower: [.68,.78,.48,1], rockMoss: [.12,.39,.18,1] },
    terrain: { grass: [.25,.43,.22,1], grassLight: [.43,.58,.31,1], grassDry: [.37,.45,.23,1], moss: [.08,.28,.15,1], mossLight: [.20,.44,.23,1], sand: [.62,.51,.29,1], sandLight: [.79,.67,.40,1], water: [.12,.35,.38,.88], waterLight: [.25,.53,.52,.88] }
  },
  brass: {
    skyTop: '#5b5b3f', skyMid: '#3a4028', skyBottom: '#15190d',
    glow: '244,205,120', beam: '247,214,132', pollen: '229,184,91', mist: '161,166,105', rain: .25, flora: 'thyme', motif: 'dial', accent: '224,181,91',
    materials: { stone: [.48,.43,.30,1], stoneLight: [.70,.62,.39,1], stoneDark: [.21,.20,.13,1], wood: [.40,.25,.11,1], woodLight: [.66,.45,.20,1], woodTop: [.58,.37,.16,1], soil: [.20,.15,.07,1], leaf: [.34,.43,.17,1], flower: [.90,.70,.31,1], rockMoss: [.30,.40,.15,1] },
    terrain: { grass: [.40,.49,.24,1], grassLight: [.62,.63,.32,1], grassDry: [.55,.49,.22,1], moss: [.22,.35,.16,1], mossLight: [.39,.48,.22,1], sand: [.78,.59,.30,1], sandLight: [.93,.73,.40,1], water: [.19,.41,.39,.88], waterLight: [.35,.59,.53,.88] }
  },
  storm: {
    skyTop: '#304e50', skyMid: '#183638', skyBottom: '#081619',
    glow: '177,220,211', beam: '188,225,216', pollen: '168,207,190', mist: '95,164,161', rain: 1.55, flora: 'reed', motif: 'ripple', accent: '152,211,208',
    materials: { stone: [.31,.40,.39,1], stoneLight: [.49,.59,.55,1], stoneDark: [.10,.17,.17,1], wood: [.29,.24,.16,1], woodLight: [.48,.41,.28,1], woodTop: [.42,.35,.24,1], soil: [.12,.14,.11,1], leaf: [.16,.37,.27,1], flower: [.65,.82,.72,1], rockMoss: [.16,.39,.27,1] },
    terrain: { grass: [.27,.43,.30,1], grassLight: [.46,.59,.39,1], grassDry: [.38,.46,.31,1], moss: [.12,.30,.20,1], mossLight: [.25,.45,.31,1], sand: [.60,.55,.35,1], sandLight: [.78,.72,.48,1], water: [.10,.39,.45,.90], waterLight: [.20,.61,.65,.90] }
  },
  sugar: {
    skyTop: '#5b6447', skyMid: '#364229', skyBottom: '#131b0f',
    glow: '244,224,169', beam: '248,230,176', pollen: '235,215,154', mist: '168,185,127', rain: .35, flora: 'clover', motif: 'spoon', accent: '235,219,171',
    materials: { stone: [.58,.55,.42,1], stoneLight: [.80,.75,.57,1], stoneDark: [.26,.27,.20,1], wood: [.43,.30,.15,1], woodLight: [.70,.52,.28,1], woodTop: [.62,.44,.23,1], soil: [.23,.18,.10,1], leaf: [.32,.48,.20,1], flower: [.93,.86,.63,1], rockMoss: [.34,.48,.20,1] },
    terrain: { grass: [.43,.52,.28,1], grassLight: [.66,.69,.38,1], grassDry: [.56,.54,.27,1], moss: [.23,.39,.18,1], mossLight: [.41,.53,.26,1], sand: [.78,.65,.41,1], sandLight: [.92,.81,.57,1], water: [.20,.43,.40,.88], waterLight: [.36,.60,.54,.88] }
  },
  shade: {
    skyTop: '#2f4934', skyMid: '#183020', skyBottom: '#08130c',
    glow: '196,211,145', beam: '206,218,151', pollen: '185,204,128', mist: '83,137,93', rain: .65, flora: 'fern', motif: 'leaf', accent: '145,180,104',
    materials: { stone: [.27,.33,.27,1], stoneLight: [.43,.49,.36,1], stoneDark: [.08,.13,.10,1], wood: [.25,.18,.10,1], woodLight: [.44,.32,.17,1], woodTop: [.38,.28,.14,1], soil: [.11,.10,.06,1], leaf: [.10,.31,.13,1], flower: [.62,.72,.40,1], rockMoss: [.10,.32,.13,1] },
    terrain: { grass: [.24,.40,.20,1], grassLight: [.40,.55,.28,1], grassDry: [.34,.42,.20,1], moss: [.09,.27,.12,1], mossLight: [.19,.41,.19,1], sand: [.64,.52,.29,1], sandLight: [.80,.67,.39,1], water: [.11,.33,.34,.88], waterLight: [.23,.51,.47,.88] }
  },
  gallery: {
    skyTop: '#3a5551', skyMid: '#203b38', skyBottom: '#0a1715',
    glow: '190,229,211', beam: '204,236,219', pollen: '181,218,195', mist: '105,167,153', rain: .55, flora: 'reed', motif: 'pane', accent: '183,226,211',
    materials: { stone: [.37,.44,.42,1], stoneLight: [.57,.64,.58,1], stoneDark: [.12,.18,.17,1], wood: [.32,.25,.16,1], woodLight: [.53,.43,.28,1], woodTop: [.47,.37,.24,1], soil: [.14,.14,.10,1], leaf: [.18,.40,.28,1], flower: [.72,.86,.72,1], rockMoss: [.18,.41,.28,1] },
    terrain: { grass: [.31,.47,.31,1], grassLight: [.49,.63,.43,1], grassDry: [.41,.49,.31,1], moss: [.13,.31,.20,1], mossLight: [.27,.47,.32,1], sand: [.67,.58,.38,1], sandLight: [.84,.75,.52,1], water: [.12,.38,.43,.90], waterLight: [.24,.59,.62,.90] }
  },
  firefly: {
    skyTop: '#2b4141', skyMid: '#182d2b', skyBottom: '#07110f',
    glow: '218,193,112', beam: '226,203,122', pollen: '232,202,91', mist: '89,132,111', rain: .30, flora: 'thyme', motif: 'lantern', accent: '232,202,91',
    materials: { stone: [.25,.31,.30,1], stoneLight: [.39,.47,.42,1], stoneDark: [.07,.11,.10,1], wood: [.30,.20,.10,1], woodLight: [.51,.35,.16,1], woodTop: [.44,.29,.13,1], soil: [.10,.09,.05,1], leaf: [.12,.28,.16,1], flower: [.90,.75,.31,1], rockMoss: [.11,.29,.15,1] },
    terrain: { grass: [.25,.38,.24,1], grassLight: [.40,.50,.30,1], grassDry: [.37,.39,.20,1], moss: [.08,.23,.13,1], mossLight: [.18,.35,.19,1], sand: [.70,.53,.25,1], sandLight: [.90,.70,.33,1], water: [.10,.27,.34,.92], waterLight: [.20,.46,.49,.92] }
  }
};

function routeOutline(centerline, width = 560) {
  const widths = Array.isArray(width) ? width : centerline.map(() => width);
  const sideA = [];
  const sideB = [];
  for (let index = 0; index < centerline.length; index += 1) {
    const previous = centerline[Math.max(0, index - 1)];
    const next = centerline[Math.min(centerline.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const half = widths[index] * .5;
    sideA.push({ x: centerline[index].x + nx * half, y: centerline[index].y + ny * half });
    sideB.push({ x: centerline[index].x - nx * half, y: centerline[index].y - ny * half });
  }
  return [...sideA, ...sideB.reverse()];
}

function authoredLevel({ id, name, note, par, centerline, width, holeRadius = 32, ...rest }) {
  const first = centerline[0];
  const second = centerline[1];
  const last = centerline.at(-1);
  const beforeLast = centerline.at(-2);
  const startPoint = { x: first.x + (second.x - first.x) * .16, y: first.y + (second.y - first.y) * .16 };
  const holePoint = { x: last.x + (beforeLast.x - last.x) * .16, y: last.y + (beforeLast.y - last.y) * .16 };
  return {
    id,
    name,
    note,
    par,
    start: { x: startPoint.x, y: startPoint.y },
    hole: { x: holePoint.x, y: holePoint.y, r: holeRadius, depth: 64 },
    centerline,
    outline: routeOutline(centerline, width),
    ...rest
  };
}

export const LEVELS = [
  authoredLevel({
    id: 1,
    name: 'Длинная капля',
    note: 'Первый настоящий маршрут через всю оранжерею',
    par: 6,
    centerline: route([230,1170],[560,1010],[430,770],[830,590],[1210,790],[1600,560],[2050,175]),
    width: [560,600,560,630,590,560,520],
    visual: VISUALS.rainGarden,
    obstacles: [
      circle(620, 870, 70, { material: 'stone' }),
      circle(1110, 660, 78, { material: 'pot' }),
      circle(1580, 510, 58, { material: 'wood' })
    ],
    zones: [
      rect(735, 505, 330, 190, { type: 'moss' }),
      rect(1320, 550, 350, 180, { type: 'sand', baseZ: -7 })
    ],
    decorations: [{type:'snail',x:330,y:1030},{type:'mushroom',x:760,y:430},{type:'leaf',x:1440,y:760},{type:'frog',x:1870,y:360}]
  }),
  authoredLevel({
    id: 2,
    name: 'Чашечный поворот',
    note: 'Большая фарфоровая подкова возвращает мяч к той же стене',
    par: 7,
    centerline: route([270,1050],[660,1080],[1050,970],[1370,770],[1450,520],[1240,350],[850,280],[500,380],[260,270]),
    width: [480,540,530,500,480,510,530,480,430],
    visual: VISUALS.porcelain,
    obstacles: [
      circle(690, 940, 150, { material: 'cup' }),
      circle(1040, 410, 62, { material: 'stone' }),
      circle(1510, 555, 82, { material: 'pot' }),
      circle(1900, 330, 55, { material: 'stone' })
    ],
    zones: [
      rect(1180, 410, 340, 175, { type: 'sand', baseZ: -8 }),
      rect(1770, 245, 270, 150, { type: 'moss' })
    ],
    decorations: [{type:'leaf',x:450,y:990},{type:'mushroom',x:930,y:700},{type:'frog',x:1390,y:315},{type:'snail',x:2030,y:470}]
  }),
  authoredLevel({
    id: 3,
    name: 'Мшистый серпантин',
    note: 'Скорость теряется, направление — нет',
    par: 7,
    centerline: route([1120,1190],[700,1100],[420,900],[680,690],[1120,820],[1540,650],[1750,390],[1380,220],[980,150]),
    width: [330,360,340,370,390,370,340,320,300],
    visual: VISUALS.deepMoss,
    obstacles: [
      circle(510, 970, 60, { material: 'wood' }),
      circle(910, 910, 66, { material: 'wood' }),
      circle(970, 570, 76, { material: 'stone' }),
      circle(1530, 425, 68, { material: 'pot' }),
      circle(1970, 255, 56, { material: 'stone' })
    ],
    zones: [
      rect(640, 860, 420, 220, { type: 'sand', baseZ: -7 }),
      rect(1120, 240, 430, 170, { type: 'moss' }),
      rect(1710, 205, 300, 150, { type: 'moss' })
    ],
    decorations: [{type:'snail',x:330,y:1100},{type:'leaf',x:780,y:650},{type:'mushroom',x:1280,y:510},{type:'frog',x:1780,y:450}]
  }),
  authoredLevel({
    id: 4,
    name: 'Латунная петля',
    note: 'Зеркальная дуга собирает два механизма в один ритм',
    par: 7,
    centerline: route([2050,1120],[1650,1180],[1220,1060],[950,800],[1120,530],[1500,430],[1770,660],[2020,470],[2140,170]),
    width: [440,490,510,480,460,500,470,430,400],
    visual: VISUALS.brass,
    obstacles: [
      circle(530, 1010, 64, { material: 'pot' }),
      circle(1120, 610, 62, { material: 'stone' }),
      circle(1650, 440, 70, { material: 'pot' })
    ],
    rotors: [
      { x: 930, y: 930, length: 370, thickness: 30, speed: .64, angle: .4, material: 'brass' },
      { x: 1510, y: 350, length: 330, thickness: 28, speed: -.48, angle: 1.1, material: 'wood' }
    ],
    zones: [rect(1180, 230, 410, 170, { type: 'moss' })],
    decorations: [{type:'frog',x:420,y:870},{type:'leaf',x:890,y:1180},{type:'mushroom',x:1370,y:530},{type:'snail',x:1940,y:410}]
  }),
  authoredLevel({
    id: 5,
    name: 'Мост над дождём',
    note: 'Штормовая диагональ ведёт через узкий сухой перешеек',
    par: 7,
    centerline: route([2160,1130],[1780,1060],[1450,850],[1160,940],[900,720],[650,540],[780,300],[420,170]),
    width: [540,590,620,650,600,570,540,500],
    visual: VISUALS.storm,
    obstacles: [
      circle(540, 1040, 58, { material: 'stone' }),
      circle(1060, 820, 62, { material: 'stone' }),
      circle(1700, 510, 58, { material: 'pot' })
    ],
    zones: [
      rect(1135, 700, 420, 290, { type: 'water', depth: 28 }),
      rect(1265, 675, 126, 330, { type: 'bridge', height: 12 }),
      rect(1770, 350, 300, 150, { type: 'moss' })
    ],
    walls: [
      { ax: 1265, ay: 675, bx: 1265, by: 1005, thickness: 20, material: 'glass' },
      { ax: 1391, ay: 675, bx: 1391, by: 1005, thickness: 20, material: 'glass' }
    ],
    decorations: [{type:'frog',x:1050,y:690},{type:'leaf',x:1510,y:970},{type:'snail',x:680,y:1120},{type:'mushroom',x:1980,y:370}]
  }),
  authoredLevel({
    id: 6,
    name: 'Склоны сахарницы',
    note: 'Высота теперь видна и действительно толкает мяч вниз',
    par: 8,
    centerline: route([1050,1190],[600,1080],[420,820],[720,620],[1120,540],[1500,700],[1820,480],[1600,230],[1200,150]),
    width: [360,400,380,400,430,400,370,350,330],
    visual: VISUALS.sugar,
    obstacles: [
      circle(600, 910, 82, { material: 'spoon' }),
      circle(1210, 730, 68, { material: 'sugar' }),
      circle(1740, 490, 64, { material: 'stone' })
    ],
    zones: [
      rect(760, 850, 390, 220, { type: 'slope', baseZ: 0, riseX: 24, riseY: -8 }),
      rect(1330, 650, 370, 210, { type: 'slope', baseZ: 0, riseX: -18, riseY: 28 }),
      rect(1850, 295, 280, 160, { type: 'sand', baseZ: -7 })
    ],
    decorations: [{type:'mushroom',x:360,y:990},{type:'leaf',x:950,y:790},{type:'snail',x:1450,y:930},{type:'frog',x:2010,y:470}]
  }),
  authoredLevel({
    id: 7,
    name: 'Две длинные дороги',
    note: 'Короткий рискованный центр или спокойные внешние виражи',
    par: 8,
    centerline: route([360,250],[270,650],[420,1020],[850,1110],[1400,1060],[1880,830],[2140,510],[2050,190]),
    width: [500,520,580,650,680,620,560,500],
    visual: VISUALS.shade,
    obstacles: [
      circle(900, 970, 170, { material: 'pot' }),
      circle(1320, 850, 130, { material: 'cup' }),
      circle(1750, 630, 58, { material: 'stone' }),
      circle(2050, 360, 54, { material: 'wood' })
    ],
    zones: [
      rect(1010, 720, 180, 360, { type: 'sand', baseZ: -8 }),
      rect(1510, 660, 310, 160, { type: 'moss' })
    ],
    walls: [
      { ax: 1110, ay: 690, bx: 1390, by: 760, thickness: 18, material: 'glass' }
    ],
    decorations: [{type:'frog',x:520,y:830},{type:'mushroom',x:1110,y:1120},{type:'leaf',x:1580,y:1020},{type:'snail',x:2110,y:560}]
  }),
  authoredLevel({
    id: 8,
    name: 'Прыжок через галерею',
    note: 'Разгонись по пандусу или воспользуйся тихим туннелем',
    par: 6,
    centerline: route([220,1120],[520,900],[820,720],[1100,770],[1370,570],[1640,420],[1910,310],[2180,160]),
    width: [540,590,580,650,600,560,530,500],
    visual: VISUALS.gallery,
    obstacles: [
      circle(600, 930, 78, { material: 'stone' }),
      circle(1080, 820, 70, { material: 'wood' }),
      circle(1660, 530, 62, { material: 'pot' })
    ],
    tunnels: [{ entry: {x: 690, y: 1080, r: 48}, exit: {x: 1570, y: 520, r: 48} }],
    zones: [
      rect(1050, 735, 330, 190, { type: 'slope', baseZ: 0, riseX: 30, riseY: -4, ramp: true, launch: 350 }),
      rect(1390, 610, 260, 190, { type: 'water', depth: 30 }),
      rect(1680, 390, 300, 150, { type: 'moss' })
    ],
    decorations: [{type:'snail',x:360,y:1080},{type:'leaf',x:920,y:620},{type:'mushroom',x:1430,y:970},{type:'frog',x:1970,y:420}]
  }),
  authoredLevel({
    id: 9,
    name: 'Зигзаг светлячков',
    note: 'Финальный маршрут меняет направление чаще, чем светлячки',
    par: 9,
    centerline: route([220,1160],[650,1040],[1050,1160],[1450,980],[1280,720],[850,620],[650,360],[1040,210],[1450,370],[1810,250],[2200,150]),
    width: [360,400,420,410,380,400,370,420,390,360,330],
    visual: VISUALS.firefly,
    obstacles: [
      circle(500, 1010, 62, { material: 'stone' }),
      circle(900, 930, 68, { material: 'stone' }),
      circle(1040, 620, 92, { material: 'cup' }),
      circle(1510, 500, 70, { material: 'pot' }),
      circle(1950, 300, 58, { material: 'wood' })
    ],
    rotors: [
      { x: 790, y: 1040, length: 360, thickness: 28, speed: -.52, angle: 0, material: 'wood' },
      { x: 1700, y: 470, length: 330, thickness: 27, speed: .66, angle: .7, material: 'brass' }
    ],
    zones: [
      rect(1090, 300, 390, 210, { type: 'slope', baseZ: 0, riseX: 22, riseY: -14 }),
      rect(1310, 420, 280, 210, { type: 'water', depth: 26 }),
      rect(1400, 400, 115, 240, { type: 'bridge', height: 12 }),
      rect(1840, 235, 270, 150, { type: 'sand', baseZ: -7 })
    ],
    walls: [
      { ax: 1400, ay: 400, bx: 1400, by: 640, thickness: 18, material: 'glass' },
      { ax: 1515, ay: 400, bx: 1515, by: 640, thickness: 18, material: 'glass' }
    ],
    decorations: [{type:'frog',x:350,y:940},{type:'snail',x:680,y:1180},{type:'mushroom',x:1200,y:600},{type:'mushroom',x:1770,y:620},{type:'leaf',x:2070,y:440}],
    fireflies: 22
  })
];

export function getLevel(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}

export function levelBounds(level) {
  const xs = level.outline.map((point) => point.x);
  const ys = level.outline.map((point) => point.y);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys)
  };
}
