/* КЛАДА 4.4 — макроэкология в отдельном потоке. */
const CORE_PARTS = [
  '../runtime/v4/16-01.txt',
  '../runtime/v4/16-02.txt',
  '../runtime/v4/16-03.txt',
  '../runtime/v4/16-04.txt'
];
let readyPromise = null;
const clone = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

async function ensureCore() {
  if (globalThis.CladaMetacommunityCore) return globalThis.CladaMetacommunityCore;
  if (!readyPromise) readyPromise = (async () => {
    const responses = await Promise.all(CORE_PARTS.map((source) => fetch(source, { cache: 'no-store' })));
    const failed = responses.find((response) => !response.ok);
    if (failed) throw new Error(`Не удалось загрузить ядро метасообщества: ${failed.status}`);
    const source = (await Promise.all(responses.map((response) => response.text()))).join('\n');
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try { importScripts(url); }
    finally { URL.revokeObjectURL(url); }
    if (!globalThis.CladaMetacommunityCore) throw new Error('Ядро метасообщества не зарегистрировалось');
    return globalThis.CladaMetacommunityCore;
  })();
  return readyPromise;
}

const methods = {
  async init() {
    const core = await ensureCore();
    return { worker: true, modelVersion: core.VERSION || 2 };
  },
  async advance(input) {
    const core = await ensureCore();
    const started = performance.now();
    const community = clone(input);
    core.ensureCommunity(community);
    const outcome = core.advance(community) || {};
    return {
      community,
      proposals: outcome.proposals || [],
      summary: core.summarize(community),
      duration: performance.now() - started
    };
  },
  async summarize(input) {
    const core = await ensureCore();
    const community = clone(input);
    core.ensureCommunity(community);
    return core.summarize(community);
  }
};

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.rpc !== 'clada') return;
  const response = { rpc: 'clada', id: message.id, ok: false };
  try {
    const method = methods[message.method];
    if (!method) throw new Error(`Неизвестный метод Worker: ${message.method}`);
    response.value = await method(...(message.args || []));
    response.ok = true;
  } catch (error) {
    response.error = { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || '' };
  }
  self.postMessage(response);
});
