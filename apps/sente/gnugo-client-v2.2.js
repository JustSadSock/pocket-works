import { BLACK, WHITE, getGroup, inspectMove } from './go-engine.js?v=2.2.0';
import {
  buildSgf,
  chooseConsensus,
  gameSeed,
  makeReadPlan,
  parseGeneratedMove
} from './gnugo-protocol.js?v=2.2.0';

const BUILD = '2.2.0';
const WORKER_URL = new URL(`./gnugo-worker-v2.2.js?v=${BUILD}`, import.meta.url).href;
let nextRequestId = 1;
const activeWorkers = new Set();

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function describeWorkerError(error) {
  if (!error) return 'worker: unknown error';
  if (typeof error === 'string') return error;
  const stage = error.stage || 'worker';
  const message = error.message || String(error);
  return `${stage}: ${message}`;
}

function requestRead(payload, timeoutMs) {
  const worker = new Worker(WORKER_URL);
  activeWorkers.add(worker);
  const id = nextRequestId++;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeWorkers.delete(worker);
      worker.terminate();
      callback();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error(`timeout: GNU Go exceeded ${Math.round(timeoutMs / 1000)}s`)));
    }, timeoutMs);

    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      const { ok, result, error } = event.data;
      finish(() => {
        if (ok) resolve(result);
        else reject(new Error(describeWorkerError(error)));
      });
    };

    worker.onerror = (event) => {
      event.preventDefault?.();
      finish(() => reject(new Error(`worker-load: ${event.message || 'classic worker failed to start'}`)));
    };

    worker.onmessageerror = () => {
      finish(() => reject(new Error('worker-message: response could not be decoded')));
    };

    worker.postMessage({ id, type: 'read', payload });
  });
}

function totalBudgetFor(level, size) {
  const base = level === 'sharp' ? 24000 : level === 'steady' ? 16000 : 10000;
  return base + (size === 19 ? 6000 : size === 13 ? 3000 : 0);
}

function perReadBudgetFor(level, size) {
  const base = level === 'sharp' ? 6500 : level === 'steady' ? 5500 : 4500;
  return base + (size === 19 ? 2500 : size === 13 ? 1200 : 0);
}

function openingFallback(game) {
  const corner = game.size === 9 ? 2 : 3;
  const far = game.size - 1 - corner;
  const points = [[corner, corner], [far, far], [far, corner], [corner, far], [Math.floor(game.size / 2), Math.floor(game.size / 2)]];
  for (const [x, y] of points) {
    const inspection = inspectMove(game, x, y, game.turn);
    if (inspection.legal) return { x, y, inspection, reason: 'emergency-opening' };
  }
  return null;
}

function emergencyMove(game) {
  if (game.moveNumber < 6) {
    const opening = openingFallback(game);
    if (opening) return opening;
  }

  const opponent = game.turn === BLACK ? WHITE : BLACK;
  const candidates = [];
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const inspection = inspectMove(game, x, y, game.turn);
      if (!inspection.legal) continue;
      const ownGroup = getGroup(inspection.board, game.size, x, y);
      let neighboringOwn = 0;
      let neighboringEnemy = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= game.size || py >= game.size) continue;
        const value = game.board[py * game.size + px];
        if (value === game.turn) neighboringOwn += 1;
        else if (value === opponent) neighboringEnemy += 1;
      }
      const edge = Math.min(x, y, game.size - 1 - x, game.size - 1 - y);
      const score = inspection.captured.length * 1000
        + neighboringEnemy * 22
        + Math.min(6, ownGroup.liberties.length) * 5
        + (edge === 2 || edge === 3 ? 12 : 0)
        - neighboringOwn * 18
        - (ownGroup.liberties.length === 1 && !inspection.captured.length ? 1000 : 0);
      candidates.push({ x, y, inspection, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

export async function chooseGnugoMove(game, level = 'steady') {
  const seed = gameSeed(game, level === 'sharp' ? 0x51f15e : level === 'calm' ? 0xc01a : 0x57ead7);
  const plan = makeReadPlan(level, game.size, seed);
  const deadline = now() + totalBudgetFor(level, game.size);
  const votes = [];
  const failures = [];
  let version = null;

  for (let index = 0; index < plan.length; index += 1) {
    const remaining = deadline - now();
    if (remaining < 1200 && votes.length > 0) break;

    const read = plan[index];
    const input = buildSgf(game, read.transform);
    const timeout = Math.max(1200, Math.min(perReadBudgetFor(level, game.size), remaining));

    try {
      const result = await requestRead({ seed: read.seed, input }, timeout);
      version ||= result?.version || null;
      const move = parseGeneratedMove(result?.output, game.turn, game.size, read.transform);
      if (!move) throw new Error('protocol: GNU Go returned no move');
      votes.push({ index, seed: read.seed, transform: read.transform, move });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (votes.length > 0) {
    const consensus = chooseConsensus(votes, level, seed);
    if (!consensus?.move || consensus.move.pass) {
      return {
        pass: true,
        engine: version || 'GNU Go',
        reads: votes.length,
        degraded: failures.length > 0,
        failures
      };
    }

    const inspection = inspectMove(game, consensus.move.x, consensus.move.y, game.turn);
    if (!inspection.legal) throw new Error(`GNU Go returned illegal move ${consensus.move.x},${consensus.move.y}`);
    return {
      x: consensus.move.x,
      y: consensus.move.y,
      inspection,
      agreement: consensus.count || 0,
      reads: votes.length,
      requestedReads: plan.length,
      alternatives: (consensus.alternatives || []).map((item) => ({ move: item.move, count: item.count })),
      engine: version || 'GNU Go',
      reason: 'gnugo',
      degraded: failures.length > 0,
      failures
    };
  }

  const detail = failures.length ? failures.join(' | ') : 'worker: no successful reads';
  console.error('SENTE GNU Go fallback', detail);
  const fallback = emergencyMove(game);
  return fallback
    ? { ...fallback, engine: 'emergency', error: detail }
    : { pass: true, engine: 'emergency', error: detail };
}

export function prewarmGnugo() {
  // A real read always owns a fresh classic worker and releases it immediately.
}

export function resetGnugoWorker() {
  for (const worker of activeWorkers) worker.terminate();
  activeWorkers.clear();
}
