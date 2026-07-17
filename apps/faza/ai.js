import {
  PHASES,
  applyMove,
  cloneState,
  getGroups,
  getLegalMoves,
  getLiberties,
  otherPlayer,
  resolveSwap,
  summarizePosition
} from './game.js';

export const AI_STYLES = Object.freeze({
  architect: {
    name: 'Архитектор',
    description: 'Строит цепи, устойчивые сразу в нескольких фазах.',
    weights: { connection: 3.2, capture: 1.25, defense: 1.5, liberties: 1.1, center: 0.35, resilience: 2.2 }
  },
  surgeon: {
    name: 'Хирург',
    description: 'Ищет фазу, в которой чужая группа внезапно остаётся без воздуха.',
    weights: { connection: 1.7, capture: 3.15, defense: 1.45, liberties: 1.55, center: 0.2, resilience: 0.8 }
  },
  warden: {
    name: 'Страж',
    description: 'Ломает угрозы, множит свободы и заставляет атаковать неудобно.',
    weights: { connection: 1.8, capture: 1.35, defense: 3.05, liberties: 2.1, center: 0.25, resilience: 1.35 }
  },
  adaptive: {
    name: 'Адаптивный',
    description: 'Меняет план по позиции: гонка, захват или вязкая оборона.',
    weights: { connection: 2.35, capture: 2.1, defense: 2.25, liberties: 1.55, center: 0.3, resilience: 1.55 }
  }
});

export const AI_LEVELS = Object.freeze({
  novice: { name: 'Ученик', description: 'Видит немедленные угрозы, но часто выбирает живой, неидеальный ход.' },
  tactician: { name: 'Тактик', description: 'Проверяет все ходы и уверенно наказывает одноходовые ошибки.' },
  oracle: { name: 'Оракул', description: 'Сравнивает лучшие ответы соперника и играет заметно жёстче.' }
});

function styleConfig(style) {
  return AI_STYLES[style] || AI_STYLES.adaptive;
}

function vulnerableGroups(state, player) {
  return getGroups(state.board, state.phase, player)
    .filter((group) => getLiberties(state.board, state.phase, group).size <= 1)
    .reduce((sum, group) => sum + group.size, 0);
}

export function evaluateState(state, player, style = 'adaptive') {
  const opponent = otherPlayer(player);
  if (state.winner === player) return 1_000_000 - state.turn;
  if (state.winner === opponent) return -1_000_000 + state.turn;
  if (state.draw) return 0;

  const own = summarizePosition(state, player);
  const enemy = summarizePosition(state, opponent);
  const weights = styleConfig(style).weights;
  const captureLead = state.captures[player] - state.captures[opponent];
  const ownVulnerable = vulnerableGroups(state, player);
  const enemyVulnerable = vulnerableGroups(state, opponent);
  const pending = (state.pending[player] ? 24 : 0) - (state.pending[opponent] ? 30 : 0);
  const phaseBreadth = PHASES.reduce((sum, phase) => {
    const probe = cloneState(state);
    probe.phase = phase.id;
    const report = summarizePosition(probe, player);
    return sum + Math.max(0, 4 - report.ownDistance);
  }, 0);

  return (
    (-own.ownDistance) * 3.2 * weights.connection +
    captureLead * 15 * weights.capture +
    own.enemyDistance * 1.8 * weights.defense +
    (own.ownLiberties - enemy.ownLiberties) * 0.42 * weights.liberties +
    (enemyVulnerable - ownVulnerable) * 2.7 * weights.capture +
    own.center * weights.center +
    (own.resilience - enemy.resilience) * 3.2 * weights.resilience +
    phaseBreadth * 0.55 * weights.resilience +
    pending
  );
}

function shuffled(items, rng) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function normalizeForSearch(state) {
  if (!state.swapAvailable) return state;
  return resolveSwap(state, false).state;
}

function scoreMoves(state, player, style, moves) {
  return moves.map((move) => {
    const result = applyMove(state, move);
    const next = normalizeForSearch(result.state);
    return {
      move,
      state: next,
      score: evaluateState(next, player, style)
    };
  }).sort((a, b) => b.score - a.score);
}

function weightedTop(scored, count, rng) {
  const top = scored.slice(0, Math.max(1, Math.min(count, scored.length)));
  const weights = top.map((_, index) => Math.max(1, top.length - index));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let index = 0; index < top.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return top[index].move;
  }
  return top[0].move;
}

export function chooseMove(state, options = {}) {
  const level = options.level || 'tactician';
  const style = options.style || 'adaptive';
  const rng = options.rng || Math.random;
  const legal = getLegalMoves(state);
  if (!legal.length) return null;
  const player = state.current;

  if (level === 'novice') {
    const sample = shuffled(legal, rng).slice(0, Math.min(24, legal.length));
    return weightedTop(scoreMoves(state, player, style, sample), 8, rng);
  }

  const scored = scoreMoves(state, player, style, legal);
  if (level === 'tactician') return weightedTop(scored, 3, rng);

  const finalists = scored.slice(0, Math.min(12, scored.length));
  const searched = finalists.map((candidate) => {
    if (candidate.state.winner || candidate.state.draw) return candidate;
    const replies = getLegalMoves(candidate.state);
    if (!replies.length) return candidate;
    const replySample = scoreMoves(
      candidate.state,
      candidate.state.current,
      style,
      shuffled(replies, rng).slice(0, Math.min(20, replies.length))
    ).slice(0, 5);
    let worstForPlayer = Infinity;
    for (const reply of replySample) {
      worstForPlayer = Math.min(worstForPlayer, evaluateState(reply.state, player, style));
    }
    return { ...candidate, score: candidate.score * 0.35 + worstForPlayer * 0.65 };
  }).sort((a, b) => b.score - a.score);

  return weightedTop(searched, 2, rng);
}

export function shouldSwap(state, options = {}) {
  if (!state.swapAvailable) return false;
  const style = options.style || 'adaptive';
  const rng = options.rng || Math.random;
  const asFirstColor = evaluateState(state, 1, style);
  const asSecondColor = evaluateState(state, 2, style);
  const threshold = options.level === 'novice' ? 4.5 : options.level === 'oracle' ? 0.5 : 2;
  return asFirstColor > asSecondColor + threshold + (rng() - 0.5) * 1.2;
}
