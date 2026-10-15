import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { PocketNet } from '../../shared/capabilities/net.js';
import {getPocketIdentity,pocketAvatarMarkup,pocketIdProfileUrl} from '../../shared/capabilities/identity.js';
import { STEPS, INSTRUMENTS, stepMs, loopMs, unlockAudio, audioContext, playNote, canHearTrack, renderWav } from './audio.js';
installMobileRuntime();
const STORAGE='pocket-works:jam-tape:session-v1', PROFILE='pocket-works:jam-tape:profile-v1';
const view=document.querySelector('#view'), toastEl=document.querySelector('#toast');
const clipDialog=document.querySelector('#clipDialog'), confirmDialog=document.querySelector('#confirmDialog');
const localId=(()=>{try{let id=sessionStorage.getItem(PROFILE+':id');if(!id){id=crypto.randomUUID();sessionStorage.setItem(PROFILE+':id',id)}return id}catch{return crypto.randomUUID()}})();
let saved=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return null}})();
let name=(()=>{try{return localStorage.getItem(PROFILE+':name')||'Музыкант'}catch{return 'Музыкант'}})();
let pocketIdentity=null;
let instrument='keys', air=true, hearOthers=true, onlyMine=false;
let ownId=localId, screen='welcome', netClient=null, connected=false, room=null, isHost=false, pairingMode='', joinCode='', initialClips=[];
let session=null, recording=null, editClip=null, editNotes=[], editInst='keys', editBar=0, editHalf=0, editLength=1, editVelocity=88, held=new Map(), remoteVoices=new Map(), busy=false, timer=null, probeTimer=null, toastTimer=null;
let clockOffset=0,lastScheduledMs=0, displayedStep=-1;
const noteKeys=['a','s','d','f','g','h','j','k'];
const colors=['#e8663b','#519289','#d1a24d','#8595b3'];
const labels=Object.fromEntries(INSTRUMENTS.map(i=>[i.id,i.name]));
const ORIGIN=location.origin+'/pocketnet';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const self=()=>session?.players.find(p=>p.id===ownId);
const hostTime=()=>Date.now()+clockOffset;
const mine=()=>session?.tracks?.[ownId]||[];
const rand=()=>Math.random().toString(36).slice(2,7);
const fmt=x=>String(x).padStart(2,'0');
function inform(text){clearTimeout(toastTimer);toastEl.textContent=text;toastEl.classList.add('visible');toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),3300)}
function emptySession(){
 const p={id:ownId,name:name.slice(0,24),avatar:pocketIdentity?.complete?pocketIdentity.avatar:null,inst:instrument,air:true,online:true};
 return {bpm:108,playing:false,anchor:0,players:[p],tracks:{[ownId]:[]},rev:1};
}
function tidyClip(raw){
 if(!raw||typeof raw!=='object'||!labels[raw.inst]||!Array.isArray(raw.notes))return null;
 const notes=raw.notes.slice(0,96).filter(n=>Array.isArray(n)&&n.length===4&&n.every(Number.isFinite)&&
  Number.isInteger(n[0])&&n[0]>=0&&n[0]<64&&Number.isInteger(n[1])&&n[1]>=0&&n[1]<8)
  .map(n=>[n[0],n[1],clamp(Math.round(n[2]),1,16),clamp(Math.round(n[3]),10,100)]);
 const a=clamp(Math.floor(Number(raw.a)||0),0,63),b=clamp(Math.floor(Number(raw.b)||64),a+1,64);
 return {id:String(raw.id||'take-'+rand()).slice(0,42),inst:raw.inst,a,b,notes};
}
function tidySession(s){
 if(!s||typeof s!=='object'||!Array.isArray(s.players)||s.players.length>4||!s.tracks)return null;
 const players=s.players.filter(p=>typeof p?.id==='string'&&p.id.length<80&&typeof p?.name==='string').map(p=>({
  id:p.id,name:p.name.slice(0,24),avatar:typeof p.avatar==='string'&&['clay','moss','ink','sun','wave','ember','plum','stone'].includes(p.avatar)?p.avatar:null,inst:labels[p.inst]?p.inst:'keys',air:p.air!==false,online:p.online!==false
 }));
 if(!players.length)return null;
 const tracks={};
 for(const p of players){tracks[p.id]=(Array.isArray(s.tracks[p.id])?s.tracks[p.id]:[]).slice(0,6).map(tidyClip).filter(Boolean)}
 return {players,tracks,bpm:clamp(Math.round(Number(s.bpm)||108),60,180),playing:s.playing===true,anchor:Number.isFinite(s.anchor)?s.anchor:0,rev:Math.max(0,Math.round(Number(s.rev)||0)),host:typeof s.host==='string'?s.host:players[0]?.id};
}
function loadSketch(){
 const prior=tidySession(saved?.project);
 if(!prior)return emptySession();
 const previous=prior.players.find(p=>p.id===ownId);
 if(previous){instrument=previous.inst;air=previous.air}else{
  prior.players.unshift({id:ownId,name,avatar:pocketIdentity?.complete?pocketIdentity.avatar:null,inst:instrument,air:true,online:true});
  if(prior.players.length>4)prior.players=prior.players.slice(0,4);
  prior.tracks[ownId]=[];
 }
 prior.players=prior.players.map(p=>({...p,online:p.id===ownId,name:p.id===ownId?name:p.name,avatar:p.id===ownId?(pocketIdentity?.complete?pocketIdentity.avatar:null):p.avatar}));
 prior.playing=false;prior.anchor=0;return prior;
}
function saveSketch(){
 if(!session)return;
 saved={project:session,savedAt:Date.now()};
 try{localStorage.setItem(STORAGE,JSON.stringify(saved))}catch{inform('Место в памяти браузера закончилось — экспортируй микс')}
}
function setScreen(next){screen=next;render()}
function render(){document.querySelector('#roomButton').hidden=!(room&&screen==='studio');document.querySelector('#peerCount').textContent=String(session?.players.filter(p=>p.online).length||1);if(screen==='welcome')renderWelcome();if(screen==='pair')renderPair();if(screen==='studio')renderStudio()}
function renderWelcome(){
 view.innerHTML='<section class="welcome"><div class="cover"><div class="cover-stamp">МУЗЫКАЛЬНАЯ СТУДИЯ</div>'+
 '<div class="tape-art"><div class="tape-label">PLAY<br>TOGETHER</div><div class="reel left"><b></b></div><div class="reel right"><b></b></div><div class="tape-stripe"></div></div>'+
 '<h1>Создавай.<br><em>Записывай.</em></h1><p>Играй на инструментах, собирай ритмы по шагам и сочиняй вместе с друзьями.</p></div>'+
 '<div class="entry"><label for="nameInput">ИМЯ МУЗЫКАНТА</label><input id="nameInput" type="text" maxlength="24" autocomplete="nickname" value="'+safe(name)+'" '+(pocketIdentity?.complete?'readonly aria-readonly="true"':'')+'>'+
 '<p class="small-note pw-identity-notice">'+(pocketIdentity?.complete?pocketAvatarMarkup(pocketIdentity.artwork||pocketIdentity.avatar,{small:true,accountId:pocketIdentity.id})+' '+safe(pocketIdentity.nickname)+' · Pocket ID':'Гостевой режим')+' · <a href="'+pocketIdProfileUrl+'">'+(pocketIdentity?.complete?'Профиль':'Войти')+'</a></p>'+
 '<div class="entry-actions"><button class="action primary" data-action="solo">Моя студия <span>→</span></button>'+
 '<button class="action" data-action="host">Создать комнату <span>↗</span></button>'+
 '<button class="action" data-action="join">Войти по коду <span>→</span></button></div>'+
 '<p class="small-note">Комнаты PocketNet работают через интернет. Достаточно восьмизначного кода или ссылки.</p></div></section>';
}
function statusLine(){return connected?'PocketNet · соединение активно':busy?'Подключаемся к PocketNet…':'Проверь подключение к интернету'}
function renderPair(){
 const joined=Boolean(room),host=isHost,code=room?.roomId?.slice(0,8).toUpperCase()||'';
 const roster=(session?.players||[]).map(p=>'<div class="roster-member">'+(p.avatar?pocketAvatarMarkup(p.avatar,{small:true}):'<span class="roster-mark">♪</span>')+
 '<span><b>'+safe(p.name)+'</b><small>'+(p.id===ownId?'Вы · ':'')+(p.id===session?.host?'ведущий':'музыкант')+(p.online?'':' · не в сети')+'</small></span></div>').join('');
 view.innerHTML='<section class="pairing"><button class="back" data-action="back">← '+(joined?'В студию':'Назад')+'</button>'+
 '<p class="eyebrow">POCKETNET / ИНТЕРНЕТ-КОМНАТА</p><h2>'+(joined?'Студия открыта':pairingMode==='host'?'Создаём комнату':'Войти в студию')+'</h2>'+
 (joined?'<div class="room-access"><span class="field-label">КОД КОМНАТЫ</span><strong class="room-code">'+code+'</strong>'+
 '<div class="pair-row"><button data-action="copy-code">Копировать код</button><button data-action="share-link">Отправить ссылку</button></div></div>'+
 '<div class="roster"><h3>Музыканты · '+(session?.players.filter(p=>p.online).length||1)+'/4</h3>'+roster+'</div>'+
 '<button class="action primary" data-action="studio">Играть вместе →</button>':
 '<p>Вставь код из приглашения друга. Устройства могут находиться в разных сетях.</p>'+
 '<label class="field-label" for="joinCodeField">КОД ИЗ 8 СИМВОЛОВ</label>'+
 '<input id="joinCodeField" maxlength="36" autocomplete="off" spellcheck="false" placeholder="Например, 12AB34CD" value="'+safe(joinCode)+'">'+
 '<button class="action primary" data-action="enter-code" '+(!connected||busy?'disabled':'')+'>Присоединиться →</button>')+
 '<div id="pairStatus" role="status">'+safe(statusLine())+'</div></section>';
}
function waveFor(clip){
 let counts=Array(16).fill(0);for(const n of clip.notes)if(n[0]>=clip.a&&n[0]<clip.b)counts[Math.floor(n[0]/4)]++;
 return '<div class="clip-wave">'+counts.map(c=>'<i style="--h:'+Math.max(7,Math.min(100,c*24))+'%"></i>').join('')+'</div>';
}
function trackView(p,i){
 const owns=p.id===ownId,track=session.tracks[p.id]||[],audible=canHearTrack(ownId,p,hearOthers,onlyMine);
 const clips=track.map((c,n)=>{
  const body='<span class="clip-top">ДУБЛЬ '+fmt(n+1)+'</span>'+waveFor(c)+'<span class="clip-tag">'+safe(labels[c.inst]||'')+' · '+(c.b-c.a)+'/64</span>';
  return owns?'<button type="button" class="clip" data-action="clip" data-clip="'+safe(c.id)+'" title="Обрезать или удалить дубль">'+body+'</button>':
   '<div class="clip" aria-label="Чужой дубль: '+safe(labels[c.inst])+'">'+body+'</div>';
 }).join('');
 return '<section class="track '+(!audible?'off-air':'')+'" style="--track-color:'+colors[i%colors.length]+'">'+
 '<div class="track-head"><div class="track-name">'+(p.avatar?pocketAvatarMarkup(owns&&pocketIdentity?.artwork?pocketIdentity.artwork:p.avatar,{small:true,accountId:owns?pocketIdentity?.id:''}):'')+safe(p.name)+(owns?' · ТЫ':'')+
 '<small>'+safe(labels[p.inst])+' · '+(p.air?'В ЭФИРЕ':'НЕ В ЭФИРЕ')+(p.online?'':' · ОФЛАЙН')+'</small></div>'+
 '<span class="track-count">'+track.length+' / 6 ДУБЛЕЙ</span></div>'+
 '<div class="track-lane">'+(clips||'<div class="track-empty">Пока тишина</div>')+'</div></section>';
}
function padsView(){
 const current=INSTRUMENTS.find(i=>i.id===instrument);
 return current.labels.map((label,i)=>'<button class="pad" data-pad="'+i+'" type="button" aria-label="'+safe(label)+'">'+
 '<span class="pad-key">'+noteKeys[i].toUpperCase()+'</span><span class="pad-label">'+safe(label)+'</span><span class="pad-index">'+fmt(i+1)+'</span></button>').join('');
}
function renderStudio(){
 if(!session)return;
 const owner=room&&isHost,canChange=!room||owner;
 view.innerHTML='<section class="studio '+(session.playing?'playing':'')+'">'+
 '<div class="studio-head"><div><p class="eyebrow">МАГНИТНАЯ ЗАПИСЬ / '+(room?'POCKETLAN':'SOLO')+'</p><h1>Одна лента.<br>Разные руки.</h1></div><div class="mini-reels"><i></i><i></i></div></div>'+
 '<div class="transport"><button id="playButton" class="'+(session.playing?'active':'')+'" data-action="play" aria-label="Воспроизвести">▶</button>'+
 '<button data-action="stop" aria-label="Остановить">■</button><button id="recordButton" class="record-button '+(recording?'recording':'')+'" data-action="record">● <span>'+(recording?'СТОП REC':'ЗАПИСЬ')+'</span></button>'+
 '<div class="transport-info"><strong id="beatReadout">01 : 01</strong><small id="transportState">'+(recording?'ИДЁТ ЗАПИСЬ':session.playing?'ИГРАЕТ':'ГОТОВО')+'</small></div>'+
 '<div class="tempo"><label for="tempoInput">BPM</label><input id="tempoInput" type="number" min="60" max="180" value="'+session.bpm+'" '+(!canChange?'disabled':'')+'></div></div>'+
 '<div class="meter"><div class="meter-grid" id="meterGrid">'+Array.from({length:64},(_,i)=>'<span class="meter-cell '+(i%16===0?'bar':'')+'" data-step="'+i+'"></span>').join('')+'</div>'+
 '<div class="meter-head"><span>4 ТАКТА · 64 ШАГА</span><span id="recHint" class="'+(recording?'armed':'')+'">'+(recording?'● ЗАПИСЫВАЕМ ТВОИ НОТЫ':'СНАЧАЛА REC, ПОТОМ ИГРАЙ')+'</span></div></div>'+
 '<div class="console"><div class="section-title"><div><span class="index">01</span><h2>Инструмент</h2></div><span class="micro">A S D F G H J K</span></div>'+
 '<div class="instruments">'+INSTRUMENTS.map(i=>'<button class="instrument '+(instrument===i.id?'active':'')+'" data-action="inst" data-inst="'+i.id+'"><b>'+
 (i.id==='keys'?'⌁':i.id==='bass'?'≋':'◉')+'</b><span>'+i.name+'<small>'+i.sub+'</small></span></button>').join('')+'</div>'+
 '<div class="sound-routing"><label class="route '+(air?'on':'')+'"><span class="route-led"></span><span><b>В эфир</b><small>Другие слышат меня</small></span><input id="airToggle" type="checkbox" '+(air?'checked':'')+'><i class="switch"></i></label>'+
 '<label class="route '+(hearOthers?'on':'')+'"><span class="route-led"></span><span><b>Слушать остальных</b><small>Я слышу их партии</small></span><input id="hearToggle" type="checkbox" '+(hearOthers?'checked':'')+'><i class="switch"></i></label></div>'+
 '<div class="pads" id="pads" data-gesture-surface data-touch-action="none">'+padsView()+'</div>'+
 '<p class="pad-instruction">Касайся площадок или используй A–K. Настоящий микрофон не нужен: инструменты синтезируются на устройстве.</p></div>'+
 '<div class="tracks-block"><div class="section-title"><div><span class="index">02</span><h2>Дорожки</h2></div>'+
 '<div class="track-actions"><label class="solo-toggle"><input id="soloToggle" type="checkbox" '+(onlyMine?'checked':'')+'> Только мои</label>'+
 '<button class="text-action" data-action="export">↓ WAV</button></div></div>'+
 '<div class="track-list">'+session.players.map(trackView).join('')+
 (recording?'<div class="record-take" id="recordTake">● НОВЫЙ ДУБЛЬ · '+recording.notes.length+' НОТ</div>':'')+'</div></div>'+
 '<div class="studio-footer">'+(room?'<button class="action secondary" data-action="invite">+ Пригласить</button>':'<button class="action secondary" data-action="host-from-solo">+ LAN-студия</button>')+
 (canChange?'<button class="action secondary danger" data-action="reset">Новый проект</button>':'')+
 '<button class="action secondary" data-action="leave">← Меню</button></div></section>';
 updateMeter(true);
}
function updateMeter(force=false){
 if(screen!=='studio'||!session)return;
 const step=session.playing?Math.floor(Math.max(0,hostTime()-session.anchor)/stepMs(session.bpm))%64:0;
 if(force||step!==displayedStep){
  displayedStep=step;const container=view.querySelector('#meterGrid');if(container){
   container.querySelector('.current')?.classList.remove('current');
   container.children[step]?.classList.add('current');
  }
  const readout=view.querySelector('#beatReadout');if(readout)readout.textContent=fmt(Math.floor(step/16)+1)+' : '+fmt(Math.floor(step%16/4)+1);
 }
 if(recording){const take=view.querySelector('#recordTake');if(take)take.textContent='● НОВЫЙ ДУБЛЬ · '+recording.notes.length+' НОТ'}
}
function resetSchedule(){lastScheduledMs=0;displayedStep=-1}
function schedule(){
 if(!session?.playing||screen!=='studio'||document.hidden)return;
 const ctx=audioContext();if(!ctx||ctx.state!=='running')return;
 const now=hostTime(),horizon=now+125,step=stepMs(session.bpm),length=loopMs(session.bpm);
 if(lastScheduledMs===0||lastScheduledMs>horizon||lastScheduledMs<now-500)lastScheduledMs=now-15;
 for(const p of session.players){
  if(!canHearTrack(ownId,p,hearOthers,onlyMine))continue;
  for(const clip of session.tracks[p.id]||[])for(const n of clip.notes){
   if(n[0]<clip.a||n[0]>=clip.b)continue;
   const first=session.anchor+n[0]*step;
   const turns=clamp(Math.ceil((lastScheduledMs-first)/length),0,100000000);
   const at=first+turns*length;
   if(at>lastScheduledMs&&at<=horizon&&at>=now-55){
    playNote(ctx,clip.inst,n[1],ctx.currentTime+Math.max(0,(at-now)/1000),n[2]*step/1000,n[3]/100);
   }
  }
 }
 lastScheduledMs=horizon;
}
function startTicker(){if(timer)return;timer=setInterval(()=>{schedule();updateMeter()},40)}
function stopRemote(ownerId){for(const [id,item] of remoteVoices){if(!ownerId||item.owner===ownerId){item.voice.release();remoteVoices.delete(id)}}}
function finishRecord(){
 if(!recording)return;const take=recording;recording=null;
 for(const h of held.values())if(h.note)h.note[2]=clamp(Math.round((hostTime()-h.at)/stepMs(session.bpm)),1,16);
 if(take.notes.length){
  const clip=tidyClip({id:'c-'+Date.now().toString(36)+'-'+rand(),inst:take.inst,a:0,b:64,notes:take.notes.slice(0,96)});
  sendEdit({kind:'clip-add',clip});inform('Дубль сохранён: '+clip.notes.length+' нот');
 }else inform('Тишина не записана');
 if(screen==='studio')renderStudio();
}
function noteStep(){if(!session?.playing||!session.anchor)return 0;return clamp(Math.round(Math.max(0,hostTime()-session.anchor)/stepMs(session.bpm))%64,0,63)}
async function press(pitch,key){
 if(!session||screen!=='studio'||held.has(key)||pitch<0||pitch>7)return;
 held.set(key,{pending:true,pitch});
 let ctx;try{ctx=await unlockAudio()}catch{held.delete(key);inform('Звук недоступен в этом браузере');return}
 if(!held.has(key)||screen!=='studio')return;
 const uid=rand()+'-'+pitch,at=hostTime();
 const voice=playNote(ctx,instrument,pitch,ctx.currentTime,2.5,.88);
 let note=null;
 if(recording&&recording.notes.length<96){
  note=[noteStep(),pitch,1,88];recording.notes.push(note);
  const takeEl=view.querySelector('#recordTake');if(takeEl)takeEl.textContent='● НОВЫЙ ДУБЛЬ · '+recording.notes.length+' НОТ';
 }else if(recording&&recording.notes.length===96)inform('Лимит одного дубля: 96 нот. Останови запись.');
 held.set(key,{pitch,uid,at,voice,note,inst:instrument});
 const p=view.querySelector('.pad[data-pad="'+pitch+'"]');p?.classList.add('active');
 if(air)sendLive('live-on',{uid,pitch,inst:instrument,vel:88});
}
function release(key){
 const h=held.get(key);if(!h)return;
 held.delete(key);if(h.pending)return;
 h.voice.release();
 if(h.note)h.note[2]=clamp(Math.round((hostTime()-h.at)/stepMs(session.bpm)),1,16);
 if(air)sendLive('live-off',{uid:h.uid});
 if(![...held.values()].some(n=>n.pitch===h.pitch))view.querySelector('.pad[data-pad="'+h.pitch+'"]')?.classList.remove('active');
}
function releaseAll(){for(const key of Array.from(held.keys()))release(key)}
function playRemote(data,owner){
 if(!hearOthers||onlyMine||owner===ownId)return;
 const performer=session.players.find(p=>p.id===owner);if(!performer?.air)return;
 if(data.uid&&typeof data.uid==='string'&&data.uid.length<64&&
 ['keys','bass','drums'].includes(data.inst)&&Number.isInteger(data.pitch)&&data.pitch>=0&&data.pitch<=7){
  unlockAudio().then(ctx=>{
   if(!hearOthers||onlyMine||!self())return;
   const voice=playNote(ctx,data.inst,data.pitch,ctx.currentTime,2.5,clamp((data.vel||85)/100,.1,1));
   const key=owner+':'+data.uid;
   remoteVoices.get(key)?.voice.release();remoteVoices.set(key,{owner,voice});
   setTimeout(()=>remoteVoices.delete(key),3400);
  }).catch(()=>{});
 }
}
function stopLive(data,owner){
 const key=owner+':'+data.uid;const item=remoteVoices.get(key);
 if(item){item.voice.release();remoteVoices.delete(key)}
}
function sendLive(type,payload){
 if(!room||!connected||!netClient)return;
 try{netClient.sendGame({type,data:payload})}catch{ /* Local playing remains available */ }
}
function receiveLive(type,payload){
 const owner=payload?.owner;
 if(!owner||owner===ownId||!session?.players.some(p=>p.id===owner&&p.air))return;
 if(type==='live-on')playRemote(payload,owner);
 if(type==='live-off')stopLive(payload,owner);
}
function applyEdit(owner,data){
 if(!data||typeof data!=='object'||!session)return false;
 const player=session.players.find(p=>p.id===owner);if(!player)return false;
 const list=session.tracks[owner]||[];
 if(data.kind==='inst'){
  if(!labels[data.inst])return false;
  player.inst=data.inst;
 }else if(data.kind==='air'){
  if(typeof data.air!=='boolean')return false;
  player.air=data.air;
 }else if(data.kind==='clip-add'){
  const clip=tidyClip(data.clip);if(!clip||!clip.notes.length||list.length>=6)return false;
  if(list.some(c=>c.id===clip.id))return false;
  list.push(clip);session.tracks[owner]=list;
 }else if(data.kind==='clip-trim'){
  const clip=list.find(c=>c.id===data.id);if(!clip)return false;
  if(!Number.isInteger(data.a)||!Number.isInteger(data.b)||data.a<0||data.b>64||data.b<=data.a)return false;
  clip.a=data.a;clip.b=data.b;
 }else if(data.kind==='clip-delete'){
  const ix=list.findIndex(c=>c.id===data.id);if(ix<0)return false;list.splice(ix,1);
 }else if(data.kind==='transport'){
  if(typeof data.playing!=='boolean')return false;
  if(data.playing&&!session.playing)session.anchor=hostTime()+180;
  session.playing=data.playing;
 }else if(data.kind==='tempo'){
  if(owner!==(session.host||session.players[0].id)||!Number.isInteger(data.bpm)||data.bpm<60||data.bpm>180)return false;
  // Keep a stable shared phase when tempo changes.
  if(session.playing){const ratio=loopMs(data.bpm)/loopMs(session.bpm);session.anchor=hostTime()-(hostTime()-session.anchor)*ratio}
  session.bpm=data.bpm;
 }else if(data.kind==='reset'){
  if(owner!==(session.host||session.players[0].id))return false;
  for(const p of session.players)session.tracks[p.id]=[];
  session.playing=false;session.anchor=0;
 }else return false;
 session.rev++;return true;
}
function broadcastState(){if(!session)return;saveSketch();render();}
function sendEdit(action){
 if(!session)return;
 if(room){
  if(!connected||!netClient){inform('Соединение восстанавливается. Повтори действие позже.');return}
  try{netClient.sendGame({type:'edit',action})}catch{inform('Изменение не отправлено — нет связи')}
  return;
 }
 if(!applyEdit(ownId,action)){inform('Не удалось изменить дорожку: проверь свободное место.');return}
 broadcastState();
}
function applyNetworkState(raw){
 const state=tidySession(raw);if(!state)return;
 const oldPlaying=session?.playing,oldAnchor=session?.anchor;
 session=state;isHost=session.host===ownId;
 const me=self();if(me){air=me.air;instrument=me.inst}
 for(const p of state.players)if(!p.air||!p.online)stopRemote(p.id);
 if(!state.playing&&recording)finishRecord();
 if(oldPlaying!==state.playing||oldAnchor!==state.anchor)resetSchedule();
 if(screen==='studio')renderStudio();else if(screen==='pair')renderPair();
}
function probeClock(){
 if(!room||!connected||!netClient)return;
 try{netClient.sendGame({type:'clock-probe',t:Date.now()})}catch{}
}
function wireNet(client){
 client.on('connected',data=>{
  if(netClient!==client)return;
  connected=true;ownId=data.player.id;
  if(screen==='pair')renderPair();
 });
 client.on('room_joined',data=>{
  if(netClient!==client||data.gameId!=='jam-tape')return;
  room={roomId:data.roomId};busy=false;
  applyNetworkState(data.state);
  if(pairingMode==='join')setScreen('studio');else setScreen('pair');
  try{client.sendGame({type:'profile',avatar:pocketIdentity?.complete?pocketIdentity.avatar:null,inst:instrument})}catch{}
  probeClock();inform('PocketNet · студия подключена');
 });
 client.on('game_event',data=>{
  if(netClient!==client)return;
  const event=data.event;
  if(event?.type==='state')applyNetworkState(event.payload);
  if(event?.type==='notice')inform(String(event.payload));
  if(event?.type==='live-on'||event?.type==='live-off')receiveLive(event.type,event.payload);
  if(event?.type==='clock-reply'){
   const p=event.payload,rtt=Date.now()-p?.t;
   if(Number.isFinite(rtt)&&rtt>=0&&rtt<3000&&Number.isFinite(p.server))
    clockOffset=p.server+rtt/2-Date.now();
  }
 });
 client.on('presence',()=>{if(netClient===client&&connected&&room)try{client.sendGame({type:'sync'})}catch{}});
 client.on('disconnected',()=>{if(netClient===client){connected=false;inform('Связь прервана. PocketNet переподключается…');if(screen==='pair')renderPair()}});
 client.on('room_closed',()=>{if(netClient===client){leaveNetwork(true);inform('Комната закрыта. Музыка сохранена локально.')}});
 client.on('room_kicked',()=>{if(netClient===client){leaveNetwork(true);inform('Вы вышли из комнаты.')}});
 client.on('error',error=>{
  if(netClient!==client)return;
  busy=false;
  const dict={room_not_found:'Комната не найдена или закрыта',room_full:'Комната заполнена (до 4 участников)',game_unavailable:'Модуль ЛЕНТА ещё не опубликован',server_at_capacity:'Сервер перегружен'};
  inform(dict[error?.code]||error?.message||'Ошибка PocketNet');
  if(screen==='pair')renderPair();
 });
}
function leaveNetwork(keepMusic=false){
 const old=netClient,wasRoom=Boolean(room),onlineId=ownId;
 netClient=null;connected=false;room=null;isHost=false;pairingMode='';busy=false;clockOffset=0;joinCode='';
 if(old){try{if(old.roomId)old.leaveRoom()}catch{}try{old.close()}catch{}}
 stopRemote();releaseAll();
 if(wasRoom&&session){
  const user=session.players.find(p=>p.id===onlineId);
  const myClips=(session.tracks[onlineId]||[]).map(tidyClip).filter(Boolean);
  session.players=[{id:localId,name,avatar:pocketIdentity?.complete?pocketIdentity.avatar:null,inst:user?.inst||instrument,air:user?.air!==false,online:true},
   ...session.players.filter(p=>p.id!==onlineId).slice(0,3).map(p=>({...p,online:false}))];
  session.tracks[localId]=myClips;
  if(onlineId!==localId)delete session.tracks[onlineId];
  session.host=localId;session.playing=false;session.anchor=0;
 }
 ownId=localId;resetSchedule();
 if(session&&wasRoom)saveSketch();
 setScreen(keepMusic&&session?'studio':'welcome');
 if(location.search.includes('room='))history.replaceState(null,'',location.pathname);
}
async function connectNet(mode){
 if(busy)return;
 busy=true;pairingMode=mode;room=null;connected=false;setScreen('pair');
 try{
  try{localStorage.removeItem('pocket-net:'+ORIGIN)}catch{}
  const client=new PocketNet({serverUrl:ORIGIN,name,identityKey:pocketIdentity?.id||'guest'});
  netClient=client;wireNet(client);
  await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Не удалось соединиться с сервером')),12000))]);
  if(netClient!==client)return;
  busy=false;
  if(mode==='host')client.createRoom('jam-tape',{avatar:pocketIdentity?.complete?pocketIdentity.avatar:null,inst:instrument,bpm:session?.bpm||108,clips:initialClips});
  else{
   renderPair();
   if(joinCode)joinByCode();
  }
 }catch(e){
  if(netClient){netClient.close();netClient=null}
  connected=false;busy=false;ownId=localId;setScreen('welcome');inform(e.message||'PocketNet недоступен');
 }
}
async function hostRoom(fromStudio=false){
 if(busy)return;
 saveName();initialClips=fromStudio?mine().map(tidyClip).filter(Boolean):[];
 if(!fromStudio)session=null;
 await connectNet('host');
}
async function joinMode(){
 if(busy)return;
 saveName();joinCode=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
 await connectNet('join');
}
function joinByCode(){
 if(!netClient||!connected)return;
 const value=(view.querySelector('#joinCodeField')?.value||joinCode).trim().toUpperCase();
 if(!/^(?:[A-F0-9]{8}|[A-F0-9-]{36})$/.test(value)){inform('Нужен код из восьми символов.');return}
 joinCode=value;busy=true;renderPair();
 try{netClient.joinRoom(value)}catch{busy=false;renderPair();inform('Не удалось отправить код')}
}
function roomLink(){
 const u=new URL(location.pathname,location.origin);u.searchParams.set('room',room.roomId.slice(0,8).toUpperCase());return u.toString();
}
function saveName(){
 if(pocketIdentity?.complete){name=pocketIdentity.nickname;return}
 const raw=view.querySelector('#nameInput')?.value.trim();
 if(raw)name=raw.slice(0,24);
 try{localStorage.setItem(PROFILE+':name',name)}catch{}
}
async function copy(text){
 if(!text)return;try{await navigator.clipboard.writeText(text);inform('Код скопирован')}catch{
  const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();
  const ok=document.execCommand('copy');ta.remove();inform(ok?'Код скопирован':'Разреши копирование или выдели текст вручную');
 }
}
async function share(text){
 if(!text)return;
 if(navigator.share){try{await navigator.share({title:'ЛЕНТА / PocketLAN',text});return}catch{}}
 await copy(text);
}
async function startRecord(){
 if(!session)return;
 if(recording){finishRecord();return}
 if(mine().length>=6){inform('На твоей дорожке уже 6 дублей. Удали или обрежь один.');return}
 try{await unlockAudio()}catch{inform('Не удалось включить звук');return}
 if(!session.playing)sendEdit({kind:'transport',playing:true});
 recording={inst:instrument,notes:[]};renderStudio();inform('Игра записывается только на твою дорожку');
}
function openEditor(id){
 const clip=mine().find(c=>c.id===id);if(!clip)return;
 editClip=clip.id;
 document.querySelector('#clipTitle').textContent=labels[clip.inst]+' · дубль '+(mine().indexOf(clip)+1);
 const start=document.querySelector('#trimStart'),end=document.querySelector('#trimEnd');
 start.value=clip.a;end.value=clip.b;updateClipPreview();clipDialog.showModal();
}
function updateClipPreview(){
 const clip=mine().find(c=>c.id===editClip);if(!clip)return;
 const start=document.querySelector('#trimStart'),end=document.querySelector('#trimEnd');
 let a=Number(start.value),b=Number(end.value);
 if(a>=b){if(document.activeElement===start){b=Math.min(64,a+1);end.value=b}else{a=Math.max(0,b-1);start.value=a}}
 document.querySelector('#trimStartLabel').textContent=String(a+1);
 document.querySelector('#trimEndLabel').textContent=String(b);
 const notes=clip.notes.map(n=>'<i class="preview-mark" style="left:'+(n[0]/64*100)+'%;--h:'+(20+n[1]*10)+'%"></i>').join('');
 document.querySelector('#clipPreview').innerHTML=notes+
 '<div class="preview-mask" style="left:0;width:'+(a/64*100)+'%"></div>'+
 '<div class="preview-mask" style="right:0;width:'+((64-b)/64*100)+'%"></div>';
}
function makeDownload(blob,filename){
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);
}
async function exportMix(){
 if(!session||busy)return;busy=true;inform('Сводим дорожки в WAV…');
 try{const wav=await renderWav(session,ownId,hearOthers,onlyMine);makeDownload(wav,'lenta-'+new Date().toISOString().slice(0,10)+'.wav');inform('Микс WAV готов')}
 catch(e){inform(e.message||'Ошибка экспорта')}
 finally{busy=false}
}
async function action(nameAction,el){
 if(['solo','host','join','studio','play'].includes(nameAction))unlockAudio().catch(()=>{});
 if(nameAction==='solo'){saveName();session=loadSketch();room=null;isHost=false;setScreen('studio');startTicker();return}
 if(nameAction==='host'){saveName();await hostRoom();return}
 if(nameAction==='join'){saveName();await joinMode();return}
 if(nameAction==='back'){if(room)setScreen('studio');else setScreen('welcome');return}
 if(nameAction==='studio'){setScreen('studio');startTicker();return}
 if(nameAction==='discover'){await discover();return}
 if(nameAction==='native'){await joinNative(Number(el.dataset.index));return}
 if(nameAction==='new-invite'){await newInvite();return}
 if(nameAction==='copy-invite'){await copy(inviteSignal);return}
 if(nameAction==='share-invite'){await share(inviteSignal);return}
 if(nameAction==='make-answer'){await joinOffer();return}
 if(nameAction==='copy-reply'){await copy(replySignal);return}
 if(nameAction==='share-reply'){await share(replySignal);return}
 if(nameAction==='accept-answer'){await acceptAnswer();return}
 if(nameAction==='play'){await unlockAudio().catch(()=>{});sendEdit({kind:'transport',playing:true});return}
 if(nameAction==='stop'){if(recording)finishRecord();sendEdit({kind:'transport',playing:false});return}
 if(nameAction==='record'){await startRecord();return}
 if(nameAction==='inst'){
  const next=el.dataset.inst;if(!labels[next])return;
  if(recording)finishRecord();releaseAll();instrument=next;sendEdit({kind:'inst',inst:next});renderStudio();return;
 }
 if(nameAction==='clip'){openEditor(el.dataset.clip);return}
 if(nameAction==='export'){await exportMix();return}
 if(nameAction==='invite'){pairingMode='host';setScreen('pair');if(room?.createInvite&&!inviteSignal)await newInvite();return}
 if(nameAction==='host-from-solo'){if(recording)finishRecord();await hostRoom(true);return}
 if(nameAction==='reset'){confirmDialog.showModal();return}
 if(nameAction==='leave'){if(recording)finishRecord();releaseAll();if(room)leaveNetwork(false);else{saveSketch();setScreen('welcome')}return}
}
view.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled){action(button.dataset.action,button).catch(e=>inform(e.message||'Ошибка действия'))}});
view.addEventListener('change',event=>{
 const target=event.target;
 if(target.id==='airToggle'){if(!target.checked)releaseAll();air=target.checked;sendEdit({kind:'air',air});renderStudio()}
 if(target.id==='hearToggle'){hearOthers=target.checked;if(!hearOthers)stopRemote();renderStudio()}
 if(target.id==='soloToggle'){onlyMine=target.checked;if(onlyMine)stopRemote();renderStudio()}
 if(target.id==='tempoInput'){
  const bpm=Number(target.value);if(!Number.isInteger(bpm)||bpm<60||bpm>180){inform('Темп от 60 до 180 BPM');renderStudio();return}
  sendEdit({kind:'tempo',bpm});
 }
});
view.addEventListener('pointerdown',event=>{
 const pad=event.target.closest('[data-pad]');if(!pad||event.button>0)return;
 event.preventDefault();const pitch=Number(pad.dataset.pad),key='pointer-'+event.pointerId;
 pad.setPointerCapture?.(event.pointerId);press(pitch,key);
});
view.addEventListener('pointerup',event=>release('pointer-'+event.pointerId));
view.addEventListener('pointercancel',event=>release('pointer-'+event.pointerId));
view.addEventListener('lostpointercapture',event=>release('pointer-'+event.pointerId));
window.addEventListener('pointerup',event=>release('pointer-'+event.pointerId));
window.addEventListener('keydown',event=>{
 if(screen!=='studio'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||clipDialog.open||confirmDialog.open)return;
 const pitch=noteKeys.indexOf(event.key.toLowerCase());if(pitch<0)return;
 event.preventDefault();press(pitch,'key-'+event.code);
});
window.addEventListener('keyup',event=>release('key-'+event.code));
window.addEventListener('blur',releaseAll);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();else resetSchedule()});
document.querySelector('#roomButton').addEventListener('click',()=>{if(room){pairingMode=isHost?'host':'join';setScreen('pair')}});
document.querySelector('#trimStart').addEventListener('input',updateClipPreview);
document.querySelector('#trimEnd').addEventListener('input',updateClipPreview);
document.querySelector('#closeClip').addEventListener('click',()=>clipDialog.close());
document.querySelector('#saveClip').addEventListener('click',()=>{
 const a=Number(document.querySelector('#trimStart').value),b=Number(document.querySelector('#trimEnd').value);
 sendEdit({kind:'clip-trim',id:editClip,a,b});clipDialog.close();inform('Границы дубля сохранены');
});
document.querySelector('#deleteClip').addEventListener('click',()=>{
 sendEdit({kind:'clip-delete',id:editClip});clipDialog.close();inform('Дубль удалён');
});
document.querySelector('#cancelReset').addEventListener('click',()=>confirmDialog.close());
document.querySelector('#confirmReset').addEventListener('click',()=>{
 if(recording)finishRecord();sendEdit({kind:'reset'});confirmDialog.close();inform('Чистая лента готова');
});
window.addEventListener('pagehide',()=>{if(!room)saveSketch()});
startTicker();probeTimer=setInterval(probeClock,12000);
renderWelcome();
async function refreshIdentity(){
 const previous=(pocketIdentity?.id||'')+':'+(pocketIdentity?.updatedAt||'');
 const previousAccount=pocketIdentity?.id||null;
 pocketIdentity=await getPocketIdentity({force:true});
 if(room && previousAccount!==(pocketIdentity?.id||null)){
  leaveNetwork(true);
  inform('Аккаунт Pocket ID изменился — переподключись к студии');
 }
 if(previous===(pocketIdentity?.id||'')+':'+(pocketIdentity?.updatedAt||''))return;
 if(pocketIdentity?.complete)name=pocketIdentity.nickname;
 else try{name=localStorage.getItem(PROFILE+':name')||'Музыкант'}catch{name='Музыкант'}
 if(session){
  const own=self();
  if(own){own.name=name;own.avatar=pocketIdentity?.complete?pocketIdentity.avatar:null}
  if(!room)saveSketch();
 }
 if(screen==='welcome')renderWelcome();
 else if(screen==='studio'&&!room)renderStudio();
}
void refreshIdentity();
window.addEventListener('pageshow',()=>void refreshIdentity());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshIdentity()});
