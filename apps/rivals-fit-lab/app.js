import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { AXES, CORE_QUESTIONS, HEROES, PRECISION_QUESTIONS, SNAPSHOT, choosePrecisionQuestion, resultAnalysis } from './engine.js';
installMobileRuntime();

const STORAGE_KEY = 'pocket-works:rivals-fit-lab:state:v1';
const CORE_COUNT = CORE_QUESTIONS.length;
const PRECISION_COUNT = 6;
const TOTAL = CORE_COUNT + PRECISION_COUNT;
const ROLE_RU = { Vanguard:'Авангард', Duelist:'Дуэлист', Strategist:'Стратег', Flex:'Флекс' };
const ROLE_CLASS = { Vanguard:'role-vanguard', Duelist:'role-duelist', Strategist:'role-strategist', Flex:'role-flex' };

const root = document.querySelector('[data-app-shell]');
const screen = document.querySelector('#screen');
const progress = document.querySelector('#progress');
const progressText = document.querySelector('#progressText');
const toast = document.querySelector('#toast');
let state = loadState();
let toastTimer = null;

function freshState(){ return { phase:'intro', coreIndex:0, precisionAsked:[], answers:{}, history:[], updatedAt:Date.now() }; }
function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return freshState();
    return { ...freshState(), ...raw, answers:raw.answers && typeof raw.answers==='object' ? raw.answers : {}, precisionAsked:Array.isArray(raw.precisionAsked)?raw.precisionAsked:[], history:Array.isArray(raw.history)?raw.history:[] };
  } catch { return freshState(); }
}
function save(){ state.updatedAt=Date.now(); localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function escapeHtml(value){ return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function vibrate(pattern=8){ navigator.vibrate?.(pattern); }
function showToast(message){ toast.textContent=message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),1500); }
function answerCount(){ return Object.keys(state.answers).length; }

function setProgress(current,total=TOTAL){
  const pct = Math.max(0,Math.min(100,(current/total)*100));
  progress.style.setProperty('--progress',`${pct}%`);
  progressText.textContent = current ? `${Math.min(current,total)} / ${total}` : `${SNAPSHOT.heroCount} героев`;
  root.dataset.phase = state.phase;
}

function renderIntro(){
  state.phase='intro'; save(); setProgress(0);
  const resume = answerCount() > 0 && (state.coreIndex < CORE_COUNT || state.precisionAsked.length < PRECISION_COUNT);
  const last = state.history[0];
  screen.innerHTML = `
    <section class="intro-layout">
      <div class="intro-copy">
        <p class="kicker">MARVEL RIVALS · PLAYSTYLE PROFILER</p>
        <h1>Найди героя,<br><span>который играет как ты.</span></h1>
        <p class="lede">26 ответов строят профиль по 13 параметрам. Последние 6 вопросов выбираются по твоим текущим кандидатам — чтобы добить ничьи, а не задавать случайную психологическую хуйню про любимый цвет.</p>
        <div class="spec-row" aria-label="Параметры теста">
          <div><strong>53</strong><span>героя</span></div><div><strong>13</strong><span>осей</span></div><div><strong>6</strong><span>адаптивных</span></div>
        </div>
        <div class="intro-actions">
          <button class="primary-action" id="startBtn" data-native-press>${resume?'Продолжить калибровку':'Начать точный тест'}</button>
          ${resume?'<button class="text-action" id="restartBtn" data-native-press>Начать заново</button>':''}
        </div>
      </div>
      <div class="calibration-poster" aria-hidden="true">
        <div class="poster-grid"></div>
        <div class="poster-axis a1"><span>AIM</span><b></b></div>
        <div class="poster-axis a2"><span>MOVE</span><b></b></div>
        <div class="poster-axis a3"><span>TEAM</span><b></b></div>
        <div class="poster-axis a4"><span>RISK</span><b></b></div>
        <div class="poster-stamp">FIT<br>LAB</div>
      </div>
    </section>
    ${last ? `<section class="last-result"><span>ПОСЛЕДНИЙ РЕЗУЛЬТАТ</span><strong>${escapeHtml(last.name)}</strong><button id="lastResultBtn" data-native-press>Открыть →</button></section>`:''}
    <footer class="snapshot-note">Ростер: ${SNAPSHOT.season}, актуализирован ${SNAPSHOT.date}. Результат — профиль игрового стиля, а не обещание винрейта.</footer>`;

  document.querySelector('#startBtn').addEventListener('click',()=>{
    if (!resume) state = { ...freshState(), phase:'core' };
    else state.phase = state.coreIndex < CORE_COUNT ? 'core' : 'precision';
    save(); render();
  });
  document.querySelector('#restartBtn')?.addEventListener('click',()=>restart(true));
  document.querySelector('#lastResultBtn')?.addEventListener('click',()=>{ state.phase='result'; render(); });
}

function currentQuestionSafe(){
  if(state.phase==='core') return CORE_QUESTIONS[state.coreIndex] || null;
  if(state.phase==='precision'){
    const lastId=state.precisionAsked[state.precisionAsked.length-1];
    if(lastId && state.answers[lastId]==null) return PRECISION_QUESTIONS.find(q=>q.id===lastId) || null;
    const next=choosePrecisionQuestion(state.answers,state.precisionAsked);
    if(next){ state.precisionAsked.push(next.id); save(); return next; }
  }
  return null;
}

function renderQuestion(){
  const question = currentQuestionSafe();
  if (!question) { finishTest(); return; }
  const coreDone = Math.min(state.coreIndex,CORE_COUNT);
  const precisionAnswered = state.precisionAsked.filter(id=>state.answers[id]!=null).length;
  const currentNo = coreDone + precisionAnswered + 1;
  setProgress(currentNo-1);
  const precision = state.phase==='precision';
  screen.innerHTML = `
    <section class="question-shell">
      <div class="question-meta">
        <span>${precision?'ТОЧНАЯ ДОКРУТКА':'БАЗОВАЯ КАЛИБРОВКА'}</span>
        <b>${String(currentNo).padStart(2,'0')}</b>
      </div>
      <div class="question-copy">
        <p class="kicker">${escapeHtml(question.topic)}</p>
        <h2>${escapeHtml(question.prompt)}</h2>
      </div>
      <div class="answer-scale" role="group" aria-label="Шкала ответа от левого варианта к правому">
        <div class="pole left-pole">${escapeHtml(question.left)}</div>
        <div class="scale-buttons">
          ${[0,1,2,3,4].map(value=>`<button type="button" class="scale-choice ${value===2?'neutral':''}" data-answer="${value}" data-native-press aria-label="${value+1} из 5"><span>${value===0?'A':value===4?'B':value===2?'·':''}</span></button>`).join('')}
        </div>
        <div class="pole right-pole">${escapeHtml(question.right)}</div>
      </div>
      <div class="question-foot">
        <button type="button" class="back-question" id="backQuestionBtn" data-native-press ${canGoBack()?'':'disabled'}>← Назад</button>
        <span>${precision?'Вопрос выбран по текущему топу':'Не думай о конкретном герое — отвечай про ощущения'}</span>
      </div>
    </section>`;
  document.querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>submitAnswer(question,Number(btn.dataset.answer),btn)));
  document.querySelector('#backQuestionBtn').addEventListener('click',goBack);
}

function canGoBack(){ return answerCount()>0; }
function submitAnswer(question,value,button){
  if(button.disabled) return;
  document.querySelectorAll('[data-answer]').forEach(x=>x.disabled=true);
  button.classList.add('selected');
  state.answers[question.id]=value;
  if(state.phase==='core') state.coreIndex += 1;
  save(); vibrate(10);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(()=>{
    if(state.phase==='core' && state.coreIndex>=CORE_COUNT) state.phase='precision';
    const precisionAnswered=state.precisionAsked.filter(id=>state.answers[id]!=null).length;
    if(state.phase==='precision' && precisionAnswered>=PRECISION_COUNT) finishTest();
    else renderQuestion();
  },reduced?0:170);
}

function goBack(){
  if(!canGoBack()) return;
  if(state.phase==='precision'){
    const answered=state.precisionAsked.filter(id=>state.answers[id]!=null);
    const last=answered[answered.length-1];
    if(last){ delete state.answers[last]; state.precisionAsked=state.precisionAsked.slice(0,state.precisionAsked.indexOf(last)+1); }
    else if(state.precisionAsked.length){ state.precisionAsked.pop(); state.phase='core'; state.coreIndex=Math.max(0,CORE_COUNT-1); delete state.answers[CORE_QUESTIONS[state.coreIndex].id]; }
  } else {
    state.coreIndex=Math.max(0,state.coreIndex-1);
    delete state.answers[CORE_QUESTIONS[state.coreIndex].id];
  }
  save(); renderQuestion();
}

function finishTest(){
  state.phase='result';
  const analysis=resultAnalysis(state.answers);
  state.history.unshift({name:analysis.top.hero.name,score:analysis.top.score,at:Date.now()});
  state.history=state.history.slice(0,5);
  save(); renderResult(analysis);
}

function axisPhrase(row,match=true){
  const meta=AXES[row.axis];
  const side=row.player>=50?meta.high:meta.low;
  if(match) return `${meta.label.toLowerCase()}: тебе близко «${side}», и герой требует примерно того же.`;
  const heroSide=row.hero>=50?meta.high:meta.low;
  return `${meta.label}: ты ближе к «${side}», а герой заметно тянет в «${heroSide}».`;
}

function roleBestHtml(item){
  return `<div class="role-pick ${ROLE_CLASS[item.hero.role]}"><span>${ROLE_RU[item.hero.role]}</span><strong>${escapeHtml(item.hero.name)}</strong><b>${item.score}%</b></div>`;
}

function renderResult(analysis=resultAnalysis(state.answers)){
  setProgress(TOTAL);
  const {top,ranking,strengths,conflicts,roleBest,confidence,player}=analysis;
  const initials=top.hero.name.split(/\s|&/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const topAxes=[...Object.entries(player.vector)].sort((a,b)=>Math.abs(b[1]-50)-Math.abs(a[1]-50)).slice(0,6);
  screen.innerHTML=`
    <section class="result-hero ${ROLE_CLASS[top.hero.role]}">
      <div class="result-id"><span>MATCH / 01</span><b>${initials}</b></div>
      <div class="result-main">
        <p class="kicker">ТВОЙ САМЫЙ ЕСТЕСТВЕННЫЙ МАТЧ</p>
        <h1>${escapeHtml(top.hero.name)}</h1>
        <div class="result-sub"><span>${ROLE_RU[top.hero.role]} · ${escapeHtml(top.hero.archetype)}</span><strong>${top.score}% fit</strong></div>
        <p>Это не «самый сильный герой патча». Это герой, чьи требования к дистанции, темпу, риску и ответственности ближе всего к твоим ответам среди текущих ${HEROES.length}.</p>
      </div>
      <div class="confidence"><span>Уверенность профиля</span><strong>${confidence}%</strong><small>зависит от полноты ответов и разрыва между лидерами</small></div>
    </section>

    <section class="evidence-grid">
      <div class="evidence-block good"><div class="section-label">ПОЧЕМУ СХОДИТСЯ</div>${strengths.map((row,i)=>`<p><b>0${i+1}</b>${escapeHtml(axisPhrase(row,true))}</p>`).join('')}</div>
      <div class="evidence-block risk"><div class="section-label">ГДЕ МОЖЕТ БЕСИТЬ</div>${conflicts.map((row,i)=>`<p><b>0${i+1}</b>${escapeHtml(axisPhrase(row,false))}</p>`).join('')}</div>
    </section>

    <section class="profile-strip">
      <div class="section-head"><div><span>ТВОЙ ПОЧЕРК</span><h2>Шесть самых выраженных черт</h2></div></div>
      <div class="axis-list">${topAxes.map(([axis,value])=>`<div class="axis-row"><span>${AXES[axis].label}</span><div class="axis-track"><i style="width:${value}%"></i><em style="left:${value}%"></em></div><b>${value}</b></div>`).join('')}</div>
    </section>

    <section class="role-alts">
      <div class="section-head"><div><span>ЕСЛИ НУЖНА КОНКРЕТНАЯ РОЛЬ</span><h2>Лучший матч в каждой роли</h2></div></div>
      <div class="role-grid">${roleBest.map(roleBestHtml).join('')}</div>
    </section>

    <section class="ranking-section">
      <div class="section-head"><div><span>БЛИЖАЙШИЕ СОСЕДИ</span><h2>Топ-10 кандидатов</h2></div><button id="toggleRankBtn" data-native-press>Показать 10</button></div>
      <div class="ranking-list collapsed" id="rankingList">${ranking.slice(0,10).map((item,index)=>`<div class="rank-row ${index===0?'winner':''}"><b>${String(index+1).padStart(2,'0')}</b><span>${escapeHtml(item.hero.name)}<small>${ROLE_RU[item.hero.role]} · ${escapeHtml(item.hero.archetype)}</small></span><strong>${item.score}%</strong></div>`).join('')}</div>
    </section>

    <div class="result-actions"><button class="primary-action" id="restartResultBtn" data-native-press>Пройти заново</button><button class="text-action" id="homeBtn" data-native-press>На стартовый экран</button></div>
    <footer class="snapshot-note">Профили героев основаны на роли и фактическом стиле их наборов способностей; мета и баланс намеренно не дают бонуса к fit-score.</footer>`;

  const list=document.querySelector('#rankingList');
  document.querySelector('#toggleRankBtn').addEventListener('click',e=>{ const open=list.classList.toggle('collapsed')===false; e.currentTarget.textContent=open?'Скрыть':'Показать 10'; });
  document.querySelector('#restartResultBtn').addEventListener('click',()=>restart(true));
  document.querySelector('#homeBtn').addEventListener('click',()=>{state.phase='intro';save();renderIntro();});
}

function restart(confirmFirst=false){
  if(confirmFirst && answerCount()>0 && !window.confirm('Сбросить ответы и начать тест заново?')) return;
  state={...freshState(),phase:'core'}; save(); renderQuestion(); showToast('Профиль сброшен');
}

function render(){ if(state.phase==='intro')renderIntro(); else if(state.phase==='result')renderResult(); else renderQuestion(); }

window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
render();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
