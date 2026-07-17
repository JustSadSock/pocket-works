import { applyAction, canClaimOpening, coordsOf, legalActions, neighborsOf, shortestPathCost } from './engine.js';

export const BOT_PERSONAS = {
  rush: { name: 'Штурм', detail: 'Давит к краю и принимает размены.', own: 5.4, opp: 1.8, capture: 0.8, contact: 0.9, shift: 0.2, randomness: 0.55 },
  guard: { name: 'Заслон', detail: 'Сначала ломает твой маршрут.', own: 2.8, opp: 4.9, capture: 0.7, contact: 0.6, shift: 0.15, randomness: 0.5 },
  hunter: { name: 'Охотник', detail: 'Строит вилки и ищет захват пары.', own: 3.0, opp: 2.7, capture: 3.2, contact: 0.7, shift: 0.1, randomness: 0.62 },
  weaver: { name: 'Ткач', detail: 'Балансирует маршрут, угрозы и темп.', own: 4.0, opp: 3.6, capture: 1.35, contact: 1.0, shift: 0.08, randomness: 0.35 }
};

function preScore(state, action) {
  if (action.type === 'claim') return 50;
  const index = action.type === 'place' ? action.to : action.to;
  const [q, r] = coordsOf(index, state.size);
  const center = (state.size - 1) / 2;
  const contact = neighborsOf(index, state.size).filter((cell) => state.board[cell] !== 0).length;
  const ownContact = neighborsOf(index, state.size).filter((cell) => state.board[cell] === state.turn).length;
  const progress = state.turn === 1 ? Math.min(r, state.size - 1 - r) : Math.min(q, state.size - 1 - q);
  return contact * 2.4 + ownContact * 1.2 - (Math.abs(q - center) + Math.abs(r - center)) * 0.2 + progress * 0.12 - (action.type === 'shift' ? 1.2 : 0);
}

function tacticalFrontier(state, actions, max = 34) {
  if (actions.length <= max) return actions;
  const claim = actions.filter((action) => action.type === 'claim');
  const rest = actions.filter((action) => action.type !== 'claim').sort((a, b) => preScore(state, b) - preScore(state, a));
  return [...claim, ...rest.slice(0, max - claim.length)];
}

function evaluate(state, action, persona) {
  const player = state.turn;
  const result = applyAction(state, action);
  if (!result.ok) return -Infinity;
  if (result.winner === player) return 100000;
  const next = result.state;
  const ownCost = shortestPathCost(next, player);
  const oppCost = shortestPathCost(next, 3 - player);
  const destination = action.type === 'place' ? action.to : action.type === 'shift' ? action.to : next.board.findIndex((value) => value === player);
  const contact = destination >= 0 ? neighborsOf(destination, state.size).filter((cell) => next.board[cell] === player).length : 0;
  const shiftCost = action.type === 'shift' ? (3 - next.shiftsLeft[player]) : 0;
  let score = -persona.own * ownCost + persona.opp * oppCost + persona.capture * result.captured.length + persona.contact * contact - persona.shift * shiftCost;
  if (action.type === 'claim') {
    const opening = state.board.findIndex(Boolean);
    const [q, r] = coordsOf(opening, state.size);
    const center = (state.size - 1) / 2;
    score += 3.2 - (Math.abs(q - center) + Math.abs(r - center)) * 0.55;
  }
  return score;
}

function pickWeighted(scored, randomness) {
  const top = scored.slice(0, Math.min(5, scored.length));
  if (!top.length) return null;
  const best = top[0].score;
  const weights = top.map(({ score }) => Math.exp((score - best) / Math.max(0.4, randomness * 2.2)));
  let roll = Math.random() * weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < top.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return top[i].action;
  }
  return top[0].action;
}

export function chooseBotAction(state, personaKey = 'weaver') {
  const persona = BOT_PERSONAS[personaKey] || BOT_PERSONAS.weaver;
  const actions = tacticalFrontier(state, legalActions(state));
  if (!actions.length) return null;
  const scored = actions.map((action) => ({ action, score: evaluate(state, action, persona) }));
  scored.sort((a, b) => b.score - a.score);

  const immediate = scored.find(({ score }) => score >= 100000);
  if (immediate) return immediate.action;

  if (canClaimOpening(state)) {
    const claim = scored.find(({ action }) => action.type === 'claim');
    if (claim && claim.score >= scored[0].score - 0.35) return claim.action;
  }

  return pickWeighted(scored, persona.randomness);
}
