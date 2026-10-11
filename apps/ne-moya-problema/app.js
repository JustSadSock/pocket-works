import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {ROLES,CASES,resolveRound,initial,validate} from './data.js';
import {drawRoom} from './scene.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
installMobileRuntime();
const STORAGE='pocket-works:ne-moya-problema:session:1';
const screen=document.querySelector('#screen'),stage=document.querySelector('#room-stage'),stamp=document.querySelector('#case-stamp'),caption=document.querySelector('#world-caption'),progress=document.querySelector('#progress');
const modal=document.querySelector('#modal'),soundButton=document.querySelector('#sound'),toast=document.querySelector('#toast');
const phases=new Set(['home','roster','handoff','choice','outcome','blameHand','blame','report','finished']);
let state=load();
let audio=null,toastTimer=null;
function load(){
 try{const data=validate(JSON.parse(localStorage.getItem(STORAGE)));if(data&&phases.has(data.phase))return {...initial(),...data,players:data.players.map(n=>String(n).slice(0,28)),scores:data.scores.map(x=>Number.isFinite(+x)?+x:0)}}catch{}
 return initial();
}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{}}
function esc(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function incident(){return CASES.find(c=>c.id===state.caseIds[state.round])||CASES[0]}
function role(i){return ROLES[(i+state.round*3)%ROLES.length]}
function button(action,label,style='big-primary'){return '<button type="button" class="'+style+'" data-action="'+action+'" data-native-press>'+label+'</button>'}
function headline(meta,title,body){return '<div class="poster-head"><span class="eyebrow">'+esc(meta)+'</span><h2>'+esc(title)+'</h2>'+(body?'<p>'+esc(body)+'</p>':'')+'</div>'}
function notify(t){clearTimeout(toastTimer);toast.textContent=t;toast.classList.add('active');toastTimer=setTimeout(()=>toast.classList.remove('active'),2100)}
function tone(type='tap'){
 if(!state.sound)return;
 try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
 if(!audio)audio=new AC();if(audio.state==='suspended')audio.resume();
 const now=audio.currentTime,o=audio.createOscillator(),gain=audio.createGain();
 o.type=type==='confirm'?'triangle':'sine';o.frequency.setValueAtTime(type==='confirm'?440:type==='error'?180:310,now);o.frequency.exponentialRampToValueAtTime(type==='confirm'?560:type==='error'?110:230,now+.12);
 gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.06,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.2);
 o.connect(gain).connect(audio.destination);o.start(now);o.stop(now+.21);
 }catch{}
}
function pulse(type){tone(type);if(type==='confirm'&&navigator.vibrate)try{navigator.vibrate(14)}catch{}}
function write(next){state.phase=next;persist();render()}
function begin(){
 const players=state.players.map((name,i)=>String(name||'').trim().slice(0,24)||'Игрок '+(i+1));
 const ids=CASES.map(c=>c.id);
 for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]]}
 state={...initial(),players,scores:players.map(()=>0),caseIds:ids.slice(0,3),phase:'handoff',round:0,index:0,sound:state.sound};
 pulse('confirm');persist();render();
}
function takeAction(id){
 if(state.phase!=='choice'||!Number.isInteger(id)||id<0||id>2)return;
 state.actions[state.index]=id;
 pulse('confirm');
 if(state.index===state.players.length-1){state.result=resolveRound(state.players,state.round,incident().id,state.actions,{});write('outcome')}
 else {state.index++;write('handoff')}
}
function castVote(i){
 if(state.phase!=='blame'||!Number.isInteger(i)||i<0||i>=state.players.length||i===state.index)return;
 state.votes[state.index]=i;pulse('confirm');
 if(state.index!==state.players.length-1){state.index++;write('blameHand');return}
 state.result=resolveRound(state.players,state.round,incident().id,state.actions,state.votes);
 const result=state.result;
 state.scores=state.scores.map((v,index)=>v+result.scores[index].total);
 state.history.push({caseId:incident().id,culprit:result.culprit,stats:result.stats});
 write('report');
}
function nextRound(){
 if(state.round>=2){pulse('confirm');write('finished');return}
 state.round++;state.index=0;state.actions={};state.votes={};state.result=null;
 pulse('confirm');write('handoff');
}
function newGame(){state={...initial(),sound:state.sound};persist();write('roster')}
function pips(){return '<div class="progress-pips">'+[0,1,2].map(i=>'<div class="pip '+(i<state.round?'done':i===state.round?'current':'')+'"></div>').join('')+'</div>'}
function statsHtml(s){
 const items=[['ЛЮДИ',s.safe],['БЮДЖЕТ',s.cash],['ИМИДЖ',s.rep]];
 return '<div class="stats">'+items.map(([label,val])=>'<div class="stat '+(val<40?'bad':'')+'"><span class="stat-label">'+label+'</span><div class="stat-value">'+val+'</div><div class="stat-track"><div class="stat-bar" style="width:'+val+'%"></div></div></div>').join('')+'</div>';
}
function rankings(final=false){
 const names=state.players.map((name,i)=>({name,i,score:state.scores[i]})).sort((a,b)=>b.score-a.score);
 return '<div class="leaderboard">'+names.map((p,i)=>'<div class="leader-line"><span class="rank">'+String(i+1).padStart(2,'0')+'</span><span class="leader-name">'+esc(p.name)+(final&&i===0?' · ПОЧЁТНЫЙ НЕВИНОВНЫЙ':'')+'<span class="row-sub">'+esc(ROLES[(p.i+(Math.max(0,state.round))*3)%8].name)+'</span></span><span class="leader-score">'+p.score+'</span></div>').join('')+'</div>';
}
function render(){
 if(!phases.has(state.phase)){state.phase='home';persist()}
 const c=incident(),phase=state.phase,report=phase==='report'||phase==='finished',selected=state.result?.stats;
 stage.innerHTML=drawRoom(phase==='home'||phase==='roster'?'bear':report||phase==='outcome'?c.id:c.id,phase,report||phase==='outcome'?selected:null);
 stamp.textContent=phase==='home'||phase==='roster'?'ДЕЛО № 000':'ДЕЛО № '+String(state.round+1).padStart(3,'0');
 caption.textContent=phase==='home'?'ОТКРЫТО В СЛУЧАЕ ЧРЕЗВЫЧАЙНОЙ ГЛУПОСТИ':phase==='finished'?'ДЕЛО ЗАКРЫТО. ПЕРСОНАЛ НЕ НАЙДЕН.':c.anchor;
 progress.textContent=phase==='home'||phase==='roster'?'СЕЗОН 01': 'ДЕЛО '+(state.round+1)+' / 3';
 soundButton.textContent=state.sound?'Звук: вкл.':'Звук: выкл.';
 let html='';
 if(phase==='home'){
  html='<div class="ribbon">РАБОТАЕМ ВОПРЕКИ</div><div class="poster-head"><span class="eyebrow">КОМАНДНАЯ ИГРА / 3–8 СОТРУДНИКОВ</span><h1>НЕ МОЯ<br>ПРОБЛЕМА</h1><p>Спасайте организацию от абсурдных катастроф. Выполняйте тайные поручения. В конце убедите всех, что виноват кто-то другой.</p></div>'+
  '<div style="margin-top:14px">'+button('roster','Открыть бюро →')+'</div>'+
  '<p class="micro" style="margin-top:17px">3 чрезвычайных происшествия · 6–20 минут · один телефон передаётся по кругу · без интернета</p>';
 }
 if(phase==='roster'){
  html=headline('КАДРОВЫЙ ОТДЕЛ','Состав персонала','Назовите сотрудников. Телефон будет передаваться каждому по очереди: личные поручения и решения увидит только текущий игрок.');
  html+='<div class="players">'+state.players.map((p,i)=>'<label class="player-line"><span class="player-num">'+(i+1)+'.</span><input class="player-name" type="text" data-player="'+i+'" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Имя игрока '+(i+1)+'" value="'+esc(p)+'"><button type="button" class="remove-player" aria-label="Удалить игрока '+(i+1)+'" data-action="remove" data-index="'+i+'" '+(state.players.length<=3?'disabled':'')+'>×</button></label>').join('')+'</div>';
  html+='<button class="add-player" type="button" data-action="add" '+(state.players.length>=8?'disabled':'')+'>+ Добавить сотрудника ('+state.players.length+'/8)</button>';
  html+=button('start','Начать происшествие →')+'<div class="fineprint">После начала состав и роли фиксируются на 3 раунда.</div>';
 }
 if(phase==='handoff'||phase==='blameHand'){
  const accusation=phase==='blameHand';
  html='<span class="eyebrow">'+(accusation?'СЕКРЕТНОЕ СЛЕДСТВИЕ':'ПЕРЕДАТЬ ТЕЛЕФОН')+' · '+(state.index+1)+' из '+state.players.length+'</span>'+
  '<div class="envelope"><span class="serial">ЛИЧНО В РУКИ</span><div class="seal">Б</div><h2>'+esc(state.players[state.index])+'</h2><p>'+(accusation?'Вам предстоит назвать виновного. Ваш выбор скрыт от остальных.':'Не показывайте своё служебное задание соседям.')+'</p></div>';
  html+=accusation?button('openBlame','Я готов обвинить →'):button('open','Вскрыть конверт →');
  html+='<div class="fineprint">'+(accusation?'Чужие голоса будут раскрыты после последнего обвинения.':'Каждый получит одну должность и одно тайное распоряжение.')+'</div>';
 }
 if(phase==='choice'){
  const job=role(state.index);
  html='<span class="eyebrow">'+esc(c.title)+' / СОТРУДНИК '+(state.index+1)+'</span>'+
  '<div class="role-ticket"><div class="role-seal">'+esc(job.sig)+'</div><div><div class="ticket-title">'+esc(job.name)+'</div><div class="ticket-sub">СЕКРЕТНО: '+esc(job.goal)+'</div></div></div>'+
  '<p>'+esc(c.subtitle)+'</p><div class="section-label">ВАШЕ РАСПОРЯЖЕНИЕ · ОДИН ВЫБОР</div>'+
  '<div class="choices">'+job.actions.map((a,i)=>'<button type="button" class="choice" data-action="choose" data-index="'+i+'" data-native-press><span class="choice-num">'+(i+1)+'</span><span><span class="choice-title">'+esc(a[0])+'</span><span class="choice-sub">'+esc(a[1])+'</span></span></button>').join('')+'</div>'+
  '<div class="fineprint">После выбора распоряжение попадёт в закрытый архив. Изменить его нельзя.</div>';
 }
 if(phase==='outcome'){
  const s=state.result.stats,condition=s.safe<40?'ПРОТОКОЛ РАЗРУШЕНИЯ':s.safe<65?'ПРОТОКОЛ ПОВРЕЖДЕНИЙ':'ПРОТОКОЛ ЧУДЕСНОГО СПАСЕНИЯ';
  html=headline('РЕШЕНИЯ ПРИНЯТЫ · ДЕЛО '+(state.round+1),condition,'Все распоряжения исполнены одновременно. Результат коллективной работы:')+
  statsHtml(s)+'<div class="testimony">«'+esc(c.quirk)+'»</div>'+
  '<p class="micro">Ущерб установлен. Имена виновных пока засекречены. Следствие проводится независимо: каждый укажет одного подозреваемого.</p><div style="margin-top:15px">'+button('investigate','Открыть расследование →')+'</div>';
 }
 if(phase==='blame'){
  html=headline('ЛИЧНОЕ ДЕЛО · '+esc(state.players[state.index]),'Кто всё испортил?','Укажите одного коллегу. Можно обвинять кого угодно, кроме себя. Совпадение с главным виновником принесёт +2 очка. Ошибка стоит −1.');
  html+='<div class="section-label">СПИСОК ПОДОЗРЕВАЕМЫХ</div><div class="choices">'+state.players.map((p,i)=>i===state.index?'':'<button type="button" class="choice" data-action="vote" data-index="'+i+'"><span class="choice-num">'+String(i+1)+'</span><span><span class="choice-title">'+esc(p)+'</span><span class="choice-sub">Предъявить официальное обвинение</span></span></button>').join('')+'</div>';
 }
 if(phase==='report'){
  const r=state.result,caps=r.stats.safe<40?'ОРГАНИЗАЦИЯ ЕЩЁ СУЩЕСТВУЕТ. ПОКА.':r.stats.safe<65?'КРИЗИС НЕ УСТРАНЁН, НО БУМАГИ ЗАПОЛНЕНЫ.':'КРИЗИС ПРЕОДОЛЁН. ЗАРПЛАТУ НЕ ПОВЫСЯТ.';
  html=headline('ИТОГОВЫЙ ПРОТОКОЛ · '+(state.round+1)+'/3','Виновный найден',caps)+
  '<div class="ribbon">ГЛАВНЫЙ ВИНОВНИК: '+esc(state.players[r.culprit])+'</div>'+statsHtml(r.stats)+
  '<div class="section-label">КТО ЧТО ПРИКАЗАЛ</div>';
  html+=state.players.map((p,i)=>{const cr=role(i),ch=cr.actions[Number(state.actions[i])||0],points=r.scores[i];return '<div class="report-entry '+(i===r.culprit?'culprit':'')+'"><span class="pts">'+(points.total>0?'+':'')+points.total+'</span><div class="person">'+esc(p)+' · '+esc(cr.name)+'</div><div class="decision">'+esc(ch[0])+'</div><div class="mission">'+(points.mission?'✓ Тайное поручение выполнено (+3)':'× Тайное поручение провалено')+' · '+(points.accurate?'Обвинение точно (+2)':'Обвинение ошибочно (−1)')+(points.culprit?' · Штраф виновнику (−1)':'')+'</div></div>'}).join('');
  html+='<div class="section-label">ТЕКУЩИЙ РЕЙТИНГ</div>'+rankings()+pips()+button('next',state.round>=2?'Закрыть все дела →':'Следующее происшествие →');
 }
 if(phase==='finished'){
  const best=Math.max(...state.scores),winners=state.players.filter((_,i)=>state.scores[i]===best);
  html='<div class="ribbon">АРХИВ ЗАКРЫТ</div>'+headline('3 КАТАСТРОФЫ · '+state.players.length+' СОТРУДНИКОВ','Премия за выживание','Все дела закрыты. По официальной версии организация ни разу не подвергалась опасности.')+
  '<div class="testimony">Лучшая способность уходить от ответственности: '+esc(winners.join(', '))+'.</div>'+rankings(true)+
  button('again','Ещё одна партия →')+'<div class="button-row">'+button('reset','Удалить протокол','secondary')+'</div>';
 }
 if(!['home','finished','roster'].includes(phase))html+='<div class="abort-row"><button class="abort-control" type="button" data-action="reset">Прервать дело и начать заново</button></div>';
 screen.innerHTML=html;
 screen.scrollTop=0;
 window.__AI_TEST_STATE__={phase:state.phase,round:state.round,playerIndex:state.index,players:state.players.length,score:state.scores,caseId:c.id,actions:Object.keys(state.actions).length,votes:Object.keys(state.votes).length};
}
screen.addEventListener('input',ev=>{
 const el=ev.target.closest('[data-player]');if(!el||state.phase!=='roster')return;
 const i=Number(el.dataset.player);if(!Number.isInteger(i)||i<0||i>=state.players.length)return;
 state.players[i]=el.value.slice(0,24);persist();
});
screen.addEventListener('click',ev=>{
 const btn=ev.target.closest('[data-action]');if(!btn||btn.disabled)return;
 const a=btn.dataset.action,n=Number(btn.dataset.index);
 if(a==='roster')write('roster');
 else if(a==='add'&&state.phase==='roster'&&state.players.length<8){state.players.push('Игрок '+(state.players.length+1));tone();persist();render()}
 else if(a==='remove'&&state.phase==='roster'&&state.players.length>3){state.players.splice(n,1);tone();persist();render()}
 else if(a==='start'&&state.phase==='roster')begin();
 else if(a==='open'&&state.phase==='handoff'){tone();write('choice')}
 else if(a==='choose')takeAction(n);
 else if(a==='investigate'&&state.phase==='outcome'){state.index=0;pulse('confirm');write('blameHand')}
 else if(a==='openBlame'&&state.phase==='blameHand'){tone();write('blame')}
 else if(a==='vote')castVote(n);
 else if(a==='next'&&state.phase==='report')nextRound();
 else if(a==='again'&&state.phase==='finished')newGame();
 else if(a==='reset'){modal.hidden=false}
});
soundButton.addEventListener('click',()=>{state.sound=!state.sound;persist();soundButton.textContent=state.sound?'Звук: вкл.':'Звук: выкл.';tone('confirm')});
document.querySelector('#cancel-reset').addEventListener('click',()=>{modal.hidden=true});
document.querySelector('#accept-reset').addEventListener('click',()=>{modal.hidden=true;state=initial();persist();render();notify('Архив очищен')});
modal.addEventListener('click',e=>{if(e.target.classList.contains('modal-shade'))modal.hidden=true});
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)modal.hidden=true});
render();

createWorkshopMode({
  appName: 'НЕ МОЯ ПРОБЛЕМА',
  version: '1.0.0',
  cachePrefix: 'ne-moya-problema-',
  storageNamespace: 'pocket-works:ne-moya-problema',
  onReset: () => {state=initial();persist();render();}
});
