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

function shp28CreateMenuButton(id, className) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = className;
  button.textContent = 'В ГЛАВНОЕ МЕНЮ';
  button.setAttribute('data-native-press', '');
  button.addEventListener('click', shp28ReturnToMenu);
  return button;
}

function shp28BuildUi() {
  const eyebrow = document.querySelector('.start-copy .eyebrow');
  if (eyebrow) eyebrow.textContent = 'ГОНОЧНАЯ СЕРИЯ';
  const subtitle = document.querySelector('.start-copy .subtitle');
  if (subtitle) subtitle.textContent = 'Два круга. Пять машин. Трасса, которую нужно прочитать.';
  document.querySelector('.control-help')?.remove();
  document.querySelector('[data-workshop-trigger]')?.remove();

  if (!document.querySelector('#finishMenuButton')) {
    restartButtonFinish.after(shp28CreateMenuButton('finishMenuButton', 'secondary-action finish-menu-action'));
  }
  if (!document.querySelector('#pauseMenuButton')) {
    document.querySelector('#restartButtonPause')?.after(shp28CreateMenuButton('pauseMenuButton', 'secondary-action'));
  }

  const routeTools = document.querySelector('.route-tools');
  if (routeTools) routeTools.setAttribute('data-collapsed-tools', 'true');
}

shp28BuildUi();
