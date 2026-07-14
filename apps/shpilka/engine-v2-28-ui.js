// ШПИЛЬКА 2.8 — simplified player-facing menu and explicit exits.
var shp28BaseUpdateRouteUi = updateRouteUi;
updateRouteUi = function shp28UpdateRouteUi() {
  shp28BaseUpdateRouteUi();
  if (!track.length) return;
  const type = shpActiveArchetype?.label || 'МАРШРУТ';
  const km = (track.totalLength / 1100).toFixed(1);
  const feature = shp28Jump ? 'ПРЫЖОК ЧЕРЕЗ РАЗРЫВ' : `${shp28Sections.length} СЕКТОРА`;
  routeMeta.textContent = `${type} · ${km} КМ · 2 КРУГА · ${feature}`;
  startButton.textContent = `ГОНКА · ${(shpDifficulty[shpPrefs.difficulty]?.label || shpPrefs.difficulty).toUpperCase()}`;
};

function shp28ReturnToMenu() {
  if (typeof shp27PostFinishActive !== 'undefined') shp27PostFinishActive = false;
  mode = 'menu';
  resetInputs();
  startScreen.hidden = false;
  pauseScreen.hidden = true;
  finishScreen.hidden = true;
  countdownNode.hidden = true;
  recoverButton.hidden = true;
  showRaceUi(false);
  setupRace();
  updateRouteUi();
  if (typeof shp26RenderCareerUi === 'function') shp26RenderCareerUi();
  lastFrame = performance.now();
}

function shp28BuildUi() {
  const eyebrow = document.querySelector('.start-copy .eyebrow');
  if (eyebrow) eyebrow.textContent = 'ГОНОЧНАЯ СЕРИЯ';
  const subtitle = document.querySelector('.start-copy .subtitle');
  if (subtitle) subtitle.textContent = 'Два круга. Пять машин. Трасса, которую нужно прочитать.';
  document.querySelector('.control-help')?.remove();
  document.querySelector('[data-workshop-trigger]')?.remove();

  if (!document.querySelector('#finishMenuButton')) {
    const button = document.createElement('button');
    button.id = 'finishMenuButton';
    button.type = 'button';
    button.className = 'secondary-action finish-menu-action';
    button.textContent = 'В ГЛАВНОЕ МЕНЮ';
    restartButtonFinish.after(button);
    button.addEventListener('click', shp28ReturnToMenu);
  }

  if (!document.querySelector('#pauseMenuButton')) {
    const button = document.createElement('button');
    button.id = 'pauseMenuButton';
    button.type = 'button';
    button.className = 'secondary-action';
    button.textContent = 'В ГЛАВНОЕ МЕНЮ';
    document.querySelector('#restartButtonPause')?.after(button);
    button.addEventListener('click', shp28ReturnToMenu);
  }

  const routeTools = document.querySelector('.route-tools');
  if (routeTools) routeTools.setAttribute('data-collapsed-tools', 'true');
}

shp28BuildUi();
