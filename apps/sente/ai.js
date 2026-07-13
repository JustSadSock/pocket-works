import { generateMoves, chooseOpeningBookMove } from './ai-policy.js';
import { buildSearchContext, rememberOpening } from './ai-adaptation.js';
import { calculateBestMove } from './ai-minimax.js';

const ROOT_CANDIDATES = {
  calm: 26,
  steady: 40,
  sharp: 54
};

export async function chooseAiMove(game, level = 'steady') {
  const context = buildSearchContext(game, level);
  const rootLimit = ROOT_CANDIDATES[level] || ROOT_CANDIDATES.steady;
  const rootMoves = generateMoves(game, game.turn, rootLimit, true, true, context);

  if (game.moveNumber < 2 && !rootMoves.some((move) => move.urgent)) {
    const bookMove = chooseOpeningBookMove(game, rootMoves, level, context);
    if (bookMove) {
      rememberOpening(game, bookMove);
      return {
        x: bookMove.x,
        y: bookMove.y,
        score: bookMove.prior,
        depth: 0,
        nodes: 0,
        plan: context.personality,
        reason: 'opening-symmetry'
      };
    }
  }

  const calculated = await calculateBestMove(game, rootMoves, level, context);
  if (!calculated || calculated.move?.pass) return null;

  rememberOpening(game, calculated.move);
  return {
    x: calculated.move.x,
    y: calculated.move.y,
    score: calculated.value,
    depth: calculated.depth,
    nodes: calculated.nodes,
    cutoffs: calculated.cutoffs,
    candidates: calculated.candidates,
    plan: context.personality,
    reason: 'calculated'
  };
}

export function aiLabel(level) {
  if (level === 'calm') return 'Спокойный';
  if (level === 'sharp') return 'Острый';
  return 'Собранный';
}
