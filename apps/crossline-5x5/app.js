import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {DEV_QUERY,DEV_SCENES,devScene,mountArenaDevGallery,isDevKey} from './dev-gallery.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {DIRECTIONS,STEPS,MAX_ROUNDS,initialMatch,validatePlan,simulateRound,aiPlan} from './engine.js';
import {paintArena,playArenaBeat,frameBefore,drawArenaCanvas,timing} from './combat-visuals.js';
import {trySetCommand,trySwapCommand,removeCommand,controlsFor,previewOrders,paintPlanOverlay,describeIssue} from './planning.js';
import {HISTORY_KEY,getHistory,saveHistory,deleteHistory,captureHistory,commandLabel,outcomeText,analyzeBeat,exportMatch} from './replay-archive.js';
const previewRequested=new URLSearchParams(location.search).get(DEV_QUERY);
const IS_DEV_FRAME=window.parent!==window&&DEV_SCENES.some(s=>s.id===previewRequested);
if(!IS_DEV_FRAME)installMobileRuntime();
let devAnimationSpeed=1;
const $=id=>document.getElementById(id),NET=location.origin+'/pocketnet',KEY='pocket-works:crossline-5x5:';
const read=(key,fallback='')=>{if(IS_DEV_FRAME)return fallback;try{return localStorage.getItem(KEY+key)??fallback}catch{return fallback}};
const write=(key,val)=>{if(IS_DEV_FRAME)return;try{localStorage.setItem(KEY+key,String(val))}catch{}};
// PocketNet identity-scoped room resumes across browser restarts; migrate v1
// sessionStorage once, without allowing disposable QA frames to access it.
const scoped={
 getItem:k=>{if(IS_DEV_FRAME)return null;try{
  const current=localStorage.getItem(KEY+k);if(current)return current;
  const legacy=sessionStorage.getItem(KEY+k);
  if(legacy){localStorage.setItem(KEY+k,legacy);sessionStorage.removeItem(KEY+k)}
  return legacy;
 }catch{return null}},
 setItem:(k,v)=>{if(IS_DEV_FRAME)return;try{localStorage.setItem(KEY+k,v)}catch{}},
 removeItem:k=>{if(IS_DEV_FRAME)return;try{localStorage.removeItem(KEY+k);sessionStorage.removeItem(KEY+k)}catch{}}
};
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols={up:'↑',down:'↓',left:'←',right:'→',shield:'▣'};
let profile=null,sound=read('sound','on')==='on',difficulty=read('difficulty','normal'),motion=read('motion','on')!=='off';
document.documentElement.dataset.motion=motion?'on':'off';
const storedTheme=read('theme','dark');
document.documentElement.dataset.theme=storedTheme==='light'?'light':'dark';
let mode='menu',screen='menu',offline=null,server=null,net=null,me=null,roomId='',connected=false,busy=false;
let plan=[],editingSlot=null,thinkingAI=false,attackMode=false,attackDirs=[],animating=false,animFrame=null,showingOutcome=false,toastTimer=0,gameToken=0,modalOpen=false;
let replayRound=0,replayIndex=0,replaySpeed=1,replayPaused=true,replayTimer=0,recording=false,audio=null,replayPlaybackId=0,archiveEntry=null,devHistory=[];
let roomVersion='v1',opponentDisconnected=false,pendingForfeitLeave=false,forfeitWatchdog=0;
const roomQuery=new URLSearchParams(location.search).get('room')?.trim()||'';
const latest=()=>mode==='online'?server:offline;
const game=()=>latest()?.match;
const side=()=>mode==='online'?server?.side:mode==='hotseat'?offline?.turn:'A';
const ready=()=>mode==='online'?server?.ready||{A:false,B:false}:{A:!!offline?.pending?.A,B:!!offline?.pending?.B};
const score=()=>mode==='online'?server?.score||{A:0,B:0}:offline?.score||{A:0,B:0};
const isPlanning=()=>latest()?.phase==='planning';
const locked=()=>animating||!isPlanning()||!!ready()[side()]||recording||modalOpen||pendingForfeitLeave||thinkingAI;
const reduceMotion=()=>!motion||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
function soundFX(type='tap'){
 if(!sound&&!IS_DEV_FRAME)return;
 try{
  const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
  audio ||= new A();audio.resume?.();
  const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
  o.type=type==='win'||type==='block'?'sine':['hit','attack','collapse','fall'].includes(type)?'sawtooth':'triangle';
  const freq={tap:370,plan:440,hit:140,block:620,move:280,win:570,error:115,attack:420,shield:670,collapse:105,fall:120}[type]||340;
  o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*(type==='win'?1.7:type==='collapse'?.4:.74),t+(type==='collapse'?.23:.12));
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(type==='hit'?.052:.032,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+(type==='collapse'?.26:.15));
  o.connect(g).connect(audio.destination);o.start(t);o.stop(t+(type==='collapse'?.27:.16));
 }catch{}
}
function buzz(v=8){try{navigator.vibrate?.(v)}catch{}}
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function show(view){screen=view;for(const id of ['menu','difficultyView','lobby','play','replay','archive'])$(id).classList.toggle('hidden',view!==id);if(view==='play')render();if(view==='menu')refreshArchiveCount();if(view==='archive')paintArchive();}
function modal(kicker,title,body,main,alt,third){
 modalOpen=true;const data=[['modalMain',main],['modalAlt',alt],['modalThird',third]];
 $('modalKicker').textContent=kicker;$('modalTitle').textContent=title;$('modalBody').textContent=body;
 data.forEach(([id,entry])=>{const b=$(id);b.classList.toggle('hidden',!entry);b.disabled=false;if(entry){b.textContent=entry.label;b.onclick=()=>{closeModal();entry.action?.();}}});
 $('modal').classList.remove('hidden');
}
function closeModal(){if(pendingForfeitLeave)return;modalOpen=false;$('modal').classList.add('hidden');if(screen==='play')render();}
function confirmReturn(){
 const playing=mode==='online'&&server?.phase==='planning';
 modal('ПАУЗА','Дуэль на паузе',playing?
  'Сдача присуждает победу сопернику. Кратковременный обрыв связи сдачей не считается.':'Партию можно продолжить после паузы.',
  {label:'Продолжить',action:()=>{}},
  {label:'Повтор раундов',action:openReplay},
  {label:playing?'Сдаться и выйти':'В меню',action:()=>leaveToMenu()});
}
function showRules(){modal('ПРАВИЛА','Предугадай противника','Каждый раунд оба игрока скрытно выбирают 5 команд. Перемещения выполняются одновременно, затем срабатывают атаки и щиты. Атака один раз за раунд: отмечай соседние направления (и свою клетку). Щит один раз за раунд. Направление, выбранное для атаки, нельзя использовать для движения в этом плане, и наоборот. В 4-м раунде после первого шага внешний контур обрушится.',{label:'Понятно',action:()=>{}});}
function storeOffline(){if(offline)write('saved',JSON.stringify({mode,offline,draft:mode==='hotseat'&&offline.pending?.A&&offline.turn==='A'?[]:plan}));}
function matchSeriesId(){
 try{return crypto.randomUUID()}catch{return 'match-'+Date.now()+'-'+Math.floor(Math.random()*1e9)}
}
function readArchive(){return IS_DEV_FRAME?devHistory:getHistory(localStorage,HISTORY_KEY)}
function refreshArchiveCount(){
 const count=readArchive().length;
 $('archiveCount').textContent=count?' · '+count:'';
}
function playerLabels(){
 if(mode==='online')return ['A','B'].map((side,i)=>server?.players?.find(p=>p.id===server.seats?.[i])?.name||'Игрок '+side);
 return ['Синий',mode==='solo'?'ИИ':'Оранжевый'];
}
function currentReplayEntry(){
 if(archiveEntry)return archiveEntry;
 const m=game();if(!m)return null;
 return {id:'current',mode,players:playerLabels(),score:score(),match:m};
}
function rememberFinished(){
 if(IS_DEV_FRAME||mode==='archive'||game()?.outcome==null)return;
 const item=captureHistory(game(),{mode,roomId,seriesId:mode==='online'?'':offline?.seriesId,
  score:score(),players:playerLabels()});
 if(!item)return;
 const saved=saveHistory(localStorage,item,HISTORY_KEY);
 if(!saved.saved)toast('Память заполнена — экспортируй запись JSON');
 refreshArchiveCount();
}
function archiveWhenEmpty(){
 $('archiveEmpty').classList.remove('hidden');
 $('archiveList').replaceChildren();
}
function paintArchive(){
 if(screen!=='archive')return;
 const history=readArchive(),host=$('archiveList');
 $('archiveEmpty').classList.toggle('hidden',history.length>0);
 if(!history.length){host.replaceChildren();return}
 host.innerHTML=history.map((item,index)=>{
  const when=new Date(item.savedAt||0);
  const stamp=Number.isFinite(when.getTime())?when.toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'}):'Сохранённый матч';
  const rounds=item.match.replays.length,winner=outcomeText(item.match.outcome);
  const opponents=esc((item.players||[]).join(' / ')||'5×5 Arena');
  return '<article class="archive-row" data-record="'+index+'"><div class="archive-row-info">'+
   '<small>'+esc(stamp)+' · '+esc(item.mode==='online'?'Сеть':item.mode==='hotseat'?'Вдвоём':'ИИ')+' · '+rounds+' раунд.</small>'+
   '<strong>'+esc(winner)+'</strong><span>'+opponents+'</span></div>'+
   '<div class="archive-row-actions"><button data-archive-play="'+index+'" '+(!rounds?'disabled ':'')+'aria-label="Смотреть матч '+(index+1)+'">'+(rounds?'▶ Повтор':'Без раундов')+'</button>'+
   '<button data-archive-export="'+index+'" aria-label="Экспорт JSON">↓</button>'+
   '<button data-archive-remove="'+index+'" aria-label="Удалить запись">×</button></div></article>';
 }).join('');
}
function openArchive(){
 if(mode==='online'&&server?.phase==='planning'){toast('Закончи сетевую партию перед открытием архива');return}
 archiveEntry=null;pauseReplay();show('archive');soundFX('tap');
}
function viewHistory(index){
 const item=readArchive()[index];if(!item)return;
 if(!item.match.replays.length){toast('Партия завершилась до первого раунда: доступен JSON');return}
 archiveEntry=item;
 // Read-only snapshot, never overwrites unfinished solo state in localStorage.
 leaveNet(false);
 offline={match:JSON.parse(JSON.stringify(item.match)),score:item.score,phase:'finished',pending:{A:null,B:null},turn:'A'};
 mode='archive';openReplay();$('replayBack').textContent='← Архив';
}
function exportEntry(entry){
 const serialized=exportMatch(entry);if(!serialized){toast('Нет данных записи');return}
 download(serialized,'5x5-arena-'+(entry?.id==='current'?'session':String(entry.id).replace(/[^a-z0-9-]/gi,'-').slice(0,48))+'.json','application/json');
 toast('Полный матч сохранён');
}
function removeArchived(index){
 const record=readArchive()[index];if(!record)return;
 modal('АРХИВ','Удалить эту запись?',outcomeText(record.match.outcome)+' · '+record.match.replays.length+' раунд(ов). Действие нельзя отменить.',
  {label:'Отмена',action:()=>{}},{label:'Удалить навсегда',action:()=>{
   const result=deleteHistory(localStorage,record.id,HISTORY_KEY);
   if(!result.saved)toast('Не удалось удалить запись');else{paintArchive();refreshArchiveCount()}
  }});
}
function resumeOffer(){
 let cached;try{cached=JSON.parse(read('saved','null'))}catch{}
 document.getElementById('resume')?.remove();
 if(!cached?.offline?.match||cached.offline.phase==='finished')return;
 const btn=document.createElement('button');btn.id='resume';btn.className='minor';btn.textContent='Продолжить незавершённую партию';
 btn.onclick=()=>{
  leaveNet(false);mode=cached.mode;offline=cached.offline;plan=Array.isArray(cached.draft)?cached.draft.slice(0,STEPS):[];editingSlot=null;attackMode=false;animating=false;
  show('play');render();
  if(mode==='hotseat'&&offline?.pending?.A&&!offline?.pending?.B&&offline.turn==='A')handoff();
  if(mode==='solo'&&offline?.pending?.A&&!offline?.pending?.B)continueSoloPlanning();
 };
 $('menu').querySelector('.menu-controls').append(btn);
}
function leaveNet(navigate=true){
 clearTimeout(forfeitWatchdog);pendingForfeitLeave=false;opponentDisconnected=false;roomVersion='v1';
 const active=net;net=null;
 if(active){try{if(connected&&active.roomId)active.leaveRoom()}catch{}active.roomId=null;active.persist();active.close()}
 connected=false;busy=false;server=null;roomId='';me=null;
 if(navigate){mode='menu';show('menu');resumeOffer();}
}
function leaveToMenu(force=false){
 if(!force&&mode==='online'&&server?.phase==='planning'&&!server?.match?.outcome){
  if(roomVersion!=='v2'){leaveToMenu(true);toast('Старая комната v1: сдача не фиксируется');return;}
  if(!connected){
   modal('НЕТ СЕТИ','Невозможно подтвердить сдачу','Остаться и дождаться сети или выйти без подтверждения результата?',
    {label:'Остаться',action:()=>{}},{label:'Выйти без подтверждения',action:()=>leaveToMenu(true)});
   return;
  }
  pendingForfeitLeave=true;
  if(!send({type:'forfeit'})){pendingForfeitLeave=false;return;}
  modal('СДАЧА','Подтверждаем результат','Дожидаемся ответа сервера.',{label:'Ожидание сервера…',action:()=>{}});
  $('modalMain').disabled=true;
  clearTimeout(forfeitWatchdog);
  forfeitWatchdog=setTimeout(()=>{
   if(!pendingForfeitLeave)return;
   pendingForfeitLeave=false;
   modal('НЕТ ПОДТВЕРЖДЕНИЯ','Сервер не ответил','Раунд может продолжаться. Повторить сдачу или выйти из комнаты?',
    {label:'Повторить',action:()=>leaveToMenu()},{label:'Выйти из комнаты',action:()=>leaveToMenu(true)});
  },9000);
  return;
 }
 if(mode!=='online')storeOffline(); // Keep any unfinished local draft.
 gameToken++;clearTimeout(replayTimer);replayPaused=true;animating=false;thinkingAI=false;attackMode=false;editingSlot=null;plan=[];
 modalOpen=false;$('modal').classList.add('hidden');
 if(mode==='online')leaveNet(false);
 mode='menu';show('menu');resumeOffer();
}
function localStart(kind){
 leaveNet(false);gameToken++;clearTimeout(replayTimer);mode=kind;offline={phase:'planning',turn:'A',pending:{A:null,B:null},match:initialMatch(),score:{A:0,B:0},seriesId:matchSeriesId()};
 plan=[];editingSlot=null;thinkingAI=false;attackMode=false;animating=false;showingOutcome=false;show('play');storeOffline();soundFX('tap');
}
function handoff(){
 plan=[];editingSlot=null;attackMode=false;attackDirs=[];render();
 modal('ЛОКАЛЬНАЯ ДУЭЛЬ','Передай устройство','Игрок А закончил планирование. Теперь пять команд выбирает игрок Б. План соперника скрыт.',{label:'Игрок Б готов',action:()=>{
  offline.turn='B';plan=[];attackMode=false;show('play');render();storeOffline();
 }});
}
function finishLocalRound(){
 if(!offline?.pending?.A||!offline?.pending?.B)return;
 const match=offline.match,round=match.round,record=simulateRound(match,offline.pending);
 offline.match=record.match;offline.phase=record.match.outcome?'finished':'planning';
 offline.pending={A:null,B:null};offline.turn='A';
 if(record.match.outcome&&record.match.outcome!=='draw')offline.score[record.match.outcome]++;
 plan=[];editingSlot=null;attackMode=false;storeOffline();
 animateRecord(record.record,round);
}
async function continueSoloPlanning(){
 if(thinkingAI||mode!=='solo'||!offline?.pending?.A||offline.pending.B)return;
 thinkingAI=true;
 const ticket=gameToken,match=offline.match,session=offline;
 storeOffline();render();
 // Allow the real waiting state to paint before the CPU-bound AI search.
 await new Promise(resolve=>setTimeout(resolve,32));
 if(ticket!==gameToken||mode!=='solo'||offline!==session||offline.match!==match){
  thinkingAI=false;return;
 }
 try{offline.pending.B=aiPlan(match,null,difficulty);}
 catch(error){
  thinkingAI=false;render();toast('Не удалось выбрать ход ИИ. Вернись в меню и продолжи партию.');return;
 }
 if(ticket!==gameToken||mode!=='solo'||offline!==session){thinkingAI=false;return}
 thinkingAI=false;finishLocalRound();
}
function submitLocal(){
 const who=side(),err=validatePlan(plan);
 if(err){planProblem(err);return}
 offline.pending[who]=JSON.parse(JSON.stringify(plan));
 plan=[];editingSlot=null;attackMode=false;attackDirs=[];soundFX('plan');
 if(mode==='solo'){continueSoloPlanning();return}
 if(!offline.pending.B){handoff();storeOffline();return}
 finishLocalRound();
}
function applyRemote(next,version=roomVersion){
 if(!next||!['lobby','planning','finished'].includes(next.phase))return;
 if(!['v1','v2'].includes(version)){toast('Версия комнаты несовместима с этим приложением');leaveNet();return;}
 if(pendingForfeitLeave&&next.phase==='finished'){
  server=next;rememberFinished();
  pendingForfeitLeave=false;clearTimeout(forfeitWatchdog);
  leaveToMenu(true);toast('Сдача записана. Победа присуждена сопернику.');return;
 }
 const previous=server,oldKey=previous?.match?.round+':'+previous?.match?.revision;
 server=next;
 if(previous?.phase==='finished'&&next.phase==='planning'){
  // A host rematch must dismiss the previous result for BOTH players, even
  // when the guest is still in the score modal or replay viewer.
  showingOutcome=false;pauseReplay();
  if(modalOpen)closeModal();
  if(screen==='replay')show('play');
 }
 if(next.phase==='lobby'){plan=[];editingSlot=null;attackMode=false;show('lobby');lobby();return;}
 if(screen==='lobby'||screen==='menu')show('play');
 const newKey=next.match?.round+':'+next.match?.revision;
 if(previous&&oldKey!==newKey&&next.match?.replays?.length>(previous.match?.replays?.length||0)){
  plan=[];editingSlot=null;attackMode=false;animateRecord(next.match.replays.at(-1));return;
 }
 if(!previous||previous.match?.round!==next.match?.round||previous.match?.revision!==next.match?.revision){
  plan=next.ownPlan?.length?JSON.parse(JSON.stringify(next.ownPlan)):[];
  attackMode=false;editingSlot=null;
 }else if(next.ownPlan?.length)plan=JSON.parse(JSON.stringify(next.ownPlan));
 render();
 if(next.phase==='finished'&&showingOutcome&&modalOpen&&mode==='online'){
  const enabled=next.host===me?.id&&next.players?.length===2;
  const button=$(next.match?.replays?.length?'modalAlt':'modalMain');
  button.disabled=!enabled;button.textContent=enabled?'Реванш':'Ждём второго игрока';
 }
 if(next.phase==='finished'&&!showingOutcome&&!animating&&screen==='play')finish();
}
function wire(client){
 client.on('connected',e=>{if(net!==client)return;connected=true;me=e.player;busy=false;lobby();});
 client.on('room_joined',e=>{if(net!==client)return;roomId=e.roomId;roomVersion=e.version||'v1';busy=false;opponentDisconnected=false;applyRemote(e.state,roomVersion);lobby();});
 client.on('game_event',e=>{if(net!==client)return;if(e.event?.type==='state')applyRemote(e.event.payload,roomVersion);else if(e.event?.type==='notice'){toast(String(e.event.payload));soundFX('error');}});
 client.on('presence',e=>{if(net===client){
  if(e?.disconnected&&e.disconnected!==me?.id)opponentDisconnected=true;
  else if(!e?.disconnected)opponentDisconnected=false;
  lobby();render();try{net.sendGame({type:'sync'})}catch{}
 }});
 client.on('disconnected',()=>{if(net===client){connected=false;toast('Переподключаемся…');lobby();render()}});
 client.on('room_closed',()=>{if(net===client){leaveToMenu();toast('Комната закрыта')}});
 client.on('error',e=>{if(net!==client)return;busy=false;const errors={room_not_found:'Комната не найдена',room_full:'В комнате уже два игрока',game_unavailable:'Правила ещё не опубликованы',match_in_progress:'Матч уже идёт',already_in_room:'Ты уже в комнате',room_version_unavailable:'Старая версия правил недоступна'};toast(errors[e.code]||e.code||'Ошибка PocketNet');lobby()});
}
async function connect(action,code=''){
 if(IS_DEV_FRAME){initDevPreview(action==='create'?'lobby-host':'lobby-guest');return;}
 leaveNet(false);mode='online';busy=true;show('lobby');lobby();
 try{
  const name=profile?.complete?profile.nickname:read('nick','Игрок');
  const client=new PocketNet({serverUrl:NET,name,storage:scoped,identityKey:profile?.id||'guest'});
  // Explicit create/join means abandon any saved room. Only an unprompted
  // reconnect to the current online session should restore the old room.
  if(action!=='resume'&&client.roomId){client.roomId=null;client.persist();}
  net=client;wire(client);
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
 if(IS_DEV_FRAME){if(payload?.type==='start'||payload?.type==='rematch'){initDevPreview('planning');return true;}if(payload?.type==='plan'){initDevPreview('plan-wait');return true;}return true;}
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
const allowed=()=>controlsFor(plan,editingSlot);
function planProblem(code){
 const message=describeIssue(code);
 const feedback=$('planFeedback');
 feedback.textContent=message;feedback.classList.add('is-error');feedback.classList.remove('is-risk');
 toast(message);soundFX('error');buzz(16);
}
function saveDraft(){if(mode!=='online')storeOffline()}
function selectSlot(index){
 if(locked()||index<0||index>plan.length||index>=STEPS)return;
 editingSlot=editingSlot===index?null:index;attackMode=false;attackDirs=[];
 $('planFeedback').classList.remove('is-error');
 soundFX('tap');render();
}
function reorderSlot(offset){
 if(locked()||editingSlot===null)return;
 const changed=trySwapCommand(plan,editingSlot,offset);
 if(changed.error){planProblem(changed.error);return}
 plan=changed.actions;editingSlot=changed.index;
 $('planFeedback').classList.remove('is-error');
 soundFX('tap');buzz(6);render();saveDraft();
}
function removeSlot(){
 if(locked()||editingSlot===null)return;
 plan=removeCommand(plan,editingSlot);editingSlot=null;
 attackMode=false;attackDirs=[];$('planFeedback').classList.remove('is-error');soundFX('tap');buzz(6);render();saveDraft();
}
function enqueue(action){
 if(locked())return;
 const target=editingSlot??plan.length;
 if(target>=STEPS){planProblem('exactly_five_actions');return}
 const result=trySetCommand(plan,target,action);
 if(result.error){planProblem(result.error);return}
 plan=result.actions;editingSlot=null;attackMode=false;attackDirs=[];
 $('planFeedback').classList.remove('is-error');
 soundFX('plan');buzz(6);render();saveDraft();
}
function direction(d){
 if(locked())return;
 const info=allowed();
 if(attackMode){
  if(info.moved.has(d)){planProblem('attack_direction_conflict');return}
  attackDirs=attackDirs.includes(d)?attackDirs.filter(a=>a!==d):[...attackDirs,d];
  soundFX('tap');render();return;
 }
 enqueue(d);
}
function toggleAttack(){
 if(locked())return;
 if(attackMode){
  if(!attackDirs.length){planProblem('invalid_attack_directions');return}
  enqueue({type:'attack',dirs:attackDirs.slice()});return;
 }
 if(allowed().attackUsed){planProblem('one_attack_only');return}
 if(plan.length>=STEPS&&editingSlot===null){planProblem('exactly_five_actions');return}
 attackMode=true;
 const old=editingSlot!==null?plan[editingSlot]:null;
 attackDirs=old?.type==='attack'?old.dirs.slice():[];
 render();soundFX('tap');
}
function undo(){
 if(locked())return;
 if(attackMode){attackMode=false;attackDirs=[]}
 else if(editingSlot!==null){plan=removeCommand(plan,editingSlot);editingSlot=null}
 else plan.pop();
 $('planFeedback').classList.remove('is-error');soundFX('tap');render();saveDraft();
}
function submit(){
 if(animating||recording||modalOpen||thinkingAI)return;
 if(attackMode){toggleAttack();return;}
 if(!isPlanning()||ready()[side()])return;
 if(plan.length!==STEPS){toast('Нужны все пять команд');return;}
 const why=validatePlan(plan);if(why){toast('План противоречив: '+why);soundFX('error');return;}
 if(mode==='online'){
  if(send({type:'plan',actions:plan,round:server.match.round,revision:server.match.revision})){$('submit').disabled=true;$('submit').textContent='ОТПРАВЛЯЕМ…';}
 }else submitLocal();
}
function drawBoard(host,units,edges,events=[],preview=false,shownRound=game()?.round){
 const projected=preview&&isPlanning()&&!locked()?previewOrders(game(),side()||'A',plan):null;
 const targets=new Set((projected?.targetCells||[]).map(p=>p.x+','+p.y));
 paintArena(host,units,edges,events,{round:shownRound,targets,instant:true});
 paintPlanOverlay(host,projected,{selected:editingSlot});
}
function render(){
 if(screen!=='play')return;
 const state=latest(),match=state?.match;
 if(!match)return;
 const sidescore=score(),turn=side(),flags=ready(),finished=state.phase==='finished';
 const picture=animFrame||{units:match.units,edgesCollapsed:match.edgesCollapsed,events:[]};
 drawBoard($('board'),picture.units,picture.edgesCollapsed,picture.events,!animating,picture.round||match.round);
 $('roundInfo').textContent='РАУНД '+Math.min(match.round,4)+' / '+MAX_ROUNDS;
 $('phaseInfo').textContent=thinkingAI?'ИИ ВЫБИРАЕТ ХОД':mode==='online'&&!connected?'НЕТ СВЯЗИ':mode==='online'&&opponentDisconnected?'СОПЕРНИК ВНЕ СЕТИ':animating?'ИСПОЛНЕНИЕ':finished?'ПАРТИЯ ОКОНЧЕНА':flags[turn]?'ПЛАН ПОДТВЕРЖДЁН':'ПЛАНИРОВАНИЕ';
 $('nameA').textContent=mode==='online'?(server.players.find(p=>p.id===server.seats[0])?.name||'ИГРОК А'):'ИГРОК А';
 $('nameB').textContent=mode==='online'?(server.players.find(p=>p.id===server.seats[1])?.name||'ИГРОК Б'):(mode==='solo'?'КОМПЬЮТЕР':'ИГРОК Б');
 $('winsA').textContent=sidescore.A;$('winsB').textContent=sidescore.B;
 $('fA').style.opacity=turn==='B'&&!finished?'.6':'1';$('fB').style.opacity=turn==='A'&&!finished?'.6':'1';
 $('planOwner').textContent=thinkingAI?'КОМПЬЮТЕР ДУМАЕТ':animating?'РАЗРЕШЕНИЕ ХОДА':finished?'БИТВА ЗАВЕРШЕНА':flags[turn]?'ПЛАН ОТПРАВЛЕН':turn==='A'?'КОМАНДЫ ИГРОКА А':'КОМАНДЫ ИГРОКА Б';
 $('planCount').textContent=String(plan.length)+' / '+STEPS;
 $('slots').innerHTML=Array.from({length:STEPS},(_,i)=>{
  const selectable=!locked()&&i<=plan.length,active=editingSlot===i,cmd=plan[i];
  return '<button type="button" class="slot '+(cmd?'filled ':'')+(i===plan.length?'current ':'')+
   (active?'editing ':'')+'" data-slot="'+i+'" '+(selectable?'':'disabled ')+
   'aria-pressed="'+String(active)+'" aria-label="Шаг '+(i+1)+': '+esc(cmd?actionText(cmd):'пустой')+
   (selectable?'. Нажми для замены команды':'')+'">'+(cmd?esc(actionText(cmd)):'·')+'</button>';
 }).join('');
 const info=allowed(),disabled=locked(),attack=attackMode;
 const full=plan.length===STEPS&&editingSlot===null;
 document.querySelectorAll('[data-dir]').forEach(b=>{
  const d=b.dataset.dir,conflict=attack?info.moved.has(d):info.attacked.has(d);
  b.classList.toggle('chosen',attack&&attackDirs.includes(d));
  b.classList.toggle('conflict',conflict&&!disabled&&!full);
  b.disabled=disabled||full;
  b.setAttribute('aria-disabled',String(conflict));
  b.title=conflict?describeIssue('attack_direction_conflict'):'';
  b.setAttribute('aria-label',conflict?(d+' — '+describeIssue('attack_direction_conflict')):d);
 });
 $('attack').disabled=disabled||full;
 $('attack').classList.toggle('conflict',!attack&&info.attackUsed&&!disabled&&!full);
 $('attack').setAttribute('aria-disabled',String(!attack&&info.attackUsed));
 $('shield').disabled=disabled||attack||full;
 $('shield').classList.toggle('conflict',info.shieldUsed&&!disabled&&!full);
 $('shield').setAttribute('aria-disabled',String(info.shieldUsed));
 $('attack').textContent=attack?'✓':'⚔';
 $('undo').textContent=attack?'ОТМЕНА':editingSlot!==null?'× Удалить шаг':'← Удалить';
 $('undo').disabled=disabled||(!attack&&!plan.length);
 const edit=editingSlot!==null&&!disabled;
 $('editBar').classList.toggle('hidden',!edit);
 if(edit){
  $('editDescription').textContent='Шаг '+(editingSlot+1)+' · замена';
  $('moveEarlier').disabled=editingSlot===0||editingSlot>=plan.length;
  $('moveLater').disabled=editingSlot>=plan.length-1;
  $('removeSelected').disabled=editingSlot>=plan.length;
 }
 const feedback=$('planFeedback');
 if(!feedback.classList.contains('is-error')){
  const projection=previewOrders(match,turn,plan);
  feedback.textContent=thinkingAI?'Компьютер выбирает пять команд…':animating?'Исполнение пяти команд':projection.risk!==null?
   'Опасно: шаг '+projection.risk+' ведёт на разрушенный край':
   attack?'Укажи направление удара'+(info.moved.size?' · движение '+[...info.moved].map(d=>symbols[d]).join(' ')+' уже занято':''):
   edit?'Замени команду или передвинь выбранный шаг':
   full?'План готов. Нажми шаг для изменения':info.attacked.size?'Направление '+[...info.attacked].map(d=>symbols[d]).join(' ')+' занято атакой':'Выбери команду. Нажми шаг, чтобы заменить его.';
  feedback.classList.toggle('is-risk',projection.risk!==null&&!animating);
 }
 $('submit').textContent=thinkingAI?'ИИ ВЫБИРАЕТ ХОД…':finished?'ИТОГ':animating?'ИСПОЛНЕНИЕ…':flags[turn]?'ЖДЁМ СОПЕРНИКА':plan.length===5?'ПОДТВЕРДИТЬ →':'ЗАПОЛНИ ПЛАН →';
 $('submit').disabled=disabled||plan.length!==STEPS;
 $('attackHint').classList.toggle('hidden',!attack);
 $('boardNote').textContent=thinkingAI?'План принят. Компьютер выбирает ответ.':mode==='online'&&!connected?'Связь потеряна. Место и отправленный план сохраняются':mode==='online'&&opponentDisconnected?'Соперник отключился: ждём возвращения или выхода из комнаты':animating?'Раунд исполняется одновременно':finished?'Повтор и реванш доступны после боя':flags[turn]?'Соперник '+(flags[turn==='A'?'B':'A']?'готов':'ещё планирует'):'Направления атаки и движения не должны пересекаться.';
 $('beat').classList.toggle('hidden',!animating);
 if(animFrame)$('beat').textContent='ШАГ '+animFrame.beat+' / '+STEPS;
}
async function animateRecord(record){
 const ticket=++gameToken,frames=record?.frames||[];
 if(screen==='replay'||!frames.length)return;
 animating=true;showingOutcome=false;
 animFrame=frameBefore(record,0);
 show('play');
 const still=()=>ticket===gameToken&&screen==='play';
 for(let i=0;i<frames.length&&still();i++){
  const before=frameBefore(record,i),frame=frames[i];
  const completed=await playArenaBeat($('board'),before,frame,{
   round:record.round,speed:devAnimationSpeed,reduced:reduceMotion(),alive:still,
   sound:soundFX,feedback:buzz
  });
  if(!completed||!still())return;
  animFrame={...frame,round:record.round};render();
  if(i<frames.length-1)await new Promise(r=>setTimeout(r,Math.round(55/devAnimationSpeed)));
 }
 if(!still())return;
 animating=false;animFrame=null;plan=[];render();
 if(latest()?.phase==='finished')finish();
}
function finish(){
 if(showingOutcome||screen!=='play')return;
 showingOutcome=true;rememberFinished();
 const winner=game()?.outcome,name=winner==='draw'?'Ничья':winner==='A'?'Победа игрока А':'Победа игрока Б';
 const termination=game()?.termination;
 const narrative=termination?.type==='forfeit'?(termination.by===side()?'Вы сдались. Победа засчитана сопернику.':'Соперник сдался. Победа записана в счёт.'):winner==='draw'?'Оба плана привели к равному исходу.':'Пять ходов решают больше, чем кажется.';
 soundFX('win');
 const canReplay=Boolean(game()?.replays?.length);
 const canRematch=mode!=='online'||server?.host===me?.id&&server?.players?.length===2;
 const again={label:canRematch?'Реванш':'Ждём второго игрока',action:rematch};
 if(canReplay){
  modal('ПАРТИЯ ОКОНЧЕНА',name,narrative,
   {label:'Смотреть повтор',action:openReplay},again,{label:'В меню',action:()=>leaveToMenu()});
  $('modalAlt').disabled=!canRematch;
 }else{
  modal('ПАРТИЯ ОКОНЧЕНА',name,narrative,again,{label:'В меню',action:()=>leaveToMenu()});
  $('modalMain').disabled=!canRematch;
 }
}
function rematch(){
 showingOutcome=false;gameToken++;plan=[];attackMode=false;
 if(mode==='online'){send({type:'rematch'});render();}
 else if(offline){offline.match=initialMatch();offline.seriesId=matchSeriesId();offline.pending={A:null,B:null};offline.phase='planning';offline.turn='A';show('play');storeOffline();}
}
function openReplay(){
 if(!game()?.replays?.length){toast('Повтор появится после первого раунда');return;}
 gameToken++;animating=false;animFrame=null;show('replay');$('replayBack').textContent=mode==='archive'?'← Архив':'← Матч';replayRound=game().replays.length-1;replayIndex=0;replayPaused=true;paintReplayOptions();paintReplay();soundFX('tap');
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
function analyzeReplayPresentation(rec){
 const info=analyzeBeat(rec,replayIndex),names=archiveEntry?.players||playerLabels();
 if(!info){$('replayAnalysis').replaceChildren();return}
 $('replayAnalysis').innerHTML=['A','B'].map((side,idx)=>{
  const projected=previewOrders({round:rec.round,units:rec.begin,edgesCollapsed:rec.round>4},side,rec.plans[side]).steps;
  const cells=Array.from({length:STEPS},(_,i)=>{
   const expected=projected[i]?.to,actual=rec.frames[i]?.units?.[side],executed=!!rec.frames[i];
   const different=executed&&expected&&actual&&(expected.x!==actual.x||expected.y!==actual.y);
   const location=p=>p?(p.x+1)+','+(p.y+1):'–';
   return '<button data-analysis-beat="'+(i+1)+'" class="analysis-beat'+(replayIndex===i+1?' is-current':'')+
    (different?' is-different':'')+(!executed?' is-unplayed':'')+'" '+(!executed?'disabled':'')+
    ' aria-label="'+side+' шаг '+(i+1)+'" aria-pressed="'+(replayIndex===i+1)+'"><small>'+(i+1)+'</small>'+
    '<strong>'+esc(commandLabel(rec.plans[side][i]))+'</strong><span>'+location(expected)+' → '+location(executed?actual:null)+'</span></button>';
  }).join('');
  return '<div class="analysis-side '+side.toLowerCase()+'"><div class="analysis-side-head"><strong><i></i>'+
   esc(names[idx]||'Игрок '+side)+'</strong><small>'+
   (replayIndex===0?'До исполнения':esc(info.projected[side].verdict))+
   '</small></div><div class="analysis-beats">'+cells+'</div></div>';
 }).join('')+'<p class="analysis-explainer">План → факт (столбец, строка). Расчёт маршрута не предсказывает действия соперника; оба плана раскрываются после раунда.</p>';
 $('replayStepBack').disabled=replayIndex<=0;
 $('replayStepForward').disabled=replayIndex>=rec.frames.length;
}
function seekReplay(index){
 const rec=currentRecord();if(!rec)return;
 pauseReplay();replayIndex=Math.max(0,Math.min(rec.frames.length,index));paintReplay();
}
function paintReplay(){
 const rec=currentRecord();if(!rec)return;const frame=replayFrame();
 drawBoard($('replayBoard'),frame.units,frame.edgesCollapsed,frame.events,false,rec.round);
 $('replaySeek').max=String(rec.frames.length);$('replaySeek').value=String(replayIndex);
 $('replayLabel').textContent=replayIndex===0?'ПЕРЕД ИСПОЛНЕНИЕМ':('ШАГ '+frame.beat+' / '+rec.frames.length+' · '+rec.frames[Math.max(0,replayIndex-1)].events.map(e=>e.type==='hit'?'ПОПАДАНИЕ':e.type==='block'?'БЛОК':e.type==='collapse'?'ОБРУШЕНИЕ':'').filter(Boolean).join(' '));
 $('replayPlay').textContent=replayPaused?'▶ Играть':'Ⅱ Пауза';
 $('replaySpeed').textContent=replaySpeed+'×';
 analyzeReplayPresentation(rec);
}
function pauseReplay(){
 replayPaused=true;replayPlaybackId++;clearTimeout(replayTimer);
 if(screen==='replay')paintReplay();
}
async function replayTick(ticket){
 if(replayPaused||screen!=='replay'||ticket!==replayPlaybackId)return;
 const record=currentRecord();if(!record)return;
 if(replayIndex>=record.frames.length){pauseReplay();return}
 const before=frameBefore(record,replayIndex),frame=record.frames[replayIndex];
 const valid=()=>!replayPaused&&screen==='replay'&&ticket===replayPlaybackId;
 const played=await playArenaBeat($('replayBoard'),before,frame,{
  round:record.round,speed:replaySpeed*devAnimationSpeed,reduced:reduceMotion(),
  alive:valid,sound:soundFX,feedback:buzz
 });
 if(!played||!valid())return;
 replayIndex++;paintReplay();
 if(replayIndex>=record.frames.length){pauseReplay();return}
 replayTimer=setTimeout(()=>replayTick(ticket),80);
}
function toggleReplay(){
 if(!currentRecord())return;
 if(!replayPaused){pauseReplay();return}
 if(replayIndex>=currentRecord().frames.length)replayIndex=0;
 replayPaused=false;
 const ticket=++replayPlaybackId;
 replayTick(ticket);
}
function download(data,filename,mime){
 const url=URL.createObjectURL(new Blob([data],{type:mime})),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportReplay(){const item=currentReplayEntry();if(item)exportEntry(item)}
async function videoReplay(){
 if(recording)return;
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('WebM недоступен — используй JSON');return}
 const rounds=game()?.replays||[];if(!rounds.length){toast('Нет записанных раундов');return}
 const button=$('replayVideo');recording=true;button.disabled=true;button.textContent='ЗАПИСЬ МАТЧА…';pauseReplay();
 let recorder,stream;
 try{
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=840;
  const ctx=canvas.getContext('2d'),clips=[];if(!ctx)throw Error('Не удалось открыть Canvas');
  stream=canvas.captureStream(30);
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)throw Error('Кодек WebM недоступен');
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
  const finished=new Promise((resolve,reject)=>{
   recorder.ondataavailable=e=>{if(e.data?.size)clips.push(e.data)};
   recorder.onstop=resolve;recorder.onerror=()=>reject(Error('Ошибка видеозаписи'));
  });
  recorder.start(100);
  // The complete match is encoded, including rounds not currently selected.
  for(const round of rounds)for(let i=0;i<round.frames.length;i++){
   const before=frameBefore(round,i),frame=round.frames[i],duration=timing(1,false),steps=24;
   for(let n=0;n<=steps;n++){
    drawArenaCanvas(ctx,before,frame,round.round,n/steps,{step:frame.beat});
    await new Promise(resolve=>setTimeout(resolve,duration/steps));
   }
  }
  recorder.stop();await finished;
  if(!clips.length)throw Error('Нет данных WebM');
  download(new Blob(clips,{type:mime}),'5x5-arena-full-match.webm',mime);
  toast('Видео всего матча сохранено');
 }catch(error){toast(error?.message||'Ошибка записи')}
 finally{
  try{if(recorder?.state==='recording')recorder.stop()}catch{}
  stream?.getTracks().forEach(t=>t.stop());recording=false;button.disabled=false;button.textContent='● WebM матча';
 }
}
$('themeToggle').onclick=()=>{
 const next=document.documentElement.dataset.theme==='light'?'dark':'light';
 document.documentElement.dataset.theme=next;write('theme',next);
 document.querySelector('meta[name="theme-color"]').content=next==='light'?'#f8fafc':'#05060d';
 soundFX('tap');
};
$('archiveOpen').onclick=openArchive;
$('archiveBack').onclick=()=>{archiveEntry=null;show('menu')};
$('archiveList').addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 const {archivePlay,archiveExport,archiveRemove}=button.dataset;
 if(archivePlay!==undefined)viewHistory(Number(archivePlay));
 else if(archiveExport!==undefined){const record=readArchive()[Number(archiveExport)];if(record)exportEntry(record)}
 else if(archiveRemove!==undefined)removeArchived(Number(archiveRemove));
});
$('solo').onclick=()=>{show('difficultyView');soundFX('tap')};
$('difficultyBack').onclick=()=>show('menu');
document.querySelectorAll('[data-difficulty-choice]').forEach(b=>b.onclick=()=>{
 difficulty=b.dataset.difficultyChoice;write('difficulty',difficulty);$('difficulty').value=difficulty;
 localStart('solo');
});
$('hotseat').onclick=()=>localStart('hotseat');
$('online').onclick=()=>connect('create');$('joinOnline').onclick=()=>connect('join');$('openRules').onclick=showRules;
$('difficulty').value=difficulty;$('difficulty').onchange=()=>{difficulty=$('difficulty').value;write('difficulty',difficulty)};
$('sound').onclick=()=>{sound=!sound;write('sound',sound?'on':'off');$('sound').textContent=sound?'♪':'♪̸';soundFX('tap')};$('sound').textContent=sound?'♪':'♪̸';
$('motionToggle').onclick=()=>{motion=!motion;write('motion',motion?'on':'off');document.documentElement.dataset.motion=motion?'on':'off';$('motionToggle').textContent=motion?'▶':'⏭';$('motionToggle').setAttribute('aria-pressed',String(!motion));soundFX('tap')};
$('motionToggle').textContent=motion?'▶':'⏭';$('motionToggle').setAttribute('aria-pressed',String(!motion));
$('pause').onclick=confirmReturn;
$('lobbyBack').onclick=leaveToMenu;$('enter').onclick=joinFromField;
$('startOnline').onclick=()=>send({type:'start'});
$('roomCode').onclick=()=>copy(roomId.slice(0,8).toUpperCase());$('copyLink').onclick=()=>copy(location.origin+location.pathname+'?room='+encodeURIComponent(roomId.slice(0,8)));
$('attack').onclick=toggleAttack;$('shield').onclick=()=>enqueue('shield');
document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>direction(b.dataset.dir));
$('undo').onclick=undo;$('submit').onclick=submit;
$('slots').addEventListener('click',event=>{const button=event.target.closest('[data-slot]');if(button)selectSlot(Number(button.dataset.slot))});
$('moveEarlier').onclick=()=>reorderSlot(-1);
$('moveLater').onclick=()=>reorderSlot(1);
$('removeSelected').onclick=removeSlot;
$('endEdit').onclick=()=>{editingSlot=null;attackMode=false;attackDirs=[];soundFX('tap');render()};
$('replayBack').onclick=()=>{pauseReplay();if(mode==='archive'){archiveEntry=null;show('archive');return;}show('play');if(latest()?.phase==='finished'){showingOutcome=false;finish();}};
$('replayRound').onchange=()=>{replayRound=Number($('replayRound').value);replayIndex=0;pauseReplay();paintReplay()};
$('replaySeek').oninput=()=>seekReplay(Number($('replaySeek').value));
$('replayStepBack').onclick=()=>seekReplay(replayIndex-1);
$('replayStepForward').onclick=()=>seekReplay(replayIndex+1);
$('replayAnalysis').addEventListener('click',event=>{
 const button=event.target.closest('[data-analysis-beat]');
 if(button)seekReplay(Number(button.dataset.analysisBeat));
});
$('replayPlay').onclick=toggleReplay;$('replaySpeed').onclick=()=>{const list=[1,2,3,5];replaySpeed=list[(list.indexOf(replaySpeed)+1)%list.length];paintReplay()};
$('replaySave').onclick=exportReplay;$('replayVideo').onclick=videoReplay;
window.addEventListener('keydown',e=>{
 if(/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName||''))return;
 if(e.key==='Escape'){if(modalOpen){if(mode!=='hotseat'||!offline?.pending?.A||offline?.turn!=='A')closeModal();}else if(screen==='replay')$('replayBack').click();else if(screen==='archive')show('menu');else if(screen==='difficultyView')show('menu');else if(screen==='play')confirmReturn();return;}
 if(screen==='replay'&&!modalOpen&&['ArrowLeft','ArrowRight'].includes(e.key)){seekReplay(replayIndex+(e.key==='ArrowLeft'?-1:1));e.preventDefault();return}
  if(screen!=='play'||modalOpen)return;
 if(e.key>='1'&&e.key<='5'){selectSlot(Number(e.key)-1);e.preventDefault();return}
 const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
 if(map[e.key]){direction(map[e.key]);e.preventDefault()}
 else if(e.key.toLowerCase()==='a'){toggleAttack();e.preventDefault()}
 else if(e.key.toLowerCase()==='s'){enqueue('shield');e.preventDefault()}
 else if(e.key==='Backspace'){undo();e.preventDefault()}
 else if(e.key==='Delete'&&editingSlot!==null){removeSlot();e.preventDefault()}
 else if(e.key==='Enter'){submit();e.preventDefault()}
});
async function checkNet(){
 try{const r=await fetch(NET+'/health',{cache:'no-store',signal:AbortSignal.timeout(6000)}),j=await r.json();$('netStatus').textContent=r.ok&&j.modules?.includes('crossline-5x5')?'POCKETNET · ДОСТУПЕН':'POCKETNET · ОЖИДАЕТ ПУБЛИКАЦИИ'}catch{$('netStatus').textContent='POCKETNET · СЕЙЧАС НЕ В СЕТИ'}
}
if(!IS_DEV_FRAME)getPocketIdentity().then(p=>{profile=p;startFromSession()}).catch(()=>startFromSession());
function startFromSession(){
 if(roomQuery){$('code').value=roomQuery;connect('join',roomQuery);return;}
 // Saved session and pinned room ID survive a page reload in this browser.
 // PocketNet handles the server-side seat restore and on-join state projection.
 const restored=new PocketNet({serverUrl:NET,name:profile?.complete?profile.nickname:'Игрок',storage:scoped,identityKey:profile?.id||'guest'});
 if(restored.roomId)connect('resume');
}
if(!IS_DEV_FRAME){
 const workshop=createWorkshopMode({appName:'5×5 Arena',version:'1.6.0',cachePrefix:'crossline-5x5-',storageNamespace:'pocket-works:crossline-5x5',triggerSelector:'[data-workshop-diagnostics-trigger]',shortcut:false,onReset(){gameToken++;leaveNet(false);offline=null;plan=[];mode='menu';show('menu')}});
 mountArenaDevGallery({onDiagnostics:()=>workshop.open()});
 checkNet();resumeOffer();refreshArchiveCount();
}else{
 document.body.classList.add('arena-dev-child');
 window.addEventListener('keydown',event=>{
  if(isDevKey(event)&&!event.repeat){event.preventDefault();event.stopImmediatePropagation();window.parent.postMessage({type:'arena-dev-toggle'},location.origin)}
 },true);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='arena-dev-restart')initDevPreview(previewRequested);
  if(event.data?.type==='arena-dev-speed'&&[.25,.5,1,2,4].includes(event.data.speed))devAnimationSpeed=event.data.speed;
  if(event.data?.type==='arena-dev-theme')$('themeToggle').click();
 });
 initDevPreview(previewRequested);
}


// QA scenarios are constructed from the real rules engine, never from screenshots.
// This executes only inside the isolated iframe indicated by DEV_QUERY.
function devPlanA(){return ['right','up','left','down','shield'];}
function devPlanB(){return ['left','up','right','down','shield'];}
function devCombat(kind){
 const match=initialMatch();
 match.units.A={x:2,y:2,alive:true};match.units.B={x:2,y:3,alive:true};
 const attackDown={type:'attack',dirs:['down']},attackUp={type:'attack',dirs:['up']};
 let A=[attackDown,'up','left','right','shield'];
 let B=['up','down','left','right','shield'];
 if(kind==='shield')B=['shield','up','down','left','right'];
 if(kind==='mutual')B=[attackUp,'down','left','right','shield'];
 if(kind==='move'){match.units.A={x:0,y:2,alive:true};match.units.B={x:4,y:2,alive:true};A=['right','right','up','down','shield'];B=['left','left','up','down','shield'];}
 if(kind==='collapse'){
  match.round=4;match.units.A={x:0,y:2,alive:true};match.units.B={x:4,y:2,alive:true};
  A=['up','down','left','right','shield'];B=['up','down','left','right','shield'];
 }
 return simulateRound(match,{A,B});
}
function devLobby(scene){
 mode='online';connected=scene!=='lobby-connect'&&scene!=='lobby-error';busy=scene==='lobby-connect';
 roomId=scene==='lobby-connect'||scene==='lobby-error'?'':'F3A4B5C6';
 const a={id:'dev-a',name:'Синий',verified:true},b={id:'dev-b',name:'Оранжевый',verified:false};
 const guest=scene==='lobby-guest';me=guest?b:a;
 server={phase:'lobby',host:a.id,players:scene==='lobby-ready'||guest?[a,b]:[a],
  seats:[a.id,b.id],side:guest?'B':'A',match:null,score:{A:0,B:0},ready:{A:false,B:false}};
 show('lobby');lobby();
 if(scene==='lobby-error'){busy=false;toast('Комната не найдена или соединение потеряно');lobby();}
}
function devPlayOnline(scene){
 mode='online';connected=true;roomId='F3A4B5C6';me={id:'dev-a',name:'Синий'};
 const state=initialMatch();
 server={phase:'planning',host:'dev-a',side:'A',
  players:[{id:'dev-a',name:'Синий'},{id:'dev-b',name:'Оранжевый'}],
  seats:['dev-a','dev-b'],match:state,score:{A:2,B:1},ready:{A:scene==='plan-wait',B:scene==='plan-rival-wait'},ownPlan:scene==='plan-wait'?devPlanA():[],revision:0};
 show('play');
}
function devSounds(){
 show('menu');$('menu').classList.add('hidden');
 const root=document.createElement('section');root.id='arenaDevSoundLab';root.className='view arena-dev-sound-lab';
 const entries=[['tap','Нажатие'],['plan','Команда плана'],['move','Перемещение'],
  ['hit','Попадание'],['block','Щит / блок'],['attack','Взмах атаки'],['shield','Поднятие щита'],['collapse','Обрушение'],['win','Победа'],['error','Ошибка']];
 root.innerHTML='<h2>Звуки 5×5 Arena</h2><p>Это реальные игровые сигналы. Нажми на звук для воспроизведения, включая режим с отключённым в основной игре звуком.</p>'+
 '<div class="arena-dev-sounds">'+entries.map(([key,title])=>
 '<button type="button" data-arena-audio="'+key+'">'+title+' <small>'+key+'</small></button>').join('')+
 '</div><output class="arena-dev-status" aria-live="polite">Выбери любой сигнал.</output>';
 document.querySelector('.shell').append(root);
 root.querySelectorAll('[data-arena-audio]').forEach(b=>b.addEventListener('click',()=>{
  const id=b.dataset.arenaAudio;soundFX(id);
  root.querySelector('output').textContent='Воспроизведён звук: '+b.textContent.trim();
 }));
}
function initDevPreview(requested){
 if(!IS_DEV_FRAME)return;
 const scene=devScene(requested);
 gameToken++;clearTimeout(replayTimer);clearTimeout(toastTimer);
 replayPaused=true;animating=false;animFrame=null;showingOutcome=false;modalOpen=false;recording=false;
 attackMode=false;attackDirs=[];plan=[];editingSlot=null;server=null;offline=null;net=null;me=null;roomId='';busy=false;connected=false;
 $('modal').classList.add('hidden');$('toast').classList.remove('show');
 document.getElementById('arenaDevSoundLab')?.remove();
 mode='solo';
 offline={phase:'planning',turn:'A',pending:{A:null,B:null},match:initialMatch(),score:{A:2,B:1}};
 if(scene==='menu'){show('menu');return;}
 if(scene==='difficulty'){show('difficultyView');return;}
  if(scene==='archive-empty'){devHistory=[];show('archive');return;}
  if(scene==='archive-list'){
   const sample=devCombat('collapse').match;
   devHistory=[captureHistory(sample,{mode:'hotseat',seriesId:'dev-archive',score:{A:1,B:1},players:['Синий','Оранжевый']})];
   show('archive');return;
  }
 if(scene==='rules'){show('menu');showRules();return;}
 if(scene==='sounds'){devSounds();return;}
 if(scene.startsWith('lobby-')){devLobby(scene);return;}
 if(scene==='plan-wait'||scene==='plan-rival-wait'){devPlayOnline(scene);return;}
 if(['planning','plan-partial','plan-attack','plan-full','plan-route','plan-edit','plan-danger','round-four'].includes(scene)){
  if(scene==='plan-partial')plan=['right','up','shield'];
  if(scene==='plan-attack'){plan=['up'];attackMode=true;attackDirs=['right'];}
  if(scene==='plan-full')plan=devPlanA();
  if(scene==='plan-route')plan=['right','left','right','left','shield'];
  if(scene==='plan-edit'){plan=devPlanA();editingSlot=2;}
  if(scene==='plan-danger'){offline.match.round=4;plan=['up','right','down','left','shield'];}
  if(scene==='round-four'){offline.match.round=4;offline.match.units.A={x:1,y:2,alive:true};offline.match.units.B={x:3,y:2,alive:true};}
  show('play');render();return;
 }
 if(scene==='handoff'){mode='hotseat';offline.pending.A=devPlanA();show('play');handoff();return;}
 if(scene==='pause'){show('play');confirmReturn();return;}
 if(['win','lose','draw'].includes(scene)){
  offline.phase='finished';offline.match.outcome=scene==='win'?'A':scene==='lose'?'B':'draw';
  offline.match.units.A.alive=scene!=='lose';offline.match.units.B.alive=scene!=='win';
  show('play');finish();return;
 }
 if(scene==='toast'){show('play');toast('План успешно подтверждён');return;}
 if(scene==='replay'||scene==='replay-end'||scene==='replay-playing'||scene==='replay-analysis'){
  offline.match=devCombat('move').match;
  offline.phase=offline.match.outcome?'finished':'planning';
  show('play');openReplay();
  if(scene==='replay-end'||scene==='replay-analysis'){replayIndex=currentRecord().frames.length;paintReplay();}
  if(scene==='replay-playing')toggleReplay();
  return;
 }
 if(scene.startsWith('anim-')){
  const kind=scene.slice(5);
  const actual=kind==='attack'?'attack':kind==='shield'?'shield':kind==='mutual'?'mutual':kind==='collapse'?'collapse':'move';
  const completed=devCombat(actual);
  offline.match=completed.match;
  // Previewing combat does not accidentally trigger an end-of-match dialog.
  offline.phase='planning';
  show('play');animateRecord(completed.record);
  return;
 }
 if(scene.startsWith('fx-')){
  if(scene==='fx-danger'){
   offline.match.round=4;offline.match.units.A={x:1,y:2,alive:true};offline.match.units.B={x:3,y:2,alive:true};
   show('play');return;
  }
  const data=devCombat(scene==='fx-block'?'shield':scene==='fx-fall'?'collapse':'attack');
  offline.match=data.match;
  offline.match.round=scene==='fx-fall'?4:1;
  const frame=data.record.frames[0];
  animating=true;
  animFrame={...frame,round:data.record.round};
  show('play');render();
  // Flash can be replayed by the parent's repeat control.
  return;
 }
 show('menu');
}
