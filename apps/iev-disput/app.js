import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { STUDY } from './study-data.js';
import { QUESTIONS } from './questions.js';
import { loadSourceSections } from './source-loader.js';

installMobileRuntime();

const STORAGE_KEY='pocket-works:iev-disput:state:v1';
const $=selector=>document.querySelector(selector);
const workbench=$('#workbench');
const overlay=$('#overlay');
const overlaySheet=$('#overlaySheet');
const toastEl=$('#toast');
const readinessValue=$('#readinessValue');
const tabs=[...document.querySelectorAll('[data-tab]')];

const defaults={tab:'plan',atlasMode:'timeline',trainerFilter:'all',planDone:{},grades:{},sessions:0,commissionRuns:0,currentQuestion:null};
let state=loadState();
let commission=null;
let revealCurrent=false;
let toastTimer=null;
let sourceSections=[];
let sourceLoading=true;

function loadState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!parsed||typeof parsed!=='object') return structuredClone(defaults);
    return {...structuredClone(defaults),...parsed,planDone:validMap(parsed.planDone),grades:validGrades(parsed.grades)};
  }catch{return structuredClone(defaults)}
}
function validMap(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function validGrades(value){
  if(!value||typeof value!=='object'||Array.isArray(value)) return {};
  const out={};
  for(const [id,list] of Object.entries(value)) if(Array.isArray(list)) out[id]=list.filter(x=>x===0||x===.5||x===1).slice(-12);
  return out;
}
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}
  renderReadiness();
}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function normalize(v=''){return String(v).toLocaleLowerCase('uk-UA').normalize('NFD').replace(/\p{Diacritic}/gu,'')}
function average(list){return list.length?list.reduce((a,b)=>a+b,0)/list.length:0}
function allGrades(){return Object.values(state.grades).flat()}
function planProgress(){return STUDY.plan.length?Object.keys(state.planDone).filter(id=>state.planDone[id]).length/STUDY.plan.length:0}
function readiness(){const grades=allGrades();const knowledge=grades.length?average(grades):0;return Math.round((planProgress()*.38+knowledge*.62)*100)}
function renderReadiness(){readinessValue.textContent=`${readiness()}%`}
function lastGrade(id){const arr=state.grades[id]||[];return arr.length?arr[arr.length-1]:null}
function topicStats(){
  const map=new Map();
  QUESTIONS.forEach(q=>{const list=state.grades[q.id]||[];if(!list.length)return;const bucket=map.get(q.topic)||[];bucket.push(...list);map.set(q.topic,bucket)});
  return [...map].map(([topic,list])=>({topic,score:average(list),attempts:list.length})).sort((a,b)=>a.score-b.score);
}
function weakQuestions(){
  const attempted=QUESTIONS.filter(q=>{const g=state.grades[q.id]||[];return g.length&&average(g)<.75});
  return attempted.length?attempted:QUESTIONS.filter(q=>q.level>=2);
}
function toast(message){
  clearTimeout(toastTimer);toastEl.textContent=message;toastEl.hidden=false;
  toastTimer=setTimeout(()=>toastEl.hidden=true,1700);
}
function haptic(ms=18){if(navigator.vibrate) navigator.vibrate(ms)}

function setTab(tab){
  state.tab=tab;save();closeOverlay();render();
}
function render(){
  tabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===state.tab));
  if(state.tab==='plan') renderPlan();
  else if(state.tab==='atlas') renderAtlas();
  else if(state.tab==='trainer') renderTrainer();
  else renderNotes();
  workbench.scrollTop=0;
}

function renderPlan(){
  const done=Object.values(state.planDone).filter(Boolean).length;
  const grades=allGrades();
  const weak=topicStats().filter(x=>x.score<.75).length;
  workbench.innerHTML=`<div class="page">
    <section class="hero-dossier">
      <h2>Два дні. Не зубрити — відтворювати.</h2>
      <p>Твоя задача: на кожну тезу швидко відновлювати п’ять координат — <b>коли, де, школа, хто, що саме</b>. Комісія навмисно ламає лінійну хронологію.</p>
      <div class="hero-actions">
        <button class="primary" type="button" data-action="start-commission" data-native-press>Почати комісію</button>
        <button class="secondary" type="button" data-action="open-weak" data-native-press>Слабкі місця</button>
      </div>
    </section>
    <div class="metric-strip">
      <div class="metric"><strong>${done}/${STUDY.plan.length}</strong><span>блоків</span></div>
      <div class="metric"><strong>${grades.length}</strong><span>відповідей</span></div>
      <div class="metric"><strong>${weak}</strong><span>слабких тем</span></div>
    </div>
    ${[1,2].map(day=>renderDay(day)).join('')}
    <div class="section-label">Правило підготовки</div>
    <div class="cross-note"><strong>Спочатку скажи вголос. Потім відкривай відповідь.</strong><p>Самооцінка тут не «оцінка знань від ШІ». Це твій чесний журнал відтворення. Якщо вагався між двома авторами — став «частково».</p></div>
  </div>`;
}
function renderDay(day){
  const list=STUDY.plan.filter(x=>x.day===day);const minutes=list.reduce((s,x)=>s+x.minutes,0);const completed=list.filter(x=>state.planDone[x.id]).length;
  return `<section class="day-block"><div class="day-head"><h2>День ${day}</h2><span>${completed}/${list.length} · ${minutes} хв</span></div>${list.map(task=>`<article class="task ${state.planDone[task.id]?'done':''}">
    <button class="task-check" type="button" data-action="toggle-task" data-id="${task.id}" aria-label="${state.planDone[task.id]?'Позначити незавершеним':'Позначити завершеним'}" data-native-press>${state.planDone[task.id]?'✓':'○'}</button>
    <button class="person-row task-copy" style="padding:0;border:0;min-height:38px" type="button" data-action="start-task" data-mode="${task.mode}" data-native-press><span><strong>${esc(task.title)}</strong><span>${esc(task.goal)}</span></span></button>
    <span class="task-time">${task.minutes} хв</span></article>`).join('')}</section>`;
}

function renderAtlas(){
  workbench.innerHTML=`<div class="page"><h1 class="page-title">Атлас ідей</h1><p class="page-intro">Не список прізвищ, а карта: час → країна → школа → людина → теза.</p>
    <div class="mode-tabs">${[['timeline','Хронологія'],['people','Персоналії'],['cross','Перехрестя'],['context','Контекст+']].map(([id,label])=>`<button class="tab-chip ${state.atlasMode===id?'active':''}" type="button" data-action="atlas-mode" data-mode="${id}" data-native-press>${label}</button>`).join('')}</div>
    <div id="atlasBody"></div></div>`;
  const body=$('#atlasBody');
  if(state.atlasMode==='timeline') body.innerHTML=renderTimeline();
  else if(state.atlasMode==='people') body.innerHTML=renderPeople();
  else if(state.atlasMode==='cross') body.innerHTML=renderCross();
  else body.innerHTML=renderContext();
}
function renderTimeline(){return `<div class="timeline">${STUDY.timeline.map(era=>`<article class="era"><span class="period">${esc(era.period)}</span><h3>${esc(era.title)}</h3><div class="place">${esc(era.place)}</div><p>${esc(era.core)}</p>${era.people.length?`<small>${era.people.map(esc).join(' · ')}</small>`:''}</article>`).join('')}</div>`}
function renderPeople(query=''){
  const n=normalize(query);const list=STUDY.people.filter(p=>!n||normalize([p.name,p.country,p.school,p.idea,p.hook].join(' ')).includes(n));
  return `<input class="searchbox" id="peopleSearch" type="search" inputmode="search" autocomplete="off" placeholder="Автор, країна, школа, ідея…" value="${esc(query)}"><div class="person-list" id="peopleResults">${peopleRows(list)}</div>`;
}
function peopleRows(list){return list.length?list.map(p=>`<button class="person-row" type="button" data-action="person" data-name="${esc(p.name)}" data-native-press><span><strong>${esc(p.name)}</strong><span>${esc(p.country)} · ${esc(p.school)}</span></span><b>${esc(p.hook)}</b></button>`).join(''):`<div class="empty-state"><strong>Нічого не знайдено</strong><p>Спробуй школу, країну або ключову ідею.</p></div>`}
function renderCross(country='Франція'){
  const countries=['Франція','Англія','Німеччина','США','Україна','Італія'];
  const list=STUDY.people.filter(p=>normalize(p.country).includes(normalize(country)));
  return `<p class="page-intro">Натисни країну й проговори: <b>хто → коли → яка школа → що відстоював</b>. Саме так ламають лінійну зубріжку.</p><div class="mode-tabs" id="countryTabs">${countries.map(c=>`<button class="country-chip ${c===country?'active':''}" type="button" data-action="country" data-country="${c}" data-native-press>${c}</button>`).join('')}</div><div id="countryResults">${peopleRows(list)}</div>`;
}
function renderContext(){return `<div class="cross-note"><strong>Це не конспект.</strong><p>Нижче — зовнішні містки для типових викладацьких добивань. Вони спеціально відокремлені, щоб не підміняти ваш матеріал.</p></div>${STUDY.extraContext.map(x=>`<article class="cross-note"><span class="source-tag">${esc(x.source)}</span><h3>${esc(x.title)}</h3><p>${esc(x.fact)}</p><p><b>Навіщо:</b> ${esc(x.why)}</p></article>`).join('')}`}

function renderTrainer(){
  if(!state.currentQuestion||!QUESTIONS.some(q=>q.id===state.currentQuestion)) state.currentQuestion=pickQuestion(state.trainerFilter)?.id||QUESTIONS[0].id;
  const q=QUESTIONS.find(x=>x.id===state.currentQuestion);
  const weakCount=topicStats().filter(x=>x.score<.75).length;
  workbench.innerHTML=`<div class="page"><h1 class="page-title">Усне відтворення</h1><p class="page-intro">Не обирай варіант. Скажи відповідь уголос, відкрий критерії й оціни себе.</p>
  <div class="mode-tabs">${[['all','Усе'],['hard','Каверзні'],['weak',`Слабкі ${weakCount?`· ${weakCount}`:''}`]].map(([id,label])=>`<button class="tab-chip ${state.trainerFilter===id?'active':''}" type="button" data-action="trainer-filter" data-filter="${id}" data-native-press>${label}</button>`).join('')}</div>
  ${renderTicket(q,revealCurrent,false)}
  <button class="text-btn" type="button" data-action="next-question">Інше питання ↻</button>
  <div class="section-label">Статистика тем</div>${renderWeakStats()}
  <button class="primary" type="button" data-action="start-commission" style="width:100%;margin-top:12px">Симуляція комісії · 3 питання</button></div>`;
}
function renderTicket(q,revealed,inCommission){
  return `<article class="ticket"><div class="ticket-head"><span class="level">Рівень ${q.level}${q.level===3?' · комісія':''}</span><span class="topic">${esc(q.topic)}</span></div><h2 class="question">${esc(q.q)}</h2>${!revealed?`<button class="primary" type="button" data-action="reveal-${inCommission?'commission':'answer'}" data-native-press>Відкрити критерії відповіді</button>`:`<div class="answer"><ul>${q.a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="trap"><b>Пастка:</b> ${esc(q.trap)}</p><div class="grade-row">${[[0,'Ні'],[.5,'Частково'],[1,'Так']].map(([score,label])=>`<button class="grade-btn" type="button" data-action="grade-${inCommission?'commission':'question'}" data-score="${score}" data-id="${q.id}" data-native-press>${label}</button>`).join('')}</div></div>`}</article>`;
}
function renderWeakStats(){
  const stats=topicStats();
  if(!stats.length) return `<div class="empty-state"><strong>Ще немає даних</strong><p>Після кількох відповідей тут з’являться теми, які реально просідають.</p></div>`;
  return `<div class="weak-list">${stats.slice(0,8).map(x=>`<div class="weak-item"><strong>${esc(x.topic)}</strong><span>${Math.round(x.score*100)}% · ${x.attempts} відп.</span></div>`).join('')}</div>`;
}
function pickQuestion(filter='all',exclude=[]){
  let pool=QUESTIONS.filter(q=>!exclude.includes(q.id));
  if(filter==='hard') pool=pool.filter(q=>q.level===3);
  if(filter==='weak') pool=weakQuestions().filter(q=>!exclude.includes(q.id));
  if(!pool.length) pool=QUESTIONS.filter(q=>!exclude.includes(q.id));
  const weights=pool.map(q=>{const g=state.grades[q.id]||[];return g.length?Math.max(.35,1.35-average(g)):1.2});
  let r=Math.random()*weights.reduce((a,b)=>a+b,0);
  for(let i=0;i<pool.length;i++){r-=weights[i];if(r<=0)return pool[i]}
  return pool[0];
}
function grade(id,score){
  const list=state.grades[id]||[];list.push(score);state.grades[id]=list.slice(-12);state.sessions++;save();haptic(score===1?22:12);
}

function startCommission(){
  const q1=pickFrom(QUESTIONS.filter(q=>q.level<=2));
  const same=QUESTIONS.filter(q=>q.id!==q1.id&&q.level>=2&&q.topic===q1.topic);
  const q2=pickFrom(same.length?same:QUESTIONS.filter(q=>q.id!==q1.id&&q.level===2));
  const cross=QUESTIONS.filter(q=>q.level===3&&q.id!==q1.id&&q.id!==q2.id&&(q.topic==='Перехрестя'||q.topic===q1.topic));
  const q3=pickFrom(cross.length?cross:QUESTIONS.filter(q=>q.level===3&&q.id!==q1.id&&q.id!==q2.id));
  commission={ids:[q1.id,q2.id,q3.id],index:0,scores:[],revealed:false};
  openOverlay(renderCommission());
}
function pickFrom(list){return list[Math.floor(Math.random()*list.length)]}
function renderCommission(){
  if(!commission) return '';
  if(commission.index>=3){
    const pct=Math.round(average(commission.scores)*100);const verdict=pct>=84?'Можна йти на комісію':pct>=60?'Основа є — добий слабке':'Ще рано розслаблятися';
    return `<button class="close-x" type="button" data-action="close-overlay" aria-label="Закрити">×</button><div class="commission-score"><span class="source-tag">Симуляція завершена</span><strong>${pct}%</strong><h2>${verdict}</h2><p>Оцінка базується на трьох твоїх самооцінках. Третє питання завжди складніше й частіше перехресне.</p><button class="primary" type="button" data-action="restart-commission">Ще один білет</button><button class="secondary" type="button" data-action="open-weak" style="margin-top:8px;width:100%">Добити слабкі теми</button></div>`;
  }
  const q=QUESTIONS.find(x=>x.id===commission.ids[commission.index]);
  return `<button class="close-x" type="button" data-action="close-overlay" aria-label="Закрити">×</button><span class="source-tag">Комісія · питання ${commission.index+1}/3</span><h2>Відповідай без підказок</h2><div class="commission-progress">${[0,1,2].map(i=>`<span class="${i<commission.index?'done':''}"></span>`).join('')}</div>${renderTicket(q,commission.revealed,true)}`;
}

function renderNotes(){
  const body=sourceLoading?`<div class="empty-state"><strong>Розгортаю конспект…</strong><p>Локальна база готується до повнотекстового пошуку.</p></div>`:sourceSections.length?notesSections(sourceSections):`<div class="empty-state"><strong>Повний текст недоступний</strong><p>Тренажер, атлас і питання працюють офлайн. Для цього браузера недоступне розпакування повного конспекту.</p></div>`;
  workbench.innerHTML=`<div class="page"><h1 class="page-title">Повний конспект</h1><p class="page-intro">Усі абзаци з завантаженого матеріалу. Шукай прізвище, термін, країну, дату або формулювання.</p>${sourceSections.length?`<input class="searchbox" id="notesSearch" type="search" inputmode="search" autocomplete="off" placeholder="Напр. «рента», «Франція», «монополія»">`:''}<div id="notesResults">${body}</div></div>`;
}
function notesSections(sections,query=''){
  const n=normalize(query);let matches=0;
  const html=sections.map(section=>{
    const paras=n?section.paragraphs.filter(p=>normalize(p).includes(n)):section.paragraphs;
    if(n&&!paras.length&&!normalize(section.title).includes(n)) return '';
    matches+=paras.length;
    const shown=n?paras:paras.slice(0,5);
    const more=!n&&paras.length>5;
    return `<section class="note-section"><h3>${esc(section.title)}</h3><div class="paragraphs">${shown.map(p=>`<p>${esc(p)}</p>`).join('')}</div>${more?`<details><summary>Показати всі ${paras.length} абзаців</summary><div class="paragraphs">${paras.slice(5).map(p=>`<p>${esc(p)}</p>`).join('')}</div></details>`:''}</section>`;
  }).join('');
  return `${n?`<div class="section-label">Знайдено абзаців: ${matches}</div>`:''}${html||`<div class="empty-state"><strong>Збігів немає</strong><p>Спробуй коротше слово або інше написання.</p></div>`}`;
}

function showPerson(name){
  const p=STUDY.people.find(x=>x.name===name);if(!p)return;
  openOverlay(`<button class="close-x" type="button" data-action="close-overlay" aria-label="Закрити">×</button><span class="source-tag">Персоналія</span><h2>${esc(p.name)}</h2><dl class="detail-grid"><dt>Країна</dt><dd>${esc(p.country)}</dd><dt>Школа</dt><dd>${esc(p.school)}</dd><dt>Суть</dt><dd>${esc(p.idea)}</dd></dl><div class="memory-hook">Якір: ${esc(p.hook)}</div>`);
}
function showReadiness(){
  const pct=readiness(),stats=topicStats(),weak=stats.filter(x=>x.score<.75),done=Math.round(planProgress()*100),knowledge=allGrades().length?Math.round(average(allGrades())*100):0;
  openOverlay(`<button class="close-x" type="button" data-action="close-overlay" aria-label="Закрити">×</button><span class="source-tag">Діагностика</span><h2>Готовність ${pct}%</h2><p>Це не магічний прогноз оцінки. Формула: 38% виконання дводенного плану + 62% твоїх самооцінок усних відповідей.</p><div class="metric-strip"><div class="metric"><strong>${done}%</strong><span>план</span></div><div class="metric"><strong>${knowledge}%</strong><span>відтворення</span></div><div class="metric"><strong>${state.commissionRuns}</strong><span>комісій</span></div></div><div class="section-label">Найслабше</div>${weak.length?`<div class="weak-list">${weak.slice(0,6).map(x=>`<div class="weak-item"><strong>${esc(x.topic)}</strong><span>${Math.round(x.score*100)}%</span></div>`).join('')}</div>`:`<div class="empty-state"><strong>${allGrades().length?'Провалів поки немає':'Даних ще мало'}</strong><p>${allGrades().length?'Продовжуй каверзні питання.':'Відповідай у тренажері, щоб з’явилась діагностика.'}</p></div>`}`);
}
function openWeak(){closeOverlay();state.tab='trainer';state.trainerFilter='weak';state.currentQuestion=pickQuestion('weak')?.id||QUESTIONS[0].id;revealCurrent=false;save();render()}
function startTask(mode){
  if(mode==='timeline'){state.tab='atlas';state.atlasMode='timeline'}
  else if(mode==='cross'){state.tab='atlas';state.atlasMode='cross'}
  else if(mode==='commission'){save();render();startCommission();return}
  else {state.tab='trainer';state.trainerFilter=mode==='weak'?'weak':'all';state.currentQuestion=pickQuestion(state.trainerFilter)?.id}
  revealCurrent=false;save();render();
}
function openOverlay(html){overlaySheet.innerHTML=html;overlay.hidden=false;document.body.style.overflow='hidden';overlaySheet.scrollTop=0}
function closeOverlay(){overlay.hidden=true;overlaySheet.innerHTML='';document.body.style.overflow=''}

function handleClick(event){
  const el=event.target.closest('[data-action],[data-tab]');if(!el)return;
  if(el.dataset.tab){setTab(el.dataset.tab);return}
  const action=el.dataset.action;
  if(action==='toggle-task'){const id=el.dataset.id;state.planDone[id]=!state.planDone[id];save();renderPlan();toast(state.planDone[id]?'Блок зараховано':'Позначку знято');return}
  if(action==='start-task'){startTask(el.dataset.mode);return}
  if(action==='show-readiness'){showReadiness();return}
  if(action==='start-commission'||action==='restart-commission'){startCommission();return}
  if(action==='close-overlay'){closeOverlay();return}
  if(action==='open-weak'){openWeak();return}
  if(action==='atlas-mode'){state.atlasMode=el.dataset.mode;save();renderAtlas();return}
  if(action==='person'){showPerson(el.dataset.name);return}
  if(action==='country'){$('#atlasBody').innerHTML=renderCross(el.dataset.country);return}
  if(action==='trainer-filter'){state.trainerFilter=el.dataset.filter;state.currentQuestion=pickQuestion(state.trainerFilter)?.id;revealCurrent=false;save();renderTrainer();return}
  if(action==='reveal-answer'){revealCurrent=true;renderTrainer();return}
  if(action==='next-question'){state.currentQuestion=pickQuestion(state.trainerFilter,[state.currentQuestion])?.id;revealCurrent=false;save();renderTrainer();return}
  if(action==='grade-question'){grade(el.dataset.id,Number(el.dataset.score));state.currentQuestion=pickQuestion(state.trainerFilter,[el.dataset.id])?.id;revealCurrent=false;renderTrainer();toast('Самооцінку збережено');return}
  if(action==='reveal-commission'){commission.revealed=true;overlaySheet.innerHTML=renderCommission();return}
  if(action==='grade-commission'){
    const score=Number(el.dataset.score);grade(el.dataset.id,score);commission.scores.push(score);commission.index++;commission.revealed=false;
    if(commission.index===3){state.commissionRuns++;save()}
    overlaySheet.innerHTML=renderCommission();return;
  }
}

document.addEventListener('click',handleClick);
document.addEventListener('input',event=>{
  if(event.target.id==='peopleSearch'){
    const q=event.target.value;const n=normalize(q);const list=STUDY.people.filter(p=>!n||normalize([p.name,p.country,p.school,p.idea,p.hook].join(' ')).includes(n));$('#peopleResults').innerHTML=peopleRows(list);
  }
  if(event.target.id==='notesSearch') $('#notesResults').innerHTML=notesSections(sourceSections,event.target.value);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)closeOverlay()});
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save()});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
loadSourceSections().then(sections=>{sourceSections=sections;sourceLoading=false;if(state.tab==='notes')renderNotes()});
renderReadiness();render();
