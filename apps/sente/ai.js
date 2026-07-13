import { chooseGnugoMove, prewarmGnugo } from './gnugo-client.js';

prewarmGnugo();

export async function chooseAiMove(game, level = 'steady') {
  const result = await chooseGnugoMove(game, level);
  if (!result || result.pass) return null;
  return {
    x: result.x,
    y: result.y,
    score: result.agreement || 0,
    reads: result.reads || 1,
    agreement: result.agreement || 1,
    alternatives: result.alternatives || [],
    engine: result.engine || 'GNU Go',
    reason: result.reason || 'gnugo'
  };
}

export function aiLabel(level) {
  if (level === 'calm') return 'Ученик';
  if (level === 'sharp') return 'Мастер';
  return 'Клубный';
}
