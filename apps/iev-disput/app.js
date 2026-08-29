import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { QUIZ_1 } from './quiz-1.js';
import { QUIZ_2 } from './quiz-2.js';
import { QUIZ_3 } from './quiz-3.js';
const QUESTIONS=[...QUIZ_1,...QUIZ_2,...QUIZ_3];
import { loadSourceSections } from './source-loader.js';

installMobileRuntime();

const STORAGE_KEY='pocket-works:iev-disput:trainer:v2';
const $=s=>document.querySelector(s);
const workbench=$('#workbench');
const accuracyEl=$('#accuracyValue');
const tabs=[...document.querySelectorAll('[data-tab]')];
const toastEl=$('#toast');

const defaultState={
  tab:'trainer',
  trainerMode:'mixed',
  trainerLength:10,
  stats:{},
  completedSessions:0,
  bestCommission:0,
  lastCommission:null,
  session:null
};

let state=load();
let sourceSections=[];
let sourceLoading=true;
let toastTimer=null;

function cloneDefault(){return JSON.parse(JSON.stringify(defaultState))}
function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!raw||typeof raw!=='object') return cloneDefault();
    return {...cloneDefault(),...raw,stats:raw.stats&&typeof raw.stats==='object'?raw.stats:{},session:validSession(raw.session)?raw.session:null};
  }catch{return cloneDefault()}
}
function validSession(s){return s&&typeof s==='object'&&Array.isArray(s.items)&&Number.isInteger(s.index)&&s.index>=0}
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}
  renderAccuracy();
}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function shuffle(list){
  const a=[...list];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function overall(){
  const stats=Object.values(state.stats);
  const seen=stats.reduce((n,x)=>n+(x.seen||0),0);
  const correct=stats.reduce((n,x)=>n+(x.correct||0),0);
  return {seen,correct,accuracy:seen?Math.round(correct/seen*100):0};
}
function renderAccuracy(){accuracyEl.textContent=`${overall().accuracy}%`}
function toast(msg){
  clearTimeout(toastTimer);
  toastEl.textContent=msg;toastEl.hidden=false;
  toastTimer=setTimeout(()=>toastEl.hidden=true,1500);
}
function haptic(pattern=18){if(navigator.vibrate) navigator.vibrate(pattern)}
function questionById(id){return QUESTIONS.find(q=>q.id===id)}

function setTab(tab){
  if(state.session&&!state.session.finished&&state.session.type==='trainer'&&tab!=='trainer'){
    state.session=null;
  }
  state.tab=tab;save();render();
}
function render(){
  tabs.forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  if(state.tab==='trainer') renderTrainer();
  else if(state.tab==='mistakes') renderMistakes();
  else if(state.tab==='commission') renderCommission();
  else renderNotes();
  workbench.scrollTop=0;
}

function modePool(mode){
  if(mode==='base') return QUESTIONS.filter(q=>q.level<=2);
  if(mode==='hard') return QUESTIONS.filter(q=>q.level===3);
  if(mode==='weak'){
    const weakIds=Object.entries(state.stats)
      .filter(([,s])=>(s.wrong||0)>0 && ((s.correct||0)/(s.seen||1))<.75)
      .map(([id])=>id);
    return weakIds.length?QUESTIONS.filter(q=>weakIds.includes(q.id)):QUESTIONS.filter(q=>q.level>=2);
  }
  return QUESTIONS;
}
function buildItems(pool,count){
  const chosen=[];
  let bag=shuffle(pool);
  while(chosen.length<count && bag.length){
    chosen.push(bag.shift());
  }
  if(chosen.length<count){
    const refill=shuffle(pool);
    while(chosen.length<count && refill.length) chosen.push(refill.shift());
  }
  return chosen.map(q=>({
    id:q.id,
    options:shuffle([q.correct,...q.distractors]),
    selected:null,
    answered:false
  }));
}
function startTrainer(mode=state.trainerMode,length=state.trainerLength){
  const pool=modePool(mode);
  const count=Math.min(Number(length)||10,pool.length||QUESTIONS.length);
  state.session={type:'trainer',mode,length:count,index:0,items:buildItems(pool,count),finished:false,startedAt:Date.now()};
  state.tab='trainer';save();renderTrainer();haptic([18,30,18]);
}
function startCommission(){
  const pool=QUESTIONS.filter(q=>q.level>=2);
  state.session={type:'commission',mode:'commission',length:12,index:0,items:buildItems(pool,12),finished:false,startedAt:Date.now()};
  state.tab='commission';save();renderCommission();haptic([18,30,18]);
}
function answerCurrent(value){
  const s=state.session;
  if(!s||s.finished) return;
  const item=s.items[s.index];
  if(!item||item.answered) return;
  const q=questionById(item.id);
  item.selected=value;
  item.answered=true;
  const right=value===q.correct;
  const stat=state.stats[q.id]||{seen:0,correct:0,wrong:0};
  stat.seen+=1;
  if(right) stat.correct+=1; else stat.wrong+=1;
  stat.last=right?'correct':'wrong';
  state.stats[q.id]=stat;
  save();
  haptic(right?20:[30,40,30]);
  if(s.type==='commission'){
    setTimeout(()=>advanceSession(),320);
  }else{
    renderTrainer();
  }
}
function advanceSession(){
  const s=state.session;if(!s)return;
  if(s.index>=s.items.length-1){
    s.finished=true;
    state.completedSessions+=1;
    if(s.type==='commission'){
      const score=sessionScore(s);
      state.lastCommission={score,total:s.items.length,at:Date.now()};
      state.bestCommission=Math.max(state.bestCommission,score);
    }
    save();render();
    return;
  }
  s.index+=1;save();render();
}
function sessionScore(s){
  return s.items.filter(item=>{
    const q=questionById(item.id);
    return item.answered&&item.selected===q?.correct;
  }).length;
}
function cancelSession(){
  state.session=null;save();render();
}

function renderTrainer(){
  const s=state.session;
  if(s?.type==='trainer'){
    if(s.finished){renderTrainerResult(s);return}
    renderQuestion(s,true);return;
  }
  const o=overall();
  workbench.innerHTML=`<div class="page">
    <section class="intro">
      <div class="stamp">ТРЕНАЖЕР</div>
      <h1>Тести замість перечитування</h1>
      <p>Обери режим і проходь серіями. Після кожної відповіді одразу бачиш правильний варіант і коротке пояснення з конспекту.</p>
      <div class="summary-grid">
        <div><strong>${o.seen}</strong><span>відповідей</span></div>
        <div><strong>${o.accuracy}%</strong><span>точність</span></div>
        <div><strong>${weakCount()}</strong><span>слабких питань</span></div>
      </div>
    </section>
    <section class="setup">
      <div class="section-title">Режим</div>
      <div class="choice-row">
        ${modeButton('mixed','Змішаний','усі теми')}
        ${modeButton('base','База','рівні 1–2')}
        ${modeButton('hard','Каверзні','лише рівень 3')}
        ${modeButton('weak','Помилки','те, що просідає')}
      </div>
      <div class="section-title">Довжина серії</div>
      <div class="length-row">
        ${[10,20,30].map(n=>`<button type="button" class="${state.trainerLength===n?'selected':''}" data-action="length" data-length="${n}" data-native-press>${n}</button>`).join('')}
      </div>
      <button class="primary wide" type="button" data-action="start-trainer" data-native-press>Почати серію</button>
    </section>
    <section class="topic-board">
      <div class="section-title">Покриття конспекту</div>
      ${topicRows()}
    </section>
  </div>`;
}
function modeButton(id,label,sub){
  return `<button type="button" class="mode-card ${state.trainerMode===id?'selected':''}" data-action="mode" data-mode="${id}" data-native-press><strong>${label}</strong><span>${sub}</span></button>`;
}
function renderQuestion(s,showFeedback){
  const item=s.items[s.index];
  const q=questionById(item.id);
  const score=sessionScore(s);
  const pct=Math.round((s.index/s.items.length)*100);
  workbench.innerHTML=`<div class="page quiz-page">
    <div class="quiz-top">
      <button class="ghost" type="button" data-action="cancel-session" data-native-press>Завершити</button>
      <span>${s.index+1} / ${s.items.length}</span>
      <strong>${score}</strong>
    </div>
    <div class="progress-track"><i style="width:${pct}%"></i></div>
    <article class="question-card">
      <div class="question-meta"><span>${esc(q.topic)}</span><b>Рівень ${q.level}</b></div>
      <h2>${esc(q.q)}</h2>
      <div class="answers">
        ${item.options.map((opt,i)=>answerButton(opt,i,item,q,showFeedback)).join('')}
      </div>
      ${item.answered&&showFeedback?feedbackBlock(q,item):''}
    </article>
    ${item.answered&&showFeedback?`<button class="primary wide next" type="button" data-action="next" data-native-press>${s.index===s.items.length-1?'Показати результат':'Наступне питання'}</button>`:''}
  </div>`;
}
function answerButton(opt,i,item,q,showFeedback){
  const letter='ABCD'[i];
  let cls='';
  if(item.answered&&showFeedback){
    if(opt===q.correct) cls='right';
    else if(opt===item.selected) cls='wrong';
    else cls='muted';
  }else if(item.selected===opt){cls='selected'}
  return `<button type="button" class="answer ${cls}" data-action="answer" data-value="${esc(opt)}" ${item.answered?'disabled':''} data-native-press><span>${letter}</span><b>${esc(opt)}</b></button>`;
}
function feedbackBlock(q,item){
  const right=item.selected===q.correct;
  return `<div class="feedback ${right?'good':'bad'}"><strong>${right?'Правильно':'Помилка'}</strong><p>${esc(q.explain)}</p>${right?'':`<p class="correct-line">Правильна відповідь: <b>${esc(q.correct)}</b></p>`}</div>`;
}
function renderTrainerResult(s){
  const score=sessionScore(s), pct=Math.round(score/s.items.length*100);
  const wrong=s.items.filter(i=>i.selected!==questionById(i.id)?.correct);
  workbench.innerHTML=`<div class="page result-page">
    <section class="result-mark"><span>${pct}%</span><h1>${resultTitle(pct)}</h1><p>${score} правильних із ${s.items.length}</p></section>
    <div class="result-actions">
      <button class="primary" type="button" data-action="restart" data-native-press>Ще серія</button>
      <button class="secondary" type="button" data-action="result-mistakes" data-native-press ${wrong.length?'':'disabled'}>Розібрати ${wrong.length} помилок</button>
    </div>
    ${wrong.length?`<section><div class="section-title">Що повторити</div>${wrong.slice(0,8).map(item=>{
      const q=questionById(item.id);return `<div class="miss-row"><span>${esc(q.topic)}</span><strong>${esc(q.q)}</strong></div>`;
    }).join('')}</section>`:''}
  </div>`;
}
function resultTitle(pct){
  if(pct>=90)return 'Можна ускладнювати';
  if(pct>=75)return 'Добра база';
  if(pct>=60)return 'Є прогалини';
  return 'Потрібне повторення';
}

function weakCount(){
  return Object.values(state.stats).filter(s=>(s.wrong||0)>0&&((s.correct||0)/(s.seen||1))<.75).length;
}
function weakQuestions(){
  return QUESTIONS.map(q=>({q,s:state.stats[q.id]||null}))
    .filter(x=>x.s&&(x.s.wrong||0)>0)
    .sort((a,b)=>{
      const aa=(a.s.correct||0)/(a.s.seen||1),bb=(b.s.correct||0)/(b.s.seen||1);
      return aa-bb || (b.s.wrong||0)-(a.s.wrong||0);
    });
}
function renderMistakes(){
  const weak=weakQuestions();
  workbench.innerHTML=`<div class="page">
    <section class="intro compact"><div class="stamp">ПОВТОР</div><h1>Помилки — це черга на повторення</h1><p>Чим частіше помиляєшся у питанні, тим вище воно тут і тим частіше потрапляє в режим «Помилки».</p></section>
    ${weak.length?`
      <button class="primary wide" type="button" data-action="start-weak" data-native-press>Тренувати слабкі питання</button>
      <div class="weak-stack">${weak.map(({q,s})=>{
        const acc=Math.round((s.correct||0)/(s.seen||1)*100);
        return `<article class="weak-card"><div><span>${esc(q.topic)} · рівень ${q.level}</span><strong>${esc(q.q)}</strong></div><b>${acc}%</b></article>`;
      }).join('')}</div>
      <button class="danger-link" type="button" data-action="reset-stats">Скинути статистику</button>
    `:`<div class="empty"><strong>Поки чисто</strong><p>Пройди першу серію — сюди автоматично потраплять питання, де були помилки.</p><button class="primary" type="button" data-action="go-trainer">До тренажера</button></div>`}
  </div>`;
}

function renderCommission(){
  const s=state.session;
  if(s?.type==='commission'){
    if(s.finished){renderCommissionResult(s);return}
    renderCommissionQuestion(s);return;
  }
  const last=state.lastCommission;
  workbench.innerHTML=`<div class="page">
    <section class="commission-hero">
      <div class="stamp dark">КОМІСІЯ</div>
      <h1>12 питань без підказок</h1>
      <p>Відповідь фіксується одразу. Правильний варіант не показується до завершення — щоб не підлаштовуватися по ходу.</p>
      <div class="commission-stats">
        <span>Рекорд <b>${state.bestCommission}/12</b></span>
        <span>Остання ${last?`<b>${last.score}/${last.total}</b>`:'—'}</span>
      </div>
      <button class="primary wide" type="button" data-action="start-commission" data-native-press>Почати симуляцію</button>
    </section>
    <div class="cross-note"><strong>Поріг для себе:</strong><p>10–12 — готовий рівень; 8–9 — пройти «Помилки»; ≤7 — ще одна змішана серія перед повторною комісією.</p></div>
  </div>`;
}
function renderCommissionQuestion(s){
  const item=s.items[s.index],q=questionById(item.id);
  const pct=Math.round((s.index/s.items.length)*100);
  workbench.innerHTML=`<div class="page quiz-page commission-mode">
    <div class="quiz-top"><button class="ghost" type="button" data-action="cancel-session">Вийти</button><span>Комісія · ${s.index+1}/12</span><strong>без підказок</strong></div>
    <div class="progress-track"><i style="width:${pct}%"></i></div>
    <article class="question-card">
      <div class="question-meta"><span>${esc(q.topic)}</span><b>Рівень ${q.level}</b></div>
      <h2>${esc(q.q)}</h2>
      <div class="answers">${item.options.map((opt,i)=>answerButton(opt,i,item,q,false)).join('')}</div>
    </article>
  </div>`;
}
function renderCommissionResult(s){
  const score=sessionScore(s),pct=Math.round(score/s.items.length*100);
  const wrong=s.items.filter(i=>i.selected!==questionById(i.id)?.correct);
  workbench.innerHTML=`<div class="page result-page">
    <section class="result-mark commission-result"><span>${score}/12</span><h1>${score>=10?'Комісійний рівень':score>=8?'Майже готово':'Ще рано зупинятися'}</h1><p>${pct}% правильних</p></section>
    <div class="result-actions"><button class="primary" type="button" data-action="start-commission">Повторити</button><button class="secondary" type="button" data-action="commission-review">Розбір ${wrong.length}</button></div>
    ${wrong.length?`<section><div class="section-title">Розбір</div>${wrong.map(item=>{
      const q=questionById(item.id);
      return `<article class="review-card"><span>${esc(q.topic)}</span><h3>${esc(q.q)}</h3><p>Твоя: <b>${esc(item.selected||'—')}</b></p><p class="correct-line">Правильна: <b>${esc(q.correct)}</b></p><small>${esc(q.explain)}</small></article>`;
    }).join('')}</section>`:'<div class="perfect">12/12. У цій серії помилок немає.</div>'}
  </div>`;
}

function topicRows(){
  const map=new Map();
  QUESTIONS.forEach(q=>{
    const v=map.get(q.topic)||{total:0,seen:0,correct:0};
    v.total++;
    const s=state.stats[q.id];
    if(s){v.seen+=s.seen||0;v.correct+=s.correct||0}
    map.set(q.topic,v);
  });
  return [...map].map(([topic,v])=>{
    const acc=v.seen?Math.round(v.correct/v.seen*100):null;
    return `<div class="topic-row"><span>${esc(topic)}</span><b>${acc===null?'не розпочато':`${acc}%`}</b><small>${v.total} пит.</small></div>`;
  }).join('');
}

function renderNotes(){
  workbench.innerHTML=`<div class="page notes-page"><section class="intro compact"><div class="stamp">ДЖЕРЕЛО</div><h1>Повний конспект</h1><p>Пошук по всіх розділах. Тестові питання побудовані на цьому матеріалі.</p></section>
    <input id="notesSearch" class="search" type="search" autocomplete="off" placeholder="Пошук: Кольбер, рента, інституціоналізм…">
    <div id="notesResults">${sourceLoading?'<div class="loading">Завантаження конспекту…</div>':renderNoteSections(sourceSections,'')}</div>
  </div>`;
}
function norm(v=''){return String(v).toLocaleLowerCase('uk-UA')}
function renderNoteSections(sections,query){
  const n=norm(query).trim();
  const filtered=sections.map(s=>({...s,paragraphs:n?s.paragraphs.filter(p=>norm(p).includes(n)):s.paragraphs}))
    .filter(s=>!n||norm(s.title).includes(n)||s.paragraphs.length);
  if(!filtered.length)return '<div class="empty"><strong>Нічого не знайдено</strong><p>Спробуй інше прізвище, школу або термін.</p></div>';
  return filtered.map(s=>`<details class="note-section" ${n?'open':''}><summary>${esc(s.title)}<span>${s.paragraphs.length}</span></summary><div>${s.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div></details>`).join('');
}

function resetStats(){
  if(!confirm('Скинути всю статистику відповідей і слабких питань?'))return;
  state.stats={};state.completedSessions=0;state.bestCommission=0;state.lastCommission=null;state.session=null;save();renderMistakes();toast('Статистику скинуто');
}

document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action],[data-tab]');
  if(!el)return;
  if(el.dataset.tab){setTab(el.dataset.tab);return}
  const action=el.dataset.action;
  if(action==='mode'){state.trainerMode=el.dataset.mode;save();renderTrainer();return}
  if(action==='length'){state.trainerLength=Number(el.dataset.length);save();renderTrainer();return}
  if(action==='start-trainer'){startTrainer();return}
  if(action==='start-weak'){state.trainerMode='weak';startTrainer('weak',Math.min(20,Math.max(10,modePool('weak').length)));return}
  if(action==='answer'){answerCurrent(el.dataset.value);return}
  if(action==='next'){advanceSession();return}
  if(action==='restart'){state.session=null;startTrainer();return}
  if(action==='result-mistakes'){state.session=null;state.tab='mistakes';save();renderMistakes();return}
  if(action==='cancel-session'){cancelSession();return}
  if(action==='start-commission'){startCommission();return}
  if(action==='commission-review'){state.session.finished=true;renderCommissionResult(state.session);return}
  if(action==='reset-stats'){resetStats();return}
  if(action==='go-trainer'){setTab('trainer');return}
});
document.addEventListener('input',event=>{
  if(event.target.id==='notesSearch') $('#notesResults').innerHTML=renderNoteSections(sourceSections,event.target.value);
});
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save()});

loadSourceSections()
  .then(sections=>{sourceSections=sections;sourceLoading=false;if(state.tab==='notes')renderNotes()})
  .catch(()=>{sourceSections=[];sourceLoading=false;if(state.tab==='notes')renderNotes()});

renderAccuracy();
render();
