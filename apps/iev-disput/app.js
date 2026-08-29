import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { QUIZ_1 } from './quiz-1.js';
import { QUIZ_2 } from './quiz-2.js';
import { QUIZ_3 } from './quiz-3.js';
import { LEARNING_UNITS, UNIT_BY_ID } from './learning-data.js';
import { EXTRA_PRACTICE } from './learning-extra.js';
import { loadSourceSections } from './source-loader.js';

installMobileRuntime();

const STORAGE_KEY='pocket-works:iev-disput:guided:v3';
const QUESTIONS=[...QUIZ_1,...QUIZ_2,...QUIZ_3];
const QUESTION_BY_ID=Object.fromEntries(QUESTIONS.map(q=>[q.id,q]));
const $=selector=>document.querySelector(selector);
const workbench=$('#workbench');
const toastEl=$('#toast');
const cycleValue=$('#cycleValue');
const tabs=[...document.querySelectorAll('[data-tab]')];

const defaults={tab:'cycle',unitStats:{},completedCycles:0,cycle:null,lastFinal:null};
let state=loadState();
let sourceSections=[];
let sourceLoading=true;
let toastTimer=null;

function loadState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!parsed||typeof parsed!=='object') return structuredClone(defaults);
    return {...structuredClone(defaults),...parsed,unitStats:validObject(parsed.unitStats)};
  }catch{return structuredClone(defaults)}
}
function validObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}renderHeader()}
function esc(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function normalize(value=''){return String(value).toLocaleLowerCase('uk-UA').normalize('NFD').replace(/\p{Diacritic}/gu,'')}
function percent(correct,total){return total?Math.round(correct/total*100):0}
function haptic(ms=18){if(navigator.vibrate) navigator.vibrate(ms)}
function toast(message){clearTimeout(toastTimer);toastEl.textContent=message;toastEl.hidden=false;toastTimer=setTimeout(()=>toastEl.hidden=true,1800)}

function renderHeader(){
  if(!state.cycle){cycleValue.textContent='0/5';return}
  if(state.cycle.phase==='final'||state.cycle.phase==='final-intro'||state.cycle.phase==='final-result') cycleValue.textContent='5/5';
  else cycleValue.textContent=`${Math.min(5,state.cycle.unitIndex+1)}/5`;
}
function setTab(tab){state.tab=tab;save();render()}
function render(){
  tabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===state.tab));
  if(state.tab==='cycle') renderCycle();
  else if(state.tab==='progress') renderProgress();
  else renderNotes();
  workbench.scrollTop=0;
}

function unitStat(id){return state.unitStats[id]||{attempts:0,correct:0,total:0,lastScore:null,best:0}}
function unitPriority(unit,index){const stat=unitStat(unit.id);if(!stat.attempts)return index;return 1000+(stat.lastScore??0)*10+stat.attempts}
function chooseFiveUnits(){
  const unseen=LEARNING_UNITS.filter(unit=>!unitStat(unit.id).attempts);
  if(unseen.length>=5) return unseen.slice(0,5);
  const selected=[...unseen];
  const used=new Set(selected.map(x=>x.id));
  const rest=LEARNING_UNITS.map((unit,index)=>({unit,index,priority:unitPriority(unit,index)})).filter(x=>!used.has(x.unit.id)).sort((a,b)=>a.priority-b.priority||a.index-b.index).map(x=>x.unit);
  return [...selected,...rest].slice(0,5);
}
function startCycle(){
  const units=chooseFiveUnits();
  state.cycle={id:`cycle-${Date.now().toString(36)}`,seed:Date.now()>>>0,unitIds:units.map(unit=>unit.id),unitIndex:0,phase:'read',practiceIndex:0,currentAnswered:null,unitCorrect:0,unitTotal:0,unitResults:{},finalQuestionIds:[],finalIndex:0,finalSelections:{},finalFinished:false};
  save();renderCycle();haptic(16);
}
function currentUnit(){return state.cycle?UNIT_BY_ID[state.cycle.unitIds[state.cycle.unitIndex]]:null}
function practiceForUnit(unit){if(!unit)return[];return [...(unit.quizIds||[]).map(id=>QUESTION_BY_ID[id]).filter(Boolean),...(EXTRA_PRACTICE[unit.id]||[])]}
function hashString(input){let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function shuffledOptions(q,salt=''){const out=[q.correct,...q.distractors];let seed=hashString(`${q.id}|${salt}`);for(let i=out.length-1;i>0;i--){seed=Math.imul(seed,1664525)+1013904223>>>0;const j=seed%(i+1);[out[i],out[j]]=[out[j],out[i]]}return out}
function cycleRail(){
  if(!state.cycle)return'';
  return `<div class="cycle-rail" aria-label="П'ять навчальних блоків">${state.cycle.unitIds.map((id,index)=>{const done=index<state.cycle.unitIndex||state.cycle.phase.startsWith('final');const active=index===state.cycle.unitIndex&&!state.cycle.phase.startsWith('final');return `<span class="${done?'done':''} ${active?'active':''}"><i>${done?'✓':index+1}</i><b>${esc(UNIT_BY_ID[id]?.title||'Блок')}</b></span>`}).join('')}</div>`;
}

function renderCycle(){
  if(!state.cycle){renderCycleStart();return}
  const phase=state.cycle.phase;
  if(phase==='read')renderReading();
  else if(phase==='practice')renderPractice();
  else if(phase==='unit-result')renderUnitResult();
  else if(phase==='final-intro')renderFinalIntro();
  else if(phase==='final')renderFinalQuestion();
  else renderFinalResult();
}
function renderCycleStart(){
  const unseen=LEARNING_UNITS.filter(unit=>!unitStat(unit.id).attempts).length;
  workbench.innerHTML=`<div class="page guided-home">
    <section class="intro lesson-intro"><span class="stamp">НОВИЙ ФОРМАТ</span><h1>Спочатку зрозумій. Потім відповідай.</h1><p>Один цикл — це п’ять невеликих вирізок із конспекту. Кожну читаєш, одразу закріплюєш тестом, а наприкінці проходиш змішану перевірку без підказок.</p></section>
    <div class="flow-map" aria-label="Схема навчального циклу">${[1,2,3,4,5].map(n=>`<div><b>${n}</b><span>читання</span><i>→</i><span>тест</span></div>`).join('')}<strong>ФІНАЛ · 10 ПИТАНЬ</strong></div>
    <section class="start-sheet"><div><span>Ще не пройдено</span><strong>${unseen}/${LEARNING_UNITS.length} блоків</strong></div><div><span>Завершено циклів</span><strong>${state.completedCycles}</strong></div><button class="primary wide" type="button" data-action="start-cycle" data-native-press>${state.completedCycles?'Почати наступний цикл':'Почати навчальний цикл'}</button></section>
    <p class="source-note">Тексти всередині — стисла структурована версія твого конспекту; тест кожного блоку перевіряє тільки те, що щойно було прочитано.</p>
  </div>`;
}
function renderReading(){
  const unit=currentUnit();if(!unit){state.cycle=null;save();renderCycleStart();return}
  const questions=practiceForUnit(unit);
  workbench.innerHTML=`<div class="page lesson-page">${cycleRail()}<header class="lesson-head"><div><span>БЛОК ${state.cycle.unitIndex+1} / 5 · ${esc(unit.eyebrow)}</span><h1>${esc(unit.title)}</h1></div><b>${esc(unit.time)}</b></header><div class="reading-rule"><span>Зараз лише читання</span><p>Тест буде складено тільки з фактів нижче. Не треба тримати в голові весь курс одночасно.</p></div><article class="study-sheet">${unit.sections.map((section,index)=>`<section><span>${String(index+1).padStart(2,'0')}</span><div><h2>${esc(section.title)}</h2><p>${esc(section.text)}</p></div></section>`).join('')}</article><div class="lesson-actions"><button class="primary wide" type="button" data-action="start-practice" data-native-press>Прочитав · перевірити себе (${questions.length})</button></div></div>`;
}
function renderPractice(){
  const unit=currentUnit();const questions=practiceForUnit(unit);const q=questions[state.cycle.practiceIndex];if(!q){finishUnit();return}
  const answered=state.cycle.currentAnswered;const options=shuffledOptions(q,`${state.cycle.id}-practice`);const progress=percent(state.cycle.practiceIndex,questions.length);
  workbench.innerHTML=`<div class="page quiz-page guided-quiz">${cycleRail()}<div class="quiz-top"><span>Блок ${state.cycle.unitIndex+1}</span><b>${esc(unit.title)}</b><strong>${state.cycle.practiceIndex+1}/${questions.length}</strong></div><div class="progress-track"><i style="width:${progress}%"></i></div><article class="question-card"><div class="question-meta"><span>Після читання</span><span>${esc(q.topic||unit.eyebrow)}</span></div><h2>${esc(q.q)}</h2><div class="answers">${options.map((option,index)=>renderPracticeOption(q,option,index,answered)).join('')}</div>${answered?renderImmediateFeedback(q,answered):''}</article>${answered?`<button class="primary wide next" type="button" data-action="next-practice" data-native-press>${state.cycle.practiceIndex===questions.length-1?'Завершити блок':'Наступне питання'}</button>`:''}</div>`;
}
function renderPracticeOption(q,option,index,answered){let cls='';let disabled='';if(answered){disabled='disabled';if(option===q.correct)cls='right';else if(option===answered.selected&&!answered.correct)cls='wrong';else cls='muted'}return `<button class="answer ${cls}" type="button" data-action="answer-practice" data-value="${esc(option)}" ${disabled} data-native-press><span>${String.fromCharCode(65+index)}</span><b>${esc(option)}</b></button>`}
function renderImmediateFeedback(q,answered){return `<div class="feedback ${answered.correct?'good':'bad'}"><strong>${answered.correct?'Так. Закріплено.':'Ні. Виправ це зараз.'}</strong><p>${esc(q.explain)}</p>${answered.correct?'':`<p class="correct-line"><b>Правильна відповідь:</b> ${esc(q.correct)}</p>`}</div>`}
function answerPractice(value){if(state.cycle.currentAnswered)return;const unit=currentUnit();const q=practiceForUnit(unit)[state.cycle.practiceIndex];if(!q)return;const correct=value===q.correct;state.cycle.currentAnswered={selected:value,correct};state.cycle.unitTotal++;if(correct)state.cycle.unitCorrect++;save();renderPractice();haptic(correct?15:32)}
function nextPractice(){const unit=currentUnit();const questions=practiceForUnit(unit);if(!state.cycle.currentAnswered)return;state.cycle.practiceIndex++;state.cycle.currentAnswered=null;if(state.cycle.practiceIndex>=questions.length)finishUnit();else{save();renderPractice()}}
function finishUnit(){
  const unit=currentUnit();if(!unit)return;
  const result={correct:state.cycle.unitCorrect,total:state.cycle.unitTotal,score:percent(state.cycle.unitCorrect,state.cycle.unitTotal)};state.cycle.unitResults[unit.id]=result;
  const old=unitStat(unit.id);state.unitStats[unit.id]={attempts:old.attempts+1,correct:old.correct+result.correct,total:old.total+result.total,lastScore:result.score,best:Math.max(old.best||0,result.score)};
  state.cycle.phase='unit-result';save();renderUnitResult();
}
function renderUnitResult(){
  const unit=currentUnit();const result=state.cycle.unitResults[unit.id];const last=state.cycle.unitIndex===4;
  const note=result.score>=80?'<b>Матеріал тримається.</b><p>Іди далі — фінальний тест ще раз дістане ці факти іншими формулюваннями.</p>':result.score>=60?'<b>Є прогалини.</b><p>Можна йти далі, але цей блок матиме нижчий пріоритет у наступних циклах.</p>':'<b>Краще перечитати.</b><p>Ти можеш повторити цей самий блок перед переходом далі.</p>';
  workbench.innerHTML=`<div class="page unit-result-page">${cycleRail()}<section class="unit-result-mark ${result.score<60?'weak':''}"><span>${result.score}%</span><div><small>БЛОК ${state.cycle.unitIndex+1} ЗАВЕРШЕНО</small><h1>${esc(unit.title)}</h1><p>${result.correct} правильних із ${result.total}</p></div></section><div class="result-note">${note}</div><div class="result-actions"><button class="secondary" type="button" data-action="repeat-unit" data-native-press>Перечитати</button><button class="primary" type="button" data-action="advance-unit" data-native-press>${last?'До фінального тесту':'Далі · блок '+(state.cycle.unitIndex+2)}</button></div></div>`;
}
function repeatUnit(){state.cycle.phase='read';state.cycle.practiceIndex=0;state.cycle.currentAnswered=null;state.cycle.unitCorrect=0;state.cycle.unitTotal=0;save();renderReading()}
function advanceUnit(){if(state.cycle.unitIndex>=4){state.cycle.phase='final-intro';prepareFinal();save();renderFinalIntro();return}state.cycle.unitIndex++;state.cycle.phase='read';state.cycle.practiceIndex=0;state.cycle.currentAnswered=null;state.cycle.unitCorrect=0;state.cycle.unitTotal=0;save();renderReading()}
function prepareFinal(){if(state.cycle.finalQuestionIds?.length)return;const ids=[];for(const unitId of state.cycle.unitIds){const finals=UNIT_BY_ID[unitId]?.final||[];const ordered=[...finals];if(ordered.length>2&&state.completedCycles%2)ordered.push(ordered.shift());ids.push(...ordered.slice(0,2).map(q=>q.id))}state.cycle.finalQuestionIds=ids;state.cycle.finalIndex=0;state.cycle.finalSelections={}}
function allFinalQuestions(){return LEARNING_UNITS.flatMap(unit=>(unit.final||[]).map(q=>({...q,unitId:unit.id})))}
const FINAL_BY_ID=Object.fromEntries(allFinalQuestions().map(q=>[q.id,q]));
function renderFinalIntro(){
  const results=state.cycle.unitIds.map(id=>({unit:UNIT_BY_ID[id],result:state.cycle.unitResults[id]}));
  workbench.innerHTML=`<div class="page final-intro-page">${cycleRail()}<section class="commission-hero"><span class="stamp dark">ФІНАЛ ЦИКЛУ</span><h1>Тепер без опори на текст.</h1><p>10 змішаних питань: по два з кожного пройденого блоку. Формулювання відрізняються від локальних тестів, але перевіряють ті самі знання.</p></section><div class="final-ledger">${results.map(({unit,result},i)=>`<div><span>0${i+1}</span><b>${esc(unit.title)}</b><strong>${result?.score??0}%</strong></div>`).join('')}</div><div class="reading-rule"><span>Правила фіналу</span><p>Правильні відповіді та пояснення не показуються до самого кінця.</p></div><button class="primary wide" type="button" data-action="start-final" data-native-press>Почати фінальний тест · 10 питань</button></div>`;
}
function startFinal(){state.cycle.phase='final';state.cycle.finalIndex=0;save();renderFinalQuestion()}
function currentFinalQuestion(){return FINAL_BY_ID[state.cycle.finalQuestionIds[state.cycle.finalIndex]]}
function renderFinalQuestion(){
  const q=currentFinalQuestion();if(!q){finishFinal();return}const selected=state.cycle.finalSelections[q.id]??null;const options=shuffledOptions(q,`${state.cycle.id}-final`);
  workbench.innerHTML=`<div class="page quiz-page final-quiz">${cycleRail()}<div class="quiz-top"><span>Фінальний тест</span><b>${esc(UNIT_BY_ID[q.unitId]?.eyebrow||'Змішане')}</b><strong>${state.cycle.finalIndex+1}/${state.cycle.finalQuestionIds.length}</strong></div><div class="progress-track"><i style="width:${percent(state.cycle.finalIndex,state.cycle.finalQuestionIds.length)}%"></i></div><article class="question-card"><div class="question-meta"><span>Без підказок</span><span>після 5 блоків</span></div><h2>${esc(q.q)}</h2><div class="answers">${options.map((option,index)=>`<button class="answer ${selected===option?'selected':''}" type="button" data-action="select-final" data-value="${esc(option)}" data-native-press><span>${String.fromCharCode(65+index)}</span><b>${esc(option)}</b></button>`).join('')}</div></article><button class="primary wide next" type="button" data-action="next-final" ${selected===null?'disabled':''} data-native-press>${state.cycle.finalIndex===state.cycle.finalQuestionIds.length-1?'Завершити фінал':'Далі'}</button></div>`;
}
function selectFinal(value){const q=currentFinalQuestion();if(!q)return;state.cycle.finalSelections[q.id]=value;save();renderFinalQuestion();haptic(12)}
function nextFinal(){const q=currentFinalQuestion();if(!q||state.cycle.finalSelections[q.id]==null)return;state.cycle.finalIndex++;if(state.cycle.finalIndex>=state.cycle.finalQuestionIds.length)finishFinal();else{save();renderFinalQuestion()}}
function finishFinal(){
  if(state.cycle.finalFinished){state.cycle.phase='final-result';save();renderFinalResult();return}
  const questions=state.cycle.finalQuestionIds.map(id=>FINAL_BY_ID[id]).filter(Boolean);const answers=questions.map(q=>({id:q.id,unitId:q.unitId,q:q.q,selected:state.cycle.finalSelections[q.id]??'',correct:q.correct,ok:state.cycle.finalSelections[q.id]===q.correct,explain:q.explain}));
  const correct=answers.filter(a=>a.ok).length;const total=answers.length;const score=percent(correct,total);const perUnit={};
  for(const id of state.cycle.unitIds){const rows=answers.filter(a=>a.unitId===id);const c=rows.filter(a=>a.ok).length;perUnit[id]={correct:c,total:rows.length,score:percent(c,rows.length)}}
  state.lastFinal={score,correct,total,perUnit,answers,unitIds:[...state.cycle.unitIds],at:Date.now()};state.completedCycles++;state.cycle.finalFinished=true;state.cycle.phase='final-result';save();renderFinalResult();haptic(score>=70?25:45);
}
function renderFinalResult(){
  const result=state.lastFinal;if(!result){state.cycle=null;save();renderCycleStart();return}const misses=result.answers.filter(a=>!a.ok);
  workbench.innerHTML=`<div class="page result-page final-result-page"><section class="result-mark commission-result"><span>${result.score}%</span><h1>${result.score>=80?'Цикл засвоєно':result.score>=60?'Основа є, але є прогалини':'Потрібне ще одне коло'}</h1><p>${result.correct} / ${result.total} у змішаному фіналі</p></section><div class="unit-score-grid">${result.unitIds.map((id,i)=>`<div><span>0${i+1}</span><b>${esc(UNIT_BY_ID[id]?.title||id)}</b><strong>${result.perUnit[id]?.score??0}%</strong></div>`).join('')}</div><div class="section-title">Розбір фіналу</div>${misses.length?misses.map(a=>`<article class="review-card"><span>${esc(UNIT_BY_ID[a.unitId]?.eyebrow||'Блок')}</span><h3>${esc(a.q)}</h3><p>Твоя: <b>${esc(a.selected||'—')}</b></p><p class="correct-line">Правильна: <b>${esc(a.correct)}</b></p><small>${esc(a.explain)}</small></article>`).join(''):'<div class="perfect">10/10. У цьому циклі немає помилок для розбору.</div>'}<div class="result-actions final-actions"><button class="secondary" type="button" data-action="open-progress" data-native-press>Прогрес</button><button class="primary" type="button" data-action="new-cycle" data-native-press>Наступні 5 блоків</button></div></div>`;
}
function newCycle(){state.cycle=null;save();startCycle()}

function renderProgress(){
  const attempted=LEARNING_UNITS.filter(unit=>unitStat(unit.id).attempts).length;const average=attempted?Math.round(LEARNING_UNITS.reduce((sum,unit)=>sum+(unitStat(unit.id).lastScore??0),0)/attempted):0;
  workbench.innerHTML=`<div class="page progress-page"><section class="intro compact"><span class="stamp">КАРТА ПІДГОТОВКИ</span><h1>Що вже тримається</h1><p>Оцінка нижче — результат тесту одразу після читання. Фінальний тест зберігається окремо, бо він перевіряє перенесення знань без тексту перед очима.</p></section><div class="summary-grid"><div><strong>${attempted}/${LEARNING_UNITS.length}</strong><span>блоків</span></div><div><strong>${average}%</strong><span>локальні тести</span></div><div><strong>${state.lastFinal?.score??'—'}${state.lastFinal?'%':''}</strong><span>останній фінал</span></div></div><div class="learning-ledger">${LEARNING_UNITS.map((unit,index)=>{const s=unitStat(unit.id);return `<article class="learning-row ${s.attempts?'seen':''}"><span>${String(index+1).padStart(2,'0')}</span><div><b>${esc(unit.title)}</b><small>${esc(unit.eyebrow)} · ${s.attempts?`${s.attempts} проходж.`:'ще не читав'}</small></div><strong>${s.attempts?`${s.lastScore}%`:'—'}</strong></article>`}).join('')}</div>${state.cycle?'<button class="primary wide" type="button" data-action="back-cycle" data-native-press>Продовжити поточний цикл</button>':'<button class="primary wide" type="button" data-action="start-cycle" data-native-press>Почати цикл</button>'}</div>`;
}

function renderNotes(query=''){
  if(sourceLoading){workbench.innerHTML='<div class="page"><div class="loading">Розпаковую повний конспект…</div></div>';return}
  workbench.innerHTML=`<div class="page notes-page"><section class="intro compact"><span class="stamp">ПЕРШОДЖЕРЕЛО</span><h1>Повний конспект</h1><p>Навчальний цикл дає короткі вирізки. Тут лишається весь матеріал без скорочення для перевірки формулювань і деталей.</p></section><input id="notesSearch" class="search" type="search" value="${esc(query)}" placeholder="Пошук по всьому конспекту…" autocomplete="off"><div id="notesResults">${notesSections(sourceSections,query)}</div></div>`;
}
function notesSections(sections,query=''){
  const n=normalize(query.trim());const matches=sections.map(section=>({title:section.title,paragraphs:n?section.paragraphs.filter(p=>normalize(p).includes(n)):section.paragraphs})).filter(section=>!n||normalize(section.title).includes(n)||section.paragraphs.length);
  if(!matches.length)return'<div class="empty"><strong>Нічого не знайдено</strong><p>Спробуй прізвище, школу, країну або поняття.</p></div>';
  return matches.map((section,index)=>`<details class="note-section" ${n||index===0?'open':''}><summary>${esc(section.title)}<span>${section.paragraphs.length}</span></summary><div>${section.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div></details>`).join('');
}

function handleClick(event){
  const el=event.target.closest('[data-action],[data-tab]');if(!el)return;
  if(el.dataset.tab){setTab(el.dataset.tab);return}
  const action=el.dataset.action;
  if(action==='start-cycle'){startCycle();return}
  if(action==='start-practice'){state.cycle.phase='practice';state.cycle.practiceIndex=0;state.cycle.currentAnswered=null;state.cycle.unitCorrect=0;state.cycle.unitTotal=0;save();renderPractice();return}
  if(action==='answer-practice'){answerPractice(el.dataset.value);return}
  if(action==='next-practice'){nextPractice();return}
  if(action==='repeat-unit'){repeatUnit();return}
  if(action==='advance-unit'){advanceUnit();return}
  if(action==='start-final'){startFinal();return}
  if(action==='select-final'){selectFinal(el.dataset.value);return}
  if(action==='next-final'){nextFinal();return}
  if(action==='new-cycle'){newCycle();return}
  if(action==='open-progress'){setTab('progress');return}
  if(action==='back-cycle'){setTab('cycle');return}
}

document.addEventListener('click',handleClick);
document.addEventListener('input',event=>{if(event.target.id==='notesSearch')$('#notesResults').innerHTML=notesSections(sourceSections,event.target.value)});
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save()});

loadSourceSections().then(sections=>{sourceSections=sections;sourceLoading=false;if(state.tab==='notes')renderNotes()}).catch(()=>{sourceSections=[];sourceLoading=false;if(state.tab==='notes'){renderNotes();toast('Не вдалося розпакувати конспект')}});
renderHeader();render();
