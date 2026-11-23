// Pure historical timeline functions. All story timestamps are year coordinates:
// negative = BCE, positive = CE. Historical year zero is never valid in scenario data.
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, ratio) => a + (b - a) * ratio;
export const span = (range) => range[1] - range[0];
export const fraction = (time, range) => clamp((time - range[0]) / Math.max(0.00001, span(range)), 0, 1);

export function formatYear(value) {
  const year = Math.trunc(value);
  if (year === 0) return 'граница эр';
  return year < 0 ? Math.abs(year) + ' до н. э.' : year + ' г.';
}

export function displayYear(value) {
  const year = Math.trunc(value);
  return String(Math.abs(year));
}

export function era(value) {
  return value < 0 ? 'ДО Н. Э.' : 'НАШЕЙ ЭРЫ';
}

export function listEvents(story) {
  return [...story.events].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function eventBefore(story, time) {
  const events = story.events;
  let active = null;
  for (const event of events) {
    if (event.time <= time + 0.000001) active = event;
    else break;
  }
  return active;
}

export function previousEvent(story, time) {
  for (let i = story.events.length - 1; i >= 0; i--) {
    if (story.events[i].time < time - 0.0001) return story.events[i];
  }
  return story.events[0] || null;
}

export function nextEvent(story, time) {
  return story.events.find((event) => event.time > time + 0.0001) || null;
}

export function closestEvent(story, time) {
  return story.events.reduce((best, event) =>
    !best || Math.abs(event.time - time) < Math.abs(best.time - time) ? event : best, null);
}

export function visibleAt(item, time) {
  return (item.from == null || item.from <= time) && (item.until == null || item.until >= time);
}

export function snapshotAt(story, time) {
  return {
    time: clamp(time, story.range[0], story.range[1]),
    entities: story.entities.filter((item) => visibleAt(item, time)),
    features: (story.features || []).filter((item) => visibleAt(item, time)),
    paths: (story.paths || []).filter((item) => visibleAt(item, time)),
    currentEvent: eventBefore(story, time)
  };
}

export function eventPressure(story, time) {
  const radius = Math.max(0.5, span(story.range) * 0.05);
  return story.events.reduce((acc, item) => {
    const distance = Math.abs(item.time - time);
    return acc + (distance > radius ? 0 : (item.importance || 1) * (1 - distance / radius));
  }, 0);
}

export function playbackStep(story, time, timeWindow, dtSeconds) {
  const fullRate = span(story.range) / 55;
  const detailRate = span(timeWindow) / 15;
  const pressure = eventPressure(story, time);
  const slowing = 1 / (1 + pressure * 0.26);
  return Math.max(0, dtSeconds) * Math.min(fullRate, detailRate) * slowing;
}

export function fittedWindow(fullRange, focus, desiredSpan) {
  const complete = span(fullRange);
  const size = clamp(desiredSpan, Math.min(complete, Math.max(0.5, complete / 180)), complete);
  let start = focus - size / 2;
  start = clamp(start, fullRange[0], fullRange[1] - size);
  return [start, start + size];
}

export function zoomWindow(fullRange, currentWindow, focus, multiplier) {
  const oldSize = span(currentWindow);
  const size = oldSize * multiplier;
  const relative = clamp((focus - currentWindow[0]) / oldSize, 0, 1);
  const target = clamp(size, Math.min(span(fullRange), Math.max(0.5, span(fullRange) / 180)), span(fullRange));
  let start = focus - relative * target;
  start = clamp(start, fullRange[0], fullRange[1] - target);
  return [start, start + target];
}

export function panWindow(fullRange, currentWindow, deltaTime) {
  const size = span(currentWindow);
  const start = clamp(currentWindow[0] + deltaTime, fullRange[0], fullRange[1] - size);
  return [start, start + size];
}

export function smartTicks(window, maxCount = 6) {
  const distance = span(window);
  const raw = distance / Math.max(1, maxCount - 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const scaled = raw / pow;
  const step = (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * pow;
  const ticks = [];
  let current = Math.ceil(window[0] / step) * step;
  for (let i = 0; i < 64 && current <= window[1] + step * 0.001; i++, current += step) {
    if (Math.abs(current) < 0.0001) continue; // historical calendars have no zero year
    ticks.push(Math.round(current * 10000) / 10000);
  }
  return ticks;
}

export function validateStory(story) {
  const errors = [];
  if (!story || typeof story !== 'object') return ['Нет данных сценария'];
  if (!story.id || typeof story.title !== 'string') errors.push('Нет идентификатора или названия');
  if (!Array.isArray(story.range) || story.range.length !== 2 || story.range.some((n) => !Number.isFinite(n)) || story.range[0] >= story.range[1]) errors.push('Неправильный диапазон времени');
  if (!story.world || !(story.world.width > 0 && story.world.height > 0)) errors.push('Неверный размер сцены');
  if (!Array.isArray(story.events) || story.events.length === 0) errors.push('Пустая хронология');
  if (!Array.isArray(story.entities)) errors.push('Нет массива объектов');
  if (!Array.isArray(story.sources)) errors.push('Нет реестра источников');
  if (errors.length) return errors;
  const ids = new Set(), sourceIds = new Set(story.sources.map((source) => source.id));
  for (const event of story.events) {
    if (!event.id || ids.has(event.id)) errors.push('Повторён ID события ' + event.id);
    ids.add(event.id);
    if (!Number.isFinite(event.time) || event.time < story.range[0] || event.time > story.range[1] || event.time === 0) errors.push('Неверное время ' + event.id);
    for (const sourceId of event.sources || []) if (!sourceIds.has(sourceId)) errors.push('Не найден источник ' + sourceId);
  }
  for (let i = 1; i < story.events.length; i++) {
    if (story.events[i].time < story.events[i-1].time) errors.push('Хронология не отсортирована');
  }
  const entityIds = new Set();
  for (const entity of story.entities) {
    if (!entity.id || entityIds.has(entity.id)) errors.push('Повторён ID объекта ' + entity.id);
    entityIds.add(entity.id);
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) errors.push('Нет координат ' + entity.id);
    for (const sourceId of entity.sources || []) if (!sourceIds.has(sourceId)) errors.push('Не найден источник ' + sourceId);
  }
  return errors;
}
