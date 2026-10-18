import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {DIRECTIONS,STEPS,MAX_ROUNDS,initialMatch,validatePlan,simulateRound,aiPlan} from './engine.js';
installMobileRuntime();
const $=id=>document.getElementById(id),NET=location.origin+'/pocketnet',KEY='pocket-works:crossline-5x5:';
const read=(key,fallback='')=>{try{return localStorage.getItem(KEY+key)??fallback}catch{return fallback}};
const write=(key,val)=>{try{localStorage.setItem(KEY+key,String(val))}catch{}};
const scoped={getItem:k=>{try{return sessionStorage.getItem(KEY+k)}catch{return null}},setItem:(k,v)=>{try{sessionStorage.setItem(KEY+k,v)}catch{}},removeItem:k=>{try{sessionStorage.removeItem(KEY+k)}catch{}}};
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols={up:'↑',down:'↓',left:'←',right:'→',shield:'▣'};
let profile=null,sound=read('sound','on')==='on',difficulty=read('difficulty','normal');
let mode='menu',screen='menu',offline=null,server=null,net=null,me=null,roomId='',connected=false,busy=false;
let plan=[],attackMode=false,attackDirs=[],animating=false,animFrame=null,showingOutcome=false,toastTimer=0,gameToken=0,modalOpen=false;
let replayRound=0,replayIndex=0,replaySpeed=1,replayPaused=true,replayTimer=0,recording=false,audio=null;
const roomQuery=new URLSearchParams(location.search).get('room')?.trim()||'';
const latest=()=>mode==='online'?server:offline;
const game=()=>latest()?.match;
const side=()=>mode==='online'?server?.side:mode==='hotseat'?offline?.turn:'A';
const ready=()=>mode==='online'?server?.ready||{A:false,B:false}:{A:!!offline?.pending?.A,B:!!offline?.pending?.B};
const score=()=>mode==='online'?server?.score||{A:0,B:0}:offline?.score||{A:0,B:0};
const isPlanning=()=>latest()?.phase==='planning';
const locked=()=>animating||!isPlanning()||!!ready()[side()]||recording||modalOpen;
function soundFX(type='tap'){
 if(!sound)return;
 try{
  const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
  audio ||= new A();audio.resume?.();
  const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
  o.type=type==='win'?'sine':type==='hit'?'sawtooth':'triangle';
  const freq={tap:370,plan:440,hit:140,block:620,move:280,win:570,error:115}[type]||340;
  o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*(type==='win'?1.7:.74),t+.12);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.035,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.15);
  o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.16);
 }catch{}
}
function buzz(v=8){try{navigator.vibrate?.(v)}catch{}}
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function show(view){screen=view;for(const id of ['menu','lobby','play','replay'])$(id).classList.toggle('hidden',view!==id);if(view==='play')render();}
function modal(kicker,title,body,main,alt,third){
 modalOpen=true;const data=[['modalMain',main],['modalAlt',alt],['modalThird',third]];
 $('modalKicker').textContent=kicker;$('modalTitle').textContent=title;$('modalBody').textContent=body;
 data.forEach(([id,entry])=>{const b=$(id);b.classList.toggle('hidden',!entry);if(entry){b.textContent=entry.label;b.onclick=()=>{closeModal();entry.action?.();}}});
 $('modal').classList.remove('hidden');
}
function closeModal(){modalOpen=false;$('modal').classList.add('hidden');if(screen==='play')render();}
function confirmReturn(){modal('ПАУЗА','Дуэль на паузе','Выход из сетевой комнаты считается сдачей текущей партии.',{label:'Продолжить',action:()=>{}},
  {label:'Повтор раундов',action:openReplay},{label:'В меню',action:leaveToMenu});}
function showRules(){modal('ПРАВИЛА','Предугадай противника','Каждый раунд оба игрока скрытно выбирают 5 команд. Перемещения выполняются одновременно, затем срабатывают атаки и щиты. Атака один раз за раунд: отмечай соседние направления (и свою клетку). Щит один раз за раунд. Направление, выбранное для атаки, нельзя использовать для движения в этом плане, и наоборот. В 4-м раунде после первого шага внешний контур обрушится.',{label:'Понятно',action:()=>{}});}
function storeOffline(){if(offline)write('saved',JSON.stringify({mode,offline}));}
function resumeOffer(){
 let cached;try{cached=JSON.parse(read('saved','null'))}catch{}
 document.getElementById('resume')?.remove();
 if(!cached?.offline?.match||cached.offline.phase==='finished')return;
 const btn=document.createElement('button');btn.id='resume';btn.className='minor';btn.textContent='Продолжить незавершённую партию';
 btn.onclick=()=>{leaveNet(false);mode=cached.mode;offline=cached.offline;plan=[];attackMode=false;animating=false;show('play');render()};
 $('menu').querySelector('.menu-controls').append(btn);
}
function leaveNet(navigate=true){
 const active=net;net=null;
 if(active){try{if(connected&&active.roomId)active.leaveRoom()}catch{}active.close()}
 connected=false;busy=false;server=null;roomId='';me=null;
 if(navigate){mode='menu';show('menu');resumeOffer();}
}
function leaveToMenu(){
 gameToken++;clearTimeout(replayTimer);replayPaused=true;animating=false;attackMode=false;plan=[];
 if(mode==='online')leaveNet(false);else storeOffline();
 mode='menu';show('menu');resumeOffer();
}
function localStart(kind){
 leaveNet(false);gameToken++;clearTimeout(replayTimer);mode=kind;offline={phase:'planning',turn:'A',pending:{A:null,B:null},match:initialMatch(),score:{A:0,B:0}};
 plan=[];attackMode=false;animating=false;showingOutcome=false;show('play');storeOffline();soundFX('tap');
}
function handoff(){
 modal('ЛОКАЛЬНАЯ ДУЭЛЬ','Передай устройство','Игрок А закончил планирование. Теперь пять команд выбирает игрок Б. План соперника скрыт.',{label:'Игрок Б готов',action:()=>{
  offline.turn='B';plan=[];attackMode=false;show('play');render();storeOffline();
 }});
}
function submitLocal(){
 const g=offline.match,who=side(),err=validatePlan(plan);if(err){toast('План недопустим');soundFX('error');return;}
 offline.pending[who]=JSON.parse(JSON.stringify(plan));soundFX('plan');
 if(mode==='solo'){
  offline.pending.B=aiPlan(g,offline.pending.A,difficulty);
 }else if(!offline.pending.B){handoff();storeOffline();return;}
 const oldRound=g.round,record=simulateRound(g,offline.pending);
 offline.match=record.match;offline.phase=offline.match.outcome?'finished':'planning';
 offline.pending={A:null,B:null};offline.turn='A';
 if(offline.match.outcome&&offline.match.outcome!=='draw')offline.score[offline.match.outcome]++;
 plan=[];attackMode=false;storeOffline();animateRecord(record.record,oldRound);
}
function applyRemote(next,version='v1'){
 if(!next||!['lobby','planning','finished'].includes(next.phase))return;
 if(version!=='v1'){toast('Версия комнаты несовместима с этим приложением');leaveNet();return;}
 const previous=server,oldKey=previous?.match?.round+':'+previous?.match?.revision;
 server=next;
 if(next.phase==='lobby'){plan=[];attackMode=false;show('lobby');lobby();return;}
 if(screen==='lobby'||screen==='menu')show('play');
 const newKey=next.match?.round+':'+next.match?.revision;
 if(previous&&oldKey!==newKey&&next.match?.replays?.length>(previous.match?.replays?.length||0)){
  plan=[];attackMode=false;animateRecord(next.match.replays.at(-1));return;
 }
 if(!previous||previous.match?.round!==next.match?.round||previous.match?.revision!==next.match?.revision){
  plan=next.ownPlan?.length?JSON.parse(JSON.stringify(next.ownPlan)):[];
  attackMode=false;
 }else if(next.ownPlan?.length)plan=JSON.parse(JSON.stringify(next.ownPlan));
 render();
 if(next.phase==='finished'&&!showingOutcome&&!animating&&screen==='play')finish();
}
function wire(client){
 client.on('connected',e=>{if(net!==client)return;connected=true;me=e.player;busy=false;lobby();});
 client.on('room_joined',e=>{if(net!==client)return;roomId=e.roomId;busy=false;applyRemote(e.state,e.version);lobby();});
 client.on('game_event',e=>{if(net!==client)return;if(e.event?.type==='state')applyRemote(e.event.payload);else if(e.event?.type==='notice'){toast(String(e.event.payload));soundFX('error');}});
 client.on('presence',()=>{if(net===client){lobby();try{net.sendGame({type:'sync'})}catch{}}});
 client.on('disconnected',()=>{if(net===client){connected=false;toast('Переподключаемся…');lobby();render()}});
 client.on('room_closed',()=>{if(net===client){leaveToMenu();toast('Комната закрыта')}});
 client.on('error',e=>{if(net!==client)return;busy=false;const errors={room_not_found:'Комната не найдена',room_full:'В комнате уже два игрока',game_unavailable:'Правила ещё не опубликованы',match_in_progress:'Матч уже идёт',already_in_room:'Ты уже в комнате',room_version_unavailable:'Старая версия правил недоступна'};toast(errors[e.code]||e.code||'Ошибка PocketNet');lobby()});
}
async function connect(action,code=''){
 leaveNet(false);mode='online';busy=true;show('lobby');lobby();
 try{
  const name=profile?.complete?profile.nickname:read('nick','Игрок');
  const client=new PocketNet({serverUrl:NET,name,storage:scoped,identityKey:profile?.id||'guest'});net=client;wire(client);
  await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('PocketNet не отвечает')),16000))]);
  if(net!==client)return;
  // PocketNet.connect auto-restores a room for the current token. Don't create a
  // second lobby while an old session is being recovered.
  if(client.roomId){lobby();return;}
  if(action==='create')client.createRoom('crossline-5x5');
  if(action==='join'&&code)client.joinRoom(code);
  else if(action==='join'){$('code').value='';busy=false;lobby();}
 }catch(e){leaveNet();toast(e.message||'Нет соединения')}
}
function joinFromField(){
 if(!net||!connected){toast('Сначала подключись к PocketNet');return;}
 const code=$('code').value.replace(/\s+/g,'').trim();
 if(!/^[A-Fa-f0-9]{8}$|^[A-Fa-f0-9-]{36}$/.test(code)){toast('Введите 8 символов кода комнаты');return;}
 try{busy=true;net.joinRoom(code);lobby()}catch{busy=false;lobby();toast('Не удалось войти')}
}
function send(payload){
 if(!net||!connected){toast('Ожидаем восстановления сети');return false;}
 try{net.sendGame(payload);return true}catch{toast('Нет соединения');return false;}
}
async function copy(s){
 try{await navigator.clipboard.writeText(s);toast('Скопировано')}catch{
  const t=document.createElement('textarea');t.value=s;document.body.append(t);t.select();
  const ok=document.execCommand('copy');t.remove();toast(ok?'Скопировано':'Копирование недоступно');
 }
}
function lobby(){
 if(screen!=='lobby')return;
 $('lobbyTitle').textContent=busy?'Соединяемся…':roomId?'Комната готова':'Вход в комнату';
 $('lobbyDetail').textContent=busy?'Подключаемся к серверу.':roomId?'Ожидайте второго игрока и начинайте дуэль.':'Введи код друга либо вернись и создай свою комнату.';
 $('joinArea').classList.toggle('hidden',!!roomId||busy);$('roomArea').classList.toggle('hidden',!roomId);
 $('roomCode').textContent=roomId?roomId.slice(0,8).toUpperCase():'--------';
 $('roster').innerHTML=(server?.players||[]).map((p,i)=>'<span>'+esc(p.name)+' · '+(i?'Ⅱ':'Ⅰ')+'</span>').join('');
 $('startOnline').classList.toggle('hidden',!roomId||server?.phase!=='lobby'||server?.host!==me?.id);
 $('startOnline').disabled=!connected||server?.players?.length!==2;
}
const actionText=a=>typeof a==='object'?'⚔'+a.dirs.map(d=>symbols[d]).join(''):symbols[a]||'·';
function allowed(){
 const moved=new Set(plan.filter(a=>typeof a==='string'&&DIRECTIONS[a]));
 const attacks=plan.filter(a=>typeof a==='object'),shielded=plan.includes('shield');
 const used=new Set(attacks.flatMap(a=>a.dirs));
 return {moved,used,attacks:attacks.length>0,shielded};
}
function enqueue(action){
 if(locked()||plan.length>=STEPS)return;
 const candidate=[...plan,action],why=validatePlan([...candidate,...Array(STEPS-candidate.length).fill('up')]);
 // Explicit incremental validation avoids filler interacting with an attack's directions.
 const info=allowed();
 if(typeof action==='object'){
  if(info.attacks||!action.dirs.length||action.dirs.some(d=>info.moved.has(d))){soundFX('error');toast('Невозможно выбрать эти направления');return;}
 }else if(action==='shield'){if(info.shielded)return;}
 else if(info.used.has(action))return;
 plan.push(action);attackMode=false;attackDirs=[];soundFX('plan');buzz(6);render(); // candidate validated on confirmation.
}
function direction(d){
 if(locked()&&!attackMode)return;
 const info=allowed();
 if(attackMode){
  if(info.moved.has(d))return;
  attackDirs=attackDirs.includes(d)?attackDirs.filter(a=>a!==d):[...attackDirs,d];soundFX('tap');render();return;
 }
 enqueue(d);
}
function toggleAttack(){
 if(locked()&&!attackMode)return;
 if(attackMode){
  if(!attackDirs.length){toast('Выбери хотя бы одно направление');return;}
  enqueue({type:'attack',dirs:attackDirs.slice()});return;
 }
 if(allowed().attacks||plan.length>=STEPS)return;
 attackMode=true;attackDirs=[];render();soundFX('tap');
}
function undo(){
 if(locked()&&!attackMode)return;
 if(attackMode){attackMode=false;attackDirs=[];}
 else plan.pop();
 soundFX('tap');render();
}
function submit(){
 if(animating||recording||modalOpen)return;
 if(attackMode){toggleAttack();return;}
 if(!isPlanning()||ready()[side()])return;
 if(plan.length!==STEPS){toast('Нужны все пять команд');return;}
 const why=validatePlan(plan);if(why){toast('План противоречив: '+why);soundFX('error');return;}
 if(mode==='online'){
  if(send({type:'plan',actions:plan,round:server.match.round,revision:server.match.revision})){$('submit').disabled=true;$('submit').textContent='ОТПРАВЛЯЕМ…';}
 }else submitLocal();
}
function markerSet(actions,units,edges){
 const traces=new Map(),targets=new Set(),mine=side()||'A',start=units?.[mine];
 if(!start||!start.alive||!isPlanning()||animating)return {traces,targets};
 let x=start.x,y=start.y;let index=0;
 for(const a of plan){index++;
  if(typeof a==='string'&&DIRECTIONS[a]){x=Math.max(0,Math.min(4,x+DIRECTIONS[a][0]));y=Math.max(0,Math.min(4,y+DIRECTIONS[a][1]));traces.set(x+','+y,String(index));}
  else if(typeof a==='object'){targets.add(x+','+y);for(const d of a.dirs){const X=x+DIRECTIONS[d][0],Y=y+DIRECTIONS[d][1];if(X>=0&&X<5&&Y>=0&&Y<5)targets.add(X+','+Y);}}
 }
 return {traces,targets};
}
function drawBoard(host,units,edges,events=[],preview=false){
 const traces=preview?markerSet(null,units,edges):{traces:new Map(),targets:new Set()};
 const impacts=new Set(events.filter(e=>e.type==='hit'||e.type==='fall').map(e=>e.side));
 const blocked=new Set(events.filter(e=>e.type==='block').map(e=>e.side));
 let html='';
 for(let y=0;y<5;y++)for(let x=0;x<5;x++){
  const at=['A','B'].filter(k=>units[k]?.alive&&units[k].x===x&&units[k].y===y),coord=x+','+y,outer=x===0||y===0||x===4||y===4;
  const warned=(!edges&&game()?.round===4&&outer),lava=edges&&outer;
  const hit=at.some(k=>impacts.has(k)),block=at.some(k=>blocked.has(k));
  html+='<div class="cell '+(warned?'edge-warning ':'')+(lava?'lava ':'')+(traces.traces.has(coord)?'trace ':'')+(traces.targets.has(coord)?'target ':'')+(hit?'impact ':'')+(block?'block ':'')+'" role="gridcell" data-x="'+x+'" data-y="'+y+'" data-trace="'+(traces.traces.get(coord)||'')+'">';
  if(at.length)html+='<div class="piece '+(at.length===2?'both':at[0].toLowerCase())+'"><span>'+(at.length===2?'ⅠⅡ':at[0]==='A'?'Ⅰ':'Ⅱ')+'</span></div>';
  html+='</div>';
 }
 host.innerHTML=html;
}
function render(){
 if(screen!=='play')return;
 const state=latest(),match=state?.match;
 if(!match)return;
 const sidescore=score(),turn=side(),flags=ready(),finished=state.phase==='finished';
 const picture=animFrame||{units:match.units,edgesCollapsed:match.edgesCollapsed,events:[]};
 drawBoard($('board'),picture.units,picture.edgesCollapsed,picture.events,!animating);
 $('roundInfo').textContent='РАУНД '+Math.min(match.round,4)+' / '+MAX_ROUNDS;
 $('phaseInfo').textContent=animating?'ИСПОЛНЕНИЕ':finished?'ПАРТИЯ ОКОНЧЕНА':flags[turn]?'ПЛАН ПОДТВЕРЖДЁН':'ПЛАНИРОВАНИЕ';
 $('nameA').textContent=mode==='online'?(server.players.find(p=>p.id===server.seats[0])?.name||'ИГРОК А'):'ИГРОК А';
 $('nameB').textContent=mode==='online'?(server.players.find(p=>p.id===server.seats[1])?.name||'ИГРОК Б'):(mode==='solo'?'КОМПЬЮТЕР':'ИГРОК Б');
 $('winsA').textContent=sidescore.A;$('winsB').textContent=sidescore.B;
 $('fA').style.opacity=turn==='B'&&!finished?'.6':'1';$('fB').style.opacity=turn==='A'&&!finished?'.6':'1';
 $('planOwner').textContent=animating?'РАЗРЕШЕНИЕ ХОДА':finished?'БИТВА ЗАВЕРШЕНА':flags[turn]?'ПЛАН ОТПРАВЛЕН':turn==='A'?'КОМАНДЫ ИГРОКА А':'КОМАНДЫ ИГРОКА Б';
 $('planCount').textContent=String(plan.length)+' / '+STEPS;
 $('slots').innerHTML=Array.from({length:STEPS},(_,i)=>'<div class="slot '+(plan[i]?'filled ':'')+(i===plan.length?'current':'')+'" data-index="'+(i+1)+'" title="'+esc(plan[i]?actionText(plan[i]):'Ожидает команду')+'">'+(plan[i]?esc(actionText(plan[i])):'·')+'</div>').join('');
 const info=allowed(),disabled=locked(),attack=attackMode;
 document.querySelectorAll('[data-dir]').forEach(b=>{
  const d=b.dataset.dir; b.classList.toggle('chosen',attack&&attackDirs.includes(d));
  b.disabled=disabled?true:attack?info.moved.has(d):info.used.has(d)||plan.length>=STEPS;
 });
 $('attack').disabled=disabled||(!attack&&info.attacks);$('shield').disabled=disabled||attack||info.shielded||plan.length>=STEPS;
 $('attack').textContent=attack?'ДОБАВИТЬ':'АТАКА';$('undo').textContent=attack?'ОТМЕНА':'← Удалить';
 $('undo').disabled=disabled||(!attack&&!plan.length);
 $('submit').textContent=finished?'ИТОГ':animating?'ИСПОЛНЕНИЕ…':flags[turn]?'ЖДЁМ СОПЕРНИКА':plan.length===5?'ПОДТВЕРДИТЬ →':'ЗАПОЛНИ ПЛАН →';
 $('submit').disabled=disabled||plan.length!==STEPS;
 $('attackHint').classList.toggle('hidden',!attack);
 $('boardNote').textContent=animating?'Раунд исполняется одновременно':finished?'Повтор и реванш доступны после боя':flags[turn]?'Соперник '+(flags[turn==='A'?'B':'A']?'готов':'ещё планирует'):'Направления атаки и движения не должны пересекаться.';
 $('beat').classList.toggle('hidden',!animating);
 if(animFrame)$('beat').textContent='ШАГ '+animFrame.beat+' / '+STEPS;
}
function animateRecord(record){
 const ticket=++gameToken;
 animating=true;showingOutcome=false;const base=game(),frames=record.frames||[];
 if(screen==='replay'){animating=false;return;}
 show('play');let i=-1;
 const step=()=>{
  if(ticket!==gameToken)return;
  if(i<0){animFrame={units:record.begin,edgesCollapsed:record.round===4?false:record.round>4,events:[],beat:0};}
  else animFrame=frames[i];
  render();
  if(i>=frames.length-1){
   setTimeout(()=>{if(ticket!==gameToken)return;animating=false;animFrame=null;plan=[];render();if(latest()?.phase==='finished')finish();},560);
   return;
  }
  i++;const evt=frames[i]?.events||[];
  soundFX(evt.some(e=>e.type==='hit'||e.type==='fall')?'hit':evt.some(e=>e.type==='block')?'block':'move');
  setTimeout(step,580);
 };
 step();
}
function finish(){
 if(showingOutcome||screen!=='play')return;
 showingOutcome=true;
 const winner=game()?.outcome,name=winner==='draw'?'Ничья':winner==='A'?'Победа игрока А':'Победа игрока Б';
 soundFX('win');
 modal('ПАРТИЯ ОКОНЧЕНА',name,winner==='draw'?'Оба плана привели к равному исходу.':'Пять ходов решают больше, чем кажется.',
  {label:'Смотреть повтор',action:openReplay},
  {label:mode==='online'?(server?.host===me?.id?'Реванш':'Ждём хозяина'):'Реванш',action:rematch},
  {label:'В меню',action:leaveToMenu});
 $('modalAlt').disabled=mode==='online'&&server?.host!==me?.id;
}
function rematch(){
 showingOutcome=false;gameToken++;plan=[];attackMode=false;
 if(mode==='online'){send({type:'rematch'});render();}
 else if(offline){offline.match=initialMatch();offline.pending={A:null,B:null};offline.phase='planning';offline.turn='A';show('play');storeOffline();}
}
function openReplay(){
 if(!game()?.replays?.length){toast('Повтор появится после первого раунда');return;}
 gameToken++;animating=false;animFrame=null;show('replay');replayRound=game().replays.length-1;replayIndex=0;replayPaused=true;paintReplayOptions();paintReplay();soundFX('tap');
}
function paintReplayOptions(){
 $('replayRound').innerHTML=game().replays.map((r,i)=>'<option value="'+i+'">РАУНД '+r.round+'</option>').join('');
 $('replayRound').value=String(replayRound);
}
function currentRecord(){return game()?.replays?.[replayRound];}
function replayFrame(){
 const rec=currentRecord();if(!rec)return null;
 return replayIndex===0?{units:rec.begin,edgesCollapsed:rec.round===4?false:rec.round>4,events:[],beat:0}:rec.frames[Math.min(replayIndex-1,rec.frames.length-1)];
}
function paintReplay(){
 const rec=currentRecord();if(!rec)return;const frame=replayFrame();
 drawBoard($('replayBoard'),frame.units,frame.edgesCollapsed,frame.events);
 $('replaySeek').max=String(rec.frames.length);$('replaySeek').value=String(replayIndex);
 $('replayLabel').textContent=replayIndex===0?'ПЕРЕД ИСПОЛНЕНИЕМ':('ШАГ '+frame.beat+' / '+rec.frames.length+' · '+rec.frames[Math.max(0,replayIndex-1)].events.map(e=>e.type==='hit'?'ПОПАДАНИЕ':e.type==='block'?'БЛОК':e.type==='collapse'?'ОБРУШЕНИЕ':'').filter(Boolean).join(' '));
 $('replayPlay').textContent=replayPaused?'▶ Играть':'Ⅱ Пауза';
 $('replaySpeed').textContent=replaySpeed+'×';
}
function pauseReplay(){replayPaused=true;clearTimeout(replayTimer);paintReplay();}
function replayTick(){
 if(replayPaused||screen!=='replay')return;
 const rec=currentRecord();if(!rec)return;
 if(replayIndex>=rec.frames.length){pauseReplay();return;}
 replayIndex++;paintReplay();replayTimer=setTimeout(replayTick,700/replaySpeed);
}
function toggleReplay(){
 if(!currentRecord())return;
 if(!replayPaused){pauseReplay();return;}
 if(replayIndex>=currentRecord().frames.length)replayIndex=0;
 replayPaused=false;replayTick();
}
function download(data,filename,mime){
 const url=URL.createObjectURL(new Blob([data],{type:mime})),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportReplay(){const g=game();if(!g?.replays?.length)return;download(JSON.stringify({format:'crossline-5x5',version:1,match:g},null,2),'crossline-'+Date.now()+'.json','application/json');toast('Повтор сохранён')}
async function videoReplay(){
 if(recording)return;
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('Этот браузер не поддерживает WebM');return;}
 const rec=currentRecord();if(!rec)return;
 const button=$('replayVideo');recording=true;button.disabled=true;button.textContent='ЗАПИСЬ…';pauseReplay();
 let recorder,stream;
 try{
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=840;
  const ctx=canvas.getContext('2d'),clips=[];
  stream=canvas.captureStream(30);
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)throw Error('Кодек WebM недоступен');
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
  const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)clips.push(e.data)};recorder.onstop=resolve;recorder.onerror=reject});
  recorder.start(100);for(let i=0;i<=rec.frames.length;i++){
   const frame=i?rec.frames[i-1]:{units:rec.begin,edgesCollapsed:false,events:[]};
   drawVideoFrame(ctx,frame,rec.round,i,canvas.width);
   await new Promise(resolve=>setTimeout(resolve,750));
  }
  recorder.stop();await finished;
  download(new Blob(clips,{type:mime}),'crossline-round-'+rec.round+'.webm',mime);
  toast('Видеоповтор сохранён');
 }catch(e){toast(e.message||'Ошибка записи')}finally{
  try{if(recorder?.state==='recording')recorder.stop()}catch{}
  stream?.getTracks().forEach(t=>t.stop());recording=false;button.disabled=false;button.textContent='● WebM';
 }
}
function drawVideoFrame(ctx,frame,round,i,size){
 ctx.fillStyle='#151e22';ctx.fillRect(0,0,size,840);
 ctx.fillStyle='#f4b35f';ctx.font='bold 34px system-ui';ctx.fillText('КРОССЛАЙН / РАУНД '+round,45,55);
 const start=50,cell=140;ctx.lineWidth=2;
 for(let y=0;y<5;y++)for(let x=0;x<5;x++){
  const outer=x===0||x===4||y===0||y===4,collapsed=frame.edgesCollapsed&&outer;
  ctx.fillStyle=collapsed?'#7d4d3b':'#354448';ctx.fillRect(start+x*cell,start+65+y*cell,cell-3,cell-3);
  for(const [s,color,letter] of [['A','#f4b35f','Ⅰ'],['B','#8cc4d4','Ⅱ']]){
   const u=frame.units[s];if(!u?.alive||u.x!==x||u.y!==y)continue;
   ctx.beginPath();ctx.fillStyle=color;ctx.arc(start+x*cell+cell/2,start+65+y*cell+cell/2,s==='B'?33:29,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#253137';ctx.font='bold 36px system-ui';ctx.fillText(letter,start+x*cell+cell/2-12,start+65+y*cell+cell/2+13);
  }
 }
 ctx.font='bold 22px system-ui';ctx.fillStyle='#d2ddda';ctx.fillText('ШАГ '+i+' / '+STEPS,45,810);
}
$('solo').onclick=()=>localStart('solo');$('hotseat').onclick=()=>localStart('hotseat');
$('online').onclick=()=>connect('create');$('openRules').onclick=showRules;
$('difficulty').value=difficulty;$('difficulty').onchange=()=>{difficulty=$('difficulty').value;write('difficulty',difficulty)};
$('sound').onclick=()=>{sound=!sound;write('sound',sound?'on':'off');$('sound').textContent=sound?'♪':'♪̸';soundFX('tap')};$('sound').textContent=sound?'♪':'♪̸';
$('pause').onclick=confirmReturn;
$('lobbyBack').onclick=leaveToMenu;$('enter').onclick=joinFromField;
$('startOnline').onclick=()=>send({type:'start'});
$('roomCode').onclick=()=>copy(roomId.slice(0,8).toUpperCase());$('copyLink').onclick=()=>copy(location.origin+location.pathname+'?room='+encodeURIComponent(roomId.slice(0,8)));
$('attack').onclick=toggleAttack;$('shield').onclick=()=>enqueue('shield');
document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>direction(b.dataset.dir));
$('undo').onclick=undo;$('submit').onclick=submit;
$('replayBack').onclick=()=>{pauseReplay();show('play');if(latest()?.phase==='finished'){showingOutcome=false;finish();}};
$('replayRound').onchange=()=>{replayRound=Number($('replayRound').value);replayIndex=0;pauseReplay();paintReplay()};
$('replaySeek').oninput=()=>{replayIndex=Number($('replaySeek').value);pauseReplay();paintReplay()};
$('replayPlay').onclick=toggleReplay;$('replaySpeed').onclick=()=>{const list=[1,2,3,5];replaySpeed=list[(list.indexOf(replaySpeed)+1)%list.length];paintReplay()};
$('replaySave').onclick=exportReplay;$('replayVideo').onclick=videoReplay;
window.addEventListener('keydown',e=>{
 if(/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName||''))return;
 if(e.key==='Escape'){if(modalOpen)closeModal();else if(screen==='replay')$('replayBack').click();else if(screen==='play')confirmReturn();return;}
 if(screen!=='play'||modalOpen)return;
 const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
 if(map[e.key]){direction(map[e.key]);e.preventDefault()}
 else if(e.key.toLowerCase()==='a'){toggleAttack();e.preventDefault()}
 else if(e.key.toLowerCase()==='s'){enqueue('shield');e.preventDefault()}
 else if(e.key==='Backspace'){undo();e.preventDefault()}
 else if(e.key==='Enter'){submit();e.preventDefault()}
});
async function checkNet(){
 try{const r=await fetch(NET+'/health',{cache:'no-store',signal:AbortSignal.timeout(6000)}),j=await r.json();$('netStatus').textContent=r.ok&&j.modules?.includes('crossline-5x5')?'POCKETNET · ДОСТУПЕН':'POCKETNET · ОЖИДАЕТ ПУБЛИКАЦИИ'}catch{$('netStatus').textContent='POCKETNET · СЕЙЧАС НЕ В СЕТИ'}
}
getPocketIdentity().then(p=>{profile=p}).catch(()=>{});
checkNet();resumeOffer();
if(roomQuery){connect('join',roomQuery);$('code').value=roomQuery}
