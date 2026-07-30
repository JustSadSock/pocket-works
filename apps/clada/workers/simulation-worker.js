/* КЛАДА 5.0 — макроэкология, живая планета и наследственность в отдельном потоке. */
const CORE_PARTS = [
  '../runtime/v4/16-01.txt',
  '../runtime/v4/16-02.txt',
  '../runtime/v4/16-03.txt',
  '../runtime/v4/16-04.txt',
  '../runtime/v4/20-01.txt',
  '../runtime/v4/20-02.txt',
  '../runtime/v4/20-03.txt',
  '../runtime/v5/24-01.txt',
  '../runtime/v5/24-02.txt',
  '../runtime/v5/24-03.txt',
  '../runtime/v5/24-04.txt',
  '../runtime/v5/24-05.txt'
];
let readyPromise = null;
const clone = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

async function ensureCores() {
  if (globalThis.CladaMetacommunityCore && globalThis.CladaLivingPlanetCore && globalThis.CladaGeneticsCore) {
    return { meta: globalThis.CladaMetacommunityCore, planet: globalThis.CladaLivingPlanetCore, genetics: globalThis.CladaGeneticsCore };
  }
  if (!readyPromise) readyPromise = (async () => {
    const responses = await Promise.all(CORE_PARTS.map((source) => fetch(source, { cache: 'no-store' })));
    const failed = responses.find((response) => !response.ok);
    if (failed) throw new Error(`Не удалось загрузить ядро симуляции: ${failed.status}`);
    const source = (await Promise.all(responses.map((response) => response.text()))).join('\n');
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try { importScripts(url); }
    finally { URL.revokeObjectURL(url); }
    if (!globalThis.CladaMetacommunityCore || !globalThis.CladaLivingPlanetCore || !globalThis.CladaGeneticsCore) {
      throw new Error('Ядра метасообщества, планеты и наследственности не зарегистрировались');
    }
    return { meta: globalThis.CladaMetacommunityCore, planet: globalThis.CladaLivingPlanetCore, genetics: globalThis.CladaGeneticsCore };
  })();
  return readyPromise;
}

function advanceWithPlanet(meta, planet, genetics, community) {
  genetics.ensureCommunity(community);
  genetics.prepareGeneration(community);
  planet.ensurePlanet(community);
  planet.prepareGeneration(community);
  planet.applyHabitatStress(community);
  const result = meta.advance(community) || { proposals: [] };
  planet.adjustIsolation(community);
  planet.seedCorridorColonization(community);
  const normal = planet.decorateProposals(community, result.proposals || []);
  const extra = normal.length ? [] : planet.extraProposals(community);
  genetics.finalizeGeneration(community);
  return { ...result, proposals: [...normal, ...extra].slice(0, 1) };
}

const methods = {
  async init() {
    const { meta, planet, genetics } = await ensureCores();
    return { worker: true, modelVersion: meta.MODEL_VERSION || 2, planetVersion: planet.VERSION || 1, geneticsVersion: genetics.VERSION || 1 };
  },
  async advance(input) {
    const { meta, planet, genetics } = await ensureCores();
    const started = performance.now();
    const community = clone(input);
    meta.ensureCommunity(community);
    const outcome = advanceWithPlanet(meta, planet, genetics, community);
    return {
      community,
      proposals: outcome.proposals || [],
      summary: meta.summarize(community),
      genetics: genetics.compactDiagnostic(community),
      duration: performance.now() - started
    };
  },
  async summarize(input) {
    const { meta, genetics } = await ensureCores();
    const community = clone(input);
    meta.ensureCommunity(community);
    genetics.ensureCommunity(community);
    const summary = meta.summarize(community);
    summary.genetics = genetics.compactDiagnostic(community);
    return summary;
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
