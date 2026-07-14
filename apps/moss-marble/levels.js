const rect = (x, y, w, h, extra = {}) => ({ shape: 'rect', x, y, w, h, ...extra });
const circle = (x, y, r, extra = {}) => ({ shape: 'circle', x, y, r, ...extra });
const route = (...points) => points.map(([x, y]) => ({ x, y }));

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
    note: 'Два широких виража вокруг старой посуды',
    par: 6,
    centerline: route([220,1120],[620,1160],[850,870],[650,570],[1080,360],[1510,570],[1800,380],[2180,205]),
    width: [590,650,610,590,660,600,560,520],
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
    name: 'Мшистая серпантинная',
    note: 'Скорость теряется, направление — нет',
    par: 7,
    centerline: route([180,1200],[520,980],[840,1110],[1050,790],[850,520],[1220,260],[1580,440],[1900,230],[2220,150]),
    width: [560,620,590,630,560,620,580,540,500],
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
    note: 'Длинный маршрут пересекают два честных механизма',
    par: 7,
    centerline: route([240,1170],[610,930],[980,1080],[1180,760],[980,470],[1390,270],[1770,500],[2070,250]),
    width: [580,620,630,610,570,640,570,510],
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
    note: 'Вода ниже поля, стекло — действительно над водой',
    par: 7,
    centerline: route([230,1180],[610,1010],[890,760],[1240,880],[1510,590],[1810,420],[2150,190]),
    width: [570,620,600,660,600,550,500],
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
    par: 7,
    centerline: route([190,1160],[540,920],[880,1030],[1110,710],[1450,800],[1700,500],[2140,210]),
    width: [570,620,600,650,610,560,510],
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
    par: 7,
    centerline: route([220,1190],[590,960],[890,1090],[1130,770],[1420,980],[1690,650],[1990,420],[2220,170]),
    width: [600,660,700,720,680,620,560,500],
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
    centerline: route([190,1170],[520,990],[820,760],[1160,900],[1460,650],[1790,430],[2160,190]),
    width: [570,610,590,660,600,550,500],
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
    name: 'Светлячковый серпантин',
    note: 'Финальная длинная лунка с высотой, водой и двумя ритмами',
    par: 8,
    centerline: route([190,1190],[530,980],[820,1130],[1090,830],[920,560],[1300,330],[1620,560],[1880,350],[2220,150]),
    width: [580,620,650,620,570,650,600,550,500],
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
