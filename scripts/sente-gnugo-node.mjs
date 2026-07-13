import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export async function loadSenteGnugo(assetDirectory = path.join(process.cwd(), 'apps', 'sente', 'assets', 'gnugo')) {
  const [source, wasm] = await Promise.all([
    readFile(path.join(assetDirectory, 'gnugo.js'), 'utf8'),
    readFile(path.join(assetDirectory, 'gnugo.wasm'))
  ]);

  const exportsObject = {};
  const quietConsole = { log() {}, warn() {}, error() {} };
  const sandbox = {
    exports: exportsObject,
    module: { exports: exportsObject },
    console: quietConsole,
    WebAssembly,
    TextDecoder,
    TextEncoder,
    URL,
    Response,
    Request,
    Headers,
    Blob,
    ArrayBuffer,
    SharedArrayBuffer: globalThis.SharedArrayBuffer,
    DataView,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    Math,
    Date,
    JSON,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    BigInt,
    parseInt,
    parseFloat,
    isNaN,
    Infinity,
    NaN,
    performance,
    navigator: { hardwareConcurrency: 1 },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    importScripts() {},
    fetch: async () => new Response(wasm, {
      status: 200,
      headers: { 'content-type': 'application/wasm' }
    })
  };
  sandbox.self = sandbox;
  sandbox.location = { href: 'http://127.0.0.1/sente-gnugo-worker.js' };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'gnugo.js', timeout: 30000 });
  const loader = sandbox.module.exports?.get ? sandbox.module.exports : sandbox.exports;
  if (typeof loader.get !== 'function') throw new Error('Pinned GNU Go loader did not expose get()');
  const module = await loader.get('http://127.0.0.1/gnugo.wasm');
  if (!module?.ccall) throw new Error('Pinned GNU Go runtime did not expose ccall()');
  const version = module.ccall('get_version', 'string', [], []);
  return {
    version,
    play(seed, sgf) {
      return module.ccall('play', 'string', ['number', 'string'], [seed >>> 0, sgf]);
    },
    score(seed, sgf) {
      return module.ccall('score', 'number', ['number', 'string'], [seed >>> 0, sgf]);
    }
  };
}
