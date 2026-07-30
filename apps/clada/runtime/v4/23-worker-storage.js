/* КЛАДА 4.4 — асинхронное поколение и IndexedDB как источник истины. */
const CLADA_SERVICES = globalThis.CladaRuntimeServices || {};
const CLADA_STORAGE = CLADA_SERVICES.storage || null;
const CLADA_SIMULATION = CLADA_SERVICES.simulation || null;
const cladaLegacySaveState = saveState;
const cladaLegacyRemoveStoredWorld = removeStoredWorld;
const cladaWorkerLegacySimulateStep = simulateStep;
let cladaWorkerPending = false;
let cladaWorkerDisabled = !CLADA_SIMULATION;
let cladaWorkerLastDuration = 0;
let cladaWorkerFailures = 0;

let cladaSaveHandle = null;
let cladaSavePending = false;

function cladaFlushIndexedSave() {
  if (!CLADA_STORAGE || !state || !cladaSavePending) return Promise.resolve();
  cladaSavePending = false;
  if (cladaSaveHandle !== null) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(cladaSaveHandle);
    else clearTimeout(cladaSaveHandle);
    cladaSaveHandle = null;
  }
  CLADA_STORAGE.scheduleWorld(state);
  return CLADA_STORAGE.flush();
}

if (CLADA_STORAGE) {
  saveState = function cladaIndexedDbSave(force = false) {
    if (!state) return;
    cladaSavePending = true;
    if (force) {
      cladaFlushIndexedSave().catch((error) => console.warn('КЛАДА: ошибка IndexedDB', error));
      return;
    }
    if (cladaSaveHandle !== null) return;
    const callback = () => {
      cladaSaveHandle = null;
      cladaFlushIndexedSave().catch((error) => console.warn('КЛАДА: ошибка IndexedDB', error));
    };
    cladaSaveHandle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(callback, { timeout: 900 })
      : setTimeout(callback, 240);
  };

  removeStoredWorld = function cladaIndexedDbRemove() {
    CLADA_STORAGE.removeWorld().catch((error) => console.warn('КЛАДА: не удалось удалить мир', error));
    try { cladaLegacyRemoveStoredWorld(); } catch { /* старый backend уже может быть недоступен */ }
  };

  saveState(true);
  CLADA_STORAGE.releaseBootstrapCache();
}

function cladaApplyMacroOutcome(meta, proposals) {
  state.metacommunity = meta;
  state.generation = meta.generation;
  state.rng = meta.rng;
  for (const proposal of proposals || []) metaCreateAppSpecies(proposal);
  metaSyncSpeciesRecords();
  metaSyncPopulationRecords();
  metaReconcileRepresentatives();
  metaSyncPopulationRecords();
  state.interactions = Object.fromEntries(Object.entries(state.interactions || {}).map(([speciesId, bucket]) => [speciesId, {
    prey: Object.fromEntries(Object.entries(bucket.prey || {}).map(([key, value]) => [key, value * .82])),
    predators: Object.fromEntries(Object.entries(bucket.predators || {}).map(([key, value]) => [key, value * .82])),
    competitors: Object.fromEntries(Object.entries(bucket.competitors || {}).map(([key, value]) => [key, value * .82])),
    plants: (bucket.plants || 0) * .82,
    carrion: (bucket.carrion || 0) * .82,
    filter: (bucket.filter || 0) * .82
  }]));
  metaRecordHistory();
  updateTimeline();
  updateReadouts();
  saveState();
}

if (CLADA_SIMULATION) {
  finalizeGeneration = function cladaWorkerFinalizeGeneration() {
    if (cladaWorkerPending) return;
    const meta = metaEnsureState();
    if (!meta) return;
    metaSyncVisibleTraitsIntoCommunity();
    meta.env = deepClone(state.env);
    if (cladaWorkerDisabled) {
      const outcome = META.advance(meta) || {};
      cladaApplyMacroOutcome(meta, outcome.proposals || []);
      return;
    }
    cladaWorkerPending = true;
    state.runtimeWorkerPending = true;
    const input = deepClone(meta);

    CLADA_SIMULATION.advance(input).then((result) => {
      if (!result?.community || result.community.generation !== input.generation + 1) throw new Error('Worker вернул некорректное поколение');
      cladaWorkerLastDuration = Number(result.duration) || 0;
      cladaApplyMacroOutcome(result.community, result.proposals);
    }).catch((error) => {
      cladaWorkerFailures += 1;
      cladaWorkerDisabled = true;
      console.warn('КЛАДА: Worker поколений отключён, расчёт продолжен в основном потоке', error);
      const fallback = metaEnsureState();
      fallback.env = deepClone(state.env);
      const outcome = META.advance(fallback) || {};
      cladaApplyMacroOutcome(fallback, outcome.proposals || []);
    }).finally(() => {
      cladaWorkerPending = false;
      state.runtimeWorkerPending = false;
    });
  };

  simulateStep = function cladaWorkerAwareSimulationStep() {
    if (cladaWorkerPending) return;
    cladaWorkerLegacySimulateStep();
  };
}

if (typeof buildCompactDiagnostic === 'function') {
  const cladaLegacyBuildCompactDiagnostic = buildCompactDiagnostic;
  buildCompactDiagnostic = function cladaRuntimeDiagnostic() {
    const payload = cladaLegacyBuildCompactDiagnostic();
    payload.runtime = {
      worker: {
        available: Boolean(CLADA_SIMULATION),
        disabled: cladaWorkerDisabled,
        pending: cladaWorkerPending,
        failures: cladaWorkerFailures,
        lastDurationMs: Math.round(cladaWorkerLastDuration * 100) / 100
      },
      storage: CLADA_STORAGE?.diagnostics?.() || { backend: 'legacy' }
    };
    return payload;
  };
}

addEventListener('pagehide', () => {
  if (CLADA_STORAGE) cladaFlushIndexedSave().catch(() => {});
});
