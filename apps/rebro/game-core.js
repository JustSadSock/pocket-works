export const DIRECTIONS = Object.freeze({
  N: Object.freeze({ x: 0, y: -1 }),
  E: Object.freeze({ x: 1, y: 0 }),
  S: Object.freeze({ x: 0, y: 1 }),
  W: Object.freeze({ x: -1, y: 0 })
});

export const PORTAL_PAIRS = Object.freeze({ A: 'B', B: 'A', C: 'D', D: 'C' });

export const PORTAL_META = Object.freeze({
  A: Object.freeze({ name: 'ЛАЗУРЬ', pair: 'I', color: '#28d7d0' }),
  B: Object.freeze({ name: 'ЯНТАРЬ', pair: 'I', color: '#ff9d32' }),
  C: Object.freeze({ name: 'ИРИС', pair: 'II', color: '#b68cff' }),
  D: Object.freeze({ name: 'МЯТА', pair: 'II', color: '#81e89b' })
});

const level = (data) => Object.freeze({
  portals: ['A', 'B'],
  crystals: [],
  blocks: [],
  parRuns: 2,
  ...data
});

export const LEVELS = Object.freeze([
  level({
    id: 1,
    title: 'ДВА РЕБРА',
    brief: 'Поставь пару ворот поперёк траектории и разверни выход к приёмнику.',
    width: 6,
    height: 5,
    emitter: { x: 0, y: 2, dir: 'E' },
    target: { x: 4, y: 0 },
    blocks: [{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 1, y: 4 }],
    sockets: ['v:2:2', 'h:4:2', 'v:4:2', 'h:2:1'],
    answer: {
      A: { slot: 'v:2:2', facing: 'E' },
      B: { slot: 'h:4:2', facing: 'N' }
    }
  }),
  level({
    id: 2,
    title: 'СВЕРХУ ВБОК',
    brief: 'Импульс может входить в ворота с любой стороны, но выходит только по стрелке.',
    width: 6,
    height: 5,
    emitter: { x: 2, y: 4, dir: 'N' },
    target: { x: 5, y: 1 },
    crystals: [{ x: 2, y: 3 }],
    blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 4 }],
    sockets: ['h:2:2', 'v:4:1', 'h:4:3', 'v:2:1', 'v:5:3'],
    answer: {
      A: { slot: 'h:2:2', facing: 'N' },
      B: { slot: 'v:4:1', facing: 'E' }
    }
  }),
  level({
    id: 3,
    title: 'ОБРАТНЫЙ ХОД',
    brief: 'Цвет входа не важен. Важны выбранное ребро и направление парного выхода.',
    width: 6,
    height: 5,
    emitter: { x: 5, y: 4, dir: 'W' },
    target: { x: 1, y: 0 },
    crystals: [{ x: 1, y: 1 }],
    blocks: [{ x: 0, y: 4 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
    sockets: ['v:3:4', 'h:1:3', 'h:4:1', 'v:2:2', 'h:0:2'],
    answer: {
      A: { slot: 'v:3:4', facing: 'W' },
      B: { slot: 'h:1:3', facing: 'N' }
    }
  }),
  level({
    id: 4,
    title: 'НИЖНИЙ КАНАЛ',
    brief: 'Сначала уведи импульс вниз, затем выброси его вдоль нижнего ряда.',
    width: 6,
    height: 6,
    emitter: { x: 0, y: 0, dir: 'S' },
    target: { x: 5, y: 4 },
    crystals: [{ x: 0, y: 2 }, { x: 4, y: 4 }],
    blocks: [{ x: 0, y: 5 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 0 }],
    sockets: ['h:0:3', 'v:3:4', 'v:2:1', 'h:4:4', 'v:4:3', 'h:1:2'],
    answer: {
      A: { slot: 'h:0:3', facing: 'S' },
      B: { slot: 'v:3:4', facing: 'E' }
    }
  }),
  level({
    id: 5,
    title: 'ПОМЕНЯТЬ МЕСТАМИ',
    brief: 'Иногда янтарные ворота удобнее использовать как вход, а лазурные — как выход.',
    width: 6,
    height: 5,
    emitter: { x: 5, y: 1, dir: 'W' },
    target: { x: 2, y: 1 },
    crystals: [{ x: 4, y: 1 }, { x: 2, y: 2 }],
    blocks: [{ x: 0, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 3 }],
    sockets: ['v:3:1', 'h:2:4', 'v:4:2', 'h:0:3', 'v:1:4'],
    answer: {
      B: { slot: 'v:3:1', facing: 'W' },
      A: { slot: 'h:2:4', facing: 'N' }
    }
  }),
  level({
    id: 6,
    title: 'ДЛИННАЯ ОСЬ',
    brief: 'Не ставь выход рядом с целью. Построй правильную ось и дай импульсу пройти её целиком.',
    width: 7,
    height: 6,
    emitter: { x: 3, y: 5, dir: 'N' },
    target: { x: 6, y: 3 },
    crystals: [{ x: 3, y: 3 }, { x: 4, y: 3 }],
    blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 5 }, { x: 6, y: 5 }],
    sockets: ['h:3:2', 'v:1:3', 'v:4:3', 'h:5:4', 'v:2:1', 'h:0:3'],
    answer: {
      A: { slot: 'h:3:2', facing: 'N' },
      B: { slot: 'v:1:3', facing: 'E' }
    }
  }),
  level({
    id: 7,
    title: 'ВТОРАЯ ПАРА',
    brief: 'Две пары ворот образуют маршрут из трёх прямых. Первая пара поднимает, вторая — выводит вправо.',
    width: 6,
    height: 6,
    portals: ['A', 'B', 'C', 'D'],
    emitter: { x: 0, y: 4, dir: 'E' },
    target: { x: 5, y: 2 },
    crystals: [{ x: 1, y: 1 }, { x: 4, y: 2 }],
    blocks: [{ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 3, y: 4 }],
    sockets: ['v:2:4', 'h:1:3', 'h:1:1', 'v:3:2', 'v:4:4', 'h:4:1', 'v:2:1'],
    answer: {
      A: { slot: 'v:2:4', facing: 'E' },
      B: { slot: 'h:1:3', facing: 'N' },
      C: { slot: 'h:1:1', facing: 'N' },
      D: { slot: 'v:3:2', facing: 'E' }
    }
  }),
  level({
    id: 8,
    title: 'ЗМЕЯ',
    brief: 'Начни со второй пары. Маршрут спускается, идёт влево и только потом поднимается к приёмнику.',
    width: 7,
    height: 6,
    portals: ['A', 'B', 'C', 'D'],
    emitter: { x: 6, y: 0, dir: 'S' },
    target: { x: 1, y: 0 },
    crystals: [{ x: 6, y: 1 }, { x: 3, y: 5 }, { x: 1, y: 2 }],
    blocks: [{ x: 0, y: 5 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 2, y: 0 }],
    sockets: ['h:6:2', 'v:4:5', 'v:2:5', 'h:1:3', 'h:4:2', 'v:5:1', 'v:3:4', 'h:2:1'],
    answer: {
      C: { slot: 'h:6:2', facing: 'S' },
      D: { slot: 'v:4:5', facing: 'W' },
      A: { slot: 'v:2:5', facing: 'W' },
      B: { slot: 'h:1:3', facing: 'N' }
    }
  }),
  level({
    id: 9,
    title: 'ТРИ СТЕНЫ',
    brief: 'Собери кристаллы на трёх разных осях. Ошибка в одном развороте отправит импульс в пустоту.',
    width: 7,
    height: 6,
    portals: ['A', 'B', 'C', 'D'],
    emitter: { x: 0, y: 1, dir: 'E' },
    target: { x: 0, y: 4 },
    crystals: [{ x: 2, y: 1 }, { x: 5, y: 3 }, { x: 1, y: 4 }],
    blocks: [{ x: 6, y: 1 }, { x: 5, y: 0 }, { x: 3, y: 4 }, { x: 4, y: 4 }],
    sockets: ['v:3:1', 'h:5:5', 'h:5:2', 'v:2:4', 'v:1:2', 'h:3:3', 'v:5:4', 'h:0:2'],
    answer: {
      A: { slot: 'v:3:1', facing: 'E' },
      B: { slot: 'h:5:5', facing: 'N' },
      C: { slot: 'h:5:2', facing: 'N' },
      D: { slot: 'v:2:4', facing: 'W' }
    }
  }),
  level({
    id: 10,
    title: 'СЛЕПАЯ ЗОНА',
    brief: 'Кристаллы показывают маршрут, но не порядок цветов. Выстрой две независимые пары без пересечения.',
    width: 7,
    height: 6,
    portals: ['A', 'B', 'C', 'D'],
    emitter: { x: 0, y: 5, dir: 'E' },
    target: { x: 0, y: 1 },
    crystals: [{ x: 1, y: 5 }, { x: 5, y: 3 }, { x: 1, y: 1 }],
    blocks: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 6, y: 5 }, { x: 6, y: 0 }],
    sockets: ['v:2:5', 'h:5:4', 'h:5:2', 'v:3:1', 'v:4:5', 'h:2:3', 'v:5:1', 'h:0:4'],
    answer: {
      A: { slot: 'v:2:5', facing: 'E' },
      B: { slot: 'h:5:4', facing: 'N' },
      C: { slot: 'h:5:2', facing: 'N' },
      D: { slot: 'v:3:1', facing: 'W' }
    }
  }),
  level({
    id: 11,
    title: 'ПЕРИМЕТР',
    brief: 'Маршрут проходит по трём сторонам камеры. Дальние ворота могут быть важнее ближайших.',
    width: 7,
    height: 6,
    portals: ['A', 'B', 'C', 'D'],
    emitter: { x: 6, y: 5, dir: 'W' },
    target: { x: 6, y: 0 },
    crystals: [{ x: 5, y: 5 }, { x: 1, y: 3 }, { x: 5, y: 0 }],
    blocks: [{ x: 0, y: 5 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 0, y: 0 }],
    sockets: ['v:4:5', 'h:1:5', 'h:1:2', 'v:4:0', 'v:2:3', 'h:5:3', 'v:5:4', 'h:3:1'],
    answer: {
      A: { slot: 'v:4:5', facing: 'W' },
      B: { slot: 'h:1:5', facing: 'N' },
      C: { slot: 'h:1:2', facing: 'N' },
      D: { slot: 'v:4:0', facing: 'E' }
    }
  }),
  level({
    id: 12,
    title: 'РЕБРО КАМЕРЫ',
    brief: 'Финальная схема: длинный нижний ход, подъём по правой стене и резкий выброс к центру.',
    width: 7,
    height: 7,
    portals: ['A', 'B', 'C', 'D'],
    emitter: { x: 0, y: 6, dir: 'E' },
    target: { x: 0, y: 2 },
    crystals: [{ x: 1, y: 6 }, { x: 6, y: 2 }, { x: 1, y: 2 }],
    blocks: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 0 }],
    sockets: ['v:3:6', 'h:6:4', 'h:6:1', 'v:3:2', 'v:5:6', 'h:4:3', 'v:2:4', 'h:1:5', 'v:4:1'],
    answer: {
      C: { slot: 'v:3:6', facing: 'E' },
      D: { slot: 'h:6:4', facing: 'N' },
      A: { slot: 'h:6:1', facing: 'N' },
      B: { slot: 'v:3:2', facing: 'W' }
    },
    parRuns: 3
  })
]);

export function parseSlot(slotId) {
  const match = /^(h|v):(\d+):(\d+)$/.exec(String(slotId));
  if (!match) throw new TypeError(`Invalid slot: ${slotId}`);
  return { axis: match[1], x: Number(match[2]), y: Number(match[3]) };
}

export function slotCenter(slotId) {
  const slot = parseSlot(slotId);
  return slot.axis === 'v'
    ? { x: slot.x, y: slot.y + 0.5 }
    : { x: slot.x + 0.5, y: slot.y };
}

export function validFacings(slotId) {
  return parseSlot(slotId).axis === 'v' ? ['E', 'W'] : ['N', 'S'];
}

export function defaultFacing(slotId) {
  return validFacings(slotId)[0];
}

export function flipFacing(slotId, facing) {
  const options = validFacings(slotId);
  return options[0] === facing ? options[1] : options[0];
}

export function edgeForMove(from, to) {
  if (to.x === from.x + 1 && to.y === from.y) return `v:${to.x}:${from.y}`;
  if (to.x === from.x - 1 && to.y === from.y) return `v:${from.x}:${from.y}`;
  if (to.y === from.y + 1 && to.x === from.x) return `h:${from.x}:${to.y}`;
  if (to.y === from.y - 1 && to.x === from.x) return `h:${from.x}:${from.y}`;
  throw new TypeError('Move must cross exactly one orthogonal edge');
}

export function portalExit(placement) {
  const slot = parseSlot(placement.slot);
  if (!validFacings(placement.slot).includes(placement.facing)) {
    throw new TypeError(`Facing ${placement.facing} is invalid for ${placement.slot}`);
  }
  if (slot.axis === 'v') {
    return placement.facing === 'E'
      ? { cell: { x: slot.x, y: slot.y }, edge: { x: slot.x, y: slot.y + 0.5 }, dir: 'E' }
      : { cell: { x: slot.x - 1, y: slot.y }, edge: { x: slot.x, y: slot.y + 0.5 }, dir: 'W' };
  }
  return placement.facing === 'S'
    ? { cell: { x: slot.x, y: slot.y }, edge: { x: slot.x + 0.5, y: slot.y }, dir: 'S' }
    : { cell: { x: slot.x, y: slot.y - 1 }, edge: { x: slot.x + 0.5, y: slot.y }, dir: 'N' };
}

export function isInside(levelData, cell) {
  return cell.x >= 0 && cell.y >= 0 && cell.x < levelData.width && cell.y < levelData.height;
}

export function isBlocked(levelData, cell) {
  return levelData.blocks.some((block) => block.x === cell.x && block.y === cell.y);
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function crystalKey(cell) {
  return `${cell.x},${cell.y}`;
}

export function validatePlacements(levelData, placements) {
  const missing = [];
  const occupied = new Map();
  for (const portalId of levelData.portals) {
    const placement = placements?.[portalId];
    if (!placement?.slot || !placement?.facing) {
      missing.push(portalId);
      continue;
    }
    if (!levelData.sockets.includes(placement.slot)) {
      return { ok: false, reason: 'unknown-slot', portalId };
    }
    if (!validFacings(placement.slot).includes(placement.facing)) {
      return { ok: false, reason: 'bad-facing', portalId };
    }
    if (occupied.has(placement.slot)) {
      return { ok: false, reason: 'duplicate-slot', portalId, otherPortalId: occupied.get(placement.slot) };
    }
    occupied.set(placement.slot, portalId);
  }
  if (missing.length) return { ok: false, reason: 'missing-portals', missing };
  return { ok: true };
}

export function simulate(levelData, placements, options = {}) {
  const validation = validatePlacements(levelData, placements);
  if (!validation.ok) return { status: 'invalid', ...validation, trace: [], collected: [] };

  const maxSteps = Number.isFinite(options.maxSteps) ? options.maxSteps : 96;
  const portalsBySlot = new Map();
  for (const portalId of levelData.portals) {
    portalsBySlot.set(placements[portalId].slot, portalId);
  }

  let cell = { x: levelData.emitter.x, y: levelData.emitter.y };
  let dir = levelData.emitter.dir;
  const collected = new Set();
  const trace = [{ kind: 'spawn', at: { x: cell.x + 0.5, y: cell.y + 0.5 }, cell: { ...cell } }];
  const visited = new Set();

  const collectAt = (position) => {
    for (const crystal of levelData.crystals) {
      if (sameCell(position, crystal)) collected.add(crystalKey(crystal));
    }
  };

  const success = () => sameCell(cell, levelData.target) && collected.size === levelData.crystals.length;
  collectAt(cell);
  if (success()) return { status: 'success', trace, collected: [...collected], steps: 0 };

  for (let step = 1; step <= maxSteps; step += 1) {
    const stateKey = `${cell.x},${cell.y},${dir}|${[...collected].sort().join(';')}`;
    if (visited.has(stateKey)) {
      return { status: 'loop', trace, collected: [...collected], steps: step - 1, cell, dir };
    }
    visited.add(stateKey);

    const vector = DIRECTIONS[dir];
    const next = { x: cell.x + vector.x, y: cell.y + vector.y };
    const crossedSlot = edgeForMove(cell, next);
    const entryPortalId = portalsBySlot.get(crossedSlot);

    if (entryPortalId) {
      const mateId = PORTAL_PAIRS[entryPortalId];
      const matePlacement = placements[mateId];
      const entryEdge = slotCenter(crossedSlot);
      const exit = portalExit(matePlacement);
      trace.push({
        kind: 'portal',
        portalId: entryPortalId,
        mateId,
        from: { x: cell.x + 0.5, y: cell.y + 0.5 },
        entry: entryEdge,
        exit: exit.edge,
        to: { x: exit.cell.x + 0.5, y: exit.cell.y + 0.5 }
      });
      if (!isInside(levelData, exit.cell)) {
        return { status: 'void', trace, collected: [...collected], steps: step, cell: exit.cell, dir: exit.dir };
      }
      if (isBlocked(levelData, exit.cell)) {
        return { status: 'blocked-exit', trace, collected: [...collected], steps: step, cell: exit.cell, dir: exit.dir };
      }
      cell = { ...exit.cell };
      dir = exit.dir;
      collectAt(cell);
    } else {
      trace.push({
        kind: 'move',
        from: { x: cell.x + 0.5, y: cell.y + 0.5 },
        to: { x: next.x + 0.5, y: next.y + 0.5 }
      });
      if (!isInside(levelData, next)) {
        return { status: 'void', trace, collected: [...collected], steps: step, cell: next, dir };
      }
      if (isBlocked(levelData, next)) {
        return { status: 'wall', trace, collected: [...collected], steps: step, cell: next, dir };
      }
      cell = next;
      collectAt(cell);
    }

    if (success()) return { status: 'success', trace, collected: [...collected], steps: step, cell, dir };
  }

  return { status: 'timeout', trace, collected: [...collected], steps: maxSteps, cell, dir };
}

export function scoreRun(levelData, runs, hintsUsed) {
  if (hintsUsed > 0) return 1;
  return runs <= levelData.parRuns ? 3 : 2;
}
