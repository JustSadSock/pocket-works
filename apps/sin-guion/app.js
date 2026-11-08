import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { GRAMMAR, TOPICS, PHRASES, DAY_PLAN, TOTAL_QUESTIONS } from './content.js';
import {
 loadState,saveState,allExercises,allPhrases,seededChoices,currentDay,dueExercises,
 recordExercise,recordPhrase,duePhrases,recordOral,groupStats,totalStats,oralPercent,uniqueTopics
} from './engine.js';

installMobileRuntime();
createWorkshopMode({
 appName:'Sin Guion',version:'1.0.0',cachePrefix:'sin-guion-',
 storageNamespace:'pocket-works:sin-guion',
 onReset(){
  try{
   localStorage.removeItem('pocket-works:sin-guion:v1');
   indexedDB.deleteDatabase('pocket-works:sin-guion:recordings');
  }catch{}
  location.reload();
 }
});
let state=loadState();
const $app=document.querySelector('#app');
const $toast=document.querySelector('#toast');
const ui={view:'home',lesson:'past',quiz:null,deck:null,oral:null,recording:null,
 audioUrl:null,elapsed:0,timerId:null,timerEnd:0,modal:null,examResults:[],
 message:'',scrollTop:0};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const group=id=>GRAMMAR.find(g=>g.id===id)||GRAMMAR[0];
const topic=id=>TOPICS.find(t=>t.id===id)||TOPICS[0];
const fmtTime=sec=>String(Math.floor(Math.max(0,sec)/60)).padStart(2,'0')+':'+String(Math.max(0,sec)%60).padStart(2,'0');
const weekday=date=>new Date(date).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
function persist(){
 if(!saveState(state))showToast('Не удалось сохранить прогресс. Проверь свободное место и настройки браузера.');
}
let toastId;
function showToast(message){
 $toast.textContent=message;$toast.classList.add('visible');
 clearTimeout(toastId);toastId=setTimeout(()=>$toast.classList.remove('visible'),4000);
}
function tag(text,clazz=''){return '<span class="tag '+clazz+'">'+esc(text)+'</span>';}
function icon(name){
 const icons={
 mic:'<circle cx="12" cy="8" r="4"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
 book:'<path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5v13c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5zM12 6v14"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
 play:'<path d="m8 5 11 7-11 7z"/>',
 refresh:'<path d="M4 8a8 8 0 0 1 14-3l2 2M20 3v4h-4M20 16a8 8 0 0 1-14 3l-2-2M4 21v-4h4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 chart:'<path d="M4 20V9m6 11V4m6 16v-8m4 8H2"/>',
 spark:'<path d="M12 2 14 10l8 2-8 2-2 8-2-8-8-2 8-2z"/>',
 chevron:'<path d="m9 6 6 6-6 6"/>',
 headphones:'<path d="M4 13V12a8 8 0 0 1 16 0v1M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm13 0h3a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-3z"/>',
 square:'<rect x="5" y="5" width="14" height="14" rx="1"/>',
 shuffle:'<path d="M4 5h3l12 14M16 5h3v3M20 4l-4 4M4 19h3l4-4M16 19h3v-3M20 20l-4-4"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 home:'<path d="m3 11 9-8 9 8v10H3zM9 21v-7h6v7"/>',
 headphones2:'<path d="M4 13V11a8 8 0 0 1 16 0v2M4 13h4v8H6a2 2 0 0 1-2-2zm12 0h4v6a2 2 0 0 1-2 2h-2z"/>'
 };
 return '<svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.arrow)+'</svg>';
}
function button(label,action,opts={}){
 const attrs=Object.entries(opts.data||{}).map(([k,v])=>' data-'+k+'="'+esc(v)+'"').join('');
 return '<button type="button" data-native-press data-action="'+esc(action)+'"'+attrs+
  ' class="btn '+(opts.className||'')+'"'+(opts.disabled?' disabled':'')+'>'+
  (opts.pre?icon(opts.pre):'')+'<span>'+esc(label)+'</span>'+(opts.post?icon(opts.post):'')+'</button>';
}
function sectionTitle(kicker,title,subtitle=''){
 return '<header class="section-title"><span class="eyebrow">'+esc(kicker)+'</span><h1 tabindex="-1">'+esc(title)+'</h1>'+
 (subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</header>';
}
function navItem(id,label,svg){
 const active=ui.view===id||(id==='grammar'&&['lesson','quiz','quizDone'].includes(ui.view))||
  (id==='topics'&&['speaking','oralResult','examDone'].includes(ui.view));
 return '<button type="button" data-native-press class="nav-item '+(active?'active':'')+'" data-action="go" data-view="'+id+'">'+icon(svg)+'<span>'+esc(label)+'</span></button>';
}
function header(){
 const day=currentDay(state),total=totalStats(state);
 return '<header class="topbar" data-ui><a class="exit" href="../../" data-app-control>← PocketWorks</a>'+
 '<div class="wordmark"><span class="logo-mini">S<span>G</span></span><strong>sin guion<span class="wordmark-dot">.</span></strong></div>'+
 '<span class="top-status">ДЕНЬ '+day+'/7 <span class="status-dot"></span> '+total.mastered+'/'+TOTAL_QUESTIONS+'</span></header>';
}
function navigation(){
 return '<aside class="left-rail" data-ui><div class="rail-kicker">ЛАБОРАТОРИЯ / 01</div>'+
 navItem('home','Сегодня','home')+navItem('grammar','Грамматика','book')+
 navItem('topics','Говорение','mic')+navItem('phrases','Фразы','spark')+
 navItem('progress','Прогресс','chart')+
 '<div class="rail-end">SIN GUION<br>ESPAÑOL / MÓDULO<br>OFFLINE EDITION</div></aside>';
}
function bottomNav(){
 return '<nav class="bottom-tabs" aria-label="Разделы" data-ui>'+
 [['home','Сегодня','home'],['grammar','Правила','book'],['topics','Речь','mic'],['phrases','Фразы','spark'],['progress','Итоги','chart']]
 .map(x=>navItem(...x)).join('')+'</nav>';
}
function home(){
 const day=currentDay(state),plan=DAY_PLAN[day-1],stats=totalStats(state);
 const last=state.oral.at(-1);
 return '<section class="home-screen animate-enter">'+
 '<div class="home-head"><span class="eyebrow">НЕДЕЛЯ ДО УСТНОГО МОДУЛЯ</span><span class="stamp">SIN IA · 100% OFFLINE</span></div>'+
 '<div class="home-grid"><div class="hero-copy"><h1>Говори.<br><em>Не зубри.</em></h1>'+
 '<p>Все 6 грамматических разделов и 7 устных тем. Твоя задача — отвечать своими словами, даже когда вопрос неожиданный.</p>'+
 '<div class="hero-actions">'+button('Начать тренировку','daily',{className:'primary',post:'arrow'})+
 button('Пробный экзамен','start-exam',{className:'outline',pre:'clock'})+'</div></div>'+
 '<div class="daily-module"><div class="module-index">ТВОЙ МАРШРУТ <span>'+String(day).padStart(2,'0')+' / 07</span></div>'+
 '<div class="day-line">'+DAY_PLAN.map((d,i)=>'<span class="'+(i+1===day?'current':i+1<day?'past':'')+'"></span>').join('')+'</div>'+
 '<div class="module-body"><div class="module-number">'+String(day).padStart(2,'0')+'</div>'+
 '<div><span class="module-caption">СЕГОДНЯШНИЙ ФОКУС</span><h2>'+esc(plan.title)+'</h2><p>'+esc(plan.tip)+'</p></div></div>'+
 '<div class="module-tags">'+plan.focus.map(id=>tag(group(id).short)).join('')+'</div></div></div>'+
 '<div class="overview-bar"><div><strong>'+stats.seen+'<span>/'+TOTAL_QUESTIONS+'</span></strong><small>Заданий изучено</small></div>'+
 '<div><strong>'+stats.oral+'</strong><small>Устных ответов</small></div>'+
 '<div><strong>'+stats.topics+'<span>/7</span></strong><small>Тем опробовано</small></div>'+
 '<div><strong>'+stats.due+'</strong><small>Ошибок к повтору*</small></div></div>'+
 '<div class="home-lower"><div class="home-subhead"><h2>Быстрый старт</h2><span>5–12 МИНУТ</span></div>'+
 '<div class="action-list"><button class="action-row" data-action="quiz-mixed" data-native-press><span class="action-icon">'+icon('book')+'</span><span><b>Грамматический спринт</b><small>8 задач · автоматическая проверка</small></span>'+icon('arrow')+'</button>'+
 '<button class="action-row" data-action="start-random-oral" data-native-press><span class="action-icon">'+icon('mic')+'</span><span><b>Ответ без сценария</b><small>Случайная тема · 90 секунд</small></span>'+icon('arrow')+'</button>'+
 '<button class="action-row" data-action="phrase-start" data-native-press><span class="action-icon">'+icon('spark')+'</span><span><b>Речевые конструкции</b><small>'+duePhrases(state).length+' карточек к повтору</small></span>'+icon('arrow')+'</button></div>'+
 (last?'<div class="recent-note">ПОСЛЕДНИЙ ОТВЕТ · '+esc(weekday(last.at))+' · '+esc(topic(last.topic).ru)+' · '+oralPercent(last)+'% по самопроверке</div>':'<div class="recent-note">* Повторение появляется после первой попытки. Никаких искусственных оценок речи.</div>')+
 '</div></section>';
}
function grammar(){
 return '<section class="content-screen animate-enter">'+sectionTitle('01 / КОНСТРУКТОР ФРАЗ','Грамматика','Открой правило, разберись в примерах и проверь его в заданиях.')+
 '<div class="grammar-list">'+GRAMMAR.map((g,i)=>{
 const s=groupStats(state,g.id),pct=Math.round(s.seen/s.total*100);
 return '<button class="grammar-row" data-action="lesson" data-id="'+g.id+'" data-native-press>'+
 '<span class="row-number">'+String(i+1).padStart(2,'0')+'</span><span class="row-main"><b>'+esc(g.title)+'</b><small>'+esc(g.description)+'</small></span>'+
 '<span class="row-side"><span>'+s.seen+'/'+s.total+'</span><i><i style="width:'+pct+'%"></i></i></span>'+icon('chevron')+'</button>';
 }).join('')+'</div><div class="section-footer">'+button('Смешанный тест · 8 задач','quiz-mixed',{className:'primary',post:'arrow'})+'</div></section>';
}
function lesson(){
 const g=group(ui.lesson),s=groupStats(state,g.id);
 return '<section class="content-screen narrow animate-enter">'+
 '<button class="breadcrumb" data-action="go" data-view="grammar" data-native-press>← Все разделы</button>'+
 sectionTitle('РАЗДЕЛ '+String(GRAMMAR.indexOf(g)+1).padStart(2,'0')+' / 06',g.title,g.description)+
 '<div class="rule-console"><span class="eyebrow">СУТЬ ПРАВИЛА</span><p>'+esc(g.rule)+'</p>'+
 '<div class="formula">'+esc(g.formula)+'</div></div>'+
 '<div class="examples-block"><h2>Примеры в речи</h2>'+g.examples.map(([es,ru])=>
 '<div class="example"><strong lang="es">'+esc(es)+'</strong><small>'+esc(ru)+'</small></div>').join('')+'</div>'+
 '<div class="lesson-foot"><div><b>'+s.seen+' из '+s.total+'</b><span>примеров потренировано</span></div>'+
 button('Тренировать · 8 вопросов','quiz-group',{className:'primary',data:{id:g.id},post:'arrow'})+'</div></section>';
}
function startQuiz(groupId='all',wrongIds=null){
 const chosen=wrongIds?.length?allExercises.filter(q=>wrongIds.includes(q.id)):dueExercises(state,Date.now(),groupId,8);
 ui.quiz={list:chosen,index:0,correct:0,results:[],answered:null,group:groupId};
 ui.view='quiz';render();
}
function quiz(){
 const q=ui.quiz;if(!q||!q.list.length)return '<div class="empty">Нет заданий. '+button('Вернуться','go',{data:{view:'grammar'}})+'</div>';
 const ex=q.list[q.index],n=q.list.length,answers=seededChoices(ex);
 const answered=q.answered;
 return '<section class="test-screen animate-enter">'+
 '<div class="test-top"><button class="breadcrumb" data-action="quit-quiz" data-native-press>← Прервать тест</button><span class="eyebrow">ЗАДАНИЕ '+(q.index+1)+' / '+n+'</span></div>'+
 '<div class="progress-line"><span style="width:'+Math.round(q.index/n*100)+'%"></span></div>'+
 '<div class="test-main"><div class="test-lead"><span class="eyebrow">'+esc(group(ex.group).title)+'</span>'+
 '<h1 lang="es">'+esc(ex.question).replace('___','<mark>___</mark>')+'</h1>'+
 '<p>Выбери правильный вариант.</p></div>'+
 '<div class="answer-board">'+answers.map((choice,i)=>{
 const selected=answered?.choice===choice;
 const klass=answered?(choice===ex.answer?'correct':selected?'incorrect':'muted'):'';
 return '<button type="button" data-native-press class="answer-choice '+klass+'" data-action="answer" data-choice="'+i+'"'+(answered?' disabled':'')+'>'+
 '<span class="choice-letter">'+String.fromCharCode(65+i)+'</span><b>'+esc(choice)+'</b>'+(answered&&choice===ex.answer?icon('check'):'')+'</button>';
 }).join('')+'</div>'+
 (answered?'<div class="feedback '+(answered.correct?'success':'failure')+'">'+
 '<b>'+(answered.correct?'Верно.':'Почти. Правильный ответ: '+esc(ex.answer))+'</b><p>'+esc(ex.why)+'</p></div>':'')+'</div>'+
 '<div class="test-footer">'+(answered?button(q.index+1===n?'Завершить тест':'Следующий вопрос','next-answer',{className:'primary',post:'arrow'}):
 '<span>Ответ проверяется сразу. Ошибки пойдут на повторение.</span>')+'</div></section>';
}
function quizDone(){
 const q=ui.quiz,score=Math.round(q.correct/q.list.length*100);
 const misses=q.results.filter(x=>!x.correct).map(x=>x.id);
 return '<section class="result-screen animate-enter">'+
 '<span class="eyebrow">ТРЕНИРОВКА ЗАВЕРШЕНА</span><div class="result-figure"><span>'+score+'</span><small>%</small></div>'+
 '<h1>'+(score>=85?'Отличный темп.':score>=60?'Основа есть.':'Есть что добить.')+'</h1>'+
 '<p>Правильно: '+q.correct+' из '+q.list.length+'. Результат основан только на проверяемых заданиях.</p>'+
 '<div class="result-actions">'+(misses.length?button('Повторить ошибки · '+misses.length,'retry-wrong',{className:'primary',post:'refresh'}):button('Ещё 8 заданий','quiz-mixed',{className:'primary',post:'arrow'}))+
 button('К разделам','go',{className:'outline',data:{view:'grammar'}})+'</div></section>';
}
function topics(){
 return '<section class="content-screen animate-enter">'+sectionTitle('02 / ПРАКТИКА БЕЗ СЦЕНАРИЯ','Говорение','Не ищи идеальную формулировку. Построй собственный ответ и оцени его.')+
 '<div class="topic-intro"><div><span class="eyebrow">ФОРМАТ</span><b>30 сек. подумать → 90 сек. говорить → честная самопроверка</b></div>'+
 button('Пробный модуль · 3 вопроса','start-exam',{className:'primary',post:'arrow'})+'</div>'+
 '<div class="topic-list">'+TOPICS.map(t=>{
 const n=state.oral.filter(o=>o.topic===t.id).length;
 return '<button class="topic-row" data-action="start-topic" data-id="'+t.id+'" data-native-press>'+
 '<span class="topic-serial">'+esc(t.badge)+'</span><span class="topic-main"><b lang="es">'+esc(t.title)+'</b><small>'+esc(t.ru)+' · '+t.questions.length+' вопросов</small></span>'+
 '<span class="topic-count">'+(n?n+' ОТВ.':'НОВОЕ')+'</span>'+icon('arrow')+'</button>';
 }).join('')+'</div></section>';
}
function chooseQuestion(t){
 const previous=state.oral.filter(o=>o.topic===t.id);
 const order=t.questions.map((q,i)=>({q,i,used:previous.filter(p=>p.question===q).length}));
 order.sort((a,b)=>a.used-b.used||a.i-b.i);
 return order[0]?.q||t.questions[0];
}
function makeOralItem(topicId,ordinal=0){
 const t=topic(topicId),qid=chooseQuestion(t);
 return {topicId:t.id,question:qid,grammar:t.targets[(state.oral.filter(o=>o.topic===t.id).length+ordinal)%t.targets.length]};
}
function startOral(topicId=null,mode='solo'){
 teardownAudio();
 const ids=mode==='exam'?uniqueTopics(state,TOPICS.map(t=>t.id),3):[topicId||TOPICS[(state.oral.length+currentDay(state))%TOPICS.length].id];
 const queue=ids.map((id,i)=>makeOralItem(id,i));
 ui.oral={mode,queue,index:0,stage:'prepare',seconds:0,checklist:[false,false,false,false,false],
  note:'',audioId:null,audioUrl:null,hasAudio:false,micAvailable:true,processing:false,start:0};
 ui.examResults=[];ui.view='speaking';render();startTimer(30,()=>{const label=document.querySelector('#timer-caption');if(label)label.textContent='Время подготовки вышло. Можно начинать.';});
}
function oral(){
 const o=ui.oral,item=o.queue[o.index],t=topic(item.topicId);
 const isPrep=o.stage==='prepare',isSpeaking=o.stage==='speaking',isReview=o.stage==='review';
 const count=o.mode==='exam'?'ВОПРОС '+(o.index+1)+'/3':'УСТНАЯ ПРАКТИКА';
 return '<section class="oral-screen animate-enter"><div class="oral-top"><button class="breadcrumb" data-action="leave-oral" data-native-press>← Завершить</button>'+
 '<span class="eyebrow">'+count+'</span></div>'+
 '<div class="oral-grid"><div class="oral-stage"><span class="stage-id">'+esc(t.badge)+'</span><span class="stage-ru">'+esc(t.ru)+'</span>'+
 '<h1 lang="es">'+esc(item.question)+'</h1>'+
 '<div class="oral-target"><span>ГРАММАТИЧЕСКИЙ ОРИЕНТИР</span><b>'+esc(group(item.grammar).title)+'</b></div>'+
 (isPrep?'<div class="hint-pool"><span class="eyebrow">ИДЕИ ДЛЯ ОТВЕТА</span>'+t.starters.map(s=>'<span lang="es">'+esc(s)+'</span>').join('')+'</div>':'')+
 '</div><div class="recorder"><span class="eyebrow">LANGUAGE LAB / RECORDER</span>'+
 '<div class="timer-face '+(isSpeaking?'recording':'')+'"><div class="timer-circle"><div class="timer-needle"></div><span class="timer-digits">'+fmtTime(isPrep?30:isSpeaking?90:o.seconds)+'</span></div>'+
 '<span id="timer-caption">'+(isPrep?'Время на подготовку':isSpeaking?'Идёт ответ':'Ответ записан')+'</span></div>'+
 (isPrep?'<div class="record-actions">'+button('Начать ответ','start-speaking',{className:'primary',pre:'mic'})+
 '<small>Если микрофон недоступен, можно пройти этап с таймером без записи.</small></div>':
 isSpeaking?'<div class="record-actions">'+button('Закончить ответ','stop-speaking',{className:'danger',pre:'square'})+
 '<small>'+(o.micAvailable?'Записываем только на этом устройстве.':'Запись недоступна. Идёт таймер ответа.')+'</small></div>':
 isReview?'<div class="recorder-ready"><b>Ответ завершён</b><p>'+fmtTime(o.seconds)+' устной практики</p>'+
 (o.audioUrl?'<audio class="audio-player" controls preload="metadata" src="'+esc(o.audioUrl)+'"></audio>':
 '<p class="recorder-info">Аудиозаписи нет. Ты всё равно можешь оценить ответ.</p>')+'</div>':'')+
 '</div></div>'+
 (isReview?reviewPanel():'<div class="oral-footnote">Запись и самопроверка хранятся локально. Автоматической оценки свободной речи нет.</div>')+
 '</section>';
}
function reviewPanel(){
 const o=ui.oral;
 const labels=['Я ответил на вопрос по существу','Я сказал не менее пяти предложений','Я попытался использовать указанную грамматику','Я привёл конкретный пример','Моя речь была связной, без долгих пауз'];
 return '<section class="review-panel"><div class="review-head"><div><span class="eyebrow">ПОСЛЕ ЗАПИСИ</span><h2>Проверь себя</h2></div>'+
 '<span class="review-counter">'+o.checklist.filter(Boolean).length+' / 5</span></div>'+
 '<div class="review-checks">'+labels.map((l,i)=>'<button type="button" data-action="toggle-check" data-index="'+i+
 '" aria-pressed="'+Boolean(o.checklist[i])+'" class="review-check '+(o.checklist[i]?'checked':'')+'" data-native-press>'+
 '<span class="check-square">'+(o.checklist[i]?icon('check'):'')+'</span>'+esc(l)+'</button>').join('')+'</div>'+
 '<label class="note-label" for="oral-note">Что было сложно? (необязательно)</label><textarea id="oral-note" maxlength="1600" rows="2" placeholder="Например: перепутал subjuntivo и futuro...">'+esc(o.note)+'</textarea>'+
 '<div class="review-submit">'+button(o.processing?'Сохраняем аудио…':o.mode==='exam'&&o.index<2?'Сохранить и следующий вопрос':'Сохранить результат','save-oral',{className:'primary',post:'arrow',disabled:o.processing})+'</div></section>';
}
function oralResult(){
 const entry=state.oral.at(-1);
 if(!entry)return home();
 const t=topic(entry.topic);
 return '<section class="result-screen animate-enter"><span class="eyebrow">УСТНЫЙ ОТВЕТ СОХРАНЁН</span>'+
 '<div class="result-figure"><span>'+oralPercent(entry)+'</span><small>%</small></div>'+
 '<h1>Ответ записан.</h1><p>'+esc(t.title)+' · '+fmtTime(entry.seconds)+
 '. Процент отражает только твою самопроверку, а не оценку учителя.</p>'+
 '<div class="result-actions">'+button('Ещё один вопрос','start-random-oral',{className:'primary',post:'arrow'})+
 button('Мой прогресс','go',{className:'outline',data:{view:'progress'}})+'</div></section>';
}
function examDone(){
 const rows=ui.examResults.map(o=>'<div class="exam-row"><span>'+esc(topic(o.topic).ru)+'</span><strong>'+oralPercent(o)+'%</strong></div>').join('');
 const avg=ui.examResults.length?Math.round(ui.examResults.reduce((s,o)=>s+oralPercent(o),0)/ui.examResults.length):0;
 return '<section class="result-screen animate-enter"><span class="eyebrow">ЭКЗАМЕН ЗАВЕРШЁН</span><div class="result-figure"><span>'+avg+'</span><small>%</small></div>'+
 '<h1>Три ответа. Без сценария.</h1><p>Средний результат по собственному чек-листу. Прослушай записи в разделе «Прогресс», чтобы найти слабые места.</p>'+
 '<div class="exam-results">'+rows+'</div><div class="result-actions">'+button('Пройти заново','start-exam',{className:'primary'})+
 button('История и записи','go',{className:'outline',data:{view:'progress'}})+'</div></section>';
}
function phrases(){
 if(ui.deck){
 const d=ui.deck,p=d.cards[d.index];
 if(!p)return '<section class="result-screen"><h1>Повторение завершено.</h1><p>Все карточки в этой сессии оценены. Вернись завтра или повтори колоду вручную.</p>'+
 '<div class="result-actions">'+button('Повторить все','phrase-all',{className:'primary'})+button('Вернуться','exit-deck',{className:'outline'})+'</div></section>';
 return '<section class="flash-screen animate-enter"><div class="test-top"><button class="breadcrumb" data-action="exit-deck" data-native-press>← Все фразы</button><span class="eyebrow">КАРТОЧКА '+(d.index+1)+' / '+d.cards.length+'</span></div>'+
 '<div class="progress-line"><span style="width:'+Math.round(d.index/d.cards.length*100)+'%"></span></div>'+
 '<div class="flash-center"><div class="flash-card '+(d.revealed?'flipped':'')+'"><span>ESPAÑOL → РУССКИЙ</span>'+
 '<h1 lang="es">'+esc(p.front)+'</h1>'+(d.revealed?'<p>'+esc(p.back)+'</p>':'<p class="flash-hint">Вспомни перевод и типичное использование.</p>')+
 '</div></div><div class="flash-actions">'+(d.revealed?
 button('Не вспомнил','grade-phrase',{className:'outline',data:{known:'0'}})+button('Знаю','grade-phrase',{className:'primary',data:{known:'1'},pre:'check'}):
 button('Показать перевод','reveal-phrase',{className:'primary'}))+'</div></section>';
 }
 const due=duePhrases(state);
 return '<section class="content-screen animate-enter">'+sectionTitle('03 / РЕЧЕВОЙ АРСЕНАЛ','Готовые кирпичики','Не заучивай монолог целиком — собирай ответы из конструкций.')+
 '<div class="phrase-hero"><div><span class="eyebrow">ACTIVE RECALL</span><h2>'+due.length+' <small>/ '+PHRASES.length+'</small></h2><p>Карточек для изучения или повторения сейчас</p></div>'+
 button('Начать карточки','phrase-start',{className:'primary',post:'arrow'})+'</div>'+
 '<div class="phrase-list">'+PHRASES.map((p,i)=>'<div><span>'+String(i+1).padStart(2,'0')+'</span><b lang="es">'+esc(p[0])+'</b><small>'+esc(p[1])+'</small></div>').join('')+'</div>'+
 '<div class="section-footer">'+button('Повторить все фразы','phrase-all',{className:'outline'})+'</div></section>';
}
function progress(){
 const s=totalStats(state),logs=[...state.oral].reverse();
 return '<section class="content-screen animate-enter">'+sectionTitle('04 / МОЯ ТРАЕКТОРИЯ','Прогресс','Только реальные ответы и решённые упражнения. Без искусственных рейтингов.')+
 '<div class="stat-panels"><div><strong>'+s.seen+'/'+TOTAL_QUESTIONS+'</strong><span>Встречено заданий</span></div>'+
 '<div><strong>'+s.mastered+'</strong><span>Повторено успешно дважды</span></div>'+
 '<div><strong>'+(s.accuracy===null?'—':s.accuracy+'%')+'</strong><span>Точность упражнений</span></div>'+
 '<div><strong>'+s.oral+'</strong><span>Записано ответов</span></div></div>'+
 '<div class="progress-chapters"><h2>Шесть блоков</h2>'+GRAMMAR.map(g=>{
 const p=groupStats(state,g.id),pct=p.accuracy??0;
 return '<button type="button" class="skill-row" data-native-press data-action="lesson" data-id="'+g.id+'">'+
 '<span>'+esc(g.short)+'</span><span class="skill-bar"><i style="width:'+pct+'%"></i></span>'+
 '<b>'+(p.accuracy===null?'—':p.accuracy+'%')+'</b></button>';
 }).join('')+'</div>'+
 '<div class="history"><h2>История устных ответов</h2>'+
 (logs.length?logs.map(o=>'<article class="history-item"><div><span>'+esc(weekday(o.at))+' · '+fmtTime(o.seconds)+'</span><b>'+esc(topic(o.topic).ru)+'</b><small>'+esc(o.question)+'</small>'+
 (o.note?'<p>Заметка: '+esc(o.note)+'</p>':'')+'</div><div class="history-ops"><b>'+oralPercent(o)+'%</b>'+
 (o.audio?'<button type="button" data-action="load-audio" data-id="'+esc(o.id)+'" data-native-press>Слушать</button>':'')+
 '<button type="button" data-action="ask-delete" data-id="'+esc(o.id)+'" data-native-press>Удалить</button></div>'+
 '<div class="history-audio" data-audio="'+esc(o.id)+'"></div></article>').join(''):
 '<div class="empty-state"><p>Пока нет устных ответов.</p>'+button('Записать первый','start-random-oral',{className:'primary'})+'</div>')+'</div></section>';
}
function modal(){
 if(!ui.modal)return '';
 const m=ui.modal;
 return '<div class="overlay" role="presentation"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">'+
 '<span class="eyebrow">ПОДТВЕРЖДЕНИЕ</span><h2 id="dialog-title">'+esc(m.title)+'</h2><p>'+esc(m.body)+'</p>'+
 '<div>'+button('Отмена','cancel-modal',{className:'outline'})+button(m.confirm,'confirm-modal',{className:'danger'})+'</div></div></div>';
}
function render(){
 const main={
 home,grammar,lesson,quiz,quizDone,topics,speaking:oral,oralResult,examDone,phrases,progress
 }[ui.view]||home;
 $app.innerHTML=header()+'<div class="app-layout">'+navigation()+
 '<main id="screen" class="screen-main" aria-label="Sin Guion">'+main()+'</main></div>'+
 bottomNav()+modal();
 document.title='Sin Guion · '+({home:'Сегодня',grammar:'Грамматика',topics:'Говорение',progress:'Прогресс'}[ui.view]||'Тренировка');
}
function goto(view){
 if(ui.view==='speaking'&&ui.oral?.stage==='speaking'){
  ui.modal={title:'Прервать запись?',body:'Текущий ответ не будет добавлен в историю.',confirm:'Прервать',action:'leave',view};
  render();return;
 }
 clearTimer();if(ui.view==='speaking')teardownAudio();
 ui.view=view;ui.deck=null;ui.modal=null;render();window.scrollTo({top:0,behavior:'instant'});
}
function startTimer(seconds,done){
 clearTimer();ui.timerEnd=Date.now()+seconds*1000;
 const paint=()=>{
  const left=Math.max(0,Math.ceil((ui.timerEnd-Date.now())/1000));
  const node=document.querySelector('.timer-digits');if(node)node.textContent=fmtTime(left);
  if(left<=0){clearTimer();done();}
 };
 paint();ui.timerId=setInterval(paint,250);
}
function clearTimer(){if(ui.timerId){clearInterval(ui.timerId);ui.timerId=null;}}
function teardownAudio(){
 clearTimer();
 if(ui.recording?.state==='recording'){try{ui.recording.onstop=null;ui.recording.stop();}catch{}}
 ui.recording=null;
 if(ui.stream){ui.stream.getTracks().forEach(track=>track.stop());ui.stream=null;}
 if(ui.audioUrl){URL.revokeObjectURL(ui.audioUrl);ui.audioUrl=null;}
}
let databasePromise;
function db(){
 if(!('indexedDB'in window))return Promise.reject(new Error('IndexedDB unavailable'));
 if(!databasePromise)databasePromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open('pocket-works:sin-guion:recordings',1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('audio'))r.result.createObjectStore('audio',{keyPath:'id'});};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Database error'));
 }).catch(err=>{databasePromise=null;throw err;});
 return databasePromise;
}
async function saveAudio(id,blob){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('audio','readwrite');tx.objectStore('audio').put({id,blob,at:Date.now()});
  tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);
 });
}
async function readAudio(id){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('audio','readonly');const req=tx.objectStore('audio').get(id);
  req.onsuccess=()=>resolve(req.result?.blob||null);req.onerror=()=>reject(req.error);
 });
}
async function removeAudio(id){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('audio','readwrite');tx.objectStore('audio').delete(id);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
async function startSpeaking(){
 const o=ui.oral;if(!o||o.stage!=='prepare')return;
 clearTimer();o.stage='speaking';o.start=Date.now();o.micAvailable=false;
 render();startTimer(90,stopSpeaking);
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
  showToast('Микрофон или запись не поддерживаются. Таймер и самопроверка доступны.');return;
 }
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(ui.oral!==o||o.stage!=='speaking'){stream.getTracks().forEach(t=>t.stop());return;}
  ui.stream=stream;
  const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];
  const supported=types.find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(stream,supported?{mimeType:supported}:undefined);
  const chunks=[];ui.recording=recorder;o.micAvailable=true;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onerror=()=>showToast('Запись прервалась. Можно завершить и оценить ответ без аудио.');
  recorder.onstop=async()=>{
   if(ui.oral!==o)return;
   if(chunks.length){
    const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0].type||'audio/webm'});
    const id='oral-'+Date.now()+'-'+Math.floor(Math.random()*1e6);
    o.audioId=id;o.audioUrl=URL.createObjectURL(blob);ui.audioUrl=o.audioUrl;
    try{await saveAudio(id,blob);o.hasAudio=true;}
    catch{showToast('Не удалось сохранить аудио на устройство. В этой сессии оно доступно.');o.hasAudio=false;}
   }
   o.processing=false;
   if(o.stage==='review')render();
  };
  recorder.start(1000);
  const caption=document.querySelector('#timer-caption');if(caption)caption.textContent='Микрофон записывает';
 }catch(error){
  o.micAvailable=false;showToast(error?.name==='NotAllowedError'?'Доступ к микрофону запрещён. Ответ можно произнести без записи.':'Микрофон недоступен. Продолжай устно с таймером.');
  const caption=document.querySelector('#timer-caption');if(caption)caption.textContent='Таймер без записи';
 }
}
function stopSpeaking(){
 const o=ui.oral;if(!o||o.stage!=='speaking')return;
 clearTimer();o.seconds=Math.max(1,Math.min(90,Math.ceil((Date.now()-o.start)/1000)));
 o.stage='review';
 o.processing=ui.recording?.state==='recording';
 if(ui.recording?.state==='recording')try{ui.recording.stop();}catch{o.processing=false;}
 if(ui.stream){ui.stream.getTracks().forEach(t=>t.stop());ui.stream=null;}
 render();
}
function finishOral(){
 const o=ui.oral;if(!o||o.stage!=='review')return;
 if(o.processing){showToast('Аудио ещё сохраняется.');return;}
 const item=o.queue[o.index];
 const entry={id:o.audioId||'oral-'+Date.now()+'-'+o.index,topic:item.topicId,question:item.question,
  grammar:item.grammar,seconds:o.seconds,checklist:[...o.checklist],note:o.note,at:Date.now(),
  audio:o.hasAudio,exam:o.mode==='exam'};
 state=recordOral(state,entry);persist();
 if(o.mode==='exam')ui.examResults.push(state.oral.at(-1));
 const next=o.mode==='exam'&&o.index<o.queue.length-1;
 teardownAudio();
 if(next){
  o.index++;o.stage='prepare';o.checklist=[false,false,false,false,false];o.note='';
  o.seconds=0;o.start=0;o.audioId=null;o.audioUrl=null;o.hasAudio=false;o.processing=false;
  ui.view='speaking';render();startTimer(30,()=>{const caption=document.querySelector('#timer-caption');if(caption)caption.textContent='Время подготовки вышло. Можно начинать.';});
 }else{ui.view=o.mode==='exam'?'examDone':'oralResult';ui.oral=null;render();}
}
function showDeck(all=false){
 const cards=all?allPhrases:duePhrases(state);
 ui.deck={cards:cards.length?cards:allPhrases,index:0,revealed:false};ui.view='phrases';render();
}
$app.addEventListener('input',event=>{
 if(event.target.id==='oral-note'&&ui.oral)ui.oral.note=event.target.value;
});
$app.addEventListener('click',async event=>{
 const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
 const action=target.dataset.action;
 if(action==='go'){goto(target.dataset.view);return;}
 if(action==='daily'){
  const plan=DAY_PLAN[currentDay(state)-1];if(currentDay(state)===6){startOral(null,'exam');return;}
  startQuiz(plan.focus[0]);return;
 }
 if(action==='lesson'){ui.lesson=target.dataset.id;goto('lesson');return;}
 if(action==='quiz-mixed'){startQuiz();return;}
 if(action==='quiz-group'){startQuiz(target.dataset.id);return;}
 if(action==='quit-quiz'){goto('grammar');return;}
 if(action==='answer'){
  const q=ui.quiz;if(q.answered)return;
  const ex=q.list[q.index],choice=seededChoices(ex)[Number(target.dataset.choice)];
  const correct=choice===ex.answer;q.answered={choice,correct};
  q.results.push({id:ex.id,correct});if(correct)q.correct++;
  state=recordExercise(state,ex.id,correct);persist();render();return;
 }
 if(action==='next-answer'){
  const q=ui.quiz;if(!q?.answered)return;
  if(q.index+1>=q.list.length){state={...state,practiceCount:state.practiceCount+1};persist();ui.view='quizDone';}
  else{q.index++;q.answered=null;}
  render();return;
 }
 if(action==='retry-wrong'){startQuiz(ui.quiz?.group||'all',ui.quiz.results.filter(x=>!x.correct).map(x=>x.id));return;}
 if(action==='start-exam'){startOral(null,'exam');return;}
 if(action==='start-random-oral'){startOral();return;}
 if(action==='start-topic'){startOral(target.dataset.id);return;}
 if(action==='start-speaking'){startSpeaking();return;}
 if(action==='stop-speaking'){stopSpeaking();return;}
 if(action==='toggle-check'){
  if(ui.oral?.stage!=='review')return;
  const i=Number(target.dataset.index);if(i>=0&&i<5)ui.oral.checklist[i]=!ui.oral.checklist[i];
  render();return;
 }
 if(action==='save-oral'){finishOral();return;}
 if(action==='leave-oral'){goto('topics');return;}
 if(action==='phrase-start'){showDeck();return;}
 if(action==='phrase-all'){showDeck(true);return;}
 if(action==='exit-deck'){ui.deck=null;goto('phrases');return;}
 if(action==='reveal-phrase'){ui.deck.revealed=true;render();return;}
 if(action==='grade-phrase'){
  const d=ui.deck,p=d.cards[d.index];state=recordPhrase(state,p.id,target.dataset.known==='1');persist();
  d.index++;d.revealed=false;render();return;
 }
 if(action==='load-audio'){
  const holder=$app.querySelector('[data-audio="'+CSS.escape(target.dataset.id)+'"]');
  if(!holder)return;
  if(holder.querySelector('audio')){holder.innerHTML='';return;}
  target.disabled=true;target.textContent='Загрузка…';
  try{
   const blob=await readAudio(target.dataset.id);if(!blob)throw Error('Missing audio');
   const url=URL.createObjectURL(blob);
   const audio=document.createElement('audio');audio.controls=true;audio.src=url;audio.preload='metadata';
   audio.addEventListener('emptied',()=>URL.revokeObjectURL(url),{once:true});
   holder.replaceChildren(audio);
  }catch{showToast('Аудиозапись не найдена на этом устройстве.');}
  target.disabled=false;target.textContent='Слушать';return;
 }
 if(action==='ask-delete'){
  ui.modal={title:'Удалить этот ответ?',body:'Запись и отметки самопроверки исчезнут с этого устройства.',confirm:'Удалить',action:'delete',id:target.dataset.id};
  render();return;
 }
 if(action==='cancel-modal'){ui.modal=null;render();return;}
 if(action==='confirm-modal'){
  const m=ui.modal;ui.modal=null;
  if(m.action==='leave'){teardownAudio();ui.oral=null;ui.view=m.view||'topics';render();}
  if(m.action==='delete'){
   state={...state,oral:state.oral.filter(o=>o.id!==m.id)};persist();
   try{await removeAudio(m.id);}catch{showToast('Запись удалена из журнала, но файл мог остаться в памяти браузера.');}
   render();
  }
 }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ui.oral?.stage==='speaking')stopSpeaking();});
window.addEventListener('pagehide',()=>{persist();if(ui.recording?.state==='recording')try{ui.recording.stop();}catch{}});
render();
