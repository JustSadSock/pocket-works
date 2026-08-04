import {
  EXPERIMENT_STORAGE_KEY,
  FOUNDATION_STORAGE_KEY,
  PRIVACY_STORAGE_KEY,
  collectTempoStorage,
  decryptBackup,
  encryptBackup,
  filterJournalItems,
  hashPin,
  nextAction,
  readStoredData,
  safeJsonParse,
  summarizeHome,
  verifyPin
} from './phase3-core.js';

const e = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const score = (value) => value == null ? '—' : Number(value).toFixed(Number(value) % 1 ? 1 : 0);

let journalFilter = 'all';
let augmentQueued = false;
let loadedBackup = null;

const toast = (text) => {
  const element = document.querySelector('#toast');
  if (!element) return;
  element.textContent = text;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2200);
};

function foundationState() {
  return readStoredData(localStorage, FOUNDATION_STORAGE_KEY, {});
}
function experimentState() {
  return readStoredData(localStorage, EXPERIMENT_STORAGE_KEY, {});
}
function privacyState() {
  return safeJsonParse(localStorage.getItem(PRIVACY_STORAGE_KEY), {}) || {};
}
function savePrivacy(next) {
  localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(next));
}

function sparkline(series, label) {
  const width = 260;
  const height = 84;
  const padding = 10;
  if (!series.length) return `<div class="ux-empty-chart">После нескольких записей здесь появится линия.</div>`;
  const points = series.map((item, index) => {
    const x = series.length === 1 ? width / 2 : padding + index * ((width - padding * 2) / (series.length - 1));
    const y = height - padding - (Number(item.value) / 5) * (height - padding * 2);
    return { x, y, ...item };
  });
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  return `<svg class="ux-spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(label)}">
    <path class="ux-grid" d="M10,42 H250 M10,10 H250 M10,74 H250"></path>
    ${points.length > 1 ? `<path class="ux-line" d="${path}"></path>` : ''}
    ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4"><title>${e(point.week)}: ${score(point.value)}/5, записей ${point.count}</title></circle>`).join('')}
  </svg>`;
}

function route(action) {
  if (action === 'episode') document.querySelector('[data-action="episode"]')?.click();
  if (action === 'experiments') document.querySelector('[data-tab="experiments"]')?.click();
  if (action === 'techniques') document.querySelector('[data-tab="techniques"]')?.click();
}

function augmentNavigation() {
  const nav = document.querySelector('.nav');
  if (!nav || nav.dataset.uxReady) return;
  nav.dataset.uxReady = 'true';
  const labels = {
    today: 'Сегодня', journal: 'Журнал', techniques: 'Практики', experiments: 'Эксперименты', export: 'Экспорт'
  };
  nav.querySelectorAll('[data-tab]').forEach((button) => {
    button.type = 'button';
    button.setAttribute('aria-label', labels[button.dataset.tab] || button.textContent.trim());
  });
  const shell = document.querySelector('.app-shell');
  if (shell && !document.querySelector('#tempo-quick-add')) {
    shell.insertAdjacentHTML('beforeend', '<button id="tempo-quick-add" type="button" data-phase3-action="quick-episode" aria-label="Быстро записать эпизод"><b>＋</b><span>Запись</span></button>');
  }
}

function augmentToday() {
  const hero = document.querySelector('#screen .hero');
  if (!hero || hero.dataset.uxReady) return;
  hero.dataset.uxReady = 'true';
  const summary = summarizeHome(foundationState(), experimentState());
  const action = nextAction(summary);
  hero.insertAdjacentHTML('afterend', `<section class="ux-next ux-${action.tone}">
    <div><p class="eyebrow">СЛЕДУЮЩИЙ ШАГ</p><h2>${e(action.title)}</h2><p>${e(action.body)}</p></div>
    <button type="button" class="solid" data-phase3-route="${e(action.action)}">Продолжить</button>
  </section>`);

  const target = document.querySelector('#screen .section');
  const trends = `<section class="section ux-trends">
    <div class="sectionhead"><div><p class="eyebrow">ДИНАМИКА ПО НЕДЕЛЯМ</p><h2>Не один случай, а линия</h2></div><small>медианы 0–5</small></div>
    <div class="ux-chart-grid"><article><div><b>Контроль</b><strong>${score(summary.medianControl)}/5</strong></div>${sparkline(summary.controlSeries, 'Динамика контроля')}</article><article><div><b>Удовольствие</b><strong>${score(summary.medianPleasure)}/5</strong></div>${sparkline(summary.pleasureSeries, 'Динамика удовольствия')}</article></div>
  </section>`;
  if (target) target.insertAdjacentHTML('afterend', trends);
}

function applyJournalFilter() {
  const timeline = document.querySelector('#screen .timeline');
  if (!timeline) return;
  const items = timeline.querySelectorAll('.item');
  const results = filterJournalItems(items, journalFilter);
  for (const result of results) result.item.hidden = !result.visible;
  document.querySelectorAll('[data-journal-filter]').forEach((button) => {
    const active = button.dataset.journalFilter === journalFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const visible = results.filter((item) => item.visible).length;
  const count = document.querySelector('#journal-visible-count');
  if (count) count.textContent = `${visible} ${visible === 1 ? 'запись' : 'записей'}`;
}

function augmentJournal() {
  const timeline = document.querySelector('#screen .timeline');
  if (!timeline || timeline.dataset.uxReady) return;
  timeline.dataset.uxReady = 'true';
  timeline.insertAdjacentHTML('beforebegin', `<div class="ux-journal-tools"><div class="ux-filter" role="group" aria-label="Фильтр журнала">
    <button type="button" data-journal-filter="all">Все</button><button type="button" data-journal-filter="episode">Эпизоды</button><button type="button" data-journal-filter="checkin">Состояние</button><button type="button" data-journal-filter="technique">Практики</button>
  </div><small id="journal-visible-count"></small></div>`);
  applyJournalFilter();
}

function wrapOptionalFields(form, labels) {
  if (form.querySelector('.ux-optional')) return;
  const nodes = [...form.children].filter((node) => {
    const text = node.querySelector?.('legend,span')?.textContent?.trim() || '';
    return labels.some((label) => text.startsWith(label));
  });
  if (!nodes.length) return;
  const details = document.createElement('details');
  details.className = 'ux-optional';
  details.innerHTML = '<summary>Контекст и заметки <small>необязательно</small></summary><div></div>';
  const body = details.querySelector('div');
  form.querySelector('.form-actions')?.before(details);
  nodes.forEach((node) => body.append(node));
}

function enhanceScoreRows(root) {
  root.querySelectorAll('.score').forEach((row) => {
    if (row.querySelector('.ux-scale-hint')) return;
    const hint = document.createElement('small');
    hint.className = 'ux-scale-hint';
    const name = row.querySelector('b')?.textContent?.trim() || 'Показатель';
    hint.textContent = name === 'Напряжение' || name === 'Стресс' ? '0 — спокойно · 5 — максимум' : '0 — минимум · 5 — максимум';
    row.append(hint);
    row.querySelectorAll('input').forEach((input) => input.setAttribute('aria-label', `${name}: ${input.value} из 5`));
  });
}

function augmentModal() {
  const modal = document.querySelector('#modal');
  if (!modal?.open) return;
  const body = document.querySelector('#modal-body');
  if (!body || body.dataset.uxPass === body.innerHTML.length.toString()) return;
  body.dataset.uxPass = body.innerHTML.length.toString();
  enhanceScoreRows(body);
  const title = document.querySelector('#modal-title')?.textContent?.trim();
  if (title === 'Новый эпизод') {
    const form = body.querySelector('#entry-form');
    if (form && !form.querySelector('.ux-form-intro')) {
      form.insertAdjacentHTML('afterbegin', '<div class="ux-form-intro"><b>Быстрая запись</b><span>Примерные ответы лучше, чем память через неделю.</span></div>');
      wrapOptionalFields(form, ['Контекст', 'Техника', 'Средство', 'Заметка']);
      form.querySelector('.form-actions')?.classList.add('ux-sticky-actions');
    }
  }
  if (title === 'Чек-ин состояния') {
    const form = body.querySelector('#entry-form');
    if (form && !form.querySelector('.ux-form-intro')) {
      form.insertAdjacentHTML('afterbegin', '<div class="ux-form-intro"><b>Срез состояния</b><span>Оцени сегодняшний фон, а не «как должно быть».</span></div>');
      wrapOptionalFields(form, ['Заметка']);
      form.querySelector('.form-actions')?.classList.add('ux-sticky-actions');
    }
  }
  if (title === 'Новый эксперимент' && !body.querySelector('.ux-experiment-guide')) {
    body.querySelector('form')?.insertAdjacentHTML('afterbegin', '<ol class="ux-experiment-guide"><li>Выбери одну вещь</li><li>Собери базу</li><li>Повтори с изменением</li></ol>');
  }
  if (title === 'Настройки') augmentSettings(body);
}

function augmentExperiments() {
  const page = document.querySelector('#screen .experiment-list');
  if (!page || page.dataset.uxReady) return;
  page.dataset.uxReady = 'true';
  const summary = summarizeHome(foundationState(), experimentState());
  const action = nextAction(summary);
  page.insertAdjacentHTML('beforebegin', `<aside class="ux-experiment-next"><b>${e(action.title)}</b><span>${e(action.body)}</span></aside>`);
}

function augmentExport() {
  const bar = document.querySelector('#screen .exportbar');
  if (!bar || bar.dataset.uxReady) return;
  bar.dataset.uxReady = 'true';
  bar.insertAdjacentHTML('beforeend', `<div class="ux-export-divider"><span>Документ и резервная копия</span></div>
    <button type="button" class="outline" data-phase3-action="pdf">Сохранить аккуратный PDF</button>
    <button type="button" class="outline" data-phase3-action="backup-export">Зашифрованная резервная копия</button>
    <button type="button" class="outline" data-phase3-action="backup-import">Восстановить резервную копию</button>
    <p class="ux-help">PDF предназначен для чтения. Зашифрованная копия восстанавливает все локальные данные TEMPO.</p>`);
}

function augmentSettings(body) {
  if (body.querySelector('.ux-privacy-settings')) return;
  const hasPin = Boolean(privacyState().pin);
  body.insertAdjacentHTML('beforeend', `<section class="ux-privacy-settings"><p class="eyebrow">ПРИВАТНОСТЬ И КОПИИ</p>
    <button type="button" class="outline" data-phase3-action="pin-setup">${hasPin ? 'Изменить код блокировки' : 'Настроить код блокировки'}</button>
    ${hasPin ? '<button type="button" class="outline" data-phase3-action="lock-now">Заблокировать сейчас</button><button type="button" class="link" data-phase3-action="pin-remove">Убрать код блокировки</button>' : ''}
    <button type="button" class="outline" data-phase3-action="backup-export">Создать зашифрованную копию</button>
    <button type="button" class="outline" data-phase3-action="backup-import">Восстановить копию</button>
    <p>Код закрывает экран от случайного просмотра. Для переноса данных используй отдельную AES‑GCM‑копию с паролем.</p></section>`);
}

function augment() {
  augmentNavigation();
  augmentToday();
  augmentJournal();
  augmentExperiments();
  augmentExport();
  augmentModal();
}
function scheduleAugment() {
  if (augmentQueued) return;
  augmentQueued = true;
  requestAnimationFrame(() => {
    augmentQueued = false;
    augment();
  });
}

function ensureToolsDialog() {
  if (document.querySelector('#tempo-tools-dialog')) return document.querySelector('#tempo-tools-dialog');
  document.body.insertAdjacentHTML('beforeend', '<dialog id="tempo-tools-dialog"><div class="ux-tool-shell"><header><button type="button" data-phase3-action="tools-close">Закрыть</button><strong id="tempo-tools-title"></strong><span></span></header><div id="tempo-tools-body"></div></div></dialog><input id="tempo-backup-file" type="file" accept="application/json,.json" hidden>');
  return document.querySelector('#tempo-tools-dialog');
}
function openTool(title, html) {
  const dialog = ensureToolsDialog();
  dialog.querySelector('#tempo-tools-title').textContent = title;
  dialog.querySelector('#tempo-tools-body').innerHTML = html;
  dialog.showModal();
}
function closeTool() {
  const dialog = document.querySelector('#tempo-tools-dialog');
  if (dialog?.open) dialog.close();
}

function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function pinSetup() {
  openTool('Код блокировки', `<form id="tempo-pin-form"><p class="ux-help">4–8 цифр. Код хранится только как salted SHA‑256 hash.</p><label class="field"><span>Новый код</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" required></label><label class="field"><span>Повтори код</span><input name="confirm" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" required></label><div class="form-actions"><button class="solid" type="submit">Сохранить код</button></div></form>`);
}
function backupExport() {
  openTool('Зашифрованная копия', `<form id="tempo-backup-export-form"><p class="ux-help">Придумай пароль от 6 символов. Без него восстановить файл невозможно.</p><label class="field"><span>Пароль</span><input name="passphrase" type="password" minlength="6" autocomplete="new-password" required></label><label class="field"><span>Повтори пароль</span><input name="confirm" type="password" minlength="6" autocomplete="new-password" required></label><div class="form-actions"><button class="solid" type="submit">Создать файл</button></div></form>`);
}
function backupImport() {
  document.querySelector('#tempo-backup-file')?.click();
}

function buildPrintableReport() {
  const preview = document.querySelector('#preview');
  const content = preview?.value || 'Открой раздел «Экспорт», чтобы сформировать отчёт.';
  const summary = summarizeHome(foundationState(), experimentState());
  const report = document.createElement('section');
  report.id = 'tempo-print-report';
  report.innerHTML = `<header><p>TEMPO · ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date())}</p><h1>Отчёт наблюдений</h1><div><span>Контроль ${score(summary.medianControl)}/5</span><span>Удовольствие ${score(summary.medianPleasure)}/5</span><span>Записей ${summary.totalEntries}</span></div></header><pre>${e(content)}</pre>`;
  document.body.append(report);
  document.body.classList.add('tempo-printing');
  const cleanup = () => {
    document.body.classList.remove('tempo-printing');
    report.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  window.setTimeout(() => {
    if (document.body.contains(report)) cleanup();
  }, 1500);
}

function renderLock() {
  const privacy = privacyState();
  if (!privacy.pin || document.querySelector('#tempo-lock')) return;
  document.body.classList.add('tempo-is-locked');
  document.body.insertAdjacentHTML('beforeend', `<section id="tempo-lock" role="dialog" aria-modal="true" aria-labelledby="tempo-lock-title"><div><i></i><p class="eyebrow">ЛОКАЛЬНАЯ БЛОКИРОВКА</p><h1 id="tempo-lock-title">TEMPO закрыт</h1><p>Введи код, чтобы открыть журнал.</p><form id="tempo-unlock-form"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="current-password" aria-label="Код блокировки" required><button class="solid" type="submit">Открыть</button><small id="tempo-unlock-error" role="alert"></small></form></div></section>`);
}
function removeLock() {
  document.querySelector('#tempo-lock')?.remove();
  document.body.classList.remove('tempo-is-locked');
}

async function handleSubmit(event) {
  if (event.target.id === 'tempo-pin-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    if (data.get('pin') !== data.get('confirm')) return toast('Коды не совпадают');
    try {
      const pin = await hashPin(String(data.get('pin')));
      savePrivacy({ ...privacyState(), pin });
      closeTool();
      toast('Код блокировки сохранён');
    } catch (error) { toast(error.message); }
  }
  if (event.target.id === 'tempo-backup-export-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    if (data.get('passphrase') !== data.get('confirm')) return toast('Пароли не совпадают');
    try {
      const payload = await encryptBackup(collectTempoStorage(localStorage), String(data.get('passphrase')));
      download(`tempo-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
      closeTool();
      toast('Зашифрованная копия создана');
    } catch (error) { toast(error.message); }
  }
  if (event.target.id === 'tempo-backup-import-form') {
    event.preventDefault();
    try {
      const data = new FormData(event.target);
      const decoded = await decryptBackup(loadedBackup, String(data.get('passphrase')));
      for (const [key, value] of Object.entries(decoded.storage)) localStorage.setItem(key, value);
      closeTool();
      toast('Данные восстановлены');
      window.setTimeout(() => location.reload(), 450);
    } catch (error) { toast(error.message); }
  }
  if (event.target.id === 'tempo-unlock-form') {
    event.preventDefault();
    const pin = String(new FormData(event.target).get('pin'));
    const valid = await verifyPin(pin, privacyState().pin);
    if (valid) return removeLock();
    const error = document.querySelector('#tempo-unlock-error');
    if (error) error.textContent = 'Неверный код';
    event.target.reset();
  }
}

function handleClick(event) {
  const routeButton = event.target.closest('[data-phase3-route]');
  if (routeButton) return route(routeButton.dataset.phase3Route);
  const filter = event.target.closest('[data-journal-filter]');
  if (filter) {
    journalFilter = filter.dataset.journalFilter;
    applyJournalFilter();
    return;
  }
  const button = event.target.closest('[data-phase3-action]');
  if (!button) return;
  const action = button.dataset.phase3Action;
  if (action === 'quick-episode') route('episode');
  if (action === 'pdf') buildPrintableReport();
  if (action === 'backup-export') backupExport();
  if (action === 'backup-import') backupImport();
  if (action === 'pin-setup') pinSetup();
  if (action === 'lock-now') { document.querySelector('#modal')?.close(); closeTool(); renderLock(); }
  if (action === 'pin-remove') {
    const next = { ...privacyState() };
    delete next.pin;
    savePrivacy(next);
    toast('Код блокировки удалён');
    scheduleAugment();
  }
  if (action === 'tools-close') closeTool();
}

function handleBackupFile(event) {
  if (event.target.id !== 'tempo-backup-file') return;
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadedBackup = safeJsonParse(reader.result, null);
    if (!loadedBackup) return toast('Файл не похож на резервную копию');
    openTool('Восстановление', `<form id="tempo-backup-import-form"><p class="warning">Текущие локальные данные TEMPO будут заменены содержимым копии.</p><label class="field"><span>Пароль копии</span><input name="passphrase" type="password" minlength="6" autocomplete="current-password" required></label><div class="form-actions"><button class="solid" type="submit">Расшифровать и восстановить</button></div></form>`);
  };
  reader.readAsText(file);
}

ensureToolsDialog();
document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', handleBackupFile);
new MutationObserver(scheduleAugment).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class'] });
renderLock();
scheduleAugment();
