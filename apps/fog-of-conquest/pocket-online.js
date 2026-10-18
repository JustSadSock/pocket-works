import {PocketNet} from '../../shared/capabilities/net.js';

// PocketNet is the only online transport. Original local rules remain untouched.
const $=id=>document.getElementById(id);
const lobby=$('lobbyPanel'),input=$('roomIdInput');
const status=document.createElement('p');status.id='onlineStatus';status.setAttribute('role','status');status.textContent='Интернет-комната PocketNet';
lobby.insertBefore(status,lobby.lastElementChild);
const controls=document.createElement('div');controls.id='onlineLobbyControls';
const start=document.createElement('button');start.type='button';start.className='game-btn';start.textContent='Начать матч';start.disabled=true;
const copyCode=document.createElement('button');copyCode.type='button';copyCode.className='game-btn';copyCode.textContent='Копировать код';copyCode.disabled=true;
controls.append(start,copyCode);lobby.append(controls);
const turn=document.createElement('span');turn.id='onlineTurnStatus';turn.setAttribute('aria-live','polite');
$('controls')?.prepend(turn);
let client=null,room=null,view=null,lock=false,connecting=false,selectedSize='medium',active=false;
const message=text=>{status.textContent=text;};
const roomCode=()=>room?.roomId?.slice(0,8).toUpperCase()||'';
const canIssue=()=>Boolean(active&&view?.game?.phase==='battle'&&view.game.state.currentPlayer===view.side&&!lock&&client?.socket?.readyState===WebSocket.OPEN);
function refresh(){
 start.disabled=!(room&&view?.phase==='lobby'&&view.host===view.viewerId&&view.seats.length===2&&client?.socket?.readyState===WebSocket.OPEN);
 copyCode.disabled=!room;
 if(view?.phase==='lobby')message(view.seats.length===2?'Оба полководца в комнате · '+roomCode():'Код '+roomCode()+' · ожидается соперник');
 if(active&&view?.game)turn.textContent=canIssue()?'Твой ход':view.game.state.currentPlayer!==view.side?'Ход соперника':lock?'Приказ обрабатывается':'Связь потеряна';
}
function installListeners(net){
 net.on('connected',()=>{
   connecting=false;
   if(net.roomId)message('Восстанавливаем комнату…');
   else message('Соединение установлено');
   refresh();
 });
 net.on('room_joined',payload=>{
   if(payload.gameId!=='fog-of-conquest')return;
   room=payload;view=payload.state;lock=false;
   if(view.game){active=true;window.FogApplyOnlineView?.(view);}
   else{active=false;$('startPanel').style.display='none';lobby.style.display='flex';}
   refresh();
 });
 net.on('game_event',packet=>{
   if(packet.event?.type==='notice'){lock=false;message(String(packet.event.payload||'Приказ отклонён'));refresh();return;}
   if(packet.event?.type!=='state')return;
   view=packet.event.payload;lock=false;
   if(view.game){active=true;window.FogApplyOnlineView?.(view);}
   refresh();
 });
 net.on('presence',packet=>{if(room)room.players=packet.players;refresh();});
 net.on('disconnected',()=>{lock=false;message('Связь прервана · восстанавливается автоматически');refresh();});
 net.on('error',error=>{lock=false;message('Ошибка PocketNet: '+String(error?.message||error?.code||'нет соединения'));refresh();});
 net.on('room_closed',()=>{room=null;view=null;lock=false;active=false;message('Комната закрыта.');refresh();});
 net.on('room_kicked',()=>{room=null;view=null;lock=false;active=false;message('Доступ к комнате закрыт.');refresh();});
}
async function ensure(){
 if(client&&client.socket?.readyState===WebSocket.OPEN)return client;
 if(connecting)return client;
 if(!client){
  let nick='Полководец';
  try{nick=localStorage.getItem('fog-of-conquest:online-nick')||nick;}catch{}
  client=new PocketNet({serverUrl:location.origin+'/pocketnet',name:nick,identityKey:'fog-v2'});
  installListeners(client);
 }
 connecting=true;message('Подключаемся к PocketNet…');
 try{await client.connect();connecting=false;return client;}
 catch(error){connecting=false;message('Не удалось подключиться: '+String(error?.message||error));throw error;}
}
async function create(size){
 try{const c=await ensure();selectedSize=size||'medium';if(c.roomId)c.leaveRoom();c.createRoom('fog-of-conquest',{});message('Создание комнаты…');}
 catch{}
}
async function join(code){
 const trimmed=(code||'').trim();
 if(!trimmed){message('Введите код комнаты.');return;}
 try{const c=await ensure();if(c.roomId)c.leaveRoom();c.joinRoom(trimmed);message('Входим в комнату…');}
 catch{}
}
function issue(action){
 if(!canIssue())return false;
 try{lock=true;client.sendGame({type:'act',revision:view.game.revision,action});refresh();return true;}
 catch(e){lock=false;message('Приказ не отправлен: '+String(e.message||e));return false;}
}
function leave(){
 try{if(client?.roomId&&client.socket?.readyState===WebSocket.OPEN)client.leaveRoom();}
 catch{}
 room=null;view=null;active=false;lock=false;
 $('victoryOverlay').style.display='none';
 $('waitOverlay').style.display='none';
 lobby.style.display='none';$('startPanel').style.display='flex';
 $('newGameOptions').style.display='flex';message('Комната закрыта на этом устройстве.');refresh();
}
start.addEventListener('click',()=>{if(start.disabled)return;try{client.sendGame({type:'start',size:selectedSize,beta:false});start.disabled=true;message('Создаём поле сражения…');}catch(e){message(String(e.message||e));}});
copyCode.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roomCode());message('Код '+roomCode()+' скопирован.');}catch{input.value=roomCode();input.select();message('Код выделен · скопируй его.');}});
window.FogPocketNet={create,join,issue,leave,canIssue,refresh};
for(const id of ['settingsMenuBtn','victoryMenuBtn','victoryOkBtn'])$(id)?.addEventListener('click',()=>{if(active)leave();},true);
// Saved PocketNet sessions retain both identity and room. Rejoin on next launch.
if(typeof localStorage!=='undefined'){
 try{const saved=JSON.parse(localStorage.getItem('pocket-net:'+location.origin+'/pocketnet')||'null');
   if(saved?.roomId&&saved.identityKey==='fog-v2')void ensure().catch(()=>{});
 }catch{}
}
