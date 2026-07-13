// ШПИЛЬКА 2.3 — compact interface additions without another settings screen.

const shp23Styles = document.createElement('link');
shp23Styles.rel = 'stylesheet';
shp23Styles.href = './systems-23.css?v=2.3.0';
document.head.append(shp23Styles);

const shp23Subtitle = document.querySelector('.start-copy .subtitle');
if (shp23Subtitle) shp23Subtitle.textContent = 'Адаптивный руль, точная тяга, ежедневные маршруты, призрак круга и честная контактная борьба.';

const shp23RouteStrip = document.querySelector('.route-strip');
if (shp23RouteStrip && !document.querySelector('#routeModeBadge')) {
  const routeName = document.querySelector('#routeName');
  const badge = document.createElement('span');
  badge.className = 'route-mode-badge';
  badge.id = 'routeModeBadge';
  badge.hidden = true;
  routeName?.append(' ', badge);

  const tools = document.createElement('div');
  tools.className = 'route-tools';
  tools.setAttribute('aria-label', 'Маршруты');
  tools.innerHTML = `
    <button class="route-tool" id="dailyRouteButton" type="button" data-native-press>МАРШРУТ ДНЯ</button>
    <button class="route-tool" id="routeCodeButton" type="button" data-native-press>КОД <span id="routeCodeValue">—</span></button>
  `;

  const codePanel = document.createElement('div');
  codePanel.className = 'route-code-panel';
  codePanel.id = 'routeCodePanel';
  codePanel.hidden = true;
  codePanel.innerHTML = `
    <input id="routeCodeInput" aria-label="Код трассы" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false">
    <button id="loadRouteCodeButton" type="button">ЕХАТЬ</button>
    <button id="copyRouteCodeButton" type="button">КОПИЯ</button>
    <span class="route-code-status" id="routeCodeStatus" data-error="false"></span>
  `;

  const medals = document.createElement('div');
  medals.className = 'medal-board';
  medals.setAttribute('aria-label', 'Целевые времена');
  medals.innerHTML = `
    <span class="medal-title">МЕДАЛИ</span>
    <span class="medal-target" data-medal="bronze"><span>БРОНЗА</span><b>—</b></span>
    <span class="medal-target" data-medal="silver"><span>СЕРЕБРО</span><b>—</b></span>
    <span class="medal-target" data-medal="gold"><span>ЗОЛОТО</span><b>—</b></span>
  `;

  shp23RouteStrip.after(tools, codePanel, medals);
}

const shp23Help = document.querySelector('.control-help');
if (shp23Help) {
  shp23Help.innerHTML = `
    <span><b>РУЛЬ</b> сам меняет передаточное число: резче медленно, точнее на скорости</span>
    <span class="adaptive-note"><b>КАЛИБРОВКА</b> мёртвая зона подстраивается под дрожание пальца автоматически</span>
    <span><b>РЫЧАГ</b> вверх — тяга, вниз — тормоз, после остановки — реверс</span>
  `;
}

document.querySelector('#steeringFeelButtonPause')?.remove();
