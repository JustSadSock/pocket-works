
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey} from '../../shared/capabilities/identity.js';
import {ITEMS,TREATMENTS,getItem,getRite,getDoctrine,MAX_ROUNDS} from './engine.js';
import {offeringArt,godArt} from './art.js';

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
export function createOnline(onChange,onExit){
 let clockOffset=0,client=null,view=null,ownId='',roomId='',name=store.getItem('nickname')||'',code=new URL(location.href).searchParams.get('room')||'',status='intro',error='',notice='',lastMode='',epoch=0,sequence=0;
 const show=()=>onChange();
 const isLive=()=>client?.socket?.readyState===WebSocket.OPEN&&status==='room';
 const message=s=>{notice=s;show()};
 const clean=()=>{const previous=client;client=null;epoch++;if(previous){previous.closed=true;try{previous.close()}catch{}}};
 const apply=s=>{
  if(!s||!Array.isArray(s.players)||typeof s.phase!=='string')return;
  if(view&&Number.isInteger(s.revision)&&s.revision<view.revision)return;
  const old=view;view=s;if(Number.isFinite(s.serverNow))clockOffset=s.serverNow-Date.now();sequence=Math.max(sequence,s.lastSeq?.[ownId]||0);
  if(old?.phase!==s.phase)notice='';
  status='room';show();
 };
 const bind=(net,id)=>{
  net.on('connected',x=>{if(id!==epoch)return;ownId=x.player.id;error='';status='connecting';show()});
  net.on('room_joined',x=>{if(id!==epoch)return;roomId=x.roomId;ownId=ownId||x.players?.[0]?.id||'';apply(x.state);send({type:'sync'})});
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
   '<p>Отправьте товарищам код. Все готовят свои подношения независимо; сервер объединяет результат обряда.</p>'+
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
 function phasePlay(){
  const m=view.match,rite=getRite(m),mine=view.choices[ownId]||safeAction(),locked=!!view.ready[ownId];
  const props=ITEMS.map(o=>'<button class="net-offering '+(mine.itemId===o.id?'chosen':'')+'" data-net-item="'+o.id+'" type="button" '+(locked?'disabled':'')+
   ' aria-pressed="'+(mine.itemId===o.id)+'">'+offeringArt(o.id,54)+'<b>'+escape(o.name)+'</b></button>').join('');
  const treat=TREATMENTS.map(t=>'<button class="net-tool '+(mine.treatment===t.id?'chosen':'')+'" data-net-treatment="'+t.id+
   '" type="button" '+(locked?'disabled':'')+' aria-pressed="'+(mine.treatment===t.id)+'">'+escape(t.name)+'</button>').join('');
  const beats=[1,2,3].map(n=>'<button class="net-tool '+(mine.bell===n?'chosen':'')+'" data-net-bell="'+n+
   '" type="button" '+(locked?'disabled':'')+' aria-pressed="'+(mine.bell===n)+'">'+n+'</button>').join('');
  const height=['low','high'].map((x,i)=>'<button class="net-tool '+(mine.height===x?'chosen':'')+'" data-net-height="'+x+
   '" type="button" '+(locked?'disabled':'')+' aria-pressed="'+(mine.height===x)+'">'+(i?'Поднять':'У подножия')+'</button>').join('');
  const dogmas=m.doctrines.map(id=>'<span class="net-rule">'+escape(getDoctrine(id).name)+'</span>').join('');
  const timer=Math.max(0,Math.ceil((view.deadlineAt-Date.now())/1000));
  return '<section class="net-play">'+sharedHeader()+'<div class="net-play-main">'+
   '<div class="net-shrine">'+
   '<div class="net-mask">'+godArt()+'</div><div class="net-plinth">'+(mine.itemId?offeringArt(mine.itemId,95):'<span>?</span>')+'</div>'+
   '<div class="net-prophecy"><span>ЗНАМЕНИЕ · '+escape(rite.title)+'</span><p>'+escape(rite.riddle)+'</p></div>'+
   '</div><div class="net-actions">'+
   '<div class="net-live"><span>ДО СУДА <b data-net-timer>'+timer+'</b> С</span><span>'+Object.keys(view.ready).length+'/'+view.players.length+' ГОТОВЫ</span></div>'+
   '<div class="section-label">I. ПОДНОШЕНИЕ</div><div class="net-offerings">'+props+'</div>'+
   '<div class="net-tools"><div><div class="section-label">II. ОБРАБОТКА</div><div class="net-tool-row">'+treat+'</div></div>'+
   '<div><div class="section-label">III. КОЛОКОЛ</div><div class="net-tool-row">'+beats+'</div></div>'+
   '<div class="net-height"><div class="section-label">IV. ВЫСОТА</div><div class="net-tool-row">'+height+'</div></div></div>'+
   (dogmas?'<div class="net-dogma-line">'+dogmas+'</div>':'')+contributions()+
   (locked?controls('ИЗМЕНИТЬ ПОДНОШЕНИЕ','unlock',false,'secondary')+
       '<p class="net-wait">Ваш дар запечатан. Суд начнётся, когда все будут готовы, либо закончится время.</p>':
    controls(mine.itemId?'ЗАПЕЧАТАТЬ ПОДНОШЕНИЕ →':'СНАЧАЛА ВЫБЕРИТЕ ДАР','lock',!mine.itemId,'primary'))+
   '</div></div></section>';
 }
 function phaseJudgment(){
  const m=view.match,j=m.judgment,score=j.contributions||[],a=view.acks||{};
  const verdict=j.verdict==='bless'?'БОГ ДОВОЛЕН':j.verdict==='wrath'?'БОГ РАЗГНЕВАН':'БОГ ЗАДУМАЛСЯ';
  return '<section class="net-verdict">'+sharedHeader()+'<div class="net-verdict-head">'+
   '<div class="net-mask verdict-'+j.verdict+'">'+godArt()+'</div><div><span class="chapter">ОБЩИЙ СУД</span><h1>'+verdict+'</h1>'+
   '<p>'+escape(j.miracleText)+'</p><strong>Командный счёт: '+j.score+' · Милость '+(j.faithDelta>0?'+':'')+j.faithDelta+'</strong></div></div>'+
   '<div class="section-label">ПОДНОШЕНИЯ ЖРЕЦОВ</div><div class="net-score-list">'+score.map(c=>
    '<div><span>'+escape(c.name)+' · '+escape(getItem(c.action.itemId)?.name||'Дар')+'</span><strong>'+c.score+'</strong></div>').join('')+'</div>'+
   controls(a[ownId]?'СУД ПРИНЯТ · ОЖИДАНИЕ':'ПРИЗНАТЬ ПРИГОВОР →','ack',!!a[ownId],'primary')+'</section>';
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
    '<p>Создайте храм или присоединитесь по коду. Каждый жрец готовит свой дар, сервер решает судьбу всей церкви.</p>'+
    '<label for="bnt-name">ИМЯ ЖРЕЦА</label><input id="bnt-name" autocomplete="nickname" maxlength="24" value="'+escape(name)+'" placeholder="Ваше имя"/>'+
    controls('ОТКРЫТЬ СВОЙ ХРАМ →','create',false,'primary')+
    '<label for="bnt-room-code">КОД КОМНАТЫ ИЛИ ССЫЛКА</label>'+
    '<input id="bnt-room-code" autocapitalize="characters" autocomplete="off" maxlength="180" placeholder="Восемь символов" value="'+escape(code)+'"/>'+
    controls('ПРИСОЕДИНИТЬСЯ →','join',false,'secondary')+
    (savedRoom()?controls('ВЕРНУТЬСЯ В ПРОШЛУЮ КОМНАТУ','resume',false,'secondary'):'')+
    '<p class="net-disclaimer">На этой стадии все сведения об обрядах публичные. Тайные роли появятся в следующем обновлении.</p>'+
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
  const el=event.target.closest('[data-net],[data-net-item],[data-net-treatment],[data-net-bell],[data-net-height],[data-net-vote]');
  if(!el)return false;
  if(el.hasAttribute('data-net-item')||el.hasAttribute('data-net-treatment')||el.hasAttribute('data-net-bell')||el.hasAttribute('data-net-height')){
   const patch=el.dataset.netItem?{itemId:el.dataset.netItem}:
    el.dataset.netTreatment?{treatment:el.dataset.netTreatment}:
    el.dataset.netBell?{bell:Number(el.dataset.netBell)}:{height:el.dataset.netHeight};
   command('choose',{patch});return true;
  }
  if(el.hasAttribute('data-net-vote')){command('vote',{id:el.dataset.netVote});return true}
  switch(el.dataset.net){
   case 'create':{const i=document.querySelector('#bnt-name');if(i)nickname(i.value);void start('create');break}
   case 'join':{const i=document.querySelector('#bnt-name'),j=document.querySelector('#bnt-room-code');
    if(i)nickname(i.value);if(j)invite(j.value);void start('join');break}
   case 'resume':{const i=document.querySelector('#bnt-name');if(i)nickname(i.value);void start('resume');break}
   case 'cancel':close();show();break;
   case 'leave':leave();break;
   case 'start':{if(client?.socket?.readyState===WebSocket.OPEN)send({type:'start'});break}
   case 'lock':command('lock');break;
   case 'unlock':command('unlock');break;
   case 'ack':command('ack');break;
   case 'copy':{const u=new URL(location.href);u.searchParams.set('room',roomId.slice(0,8));u.hash='';
    const invite=u.href;Promise.resolve(navigator.clipboard?.writeText(invite)||
     Promise.reject(Error('Clipboard unavailable'))).then(()=>message('Ссылка скопирована.'))
      .catch(()=>message('Ссылка: '+invite));break}
  }
  return true;
 }
 return {markup,action,start,leave,close,destroy,isLive,get phase(){return view?.phase||status},
  get roomId(){return roomId},get view(){return view},get ownId(){return ownId},
  get status(){return status},get error(){return error}};
}
