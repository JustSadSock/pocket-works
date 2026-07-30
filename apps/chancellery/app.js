import { parseCampaignBuffer, parseCampaignFile, SaveParseError } from './parser.js';
import { clearCampaigns, deleteCampaign, getCampaign, listCampaigns, saveCampaign } from './storage.js';

const elements = {
  startView: document.querySelector('#startView'),
  dossierView: document.querySelector('#dossierView'),
  dropZone: document.querySelector('#dropZone'),
  fileInput: document.querySelector('#fileInput'),
  importButton: document.querySelector('#importButton'),
  newImportButton: document.querySelector('#newImportButton'),
  archiveButton: document.querySelector('#archiveButton'),
  archiveCount: document.querySelector('#archiveCount'),
  recentList: document.querySelector('#recentList'),
  drawerList: document.querySelector('#drawerList'),
  clearButton: document.querySelector('#clearButton'),
  loadingLayer: document.querySelector('#loadingLayer'),
  loadingTitle: document.querySelector('#loadingTitle'),
  loadingDetail: document.querySelector('#loadingDetail'),
  progressList: document.querySelector('#progressList'),
  errorLayer: document.querySelector('#errorLayer'),
  errorMessage: document.querySelector('#errorMessage'),
  errorCode: document.querySelector('#errorCode'),
  errorCloseButton: document.querySelector('#errorCloseButton'),
  archiveDrawer: document.querySelector('#archiveDrawer'),
  drawerScrim: document.querySelector('#drawerScrim'),
  drawerCloseButton: document.querySelector('#drawerCloseButton'),
  confirmDialog: document.querySelector('#confirmDialog'),
  confirmTitle: document.querySelector('#confirmTitle'),
  confirmText: document.querySelector('#confirmText'),
  toast: document.querySelector('#toast'),
  campaignDate: document.querySelector('#campaignDate'),
  countryTitle: document.querySelector('#countryTitle'),
  countryTag: document.querySelector('#countryTag'),
  rulerName: document.querySelector('#rulerName'),
  confidenceStrip: document.querySelector('#confidenceStrip'),
  confidenceLabel: document.querySelector('#confidenceLabel'),
  confidenceValue: document.querySelector('#confidenceValue'),
  economyMetrics: document.querySelector('#economyMetrics'),
  countryMetrics: document.querySelector('#countryMetrics'),
  relationList: document.querySelector('#relationList'),
  militaryBoard: document.querySelector('#militaryBoard'),
  warList: document.querySelector('#warList'),
  technicalList: document.querySelector('#technicalList'),
  warningSheet: document.querySelector('#warningSheet'),
  warningList: document.querySelector('#warningList'),
  reparseButton: document.querySelector('#reparseButton'),
  deleteButton: document.querySelector('#deleteButton')
};

const state = {
  records: [],
  currentRecord: null,
  currentSourceFile: null,
  toastTimer: null,
  processing: false
};

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function formatNumber(value, maximumFractionDigits = 1) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(Number(value));
}

function formatCompact(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  if (Math.abs(numeric) < 10_000) return formatNumber(numeric, 1);
  return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(numeric);
}

function formatBytes(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${formatNumber(bytes / 1024, 1)} КБ`;
  return `${formatNumber(bytes / (1024 ** 2), 1)} МБ`;
}

function formatDuration(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const duration = Number(value);
  return duration < 1000 ? `${Math.round(duration)} мс` : `${formatNumber(duration / 1000, 2)} с`;
}

function displayDate(value) {
  if (!value) return 'ДАТА НЕ РАСПОЗНАНА';
  return String(value).replaceAll('.', ' · ');
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function setProgress(step, title, detail) {
  const order = ['read', 'container', 'parse', 'store'];
  const activeIndex = order.indexOf(step);
  elements.loadingTitle.textContent = title;
  elements.loadingDetail.textContent = detail;
  for (const item of elements.progressList.querySelectorAll('li')) {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle('is-done', index < activeIndex);
    item.classList.toggle('is-active', index === activeIndex);
  }
}

function showLoading(step = 'read') {
  elements.loadingLayer.hidden = false;
  elements.loadingLayer.setAttribute('aria-busy', 'true');
  setProgress(step, 'Читаю файл', 'Проверка размера и цифрового отпечатка…');
}

function hideLoading() {
  elements.loadingLayer.hidden = true;
  elements.loadingLayer.setAttribute('aria-busy', 'false');
}

function showError(error) {
  hideLoading();
  const code = error?.code || 'UNEXPECTED_ERROR';
  const message = error instanceof SaveParseError
    ? error.message
    : 'Произошла непредвиденная ошибка при локальном разборе файла.';
  elements.errorMessage.textContent = message;
  elements.errorCode.textContent = `${code}${error?.details?.cause ? ` · ${error.details.cause}` : ''}`;
  elements.errorLayer.hidden = false;
}

function createMetric(label, value, note, tone = '') {
  const article = document.createElement('article');
  article.className = `metric-cell${tone ? ` is-${tone}` : ''}`;
  const labelNode = document.createElement('span');
  labelNode.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  const small = document.createElement('small');
  small.textContent = note;
  article.append(labelNode, strong, small);
  return article;
}

function appendDefinition(list, label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const definition = document.createElement('dd');
  definition.textContent = value;
  row.append(term, definition);
  list.append(row);
}

function renderRelations(snapshot) {
  elements.relationList.replaceChildren();
  if (!snapshot.relations?.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = 'Подходящие дипломатические записи не найдены в этой структуре сейва.';
    elements.relationList.append(empty);
    return;
  }

  for (const relation of snapshot.relations) {
    const row = document.createElement('article');
    row.className = 'relation-row';
    const body = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = relation.target || relation.source || 'Неизвестная страна';
    const small = document.createElement('small');
    small.textContent = relation.type || 'Отношение';
    body.append(strong, small);
    const value = document.createElement('b');
    value.textContent = relation.value == null ? '—' : formatNumber(relation.value, 0);
    if (relation.value > 0) value.className = 'is-positive';
    if (relation.value < 0) value.className = 'is-negative';
    row.append(body, value);
    elements.relationList.append(row);
  }
}

function renderMilitary(snapshot) {
  const military = snapshot.military || {};
  const entries = [
    ['Армии', military.armies, 'найденных армейских блоков'],
    ['Солдаты', military.soldiers, 'суммарная известная численность'],
    ['Полки', military.regiments, 'суммарное число подразделений'],
    ['Флоты', military.fleets, 'найденных флотских блоков'],
    ['Корабли', military.ships, 'суммарная известная численность'],
    ['Людские ресурсы', snapshot.country?.manpower, 'поле страны игрока']
  ];
  elements.militaryBoard.replaceChildren();
  for (const [label, value, note] of entries) {
    const article = document.createElement('article');
    article.className = 'military-entry';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const output = document.createElement('output');
    output.textContent = formatCompact(value);
    const paragraph = document.createElement('p');
    paragraph.textContent = note;
    article.append(strong, output, paragraph);
    elements.militaryBoard.append(article);
  }
}

function renderWars(snapshot) {
  elements.warList.replaceChildren();
  if (!snapshot.wars?.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = 'Активные войны не найдены или их блок неизвестен этой версии адаптера.';
    elements.warList.append(empty);
    return;
  }

  for (const war of snapshot.wars) {
    const article = document.createElement('article');
    article.className = 'war-file';
    const strong = document.createElement('strong');
    strong.textContent = war.name || `Война ${war.id || 'без названия'}`;
    const start = document.createElement('p');
    start.textContent = war.startDate ? `Начало: ${war.startDate}` : 'Дата начала не найдена';
    const goal = document.createElement('p');
    goal.textContent = war.goal ? `Цель: ${war.goal}` : 'Цель войны не распознана';
    article.append(strong, start, goal);
    elements.warList.append(article);
  }
}

function renderTechnical(snapshot) {
  const metadata = snapshot.metadata || {};
  const diagnostics = snapshot.diagnostics || {};
  elements.technicalList.replaceChildren();
  appendDefinition(elements.technicalList, 'Файл', metadata.sourceFileName || '—');
  appendDefinition(elements.technicalList, 'Размер', formatBytes(metadata.sourceSize));
  appendDefinition(elements.technicalList, 'Контейнер', metadata.container || '—');
  appendDefinition(elements.technicalList, 'Кодировка', metadata.encoding || '—');
  appendDefinition(elements.technicalList, 'Версия игры', metadata.version || 'не найдена');
  appendDefinition(elements.technicalList, 'Токены', formatNumber(diagnostics.tokenCount, 0));
  appendDefinition(elements.technicalList, 'Макс. вложенность', formatNumber(diagnostics.maxDepth, 0));
  appendDefinition(elements.technicalList, 'Разбор', formatDuration(diagnostics.parseDurationMs));
  appendDefinition(elements.technicalList, 'Распаковка', formatDuration(diagnostics.decompressionDurationMs));
  appendDefinition(elements.technicalList, 'SHA-256', snapshot.hash ? `${snapshot.hash.slice(0, 16)}…` : '—');

  const warnings = diagnostics.warnings || [];
  elements.warningList.replaceChildren();
  elements.warningSheet.hidden = warnings.length === 0;
  for (const warning of warnings) {
    const item = document.createElement('li');
    item.textContent = warning;
    elements.warningList.append(item);
  }
}

function renderSnapshot(snapshot) {
  const metadata = snapshot.metadata || {};
  elements.campaignDate.textContent = displayDate(metadata.date);
  elements.countryTitle.textContent = metadata.countryName || metadata.tag || 'Неизвестная держава';
  elements.countryTag.textContent = metadata.tag || '—';
  elements.rulerName.textContent = metadata.ruler ? `Правитель: ${metadata.ruler}` : 'Правитель не найден';

  const confidence = Math.round((snapshot.diagnostics?.confidence || 0) * 100);
  const partial = Boolean(snapshot.diagnostics?.partial);
  elements.confidenceStrip.classList.toggle('is-partial', partial);
  elements.confidenceLabel.textContent = partial ? 'ЧАСТИЧНОЕ СОВПАДЕНИЕ СХЕМЫ' : 'СТРУКТУРА РАСПОЗНАНА';
  elements.confidenceValue.textContent = `${confidence}%`;

  const economy = snapshot.economy || {};
  elements.economyMetrics.replaceChildren(
    createMetric('КАЗНА', formatCompact(economy.treasury), 'значение в сейве'),
    createMetric('ДОХОД', formatCompact(economy.income), 'за найденный период', economy.income > 0 ? 'positive' : ''),
    createMetric('РАСХОДЫ', formatCompact(economy.expenses), 'за найденный период', economy.expenses > 0 ? 'negative' : ''),
    createMetric('БАЛАНС', formatCompact(economy.balance), 'доход минус расходы', economy.balance > 0 ? 'positive' : economy.balance < 0 ? 'negative' : '')
  );

  elements.countryMetrics.replaceChildren();
  appendDefinition(elements.countryMetrics, 'Население', formatCompact(snapshot.country?.population));
  appendDefinition(elements.countryMetrics, 'Территории', formatNumber(snapshot.country?.territoryCount, 0));
  appendDefinition(elements.countryMetrics, 'Средний контроль', snapshot.country?.averageControl == null ? '—' : formatNumber(snapshot.country.averageControl, 2));
  appendDefinition(elements.countryMetrics, 'Людские ресурсы', formatCompact(snapshot.country?.manpower));

  renderRelations(snapshot);
  renderMilitary(snapshot);
  renderWars(snapshot);
  renderTechnical(snapshot);

  elements.startView.hidden = true;
  elements.dossierView.hidden = false;
  switchTab('overview');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function createCaseButton(record, compact = false) {
  const snapshot = record.snapshot || record;
  const metadata = snapshot.metadata || {};
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'recent-case';
  button.dataset.hash = record.hash || snapshot.hash;
  button.setAttribute('data-native-press', '');

  const body = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = metadata.countryName || metadata.tag || metadata.sourceFileName || 'Неизвестная кампания';
  const small = document.createElement('small');
  const parts = [metadata.date, metadata.tag, compact ? metadata.sourceFileName : null].filter(Boolean);
  small.textContent = parts.join(' · ') || 'Без распознанной даты';
  body.append(strong, small);

  const badge = document.createElement('b');
  badge.textContent = metadata.container === 'zip' ? 'ZIP' : 'TXT';
  button.append(body, badge);
  button.addEventListener('click', () => openRecord(button.dataset.hash));
  return button;
}

function renderArchive() {
  elements.archiveCount.textContent = String(state.records.length);
  elements.clearButton.hidden = state.records.length === 0;
  elements.recentList.replaceChildren();
  elements.drawerList.replaceChildren();

  if (!state.records.length) {
    for (const target of [elements.recentList, elements.drawerList]) {
      const empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = 'Архив пуст. Первый импорт создаст локальное дело кампании.';
      target.append(empty);
    }
    return;
  }

  for (const record of state.records.slice(0, 5)) elements.recentList.append(createCaseButton(record));
  for (const record of state.records) elements.drawerList.append(createCaseButton(record, true));
}

async function refreshArchive() {
  state.records = await listCampaigns();
  renderArchive();
}

async function openRecord(hash) {
  const record = await getCampaign(hash);
  if (!record?.snapshot) {
    showToast('Дело не найдено в локальном архиве.');
    await refreshArchive();
    return;
  }
  state.currentRecord = record;
  state.currentSourceFile = null;
  closeDrawer();
  renderSnapshot(record.snapshot);
}

async function handleFile(file) {
  if (!file || state.processing) return;
  state.processing = true;
  state.currentSourceFile = file;
  showLoading('read');

  try {
    await nextPaint();
    setProgress('container', 'Проверяю контейнер', 'Plaintext, ZIP или бинарный формат…');
    await nextPaint();
    setProgress('parse', 'Разбираю структуру', 'Ищу страну игрока, экономику, территории и войска…');
    const snapshot = await parseCampaignFile(file);
    await nextPaint();
    setProgress('store', 'Подшиваю дело', 'Сохраняю паспорт кампании в локальном архиве…');
    const persistence = await saveCampaign(snapshot, file);
    await refreshArchive();
    state.currentRecord = await getCampaign(snapshot.hash) || { hash: snapshot.hash, snapshot, source: null };
    hideLoading();
    renderSnapshot(snapshot);
    if (persistence.warning) showToast(persistence.warning);
    else showToast('Сохранение разобрано и подшито в архив.');
  } catch (error) {
    console.error('[КАНЦЕЛЯРИЯ] import failed', error);
    showError(error);
  } finally {
    state.processing = false;
    elements.fileInput.value = '';
  }
}

async function reparseCurrent() {
  if (state.processing) return;
  const source = state.currentSourceFile || state.currentRecord?.source?.blob;
  if (!source) {
    showToast('Исходный файл не сохранён. Выбери .eu5 заново.');
    elements.fileInput.click();
    return;
  }

  state.processing = true;
  showLoading('read');
  try {
    const fileName = state.currentSourceFile?.name || state.currentRecord?.source?.name || 'campaign.eu5';
    const buffer = await source.arrayBuffer();
    setProgress('parse', 'Повторный разбор', 'Проверяю файл текущей версией адаптера…');
    await nextPaint();
    const snapshot = await parseCampaignBuffer(buffer, { fileName });
    setProgress('store', 'Обновляю дело', 'Перезаписываю локальный паспорт кампании…');
    const sourceForStorage = state.currentSourceFile || new File([source], fileName, {
      type: state.currentRecord?.source?.type || 'application/octet-stream',
      lastModified: state.currentRecord?.source?.lastModified || Date.now()
    });
    await saveCampaign(snapshot, sourceForStorage);
    await refreshArchive();
    state.currentRecord = await getCampaign(snapshot.hash) || { hash: snapshot.hash, snapshot };
    hideLoading();
    renderSnapshot(snapshot);
    showToast('Дело разобрано повторно.');
  } catch (error) {
    showError(error);
  } finally {
    state.processing = false;
  }
}

function switchTab(tab) {
  for (const button of document.querySelectorAll('[data-tab]')) {
    button.classList.toggle('is-active', button.dataset.tab === tab);
  }
  for (const page of document.querySelectorAll('[data-page]')) {
    const active = page.dataset.page === tab;
    page.classList.toggle('is-active', active);
    page.hidden = !active;
  }
}

function openDrawer() {
  elements.archiveDrawer.hidden = false;
  elements.drawerCloseButton.focus();
}

function closeDrawer() {
  elements.archiveDrawer.hidden = true;
}

function confirmAction(title, text) {
  elements.confirmTitle.textContent = title;
  elements.confirmText.textContent = text;
  if (typeof elements.confirmDialog.showModal !== 'function') {
    return Promise.resolve(globalThis.confirm(`${title}\n\n${text}`));
  }
  elements.confirmDialog.showModal();
  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener('close', () => resolve(elements.confirmDialog.returnValue === 'confirm'), { once: true });
  });
}

async function deleteCurrent() {
  const hash = state.currentRecord?.hash || state.currentRecord?.snapshot?.hash;
  if (!hash) return;
  const confirmed = await confirmAction('Удалить дело?', 'Паспорт кампании и сохранённый исходный файл будут удалены с этого устройства.');
  if (!confirmed) return;
  await deleteCampaign(hash);
  state.currentRecord = null;
  state.currentSourceFile = null;
  await refreshArchive();
  elements.dossierView.hidden = true;
  elements.startView.hidden = false;
  showToast('Дело удалено.');
}

async function clearAll() {
  if (!state.records.length) return;
  const confirmed = await confirmAction('Очистить весь архив?', `Будут удалены все локальные дела: ${state.records.length}.`);
  if (!confirmed) return;
  await clearCampaigns();
  state.currentRecord = null;
  state.currentSourceFile = null;
  await refreshArchive();
  elements.dossierView.hidden = true;
  elements.startView.hidden = false;
  closeDrawer();
  showToast('Локальный архив очищен.');
}

function bindEvents() {
  elements.importButton.addEventListener('click', () => elements.fileInput.click());
  elements.newImportButton.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', () => handleFile(elements.fileInput.files?.[0]));
  elements.errorCloseButton.addEventListener('click', () => {
    elements.errorLayer.hidden = true;
    elements.importButton.focus();
  });
  elements.archiveButton.addEventListener('click', openDrawer);
  elements.drawerScrim.addEventListener('click', closeDrawer);
  elements.drawerCloseButton.addEventListener('click', closeDrawer);
  elements.clearButton.addEventListener('click', clearAll);
  elements.reparseButton.addEventListener('click', reparseCurrent);
  elements.deleteButton.addEventListener('click', deleteCurrent);

  for (const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  }

  const preventDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of ['dragenter', 'dragover']) {
    elements.dropZone.addEventListener(type, (event) => {
      preventDrag(event);
      elements.dropZone.classList.add('is-dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    elements.dropZone.addEventListener(type, (event) => {
      preventDrag(event);
      elements.dropZone.classList.remove('is-dragging');
    });
  }
  elements.dropZone.addEventListener('drop', (event) => handleFile(event.dataTransfer?.files?.[0]));
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!elements.archiveDrawer.hidden) closeDrawer();
      if (!elements.errorLayer.hidden) elements.errorLayer.hidden = true;
    }
  });
}

async function init() {
  bindEvents();
  await refreshArchive();
  const latestHash = state.records[0]?.hash;
  if (latestHash && new URLSearchParams(location.search).get('resume') === '1') await openRecord(latestHash);
}

init().catch((error) => {
  console.error('[КАНЦЕЛЯРИЯ] startup failed', error);
  showError(error);
});
