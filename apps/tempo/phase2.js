export const PHASE2_NAMESPACE = 'pocket-works:tempo:phase2';
export const PHASE2_STORE_VERSION = 1;

export const PHASE2_DEFAULT_STATE = Object.freeze({
  experiments: [],
  links: [],
  customProtocols: []
});

export const EXPERIMENT_METRICS = [
  { id: 'control', label: 'Контроль', direction: 1 },
  { id: 'pleasure', label: 'Удовольствие', direction: 1 },
  { id: 'satisfaction', label: 'Удовлетворённость', direction: 1 },
  { id: 'repeatDesire', label: 'Желание повторить', direction: 1 },
  { id: 'anxiety', label: 'Напряжение', direction: -1 }
];

export const EXPERIMENT_STATUSES = new Set(['planned', 'active', 'paused', 'completed', 'archived']);
export const EXPERIMENT_PHASES = new Set(['baseline', 'intervention']);
export const FACTOR_KINDS = new Set(['technique', 'product', 'context', 'custom']);

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const safeText = (value, max = 1000) => typeof value === 'string'
  ? value.replace(/\u0000/g, '').trim().slice(0, max)
  : '';
const safeIso = (value, fallback = new Date().toISOString()) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};
const clampInt = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
};
const median = (values) => {
  const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
};

export function phase2Id(prefix = 'phase2', now = Date.now()) {
  return `${prefix}-${Number(now).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeExperiment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const metric = EXPERIMENT_METRICS.some((item) => item.id === value.targetMetric)
    ? value.targetMetric
    : 'control';
  const kind = FACTOR_KINDS.has(value.factorKind) ? value.factorKind : 'custom';
  const status = EXPERIMENT_STATUSES.has(value.status) ? value.status : 'planned';
  const createdAt = safeIso(value.createdAt);
  return {
    id: safeText(value.id, 80) || phase2Id('experiment'),
    createdAt,
    startedAt: value.startedAt ? safeIso(value.startedAt) : null,
    completedAt: value.completedAt ? safeIso(value.completedAt) : null,
    status,
    title: safeText(value.title, 160) || 'Без названия',
    hypothesis: safeText(value.hypothesis, 1200),
    factorKind: kind,
    factorValue: safeText(value.factorValue, 160),
    factorLabel: safeText(value.factorLabel, 200) || safeText(value.factorValue, 160) || 'Изменение',
    targetMetric: metric,
    sampleTarget: clampInt(value.sampleTarget, 3, 12, 3),
    notes: safeText(value.notes, 1800)
  };
}

function sanitizeLink(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entryType = value.entryType === 'technique' ? 'technique' : 'episode';
  const phase = EXPERIMENT_PHASES.has(value.phase) ? value.phase : 'intervention';
  const entryId = safeText(value.entryId, 80);
  const experimentId = safeText(value.experimentId, 80);
  if (!entryId || !experimentId) return null;
  return {
    entryType,
    entryId,
    experimentId,
    phase,
    createdAt: safeIso(value.createdAt)
  };
}

function sanitizeCustomProtocol(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const title = safeText(value.title, 140);
  const steps = Array.isArray(value.steps)
    ? value.steps.map((step) => safeText(step, 500)).filter(Boolean).slice(0, 12)
    : [];
  if (!title || !steps.length) return null;
  return {
    id: safeText(value.id, 80) || phase2Id('protocol'),
    createdAt: safeIso(value.createdAt),
    archived: Boolean(value.archived),
    custom: true,
    code: safeText(value.code, 8) || 'U',
    title,
    summary: safeText(value.summary, 500),
    cycles: clampInt(value.cycles, 0, 8, 3),
    pause: clampInt(value.pause, 0, 180, 30),
    steps
  };
}

export function normalizePhase2State(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const experiments = Array.isArray(source.experiments)
    ? source.experiments.map(sanitizeExperiment).filter(Boolean)
    : [];
  const experimentIds = new Set(experiments.map((item) => item.id));
  const links = Array.isArray(source.links)
    ? source.links.map(sanitizeLink).filter((item) => item && experimentIds.has(item.experimentId))
    : [];
  const dedupedLinks = [...new Map(links.map((item) => [`${item.entryType}:${item.entryId}`, item])).values()];
  return {
    experiments,
    links: dedupedLinks,
    customProtocols: Array.isArray(source.customProtocols)
      ? source.customProtocols.map(sanitizeCustomProtocol).filter(Boolean)
      : []
  };
}

export function createExperiment(data = {}, now = new Date()) {
  const timestamp = now instanceof Date ? now.toISOString() : safeIso(now);
  return sanitizeExperiment({
    ...data,
    id: data.id || phase2Id('experiment', new Date(timestamp).getTime()),
    createdAt: timestamp,
    startedAt: data.status === 'active' ? timestamp : data.startedAt,
    status: data.status || 'active'
  });
}

export function createCustomProtocol(data = {}, now = new Date()) {
  const timestamp = now instanceof Date ? now.toISOString() : safeIso(now);
  return sanitizeCustomProtocol({
    ...data,
    id: data.id || phase2Id('protocol', new Date(timestamp).getTime()),
    createdAt: timestamp,
    steps: Array.isArray(data.steps)
      ? data.steps
      : safeText(data.steps, 5000).split(/\r?\n/).map((step) => step.trim()).filter(Boolean)
  });
}

export function activeExperiment(phase2State) {
  return normalizePhase2State(phase2State).experiments.find((item) => item.status === 'active') || null;
}

export function allProtocols(builtIns, phase2State, { includeArchived = false } = {}) {
  const custom = normalizePhase2State(phase2State).customProtocols
    .filter((item) => includeArchived || !item.archived);
  return [...(Array.isArray(builtIns) ? builtIns : []), ...custom];
}

export function linkEntry(phase2State, link) {
  const state = normalizePhase2State(phase2State);
  const normalized = sanitizeLink({ ...link, createdAt: link.createdAt || new Date().toISOString() });
  if (!normalized || !state.experiments.some((item) => item.id === normalized.experimentId)) return state;
  state.links = state.links.filter((item) => !(item.entryType === normalized.entryType && item.entryId === normalized.entryId));
  state.links.push(normalized);
  return state;
}

export function removeEntryLink(phase2State, entryType, entryId) {
  const state = normalizePhase2State(phase2State);
  state.links = state.links.filter((item) => !(item.entryType === entryType && item.entryId === entryId));
  return state;
}

export function setExperimentStatus(phase2State, experimentId, status, now = new Date()) {
  if (!EXPERIMENT_STATUSES.has(status)) return normalizePhase2State(phase2State);
  const state = normalizePhase2State(phase2State);
  const timestamp = now instanceof Date ? now.toISOString() : safeIso(now);
  if (status === 'active') {
    state.experiments = state.experiments.map((item) => item.status === 'active'
      ? { ...item, status: 'paused' }
      : item);
  }
  state.experiments = state.experiments.map((item) => {
    if (item.id !== experimentId) return item;
    return {
      ...item,
      status,
      startedAt: status === 'active' ? (item.startedAt || timestamp) : item.startedAt,
      completedAt: status === 'completed' ? timestamp : item.completedAt
    };
  });
  return state;
}

function entryLookup(coreState) {
  return {
    episode: new Map((coreState?.episodes || []).map((item) => [item.id, item])),
    technique: new Map((coreState?.techniqueSessions || []).map((item) => [item.id, item]))
  };
}

function samplesForExperiment(coreState, phase2State, experimentId, phase) {
  const lookup = entryLookup(coreState);
  return normalizePhase2State(phase2State).links
    .filter((link) => link.experimentId === experimentId && link.phase === phase)
    .map((link) => lookup[link.entryType]?.get(link.entryId))
    .filter(Boolean);
}

function dominantValue(items, reader) {
  const counts = new Map();
  for (const item of items) {
    const value = reader(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  return { value: sorted[0][0], ratio: sorted[0][1] / items.length };
}

function detectConfounders(baseline, intervention, experiment) {
  if (baseline.length < 3 || intervention.length < 3) return [];
  const warnings = [];
  const dimensions = [
    ['type', 'Тип эпизода', (item) => item.type],
    ['technique', 'Техника', (item) => item.techniqueId],
    ['product', 'Средство', (item) => item.productId]
  ];
  for (const [kind, label, reader] of dimensions) {
    if (experiment.factorKind === kind) continue;
    const before = dominantValue(baseline, reader);
    const after = dominantValue(intervention, reader);
    if (before && after && before.value !== after.value && before.ratio >= 0.5 && after.ratio >= 0.5) {
      warnings.push(`${label} тоже заметно изменился — эффект нельзя уверенно приписать одному фактору.`);
    }
  }
  const contexts = new Set([...baseline, ...intervention].flatMap((item) => item.context || []));
  for (const context of contexts) {
    if (experiment.factorKind === 'context' && experiment.factorValue === context) continue;
    const before = baseline.filter((item) => item.context?.includes(context)).length / baseline.length;
    const after = intervention.filter((item) => item.context?.includes(context)).length / intervention.length;
    if (Math.abs(after - before) >= 0.5) {
      warnings.push(`Контекст «${context}» встречался в группах слишком по-разному.`);
      if (warnings.length >= 3) break;
    }
  }
  return warnings;
}

export function evaluateExperiment(coreState, phase2State, experimentOrId) {
  const state = normalizePhase2State(phase2State);
  const experiment = typeof experimentOrId === 'string'
    ? state.experiments.find((item) => item.id === experimentOrId)
    : sanitizeExperiment(experimentOrId);
  if (!experiment) return null;
  const metric = EXPERIMENT_METRICS.find((item) => item.id === experiment.targetMetric) || EXPERIMENT_METRICS[0];
  const baselineEntries = samplesForExperiment(coreState, state, experiment.id, 'baseline');
  const interventionEntries = samplesForExperiment(coreState, state, experiment.id, 'intervention');
  const baselineValues = baselineEntries.map((item) => Number(item[metric.id])).filter(Number.isFinite);
  const interventionValues = interventionEntries.map((item) => Number(item[metric.id])).filter(Number.isFinite);
  const baselineMedian = median(baselineValues);
  const interventionMedian = median(interventionValues);
  const rawDelta = baselineMedian == null || interventionMedian == null ? null : interventionMedian - baselineMedian;
  const adjustedDelta = rawDelta == null ? null : rawDelta * metric.direction;
  const enoughData = baselineValues.length >= experiment.sampleTarget && interventionValues.length >= experiment.sampleTarget;
  let direction = 'insufficient';
  if (baselineValues.length >= 3 && interventionValues.length >= 3) {
    direction = adjustedDelta >= 0.5 ? 'positive' : adjustedDelta <= -0.5 ? 'negative' : 'flat';
  }
  const confidence = direction === 'insufficient'
    ? 'Недостаточно наблюдений'
    : Math.min(baselineValues.length, interventionValues.length) >= 7
      ? 'Повторяющийся сигнал'
      : 'Предварительный сигнал';
  return {
    experiment,
    metric,
    baselineCount: baselineValues.length,
    interventionCount: interventionValues.length,
    baselineMedian,
    interventionMedian,
    rawDelta,
    adjustedDelta,
    enoughData,
    direction,
    confidence,
    progress: {
      baseline: Math.min(1, baselineValues.length / experiment.sampleTarget),
      intervention: Math.min(1, interventionValues.length / experiment.sampleTarget)
    },
    confounders: detectConfounders(baselineEntries, interventionEntries, experiment)
  };
}

function factorCandidates(episodes) {
  const candidates = [];
  const contexts = new Set(episodes.flatMap((item) => item.context || []));
  for (const value of contexts) candidates.push({ kind: 'context', value });
  const techniques = new Set(episodes.map((item) => item.techniqueId).filter(Boolean));
  for (const value of techniques) candidates.push({ kind: 'technique', value });
  const products = new Set(episodes.map((item) => item.productId).filter(Boolean));
  for (const value of products) candidates.push({ kind: 'product', value });
  return candidates;
}

function factorPresent(item, candidate) {
  if (candidate.kind === 'context') return item.context?.includes(candidate.value);
  if (candidate.kind === 'technique') return item.techniqueId === candidate.value;
  if (candidate.kind === 'product') return item.productId === candidate.value;
  return false;
}

export function buildFactorInsights(coreState, metricId = 'control') {
  const episodes = Array.isArray(coreState?.episodes) ? coreState.episodes : [];
  const metric = EXPERIMENT_METRICS.find((item) => item.id === metricId) || EXPERIMENT_METRICS[0];
  return factorCandidates(episodes).map((candidate) => {
    const present = episodes.filter((item) => factorPresent(item, candidate));
    const absent = episodes.filter((item) => !factorPresent(item, candidate));
    const presentValues = present.map((item) => Number(item[metric.id])).filter(Number.isFinite);
    const absentValues = absent.map((item) => Number(item[metric.id])).filter(Number.isFinite);
    if (presentValues.length < 3 || absentValues.length < 3) return null;
    const presentMedian = median(presentValues);
    const absentMedian = median(absentValues);
    const rawDelta = presentMedian - absentMedian;
    return {
      ...candidate,
      metric,
      presentCount: presentValues.length,
      absentCount: absentValues.length,
      presentMedian,
      absentMedian,
      rawDelta,
      adjustedDelta: rawDelta * metric.direction
    };
  }).filter(Boolean).sort((a, b) => Math.abs(b.adjustedDelta) - Math.abs(a.adjustedDelta));
}

export function buildCombinedExport(basePayload, coreState, phase2State) {
  const state = normalizePhase2State(phase2State);
  return {
    ...clone(basePayload),
    phase2: {
      schemaVersion: PHASE2_STORE_VERSION,
      experiments: clone(state.experiments),
      links: clone(state.links),
      customProtocols: clone(state.customProtocols),
      evaluations: state.experiments.map((experiment) => evaluateExperiment(coreState, state, experiment))
    }
  };
}

function formatValue(value) {
  return value == null ? '—' : Number(value).toFixed(Number(value) % 1 ? 1 : 0);
}

export function buildCombinedMarkdown(baseMarkdown, coreState, phase2State) {
  const state = normalizePhase2State(phase2State);
  const lines = [String(baseMarkdown || '').trimEnd(), '', '## Эксперименты'];
  if (!state.experiments.length) {
    lines.push('', '- Экспериментов пока нет.');
  } else {
    for (const experiment of state.experiments) {
      const result = evaluateExperiment(coreState, state, experiment);
      lines.push(
        '',
        `### ${experiment.title}`,
        `- Статус: ${experiment.status}`,
        `- Фактор: ${experiment.factorLabel}`,
        `- Целевая метрика: ${result.metric.label}`,
        `- Наблюдения: база ${result.baselineCount}/${experiment.sampleTarget}, изменение ${result.interventionCount}/${experiment.sampleTarget}`,
        `- Медианы: ${formatValue(result.baselineMedian)} → ${formatValue(result.interventionMedian)}`,
        `- Оценка: ${result.confidence}; направление ${result.direction}`
      );
      if (experiment.hypothesis) lines.push(`- Гипотеза: ${experiment.hypothesis}`);
      for (const warning of result.confounders) lines.push(`- Ограничение: ${warning}`);
    }
  }
  lines.push('', '## Пользовательские протоколы');
  if (!state.customProtocols.length) lines.push('', '- Пользовательских протоколов нет.');
  else for (const protocol of state.customProtocols) {
    lines.push('', `- ${protocol.title}: ${protocol.cycles} цикл(а), пауза ${protocol.pause} с${protocol.archived ? ' [архив]' : ''}`);
  }
  return `${lines.join('\n')}\n`;
}
