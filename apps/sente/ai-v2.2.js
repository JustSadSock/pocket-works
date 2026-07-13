import { chooseGnugoMove } from './gnugo-client-v2.2.js?v=2.2.0';

let engineFailed = false;
let engineVersion = null;
let engineDegraded = false;

function publish(type, detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export async function chooseAiMove(game, level = 'steady') {
  const result = await chooseGnugoMove(game, level);
  engineFailed = result?.engine === 'emergency';
  engineDegraded = !engineFailed && Boolean(result?.degraded);
  engineVersion = engineFailed ? null : result?.engine || engineVersion;

  if (engineFailed) {
    publish('sente-engine-error', {
      message: result?.error || 'worker: GNU Go fallback',
      build: '2.2.0'
    });
  } else if (engineVersion) {
    publish('sente-engine-ready', {
      version: engineVersion,
      degraded: engineDegraded,
      reads: result?.reads || 0,
      requestedReads: result?.requestedReads || result?.reads || 0,
      failures: result?.failures || []
    });
  }

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
  const suffix = engineDegraded ? ' · GNU Go Lite' : ' · GNU Go';
  if (level === 'calm') return `Ученик${suffix}`;
  if (level === 'sharp') return `Мастер${suffix}`;
  return `Клубный${suffix}`;
}
