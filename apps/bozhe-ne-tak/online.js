
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey} from '../../shared/capabilities/identity.js';
import {ITEMS,TREATMENTS,VOWS,getItem,getDoctrine,MAX_ROUNDS} from './engine.js';
import {offeringArt,godArt,treatmentArt,incidentArt} from './art.js';

const K='pocket-works:bozhe-ne-tak:online:';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={
 getItem:k=>{try{return localStorage.getItem(K+k)}catch{return null}},
 setItem:(k,v)=>{try{localStorage.setItem(K+k,v)}catch{}},
 removeItem:k=>{try{localStorage.removeItem(K+k)}catch{}}
};
const roomStorageKey='pocket-net:'+location.origin+'/pocketnet';
const savedRoom=()=>{try{return JSON.parse(store.getItem(roomStorageKey)||'null')?.roomId||null}catch{return null}};
const readable=raw=>{let r=String(raw||'').trim();try{const u=new URL(r);r=u.searchParams.get('room')||r}catch{}
 return /^(?:[0-9a-f]{8}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(r)?r.toLowerCase():'';};
const EXPLAIN={
 room_not_found:'Комната не найдена или уже закрыта.',
 room_full:'В комнате больше нет мест.',
 already_in_room:'Вы уже находитесь в комнате.',
 match_in_progress:'Матч уже начался. Попросите игроков создать новую комнату.',
 server_at_capacity:'Сервер переполнен. Повторите попытку позднее.',
 invalid_token:'Сессия устарела. Войдите заново.',
 profile_incomplete:'Завершите профиль Pocket ID.',
 room_version_unavailable:'Версия комнаты недоступна после обновления.',
 rate_limited:'Слишком много команд. Попробуйте ещё раз.'
};
const safeAction=()=>({itemId:null,treatment:null,bell:1,height:'low'});
const FILTERS=[['all','Все'],['living','Живое'],['food','Еда'],['relic','Реликвии'],['regalia','Регалии'],['tool','Инструменты']];
export function createOnline(onChange,onExit){
 let offeringFilter='all',draftVow=null;
 let draftItem='',draftTreatment='',clockOffset=0,client=null,view=null,ownId='',roomId='',name=store.getItem('nickname')||'',code=new URL(location.href).searchParams.get('room')||'',status='intro',error='',notice='',lastMode='',epoch=0,sequence=0;
 const show=()=>onChange();
 const isLive=()=>client?.socket?.readyState===WebSocket.OPEN&&status==='room';
 const message=s=>{notice=s;show()};
 const clean=()=>{const previous=client;client=null;epoch++;if(previous){previous.closed=true;try{previous.close()}catch{}}};
 const apply=s=>{
  if(!s||!Array.isArray(s.players)||typeof s.phase!=='string')return;
  if(view&&Number.isInteger(s.revision)&&s.revision<view.revision)return;
  const old=view;view=s;if(Number.isFinite(s.serverNow))clockOffset=s.serverNow-Date.now();sequence=Math.max(sequence,s.ownSeq||0);
  if(old?.phaseId!==s.phaseId){notice='';draftItem='';draftTreatment='';draftVow=null;}
  status='room';show();
 };
 const bind=(net,id)=>{
  net.on('connected',x=>{if(id!==epoch)return;ownId=x.player.id;error='';status='connecting';show()});
  net.on('room_joined',x=>{
   if(id!==epoch)return;
   if(x.version!=='v3'){
    try{net.leaveRoom()}catch{}
    roomId='';view=null;status='intro';error='Это храм старой версии правил. Создайте новую комнату (старый матч не удалён).';show();return;
   }
   roomId=x.roomId;ownId=ownId||x.players?.[0]?.id||'';apply(x.state);send({type:'sync'});
  });
  net.on('game_event',x=>{if(id!==epoch)return;
   if(x.event?.type==='state')apply(x.event.payload);
   if(x.event?.type==='notice')message(typeof x.event.payload==='string'?x.event.payload:'Операция не принята.')
  });
  net.on('presence',x=>{if(id!==epoch)return;
   if(x.disconnected)message('Один жрец потерял связь. Его место сохраняется.');
   if(x.players){if(view){view={...view,players:x.players};show()}send({type:'sync'})}
  });
  net.on('disconnected',()=>{if(id!==epoch)return;status='reconnecting';show()});
  net.on('room_closed',()=>{if(id!==epoch)return;view=null;roomId='';status='intro';error='Комната закрыта.';show()});
  net.on('error',x=>{if(id!==epoch)return;const code=x?.code||x?.message||'';
   error=EXPLAIN[code]||('Ошибка соединения: '+code.slice(0,90));
   if(['room_not_found','room_full','match_in_progress','room_version_unavailable','account_already_in_room'].includes(code)){
    status='intro';view=null;roomId='';net.roomId=null;net.persist();
   }
   show()});
 };
 async function start(mode){
  if(status==='connecting')return;
  error='';notice='';lastMode=mode;
  if(!name.trim()||name.trim().length>24){error='Введите имя длиной 1–24 символа.';show();return}
  if(mode==='join'&&!readable(code)){error='Укажите восьмизначный код или ссылку на комнату.';show();return}
  try{store.setItem('nickname',name.trim());}catch{}
  clean();view=null;roomId='';ownId='';status='connecting';show();
  if(mode!=='resume'){
   const stored=JSON.parse(store.getItem(roomStorageKey)||'null');
   if(stored){delete stored.roomId;store.setItem(roomStorageKey,JSON.stringify(stored))}
  }
  const id=epoch;
  const identity=await getPocketIdentity().catch(()=>null);
  if(id!==epoch)return;
  const net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:preferredPocketName(identity,name.trim()),storage:store,
   identityKey:pocketIdentitySessionKey(identity)});
  client=net;bind(net,id);
  try{
   await Promise.race([net.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Сервер не отвечает')),11000))]);
   if(id!==epoch)return;
   if(mode==='create')net.createRoom('bozhe-ne-tak');
   else if(mode==='join')net.joinRoom(readable(code));
   else if(!net.roomId){status='intro';error='Сохранённая комната больше недоступна.';show()}
  }catch(e){if(id!==epoch)return;error=EXPLAIN[e.message]||String(e.message).slice(0,150);
   clean();status='intro';show()}
 }
 function send(payload){
  if(!client||!client.socket||client.socket.readyState!==WebSocket.OPEN)return false;
  try{client.sendGame(payload);return true}catch{return false}
 }
 function command(type,detail={}){
  if(!isLive()||!view)return false;
  const packet={type,phaseId:view.phaseId,seq:++sequence,...detail};
  if(!send(packet)){message('Нет связи. Дождитесь повторного подключения.');return false}
  return true;
 }
 function leave(){
  if(client){try{if(client.socket?.readyState===WebSocket.OPEN)client.leaveRoom()}catch{}}
  clean();view=null;roomId='';status='intro';notice='Вы покинули комнату.';show();
 }
 function close(){clean();view=null;roomId='';status='intro'}
 function tick(){if(status==='room'&&view&&client?.socket?.readyState===WebSocket.OPEN&&view.phase!=='end')send({type:'pulse'})}
 let pulseCounter=0;
 const pulse=setInterval(()=>{
  const clock=document.querySelector('[data-net-timer]');
  if(clock&&view?.deadlineAt)clock.textContent=String(Math.max(0,Math.ceil((view.deadlineAt-(Date.now()+clockOffset))/1000)));
  if(++pulseCounter%6===0)tick();
 },1000);
 function destroy(){clearInterval(pulse);close()}
 function nickname(v){name=String(v).slice(0,24)}
 function invite(v){code=String(v).slice(0,180)}
 const controls=(text,action,disabled=false,cls='')=>'<button type="button" data-net="'+action+'" class="btn '+(cls||'secondary')+'" '+(disabled?'disabled':'')+'>'+text+'</button>';
 function lobby(){
  const ps=view.players||[],host=view.host===ownId;
  return '<section class="net-room"><div class="net-room-top">'+
   '<span class="chapter">СОВЕТ ЖРЕЦОВ · 2–5 ИГРОКОВ</span><h1>Пока бог спит</h1>'+
   '<p>Отправьте товарищам код. Каждый знает только часть ритуала. Раскройте подсказки, подготовьте общий дар и примите решение вместе.</p>'+
   '<div class="net-code"><strong>'+escape(roomId.slice(0,8).toUpperCase())+'</strong>'+
   '<button data-net="copy" type="button">Скопировать приглашение</button></div></div>'+
   '<div class="net-roster"><span class="section-label">ПРИШЛИ В ХРАМ · '+ps.length+'/5</span>'+
   '<div class="net-members">'+ps.map((p,i)=>'<div class="net-member"><span class="net-number">'+(i+1)+'</span><span>'+escape(p.name)+(p.id===ownId?' <small>(вы)</small>':'')+'</span>'+(p.id===view.host?'<b>НАСТОЯТЕЛЬ</b>':'')+'</div>').join('')+'</div>'+
   (ps.length===1?'<p class="net-wait">Не хватает ещё одного жреца.</p>':'')+
   (host?controls('НАЧАТЬ СЛУЖЕНИЕ →','start',ps.length<2,'primary'):'<p class="net-wait">Начинает настоятель. Ожидайте общего знамения.</p>')+
   controls('Покинуть комнату','leave')+'</div></section>';
 }
 const pips=n=>'<span class="faith-pips">'+Array.from({length:10},(_,i)=>'<i class="'+(i<n?'lit':'')+'"></i>').join('')+'</span>';
 const sharedHeader=()=>'<header class="net-phase-head"><b>ОБРЯД '+(view.match.round+1)+' / '+MAX_ROUNDS+'</b>'+
  '<span>МИЛОСТЬ '+pips(view.match.faith)+' <b>'+view.match.faith+'</b></span></header>';
 function contributions(){
  return '<div class="net-contributions">'+view.players.map(p=>{
   const c=view.choices[p.id],r=!!view.ready[p.id],own=p.id===ownId;
   return '<div class="net-participant '+(r?'sealed':'')+'"><span class="net-participant-name">'+escape(p.name)+(own?' · ВЫ':'')+'</span><span>'+(
    r?'ЗАПЕЧАТАНО':c?.itemId?escape(getItem(c.itemId)?.name||'Дар'):'ВЫБИРАЕТ ДАР')+'</span></div>';
  }).join('')+'</div>';
 }

 const roleLabels={need:'Пророк',taboo:'Страж запрета',offering:'Ризничий',bell:'Звонарь',height:'Алтарщик'};
 const taskNames={need:'Расшифровать знамение',taboo:'Объявить запрет',offering:'Приготовить дар',bell:'Назначить звон',height:'Поднять или оставить'};
 function assignedRoster(){
  return '<div class="net-roles-roster">'+view.players.map(p=>{
   const tasks=view.assignments?.[p.id]||[],isMe=p.id===ownId;
   const completed=tasks.every(t=>view.done?.[t]);
   return '<div class="net-role-person '+(isMe?'mine':'')+'"><span class="net-role-name">'+escape(p.name)+(isMe?' (вы)':'')+
    '</span><span>'+tasks.map(t=>escape(roleLabels[t])).join(' · ')+'</span><b>'+(
     view.locked?.[p.id]?'ЗАПЕЧАТАНО':completed?'ГОТОВ':'В ПРОЦЕССЕ')+'</b></div>';
  }).join('')+'</div>';
 }
 function roleCard(task){
  const clue=view.ownClues?.[task],done=!!view.done?.[task],locked=!!view.locked?.[ownId];
  let controls='';
  if(task==='need'||task==='taboo'){
   controls='<button type="button" data-role-reveal="'+task+'" class="net-role-confirm" '+(done||locked?'disabled':'')+'>'+
    (done?'ЗНАМЕНИЕ ПЕРЕДАНО':'ОТПРАВИТЬ ЗНАМЕНИЕ →')+'</button>';
  }else if(task==='offering'){
   const item=draftItem||view.altar?.itemId||'';
   const treatment=draftTreatment||view.altar?.treatment||'';
   const vow=draftVow??(view.altar?.vow||'steady');
   controls='<div class="offer-filter net-offer-filter">'+FILTERS.map(([id,label])=>'<button type="button" data-role-filter="'+id+'" aria-pressed="'+(offeringFilter===id)+'">'+label+'</button>').join('')+'</div>'+
    '<div class="net-offerings">'+ITEMS.filter(x=>offeringFilter==='all'||x.kind===offeringFilter).map(x=>'<button type="button" class="net-offering '+(item===x.id?'chosen':'')+
    '" data-role-item="'+x.id+'" aria-pressed="'+(item===x.id)+'" '+(locked?'disabled':'')+'>'+offeringArt(x.id,48)+
    '<b>'+escape(x.name)+'</b></button>').join('')+'</div><div class="net-tool-row">'+TREATMENTS.map(x=>
    '<button type="button" class="net-tool '+(treatment===x.id?'chosen':'')+'" data-role-treatment="'+x.id+
    '" aria-pressed="'+(treatment===x.id)+'" '+(locked?'disabled':'')+'>'+treatmentArt(x.id,19)+escape(x.name)+'</button>').join('')+'</div>'+
    '<div class="section-label net-vow-label">ОБЕТ ПЕРЕД СУДОМ</div><div class="vow-options net-vow-options">'+VOWS.map(x=>'<button type="button" data-role-vow="'+x.id+'" class="vow-option '+(vow===x.id?'chosen':'')+'" aria-pressed="'+(vow===x.id)+'" '+(locked?'disabled':'')+'><strong>'+escape(x.name)+'</strong><small>'+escape(x.detail)+'</small></button>').join('')+'</div>'+
    '<span class="net-role-small">'+(done?'Дар поставлен. Можно изменить до печати.':
      'Укажите предмет и подготовку — выбранное сразу появится на общем алтаре.')+'</span>';
  }else if(task==='bell'){
   controls='<div class="net-tool-row">'+[1,2,3].map(x=>'<button type="button" class="net-tool '+(view.altar?.bell===x?'chosen':'')+
    '" data-role-bell="'+x+'" aria-pressed="'+(view.altar?.bell===x)+'" '+(locked?'disabled':'')+'>'+x+' удар'+(x===1?'':'а')+'</button>').join('')+'</div>';
  }else if(task==='height'){
   controls='<div class="net-tool-row">'+['low','high'].map(x=>'<button type="button" class="net-tool '+(view.altar?.height===x?'chosen':'')+
    '" data-role-height="'+x+'" aria-pressed="'+(view.altar?.height===x)+'" '+(locked?'disabled':'')+'>'+
    (x==='low'?'У подножия':'Вознести дар')+'</button>').join('')+'</div>';
  }
  return '<section class="net-task '+(done?'task-done':'')+'"><div class="net-task-title"><span>'+
   escape(taskNames[task])+'</span><span>'+(done?'ГОТОВО':'ТРЕБУЕТСЯ')+'</span></div>'+
   (clue?'<div class="net-clue"><span>ТОЛЬКО ВАМ ОТКРЫТО</span><strong>'+escape(clue.text)+'</strong></div>':'')+controls+'</section>';
 }
 function phasePlay(){
  const m=view.match,tasks=view.ownTasks||[],timer=Math.max(0,Math.ceil((view.deadlineAt-(Date.now()+clockOffset))/1000));
  const chosen=getItem(view.altar?.itemId),all=view.players.length,locked=!!view.locked?.[ownId];
  const ownDone=tasks.length>0&&tasks.every(k=>view.done?.[k]);
  const signals=(view.announcements||[]).slice(-9);
  const dogmas=(m.doctrines||[]).map(id=>'<span class="net-rule">'+escape(getDoctrine(id)?.name||'')+'</span>').join('');
  return '<section class="net-play">'+sharedHeader()+'<div class="net-play-main">'+
   '<div class="net-shrine"><div class="net-mask">'+godArt()+'</div>'+
   '<div class="net-plinth">'+(chosen?offeringArt(chosen.id,93):'<span>?</span>')+'</div>'+
   '<div class="net-prophecy"><span>СКРЫТОЕ ЗНАМЕНИЕ</span><p>'+escape(view.riteTitle||'ОГО ждёт вашего дара')+
   '</p><small>Каждый жрец знает лишь свою часть обряда.</small></div></div>'+
   '<div class="net-actions net-actions-v4"><div class="net-live"><span>ДО СУДА <b data-net-timer>'+timer+
   '</b> С</span><span>'+Object.keys(view.locked||{}).length+'/'+all+' ЗАПЕЧАТАЛИ</span></div>'+
   (m.incident?'<div class="incident-brief net-incident"><div class="incident-stamp">'+incidentArt(m.incident.id,42)+'</div><div><strong>СОБЫТИЕ: '+escape(m.incident.title)+'</strong><p>'+escape(m.incident.story)+'</p></div><b class="incident-delta '+(m.incident.delta>0?'bonus':'penalty')+'">'+(m.incident.delta>0?'+1':'−1')+'</b></div>':'')+
   '<div class="section-label">ВАШИ ОБЯЗАННОСТИ</div>'+
   tasks.map(roleCard).join('')+
   '<div class="section-label">НАСТЕННЫЕ ЗНАМЕНИЯ</div>'+
   '<div class="net-messages">'+(signals.length?signals.map(x=>{
    const name=view.players.find(p=>p.id===x.by)?.name||'Жрец';
    return '<div><b>'+escape(name)+'</b><span>'+escape(x.text)+'</span></div>';
   }).join(''):'<p>Пока никто не передал знамение. ОГО явно что-то скрывает.</p>')+'</div>'+
   '<div class="net-signal-actions"><button data-role-call="help">Нужна подсказка</button>'+
   '<button data-role-call="warn">Проверьте запрет</button>'+
   '<button data-role-call="agree">Согласен</button>'+
   '<button data-role-call="urgent">Скоро суд!</button></div>'+
   (dogmas?'<div class="net-dogma-line">'+dogmas+'</div>':'')+
   '<div class="section-label">КТО УЖЕ ИСПОЛНИЛ СВОЙ ДОЛГ</div>'+assignedRoster()+
   (locked?'<button type="button" class="btn secondary" data-net="unlock">ИЗМЕНИТЬ СВОЁ РЕШЕНИЕ</button>':
   '<button type="button" class="btn primary" data-net="lock" '+(!ownDone?'disabled':'')+'>'+
   (ownDone?'ЗАПЕЧАТАТЬ МОЮ ЧАСТЬ →':'СНАЧАЛА ЗАВЕРШИТЕ СВОИ ДЕЛА')+'</button>')+
   '</div></div></section>';
 }
 function phaseJudgment(){
  const m=view.match,j=m.judgment,a=view.acks||{};
  const verdict=j.verdict==='bless'?'БОГ ДОВОЛЕН':j.verdict==='wrath'?'БОГ РАЗГНЕВАН':'БОГ ЗАДУМАЛСЯ';
  const item=getItem(j.selected);
  return '<section class="net-verdict">'+sharedHeader()+'<div class="net-verdict-head">'+
   '<div class="net-mask verdict-'+j.verdict+'">'+godArt()+'</div><div><span class="chapter">СУД НАД ОБЩИМ ДАРОМ</span>'+
   '<h1>'+verdict+'</h1><p>'+escape(j.miracleText)+'</p><p class="net-vow-result">'+escape(VOWS.find(v=>v.id===j.vow)?.name||'Обычный обряд')+'</p>'+
   '<strong>Оценка '+j.score+' · Милость '+(j.faithDelta>0?'+':'')+j.faithDelta+'</strong></div></div>'+
   '<div class="section-label">ОГО ПРОВЕРИЛ</div><div class="net-score-list">'+
   '<div><span>Общее подношение: '+escape(item?.name||'Каравай')+'</span><strong>'+j.score+'</strong></div>'+
   (j.criteria||[]).map(c=>'<div><span>'+escape(c.name)+'</span><strong>'+c.score+'/'+c.max+'</strong></div>').join('')+
   (j.doctrineResults||[]).map(d=>'<div><span>'+escape(getDoctrine(d.id)?.name||'Догмат')+'</span><strong>'+
    (d.delta>0?'+':'')+d.delta+'</strong></div>').join('')+'</div>'+
   ((j.unfinished||[]).length?'<p class="net-unfinished">Не успели: '+j.unfinished.map(t=>taskNames[t]).join(', ')+
    '. Сервер применил стандартные решения.</p>':'')+
   controls(a[ownId]?'ПРИГОВОР ПРИНЯТ · ЖДЁМ ОСТАЛЬНЫХ':'ПРИЗНАТЬ ПРИГОВОР →','ack',!!a[ownId],'primary')+
   '</section>';
 }
 function phaseDogma(){
  const m=view.match,offers=m.offers||[],votes=view.votes||{},chosen=votes[ownId];
  return '<section class="net-council">'+sharedHeader()+'<div class="net-council-body"><div class="net-mask">'+godArt()+'</div>'+
   '<div><span class="chapter">СОБОР ПОСЛЕ СУДА</span><h1>Какое чудо стало законом?</h1>'+
    '<p>Каждый выбирает один догмат. Большинство определит правило следующих обрядов. При равенстве побеждает первое предложение.</p>'+
    '<div class="net-dogma-picks">'+offers.map(id=>{const d=getDoctrine(id);return '<button data-net-vote="'+id+
     '" type="button" class="'+(chosen===id?'chosen':'')+'" aria-pressed="'+(chosen===id)+'">'+
     '<b>'+escape(d.name)+'</b><span>'+escape(d.desc)+'</span></button>'}).join('')+'</div>'+
    '<p class="net-votes">'+Object.keys(votes).length+'/'+view.players.length+' жрецов проголосовали'+
    (chosen?' · Ваш голос учтён.':'')+'</p></div></div></section>';
 }
 function phaseEnd(){
  const m=view.match,finished=m.history?.length||0,win=m.faith>0;
  return '<section class="net-end">'+sharedHeader()+'<div class="net-end-head">'+
   '<div class="net-mask">'+godArt()+'</div><div><span class="chapter">ПОСЛЕДНЕЕ СЛОВО НЕБЕС</span><h1>'+(
    win?'ОГО ПРИЗНАЛ ЦЕРКОВЬ':'ХРАМ ОСТАЛСЯ БЕЗ БОГА')+'</h1>'+
    '<p>Милость: '+m.faith+' · Обрядов: '+finished+' · Новых догматов: '+m.doctrines.length+'</p></div></div>'+
    '<div class="net-end-list">'+m.history.map((h,i)=>'<div><b>'+String(i+1).padStart(2,'0')+' · '+escape(h.riteTitle)+'</b>'+
    '<span>'+escape(h.miracleText||'')+'</span></div>').join('')+'</div>'+
    (view.host===ownId?controls('НОВАЯ СЛУЖБА С ЭТОЙ ГРУППОЙ →','start',false,'primary'):
     '<p class="net-wait">Новый обряд начинает настоятель.</p>')+
    controls('Покинуть комнату','leave')+'</section>';
 }
 function intro(){
  return '<section class="net-intro"><div class="net-intro-mask">'+godArt()+'</div>'+
   '<div class="net-intro-form"><span class="chapter">POCKETNET · НАСТОЯЩИЕ ИГРОКИ</span><h1>Собор зовёт</h1>'+
    '<p>Создайте храм или присоединитесь по коду. Роли разные: один раскрывает знамение, другой готовит дар, третий звонит. Общий приговор выносит сервер.</p>'+
    '<label for="bnt-name">ИМЯ ЖРЕЦА</label><input id="bnt-name" autocomplete="nickname" maxlength="24" value="'+escape(name)+'" placeholder="Ваше имя"/>'+
    controls('ОТКРЫТЬ СВОЙ ХРАМ →','create',false,'primary')+
    '<label for="bnt-room-code">КОД КОМНАТЫ ИЛИ ССЫЛКА</label>'+
    '<input id="bnt-room-code" autocapitalize="characters" autocomplete="off" maxlength="180" placeholder="Восемь символов" value="'+escape(code)+'"/>'+
    controls('ПРИСОЕДИНИТЬСЯ →','join',false,'secondary')+
    (savedRoom()?controls('ВЕРНУТЬСЯ В ПРОШЛУЮ КОМНАТУ','resume',false,'secondary'):'')+
    '<p class="net-disclaimer">Тайные подсказки защищены сервером. Встроенные сигналы позволяют играть без голосового чата.</p>'+
   '</div></section>';
 }
 function markup(){
  return '<div class="net-shell">'+
   (status==='connecting'?'<div class="net-loading"><div class="net-mask">'+godArt()+'</div><h2>Зовём небеса…</h2><p>Устанавливаем защищённое соединение с PocketNet.</p>'+
     controls('Отмена','cancel')+'</div>':
    status==='reconnecting'?'<div class="net-loading"><div class="net-mask">'+godArt()+'</div><h2>Связь оборвалась</h2>'+
    '<p>Место в храме сохранено. PocketNet пытается подключиться повторно.</p>'+
    controls('Покинуть комнату','leave')+'</div>':
    status!=='room'||!view?intro():view.phase==='lobby'?lobby():view.phase==='play'?phasePlay():
    view.phase==='judgment'?phaseJudgment():view.phase==='dogma'?phaseDogma():phaseEnd())+
   (error?'<p class="net-error" role="alert">'+escape(error)+'</p>':'')+
   (notice?'<p class="net-notice" role="status">'+escape(notice)+'</p>':'')+
  '</div>';
 }

 function action(event){
  const el=event.target.closest('[data-net],[data-net-vote],[data-role-reveal],[data-role-item],[data-role-treatment],[data-role-vow],[data-role-bell],[data-role-height],[data-role-call],[data-role-filter]');
  if(!el)return false;
  const own=view?.ownTasks||[],sealed=!!view?.locked?.[ownId];
  if(el.hasAttribute('data-role-filter')){offeringFilter=el.dataset.roleFilter;show();return true;}
  if(el.hasAttribute('data-net-vote')){command('vote',{id:el.dataset.netVote});return true}
  if(el.hasAttribute('data-role-call')){command('call',{kind:el.dataset.roleCall});return true}
  if(el.hasAttribute('data-role-reveal')){
   const task=el.dataset.roleReveal;
   if(!sealed&&own.includes(task))command('reveal',{task});return true;
  }
  if(el.hasAttribute('data-role-item')||el.hasAttribute('data-role-treatment')||el.hasAttribute('data-role-vow')){
   if(sealed||!own.includes('offering'))return true;
   if(el.hasAttribute('data-role-item'))draftItem=el.dataset.roleItem;
   else if(el.hasAttribute('data-role-treatment'))draftTreatment=el.dataset.roleTreatment;
   else draftVow=el.dataset.roleVow;
   const item=draftItem||view?.altar?.itemId,treatment=draftTreatment||view?.altar?.treatment;
   if(item&&treatment)command('set',{task:'offering',itemId:item,treatment,vow:draftVow??(view.altar?.vow||'steady')});
   show();return true;
  }
  if(el.hasAttribute('data-role-bell')){if(!sealed&&own.includes('bell'))command('set',{task:'bell',value:Number(el.dataset.roleBell)});return true}
  if(el.hasAttribute('data-role-height')){if(!sealed&&own.includes('height'))command('set',{task:'height',value:el.dataset.roleHeight});return true}
  switch(el.dataset.net){
   case 'create':{const i=document.querySelector('#bnt-name');if(i)nickname(i.value);void start('create');break}
   case 'join':{const i=document.querySelector('#bnt-name'),j=document.querySelector('#bnt-room-code');
    if(i)nickname(i.value);if(j)invite(j.value);void start('join');break}
   case 'resume':{const i=document.querySelector('#bnt-name');if(i)nickname(i.value);void start('resume');break}
   case 'cancel':close();show();break;
   case 'leave':leave();break;
   case 'start':if(client?.socket?.readyState===WebSocket.OPEN)send({type:'start'});break;
   case 'lock':command('lock');break;
   case 'unlock':command('unlock');break;
   case 'ack':command('ack');break;
   case 'copy':{
    const u=new URL(location.href);u.searchParams.set('room',roomId.slice(0,8));u.hash='';
    const invite=u.href;Promise.resolve(navigator.clipboard?.writeText(invite)||
     Promise.reject(Error('Clipboard unavailable'))).then(()=>message('Ссылка скопирована.'))
      .catch(()=>message('Ссылка: '+invite));break
   }
  }
  return true;
 }
 return {markup,action,start,leave,close,destroy,isLive,get phase(){return view?.phase||status},
  get roomId(){return roomId},get view(){return view},get ownId(){return ownId},
  get status(){return status},get error(){return error}};
}
