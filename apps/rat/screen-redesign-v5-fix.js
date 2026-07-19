(() => {
  'use strict';

  function repairResultLayout() {
    const result = screens.result;
    const stage = result?.querySelector('.result-stage-v5');
    const actions = stage?.querySelector('.result-actions-v5');
    if (stage && actions) stage.after(actions);
  }

  function repairSetupCopy() {
    const hint = document.querySelector('.board-status-v5 small');
    if (hint) hint.textContent = 'перетаскивай полки между секторами';
  }

  const redesignedShowScreen = showScreen;
  showScreen = function showFixedRedesignedScreen(name) {
    redesignedShowScreen(name);
    if (name === 'result') requestAnimationFrame(repairResultLayout);
    if (name === 'setup') requestAnimationFrame(repairSetupCopy);
  };

  const redesignedEndBattle = endBattle;
  endBattle = function endFixedRedesignedBattle() {
    redesignedEndBattle();
    requestAnimationFrame(repairResultLayout);
  };

  repairResultLayout();
  repairSetupCopy();
  globalThis.__RAT_SCREEN_V5_FIXED = true;
})();