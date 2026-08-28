import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const DEFAULT_TEXT_STYLE = Object.freeze({
  font: 'serif',
  size: 28,
  bold: false,
  italic: false,
  align: 'left',
  color: '#26333a'
});
const FONT_STACKS = Object.freeze({
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  sans: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
});
const ALIGNMENTS = new Set(['left', 'center', 'right']);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const defaults = { text: '', numbers: '', page: 0, textStyle: { ...DEFAULT_TEXT_STYLE } };

const storage = createVersionedStore({
  namespace: 'pocket-works:perelist',
  version: 2,
  defaults,
  migrations: {
    1(value) {
      return {
        ...defaults,
        ...(value && typeof value === 'object' ? value : {}),
        textStyle: { ...DEFAULT_TEXT_STYLE }
      };
    }
  },
  validate(value) {
    return value && typeof value === 'object'
      && typeof value.text === 'string'
      && typeof value.numbers === 'string'
      && (value.page === 0 || value.page === 1)
      && isValidTextStyle(value.textStyle);
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
const textFont = document.querySelector('#text-font');
const textSize = document.querySelector('#text-size');
const textSizeValue = document.querySelector('#text-size-value');
const textBold = document.querySelector('#text-bold');
const textItalic = document.querySelector('#text-italic');
const textColor = document.querySelector('#text-color');
const alignButtons = [...document.querySelectorAll('[data-align]')];
const wakeState = document.querySelector('#wake-state');
const tabs = [...document.querySelectorAll('[data-page-target]')];

let currentPage = storage.get('page', 0) === 1 ? 1 : 0;
let currentTextStyle = sanitizeTextStyle(storage.get('textStyle', DEFAULT_TEXT_STYLE));
let saveTimer = 0;
let gesture = null;
let wakeLock = null;
let wakeRequestPending = false;

textInput.value = storage.get('text', '');
numbersInput.value = storage.get('numbers', '');
syncTextStyleControls();
applyTextStyle();
renderCounts();
showPage(currentPage, { focus: false, persist: false });

textInput.addEventListener('input', () => {
  queueSave();
  renderCounts();
});

numbersInput.addEventListener('input', () => {
  const cleaned = numbersInput.value.replace(/[^0-9\s.,+\-−/:;%()]/gu, '');
  if (cleaned !== numbersInput.value) {
    const selection = numbersInput.selectionStart;
    numbersInput.value = cleaned;
    numbersInput.setSelectionRange(Math.max(0, selection - 1), Math.max(0, selection - 1));
  }
  queueSave();
  renderCounts();
});

textFont.addEventListener('change', () => updateTextStyle({ font: textFont.value }));
textSize.addEventListener('input', () => updateTextStyle({ size: Number(textSize.value) }));
textColor.addEventListener('input', () => updateTextStyle({ color: textColor.value }));
textBold.addEventListener('click', () => updateTextStyle({ bold: !currentTextStyle.bold }));
textItalic.addEventListener('click', () => updateTextStyle({ italic: !currentTextStyle.italic }));
for (const button of alignButtons) {
  button.addEventListener('click', () => updateTextStyle({ align: button.dataset.align }));
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    showPage(Number(tab.dataset.pageTarget), { focus: true });
  });
}

stack.addEventListener('pointerdown', (event) => {
  if (event.target.closest('textarea, button, a, select, input, label')) return;
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
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === 'ArrowLeft') showPage(0, { focus: false });
  if (event.key === 'ArrowRight') showPage(1, { focus: false });
});

wakeState.addEventListener('click', requestWakeLock);
window.addEventListener('pointerdown', ensureWakeLock, { passive: true, once: true });
window.addEventListener('pagehide', () => {
  flushSave();
  releaseWakeLock();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushSave();
    return;
  }
  requestWakeLock();
});

requestWakeLock();

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

function updateTextStyle(patch) {
  currentTextStyle = sanitizeTextStyle({ ...currentTextStyle, ...patch });
  syncTextStyleControls();
  applyTextStyle();
  queueSave();
}

function sanitizeTextStyle(value) {
  const candidate = value && typeof value === 'object' ? value : {};
  const font = Object.hasOwn(FONT_STACKS, candidate.font) ? candidate.font : DEFAULT_TEXT_STYLE.font;
  const rawSize = Number(candidate.size);
  const size = Number.isFinite(rawSize) ? Math.min(56, Math.max(18, Math.round(rawSize))) : DEFAULT_TEXT_STYLE.size;
  const align = ALIGNMENTS.has(candidate.align) ? candidate.align : DEFAULT_TEXT_STYLE.align;
  const color = typeof candidate.color === 'string' && COLOR_PATTERN.test(candidate.color) ? candidate.color.toLowerCase() : DEFAULT_TEXT_STYLE.color;
  return {
    font,
    size,
    bold: candidate.bold === true,
    italic: candidate.italic === true,
    align,
    color
  };
}

function isValidTextStyle(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.hasOwn(FONT_STACKS, value.font)
    && Number.isInteger(value.size) && value.size >= 18 && value.size <= 56
    && typeof value.bold === 'boolean'
    && typeof value.italic === 'boolean'
    && ALIGNMENTS.has(value.align)
    && typeof value.color === 'string' && COLOR_PATTERN.test(value.color);
}

function syncTextStyleControls() {
  textFont.value = currentTextStyle.font;
  textSize.value = String(currentTextStyle.size);
  textSizeValue.value = String(currentTextStyle.size);
  textSizeValue.textContent = String(currentTextStyle.size);
  textColor.value = currentTextStyle.color;
  textBold.setAttribute('aria-pressed', String(currentTextStyle.bold));
  textItalic.setAttribute('aria-pressed', String(currentTextStyle.italic));
  for (const button of alignButtons) {
    const active = button.dataset.align === currentTextStyle.align;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function applyTextStyle() {
  textInput.style.setProperty('--text-font', FONT_STACKS[currentTextStyle.font]);
  textInput.style.setProperty('--text-size', `${currentTextStyle.size}px`);
  textInput.style.setProperty('--text-weight', currentTextStyle.bold ? '750' : '400');
  textInput.style.setProperty('--text-style', currentTextStyle.italic ? 'italic' : 'normal');
  textInput.style.setProperty('--text-align', currentTextStyle.align);
  textInput.style.setProperty('--text-color', currentTextStyle.color);
}

function queueSave() {
  saveState.textContent = 'Сохраняю…';
  saveState.classList.add('is-saving');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSave, 120);
}

function flushSave() {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  const saved = storage.patch({
    text: textInput.value,
    numbers: numbersInput.value,
    page: currentPage,
    textStyle: currentTextStyle
  });
  saveState.textContent = saved ? 'Сохранено' : 'Не сохранено';
  saveState.classList.remove('is-saving');
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

async function ensureWakeLock() {
  if (!wakeLock && document.visibilityState === 'visible') await requestWakeLock();
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    setWakeState('unsupported', 'Wake Lock недоступен', true);
    return false;
  }
  if (document.visibilityState !== 'visible') return false;
  if (wakeLock || wakeRequestPending) return Boolean(wakeLock);

  wakeRequestPending = true;
  setWakeState('pending', 'Экран: включаю…');
  try {
    const lock = await navigator.wakeLock.request('screen');
    wakeLock = lock;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
      if (document.visibilityState === 'visible') setWakeState('released', 'Экран: нажми, чтобы удерживать');
    });
    setWakeState('active', 'Экран не гаснет');
    return true;
  } catch (error) {
    console.warn('Screen Wake Lock request failed', error);
    setWakeState('error', 'Экран: нажми для удержания');
    return false;
  } finally {
    wakeRequestPending = false;
  }
}

async function releaseWakeLock() {
  const lock = wakeLock;
  wakeLock = null;
  if (!lock) return;
  try {
    await lock.release();
  } catch (error) {
    console.warn('Screen Wake Lock release failed', error);
  }
}

function setWakeState(state, label, disabled = false) {
  wakeState.dataset.state = state;
  wakeState.textContent = label;
  wakeState.disabled = disabled;
}

createWorkshopMode({
  appName: 'ПЕРЕЛИСТ',
  version: '1.1.0',
  cachePrefix: 'perelist-',
  storageNamespace: 'pocket-works:perelist',
  onReset() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    storage.reset();
    textInput.value = '';
    numbersInput.value = '';
    currentTextStyle = { ...DEFAULT_TEXT_STYLE };
    syncTextStyleControls();
    applyTextStyle();
    saveState.textContent = 'Сохранено';
    saveState.classList.remove('is-saving');
    renderCounts();
    showPage(0, { focus: false, persist: false });
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
