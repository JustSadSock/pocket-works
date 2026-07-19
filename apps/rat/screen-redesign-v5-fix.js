(() => {
  'use strict';

  function repairResultLayout() {
    const result = screens.result;
    const stage = result?.querySelector('.result-stage-v5');
    const actions = stage?.querySelector('.result-actions-v5');
    if (stage && actions) stage.after(actions);
  }

  const redesignedShowScreen = showScreen;
  showScreen = function showFixedRedesignedScreen(name) {
    redesignedShowScreen(name);
    if (name === 'result') requestAnimationFrame(repairResultLayout);
  };

  const redesignedEndBattle = endBattle;
  endBattle = function endFixedRedesignedBattle() {
    redesignedEndBattle();
    requestAnimationFrame(repairResultLayout);
  };

  repairResultLayout();
  globalThis.__RAT_SCREEN_V5_FIXED = true;
})();