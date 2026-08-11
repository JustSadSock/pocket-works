// Prevent Tempo Phase 4's timeline augmentation from scheduling itself forever.
// phase4.js observes document.body and rewrites .p4-entry-breakdown.innerHTML on
// every augmentation pass. That rewrite is itself a childList mutation, which
// can create a requestAnimationFrame -> MutationObserver feedback loop once a
// detailed episode exists. On mobile Safari the loop can starve click handling.

const NativeMutationObserver = window.MutationObserver;

if (NativeMutationObserver && !window.__tempoPhase4ObserverHotfix) {
  window.__tempoPhase4ObserverHotfix = true;

  window.MutationObserver = class TempoMutationObserver extends NativeMutationObserver {
    constructor(callback) {
      super((records, observer) => {
        const meaningful = records.filter((record) => {
          const target = record.target?.nodeType === Node.ELEMENT_NODE
            ? record.target
            : record.target?.parentElement;
          return !target?.closest?.('.p4-entry-breakdown');
        });

        if (meaningful.length) callback(meaningful, observer);
      });
    }
  };
}
