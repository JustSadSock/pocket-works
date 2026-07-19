(() => {
  'use strict';
  const COACH_KEY = 'pocket-works:rat:gesture-coach-seen';
  const baseStartBattle = startBattle;

  startBattle = function startBattleWithRestoredCoach(options = {}) {
    baseStartBattle(options);
    requestAnimationFrame(() => {
      if (localStorage.getItem(COACH_KEY) !== '1') {
        document.querySelector('#gestureCoach')?.classList.remove('is-dismissed');
      }
    });
  };

  document.querySelector('#resetCoachButton')?.addEventListener('click', () => {
    document.querySelector('#gestureCoach')?.classList.remove('is-dismissed');
  });

  const updateScript = document.querySelector('script[data-update-manager]');
  if (updateScript) updateScript.dataset.appVersion = '1.4.0';
  globalThis.__RAT_SHELL_UI_V4_FIXED = true;
})();