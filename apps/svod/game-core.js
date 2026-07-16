export const SLOT_COUNT = 8;
export const RING_COUNT = 3;
export const TOTAL_CYCLES = 12;

const RESOURCE_CAP = 30;
const STAT_CAP = 100;

export const RING_NAMES = Object.freeze([
  'Внутренний привод',
  'Пояс мастерских',
  'Внешний город'
]);

export const CARRIERS = Object.freeze({
  water: { name: 'вода', color: '#4d8b91' },
  power: { name: 'ток', color: '#d79c3d' },
  labor: { name: 'труд', color: '#b96549' },
  ration: { name: 'пища', color: '#6e8c5c' },
  parts: { name: 'детали', color: '#496b78' },
  mandate: { name: 'мандат', color: '#765f83' }
});

export const SECTOR_TYPES = Object.freeze({
  condenser: {
    ring: 0,
    name: 'Конденсер',
    short: 'ВОДА',
    output: 'water',
    description: 'Снимает влагу со стеклянной бури и подаёт воду наружу.'
  },
  dynamo: {
    ring: 0,
    name: 'Динамо',
    short: 'ТОК',
    output: 'power',
    description: 'Превращает движение центрального маховика в ток.'
  },
  forum: {
    ring: 0,
    name: 'Форум',
    short: 'ТРУД',
    output: 'labor',
    description: 'Собирает свободные бригады и направляет их в город.'
  },
  garden: {
    ring: 1,
    name: 'Теплица',
    short: 'ЕДА',
    input: 'water',
    output: 'ration',
    description: 'Принимает воду и выращивает паёк для внешних кварталов.'
  },
  forge: {
    ring: 1,
    name: 'Цех',
    short: 'ДЕТАЛИ',
    input: 'power',
    output: 'parts',
    description: 'Принимает ток и штампует детали для стен и проектов.'
  },
  guild: {
    ring: 1,
    name: 'Гильдия',
    short: 'МАНДАТ',
    input: 'labor',
    output: 'mandate',
    description: 'Превращает работу бригад в политический мандат.'
  },
  habitat: {
    ring: 2,
    name: 'Квартал',
    short: 'ЖИЛЬЁ',
    input: 'ration',
    effect: 'habitat',
    description: 'Сытый квартал укрепляет запасы и сцепление города.'
  },
  bastion: {
    ring: 2,
    name: 'Бастион',
    short: 'ЩИТ',
    input: 'parts',
    effect: 'bastion',
    description: 'Получая детали, закрывает свой луч от стеклянной бури.'
  },
  council: {
    ring: 2,
    name: 'Совет',
    short: 'ВОЛЯ',
    input: 'mandate',
    effect: 'council',
    description: 'Поддержанный совет даёт городу волю к большим проектам.'
  }
});

export const CHARTERS = Object.freeze({
  water: {
    id: 'water',
    name: 'Водный союз',
    mark: 'I',
    description: 'Запас на голодный старт. Каждая работающая теплица даёт ещё 1 паёк.',
    start: { rations: 13, parts: 6, mandate: 4, integrity: 92, cohesion: 70 }
  },
  guild: {
    id: 'guild',
    name: 'Цеховой пакт',
    mark: 'II',
    description: 'Больше деталей. Первый шаг среднего кольца в каждом цикле бесплатен.',
    start: { rations: 9, parts: 11, mandate: 4, integrity: 94, cohesion: 68 }
  },
  civic: {
    id: 'civic',
    name: 'Вольные кварталы',
    mark: 'III',
    description: 'Высокое сцепление. Полная цепь Совета даёт ещё 1 мандат.',
    start: { rations: 9, parts: 6, mandate: 8, integrity: 90, cohesion: 82 }
  }
});

export const PROJECTS = Object.freeze([
  {
    id: 'ring-drive',
    name: 'Кольцевой привод',
    numeral: '01',
    cost: { parts: 8, mandate: 5 },
    description: 'Добавляет 1 команду в каждом следующем цикле.'
  },
  {
    id: 'hanging-terraces',
    name: 'Висячие террасы',
    numeral: '02',
    cost: { rations: 8, parts: 6 },
    description: 'Полные жилые цепи дают ещё 1 паёк; сразу +8 сцепления.'
  },
  {
    id: 'storm-needle',
    name: 'Игла бури',
    numeral: '03',
    cost: { parts: 10, mandate: 5 },
    description: 'Каждый неприкрытый удар бури слабее на 2.'
  },
  {
    id: 'civic-archive',
    name: 'Гражданский архив',
    numeral: '04',
    cost: { rations: 7, mandate: 8 },
    description: 'Полные цепи Совета дают ещё 1 мандат и 1 сцепление.'
  },
  {
    id: 'white-wall',
    name: 'Белая стена',
    numeral: '05',
    cost: { parts: 12, mandate: 8 },
    description: 'Бастионы прикрывают соседние лучи; сразу +16 целостности.'
  }
]);

export const EVENTS = Object.freeze([
  {
    id: 'night-line',
    eyebrow: 'НОЧНАЯ ОЧЕРЕДЬ',
    title: 'У зерновых ворот собрались три кольца людей.',
    text: 'Запасов хватит, но слух о пустых складах уже звучит убедительнее правды.',
    choices: [
      {
        id: 'open',
        label: 'Открыть склады',
        detail: '−3 пайка · +10 сцепления',
        requires: { rations: 3 },
        effects: { rations: -3, cohesion: 10 },
        result: 'Очередь разошлась до рассвета. Город запомнил жест.'
      },
      {
        id: 'tokens',
        label: 'Ввести жетоны',
        detail: '+2 мандата · −4 сцепления',
        effects: { mandate: 2, cohesion: -4 },
        result: 'Учёт победил панику, но не сделал людей добрее.'
      }
    ]
  },
  {
    id: 'underfloor-hum',
    eyebrow: 'ГУЛ ПОД ПЛИТАМИ',
    title: 'Центральный маховик вошёл в опасный резонанс.',
    text: 'Инженеры предлагают заглушить привод или выжать из дрожи несколько ящиков деталей.',
    choices: [
      {
        id: 'quiet',
        label: 'Глушить привод',
        detail: '−2 детали · +7 целостности',
        requires: { parts: 2 },
        effects: { parts: -2, integrity: 7 },
        result: 'Гул стих. На несколько часов город снова стал похож на дом.'
      },
      {
        id: 'harvest',
        label: 'Снять перегрузку',
        detail: '+4 детали · −6 целостности',
        effects: { parts: 4, integrity: -6 },
        result: 'Цеха получили металл. Стены — ещё одну трещину.'
      }
    ]
  },
  {
    id: 'nameless-choir',
    eyebrow: 'БЕЗЫМЯННЫЙ ХОР',
    title: 'В переходах запели одну и ту же песню.',
    text: 'Никто не знает слов, но ритм совпадает с поворотом колец до доли секунды.',
    choices: [
      {
        id: 'listen',
        label: 'Оставить песню людям',
        detail: '+9 сцепления · −1 мандат',
        requires: { mandate: 1 },
        effects: { cohesion: 9, mandate: -1 },
        result: 'Ночью весь Свод дышал в одном ритме.'
      },
      {
        id: 'record',
        label: 'Записать ритм',
        detail: '+4 мандата · +1 сцепление',
        effects: { mandate: 4, cohesion: 1 },
        result: 'Архивисты превратили чудо в рабочий протокол.'
      }
    ]
  },
  {
    id: 'glass-foundlings',
    eyebrow: 'ЛЮДИ ИЗ БУРИ',
    title: 'За внешней стеной нашли группу без знаков города.',
    text: 'Они знают маршруты стеклянных фронтов и просят только тёплый сектор.',
    choices: [
      {
        id: 'welcome',
        label: 'Принять в кварталы',
        detail: '−2 пайка · +8 сцепления',
        requires: { rations: 2 },
        effects: { rations: -2, cohesion: 8 },
        result: 'Новые семьи быстро перестали быть новыми.'
      },
      {
        id: 'survey',
        label: 'Нанять проводниками',
        detail: '+3 мандата · −2 сцепления',
        effects: { mandate: 3, cohesion: -2 },
        result: 'Они остались за стеной, но оставили точные карты.'
      }
    ]
  },
  {
    id: 'split-cistern',
    eyebrow: 'ТРЕСНУВШАЯ ЦИСТЕРНА',
    title: 'Вода проступила между плитами внутреннего кольца.',
    text: 'Можно быстро запаять шов или собрать осадок, который ценят литейщики.',
    choices: [
      {
        id: 'seal',
        label: 'Запаять шов',
        detail: '−3 детали · ремонт случайного сектора',
        requires: { parts: 3 },
        effects: { parts: -3 },
        special: 'repair',
        result: 'Ремонтники прошли дальше цистерны и закрыли старую трещину.'
      },
      {
        id: 'skim',
        label: 'Собрать осадок',
        detail: '+4 детали · повреждение внутреннего кольца',
        effects: { parts: 4 },
        special: 'damage-inner',
        result: 'Литейщики довольны. Конденсеры — категорически нет.'
      }
    ]
  },
  {
    id: 'silent-shift',
    eyebrow: 'ТИХАЯ СМЕНА',
    title: 'Одна бригада отказалась покидать рабочие места.',
    text: 'Они требуют признать смену самостоятельной гильдией — прямо перед фронтом бури.',
    choices: [
      {
        id: 'recognise',
        label: 'Признать гильдию',
        detail: '−2 мандата · +7 сцепления · +2 детали',
        requires: { mandate: 2 },
        effects: { mandate: -2, cohesion: 7, parts: 2 },
        result: 'Новая печать появилась раньше нового устава.'
      },
      {
        id: 'replace',
        label: 'Сменить бригаду',
        detail: '+2 мандата · −6 сцепления',
        effects: { mandate: 2, cohesion: -6 },
        result: 'Смена закончилась. Спор — нет.'
      }
    ]
  }
]);

const RING_BLUEPRINTS = Object.freeze([
  ['condenser', 'condenser', 'condenser', 'dynamo', 'dynamo', 'dynamo', 'forum', 'forum'],
  ['garden', 'garden', 'garden', 'forge', 'forge', 'forge', 'guild', 'guild'],
  ['habitat', 'habitat', 'habitat', 'bastion', 'bastion', 'bastion', 'council', 'council']
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function modulo(value, divisor = SLOT_COUNT) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function random(state) {
  state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}

function randomInt(state, minimum, maximumInclusive) {
  return minimum + Math.floor(random(state) * (maximumInclusive - minimum + 1));
}

function shuffle(state, source) {
  const result = [...source];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(state, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function generateStormTargets(state, cycle = state.cycle) {
  const count = cycle >= TOTAL_CYCLES ? 4 : cycle >= 10 ? 3 : cycle >= 5 ? 2 : 1;
  const candidates = shuffle(state, Array.from({ length: SLOT_COUNT }, (_, index) => index));
  return candidates.slice(0, count).sort((a, b) => a - b);
}

function createSector(kind, ring, index) {
  return {
    uid: `${ring}-${index}-${kind}`,
    kind,
    damage: 0
  };
}

function capResources(resources) {
  for (const key of ['rations', 'parts', 'mandate']) {
    resources[key] = clamp(Math.round(resources[key]), 0, RESOURCE_CAP);
  }
}

function capStats(state) {
  state.integrity = clamp(Math.round(state.integrity), 0, STAT_CAP);
  state.cohesion = clamp(Math.round(state.cohesion), 0, STAT_CAP);
  capResources(state.resources);
}

function hasProject(state, id) {
  return state.projects.includes(id);
}

export function createGame(seed, charterId = 'water') {
  const normalizedSeed = String(seed || 'SVOD01').trim().toUpperCase().slice(0, 12) || 'SVOD01';
  const charter = CHARTERS[charterId] || CHARTERS.water;
  const state = {
    schema: 1,
    seed: normalizedSeed,
    rngState: hashSeed(normalizedSeed),
    charter: charter.id,
    cycle: 1,
    totalCycles: TOTAL_CYCLES,
    rings: [],
    offsets: [0, 0, 0],
    resources: {
      rations: charter.start.rations,
      parts: charter.start.parts,
      mandate: charter.start.mandate
    },
    integrity: charter.start.integrity,
    cohesion: charter.start.cohesion,
    command: 3,
    maxCommand: 3,
    actionUsed: false,
    freeMiddleUsed: false,
    brace: 0,
    projects: [],
    stormTargets: [],
    phase: 'playing',
    pendingEvent: null,
    lastResolution: null,
    lastEventResult: null,
    outcome: null,
    history: [],
    stats: {
      rotations: 0,
      fullChains: 0,
      stormsBlocked: 0,
      damageTaken: 0,
      projectsBuilt: 0
    }
  };

  state.rings = RING_BLUEPRINTS.map((blueprint, ring) => {
    return shuffle(state, blueprint).map((kind, index) => createSector(kind, ring, index));
  });

  let attempts = 0;
  do {
    state.offsets = [
      randomInt(state, 0, SLOT_COUNT - 1),
      randomInt(state, 0, SLOT_COUNT - 1),
      randomInt(state, 0, SLOT_COUNT - 1)
    ];
    attempts += 1;
  } while (evaluateBoard(state).partialChains.length < 2 && attempts < 24);

  const grazedOuter = state.rings[2][randomInt(state, 0, SLOT_COUNT - 1)];
  grazedOuter.damage = 1;
  state.stormTargets = generateStormTargets(state, 1);
  return state;
}

export function sectorAt(state, ring, spoke, offsets = state.offsets) {
  const sourceIndex = modulo(spoke - offsets[ring]);
  return state.rings[ring][sourceIndex];
}

export function locateSector(state, uid) {
  for (let ring = 0; ring < RING_COUNT; ring += 1) {
    const index = state.rings[ring].findIndex((sector) => sector.uid === uid);
    if (index !== -1) {
      return {
        ring,
        index,
        spoke: modulo(index + state.offsets[ring]),
        sector: state.rings[ring][index]
      };
    }
  }
  return null;
}

export function chainAt(state, spoke, offsets = state.offsets) {
  const sectors = [0, 1, 2].map((ring) => sectorAt(state, ring, spoke, offsets));
  const types = sectors.map((sector) => SECTOR_TYPES[sector.kind]);
  const intactInner = sectors[0].damage < 2;
  const intactMiddle = sectors[1].damage < 2;
  const intactOuter = sectors[2].damage < 2;
  const middleActive = intactInner && intactMiddle && types[0].output === types[1].input;
  const outerActive = middleActive && intactOuter && types[1].output === types[2].input;
  const wear = Math.max(...sectors.map((sector) => sector.damage));
  return {
    spoke,
    sectors,
    types,
    middleActive,
    outerActive,
    wear,
    carrier: middleActive ? types[1].output : types[0].output,
    effect: outerActive ? types[2].effect : null
  };
}

export function evaluateBoard(state, offsets = state.offsets) {
  const result = {
    rations: 0,
    parts: 0,
    mandate: 0,
    cohesion: 0,
    partialChains: [],
    fullChains: [],
    shieldSpokes: [],
    spokes: []
  };

  for (let spoke = 0; spoke < SLOT_COUNT; spoke += 1) {
    const chain = chainAt(state, spoke, offsets);
    result.spokes.push(chain);
    if (!chain.middleActive) continue;

    result.partialChains.push(spoke);
    const middleYield = chain.wear > 0 ? 1 : 2;
    if (chain.types[1].output === 'ration') {
      result.rations += middleYield + (state.charter === 'water' ? 1 : 0);
    }
    if (chain.types[1].output === 'parts') result.parts += middleYield;
    if (chain.types[1].output === 'mandate') result.mandate += Math.max(1, middleYield - 1);

    if (!chain.outerActive) continue;
    result.fullChains.push({ spoke, effect: chain.effect, wear: chain.wear });
    if (chain.effect === 'habitat') {
      result.rations += 2 + (hasProject(state, 'hanging-terraces') ? 1 : 0);
      result.cohesion += chain.wear > 0 ? 1 : 2;
    }
    if (chain.effect === 'bastion') {
      result.parts += 1;
      result.shieldSpokes.push(spoke);
    }
    if (chain.effect === 'council') {
      result.mandate += 1
        + (state.charter === 'civic' ? 1 : 0)
        + (hasProject(state, 'civic-archive') ? 1 : 0);
      result.cohesion += hasProject(state, 'civic-archive') ? 2 : 1;
    }
  }

  return result;
}

export function createTutorialScenario() {
  let best = null;

  for (let attempt = 1; attempt <= 192; attempt += 1) {
    const state = createGame(`DRILL${String(attempt).padStart(3, '0')}`, 'water');
    for (const sector of state.rings.flat()) sector.damage = 0;
    state.resources = { rations: 30, parts: 30, mandate: 30 };
    state.integrity = 100;
    state.cohesion = 90;

    const before = evaluateBoard(state);
    for (let ring = 0; ring < RING_COUNT; ring += 1) {
      for (const steps of [-1, 1]) {
        const offsets = [...state.offsets];
        offsets[ring] = modulo(offsets[ring] + steps);
        const after = evaluateBoard(state, offsets);
        const fullGain = after.fullChains.length - before.fullChains.length;
        const shieldGain = after.shieldSpokes.length - before.shieldSpokes.length;
        const partialGain = after.partialChains.length - before.partialChains.length;
        if (fullGain < 1) continue;

        const score = fullGain * 100 + shieldGain * 25 + partialGain * 4 - ring;
        if (!best || score > best.score) {
          best = { state, ring, steps, before, after, score };
        }
      }
    }
    if (best?.after.shieldSpokes.length > best.before.shieldSpokes.length) break;
  }

  if (!best) throw new Error('Не удалось собрать учебную карту.');
  const newShield = best.after.shieldSpokes.find((spoke) => !best.before.shieldSpokes.includes(spoke));
  const newChain = best.after.fullChains.find(({ spoke }) => (
    !best.before.fullChains.some((entry) => entry.spoke === spoke)
  ));
  best.state.stormTargets = [newShield ?? newChain?.spoke ?? best.after.fullChains[0].spoke];

  return {
    game: best.state,
    move: { ring: best.ring, steps: best.steps },
    before: {
      partialChains: best.before.partialChains.length,
      fullChains: best.before.fullChains.length,
      shields: best.before.shieldSpokes.length
    },
    after: {
      partialChains: best.after.partialChains.length,
      fullChains: best.after.fullChains.length,
      shields: best.after.shieldSpokes.length
    }
  };
}

export function rotationCost(state, ring, steps) {
  const distance = Math.abs(Math.trunc(steps));
  if (distance === 0) return 0;
  const freeStep = state.charter === 'guild' && ring === 1 && !state.freeMiddleUsed ? 1 : 0;
  return Math.max(0, distance - freeStep);
}

export function rotateRing(state, ring, steps) {
  if (state.phase !== 'playing') return { ok: false, reason: 'Сейчас кольца заблокированы.' };
  if (!Number.isInteger(ring) || ring < 0 || ring >= RING_COUNT) return { ok: false, reason: 'Неизвестное кольцо.' };
  const normalizedSteps = clamp(Math.trunc(steps), -SLOT_COUNT + 1, SLOT_COUNT - 1);
  if (normalizedSteps === 0) return { ok: false, reason: 'Кольцо осталось на месте.' };
  const cost = rotationCost(state, ring, normalizedSteps);
  if (cost > state.command) return { ok: false, reason: `Нужно команд: ${cost}. Доступно: ${state.command}.` };

  state.offsets[ring] = modulo(state.offsets[ring] + normalizedSteps);
  state.command -= cost;
  state.stats.rotations += Math.abs(normalizedSteps);
  if (state.charter === 'guild' && ring === 1 && !state.freeMiddleUsed) state.freeMiddleUsed = true;
  return { ok: true, cost, steps: normalizedSteps };
}

function canAfford(resources, cost = {}) {
  return Object.entries(cost).every(([key, value]) => (resources[key] || 0) >= value);
}

function spend(resources, cost = {}) {
  for (const [key, value] of Object.entries(cost)) resources[key] -= value;
}

export function projectAvailability(state, projectId) {
  const project = PROJECTS.find((entry) => entry.id === projectId);
  if (!project) return { ok: false, reason: 'Проект не найден.' };
  if (state.phase !== 'playing') return { ok: false, reason: 'Сейчас нельзя начинать проект.' };
  if (state.actionUsed) return { ok: false, reason: 'Городское дело в этом цикле уже исполнено.' };
  if (hasProject(state, projectId)) return { ok: false, reason: 'Проект уже завершён.' };
  if (!canAfford(state.resources, project.cost)) return { ok: false, reason: 'Не хватает запасов.' };
  return { ok: true, project };
}

export function buildProject(state, projectId) {
  const availability = projectAvailability(state, projectId);
  if (!availability.ok) return availability;
  const { project } = availability;
  spend(state.resources, project.cost);
  state.projects.push(project.id);
  state.actionUsed = true;
  state.stats.projectsBuilt += 1;
  if (project.id === 'ring-drive') {
    state.maxCommand += 1;
    state.command += 1;
  }
  if (project.id === 'hanging-terraces') state.cohesion += 8;
  if (project.id === 'white-wall') state.integrity += 16;
  capStats(state);
  return { ok: true, project };
}

export function orderAvailability(state, orderId, payload = {}) {
  if (state.phase !== 'playing') return { ok: false, reason: 'Сейчас нельзя отдавать приказ.' };
  if (state.actionUsed) return { ok: false, reason: 'Городское дело в этом цикле уже исполнено.' };

  if (orderId === 'repair') {
    const location = locateSector(state, payload.uid);
    if (!location) return { ok: false, reason: 'Сначала выбери повреждённый сектор.' };
    if (location.sector.damage <= 0) return { ok: false, reason: 'Этот сектор не повреждён.' };
    if (state.resources.parts < 3) return { ok: false, reason: 'Для ремонта нужны 3 детали.' };
    return { ok: true, location };
  }
  if (orderId === 'relief') {
    if (state.resources.rations < 3) return { ok: false, reason: 'Для выдачи нужны 3 пайка.' };
    if (state.cohesion >= STAT_CAP) return { ok: false, reason: 'Сцепление уже максимально.' };
    return { ok: true };
  }
  if (orderId === 'brace') {
    if (state.resources.parts < 2) return { ok: false, reason: 'Для распорок нужны 2 детали.' };
    return { ok: true };
  }
  if (orderId === 'overdrive') {
    if (state.integrity <= 12) return { ok: false, reason: 'Свод не выдержит форсаж.' };
    return { ok: true };
  }
  if (orderId === 'reroute') {
    if (state.resources.mandate < 2) return { ok: false, reason: 'Для переноса прогноза нужны 2 мандата.' };
    return { ok: true };
  }
  return { ok: false, reason: 'Неизвестный приказ.' };
}

export function enactOrder(state, orderId, payload = {}) {
  const availability = orderAvailability(state, orderId, payload);
  if (!availability.ok) return availability;

  if (orderId === 'repair') {
    state.resources.parts -= 3;
    availability.location.sector.damage -= 1;
  }
  if (orderId === 'relief') {
    state.resources.rations -= 3;
    state.cohesion += 10;
  }
  if (orderId === 'brace') {
    state.resources.parts -= 2;
    state.brace = 3;
  }
  if (orderId === 'overdrive') {
    state.integrity -= 5;
    state.command += 2;
  }
  if (orderId === 'reroute') {
    state.resources.mandate -= 2;
    state.stormTargets = generateStormTargets(state, state.cycle);
  }
  state.actionUsed = true;
  capStats(state);
  return { ok: true, orderId, ...availability };
}

function protectedByBastion(state, evaluation, spoke) {
  if (evaluation.shieldSpokes.includes(spoke)) return 'direct';
  if (!hasProject(state, 'white-wall')) return null;
  const left = modulo(spoke - 1);
  const right = modulo(spoke + 1);
  return evaluation.shieldSpokes.includes(left) || evaluation.shieldSpokes.includes(right) ? 'adjacent' : null;
}

function applyProduction(state, production) {
  state.resources.rations += production.rations;
  state.resources.parts += production.parts;
  state.resources.mandate += production.mandate;
  state.cohesion += production.cohesion;
  capStats(state);
}

function choosePendingEvent(state) {
  if (![2, 5, 8, 10].includes(state.cycle)) return null;
  const used = new Set(state.history.filter((entry) => entry.type === 'event').map((entry) => entry.id));
  const available = EVENTS.filter((event) => !used.has(event.id));
  const pool = available.length > 0 ? available : EVENTS;
  return pool[randomInt(state, 0, pool.length - 1)].id;
}

export function resolveCycle(state) {
  if (state.phase !== 'playing') return { ok: false, reason: 'Цикл уже завершён.' };

  const before = {
    resources: clone(state.resources),
    integrity: state.integrity,
    cohesion: state.cohesion
  };
  const evaluation = evaluateBoard(state);
  applyProduction(state, evaluation);

  const consumption = 4 + (state.cycle >= 9 ? 1 : 0);
  const paidRations = Math.min(state.resources.rations, consumption);
  const shortage = consumption - paidRations;
  state.resources.rations -= paidRations;
  if (shortage > 0) {
    state.cohesion -= shortage * 6;
    state.integrity -= shortage * 2;
  }

  const attacks = [];
  for (const spoke of state.stormTargets) {
    const protection = protectedByBastion(state, evaluation, spoke);
    let damage = 0;
    if (protection === 'direct') {
      state.stats.stormsBlocked += 1;
    } else {
      const baseDamage = 6 + Math.floor((state.cycle - 1) / 4) + randomInt(state, 0, 2) + (state.cycle === TOTAL_CYCLES ? 3 : 0);
      const projectReduction = hasProject(state, 'storm-needle') ? 2 : 0;
      const wallReduction = protection === 'adjacent' ? 4 : 0;
      damage = Math.max(1, baseDamage - projectReduction - wallReduction - state.brace);
      state.integrity -= damage;
      state.cohesion -= 1;
      state.stats.damageTaken += damage;

      const outerSector = sectorAt(state, 2, spoke);
      const previousDamage = outerSector.damage;
      const wearChance = protection === 'adjacent' ? 0.25 : 0.7;
      if (random(state) < wearChance) {
        outerSector.damage = Math.min(2, outerSector.damage + 1);
      }
      attacks.push({
        spoke,
        protection,
        damage,
        sector: SECTOR_TYPES[outerSector.kind].name,
        sectorDamage: outerSector.damage,
        sectorWorsened: outerSector.damage > previousDamage
      });
      continue;
    }

    const outerSector = sectorAt(state, 2, spoke);
    attacks.push({
      spoke,
      protection,
      damage,
      sector: SECTOR_TYPES[outerSector.kind].name,
      sectorDamage: outerSector.damage,
      sectorWorsened: false
    });
  }

  state.stats.fullChains += evaluation.fullChains.length;
  capStats(state);

  const after = {
    resources: clone(state.resources),
    integrity: state.integrity,
    cohesion: state.cohesion
  };
  state.lastResolution = {
    cycle: state.cycle,
    finalStorm: state.cycle === TOTAL_CYCLES,
    production: {
      rations: evaluation.rations,
      parts: evaluation.parts,
      mandate: evaluation.mandate,
      cohesion: evaluation.cohesion
    },
    partialChains: evaluation.partialChains.length,
    fullChains: evaluation.fullChains.length,
    consumption,
    shortage,
    attacks,
    before,
    after
  };

  state.pendingEvent = choosePendingEvent(state);
  state.history.push({
    type: 'cycle',
    cycle: state.cycle,
    chains: evaluation.fullChains.length,
    damage: before.integrity - after.integrity
  });

  const collapsed = state.integrity <= 0 || state.cohesion <= 0;
  if (collapsed || state.cycle >= TOTAL_CYCLES) {
    const prepared = state.projects.length >= 3;
    const won = !collapsed && prepared;
    state.phase = 'complete';
    state.outcome = {
      won,
      reason: collapsed
        ? state.integrity <= 0
          ? 'Стеклянная буря вскрыла центральный Свод.'
          : 'Кольца перестали считать себя одним городом.'
        : prepared
          ? 'Три великих проекта замкнули город перед Белой бурей.'
          : 'Белая буря пришла раньше, чем город завершил три проекта.'
    };
  } else {
    state.phase = 'resolution';
  }
  return { ok: true, resolution: state.lastResolution, outcome: state.outcome };
}

function beginNextCycle(state) {
  state.cycle += 1;
  state.command = state.maxCommand;
  state.actionUsed = false;
  state.freeMiddleUsed = false;
  state.brace = 0;
  state.pendingEvent = null;
  state.lastEventResult = null;
  state.stormTargets = generateStormTargets(state, state.cycle);
  state.phase = 'playing';
}

export function advanceFromResolution(state) {
  if (state.phase !== 'resolution') return { ok: false, reason: 'Нет ожидающего итога.' };
  if (state.pendingEvent) {
    state.phase = 'event';
    return { ok: true, event: EVENTS.find((entry) => entry.id === state.pendingEvent) };
  }
  beginNextCycle(state);
  return { ok: true, event: null };
}

function eventChoiceAvailability(state, choice) {
  if (!choice) return { ok: false, reason: 'Вариант не найден.' };
  if (!canAfford(state.resources, choice.requires)) return { ok: false, reason: 'Не хватает запасов.' };
  return { ok: true };
}

export function getCurrentEvent(state) {
  if (!state.pendingEvent) return null;
  return EVENTS.find((entry) => entry.id === state.pendingEvent) || null;
}

export function getEventChoiceAvailability(state, choiceId) {
  const event = getCurrentEvent(state);
  const choice = event?.choices.find((entry) => entry.id === choiceId);
  return eventChoiceAvailability(state, choice);
}

function applyEventSpecial(state, special) {
  if (special === 'repair') {
    const damaged = state.rings.flat().filter((sector) => sector.damage > 0);
    if (damaged.length > 0) {
      damaged[randomInt(state, 0, damaged.length - 1)].damage -= 1;
    } else {
      state.integrity += 4;
    }
  }
  if (special === 'damage-inner') {
    const candidates = state.rings[0].filter((sector) => sector.damage < 2);
    if (candidates.length > 0) candidates[randomInt(state, 0, candidates.length - 1)].damage += 1;
  }
}

export function applyEventChoice(state, choiceId) {
  if (state.phase !== 'event') return { ok: false, reason: 'Сейчас нет городского события.' };
  const event = getCurrentEvent(state);
  const choice = event?.choices.find((entry) => entry.id === choiceId);
  const availability = eventChoiceAvailability(state, choice);
  if (!availability.ok) return availability;

  for (const [key, value] of Object.entries(choice.effects || {})) {
    if (key in state.resources) state.resources[key] += value;
    else if (key === 'integrity' || key === 'cohesion') state[key] += value;
  }
  applyEventSpecial(state, choice.special);
  capStats(state);
  state.history.push({ type: 'event', id: event.id, choice: choice.id, cycle: state.cycle });
  state.lastEventResult = choice.result;
  if (state.integrity <= 0 || state.cohesion <= 0) {
    state.pendingEvent = null;
    state.phase = 'complete';
    state.outcome = {
      won: false,
      reason: state.integrity <= 0
        ? 'Последнее решение раскрыло трещину в центральном Своде.'
        : 'Последнее решение окончательно разорвало городское сцепление.'
    };
    return { ok: true, event, choice, outcome: state.outcome };
  }
  beginNextCycle(state);
  return { ok: true, event, choice };
}

export function isValidGame(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.schema !== 1 || typeof value.seed !== 'string') return false;
  if (!CHARTERS[value.charter]) return false;
  if (!Number.isInteger(value.cycle) || value.cycle < 1 || value.cycle > TOTAL_CYCLES) return false;
  if (!Array.isArray(value.rings) || value.rings.length !== RING_COUNT) return false;
  if (value.rings.some((ring) => !Array.isArray(ring) || ring.length !== SLOT_COUNT)) return false;
  if (!Array.isArray(value.offsets) || value.offsets.length !== RING_COUNT) return false;
  if (!value.resources || !['rations', 'parts', 'mandate'].every((key) => Number.isFinite(value.resources[key]))) return false;
  if (!['playing', 'resolution', 'event', 'complete'].includes(value.phase)) return false;
  return true;
}

export function describeForecast(state) {
  const count = state.stormTargets.length;
  if (state.cycle === TOTAL_CYCLES) return `Белая буря: под ударом ${count} луча`;
  return `Стеклянный фронт: под ударом ${count} ${count === 2 ? 'луча' : 'луча'}`;
}

export function formatCost(cost = {}) {
  const labels = { rations: 'пайка', parts: 'дет.', mandate: 'манд.' };
  return Object.entries(cost).map(([key, value]) => `${value} ${labels[key]}`).join(' · ');
}
