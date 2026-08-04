export const SCHEMA_VERSION = 1;

export const DURATION_BANDS = [
  { id: 'none', label: 'Без проникновения', rank: 0 },
  { id: 'under-30', label: 'До 30 секунд', rank: 1 },
  { id: '30-60', label: '30–60 секунд', rank: 2 },
  { id: '1-2', label: '1–2 минуты', rank: 3 },
  { id: '2-5', label: '2–5 минут', rank: 4 },
  { id: 'over-5', label: 'Больше 5 минут', rank: 5 }
];

export const DEFAULT_STATE = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  episodes: [],
  checkIns: [],
  techniqueSessions: [],
  products: [],
  exportState: { lastExportAt: null },
  settings: {
    includeNotesByDefault: false,
    exactDurationEnabled: false,
    neutralLabels: true
  }
});

const SCORE_KEYS = new Set([
  'desireBefore',
  'control',
  'pleasure',
  'anxiety',
  'erection',
  'satisfaction',
  'repeatDesire',
  'spontaneousDesire',
  'partnerDesire',
  'penetrationDesire',
  'oralDesire',
  'soloDesire',
  'energy',
  'mood',
  'stress',
  'effort',
  'numbness',
  'effect',
  'confidenceBefore',
  'confidenceAfter'
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createId(prefix = 'item', now = Date.now()) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${now.toString(36)}-${random}`;
}

export function clampScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(5, Math.round(number)));
}

function safeText(value, maxLength = 1000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function safeIso(value, fallback = new Date().toISOString()) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function sanitizeScores(record) {
  const next = { ...record };
  for (const key of SCORE_KEYS) {
    if (key in next) next[key] = clampScore(next[key]);
  }
  return next;
}

function sanitizeEpisode(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const band = DURATION_BANDS.some((item) => item.id === value.durationBand)
    ? value.durationBand
    : 'none';
  const exactSeconds = Number(value.exactSeconds);
  return sanitizeScores({
    id: safeText(value.id, 80) || createId('episode'),
    createdAt: safeIso(value.createdAt),
    occurredAt: safeIso(value.occurredAt || value.createdAt),
    type: safeText(value.type, 40) || 'mixed',
    durationBand: band,
    exactSeconds: Number.isFinite(exactSeconds) && exactSeconds >= 0 && exactSeconds <= 21600
      ? Math.round(exactSeconds)
      : null,
    desireBefore: value.desireBefore,
    control: value.control,
    pleasure: value.pleasure,
    anxiety: value.anxiety,
    erection: value.erection,
    satisfaction: value.satisfaction,
    repeatDesire: value.repeatDesire,
    context: Array.isArray(value.context)
      ? [...new Set(value.context.map((item) => safeText(item, 40)).filter(Boolean))].slice(0, 24)
      : [],
    techniqueId: safeText(value.techniqueId, 80) || null,
    productId: safeText(value.productId, 80) || null,
    notes: safeText(value.notes, 3000)
  });
}

function sanitizeCheckIn(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const erection = Number(value.morningErection);
  return sanitizeScores({
    id: safeText(value.id, 80) || createId('checkin'),
    createdAt: safeIso(value.createdAt),
    occurredAt: safeIso(value.occurredAt || value.createdAt),
    spontaneousDesire: value.spontaneousDesire,
    partnerDesire: value.partnerDesire,
    penetrationDesire: value.penetrationDesire,
    oralDesire: value.oralDesire,
    soloDesire: value.soloDesire,
    energy: value.energy,
    mood: value.mood,
    stress: value.stress,
    effort: value.effort,
    morningErection: Number.isFinite(erection) ? Math.max(0, Math.min(2, Math.round(erection))) : 0,
    notes: safeText(value.notes, 2000)
  });
}

function sanitizeTechniqueSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return sanitizeScores({
    id: safeText(value.id, 80) || createId('technique'),
    techniqueId: safeText(value.techniqueId, 80) || 'stop-start-solo',
    createdAt: safeIso(value.createdAt),
    startedAt: safeIso(value.startedAt || value.createdAt),
    completedAt: value.completedAt ? safeIso(value.completedAt) : null,
    status: ['completed', 'stopped', 'active'].includes(value.status) ? value.status : 'completed',
    cyclesCompleted: Math.max(0, Math.min(20, Math.round(Number(value.cyclesCompleted) || 0))),
    peakArousal: Math.max(0, Math.min(10, Math.round(Number(value.peakArousal) || 0))),
    control: value.control,
    pleasure: value.pleasure,
    anxiety: value.anxiety,
    confidenceBefore: value.confidenceBefore,
    confidenceAfter: value.confidenceAfter,
    productId: safeText(value.productId, 80) || null,
    numbness: value.numbness,
    effect: value.effect,
    transferObserved: Boolean(value.transferObserved),
    irritationObserved: Boolean(value.irritationObserved),
    notes: safeText(value.notes, 3000)
  });
}

function sanitizeProduct(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    id: safeText(value.id, 80) || createId('product'),
    createdAt: safeIso(value.createdAt),
    name: safeText(value.name, 160),
    activeIngredients: safeText(value.activeIngredients, 300),
    concentration: safeText(value.concentration, 160),
    labelDose: safeText(value.labelDose, 200),
    labelWait: safeText(value.labelWait, 200),
    labelledForPenileUse: Boolean(value.labelledForPenileUse),
    notes: safeText(value.notes, 1200)
  };
}

export function normalizeState(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const settings = source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings)
    ? source.settings
    : {};

  return {
    schemaVersion: SCHEMA_VERSION,
    episodes: Array.isArray(source.episodes) ? source.episodes.map(sanitizeEpisode).filter(Boolean) : [],
    checkIns: Array.isArray(source.checkIns) ? source.checkIns.map(sanitizeCheckIn).filter(Boolean) : [],
    techniqueSessions: Array.isArray(source.techniqueSessions)
      ? source.techniqueSessions.map(sanitizeTechniqueSession).filter(Boolean)
      : [],
    products: Array.isArray(source.products) ? source.products.map(sanitizeProduct).filter(Boolean) : [],
    exportState: {
      lastExportAt: source.exportState?.lastExportAt ? safeIso(source.exportState.lastExportAt) : null
    },
    settings: {
      includeNotesByDefault: Boolean(settings.includeNotesByDefault),
      exactDurationEnabled: Boolean(settings.exactDurationEnabled),
      neutralLabels: settings.neutralLabels !== false
    }
  };
}

export function median(values) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

export function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function durationBandRank(id) {
  return DURATION_BANDS.find((item) => item.id === id)?.rank ?? 0;
}

export function durationBandLabel(id) {
  return DURATION_BANDS.find((item) => item.id === id)?.label || 'Не указано';
}

export function medianDurationBand(episodes) {
  const ranks = episodes
    .filter((episode) => episode.durationBand && episode.durationBand !== 'none')
    .map((episode) => durationBandRank(episode.durationBand));
  const value = median(ranks);
  if (value == null) return null;
  const nearest = Math.max(1, Math.min(5, Math.round(value)));
  return DURATION_BANDS.find((item) => item.rank === nearest) || null;
}

export function dateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function filterByRange(items, range, now = new Date(), lastExportAt = null) {
  if (!Array.isArray(items)) return [];
  const end = now instanceof Date ? now : new Date(now);
  let start = null;
  if (range === '7d') start = new Date(end.getTime() - 7 * 86400000);
  if (range === '30d') start = new Date(end.getTime() - 30 * 86400000);
  if (range === '90d') start = new Date(end.getTime() - 90 * 86400000);
  if (range === 'since-export' && lastExportAt) start = new Date(lastExportAt);
  if (!start || Number.isNaN(start.getTime())) return [...items];
  return items.filter((item) => new Date(item.occurredAt || item.startedAt || item.createdAt) >= start);
}

export function summarizeEpisodes(episodes) {
  const source = Array.isArray(episodes) ? episodes : [];
  const penetration = source.filter((item) => item.durationBand && item.durationBand !== 'none');
  const techniqueCount = source.filter((item) => item.techniqueId).length;
  const productCount = source.filter((item) => item.productId).length;
  return {
    count: source.length,
    penetrationCount: penetration.length,
    medianDurationBand: medianDurationBand(penetration),
    medianControl: median(source.map((item) => item.control)),
    medianPleasure: median(source.map((item) => item.pleasure)),
    medianAnxiety: median(source.map((item) => item.anxiety)),
    medianSatisfaction: median(source.map((item) => item.satisfaction)),
    medianRepeatDesire: median(source.map((item) => item.repeatDesire)),
    techniqueCount,
    productCount
  };
}

export function summarizeCheckIns(checkIns) {
  const source = Array.isArray(checkIns) ? checkIns : [];
  return {
    count: source.length,
    spontaneousDesire: median(source.map((item) => item.spontaneousDesire)),
    partnerDesire: median(source.map((item) => item.partnerDesire)),
    penetrationDesire: median(source.map((item) => item.penetrationDesire)),
    oralDesire: median(source.map((item) => item.oralDesire)),
    soloDesire: median(source.map((item) => item.soloDesire)),
    energy: median(source.map((item) => item.energy)),
    mood: median(source.map((item) => item.mood)),
    stress: median(source.map((item) => item.stress)),
    effort: median(source.map((item) => item.effort))
  };
}

export function compareEpisodeGroups(episodes, predicate) {
  const source = Array.isArray(episodes) ? episodes : [];
  const active = source.filter(predicate);
  const baseline = source.filter((item) => !predicate(item));
  const activeSummary = summarizeEpisodes(active);
  const baselineSummary = summarizeEpisodes(baseline);
  return {
    active: activeSummary,
    baseline: baselineSummary,
    enoughData: active.length >= 3 && baseline.length >= 3,
    controlDelta: activeSummary.medianControl != null && baselineSummary.medianControl != null
      ? activeSummary.medianControl - baselineSummary.medianControl
      : null,
    satisfactionDelta: activeSummary.medianSatisfaction != null && baselineSummary.medianSatisfaction != null
      ? activeSummary.medianSatisfaction - baselineSummary.medianSatisfaction
      : null
  };
}

function score(value) {
  return value == null ? '—' : Number(value).toFixed(Number(value) % 1 ? 1 : 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function compactNotes(value, includeNotes) {
  if (!includeNotes || !value) return '';
  return `\n  - Заметка: ${value.replace(/\s+/g, ' ').trim()}`;
}

export function buildExportPayload(state, options = {}) {
  const normalized = normalizeState(state);
  const range = options.range || '30d';
  const now = options.now ? new Date(options.now) : new Date();
  const includeNotes = Boolean(options.includeNotes);
  const lastExportAt = normalized.exportState.lastExportAt;
  const stripNotes = (item) => includeNotes ? clone(item) : { ...clone(item), notes: '' };

  return {
    schema: 'tempo-report',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    range,
    scales: {
      subjectiveScores: '0 = минимум, 5 = максимум',
      morningErection: '0 = нет, 1 = частичная/редкая, 2 = выраженная',
      peakArousal: '0–10',
      durationBand: Object.fromEntries(DURATION_BANDS.map((item) => [item.id, item.label]))
    },
    data: {
      episodes: filterByRange(normalized.episodes, range, now, lastExportAt).map(stripNotes),
      checkIns: filterByRange(normalized.checkIns, range, now, lastExportAt).map(stripNotes),
      techniqueSessions: filterByRange(normalized.techniqueSessions, range, now, lastExportAt).map(stripNotes),
      products: normalized.products.map(stripNotes)
    }
  };
}

export function buildMarkdownReport(state, options = {}) {
  const payload = buildExportPayload(state, options);
  const { episodes, checkIns, techniqueSessions, products } = payload.data;
  const episodeSummary = summarizeEpisodes(episodes);
  const checkInSummary = summarizeCheckIns(checkIns);
  const productById = new Map(products.map((item) => [item.id, item]));
  const lines = [
    '# TEMPO — структурированный отчёт',
    '',
    `- Экспорт: ${formatDateTime(payload.exportedAt)}`,
    `- Период: ${payload.range}`,
    `- Схема: tempo-report v${payload.schemaVersion}`,
    `- Шкалы субъективных оценок: 0–5, где 0 — минимум, 5 — максимум.`,
    `- Записей эпизодов: ${episodes.length}; чек-инов: ${checkIns.length}; практик: ${techniqueSessions.length}.`,
    '',
    '## Сводка эпизодов',
    '',
    `- Медианный контроль: ${score(episodeSummary.medianControl)}/5`,
    `- Медианное удовольствие: ${score(episodeSummary.medianPleasure)}/5`,
    `- Медианная тревога: ${score(episodeSummary.medianAnxiety)}/5`,
    `- Медианная удовлетворённость: ${score(episodeSummary.medianSatisfaction)}/5`,
    `- Медианное желание повторить: ${score(episodeSummary.medianRepeatDesire)}/5`,
    `- Медианная категория длительности проникновения: ${episodeSummary.medianDurationBand?.label || 'недостаточно данных'}`,
    '',
    '## Сводка самочувствия',
    '',
    `- Спонтанное желание: ${score(checkInSummary.spontaneousDesire)}/5`,
    `- Желание близости с партнёршей: ${score(checkInSummary.partnerDesire)}/5`,
    `- Желание проникновения: ${score(checkInSummary.penetrationDesire)}/5`,
    `- Желание орального секса: ${score(checkInSummary.oralDesire)}/5`,
    `- Энергия: ${score(checkInSummary.energy)}/5; стресс: ${score(checkInSummary.stress)}/5; ощущение хлопотности секса: ${score(checkInSummary.effort)}/5`,
    '',
    '## Эпизоды',
    ''
  ];

  if (!episodes.length) lines.push('_Нет записей в выбранном периоде._');
  episodes
    .slice()
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
    .forEach((item, index) => {
      const product = item.productId ? productById.get(item.productId) : null;
      lines.push(
        `### E${index + 1} · ${formatDateTime(item.occurredAt)}`,
        `- Тип: ${item.type}`,
        `- Длительность: ${durationBandLabel(item.durationBand)}${item.exactSeconds != null ? ` (${item.exactSeconds} сек.)` : ''}`,
        `- Желание до: ${item.desireBefore}/5; контроль: ${item.control}/5; удовольствие: ${item.pleasure}/5`,
        `- Тревога: ${item.anxiety}/5; эрекция: ${item.erection}/5; удовлетворённость: ${item.satisfaction}/5`,
        `- Желание повторить: ${item.repeatDesire}/5`,
        `- Контекст: ${item.context.length ? item.context.join(', ') : 'не отмечен'}`,
        `- Техника: ${item.techniqueId || 'нет'}; средство: ${product?.name || item.productId || 'нет'}${compactNotes(item.notes, options.includeNotes)}`,
        ''
      );
    });

  lines.push('## Чек-ины', '');
  if (!checkIns.length) lines.push('_Нет чек-инов в выбранном периоде._');
  checkIns
    .slice()
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
    .forEach((item, index) => {
      lines.push(
        `### C${index + 1} · ${formatDateTime(item.occurredAt)}`,
        `- Спонтанное: ${item.spontaneousDesire}/5; с партнёршей: ${item.partnerDesire}/5; проникновение: ${item.penetrationDesire}/5`,
        `- Оральное: ${item.oralDesire}/5; самостоятельное: ${item.soloDesire}/5`,
        `- Энергия: ${item.energy}/5; настроение: ${item.mood}/5; стресс: ${item.stress}/5; хлопотность: ${item.effort}/5`,
        `- Утренняя эрекция: ${item.morningErection}/2${compactNotes(item.notes, options.includeNotes)}`,
        ''
      );
    });

  lines.push('## Практики', '');
  if (!techniqueSessions.length) lines.push('_Нет завершённых практик в выбранном периоде._');
  techniqueSessions
    .slice()
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
    .forEach((item, index) => {
      lines.push(
        `### T${index + 1} · ${formatDateTime(item.startedAt)}`,
        `- Протокол: ${item.techniqueId}; статус: ${item.status}; циклов: ${item.cyclesCompleted}`,
        `- Пик возбуждения: ${item.peakArousal}/10; контроль: ${item.control}/5; удовольствие: ${item.pleasure}/5; тревога: ${item.anxiety}/5`,
        `- Уверенность до/после: ${item.confidenceBefore}/5 → ${item.confidenceAfter}/5`,
        `- Онемение: ${item.numbness}/5; эффект: ${item.effect}/5; перенос партнёрше: ${item.transferObserved ? 'да' : 'нет'}; раздражение: ${item.irritationObserved ? 'да' : 'нет'}${compactNotes(item.notes, options.includeNotes)}`,
        ''
      );
    });

  lines.push(
    '## Инструкция для анализа',
    '',
    'Сначала оцени изменения контроля, удовольствия, тревоги и желания повторить. Длительность рассматривай как одну из метрик, а не единственную цель. Не делай выводов по группам меньше трёх наблюдений и отмечай возможные смешивающие факторы: стресс, усталость, интервал после предыдущей эякуляции, презерватив, спешка и применение средств.',
    ''
  );

  return lines.join('\n');
}
