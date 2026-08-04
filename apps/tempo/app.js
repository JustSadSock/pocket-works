import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { DEFAULT_STATE, buildExportPayload, buildMarkdownReport, createId, normalizeState } from './core.js';
import { CHECKIN_SCORES, EPISODE_SCORES, TECHNIQUES } from './protocols.js';
import { checkinForm, episodeForm, exportScreen, journal, productForm, techniques, today, e, scoreFields } from './screens.js';
import {
  PHASE2_DEFAULT_STATE,
  PHASE2_NAMESPACE,
  PHASE2_STORE_VERSION,
  activeExperiment,
  allProtocols,
  buildCombinedExport,
  buildCombinedMarkdown,
  createCustomProtocol,
  createExperiment,
  linkEntry,
  normalizePhase2State,
  removeEntryLink,
  setExperimentStatus
} from './phase2.js';
import {
  customProtocolForm,
  episodeFormWithExperiment,
  experimentForm,
  experimentsScreen,
  factorLabel,
  replaceCustomProtocolNames,
  sessionExperimentNotice,
  techniquesWithCustom,
  todayWithPhase2
} from './phase2-screens.js';

installMobileRuntime();

const store = createVersionedStore({
  namespace: 'pocket-works:tempo',
  version: 1,
  defaults: DEFAULT_STATE,
  validate: (value) => value && typeof value === 'object' && !Array.isArray(value)
});
const phaseStore = createVersionedStore({
  namespace: PHASE2_NAMESPACE,
  version: PHASE2_STORE_VERSION,
  defaults: PHASE2_DEFAULT_STATE,
  validate: (value) => value && typeof value === 'object' && !Array.isArray(value)
});

let state = normalizeState(store.getAll());
let phase2 = normalizePhase2State(phaseStore.getAll());
let tab = 'today';
let cursor = new Date();
let selectedDate = null;
let activeSession = null;
let timerId = null;
let pendingDelete = null;
cursor.setDate(1);
store.replace(state);
phaseStore.replace(phase2);

const screen = document.querySelector('#screen');
const modal = document.querySelector('#modal');
const modalTitle = document.querySelector('#modal-title');
const modalBody = document.querySelector('#modal-body');
const confirm = document.querySelector('#confirm');
const toast = document.querySelector('#toast');

function protocols() {
  return allProtocols(TECHNIQUES, phase2, { includeArchived: true });
}
function persistCore({ rerender = true } = {}) {
  state = normalizeState(state);
  store.replace(state);
  if (rerender) render();
}
function persistPhase2({ rerender = true } = {}) {
  phase2 = normalizePhase2State(phase2);
  phaseStore.replace(phase2);
  if (rerender) render();
}
function persistAll() {
  persistCore({ rerender: false });
  persistPhase2({ rerender: false });
  render();
}
function notify(text) {
  toast.textContent = text;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 1900);
}
function open(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.showModal();
}
function close() {
  if (modal.open) modal.close();
  window.clearInterval(timerId);
}
function range() {
  return document.querySelector('input[name="range"]:checked')?.value || '30d';
}
function includeNotes() {
  return Boolean(document.querySelector('#include-notes')?.checked);
}
function basePayload() {
  return buildExportPayload(state, { range: range(), includeNotes: includeNotes() });
}
function report() {
  return buildCombinedMarkdown(
    buildMarkdownReport(state, { range: range(), includeNotes: includeNotes() }),
    state,
    phase2
  );
}
function render() {
  document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
  if (tab === 'today') screen.innerHTML = replaceCustomProtocolNames(todayWithPhase2(today(state), state, phase2), phase2);
  if (tab === 'journal') screen.innerHTML = replaceCustomProtocolNames(journal(state, cursor, selectedDate), phase2);
  if (tab === 'techniques') screen.innerHTML = techniquesWithCustom(techniques(state), phase2);
  if (tab === 'experiments') screen.innerHTML = experimentsScreen(state, phase2);
  if (tab === 'export') screen.innerHTML = exportScreen(buildCombinedMarkdown(buildMarkdownReport(state, { range: '30d', includeNotes: false }), state, phase2));
}
function formNum(formData, name, fallback = 3) {
  const value = formData.get(name);
  return value == null || value === '' ? fallback : Number(value);
}
function iso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function saveEntry(form) {
  const formData = new FormData(form);
  const kind = form.dataset.kind;
  const now = new Date().toISOString();
  if (kind === 'episode') {
    const episode = {
      id: createId('episode'),
      createdAt: now,
      occurredAt: iso(formData.get('occurredAt')),
      type: formData.get('type') || 'mixed',
      durationBand: formData.get('durationBand') || 'none',
      exactSeconds: null,
      ...Object.fromEntries(EPISODE_SCORES.map(([key]) => [key, formNum(formData, key)])),
      context: formData.getAll('context'),
      techniqueId: formData.get('techniqueId') || null,
      productId: formData.get('productId') || null,
      notes: formData.get('notes') || ''
    };
    state.episodes.unshift(episode);
    const experiment = activeExperiment(phase2);
    const experimentPhase = formData.get('experimentPhase');
    if (experiment && experimentPhase) {
      phase2 = linkEntry(phase2, {
        entryType: 'episode',
        entryId: episode.id,
        experimentId: experiment.id,
        phase: experimentPhase
      });
    }
  }
  if (kind === 'checkin') {
    state.checkIns.unshift({
      id: createId('checkin'),
      createdAt: now,
      occurredAt: iso(formData.get('occurredAt')),
      ...Object.fromEntries(CHECKIN_SCORES.map(([key]) => [key, formNum(formData, key)])),
      morningErection: formNum(formData, 'morningErection', 0),
      notes: formData.get('notes') || ''
    });
  }
  if (kind === 'product') {
    state.products.push({
      id: createId('product'),
      createdAt: now,
      name: formData.get('name') || '',
      activeIngredients: formData.get('activeIngredients') || '',
      concentration: formData.get('concentration') || '',
      labelDose: formData.get('labelDose') || '',
      labelWait: formData.get('labelWait') || '',
      labelledForPenileUse: true,
      notes: ''
    });
  }
  persistAll();
  close();
  notify(kind === 'product' ? 'Карточка сохранена' : 'Запись сохранена локально');
}

function saveExperiment(form) {
  const formData = new FormData(form);
  const [factorKind, rawValue] = String(formData.get('factorKey') || 'custom:other').split(':');
  const factorValue = factorKind === 'custom'
    ? String(formData.get('customFactor') || 'Собственное изменение').trim()
    : rawValue;
  const current = activeExperiment(phase2);
  if (current) phase2 = setExperimentStatus(phase2, current.id, 'paused');
  const experiment = createExperiment({
    title: formData.get('title'),
    hypothesis: formData.get('hypothesis'),
    factorKind,
    factorValue,
    factorLabel: factorLabel(state, phase2, factorKind, factorValue),
    targetMetric: formData.get('targetMetric'),
    sampleTarget: formData.get('sampleTarget'),
    status: 'active'
  });
  phase2.experiments.unshift(experiment);
  persistPhase2();
  close();
  tab = 'experiments';
  render();
  notify('Эксперимент начат с базовой группы');
}

function saveProtocol(form) {
  const formData = new FormData(form);
  const protocol = createCustomProtocol({
    title: formData.get('title'),
    summary: formData.get('summary'),
    cycles: formData.get('cycles'),
    pause: formData.get('pause'),
    steps: formData.get('steps')
  });
  if (!protocol) {
    notify('Нужно название и хотя бы один шаг');
    return;
  }
  phase2.customProtocols.push(protocol);
  persistPhase2();
  close();
  notify('Пользовательский протокол сохранён');
}

function techniqueIntro(id) {
  const technique = protocols().find((item) => item.id === id);
  if (!technique) return;
  const products = technique.topical
    ? `<label class="field"><span>Средство</span><select id="session-product"><option value="">Выбери карточку</option>${state.products.map((item) => `<option value="${item.id}">${e(item.name)}</option>`).join('')}</select></label>`
    : '';
  open(technique.title, `<p>${e(technique.summary)}</p><ol class="steps">${technique.steps.map((step) => `<li>${e(step)}</li>`).join('')}</ol>${products}${sessionExperimentNotice(phase2)}<label class="field"><span>Уверенность до</span><div class="scores">${[0, 1, 2, 3, 4, 5].map((value) => `<label><input type="radio" name="confidence-before" value="${value}" ${value === 3 ? 'checked' : ''}><span>${value}</span></label>`).join('')}</div></label><div class="form-actions"><button class="solid" data-session-start="${technique.id}">Начать сессию</button></div>`);
}
function startSession(id) {
  const technique = protocols().find((item) => item.id === id);
  if (!technique) return;
  const productId = document.querySelector('#session-product')?.value || null;
  if (technique.topical && !productId) {
    notify('Сначала создай и выбери карточку средства');
    return;
  }
  const experiment = activeExperiment(phase2);
  activeSession = {
    technique,
    startedAt: new Date().toISOString(),
    cycles: 0,
    confidenceBefore: Number(document.querySelector('input[name="confidence-before"]:checked')?.value || 3),
    productId,
    experimentId: document.querySelector('#session-experiment')?.checked ? experiment?.id || null : null
  };
  if (!technique.cycles) return sessionReview();
  sessionCycle();
}
function sessionCycle() {
  const technique = activeSession.technique;
  const number = activeSession.cycles + 1;
  modalBody.innerHTML = `<p class="eyebrow">ЦИКЛ ${number} ИЗ ${technique.cycles}</p><h2>${e(technique.title)}</h2><p>${e(technique.steps[Math.min(number, technique.steps.length) - 1] || technique.steps[0])}</p><label class="field"><span>Пик возбуждения 0–10</span><input id="peak" type="range" min="0" max="10" value="7" oninput="this.nextElementSibling.textContent=this.value"><b>7</b></label>${technique.pause ? `<div class="timer"><b id="timer">${technique.pause}</b><span>секунд или до заметного снижения</span></div><button class="outline" data-timer="${technique.pause}">Запустить паузу</button>` : ''}<div class="form-actions"><button class="solid" data-cycle-done>Цикл завершён</button><button class="outline" data-session-stop>Остановить без провала</button></div>`;
}
function sessionReview(stopped = false) {
  const technique = activeSession.technique;
  modalBody.innerHTML = `<p class="eyebrow">${stopped ? 'ОСТАНОВЛЕНО' : 'СЕССИЯ ЗАВЕРШЕНА'}</p><h2>Зафиксировать результат</h2><form id="session-form">${scoreFields([['control', 'Контроль'], ['pleasure', 'Удовольствие'], ['anxiety', 'Напряжение'], ['confidenceAfter', 'Уверенность после']])}<label class="field"><span>Пик возбуждения 0–10</span><input name="peakArousal" type="number" min="0" max="10" value="7"></label>${technique.topical ? `${scoreFields([['numbness', 'Онемение'], ['effect', 'Эффект']])}<label class="check"><input type="checkbox" name="transfer"><span>Был перенос онемения партнёрше</span></label><label class="check"><input type="checkbox" name="irritation"><span>Было жжение или раздражение</span></label>` : ''}<label class="field"><span>Заметка</span><textarea name="notes" rows="3"></textarea></label><div class="form-actions"><button class="solid" type="submit">Сохранить практику</button></div></form>`;
  activeSession.stopped = stopped;
}
function saveSession(form) {
  const formData = new FormData(form);
  const now = new Date().toISOString();
  const session = {
    id: createId('technique'),
    techniqueId: activeSession.technique.id,
    createdAt: now,
    startedAt: activeSession.startedAt,
    completedAt: now,
    status: activeSession.stopped ? 'stopped' : 'completed',
    cyclesCompleted: activeSession.cycles,
    peakArousal: formNum(formData, 'peakArousal', 7),
    control: formNum(formData, 'control'),
    pleasure: formNum(formData, 'pleasure'),
    anxiety: formNum(formData, 'anxiety'),
    confidenceBefore: activeSession.confidenceBefore,
    confidenceAfter: formNum(formData, 'confidenceAfter'),
    productId: activeSession.productId,
    numbness: formNum(formData, 'numbness', 0),
    effect: formNum(formData, 'effect', 0),
    transferObserved: formData.get('transfer') === 'on',
    irritationObserved: formData.get('irritation') === 'on',
    notes: formData.get('notes') || ''
  };
  state.techniqueSessions.unshift(session);
  if (activeSession.experimentId) {
    phase2 = linkEntry(phase2, {
      entryType: 'technique',
      entryId: session.id,
      experimentId: activeSession.experimentId,
      phase: 'intervention'
    });
  }
  activeSession = null;
  persistAll();
  close();
  notify('Практика сохранена');
}
function startTimer(seconds) {
  window.clearInterval(timerId);
  let left = seconds;
  const element = document.querySelector('#timer');
  element.textContent = left;
  timerId = window.setInterval(() => {
    left -= 1;
    element.textContent = Math.max(0, left);
    if (left <= 0) {
      window.clearInterval(timerId);
      notify('Пауза закончена');
    }
  }, 1000);
}
function settings() {
  open('Настройки', `<div class="settings"><p class="warning">Основной журнал и второй этап хранятся локально. Облака, аналитики и аккаунта здесь нет.</p><button class="danger" data-clear>Удалить все данные TEMPO</button></div>`);
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
function deleteNow() {
  if (!pendingDelete) return;
  const map = { episode: 'episodes', checkin: 'checkIns', technique: 'techniqueSessions' };
  const key = map[pendingDelete.kind];
  if (key) state[key] = state[key].filter((item) => item.id !== pendingDelete.id);
  if (pendingDelete.kind === 'episode' || pendingDelete.kind === 'technique') {
    phase2 = removeEntryLink(phase2, pendingDelete.kind, pendingDelete.id);
  }
  pendingDelete = null;
  persistAll();
  notify('Запись удалена');
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  return copied;
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button,[data-tab]');
  if (!button) return;
  if (button.dataset.tab) {
    tab = button.dataset.tab;
    render();
    return;
  }
  if (button.hasAttribute('data-modal-close')) {
    close();
    return;
  }
  if (button.dataset.action === 'episode') open('Новый эпизод', episodeFormWithExperiment(episodeForm(state), state, phase2));
  if (button.dataset.action === 'checkin') open('Чек-ин состояния', checkinForm());
  if (button.dataset.action === 'product') open('Карточка средства', productForm());
  if (button.dataset.action === 'protocol') open('Новый протокол', customProtocolForm());
  if (button.dataset.action === 'experiment') open('Новый эксперимент', experimentForm(state, phase2));
  if (button.dataset.action === 'settings') settings();
  if (button.dataset.technique) techniqueIntro(button.dataset.technique);
  if (button.dataset.sessionStart) {
    event.preventDefault();
    startSession(button.dataset.sessionStart);
  }
  if (button.hasAttribute('data-cycle-done')) {
    activeSession.cycles += 1;
    activeSession.peak = Math.max(activeSession.peak || 0, Number(document.querySelector('#peak')?.value || 0));
    activeSession.cycles >= activeSession.technique.cycles ? sessionReview() : sessionCycle();
  }
  if (button.hasAttribute('data-session-stop')) sessionReview(true);
  if (button.dataset.timer) startTimer(Number(button.dataset.timer));
  if (button.dataset.cal) {
    cursor.setMonth(cursor.getMonth() + (button.dataset.cal === 'next' ? 1 : -1));
    render();
  }
  if (button.dataset.date) {
    selectedDate = selectedDate === button.dataset.date ? null : button.dataset.date;
    render();
  }
  if (button.dataset.deleteId) {
    pendingDelete = { kind: button.dataset.deleteKind, id: button.dataset.deleteId };
    confirm.showModal();
  }
  if (button.dataset.productDelete) {
    state.products = state.products.filter((item) => item.id !== button.dataset.productDelete);
    persistCore();
  }
  if (button.dataset.protocolArchive) {
    phase2.customProtocols = phase2.customProtocols.map((item) => item.id === button.dataset.protocolArchive ? { ...item, archived: true } : item);
    persistPhase2();
  }
  if (button.dataset.experimentStatus) {
    phase2 = setExperimentStatus(phase2, button.dataset.experimentId, button.dataset.experimentStatus);
    persistPhase2();
    notify('Статус эксперимента обновлён');
  }
  if (button.dataset.clear) {
    state = normalizeState(DEFAULT_STATE);
    phase2 = normalizePhase2State(PHASE2_DEFAULT_STATE);
    store.reset();
    phaseStore.reset();
    store.replace(state);
    phaseStore.replace(phase2);
    close();
    render();
    notify('Данные TEMPO удалены');
  }
  if (button.dataset.export) {
    const markdown = report();
    const payload = buildCombinedExport(basePayload(), state, phase2);
    state.exportState.lastExportAt = new Date().toISOString();
    store.replace(state);
    if (button.dataset.export === 'copy') {
      await copyText(markdown);
      notify('Markdown скопирован');
    }
    if (button.dataset.export === 'md') download('tempo-report.md', markdown, 'text/markdown');
    if (button.dataset.export === 'json') download('tempo-report.json', JSON.stringify(payload, null, 2), 'application/json');
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'entry-form') {
    event.preventDefault();
    saveEntry(event.target);
  }
  if (event.target.id === 'session-form') {
    event.preventDefault();
    saveSession(event.target);
  }
  if (event.target.id === 'experiment-form') {
    event.preventDefault();
    saveExperiment(event.target);
  }
  if (event.target.id === 'protocol-form') {
    event.preventDefault();
    saveProtocol(event.target);
  }
});

document.addEventListener('change', (event) => {
  if (tab === 'export' && (event.target.name === 'range' || event.target.id === 'include-notes')) {
    document.querySelector('#preview').value = report();
  }
});
modal.addEventListener('close', () => window.clearInterval(timerId));
confirm.addEventListener('close', () => {
  if (confirm.returnValue === 'confirm') deleteNow();
  else pendingDelete = null;
});
createWorkshopMode({
  appName: 'TEMPO',
  version: '1.1.0',
  cachePrefix: 'tempo-',
  storageNamespace: 'pocket-works:tempo',
  onReset() {
    state = normalizeState(DEFAULT_STATE);
    phase2 = normalizePhase2State(PHASE2_DEFAULT_STATE);
    store.reset();
    phaseStore.reset();
    render();
  }
});
watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
render();
