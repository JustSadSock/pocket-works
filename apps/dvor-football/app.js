import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {FIELD,limit,dist,DEFAULT,kits,skins,hairs,safeProfile,newGame,advanceGame} from './sim.js';
import {TopdownFX,renderTopdown,renderPortrait,toPitch} from './visuals.js';
installMobileRuntime();
createWorkshopMode({appName:'ДВОР',version:'1.2.0',cachePrefix:'dvor-football-',storageNamespace:'pocket-works:dvor-football'});
const $=id=>document.getElementById(id);
const PREFIX='pocket-works:dvor-football:',URL_NET=location.origin+'/pocketnet';
const KEY_ORDER=['pace','shot','control','pass'],STAT_LABELS={pace:'СКОРОСТЬ',shot:'УДАР',control:'КОНТРОЛЬ',pass:'ПАС'};
const pref=(key,def)=>{try{return JSON.parse(localStorage.getItem(PREFIX+key))??def;}catch{return def;}};
const save=(key,value)=>{try{localStorage.setItem(PREFIX+key,JSON.stringify(value));}catch{}};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const netStore={
 getItem(k){try{return sessionStorage.getItem(PREFIX+'network:'+k);}catch{return null;}},
 setItem(k,v){try{sessionStorage.setItem(PREFIX+'network:'+k,v);}catch{}},
 removeItem(k){try{sessionStorage.removeItem(PREFIX+'network:'+k);}catch{}}
};
let profile=safeProfile(pref('player',{...DEFAULT,name:'Форвард'}));
let soundOn=pref('sound',true),audioCtx=null,noise=null,identity=null;
let screen='home',mode='solo',practice=null,demo=newGame(),net=null,me=null,room='',online=null,connected=false,busy=false;
let netPhase='idle',code=new URLSearchParams(location.search).get('room')||'';
demo.controlled={};
let paused=false,keys=new Set(),stick={x:0,y:0},aimPoint=null,actionQueued=null,chargeAt=0,shotPointer=null;
let sprintTouch=false,mouseShotId=null,mouseShotAt=0,mousePresent=false;
const gameFX=new TopdownFX(),demoFX=new TopdownFX();
let lastFrame=0,sendAt=0,feedbackAt=0,toastTimer=0,visual=null,lastEvent=null,lastScore=0,lastClock='',completed=false;
const getMatch=()=>mode==='online'?online?.match:practice;
function toast(message){
 const target=$('toast');target.textContent=String(message);target.classList.add('show');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>target.classList.remove('show'),2900);
}
function audio(type){
 if(!soundOn)return;
 try{
  const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
  const ac=audioCtx||(audioCtx=new A());ac.resume?.();
  if(!noise){const buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*.5),ac.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;noise=buffer;}
  const t=ac.currentTime,source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();
  source.buffer=noise;filter.type=type==='whistle'?'bandpass':'lowpass';
  filter.frequency.value=type==='kick'?470:type==='goal'?1450:type==='whistle'?2400:800;
  gain.gain.setValueAtTime(.0001,t);
  const peak=type==='goal'?.10:type==='kick'?.08:type==='whistle'?.05:.023;
  gain.gain.exponentialRampToValueAtTime(peak,t+.008);
  gain.gain.exponentialRampToValueAtTime(.0001,t+(type==='goal'?.5:type==='whistle'?.35:.16));
  source.connect(filter).connect(gain).connect(ac.destination);source.start(t);source.stop(t+.5);
  if(type==='kick'||type==='goal'||type==='whistle'){
   const osc=ac.createOscillator(),low=ac.createGain();
   osc.type=type==='whistle'?'sine':'triangle';
   const f=type==='whistle'?920:type==='goal'?170:115;
   osc.frequency.setValueAtTime(f,t);osc.frequency.exponentialRampToValueAtTime(type==='whistle'?1130:f*.52,t+.18);
   low.gain.setValueAtTime(.0001,t);low.gain.exponentialRampToValueAtTime(type==='whistle'?.035:.06,t+.007);
   low.gain.exponentialRampToValueAtTime(.0001,t+.22);
   osc.connect(low).connect(ac.destination);osc.start(t);osc.stop(t+.24);
  }
 }catch{}
}
function setSound(){soundOn=!soundOn;save('sound',soundOn);$('soundBtn').textContent='Звук: '+(soundOn?'вкл':'выкл');if(soundOn)audio('ui');}
$('soundBtn').textContent='Звук: '+(soundOn?'вкл':'выкл');
function show(target){
 screen=target;
 for(const key of ['home','editor','lobby','game'])$(key==='game'?'gameScreen':key==='editor'?'editorScreen':key==='lobby'?'lobbyScreen':'homeScreen').classList.toggle('hidden',target!==key);
 $('shellBar').classList.toggle('hidden',target==='game');resetStick();
 if(target!=='game'){aimPoint=null;visual=null;chargeAt=0;shotPointer=null;}
}
function updateMenu(){
 const attributes=Object.entries(profile.stats);
 const peak=Math.max(...attributes.map(([,value])=>value));
 const role=attributes.find(([,value])=>value===peak)?.[0]||'control';
 const roles={pace:'СПРИНТЕР',shot:'БОМБАРДИР',control:'ТЕХНАРЬ',pass:'ПЛЕЙМЕЙКЕР'};
 const rating=72+peak*3;
 $('menuName').textContent=profile.name||'Форвард';
 $('menuRating').textContent='МОЯ КАРТОЧКА · '+rating+' ОБЩ';
 $('cardRating').textContent=rating;
 document.querySelector('.card-position').textContent=attributes.every(([,value])=>value===peak)?'УНИВЕРСАЛ':roles[role];
 $('cardName').textContent=(profile.name||'ФОРВАРД').toUpperCase();
 $('cardNumber').textContent='№ '+String(profile.number).padStart(2,'0');
}
function renderStats(){
 const left=20-KEY_ORDER.reduce((sum,k)=>sum+profile.stats[k],0);
 $('skillLeft').textContent=left+' ОЧК.';
 $('statRows').innerHTML=KEY_ORDER.map(k=>'<div class="stat-row"><span>'+STAT_LABELS[k]+'</span><button type="button" data-stat="'+k+'" data-delta="-1" '+(profile.stats[k]<=3?'disabled':'')+' aria-label="Уменьшить '+STAT_LABELS[k]+'">−</button><b>'+profile.stats[k]+'</b><button type="button" data-stat="'+k+'" data-delta="1" '+(left<=0||profile.stats[k]>=7?'disabled':'')+' aria-label="Увеличить '+STAT_LABELS[k]+'">+</button></div>').join('');
 updateMenu();
}
function picker(id,key,values){
 $(id).innerHTML=values.map((color,index)=>'<button type="button" data-pick="'+key+'" data-index="'+index+'" class="'+(profile[key]===index?'selected':'')+'" style="background:'+color+'" aria-label="'+key+' '+(index+1)+'"></button>').join('');
}
function renderPicks(){
 picker('kitPicks','kit',kits);picker('skinPicks','skin',skins);picker('hairPicks','hair',hairs);
 renderStats();drawPortrait();
}
function edit(){
 $('nameField').value=profile.name;$('numberField').value=profile.number;
 show('editor');renderPicks();
}
$('editBtn').addEventListener('click',edit);
$('editorBack').addEventListener('click',()=>{profile=safeProfile(pref('player',DEFAULT));updateMenu();show('home');});
$('statRows').addEventListener('click',event=>{
 const b=event.target.closest('[data-stat]');if(!b)return;
 const k=b.dataset.stat,delta=Number(b.dataset.delta);
 if(!KEY_ORDER.includes(k))return;
 const left=20-KEY_ORDER.reduce((sum,key)=>sum+profile.stats[key],0);
 if(delta>0&&left<=0||delta<0&&profile.stats[k]<=3||delta>0&&profile.stats[k]>=7)return;
 profile.stats[k]+=delta;renderStats();audio('ui');
});
for(const id of ['kitPicks','skinPicks','hairPicks'])$(id).addEventListener('click',e=>{
 const b=e.target.closest('[data-pick]');if(!b)return;profile[b.dataset.pick]=+b.dataset.index;renderPicks();audio('ui');
});
$('nameField').addEventListener('input',e=>{profile.name=e.target.value.slice(0,18);updateMenu();});
$('numberField').addEventListener('input',e=>{profile.number=limit(Math.floor(Number(e.target.value)||1),1,99);updateMenu();});
$('savePlayer').addEventListener('click',()=>{
 profile=safeProfile(profile);save('player',profile);updateMenu();audio('whistle');show('home');toast('Футболист сохранён');
});
function netStatus(value,warning=false){netPhase=value;$('networkStatus').textContent='PocketNet · '+value;$('networkStatus').style.color=warning?'#a63c30':'';}
async function checkServer(){
 netStatus('проверка…');
 try{const reply=await fetch(URL_NET+'/health',{cache:'no-store',signal:AbortSignal.timeout(5500)}),data=await reply.json();
  netStatus(reply.ok&&data.modules?.includes('dvor-football')?'доступен':'игровой модуль ещё не опубликован',!data.modules?.includes('dvor-football'));
 }catch{netStatus('нет связи',true);}
}
function clockStr(secs){const n=Math.max(0,Math.ceil(secs));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function recordGame(g){
 if(completed)return;completed=true;
 const match=pref('record',{played:0,wins:0,goals:0});
 match.played++;match.wins+=(g.score[0]>g.score[1]?1:0);match.goals+=g.score[0];save('record',match);
}
function showResult(){
 const g=getMatch();if(!g)return;
 $('pauseVeil').classList.add('hidden');$('endVeil').classList.remove('hidden');
 const mine=mode==='online'?(online?.members.find(p=>p.id===me?.id)?.side??0):0;
 const a=g.score[mine],b=g.score[1-mine];
 $('endTitle').textContent=a===b?'НИЧЬЯ!':a>b?'ПОБЕДА!':'ЕЩЁ ОДИН МАТЧ?';
 $('endScore').textContent=g.score[0]+' : '+g.score[1];
 $('againBtn').disabled=mode==='online'&&online?.host!==me?.id;
 $('againBtn').textContent=mode==='online'&&online?.host!==me?.id?'ЖДЁМ КАПИТАНА':'ИГРАТЬ ЕЩЁ ↗';
 if(mode==='solo')recordGame(g);
 audio('whistle');
}
function openMatch(type){
 mode=type;paused=false;completed=false;visual=null;lastEvent=null;lastScore=0;actionQueued=null;chargeAt=0;shotPointer=null;sprintTouch=false;mouseShotId=null;mouseShotAt=0;gameFX.reset();
 $('pauseVeil').classList.add('hidden');$('endVeil').classList.add('hidden');
 $('switchBtn').classList.toggle('hidden',mode==='online');
 $('pauseBtn').textContent='ПАУЗА Ⅱ';show('game');lastScore=getMatch()?.score?.reduce((a,b)=>a+b,0)||0;updateHUD();
}
function startSolo(){
 leaveNet(false);mode='solo';practice=newGame();practice.controlled={'0':true};
 const p=practice.players[0];Object.assign(p,profile);p.side=0;p.id=0;
 practice.players.slice(1,4).forEach((x,i)=>{x.kit=0;x.name=['Рико','Кэп','Шустрик'][i]});
 practice.hold=.7;openMatch('solo');audio('whistle');
}
$('soloBtn').addEventListener('click',startSolo);
function mySlot(){
 if(mode!=='online')return +(Object.keys(practice?.controlled||{})[0]||0);
 const member=online?.members?.find(p=>p.id===me?.id);
 return member?member.side*4+member.slot:0;
}
function mySide(){return mode==='online'?online?.members?.find(p=>p.id===me?.id)?.side??0:0;}
function updateHUD(){
 const g=getMatch();if(!g)return;
 $('scoreNumber').innerHTML=g.score[0]+' <span>:</span> '+g.score[1];
 const time=clockStr(g.remain);
 if(time!==lastClock){$('clock').textContent=time;lastClock=time;}
 const p=g.players?.[mySlot()];
 if(p){const stamina=Math.round(limit(p.stamina??1,0,1)*100);$('staminaFill').style.width=stamina+'%';$('staminaMeter').setAttribute('aria-valuenow',String(stamina));$('staminaMeter').classList.toggle('low',stamina<26);}
 const total=g.score[0]+g.score[1];
 if(total>lastScore){const board=document.querySelector('.scoreboard');board.classList.remove('goal-pulse');void board.offsetWidth;board.classList.add('goal-pulse');}
 lastScore=total;
 const tag=['ЗАЩИТА','БАЛАНС','АТАКА'][(g.tactics?.[mySide()]||0)+1]||'БАЛАНС';
 $('tacticBtn').textContent='ТАКТИКА · '+tag;
 if(g.phase==='done'&&$('endVeil').classList.contains('hidden'))showResult();
}
function gameplayToast(value){
 if(!value)return;
 const el=$('gameToast');el.textContent=value;el.classList.add('show');
 clearTimeout(feedbackAt);feedbackAt=setTimeout(()=>el.classList.remove('show'),1250);
}
function selectClosest(){
 if(mode!=='solo'||screen!=='game'||!practice)return;
 const current=mySlot(),ball=practice.ball;
 const ordered=practice.players.filter(p=>p.side===0).sort((a,b)=>dist(a,ball)-dist(b,ball));
 const chosen=ordered.find(p=>p.id!==current)||ordered[0];
 if(chosen){practice.controlled={[chosen.id]:true};$('switchBtn').textContent='№ '+chosen.number+' ↻';gameFX.impact(chosen.x,chosen.y,.18,'#ffedaa');audio('ui');}
}
function selectNext(){
 if(mode!=='solo'||screen!=='game'||!practice)return;
 const slot=(mySlot()+1)%4;practice.controlled={[slot]:true};
 $('switchBtn').textContent='№ '+practice.players[slot].number+' ↻';visual=null;audio('ui');
}
$('switchBtn').addEventListener('click',selectNext);
function tact(){
 const g=getMatch();if(!g||g.phase!=='play')return;
 const side=mySide(),next=(g.tactics[side]===1?-1:g.tactics[side]+1);
 if(mode==='online'){if(!connected)return toast('Нет связи с PocketNet');safeSend({type:'tactic',value:next});}
 else g.tactics[side]=next;
 updateHUD();audio('ui');
}
$('tacticBtn').addEventListener('click',tact);
function pause(open){
 if(screen!=='game')return;
 if(!open){paused=false;$('pauseVeil').classList.add('hidden');return;}
 paused=true;resetStick();$('pauseVeil').classList.remove('hidden');
 $('pauseTitle').textContent=mode==='solo'?'Перерыв.':'Меню матча.';
 $('pauseText').textContent=mode==='solo'?'Время остановлено. Продолжай, когда захочешь.':'Онлайн-матч продолжается, пока открыто меню.';
}
$('pauseBtn').addEventListener('click',()=>pause(true));
$('resumeBtn').addEventListener('click',()=>pause(false));
function leaveNet(returnHome=true){
 const current=net;net=null;connected=false;busy=false;online=null;room='';me=null;netPhase='idle';
 if(current){try{if(current.roomId&&current.socket?.readyState===WebSocket.OPEN)current.leaveRoom();}catch{}current.close();}
 if(returnHome){show('home');checkServer();}
}
function quit(){if(mode==='online')leaveNet();else{practice=null;show('home');}paused=false;}
$('quitBtn').addEventListener('click',quit);
$('endMenuBtn').addEventListener('click',quit);
$('againBtn').addEventListener('click',()=>{
 if(mode==='online'){if(online?.host===me?.id)safeSend({type:'start'});}
 else startSolo();
});
function resetStick(){sprintTouch=false;$('sprintBtn').classList.remove('held');stick.x=stick.y=0;$('stickThumb').style.transform='translate(-50%,-50%)';}
function readStick(){
 let x=stick.x,y=stick.y;
 if(keys.has('w')||keys.has('arrowup'))y-=1;
 if(keys.has('s')||keys.has('arrowdown'))y+=1;
 if(keys.has('a')||keys.has('arrowleft'))x-=1;
 if(keys.has('d')||keys.has('arrowright'))x+=1;
 const m=Math.hypot(x,y);
 return m>1?{x:x/m,y:y/m}:{x,y};
}
const sprintEl=$('sprintBtn');
let sprintPointer=null;
sprintEl.addEventListener('pointerdown',e=>{if(sprintPointer!==null)return;sprintPointer=e.pointerId;sprintTouch=true;sprintEl.classList.add('held');sprintEl.setPointerCapture?.(e.pointerId);});
for(const t of ['pointerup','pointercancel','lostpointercapture'])sprintEl.addEventListener(t,e=>{if(e.pointerId===sprintPointer){sprintPointer=null;sprintTouch=false;sprintEl.classList.remove('held');}});
const sprintHeld=()=>sprintTouch||keys.has('shift');
const stickEl=$('stick');
let joystickPointer=null;
function moveJoystick(e){
 const r=stickEl.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),max=r.width*.34;
 const d=Math.max(1,Math.hypot(x,y)),m=Math.min(1,d/max);
 stick.x=x/d*m;stick.y=y/d*m;
 $('stickThumb').style.transform='translate(calc(-50% + '+stick.x*max+'px),calc(-50% + '+stick.y*max+'px))';
}
stickEl.addEventListener('pointerdown',e=>{if(joystickPointer!==null)return;joystickPointer=e.pointerId;stickEl.setPointerCapture?.(e.pointerId);moveJoystick(e);});
stickEl.addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId)moveJoystick(e);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])stickEl.addEventListener(type,e=>{if(e.pointerId===joystickPointer){joystickPointer=null;resetStick();}});
function shotAim(override){
 const g=getMatch(),p=g?.players?.[mySlot()];
 if(!p)return 0;
 if(override&&Math.hypot(override.x,override.y)>20)return Math.atan2(override.y,override.x);
 if(aimPoint&&screen==='game')return Math.atan2(aimPoint.y-p.y,aimPoint.x-p.x);
 const input=readStick();
 if(Math.hypot(input.x,input.y)>.3)return Math.atan2(input.y,input.x);
 return Math.atan2((310-p.y)*.38,(p.side?FIELD.left:FIELD.right)-p.x);
}
function safeSend(v){if(!net||!connected)return false;try{net.sendGame(v);return true;}catch{toast('Соединение прервано');return false;}}
function kick(kind,power=1,dir){
 if(screen!=='game'||paused)return;
 const g=getMatch(),p=g?.players?.[mySlot()];
 if(!g||g.phase!=='play'||g.hold>0)return;
 if(dist(p,g.ball)>36){if(mode==='solo')gameplayToast('ДОТЯНИСЬ ДО МЯЧА');return;}
 const c=readStick(),angle=shotAim(dir);
 if(mode==='online')safeSend({type:'input',x:c.x,y:c.y,sprint:sprintHeld(),action:kind,angle,power});
 else actionQueued={action:kind,angle,power};
 gameFX.impact(g.ball.x,g.ball.y,kind==='shot'?1:.48,kind==='shot'?'#ffe7a0':'#ccece6');
 gameFX.burst(g.ball.x,g.ball.y,kind==='shot'?9:5,'#efddb7');
 audio('kick');
}
$('passBtn').addEventListener('pointerdown',()=>kick('pass',.83));
$('passBtn').addEventListener('click',e=>{if(e.detail===0)kick('pass',.83);});
const shotEl=$('shotBtn');
shotEl.addEventListener('click',e=>{if(e.detail===0)kick('shot',.8);});
shotEl.addEventListener('pointerdown',e=>{
 if(screen!=='game'||paused)return;shotPointer={id:e.pointerId,x:e.clientX,y:e.clientY};
 chargeAt=performance.now();shotEl.classList.add('charging');
 shotEl.setPointerCapture?.(e.pointerId);
});
shotEl.addEventListener('pointerup',e=>{
 if(!shotPointer||shotPointer.id!==e.pointerId)return;
 const duration=performance.now()-chargeAt,dir={x:e.clientX-shotPointer.x,y:e.clientY-shotPointer.y};
 shotPointer=null;chargeAt=0;shotEl.classList.remove('charging');$('chargeText').textContent='';
 kick('shot',limit(.58+duration/1050,.58,1.2),dir);
});
for(const type of ['pointercancel','lostpointercapture'])shotEl.addEventListener(type,e=>{
 if(shotPointer?.id===e.pointerId){shotPointer=null;chargeAt=0;shotEl.classList.remove('charging');$('chargeText').textContent='';}
});
const fieldEl=$('pitch');
function pointAtField(e){
 const r=fieldEl.getBoundingClientRect();return toPitch(r,e.clientX,e.clientY);
}
fieldEl.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch')return;
 mousePresent=true;aimPoint=pointAtField(e);
});
fieldEl.addEventListener('pointerdown',e=>{
 if(screen!=='game'||paused||e.pointerType!=='mouse')return;
 aimPoint=pointAtField(e);mousePresent=true;
 if(e.button===2){e.preventDefault();kick('pass',.89);return;}
 if(e.button===1){e.preventDefault();selectClosest();return;}
 if(e.button!==0||mouseShotId!==null)return;
 e.preventDefault();mouseShotId=e.pointerId;mouseShotAt=performance.now();chargeAt=mouseShotAt;
 fieldEl.setPointerCapture?.(e.pointerId);
});
fieldEl.addEventListener('pointerup',e=>{
 if(e.pointerId!==mouseShotId)return;
 aimPoint=pointAtField(e);
 const power=limit(.55+(performance.now()-mouseShotAt)/1000,.55,1.2);
 mouseShotId=null;mouseShotAt=0;chargeAt=0;
 kick('shot',power);
});
for(const type of ['pointercancel','lostpointercapture'])fieldEl.addEventListener(type,e=>{
 if(e.pointerId===mouseShotId){mouseShotId=null;mouseShotAt=0;chargeAt=0;}
});
fieldEl.addEventListener('contextmenu',e=>{if(screen==='game')e.preventDefault();});
window.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();
 if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(k)&&screen==='game')e.preventDefault();
 if(['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase()))return;
 keys.add(k);
 if(screen!=='game'||e.repeat)return;
 if(k==='escape'){pause(!paused);return;}
 if(k===' '){kick('pass',.88);return;}
 if(k==='q'){selectClosest();return;}
 if(k==='e'||k==='tab'){selectNext();return;}
 if(k==='f'){kick('shot',.83);return;}
 if(k==='1'||k==='2'||k==='3'){const g=getMatch(),v=Number(k)-2;if(g){if(mode==='online')safeSend({type:'tactic',value:v});else g.tactics[mySide()]=v;updateHUD();}return;}
 if((k==='j'||k==='enter')&&!chargeAt){chargeAt=performance.now();return;}
});
window.addEventListener('keyup',e=>{
 const k=e.key.toLowerCase();keys.delete(k);
 if((k==='j'||k==='enter')&&chargeAt){const power=limit(.55+(performance.now()-chargeAt)/1050,.55,1.2);chargeAt=0;kick('shot',power);}
});
window.addEventListener('blur',()=>{keys.clear();mouseShotId=null;mouseShotAt=0;chargeAt=0;resetStick();if(screen==='game'&&mode==='solo'&&!paused)pause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();mouseShotId=null;mouseShotAt=0;chargeAt=0;resetStick();if(screen==='game'&&mode==='solo'&&!paused)pause(true);}});
function drawPortrait(){renderPortrait($('playerCanvas'),profile);}
async function initProfileIdentity(){
 try{identity=await getPocketIdentity();}catch{identity=null;}
}
function renderLobby(){
 if(screen!=='lobby')return;
 const members=online?.members||[];
 $('playerCount').textContent=members.length+' / 8';
 $('lobbyStatus').textContent=busy?'СОЕДИНЯЕМСЯ…':connected?'POCKETNET · ПОДКЛЮЧЕНО':'POCKETNET · НЕТ СВЯЗИ';
 const inRoom=!!room;
 $('hostArea').classList.toggle('hidden',!inRoom);
 $('joinArea').classList.toggle('hidden',inRoom||busy);
 if(inRoom)$('roomCode').textContent=room.slice(0,8).toUpperCase();
 for(const side of [0,1]){
  const list=members.filter(m=>m.side===side),node=$(side?'redList':'blueList');
  node.innerHTML=Array.from({length:4},(_,i)=>{
   const m=list.find(p=>p.slot===i);
   return m?'<div class="'+(m.id===me?.id?'member-you':'')+'">'+escapeHTML(m.name.replace(/^Гость · /,''))+(m.id===online?.host?' ★':'')+'</div>':'<div class="vacant">БОТ / СВОБОДНО</div>';
  }).join('');
 }
 const mine=members.find(m=>m.id===me?.id);
 $('joinBlue').disabled=!connected||!inRoom||mine?.side===0||countMembers(0)>=4;
 $('joinRed').disabled=!connected||!inRoom||mine?.side===1||countMembers(1)>=4;
 $('startOnline').classList.toggle('hidden',online?.host!==me?.id||!inRoom);
 $('startOnline').disabled=!connected||members.length<2||countMembers(0)<1||countMembers(1)<1;
 $('lobbyNote').textContent=members.length<2?'Нужно как минимум два игрока. Друг может войти по коду.':countMembers(0)<1||countMembers(1)<1?'Выберите разные команды, чтобы начать.':'Все готовы? Остальные места займут боты.';
}
function countMembers(side){return online?.members?.filter(p=>p.side===side).length||0;}
function onState(value){
 if(!value||!['lobby','play','done'].includes(value.phase)||!Array.isArray(value.members))return;
 const previous=online?.match,wasScreen=screen;online=value;busy=false;
 if(value.phase==='lobby'){if(screen!=='lobby')show('lobby');renderLobby();return;}
 if(screen!=='game'||previous?.phase==='done'&&value.phase==='play')openMatch('online');
 const g=value.match;
 if(previous&&g?.eventId!==previous.eventId){
  if(g.event==='ГОЛ!'){gameplayToast('ГОООЛ!');audio('goal');visual=null;}
  else if(g.event==='СЕЙВ!'){gameplayToast('СЕЙВ!');audio('kick');}
 }
 updateHUD();
}
function wireNet(client){
 client.on('connected',data=>{if(net!==client)return;me=data.player;connected=true;renderLobby();});
 client.on('room_joined',data=>{
  if(net!==client)return;room=data.roomId;busy=false;online=data.state;renderLobby();
  if(data.state?.phase==='lobby')safeSend({type:'profile',profile});
  else onState(data.state);
 });
 client.on('game_event',data=>{
  if(net!==client)return;
  if(data.event?.type==='state')onState(data.event.payload);
  if(data.event?.type==='notice')toast(data.event.payload);
 });
 client.on('presence',()=>{if(net===client)safeSend({type:'sync'});});
 client.on('disconnected',()=>{if(net!==client)return;connected=false;renderLobby();if(screen==='game')gameplayToast('НЕТ СВЯЗИ');});
 client.on('room_closed',()=>{if(net===client){leaveNet();toast('Комната закрыта.');}});
 client.on('error',data=>{
  if(net!==client)return;busy=false;
  const labels={room_not_found:'Комната не найдена',team_full:'В этой команде нет места',room_full:'Комната заполнена',match_in_progress:'Матч уже идёт',game_unavailable:'Модуль ДВОРА ещё не опубликован',rate_limited:'Слишком много запросов',server_at_capacity:'Сервер заполнен',account_already_in_room:'Этот аккаунт уже в комнате'};
  toast(labels[data.code]||'Ошибка PocketNet: '+(data.code||'сеть'));renderLobby();
 });
}
async function connectNet(intent){
 if(busy)return;
 leaveNet(false);mode='online';show('lobby');busy=true;
 $('codeInput').value=code.toUpperCase();renderLobby();
 try{
  await initProfileIdentity();
  const newClient=new PocketNet({serverUrl:URL_NET,name:identity?.complete?identity.nickname:(profile.name||'Игрок'),storage:netStore,identityKey:identity?.id||'guest'});
  net=newClient;wireNet(newClient);
  await Promise.race([newClient.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('PocketNet не отвечает')),14000))]);
  if(net!==newClient)return;
  busy=false;
  if(intent==='host')newClient.createRoom('dvor-football');
  else if(intent==='link'||(intent==='join'&&code))newClient.joinRoom(code.toUpperCase());
  renderLobby();
 }catch(e){leaveNet();toast(e.message||'Не удалось соединиться');netStatus('нет соединения',true);}
}
$('hostBtn').addEventListener('click',()=>connectNet('host'));
$('joinBtn').addEventListener('click',()=>connectNet('join'));
$('enterCode').addEventListener('click',()=>{
 const value=$('codeInput').value.trim().toUpperCase();
 if(!/^(?:[0-9A-F]{8}|[0-9A-F-]{36})$/.test(value))return toast('Нужен код из 8 символов');
 code=value;
 if(!connected||!net)return connectNet('link');
 busy=true;renderLobby();try{net.joinRoom(code);}catch{busy=false;toast('Не удалось войти');renderLobby();}
});
$('codeInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('enterCode').click();});
$('lobbyBack').addEventListener('click',()=>leaveNet());
$('joinBlue').addEventListener('click',()=>safeSend({type:'team',side:0}));
$('joinRed').addEventListener('click',()=>safeSend({type:'team',side:1}));
$('startOnline').addEventListener('click',()=>safeSend({type:'start'}));
function copy(value){
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(value).then(()=>toast('Скопировано'),()=>fallbackCopy(value));
 else fallbackCopy(value);
}
function fallbackCopy(value){
 const input=document.createElement('input');input.value=value;document.body.append(input);input.select();
 try{document.execCommand('copy');toast('Скопировано');}catch{toast('Не удалось скопировать, выдели код вручную');}
 input.remove();
}
$('copyCode').addEventListener('click',()=>copy(room.slice(0,8).toUpperCase()));
$('copyLink').addEventListener('click',()=>copy(location.origin+location.pathname+'?room='+room.slice(0,8).toUpperCase()));
let lastSend=0;
function frame(t){
 const dt=limit((t-lastFrame)/1000||.016,0,.09);lastFrame=t;
 if(!document.hidden){
  if(screen==='home'){
   advanceGame(demo,{},dt);
   if(demo.phase==='done'){demo=newGame();demo.controlled={};demoFX.reset();}
   demoFX.observe(demo,dt);
   renderTopdown($('heroCanvas'),demo,t/1000,{selected:-1,fx:demoFX,dt});
  }
  if(screen==='game'){
   const g=getMatch();
   if(g&&g.phase==='play'){
    if(mode==='solo'&&!paused){
     const input=readStick(),slot=mySlot(),control={x:input.x,y:input.y,sprint:sprintHeld(),angle:shotAim(),power:1,...actionQueued};
     advanceGame(g,{[slot]:control},dt);actionQueued=null;
    }
    if(mode==='online'&&connected&&t-lastSend>140){
     const v=paused?{x:0,y:0}:readStick();lastSend=t;safeSend({type:'input',x:v.x,y:v.y,sprint:!paused&&sprintHeld(),angle:shotAim(),power:1});
    }
   }
   if(g){
    if(g.eventId!==lastEvent&&lastEvent!==null&&mode==='solo'){
     if(g.event==='ГОЛ!'){gameplayToast('ГОООЛ!');audio('goal');}
     if(g.event==='СЕЙВ!'){gameplayToast('СЕЙВ!');}
    }
    lastEvent=g.eventId;
    gameFX.observe(g,dt,mode==='online');
    const aimed=mousePresent||!!chargeAt||Math.hypot(stick.x,stick.y)>.08;
    renderTopdown($('pitch'),g,t/1000,{selected:mySlot(),aim:aimed?shotAim():null,charge:chargeAt?limit(.55+(t-chargeAt)/1000,.55,1.2):.5,fx:gameFX,online:mode==='online',dt});
    updateHUD();
   }
   if(chargeAt&&shotPointer)$('chargeText').textContent=Math.min(100,Math.round((performance.now()-chargeAt)/10))+'%';
  }
 }
 requestAnimationFrame(frame);
}

updateMenu();show('home');checkServer();initProfileIdentity();
if(code&&/^(?:[0-9A-F]{8}|[0-9A-F-]{36})$/.test(code.toUpperCase()))connectNet('link');
requestAnimationFrame(frame);
