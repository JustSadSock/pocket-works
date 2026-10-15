import { PocketNet } from '../../../shared/capabilities/net.js';
import { getPocketIdentity, preferredPocketName, pocketIdentitySessionKey } from '../../../shared/capabilities/identity.js';
import { byType } from './models.js';

const SERVER=location.origin+'/pocketnet';
const KEY='pocket-works:komnatka:coop:';
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const memory=new Map();
const storage={
 getItem(k){try{return sessionStorage.getItem(KEY+k)}catch{return memory.get(k)||null}},
 setItem(k,v){try{sessionStorage.setItem(KEY+k,v)}catch{memory.set(k,v)}},
 removeItem(k){try{sessionStorage.removeItem(KEY+k)}catch{memory.delete(k)}}
};
const palette=['#93b3a0','#d89d81','#9f9ac8','#af9868','#7aadb6'];
const mmss=secs=>Math.floor(Math.max(0,secs)/60)+':'+String(Math.max(0,secs)%60).padStart(2,'0');
const PHASE={lobby:'Ожидаем друзей',preview:'Запомните комнату',build:'Обустраиваем вместе',result:'Наш результат'};
export function createOnlineController({onEnter,onExit,onRoom,onPresence,onDismiss,toast}){
 const $=id=>document.getElementById(id);
 const layer=$('onlineLayer'),panel=$('onlinePanel'),hud=$('onlineHUD');
 let net=null,me=null,room=null,code='',connected=false,busy=false,modal=false;
 let mode='tenants',name='Гость',joinCode=new URLSearchParams(location.search).get('room')||'';
 let reference=false,phase='',syncAt=0,awaiting=false,returnToHome=false;
 let review=null;
 let identity=null;
 const send=payload=>{
  if(!connected||!net)return false;
  try{net.sendGame(payload);return true;}catch{toast('Соединение потеряно. Переподключаемся…');return false;}
 };
 async function copy(text){
  try{await navigator.clipboard.writeText(text);toast('Скопировано');}
  catch{toast('Не получилось скопировать. Код можно выделить вручную.');}
 }
 function timer(){
  if(room?.deadline&&['preview','build'].includes(room.phase)){
   $('onlineClock').textContent=mmss(Math.ceil((room.deadline-Date.now())/1000));
  }else $('onlineClock').textContent='';
 }
 function reviewMarkup(){
  if(!review)return '<p class="memory-unavailable">Изображения недоступны. Эталон можно осмотреть отдельно.</p>';
  const pictures=[['Эталон',review.model],['Ваша комната',review.assembled]]
   .map(([label,src])=>'<figure><figcaption>'+label+'</figcaption>'+
    (src?.startsWith('data:image/')?'<img src="'+src+'" alt="'+label+'">':'<div class="memory-no-photo">Нет снимка</div>')+'</figure>').join('');
  const rows=(review.summary?.rows||[]).map(entry=>{
   const name=byType[entry.type]?.name||entry.type;
   return '<li class="memory-row '+entry.status+'"><span>'+escapeText(name)+'</span><small>'+escapeText(entry.detail)+'</small></li>';
  }).join('');
  const info=review.summary||{exact:0,partial:0,missing:0,extra:0};
  return '<section class="memory-review" aria-label="Сравнение с образцом">'+
   '<div class="memory-images">'+pictures+'</div>'+
   '<div class="memory-summary">'+info.exact+' точных · '+info.partial+' частичных · '+
   info.missing+' пропущено · '+info.extra+' лишних</div>'+
   '<ul class="memory-differences">'+rows+'</ul></section>';
 }
 function tenantResults(){
  return '<div class="tenant-results">'+(room?.goals||[]).map(g=>'<div class="tenant-result '+(g.done?'done':'')+'">'+
   '<span>'+(g.done?'✓':'○')+'</span><strong>'+escapeText(g.label)+'</strong><small>'+
   g.found+'/'+g.required+'</small></div>').join('')+'</div>';
 }
 function renderHud(){
  hud.hidden=!room;
  if(!room)return;
  $('onlineMode').textContent=room.mode==='memory'?'Собери по памяти':'Новые жильцы';
  $('onlineState').textContent=connected?PHASE[room.phase]:'Переподключаемся…';
  $('onlineCode').textContent=code;
  $('onlineCompare').hidden=room.phase!=='result'||room.mode!=='memory';
  $('onlineCompare').textContent=reference?'Моя комната':'Показать образец';
  $('onlineFinish').hidden=room.phase!=='build'||room.host!==me?.id;
  $('onlineNext').hidden=!((room.phase==='preview'||room.phase==='result')&&room.host===me?.id);
  $('onlineNext').textContent=room.phase==='preview'?'Начать сборку':'Новый раунд';
  $('onlineParticipants').innerHTML=(room.players||[]).map((p,i)=>
   '<span class="online-person" style="--player-color:'+palette[i%palette.length]+'"><i></i>'+escapeText(p.name)+
   (room.selections?.[p.id]?' ✋':'')+'</span>').join('');
  if(room.phase==='result'){
   $('onlineGoals').innerHTML='<strong class="online-score">'+(room.score||0)+'%</strong> '+
     (room.mode==='memory'?'совпадение с образцом':(room.goals||[]).filter(g=>g.done).length+' из '+(room.goals||[]).length+' пожеланий');
  }else if(room.phase==='preview'){
   $('onlineGoals').textContent='Запомни расположение, цвета и повороты вещей.';
  }else if(room.mode==='tenants'&&room.phase==='build'){
   const job=room.brief||{};
   $('onlineGoals').innerHTML='<div class="tenant-brief"><b>'+escapeText(job.title||'Новые жильцы')+'</b><span>'+
    escapeText(job.text||'Соберите комнату по пожеланиям.')+'</span></div>'+
    (room.goals||[]).map(g=>
    '<span class="online-goal '+(g.done?'done':'')+'">'+(g.done?'✓':'○')+' '+escapeText(g.label)+' <small>'+g.found+'/'+g.required+'</small></span>').join('');
  }else $('onlineGoals').textContent='';
  timer();
 }
 function renderModal(){
  layer.hidden=!modal;
  if(!modal)return;
  if(busy){
   panel.innerHTML='<div class="online-wait"><div class="online-spinner"></div><strong>Подключаемся к PocketNet…</strong></div>';
   return;
  }
  if(!room){
   panel.innerHTML='<div class="online-title"><span>ВМЕСТЕ УЮТНЕЕ</span><h2>Комнатка для друзей</h2><p>Обустраивайте одну комнату вместе — от двух до пяти игроков.</p></div>'+
    '<div class="online-choices">'+
      '<button data-online-mode="tenants" class="'+(mode==='tenants'?'chosen':'')+'"><strong>Новые жильцы</strong><small>Выполняйте милые пожелания жильца</small></button>'+
      '<button data-online-mode="memory" class="'+(mode==='memory'?'chosen':'')+'"><strong>Собери по памяти</strong><small>Запомните комнату и восстановите её</small></button>'+
    '</div>'+
    '<label class="online-field-label" for="onlineName">Твоё имя</label>'+
    '<input id="onlineName" class="online-input" maxlength="22" value="'+escapeText(name)+'" placeholder="Твоё имя">'+
    '<button id="onlineCreate" class="online-primary">Создать комнату</button>'+
    '<div class="online-separator">или присоединиться</div>'+
    '<div class="online-join"><input id="onlineJoinCode" class="online-input" maxlength="36" autocapitalize="characters" value="'+escapeText(joinCode)+'" placeholder="Код друга"><button id="onlineJoin">Войти</button></div>';
   panel.querySelectorAll('[data-online-mode]').forEach(b=>b.addEventListener('click',()=>{
    name=$('onlineName')?.value||name;joinCode=$('onlineJoinCode')?.value||joinCode;
    mode=b.dataset.onlineMode;renderModal();
   }));
   $('onlineCreate').onclick=()=>connect('create');
   $('onlineJoin').onclick=()=>connect('join');
  }else{
   const host=room.host===me?.id;
   panel.innerHTML='<div class="online-title"><span>'+escapeText(PHASE[room.phase]||'В комнате')+'</span>'+
    '<h2>'+(room.phase==='lobby'?'Наша комнатка':room.mode==='memory'?'Собери по памяти':'Новые жильцы')+'</h2>'+
    '<p>'+(room.phase==='lobby'?'Пригласи друзей по коду или ссылке.':room.phase==='result'?'Сравните итог с заданием.':room.mode==='tenants'?escapeText(room.brief?.text||'Соберите уют по пожеланиям жильца.'):'Восстановите интерьер вместе.')+'</p></div>'+
    (room.phase==='result'?'':'<div class="online-invite"><small>КОД ПРИГЛАШЕНИЯ</small><strong>'+escapeText(code||'••••••••')+'</strong>'+
    '<div><button id="onlineCopyCode">Код</button><button id="onlineCopyLink">Ссылка другу</button></div></div>'+
    '<div class="online-roster">'+(room.players||[]).map((p,i)=>'<span><i style="background:'+palette[i%palette.length]+'"></i>'+
    escapeText(p.name)+(p.id===room.host?' · создатель':'')+'</span>').join('')+'</div>')+
    (host&&room.phase==='lobby'?'<div class="online-choices">'+
     '<button data-online-mode="tenants" class="'+(mode==='tenants'?'chosen':'')+'"><strong>Новые жильцы</strong><small>Собрать уют по пожеланиям</small></button>'+
     '<button data-online-mode="memory" class="'+(mode==='memory'?'chosen':'')+'"><strong>Собери по памяти</strong><small>Запомнить и повторить интерьер</small></button></div>':'')+
    (room.phase==='result'?'<div class="online-result"><strong>'+Number(room.score||0)+'%</strong><span>'+
     (room.mode==='memory'?'Совпадение с образцом':'Пожелания выполнены')+'</span></div>':'')+
     (room.phase==='result'&&room.mode==='memory'?reviewMarkup():'')+
     (room.phase==='result'&&room.mode==='tenants'?tenantResults():'')+
    (host&&['lobby','result'].includes(room.phase)?'<button id="onlineStart" class="online-primary" '+((room.players?.length||0)<2?'disabled':'')+'>Начать игру</button>':'')+
    (room.phase==='result'&&room.mode==='memory'?'<button id="onlineCompareModal" class="online-secondary">Осмотреть эталон крупно</button>':'')+
    (host&&room.phase==='preview'?'<button id="onlineSkip" class="online-primary">Мы запомнили — начать</button>':'')+
    (room.phase==='build'?'<button id="onlineContinue" class="online-primary">Вернуться к комнате</button>':'')+
    '<button id="onlineLeave" class="online-secondary">Покинуть комнату</button>';
   $('onlineCopyCode')?.addEventListener('click',()=>copy(code));
   $('onlineCopyLink')?.addEventListener('click',()=>copy(location.origin+location.pathname+'?room='+encodeURIComponent(code)));
   panel.querySelectorAll('[data-online-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.onlineMode;renderModal();}));
   $('onlineStart')?.addEventListener('click',()=>send({type:'start',mode}));
   $('onlineSkip')?.addEventListener('click',()=>send({type:'skip_preview'}));
   $('onlineCompareModal')?.addEventListener('click',toggleReference);
   $('onlineContinue')?.addEventListener('click',close);
   $('onlineLeave')?.addEventListener('click',leave);
  }
 }
 function render(){renderHud();renderModal();}
 function apply(next){
  if(!next||!Array.isArray(next.players))return;
  const changed=next.phase!==phase;
  phase=next.phase;
  room={...next,roomId:room?.roomId};
  if(changed){
   reference=next.phase==='preview';
   if(next.phase==='result'){modal=true;toast('Раунд завершён. Посмотрите результат.');}
   if(next.phase==='preview')modal=false;
   if(next.phase==='build'){modal=false;if(next.mode==='memory')toast('Теперь соберите комнату по памяти!');}
  }
  const newReview=onRoom(room,{reference,phaseChanged:changed});
  if(next.phase==='result'&&next.mode==='memory'&&newReview)review=newReview;
  if(changed&&next.phase!=='result')review=null;
  onPresence(room.selections||{},room.players||[],me?.id);
  render();
 }
 async function connect(kind){
  if(busy)return;
  name=($('onlineName')?.value||name||'Гость').trim().slice(0,22);
  joinCode=($('onlineJoinCode')?.value||joinCode).trim().toUpperCase();
  if(!name){toast('Напиши имя.');return;}
  if(kind==='join'&&!(/^[A-F0-9]{8}$/.test(joinCode)||/^[a-f0-9-]{36}$/i.test(joinCode))){
   toast('Нужен восьмизначный код приглашения.');return;
  }
  busy=true;renderModal();
  try{
   const response=await fetch(SERVER+'/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});
   const health=await response.json();
   if(!response.ok||!health.ok||!health.modules?.includes('komnatka'))throw Error('Онлайн-модуль пока недоступен на сервере.');
   identity=await getPocketIdentity({force:false}).catch(()=>null);
   if(identity?.complete)name=preferredPocketName(identity,name);
   net?.close();const client=new PocketNet({serverUrl:SERVER,name,storage,identityKey:pocketIdentitySessionKey(identity)});
   net=client;client.roomId=null;client.persist();
   client.on('connected',m=>{
    if(client!==net)return;
    me=m.player;connected=true;busy=false;
    // PocketNet restores the existing room itself after reconnect.
    // Never create a second room or rejoin by invitation on a recovered socket.
    if(!room&&!client.roomId){
     if(kind==='create')client.createRoom('komnatka',{});
     else client.joinRoom(joinCode);
    }
    render();
   });
   client.on('room_joined',m=>{
    if(client!==net)return;
    room={...m.state,roomId:m.roomId};
    code=m.code||m.roomId?.slice(0,8).toUpperCase()||'';
    onEnter();apply(room);busy=false;modal=room.phase==='lobby';render();
   });
   client.on('game_event',m=>{
    if(client!==net)return;
    if(m.event?.type==='state'){
     const next=m.event.payload;
     if(!room||next.revision>=room.revision)apply(next);
    }
    if(m.event?.type==='notice'){
     toast(String(m.event.payload||'Не получилось выполнить действие.'));
     send({type:'sync'});
    }
   });
   client.on('presence',()=>send({type:'sync'}));
   client.on('disconnected',()=>{if(client===net){connected=false;render();}});
   client.on('room_closed',()=>{if(client===net){leave();toast('Комната закрыта.');}});
   client.on('error',e=>{if(client===net){busy=false;toast(e.message||'Ошибка PocketNet');render();}});
   await client.connect();
  }catch(e){
   busy=false;connected=false;net?.close();net=null;
   toast(e.message||'Не получилось подключиться.');render();
  }
 }
 function toggleReference(){
  if(room?.phase!=='result'||room.mode!=='memory')return;
  reference=!reference;
  onRoom(room,{reference,phaseChanged:false});
  modal=false;render();
 }
 function leave(){
  if(net&&connected)try{net.leaveRoom();}catch{}
  net?.close();net=null;me=null;room=null;code='';connected=false;busy=false;modal=false;phase='';reference=false;review=null;
  returnToHome=false;onExit();render();
 }
 function open(requestedMode=null,fromHome=false){
  if(['tenants','memory'].includes(requestedMode)&&!room)mode=requestedMode;
  returnToHome=Boolean(fromHome);modal=true;render();
 }
 function close(){modal=false;render();if(!room&&returnToHome){returnToHome=false;onDismiss?.();}}
 let prev=null;
 const interval=setInterval(()=>{
  if(room){timer();if(connected&&['build','preview'].includes(room.phase)&&Date.now()-(prev||0)>5000){
   prev=Date.now();send({type:'sync'});
  }}
 },1000);
 $('onlineBtn').addEventListener('click',()=>open());
 $('onlineClose').addEventListener('click',close);
 layer.addEventListener('pointerdown',e=>{if(e.target===layer)close();});
 $('onlineFinish').addEventListener('click',()=>send({type:'finish'}));
 $('onlineCompare').addEventListener('click',toggleReference);
 $('onlineNext').addEventListener('click',()=>send(room?.phase==='preview'?{type:'skip_preview'}:{type:'start',mode}));
 $('onlineCode').addEventListener('click',()=>copy(code));
 render();
 return {
  open,close,leave,send,
  get active(){return!!room},get canEdit(){return!!room&&connected&&room.phase==='build'},
  get phase(){return room?.phase},get mode(){return room?.mode},get state(){return room},
  get myId(){return me?.id},get connected(){return connected},
  select(id,action='select'){if(room?.phase==='build')send({type:'select',id,action});},
  markers(){if(room)onPresence(room.selections||{},room.players||[],me?.id);}
 };
}
