
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {ITEMS,DOCTRINES,TREATMENTS,VOWS,MAX_ROUNDS,START_FAITH,MAX_FAITH,createGame,setAction,
 getRite,getIncident,getItem,getDoctrine,getPatron,doctrineEffect,commitRite,continueFromJudgment,chooseDoctrine,
 conveneCouncil,loadGame,isWin} from './engine.js';
import {offeringArt,godArt,treatmentArt,incidentArt} from './art.js';
import {createOnline} from './online.js';
installMobileRuntime();

const SAVE_KEY='pocket-works:bozhe-ne-tak:game-v2';
const SOUND_KEY='pocket-works:bozhe-ne-tak:sound';
const root=document.querySelector('#game');
const toHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let offerFilter='all';
const FILTERS=[['all','Все'],['living','Живое'],['food','Еда'],['relic','Реликвии'],['regalia','Регалии'],['tool','Инструменты']];
const TRAITS={white:'Белый',gold:'Золотой',silver:'Серебряный',dark:'Тёмный',red:'Красный',green:'Зелёный',round:'Круглый',long:'Вытянутый',angular:'Угловатый',living:'Живое',food:'Еда',relic:'Реликвия',regalia:'Регалия',tool:'Инструмент',feather:'Перья',grain:'Зерно',metal:'Металл',shell:'Скорлупа',wax:'Воск',water:'Водный',stone:'Камень',fur:'Шерсть',fruit:'Плод',plant:'Растение',glass:'Стекло',wood:'Дерево',paper:'Бумага',leather:'Кожа',milk:'Молоко',skin:'Кожа',bone:'Кость',earth:'Земля'};
const filterTabs=active=>'<div class="offer-filter" role="group" aria-label="Категории подношений">'+FILTERS.map(([id,label])=>'<button type="button" data-offer-filter="'+id+'" aria-pressed="'+(active===id)+'">'+label+'</button>').join('')+'</div>';
let session=null,screen=new URL(location.href).searchParams.has('room')?'online':'home',modal='',selection=null,documentName='ROADMAP.md',docCache=null,docError='';
const online=createOnline(()=>{if(screen==='online')render()},()=>goto('home'));
let sound=true,audio=null,noiseBuffer=null,toastMessage='',toastId;
try{session=loadGame(JSON.parse(localStorage.getItem(SAVE_KEY)||'null'));}catch{}
try{sound=localStorage.getItem(SOUND_KEY)!=='off';}catch{}
function persist(){
 try{localStorage.setItem(SAVE_KEY,JSON.stringify(session));}catch{note('Сохранение недоступно в этом браузере');}
}
function newSeed(){try{return crypto.getRandomValues(new Uint32Array(1))[0]}catch{return Date.now()>>>0}}
function changeState(state){session=state;persist();render()}
function goto(name){modal='';screen=name;selection=null;render()}
function note(message){
 toastMessage=message;clearTimeout(toastId);const el=document.querySelector('#toast');
 if(el){el.textContent=message;el.classList.add('shown');}
 toastId=setTimeout(()=>{toastMessage='';const n=document.querySelector('#toast');if(n)n.classList.remove('shown')},2600);
}
function bellAudio(type='wood'){
 if(!sound)return;
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  audio||=new Ctx();if(audio.state==='suspended')void audio.resume();
  const t=audio.currentTime;
  const params=type==='bell'?{low:515,time:.55,vol:.075,noise:.012}:type==='bless'?{low:365,time:1.05,vol:.075,noise:.015}:
    type==='wrath'?{low:105,time:.44,vol:.07,noise:.045}:type==='seal'?{low:225,time:.24,vol:.06,noise:.026}:
    {low:155,time:.13,vol:.045,noise:.025};
  const gain=audio.createGain();gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(params.vol,t+.013);
  gain.gain.exponentialRampToValueAtTime(.0001,t+params.time);gain.connect(audio.destination);
  for(const ratio of (type==='bell'?[1,2.32,3.72]:type==='bless'?[1,1.5,2]:[1,1.91])){
   const o=audio.createOscillator();o.type=ratio===1?'triangle':'sine';o.frequency.setValueAtTime(params.low*ratio,t);
   o.frequency.exponentialRampToValueAtTime(Math.max(50,params.low*ratio*.96),t+params.time);
   const sub=audio.createGain();sub.gain.value=1/((ratio+1)*1.5);o.connect(sub).connect(gain);o.start(t);o.stop(t+params.time+.02);
  }
  const count=Math.floor(audio.sampleRate*.17);const buffer=audio.createBuffer(1,count,audio.sampleRate);
  let prev=0;const arr=buffer.getChannelData(0);
  for(let i=0;i<count;i++){prev=(prev+Math.random()*2-1)*.49;arr[i]=prev}
  const n=audio.createBufferSource();n.buffer=buffer;
  const filter=audio.createBiquadFilter();filter.type='bandpass';filter.frequency.value=type==='bell'?1100:340;filter.Q.value=1;
  const ng=audio.createGain();ng.gain.setValueAtTime(params.noise,t);ng.gain.exponentialRampToValueAtTime(.0001,t+.15);
  n.connect(filter).connect(ng).connect(audio.destination);n.start(t);n.stop(t+.16);
 }catch{/* Audio permission is optional; visuals always work. */}
}
function topbar(){
 const back=screen==='online'?'<button type="button" class="exit" data-action="online-exit">← Покинуть комнату</button>':screen==='home'?'<a class="exit" href="../../" data-app-control data-native-press>← Pocket Works</a>':
 '<button type="button" class="exit" data-action="home">← К выбору</button>';
 const status=screen==='online'?'POCKETNET · СОБОР':session&&screen==='play'?'ОБРЯД '+(session.round+1)+' / '+MAX_ROUNDS:screen==='project'?'ДОКУМЕНТЫ':'ХРАМ ОГО';
 return '<header class="topbar" data-ui>'+back+'<span class="top-center">'+status+'</span>'+
 '<button class="sound" type="button" data-action="sound" aria-label="'+(sound?'Выключить звук':'Включить звук')+'">'+
 (sound?'ЗВУК: ВКЛ':'ЗВУК: ВЫКЛ')+'</button></header>';
}
function mask(mood='idle',small=false){
 return '<div class="idol '+(small?'mini ':'')+'mood-'+mood+'">'+godArt(session?.patronId||'ogo')+
 '<div class="idol-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>';
}
function footer(text=''){
 return '<div class="under-stage" data-ui>'+toHtml(text)+'</div>';
}
function home(){
 const has=!!session;
 return '<section class="home-stage"><div class="home-architecture" aria-hidden="true"><i></i><i></i><i></i></div>'+
 '<div class="home-idol">'+mask('idle')+'</div><div class="home-copy">'+
 '<div class="chapter-mark">ХРАМ НЕКОМПЕТЕНТНЫХ ЖРЕЦОВ</div><h1>БОЖЕ,<br>НЕ ТАК!</h1>'+
 '<p>Три капризных божества, 26 знамений, 28 даров. И собор, который сам придумывает себе проблемы.</p>'+
 '<div class="home-actions">'+(has?'<button class="btn primary" data-action="resume">Продолжить '+(session.phase==='end'?'хронику':'обряд')+' <span>→</span></button>':'')+
 '<button class="btn '+(has?'secondary':'primary')+'" data-action="new">'+(has?'Новая религия':'Начать служение')+' <span>✦</span></button>'+
 '</div><div class="home-online"><button type="button" class="btn secondary" data-action="online">ИГРАТЬ ВМЕСТЕ · POCKETNET <span>↗</span></button></div><div class="quiet-actions"><button data-action="help">Как играть</button><button data-action="project">Дорожная карта</button></div>'+
 '<div class="build-note">v0.5 · СОБЫТИЯ · 28 ПОДНОШЕНИЙ · POCKETNET</div></div></section>';
}
function layout(inside,view='active'){
 return '<div class="ritual-layout '+view+'">'+inside+'</div>';
}
function chapter(phaseTitle){
 return '<div class="ritual-head"><span class="chapter">ОБРЯД '+(session.round+1)+' / '+MAX_ROUNDS+' · '+toHtml(getPatron(session.patronId).name)+'</span>'+
 '<div class="faith"><span class="faith-label">МИЛОСТЬ</span>'+
 '<span class="faith-pips" aria-label="'+session.faith+' из '+MAX_FAITH+'">'+Array.from({length:MAX_FAITH},(_,i)=>'<i class="'+(i<session.faith?'lit':'')+'"></i>').join('')+'</span>'+
 '<strong>'+session.faith+'</strong></div></div>';
}
function riteStage(mood,art,subtitle){
 return '<div class="shrine-scene" data-mood="'+mood+'"><div class="temple-depth" aria-hidden="true"><div class="temple-arch"></div><div class="temple-column left"></div><div class="temple-column right"></div></div>'+
 '<div class="god-shell">'+mask(mood)+'</div><div class="miracle-vfx" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>'+
 '<div class="altar-platform '+(session.actions.height==='high'?'raised':'')+'"><div class="altar-shaft" aria-hidden="true"></div>'+
 '<div class="altar-disc">'+(art||'<span class="empty-altar">?</span>')+'</div></div>'+
 (subtitle?'<div class="scene-subtitle">'+toHtml(subtitle)+'</div>':'')+'</div>';
}
function doctrineRibbon(){
 if(!session.doctrines.length)return '<div class="dogma-empty">Пока ни одного догмата. Это ненадолго.</div>';
 return '<div class="dogma-ribbon">'+session.doctrines.map(id=>{
  const d=getDoctrine(id),effect=doctrineEffect(id,session.actions);
  return '<span class="dogma-chip '+(effect.delta>0?'good':effect.delta<0?'bad':'')+'" title="'+toHtml(d.desc)+'">'+
   toHtml(d.name)+' <b>'+(session.actions.itemId?(effect.delta>0?'+':'')+effect.delta:'·')+'</b></span>';
 }).join('')+'</div>';
}
function play(){
 const a=session.actions,rite=getRite(session),item=getItem(a.itemId),incident=getIncident(session);
 const visibleItems=ITEMS.filter(o=>offerFilter==='all'||o.kind===offerFilter);
 const items=visibleItems.map(o=>'<button type="button" class="offering '+(o.id===a.itemId?'chosen':'')+'" data-item="'+o.id+'" aria-pressed="'+(o.id===a.itemId)+'">'+
 '<span class="offer-figure">'+offeringArt(o.id,58)+'</span><b>'+o.name+'</b><small>'+o.hint+'</small></button>').join('');
 const treatment=TREATMENTS.map(t=>'<button type="button" class="tool tool-illustrated '+(a.treatment===t.id?'chosen':'')+
 '" data-treatment="'+t.id+'" aria-pressed="'+(a.treatment===t.id)+'">'+treatmentArt(t.id,21)+'<span>'+t.name+'</span></button>').join('');
 const bells=[1,2,3].map(n=>'<button class="score-beat '+(a.bell===n?'chosen':'')+
 '" data-bell="'+n+'" type="button" aria-pressed="'+(a.bell===n)+'">'+n+'</button>').join('');
 return layout(chapter()+'<div class="work-space">'+
 '<section class="shrine-column">'+riteStage('idle',item?offeringArt(item.id,94):null,item?item.name:'Выберите дар ниже')+
 '<div class="prophecy"><div class="prophecy-kicker">ЗНАМЕНИЕ · '+toHtml(rite.title)+'</div><p>'+toHtml(rite.riddle)+'</p></div></section>'+
 '<section class="work-column">'+
 '<div class="patron-brief"><strong>'+toHtml(getPatron(session.patronId).name)+' · '+toHtml(getPatron(session.patronId).title)+'</strong><span>'+toHtml(getPatron(session.patronId).rule)+'</span></div>'+
 '<div class="incident-brief"><div class="incident-stamp">'+incidentArt(incident.id,40)+'</div><div><strong>СОБЫТИЕ: '+toHtml(incident.title)+'</strong><p>'+toHtml(incident.story)+'</p></div><b class="incident-delta '+(incident.delta>0?'bonus':'penalty')+'">'+(incident.delta>0?'+1':'−1')+'</b></div>'+
 '<div class="section-label">I. ВЫБЕРИТЕ ДАР · '+ITEMS.length+' В АРХИВЕ</div>'+filterTabs(offerFilter)+'<div class="offering-row" tabindex="0" aria-label="Предметы для подношения">'+items+'</div>'+
 (item?'<div class="offering-inspect"><span>ВЫБРАНО: '+toHtml(item.name)+'</span><span>'+[item.color,item.shape,item.kind,item.material].map(v=>toHtml(TRAITS[v]||v)).join(' · ')+'</span></div>':'')+
 '<div class="choice-tools"><div class="choice-block"><div class="section-label">II. ПОДГОТОВКА</div><div class="tools-row">'+treatment+'</div></div>'+
 '<div class="choice-block"><div class="section-label">III. ЗВОН</div><div class="beats">'+bells+'</div></div>'+
 '<div class="choice-block height-choice"><div class="section-label">IV. ВЫСОТА</div><div class="tools-row"><button class="tool '+(a.height==='low'?'chosen':'')+'" data-height="low" aria-pressed="'+(a.height==='low')+'">У подножия</button>'+
 '<button class="tool '+(a.height==='high'?'chosen':'')+'" data-height="high" aria-pressed="'+(a.height==='high')+'">Поднять</button></div></div></div>'+
 '<div class="vow-control"><div class="section-label">V. ОБЕТ · КАК РИСКОВАТЬ МИЛОСТЬЮ</div><div class="vow-options">'+VOWS.map(v=>'<button type="button" data-vow="'+v.id+'" class="vow-option '+(a.vow===v.id?'chosen':'')+'" aria-pressed="'+(a.vow===v.id)+'"><strong>'+toHtml(v.name)+'</strong><small>'+toHtml(v.detail)+'</small></button>').join('')+'</div></div>'+
 '<div class="active-dogmas"><div class="section-label">ДОГМАТЫ '+(session.doctrines.length?session.doctrines.length+'/3':'')+'</div>'+doctrineRibbon()+
 (session.doctrines.length&&!session.councilUsed&&session.faith>=2?'<button class="council" type="button" data-action="council">Созвать собор · −1 милость</button>':'')+'</div>'+
 '<button class="btn primary ritual-commit" type="button" data-action="commit" '+(!item?'disabled':'')+'>'+
 (item?'ПРИНЕСТИ '+item.name.toUpperCase():'СНАЧАЛА ВЫБЕРИТЕ ДАР')+' <span>✦</span></button></section></div>', 'play-layout');
}
function scoreLine(c){
 return '<div class="score-row"><span>'+toHtml(c.name)+'</span><strong class="'+(c.score>0?'hit':c.score<0?'miss':'neutral')+'">'+(c.score>0?'+':'')+c.score+(c.max===1?'':' / '+c.max)+'</strong></div>';
}
function judgment(){
 const j=session.judgment,rit=getRite(session),obj=getItem(session.actions.itemId);
 const mood=j.verdict==='bless'?'bless':j.verdict==='wrath'?'wrath':'doubt';
 const headline={bless:'БОГ ДОВОЛЕН',doubt:'БОГ ЗАДУМАЛСЯ',wrath:'БОГ РАЗГНЕВАН'}[mood];
 const subtitle={bless:'Божество одобряет ваше богослужение.',doubt:'Божество морщит деревянный лоб и ничего не обещает.',wrath:'Небеса требуют объяснить, кто вас вообще рукоположил.'}[mood];
 return layout(chapter()+ '<div class="work-space verdict-space"><section class="shrine-column">'+
 riteStage(mood,offeringArt(obj.id,108),headline)+'</section><section class="work-column verdict-column">'+
 '<div class="section-label">'+toHtml(rit.title)+'</div><h2 class="verdict-title '+mood+'">'+headline+'</h2>'+
 '<p class="verdict-copy">'+subtitle+'</p><p class="vow-verdict">'+toHtml(VOWS.find(v=>v.id===j.vow)?.name||'Обычный обряд')+' · изменение милости '+(j.faithDelta>0?'+':'')+j.faithDelta+'</p><p class="miracle-text">'+toHtml(j.miracleText||'')+'</p>'+
 '<div class="score-seal"><span>СУД НЕБЕС</span><strong>'+j.score+'</strong><span>Милость: <b>'+(j.faithDelta>0?'+':'')+j.faithDelta+'</b></span></div>'+
 '<div class="score-breakdown">'+j.criteria.map(scoreLine).join('')+
 j.doctrineResults.map(d=>'<div class="score-row dogma-score"><span>'+toHtml(getDoctrine(d.id).name)+': '+toHtml(d.text)+'</span>'+
 '<strong class="'+(d.delta<0?'miss':'hit')+'">'+(d.delta>0?'+':'')+d.delta+'</strong></div>').join('')+'</div>'+
 '<button class="btn primary" data-action="after-judgment">'+
 (session.faith===0||session.round===MAX_ROUNDS-1?'ЗАВЕРШИТЬ ХРОНИКУ':'УСЛЫШАТЬ НОВОЕ ПРАВИЛО')+' <span>→</span></button>'+
 '</section></div>','verdict-layout');
}
function dogmaStage(){
 const verdict=session.judgment;
 const cards=session.offers.map(id=>{
  const d=getDoctrine(id);
  return '<button class="doctrine-option '+(selection===id?'selected':'')+'" type="button" data-pick-dogma="'+id+
  '" aria-pressed="'+(selection===id)+'"><span class="seal-icon" aria-hidden="true">✥</span>'+
  '<b>'+toHtml(d.name)+'</b><span>'+toHtml(d.desc)+'</span><span class="choice-corner">'+(selection===id?'ВЫБРАНО':'ИЗБРАТЬ')+'</span></button>';
 }).join('');
 return layout(chapter()+'<div class="dogma-stage">'+
 '<div class="dogma-idol">'+mask('doubt')+'</div><div class="dogma-right">'+
 '<div class="chapter">ПОСЛЕ ОБРЯДА '+(session.round+1)+'</div><h2>Церковный собор</h2>'+
 '<p>Ваше решение стало чудом. Жрецы должны объявить, что именно оно означает для будущих обрядов.</p>'+
 '<div class="dogma-options">'+cards+'</div>'+
 '<p class="dogma-caveat">Новые догматы реально меняют оценку следующих подношений. Максимум три; старейший догмат уступает место новому.</p>'+
 '<button class="btn primary" data-action="confirm-doctrine" '+(!selection?'disabled':'')+'>ЗАКРЕПИТЬ ДОГМАТ <span>✦</span></button>'+
 '</div></div>','dogma-layout');
}
function getIncidentByIdSafe(id){return ({tax:'Сборщик десятины',rats:'Нашествие крыс',choir:'Бунт хора',drought:'Великая засуха',festival:'Праздник лент',audit:'Небесная ревизия',wind:'Сквозняк в храме',eclipse:'Солнечное затмение',pilgrims:'Паломники с болот',thieves:'Ночь воров',fashion:'Епископская мода',silence:'Обет молчания',market:'Ярмарка чудес',democracy:'Собор спорщиков',flood:'Потоп в ризнице',oil:'Постановление о масле'})[id]||id;}
function ending(){
 const win=isWin(session);
 const title=win?'НАША ВЕРА ВЫЖИЛА':'БОГ ЗАКРЫЛ ХРАМ';
 const paragraphs=win?getPatron(session.patronId).name+' остался с вами. Теперь у вашей церкви появились правила, которых вчера не существовало.':
 'Священный престол пуст. Но хроника ваших нелепых решений сохранилась.';
 const timeline=session.history.map((h,i)=>{
  const d=getDoctrine(h.adopted);
  return '<li class="chronicle-entry"><span class="chronicle-no">'+String(i+1).padStart(2,'0')+'</span>'+
  '<div class="chronicle-icon">'+offeringArt(h.itemId,61)+'</div><div><b>'+toHtml(h.riteTitle)+'</b>'+
  '<p>'+toHtml(getItem(h.itemId).name)+' · '+(h.verdict='bless'?'благословён':h.verdict==='wrath'?'навлёк гнев':'вызвал сомнения')+
  ' · '+h.score+' очк.</p>'+(h.incidentId?'<p class="chronicle-incident">Случилось: '+toHtml(getIncidentByIdSafe(h.incidentId))+'</p>':'')+'<p class="chronicle-miracle">'+toHtml(h.miracleText||'')+'</p>'+(d?'<span class="chronicle-law">НОВЫЙ ДОГМАТ: '+toHtml(d.name)+'</span>':'')+'</div></li>';
 }).join('');
 return '<section class="ending"><div class="ending-main">'+mask(win?'bless':'wrath',true)+
 '<div class="chapter">КОНЕЦ ПАЛОМНИЧЕСТВА · '+toHtml(getPatron(session.patronId).name)+'</div><h1>'+title+'</h1><p>'+paragraphs+'</p>'+
 '<div class="final-metrics"><div>МИЛОСТЬ <strong>'+session.faith+'</strong></div><div>ОБРЯДЫ <strong>'+session.history.length+'/5</strong></div>'+
 '<div>ДОГМАТЫ <strong>'+session.doctrines.length+'</strong></div></div>'+
 '<button class="btn primary" data-action="new">НОВАЯ РЕЛИГИЯ <span>→</span></button>'+
 '<button class="btn secondary" data-action="retry-seed">Повторить тот же вызов</button></div>'+
 '<div class="chronicle"><div class="section-label">ЛЕТОПИСЬ НАШЕЙ ВЕРЫ</div><ol>'+timeline+'</ol></div></section>';
}
function help(){
 return '<section class="help-screen"><span class="chapter">ЗАПОВЕДИ НЕОПЫТНОГО ЖРЕЦА</span><h1>Три божества и пять обрядов до просветления</h1>'+
 '<div class="help-steps"><p><b>1. Прочтите знамение.</b> Бог описывает желанный дар, запрет, подготовку, число звонов и высоту подношения. В его словах действительно есть ответ.</p>'+
 '<p><b>2. Приготовьте обряд.</b> Выберите предмет, подготовку, звон, высоту и обет риска. Происшествие каждого раунда тоже влияет на суд. Все решения можно менять до жертвоприношения.</p>'+
 '<p><b>3. Получите вердикт.</b> ОГО начисляет или отнимает милость. После обряда вы сами утверждаете новый догмат, который изменит следующие испытания.</p>'+
 '<p><b>4. Доживите до финала.</b> Милость не должна упасть до нуля. Один раз за игру разрешено отменить старейший догмат через собор, потратив милость.</p></div>'+
 '<p class="help-note">Можно играть одному или в PocketNet на 2–5 человек с отдельными тайными обязанностями. Каждую партию правит один из трёх богов со своим предпочтением. В каждом раунде происходит событие, добавляющее бонус или штраф при определённом выборе.</p>'+
 '<button class="btn primary" data-action="home">ПОНЯТНО <span>→</span></button></section>';
}
function parseDoc(markdown){
 const frag=document.createDocumentFragment();let currentList=null,para=[];
 const flush=()=>{if(para.length){const p=document.createElement('p');p.textContent=para.join(' ');frag.append(p);para=[]}};
 for(const raw of markdown.split(/\r?\n/)){
  const l=raw.trim();if(!l){flush();currentList=null;continue}
  const hd=/^(#{1,3})\s+(.+)$/.exec(l);
  const li=/^[-*]\s+(.+)$/.exec(l);
  if(hd){flush();currentList=null;const h=document.createElement('h'+hd[1].length);h.textContent=hd[2];frag.append(h)}
  else if(li){flush();if(!currentList){currentList=document.createElement('ul');frag.append(currentList)}
   const item=document.createElement('li');item.textContent=li[1];currentList.append(item);}
  else if(l.startsWith('|')){flush();const p=document.createElement('pre');p.textContent=l;frag.append(p)}
  else {currentList=null;para.push(l)}
 }
 flush();return frag;
}
async function loadDoc(){
 const target=document.querySelector('#project-document');
 if(!target)return;
 if(docError){target.textContent=docError;return}
 try{
  docCache ||= fetch('./dossier.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()});
  const pack=await docCache;if(screen!=='project'||!target.isConnected)return;
  if(!Object.hasOwn(pack,documentName))throw Error('Недоступный раздел');
  target.replaceChildren(parseDoc(pack[documentName]));
 }catch{
  if(screen!=='project'||!target.isConnected)return;
  docCache=null;target.replaceChildren();
  const p=document.createElement('p');p.textContent='Не удалось открыть документ — повторите загрузку.';
  const b=document.createElement('button');b.className='btn secondary';b.type='button';b.dataset.action='retry-doc';b.textContent='Повторить';
  target.append(p,b);
 }
}
function project(){
 const docs=[['ROADMAP.md','Этапы'],['GAME-DESIGN.md','Механики'],['NETWORK.md','Сеть'],['ART-DIRECTION.md','Визуал'],['QA-PLAN.md','Тесты'],['DECISIONS.md','Решения']];
 return '<section class="project-screen"><div class="chapter">АРХИВ РАЗРАБОТКИ</div><h1>План храма</h1>'+
 '<div class="document-tabs">'+docs.map(x=>'<button type="button" data-doc="'+x[0]+'" aria-pressed="'+(documentName===x[0])+'">'+x[1]+'</button>').join('')+
 '</div><article class="project-document" id="project-document" aria-live="polite">Загрузка документа…</article></section>';
}
function confirmationModal(){
 if(!modal)return '';
 const deleting=modal==='new',council=modal==='council';
 const title=deleting?'Начать новую веру?':council?'Упразднить догмат?':'Повторить эту партию?';
 const body=deleting?'Текущая хроника будет заменена новой партией.':council?
 'Самый старый догмат исчезнет навсегда. Цена собора — 1 милость. Использовать собор можно только один раз за партию.':
 'Вы начнёте заново с тем же набором пяти знамений.';
 return '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="'+title+'">'+
 '<h2>'+title+'</h2><p>'+body+'</p><div class="modal-actions"><button class="btn secondary" data-action="cancel">Отмена</button>'+
 '<button class="btn primary" data-action="confirm-'+(council?'council':deleting?'new':'retry')+'">Подтвердить</button></div></section></div>';
}
function render(){
 if(!root)return;
 const before=root.querySelector('.offering-row,.net-offerings');const offset=before?.scrollLeft||0;
 root.innerHTML=topbar()+(screen==='online'?online.markup():screen==='home'?home():screen==='help'?help():screen==='project'?project():
 !session?home():screen==='play'?(session.phase==='play'?play():session.phase==='judgment'?judgment():session.phase==='dogma'?dogmaStage():ending()):home())+
 confirmationModal()+'<div class="toast '+(toastMessage?'shown':'')+'" id="toast" role="status">'+toHtml(toastMessage)+'</div>';
 const after=root.querySelector('.offering-row,.net-offerings');if(after&&before&&after.className===before.className)after.scrollLeft=offset;
 if(screen==='project')void loadDoc();
}
function offerRite(){
 if(!session||!getItem(session.actions.itemId))return;
 changeState(commitRite(session));bellAudio(session.judgment?.verdict==='wrath'?'wrath':session.judgment?.verdict==='bless'?'bless':'bell');
}
document.addEventListener('click',event=>{
 if(screen==='online'&&online.action(event))return;
 const choice=event.target.closest('[data-item],[data-treatment],[data-bell],[data-height],[data-vow],[data-pick-dogma],[data-doc],[data-offer-filter]');
 const button=event.target.closest('[data-action]');
 if(choice){
  if(choice.hasAttribute('data-offer-filter')){offerFilter=choice.dataset.offerFilter;render();return;}
  if(choice.hasAttribute('data-doc')){documentName=choice.dataset.doc;render();return;}
  if(choice.hasAttribute('data-pick-dogma')){selection=choice.dataset.pickDogma;bellAudio('wood');render();return;}
  if(!session||session.phase!=='play')return;
  let patch={};if(choice.hasAttribute('data-item'))patch={itemId:choice.dataset.item};
  else if(choice.hasAttribute('data-treatment'))patch={treatment:choice.dataset.treatment};
  else if(choice.hasAttribute('data-bell'))patch={bell:Number(choice.dataset.bell)};
  else if(choice.hasAttribute('data-height'))patch={height:choice.dataset.height};
  else if(choice.hasAttribute('data-vow'))patch={vow:choice.dataset.vow};
  if(Object.keys(patch).length){changeState(setAction(session,patch));bellAudio(choice.hasAttribute('data-bell')?'bell':'wood');}
  return;
 }
 if(!button)return;
 const action=button.dataset.action;
 if(action==='sound'){sound=!sound;try{localStorage.setItem(SOUND_KEY,sound?'on':'off')}catch{}render();if(sound)bellAudio('wood');return}
 if(action==='help'){goto('help');return}
 if(action==='project'){goto('project');return}
 if(action==='online-exit'){online.leave();goto('home');return}
 if(action==='online'){goto('online');return}
 if(action==='home'){goto('home');return}
 if(action==='resume'){goto('play');return}
 if(action==='cancel'){modal='';render();return}
 if(action==='new'){if(session){modal='new';render()}else{session=createGame(newSeed());persist();goto('play');bellAudio('bell')}return}
 if(action==='confirm-new'){offerFilter='all';session=createGame(newSeed());persist();goto('play');bellAudio('bell');return}
 if(action==='retry-seed'){modal='retry';render();return}
 if(action==='confirm-retry'){offerFilter='all';session=createGame(session.seed);persist();goto('play');bellAudio('bell');return}
 if(action==='commit'){offerRite();return}
 if(action==='after-judgment'){changeState(continueFromJudgment(session));bellAudio('seal');return}
 if(action==='confirm-doctrine'){
  if(!session||!selection)return;
  const result=chooseDoctrine(session,selection);
  if(result!==session){selection=null;changeState(result);bellAudio('seal');}return;
 }
 if(action==='council'){if(session&&!session.councilUsed&&session.faith>=2){modal='council';render()}return}
 if(action==='confirm-council'){const result=conveneCouncil(session);modal='';if(result!==session){changeState(result);bellAudio('seal')}else render();return}
 if(action==='retry-doc'){docError='';docCache=null;render();return}
});
window.addEventListener('pagehide',()=>{if(session)persist()});
window.__BNT_QA__=()=>({onlinePhase:online.phase,onlineRoom:online.roomId,screen,phase:session?.phase||null,round:session?.round??null,faith:session?.faith??null,
 item:session?.actions.itemId??null,doctrines:session?.doctrines||[],history:session?.history.length||0,hasSave:!!session});
render();
