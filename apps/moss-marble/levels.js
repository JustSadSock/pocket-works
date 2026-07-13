const rect = (x, y, w, h, extra = {}) => ({ shape: 'rect', x, y, w, h, ...extra });
const circle = (x, y, r, extra = {}) => ({ shape: 'circle', x, y, r, ...extra });
const poly = (...points) => points.map(([x, y]) => ({ x, y }));

export const LEVELS = [
  {
    id: 1,
    name: 'Первая капля',
    note: 'Прямой путь после дождя',
    par: 3,
    start: { x: 500, y: 1220 },
    hole: { x: 500, y: 235, r: 31 },
    outline: poly([250,1300],[175,1130],[210,880],[155,650],[230,360],[350,130],[650,130],[770,360],[845,650],[790,880],[825,1130],[750,1300]),
    obstacles: [
      circle(360, 740, 72, { material: 'stone' }),
      circle(650, 560, 62, { material: 'pot' })
    ],
    zones: [rect(250, 870, 500, 160, { type: 'moss' })],
    decorations: [{type:'snail',x:735,y:1070},{type:'mushroom',x:295,y:340},{type:'leaf',x:690,y:860}]
  },
  {
    id: 2,
    name: 'Чашечный край',
    note: 'Обойди старую чашку',
    par: 3,
    start: { x: 260, y: 1120 },
    hole: { x: 720, y: 260, r: 31 },
    outline: poly([145,1250],[130,910],[220,680],[160,410],[280,135],[740,135],[850,310],[825,650],[870,930],[790,1250]),
    obstacles: [
      circle(520, 700, 170, { material: 'cup' }),
      circle(265, 430, 55, { material: 'stone' })
    ],
    zones: [rect(550, 965, 220, 145, { type: 'sand' })],
    decorations: [{type:'leaf',x:205,y:760},{type:'mushroom',x:760,y:1100},{type:'frog',x:725,y:520}]
  },
  {
    id: 3,
    name: 'Медленный мох',
    note: 'Сила здесь быстро вязнет',
    par: 4,
    start: { x: 500, y: 1240 },
    hole: { x: 500, y: 190, r: 31 },
    outline: poly([210,1315],[155,1110],[215,900],[150,690],[230,470],[170,260],[305,100],[695,100],[830,260],[770,470],[850,690],[785,900],[845,1110],[790,1315]),
    obstacles: [
      circle(320, 790, 58, { material: 'wood' }),
      circle(680, 790, 58, { material: 'wood' }),
      circle(500, 500, 75, { material: 'stone' })
    ],
    zones: [rect(205, 890, 590, 215, { type: 'sand' }), rect(300, 275, 400, 140, { type: 'moss' })],
    decorations: [{type:'snail',x:275,y:990},{type:'leaf',x:760,y:650},{type:'mushroom',x:260,y:260}]
  },
  {
    id: 4,
    name: 'Латунный ритм',
    note: 'Планка движется честно',
    par: 4,
    start: { x: 500, y: 1220 },
    hole: { x: 500, y: 215, r: 31 },
    outline: poly([200,1310],[145,1040],[210,760],[145,480],[240,130],[760,130],[855,480],[790,760],[855,1040],[800,1310]),
    obstacles: [circle(305, 430, 66, { material: 'pot' }), circle(695, 930, 66, { material: 'pot' })],
    rotors: [{ x: 500, y: 700, length: 420, thickness: 30, speed: .72, angle: .45, material: 'brass' }],
    zones: [rect(220, 1040, 560, 120, { type: 'moss' })],
    decorations: [{type:'frog',x:730,y:320},{type:'leaf',x:260,y:830},{type:'mushroom',x:755,y:1110}]
  },
  {
    id: 5,
    name: 'Стеклянный мост',
    note: 'Вода возвращает последний удар',
    par: 4,
    start: { x: 500, y: 1245 },
    hole: { x: 500, y: 180, r: 31 },
    outline: poly([245,1320],[170,1050],[220,820],[150,620],[220,390],[180,170],[350,85],[650,85],[820,170],[780,390],[850,620],[780,820],[830,1050],[755,1320]),
    obstacles: [circle(340, 1050, 54, { material: 'stone' }), circle(660, 1050, 54, { material: 'stone' })],
    zones: [
      rect(185, 480, 630, 275, { type: 'water' }),
      rect(438, 445, 124, 345, { type: 'bridge' })
    ],
    walls: [
      { ax: 438, ay: 445, bx: 438, by: 790, thickness: 22, material: 'glass' },
      { ax: 562, ay: 445, bx: 562, by: 790, thickness: 22, material: 'glass' }
    ],
    decorations: [{type:'frog',x:275,y:600},{type:'leaf',x:730,y:670},{type:'snail',x:720,y:1180}]
  },
  {
    id: 6,
    name: 'Ложка сахара',
    note: 'Склоны меняют траекторию',
    par: 4,
    start: { x: 250, y: 1210 },
    hole: { x: 750, y: 215, r: 31 },
    outline: poly([130,1320],[110,940],[180,690],[125,380],[250,110],[740,110],[865,380],[820,690],[890,940],[870,1320]),
    obstacles: [
      circle(420, 935, 84, { material: 'spoon' }),
      circle(610, 500, 68, { material: 'sugar' })
    ],
    zones: [
      rect(155, 650, 340, 170, { type: 'slope', forceX: 120, forceY: -15 }),
      rect(525, 270, 300, 150, { type: 'slope', forceX: -90, forceY: 25 })
    ],
    decorations: [{type:'mushroom',x:215,y:240},{type:'leaf',x:735,y:850},{type:'snail',x:250,y:1070}]
  },
  {
    id: 7,
    name: 'Две дороги',
    note: 'Коротко через риск или спокойно вокруг',
    par: 4,
    start: { x: 500, y: 1250 },
    hole: { x: 500, y: 175, r: 31 },
    outline: poly([180,1320],[130,1060],[220,840],[125,610],[210,390],[160,170],[310,85],[690,85],[840,170],[790,390],[875,610],[780,840],[870,1060],[820,1320]),
    obstacles: [
      circle(500, 720, 165, { material: 'pot' }),
      circle(250, 470, 52, { material: 'stone' }),
      circle(750, 470, 52, { material: 'stone' })
    ],
    zones: [rect(430, 515, 140, 410, { type: 'sand' })],
    decorations: [{type:'frog',x:255,y:800},{type:'mushroom',x:745,y:300},{type:'leaf',x:710,y:1050}]
  },
  {
    id: 8,
    name: 'Тихий туннель',
    note: 'Труба переносит мяч наверх',
    par: 3,
    start: { x: 260, y: 1215 },
    hole: { x: 750, y: 235, r: 31 },
    outline: poly([130,1320],[115,930],[190,690],[140,360],[270,105],[735,105],[860,360],[815,690],[890,930],[870,1320]),
    obstacles: [circle(540, 760, 105, { material: 'stone' }), circle(300, 430, 60, { material: 'wood' })],
    tunnels: [{ entry: {x: 760, y: 1030, r: 48}, exit: {x: 570, y: 385, r: 48} }],
    zones: [rect(155, 820, 260, 120, { type: 'moss' })],
    decorations: [{type:'snail',x:335,y:1070},{type:'leaf',x:735,y:620},{type:'mushroom',x:700,y:280}]
  },
  {
    id: 9,
    name: 'Светлячки',
    note: 'Финальная лунка оранжереи',
    par: 5,
    start: { x: 500, y: 1260 },
    hole: { x: 500, y: 155, r: 32 },
    outline: poly([205,1330],[130,1120],[210,900],[125,680],[210,470],[145,255],[290,70],[710,70],[855,255],[790,470],[875,680],[790,900],[870,1120],[795,1330]),
    obstacles: [
      circle(300, 980, 62, { material: 'stone' }),
      circle(700, 980, 62, { material: 'stone' }),
      circle(500, 455, 92, { material: 'cup' })
    ],
    rotors: [{ x: 500, y: 735, length: 470, thickness: 28, speed: -.55, angle: 0, material: 'wood' }],
    zones: [rect(235, 1080, 530, 110, { type: 'moss' }), rect(185, 260, 230, 130, { type: 'sand' }), rect(585, 260, 230, 130, { type: 'sand' })],
    decorations: [{type:'frog',x:250,y:560},{type:'snail',x:730,y:1110},{type:'mushroom',x:745,y:330},{type:'mushroom',x:255,y:330}],
    fireflies: 18
  }
];

export function getLevel(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}

export function levelBounds(level) {
  const xs = level.outline.map((p) => p.x);
  const ys = level.outline.map((p) => p.y);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys)
  };
}
