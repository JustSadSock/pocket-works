import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { parseItems, fragmentText, makeRound, correctPositions } from './puzzle-core.mjs';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:oskolki:session-v1';
const SOURCE_LIMIT = 40000;
const ITEM_LIMIT = 80;
const SAMPLE = [
  '1. Свет распространяется быстрее звука.',
  '2. Великий шёлковый путь соединял разные цивилизации.',
  '3. Память укрепляется при повторении с интервалами.',
  '4. Любое сложное предложение можно собрать из небольших частей.',
  '5. Точная последовательность слов меняет смысл высказывания.'
].join('\n');
const $ = (id) => document.getElementById(id);
const SCREENS = { editor: $('editorScreen'), play: $('playScreen'), review: $('reviewScreen'), results: $('resultsScreen') };
function defaultSession() {
  return { version: 1, view: 'editor', source: '', rounds: [], index: 0, history: [] };
}

function validateSession(value) {
  if (!value || value.version !== 1 || !['editor', 'play', 'review', 'results'].includes(value.view) ||
      typeof value.source !== 'string' || value.source.length > SOURCE_LIMIT ||
      !Array.isArray(value.rounds) || value.rounds.length > ITEM_LIMIT ||
      !Number.isInteger(value.index) || value.index < 0 || !Array.isArray(value.history)) return false;
  if (value.view !== 'editor' && (!value.rounds.length || value.index >= value.rounds.length)) return false;
  return value.rounds.every((round) => {
    if (!round || typeof round.text !== 'string' || typeof round.checked !== 'boolean' ||
        !Array.isArray(round.parts) || !Array.isArray(round.answer) || !Array.isArray(round.bank) ||
        !round.parts.length || round.parts.length > 100 ||
        !round.parts.every((piece) => typeof piece === 'string') ||
        ![...round.answer, ...round.bank].every((id) => Number.isInteger(id) && id >= 0 && id < round.parts.length)) return false;
    const ids = [...round.answer, ...round.bank];
    return new Set(ids).size === ids.length && ids.length === round.parts.length;
  });
}

function readSession() {
  try {
    const decoded = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return validateSession(decoded) ? decoded : defaultSession();
  } catch { return defaultSession(); }
}

let state = readSession();
let toastTimeout = 0;
let suppressClickUntil = 0;
let confirmAction = null;
let dragActive = null;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { showToast('Недостаточно памяти устройства для сохранения'); }
}

function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 2800);
}

function showError(text) {
  $('editorError').textContent = text;
  $('editorError').hidden = !text;
}

function formatNumber(value) { return String(value).padStart(2, '0'); }

function activeRound() { return state.rounds[state.index]; }

function updateTestState() {
  const round = activeRound();
  window.__AI_TEST_STATE__ = {
    app: 'oskolki',
    phase: state.view,
    round: state.index + 1,
    total: state.rounds.length,
    fragments: round?.parts?.length || 0,
    placed: round?.answer?.length || 0,
    checked: Boolean(round?.checked),
    completed: state.rounds.filter((item) => item.checked).length,
    score: totalAccuracy()
  };
}

function totalAccuracy() {
  const checked = state.rounds.filter((round) => round.checked);
  const count = checked.reduce((sum, round) => sum + round.parts.length, 0);
  const right = checked.reduce((sum, round) => sum + round.right, 0);
  return count ? Math.round((right / count) * 100) : 0;
}

function setView(view) {
  state.view = view;
  Object.entries(SCREENS).forEach(([name, element]) => { element.hidden = name !== view; });
  $('headStatus').textContent = { editor: '01 / память', play: 'ПО ПАМЯТИ', review: 'ПРОВЕРКА', results: 'ИТОГ' }[view];
  $('leaveBtn').hidden = view === 'editor';
  if (view === 'editor') renderEditor();
  if (view === 'play') renderPlay();
  if (view === 'review') renderReview();
  if (view === 'results') renderResults();
  save();
  updateTestState();
}

function renderEditor() {
  const field = $('sourceInput');
  if (field.value !== state.source) field.value = state.source;
  const items = parseItems(state.source);
  $('sourceCount').textContent = items.length + ' ' + (items.length === 1 ? 'пункт' : 'пунктов');
  $('startBtn').disabled = !items.length || items.length > ITEM_LIMIT || state.source.length > SOURCE_LIMIT;
}

function handleSource(value) {
  state.source = value;
  showError('');
  renderEditor();
  save();
}

function startRoundTexts(texts) {
  state.rounds = texts.map(makeRound);
  state.index = 0;
  state.history = [];
  setView('play');
}

function beginGame() {
  const texts = parseItems($('sourceInput').value);
  if (!texts.length) { showError('Добавь хотя бы одну фразу.'); return; }
  if (state.source.length > SOURCE_LIMIT) { showError('Текст слишком длинный. Максимум 40 000 символов.'); return; }
  if (texts.length > ITEM_LIMIT) { showError('Максимум 80 пунктов. Уменьши текст.'); return; }
  if (texts.some((text) => text.length > 3000)) { showError('Один из пунктов длиннее 3000 символов. Раздели его.'); return; }
  startRoundTexts(texts);
}

function tileButton(round, id, zone) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tile';
  button.textContent = round.parts[id];
  button.dir = 'auto';
  button.dataset.piece = String(id);
  button.dataset.zone = zone;
  button.setAttribute('aria-label', round.parts[id] + (zone === 'bank' ? '. Добавить в сборку' : '. Вернуть во фрагменты'));
  button.addEventListener('click', () => {
    if (Date.now() < suppressClickUntil) return;
    performMove(id, zone === 'bank' ? 'answer' : 'bank');
  });
  button.addEventListener('pointerdown', onPiecePointerDown);
  return button;
}

function renderPlay() {
  const round = activeRound();
  if (!round) { setView('editor'); return; }
  const total = state.rounds.length;
  $('roundCounter').textContent = formatNumber(state.index + 1) + ' / ' + formatNumber(total);
  $('meterFill').style.width = ((state.index / total) * 100) + '%';
  $('filledCount').textContent = round.answer.length + ' / ' + round.parts.length;
  $('answerHint').textContent = round.answer.length
    ? 'Нажми на установленный фрагмент, чтобы вернуть его вниз'
    : 'Нажимай фрагменты снизу в нужном порядке';
  const answer = $('answerZone');
  const bank = $('bankZone');
  answer.replaceChildren(...round.answer.map((id) => tileButton(round, id, 'answer')));
  bank.replaceChildren(...round.bank.map((id) => tileButton(round, id, 'bank')));
  const isRtl = /[\u0590-\u08FF]/u.test(round.text) && !/^[^\u0590-\u08FF]*[A-Za-zА-Яа-яЁё]/u.test(round.text);
  answer.dir = isRtl ? 'rtl' : 'ltr';
  bank.dir = isRtl ? 'rtl' : 'ltr';
  $('checkBtn').disabled = round.answer.length !== round.parts.length;
  $('undoBtn').disabled = !state.history.length || state.history.at(-1)?.index !== state.index;
  updateTestState();
}

function performMove(id, destination, beforeId = null) {
  const round = activeRound();
  if (!round || state.view !== 'play' || !['answer', 'bank'].includes(destination)) return;
  const origin = round.bank.includes(id) ? 'bank' : round.answer.includes(id) ? 'answer' : null;
  if (!origin) return;
  if (origin === destination && (beforeId === null || id === beforeId)) return;
  state.history.push({ index: state.index, bank: [...round.bank], answer: [...round.answer] });
  if (state.history.length > 50) state.history.shift();
  round[origin].splice(round[origin].indexOf(id), 1);
  const target = round[destination];
  const at = beforeId === null ? -1 : target.indexOf(beforeId);
  if (at >= 0) target.splice(at, 0, id);
  else target.push(id);
  renderPlay();
  save();
}

function undo() {
  if (state.view !== 'play') return;
  const last = state.history.at(-1);
  if (!last || last.index !== state.index) return;
  state.history.pop();
  const round = activeRound();
  round.bank = last.bank;
  round.answer = last.answer;
  renderPlay();
  save();
}

function onPiecePointerDown(event) {
  if (event.button !== 0 || state.view !== 'play') return;
  const piece = event.currentTarget;
  const pointerId = event.pointerId;
  const id = Number(piece.dataset.piece);
  const startX = event.clientX;
  const startY = event.clientY;
  let dragged = false;
  let ghost = null;
  let hovered = null;
  const releaseHover = () => {
    if (hovered) hovered.classList.remove('drop-target');
    hovered = null;
  };
  const cleanup = () => {
    piece.removeEventListener('pointermove', move);
    piece.removeEventListener('pointerup', up);
    piece.removeEventListener('pointercancel', cancel);
    piece.removeEventListener('lostpointercapture', cancel);
    releaseHover();
    piece.classList.remove('dragging-source');
    if (ghost) ghost.remove();
    if (dragActive === piece) dragActive = null;
  };
  const move = (e) => {
    if (e.pointerId !== pointerId) return;
    if (!dragged && Math.hypot(e.clientX - startX, e.clientY - startY) >= 9) {
      dragged = true;
      dragActive = piece;
      ghost = piece.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.width = Math.min(piece.offsetWidth, 260) + 'px';
      document.body.append(ghost);
      piece.classList.add('dragging-source');
    }
    if (!dragged) return;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const zone = element?.closest('#bankZone, #answerZone') || null;
    if (hovered !== zone) { releaseHover(); hovered = zone; if (hovered) hovered.classList.add('drop-target'); }
  };
  const up = (e) => {
    if (e.pointerId !== pointerId) return;
    let destination = null, beforeId = null;
    if (dragged) {
      suppressClickUntil = Date.now() + 400;
      const element = document.elementFromPoint(e.clientX, e.clientY);
      const zone = element?.closest('#bankZone, #answerZone');
      destination = zone?.id === 'bankZone' ? 'bank' : zone?.id === 'answerZone' ? 'answer' : null;
      const target = element?.closest('.tile[data-piece]');
      if (destination && target && target !== piece) beforeId = Number(target.dataset.piece);
    }
    cleanup();
    if (destination) performMove(id, destination, beforeId);
  };
  const cancel = () => { if (dragged) suppressClickUntil = Date.now() + 400; cleanup(); };
  piece.addEventListener('pointermove', move);
  piece.addEventListener('pointerup', up);
  piece.addEventListener('pointercancel', cancel);
  piece.addEventListener('lostpointercapture', cancel);
  try { piece.setPointerCapture(pointerId); } catch { cleanup(); }
}

function gradeRound(skipped = false) {
  const round = activeRound();
  if (!round || round.checked || state.view !== 'play') return;
  if (!skipped && round.answer.length !== round.parts.length) {
    showToast('Сначала разложи все фрагменты');
    return;
  }
  round.skipped = skipped;
  round.right = skipped ? 0 : correctPositions(round.parts, round.answer);
  round.accuracy = Math.round((round.right / round.parts.length) * 100);
  round.checked = true;
  state.history = [];
  setView('review');
}

function renderReview() {
  const round = activeRound();
  $('reviewCounter').textContent = formatNumber(state.index + 1);
  $('reviewPercent').textContent = String(round.accuracy);
  const label = document.createElement('small');
  label.textContent = '%';
  $('reviewPercent').append(label);
  $('reviewMessage').textContent = round.skipped ? 'Пропущено' :
    round.accuracy === 100 ? 'Все фрагменты на своих местах.' :
    round.right + ' из ' + round.parts.length + ' фрагментов на своих местах.';
  const holder = $('reviewTiles');
  holder.replaceChildren();
  if (round.skipped) {
    const skippedText = document.createElement('span');
    skippedText.textContent = 'Ответ не собран';
    skippedText.className = 'review-tile bad';
    holder.append(skippedText);
  } else {
    round.answer.forEach((id, index) => {
      const part = document.createElement('span');
      part.className = 'review-tile ' + (round.parts[id] === round.parts[index] ? 'good' : 'bad');
      part.textContent = round.parts[id];
      part.dir = 'auto';
      holder.append(part);
    });
  }
  $('correctText').textContent = round.text;
  $('nextBtn').firstChild.textContent = state.index === state.rounds.length - 1 ? 'Завершить ' : 'Следующая фраза ';
  updateTestState();
}

function advance() {
  if (state.view !== 'review') return;
  if (state.index + 1 < state.rounds.length) {
    state.index++;
    state.history = [];
    setView('play');
  } else setView('results');
}

function renderResults() {
  const total = state.rounds.length;
  const perfect = state.rounds.filter((round) => round.accuracy === 100).length;
  const wrong = total - perfect;
  $('totalPercent').textContent = String(totalAccuracy());
  $('totalDescription').textContent = 'Точность по ' + state.rounds.reduce((sum, round) => sum + round.parts.length, 0) + ' фрагментам';
  $('perfectCount').textContent = String(perfect);
  $('finishedCount').textContent = String(total);
  const list = $('resultsList');
  list.replaceChildren();
  state.rounds.forEach((round, index) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const number = document.createElement('span');
    number.className = 'result-index';
    number.textContent = formatNumber(index + 1);
    const text = document.createElement('span');
    text.className = 'result-text';
    text.textContent = round.text;
    text.dir = 'auto';
    const score = document.createElement('span');
    score.className = 'result-score';
    score.textContent = round.accuracy + '%';
    row.append(number, text, score);
    list.append(row);
  });
  $('retryBtn').hidden = wrong === 0;
  $('newBtn').classList.toggle('main-action', wrong === 0);
  $('newBtn').classList.toggle('sub-action', wrong !== 0);
  updateTestState();
}

function askConfirm(title, body, onAccept) {
  confirmAction = onAccept;
  $('modalTitle').textContent = title;
  $('modalBody').textContent = body;
  $('confirmLayer').hidden = false;
  $('modalCancel').focus();
}

function closeConfirm() {
  $('confirmLayer').hidden = true;
  confirmAction = null;
}

function openEditor() {
  if (state.view === 'editor') return;
  if (state.view === 'results') { setView('editor'); return; }
  askConfirm('Вернуться к тексту?', 'Текущая сборка сбросится. Исходный текст останется в редакторе.', () => {
    state.rounds = [];
    state.index = 0;
    state.history = [];
    setView('editor');
  });
}

$('sourceInput').addEventListener('input', (event) => handleSource(event.target.value));
$('startBtn').addEventListener('click', beginGame);
$('sampleBtn').addEventListener('click', () => { handleSource(SAMPLE); $('sourceInput').focus(); });
$('fileInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 160000) { showError('Файл слишком большой. Максимум 160 КБ.'); event.target.value = ''; return; }
  showError('');
  try {
    const bytes = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('windows-1251').decode(bytes); }
    if (text.length > SOURCE_LIMIT) throw Error('Текст длиннее 40 000 символов. Сократи его.');
    handleSource(text);
    showToast('Файл загружен: ' + file.name);
  } catch (error) { showError(error.message || 'Не удалось прочитать файл.'); }
  event.target.value = '';
});
$('undoBtn').addEventListener('click', undo);
$('checkBtn').addEventListener('click', () => gradeRound(false));
$('skipBtn').addEventListener('click', () => gradeRound(true));
$('nextBtn').addEventListener('click', advance);
$('retryBtn').addEventListener('click', () => {
  const wrong = state.rounds.filter((round) => round.accuracy !== 100).map((round) => round.text);
  if (wrong.length) startRoundTexts(wrong);
});
$('newBtn').addEventListener('click', () => setView('editor'));
$('leaveBtn').addEventListener('click', openEditor);
$('modalCancel').addEventListener('click', closeConfirm);
$('modalAccept').addEventListener('click', () => {
  const action = confirmAction;
  closeConfirm();
  if (action) action();
});
$('confirmLayer').addEventListener('click', (event) => {
  if (event.target === $('confirmLayer')) closeConfirm();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('confirmLayer').hidden) closeConfirm();
  else if (state.view === 'play' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
});
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
setView(state.view);
