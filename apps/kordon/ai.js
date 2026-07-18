import {
  applyAction,
  cloneState,
  currentPlayer,
  hexDistance,
  legalActions,
  makeBoard,
  neighborsOf,
  parseCoord,
  signalCells,
  signalControl
} from './engine.js';

const STYLE_WEIGHTS = Object.freeze({
  adaptive: { score: 16, control: 7, distance: 1.1, support: 0.7, pressure: 0.55, danger: 0.8, material: 0.9, spread: 0.08 },
  assault: { score: 14, control: 5, distance: 0.9, support: 0.45, pressure: 1.15, danger: 0.95, material: 1.25, spread: -0.03 },
  formation: { score: 15, control: 6, distance: 0.95, support: 1.25, pressure: 0.45, danger: 1.15, material: 0.9, spread: 0.18 },
  frontier: { score: 15, control: 5.5, distance: 0.8, support: 0.95, pressure: 0.35, danger: 1.35, material: 0.8, spread: -0.05 }
});

export const AI_STYLES = Object.freeze([
  { id: 'adaptive', name: 'МАНЁВР', note: 'переключается между центром и охотой' },
  { id: 'assault', name: 'НАТИСК', note: 'ищет вилки и пленных' },
  { id: 'formation', name: 'СТРОЙ', note: 'держит связные группы' },
  { id: 'frontier', name: 'РУБЕЖ', note: 'бережёт фигуры и душит центр' }
]);

export function evaluateState(state, player, style = 'adaptive') {
  if (state.winner === player) return 1_000_000;
  if (state.winner === 1 - player) return -1_000_000;
  if (state.winner === -1) return 0;

  const weights = STYLE_WEIGHTS[style] || STYLE_WEIGHTS.adaptive;
  const boardSet = new Set(makeBoard(state.rules.radius));
  const signals = signalCells(state.rules.signalLayout).map(parseCoord);
  const control = signalControl(state);
  const own = new Set(state.positions[player]);
  const enemy = new Set(state.positions[1 - player]);

  const distance = [...own].reduce((sum, cell) => {
    const coord = parseCoord(cell);
    return sum + Math.min(...signals.map((signal) => hexDistance(coord, signal)));
  }, 0);
  const enemyDistance = [...enemy].reduce((sum, cell) => {
    const coord = parseCoord(cell);
    return sum + Math.min(...signals.map((signal) => hexDistance(coord, signal)));
  }, 0);

  let support = 0;
  let pressure = 0;
  let danger = 0;
  for (const cell of own) {
    const adjacent = neighborsOf(cell, boardSet);
    support += adjacent.filter((neighbor) => own.has(neighbor)).length;
    const attackers = adjacent.filter((neighbor) => enemy.has(neighbor)).length;
    const friends = adjacent.filter((neighbor) => own.has(neighbor)).length;
    if (attackers >= state.rules.captureThreshold - 1 && friends <= state.rules.supportLimit) danger += 1;
  }
  for (const cell of enemy) {
    pressure += neighborsOf(cell, boardSet).filter((neighbor) => own.has(neighbor)).length;
  }
  support /= 2;

  let spread = 0;
  const ownArray = [...own].map(parseCoord);
  for (let i = 0; i < ownArray.length; i += 1) {
    for (let j = i + 1; j < ownArray.length; j += 1) spread += hexDistance(ownArray[i], ownArray[j]);
  }

  const scoreGap = state.score[player] - state.score[1 - player];
  const controlGap = control[player] - control[1 - player];
  const materialGap = (state.positions[player].length - state.reserve[player])
    - (state.positions[1 - player].length - state.reserve[1 - player]);

  return (
    weights.score * scoreGap
    + weights.control * controlGap
    - weights.distance * distance
    + 0.28 * enemyDistance
    + weights.support * support
    + weights.pressure * pressure
    - weights.danger * danger
    + weights.material * materialGap
    - weights.spread * spread
  );
}

function scoreAction(state, action, player, style) {
  const next = applyAction(state, action, { skipValidation: true });
  let score = evaluateState(next, player, style);
  score += next.lastCaptured.length * (style === 'assault' ? 5.5 : 3.2);
  if (action.type === 'redeploy') score += style === 'formation' ? 1.2 : 0.35;
  const before = signalControl(state)[player];
  const after = signalControl(next)[player];
  score += (after - before) * 4;
  return { action, state: next, score };
}

export function rankActions(state, style = 'adaptive') {
  const player = currentPlayer(state);
  return legalActions(state)
    .map((action) => scoreAction(state, action, player, style))
    .sort((a, b) => b.score - a.score);
}

export function chooseAction(state, options = {}) {
  const style = STYLE_WEIGHTS[options.style] ? options.style : 'adaptive';
  const difficulty = options.difficulty || 'standard';
  const random = options.random || Math.random;
  const player = currentPlayer(state);
  const ranked = rankActions(state, style);
  if (!ranked.length) return null;

  if (difficulty === 'cadet') {
    const poolSize = Math.max(2, Math.ceil(ranked.length * 0.42));
    const pool = ranked.slice(0, poolSize);
    return pool[Math.floor(random() * pool.length)].action;
  }

  if (difficulty === 'standard') {
    const pool = ranked.slice(0, Math.min(4, ranked.length));
    const weighted = pool.map((entry, index) => ({ entry, weight: Math.max(1, 6 - index * 1.6) }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = random() * total;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.entry.action;
    }
    return pool[0].action;
  }

  const candidates = ranked.slice(0, Math.min(14, ranked.length));
  let best = null;
  for (const candidate of candidates) {
    if (candidate.state.winner === player) return candidate.action;
    const replies = rankActions(candidate.state, style).slice(0, 10);
    const worstReply = replies.length
      ? Math.min(...replies.map((reply) => evaluateState(reply.state, player, style)))
      : evaluateState(candidate.state, player, style);
    const value = candidate.score * 0.45 + worstReply * 0.55;
    if (!best || value > best.value) best = { action: candidate.action, value };
  }
  return best?.action || ranked[0].action;
}

export function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export function cloneForAnalysis(state) {
  return cloneState(state);
}
