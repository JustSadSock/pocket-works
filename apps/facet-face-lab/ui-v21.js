// FACET v2.1 — adaptive result interface.
function __facetV21Node(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function __facetV21Meter(value) {
  const track = __facetV21Node('i', 'facet-v21-meter');
  const fill = __facetV21Node('b');
  fill.style.width = `${__facetV21Clamp(value)}%`;
  track.append(fill);
  return track;
}

function __facetV21Diagnostics(profile) {
  const adaptive = profile.adaptiveProtocol;
  const perspective = profile.perspective;
  const section = __facetV21Node('section', 'facet-v21-diagnostics');
  section.dataset.facetV21 = 'true';
  const heading = __facetV21Node('div', 'detail-heading');
  const title = __facetV21Node('div');
  title.innerHTML = '<p class="section-number">04 · VALIDATION</p><h3>Как FACET проверил вывод</h3>';
  heading.append(title, __facetV21Node('span', '', 'адаптивный отбор и перспектива'));

  const protocol = __facetV21Node('article', 'facet-v21-protocol-card');
  const protocolTop = __facetV21Node('div', 'facet-v21-card-top');
  protocolTop.append(
    __facetV21Node('span', '', 'РАКУРСЫ В РАСЧЁТЕ'),
    __facetV21Node('strong', '', `${adaptive.selectedIndices.length}/${adaptive.frames.length || adaptive.selectedIndices.length}`)
  );
  protocol.append(protocolTop, __facetV21Node('p', '', adaptive.reason));
  const frames = __facetV21Node('div', 'facet-v21-frame-row');
  adaptive.frames.forEach((frame) => {
    const used = adaptive.selectedIndices.includes(frame.index);
    const chip = __facetV21Node('div', `facet-v21-frame-chip ${used ? 'is-used' : 'is-skipped'}`);
    chip.append(
      __facetV21Node('span', '', __facetV21RoleLabels[frame.role] || `Кадр ${frame.index + 1}`),
      __facetV21Node('strong', '', used ? 'использован' : 'не меняет вывод'),
      __facetV21Node('small', '', `качество ${frame.quality}%`)
    );
    frames.append(chip);
  });
  protocol.append(frames);

  const perspectiveCard = __facetV21Node('article', 'facet-v21-perspective-card');
  const perspectiveTop = __facetV21Node('div', 'facet-v21-card-top');
  perspectiveTop.append(
    __facetV21Node('span', '', 'РИСК ПЕРСПЕКТИВЫ'),
    __facetV21Node('strong', '', `${perspective.risk}%`)
  );
  perspectiveCard.append(perspectiveTop, __facetV21Meter(100 - perspective.risk));
  perspective.notes.slice(0, 3).forEach((note) => perspectiveCard.append(__facetV21Node('p', '', note)));
  const metrics = __facetV21Node('div', 'facet-v21-perspective-metrics');
  metrics.append(
    __facetV21Node('span', '', `дистанция ±${perspective.scaleDrift}%`),
    __facetV21Node('span', '', `центр ±${perspective.centerDrift}%`),
    __facetV21Node('span', '', perspective.yawAsymmetry == null ? 'углы: оценочно' : `разница углов ${perspective.yawAsymmetry}°`)
  );
  perspectiveCard.append(metrics);

  const zoneCard = __facetV21Node('article', 'facet-v21-zone-card');
  const zoneTop = __facetV21Node('div', 'facet-v21-card-top');
  zoneTop.append(__facetV21Node('span', '', 'СТАБИЛЬНОСТЬ ЗОН'), __facetV21Node('strong', '', `${profile.zones.length}`));
  zoneCard.append(zoneTop);
  const zoneGrid = __facetV21Node('div', 'facet-v21-zone-grid');
  profile.zones.forEach((zone) => {
    const row = __facetV21Node('div');
    const copy = __facetV21Node('div');
    copy.append(__facetV21Node('span', '', zone.label), __facetV21Node('strong', '', `${zone.stability}%`));
    row.append(copy, __facetV21Meter(zone.stability));
    zoneGrid.append(row);
  });
  zoneCard.append(zoneGrid);

  const recommendation = __facetV21Node('aside', 'facet-v21-recommendation');
  recommendation.append(
    __facetV21Node('span', '', 'СЛЕДУЮЩИЙ ШАГ'),
    __facetV21Node('strong', '', profile.recommendation.title),
    __facetV21Node('p', '', profile.recommendation.copy)
  );
  if (profile.support < 68 || perspective.risk >= 48 || profile.zones.some((zone) => zone.stability < 60)) {
    const button = __facetV21Node('button', 'secondary-button', 'Повторить серию точнее');
    button.type = 'button';
    button.addEventListener('click', () => {
      document.getElementById('reset-session')?.click();
      setTimeout(() => document.getElementById('camera-open')?.click(), 120);
    });
    recommendation.append(button);
  }

  const grid = __facetV21Node('div', 'facet-v21-diagnostic-grid');
  grid.append(protocol, perspectiveCard, zoneCard);
  section.append(heading, grid, recommendation);
  return section;
}

function __facetV21RefreshCopy() {
  const heroIndex = document.querySelector('.hero-index');
  if (heroIndex) heroIndex.innerHTML = '<span>3 CORE</span><span>+2 CHECK</span><span>LOCAL</span>';
  const heroCopy = document.querySelector('.hero > p:last-child');
  if (heroCopy) heroCopy.textContent = 'Три основных ракурса и два контрольных. В расчёт входят только кадры, которые действительно уточняют внешность.';
  const captureHint = document.getElementById('capture-hint');
  if (captureHint) captureHint.textContent = 'Сними прямо и два небольших поворота. Контрольные фронтальные кадры проверят дистанцию и повторяемость.';
  const protocolItems = document.querySelectorAll('.protocol-strip > div');
  if (protocolItems.length >= 3) {
    protocolItems[0].innerHTML = '<strong>3+2</strong><span>основа и контроль</span>';
    protocolItems[1].innerHTML = '<strong>перспектива</strong><span>дистанция и углы</span>';
    protocolItems[2].innerHTML = '<strong>адаптивно</strong><span>лишнее не влияет</span>';
  }
  const resultMode = document.getElementById('result-mode');
  if (resultMode) resultMode.textContent = 'АДАПТИВНО · 3–5 РАКУРСОВ';
  const methodCopy = document.querySelector('.method-copy');
  if (methodCopy) methodCopy.innerHTML = `
    <section><h3>Адаптивный протокол</h3><p>Три основных ракурса обязательны: прямо, небольшой левый и небольшой правый поворот. Два фронтальных контроля используются только тогда, когда они улучшают повторяемость или обнаруживают расхождение.</p></section>
    <section><h3>Коррекция перспективы</h3><p>FACET сравнивает размер лица, положение в кадре, наклон и симметрию углов поворота. При слишком близкой камере уверенность центральных зон снижается, а диапазон результата расширяется.</p></section>
    <section><h3>Стабильность по зонам</h3><p>Контур, глаза, брови, нос, губы и нижняя часть лица проверяются отдельно. Нестабильность одной зоны больше не обесценивает весь анализ и не маскируется общей цифрой.</p></section>
    <section><h3>Что считается устойчивым</h3><p>Черта должна одновременно хорошо определяться, повторяться между выбранными ракурсами и находиться достаточно далеко от границы категории. Контрольный кадр не получает вес только потому, что он был снят.</p></section>
    <section><h3>Ограничение</h3><p>Обычная RGB-камера не восстанавливает точную трёхмерную форму. FACET корректирует наиболее заметные искажения, но не заменяет TrueDepth, фотограмметрию или очное измерение.</p></section>
    <section class="sources"><h3>Исследовательская основа</h3><a href="https://doi.org/10.1038/s41598-025-86974-0" target="_blank" rel="noreferrer">Lee et al., 2025</a><a href="https://arxiv.org/abs/1801.06345" target="_blank" rel="noreferrer">SCUT-FBP5500</a></section>`;
  const steps = typeof __facetV191Steps !== 'undefined' ? __facetV191Steps : [];
  if (steps[3]) {
    steps[3].kicker = 'КАДР 4 · КОНТРОЛЬ ДИСТАНЦИИ';
    steps[3].title = 'Верни лицо точно в центр';
    steps[3].instruction = 'Сохрани тот же размер лица. Этот кадр войдёт в расчёт только если уточнит повторяемость.';
  }
  if (steps[4]) {
    steps[4].kicker = 'КАДР 5 · КОНТРОЛЬ СТАБИЛЬНОСТИ';
    steps[4].title = 'Останься прямо ещё один кадр';
    steps[4].instruction = 'Финальная проверка не получает вес автоматически: FACET отбросит её, если она ничего не добавляет.';
  }
}

function __facetV21Report(profile) {
  const adaptive = profile.adaptiveProtocol;
  return [
    `FACET v${__facetV21Version} — адаптивный профиль внешности`,
    '',
    `В расчёте: ${adaptive.selectedIndices.length} из ${adaptive.frames.length || adaptive.selectedIndices.length} ракурсов. ${adaptive.reason}`,
    `Риск перспективного искажения: ${profile.perspective.risk}%.`,
    '',
    'УСТОЙЧИВЫЕ ОСОБЕННОСТИ',
    ...(profile.robust?.length ? profile.robust.map((item) => `• ${item.label}: ${item.classification} — опора ${item.evidence}%.`) : ['• Недостаточно устойчивых особенностей.']),
    '',
    'СТАБИЛЬНОСТЬ ЗОН',
    ...profile.zones.map((zone) => `• ${zone.label}: ${zone.stability}%`),
    '',
    `Рекомендация: ${profile.recommendation.title}. ${profile.recommendation.copy}`,
    '',
    `Экспериментальная оценка восприятия: ${combined.rating.toFixed(1)}/5; диапазон ${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}.`,
    'Оценка остаётся вторичной модельной интерпретацией, а не объективной мерой красоты.'
  ].join('\n');
}

function __facetV21Render() {
  if (!combined || !finalized || !el?.result || !combined.appearanceV2?.adaptiveProtocol) return;
  el.result.querySelectorAll('[data-facet-v21]').forEach((node) => node.remove());
  const overview = el.result.querySelector('.facet-v20-overview');
  const diagnostics = __facetV21Diagnostics(combined.appearanceV2);
  if (overview) overview.after(diagnostics);
  else el.result.querySelector('.result-heading')?.after(diagnostics);
  if (el.resultMode) el.resultMode.textContent = `АДАПТИВНО · ${combined.appearanceV2.adaptiveProtocol.selectedIndices.length}/${combined.appearanceV2.adaptiveProtocol.frames.length} РАКУРСОВ`;
  if (el.stabilityNote) {
    const weakest = combined.appearanceV2.zones[0];
    el.stabilityNote.textContent = weakest
      ? `Самая чувствительная зона — ${weakest.label.toLowerCase()} (${weakest.stability}% стабильности). Контрольные кадры учитываются только при реальной пользе.`
      : 'Контрольные кадры учитываются только при реальной пользе.';
  }
}

if (typeof renderResult === 'function') {
  const __facetV21BaseRenderResult = renderResult;
  renderResult = function renderResultV21() {
    __facetV21BaseRenderResult();
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(__facetV21Render)));
  };
}

__facetV21RefreshCopy();
const __facetV21Footer = document.querySelector('.app-footer span:first-child');
if (__facetV21Footer) __facetV21Footer.textContent = `FACET v${__facetV21Version}`;

if (el?.share) {
  const __facetV21Share = el.share.cloneNode(true);
  el.share.replaceWith(__facetV21Share);
  el.share = __facetV21Share;
  el.share.addEventListener('click', async () => {
    if (!combined?.appearanceV2?.adaptiveProtocol) return;
    const text = __facetV21Report(combined.appearanceV2);
    try {
      if (navigator.share) await navigator.share({ title: 'FACET — адаптивный профиль внешности', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Адаптивный профиль скопирован.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Не удалось поделиться отчётом.');
    }
  });
}
