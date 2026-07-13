import { buildSgf, chooseConsensus, makeReadPlan, parseGeneratedMove } from './gnugo-protocol.js?v=2.1.0';

const LOADER_URL = new URL('./assets/gnugo/gnugo.js?v=2.1.0', import.meta.url);
const WASM_URL = new URL('./assets/gnugo/gnugo.wasm?v=2.1.0', import.meta.url);
let loaderSourcePromise = null;

if (typeof globalThis.importScripts !== 'function') globalThis.importScripts = () => {};
globalThis.exit = (status) => {
  throw new Error(`GNU Go requested exit(${status})`);
};

function getLoader(source) {
  const exportsObject = {};
  const moduleObject = { exports: exportsObject };
  const evaluate = new Function('exports', 'module', `${source}\n//# sourceURL=sente-gnugo-loader-2.1.js`);
  evaluate(exportsObject, moduleObject);
  return moduleObject.exports?.get ? moduleObject.exports : exportsObject;
}

async function getLoaderSource() {
  if (!loaderSourcePromise) {
    loaderSourcePromise = fetch(LOADER_URL, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`GNU Go loader: ${response.status}`);
      return response.text();
    });
  }
  return loaderSourcePromise;
}

async function instantiateEngine() {
  const loader = getLoader(await getLoaderSource());
  if (typeof loader.get !== 'function') throw new Error('GNU Go loader has no get() function');
  const module = await loader.get(WASM_URL.href);
  if (!module?.ccall) throw new Error('GNU Go runtime did not expose ccall()');
  return { module, version: module.ccall('get_version', 'string', [], []) };
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
  const game = compactGame(payload.game);
  const plan = makeReadPlan(payload.level, game.size, payload.seed >>> 0);
  const votes = [];
  let version = null;
  for (let index = 0; index < plan.length; index += 1) {
    const read = plan[index];
    const engine = await instantiateEngine();
    version ||= engine.version;
    const input = buildSgf(game, read.transform);
    const output = engine.module.ccall('play', 'string', ['number', 'string'], [read.seed, input]);
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
      const { version } = await instantiateEngine();
      self.postMessage({ id, ok: true, result: { version } });
      return;
    }
    if (type !== 'analyze') throw new Error(`Unknown GNU Go worker request: ${type}`);
    self.postMessage({ id, ok: true, result: await analyze(payload) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
