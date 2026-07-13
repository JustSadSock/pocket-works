import { buildSgf, chooseConsensus, makeReadPlan, parseGeneratedMove } from './gnugo-protocol.js';

const LOADER_URL = new URL('./assets/gnugo/gnugo.js', import.meta.url);
const WASM_URL = new URL('./assets/gnugo/gnugo.wasm', import.meta.url);
let enginePromise = null;

function getLoader(source) {
  const exportsObject = {};
  const moduleObject = { exports: exportsObject };
  const evaluate = new Function('exports', 'module', `${source}\n//# sourceURL=sente-gnugo-loader.js`);
  evaluate(exportsObject, moduleObject);
  return moduleObject.exports?.get ? moduleObject.exports : exportsObject;
}

async function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    if (typeof globalThis.importScripts !== 'function') globalThis.importScripts = () => {};
    const response = await fetch(LOADER_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`GNU Go loader: ${response.status}`);
    const loader = getLoader(await response.text());
    if (typeof loader.get !== 'function') throw new Error('GNU Go loader has no get() function');
    const module = await loader.get(WASM_URL.href);
    if (!module?.ccall) throw new Error('GNU Go runtime did not expose ccall()');
    const version = module.ccall('get_version', 'string', [], []);
    return { module, version };
  })();
  return enginePromise;
}

function compactGame(raw) {
  return {
    size: raw.size,
    komi: Number(raw.komi || 6.5),
    turn: raw.turn,
    moveNumber: raw.moveNumber || 0,
    moves: Array.isArray(raw.moves) ? raw.moves.map((move) => ({
      x: move.x,
      y: move.y,
      color: move.color,
      pass: Boolean(move.pass)
    })) : []
  };
}

async function analyze(payload) {
  const { module, version } = await loadEngine();
  const game = compactGame(payload.game);
  const plan = makeReadPlan(payload.level, game.size, payload.seed >>> 0);
  const votes = [];
  for (let index = 0; index < plan.length; index += 1) {
    const read = plan[index];
    const input = buildSgf(game, read.transform);
    const output = module.ccall('play', 'string', ['number', 'string'], [read.seed, input]);
    const move = parseGeneratedMove(output, game.turn, game.size, read.transform);
    votes.push({ index, seed: read.seed, transform: read.transform, move });
  }
  const consensus = chooseConsensus(votes, payload.level, payload.seed >>> 0);
  return {
    version,
    move: consensus?.move || null,
    agreement: consensus?.count || 0,
    reads: votes.length,
    alternatives: (consensus?.alternatives || []).map((item) => ({ move: item.move, count: item.count }))
  };
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === 'warmup') {
      const { version } = await loadEngine();
      self.postMessage({ id, ok: true, result: { version } });
      return;
    }
    if (type !== 'analyze') throw new Error(`Unknown GNU Go worker request: ${type}`);
    self.postMessage({ id, ok: true, result: await analyze(payload) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
