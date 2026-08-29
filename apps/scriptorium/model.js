export const FORMATS = {
  square: { label: 'Квадрат', width: 1000, height: 1000 },
  portrait: { label: 'Книга', width: 900, height: 1200 },
  landscape: { label: 'Фриз', width: 1200, height: 900 }
};

export const BACKGROUNDS = {
  ochre: { label: 'Охра', fill: '#d6a62b', wash: '#efc957' },
  vellum: { label: 'Пергамент', fill: '#e4cc88', wash: '#f3e1aa' },
  lime: { label: 'Известь', fill: '#d7cfad', wash: '#eee8cf' },
  cinnabar: { label: 'Киноварь', fill: '#9f352c', wash: '#bf5544' },
  ultramarine: { label: 'Лазурь', fill: '#31547c', wash: '#4d6d91' },
  green: { label: 'Малахит', fill: '#57704d', wash: '#728763' }
};

export const FRAMES = {
  plain: 'Линия',
  double: 'Двойная',
  blocks: 'Камни',
  ribbon: 'Лента',
  none: 'Без рамки'
};

export const ORNAMENTS = {
  none: 'Нет',
  vine: 'Лоза',
  stars: 'Звёзды',
  knots: 'Узлы',
  corners: 'Углы'
};

export const FIGURES = {
  queen: { label: 'Королева', defaultColor: '#a52d25', headwear: 'crown', held: 'sword' },
  king: { label: 'Король', defaultColor: '#31547c', headwear: 'crown', held: 'orb' },
  knight: { label: 'Рыцарь', defaultColor: '#48657b', headwear: 'helm', held: 'sword' },
  monk: { label: 'Монах', defaultColor: '#75503b', headwear: 'hood', held: 'book' },
  saint: { label: 'Святой', defaultColor: '#9d5532', headwear: 'halo', held: 'staff' },
  pilgrim: { label: 'Паломник', defaultColor: '#6f674b', headwear: 'cap', held: 'staff' }
};

export const OBJECTS = {
  amphora: 'Амфора',
  chalice: 'Кубок',
  crown: 'Корона',
  book: 'Книга',
  shield: 'Щит',
  tower: 'Башня',
  tree: 'Древо',
  sun: 'Солнце',
  beast: 'Зверь',
  altar: 'Алтарь',
  sword: 'Меч',
  moon: 'Луна'
};

export const HEADWEAR = {
  none: 'Без убора',
  crown: 'Корона',
  veil: 'Покрывало',
  hood: 'Капюшон',
  helm: 'Шлем',
  halo: 'Нимб',
  cap: 'Шаперон'
};

export const HELD = {
  none: 'Пустая рука',
  sword: 'Меч',
  book: 'Книга',
  staff: 'Посох',
  orb: 'Держава',
  chalice: 'Кубок'
};

export const PALETTES = {
  york: { label: 'Йоркская', colors: ['#a52d25', '#31547c', '#d5a42d', '#70824d'], ink: '#332116', skin: '#d69a55', hair: '#8a5a2f' },
  byzantium: { label: 'Византийская', colors: ['#6b345f', '#244f78', '#d3a52a', '#7a2f28'], ink: '#2d1b17', skin: '#cf9156', hair: '#5c3421' },
  tuscany: { label: 'Тосканская', colors: ['#a23c2d', '#6f7843', '#c18d2d', '#476783'], ink: '#3a2519', skin: '#d7a066', hair: '#785035' },
  cloister: { label: 'Монастырская', colors: ['#77513a', '#606a4d', '#8b6c42', '#6a5350'], ink: '#30231b', skin: '#c99460', hair: '#5e4431' },
  royal: { label: 'Королевская', colors: ['#9e2926', '#274f82', '#d2a326', '#724574'], ink: '#2c1b15', skin: '#daa15e', hair: '#8b6238' }
};

export const STORIES = [
  {
    title: 'Королева и сосуд',
    subtitle: 'В духе придворной аллегории: корона, меч и крупная амфора.',
    scene: () => sceneFrom({
      background: 'ochre', frame: 'double', ornament: 'none', inscription: '',
      items: [
        figure('queen', .65, .56, 1.05, { held: 'sword', headwear: 'crown', flip: true }),
        objectItem('amphora', .28, .63, 1.2),
        objectItem('crown', .27, .29, .62)
      ]
    })
  },
  {
    title: 'Рыцарь у башни',
    subtitle: 'Военная миниатюра с гербом, крепостью и небесным знаком.',
    scene: () => sceneFrom({
      background: 'vellum', frame: 'blocks', ornament: 'corners', inscription: 'FIDES ET FERRVM',
      inscriptionPosition: 'top',
      items: [
        figure('knight', .37, .58, .98, { held: 'sword', headwear: 'helm' }),
        objectItem('shield', .58, .61, .75, { color: '#9e2926' }),
        objectItem('tower', .76, .48, 1.05),
        objectItem('sun', .78, .19, .52)
      ]
    })
  },
  {
    title: 'Скрипторий',
    subtitle: 'Монах с книгой, древом и алтарём — спокойная монастырская сцена.',
    scene: () => sceneFrom({
      background: 'lime', frame: 'ribbon', ornament: 'vine', inscription: 'VERBA MANENT',
      inscriptionPosition: 'bottom',
      items: [
        figure('monk', .38, .58, 1, { held: 'book', headwear: 'hood' }),
        objectItem('altar', .66, .69, .92),
        objectItem('book', .65, .53, .55, { color: '#9e2926' }),
        objectItem('tree', .79, .39, .78)
      ]
    })
  },
  {
    title: 'Святой и зверь',
    subtitle: 'Житийный лист: нимб, посох и фантастическое животное.',
    scene: () => sceneFrom({
      background: 'ultramarine', frame: 'double', ornament: 'stars', inscription: 'NON TIMEAS',
      inscriptionPosition: 'top',
      items: [
        figure('saint', .35, .55, 1, { held: 'staff', headwear: 'halo' }),
        objectItem('beast', .68, .67, 1.05, { color: '#c18d2d', flip: true }),
        objectItem('moon', .77, .2, .48)
      ]
    })
  }
];

function uid(prefix = 'i') {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultState() {
  return {
    format: 'square',
    background: 'ochre',
    frame: 'double',
    ornament: 'none',
    inscription: '',
    inscriptionPosition: 'bottom',
    palette: 'york',
    lineWeight: 6,
    texture: true,
    items: [
      figure('queen', .66, .57, 1.02, { held: 'sword', headwear: 'crown', flip: true }),
      objectItem('amphora', .29, .64, 1.18),
      objectItem('crown', .28, .3, .62)
    ]
  };
}

export function sceneFrom(overrides = {}) {
  const next = defaultState();
  Object.assign(next, overrides);
  return next;
}

export function figure(kind, x, y, scale = 1, overrides = {}) {
  const def = FIGURES[kind];
  return {
    id: uid('fig'), type: 'figure', kind, x, y, scale, flip: false,
    color: def.defaultColor, headwear: def.headwear, held: def.held, ...overrides
  };
}

export function objectItem(kind, x, y, scale = .8, overrides = {}) {
  return { id: uid('obj'), type: 'object', kind, x, y, scale, flip: false, color: null, ...overrides };
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return defaultState();
  const fallback = defaultState();
  const next = {
    format: FORMATS[raw.format] ? raw.format : fallback.format,
    background: BACKGROUNDS[raw.background] ? raw.background : fallback.background,
    frame: FRAMES[raw.frame] ? raw.frame : fallback.frame,
    ornament: ORNAMENTS[raw.ornament] ? raw.ornament : fallback.ornament,
    inscription: typeof raw.inscription === 'string' ? raw.inscription.slice(0, 42) : '',
    inscriptionPosition: ['top', 'bottom'].includes(raw.inscriptionPosition) ? raw.inscriptionPosition : 'bottom',
    palette: PALETTES[raw.palette] ? raw.palette : fallback.palette,
    lineWeight: clamp(Number(raw.lineWeight) || 6, 3, 10),
    texture: raw.texture !== false,
    items: []
  };
  if (Array.isArray(raw.items)) {
    next.items = raw.items.slice(0, 24).map((item) => sanitizeItem(item)).filter(Boolean);
  }
  return next;
}

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'figure' && FIGURES[item.kind]) {
    const def = FIGURES[item.kind];
    return {
      id: typeof item.id === 'string' ? item.id : uid('fig'),
      type: 'figure', kind: item.kind,
      x: clamp(Number(item.x) || .5, .04, .96), y: clamp(Number(item.y) || .5, .04, .96),
      scale: clamp(Number(item.scale) || 1, .42, 1.5), flip: Boolean(item.flip),
      color: isColor(item.color) ? item.color : def.defaultColor,
      headwear: HEADWEAR[item.headwear] ? item.headwear : def.headwear,
      held: HELD[item.held] ? item.held : def.held
    };
  }
  if (item.type === 'object' && OBJECTS[item.kind]) {
    return {
      id: typeof item.id === 'string' ? item.id : uid('obj'), type: 'object', kind: item.kind,
      x: clamp(Number(item.x) || .5, .04, .96), y: clamp(Number(item.y) || .5, .04, .96),
      scale: clamp(Number(item.scale) || .8, .3, 1.7), flip: Boolean(item.flip),
      color: isColor(item.color) ? item.color : null
    };
  }
  return null;
}

export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function isColor(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
