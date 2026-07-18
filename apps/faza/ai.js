import {
  CAPTURE_TARGET,
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
    description: 'Строит устойчивые цепи, но не отдаёт бесплатные захваты.',
    weights: { connection: 3.2, capture: 1.8, pressure: 1.35, defense: 1.65, liberties: 1.1, center: 0.35, resilience: 2.2 }
  },
  surgeon: {
    name: 'Хирург',
    description: 'Душит группы, создаёт фазовые ловушки и добивает при первой возможности.',
    weights: { connection: 1.65, capture: 4.6, pressure: 3.45, defense: 1.65, liberties: 1.45, center: 0.18, resilience: 0.8 }
  },
  warden: {
    name: 'Страж',
    description: 'Закрывает свои слабости, ломает угрозы и отвечает контрзахватом.',
    weights: { connection: 1.8, capture: 2.15, pressure: 1.55, defense: 3.25, liberties: 2.15, center: 0.24, resilience: 1.4 }
  },
  adaptive: {
    name: 'Адаптивный',
    description: 'Переключается между путём и охотой, предпочитая конкретное тактическое преимущество.',
    weights: { connection: 2.3, capture: 3.0, pressure: 2.35, defense: 2.45, liberties: 1.5, center: 0.28, resilience: 1.5 }
  }
});

export const AI_LEVELS = Object.freeze({
  novice: { name: 'Ученик', description: 'Берёт очевидные камни и видит прямые угрозы, но играет неровно.' },
  tactician: { name: 'Тактик', description: 'Приоритетно захватывает, создаёт удушение и проверяет немедленный ответ.' },
  oracle: { name: 'Оракул', description: 'Сравнивает жёсткие ответы соперника и избегает красивых, но проигрывающих атак.' }
});

function styleConfig(style) {
  return AI_STYLES[style] || AI_STYLES.adaptive;
}

function currentHealth(state, player) {
  const report = { atariStones: 0, crampedStones: 0, liberties: 0, groups: 0 };
  for (const group of getGroups(state.board, state.phase, player)) {
    const liberties = getLiberties(state.board, state.phase, group).size;
    report.groups += 1;
    report.liberties += liberties;
    if (liberties === 1) report.atariStones += group.size;
    else if (liberties === 2) report.crampedStones += group.size;
  }
  return report;
}

function phaseFragility(state, player) {
  const report = { zero: 0, atari: 0, cramped: 0, exposedPhases: 0 };
  for (const phase of PHASES) {
    let exposed = false;
    for (const group of getGroups(state.board, phase.id, player)) {
      const liberties = getLiberties(state.board, phase.id, group).size;
      if (liberties === 0) {
        report.zero += group.size;
        exposed = true;
      } else if (liberties === 1) {
        report.atari += group.size;
        exposed = true;
      } else if (liberties === 2) {
        report.cramped += Math.min(group.size, 3);
      }
    }
    if (exposed) report.exposedPhases += 1;
  }
  return report;
}

function pressureValue(report) {
  return report.zero * 11 + report.atari * 4.2 + report.cramped * 0.7 + report.exposedPhases * 2.5;
}

export function analyzeTacticalState(state, player) {
  const opponent = otherPlayer(player);
  return {
    ownHealth: currentHealth(state, player),
    enemyHealth: currentHealth(state, opponent),
    ownFragility: phaseFragility(state, player),
    enemyFragility: phaseFragility(state, opponent)
  };
}

export function evaluateState(state, player, style = 'adaptive', tacticalReport = null) {
  const opponent = otherPlayer(player);
  if (state.winner === player) return 1_000_000 - state.turn;
  if (state.winner === opponent) return -1_000_000 + state.turn;
  if (state.draw) return 0;

  const own = summarizePosition(state, player);
  const enemy = summarizePosition(state, opponent);
  const weights = styleConfig(style).weights;
  const captureLead = state.captures[player] - state.captures[opponent];
  const tactical = tacticalReport || analyzeTacticalState(state, player);
  const pending = (state.pending[player] ? 34 : 0) - (state.pending[opponent] ? 42 : 0);
  const phaseBreadth = PHASES.reduce((sum, phase) => {
    const probe = cloneState(state);
    probe.phase = phase.id;
    const report = summarizePosition(probe, player);
    return sum + Math.max(0, 4 - report.ownDistance);
  }, 0);
  const pressureLead = pressureValue(tactical.enemyFragility) - pressureValue(tactical.ownFragility);
  const currentAtariLead = tactical.enemyHealth.atariStones - tactical.ownHealth.atariStones;

  return (
    (-own.ownDistance) * 3.25 * weights.connection +
    captureLead * 24 * weights.capture +
    own.enemyDistance * 1.9 * weights.defense +
    (own.ownLiberties - enemy.ownLiberties) * 0.38 * weights.liberties +
    currentAtariLead * 4.8 * weights.pressure +
    pressureLead * 1.55 * weights.pressure +
    own.center * weights.center +
    (own.resilience - enemy.resilience) * 3.1 * weights.resilience +
    phaseBreadth * 0.5 * weights.resilience +
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

function candidateFeatures(before, next, player, beforeTactical, afterTactical) {
  const opponent = otherPlayer(player);
  const captured = next.captures[player] - before.captures[player];
  return {
    captured,
    winning: next.winner === player,
    losing: next.winner === opponent,
    brokePath: Boolean(before.pending[opponent] && !next.pending[opponent]),
    madePath: Boolean(!before.pending[player] && next.pending[player]),
    enemyAtariGain: afterTactical.enemyHealth.atariStones - beforeTactical.enemyHealth.atariStones,
    ownAtariSaved: beforeTactical.ownHealth.atariStones - afterTactical.ownHealth.atariStones,
    pressureGain: pressureValue(afterTactical.enemyFragility) - pressureValue(beforeTactical.enemyFragility),
    selfPressureChange: pressureValue(beforeTactical.ownFragility) - pressureValue(afterTactical.ownFragility)
  };
}

function tacticalBonus(features, weights, capturesBefore) {
  const captureProgress = capturesBefore + features.captured;
  const captureFinish = captureProgress >= CAPTURE_TARGET ? 500_000 : captureProgress === CAPTURE_TARGET - 1 ? features.captured * 55 : 0;
  return (
    features.captured * 72 * weights.capture +
    features.captured * features.captured * 22 * weights.capture +
    captureFinish +
    Math.max(0, features.enemyAtariGain) * 9 * weights.pressure +
    Math.max(0, features.pressureGain) * 3.2 * weights.pressure +
    Math.max(0, features.ownAtariSaved) * 12 * weights.defense +
    Math.max(0, features.selfPressureChange) * 2.6 * weights.defense +
    (features.brokePath ? 95 * weights.defense : 0) +
    (features.madePath ? 54 * weights.connection : 0) -
    Math.max(0, -features.ownAtariSaved) * 10 * weights.defense -
    Math.max(0, -features.selfPressureChange) * 2.4 * weights.defense
  );
}

function scoreMoves(state, player, style, moves) {
  const weights = styleConfig(style).weights;
  const beforeTactical = analyzeTacticalState(state, player);
  return moves.map((move) => {
    const result = applyMove(state, move);
    if (!result.ok) return null;
    const next = normalizeForSearch(result.state);
    const afterTactical = analyzeTacticalState(next, player);
    const features = candidateFeatures(state, next, player, beforeTactical, afterTactical);
    return {
      move,
      state: next,
      features,
      score: evaluateState(next, player, style, afterTactical) + tacticalBonus(features, weights, state.captures[player])
    };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

function bestImmediateReply(state, protectedPlayer, style) {
  if (state.winner || state.draw) return { winning: false, captured: 0, score: 0 };
  const replyPlayer = state.current;
  const moves = getLegalMoves(state);
  let worst = { winning: false, captured: 0, score: 0 };
  for (const move of moves) {
    const result = applyMove(state, move);
    if (!result.ok) continue;
    const captured = result.state.captures[replyPlayer] - state.captures[replyPlayer];
    const winning = result.state.winner === replyPlayer;
    const endangered = currentHealth(result.state, protectedPlayer).atariStones;
    const score = (winning ? 1_000_000 : 0) + captured * 105 + endangered * 8 + (result.state.pending[replyPlayer] ? 24 : 0);
    if (score > worst.score) worst = { winning, captured, score };
  }
  return worst;
}

function enrichReplyRisk(scored, player, style) {
  const weights = styleConfig(style).weights;
  return scored.map((candidate) => {
    const reply = bestImmediateReply(candidate.state, player, style);
    const penalty = (reply.winning ? 700_000 : 0) + reply.captured * 82 * weights.defense + reply.score * 0.06 * weights.defense;
    return { ...candidate, reply, score: candidate.score - penalty };
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

function preferConcreteCapture(scored, margin = 28) {
  if (!scored.length) return null;
  const best = scored[0];
  const capture = scored.find((candidate) => candidate.features.captured > 0 && !candidate.reply?.winning);
  if (capture && capture.score >= best.score - margin) return capture;
  return best;
}

function tacticalCandidatePool(state, scored) {
  const opponent = otherPlayer(state.current);
  const urgent = Boolean(state.pending[opponent] || state.captures[opponent] >= 4 || currentHealth(state, state.current).atariStones > 0);
  if (urgent) return scored;
  const critical = scored.filter((candidate) => candidate.features.winning || candidate.features.captured > 0 || candidate.features.brokePath);
  const top = scored.slice(0, 18);
  return [...new Map([...critical, ...top].map((candidate) => [`${candidate.move.cell}/${candidate.move.phase}`, candidate])).values()];
}

export function chooseMove(state, options = {}) {
  const level = options.level || 'tactician';
  const style = options.style || 'adaptive';
  const rng = options.rng || Math.random;
  const legal = getLegalMoves(state);
  if (!legal.length) return null;
  const player = state.current;
  const scored = scoreMoves(state, player, style, legal);
  const winning = scored.filter((candidate) => candidate.features.winning);
  if (winning.length) return winning[0].move;

  if (level === 'novice') {
    const captures = scored.filter((candidate) => candidate.features.captured > 0);
    if (captures.length) return weightedTop(captures, Math.min(4, captures.length), rng);
    const sampleKeys = new Set(shuffled(scored, rng).slice(0, Math.min(28, scored.length)).map((candidate) => `${candidate.move.cell}/${candidate.move.phase}`));
    const sample = scored.filter((candidate) => sampleKeys.has(`${candidate.move.cell}/${candidate.move.phase}`));
    return weightedTop(sample, 8, rng);
  }

  const pool = tacticalCandidatePool(state, scored);
  const withRisk = enrichReplyRisk(pool, player, style);
  const safe = withRisk.some((candidate) => !candidate.reply.winning)
    ? withRisk.filter((candidate) => !candidate.reply.winning)
    : withRisk;

  if (level === 'tactician') return preferConcreteCapture(safe, 82)?.move || safe[0].move;

  const finalists = safe.slice(0, Math.min(8, safe.length));
  const searched = finalists.map((candidate) => {
    if (candidate.state.winner || candidate.state.draw) return candidate;
    const replyPlayer = candidate.state.current;
    const legalReplies = getLegalMoves(candidate.state);
    const quickReplies = legalReplies.map((move) => {
      const result = applyMove(candidate.state, move);
      if (!result.ok) return null;
      const captured = result.state.captures[replyPlayer] - candidate.state.captures[replyPlayer];
      const winning = result.state.winner === replyPlayer;
      const position = summarizePosition(result.state, replyPlayer);
      const priority = (winning ? 1_000_000 : 0) + captured * 120 - position.ownDistance * 7 + position.enemyDistance * 3 + (result.state.pending[replyPlayer] ? 26 : 0);
      return { state: result.state, captured, winning, priority };
    }).filter(Boolean).sort((a, b) => b.priority - a.priority);
    const replyPool = [
      ...quickReplies.filter((reply) => reply.winning || reply.captured > 0),
      ...quickReplies.slice(0, 14)
    ].filter((reply, index, array) => array.indexOf(reply) === index);
    let worstForPlayer = Infinity;
    for (const reply of replyPool) {
      const horizon = evaluateState(reply.state, player, style) - reply.captured * 46 * styleConfig(style).weights.defense;
      worstForPlayer = Math.min(worstForPlayer, horizon);
    }
    return { ...candidate, score: candidate.score * 0.38 + worstForPlayer * 0.62 };
  }).sort((a, b) => b.score - a.score);

  return preferConcreteCapture(searched, 68)?.move || searched[0].move;
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
