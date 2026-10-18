import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createGame,shortestPath,routeVehicle,stopVehicle,autoRoute,botPlan,advanceGame,winner} from './engine.js';
import {renderCity,pointerNode,pointerCar} from './art.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
const storagePrefix='pocket-works:trafficity:';
const store={
 getItem(k){try{return localStorage.getItem(storagePrefix+k);}catch{return null;}},
 setItem(k,v){try{localStorage.setItem(storagePrefix+k,String(v));}catch{}},
 removeItem(k){try{localStorage.removeItem(storagePrefix+k);}catch{}}
};
const SERVER=location.origin+'/pocketnet';
const preview=createGame(73522);
let mode='menu',local=null,net=null,connected=false,me=null,roomId='',remote=null,selected=0;
let name=store.getItem('name')||'Игрок',sound=store.getItem('sound')!=='off';
let dialogKind='',pending='',intentCode='',connectingId=0,showNodes=false,stopMode=false,view=null;
let drag=null,lastSnapshot=null,animation=null,raf=0,toastTimer=0,audio=null,confirmExit=false;
const codeFromUrl=(new URLSearchParams(location.search).get('room')||'').toUpperCase().trim();
const safeNumber=(value,defaultValue)=>Number.isFinite(value)?value:defaultValue;
const phase=()=>mode==='menu'?'menu':mode==='connecting'?'connecting':mode==='practice'?(local?.phase==='finished'?'finished':'playing'):remote?.phase||'connecting';
const game=()=>mode==='practice'?local:mode==='online'?remote?.game:preview;
const mySide=()=>mode==='online'?(remote?.players?.findIndex(p=>p.id===me?.id)??0):0;
const myCars=()=>[mySide()*2,mySide()*2+1];
function say(message){
 $('toast').textContent=message;$('toast').classList.add('show');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);
}
function clickSound(kind='tap'){
 if(!sound)return;
 try{
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
  audio ||=new Context();if(audio.state==='suspended')audio.resume();
  const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
  o.type='triangle';o.frequency.setValueAtTime(kind==='delivery'?740:kind==='turn'?310:480,t);
  o.frequency.exponentialRampToValueAtTime(kind==='delivery'?520:250,t+.11);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.045,t+.007);
  g.gain.exponentialRampToValueAtTime(.0001,t+.115);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.13);
 }catch{}
}
function save(){
 if(mode!=='practice'||!local)return;
 try{store.setItem('save',JSON.stringify(local));}catch{say('Недостаточно памяти для сохранения');}
}
function savedPractice(){
 try{
  const s=JSON.parse(store.getItem('save')||'null');
  if(!s||s.phase!=='playing'||!s.map?.nodes||s.vehicles?.length!==4)return null;
  if(s.turn<0||s.turn>=30||s.map.nodes.length!==35)return null;
  return s;
 }catch{return null;}
}
function readRoom(){
 try{return JSON.parse(store.getItem('pocket-net:'+SERVER)||'null')?.roomId||'';}catch{return '';}
}
function updateFrame(next){
 const positions=next?.vehicles?.map(v=>v.at)||null;
 if(positions&&lastSnapshot&&next.seed===lastSnapshot.seed&&next.turn!==lastSnapshot.turn){
  const old=lastSnapshot.positions,changed=positions.some((p,i)=>old[i]!==p);
  if(changed&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   animation={start:performance.now(),old:old.map(node=>({node})),progress:0};
   clickSound(next.last?.length?'delivery':'turn');
  }
 }
 lastSnapshot=next?{seed:next.seed,turn:next.turn,positions}:null;
}
function draw(){
 const g=game();if(!g)return;
 const anim=animation?Object.assign({},Object.fromEntries(animation.old.map((p,i)=>[i,p])),{progress:animation.progress}):null;
 view=renderCity($('cityCanvas'),g,{selected,preview:drag?.draft||null,showNodes,interpolation:anim});
}
function animate(time){
 raf=0;if(!animation)return;
 animation.progress=Math.min(1,(time-animation.start)/260);
 draw();
 if(animation.progress<1)raf=requestAnimationFrame(animate);
 else animation=null;
}
function scheduleDraw(){
 if(raf)cancelAnimationFrame(raf);
 draw();
 if(animation)raf=requestAnimationFrame(animate);
}
function showOverlay(id,visible){$(id).hidden=!visible;}
function render(){
 const g=game(),p=phase(),live=p==='playing';
 if(g)updateFrame(g);
 showOverlay('menu',p==='menu');showOverlay('lobby',p==='lobby');showOverlay('finish',p==='finished');
 showOverlay('connect',p==='connecting');$('dispatch').hidden=!live;
 $('pause').hidden=!(live||p==='lobby');$('resume').hidden=!savedPractice()||p!=='menu';
 $('turn').textContent=String(g?.turn||0).padStart(2,'0');
 $('leftScore').textContent=g?.scores?.[0]||0;$('rightScore').textContent=g?.scores?.[1]||0;
 $('leftName').textContent=mode==='online'?remote?.players?.[0]?.name||'ИГРОК 1':'ТЫ';
 $('rightName').textContent=mode==='online'?remote?.players?.[1]?.name||'ИГРОК 2':'ИИ';
 $('mapNumber').textContent='№ '+String((g?.seed||0)%1000).padStart(3,'0');
 if(p==='lobby'){
  $('roomCode').textContent=(roomId||'').slice(0,8).toUpperCase();
  $('seat0').textContent=remote?.players?.[0]?.name||'Хозяин';
  $('seat1').textContent=remote?.players?.[1]?.name||'Ожидаем второго игрока…';
  const canStart=remote?.host===me?.id&&remote?.players?.length===2&&connected;
  $('start').disabled=!canStart;
  $('start').textContent=canStart?'НАЧАТЬ МАТЧ →':remote?.host!==me?.id?'ЖДЁМ ХОЗЯИНА':'ЖДЁМ ИГРОКА';
 }
 if(g){
  const ids=myCars();
  if(!ids.includes(selected))selected=ids[0];
  const vehicle=g.vehicles[selected];
  const spot=g.map.spots.find(x=>x.node===vehicle?.goal);
  $('panelLabel').textContent=mode==='online'?'ВАШИ ДОСТАВКИ':'ВАШ АВТОПАРК';
  for(let i=0;i<2;i++){
   const v=g.vehicles[ids[i]],s=g.map.spots.find(x=>x.node===v?.goal),button=$('dispatch').querySelector('[data-vehicle="'+i+'"]');
   button.classList.toggle('active',v.id===selected);
   $('goal'+i).textContent=s?.name||'Пункт назначения';
   $('distance'+i).textContent=shortestPath(g.map,v.at,v.goal).length-1+' ул.';
  }
  const ready=mode==='online'&&remote?.ready?.[mySide()];
  const blocked=mode==='online'&&(!connected||ready);
  $('auto').disabled=blocked;$('undo').disabled=blocked||!vehicle.route.length;
  $('clearRoute').disabled=blocked||!vehicle.route.length;
  $('stopMode').disabled=blocked;
  $('next').disabled=mode==='online'&&!connected;
  $('next').innerHTML=mode==='online'?(ready?'ОТМЕНИТЬ ГОТОВНОСТЬ <span>↶</span>':'ГОТОВ К ХОДУ <span>✓</span>'):'СЛЕДУЮЩИЙ ХОД <span>→</span>';
  const steps=vehicle.route.length;
  const label=ready?'Ожидаем второго диспетчера':mode==='online'&&!connected?'Восстанавливаем соединение':stopMode?'Нажми на узел маршрута — здесь машина сделает остановку':steps?'Маршрут: '+steps+' участк. · можно перепланировать':'Нажми на перекрёсток или проведи путь пальцем';
  $('status').textContent=label;
  $('hint').textContent=label;
  $('stopMode').classList.toggle('chosen',stopMode);
 }
 if(p==='finished'&&g){
  const my=mySide(),w=winner(g);
  $('finishTitle').textContent=w<0?'Ничья.':w===my?'Победа.':'Поражение.';
  $('finishScore').textContent=g.scores[0]+' : '+g.scores[1];
  $('finishDetail').textContent=g.deliveries[0]+' доставок · '+g.deliveries[1]+' доставок';
  $('again').disabled=mode==='online'&&(remote?.host!==me?.id||!connected);
  $('again').textContent=mode==='online'?'РЕВАНШ →':'НОВЫЙ ГОРОД →';
 }
 scheduleDraw();
 window.__AI_TEST_STATE__={mode,phase:p,turn:g?.turn,seed:g?.seed,scores:g?.scores,delivered:g?.deliveries,selected,
  cars:g?.vehicles?.map(v=>({at:v.at,goal:v.goal,route:v.route.slice(),stop:v.stop})),
  connected,room:roomId?.slice(0,8)||'',ready:remote?.ready||null,cityReady:!!view};
}
function selectCar(id){
 if(!myCars().includes(id))return false;
 selected=id;stopMode=false;drag=null;clickSound();render();return true;
}
function send(payload){
 if(!connected||!net||mode!=='online')return false;
 try{net.sendGame(payload);return true;}catch{say('Нет соединения с PocketNet');return false;}
}
function commitRoute(path){
 const g=game();
 if(!g||phase()!=='playing')return;
 const id=selected,side=mySide();
 if(mode==='online'){
  if(remote?.ready?.[side]){say('Сначала отмените готовность');return;}
  if(!Array.isArray(path)||path.length>34)return;
  let cur=g.vehicles[id].at;
  for(const n of path){if(!g.map.graph[cur]?.includes(n)){say('Маршрут прерывается');return;}cur=n;}
  send({type:'route',vehicle:id,route:path});
 }else if(!routeVehicle(g,side,id,path)){say('Маршрут невозможен');return;}
 else{save();clickSound();}
 render();
}
function applyStop(node){
 const g=game(),count=Number($('stopCount').value)||1;
 if(!g||!g.vehicles[selected])return;
 const v=g.vehicles[selected];
 if(node!==v.at&&!v.route.includes(node)){say('Остановка ставится только на маршруте');return;}
 if(mode==='online'){
  if(remote?.ready?.[mySide()]){say('Сначала отмените готовность');return;}
  send({type:'stop',vehicle:selected,node,amount:count});
 }else if(stopVehicle(g,mySide(),selected,node,count)){save();clickSound();}
 stopMode=false;render();
}
function screenPoint(e){
 const box=$('cityCanvas').getBoundingClientRect();
 return {x:e.clientX-box.left,y:e.clientY-box.top};
}
function mapTap(pt,car){
 if(phase()!=='playing')return;
 const g=game();
 if(mode==='online'&&remote?.ready?.[mySide()]){say('Ожидаем соперника');return;}
 if(car!==null){selectCar(car);return;}
 const n=pointerNode(pt,view,g.map);
 if(n===null)return;
 if(stopMode){applyStop(n);return;}
 const v=g.vehicles[selected],path=shortestPath(g.map,v.at,n).slice(1);
 if(n===v.at){commitRoute([]);return;}
 if(!path.length){say('Здесь нет дороги');return;}
 commitRoute(path);
}
const canvas=$('cityCanvas');
canvas.addEventListener('pointerdown',e=>{
 if(phase()!=='playing'||e.button!==0)return;
 e.preventDefault();
 const pt=screenPoint(e),g=game(),car=pointerCar(pt,view,g,mySide());
 if(car!==null&&selected!==car)selectCar(car);
 drag={pointer:e.pointerId,origin:pt,car,node:pointerNode(pt,view,g.map),draft:[],moved:false};
 try{canvas.setPointerCapture(e.pointerId);}catch{}
});
canvas.addEventListener('pointermove',e=>{
 if(!drag||drag.pointer!==e.pointerId||phase()!=='playing'||stopMode)return;
 const pt=screenPoint(e),g=game();
 if(Math.hypot(pt.x-drag.origin.x,pt.y-drag.origin.y)>8)drag.moved=true;
 if(!drag.moved)return;
 const n=pointerNode(pt,view,g.map,56);if(n===null)return;
 const v=g.vehicles[selected],from=drag.draft.at(-1)??v.at;
 if(n===from)return;
 if(drag.draft.length>0&&drag.draft.at(-2)===n){drag.draft.pop();draw();return;}
 if(g.map.graph[from]?.includes(n)&&!drag.draft.includes(n)){drag.draft.push(n);draw();}
});
canvas.addEventListener('pointerup',e=>{
 if(!drag||drag.pointer!==e.pointerId)return;
 const d=drag;drag=null;
 try{canvas.releasePointerCapture(e.pointerId);}catch{}
 const pt=screenPoint(e);
 if(d.moved&&d.draft.length)commitRoute(d.draft);
 else if(!d.moved)mapTap(pt,d.car);
 else render();
});
function cancelDrag(){if(drag){drag=null;draw();}}
canvas.addEventListener('pointercancel',cancelDrag);canvas.addEventListener('lostpointercapture',cancelDrag);
function startPractice(resume=false){
 closeNet();
 local=resume?savedPractice():null;
 if(!local)local=createGame((Date.now()>>>0)^0x435643);
 botPlan(local);selected=0;mode='practice';lastSnapshot=null;animation=null;
 save();clickSound('turn');render();
}
function menu(){
 closeNet();local=null;remote=null;mode='menu';roomId='';lastSnapshot=null;animation=null;
 stopMode=false;drag=null;history.replaceState(null,'',location.pathname);
 render();
}
function closeNet(leave=true){
 connectingId++;
 if(net){if(leave&&net.roomId)try{net.leaveRoom();}catch{}net.close();}
 net=null;connected=false;me=null;remote=null;roomId='';
 if(leave)store.removeItem('pocket-net:'+SERVER);
}
function onlineDialog(kind){
 dialogKind=kind;$('dialogTitle').textContent=kind==='create'?'Новая комната.':'Войти по коду.';
 $('nickname').value=name;$('inviteLabel').hidden=kind!=='join';
 $('invite').hidden=kind!=='join';$('invite').value=codeFromUrl||'';
 $('dialogText').textContent='Оба игрока строят маршруты. Ход выполняется, когда оба нажали «Готов».';
 showOverlay('dialog',true);
}
function closeDialog(){showOverlay('dialog',false);}
async function connect(kind,code=''){
 closeNet(false);
 if(kind!=='resume')store.removeItem('pocket-net:'+SERVER);
 const generation=connectingId;
 mode='connecting';remote=null;roomId='';lastSnapshot=null;intentCode=code;pending=kind;render();
 net=new PocketNet({serverUrl:SERVER,name,storage:store});
 const current=net;
 const active=()=>generation===connectingId&&current===net;
 current.on('connected',info=>{
  if(!active())return;connected=true;me=info?.player||me;
  if(pending==='create'){pending='';current.createRoom('trafficity');}
  else if(pending==='join'){pending='';current.joinRoom(intentCode);}
  else if(pending==='resume'){pending='';if(!current.roomId){menu();say('Комната не найдена');}}
  render();
 });
 current.on('room_joined',info=>{
  if(!active())return;
  if(info.gameId!=='trafficity'){menu();say('Это комната другой игры');return;}
  roomId=info.roomId;remote=info.state;connected=true;mode='online';selected=mySide()*2;lastSnapshot=null;
  history.replaceState(null,'',location.pathname+'?room='+roomId.slice(0,8));
  render();
 });
 current.on('game_event',message=>{
  if(!active()||message.roomId!==roomId)return;
  if(message.event?.type==='notice'){say(String(message.event.payload||'Ошибка'));return;}
  const next=message.event?.payload;
  if(message.event?.type==='state'&&next&&(!remote||next.revision>=remote.revision)){
   remote=next;const g=next.game;
   if(g?.last?.length&&lastSnapshot?.turn!==g.turn)clickSound('delivery');
   render();
  }
 });
 current.on('presence',message=>{
  if(!active()||message.roomId!==roomId)return;
  if(remote&&Array.isArray(message.players)){remote.players=message.players;render();}
  if(message.disconnected&&message.disconnected!==me?.id)say('Соперник отключился');
 });
 current.on('disconnected',()=>{if(!active())return;connected=false;render();say('Переподключаемся к PocketNet');});
 current.on('room_closed',()=>{if(!active())return;menu();say('Комната закрыта');});
 current.on('room_kicked',()=>{if(!active())return;menu();say('Комната недоступна');});
 current.on('error',error=>{if(!active())return;say('PocketNet: '+(error?.code||error?.message||'ошибка'));});
 try{await current.connect();}catch(error){if(active()){menu();say('Не удалось подключиться: '+error.message);}}
}
function turn(){
 const g=game();if(!g||phase()!=='playing')return;
 if(mode==='practice'){botPlan(g);advanceGame(g);botPlan(g);save();clickSound('turn');render();return;}
 send({type:'ready',ready:!remote?.ready?.[mySide()]});
}
function copyCode(){
 const code=(roomId||'').slice(0,8).toUpperCase();
 if(!code)return;
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(code).then(()=>say('Код скопирован')).catch(()=>say('Код: '+code));
 else say('Код: '+code);
}
$('solo').addEventListener('click',()=>startPractice());
$('resume').addEventListener('click',()=>startPractice(true));
$('host').addEventListener('click',()=>onlineDialog('create'));
$('join').addEventListener('click',()=>onlineDialog('join'));
$('dialogCancel').addEventListener('click',closeDialog);
$('dialogOk').addEventListener('click',()=>{
 const newName=$('nickname').value.trim().replace(/\s+/g,' ').slice(0,22);
 if(!newName){say('Введите имя');return;}
 const code=$('invite').value.trim().toUpperCase();
 if(dialogKind==='join'&&!/^[0-9A-F]{8}$|^[0-9a-f-]{36}$/i.test(code)){say('Код из 8 символов');return;}
 name=newName;store.setItem('name',name);closeDialog();void connect(dialogKind,code);
});
$('start').addEventListener('click',()=>send({type:'start'}));
$('copy').addEventListener('click',copyCode);$('roomCode').addEventListener('click',copyCode);
$('leaveLobby').addEventListener('click',menu);
document.querySelectorAll('[data-vehicle]').forEach(button=>button.addEventListener('click',()=>selectCar(mySide()*2+Number(button.dataset.vehicle))));
$('auto').addEventListener('click',()=>{
 if(mode==='online')send({type:'auto',vehicle:selected});
 else{autoRoute(game(),mySide(),selected);save();clickSound();render();}
});
$('undo').addEventListener('click',()=>commitRoute(game().vehicles[selected].route.slice(0,-1)));
$('clearRoute').addEventListener('click',()=>commitRoute([]));
$('stopMode').addEventListener('click',()=>{stopMode=!stopMode;clickSound();render();});
$('stopCount').addEventListener('input',()=>{$('stopValue').textContent=$('stopCount').value;});
$('next').addEventListener('click',turn);
$('pause').addEventListener('click',()=>{confirmExit=false;$('exitConfirm').hidden=true;showOverlay('pauseOverlay',true);});
$('continue').addEventListener('click',()=>showOverlay('pauseOverlay',false));
$('exitGame').addEventListener('click',()=>{confirmExit=true;$('exitConfirm').hidden=false;$('pauseText').textContent=mode==='online'?'Вы покинете сетевой матч.':'Сохранённую одиночную партию можно продолжить позже.';});
$('exitConfirm').addEventListener('click',()=>{showOverlay('pauseOverlay',false);menu();});
$('again').addEventListener('click',()=>{
 if(mode==='online')send({type:'again'});
 else startPractice();
});
$('finishMenu').addEventListener('click',menu);
$('cancelConnect').addEventListener('click',menu);
$('sound').addEventListener('click',()=>{sound=!sound;store.setItem('sound',sound?'on':'off');$('sound').textContent=sound?'♪':'×';if(sound)clickSound();});
$('sound').textContent=sound?'♪':'×';
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){
  if(!$('dialog').hidden){closeDialog();return;}
  if(!$('pauseOverlay').hidden){showOverlay('pauseOverlay',false);return;}
  if(phase()==='playing'){$('pause').click();return;}
 }
 if(phase()!=='playing'||document.activeElement?.tagName==='INPUT')return;
 if(['1','2'].includes(e.key))selectCar(mySide()*2+Number(e.key)-1);
 if(e.key==='Enter'&&!e.repeat){e.preventDefault();turn();}
 if(e.key.toLowerCase()==='a'&&!e.repeat){$('auto').click();}
 if(e.key==='Backspace'&&!e.repeat){e.preventDefault();$('undo').click();}
});
new ResizeObserver(()=>draw()).observe($('cityCanvas'));
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)draw();else save();});
if(codeFromUrl)onlineDialog('join');
render();
