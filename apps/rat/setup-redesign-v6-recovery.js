(() => {
  'use strict';

  function restorePreviousSetup() {
    const setup = document.querySelector('#setupScreen');
    const board = document.querySelector('#formationBoard');
    const oldStage = setup?.querySelector('.setup-stage-v4');
    const oldRoster = setup?.querySelector('.setup-roster-v4');
    const intro = setup?.querySelector('.setup-intro');
    const workbench = setup?.querySelector('#setupWorkbenchV6');

    if (board && oldStage && !oldStage.contains(board)) {
      const inspector = oldStage.querySelector('#setupInspectorV4');
      if (inspector) oldStage.insertBefore(board, inspector);
      else oldStage.prepend(board);
    }

    workbench?.remove();
    oldStage?.removeAttribute('hidden');
    oldRoster?.removeAttribute('hidden');
    intro?.removeAttribute('hidden');
    setup?.removeAttribute('data-setup-v6');
    document.querySelector('.setup-footer')?.classList.remove('setup-footer-v6');
    document.body.dataset.ratSetup = 'v5-fallback';

    try {
      globalThis.renderSetup?.();
    } catch (error) {
      console.warn('[РАТЬ] previous setup screen restored without rerender', error);
    }
  }

  if (!globalThis.__RAT_SETUP_V6_READY) restorePreviousSetup();
  globalThis.__RAT_SETUP_RECOVERY_READY = true;
})();
