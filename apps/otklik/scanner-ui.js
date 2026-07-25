function installMarkup() {
  const scanButton = document.createElement('button');
  scanButton.className = 'text-button scan-room-button';
  scanButton.id = 'scanRoomButton';
  scanButton.type = 'button';
  scanButton.dataset.nativePress = '';
  scanButton.textContent = 'Форма';
  const editButton = $('#editRoomButton');
  if (editButton?.parentElement) {
    const group = document.createElement('div');
    group.className = 'map-toolbar-actions';
    editButton.parentElement.insertBefore(group, editButton);
    group.append(scanButton, editButton);
  }

  const explainer = document.createElement('button');
  explainer.className = 'metric-explainer';
  explainer.type = 'button';
  explainer.id = 'metricExplainer';
  explainer.dataset.nativePress = '';
  explainer.innerHTML = '<strong>Что здесь показано?</strong><span>Голос — ясность речи · Бас — гул · Эхо — сколько комната звенит</span>';
  $('.map-toolbar')?.insertAdjacentElement('afterend', explainer);

  const overlay = document.createElement('canvas');
  overlay.id = 'geometryOverlay';
  overlay.className = 'geometry-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  mapFrame.append(overlay);

  const recommendation = document.createElement('section');
  recommendation.id = 'plainRecommendations';
  recommendation.className = 'plain-recommendations';
  recommendation.setAttribute('aria-live', 'polite');
  $('.result-body', resultSheet)?.insertBefore(recommendation, $('.spectrum-panel', resultSheet));

  appShell.insertAdjacentHTML('beforeend', `
    <section class="bottom-sheet scan-sheet" id="scanSheet" hidden aria-labelledby="scanTitle" data-ui>
      <div class="sheet-handle" aria-hidden="true"></div>
      <header class="sheet-header">
        <div><small>ГЕОМЕТРИЯ КОМНАТЫ</small><h2 id="scanTitle">Определить форму</h2></div>
        <button class="icon-button" id="closeScanButton" type="button" aria-label="Закрыть" data-native-press>×</button>
      </header>
      <div class="sheet-body scan-sheet-body">
        <div class="scan-methods" role="group" aria-label="Способ определения формы">
          <button type="button" data-scan-method="manual" class="is-active" data-native-press><strong>Пальцем</strong><span>Быстро расставить углы</span></button>
          <button type="button" data-scan-method="photo" data-native-press><strong>Камера</strong><span>Обвести план или эскиз</span></button>
          <button type="button" data-scan-method="ar" data-native-press><strong>LiDAR / AR</strong><span>Обойти периметр в пространстве</span></button>
        </div>

        <div class="scan-status" id="scanStatus">
          <strong>Редактор углов</strong>
          <p>Коснись поля, чтобы добавить угол. Точки можно двигать. Комната замкнётся автоматически.</p>
        </div>

        <div class="scan-stage" id="scanStage">
          <canvas id="scanCanvas" data-gesture-surface data-touch-action="none" data-block-callout></canvas>
          <canvas id="xrCanvas" hidden aria-label="AR-сканирование комнаты"></canvas>
          <video id="scanVideo" playsinline muted hidden></video>
          <div class="scan-reticle" id="scanReticle" hidden aria-hidden="true"><i></i></div>
          <div class="scan-depth-badge" id="scanDepthBadge" hidden>Глубина недоступна</div>
        </div>

        <div class="scan-controls" id="manualControls">
          <button type="button" class="sheet-action" id="resetCornersButton" data-native-press>Прямоугольник</button>
          <button type="button" class="sheet-action" id="removeCornerButton" data-native-press>Удалить угол</button>
        </div>

        <div class="scan-controls photo-controls" id="photoControls" hidden>
          <label class="camera-action">
            <input id="photoInput" type="file" accept="image/*" capture="environment" hidden>
            <span>Снять или выбрать план</span>
          </label>
          <button type="button" class="sheet-action" id="clearPhotoButton" data-native-press>Убрать фото</button>
        </div>

        <div class="scan-controls ar-controls" id="arControls" hidden>
          <button type="button" class="primary-sheet-button" id="startArButton" data-native-press>Запустить AR-обход</button>
          <button type="button" class="sheet-action" id="captureArCornerButton" disabled data-native-press>Добавить угол</button>
          <button type="button" class="sheet-action" id="finishArButton" disabled data-native-press>Завершить обход</button>
        </div>

        <div class="reference-wall">
          <div>
            <strong>Известная длина стены</strong>
            <small>Выделена синей линией. По ней приложение масштабирует всю форму.</small>
          </div>
          <label><input id="referenceWallInput" type="number" min="0.5" max="40" step="0.05" inputmode="decimal" placeholder="например 4.20"><span>м</span></label>
          <button type="button" class="sheet-action" id="nextReferenceEdgeButton" data-native-press>Выбрать другую стену</button>
        </div>

        <div class="scan-summary" id="scanSummary"></div>
        <button type="button" class="primary-sheet-button" id="applyShapeButton" data-native-press>Применить форму</button>
      </div>
    </section>

    <section class="bottom-sheet meaning-sheet" id="meaningSheet" hidden aria-labelledby="meaningTitle" data-ui>
      <div class="sheet-handle" aria-hidden="true"></div>
      <header class="sheet-header">
        <div><small>БЕЗ АКУСТИЧЕСКОГО ЖРЕЧЕСТВА</small><h2 id="meaningTitle">Что значат режимы</h2></div>
        <button class="icon-button" id="closeMeaningButton" type="button" aria-label="Закрыть" data-native-press>×</button>
      </header>
      <div class="sheet-body meaning-list">
        <article><b>Голос</b><strong>Насколько легко разобрать речь</strong><p>Выше — лучше для звонков, разговоров и записи голоса.</p></article>
        <article><b>Бас</b><strong>Где низкие частоты начинают гудеть</strong><p>Красные зоны обычно требуют сдвига точки от стены или угла.</p></article>
        <article><b>Эхо</b><strong>Как долго звук остаётся в комнате</strong><p>Длинный хвост делает речь мутной. Помогают крупные мягкие поверхности, а не три декоративные подушки для моральной поддержки.</p></article>
      </div>
    </section>
  `);
}

function bindScanner() {
  $('#scanRoomButton')?.addEventListener('click', openScanSheet);
  $('#metricExplainer')?.addEventListener('click', () => openIndependentSheet($('#meaningSheet')));
  $('#closeScanButton')?.addEventListener('click', closeScanSheet);
  $('#closeMeaningButton')?.addEventListener('click', () => closeIndependentSheet($('#meaningSheet')));
  $$('#scanSheet [data-scan-method]').forEach((button) => {
    button.addEventListener('click', () => setScanMode(button.dataset.scanMethod));
  });
  $('#resetCornersButton')?.addEventListener('click', () => {
    editPoints = clone(DEFAULT_POLYGON);
    selectedCorner = 0;
    referenceEdge = 0;
    drawScanStage();
  });
  $('#removeCornerButton')?.addEventListener('click', () => {
    if (editPoints.length <= 3) return toast('У комнаты должно остаться хотя бы три угла');
    editPoints.splice(clamp(selectedCorner, 0, editPoints.length - 1), 1);
    selectedCorner = clamp(selectedCorner - 1, 0, editPoints.length - 1);
    referenceEdge %= editPoints.length;
    drawScanStage();
  });
  $('#nextReferenceEdgeButton')?.addEventListener('click', () => {
    referenceEdge = (referenceEdge + 1) % Math.max(1, editPoints.length);
    drawScanStage();
  });
  $('#referenceWallInput')?.addEventListener('input', drawScanStage);
  $('#applyShapeButton')?.addEventListener('click', applyEditedShape);
  $('#confirmClearButton')?.addEventListener('click', () => {
    localStorage.removeItem(GEOMETRY_KEY);
    geometry = defaultGeometry();
    applyGeometry();
  });
  $('#exportButton')?.addEventListener('click', exportProjectWithGeometry, true);
  $('#importInput')?.addEventListener('change', importGeometryFromProject, true);
  $('#photoInput')?.addEventListener('change', loadPhoto);
  $('#clearPhotoButton')?.addEventListener('click', clearPhoto);
  $('#startArButton')?.addEventListener('click', startArScan);
  $('#captureArCornerButton')?.addEventListener('click', captureArCorner);
  $('#finishArButton')?.addEventListener('click', finishArScan);

  const scanCanvas = $('#scanCanvas');
  scanCanvas?.addEventListener('pointerdown', onScanPointerDown);
  scanCanvas?.addEventListener('pointermove', onScanPointerMove);
  scanCanvas?.addEventListener('pointerup', onScanPointerUp);
  scanCanvas?.addEventListener('pointercancel', onScanPointerCancel);

  roomCanvas.addEventListener('pointerdown', guardPolygonPointer, true);
  roomCanvas.addEventListener('pointermove', guardPolygonPointer, true);
  roomCanvas.addEventListener('pointerup', guardPolygonPointer, true);

  window.addEventListener('appdatareset', () => {
    localStorage.removeItem(GEOMETRY_KEY);
    geometry = defaultGeometry();
    applyGeometry();
  });
  window.addEventListener('resize', scheduleGeometryDraw);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
  });
}

function relabelInterface() {
  const labels = { clarity: 'Голос', boom: 'Бас', decay: 'Эхо' };
  $$('[data-map-mode]').forEach((button) => {
    button.textContent = labels[button.dataset.mapMode] || button.textContent;
  });
  const metrics = $$('.result-metrics small');
  if (metrics[0]) metrics[0].textContent = 'Эхо';
  if (metrics[1]) metrics[1].textContent = 'Бас';
  if (metrics[2]) metrics[2].textContent = 'Фон';
  const details = $$('.metric-grid > div');
  setMetricCopy(details[0], 'Сколько длится эхо', 'после окончания сигнала');
  setMetricCopy(details[1], 'Насколько гудит бас', 'относительно середины');
  setMetricCopy(details[2], 'Насколько тихо вокруг', 'относительный уровень');
  setMetricCopy(details[3], 'Прямой звук против отражений', 'выше — разборчивее');
  const spectrumHeader = $('.spectrum-panel header strong');
  const spectrumHint = $('.spectrum-panel header small');
  if (spectrumHeader) spectrumHeader.textContent = 'Какие частоты выпирают';
  if (spectrumHint) spectrumHint.textContent = '0 — средний уровень';
}

function setMetricCopy(card, title, hint) {
  if (!card) return;
  const small = $('small', card);
  const span = $('span', card);
  if (small) small.textContent = title;
  if (span) span.textContent = hint;
}

function openScanSheet() {
  closeBaseSheets();
  editPoints = clone(geometry.points);
  referenceEdge = clamp(geometry.referenceEdge || 0, 0, editPoints.length - 1);
  $('#referenceWallInput').value = geometry.referenceWallMeters || '';
  openIndependentSheet($('#scanSheet'));
  setScanMode(geometry.source === 'photo' ? 'photo' : geometry.source === 'ar' ? 'ar' : 'manual');
  requestAnimationFrame(drawScanStage);
}

function closeScanSheet() {
  stopCamera();
  stopArSession();
  closeIndependentSheet($('#scanSheet'));
}

function closeBaseSheets() {
  $$('.bottom-sheet:not(#scanSheet):not(#meaningSheet)').forEach((sheet) => { sheet.hidden = true; });
  const backdrop = $('#sheetBackdrop');
  if (backdrop) backdrop.hidden = true;
}

function openIndependentSheet(sheet) {
  if (!sheet) return;
  const backdrop = $('#sheetBackdrop');
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.onclick = () => {
      if (!$('#scanSheet').hidden) closeScanSheet();
      closeIndependentSheet($('#meaningSheet'));
    };
  }
  sheet.hidden = false;
}

function closeIndependentSheet(sheet) {
  if (sheet) sheet.hidden = true;
  if ($('#scanSheet')?.hidden && $('#meaningSheet')?.hidden) {
    const backdrop = $('#sheetBackdrop');
    if (backdrop) backdrop.hidden = true;
  }
}

function setScanMode(mode) {
  scanMode = mode;
  $$('#scanSheet [data-scan-method]').forEach((button) => button.classList.toggle('is-active', button.dataset.scanMethod === mode));
  $('#manualControls').hidden = mode !== 'manual';
  $('#photoControls').hidden = mode !== 'photo';
  $('#arControls').hidden = mode !== 'ar';
  $('#scanVideo').hidden = mode !== 'photo' || !cameraStream;
  $('#scanReticle').hidden = mode !== 'ar';
  $('#xrCanvas').hidden = mode !== 'ar' || !xrRuntime;
  const copy = {
    manual: ['Редактор углов', 'Коснись поля, чтобы добавить угол. Перетаскивай точки, пока контур не совпадёт с комнатой.'],
    photo: ['Обводка по фото', 'Сфотографируй план, набросок сверху или схему квартиры. Затем поставь углы поверх изображения.'],
    ar: ['Обход периметра', 'На поддерживаемом устройстве наведи центр экрана на пол у каждого угла и добавь точку.']
  };
  $('#scanStatus strong').textContent = copy[mode][0];
  $('#scanStatus p').textContent = copy[mode][1];
  if (mode === 'photo' && !photoBitmap) $('#photoInput').click();
  if (mode === 'ar') updateArAvailability();
  drawScanStage();
}

let scanPointer = null;

function onScanPointerDown(event) {
  if (scanMode === 'ar') return;
  const point = scanCanvasPoint(event);
  const hit = nearestEditPoint(point, 0.055);
  scanPointer = {
    id: event.pointerId,
    start: point,
    corner: hit,
    moved: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  if (hit >= 0) selectedCorner = hit;
  drawScanStage();
}

function onScanPointerMove(event) {
  if (!scanPointer || scanPointer.id !== event.pointerId || scanMode === 'ar') return;
  const point = scanCanvasPoint(event);
  if (scanPointer.corner >= 0) {
    editPoints[scanPointer.corner] = point;
    selectedCorner = scanPointer.corner;
    scanPointer.moved = true;
    drawScanStage();
  }
}

function onScanPointerUp(event) {
  if (!scanPointer || scanPointer.id !== event.pointerId || scanMode === 'ar') return;
  const session = scanPointer;
  scanPointer = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  if (session.corner < 0 && !session.moved) {
    const point = scanCanvasPoint(event);
    if (editPoints.length >= 16) return toast('Шестнадцати углов уже хватит даже для архитектурного преступления');
    insertCornerAtNearestEdge(point);
  }
  drawScanStage();
}

function onScanPointerCancel() {
  scanPointer = null;
  drawScanStage();
}

function scanCanvasPoint(event) {
  const canvas = $('#scanCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98),
    y: clamp((event.clientY - rect.top) / rect.height, 0.02, 0.98)
  };
}

function nearestEditPoint(point, radius) {
  let best = -1;
  let bestDistance = radius;
  editPoints.forEach((candidate, index) => {
    const d = distance(point, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}

function insertCornerAtNearestEdge(point) {
  let bestEdge = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < editPoints.length; index += 1) {
    const next = (index + 1) % editPoints.length;
    const d = distanceToSegment(point, editPoints[index], editPoints[next]);
    if (d < bestDistance) {
      bestDistance = d;
      bestEdge = next;
    }
  }
  editPoints.splice(bestEdge, 0, point);
  selectedCorner = bestEdge;
  if (bestEdge <= referenceEdge) referenceEdge += 1;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (!length2) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length2, 0, 1);
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

async function loadPhoto(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  stopCamera();
  try {
    photoBitmap?.close?.();
    photoBitmap = await createImageBitmap(file);
    photoNatural = { width: photoBitmap.width, height: photoBitmap.height };
    editPoints = clone(DEFAULT_POLYGON);
    selectedCorner = 0;
    referenceEdge = 0;
    drawScanStage();
  } catch {
    toast('Фото не открылось');
  } finally {
    event.target.value = '';
  }
}

function clearPhoto() {
  photoBitmap?.close?.();
  photoBitmap = null;
  drawScanStage();
}
