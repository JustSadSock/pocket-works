import { BLACK, WHITE, getGroup, inspectMove } from './go-engine.js';
import { gameSeed } from './gnugo-protocol.js';

let worker = null;
let nextRequestId = 1;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./gnugo-worker.js', import.meta.url), { type: 'module', name: 'sente-gnugo' });
  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data || {};
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timeout);
    if (ok) request.resolve(result);
    else request.reject(new Error(error || 'GNU Go worker failed'));
  };
  worker.onerror = (event) => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error(event.message || 'GNU Go worker crashed'));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function request(type, payload, timeoutMs) {
  const active = ensureWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('GNU Go exceeded its move time limit'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    active.postMessage({ id, type, payload });
  });
}

function timeoutFor(level, size) {
  const base = level === 'sharp' ? 15000 : level === 'steady' ? 9500 : 6000;
  return base + (size === 19 ? 5000 : size === 13 ? 2500 : 0);
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
  request('warmup', {}, 12000).catch((error) => console.warn('GNU Go warmup failed', error));
}

export function resetGnugoWorker() {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error('GNU Go worker reset'));
  }
  pending.clear();
}
