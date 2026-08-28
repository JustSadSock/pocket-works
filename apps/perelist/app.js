import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const defaults = { text: '', numbers: '', page: 0 };
const storage = createVersionedStore({
  namespace: 'pocket-works:perelist',
  version: 1,
  defaults,
  validate(value) {
    return value && typeof value === 'object'
      && typeof value.text === 'string'
      && typeof value.numbers === 'string'
      && (value.page === 0 || value.page === 1);
  }
});

const track = document.querySelector('#pages-track');
const stack = document.querySelector('#page-stack');
const textInput = document.querySelector('#text-input');
const numbersInput = document.querySelector('#numbers-input');
const textCount = document.querySelector('#text-count');
const numberCount = document.querySelector('#number-count');
const saveState = document.querySelector('#save-state');
const progressFill = document.querySelector('#progress-fill');
const tabs = [...document.querySelectorAll('[data-page-target]')];

let currentPage = storage.get('page', 0) === 1 ? 1 : 0;
let saveTimer = 0;
let gesture = null;

textInput.value = storage.get('text', '');
numbersInput.value = storage.get('numbers', '');
renderCounts();
showPage(currentPage, { focus: false, persist: false });

textInput.addEventListener('input', () => {
  queueSave('text', textInput.value);
  renderCounts();
});

numbersInput.addEventListener('input', () => {
  const cleaned = numbersInput.value.replace(/[^0-9\s.,+\-−/:;%()]/gu, '');
  if (cleaned !== numbersInput.value) {
    const selection = numbersInput.selectionStart;
    numbersInput.value = cleaned;
    numbersInput.setSelectionRange(Math.max(0, selection - 1), Math.max(0, selection - 1));
  }
  queueSave('numbers', numbersInput.value);
  renderCounts();
});

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    showPage(Number(tab.dataset.pageTarget), { focus: true });
  });
}

stack.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.target.closest('textarea, button, a')) return;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
});

stack.addEventListener('pointerup', (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  gesture = null;
  if (Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
  if (dx < 0 && currentPage === 0) showPage(1, { focus: false });
  if (dx > 0 && currentPage === 1) showPage(0, { focus: false });
});

stack.addEventListener('pointercancel', () => { gesture = null; });
stack.addEventListener('lostpointercapture', () => { gesture = null; });

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
  if (event.key === 'ArrowLeft') showPage(0, { focus: false });
  if (event.key === 'ArrowRight') showPage(1, { focus: false });
});

function showPage(page, options = {}) {
  currentPage = page === 1 ? 1 : 0;
  track.dataset.page = String(currentPage);
  progressFill.dataset.page = String(currentPage);
  tabs.forEach((tab, index) => {
    const active = index === currentPage;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });

  if (options.persist !== false) storage.set('page', currentPage);
  if (options.focus) {
    const target = currentPage === 0 ? textInput : numbersInput;
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }
}

function queueSave(key, value) {
  saveState.textContent = 'Сохраняю…';
  saveState.classList.add('is-saving');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const saved = storage.set(key, value);
    saveState.textContent = saved ? 'Сохранено' : 'Не сохранено';
    saveState.classList.remove('is-saving');
  }, 120);
}

function renderCounts() {
  const chars = [...textInput.value].length;
  textCount.textContent = `${chars} ${plural(chars, 'знак', 'знака', 'знаков')}`;

  const matches = numbersInput.value.match(/[+\-−]?(?:\d+(?:[.,]\d+)?|[.,]\d+)/g) || [];
  const count = matches.length;
  numberCount.textContent = `${count} ${plural(count, 'число', 'числа', 'чисел')}`;
}

function plural(value, one, few, many) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

createWorkshopMode({
  appName: 'ПЕРЕЛИСТ',
  version: '1.0.0',
  cachePrefix: 'perelist-',
  storageNamespace: 'pocket-works:perelist',
  onReset() {
    window.clearTimeout(saveTimer);
    storage.reset();
    textInput.value = '';
    numbersInput.value = '';
    saveState.textContent = 'Сохранено';
    saveState.classList.remove('is-saving');
    renderCounts();
    showPage(0, { focus: false, persist: false });
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
