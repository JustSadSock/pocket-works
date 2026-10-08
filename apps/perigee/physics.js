export const WORLD_WIDTH = 1000;
export const STEP = 1 / 60;
export const MAX_STEPS = 600;

const RAW = [
  { name: 'ПЕРВЫЙ ИМПУЛЬС', sector: '01 / КРАЙ СИСТЕМЫ', brief: 'Один мир. Один точный манёвр.', start: [.15, .79], target: [.82, .24],
    planets: [[.49, .51, 110, 7, 'ember']] },
  { name: 'ТЯЖЁЛЫЙ СОСЕД', sector: '02 / ПРИЛИВ', brief: 'Притяжение меняет даже верный курс.', start: [.12, .76], target: [.83, .21],
    planets: [[.54, .48, 145, 12, 'jade']] },
  { name: 'ДВОЙНАЯ ТЕНЬ', sector: '03 / БЛИЗНЕЦЫ', brief: 'Обойди двух стражей орбиты.', start: [.14, .20], target: [.82, .77],
    planets: [[.48, .45, 125, 14, 'cerulean'], [.78, .42, 75, 3, 'ash']] },
  { name: 'ПАРАЛЛАКС', sector: '04 / РАЗЛОМ', brief: 'Лови свободный коридор.', start: [.18, .81], target: [.81, .18],
    planets: [[.45, .39, 139, 15, 'ochre'], [.77, .58, 79, 6, 'ice']] },
  { name: 'УЗКОЕ ОКНО', sector: '05 / ПЕРЕХВАТ', brief: 'Прямой путь закрыт. Ищи дугу.', start: [.13, .53], target: [.84, .33],
    planets: [[.49, .52, 150, 14, 'jade'], [.31, .19, 80, 8, 'ash'], [.71, .81, 95, 7, 'ember']] },
  { name: 'ПЕРИГЕЙ', sector: '06 / ПОСЛЕДНИЙ СИГНАЛ', brief: 'Используй всё, чему научился.', start: [.17, .83], target: [.82, .17],
    planets: [[.43, .59, 135, 14, 'cerulean'], [.70, .36, 120, 12, 'ochre']] }
];
export const STAGE_COUNT = RAW.length;

export function stageAt(index, worldHeight = 1780) {
  const i = Math.max(0, Math.min(RAW.length - 1, Math.trunc(index) || 0));
  const raw = RAW[i];
  return {
    index: i,
    name: raw.name, sector: raw.sector, brief: raw.brief,
    width: WORLD_WIDTH, height: worldHeight,
    start: { x: raw.start[0] * WORLD_WIDTH, y: raw.start[1] * worldHeight },
    target: { x: raw.target[0] * WORLD_WIDTH, y: raw.target[1] * worldHeight, radius: i === 4 ? 88 : 78 },
    planets: raw.planets.map(([x,y,r,m,kind],n) => ({
      id: n, x: x * WORLD_WIDTH, y: y * worldHeight,
      r, mass: m * 1e6, kind
    }))
  };
}

export function launchVector(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 24) return null;
  const speed = Math.min(970, Math.max(200, distance * 1.85));
  return { vx: dx / distance * speed, vy: dy / distance * speed, speed };
}

export function makeCraft(stage, vector) {
  return { x: stage.start.x, y: stage.start.y, vx: vector.vx, vy: vector.vy, elapsed: 0, steps: 0 };
}

// Symplectic Euler: fixed timestep and identical collision rules for simulation and prediction.
export function advanceCraft(craft, stage) {
  let ax = 0, ay = 0;
  for (const planet of stage.planets) {
    const dx = planet.x - craft.x;
    const dy = planet.y - craft.y;
    const softenedSq = dx * dx + dy * dy + 5500;
    const g = planet.mass / (softenedSq * Math.sqrt(softenedSq));
    ax += dx * g; ay += dy * g;
  }
  craft.vx += ax * STEP;
  craft.vy += ay * STEP;
  craft.x += craft.vx * STEP;
  craft.y += craft.vy * STEP;
  craft.elapsed += STEP;
  craft.steps += 1;
  for (const planet of stage.planets) {
    if (Math.hypot(craft.x - planet.x, craft.y - planet.y) < planet.r + 10) {
      return { type: 'impact', x: craft.x, y: craft.y, planet };
    }
  }
  if (Math.hypot(craft.x - stage.target.x, craft.y - stage.target.y) <= stage.target.radius) {
    return { type: 'dock', x: craft.x, y: craft.y };
  }
  if (craft.x < -125 || craft.x > stage.width + 125 ||
      craft.y < -145 || craft.y > stage.height + 145 || craft.steps >= MAX_STEPS) {
    return { type: 'lost', x: craft.x, y: craft.y };
  }
  return null;
}

export function predict(stage, vector) {
  if (!vector) return { path: [], event: null, duration: 0 };
  const craft = makeCraft(stage, vector);
  const path = [{ x: craft.x, y: craft.y }];
  let event = null;
  for (let i = 0; i < MAX_STEPS; i += 1) {
    event = advanceCraft(craft, stage);
    if ((i % 3 === 0) || event) path.push({ x: craft.x, y: craft.y });
    if (event) break;
  }
  return { path, event, duration: craft.elapsed };
}

export function safeReadProgress(input) {
  if (!input || typeof input !== 'object') return { unlocked: 1, best: {}, sound: true };
  const unlocked = Number.isFinite(input.unlocked) ? Math.max(1, Math.min(STAGE_COUNT, Math.floor(input.unlocked))) : 1;
  const best = {};
  if (input.best && typeof input.best === 'object') {
    for (let i = 0; i < STAGE_COUNT; i += 1) {
      const value = input.best[i];
      if (Number.isInteger(value) && value > 0 && value < 10000) best[i] = value;
    }
  }
  return { unlocked, best, sound: input.sound !== false };
}
