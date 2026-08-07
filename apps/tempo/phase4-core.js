export const SEGMENT_STORAGE_KEY = 'pocket-works:tempo:segments:state';
export const SEGMENT_SCHEMA_VERSION = 1;

export const ACTIVITY_OPTIONS = [
  { id: 'penetration', label: 'Проникновение / фрикции', short: 'Проникновение', legacyType: 'penetration' },
  { id: 'oral-received', label: 'Оральная стимуляция мне', short: 'Орально мне', legacyType: 'oral' },
  { id: 'oral-given', label: 'Оральная стимуляция партнёру', short: 'Орально партнёру', legacyType: 'oral' },
  { id: 'manual-received', label: 'Ручная стимуляция мне', short: 'Руками мне', legacyType: 'manual' },
  { id: 'manual-given', label: 'Ручная стимуляция партнёру', short: 'Руками партнёру', legacyType: 'manual' },
  { id: 'solo', label: 'Самостоятельная стимуляция', short: 'Самостоятельно', legacyType: 'solo' },
  { id: 'pause', label: 'Пауза / восстановление', short: 'Пауза', legacyType: 'mixed' },
  { id: 'touch', label: 'Поцелуи / прикосновения / другое', short: 'Другое', legacyType: 'mixed' }
];

export const SEGMENT_TECHNIQUES = [
  { id: 'stop-start', label: 'Stop–start' },
  { id: 'slow-down', label: 'Снизил темп' },
  { id: 'full-pause', label: 'Полная пауза' },
  { id: 'switch-activity', label: 'Переключился на другое' },
  { id: 'withdrawal', label: 'Вышел / прекратил фрикции' },
  { id: 'squeeze', label: 'Сжатие' },
  { id: 'breathing-focus', label: 'Дыхание / расслабление' },
  { id: 'topical', label: 'Местное средство' }
];

const ACTIVITY_IDS = new Set(ACTIVITY_OPTIONS.map((item) => item.id));
const TECHNIQUE_IDS = new Set(SEGMENT_TECHNIQUES.map((item) => item.id));
const EXPERIMENT_PHASES = new Set(['baseline', 'intervention']);

function text(value, max = 1200) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : '';
}
function intOrNull(value, min, max) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}
function int(value, min, max, fallback = 0) {
  return intOrNull(value, min, max) ?? fallback;
}
function iso(value, fallback = new Date().toISOString()) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function segmentId(now = Date.now()) {
  return `segment-${Number(now).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeSegment(value = {}, index = 0) {
  const activity = ACTIVITY_IDS.has(value.activity) ? value.activity : 'penetration';
  const techniques = Array.isArray(value.techniques)
    ? [...new Set(value.techniques.filter((item) => TECHNIQUE_IDS.has(item)))].slice(0, 8)
    : [];
  return {
    id: text(value.id, 80) || segmentId(Date.now() + index),
    activity,
    durationSeconds: intOrNull(value.durationSeconds, 0, 21600),
    techniques,
    stopStartCycles: techniques.includes('stop-start') ? int(value.stopStartCycles, 0, 30, 0) : 0,
    control: intOrNull(value.control, 0, 5),
    pleasure: intOrNull(value.pleasure, 0, 5),
    anxiety: intOrNull(value.anxiety, 0, 5),
    peakArousal: intOrNull(value.peakArousal, 0, 10),
    orgasmCount: int(value.orgasmCount, 0, 10, 0),
    ejaculationCount: int(value.ejaculationCount, 0, 10, 0),
    productId: text(value.productId, 80) || null,
    experimentId: text(value.experimentId, 80) || null,
    experimentPhase: EXPERIMENT_PHASES.has(value.experimentPhase) ? value.experimentPhase : null,
    notes: text(value.notes, 1200)
  };
}

export function normalizeEpisodeDetail(value = {}) {
  const segments = Array.isArray(value.segments)
    ? value.segments.slice(0, 24).map((segment, index) => normalizeSegment(segment, index))
    : [];
  return {
    episodeId: text(value.episodeId, 80),
    createdAt: iso(value.createdAt),
    segments
  };
}

export function normalizeSegmentState(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const raw = source.episodeDetails && typeof source.episodeDetails === 'object' && !Array.isArray(source.episodeDetails)
    ? source.episodeDetails
    : {};
  const episodeDetails = {};
  for (const [episodeId, value] of Object.entries(raw)) {
    const detail = normalizeEpisodeDetail({ ...value, episodeId });
    if (detail.episodeId && detail.segments.length) episodeDetails[detail.episodeId] = detail;
  }
  return { schemaVersion: SEGMENT_SCHEMA_VERSION, episodeDetails };
}

export function createSegment(activity = 'penetration', overrides = {}) {
  return normalizeSegment({ activity, ...overrides });
}

export function durationBandFromSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 'none';
  if (value < 30) return 'under-30';
  if (value < 60) return '30-60';
  if (value < 120) return '1-2';
  if (value < 300) return '2-5';
  return 'over-5';
}

export function aggregateLegacy(segments) {
  const normalized = (Array.isArray(segments) ? segments : []).map((segment, index) => normalizeSegment(segment, index));
  const activityTypes = [...new Set(normalized.filter((item) => item.activity !== 'pause').map((item) => ACTIVITY_OPTIONS.find((option) => option.id === item.activity)?.legacyType || 'mixed'))];
  const type = activityTypes.length === 1 ? activityTypes[0] : 'mixed';
  const penetrationSeconds = normalized
    .filter((item) => item.activity === 'penetration')
    .reduce((sum, item) => sum + (item.durationSeconds || 0), 0);
  const totalSeconds = normalized.reduce((sum, item) => sum + (item.durationSeconds || 0), 0);
  const techniques = new Set(normalized.flatMap((item) => item.techniques));
  let techniqueId = null;
  if (techniques.has('stop-start')) techniqueId = normalized.some((item) => item.activity === 'solo') ? 'stop-start-solo' : 'stop-start-partner';
  else if (techniques.has('switch-activity') || techniques.has('withdrawal')) techniqueId = 'interval-switch';
  else if (techniques.has('topical')) techniqueId = 'topical-observation';
  const productId = normalized.find((item) => item.productId)?.productId || null;
  const linked = normalized.filter((item) => item.experimentId && item.experimentPhase);
  const experimentIds = [...new Set(linked.map((item) => item.experimentId))];
  const phases = [...new Set(linked.map((item) => item.experimentPhase))];
  return {
    type,
    durationBand: durationBandFromSeconds(penetrationSeconds),
    penetrationSeconds,
    totalSeconds,
    techniqueId,
    productId,
    uniformExperimentId: experimentIds.length === 1 ? experimentIds[0] : null,
    uniformExperimentPhase: experimentIds.length === 1 && phases.length === 1 ? phases[0] : null
  };
}

export function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '—';
  const total = Math.round(Number(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 1) return `${rest} с`;
  return rest ? `${minutes}:${String(rest).padStart(2, '0')}` : `${minutes} мин`;
}

export function summarizeSegments(segments) {
  const normalized = (Array.isArray(segments) ? segments : []).map((segment, index) => normalizeSegment(segment, index));
  const activities = normalized.map((item) => ACTIVITY_OPTIONS.find((option) => option.id === item.activity)?.short || item.activity);
  const techniques = [...new Set(normalized.flatMap((item) => item.techniques))];
  return {
    count: normalized.length,
    knownDurationCount: normalized.filter((item) => item.durationSeconds != null).length,
    totalSeconds: normalized.reduce((sum, item) => sum + (item.durationSeconds || 0), 0),
    penetrationSeconds: normalized.filter((item) => item.activity === 'penetration').reduce((sum, item) => sum + (item.durationSeconds || 0), 0),
    orgasmCount: normalized.reduce((sum, item) => sum + item.orgasmCount, 0),
    ejaculationCount: normalized.reduce((sum, item) => sum + item.ejaculationCount, 0),
    stopStartCycles: normalized.reduce((sum, item) => sum + item.stopStartCycles, 0),
    activities,
    techniques
  };
}

export function filterSegmentState(segmentState, episodeIds) {
  const state = normalizeSegmentState(segmentState);
  const allowed = new Set(Array.isArray(episodeIds) ? episodeIds : []);
  return {
    schemaVersion: SEGMENT_SCHEMA_VERSION,
    episodeDetails: Object.fromEntries(Object.entries(state.episodeDetails).filter(([episodeId]) => allowed.has(episodeId)))
  };
}

export function segmentExperimentSummary(segmentState, experimentId, metric = 'control') {
  const state = normalizeSegmentState(segmentState);
  const rows = Object.values(state.episodeDetails).flatMap((detail) => detail.segments)
    .filter((segment) => segment.experimentId === experimentId && segment.experimentPhase);
  const baseline = rows.filter((segment) => segment.experimentPhase === 'baseline');
  const intervention = rows.filter((segment) => segment.experimentPhase === 'intervention');
  const median = (values) => {
    const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!numbers.length) return null;
    const mid = Math.floor(numbers.length / 2);
    return numbers.length % 2 ? numbers[mid] : (numbers[mid - 1] + numbers[mid]) / 2;
  };
  const allowed = new Set(['control', 'pleasure', 'anxiety']);
  const usableMetric = allowed.has(metric) ? metric : null;
  const baselineMedian = usableMetric ? median(baseline.map((item) => item[usableMetric])) : null;
  const interventionMedian = usableMetric ? median(intervention.map((item) => item[usableMetric])) : null;
  const rawDelta = baselineMedian == null || interventionMedian == null ? null : interventionMedian - baselineMedian;
  const adjustedDelta = rawDelta == null ? null : rawDelta * (usableMetric === 'anxiety' ? -1 : 1);
  return {
    baselineCount: baseline.length,
    interventionCount: intervention.length,
    metric: usableMetric,
    baselineMedian,
    interventionMedian,
    adjustedDelta
  };
}

export function appendDetailedMarkdown(baseMarkdown, foundationState, segmentState) {
  const state = normalizeSegmentState(segmentState);
  const episodes = new Map((foundationState?.episodes || []).map((episode) => [episode.id, episode]));
  const details = Object.values(state.episodeDetails)
    .filter((detail) => episodes.has(detail.episodeId))
    .sort((a, b) => new Date(episodes.get(b.episodeId)?.occurredAt || b.createdAt) - new Date(episodes.get(a.episodeId)?.occurredAt || a.createdAt));
  if (!details.length) return String(baseMarkdown || '');
  const techniqueLabels = new Map(SEGMENT_TECHNIQUES.map((item) => [item.id, item.label]));
  const activityLabels = new Map(ACTIVITY_OPTIONS.map((item) => [item.id, item.label]));
  const lines = [String(baseMarkdown || '').trimEnd(), '', '## Детальная структура эпизодов'];
  for (const detail of details) {
    const episode = episodes.get(detail.episodeId);
    lines.push('', `### ${episode?.occurredAt || detail.createdAt}`);
    detail.segments.forEach((segment, index) => {
      const extras = [];
      if (segment.techniques.length) extras.push(`приёмы: ${segment.techniques.map((id) => techniqueLabels.get(id) || id).join(', ')}`);
      if (segment.stopStartCycles) extras.push(`stop–start циклов: ${segment.stopStartCycles}`);
      if (segment.control != null) extras.push(`контроль: ${segment.control}/5`);
      if (segment.pleasure != null) extras.push(`удовольствие: ${segment.pleasure}/5`);
      if (segment.anxiety != null) extras.push(`напряжение: ${segment.anxiety}/5`);
      if (segment.peakArousal != null) extras.push(`пик: ${segment.peakArousal}/10`);
      if (segment.orgasmCount) extras.push(`оргазмов: ${segment.orgasmCount}`);
      if (segment.ejaculationCount) extras.push(`эякуляций: ${segment.ejaculationCount}`);
      if (segment.experimentId && segment.experimentPhase) extras.push(`эксперимент: ${segment.experimentPhase}`);
      lines.push(`- ${index + 1}. ${activityLabels.get(segment.activity) || segment.activity} — ${segment.durationSeconds == null ? 'длительность не указана' : formatDuration(segment.durationSeconds)}${extras.length ? `; ${extras.join('; ')}` : ''}`);
    });
  }
  return `${lines.join('\n')}\n`;
}
