import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import {
  AXES,
  CORE_QUESTIONS,
  HEROES,
  PRECISION_QUESTIONS,
  SNAPSHOT,
  buildPlayerProfile,
  choosePrecisionQuestion,
  rankHeroes,
  resultAnalysis
} from './engine.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:rivals-fit-lab:state:v1';
const CORE_COUNT = CORE_QUESTIONS.length;
const PRECISION_COUNT = 6;
const TOTAL = CORE_COUNT + PRECISION_COUNT;
const ROLE_RU = { Vanguard:'Авангард', Duelist:'Дуэлист', Strategist:'Стратег', Flex:'Флекс' };
const ROLE_CLASS = { Vanguard:'role-vanguard', Duelist:'role-duelist', Strategist:'role-strategist', Flex:'role-flex' };
const CHAPTERS = [
  { until:5, code:'01', title:'Ощущение боя' },
  { until:10, code:'02', title:'Контроль и нагрузка' },
  { until:15, code:'03', title:'Риск и автономность' },
  { until:20, code:'04', title:'Ответственность' },
  { until:26, code:'05', title:'Разрешение ничьих' }
];

const root = document.querySelector('[data-app-shell]');
const screen = document.querySelector('#screen');
const progress = document.querySelector('#progress');
const progressText = document.querySelector('#progressText');
const toast = document.querySelector('#toast');
let state = loadState();
let toastTimer = null;

function freshState(history = []) {
  return { phase:'intro', coreIndex:0, precisionAsked:[], answers:{}, history, viewingHistoryId:null, updatedAt:Date.now() };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return freshState();
    return {
      ...freshState(Array.isArray(raw.history) ? raw.history : []),
      ...raw,
      answers:raw.answers && typeof raw.answers === 'object' ? raw.answers : {},
      precisionAsked:Array.isArray(raw.precisionAsked) ? raw.precisionAsked : [],
      history:Array.isArray(raw.history) ? raw.history : [],
      viewingHistoryId:raw.viewingHistoryId || null
    };
  } catch {
    return freshState();
  }
}

function save() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function vibrate(pattern = 8) { navigator.vibrate?.(pattern); }
function answerCount() { return Object.keys(state.answers).length; }
function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
}

function setProgress(current, total = TOTAL) {
  const pct = Math.max(0, Math.min(100, (current / total) * 100));
  progress.style.setProperty('--progress', `${pct}%`);
  if (state.phase === 'intro') progressText.textContent = `${SNAPSHOT.heroCount} героев`;
  else if (state.phase === 'result' || state.phase === 'history-result') progressText.textContent = 'Профиль готов';
  else progressText.textContent = `${Math.min(current, total)} / ${total}`;
  root.dataset.phase = state.phase;
}

function chapterFor(questionNo) {
  return CHAPTERS.find(chapter => questionNo <= chapter.until) || CHAPTERS.at(-1);
}

function formatDate(timestamp) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { day:'2-digit', month:'short' }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

function startFresh() {
  state = freshState(state.history);
  state.phase = 'core';
  save();
  render();
}

function renderIntro() {
  state.phase = 'intro';
  state.viewingHistoryId = null;
  save();
  setProgress(0);
  const resumable = answerCount() > 0 && (state.coreIndex < CORE_COUNT || state.precisionAsked.filter(id => state.answers[id] != null).length < PRECISION_COUNT);
  const snapshots = state.history.filter(item => item?.answers && typeof item.answers === 'object').slice(0, 3);

  screen.innerHTML = `
    <section class="intro-layout enter">
      <div class="intro-copy">
        <p class="kicker">MARVEL RIVALS · HERO FIT INSTRUMENT</p>
        <h1>Не «кто имба».<br><span>Кто подходит тебе.</span></h1>
        <p class="lede">20 вопросов снимают твой игровой почерк, ещё 6 выбираются адаптивно между ближайшими кандидатами. Герои не видны до финала, чтобы не подгонять ответы под любимчиков.</p>
        <div class="spec-row" aria-label="Параметры теста">
          <div><strong>53</strong><span>героя</span></div>
          <div><strong>13</strong><span>осей</span></div>
          <div><strong>26</strong><span>ответов</span></div>
        </div>
        <div class="intro-actions">
          <button class="primary-action" id="startBtn" data-native-press>${resumable ? 'Продолжить тест' : 'Запустить калибровку'}</button>
          ${resumable ? '<button class="text-action" id="restartBtn" data-native-press>С нуля</button>' : ''}
        </div>
        <div class="method-strip" aria-label="Как работает тест">
          <span><b>01</b> широкий профиль</span>
          <i></i>
          <span><b>02</b> адаптивная докрутка</span>
          <i></i>
          <span><b>03</b> сравнение топа</span>
        </div>
      </div>
      <div class="scanner-board" aria-hidden="true">
        <div class="scanner-grid"></div>
        <div class="scanner-orbit orbit-a"></div>
        <div class="scanner-orbit orbit-b"></div>
        <div class="scanner-cross x"></div>
        <div class="scanner-cross y"></div>
        <div class="scanner-core"><b>13</b><span>signals</span></div>
        <div class="scanner-readout"><span>FIT ENGINE</span><strong>ADAPTIVE</strong><small>${SNAPSHOT.season}</small></div>
        ${Array.from({length:13},(_,i)=>`<i class="scan-tick" style="--i:${i}"></i>`).join('')}
      </div>
    </section>
    ${snapshots.length ? `
      <section class="history-strip enter">
        <div class="section-head compact"><div><span>ПОСЛЕДНИЕ КАЛИБРОВКИ</span><h2>Можно открыть старый результат</h2></div></div>
        <div class="history-tickets">
          ${snapshots.map(item => `<button class="history-ticket ${ROLE_CLASS[item.role] || ''}" data-history-id="${escapeHtml(item.id)}" data-native-press><span>${formatDate(item.at)}</span><strong>${escapeHtml(item.name)}</strong><b>${item.score}%</b></button>`).join('')}
        </div>
      </section>` : ''}
    <footer class="snapshot-note">Ростер: ${SNAPSHOT.season}, актуализирован ${SNAPSHOT.date}. Fit-score измеряет соответствие стилю, а не силу героя в текущем патче.</footer>`;

  document.querySelector('#startBtn').addEventListener('click', () => {
    if (!resumable) startFresh();
    else {
      state.phase = state.coreIndex < CORE_COUNT ? 'core' : 'precision';
      save();
      render();
    }
  });

  document.querySelector('#restartBtn')?.addEventListener('click', () => {
    if (confirm('Стереть текущие ответы и начать калибровку заново?')) startFresh();
  });

  document.querySelectorAll('[data-history-id]').forEach(button => button.addEventListener('click', () => {
    state.phase = 'history-result';
    state.viewingHistoryId = button.dataset.historyId;
    save();
    render();
  }));
}

function currentQuestionSafe() {
  if (state.phase === 'core') return CORE_QUESTIONS[state.coreIndex] || null;
  if (state.phase === 'precision') {
    const lastId = state.precisionAsked[state.precisionAsked.length - 1];
    if (lastId && state.answers[lastId] == null) return PRECISION_QUESTIONS.find(q => q.id === lastId) || null;
    const next = choosePrecisionQuestion(state.answers, state.precisionAsked);
    if (next) {
      state.precisionAsked.push(next.id);
      save();
      return next;
    }
  }
  return null;
}

function signalHtml() {
  const profile = buildPlayerProfile(state.answers);
  const ranking = rankHeroes(state.answers);
  const measured = Object.keys(AXES).filter(axis => (profile.weights[axis] || 0) >= 1).length;
  const gap = Math.max(0, (ranking[0]?.score || 0) - (ranking[3]?.score || ranking[0]?.score || 0));
  const strongest = Object.entries(profile.vector)
    .filter(([axis]) => (profile.weights[axis] || 0) >= 1)
    .sort((a,b) => Math.abs(b[1]-50) - Math.abs(a[1]-50))
    .slice(0, 4);

  return `
    <aside class="live-signal" aria-label="Текущий профиль без раскрытия героев">
      <div class="signal-head"><span>ЖИВАЯ СИГНАТУРА</span><b>${measured}/13 осей измерено</b></div>
      <div class="signal-axes">
        ${strongest.length ? strongest.map(([axis,value]) => `<div class="signal-axis"><span>${AXES[axis].label}</span><div><i style="left:${value}%"></i></div><b>${value}</b></div>`).join('') : '<p>После первых ответов здесь появятся выраженные черты — без имён героев.</p>'}
      </div>
      <div class="signal-foot"><span>Разрыв текущего топ-4</span><b>${gap} п.</b><small>имена скрыты до финала</small></div>
    </aside>`;
}

function answerLabel(value) {
  return [
    ['A','точно A'],
    ['A·','скорее A'],
    ['·','50 / 50'],
    ['·B','скорее B'],
    ['B','точно B']
  ][value];
}

function renderQuestion() {
  const question = currentQuestionSafe();
  if (!question) {
    finishTest();
    return;
  }

  const coreDone = Math.min(state.coreIndex, CORE_COUNT);
  const precisionAnswered = state.precisionAsked.filter(id => state.answers[id] != null).length;
  const currentNo = coreDone + precisionAnswered + 1;
  const precision = state.phase === 'precision';
  const chapter = chapterFor(currentNo);
  const chapterIndex = CHAPTERS.indexOf(chapter);
  setProgress(currentNo - 1);

  screen.innerHTML = `
    <section class="question-shell enter">
      <div class="chapter-rail" aria-label="Этап теста">
        ${CHAPTERS.map((item,index) => `<i class="${index < chapterIndex ? 'done' : index === chapterIndex ? 'active' : ''}"></i>`).join('')}
        <span>${chapter.code} · ${chapter.title}</span>
      </div>
      <div class="question-meta">
        <span>${precision ? 'АДАПТИВНАЯ ДОКРУТКА' : 'БАЗОВАЯ КАЛИБРОВКА'}</span>
        <b>${String(currentNo).padStart(2,'0')}</b>
      </div>
      <div class="question-copy">
        <p class="kicker">${escapeHtml(question.topic)}</p>
        <h2>${escapeHtml(question.prompt)}</h2>
      </div>
      <div class="answer-scale" role="group" aria-label="Шкала ответа от варианта A к варианту B">
        <div class="pole left-pole"><span>A</span>${escapeHtml(question.left)}</div>
        <div class="scale-buttons">
          ${[0,1,2,3,4].map(value => {
            const [symbol,label] = answerLabel(value);
            return `<button type="button" class="scale-choice ${value===2?'neutral':''}" data-answer="${value}" data-native-press aria-label="${label}"><span>${symbol}</span><small>${label}</small></button>`;
          }).join('')}
        </div>
        <div class="pole right-pole"><span>B</span>${escapeHtml(question.right)}</div>
      </div>
      <div class="question-foot">
        <button type="button" class="back-question" id="backQuestionBtn" data-native-press ${canGoBack() ? '' : 'disabled'}>← Назад</button>
        <span>${precision ? 'Этот вопрос выбран потому, что текущие лидеры расходятся именно здесь.' : 'Отвечай про себя, не про конкретного героя.'}</span>
      </div>
      ${signalHtml()}
    </section>`;

  document.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => submitAnswer(question, Number(button.dataset.answer), button)));
  document.querySelector('#backQuestionBtn').addEventListener('click', goBack);
}

function canGoBack() { return answerCount() > 0; }

function submitAnswer(question, value, button) {
  if (button.disabled) return;
  document.querySelectorAll('[data-answer]').forEach(item => { item.disabled = true; });
  button.classList.add('selected');
  state.answers[question.id] = value;
  if (state.phase === 'core') state.coreIndex += 1;
  save();
  vibrate([7, 18, 10]);

  setTimeout(() => {
    if (state.phase === 'core' && state.coreIndex >= CORE_COUNT) state.phase = 'precision';
    const precisionAnswered = state.precisionAsked.filter(id => state.answers[id] != null).length;
    if (state.phase === 'precision' && precisionAnswered >= PRECISION_COUNT) finishTest();
    else renderQuestion();
  }, reducedMotion() ? 0 : 130);
}

function goBack() {
  if (!canGoBack()) return;

  if (state.phase === 'precision') {
    const lastAsked = state.precisionAsked.at(-1);
    if (lastAsked && state.answers[lastAsked] == null) state.precisionAsked.pop();
    const answered = state.precisionAsked.filter(id => state.answers[id] != null);
    const lastAnswered = answered.at(-1);
    if (lastAnswered) {
      delete state.answers[lastAnswered];
      state.precisionAsked = state.precisionAsked.slice(0, state.precisionAsked.indexOf(lastAnswered) + 1);
    } else {
      state.phase = 'core';
      state.coreIndex = Math.max(0, CORE_COUNT - 1);
      delete state.answers[CORE_QUESTIONS[state.coreIndex].id];
    }
  } else {
    state.coreIndex = Math.max(0, state.coreIndex - 1);
    delete state.answers[CORE_QUESTIONS[state.coreIndex].id];
  }

  save();
  renderQuestion();
}

function snapshotResult(analysis) {
  return {
    id:`result-${Date.now()}`,
    name:analysis.top.hero.name,
    role:analysis.top.hero.role,
    score:analysis.top.score,
    confidence:analysis.confidence,
    at:Date.now(),
    answers:{ ...state.answers }
  };
}

function finishTest() {
  state.phase = 'result';
  state.viewingHistoryId = null;
  const analysis = resultAnalysis(state.answers);
  state.history.unshift(snapshotResult(analysis));
  state.history = state.history.slice(0, 6);
  save();
  renderResult(analysis, { historical:false });
}

function axisPhrase(row, match = true) {
  const meta = AXES[row.axis];
  const side = row.player >= 50 ? meta.high : meta.low;
  if (match) return `${meta.label.toLowerCase()}: тебе близко «${side}», и герой требует примерно того же.`;
  const heroSide = row.hero >= 50 ? meta.high : meta.low;
  return `${meta.label}: ты ближе к «${side}», а герой заметно тянет в «${heroSide}».`;
}

function roleBestHtml(item) {
  return `<button class="role-pick ${ROLE_CLASS[item.hero.role]}" data-compare-hero="${item.hero.id}" data-native-press><span>${ROLE_RU[item.hero.role]}</span><strong>${escapeHtml(item.hero.name)}</strong><b>${item.score}%</b><small>сравнить →</small></button>`;
}

function comparisonRows(analysis, candidate) {
  const winner = analysis.top.hero;
  return Object.keys(AXES).map(axis => {
    const player = analysis.player.vector[axis];
    const winnerDelta = Math.abs(player - winner.vector[axis]);
    const candidateDelta = Math.abs(player - candidate.hero.vector[axis]);
    return { axis, winnerDelta, candidateDelta, edge:candidateDelta - winnerDelta };
  }).sort((a,b) => Math.abs(b.edge) - Math.abs(a.edge)).slice(0, 5);
}

function renderComparisonPanel(analysis, candidate) {
  const panel = document.querySelector('#comparePanel');
  if (!panel || !candidate) return;
  const rows = comparisonRows(analysis, candidate);
  panel.innerHTML = `
    <div class="compare-title"><div><span>ПОЧЕМУ НЕ ${escapeHtml(candidate.hero.name.toUpperCase())}</span><h3>${escapeHtml(analysis.top.hero.name)} vs ${escapeHtml(candidate.hero.name)}</h3></div><b>${analysis.top.score - candidate.score >= 0 ? '+' : ''}${analysis.top.score - candidate.score} п.</b></div>
    <div class="compare-table">
      ${rows.map(row => {
        const winnerCloser = row.winnerDelta <= row.candidateDelta;
        return `<div class="compare-row"><span>${AXES[row.axis].label}</span><b class="${winnerCloser?'wins':''}">${Math.round(row.winnerDelta)} Δ</b><i></i><b class="${winnerCloser?'':'wins'}">${Math.round(row.candidateDelta)} Δ</b><small>${winnerCloser ? 'победитель ближе' : 'альтернатива ближе'}</small></div>`;
      }).join('')}
    </div>`;
  document.querySelectorAll('[data-compare-hero]').forEach(button => button.classList.toggle('selected', button.dataset.compareHero === candidate.hero.id));
}

function trialPlanHtml(analysis) {
  const strongest = analysis.strengths[0];
  const conflict = analysis.conflicts[0];
  const runnerUp = analysis.ranking[1];
  const strongMeta = AXES[strongest.axis];
  const conflictMeta = AXES[conflict.axis];
  const strongSide = strongest.player >= 50 ? strongMeta.high : strongMeta.low;
  const conflictSide = conflict.player >= 50 ? conflictMeta.high : conflictMeta.low;
  return `
    <section class="trial-protocol">
      <div class="section-head"><div><span>ПРОВЕРКА В РЕАЛЬНОЙ ИГРЕ</span><h2>Протокол на 3 матча</h2></div></div>
      <ol>
        <li><b>01</b><div><strong>Играй естественно</strong><p>Ничего специально не форси. Проверь, возникает ли ощущение «руки сами понимают, что делать».</p></div></li>
        <li><b>02</b><div><strong>Проверь сильную сторону</strong><p>Сознательно используй «${escapeHtml(strongSide)}» — это одна из причин, почему герой оказался первым.</p></div></li>
        <li><b>03</b><div><strong>Проверь слабое место</strong><p>Следи за «${escapeHtml(conflictSide)}». Если именно это стабильно бесит, сравни следующий матч с ${escapeHtml(runnerUp?.hero.name || 'кандидатом №2')}.</p></div></li>
      </ol>
    </section>`;
}

function resultSource() {
  if (state.phase === 'history-result') {
    const item = state.history.find(entry => entry.id === state.viewingHistoryId);
    if (item?.answers) return { answers:item.answers, historical:true, item };
    state.phase = 'intro';
    state.viewingHistoryId = null;
    save();
    return null;
  }
  return { answers:state.answers, historical:false, item:null };
}

function renderResult(analysis = resultAnalysis(state.answers), options = {}) {
  setProgress(TOTAL);
  const { top, ranking, strengths, conflicts, roleBest, confidence, player } = analysis;
  const historical = Boolean(options.historical);
  const initials = top.hero.name.split(/\s|&/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase();
  const topAxes = [...Object.entries(player.vector)].sort((a,b) => Math.abs(b[1]-50)-Math.abs(a[1]-50)).slice(0,6);
  const runnerUp = ranking[1];
  const margin = Math.max(0, top.score - (runnerUp?.score ?? top.score));
  const shareSupported = Boolean(navigator.share || navigator.clipboard?.writeText);

  screen.innerHTML = `
    <section class="result-hero ${ROLE_CLASS[top.hero.role]} enter">
      <div class="result-id"><span>MATCH / 01</span><b>${initials}</b><small>${ROLE_RU[top.hero.role]}</small></div>
      <div class="result-main">
        <p class="kicker">${historical ? 'СОХРАНЁННАЯ КАЛИБРОВКА' : 'ТВОЙ САМЫЙ ЕСТЕСТВЕННЫЙ МАТЧ'}</p>
        <h1>${escapeHtml(top.hero.name)}</h1>
        <div class="result-sub"><span>${ROLE_RU[top.hero.role]} · ${escapeHtml(top.hero.archetype)}</span><strong>${top.score}% fit</strong></div>
        <p>Победитель ближе всего к твоему профилю по дистанции, темпу, риску, механике и командной ответственности. Мета намеренно не даёт бонуса.</p>
      </div>
      <div class="fit-dial" style="--score:${top.score};--role-color:var(--role-color)"><div><strong>${top.score}</strong><span>FIT</span></div></div>
      <div class="confidence"><span>Уверенность</span><strong>${confidence}%</strong><small>отрыв от №2: ${margin} п.</small></div>
    </section>

    <section class="podium-section enter">
      <div class="section-head"><div><span>ФИНАЛИСТЫ</span><h2>Тройка, между которой решал тест</h2></div><small>нажми на альтернативу</small></div>
      <div class="podium-grid">
        ${ranking.slice(0,3).map((item,index) => `<button class="podium-pick ${ROLE_CLASS[item.hero.role]} ${index===1?'selected':''}" data-compare-hero="${item.hero.id}" data-native-press><span>#${index+1}</span><strong>${escapeHtml(item.hero.name)}</strong><b>${item.score}%</b><small>${ROLE_RU[item.hero.role]}</small></button>`).join('')}
      </div>
      <div id="comparePanel" class="compare-panel"></div>
    </section>

    <section class="evidence-grid enter">
      <div class="evidence-block good"><div class="section-label">ПОЧЕМУ СХОДИТСЯ</div>${strengths.map((row,i) => `<p><b>0${i+1}</b>${escapeHtml(axisPhrase(row,true))}</p>`).join('')}</div>
      <div class="evidence-block risk"><div class="section-label">ГДЕ МОЖЕТ БЕСИТЬ</div>${conflicts.map((row,i) => `<p><b>0${i+1}</b>${escapeHtml(axisPhrase(row,false))}</p>`).join('')}</div>
    </section>

    <section class="profile-strip enter">
      <div class="section-head"><div><span>ТВОЙ ПОЧЕРК</span><h2>Самые выраженные черты</h2></div></div>
      <div class="axis-list">${topAxes.map(([axis,value]) => `<div class="axis-row"><span>${AXES[axis].label}</span><div class="axis-track"><i style="width:${value}%"></i><em style="left:${value}%"></em></div><b>${value}</b></div>`).join('')}</div>
    </section>

    <section class="role-alts enter">
      <div class="section-head"><div><span>ЕСЛИ НУЖНА ДРУГАЯ РОЛЬ</span><h2>Лучший матч в каждой роли</h2></div><small>тоже можно сравнить</small></div>
      <div class="role-grid">${roleBest.map(roleBestHtml).join('')}</div>
    </section>

    ${trialPlanHtml(analysis)}

    <section class="ranking-section enter">
      <div class="section-head"><div><span>ПОЛНЫЙ ШОРТ-ЛИСТ</span><h2>Топ-10 кандидатов</h2></div><button id="toggleRankBtn" data-native-press>Показать 10</button></div>
      <div class="ranking-list collapsed" id="rankingList">${ranking.slice(0,10).map((item,index) => `<button class="rank-row ${index===0?'winner':''}" data-compare-hero="${item.hero.id}" data-native-press><b>${String(index+1).padStart(2,'0')}</b><span>${escapeHtml(item.hero.name)}<small>${ROLE_RU[item.hero.role]} · ${escapeHtml(item.hero.archetype)}</small></span><strong>${item.score}%</strong></button>`).join('')}</div>
    </section>

    <div class="result-actions enter">
      ${historical ? '<button class="primary-action" id="homeBtn" data-native-press>Вернуться к текущему тесту</button>' : '<button class="primary-action" id="precisionBtn" data-native-press>Перекалибровать последние 6</button>'}
      ${historical ? '' : '<button class="text-action" id="restartResultBtn" data-native-press>Полный тест заново</button>'}
      ${shareSupported ? '<button class="text-action" id="shareBtn" data-native-press>Поделиться результатом</button>' : ''}
      ${historical ? '' : '<button class="text-action" id="homeBtn" data-native-press>На старт</button>'}
    </div>
    <footer class="snapshot-note">Профили основаны на роли и стиле наборов способностей. Fit-score — инструмент выбора мейна, а не прогноз винрейта.</footer>`;

  const lookup = new Map(ranking.map(item => [item.hero.id, item]));
  const initialCandidate = ranking[1] || ranking[0];
  renderComparisonPanel(analysis, initialCandidate);

  document.querySelectorAll('[data-compare-hero]').forEach(button => button.addEventListener('click', () => {
    const item = lookup.get(button.dataset.compareHero);
    if (!item) return;
    if (item.hero.id === top.hero.id) {
      showToast('Это победитель — выбери альтернативу для сравнения');
      return;
    }
    renderComparisonPanel(analysis, item);
    document.querySelector('#comparePanel')?.scrollIntoView({ behavior:reducedMotion() ? 'auto' : 'smooth', block:'nearest' });
    vibrate(6);
  }));

  const list = document.querySelector('#rankingList');
  document.querySelector('#toggleRankBtn').addEventListener('click', event => {
    const open = list.classList.toggle('collapsed') === false;
    event.currentTarget.textContent = open ? 'Скрыть' : 'Показать 10';
  });

  document.querySelector('#precisionBtn')?.addEventListener('click', recalibratePrecision);
  document.querySelector('#restartResultBtn')?.addEventListener('click', () => {
    if (confirm('Начать новый полный тест? Последний результат останется в истории.')) startFresh();
  });
  document.querySelector('#homeBtn')?.addEventListener('click', () => {
    state.phase = 'intro';
    state.viewingHistoryId = null;
    save();
    renderIntro();
  });
  document.querySelector('#shareBtn')?.addEventListener('click', () => shareResult(analysis));
}

function recalibratePrecision() {
  const precisionIds = new Set(PRECISION_QUESTIONS.map(question => question.id));
  for (const id of Object.keys(state.answers)) if (precisionIds.has(id)) delete state.answers[id];
  state.precisionAsked = [];
  state.coreIndex = CORE_COUNT;
  state.phase = 'precision';
  state.viewingHistoryId = null;
  save();
  showToast('База сохранена — докручиваем только финал');
  renderQuestion();
}

async function shareResult(analysis) {
  const text = `Rivals Fit Lab: мой лучший матч — ${analysis.top.hero.name} (${analysis.top.score}% fit). №2: ${analysis.ranking[1]?.hero.name || '—'}.`;
  try {
    if (navigator.share) {
      await navigator.share({ title:'Rivals Fit Lab', text });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Результат скопирован');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Не получилось поделиться');
  }
}

function render() {
  if (state.phase === 'intro') return renderIntro();
  if (state.phase === 'core' || state.phase === 'precision') return renderQuestion();
  if (state.phase === 'result') return renderResult(resultAnalysis(state.answers), { historical:false });
  if (state.phase === 'history-result') {
    const source = resultSource();
    if (!source) return renderIntro();
    return renderResult(resultAnalysis(source.answers), { historical:true });
  }
  state.phase = 'intro';
  save();
  renderIntro();
}

window.addEventListener('keydown', event => {
  if (!(state.phase === 'core' || state.phase === 'precision')) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (/^[1-5]$/.test(event.key)) document.querySelector(`[data-answer="${Number(event.key)-1}"]`)?.click();
  if (event.key === 'ArrowLeft' && canGoBack()) document.querySelector('#backQuestionBtn')?.click();
});

document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
