import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  TILE_CODES, analyzeDiscards, countsFromTiles, detectClosedYaku, formatWaits,
  hasYaku, isWinning, makeWall, rankOf, seededRandom, shanten, shuffle,
  sortTiles, suitOf, tileCode, tileId, tileName, ukeireForThirteen
} from './mahjong-core.js';

installMobileRuntime();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const codes = (source) => source.trim().split(/\s+/).map(tileId);

const storage = createVersionedStore({
  namespace: 'pocket-works:mahjong-dojo',
  version: 1,
  defaults: {
    lessonsCompleted: [],
    drill: { attempts: 0, correct: 0, streak: 0, bestStreak: 0 },
    matches: 0,
    wins: 0,
    difficulty: 'club',
    sound: true
  },
  validate(value) { return value && typeof value === 'object' && !Array.isArray(value); }
});

const state = {
  view: 'home',
  previousView: 'home',
  lessonIndex: 0,
  lessonStep: 0,
  lessonSolved: false,
  drillDifficulty: storage.get('difficulty', 'club'),
  drillHand: [],
  drillResolved: false,
  tableDifficulty: storage.get('difficulty', 'club'),
  table: null,
  audio: null,
  sound: storage.get('sound', true),
  timerToken: 0,
  autoPaused: false
};

const ui = {
  back: $('#back-button'), close: $('#close-button'), sound: $('#sound-button'), homeExit: $('#home-exit-button'),
  rank: $('#stat-rank'), streak: $('#stat-streak'), accuracy: $('#stat-accuracy'), academyProgress: $('#academy-progress'),
  continueButton: $('#continue-button'), continueLabel: $('#continue-label'), lessonList: $('#lesson-list'),
  lessonProgress: $('#lesson-progress-fill'), lessonKicker: $('#lesson-kicker'), lessonTitle: $('#lesson-title'),
  lessonCopy: $('#lesson-copy'), lessonStage: $('#lesson-stage'), lessonFeedback: $('#lesson-feedback'), lessonNext: $('#lesson-next'),
  drillDifficulty: $('#drill-difficulty'), drillCoach: $('#drill-coach'), drillHand: $('#drill-hand'), drillAnalysis: $('#drill-analysis'),
  drillStreak: $('#drill-streak'), drillAccuracy: $('#drill-accuracy'), nextDrill: $('#next-drill'),
  difficultyStack: $('#difficulty-stack'), startTable: $('#start-table'), roundLabel: $('#round-label'), wallLabel: $('#wall-label'),
  tableHint: $('#table-hint'), pauseButton: $('#pause-button'), turnLabel: $('#turn-label'), tableMessage: $('#table-message'), playerRiver: $('#player-river'),
  playerHand: $('#player-hand'), playerStatus: $('#player-status'), riichi: $('#riichi-button'), win: $('#win-button'), draw: $('#draw-button'),
  tableCoach: $('#table-coach'),
  botHands: [null, $('#bot1-hand'), $('#bot2-hand'), $('#bot3-hand')],
  botRivers: [null, $('#bot1-river'), $('#bot2-river'), $('#bot3-river')],
  botStates: [null, $('#bot1-state'), $('#bot2-state'), $('#bot3-state')],
  codexTabs: $('#codex-tabs'), codex: $('#codex-content'),
  modal: $('#result-modal'), resultKicker: $('#result-kicker'), resultTitle: $('#result-title'), resultCopy: $('#result-copy'),
  resultExtra: $('#result-extra'), resultHome: $('#result-home'), resultExit: $('#result-exit'), resultAgain: $('#result-again'),
  pauseModal: $('#pause-modal'), pauseExit: $('#pause-exit'), pauseHome: $('#pause-home'), pauseResume: $('#pause-resume')
};

const LESSONS = [
  {
    title: 'Читать стол', subtitle: 'Масти, достоинства и почётные кости',
    steps: [
      { kind: 'intro', copy: 'В риичи 34 типа костей. Ман, пин и соу идут от 1 до 9; отдельно лежат четыре ветра и три дракона.', display: '1m 4m 9m 2p 5p 8p 3s 6s 9s E S W N P F C' },
      { kind: 'choice', copy: 'Найди почётную кость. У неё нет последовательностей — только пары и тройки.', prompt: 'Какая из этих костей — хонор?', options: ['4m','7p','E','2s'], answer: 'E', explain: 'Восток — ветер, значит почётная кость. 4m, 7p и 2s принадлежат числовым мастям.' }
    ]
  },
  {
    title: 'Скелет руки', subtitle: 'Четыре группы и одна пара',
    steps: [
      { kind: 'intro', copy: 'Обычная закрытая победная рука содержит четыре группы по три кости и пару. Группа — последовательность или тройка.', display: '1m 2m 3m 4m 5m 6m 7p 8p 9p 2s 3s 4s E E' },
      { kind: 'choice', copy: 'Последовательность не может пересекать границу масти и не существует среди ветров/драконов.', prompt: 'Какая тройка является последовательностью?', options: ['8m 9m 1p','2s 3s 4s','E S W','5p 5p 5p'], answer: '2s 3s 4s', explain: '2–3–4 соу — чистая последовательность. 5p×3 — тройка, но не последовательность.' }
    ]
  },
  {
    title: 'Сянтэн', subtitle: 'Расстояние до тенпая',
    steps: [
      { kind: 'intro', copy: 'Сянтэн показывает, сколько улучшений отделяет руку от тенпая. 0 = тенпай, −1 = готовая победная рука. Сначала уменьшаем сянтэн, потом считаем ширину улучшений.', display: '1m 2m 3m 4m 5m 6m 7m 8m 3p 4p 5p 6s 6s E' },
      { kind: 'discard', copy: 'Здесь одиночный Восток почти ничего не делает для структуры. Найди лучший сброс.', hand: '1m 2m 3m 4m 5m 6m 7m 8m 3p 4p 5p 6s 6s E', answer: 'E', explain: 'Сброс Востока сохраняет все связанные числовые блоки и пару 6s.' }
    ]
  },
  {
    title: 'Укеирэ', subtitle: 'Не только близко, но и широко',
    steps: [
      { kind: 'intro', copy: 'Две руки могут иметь одинаковый сянтэн, но разное число полезных доборов. Это и есть укеирэ: сколько оставшихся костей реально улучшает форму.', display: '2p 3p 1m 2m 3m 4m 5m 6m 7s 8s 9s E E' },
      { kind: 'wait', copy: 'Рука в тенпае. Какие кости завершают блок 2p–3p?', hand: '2p 3p 1m 2m 3m 4m 5m 6m 7s 8s 9s E E', options: ['1p','2p','4p','5p'], answers: ['1p','4p'], explain: '2–3 ждёт 1 или 4: классическое двухстороннее рянмэн-ожидание.' }
    ]
  },
  {
    title: 'Риичи', subtitle: 'Обязательство в обмен на яку',
    steps: [
      { kind: 'intro', copy: 'Закрытая рука в тенпае может объявить риичи, заплатив 1000 очков. После объявления менять структуру уже нельзя: обычно сбрасывается только свежий добор.', display: '2p 3p 1m 2m 3m 4m 5m 6m 7s 8s 9s E E' },
      { kind: 'choice', copy: 'Риичи — не кнопка «я почти выиграл». У него есть формальные условия.', prompt: 'Когда объявление легально?', options: ['Любая закрытая рука','Закрытая рука в тенпае и есть 1000 очков','После любого пон','Только с парой драконов'], answer: 'Закрытая рука в тенпае и есть 1000 очков', explain: 'Нужна закрытая рука, тенпай и депозит 1000. После риичи свобода сброса резко ограничена.' }
    ]
  },
  {
    title: 'Яку и хан', subtitle: 'Почему готовая форма ещё не всегда победа',
    steps: [
      { kind: 'intro', copy: 'Чтобы выиграть, мало собрать форму: нужен хотя бы один яку. Яку дают хан; больше хан обычно значит дороже рука. Дора увеличивает стоимость, но сама по себе яку не заменяет.', display: '2m 3m 4m 3m 4m 5m 4p 5p 6p 6s 7s 8s 5p 5p' },
      { kind: 'choice', copy: 'В этой руке нет единиц, девяток и почётных костей.', prompt: 'Какой базовый яку здесь виден?', options: ['Танъяо','Якухай','Кокуши','Чанта'], answer: 'Танъяо', explain: 'Танъяо — рука только из простых числовых костей 2–8. Это 1 хан.' }
    ]
  }
];

const CODEX = {
  tiles: `
    <section class="codex-section"><h3>Три масти</h3><p><b>Ман</b> (m), <b>пин</b> (p) и <b>соу</b> (s) — по девять достоинств. Последовательности существуют только внутри одной масти.</p><div class="tile-reference" data-ref-tiles="1m 5m 9m 1p 5p 9p 1s 5s 9s"></div></section>
    <section class="codex-section"><h3>Почётные</h3><p>Ветра: Восток, Юг, Запад, Север. Драконы: белый, зелёный, красный. Они не образуют последовательностей.</p><div class="tile-reference" data-ref-tiles="E S W N P F C"></div></section>`,
  shape: `
    <section class="codex-section"><h3>Сянтэн</h3><p>−1 — готовая рука; 0 — тенпай; 1 — иишантэн. Сильный базовый принцип: не увеличивать сянтэн без причины.</p></section>
    <section class="codex-section"><h3>Укеирэ</h3><p>Количество оставшихся костей, которые снижают сянтэн. При равном сянтэне широкое укеирэ обычно сильнее узкого.</p></section>
    <section class="codex-section"><h3>Ожидания</h3><ul><li><b>Рянмэн</b> — двухстороннее, обычно самое широкое.</li><li><b>Канчан</b> — внутренняя дыра, одна кость.</li><li><b>Пенчан</b> — край 1–2→3 или 8–9→7.</li><li><b>Танки</b> — ожидание пары.</li></ul></section>`,
  yaku: `
    <section class="codex-section"><h3>Частые закрытые яку</h3><ul><li><b>Риичи</b> — 1 хан.</li><li><b>Мензен цумо</b> — 1 хан.</li><li><b>Танъяо</b> — только 2–8, 1 хан.</li><li><b>Иипэйко:</b> — две одинаковые последовательности одной масти, 1 хан.</li><li><b>Чиито:цу</b> — семь пар, 2 хан.</li><li><b>Хоницу / чиницу</b> — одна числовая масть с/без хоноров.</li></ul></section>
    <section class="codex-section"><h3>Якухай</h3><p>Тройка драконов, собственного ветра или ветра раунда даёт яку. Если Восток одновременно ветер места и раунда, его тройка даёт оба яку.</p></section>`,
  strategy: `
    <section class="codex-section"><h3>Приоритет формы</h3><ol><li>Не ломай готовые группы без причины.</li><li>При равном сянтэне выбирай больше укеирэ.</li><li>Рянмэн ценнее канчана и пенчана.</li><li>Изолированные 3–7 обычно гибче, чем 1/9 и хоноры.</li></ol></section>
    <section class="codex-section"><h3>Риичи или даматэн</h3><p>Риичи добавляет яку и давление, но блокирует перестройку руки. Чем опаснее стол и чем ценнее уже готовая рука, тем осмысленнее сравнивать риичи с даматэном, а не нажимать автоматически.</p></section>
    <section class="codex-section"><h3>Защита</h3><p>Этот первый стол тренирует закрытую эффективность. Для реальной сильной игры следующий слой — генбуцу, судзи, кabe и оценка стоимости чужих рук. Здесь тренер пока не притворяется, будто «безопасность» можно свести к одной лампочке.</p></section>`
};

function playSound(kind = 'tap') {
  if (!state.sound) return;
  try {
    state.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const settings = kind === 'good' ? [520, .055, .05] : kind === 'bad' ? [145, .07, .045] : [270, .025, .025];
    osc.type = kind === 'tap' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(settings[0], now);
    if (kind === 'good') osc.frequency.exponentialRampToValueAtTime(760, now + settings[1]);
    gain.gain.setValueAtTime(settings[2], now);
    gain.gain.exponentialRampToValueAtTime(.001, now + settings[1]);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + settings[1]);
  } catch {}
}

function tileFace(id) {
  const rank = rankOf(id);
  const suit = suitOf(id);
  const numerals = ['一','二','三','四','五','六','七','八','九'];
  if (id === 27) return { main: '東', sub: 'EAST', kind: 'wind' };
  if (id === 28) return { main: '南', sub: 'SOUTH', kind: 'wind' };
  if (id === 29) return { main: '西', sub: 'WEST', kind: 'wind' };
  if (id === 30) return { main: '北', sub: 'NORTH', kind: 'wind' };
  if (id === 31) return { main: '白', sub: 'HAKU', kind: 'white' };
  if (id === 32) return { main: '發', sub: 'HATSU', kind: 'green' };
  if (id === 33) return { main: '中', sub: 'CHUN', kind: 'red' };
  if (suit === 'm') return { main: numerals[rank - 1] + '萬', sub: tileCode(id), kind: '' };
  if (suit === 'p') return { main: `${rank}筒`, sub: tileCode(id), kind: '' };
  return { main: `${numerals[rank - 1]}索`, sub: tileCode(id), kind: '' };
}

function tileHtml(id, options = {}) {
  const face = tileFace(id);
  const classes = ['tile'];
  if (options.mini) classes.push('mini');
  if (options.back) classes.push('tile-back');
  if (options.drawn) classes.push('is-drawn');
  if (options.best) classes.push('is-best');
  if (options.hint) classes.push('is-hint');
  if (options.back) return `<span class="${classes.join(' ')}" aria-hidden="true"></span>`;
  const tag = options.button ? 'button' : 'span';
  const buttonAttrs = options.button ? ` type="button" data-native-press data-tile="${id}" aria-label="${tileName(id)}"` : '';
  return `<${tag} class="${classes.join(' ')}" data-suit="${suitOf(id)}" data-kind="${face.kind}"${buttonAttrs}><span class="tile-face"><span class="tile-main">${face.main}</span><span class="tile-sub">${face.sub}</span></span></${tag}>`;
}

function renderTiles(container, tiles, options = {}) {
  const sorted = options.sorted === false ? [...tiles] : sortTiles(tiles);
  container.innerHTML = sorted.map((id, index) => tileHtml(id, {
    button: options.button,
    mini: options.mini,
    back: options.back,
    drawn: options.drawnIndex === index,
    best: options.bestIds?.has(id),
    hint: options.hintIds?.has(id)
  })).join('');
}

function setView(view) {
  state.previousView = state.view;
  state.view = view;
  document.body.dataset.view = view;
  for (const node of $$('.view')) node.classList.toggle('is-active', node.dataset.view === view);
  ui.modal.hidden = true;
  ui.tableCoach.hidden = true;
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (view === 'home') renderHome();
  if (view === 'academy') renderAcademy();
  if (view === 'codex') renderCodex('tiles');
  if (view === 'drill') startDrill();
  if (view === 'table-setup') renderTableSetup();
}

function goHome() {
  if (state.view === 'table' && state.table && !state.table.over) { openPause(); return; }
  setView('home');
}

function openPause() {
  const table = state.table;
  if (!table || table.over) return;
  table.paused = true;
  table.token = ++state.timerToken;
  ui.pauseModal.hidden = false;
}

function resumePause() {
  const table = state.table;
  if (!table || table.over) { ui.pauseModal.hidden = true; return; }
  ui.pauseModal.hidden = true;
  table.paused = false;
  table.token = ++state.timerToken;
  if (table.phase === 'busy') runBotsFrom(table.botNextSeat || 1, table.token);
  renderTable();
}

function abandonTableToHome() {
  if (state.table) { state.table.over = true; state.table.token = ++state.timerToken; }
  ui.pauseModal.hidden = true;
  setView('home');
}

function closeApp() {
  const target = new URL('../../', window.location.href).href;
  const fallback = () => window.location.assign(target);
  try {
    if (window.PocketWorks?.closeApp) { window.PocketWorks.closeApp(); return; }
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'pocketworks:close-app', appId: 'mahjong-dojo' }, '*');
      window.setTimeout(fallback, 180);
      return;
    }
  } catch {}
  fallback();
}

function progressStats() {
  const completed = storage.get('lessonsCompleted', []);
  const drill = storage.get('drill', {});
  const matches = storage.get('matches', 0);
  const wins = storage.get('wins', 0);
  const score = completed.length * 12 + Math.min(35, drill.correct || 0) + wins * 5 + Math.min(10, matches);
  const rank = score >= 95 ? 'Дзёдан' : score >= 60 ? 'Клубный' : score >= 28 ? 'Ученик+' : completed.length ? 'Ученик' : 'Новичок';
  return { completed, drill, matches, wins, rank };
}

function renderHome() {
  const { completed, drill, rank } = progressStats();
  ui.rank.textContent = rank;
  ui.streak.textContent = String(drill.bestStreak || 0);
  ui.accuracy.textContent = drill.attempts ? `${Math.round((drill.correct / drill.attempts) * 100)}%` : '—';
  ui.academyProgress.textContent = `${completed.length} / ${LESSONS.length}`;
  if (completed.length < LESSONS.length) ui.continueLabel.textContent = completed.length ? `Продолжить: ${LESSONS[completed.length].title}` : 'Начать с Академии';
  else if ((drill.attempts || 0) < 12) ui.continueLabel.textContent = 'Закрепить форму в Лаборатории';
  else ui.continueLabel.textContent = 'Сыграть тренировочную партию';
}

function renderAcademy() {
  const completed = storage.get('lessonsCompleted', []);
  ui.lessonList.innerHTML = LESSONS.map((lesson, index) => {
    const done = completed.includes(index);
    const unlocked = index === 0 || completed.includes(index - 1) || done;
    return `<button class="lesson-card" type="button" data-lesson="${index}" ${unlocked ? '' : 'disabled'} data-native-press>
      <span class="lesson-num">${String(index + 1).padStart(2, '0')}</span>
      <span><b>${lesson.title}</b><span>${lesson.subtitle}</span></span>
      <span class="lesson-state">${done ? 'ГОТОВО' : unlocked ? 'ОТКРЫТ' : 'ЗАКРЫТ'}</span>
    </button>`;
  }).join('');
}

function openLesson(index) {
  state.lessonIndex = index;
  state.lessonStep = 0;
  setView('lesson');
  renderLesson();
}

function renderLesson() {
  const lesson = LESSONS[state.lessonIndex];
  const step = lesson.steps[state.lessonStep];
  state.lessonSolved = step.kind === 'intro';
  ui.lessonProgress.style.width = `${((state.lessonStep + 1) / lesson.steps.length) * 100}%`;
  ui.lessonKicker.textContent = `УРОК ${state.lessonIndex + 1} · ШАГ ${state.lessonStep + 1}/${lesson.steps.length}`;
  ui.lessonTitle.textContent = lesson.title;
  ui.lessonCopy.textContent = step.copy;
  ui.lessonFeedback.className = 'lesson-feedback';
  ui.lessonFeedback.textContent = step.kind === 'intro' ? 'Рассмотри пример и переходи дальше.' : 'Выбери ответ.';
  ui.lessonNext.disabled = !state.lessonSolved;
  ui.lessonNext.textContent = state.lessonStep === lesson.steps.length - 1 ? 'Завершить урок' : 'Дальше';

  if (step.kind === 'intro') {
    ui.lessonStage.innerHTML = `<div class="hand-zone">${codes(step.display).map((id) => tileHtml(id)).join('')}</div>`;
  } else if (step.kind === 'choice') {
    ui.lessonStage.innerHTML = `<div class="lesson-big">${step.prompt}</div><div class="choice-row">${step.options.map((value) => `<button class="choice-button" type="button" data-answer="${value}" data-native-press>${value.includes(' ') ? value : tileName(tileId(value))}</button>`).join('')}</div>`;
  } else if (step.kind === 'discard') {
    const hand = codes(step.hand);
    ui.lessonStage.innerHTML = `<div class="lesson-big">Коснись кости, которую выбросишь.</div><div class="hand-zone">${sortTiles(hand).map((id) => tileHtml(id, { button: true })).join('')}</div>`;
  } else if (step.kind === 'wait') {
    const hand = codes(step.hand);
    ui.lessonStage.innerHTML = `<div class="hand-zone">${sortTiles(hand).map((id) => tileHtml(id)).join('')}</div><div class="lesson-big">Выбери все ожидания.</div><div class="choice-row">${step.options.map((value) => `<button class="choice-button" type="button" data-answer="${value}" data-native-press>${tileName(tileId(value))}</button>`).join('')}</div>`;
    state.lessonSelections = new Set();
  }
}

function solveLesson(correct, explain, target) {
  if (correct) {
    state.lessonSolved = true;
    ui.lessonNext.disabled = false;
    ui.lessonFeedback.className = 'lesson-feedback good';
    ui.lessonFeedback.textContent = explain;
    target?.classList.add('is-correct');
    playSound('good');
  } else {
    ui.lessonFeedback.className = 'lesson-feedback bad';
    ui.lessonFeedback.textContent = `Не совсем. ${explain}`;
    target?.classList.add('is-wrong');
    playSound('bad');
  }
}

function completeLesson() {
  const completed = new Set(storage.get('lessonsCompleted', []));
  completed.add(state.lessonIndex);
  storage.set('lessonsCompleted', [...completed].sort((a, b) => a - b));
  playSound('good');
  showResult({
    kicker: 'УРОК ПРОЙДЕН',
    title: LESSONS[state.lessonIndex].title,
    copy: state.lessonIndex < LESSONS.length - 1 ? `Открыта следующая ступень: «${LESSONS[state.lessonIndex + 1].title}».` : 'База закрытой игры собрана. Теперь Лаборатория и Стол будут полезнее, а не просто красивее.',
    extra: '',
    again: 'К Академии',
    onAgain: () => setView('academy')
  });
}

const DIFFICULTY_NAMES = { learner: 'Ученик', club: 'Клуб', sharp: 'Острый' };
function difficultyRange(mode) {
  return mode === 'learner' ? [0, 2] : mode === 'club' ? [1, 3] : [1, 3];
}

function generatePracticeHand(mode) {
  const random = seededRandom(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
  const [low, high] = difficultyRange(mode);
  let fallback = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    const hand = sortTiles(shuffle(makeWall(), random).slice(0, 14));
    const current = shanten(hand);
    if (current === -1 || current > high + 1) continue;
    const analysis = analyzeDiscards(hand);
    fallback ||= { hand, analysis };
    if (analysis[0].shanten < low || analysis[0].shanten > high) continue;
    if (analysis.length < 5) continue;
    if (mode === 'sharp') {
      const second = analysis.find((row) => !row.best);
      if (!second || (second.shanten === analysis[0].shanten && Math.abs(analysis[0].ukeire - second.ukeire) < 3)) continue;
    }
    return { hand, analysis };
  }
  if (fallback) return fallback;
  const hand = sortTiles([0,1,2,4,5,6,9,10,11,18,19,27,27,33]);
  return { hand, analysis: analyzeDiscards(hand) };
}

function startDrill() {
  const generated = generatePracticeHand(state.drillDifficulty);
  state.drillHand = generated.hand;
  state.drillAnalysis = generated.analysis;
  state.drillResolved = false;
  ui.drillDifficulty.textContent = DIFFICULTY_NAMES[state.drillDifficulty];
  ui.drillCoach.textContent = state.drillDifficulty === 'learner'
    ? 'Зелёная рамка отмечает сильные кандидаты. Твоя задача — понять, какой из них шире.'
    : state.drillDifficulty === 'sharp'
      ? 'Никаких подсказок до решения. При равном сянтэне смотри на реальное укеирэ.'
      : 'Выбери сброс. После хода покажу лучший вариант, сянтэн и укеирэ.';
  const bestIds = state.drillDifficulty === 'learner' ? new Set(state.drillAnalysis.slice(0, 2).map((row) => row.id)) : null;
  renderDrillHand(bestIds);
  ui.drillAnalysis.hidden = true;
  ui.nextDrill.disabled = true;
  renderDrillStats();
}

function renderDrillHand(bestIds = null) {
  const uniqueBest = bestIds || new Set();
  ui.drillHand.innerHTML = state.drillHand.map((id, index) => tileHtml(id, { button: !state.drillResolved, best: uniqueBest.has(id), drawn: index === state.drillHand.length - 1 })).join('');
}

function renderDrillStats() {
  const drill = storage.get('drill', {});
  ui.drillStreak.textContent = String(drill.streak || 0);
  ui.drillAccuracy.textContent = drill.attempts ? `${Math.round((drill.correct / drill.attempts) * 100)}%` : '—';
}

function resolveDrill(discardId) {
  if (state.drillResolved) return;
  state.drillResolved = true;
  const selected = state.drillAnalysis.find((row) => row.id === discardId);
  const bestRows = state.drillAnalysis.filter((row) => row.best);
  const correct = Boolean(selected?.best);
  const drill = storage.get('drill', { attempts: 0, correct: 0, streak: 0, bestStreak: 0 });
  drill.attempts = (drill.attempts || 0) + 1;
  drill.correct = (drill.correct || 0) + (correct ? 1 : 0);
  drill.streak = correct ? (drill.streak || 0) + 1 : 0;
  drill.bestStreak = Math.max(drill.bestStreak || 0, drill.streak);
  storage.set('drill', drill);

  renderDrillHand(new Set(bestRows.map((row) => row.id)));
  const best = bestRows[0];
  ui.drillCoach.textContent = correct
    ? `Да. ${tileName(discardId)} сохраняет ${best.shanten === 0 ? 'тенпай' : `${best.shanten}-сянтэн`} и даёт ${best.ukeire} полезных доборов.`
    : `${tileName(discardId)}: ${selected.shanten}-сянтэн, укеирэ ${selected.ukeire}. Лучше ${tileName(best.id)}: ${best.shanten}-сянтэн, укеирэ ${best.ukeire}.`;
  ui.drillAnalysis.innerHTML = renderAnalysis(state.drillAnalysis, discardId);
  ui.drillAnalysis.hidden = false;
  ui.nextDrill.disabled = false;
  renderDrillStats();
  playSound(correct ? 'good' : 'bad');
}

function renderAnalysis(rows, selectedId = null) {
  const top = rows.slice(0, 5);
  const chosen = rows.find((row) => row.id === selectedId) || top[0];
  return `<div class="analysis-summary">
    <div><small>ТВОЙ СБРОС</small><b>${tileCode(chosen.id)}</b></div>
    <div><small>СЯНТЭН</small><b>${chosen.shanten}</b></div>
    <div><small>УКЕИРЭ</small><b>${chosen.ukeire}</b></div>
  </div><div class="analysis-list">${top.map((row) => `<div class="analysis-row"><strong>${row.best ? '★ ' : ''}${tileCode(row.id)}</strong><span>${row.shanten === 0 ? 'тенпай' : `${row.shanten}-сянтэн`} · ${row.ukeire} костей</span><span class="waits">${formatWaits(row.waits) || '—'}</span></div>`).join('')}</div>`;
}

function cycleDrillDifficulty() {
  const order = ['learner','club','sharp'];
  state.drillDifficulty = order[(order.indexOf(state.drillDifficulty) + 1) % order.length];
  storage.set('difficulty', state.drillDifficulty);
  startDrill();
}

function renderTableSetup() {
  for (const card of $$('.difficulty-card')) card.classList.toggle('is-selected', card.dataset.difficulty === state.tableDifficulty);
}

function dealTable() {
  const wall = shuffle(makeWall());
  const hands = [[], [], [], []];
  for (let round = 0; round < 13; round++) for (let seat = 0; seat < 4; seat++) hands[seat].push(wall.pop());
  for (const hand of hands) hand.sort((a, b) => a - b);
  state.table = {
    wall, hands, rivers: [[],[],[],[]], riichi: [false,false,false,false],
    turn: 0, phase: 'draw', drawnId: null, over: false, riichiArmed: false,
    pendingRon: null, resumeSeat: 1, botNextSeat: 1, paused: false, token: ++state.timerToken
  };
  setView('table');
  ui.roundLabel.textContent = 'Восток 1 · закрытая тренировка';
  ui.tableCoach.hidden = true;
  renderTable();
}

function tableContext(seat, extra = {}) {
  return { seatWind: 27 + seat, roundWind: 27, riichi: state.table.riichi[seat], ...extra };
}

function tablePlayerAnalysis() {
  const table = state.table;
  if (!table || table.hands[0].length !== 14) return [];
  const key = table.hands[0].join(',');
  if (table.analysisKey !== key) {
    table.analysisKey = key;
    table.analysisRows = analyzeDiscards(table.hands[0]);
  }
  return table.analysisRows || [];
}

function renderTable() {
  const table = state.table;
  if (!table) return;
  ui.wallLabel.textContent = `${table.wall.length} в стене`;
  ui.playerStatus.textContent = `${table.hands[0].length} костей${table.riichi[0] ? ' · РИИЧИ' : ''}`;
  ui.turnLabel.textContent = table.phase === 'ron' ? 'Рон?' : table.turn === 0 ? 'Твой ход' : `Ход: ${['Ты','Юг','Запад','Север'][table.turn]}`;
  ui.tableMessage.textContent = table.phase === 'draw' ? 'Возьми кость' : table.phase === 'discard' ? 'Выбери сброс' : table.phase === 'ron' ? `Можно выиграть на ${tileName(table.pendingRon.tile)}` : 'Стол считает ход';

  const hand = table.hands[0];
  let hintIds = new Set();
  if (table.phase === 'discard' && hand.length === 14 && state.tableDifficulty === 'learner' && !table.riichi[0]) {
    hintIds = new Set(tablePlayerAnalysis().slice(0, 2).map((row) => row.id));
  }
  ui.playerHand.innerHTML = hand.map((id, index) => {
    const isDrawn = index === hand.length - 1 && id === table.drawnId;
    const canDiscard = table.phase === 'discard' && (!table.riichi[0] || isDrawn);
    return tileHtml(id, { button: canDiscard, drawn: isDrawn, hint: hintIds.has(id) });
  }).join('');

  renderTiles(ui.playerRiver, table.rivers[0], { mini: true, sorted: false });
  for (let seat = 1; seat < 4; seat++) {
    if (ui.botRivers[seat]) renderTiles(ui.botRivers[seat], table.rivers[seat], { mini: true, sorted: false });
  }
  ui.botHands[2].innerHTML = table.hands[2].map(() => tileHtml(0, { back: true, mini: true })).join('');

  const canRiichi = table.phase === 'discard' && !table.riichi[0] && hand.length === 14 && tablePlayerAnalysis().some((row) => row.shanten === 0);
  ui.riichi.disabled = !canRiichi && !table.riichiArmed;
  ui.riichi.textContent = table.riichiArmed ? 'Отмена риичи' : table.riichi[0] ? 'Риичи ✓' : 'Риичи';

  let canTsumo = false;
  if (table.phase === 'discard' && isWinning(hand)) canTsumo = hasYaku(hand, tableContext(0, { tsumo: true }));
  ui.win.hidden = !(canTsumo || table.phase === 'ron');
  ui.win.textContent = table.phase === 'ron' ? 'Рон' : 'Цумо';

  ui.draw.disabled = !(table.phase === 'draw' || table.phase === 'ron');
  ui.draw.textContent = table.phase === 'ron' ? 'Пропустить' : 'Взять';
}

function drawPlayer() {
  const table = state.table;
  if (!table || table.over || table.phase !== 'draw') return;
  if (!table.wall.length) { endExhaustiveDraw(); return; }
  const tile = table.wall.pop();
  table.hands[0].push(tile);
  table.drawnId = tile;
  table.phase = 'discard';
  table.turn = 0;
  renderTable();
  playSound('tap');
}

function toggleRiichi() {
  const table = state.table;
  if (!table || table.phase !== 'discard' || table.riichi[0]) return;
  table.riichiArmed = !table.riichiArmed;
  if (table.riichiArmed) showCoach('Риичи вооружено. Выбери только тот сброс, после которого сянтэн станет 0. После объявления дальше разрешён только цумогири.');
  else ui.tableCoach.hidden = true;
  renderTable();
}

function showCoach(html) {
  ui.tableCoach.innerHTML = html;
  ui.tableCoach.hidden = false;
}

function discardPlayer(id) {
  const table = state.table;
  if (!table || table.phase !== 'discard' || table.over) return;
  const index = table.hands[0].indexOf(id);
  if (index < 0) return;
  if (table.riichi[0] && id !== table.drawnId) return;

  const before = [...table.hands[0]];
  const rows = tablePlayerAnalysis();
  const row = rows.find((item) => item.id === id);
  if (table.riichiArmed && row.shanten !== 0) {
    showCoach(`<b>Риичи пока нелегально.</b> После сброса ${tileCode(id)} рука останется в ${row.shanten}-сянтэн. Выбери сброс, который оставляет 0.`);
    playSound('bad');
    return;
  }
  if (table.riichiArmed) {
    table.riichi[0] = true;
    table.riichiArmed = false;
  }

  table.hands[0].splice(index, 1);
  table.hands[0].sort((a,b) => a-b);
  table.rivers[0].push(id);
  table.drawnId = null;
  table.phase = 'busy';
  const best = rows[0];
  const quality = row.best ? 'Оптимальный сброс.' : `Лучше выглядел ${tileCode(best.id)}: ${best.shanten}-сянтэн / укеирэ ${best.ukeire}.`;
  if (state.tableDifficulty !== 'learner' || !row.best) showCoach(`<b>${tileCode(id)}</b> → ${row.shanten === 0 ? 'тенпай' : `${row.shanten}-сянтэн`}, укеирэ ${row.ukeire}. ${quality}`);
  renderTable();
  playSound(row.best ? 'good' : 'tap');

  const ronSeat = findRonWinner(id, 0);
  if (ronSeat != null) { endBotRon(ronSeat, id, 0); return; }
  runBotsFrom(1, table.token);
}

function chooseBotDiscard(seat, hand) {
  if (state.table.riichi[seat]) return hand[hand.length - 1];
  const rows = analyzeDiscards(hand);
  const mode = state.tableDifficulty;
  if (mode === 'sharp') return rows[0].id;
  if (mode === 'club') {
    const pool = rows.slice(0, Math.min(3, rows.length));
    return pool[Math.random() < .72 ? 0 : Math.floor(Math.random() * pool.length)].id;
  }
  const pool = rows.slice(0, Math.min(6, rows.length));
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function maybeBotRiichi(seat, hand, discard) {
  if (state.table.riichi[seat]) return;
  const next = [...hand];
  next.splice(next.indexOf(discard), 1);
  if (shanten(next) !== 0) return;
  const chance = state.tableDifficulty === 'sharp' ? .88 : state.tableDifficulty === 'club' ? .66 : .42;
  if (Math.random() < chance) state.table.riichi[seat] = true;
}

function findRonWinner(discard, discarder) {
  const table = state.table;
  for (let seat = 1; seat < 4; seat++) {
    if (seat === discarder || table.hands[seat].length !== 13) continue;
    const candidate = sortTiles([...table.hands[seat], discard]);
    if (isWinning(candidate) && hasYaku(candidate, tableContext(seat, { tsumo: false }))) return seat;
  }
  return null;
}

async function runBotsFrom(startSeat, token) {
  const table = state.table;
  if (!table || table.over || table.paused || token !== table.token) return;
  table.botNextSeat = startSeat;
  for (let seat = startSeat; seat < 4; seat++) {
    if (!state.table || state.table.over || state.table.paused || token !== state.table.token) return;
    table.turn = seat;
    ui.botStates[seat].textContent = 'думает';
    renderTable();
    await sleep(state.tableDifficulty === 'sharp' ? 280 : 420);
    if (table.paused || token !== table.token) return;
    if (!table.wall.length) { endExhaustiveDraw(); return; }
    const drawn = table.wall.pop();
    table.hands[seat].push(drawn);
    if (isWinning(table.hands[seat]) && hasYaku(table.hands[seat], tableContext(seat, { tsumo: true }))) {
      endBotTsumo(seat);
      return;
    }
    const discard = chooseBotDiscard(seat, table.hands[seat]);
    maybeBotRiichi(seat, table.hands[seat], discard);
    const idx = table.hands[seat].indexOf(discard);
    table.hands[seat].splice(idx, 1);
    table.hands[seat].sort((a,b) => a-b);
    table.rivers[seat].push(discard);
    ui.botStates[seat].textContent = table.riichi[seat] ? 'риичи' : 'готов';
    playSound('tap');
    renderTable();

    // Player has priority to choose ron or pass.
    const playerCandidate = sortTiles([...table.hands[0], discard]);
    if (table.hands[0].length === 13 && isWinning(playerCandidate) && hasYaku(playerCandidate, tableContext(0, { tsumo: false }))) {
      table.phase = 'ron';
      table.pendingRon = { tile: discard, from: seat, hand: playerCandidate };
      table.resumeSeat = seat + 1;
      renderTable();
      playSound('good');
      return;
    }

    for (let other = 1; other < 4; other++) {
      if (other === seat || table.hands[other].length !== 13) continue;
      const candidate = sortTiles([...table.hands[other], discard]);
      if (isWinning(candidate) && hasYaku(candidate, tableContext(other, { tsumo: false }))) {
        endBotRon(other, discard, seat);
        return;
      }
    }
    table.botNextSeat = seat + 1;
    await sleep(180);
    if (table.paused || token !== table.token) return;
  }
  table.turn = 0;
  table.phase = 'draw';
  table.pendingRon = null;
  renderTable();
}

function passRon() {
  const table = state.table;
  if (!table || table.phase !== 'ron') return;
  const nextSeat = table.resumeSeat;
  table.pendingRon = null;
  table.phase = 'busy';
  renderTable();
  if (nextSeat < 4) runBotsFrom(nextSeat, table.token);
  else { table.turn = 0; table.phase = 'draw'; renderTable(); }
}

function claimWin() {
  const table = state.table;
  if (!table || table.over) return;
  if (table.phase === 'ron' && table.pendingRon) {
    finishPlayerWin(table.pendingRon.hand, false, table.pendingRon.from);
    return;
  }
  if (table.phase === 'discard' && isWinning(table.hands[0]) && hasYaku(table.hands[0], tableContext(0, { tsumo: true }))) finishPlayerWin([...table.hands[0]], true, null);
}

function yakuMarkup(yaku) {
  const total = yaku.reduce((sum, item) => sum + item.han, 0);
  return `<div class="yaku-list">${yaku.map((item) => `<div class="yaku-row"><span>${item.name}</span><span>${item.han >= 13 ? 'якуман' : `${item.han} хан`}</span></div>`).join('')}<div class="yaku-row"><b>Всего яку</b><span>${total >= 13 ? 'якуман' : `${total} хан`}</span></div></div>`;
}

function finishPlayerWin(hand, tsumo, from) {
  const table = state.table;
  table.over = true; table.phase = 'over'; state.timerToken += 1;
  const yaku = detectClosedYaku(hand, tableContext(0, { tsumo }));
  storage.patch({ matches: storage.get('matches', 0) + 1, wins: storage.get('wins', 0) + 1 });
  renderTable();
  showResult({
    kicker: tsumo ? 'ЦУМО' : `РОН · С ${['ВОСТОКА','ЮГА','ЗАПАДА','СЕВЕРА'][from]}`,
    title: 'Рука закрыта.',
    copy: 'Стол показывает яку и хан, но намеренно не делает вид, что уже научил тебя полному расчёту фу и платежей.',
    extra: yakuMarkup(yaku),
    again: 'Новая раздача', onAgain: dealTable
  });
  playSound('good');
}

function botName(seat) { return ['Ты','Юг','Запад','Север'][seat]; }
function endBotTsumo(seat) {
  const table = state.table; table.over = true; table.phase = 'over'; state.timerToken += 1;
  storage.set('matches', storage.get('matches', 0) + 1);
  const yaku = detectClosedYaku(table.hands[seat], tableContext(seat, { tsumo: true }));
  showResult({ kicker:'ЦУМО СОПЕРНИКА', title:`${botName(seat)} закрывает руку.`, copy:'Посмотри на яку — поражение здесь тоже учебный материал.', extra:yakuMarkup(yaku), again:'Новая раздача', onAgain:dealTable });
}
function endBotRon(seat, discard, from) {
  const table = state.table; table.over = true; table.phase = 'over'; state.timerToken += 1;
  const hand = sortTiles([...table.hands[seat], discard]);
  storage.set('matches', storage.get('matches', 0) + 1);
  const yaku = detectClosedYaku(hand, tableContext(seat, { tsumo: false }));
  showResult({ kicker:`РОН · ${botName(seat)}`, title:'Сброс пойман.', copy:`${botName(seat)} выиграл на ${tileName(discard)} со сброса ${botName(from)}.`, extra:yakuMarkup(yaku), again:'Новая раздача', onAgain:dealTable });
}
function endExhaustiveDraw() {
  const table = state.table; table.over = true; table.phase='over'; state.timerToken += 1;
  storage.set('matches', storage.get('matches', 0) + 1);
  const tenpai = table.hands.map((hand) => shanten(hand) === 0);
  showResult({ kicker:'РЮ:КЁКУ', title:'Стена закончилась.', copy:`В тенпае: ${tenpai.map((ok,i) => ok ? botName(i) : null).filter(Boolean).join(', ') || 'никто'}.`, extra:'', again:'Новая раздача', onAgain:dealTable });
}

function showTableHint() {
  const table = state.table;
  if (!table || table.phase !== 'discard' || table.hands[0].length !== 14) {
    showCoach('Подсказка имеет смысл после добора, когда есть конкретный выбор из 14 костей.'); return;
  }
  const rows = tablePlayerAnalysis();
  const best = rows.filter((row) => row.best);
  showCoach(`<b>Сильные сбросы:</b> ${best.map((row) => `${tileCode(row.id)} (${row.shanten}-сянтэн, укеирэ ${row.ukeire})`).join(' · ')}. ${state.tableDifficulty === 'sharp' ? 'Ты сам попросил подсказку — штрафов нет, но запомни форму.' : ''}`);
  const hints = new Set(best.map((row) => row.id));
  for (const tile of ui.playerHand.querySelectorAll('[data-tile]')) tile.classList.toggle('is-hint', hints.has(Number(tile.dataset.tile)));
}

function renderCodex(tab) {
  for (const button of ui.codexTabs.querySelectorAll('button')) button.classList.toggle('is-active', button.dataset.tab === tab);
  ui.codex.innerHTML = CODEX[tab];
  for (const ref of ui.codex.querySelectorAll('[data-ref-tiles]')) ref.innerHTML = codes(ref.dataset.refTiles).map((id) => tileHtml(id)).join('');
}

function showResult({ kicker, title, copy, extra = '', again = 'Ещё раз', onAgain = null }) {
  ui.resultKicker.textContent = kicker;
  ui.resultTitle.textContent = title;
  ui.resultCopy.textContent = copy;
  ui.resultExtra.innerHTML = extra;
  ui.resultAgain.textContent = again;
  ui.resultAgain.onclick = () => { ui.modal.hidden = true; (onAgain || goHome)(); };
  ui.modal.hidden = false;
}

ui.close.addEventListener('click', closeApp);
ui.homeExit.addEventListener('click', closeApp);
ui.sound.addEventListener('click', () => {
  state.sound = !state.sound;
  storage.set('sound', state.sound);
  ui.sound.textContent = state.sound ? '♪' : '∅';
  ui.sound.setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
  playSound('tap');
});
ui.back.addEventListener('click', () => {
  if (state.view === 'lesson') setView('academy');
  else if (state.view === 'table') goHome();
  else if (state.view === 'table-setup' || state.view === 'academy' || state.view === 'drill' || state.view === 'codex') setView('home');
  else setView('home');
});

for (const button of $$('[data-open]')) button.addEventListener('click', () => {
  const target = button.dataset.open;
  if (target === 'table') setView('table-setup');
  else setView(target);
  playSound('tap');
});

ui.continueButton.addEventListener('click', () => {
  const { completed, drill } = progressStats();
  if (completed.length < LESSONS.length) { setView('academy'); openLesson(completed.length); }
  else if ((drill.attempts || 0) < 12) setView('drill');
  else setView('table-setup');
});

ui.lessonList.addEventListener('click', (event) => {
  const card = event.target.closest('[data-lesson]');
  if (!card || card.disabled) return;
  openLesson(Number(card.dataset.lesson));
});

ui.lessonStage.addEventListener('click', (event) => {
  const lesson = LESSONS[state.lessonIndex];
  const step = lesson.steps[state.lessonStep];
  if (state.lessonSolved || step.kind === 'intro') return;
  const choice = event.target.closest('[data-answer]');
  const tile = event.target.closest('[data-tile]');
  if (step.kind === 'choice' && choice) solveLesson(choice.dataset.answer === step.answer, step.explain, choice);
  if (step.kind === 'discard' && tile) solveLesson(tileCode(Number(tile.dataset.tile)) === step.answer, step.explain, tile);
  if (step.kind === 'wait' && choice) {
    choice.classList.toggle('is-correct');
    const value = choice.dataset.answer;
    if (state.lessonSelections.has(value)) state.lessonSelections.delete(value); else state.lessonSelections.add(value);
    const expected = new Set(step.answers);
    const exact = state.lessonSelections.size === expected.size && [...expected].every((item) => state.lessonSelections.has(item));
    if (exact) solveLesson(true, step.explain, null);
    else { ui.lessonFeedback.className='lesson-feedback'; ui.lessonFeedback.textContent='Можно выбрать несколько вариантов.'; }
  }
});
ui.lessonNext.addEventListener('click', () => {
  if (!state.lessonSolved) return;
  const lesson = LESSONS[state.lessonIndex];
  if (state.lessonStep < lesson.steps.length - 1) { state.lessonStep += 1; renderLesson(); }
  else completeLesson();
});

ui.drillDifficulty.addEventListener('click', cycleDrillDifficulty);
ui.drillHand.addEventListener('click', (event) => {
  const tile = event.target.closest('[data-tile]');
  if (!tile) return;
  resolveDrill(Number(tile.dataset.tile));
});
ui.nextDrill.addEventListener('click', startDrill);

ui.difficultyStack.addEventListener('click', (event) => {
  const card = event.target.closest('[data-difficulty]');
  if (!card) return;
  state.tableDifficulty = card.dataset.difficulty;
  storage.set('difficulty', state.tableDifficulty);
  renderTableSetup();
  playSound('tap');
});
ui.startTable.addEventListener('click', dealTable);
ui.draw.addEventListener('click', () => state.table?.phase === 'ron' ? passRon() : drawPlayer());
ui.riichi.addEventListener('click', toggleRiichi);
ui.win.addEventListener('click', claimWin);
ui.tableHint.addEventListener('click', showTableHint);
ui.pauseButton.addEventListener('click', openPause);
ui.playerHand.addEventListener('click', (event) => {
  const tile = event.target.closest('[data-tile]');
  if (tile) discardPlayer(Number(tile.dataset.tile));
});

ui.codexTabs.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (button) renderCodex(button.dataset.tab);
});
ui.resultHome.addEventListener('click', () => { ui.modal.hidden = true; setView('home'); });
ui.resultExit.addEventListener('click', closeApp);
ui.pauseExit.addEventListener('click', closeApp);
ui.pauseHome.addEventListener('click', abandonTableToHome);
ui.pauseResume.addEventListener('click', resumePause);

document.addEventListener('visibilitychange', () => {
  const table = state.table;
  if (!table || table.over) return;
  if (document.hidden && table.phase === 'busy') {
    table.paused = true;
    table.token = ++state.timerToken;
    state.autoPaused = true;
  } else if (!document.hidden && state.autoPaused) {
    state.autoPaused = false;
    table.paused = false;
    table.token = ++state.timerToken;
    runBotsFrom(table.botNextSeat || 1, table.token);
  }
});

createWorkshopMode({
  appName: 'KŌAN · Mahjong Dojo',
  version: '0.1.0',
  cachePrefix: 'mahjong-dojo-',
  storageNamespace: 'pocket-works:mahjong-dojo',
  onReset() {
    storage.reset();
    state.sound = true;
    state.drillDifficulty = 'club';
    state.tableDifficulty = 'club';
    state.table = null;
    setView('home');
  }
});
watchConnectivity((online) => { document.documentElement.dataset.network = online ? 'online' : 'offline'; });

ui.sound.textContent = state.sound ? '♪' : '∅';
setView('home');