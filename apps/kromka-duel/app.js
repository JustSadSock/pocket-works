import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {W,H,CX,CY,R,startFighters,bladeOf,neutral,actionOf,clamp,resolveExchange,botChoice,commitment,digest,PLAN_MS} from './engine.js';
installMobileRuntime();
const $=id=>document.getElementById(id),ui=$('ui'),canvas=$('arena'),ctx=canvas.getContext('2d',{alpha:false});
const SERVER=location.origin+'/pocketnet',SAVE='pocket-works:kromka-duel:',query=new URLSearchParams(location.search);
const store=new Map(),storage={getItem(k){try{return sessionStorage.getItem(SAVE+k)}catch{return store.get(k)||null}},
setItem(k,v){try{sessionStorage.setItem(SAVE+k,v)}catch{store.set(k,v)}},
removeItem(k){try{sessionStorage.removeItem(SAVE+k)}catch{store.delete(k)}}};
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let screen='menu',state=null,net=null,me=null,code='',roomId='',health=null,connected=false,connecting=false,modal='',serial=0;
let alias=localStorage.getItem(SAVE+'name')||'Дуэлянт',sound=localStorage.getItem(SAVE+'sound')!=='off';
let typedCode=(query.get('room')||'').trim().toUpperCase(),intent=neutral(),pending=null,lastAnimation=0,animationStart=-10000,drag=null,revealSent=-1,commitBusy=false,renderStamp='';
let audio=null,toastTimeout=0;
function notify(msg){const el=$('toast');el.textContent=String(msg);el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3400);}
function tone(kind='tap'){
 if(!sound)return;
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  audio ||=new AC();if(audio.state==='suspended')audio.resume();
  const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();
  o.type=kind==='clash'?'sawtooth':'triangle';const hz=kind==='clash'?210:kind==='hit'?90:420;
  o.frequency.setValueAtTime(hz,now);o.frequency.exponentialRampToValueAtTime(kind==='hit'?47:hz*.48,now+.17);
  g.gain.setValueAtTime(kind==='clash'?.045:.022,now);g.gain.exponentialRampToValueAtTime(.0001,now+.2);
  o.connect(g).connect(audio.destination);o.start(now);o.stop(now+.21);
 }catch{}
}
function side(){return state?.players?.findIndex(p=>p.id===me?.id)??-1;}
function send(payload){if(!connected||!net)return false;try{net.sendGame(payload);return true}catch{notify('Нет связи с PocketNet.');return false}}
function pips(score){return Array.from({length:3},(_,i)=>'<i class="pip '+(i<score?'on':'')+'"></i>').join('')}
function head(){return '<header class="top"><a class="back" href="../../" data-app-control data-native-press><b>‹</b> Pocket Works</a><span class="wordmark">К Р О М К А</span><button class="tool" data-action="help" aria-label="Правила и звук">☷</button></header>'}
function panel(content){return '<section class="panel">'+content+'</section>'}
function lobbyHTML(){
 const people=state.players||[],own=state.host===me?.id;
 return panel('<span class="kicker">Зал ожидания / PocketNet</span><h2>Дуэль на двоих.</h2>'+
 '<div class="tiny">КОД ПРИГЛАШЕНИЯ</div><div class="code">'+esc(code||'········')+'</div>'+
 '<div class="row"><button class="action tertiary" data-action="copy-code" style="flex:1">Копировать код</button><button class="action tertiary" data-action="copy-link" style="flex:1">Ссылка</button></div>'+
 '<div class="roster"><span class="seat"><b>ПЕРВЫЙ</b>'+esc(people[0]?.name||'—')+'</span><span class="vs">versus</span>'+
 '<span class="seat"><b>ВТОРОЙ</b>'+esc(people[1]?.name||'Ожидание')+'</span></div>'+
 '<button class="action" data-action="start" '+(!own||people.length!==2||!connected?'disabled':'')+'>'+(own?'Начать дуэль':'Ожидаем хозяина')+'</button>'+
 '<button class="action tertiary" data-action="leave">Покинуть зал</button>');
}
function hasRoom(){try{return !!JSON.parse(storage.getItem('pocket-net:'+SERVER)||'null')?.roomId}catch{return false}}
function menuHTML(){
 return '<section class="menu"><div class="menu-brand"><span class="kicker">Дуэльная миниатюра</span><h1>КРОМКА<em>ИСКУССТВО ДУЭЛИ</em></h1>'+
 '<p class="menu-sub">Два клинка. Одна линия ошибки.<br>Шаг, инерция и точность решают всё.</p></div>'+
 '<div class="menu-actions">'+(hasRoom()?'<button class="action" data-action="resume">Вернуться к дуэли</button>':'')+'<button class="action" data-action="practice">Тренировка с мастером</button>'+
 '<button class="action secondary" data-action="create">Вызвать друга на дуэль</button>'+
 '<button class="action tertiary" data-action="join-menu">Войти по коду комнаты</button>'+
 '<small>ПОКЕТNET · ОДНОВРЕМЕННЫЕ ТАКТЫ</small></div></section>';
}
function scoreHTML(){
 const s=state,players=s.players||[],time=s.phase==='plan'?Math.max(0,(s.deadline-Date.now())/1000):0;
 return '<div class="scoreboard"><div class="score-player"><div class="score-name">'+esc(players[0]?.name||'Первый')+'</div><div class="pips">'+pips(s.scores[0])+'</div></div>'+
 '<div class="round">'+(s.beat||'—')+'</div><div class="score-player right"><div class="score-name">'+esc(players[1]?.name||'Второй')+'</div><div class="pips">'+pips(s.scores[1])+'</div></div></div>'+
 '<div class="phase-info"><strong id="phaseMain">'+(s.phase==='reveal'?'Клинки сведены':s.phase==='finished'?'Дуэль окончена':'Выбери линию удара')+'</strong>'+
 '<small id="phaseSmall">'+(s.phase==='plan'?'До фиксации: '+time.toFixed(1)+' с':s.phase==='reveal'?'Раскрываем намерения':'Первый до трёх касаний')+'</small></div>';
}
function controlsHTML(){
 const locked=screen==='online'&&(state.phase!=='plan'||Boolean(state.hashes[side()]));
 const active=screen==='practice'||(screen==='online'&&state.phase==='plan'&&!locked);
 return '<section class="controls">'+
 '<div class="pad-wrap"><span class="pad-caption">Шаг</span><div class="pad move '+(locked?'locked':'')+'" data-pad="move" role="group" aria-label="Управление перемещением"><div class="stick" id="moveStick"></div></div></div>'+
 '<div class="commit-wrap"><button class="commit" data-action="commit" '+(!active||!connected&&screen==='online'?'disabled':'')+'>'+
 (locked?'ЖДЁМ':screen==='practice'?'УДАР':'ГОТОВО')+'</button><span class="commit-label" id="commitLabel">'+(locked?'ЗАФИКСИРОВАНО':'ТАКТ '+state.beat)+'</span></div>'+
 '<div class="pad-wrap"><span class="pad-caption">Клинок</span><div class="pad blade '+(locked?'locked':'')+'" data-pad="blade" role="group" aria-label="Управление клинком"><div class="stick" id="bladeStick"></div></div></div>'+
 '</section>';
}
function resultHTML(){
 const win=state.winner,local=screen==='practice'?0:side();
 const verdict=win<0?'Ничья':win===local?'Твоя победа':'Победа соперника';
 return panel('<span class="kicker">Поединок окончен</span><h2>'+verdict+'</h2><p>Касания: '+state.scores[0]+' — '+state.scores[1]+'. Ни случайного урона, ни скрытых бонусов.</p>'+
 (screen==='practice'?'<button class="action" data-action="restart">Ещё один поединок</button>':
 '<button class="action" data-action="again" '+(state.host===me?.id&&connected?'':'disabled')+'>'+(state.host===me?.id?'Реванш':'Реванш запускает хозяин')+'</button>')+
 '<button class="action tertiary" data-action="leave">В главное меню</button>');
}
function modalHTML(){
 const close='<button class="close" data-action="close" aria-label="Закрыть">×</button>';
 if(modal==='help')return '<div class="modal-shade"><div class="modal">'+close+'<span class="kicker">Мастерская клинка</span><h2>Читай, не угадывай.</h2><ol><li>Левой зоной задай шаг в любую сторону.</li><li>Правой — насколько повернуть клинок за следующий такт.</li><li>Зафиксируй движение. В сети оба игрока выбирают его одновременно и тайно.</li><li>Клинки действительно соприкасаются. Промах открывает корпус.</li><li>Три точных касания приносят победу. На поле нет случайных ударов.</li></ol><button class="action secondary" data-action="sound">Звук: '+(sound?'включён':'выключен')+'</button><button class="action" data-action="close">К дуэли</button></div></div>';
 if(modal==='exit')return '<div class="modal-shade"><div class="modal">'+close+'<h2>Покинуть дуэль?</h2><p>В сетевом матче это засчитает поражение. В тренировке партия завершится.</p><button class="action" data-action="leave-confirm">Покинуть</button><button class="action tertiary" data-action="close">Остаться</button></div></div>';
 if(modal==='join'||modal==='name')return '<div class="modal-shade"><div class="modal">'+close+'<h2>'+(modal==='join'?'Войти в зал':'Твоё имя')+'</h2>'+
 '<label for="alias">Имя дуэлянта</label><input class="field" id="alias" maxlength="22" value="'+esc(alias)+'" autocomplete="nickname">'+
 (modal==='join'?'<label for="codeInput" style="margin-top:15px">Код приглашения</label><input class="field" id="codeInput" maxlength="36" value="'+esc(typedCode)+'" placeholder="8 СИМВОЛОВ" autocomplete="off" autocapitalize="characters">':'')+
 '<button class="action" data-action="'+(modal==='join'?'join':'confirm-create')+'">'+(modal==='join'?'Войти по коду':'Создать зал')+'</button></div></div>';
 return '';
}
function render(){
 let value=head();
 if(screen==='menu')value+=menuHTML();
 else if(screen==='connecting')value+='<div class="panel"><span class="kicker">PocketNet</span><h2>Настраиваем связь…</h2><p>Открывается защищённая комната.</p><button class="action tertiary" data-action="cancel-connect">Отмена</button></div>';
 else if(!state)value+=menuHTML();
 else if(state.phase==='lobby')value+=lobbyHTML();
 else{value+=scoreHTML();value+=state.phase==='finished'?resultHTML():controlsHTML();
  
 }
 value+=modalHTML();ui.innerHTML=value;
 updateSticks();
}
function updateSticks(){
 const pads=[['moveStick',intent.mx*28,intent.my*28],['bladeStick',intent.blade*28,0]];
 for(const [id,x,y] of pads){const el=$(id);if(el){el.style.setProperty('--sx',x+'px');el.style.setProperty('--sy',y+'px');}}
}
function rememberIntent(){intent=neutral();updateSticks();}
function beginPractice(){
 closeNetwork(false);screen='practice';me={id:'local',name:'Ты'};state={phase:'plan',players:[me,{id:'bot',name:'Маэстро'}],host:'local',
 scores:[0,0],fighters:startFighters(),beat:1,deadline:0,last:null,winner:null};lastAnimation=0;rememberIntent();render();tone();
}
function practiceBeat(){
 if(!state||state.phase!=='plan')return;
 const action=actionOf(intent)||neutral(),second=botChoice(state.fighters,state.beat),r=resolveExchange(state.fighters,[action,second]);
 const point=r.hit==='double'?null:r.hit;
 if(point!==null)state.scores[point]++;
 state.last={...r,seq:state.beat,point};state.fighters=point===null?r.after:startFighters();state.beat++;
 if(Math.max(...state.scores)>=3||state.beat>65){state.phase='finished';state.winner=state.scores[0]===state.scores[1]?-1:state.scores.indexOf(Math.max(...state.scores));}
 startAnimation();rememberIntent();render();
}
function stopNetwork(leave=true){
 serial++;if(net){if(leave&&state)try{net.leaveRoom()}catch{}net.close()}
 net=null;connected=false;connecting=false;roomId='';code='';
 if(leave)storage.removeItem('pocket-net:'+SERVER);
}
function closeNetwork(leave=true){stopNetwork(leave);state=null;screen='menu';modal='';history.replaceState(null,'',location.pathname);}
async function establish(mode){
 if(connecting)return;
 const name=($('alias')?.value||alias).trim().slice(0,22);
 if(!name){notify('Укажи имя.');return;}
 alias=name;localStorage.setItem(SAVE+'name',name);
 const requested=($('codeInput')?.value||typedCode).trim().toUpperCase();
 if(mode==='join'&&!(/^[A-F0-9]{8}$/.test(requested)||/^[0-9a-fA-F-]{36}$/.test(requested))){notify('Нужен восьмизначный код.');return;}
 typedCode=requested;
 stopNetwork(false);if(mode!=='resume')storage.removeItem('pocket-net:'+SERVER);state=null;me=null;screen='connecting';modal='';connecting=true;render();
 const current=++serial;
 try{
  const client=new PocketNet({serverUrl:SERVER,name,storage,identityKey:'duel:'+name});net=client;
  client.on('connected',data=>{if(net!==client)return;me=data.player;connected=true;connecting=false;if(state)render();if(state?.phase==='reveal')tryReveal();});
  client.on('room_joined',data=>{if(net!==client)return;roomId=data.roomId;code=roomId.slice(0,8).toUpperCase();screen='online';connecting=false;setState(data.state);history.replaceState(null,'',location.pathname+'?room='+code);});
  client.on('game_event',data=>{if(net!==client)return;const ev=data.event;if(ev?.type==='state')setState(ev.payload);if(ev?.type==='notice')notify(ev.payload);});
  client.on('presence',()=>{if(net===client&&state)send({type:'sync'});});
  client.on('disconnected',()=>{if(net!==client)return;connected=false;notify('Соединение прервано, переподключаемся.');render();});
  client.on('room_closed',()=>{if(net!==client)return;closeNetwork(false);render();notify('Комната закрыта.');});
  client.on('error',err=>{if(net!==client)return;notify(({room_not_found:'Комната не найдена.',room_full:'Зал уже занят.',match_in_progress:'Дуэль уже началась.',game_unavailable:'Модуль игры ещё не опубликован.',server_at_capacity:'Сервер сейчас заполнен.',invalid_token:'Сессия истекла.'})[err.code]||err.code||err.message||'Ошибка PocketNet');if(screen==='connecting'){closeNetwork(false);render();}});
  await Promise.race([client.connect(),new Promise((_,rej)=>setTimeout(()=>rej(Error('Не удалось установить соединение.')),11000))]);
  if(current!==serial)return;
  if(mode==='create')client.createRoom('kromka-duel');
  else if(mode==='join')client.joinRoom(requested);
  else if(!client.roomId)throw Error('Прошлая комната больше недоступна.');
 }catch(e){if(current!==serial)return;closeNetwork(false);render();notify(e.message||'Не удалось подключиться.');}
}
function startAnimation(){
 if(!state?.last||state.last.seq===lastAnimation)return;
 lastAnimation=state.last.seq;animationStart=performance.now();tone(state.last.point!==null?'hit':state.last.contact?'clash':'tap');
}
function setState(next){
 if(!next||typeof next!=='object')return;
 if(state&&next.revision<state.revision)return;
 const previous=state?.beat;state=next;
 startAnimation();
 if(next.beat!==previous){rememberIntent();revealSent=-1;commitBusy=false;}
 render();if(screen==='online'&&state.phase==='reveal')tryReveal();
}
async function commit(){
 if(screen==='practice'){practiceBeat();return;}
 if(!state||state.phase!=='plan'||!connected||commitBusy)return;
 const s=side();if(s<0||state.hashes[s])return;
 const beat=state.beat,act=actionOf(intent)||neutral(),nonce=crypto.randomUUID();
 const record={beat,action:act,nonce};
 pending=record;storage.setItem('pending',JSON.stringify(record));commitBusy=true;
 try{
  const hash=await digest(commitment(beat,s,act,nonce));
  if(state?.beat===beat&&screen==='online'){
   if(!send({type:'commit',beat,hash}))commitBusy=false;
  }
 }catch{commitBusy=false;notify('Не удалось зафиксировать команду.');}
}
function tryReveal(){
 if(screen!=='online'||state?.phase!=='reveal'||!connected)return;
 const s=side();if(s<0||state.moves[s]||state.hashes[s]==='auto'||revealSent===state.beat)return;
 if(!pending||pending.beat!==state.beat){try{pending=JSON.parse(storage.getItem('pending')||'null')}catch{pending=null}}
 if(!pending||pending.beat!==state.beat)return;
 if(send({type:'reveal',beat:pending.beat,action:pending.action,nonce:pending.nonce}))revealSent=state.beat;
}
async function copy(value){try{await navigator.clipboard.writeText(value)}catch{const t=document.createElement('textarea');t.value=value;t.style.cssText='position:fixed;opacity:0';document.body.append(t);t.select();document.execCommand('copy');t.remove();}notify('Скопировано.');tone();}
ui.addEventListener('input',e=>{if(e.target?.id==='codeInput')typedCode=e.target.value=e.target.value.toUpperCase().replace(/\s/g,'');});
ui.addEventListener('click',e=>{
 const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;
 const action=btn.dataset.action;
 if(action==='help'){modal='help';render();return;}
 if(action==='close'){modal='';render();return;}
 if(action==='sound'){sound=!sound;localStorage.setItem(SAVE+'sound',sound?'on':'off');render();return;}
 if(action==='practice'){modal='';beginPractice();return;}
 if(action==='resume'){establish('resume');return;}
 if(action==='create'){modal='name';render();return;}
 if(action==='join-menu'){modal='join';render();return;}
 if(action==='confirm-create'||action==='join'){establish(action==='join'?'join':'create');return;}
 if(action==='cancel-connect'){closeNetwork(false);render();return;}
 if(action==='copy-code'){copy(code);return;}
 if(action==='copy-link'){copy(new URL(location.pathname+'?room='+code,location.origin).href);return;}
 if(action==='start'||action==='again'){send({type:action});tone();return;}
 if(action==='commit'){commit();return;}
 if(action==='restart'){beginPractice();return;}
 if(action==='exit'||action==='leave'){modal='exit';render();return;}
 if(action==='leave-confirm'){closeNetwork(true);render();return;}
});
ui.addEventListener('pointerdown',e=>{
 const pad=e.target.closest('[data-pad]');if(!pad||drag||!state||state.phase!=='plan')return;
 if(screen==='online'&&(!connected||state.hashes[side()]))return;
 drag={id:e.pointerId,type:pad.dataset.pad,pad};e.preventDefault();pad.setPointerCapture(e.pointerId);updatePad(e);
});
function updatePad(e){
 if(!drag||e.pointerId!==drag.id)return;
 const rect=drag.pad.getBoundingClientRect(),dx=(e.clientX-rect.left-rect.width/2)/(rect.width*.37),dy=(e.clientY-rect.top-rect.height/2)/(rect.height*.37);
 if(drag.type==='move'){let x=clamp(dx,-1,1),y=clamp(dy,-1,1),d=Math.hypot(x,y);if(d>1){x/=d;y/=d;}intent.mx=Math.round(x*100)/100;intent.my=Math.round(y*100)/100;}
 else intent.blade=Math.round(clamp(dx,-1,1)*100)/100;
 updateSticks();
}
ui.addEventListener('pointermove',updatePad);
function endPad(e){if(!drag||e.pointerId!==drag.id)return;try{drag.pad.releasePointerCapture(e.pointerId)}catch{}drag=null;}
ui.addEventListener('pointerup',endPad);ui.addEventListener('pointercancel',endPad);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal){modal='';render();}});
setInterval(()=>{
 if(screen==='online'&&connected&&state){
  if(['plan','reveal'].includes(state.phase))send({type:'pulse'});
  if(state.phase==='reveal')tryReveal();
  if(state.phase==='plan'&&!state.hashes[side()]&&!commitBusy&&state.deadline-Date.now()<1250)commit();
 }
},900);
setInterval(()=>{
 if(state?.phase==='plan'&&screen==='online'){
  const remain=Math.max(0,(state.deadline-Date.now())/1000);
  const el=$('phaseSmall');if(el)el.textContent='До фиксации: '+remain.toFixed(1)+' с';
 }
},120);
window.addEventListener('pagehide',()=>{pending&&storage.setItem('pending',JSON.stringify(pending));});


const dots=Array.from({length:220},(_,i)=>{const a=i*2.399963,rad=Math.sqrt((i+.8)/221)*R;return {x:CX+Math.cos(a)*rad,y:CY+Math.sin(a)*rad,k:(i%7+1)*.12};});
let lastWidth=0,lastHeight=0,dpr=1;
function fillCircle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function line(x,y,xx,yy,color,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function loop(x,y,rx,ry,color,width=1){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function water(time){
 // Fixed-size texture primitives, not full screen postprocessing or remote assets.
 const bg=ctx.createRadialGradient(CX,CY,12,CX,CY,R);
 bg.addColorStop(0,'#52645b');bg.addColorStop(.57,'#344940');bg.addColorStop(.91,'#233731');bg.addColorStop(1,'#152823');
 fillCircle(CX,CY,R,bg);
 ctx.save();ctx.beginPath();ctx.arc(CX,CY,R-3,0,Math.PI*2);ctx.clip();
 for(let k=-8;k<=8;k++){
  const x=CX+k*43+9,y=CY;
  line(x,CY-R,x,CY+R,'#93a3971c',1.5);
  line(CX-R,CY+k*43,CX+R,CY+k*43,'#aab9a31a',1.5);
 }
 for(let i=0;i<24;i++){
  const a=i*Math.PI/12;
  const x=CX+Math.cos(a)*(R-24),y=CY+Math.sin(a)*(R-24);
  const r=R-20;
  line(x,y,CX+Math.cos(a+.025)*(R-8),CY+Math.sin(a+.025)*(R-8),'#c5bf9b3e',1.2);
 }
 for(let i=0;i<dots.length;i++){
  const p=dots[i];fillCircle(p.x,p.y,p.k,'#d6e1cb'+(i%4===0?'40':'19'));
 }
 for(let i=0;i<9;i++){
  ctx.beginPath();
  const yy=46+i*41;
  ctx.moveTo(11,yy+Math.sin(time*.0003+i)*4);
  ctx.bezierCurveTo(110,yy+11,250,yy-8,349,yy+9);
  ctx.strokeStyle=i%2?'#dce3d00c':'#dce3d017';ctx.lineWidth=3;ctx.stroke();
 }
 const sheen=ctx.createLinearGradient(CX-100,CY-150,CX+90,CY+160);
 sheen.addColorStop(0,'#b1c6b712');sheen.addColorStop(.36,'#e3ead226');sheen.addColorStop(.5,'#ffffff00');sheen.addColorStop(1,'#dae5cd0d');
 fillCircle(CX,CY,R-7,sheen);
 ctx.restore();
}
function arenaArt(time){
 ctx.fillStyle='#0c1b1a';ctx.fillRect(-600,-600,1500,1500);
 for(let i=0;i<18;i++){
  const x=CX+Math.cos(i*2.399)*247,y=CY+Math.sin(i*2.399)*240;
  fillCircle(x,y,10+i%4*5,'#32423a18');
 }
 const shadow=ctx.createRadialGradient(CX,CY,137,CX,CY,R+25);
 shadow.addColorStop(0,'#03110d00');shadow.addColorStop(.62,'#030a0990');shadow.addColorStop(1,'#030a0900');
 fillCircle(CX,CY,R+25,shadow);
 fillCircle(CX,CY,R+8,'#172823');
 fillCircle(CX,CY,R+3,'#9eac9c');
 fillCircle(CX,CY,R+1,'#293e35');
 water(time);
 loop(CX,CY,R-5,R-5,'#cad4bd88',1.1);
 loop(CX,CY,R-14,R-14,'#87978881',1);
 loop(CX,CY,R-32,R-32,'#8c9d8c30',.8);
 loop(CX,CY,17,17,'#d1d0b649',1);
 const p=23;line(CX-p,CY,CX+p,CY,'#a1ad9944',.9);line(CX,CY-p,CX,CY+p,'#a1ad9944',.9);
 // Engraved equidistant cardinal markers establish orientation.
 for(let i=0;i<4;i++){
  const a=i*Math.PI/2,xx=CX+Math.cos(a)*(R-9),yy=CY+Math.sin(a)*(R-9);
  ctx.save();ctx.translate(xx,yy);ctx.rotate(a+Math.PI/2);
  ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(5,0);ctx.lineTo(0,5);ctx.lineTo(-5,0);ctx.closePath();
  ctx.fillStyle='#d5d0b77b';ctx.fill();ctx.restore();
 }
}
function ripple(x,y,t,kind='move'){
 const r=19+(t%1100)/1100*(kind==='impact'?49:24);
 const alpha=(1-(t%1100)/1100)*(kind==='impact'?.45:.16);
 loop(x,y,r,r*.75,'rgba(223,236,213,'+alpha+')',1.1);
}
function figure(f,op,index,time){
 const contrast=index===0,light=contrast?'#e6e4d6':'#bda994',trim=contrast?'#acc4b4':'#c3a68b';
 const facing=Math.atan2(op.y-f.y,op.x-f.x),theta=facing+Math.PI/2;
 ctx.save();ctx.translate(f.x,f.y);
 fillCircle(2,8,23,'#08131378');
 ripple(0,0,time+index*160);
 ctx.rotate(theta);
 // A deliberately short top-down silhouette: no full anatomical body rig.
 ctx.save();ctx.translate(0,Math.sin(time*.002+index)*.9);
 ctx.beginPath();ctx.moveTo(-14,-17);ctx.quadraticCurveTo(-23,0,-23,12);
 ctx.quadraticCurveTo(-13,29,0,24);ctx.quadraticCurveTo(15,29,23,11);
 ctx.quadraticCurveTo(22,-4,14,-17);ctx.closePath();
 ctx.fillStyle=contrast?'#273f3a':'#55443f';ctx.fill();
 ctx.strokeStyle=contrast?'#9bb4a5':'#ae8d78';ctx.lineWidth=1.5;ctx.stroke();
 ctx.beginPath();ctx.moveTo(-5,1);ctx.lineTo(-11,22);ctx.moveTo(6,2);ctx.lineTo(13,20);
 ctx.strokeStyle=contrast?'#8da8997d':'#aa8c797d';ctx.lineWidth=1.3;ctx.stroke();
 // Separate bevels on the shoulders are enough to show their facing.
 ctx.fillStyle=contrast?'#6d857b':'#917e6c';
 ctx.beginPath();ctx.moveTo(-14,-15);ctx.quadraticCurveTo(-21,-9,-17,-2);ctx.lineTo(-11,1);
 ctx.lineTo(-6,-13);ctx.fill();
 ctx.beginPath();ctx.moveTo(14,-15);ctx.quadraticCurveTo(21,-9,17,-2);ctx.lineTo(11,1);ctx.lineTo(6,-13);ctx.fill();
 ctx.beginPath();ctx.ellipse(0,-11,8.5,10,0,0,Math.PI*2);
 ctx.fillStyle=light;ctx.fill();ctx.strokeStyle='#2a3430';ctx.lineWidth=2;ctx.stroke();
 line(-4,-18,5,-18,'#87918b',.8);
 line(-4,-5,4,-5,'#8c9385',1);
 line(0,2,0,19,trim,1);
 ctx.restore();ctx.restore();
}
function sword(f,index){
 const p=bladeOf(f),dx=p.bx-p.ax,dy=p.by-p.ay,angle=Math.atan2(dy,dx);
 ctx.save();ctx.translate(p.ax,p.ay);ctx.rotate(angle);
 ctx.shadowColor='#050d0da8';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
 ctx.beginPath();ctx.moveTo(-7,-3.5);ctx.lineTo(50,-2.5);ctx.lineTo(72,0);
 ctx.lineTo(50,2.5);ctx.lineTo(-7,3.5);ctx.closePath();
 ctx.fillStyle=index===0?'#d2ded7':'#c5baa9';ctx.fill();
 ctx.strokeStyle='#182422';ctx.lineWidth=1.5;ctx.stroke();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 line(0,-1,64,-.5,'#f4f4e9',1);
 line(-5,-10,-5,10,index===0?'#c7c0a3':'#b69b82',4);
 fillCircle(-5,0,3.5,'#ebdebf');
 line(-21,0,-8,0,'#322f29',5);
 fillCircle(-22,0,3,'#b5a48c');
 ctx.restore();
}
function ghost(f,enemy,act){
 const x=clamp(f.x+act.mx*29,CX-R+17,CX+R-17),y=clamp(f.y+act.my*29,CY-R+17,CY+R-17);
 const direction=f.a+act.blade*1.32;
 ctx.save();ctx.setLineDash([4,5]);
 loop(x,y,16,16,'#dfebc280',1);
 line(f.x,f.y,x,y,'#d0ddc096',1.6);
 const fake={x,y,a:direction};
 const blade=bladeOf(fake);line(blade.ax,blade.ay,blade.bx,blade.by,'#e8e5d298',2);
 ctx.restore();
}
function draw(timestamp){
 const width=Math.max(1,window.innerWidth),height=Math.max(1,window.innerHeight);
 if(width!==lastWidth||height!==lastHeight){
  lastWidth=width;lastHeight=height;dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 }
 ctx.setTransform(dpr,0,0,dpr,0,0);
 const outside=ctx.createLinearGradient(0,0,width,height);
 outside.addColorStop(0,'#1b2b28');outside.addColorStop(.5,'#0c1a19');outside.addColorStop(1,'#182925');
 ctx.fillStyle=outside;ctx.fillRect(0,0,width,height);
 const scale=Math.min((width-16)/W,(height-255)/H,1.25);
 const zoom=Math.max(.48,scale);
 const anchorY=screen==='menu'?height*.43:height*.405;
 ctx.save();ctx.translate(width/2-CX*zoom,anchorY-CY*zoom);ctx.scale(zoom,zoom);
 arenaArt(timestamp);
 let fighters;
 if(state?.fighters)fighters=state.fighters.map(f=>({...f}));
 else fighters=startFighters().map(f=>({...f}));
 let frameIndex=-1;
 if(state?.last?.frames&&timestamp-animationStart<880){
  const frames=state.last.frames,progress=clamp((timestamp-animationStart)/810,0,1);
  const floatIndex=progress*(frames.length-1);
  frameIndex=Math.floor(floatIndex);
  const f0=frames[frameIndex],f1=frames[Math.min(frameIndex+1,frames.length-1)];
  fighters=f0.map((f,i)=>({x:f.x+(f1[i].x-f.x)*(floatIndex-frameIndex),
   y:f.y+(f1[i].y-f.y)*(floatIndex-frameIndex),
   a:f.a+(f1[i].a-f.a)*(floatIndex-frameIndex),spin:0}));
  for(let j=Math.max(0,frameIndex-4);j<frameIndex;j++){
   for(let i=0;i<2;i++){
    const p=bladeOf(frames[j][i]);
    ctx.globalAlpha=.035+(j-frameIndex+4)*.029;
    line(p.ax,p.ay,p.bx,p.by,i?'#d0b79b':'#b8e0cb',2);
   }
  }
  ctx.globalAlpha=1;
 }else if(!state){
  fighters[0].x=165+Math.sin(timestamp*.00053)*13;
  fighters[1].x=193+Math.sin(timestamp*.00065+1.4)*16;
  fighters[0].a=-Math.PI/2+.4+Math.sin(timestamp*.001)*.55;
  fighters[1].a=Math.PI/2+.2+Math.sin(timestamp*.0011+2)*.4;
 }
 for(let i=0;i<2;i++)figure(fighters[i],fighters[1-i],i,timestamp);
 for(let i=0;i<2;i++)sword(fighters[i],i);
 if(state?.last?.contact&&frameIndex>=0){
  const c=state.last.contact,t=clamp((timestamp-animationStart)/880,0,1);
  const alpha=Math.sin(t*Math.PI)*.6;
  fillCircle(c.x,c.y,12*(1-t)+2,'rgba(249,236,201,'+alpha+')');
  if(c.type==='bind')ripple(c.x,c.y,(t*900)%1100,'impact');
 }
 if(state?.phase==='plan'){
  const i=screen==='practice'?0:side();
  if(i>=0&&(screen==='practice'||!state.hashes?.[i]))ghost(state.fighters[i],state.fighters[1-i],intent);
 }
 ctx.restore();
 // Vignette anchored in viewport, no UI-impacting animation.
 const shade=ctx.createLinearGradient(0,0,0,height);
 shade.addColorStop(0,'#08141387');shade.addColorStop(.25,'#08141300');shade.addColorStop(.75,'#08141300');shade.addColorStop(1,'#05100ddc');
 ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
 requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
(async()=>{
 try{const meRes=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'});
 if(meRes.ok){const data=await meRes.json();if(data.user?.complete&&data.user?.nickname)alias=data.user.nickname;}
 }catch{}
 try{const res=await fetch(SERVER+'/health',{cache:'no-store'});if(res.ok){const data=await res.json();health=data.ok&&data.modules?.includes('kromka-duel');}}catch{health=false;}
 if(query.get('room')){
  let prior=null;try{prior=JSON.parse(storage.getItem('pocket-net:'+SERVER)||'null')}catch{}
  if(prior?.roomId?.slice(0,8)?.toUpperCase()===typedCode){establish('resume');return;}
  modal='join';render();
}
})();
render();
