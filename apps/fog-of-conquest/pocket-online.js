import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
installMobileRuntime();
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey} from '../../shared/capabilities/identity.js';

// The only network transport is PocketNet. All actions are intents, validated
// on the server. Offline original rules and local saves remain separate.
const $=id=>document.getElementById(id);
const lobby=$('lobbyPanel'),input=$('roomIdInput');
const status=document.createElement('p');
status.id='onlineStatus';status.setAttribute('role','status');
status.setAttribute('aria-live','polite');lobby.insertBefore(status,lobby.lastElementChild);
const controls=document.createElement('div');controls.id='onlineLobbyControls';
const start=document.createElement('button');start.type='button';start.className='game-btn';start.textContent='Начать матч';start.disabled=true;
const copyCode=document.createElement('button');copyCode.type='button';copyCode.className='game-btn';copyCode.textContent='Копировать код';copyCode.disabled=true;
controls.append(start,copyCode);lobby.append(controls);
const resume=document.createElement('button');resume.id='fogResumeRoom';resume.type='button';resume.className='game-btn';
resume.textContent='Вернуться в интернет-комнату';resume.hidden=true;$('startButtons')?.append(resume);
const leaveButton=document.createElement('button');leaveButton.id='fogLeaveRoom';leaveButton.type='button';
leaveButton.className='game-btn';leaveButton.textContent='Выйти из комнаты';leaveButton.hidden=true;
lobby.append(leaveButton);
const turn=document.createElement('span');turn.id='onlineTurnStatus';turn.setAttribute('aria-live','polite');$('controls')?.prepend(turn);
let client=null,room=null,view=null,joined=false,phase='closed',pending=null;
let connectPromise=null,selectedSize='medium',generation=0,operation=0,requestSequence=0,warning='';
let pendingTimeout=null;
function releasePending(){
 pending=null;
 if(pendingTimeout!==null)clearTimeout(pendingTimeout);
 pendingTimeout=null;
}
function watchPending(){
 if(pendingTimeout!==null)clearTimeout(pendingTimeout);
 const expected=pending?.requestId;
 if(!expected)return;
 pendingTimeout=setTimeout(()=>{
   if(!pending||pending.requestId!==expected)return;
   pending.tries=(pending.tries||0)+1;
   if(pending.tries>2){
     releasePending();
     message('Нет подтверждения приказа. Состояние будет обновлено при следующей синхронизации.');
     refresh();return;
   }
   if(connected()&&joined)try{client.sendGame({type:'sync'});}
   catch{}
   watchPending();
 },7000);
}
const scopedStore=base=>({
 getItem:key=>base.getItem('fog-of-conquest:net:'+key),
 setItem:(key,value)=>base.setItem('fog-of-conquest:net:'+key,value),
 removeItem:key=>base.removeItem('fog-of-conquest:net:'+key)
});
const memberStore=scopedStore(localStorage),guestStore=scopedStore(sessionStorage);
const storageFor=identity=>identity?.complete?memberStore:guestStore;
const storedRoom=storage=>{try{return JSON.parse(storage.getItem('pocket-net:'+location.origin+'/pocketnet')||'null')}catch{return null}};
const roomCode=()=>room?.roomId?.slice(0,8).toUpperCase()||'';
const connected=()=>client?.socket?.readyState===WebSocket.OPEN;
const canIssue=()=>Boolean(joined&&phase==='battle'&&view?.game?.phase==='battle'&&
 view.game.state.currentPlayer===view.side&&!pending&&connected());
const message=text=>{warning=String(text);status.textContent=warning;};
function refresh(){
 const knownRoom=Boolean(room||client?.roomId);
 resume.hidden=!knownRoom;
 leaveButton.hidden=!knownRoom||phase==='closed';
 start.disabled=!(joined&&phase==='lobby'&&view?.host===view?.viewerId&&
   view?.seats?.length===2&&connected());
 copyCode.disabled=!room;
 const stateText=phase==='connecting'?'Подключаемся к PocketNet…':
   phase==='reconnecting'?'Связь прервана · восстанавливаем комнату…':
   phase==='lobby'?(view?.seats?.length===2?'Оба полководца готовы · ':'Ожидается соперник · ')+roomCode():
   phase==='battle'?'Партия '+roomCode()+' · '+(view?.game?.state.currentPlayer===view?.side?'ваш ход':'ход соперника'):
   phase==='finished'?'Партия завершена · '+roomCode():'Выбери интернет-комнату';
 if(!warning)status.textContent=stateText;
 const end=$('endTurnBtn');
 if(end&&(view||knownRoom))end.disabled=!canIssue();
 turn.textContent=phase==='reconnecting'?'Нет связи':
  phase==='battle'?(pending?'Приказ проверяется':!connected()?'Нет связи':canIssue()?'Твой ход':'Ход соперника'):
  phase==='finished'?'Матч завершён':'';
}
function setPhase(next,text){
 phase=next;warning='';
 if(text)message(text);
 refresh();
}
function clearSession(text='Комната закрыта.',destroyClient=false){
 generation++;operation++;connectPromise=null;
 if(destroyClient&&client){client.close();client=null;}
 room=null;view=null;joined=false;releasePending();
 // No room ID from a previous profile may survive a stale reconnect.
 if(client){client.roomId=null;client.persist();}
 phase='closed';
 window.FogLeaveOnline?.();
 window.FogBattleClear?.();
 $('victoryOverlay').style.display='none';$('waitOverlay').style.display='none';
 lobby.style.display='none';$('startPanel').style.display='flex';
 $('newGameOptions').style.display='flex';
 setPhase('closed',text);
}
function requestId(){
 // Unique across reloads and tab sessions, bounded by the server contract.
 const random=typeof crypto?.randomUUID==='function'?crypto.randomUUID().replaceAll('-',''):
   Math.random().toString(36).slice(2)+Date.now().toString(36);
 return 'fog'+random+(++requestSequence).toString(36);
}
function acceptView(next){
 if(!next||next.side!==1&&next.side!==2)return;
 const previous=view?.game?.revision||0;
 // A delayed, out-of-order state must never overwrite the latest snapshot.
 if(view?.game&&next.game&&next.game.revision<previous)return;
 view=next;joined=true;
 if(pending&&next.game&&next.game.revision>pending.revision)releasePending();
 if(next.game){
   window.FogBattleSync?.(next,room?.roomId);
   phase=next.game.phase==='finished'||next.phase==='finished'?'finished':'battle';
   window.FogApplyOnlineView?.(next);
 }else{
   phase=next.phase==='finished'?'finished':'lobby';
   $('startPanel').style.display='none';lobby.style.display='flex';
 }
 warning='';refresh();
}
function recoverPending(net){
 if(!pending||!connected()||phase!=='battle'||!joined)return;
 if(view.game.revision!==pending.revision){releasePending();refresh();return;}
 try{
   net.sendGame(pending.command); // Same request ID and revision, never a new order.
   refresh();
 }catch(e){message('Повторная синхронизация невозможна: '+String(e));}
}
function installListeners(net){
 const current=()=>net===client&&!net.closed;
 net.on('connected',()=>{
   if(!current())return;
   joined=false;
   if(net.roomId)setPhase('reconnecting','Восстанавливаем комнату…');
   else setPhase('connecting','Соединение установлено');
 });
 net.on('room_joined',packet=>{
   if(!current()||packet.gameId!=='fog-of-conquest')return;
   // Never accept a late acknowledgement for an explicitly abandoned room.
   if(room&&room.roomId!==packet.roomId)return;
   room=packet;
   acceptView(packet.state);
   recoverPending(net);
 });
 net.on('game_event',packet=>{
   if(!current()||!room||packet.roomId!==room.roomId)return;
   const event=packet.event;
   if(event?.type==='notice'){
     if(!event.requestId||!pending||event.requestId===pending.requestId)releasePending();
     message(String(event.payload||'Приказ отклонён'));refresh();return;
   }
   if(event?.type==='ack'){
     if(pending?.requestId===event.requestId)releasePending();
     if(event.status==='duplicate')message('Повторный приказ уже учтён сервером.');
     refresh();return;
   }
   if(event?.type==='battle_event'){
     window.FogBattleEvent?.(event.payload);return;
   }
   if(event?.type!=='state')return;
   acceptView(event.payload);
 });
 net.on('presence',packet=>{
   if(!current()||!room||packet.roomId!==room.roomId)return;
   room.players=packet.players;
   if(phase==='lobby'&&view) {warning='';refresh();}
 });
 net.on('disconnected',()=>{
   if(!current())return;
   joined=false;
   setPhase('reconnecting','Связь прервана · восстанавливаем сессию…');
 });
 net.on('error',error=>{
   if(!current())return;
   const code=String(error?.code||error?.message||'ошибка соединения');
   if(['room_not_found','room_version_unavailable','not_in_room','room_kicked'].includes(code)){
     clearSession(code==='room_version_unavailable'?'Версия правил этой комнаты больше недоступна. Начни новый матч.':
       'Комната больше недоступна. Можно создать новую.',true);
     return;
   }
   message('Ошибка PocketNet: '+code);refresh();
 });
 for(const type of ['room_closed','room_kicked']){
   net.on(type,packet=>{
     if(!current()||room&&packet?.roomId&&packet.roomId!==room.roomId)return;
     clearSession(type==='room_kicked'?'Доступ к комнате закрыт.':'Комната закрыта.',true);
   });
 }
}
async function ensure(){
 const generationAtStart=generation;
 // Never reuse an old live socket before checking the current Pocket ID.
 const identity=await getPocketIdentity({force:true});
 if(generationAtStart!==generation)throw Error('Профиль изменился.');
 const identityKey=pocketIdentitySessionKey(identity);
 const storage=storageFor(identity);
 if(client&&(client.identityKey!==identityKey||client.storage!==storage)){
   client.close();client=null;joined=false;room=null;view=null;releasePending();connectPromise=null;
 }
 if(client&&connected())return client;
 if(connectPromise)return connectPromise;
 let nick='Полководец';
 try{nick=localStorage.getItem('fog-of-conquest:online-nick')||nick;}catch{}
 nick=preferredPocketName(identity,nick);
 const net=client||(client=new PocketNet({serverUrl:location.origin+'/pocketnet',name:nick,identityKey,storage}));
 if(!net.listeners.has('connected'))installListeners(net);
 setPhase(net.roomId?'reconnecting':'connecting');
 const flight=net.connect().then(()=>{
   if(generationAtStart!==generation||net!==client){net.close();throw Error('Подключение отменено.');}
   return net;
 });
 connectPromise=flight;
 try{return await flight;}
 catch(error){
   if(net===client)message('Не удалось подключиться: '+String(error?.message||error));
   throw error;
 }finally{if(connectPromise===flight)connectPromise=null;}
}
async function create(size){
 const current=++operation;
 selectedSize=size||'medium';
 try{
   const net=await ensure();
   if(current!==operation)return;
   if(net.roomId)net.leaveRoom();
   window.FogBattleClear?.();
   room=null;view=null;joined=false;releasePending();
   setPhase('connecting','Создаём комнату…');
   net.createRoom('fog-of-conquest',{});
 }catch(error){if(current===operation){message(String(error?.message||error));refresh();}}
}
async function join(code){
 const current=++operation;
 const trimmed=(code||'').trim();
 if(!trimmed){message('Введите код комнаты.');return;}
 try{
   const net=await ensure();
   if(current!==operation)return;
   if(net.roomId)net.leaveRoom();
   window.FogBattleClear?.();
   room=null;view=null;joined=false;releasePending();
   setPhase('connecting','Входим в комнату…');
   net.joinRoom(trimmed);
 }catch(error){if(current===operation){message(String(error?.message||error));refresh();}}
}
function issue(action){
 if(!canIssue())return false;
 const command={type:'act',requestId:requestId(),revision:view.game.revision,action};
 pending={...command,command,tries:0};
 try{client.sendGame(command);watchPending();refresh();return true;}
 catch(error){releasePending();message('Приказ не отправлен: '+String(error?.message||error));refresh();return false;}
}
function leave(){
 // Explicit leave (unlike connection loss) forfeits an active match.
 // Closing stale sockets stops any queued automatic rejoin.
 if(connected()&&client?.roomId)try{client.leaveRoom();}catch{}
 clearSession('Ты вышел из комнаты.',true);
}
start.addEventListener('click',()=>{
 if(start.disabled||!client)return;
 try{
   const command={type:'start',size:selectedSize,beta:false,requestId:requestId()};
   client.sendGame(command);start.disabled=true;message('Создаём поле сражения…');
 }catch(error){message(String(error?.message||error));refresh();}
});
copyCode.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(roomCode());message('Код '+roomCode()+' скопирован.');}
 catch{input.value=roomCode();input.select();message('Код выделен · скопируй его.');}
});
leaveButton.addEventListener('click',leave);
resume.addEventListener('click',async()=>{
 if(resume.hidden)return;
 try{
   const net=await ensure();
   if(!joined&&net.roomId&&connected())net.joinRoom(net.roomId);
   else if(joined&&view){window.FogApplyOnlineView?.(view);refresh();}
 }catch(error){message('Возврат не удался: '+String(error?.message||error));}
});
window.FogPocketNet={create,join,issue,leave,canIssue,refresh,get phase(){return phase;},get side(){return view?.side||0;}};
$('createRoomBtn').disabled=false;$('joinRoomBtn').disabled=false;
$('lobbyBackBtn')?.addEventListener('click',()=>{if(client?.roomId)leave();},true);
for(const id of ['settingsMenuBtn','victoryMenuBtn','victoryOkBtn'])
 $(id)?.addEventListener('click',()=>{if(client?.roomId)leave();},true);
// Restore only the seat associated with the same Pocket ID or current guest tab.
const bootstrapGeneration=generation;
void getPocketIdentity({force:true}).then(identity=>{
 if(bootstrapGeneration!==generation)return;
 const saved=storedRoom(storageFor(identity));
 if(saved?.roomId&&saved.identityKey===pocketIdentitySessionKey(identity)){
   resume.hidden=false;
   void ensure().catch(()=>{resume.hidden=false;});
 }
}).catch(()=>{});
document.addEventListener('pocket-id:changed',event=>{
 const newKey=pocketIdentitySessionKey(event.detail?.user);
 if(client&&client.identityKey!==newKey)clearSession('Профиль изменён. Сетевая сессия завершена.',true);
 else generation++;
});
