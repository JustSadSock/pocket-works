import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { PocketNet } from '../../shared/capabilities/net.js';
installMobileRuntime();

const $=s=>document.querySelector(s);
const canvas=$('#scene'),ctx=canvas.getContext('2d'),panel=$('#panel');
const localKey='pocket-works:blind-pals:';
const serverUrl=location.origin+'/pocketnet';
const params=new URLSearchParams(location.search);
let username=localStorage.getItem(localKey+'name')||'Рабочий',soundOn=localStorage.getItem(localKey+'sound')!=='off';
let net=null,view=null,me=null,roomId='',phase='home',connected=false,connecting=false,disconnectedPeer=false;
let mode='home',incoming=params.get('room')||'',message='',paused=false,pending=null,showKey='',lastLevel=-1,lastHits=0,lastPhase='';
let remote={x:0,y:0},cameraT=0,canvasW=1,canvasH=1,flashTimer=0,toastTimer=0;
const keys=new Set(),touch={x:0,y:0,hold:false},pulse={jump:false,ping:false},clock={last:0};
const DEMO={name:'ПЕРВАЯ СМЕНА',brief:'Займите две плиты. Каждый видит только напарника.',pads:[[3,7],[15,7]],walls:[]};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const code=()=>roomId?.slice(0,8)?.toUpperCase()||'';
const role=()=>view?.players?.findIndex(p=>p.id===me?.id)??-1;
const mine=()=>view?.runners?.[me?.id];
const other=()=>view?.players?.find(p=>p.id!==me?.id);
const partner=()=>other()?view?.runners?.[other().id]:null;
const stage=()=>view?.stage||DEMO;
const isPlaying=()=>view?.phase==='playing';
const isHost=()=>view?.host===me?.id;
const safeSend=(payload)=>{try{if(connected&&net?.socket?.readyState===WebSocket.OPEN){net.sendGame(payload);return true;}}catch{}return false;};
function beep(f=480,length=.09,shape='sine'){
 if(!soundOn)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
 const a=window.__blindAudio||(window.__blindAudio=new Audio());if(a.state==='suspended')a.resume();
 const o=a.createOscillator(),g=a.createGain();o.type=shape;o.frequency.setValueAtTime(f,a.currentTime);o.frequency.exponentialRampToValueAtTime(f*.82,a.currentTime+length);
 g.gain.setValueAtTime(.026,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+length);o.connect(g).connect(a.destination);o.start();o.stop(a.currentTime+length+.02);
 }catch{}
}
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function flash(text){const el=$('#gameFlash');el.textContent=text;el.classList.add('shown');clearTimeout(flashTimer);flashTimer=setTimeout(()=>el.classList.remove('shown'),1300);}
function status(text,tone=''){const el=$('#netStatus');el.textContent=text;el.className='connection '+tone;}
function resetInput(){keys.clear();touch.x=0;touch.y=0;touch.hold=false;pulse.jump=false;pulse.ping=false;safeSend({type:'input',x:0,y:0,hold:false});}
function updateUrl(room){const u=new URL(location.href);if(room)u.searchParams.set('room',room);else u.searchParams.delete('room');history.replaceState(null,'',u.pathname+u.search);}
function roomInput(raw){
 const s=String(raw||'').trim();
 try{const u=new URL(s);const r=u.searchParams.get('room');if(r)return roomInput(r);}catch{}
 const m=s.match(/[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{8}/i);
 return m?.[0]||null;
}
async function copy(value){
 try{await navigator.clipboard.writeText(value);toast('Скопировано');}
 catch{const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();toast(ok?'Скопировано':'Скопируй код вручную: '+code());}
}
function soundMarkup(){return '<button class="button muted" data-do="sound">Звук: '+(soundOn?'ВКЛ':'ВЫКЛ')+'</button>';}
function playerMarkup(p,i){return '<div class="pilot"><span class="bead '+(i?'blue':'red')+'"></span><span>'+esc(p.name)+'</span><small>'+(p.id===me?.id?'ТЫ':disconnectedPeer?'НЕТ СВЯЗИ':'НАПАРНИК')+'</small></div>';}
function home(){
 phase='home';showKey='';view=null;lastLevel=-1;lastHits=0;paused=false;togglePause(false);
 $('#stageTitle').textContent='ЦЕХ №1';$('#stageBrief').textContent='Твои глаза — у напарника';
 panel.innerHTML='<span class="overline">ИГРА ДЛЯ ДВОИХ · POCKET NET</span><h1 class="title">СЛЕПАЯ<br><em>СМЕНА.</em></h1><p class="deck">Ты видишь напарника. Он видит тебя. Но никто из вас не видит самого себя.</p>'+
 '<button id="primary-action" class="button primary" data-do="create">Создать комнату ↗</button><button class="button secondary" data-do="join-mode">Ввести код друга</button>'+
 '<hr class="divider"><span class="overline">КАК ИГРАТЬ</span><p class="tiny">Вдвоём встаньте на две плиты, откройте заслонку и дойдите до выхода. Направляйте друг друга голосом.</p>'+soundMarkup();
 status('POCKET NET');
}
function entry(joining){
 phase='entry';mode=joining?'join':'create';showKey='';
 panel.innerHTML='<span class="overline">ПОДКЛЮЧЕНИЕ</span><h2 class="title">'+(joining?'ВХОД<br><em>ПО КОДУ.</em>':'ТВОЙ<br><em>ЦЕХ.</em>')+'</h2>'+
 '<label class="field" for="nick">ТВОЁ ИМЯ</label><input class="text-input" id="nick" type="text" maxlength="24" autocomplete="nickname" value="'+esc(username)+'">'+
 (joining?'<label class="field" for="code">КОД ИЛИ ССЫЛКА</label><input class="text-input" id="code" maxlength="160" autocapitalize="characters" spellcheck="false" placeholder="8 символов" value="'+esc(incoming)+'">':'<p class="hint">Создай комнату и отправь другу код. Начнёте, когда оба подключатся.</p>')+
 '<button id="primary-action" class="button primary" data-do="connect">'+(joining?'Присоединиться':'Создать комнату')+'</button><button class="button muted" data-do="home">Назад</button>';
}
function waitPanel(){
 const players=view?.players||[];
 const canStart=players.length===2&&isHost()&&!disconnectedPeer&&connected;
 phase='lobby';
 panel.innerHTML='<span class="overline">КОМНАТА · 2 ИГРОКА</span><h2 class="title">ЖДЁМ<br><em>ВТОРОГО.</em></h2>'+
 '<div class="ticket"><span class="ticket-label">КОД ПРИГЛАШЕНИЯ</span><strong class="ticket-code">'+esc(code())+'</strong><span class="ticket-label">СООБЩИ ДРУГУ</span></div>'+
 '<button class="button secondary" data-do="copy">Копировать приглашение</button><div style="margin-top:12px">'+players.map(playerMarkup).join('')+'</div>'+
 (isHost()?'<button id="primary-action" class="button primary" '+(canStart?'':'disabled')+' data-do="start">'+(canStart?'Начать смену ↗':'Ожидаем напарника')+'</button>':'<div class="objective"><strong>ЖДЁМ ОРГАНИЗАТОРА</strong>Начнёт игру создатель комнаты.</div>')+
 '<button class="button muted" data-do="leave">Покинуть комнату</button>';
}
function gamePanel(){
 phase='game';
 const level=view?.level||0,total=view?.levelCount||6,partnerName=other()?.name||'Напарник';
 const selfRole=role()===0?'КРАСНЫЙ':'СИНИЙ',partnerRole=role()===0?'СИНИЙ':'КРАСНЫЙ';
 const cargo=stage().cargoPad;
 panel.innerHTML='<span class="overline">СМЕНА / '+String(level+1).padStart(2,'0')+' ИЗ '+total+'</span><h2 class="title">'+esc(stage().name).replaceAll(' ','<br><em>')+'.</em></h2>'+
 '<div class="progress-track"><div style="width:'+Math.round((level+1)/total*100)+'%"></div></div>'+
 '<div class="pilot"><span class="bead '+(role()===0?'red':'blue')+'"></span><span>Ты · '+selfRole+'</span><small>НЕВИДИМ</small></div>'+
 '<div class="pilot"><span class="bead '+(role()===0?'blue':'red')+'"></span><span>'+esc(partnerName)+'</span><small>'+partnerRole+'</small></div>'+
 '<div class="objective"><strong>'+ (view.unlocked?'ЗАСЛОНКА ОТКРЫТА':'ЗАДАЧА')+'</strong>'+
 (view.unlocked?'Теперь оба подойдите к светящемуся выходу.':cargo?'Удерживайте плиты вдвоём и поставьте груз на ромб. E — толкать.':'Вдвоём одновременно встаньте на две плиты. Видно только друг друга.')+'</div>'+
 '<p class="tiny">'+esc(stage().brief)+'</p><button class="button muted" data-do="pause">Пауза · Esc</button>'+soundMarkup();
}
function finishPanel(){
 phase='finish';
 const hits=view.totalHits||0;
 const prev=Number(localStorage.getItem(localKey+'best')||999999);
 const best=Math.min(prev,hits);
 try{localStorage.setItem(localKey+'best',String(best));}catch{}
 panel.innerHTML='<span class="overline">СМЕНА ЗАВЕРШЕНА</span><h2 class="title">ВЫ<br><em>СПРАВИЛИСЬ.</em></h2><p class="deck">Шесть механизмов пройдены. Даже не видя себя, вы нашли общий язык.</p>'+
 '<div class="ticket"><span class="ticket-label">ПОПАДАНИЙ ПОД ПРЕСС</span><strong class="ticket-code">'+hits+'</strong><span class="ticket-label">ЛУЧШИЙ РЕЗУЛЬТАТ · '+best+'</span></div>'+
 (isHost()?'<button id="primary-action" class="button primary" data-do="again">Ещё одна смена ↗</button>':'<div class="objective">Создатель комнаты может запустить новый забег.</div>')+
 '<button class="button muted" data-do="leave">В меню</button>';
}
function showPanel(force=false){
 const key=[view?.phase,view?.level,view?.unlocked,view?.players?.length,view?.host,disconnectedPeer,connected,view?.clearAt].join('|');
 if(!force&&key===showKey)return;
 showKey=key;
 if(view?.phase==='lobby')waitPanel();
 else if(view?.phase==='playing')gamePanel();
 else if(view?.phase==='finished')finishPanel();
}
function onState(s){
 if(!s||typeof s!=='object')return;
 const prevLevel=lastLevel,prevPhase=lastPhase,prevHits=lastHits;
 view=s;lastPhase=s.phase;lastLevel=s.level;
 if(s.phase==='playing'){
  const h=mine()?.hits||0;lastHits=h;
  if(prevLevel>=0&&s.level!==prevLevel){remote.x=partner()?.x??remote.x;remote.y=partner()?.y??remote.y;flash('ЦЕХ ПРОЙДЕН · '+(s.level+1)+'/6');beep(725,.19);}
  else if(prevPhase==='playing'&&h>prevHits){flash('ПОД ПРЕСС!');beep(176,.22,'sawtooth');}
  if(s.clearAt&&!$('#gameFlash').classList.contains('shown'))flash('ОБА НА ВЫХОДЕ!');
  $('#stageTitle').textContent='ЦЕХ №'+(s.level+1)+' / '+s.levelCount;
  $('#stageBrief').textContent=stage().brief;
 }else if(s.phase==='finished'&&prevPhase!=='finished'){flash('СМЕНА ЗАКРЫТА!');beep(690,.26);}
 else if(s.phase==='lobby'){$('#stageTitle').textContent='ЗАЛ ОЖИДАНИЯ';$('#stageBrief').textContent='Один видит другого';}
 showPanel();
}
function handleError(code){
 const messages={room_not_found:'Комната не найдена',room_full:'В комнате уже двое',game_unavailable:'Игра ещё не опубликована на PocketNet',match_in_progress:'Партия уже началась',rate_limited:'Слишком много запросов, попробуй позже',server_at_capacity:'Сервер заполнен',account_already_in_room:'Этот аккаунт уже находится в комнате'};
 const description=messages[code]||'Ошибка сети: '+code;
 toast(description);
 if(!roomId&&connecting){connecting=false;connected=false;net?.close();net=null;entry(mode==='join');}
}
async function connectRoom(){
 if(connecting)return;
 const nick=$('#nick')?.value.trim()||username;
 if(nick.length<1||nick.length>24){toast('Имя: от 1 до 24 символов');return;}
 username=nick;localStorage.setItem(localKey+'name',username);
 let target=null;
 if(mode==='join'){target=roomInput($('#code')?.value||'');if(!target){toast('Нужен код из 8 символов');return;}incoming=target;}
 connecting=true;status('ПОДКЛЮЧАЕМСЯ','warning');
 panel.innerHTML='<span class="overline">POCKET NET</span><h2 class="title">СВЯЗЫВАЕМ<br><em>ЦЕХА…</em></h2><p class="deck">Подключение к серверу и согласование комнаты.</p><button class="button muted" data-do="cancel">Отмена</button>';
 if(net){net.close();net=null;}
 const session=new PocketNet({serverUrl,name:username,storage:sessionStorage,identityKey:'blind-pals-guest'});
 // A fresh create or join must not reuse the room id persisted by an earlier tab session.
 session.roomId=null;session.persist();
 net=session;pending={type:mode,target};
 session.on('connected',result=>{
  if(net!==session)return;
  connected=true;status('НА СВЯЗИ','online');me=result.player;
  if(pending?.type==='create'){session.createRoom('blind-pals',{});pending=null;}
  else if(pending?.type==='join'){session.joinRoom(pending.target);pending=null;}
 });
 session.on('room_joined',e=>{
  if(net!==session)return;
  roomId=e.roomId;connecting=false;disconnectedPeer=false;updateUrl(code());
  if(e.state)onState(e.state);
  safeSend({type:'sync'});beep(540,.1);status('НА СВЯЗИ','online');
 });
 session.on('game_event',e=>{
  if(net!==session||e.roomId!==roomId)return;
  if(e.event?.type==='state')onState(e.event.payload);
  else if(e.event?.type==='notice')toast(String(e.event.payload||'Сообщение сервера'));
 });
 session.on('presence',e=>{if(e.roomId!==roomId)return;disconnectedPeer=!!(e.disconnected&&e.disconnected!==me?.id);showPanel(true);});
 session.on('disconnected',()=>{if(net!==session)return;connected=false;status('СВЯЗЬ ПОТЕРЯНА','warning');resetInput();toast('Переподключение к PocketNet…');showPanel(true);});
 session.on('error',e=>{if(net!==session)return;handleError(e.code||e.message||'unknown');});
 session.on('room_closed',()=>{if(net!==session)return;toast('Комната закрыта');leave();});
 try{await session.connect();}
 catch(err){if(net!==session)return;connecting=false;connected=false;session.close();net=null;status('НЕТ СОЕДИНЕНИЯ','warning');message=String(err.message||err);entry(mode==='join');toast('Не удалось подключиться: '+message);}
}
function leave(){
 resetInput();
 if(net){try{if(roomId&&connected)net.leaveRoom();}catch{}net.close();net=null;}
 connected=false;connecting=false;pending=null;roomId='';me=null;disconnectedPeer=false;showKey='';updateUrl(null);home();
}
function togglePause(show){
 paused=show;const el=$('#pauseLayer');el.classList.toggle('hidden',!show);
 if(show)resetInput();
}
panel.addEventListener('click',e=>{
 const btn=e.target.closest('button[data-do]');if(!btn||btn.disabled)return;
 beep(455,.07);
 switch(btn.dataset.do){
 case 'create':mode='create';entry(false);break;
 case 'join-mode':mode='join';entry(true);break;
 case 'home':home();break;
 case 'connect':connectRoom();break;
 case 'cancel':leave();break;
 case 'copy':copy(location.origin+location.pathname+'?room='+code());break;
 case 'start':safeSend({type:'start'});break;
 case 'again':safeSend({type:'again'});break;
 case 'pause':togglePause(true);break;
 case 'leave':leave();break;
 case 'sound':soundOn=!soundOn;localStorage.setItem(localKey+'sound',soundOn?'on':'off');showPanel(true);if(!view)home();break;
 }
});
$('#resumeBtn').addEventListener('click',()=>togglePause(false));
$('#leaveBtn').addEventListener('click',leave);
panel.addEventListener('keydown',e=>{if(e.key==='Enter'&&phase==='entry'){e.preventDefault();connectRoom();}});
function inputVector(){
 let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
 let y=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.y;
 const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag;}return{x:+x.toFixed(3),y:+y.toFixed(3)};
}
const recognized=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyF','Escape']);
document.addEventListener('keydown',e=>{
 if(e.code==='Escape'&&isPlaying()){e.preventDefault();togglePause(!paused);return;}
 if(!isPlaying()||paused||document.activeElement?.matches('input,textarea'))return;
 if(recognized.has(e.code)){e.preventDefault();keys.add(e.code);}
 if(e.code==='Space'&&!e.repeat)pulse.jump=true;
 if(e.code==='KeyF'&&!e.repeat)pulse.ping=true;
});
document.addEventListener('keyup',e=>{keys.delete(e.code);});
window.addEventListener('blur',resetInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();});
setInterval(()=>{
 if(!isPlaying()||paused||!connected||document.hidden)return;
 const v=inputVector();
 const success=safeSend({type:'input',x:v.x,y:v.y,hold:keys.has('KeyE')||touch.hold,jump:pulse.jump,ping:pulse.ping});
 if(success){pulse.jump=false;pulse.ping=false;}
},80);
function attachTouch(){
 const area=$('#touchStick'),nub=$('#stickNub');
 let active=null;
 const update=e=>{const r=area.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;const dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy),radius=r.width*.38,m=Math.min(1,d/radius);
 touch.x=d?dx/d*m:0;touch.y=d?dy/d*m:0;nub.style.transform='translate(calc(-50% + '+(touch.x*radius)+'px),calc(-50% + '+(touch.y*radius)+'px))';};
 area.addEventListener('pointerdown',e=>{if(!isPlaying())return;active=e.pointerId;area.setPointerCapture(e.pointerId);update(e);});
 area.addEventListener('pointermove',e=>{if(e.pointerId===active)update(e);});
 const release=e=>{if(e.pointerId!==active)return;active=null;touch.x=0;touch.y=0;nub.style.transform='translate(-50%,-50%)';};
 area.addEventListener('pointerup',release);area.addEventListener('pointercancel',release);area.addEventListener('lostpointercapture',release);
 const jump=$('#touchJump');jump.addEventListener('pointerdown',e=>{if(isPlaying())pulse.jump=true;});
 const hold=$('#touchHold');hold.addEventListener('pointerdown',e=>{touch.hold=true;hold.setPointerCapture(e.pointerId);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])hold.addEventListener(ev,()=>touch.hold=false);
}
attachTouch();
function resize(){
 const b=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
 canvasW=Math.max(1,b.width);canvasH=Math.max(1,b.height);
 const width=Math.round(canvasW*dpr),height=Math.round(canvasH*dpr);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 ctx.setTransform(dpr,0,0,dpr,0,0);
}
new ResizeObserver(resize).observe(canvas);
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function roundRect(x,y,w,h,r,color){
 ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function ring(x,y,r,fill,stroke='#263c32',line=.09){
 ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke();
}
function label(text,x,y,size=.18,color='#273c2e'){
 ctx.font='900 '+size+'px system-ui';ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);
}
function floor(t){
 rect(0,0,18,12,'#b9c5ae');
 for(let j=0;j<12;j++)for(let i=0;i<18;i++){
  const n=Math.abs(Math.sin(i*13.97+j*78.23));
  rect(i+.025,j+.025,.95,.95,n>.62?'#b5c2aa':n>.32?'#b9c6b0':'#bfcbb7');
  if((i+j*7)%5===0){rect(i+.2,j+.18,.22,.025,'#8e9d8b50');rect(i+.15,j+.58,.025,.25,'#dfe3c455');}
  ring(i+.08,j+.09,.022,'#8a9a89','transparent',0);
 }
 for(let i=0;i<18;i++){rect(i,0,1,.22,'#526a57');rect(i,11.78,1,.22,'#526a57');}
 rect(0,0,.23,12,'#526a57');rect(17.77,0,.23,12,'#526a57');
 // A central service hatch sits in the playable lower hall.
 roundRect(7.1,10.85,3.8,.35,.07,'#6d806c');
 for(let i=0;i<8;i++)rect(7.28+i*.47,10.94,.25,.09,'#b4bc9c');
}
function wall(r){
 let [x,y,w,h]=r;
 rect(x+.11,y+.2,w,h,'#516756');rect(x,y,w,h,'#7c927b');
 rect(x,y,w,.12,'#cbd4b5');rect(x,y,.13,h,'#b4bea0');
 rect(x+w-.17,y,.17,h,'#526854');
 for(let i=.32;i<w-.17;i+=.68){ring(x+i,y+.21,.055,'#465d50','#dde0be',.018);}
}
function belt(b,t){
 const [x,y,w,h]=b.rect;
 roundRect(x,y,w,h,.15,'#586c5b');
 roundRect(x+.14,y+.14,w-.28,h-.28,.12,'#879b89');
 ctx.save();ctx.beginPath();ctx.rect(x+.17,y+.17,w-.34,h-.34);ctx.clip();
 const dir=b.dx?Math.sign(b.dx):Math.sign(b.dy);
 for(let n=-3;n<24;n++){
  ctx.save();ctx.translate(x+(b.dx?((n*.65+t*.7*dir)%(w+2)+w+2)%(w+2)-.7:w/2),y+(b.dy?((n*.65+t*.7*dir)%(h+2)+h+2)%(h+2)-.7:h/2));
  if(b.dy)ctx.rotate(Math.PI/2);
  ctx.strokeStyle='#e4e4bd';ctx.lineWidth=.09;ctx.beginPath();ctx.moveTo(-.18,-.16);ctx.lineTo(.02,0);ctx.lineTo(-.18,.16);ctx.stroke();ctx.restore();
 }
 ctx.restore();
 for(let i=.24;i<w;i+=.7){ring(x+i,y+.07,.055,'#3d5145','#c2ccb5',.025);ring(x+i,y+h-.08,.055,'#3d5145','#c2ccb5',.025);}
}
function pad(x,y,active,t,id,cargo=false){
 ring(x+.05,y+.12,.55,'#647d68','#344e3c',.08);
 ring(x,y,.51,active?'#e5c977':'#c5d3ad',active?'#fff3b0':'#758d77',.09);
 ctx.save();ctx.translate(x,y);ctx.rotate(cargo?Math.PI/4:0);
 if(cargo){roundRect(-.26,-.26,.52,.52,.03,active?'#ad7a44':'#6d8063');}
 else{ring(0,0,.29,active?'#d9a04f':'#95a789','transparent',0);}
 ctx.restore();
 label(cargo?'◆':id,x,y,.24,active?'#2e4a37':'#506e5a');
 if(active){ctx.strokeStyle='#f8e3a7aa';ctx.lineWidth=.045;ctx.beginPath();ctx.arc(x,y,.62+.045*Math.sin(t*5),0,Math.PI*2);ctx.stroke();}
}
function exitDoor(){
 roundRect(7.45,1.1,3.1,2.35,.23,'#506c55');roundRect(7.67,1.28,2.65,1.95,.13,'#dde0b4');
 for(let i=0;i<6;i++)rect(7.83+i*.4,1.45,.14,1.4,'#aec6a0');
 roundRect(8.16,2.17,1.68,.67,.12,'#d18e5e');
 label('ВЫХОД',9,2.5,.25,'#2e3930');
}
function gate(isUnlocked,t){
 if(isUnlocked){rect(8,4,2,.8,'#8ba08e55');rect(8,4,.12,.8,'#63886a');rect(9.88,4,.12,.8,'#63886a');return;}
 roundRect(8,3.93,2,.98,.07,'#496453');
 for(let i=0;i<5;i++){rect(8.17+i*.4,4,.18,.83,i%2?'#c5ad77':'#e4cd95');}
 ring(9,4.43,.12,'#a93f31','#f9d38d',.04);
}
function press(r,t,i){
 const on=((t*1000+i*330)%2600)<1420,[x,y,w,h]=r;
 roundRect(x,y,w,h,.1,on?'#994b3c':'#667568');
 for(let k=.16;k<w;k+=.46){rect(x+k,y+.15,.21,h-.3,on?'#d87554':'#b2bf9d');}
 if(on){rect(x,y,w,.08,'#f7be7d');rect(x,y+h-.08,w,.08,'#f7be7d');}
}
function crate(c){
 if(!c)return;
 roundRect(c.x-.45+.08,c.y-.45+.12,.92,.92,.08,'#485a46');
 roundRect(c.x-.45,c.y-.45,.9,.9,.06,'#b98158');
 rect(c.x-.37,c.y-.38,.74,.1,'#e6b57a');
 ctx.strokeStyle='#744a3d';ctx.lineWidth=.085;
 ctx.beginPath();ctx.moveTo(c.x-.3,c.y-.28);ctx.lineTo(c.x+.3,c.y+.3);ctx.moveTo(c.x+.3,c.y-.28);ctx.lineTo(c.x-.3,c.y+.3);ctx.stroke();
 for(const dx of [-.34,.34])for(const dy of [-.34,.34])ring(c.x+dx,c.y+dy,.035,'#f2d7a2','#724734',.015);
}
function runner(p,i,t){
 if(!p)return;
 const x=p.x,y=p.y,air=p.jumpUntil>Date.now();
 const pace=Math.hypot(p.vx,p.vy);
 ctx.save();
 ctx.translate(x,y-(air?.21:0));
 ring(.055,.18,.38,'#283d3545','transparent',0);
 ctx.rotate(clamp(p.vx,-3,3)*.03);
 const main=i===0?'#cc765a':'#7da7ba',edge=i===0?'#6c4035':'#365a6e';
 const walk=Math.sin(t*pace*6)*Math.min(.1,pace*.025);
 roundRect(-.29,-.29+walk,.58,.68,.18,edge);
 roundRect(-.26,-.32+walk,.52,.56,.17,main);
 ring(0,-.26+walk,.25,'#f2d0a5',edge,.05);
 // Hardhat, face and body are one coherent enamel toy silhouette.
 roundRect(-.29,-.4+walk,.58,.15,.05,i===0?'#f0c482':'#e6d795');
 rect(-.19,-.24+walk,.09,.04,'#33382c');rect(.1,-.24+walk,.09,.04,'#33382c');
 roundRect(-.19,.16+walk,.38,.12,.04,'#e4cda4');
 roundRect(-.25,.32-walk,.18,.21,.05,edge);roundRect(.07,.32+walk,.18,.21,.05,edge);
 if(p.pingUntil>Date.now()){ctx.strokeStyle='#f9efb7';ctx.lineWidth=.07;ctx.beginPath();ctx.arc(0,0,.7+(800-(p.pingUntil-Date.now()))/850,.0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
function draw(){
 resize();const w=canvasW,h=canvasH,dpr=Math.min(devicePixelRatio||1,2);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 rect(0,0,w,h,'#344b3d');
 const scale=Math.min(w/18,h/12),ox=(w-18*scale)/2,oy=(h-12*scale)/2;
 ctx.translate(ox,oy);ctx.scale(scale,scale);
 const s=stage(),t=cameraT/1000;
 floor(t);
 exitDoor();
 for(const b of s.belts||[])belt(b,t);
 for(const r of [[0,4,8,.8],[10,4,8,.8],...(s.walls||[])])wall(r);
 gate(!!view?.unlocked,t);
 for(const [i,r] of (s.hazards||[]).entries())press(r,(view?.elapsed||0)/1000,i);
 const all=Object.values(view?.runners||{});
 for(const [i,xy] of (s.pads||[]).entries())pad(xy[0],xy[1],all.some(p=>Math.hypot(p.x-xy[0],p.y-xy[1])<.65),t,i===0?'A':'B');
 if(s.cargoPad){const [x,y]=s.cargoPad;pad(x,y,view?.crate&&Math.hypot(view.crate.x-x,view.crate.y-y)<.6,t,'',true);}
 crate(view?.crate);
 if(isPlaying()&&other()?.id){
  const p=partner();
  if(p){
   if(!remote.x&&!remote.y||Math.hypot(remote.x-p.x,remote.y-p.y)>6){remote.x=p.x;remote.y=p.y;}
   else {const ease=clamp(clock.last*13,0,1);remote.x+=(p.x-remote.x)*ease;remote.y+=(p.y-remote.y)*ease;}
   runner({...p,x:remote.x,y:remote.y},role()===0?1:0,t);
  }
 }
 if(view?.clearAt){const amount=clamp((view.clearAt-Date.now())/1550,0,1);ctx.fillStyle='rgba(234,217,149,'+((1-amount)*.25)+')';ctx.fillRect(0,0,18,12);}
}
function frame(now){
 clock.last=Math.min(.05,Math.max(.001,(now-cameraT)/1000||.016));cameraT=now;
 if(!document.hidden)draw();requestAnimationFrame(frame);
}
function initialize(){
 home();requestAnimationFrame(frame);
 if(incoming){mode='join';entry(true);}
 else{
  let saved=null;try{saved=JSON.parse(sessionStorage.getItem('pocket-net:'+serverUrl)||'null');}catch{}
  if(saved?.roomId){mode='join';incoming=saved.roomId;entry(true);toast('Есть недавняя комната — можно вернуться по коду.');}
 }
}
initialize();
