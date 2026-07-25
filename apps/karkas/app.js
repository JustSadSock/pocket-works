import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const APP_VERSION = '1.0.0';
const NAMESPACE = 'pocket-works:karkas';
const MOTIFS = [
  { name: 'старый ботинок', hint: 'потёртости, швы, вес и характер формы' },
  { name: 'чайник', hint: 'носик, ручка и корпус как три спорящие массы' },
  { name: 'рука', hint: 'жест важнее анатомической идеальности' },
  { name: 'велосипед', hint: 'ритм кругов, рама и механические связи' },
  { name: 'башня', hint: 'вертикаль, повторение этажей и силуэт' },
  { name: 'кресло', hint: 'вес, опора и мягкая геометрия' },
  { name: 'рыба', hint: 'единая текучая масса и направление движения' },
  { name: 'фигура в плаще', hint: 'силуэт, складки и скрытая конструкция тела' },
  { name: 'настольная лампа', hint: 'шарниры, световой конус и баланс' },
  { name: 'мост', hint: 'пролёт, опоры и пространство под ним' },
  { name: 'комнатное растение', hint: 'ритм листьев и характер стебля' },
  { name: 'маска', hint: 'симметрия, пустоты и эмоциональный знак' },
  { name: 'неизвестный транспорт', hint: 'функция должна читаться без объяснений' },
  { name: 'дверь', hint: 'граница, толщина стены и обещание пространства' },
  { name: 'птица', hint: 'масса грудной клетки и направление крыльев' },
  { name: 'механизм', hint: 'причина и следствие между деталями' },
  { name: 'ключи', hint: 'повторы, пересечения и металлический блеск' },
  { name: 'чужая комната', hint: 'три главные массы и история хозяина' }
];
const TWISTS = [
  { name: 'как военную машину', hint: 'усиль защиту, угрозу и функциональность' },
  { name: 'после двухсот лет', hint: 'покажи износ, ремонт и новую функцию' },
  { name: 'из мягкой ткани', hint: 'сломай привычную жёсткость складками' },
  { name: 'с живым характером', hint: 'поза и пропорции должны дать темперамент' },
  { name: 'в разрезе', hint: 'объясни внутреннюю логику, а не набей деталями' },
  { name: 'под водой', hint: 'учти сопротивление, плавучесть и течение' },
  { name: 'на грани падения', hint: 'смести центр тяжести и создай напряжение' },
  { name: 'как священный объект', hint: 'добавь ритуал, масштаб и следы поклонения' },
  { name: 'собранный из трёх форм', hint: 'сведи всё к шару, коробке и клину' },
  { name: 'в очень маленьком масштабе', hint: 'придумай, кто и как им пользуется' },
  { name: 'против своей функции', hint: 'сделай назначение абсурдно обратным' },
  { name: 'наполовину природный', hint: 'пусть органика решает конструктивную задачу' },
  { name: 'с секретным отсеком', hint: 'намекни на тайну через форму и доступ' },
  { name: 'после катастрофы', hint: 'изменения должны рассказывать, что случилось' },
  { name: 'в движении', hint: 'деформируй силуэт в сторону действия' },
  { name: 'слишком высокий', hint: 'преувеличение должно изменить использование' }
];
const RULES = [
  { name: 'только три толщины линии', hint: 'тонкая — свет, средняя — форма, толстая — вес' },
  { name: 'без внешнего контура', hint: 'собери границы тенями, стыками и пересечениями' },
  { name: 'двенадцать крупных пятен', hint: 'сначала считай массы, потом детали' },
  { name: 'одна точка схода', hint: 'все глубинные направления подчиняются одной цели' },
  { name: 'пять линий не отрывая лайнер', hint: 'планируй маршрут до касания бумаги' },
  { name: 'семьдесят процентов тени', hint: 'оставь свет редким и намеренным' },
  { name: 'сломанная симметрия', hint: 'основа симметрична, один элемент нарушает порядок' },
  { name: 'без ластика', hint: 'ошибки превращай в конструктивные линии' },
  { name: 'только прямые линии', hint: 'кривизну передавай частыми сменами направления' },
  { name: 'только кривые линии', hint: 'углы собирай пересечениями дуг' },
  { name: 'силуэт читается издалека', hint: 'убери детали и проверь чёрное пятно' },
  { name: 'фон обязателен', hint: 'объект должен жить в конкретном пространстве' },
  { name: 'главное — пустое пространство', hint: 'рисуй форму воздуха вокруг объекта' },
  { name: 'три повторяющихся элемента', hint: 'повтор создает ритм, вариация не даёт скуку' },
  { name: 'ракурс строго снизу', hint: 'покажи нижние плоскости и давление масштаба' },
  { name: 'линия тоньше к свету', hint: 'толщина должна объяснять освещение' }
];
const PHASES = [
  {
    kicker: 'РАЗОГРЕВ', title: 'Разбуди руку', material: 'КАРАНДАШ',
    instruction: 'Не рисуй объект. В углу листа сделай длинные прямые, дуги и эллипсы одним движением от плеча.'
  },
  {
    kicker: 'КАРКАС', title: 'Собери большие массы', material: 'КАРАНДАШ',
    instruction: 'Наметь силуэт и три главные формы. Детали пока запрещены: сначала вес, наклон и пространство.'
  },
  {
    kicker: 'ПЕРЕВОРОТ', title: 'Сломай очевидное', material: 'КАРАНДАШ',
    instruction: 'Встрой смысловой переворот в конструкцию. Он должен менять форму и функцию, а не быть наклейкой сверху.'
  },
  {
    kicker: 'РЕШЕНИЕ', title: 'Прими линию', material: 'ЛАЙНЕР',
    instruction: 'Выбери, какие линии останутся. Обводить всё нельзя: усиливай только глубину, вес и главный акцент.'
  }
];
const DURATIONS = {
  12: [2, 4, 2, 4],
  22: [3, 7, 4, 8],
  35: [4, 11, 7, 13]
};
const SCORE_DEFS = [
  { key: 'idea', title: 'ИДЕЯ', copy: 'переворот реально изменил объект' },
  { key: 'construction', title: 'КАРКАС', copy: 'форма держится и не разваливается' },
  { key: 'composition', title: 'КОМПОЗИЦИЯ', copy: 'взгляд понимает, куда идти' },
  { key: 'line', title: 'ЛИНИЯ', copy: 'лайнер звучит уверенно, а не одинаково' },
  { key: 'finish', title: 'РЕАЛИЗАЦИЯ', copy: 'работа доведена до ясного результата' }
];
const TIPS = [
  'Прищурься. Если остаётся понятное пятно — композиция живёт.',
  'Проведи воображаемую вертикаль через центр тяжести. Она должна попадать в опору.',
  'Одна хорошая линия заменяет пять осторожных. Сначала репетиция над листом, потом касание.',
  'Самый детальный участок должен быть там, куда ты хочешь привести взгляд.',
  'Повтори один элемент трижды, но меняй размер или угол — появится ритм.',
  'Не исправляй кривую линию десятком волосков. Сделай вторую, более уверенную, и подчини ей форму.',
  'Отдели передний план толще, дальний — тоньше. Глубина появится почти бесплатно.',
  'Убери один красивый элемент, который не помогает идее. Да, жалко. Именно поэтому полезно.'
];
const FOCUS_COPY = {
  idea: ['ИДЕЯ', 'В следующем задании преувеличь переворот так, чтобы исходный объект едва узнавался.'],
  construction: ['КАРКАС', 'Начни с трёх прозрачных масс и покажи, как они входят друг в друга. Детали потом.'],
  composition: ['КОМПОЗИЦИЯ', 'Сделай три миниатюры размером со спичечный коробок и выбери лучшую до большого рисунка.'],
  line: ['ЛИНИЯ', 'Перед каждым важным штрихом дважды повтори движение над листом и только потом касайся лайнером.'],
  finish: ['РЕАЛИЗАЦИЯ', 'Заранее выбери момент остановки: один главный акцент, два вторичных и никаких бесконечных украшений.']
};

const defaults = {
  indices: { motif: 0, twist: 0, rule: 0 },
  locks: { motif: false, twist: false, rule: false },
  duration: 22,
  sessions: [],
  active: null,
  sound: true,
  lastDaily: ''
};

const store = createVersionedStore({
  namespace: NAMESPACE,
  version: 1,
  defaults,
  validate(value) {
    return value && typeof value === 'object' && value.indices && value.locks && Array.isArray(value.sessions);
  }
});

createWorkshopMode({
  appName: 'КАРКАС',
  version: APP_VERSION,
  cachePrefix: 'karkas-',
  storageNamespace: NAMESPACE,
  onReset() {
    store.reset();
    window.location.reload();
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const screens = {
  home: $('#homeScreen'),
  session: $('#sessionScreen'),
  review: $('#reviewScreen'),
  progress: $('#progressScreen'),
  archive: $('#archiveScreen')
};
const reelData = { motif: MOTIFS, twist: TWISTS, rule: RULES };
let frameId = 0;
let audioContext = null;
let pendingScores = {};
let pendingPhoto = null;
let tipIndex = 0;
let confirmAction = null;
let toastTimer = 0;

function current() { return store.getAll(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function hashText(text) {
  let hash = 2166136261;
  for (const char of text) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function randomIndex(length, avoid = -1) {
  let value;
  if (globalThis.crypto?.getRandomValues) {
    const bucket = new Uint32Array(1);
    crypto.getRandomValues(bucket);
    value = bucket[0] % length;
  } else value = Math.floor(Math.random() * length);
  if (length > 1 && value === avoid) value = (value + 1) % length;
  return value;
}
function briefFrom(indices) {
  const motif = MOTIFS[indices.motif];
  const twist = TWISTS[indices.twist];
  const rule = RULES[indices.rule];
  return {
    motif, twist, rule,
    title: `${motif.name} ${twist.name}`,
    code: String((indices.motif + 1) * 37 + (indices.twist + 1) * 19 + (indices.rule + 1) * 11).padStart(3, '0')
  };
}
function phaseMinutes(active, phaseIndex = active.phaseIndex) {
  return DURATIONS[active.duration]?.[phaseIndex] || DURATIONS[22][phaseIndex];
}
function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
function vibrate(pattern = 8) { if ('vibrate' in navigator) navigator.vibrate(pattern); }
function tone(frequency = 460, duration = .055, gainValue = .025) {
  if (!current().sound) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  try {
    audioContext ||= new Ctor();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
  } catch { /* progressive enhancement */ }
}
function chime() {
  tone(420, .09, .03);
  window.setTimeout(() => tone(620, .13, .025), 90);
}
function showToast(message) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2200);
}

function seedDaily() {
  const state = current();
  const today = dateKey();
  if (state.lastDaily === today || state.active) return;
  const seed = hashText(today);
  store.patch({
    indices: {
      motif: seed % MOTIFS.length,
      twist: Math.floor(seed / 17) % TWISTS.length,
      rule: Math.floor(seed / 47) % RULES.length
    },
    lastDaily: today
  });
}

function setIndex(kind, value, direction = 1) {
  const state = current();
  const length = reelData[kind].length;
  const indices = { ...state.indices, [kind]: (value + length) % length };
  store.set('indices', indices);
  renderReels(kind, direction);
  tone(360 + indices[kind] * 4);
}
function cycleReel(kind, direction = 1) {
  const state = current();
  if (state.locks[kind]) {
    vibrate([8, 25, 8]);
    tone(170, .05, .018);
    $(`[data-reel="${kind}"]`).animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 130 });
    return;
  }
  setIndex(kind, state.indices[kind] + direction, direction);
}
function renderReels(changedKind = '', direction = 1) {
  const state = current();
  for (const kind of Object.keys(reelData)) {
    const reel = $(`[data-reel="${kind}"]`);
    const list = reelData[kind];
    const index = state.indices[kind] % list.length;
    $('.reel-window strong', reel).textContent = list[index].name;
    $('.prev', reel).textContent = list[(index - 1 + list.length) % list.length].name;
    $('.next', reel).textContent = list[(index + 1) % list.length].name;
    reel.classList.toggle('locked', Boolean(state.locks[kind]));
    const lock = $(`[data-lock="${kind}"]`);
    lock.setAttribute('aria-pressed', String(Boolean(state.locks[kind])));
    if (kind === changedKind) {
      reel.classList.remove('flip-up', 'flip-down');
      void reel.offsetWidth;
      reel.classList.add(direction > 0 ? 'flip-up' : 'flip-down');
      window.setTimeout(() => reel.classList.remove('flip-up', 'flip-down'), 220);
    }
  }
  renderBrief();
}
function renderBrief() {
  const state = current();
  const brief = briefFrom(state.indices);
  $('#briefTitle').textContent = brief.title;
  $('#briefRule').textContent = `${brief.rule.name}. ${brief.motif.hint}.`;
  $('#briefCode').textContent = `#${brief.code}`;
}
function shuffleUnlocked() {
  const state = current();
  const indices = { ...state.indices };
  for (const kind of Object.keys(indices)) {
    if (!state.locks[kind]) indices[kind] = randomIndex(reelData[kind].length, indices[kind]);
  }
  store.set('indices', indices);
  renderReels();
  $$('.reel').forEach((reel, index) => {
    reel.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${index % 2 ? -7 : 7}px)` }, { transform: 'translateY(0)' }], { duration: 260 + index * 45, easing: 'ease-out' });
  });
  vibrate(12);
  tone(520, .08);
}

function setupReels() {
  for (const reel of $$('.reel')) {
    const kind = reel.dataset.reel;
    let startY = 0;
    let deltaY = 0;
    let dragging = false;
    reel.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      dragging = true;
      startY = event.clientY;
      deltaY = 0;
      reel.classList.add('moving');
      reel.setPointerCapture?.(event.pointerId);
    });
    reel.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      deltaY = event.clientY - startY;
      $('.reel-window', reel).style.transform = `translateY(${clamp(deltaY * .18, -12, 12)}px)`;
    });
    const finish = (event) => {
      if (!dragging) return;
      dragging = false;
      reel.classList.remove('moving');
      $('.reel-window', reel).style.transform = '';
      reel.releasePointerCapture?.(event.pointerId);
      if (Math.abs(deltaY) > 28) cycleReel(kind, deltaY < 0 ? 1 : -1);
      else cycleReel(kind, 1);
    };
    reel.addEventListener('pointerup', finish);
    reel.addEventListener('pointercancel', () => {
      dragging = false;
      reel.classList.remove('moving');
      $('.reel-window', reel).style.transform = '';
    });
    reel.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cycleReel(kind, 1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); cycleReel(kind, 1); }
      if (event.key === 'ArrowDown') { event.preventDefault(); cycleReel(kind, -1); }
    });
  }
  $$('[data-lock]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const kind = button.dataset.lock;
    const state = current();
    store.set('locks', { ...state.locks, [kind]: !state.locks[kind] });
    renderReels();
    tone(state.locks[kind] ? 580 : 300, .06);
  }));
}

function showScreen(name) {
  cancelAnimationFrame(frameId);
  for (const [key, element] of Object.entries(screens)) element.hidden = key !== name;
  const mainSection = ['home', 'progress', 'archive'].includes(name);
  $('#bottomNav').hidden = !mainSection;
  if (mainSection) {
    $$('[data-screen]').forEach((button) => button.classList.toggle('active', button.dataset.screen === name));
  }
  if (name === 'home') renderHome();
  if (name === 'progress') renderProgress();
  if (name === 'archive') renderArchive();
  if (name === 'session') renderSession();
  if (name === 'review') renderReview();
}
function renderHome() {
  renderReels();
  const state = current();
  $$('.duration-options button').forEach((button) => button.classList.toggle('active', Number(button.dataset.duration) === state.duration));
  const resume = $('#resumeStrip');
  resume.hidden = !state.active;
  if (state.active) {
    const brief = briefFrom(state.active.indices);
    $('#resumeTitle').textContent = state.active.status === 'review' ? 'Закончить разбор работы' : brief.title;
    $('#resumeButton').textContent = state.active.status === 'review' ? 'РАЗОБРАТЬ' : 'ПРОДОЛЖИТЬ';
  }
}
function startSession() {
  const state = current();
  const now = Date.now();
  const active = {
    status: 'running',
    startedAt: now,
    duration: state.duration,
    indices: { ...state.indices },
    phaseIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + DURATIONS[state.duration][0] * 60000,
    paused: false,
    pausedRemaining: null
  };
  store.set('active', active);
  pendingPhoto = null;
  pendingScores = {};
  chime();
  vibrate(18);
  showScreen('session');
}
function pauseActive() {
  const state = current();
  const active = state.active;
  if (!active || active.status !== 'running' || active.paused) return;
  const remaining = Math.max(0, active.phaseEndsAt - Date.now());
  store.set('active', { ...active, paused: true, pausedRemaining: remaining });
}
function togglePause() {
  const state = current();
  const active = state.active;
  if (!active || active.status !== 'running') return;
  if (active.paused) {
    store.set('active', { ...active, paused: false, phaseEndsAt: Date.now() + Math.max(1000, active.pausedRemaining || 1000), pausedRemaining: null });
    tone(500);
  } else {
    pauseActive();
    tone(250);
  }
  renderSession();
}
function advancePhase(manual = false) {
  let active = current().active;
  if (!active || active.status !== 'running') return;
  const now = Date.now();
  if (active.phaseIndex >= PHASES.length - 1) {
    finishSession();
    return;
  }
  const nextIndex = active.phaseIndex + 1;
  const nextDuration = phaseMinutes(active, nextIndex) * 60000;
  const phaseStart = manual || active.paused ? now : active.phaseEndsAt;
  active = {
    ...active,
    phaseIndex: nextIndex,
    phaseStartedAt: phaseStart,
    phaseEndsAt: phaseStart + nextDuration,
    paused: false,
    pausedRemaining: null
  };
  store.set('active', active);
  chime();
  vibrate([16, 40, 16]);
  if (!manual && active.phaseEndsAt <= now) {
    advancePhase(false);
    return;
  }
  renderSession();
}
function finishSession() {
  const state = current();
  if (!state.active) return;
  store.set('active', { ...state.active, status: 'review', paused: true, completedAt: Date.now() });
  chime();
  window.setTimeout(() => tone(760, .18, .03), 180);
  vibrate([20, 50, 30]);
  pendingScores = {};
  pendingPhoto = null;
  showScreen('review');
}
function renderSession() {
  const active = current().active;
  if (!active) { showScreen('home'); return; }
  if (active.status === 'review') { showScreen('review'); return; }
  const phase = PHASES[active.phaseIndex];
  const brief = briefFrom(active.indices);
  $('#sessionStep').textContent = `ЭТАП ${active.phaseIndex + 1} / ${PHASES.length}`;
  $('#sessionMaterial').textContent = phase.material;
  $('#pauseButton').textContent = active.paused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА';
  $('#phaseIndex').textContent = String(active.phaseIndex + 1).padStart(2, '0');
  $('#phaseKicker').textContent = phase.kicker;
  $('#phaseTitle').textContent = phase.title;
  $('#phaseInstruction').textContent = phase.instruction;
  $('#sessionBriefTitle').textContent = brief.title;
  $('#sessionBriefRule').textContent = `${brief.rule.name}. ${active.phaseIndex === 2 ? brief.twist.hint : brief.rule.hint}.`;
  const track = $('#phaseTrack');
  track.replaceChildren(...PHASES.map((item, index) => {
    const mark = document.createElement('i');
    mark.dataset.label = item.kicker;
    mark.className = index < active.phaseIndex ? 'done' : index === active.phaseIndex ? 'current' : '';
    return mark;
  }));
  $('#timerLabel').textContent = active.paused ? 'СЕССИЯ НА ПАУЗЕ' : 'ДО СЛЕДУЮЩЕГО ЭТАПА';
  $('#timerRing').classList.toggle('paused', active.paused);
  tickTimer();
}
function tickTimer() {
  cancelAnimationFrame(frameId);
  const tick = () => {
    const active = current().active;
    if (!active || active.status !== 'running' || screens.session.hidden) return;
    const remainingMs = active.paused ? (active.pausedRemaining || 0) : active.phaseEndsAt - Date.now();
    if (!active.paused && remainingMs <= 0) {
      advancePhase(false);
      return;
    }
    const total = phaseMinutes(active) * 60000;
    const progress = clamp(1 - remainingMs / total, 0, 1);
    $('#timerValue').textContent = formatClock(remainingMs / 1000);
    $('#timerRing').style.setProperty('--progress', `${progress * 360}deg`);
    frameId = requestAnimationFrame(tick);
  };
  tick();
}

function renderReview() {
  const active = current().active;
  if (!active) { showScreen('home'); return; }
  const brief = briefFrom(active.indices);
  $('#reviewBrief').textContent = brief.title;
  $('#reviewRule').textContent = `${brief.rule.name}.`;
  const sheet = $('#scoreSheet');
  sheet.replaceChildren();
  for (const def of SCORE_DEFS) {
    const row = document.createElement('article');
    row.className = 'score-row';
    row.innerHTML = `<div><span>${def.title}</span><small>${def.copy}</small></div><div class="score-options"></div>`;
    const options = $('.score-options', row);
    [0, 1, 2].forEach((score) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(score);
      button.dataset.nativePress = '';
      button.setAttribute('aria-label', `${def.title}: ${score} из 2`);
      button.classList.toggle('active', pendingScores[def.key] === score);
      button.addEventListener('click', () => {
        pendingScores[def.key] = score;
        tone(350 + score * 120);
        vibrate(8);
        renderReview();
      });
      options.append(button);
    });
    sheet.append(row);
  }
  $('#saveReview').disabled = SCORE_DEFS.some((def) => !Number.isInteger(pendingScores[def.key]));
  $('#photoPreview').hidden = !pendingPhoto;
  $('#removePhoto').hidden = !pendingPhoto;
  $('#photoButton').hidden = Boolean(pendingPhoto);
  if (pendingPhoto) $('#photoPreview').src = pendingPhoto;
}
async function compressPhoto(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Выбран не файл изображения');
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать фотографию'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось открыть фотографию'));
    img.src = source;
  });
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#f4eee4';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .7);
}
function saveReview() {
  const state = current();
  const active = state.active;
  if (!active || SCORE_DEFS.some((def) => !Number.isInteger(pendingScores[def.key]))) return;
  const brief = briefFrom(active.indices);
  const record = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    duration: active.duration,
    indices: active.indices,
    title: brief.title,
    rule: brief.rule.name,
    scores: { ...pendingScores },
    photo: pendingPhoto
  };
  const sessions = [record, ...state.sessions].slice(0, 40).map((session, index) => index < 12 ? session : { ...session, photo: null });
  const saved = store.patch({ sessions, active: null });
  if (!saved && pendingPhoto) {
    sessions[0] = { ...sessions[0], photo: null };
    store.patch({ sessions, active: null });
    showToast('Разбор сохранён, но фото не поместилось');
  } else showToast('Работа ушла в архив');
  pendingScores = {};
  pendingPhoto = null;
  showScreen('progress');
}

function totalsFor(sessions) {
  const sums = Object.fromEntries(SCORE_DEFS.map((def) => [def.key, 0]));
  for (const session of sessions) for (const def of SCORE_DEFS) sums[def.key] += Number(session.scores?.[def.key]) || 0;
  return sums;
}
function streakFor(sessions) {
  const days = new Set(sessions.map((session) => dateKey(new Date(session.date))));
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
function renderProgress() {
  const sessions = current().sessions;
  const summary = $('#progressSummary');
  const skills = $('#skillBoard');
  const focus = $('#nextFocus');
  if (!sessions.length) {
    summary.innerHTML = `<article><span>СЕССИИ</span><b>0</b><small>пока пусто</small></article><article><span>МИНУТЫ</span><b>0</b><small>бумага ждёт</small></article>`;
    skills.innerHTML = `<div class="empty-progress"><b>Первая работа создаст карту навыков.</b><p>Здесь не будет фальшивого уровня «мастер 83». Только средние оценки твоих реальных разборов.</p></div>`;
    focus.innerHTML = `<span>ПЕРВЫЙ ФОКУС</span><b>Закончить один рисунок</b><p>Не пытайся сразу доказать талант. Пройди весь цикл от идеи до лайнера.</p>`;
    return;
  }
  const totalMinutes = sessions.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
  const streak = streakFor(sessions);
  summary.innerHTML = `<article><span>СЕССИИ</span><b>${sessions.length}</b><small>серия ${streak} дн.</small></article><article><span>МИНУТЫ</span><b>${totalMinutes}</b><small>реальной практики</small></article>`;
  const sums = totalsFor(sessions);
  skills.replaceChildren();
  let weakest = SCORE_DEFS[0];
  let weakestValue = Infinity;
  for (const def of SCORE_DEFS) {
    const percent = Math.round((sums[def.key] / (sessions.length * 2)) * 100);
    if (percent < weakestValue) { weakestValue = percent; weakest = def; }
    const row = document.createElement('article');
    row.className = 'skill-row';
    row.innerHTML = `<b>${def.title}</b><div class="bar"><i style="width:${percent}%"></i></div><strong>${percent}</strong>`;
    skills.append(row);
  }
  const copy = FOCUS_COPY[weakest.key];
  focus.innerHTML = `<span>СЛЕДУЮЩИЙ ФОКУС · СЛАБЕЕ ВСЕГО ${weakestValue}/100</span><b>${copy[0]}</b><p>${copy[1]}</p>`;
}
function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)).replace('.', '');
}
function renderArchive() {
  const sessions = current().sessions;
  const grid = $('#archiveGrid');
  grid.replaceChildren();
  if (!sessions.length) {
    grid.innerHTML = `<div class="archive-empty"><b>Тут пока чистая бумага.</b><p>Закончи первую сессию и сохрани разбор. Фото добавлять необязательно.</p></div>`;
    return;
  }
  for (const session of sessions) {
    const article = document.createElement('article');
    article.className = 'archive-entry';
    const score = SCORE_DEFS.reduce((sum, def) => sum + (Number(session.scores?.[def.key]) || 0), 0);
    article.innerHTML = `
      <div class="thumb">${session.photo ? `<img src="${session.photo}" alt="Фотография работы">` : `<span>${briefFrom(session.indices).code}</span>`}</div>
      <div class="entry-copy"><time>${formatDate(session.date)} · ${session.duration} МИН</time><b>${session.title}</b><p>${session.rule}</p><div class="entry-score" aria-label="Итог разбора ${score} из 10">${Array.from({ length: 10 }, (_, index) => `<i class="${index < score ? 'on' : ''}"></i>`).join('')}</div></div>
      <button class="delete-entry" type="button" aria-label="Удалить запись" data-native-press>×</button>`;
    $('.delete-entry', article).addEventListener('click', () => {
      openConfirm('Удалить эту работу?', 'Фотография и разбор исчезнут с этого устройства.', () => {
        const next = current().sessions.filter((item) => item.id !== session.id);
        store.set('sessions', next);
        renderArchive();
        showToast('Работа удалена');
      });
    });
    grid.append(article);
  }
}

function openSettings() {
  $('#settingsSheet').hidden = false;
  $('#sheetBackdrop').hidden = false;
  $('#soundState').textContent = current().sound ? 'ВКЛ' : 'ВЫКЛ';
}
function closeSettings() {
  $('#settingsSheet').hidden = true;
  if ($('#confirmDialog').hidden) $('#sheetBackdrop').hidden = true;
}
function openConfirm(title, copy, action) {
  confirmAction = action;
  $('#confirmTitle').textContent = title;
  $('#confirmCopy').textContent = copy;
  $('#confirmDialog').hidden = false;
  $('#sheetBackdrop').hidden = false;
}
function closeConfirm() {
  confirmAction = null;
  $('#confirmDialog').hidden = true;
  if ($('#settingsSheet').hidden) $('#sheetBackdrop').hidden = true;
}

function bindControls() {
  setupReels();
  $('#shuffleAll').addEventListener('click', shuffleUnlocked);
  $$('.duration-options button').forEach((button) => button.addEventListener('click', () => {
    store.set('duration', Number(button.dataset.duration));
    renderHome();
    tone(420 + Number(button.dataset.duration) * 4);
  }));
  $('#startButton').addEventListener('click', () => {
    if (current().active) {
      openConfirm('Заменить незавершённую сессию?', 'Текущий таймер и незаписанный разбор будут потеряны.', () => { store.set('active', null); startSession(); });
    } else startSession();
  });
  $('#resumeButton').addEventListener('click', () => showScreen(current().active?.status === 'review' ? 'review' : 'session'));
  $('#sessionBack').addEventListener('click', () => { pauseActive(); showScreen('home'); showToast('Сессия поставлена на паузу'); });
  $('#pauseButton').addEventListener('click', togglePause);
  $('#skipPhase').addEventListener('click', () => advancePhase(true));
  $('#tipButton').addEventListener('click', () => {
    tipIndex = (tipIndex + 1) % TIPS.length;
    $('#tipText').textContent = TIPS[tipIndex];
    $('#tipStrip').hidden = false;
    tone(560);
  });
  $('#tipClose').addEventListener('click', () => { $('#tipStrip').hidden = true; });
  $('#photoButton').addEventListener('click', () => $('#photoInput').click());
  $('#photoInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $('#photoButton b').textContent = 'ОБРАБАТЫВАЕМ ФОТО…';
    try {
      pendingPhoto = await compressPhoto(file);
      renderReview();
      showToast('Фото добавлено');
    } catch (error) {
      showToast(error.message || 'Не удалось обработать фото');
    } finally {
      $('#photoButton b').textContent = 'СФОТОГРАФИРОВАТЬ РАБОТУ';
      event.target.value = '';
    }
  });
  $('#removePhoto').addEventListener('click', () => { pendingPhoto = null; renderReview(); });
  $('#saveReview').addEventListener('click', saveReview);
  $$('[data-screen]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
  $('#settingsButton').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', closeSettings);
  $('#sheetBackdrop').addEventListener('click', () => { closeSettings(); closeConfirm(); });
  $('#soundToggle').addEventListener('click', () => {
    const next = !current().sound;
    store.set('sound', next);
    $('#soundState').textContent = next ? 'ВКЛ' : 'ВЫКЛ';
    if (next) tone(600, .08);
  });
  $('#resetData').addEventListener('click', () => openConfirm('Сбросить весь прогресс?', 'Исчезнут архив, фотографии, оценки и незавершённая сессия.', () => {
    store.reset();
    seedDaily();
    closeSettings();
    renderHome();
    showToast('КАРКАС очищен');
  }));
  $('#confirmCancel').addEventListener('click', closeConfirm);
  $('#confirmAccept').addEventListener('click', () => {
    const action = confirmAction;
    closeConfirm();
    action?.();
  });
  window.addEventListener('pagehide', () => {
    const active = current().active;
    if (active?.paused) store.set('active', active);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !screens.session.hidden) renderSession();
  });
}

function boot() {
  seedDaily();
  bindControls();
  renderHome();
  window.setTimeout(() => {
    $('#boot').hidden = true;
    $('#workspace').hidden = false;
    showScreen('home');
  }, 360);
}

boot();
