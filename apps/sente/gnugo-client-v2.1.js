import { BLACK, WHITE, getGroup, inspectMove } from './go-engine.js?v=2.1.0';
import { gameSeed } from './gnugo-protocol.js?v=2.1.0';

let nextRequestId = 1;
const activeWorkers = new Set();

function request(type, payload, timeoutMs) {
  const worker = new Worker(new URL('./gnugo-worker-v2.1.js?v=2.1.0', import.meta.url), { type: 'module', name: 'sente-gnugo-2.1' });
  activeWorkers.add(worker);
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeWorkers.delete(worker);
      worker.terminate();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('GNU Go exceeded its move time limit'));
    }, timeoutMs);
    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      const { ok, result, error } = event.data;
      cleanup();
      if (ok) resolve(result);
      else reject(new Error(error || 'GNU Go worker failed'));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'GNU Go worker crashed'));
    };
    worker.postMessage({ id, type, payload });
  });
}

function timeoutFor(level, size) {
  const base = level === 'sharp' ? 20000 : level === 'steady' ? 13000 : 8000;
  return base + (size === 19 ? 6000 : size === 13 ? 3000 : 0);
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

export async function chooseGnugoMove(game, level) {
  const seed = gameSeed(game, level === 'sharp' ? 0x51f15e : level === 'calm' ? 0xc01a : 0x57ead7);
  try {
    const result = await request('analyze', {
      level,
      seed,
      game: {
        size: game.size,
        komi: game.komi,
        turn: game.turn,
        moveNumber: game.moveNumber,
        moves: game.moves
      }
    }, timeoutFor(level, game.size));
    if (!result?.move || result.move.pass) return { pass: true, engine: result?.version || 'GNU Go' };
    const inspection = inspectMove(game, result.move.x, result.move.y, game.turn);
    if (!inspection.legal) throw new Error(`GNU Go returned illegal move ${result.move.x},${result.move.y}`);
    return {
      x: result.move.x,
      y: result.move.y,
      inspection,
      agreement: result.agreement,
      reads: result.reads,
      alternatives: result.alternatives,
      engine: result.version,
      reason: 'gnugo'
    };
  } catch (error) {
    console.error('SENTE GNU Go fallback', error);
    const fallback = emergencyMove(game);
    return fallback ? { ...fallback, engine: 'emergency', error: String(error) } : { pass: true, engine: 'emergency', error: String(error) };
  }
}

export function prewarmGnugo() {
  // Each actual move runs in a disposable worker so leaked native tables cannot accumulate.
}

export function resetGnugoWorker() {
  for (const worker of activeWorkers) worker.terminate();
  activeWorkers.clear();
}
