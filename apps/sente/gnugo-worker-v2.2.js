'use strict';

const BUILD = '2.2.0';
const LOADER_URL = new URL(`./assets/gnugo/gnugo.js?v=${BUILD}`, self.location.href).href;
const WASM_URL = new URL(`./assets/gnugo/gnugo.wasm?v=${BUILD}`, self.location.href).href;
let loader = null;

function errorPayload(stage, error) {
  const value = error instanceof Error ? error : new Error(String(error));
  return {
    stage,
    name: value.name || 'Error',
    message: value.message || String(error)
  };
}

function loadClassicLoader() {
  if (loader) return loader;

  self.exports = {};
  self.module = { exports: self.exports };
  self.exit = (status) => {
    throw new Error(`GNU Go requested exit(${status})`);
  };

  try {
    importScripts(LOADER_URL);
  } catch (error) {
    throw Object.assign(new Error(errorPayload('loader', error).message), { stage: 'loader' });
  }

  loader = self.module?.exports?.get ? self.module.exports : self.exports;
  if (typeof loader?.get !== 'function') {
    throw Object.assign(new Error('GNU Go loader has no get() function'), { stage: 'loader' });
  }
  return loader;
}

async function executeRead(payload) {
  let runtime;
  try {
    runtime = await loadClassicLoader().get(WASM_URL);
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: error?.stage || 'wasm' });
  }

  if (!runtime?.ccall) {
    throw Object.assign(new Error('GNU Go runtime did not expose ccall()'), { stage: 'wasm' });
  }

  try {
    const version = runtime.ccall('get_version', 'string', [], []);
    const output = runtime.ccall('play', 'string', ['number', 'string'], [payload.seed >>> 0, String(payload.input || '')]);
    return { version, output };
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: 'play' });
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type !== 'read') throw Object.assign(new Error(`Unknown GNU Go request: ${type}`), { stage: 'protocol' });
    const result = await executeRead(payload || {});
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: errorPayload(error?.stage || 'worker', error) });
  }
};
