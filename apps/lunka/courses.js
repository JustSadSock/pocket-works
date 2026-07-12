const W = 1000;
const H = 1500;
const INSET = 72;

function wall(x1, y1, x2, y2, width = 28, material = 'brass') {
  return { x1, y1, x2, y2, width, material };
}

function outerWalls() {
  return [
    wall(INSET, INSET, W - INSET, INSET, 34, 'stone'),
    wall(W - INSET, INSET, W - INSET, H - INSET, 34, 'stone'),
    wall(W - INSET, H - INSET, INSET, H - INSET, 34, 'stone'),
    wall(INSET, H - INSET, INSET, INSET, 34, 'stone')
  ];
}

export const WORLD = { width: W, height: H, inset: INSET };

export const COURSES = [
  {
    id: 'first-glint',
    number: 1,
    name: 'ПЕРВЫЙ БЛИК',
    subtitle: 'мокрый сланец',
    par: 2,
    start: { x: 500, y: 1265 },
    hole: { x: 500, y: 225 },
    walls: [
      ...outerWalls(),
      wall(300, 1040, 410, 930, 24, 'glass'),
      wall(590, 930, 700, 1040, 24, 'glass')
    ],
    bumpers: [{ x: 500, y: 720, r: 70, kind: 'planter' }],
    zones: [
      { type: 'sand', shape: 'rect', x: 110, y: 450, w: 205, h: 330 },
      { type: 'sand', shape: 'rect', x: 685, y: 450, w: 205, h: 330 }
    ],
    lamps: [{ x: 170, y: 220 }, { x: 830, y: 1180 }]
  },
  {
    id: 'bank',
    number: 2,
    name: 'БАНК',
    subtitle: 'удар через угол',
    par: 3,
    start: { x: 760, y: 1260 },
    hole: { x: 205, y: 225 },
    walls: [
      ...outerWalls(),
      wall(600, 335, 600, 1080, 30, 'brass'),
      wall(250, 520, 600, 520, 30, 'brass'),
      wall(250, 520, 250, 770, 26, 'glass')
    ],
    bumpers: [
      { x: 785, y: 735, r: 54, kind: 'lamp' },
      { x: 180, y: 1030, r: 66, kind: 'planter' }
    ],
    zones: [
      { type: 'slope', shape: 'rect', x: 660, y: 250, w: 195, h: 260, ax: -26, ay: 10 },
      { type: 'sand', shape: 'circle', x: 420, y: 1110, r: 116 }
    ],
    lamps: [{ x: 840, y: 230 }, { x: 175, y: 820 }]
  },
  {
    id: 'glass-gate',
    number: 3,
    name: 'СТЕКЛЯННЫЕ ВОРОТА',
    subtitle: 'поймай окно',
    par: 3,
    start: { x: 500, y: 1280 },
    hole: { x: 500, y: 210 },
    walls: [
      ...outerWalls(),
      wall(185, 980, 380, 850, 26, 'glass'),
      wall(815, 980, 620, 850, 26, 'glass'),
      wall(185, 500, 390, 620, 26, 'glass'),
      wall(815, 500, 610, 620, 26, 'glass')
    ],
    gates: [
      { x1: 260, y1: 748, x2: 740, y2: 748, width: 34, axis: 'x', amplitude: 170, speed: 0.72, phase: 0.2 }
    ],
    bumpers: [{ x: 500, y: 1050, r: 44, kind: 'brass' }],
    zones: [
      { type: 'sand', shape: 'rect', x: 115, y: 650, w: 185, h: 205 },
      { type: 'sand', shape: 'rect', x: 700, y: 650, w: 185, h: 205 }
    ],
    lamps: [{ x: 165, y: 260 }, { x: 835, y: 260 }]
  },
  {
    id: 'island',
    number: 4,
    name: 'ОСТРОВ',
    subtitle: 'мост над водой',
    par: 4,
    start: { x: 500, y: 1270 },
    hole: { x: 500, y: 215 },
    walls: [
      ...outerWalls(),
      wall(390, 1000, 390, 520, 24, 'glass'),
      wall(610, 1000, 610, 520, 24, 'glass')
    ],
    bumpers: [
      { x: 330, y: 1110, r: 52, kind: 'planter' },
      { x: 670, y: 1110, r: 52, kind: 'planter' }
    ],
    zones: [
      { type: 'water', shape: 'rect', x: 100, y: 540, w: 290, h: 430 },
      { type: 'water', shape: 'rect', x: 610, y: 540, w: 290, h: 430 },
      { type: 'slope', shape: 'rect', x: 410, y: 560, w: 180, h: 380, ax: 0, ay: -22 },
      { type: 'sand', shape: 'rect', x: 235, y: 230, w: 530, h: 155 }
    ],
    lamps: [{ x: 500, y: 485 }, { x: 500, y: 1020 }]
  },
  {
    id: 'two-moons',
    number: 5,
    name: 'ДВА МЕСЯЦА',
    subtitle: 'короткий путь',
    par: 3,
    start: { x: 220, y: 1260 },
    hole: { x: 790, y: 220 },
    walls: [
      ...outerWalls(),
      wall(370, 1180, 370, 650, 30, 'stone'),
      wall(370, 650, 770, 650, 30, 'stone'),
      wall(620, 650, 620, 280, 26, 'glass')
    ],
    bumpers: [
      { x: 760, y: 1040, r: 78, kind: 'planter' },
      { x: 220, y: 390, r: 58, kind: 'lamp' }
    ],
    portals: [
      { id: 'moon-a', x: 220, y: 850, r: 56, pair: 'moon-b' },
      { id: 'moon-b', x: 780, y: 470, r: 56, pair: 'moon-a' }
    ],
    zones: [
      { type: 'sand', shape: 'circle', x: 530, y: 1080, r: 125 },
      { type: 'slope', shape: 'rect', x: 680, y: 720, w: 170, h: 220, ax: 18, ay: -20 }
    ],
    lamps: [{ x: 130, y: 210 }, { x: 870, y: 1210 }]
  },
  {
    id: 'rotor',
    number: 6,
    name: 'РОТОР',
    subtitle: 'последняя крыша',
    par: 5,
    start: { x: 500, y: 1290 },
    hole: { x: 500, y: 190 },
    walls: [
      ...outerWalls(),
      wall(150, 1120, 365, 950, 26, 'glass'),
      wall(850, 1120, 635, 950, 26, 'glass'),
      wall(150, 405, 360, 545, 26, 'glass'),
      wall(850, 405, 640, 545, 26, 'glass')
    ],
    rotors: [
      { x: 500, y: 745, arms: 4, length: 235, width: 32, speed: 0.9, phase: 0.35 }
    ],
    gates: [
      { x1: 285, y1: 1020, x2: 715, y2: 1020, width: 30, axis: 'x', amplitude: 135, speed: 0.58, phase: 2.2 }
    ],
    bumpers: [
      { x: 260, y: 735, r: 58, kind: 'brass' },
      { x: 740, y: 735, r: 58, kind: 'brass' }
    ],
    zones: [
      { type: 'water', shape: 'circle', x: 195, y: 250, r: 95 },
      { type: 'water', shape: 'circle', x: 805, y: 250, r: 95 },
      { type: 'sand', shape: 'rect', x: 110, y: 825, w: 240, h: 150 },
      { type: 'sand', shape: 'rect', x: 650, y: 825, w: 240, h: 150 },
      { type: 'slope', shape: 'rect', x: 420, y: 300, w: 160, h: 215, ax: 0, ay: -28 }
    ],
    lamps: [{ x: 140, y: 520 }, { x: 860, y: 520 }, { x: 500, y: 1090 }]
  }
];

export function courseAt(index) {
  return COURSES[((index % COURSES.length) + COURSES.length) % COURSES.length];
}
