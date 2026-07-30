/* КЛАДА 4.4 — асинхронное поколение и IndexedDB как источник истины. */
const CLADA_SERVICES = globalThis.CladaRuntimeServices || {};
const CLADA_STORAGE = CLADA_SERVICES.storage || null;
const CLADA_SIMULATION = CLADA_SERVICES.simulation || null;
const CLADA_COMPRESSION = CLADA_SERVICES.compression || null;
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
  if (typeof observationFlushSave === 'function') {
    removeEventListener('pagehide', observationFlushSave);
    if (observationSaveHandle !== null) {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(observationSaveHandle);
      else clearTimeout(observationSaveHandle);
      observationSaveHandle = null;
    }
    observationSavePending = false;
  }

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
    const sourceCommunity = state.metacommunity;
    const commandCount = state.commandLog?.length || 0;
    const input = deepClone(meta);

    CLADA_SIMULATION.advance(input).then((result) => {
      if (!result?.community || result.community.generation !== input.generation + 1) throw new Error('Worker вернул некорректное поколение');
      cladaWorkerLastDuration = Number(result.duration) || 0;
      if (state.metacommunity !== sourceCommunity) return;
      if ((state.commandLog?.length || 0) !== commandCount) {
        const current = metaEnsureState();
        current.env = deepClone(state.env);
        const outcome = META.advance(current) || {};
        cladaApplyMacroOutcome(current, outcome.proposals || []);
        return;
      }
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

if (CLADA_COMPRESSION) {
  const cladaLegacyOpenMenuSheet = openMenuSheet;
  openMenuSheet = function cladaArchiveMenuSheet() {
    cladaLegacyOpenMenuSheet();
    const exportLabel = sheetBody.querySelector('[data-menu="export"] span');
    const importLabel = sheetBody.querySelector('[data-menu="import"] span');
    if (exportLabel) exportLabel.textContent = 'GZIP';
    if (importLabel) importLabel.textContent = 'GZIP / JSON';
  };

  exportWorld = async function cladaCompressedExportWorld() {
    try {
      const archive = await CLADA_COMPRESSION.compressJson(state);
      const blob = new Blob([archive.bytes], { type: archive.mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `clada-world-g${state.generation}${archive.extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      tone(420, .07, .02, 'triangle');
      showToast(archive.compressed ? 'Сжатый архив мира экспортирован' : 'Архив мира экспортирован');
    } catch (error) {
      showToast(error?.message || 'Не удалось экспортировать мир', 3000);
    }
  };

  importWorld = async function cladaCompressedImportWorld(file) {
    try {
      const payload = await CLADA_COMPRESSION.decompressJson(file);
      if (!validateImported(payload)) throw new Error('Неверный формат архива');
      state = payload;
      state.paused = false;
      state.view = 'world';
      state.fossilIndex = null;
      state.selectedId = null;
      state.selectedSpeciesId = null;
      state.seedMode = false;
      migrateLivingState();
      closeSheet();
      syncAllUI();
      saveState();
      pulse([12, 25, 12]);
      showToast(`Мир восстановлен: поколение ${state.generation}`);
    } catch (error) {
      showToast(error?.message || 'Не удалось прочитать архив', 3000);
    }
  };

  importInput.accept = 'application/json,application/gzip,.json,.gz,.clada';
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
