import { chooseGnugoMove } from './gnugo-client-v2.1.js?v=2.1.0';

let engineFailed = false;
let engineVersion = null;

function publish(type, detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export async function chooseAiMove(game, level = 'steady') {
  const result = await chooseGnugoMove(game, level);
  engineFailed = result?.engine === 'emergency';
  engineVersion = engineFailed ? null : result?.engine || engineVersion;

  if (engineFailed) publish('sente-engine-error', { message: result?.error || 'GNU Go fallback' });
  else if (engineVersion) publish('sente-engine-ready', { version: engineVersion });

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
  if (engineFailed) return 'Ошибка GNU Go';
  if (level === 'calm') return 'Ученик · GNU Go';
  if (level === 'sharp') return 'Мастер · GNU Go';
  return 'Клубный · GNU Go';
}
