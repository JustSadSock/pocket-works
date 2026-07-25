function drawScanStage() {
  const canvas = $('#scanCanvas');
  const stage = $('#scanStage');
  if (!canvas || !stage || stage.clientWidth < 2) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(stage.clientWidth * dpr);
  canvas.height = Math.round(stage.clientHeight * dpr);
  canvas.style.width = `${stage.clientWidth}px`;
  canvas.style.height = `${stage.clientHeight}px`;
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
  if (photoBitmap && scanMode === 'photo') drawPhotoCover(context, stage.clientWidth, stage.clientHeight);
  drawEditorGrid(context, stage.clientWidth, stage.clientHeight);
  drawEditorPolygon(context, stage.clientWidth, stage.clientHeight);
  updateScanSummary();
}

function drawPhotoCover(context, width, height) {
  const scale = Math.max(width / photoNatural.width, height / photoNatural.height);
  const drawWidth = photoNatural.width * scale;
  const drawHeight = photoNatural.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.save();
  context.globalAlpha = 0.72;
  context.drawImage(photoBitmap, x, y, drawWidth, drawHeight);
  context.restore();
}

function drawEditorGrid(context, width, height) {
  context.save();
  context.strokeStyle = 'rgba(238,233,223,.18)';
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 32) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 0; y < height; y += 32) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  context.restore();
}

function drawEditorPolygon(context, width, height) {
  if (!editPoints.length) return;
  const pixels = editPoints.map((point) => ({ x: point.x * width, y: point.y * height }));
  context.save();
  context.fillStyle = 'rgba(216,209,194,.18)';
  context.strokeStyle = '#eee9df';
  context.lineWidth = 2;
  context.beginPath();
  pixels.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
  context.fill();
  context.stroke();
  const a = pixels[referenceEdge % pixels.length];
  const b = pixels[(referenceEdge + 1) % pixels.length];
  context.strokeStyle = '#67a8d0';
  context.lineWidth = 5;
  context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
  pixels.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x, point.y, index === selectedCorner ? 10 : 7, 0, Math.PI * 2);
    context.fillStyle = index === selectedCorner ? '#67a8d0' : '#eee9df';
    context.fill();
    context.strokeStyle = '#20211f';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#20211f';
    context.font = '800 9px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(index + 1), point.x, point.y + 0.5);
  });
  context.restore();
}

function updateScanSummary() {
  const referenceMeters = Number($('#referenceWallInput')?.value);
  const room = inferRoomDimensions(editPoints, Number.isFinite(referenceMeters) && referenceMeters > 0 ? referenceMeters : null, referenceEdge);
  const sourceLabel = ({ manual: 'ручной контур', photo: 'обводка по фото', ar: 'AR-обход' })[scanMode];
  $('#scanSummary').innerHTML = `
    <div><small>Источник</small><strong>${sourceLabel}</strong></div>
    <div><small>Углы</small><strong>${editPoints.length}</strong></div>
    <div><small>Габарит</small><strong>${room.width.toFixed(1)} × ${room.length.toFixed(1)} м</strong></div>
  `;
}

function constrainStatePointsToPolygon(state, polygon) {
  if (!Array.isArray(state?.points)) return;
  const centroid = polygon.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  centroid.x /= polygon.length;
  centroid.y /= polygon.length;
  state.points.forEach((point, index) => {
    if (pointInPolygon(point, polygon)) return;
    const nearest = nearestPointOnPolygon(point, polygon);
    const nudge = 0.035 + (index % 3) * 0.012;
    point.x = clamp(nearest.x + (centroid.x - nearest.x) * nudge, 0.03, 0.97);
    point.y = clamp(nearest.y + (centroid.y - nearest.y) * nudge, 0.03, 0.97);
  });
}

function nearestPointOnPolygon(point, polygon) {
  let nearest = polygon[0];
  let bestDistance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy || 1;
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length2, 0, 1);
    const candidate = { x: a.x + dx * t, y: a.y + dy * t };
    const d = distance(point, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      nearest = candidate;
    }
  }
  return nearest;
}

function exportProjectWithGeometry(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const state = loadMainState();
  const payload = JSON.stringify({
    app: 'ОТКЛИК',
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    state,
    geometry
  }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const name = String(state?.projectName || 'room').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '') || 'room';
  anchor.href = url;
  anchor.download = `otklik-${name}.json`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Проект и форма комнаты экспортированы');
}

async function importGeometryFromProject(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.geometry && validPolygon(parsed.geometry.points)) {
      saveGeometry(parsed.geometry);
    }
  } catch {
  }
}

function installGeometryOverlay() {
  const observer = new ResizeObserver(scheduleGeometryDraw);
  observer.observe(mapFrame);
  $('#saveRoomButton')?.addEventListener('click', () => setTimeout(applyGeometry, 40));
}

function applyGeometry() {
  if (!validPolygon(geometry.points) || geometry.source === 'rectangle') {
    roomCanvas.style.clipPath = '';
  } else {
    roomCanvas.style.clipPath = polygonClipPath(geometry.points);
  }
  scheduleGeometryDraw();
}

function polygonClipPath(points) {
  const state = loadMainState();
  const room = calculateRoomRect(mapFrame.clientWidth, mapFrame.clientHeight, state?.room);
  return `polygon(${points.map((point) => {
    const x = ((room.x + point.x * room.width) / Math.max(1, mapFrame.clientWidth)) * 100;
    const y = ((room.y + point.y * room.height) / Math.max(1, mapFrame.clientHeight)) * 100;
    return `${x.toFixed(3)}% ${y.toFixed(3)}%`;
  }).join(',')})`;
}

function scheduleGeometryDraw() {
  cancelAnimationFrame(overlayFrame);
  overlayFrame = requestAnimationFrame(drawGeometryOverlay);
}

function drawGeometryOverlay() {
  const canvas = $('#geometryOverlay');
  if (!canvas || mapFrame.clientWidth < 2) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(mapFrame.clientWidth * dpr);
  canvas.height = Math.round(mapFrame.clientHeight * dpr);
  canvas.style.width = `${mapFrame.clientWidth}px`;
  canvas.style.height = `${mapFrame.clientHeight}px`;
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, mapFrame.clientWidth, mapFrame.clientHeight);
  if (geometry.source === 'rectangle') return;
  const state = loadMainState();
  const room = calculateRoomRect(mapFrame.clientWidth, mapFrame.clientHeight, state?.room);
  const points = geometry.points.map((point) => ({ x: room.x + point.x * room.width, y: room.y + point.y * room.height }));
  context.save();
  context.strokeStyle = '#20211f';
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
  context.stroke();
  const sourceLabel = ({ manual: 'контур', photo: 'фото', ar: 'AR' })[geometry.source] || 'контур';
  context.fillStyle = 'rgba(238,233,223,.92)';
  context.fillRect(room.x + 8, room.y + 8, 72, 20);
  context.fillStyle = '#20211f';
  context.font = '800 9px system-ui';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(`${sourceLabel} · ${points.length} угл.`, room.x + 14, room.y + 18);
  context.restore();
}

function calculateRoomRect(width, height, roomState) {
  const padding = Math.max(28, Math.min(width, height) * 0.09);
  const usableWidth = Math.max(20, width - padding * 2);
  const usableHeight = Math.max(20, height - padding * 2);
  const roomWidthMeters = Number(roomState?.width) || 4.2;
  const roomLengthMeters = Number(roomState?.length) || 5.5;
  const aspect = roomWidthMeters / roomLengthMeters;
  let roomWidth = usableWidth;
  let roomHeight = roomWidth / aspect;
  if (roomHeight > usableHeight) {
    roomHeight = usableHeight;
    roomWidth = roomHeight * aspect;
  }
  return { x: (width - roomWidth) / 2, y: (height - roomHeight) / 2, width: roomWidth, height: roomHeight };
}

function guardPolygonPointer(event) {
  if (geometry.source === 'rectangle' || !validPolygon(geometry.points)) return;
  const rect = roomCanvas.getBoundingClientRect();
  const room = calculateRoomRect(rect.width, rect.height, loadMainState()?.room);
  const point = {
    x: (event.clientX - rect.left - room.x) / room.width,
    y: (event.clientY - rect.top - room.y) / room.height
  };
  if (!pointInPolygon(point, geometry.points)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'pointerup') toast('Точка должна находиться внутри комнаты');
  }
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function installRecommendationLayer() {
  if (!resultSheet) return;
  const observer = new MutationObserver(scheduleRecommendations);
  observer.observe(resultSheet, { attributes: true, subtree: true, childList: true, characterData: true });
  scheduleRecommendations();
}

function scheduleRecommendations() {
  cancelAnimationFrame(recommendationFrame);
  recommendationFrame = requestAnimationFrame(renderRecommendations);
}

function renderRecommendations() {
  const container = $('#plainRecommendations');
  if (!container || resultSheet.hidden) return;
  const state = loadMainState();
  const match = ($('#resultSheetKicker')?.textContent || '').match(/ТОЧКА\s+(\d+)/i);
  const index = match ? Number(match[1]) - 1 : -1;
  const point = state?.points?.[index];
  const measurement = point?.measurement;
  if (!measurement) return;
  const recommendations = buildRecommendations(measurement, state, index);
  container.innerHTML = `
    <header><small>ЧТО ДЕЛАТЬ</small><strong>${recommendations.headline}</strong></header>
    <ol>${recommendations.items.map((item) => `<li><b>${item.action}</b><span>${item.reason}</span></li>`).join('')}</ol>
  `;
}

function buildRecommendations(measurement, state, index) {
  const items = [];
  if (measurement.demo) {
    return {
      headline: 'Это только пример интерфейса',
      items: [{ action: 'Сделай реальный замер', reason: 'Демо-цифры не описывают помещение и не должны влиять на перестановку.' }]
    };
  }
  if (measurement.noiseDb > -38) {
    items.push({ action: 'Повтори замер в более тихий момент', reason: 'Фон высокий, поэтому приложение хуже отделяет комнату от вентиляции, улицы и разговоров.' });
  }
  if (measurement.boom > 7) {
    items.push({ action: 'Сдвинь точку на 30–60 см от ближайшей стены или угла', reason: 'Сильный басовый избыток чаще лечится положением, а не эквалайзером.' });
  } else if (measurement.boom > 3) {
    items.push({ action: 'Попробуй сдвиг на 20–40 см', reason: 'Бас уже заметно выпирает, но радикальная перестановка пока не нужна.' });
  } else if (measurement.boom < -6) {
    items.push({ action: 'Передвинь точку на 20–50 см и измерь снова', reason: 'Здесь низкие частоты проваливаются; маленький сдвиг может вернуть их без усиления громкости.' });
  }
  if (measurement.decay > 1.3) {
    const area = clamp((Number(state?.room?.width) || 4) * (Number(state?.room?.length) || 5) * 0.12, 2, 6);
    items.push({ action: `Добавь примерно ${area.toFixed(0)}–${Math.ceil(area + 1)} м² мягкой поверхности`, reason: 'Ковёр, плотные шторы или тканевая мебель на большой голой плоскости сократят эхо лучше мелкого декора.' });
  } else if (measurement.decay > 0.85) {
    items.push({ action: 'Закрой шторы или добавь одну крупную мягкую поверхность', reason: 'Эхо уже слышно, но помещение не требует превращения в студию из поролоновых пирамид.' });
  }
  if (measurement.clarityScore < 60) {
    const measured = (state?.points || []).map((candidate, pointIndex) => ({ pointIndex, measurement: candidate.measurement })).filter((entry) => entry.measurement && !entry.measurement.demo);
    const best = measured.sort((a, b) => b.measurement.clarityScore - a.measurement.clarityScore)[0];
    if (best && best.pointIndex !== index && best.measurement.clarityScore - measurement.clarityScore >= 6) {
      items.push({ action: `Для звонков или записи используй точку ${best.pointIndex + 1}`, reason: `Она лучше текущей на ${Math.round(best.measurement.clarityScore - measurement.clarityScore)} пунктов разборчивости.` });
    }
  }
  if (!items.length) {
    items.push({ action: 'Оставь точку как есть', reason: 'Явной акустической проблемы не видно. Не надо чинить комнату только потому, что приложение умеет выдавать советы.' });
  }
  const headline = measurement.clarityScore >= 80
    ? 'Точка уже хорошая'
    : measurement.clarityScore >= 62
      ? 'Есть один-два понятных улучшения'
      : 'Сначала исправь положение, потом материалы';
  return { headline, items: items.slice(0, 4) };
}

function toast(message) {
  const element = $('#toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('is-visible'), 2400);
}

function bootScanner() {
  if (!appShell || !mapFrame || !roomCanvas) {
    console.warn('OTKLIK room scanner could not find the application shell.');
    return;
  }
  installMarkup();
  bindScanner();
  relabelInterface();
  installGeometryOverlay();
  installRecommendationLayer();
  applyGeometry();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => setTimeout(bootScanner, 0), { once: true });
} else {
  setTimeout(bootScanner, 0);
}
