import { buildExportPayload, buildMarkdownReport } from './core.js';
import { buildCombinedExport, buildCombinedMarkdown, normalizePhase2State } from './phase2.js';
import {
  ACTIVITY_OPTIONS,
  SEGMENT_STORAGE_KEY,
  SEGMENT_TECHNIQUES,
  aggregateLegacy,
  appendDetailedMarkdown,
  createSegment,
  formatDuration,
  filterSegmentState,
  normalizeSegmentState,
  segmentExperimentSummary,
  summarizeSegments
} from './phase4-core.js';

const FOUNDATION_KEY = 'pocket-works:tempo:state';
const EXPERIMENT_KEY = 'pocket-works:tempo:phase2:state';
const e = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

let draftSegments = [];
let currentEpisodeForm = null;
let pendingEpisodeDetail = null;
let queued = false;

function readEnvelope(key, fallback = {}) {
  try {
    const envelope = JSON.parse(localStorage.getItem(key) || 'null');
    return envelope?.data && typeof envelope.data === 'object' ? envelope.data : fallback;
  } catch {
    return fallback;
  }
}
function segmentState() {
  return normalizeSegmentState(readEnvelope(SEGMENT_STORAGE_KEY, {}));
}
function saveSegmentState(next) {
  const data = normalizeSegmentState(next);
  localStorage.setItem(SEGMENT_STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), data }));
  return data;
}
function foundationState() {
  return readEnvelope(FOUNDATION_KEY, {});
}
function experimentState() {
  return normalizePhase2State(readEnvelope(EXPERIMENT_KEY, {}));
}
function activeExperiment() {
  return experimentState().experiments.find((item) => item.status === 'active') || null;
}
function products() {
  return Array.isArray(foundationState().products) ? foundationState().products : [];
}

function selectOptions(options, value, blank = '—') {
  return `<option value="">${e(blank)}</option>${options.map(([id, label]) => `<option value="${e(id)}" ${String(value) === String(id) ? 'selected' : ''}>${e(label)}</option>`).join('')}`;
}
function activityLabel(id) {
  return ACTIVITY_OPTIONS.find((item) => item.id === id)?.short || id;
}
function techniqueLabel(id) {
  return SEGMENT_TECHNIQUES.find((item) => item.id === id)?.label || id;
}
function durationParts(seconds) {
  if (seconds == null) return { minutes: '', seconds: '' };
  const total = Math.max(0, Number(seconds) || 0);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

function segmentCard(segment, index) {
  const duration = durationParts(segment.durationSeconds);
  const experiment = activeExperiment();
  const productOptions = products().map((item) => [item.id, item.name]);
  const scoreOptions = [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']];
  return `<article class="p4-segment" data-p4-segment="${e(segment.id)}">
    <header class="p4-segment-head"><div><span class="p4-index">${index + 1}</span><div><b>${e(activityLabel(segment.activity))}</b><small data-p4-card-duration>${segment.durationSeconds == null ? 'длительность не указана' : formatDuration(segment.durationSeconds)}</small></div></div><div class="p4-order"><button type="button" data-p4-move="up" aria-label="Поднять часть">↑</button><button type="button" data-p4-move="down" aria-label="Опустить часть">↓</button><button type="button" data-p4-remove aria-label="Удалить часть">×</button></div></header>
    <label class="field p4-activity"><span>Что происходило</span><select data-p4-field="activity">${ACTIVITY_OPTIONS.map((item) => `<option value="${item.id}" ${segment.activity === item.id ? 'selected' : ''}>${e(item.label)}</option>`).join('')}</select></label>
    <div class="p4-duration"><div><span>Длительность</span><label><input data-p4-duration="minutes" type="number" inputmode="numeric" min="0" max="360" value="${duration.minutes}" placeholder="мин"><small>мин</small></label><b>:</b><label><input data-p4-duration="seconds" type="number" inputmode="numeric" min="0" max="59" value="${duration.seconds}" placeholder="сек"><small>сек</small></label></div><div class="p4-presets">${[[30,'30 с'],[60,'1 мин'],[120,'2 мин'],[300,'5 мин']].map(([seconds,label]) => `<button type="button" data-p4-preset="${seconds}">${label}</button>`).join('')}<button type="button" data-p4-duration-clear>Не знаю</button></div></div>
    <details class="p4-details" ${segment.techniques.length || segment.orgasmCount || segment.ejaculationCount || segment.experimentPhase ? 'open' : ''}><summary>Детали этой части <small>техники, контроль, завершения</small></summary><div>
      <fieldset><legend>Что помогало контролировать</legend><div class="p4-techniques">${SEGMENT_TECHNIQUES.map((item) => `<label><input type="checkbox" data-p4-technique="${item.id}" ${segment.techniques.includes(item.id) ? 'checked' : ''}><span>${e(item.label)}</span></label>`).join('')}</div></fieldset>
      <label class="field p4-cycles ${segment.techniques.includes('stop-start') ? '' : 'p4-hidden'}"><span>Циклов stop–start</span><input data-p4-field="stopStartCycles" type="number" inputmode="numeric" min="0" max="30" value="${segment.stopStartCycles || 0}"></label>
      <div class="p4-score-grid"><label><span>Контроль</span><select data-p4-field="control">${selectOptions(scoreOptions, segment.control)}</select></label><label><span>Удовольствие</span><select data-p4-field="pleasure">${selectOptions(scoreOptions, segment.pleasure)}</select></label><label><span>Напряжение</span><select data-p4-field="anxiety">${selectOptions(scoreOptions, segment.anxiety)}</select></label><label><span>Пик возбуждения</span><select data-p4-field="peakArousal">${selectOptions(Array.from({length:11},(_,i)=>[String(i),String(i)]), segment.peakArousal)}</select></label></div>
      <div class="p4-count-grid"><label><span>Оргазмов</span><input data-p4-field="orgasmCount" type="number" inputmode="numeric" min="0" max="10" value="${segment.orgasmCount || 0}"></label><label><span>Эякуляций</span><input data-p4-field="ejaculationCount" type="number" inputmode="numeric" min="0" max="10" value="${segment.ejaculationCount || 0}"></label></div>
      ${productOptions.length ? `<label class="field"><span>Средство в этой части</span><select data-p4-field="productId">${selectOptions(productOptions, segment.productId, 'Без средства')}</select></label>` : ''}
      ${experiment ? `<fieldset class="p4-experiment"><legend>Эксперимент · ${e(experiment.title)}</legend><div class="choices"><label><input type="radio" name="p4-exp-${e(segment.id)}" data-p4-exp value="baseline" ${segment.experimentPhase === 'baseline' ? 'checked' : ''}><span>База</span></label><label><input type="radio" name="p4-exp-${e(segment.id)}" data-p4-exp value="intervention" ${segment.experimentPhase === 'intervention' ? 'checked' : ''}><span>С изменением</span></label><label><input type="radio" name="p4-exp-${e(segment.id)}" data-p4-exp value="" ${!segment.experimentPhase ? 'checked' : ''}><span>Не учитывать</span></label></div></fieldset>` : ''}
      <label class="field"><span>Заметка к части</span><textarea data-p4-field="notes" rows="2">${e(segment.notes || '')}</textarea></label>
    </div></details>
  </article>`;
}

function builderHtml() {
  const summary = summarizeSegments(draftSegments);
  const experiment = activeExperiment();
  return `<section class="p4-builder" data-p4-builder>
    <div class="p4-builder-head"><div><p class="eyebrow">СТРУКТУРА ЭПИЗОДА</p><h2>Разбей на части</h2></div><b data-p4-total>${summary.knownDurationCount ? formatDuration(summary.totalSeconds) : '—'}</b></div>
    <p class="p4-lead">Каждая смена действия — отдельная часть. Длительность можно указать примерно.</p>
    ${experiment ? `<aside class="p4-active-exp"><b>${e(experiment.title)}</b><span>Базу и изменение можно отмечать отдельно для каждой части — даже внутри одного эпизода.</span></aside>` : ''}
    <div class="p4-segments">${draftSegments.map(segmentCard).join('')}</div>
    <div class="p4-add"><span>Добавить следующую часть</span><div>${[['penetration','Проникновение'],['oral-received','Орально мне'],['oral-given','Орально партнёру'],['manual-received','Руками мне'],['pause','Пауза'],['touch','Другое']].map(([id,label]) => `<button type="button" data-p4-add="${id}">＋ ${label}</button>`).join('')}</div></div>
    <div class="p4-summary" data-p4-summary></div>
  </section>`;
}

function updateSummary() {
  const root = currentEpisodeForm?.querySelector('[data-p4-builder]');
  if (!root) return;
  const summary = summarizeSegments(draftSegments);
  const total = root.querySelector('[data-p4-total]');
  if (total) total.textContent = summary.knownDurationCount ? formatDuration(summary.totalSeconds) : '—';
  const box = root.querySelector('[data-p4-summary]');
  if (box) {
    const bits = [`${summary.count} ${summary.count === 1 ? 'часть' : summary.count < 5 ? 'части' : 'частей'}`];
    if (summary.penetrationSeconds) bits.push(`проникновение ${formatDuration(summary.penetrationSeconds)}`);
    if (summary.stopStartCycles) bits.push(`stop–start ×${summary.stopStartCycles}`);
    if (summary.orgasmCount) bits.push(`оргазмы ${summary.orgasmCount}`);
    if (summary.ejaculationCount) bits.push(`эякуляции ${summary.ejaculationCount}`);
    box.innerHTML = `<b>Итого</b><span>${bits.map(e).join(' · ')}</span>`;
  }
  root.querySelectorAll('[data-p4-segment]').forEach((card) => {
    const segment = draftSegments.find((item) => item.id === card.dataset.p4Segment);
    if (!segment) return;
    const title = card.querySelector('.p4-segment-head b');
    const duration = card.querySelector('[data-p4-card-duration]');
    if (title) title.textContent = activityLabel(segment.activity);
    if (duration) duration.textContent = segment.durationSeconds == null ? 'длительность не указана' : formatDuration(segment.durationSeconds);
    card.querySelector('.p4-cycles')?.classList.toggle('p4-hidden', !segment.techniques.includes('stop-start'));
  });
}

function renderBuilder() {
  const existing = currentEpisodeForm?.querySelector('[data-p4-builder]');
  if (!currentEpisodeForm) return;
  if (existing) existing.outerHTML = builderHtml();
  else {
    const when = [...currentEpisodeForm.querySelectorAll('.field')].find((node) => node.querySelector('span')?.textContent?.trim() === 'Когда');
    (when || currentEpisodeForm.firstElementChild)?.insertAdjacentHTML('afterend', builderHtml());
  }
  updateSummary();
}

function hideLegacyEpisodeFields(form) {
  form.querySelectorAll('fieldset').forEach((fieldset) => {
    const legend = fieldset.querySelector('legend')?.textContent?.trim() || '';
    if (legend === 'Тип' || legend.startsWith('Примерная длительность проникновения')) fieldset.classList.add('p4-legacy-field');
  });
  form.querySelectorAll('label.field').forEach((label) => {
    const name = label.querySelector(':scope > span')?.textContent?.trim();
    if (name === 'Техника' || name === 'Средство') label.classList.add('p4-legacy-field');
  });
  form.querySelector('.experiment-link')?.classList.add('p4-legacy-field');
}

function augmentEpisodeForm() {
  const form = document.querySelector('#modal[open] #entry-form[data-kind="episode"]');
  if (!form || form.dataset.p4Ready) return;
  form.dataset.p4Ready = 'true';
  currentEpisodeForm = form;
  draftSegments = [createSegment('penetration')];
  hideLegacyEpisodeFields(form);
  renderBuilder();
}

function segmentFromTarget(target) {
  const card = target.closest('[data-p4-segment]');
  if (!card) return null;
  return draftSegments.find((segment) => segment.id === card.dataset.p4Segment) || null;
}

function handleBuilderClick(button) {
  if (button.dataset.p4Add) {
    draftSegments.push(createSegment(button.dataset.p4Add));
    renderBuilder();
    currentEpisodeForm?.querySelector('[data-p4-segment]:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return true;
  }
  const segment = segmentFromTarget(button);
  if (!segment) return false;
  if (button.hasAttribute('data-p4-remove')) {
    if (draftSegments.length === 1) {
      draftSegments = [createSegment('penetration')];
    } else {
      draftSegments = draftSegments.filter((item) => item.id !== segment.id);
    }
    renderBuilder();
    return true;
  }
  if (button.dataset.p4Move) {
    const index = draftSegments.findIndex((item) => item.id === segment.id);
    const next = button.dataset.p4Move === 'up' ? index - 1 : index + 1;
    if (next >= 0 && next < draftSegments.length) {
      [draftSegments[index], draftSegments[next]] = [draftSegments[next], draftSegments[index]];
      renderBuilder();
    }
    return true;
  }
  if (button.dataset.p4Preset) {
    segment.durationSeconds = Number(button.dataset.p4Preset);
    const card = button.closest('[data-p4-segment]');
    const parts = durationParts(segment.durationSeconds);
    card.querySelector('[data-p4-duration="minutes"]').value = parts.minutes;
    card.querySelector('[data-p4-duration="seconds"]').value = parts.seconds;
    updateSummary();
    return true;
  }
  if (button.hasAttribute('data-p4-duration-clear')) {
    segment.durationSeconds = null;
    const card = button.closest('[data-p4-segment]');
    card.querySelectorAll('[data-p4-duration]').forEach((input) => { input.value = ''; });
    updateSummary();
    return true;
  }
  return false;
}

function handleBuilderInput(target) {
  const segment = segmentFromTarget(target);
  if (!segment) return;
  if (target.dataset.p4Duration) {
    const card = target.closest('[data-p4-segment]');
    const minutes = Number(card.querySelector('[data-p4-duration="minutes"]')?.value || 0);
    const seconds = Number(card.querySelector('[data-p4-duration="seconds"]')?.value || 0);
    const hasAny = card.querySelector('[data-p4-duration="minutes"]')?.value !== '' || card.querySelector('[data-p4-duration="seconds"]')?.value !== '';
    segment.durationSeconds = hasAny ? Math.max(0, Math.min(21600, Math.round(minutes * 60 + seconds))) : null;
  }
  if (target.dataset.p4Field) {
    const field = target.dataset.p4Field;
    const nullable = new Set(['control', 'pleasure', 'anxiety', 'peakArousal']);
    const numeric = new Set(['stopStartCycles', 'orgasmCount', 'ejaculationCount']);
    if (numeric.has(field)) segment[field] = Math.max(0, Number(target.value || 0));
    else if (nullable.has(field)) segment[field] = target.value === '' ? null : Number(target.value);
    else segment[field] = target.value || null;
  }
  if (target.dataset.p4Technique) {
    const id = target.dataset.p4Technique;
    const set = new Set(segment.techniques);
    target.checked ? set.add(id) : set.delete(id);
    segment.techniques = [...set];
    if (id === 'stop-start' && !target.checked) segment.stopStartCycles = 0;
  }
  if (target.hasAttribute('data-p4-exp')) {
    const experiment = activeExperiment();
    segment.experimentId = target.value && experiment ? experiment.id : null;
    segment.experimentPhase = target.value || null;
  }
  updateSummary();
}

function setRadio(form, name, value) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => { input.checked = input.value === value; });
}
function prepareLegacyFields(form) {
  const legacy = aggregateLegacy(draftSegments);
  setRadio(form, 'type', legacy.type);
  setRadio(form, 'durationBand', legacy.durationBand);
  const technique = form.querySelector('select[name="techniqueId"]');
  if (technique) technique.value = legacy.techniqueId || '';
  const product = form.querySelector('select[name="productId"]');
  if (product) product.value = legacy.productId || '';
  const experiment = activeExperiment();
  const phase = experiment && legacy.uniformExperimentId === experiment.id ? legacy.uniformExperimentPhase || '' : '';
  setRadio(form, 'experimentPhase', phase);
  return legacy;
}

function queueDetailSave(form) {
  const occurredAt = form.querySelector('[name="occurredAt"]')?.value || '';
  pendingEpisodeDetail = {
    occurredAt,
    segments: draftSegments.map((segment) => ({ ...segment, techniques: [...segment.techniques] }))
  };
  window.setTimeout(() => {
    if (!pendingEpisodeDetail) return;
    const foundation = foundationState();
    const state = segmentState();
    const existing = new Set(Object.keys(state.episodeDetails));
    const candidate = (foundation.episodes || []).find((episode) => !existing.has(episode.id)) || foundation.episodes?.[0];
    if (!candidate?.id) return;
    state.episodeDetails[candidate.id] = {
      episodeId: candidate.id,
      createdAt: new Date().toISOString(),
      segments: pendingEpisodeDetail.segments
    };
    saveSegmentState(state);
    pendingEpisodeDetail = null;
    scheduleAugment();
  }, 0);
}

function summaryLine(detail) {
  const summary = summarizeSegments(detail.segments);
  const bits = [`${summary.count} ${summary.count === 1 ? 'часть' : summary.count < 5 ? 'части' : 'частей'}`];
  if (summary.knownDurationCount) bits.push(formatDuration(summary.totalSeconds));
  if (summary.penetrationSeconds) bits.push(`проникновение ${formatDuration(summary.penetrationSeconds)}`);
  if (summary.stopStartCycles) bits.push(`stop–start ×${summary.stopStartCycles}`);
  if (summary.orgasmCount) bits.push(`оргазмы ${summary.orgasmCount}`);
  if (summary.ejaculationCount) bits.push(`эякуляции ${summary.ejaculationCount}`);
  return bits.join(' · ');
}

function augmentTimeline() {
  const state = segmentState();
  document.querySelectorAll('#screen .timeline .item').forEach((item) => {
    const deleteButton = item.querySelector('[data-delete-kind="episode"][data-delete-id]');
    if (!deleteButton) return;
    const detail = state.episodeDetails[deleteButton.dataset.deleteId];
    if (!detail?.segments?.length) return;
    const content = item.children[1];
    if (!content) return;
    let row = content.querySelector('.p4-entry-breakdown');
    if (!row) {
      row = document.createElement('div');
      row.className = 'p4-entry-breakdown';
      content.append(row);
    }
    const techniques = [...new Set(detail.segments.flatMap((segment) => segment.techniques))];
    row.innerHTML = `<span>${e(summaryLine(detail))}</span>${techniques.length ? `<small>${techniques.map((id) => e(techniqueLabel(id))).join(' · ')}</small>` : ''}<button type="button" data-p4-detail="${e(detail.episodeId)}">Детали</button>`;
  });
}

function ensureDetailDialog() {
  if (document.querySelector('#p4-detail-dialog')) return document.querySelector('#p4-detail-dialog');
  document.body.insertAdjacentHTML('beforeend', '<dialog id="p4-detail-dialog"><div class="p4-dialog-shell"><header><button type="button" data-p4-detail-close>Закрыть</button><strong>Структура эпизода</strong><span></span></header><div id="p4-detail-body"></div></div></dialog>');
  return document.querySelector('#p4-detail-dialog');
}
function openDetail(episodeId) {
  const detail = segmentState().episodeDetails[episodeId];
  if (!detail) return;
  const dialog = ensureDetailDialog();
  const body = dialog.querySelector('#p4-detail-body');
  body.innerHTML = `<div class="p4-detail-summary"><b>${e(summaryLine(detail))}</b></div><div class="p4-detail-list">${detail.segments.map((segment, index) => `<article><span>${index + 1}</span><div><h3>${e(activityLabel(segment.activity))}</h3><p>${segment.durationSeconds == null ? 'Длительность не указана' : formatDuration(segment.durationSeconds)}</p>${segment.techniques.length ? `<div class="p4-chipline">${segment.techniques.map((id) => `<i>${e(techniqueLabel(id))}${id === 'stop-start' && segment.stopStartCycles ? ` ×${segment.stopStartCycles}` : ''}</i>`).join('')}</div>` : ''}<dl>${segment.control != null ? `<div><dt>Контроль</dt><dd>${segment.control}/5</dd></div>` : ''}${segment.pleasure != null ? `<div><dt>Удовольствие</dt><dd>${segment.pleasure}/5</dd></div>` : ''}${segment.anxiety != null ? `<div><dt>Напряжение</dt><dd>${segment.anxiety}/5</dd></div>` : ''}${segment.peakArousal != null ? `<div><dt>Пик</dt><dd>${segment.peakArousal}/10</dd></div>` : ''}${segment.orgasmCount ? `<div><dt>Оргазмы</dt><dd>${segment.orgasmCount}</dd></div>` : ''}${segment.ejaculationCount ? `<div><dt>Эякуляции</dt><dd>${segment.ejaculationCount}</dd></div>` : ''}</dl>${segment.experimentPhase ? `<p class="p4-exp-mark">Эксперимент: ${segment.experimentPhase === 'baseline' ? 'база' : 'с изменением'}</p>` : ''}${segment.notes ? `<p>${e(segment.notes)}</p>` : ''}</div></article>`).join('')}</div>`;
  dialog.showModal();
}

function augmentExperiments() {
  const segments = segmentState();
  const experiments = experimentState();
  document.querySelectorAll('#screen .experiment').forEach((card) => {
    const id = card.querySelector('[data-experiment-id]')?.dataset.experimentId;
    if (!id || card.querySelector('.p4-experiment-segments')) return;
    const experiment = experiments.experiments.find((item) => item.id === id);
    if (!experiment) return;
    const result = segmentExperimentSummary(segments, id, experiment.targetMetric);
    if (!result.baselineCount && !result.interventionCount) return;
    const metric = result.metric && result.baselineMedian != null && result.interventionMedian != null
      ? ` · ${result.baselineMedian} → ${result.interventionMedian}`
      : '';
    card.querySelector('.experiment-actions')?.insertAdjacentHTML('beforebegin', `<div class="p4-experiment-segments"><b>Отрезки внутри эпизодов</b><span>база ${result.baselineCount} · изменение ${result.interventionCount}${metric}</span></div>`);
  });
}

function detailedReport() {
  const foundation = foundationState();
  const experiments = experimentState();
  const range = document.querySelector('input[name="range"]:checked')?.value || '30d';
  const includeNotes = Boolean(document.querySelector('#include-notes')?.checked);
  const payload = buildExportPayload(foundation, { range, includeNotes });
  const baseMarkdown = buildMarkdownReport(foundation, { range, includeNotes });
  return appendDetailedMarkdown(buildCombinedMarkdown(baseMarkdown, foundation, experiments), { episodes: payload.data.episodes }, segmentState());
}
function detailedJson() {
  const foundation = foundationState();
  const experiments = experimentState();
  const range = document.querySelector('input[name="range"]:checked')?.value || '30d';
  const includeNotes = Boolean(document.querySelector('#include-notes')?.checked);
  const payload = buildCombinedExport(buildExportPayload(foundation, { range, includeNotes }), foundation, experiments);
  const episodeIds = payload.data?.episodes?.map((episode) => episode.id) || [];
  return { ...payload, segmentDetails: filterSegmentState(segmentState(), episodeIds) };
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
async function handleDetailedExport(kind) {
  if (kind === 'copy') {
    const text = detailedReport();
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
    const toast = document.querySelector('#toast');
    if (toast) { toast.textContent = 'Подробный отчёт скопирован'; toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 1800); }
  }
  if (kind === 'md') download('tempo-report.md', detailedReport(), 'text/markdown');
  if (kind === 'json') download('tempo-report.json', JSON.stringify(detailedJson(), null, 2), 'application/json');
}

function augment() {
  augmentEpisodeForm();
  augmentTimeline();
  augmentExperiments();
}
function scheduleAugment() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; augment(); });
}

new MutationObserver(scheduleAugment).observe(document.body, { childList: true, subtree: true });
window.addEventListener('tempo:restored', scheduleAugment);
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.export && ['copy', 'md', 'json'].includes(button.dataset.export) && Object.keys(segmentState().episodeDetails).length) {
    event.preventDefault();
    event.stopImmediatePropagation();
    handleDetailedExport(button.dataset.export);
    return;
  }
}, true);

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.closest('[data-p4-builder]') && handleBuilderClick(button)) return;
  if (button.dataset.p4Detail) openDetail(button.dataset.p4Detail);
  if (button.hasAttribute('data-p4-detail-close')) document.querySelector('#p4-detail-dialog')?.close();
});

document.addEventListener('input', (event) => {
  if (event.target.closest('[data-p4-builder]')) handleBuilderInput(event.target);
});
document.addEventListener('change', (event) => {
  if (event.target.closest('[data-p4-builder]')) handleBuilderInput(event.target);
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form?.matches?.('#entry-form[data-kind="episode"]') && form.querySelector('[data-p4-builder]')) {
    prepareLegacyFields(form);
    queueDetailSave(form);
  }
}, true);

scheduleAugment();
