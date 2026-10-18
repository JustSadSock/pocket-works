import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey} from '../../shared/capabilities/identity.js';

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
let client=null,room=null,view=null,lock=false,connectPromise=null,selectedSize='medium',active=false;
// PocketNet's generic key is shared by other Pocket Works games. Namespace
// Fog credentials/rooms so launching another game cannot steal this session.
const scopedStore=base=>({
 getItem:key=>base.getItem('fog-of-conquest:net:'+key),
 setItem:(key,value)=>base.setItem('fog-of-conquest:net:'+key,value),
 removeItem:key=>base.removeItem('fog-of-conquest:net:'+key)
});
const memberStore=scopedStore(localStorage),guestStore=scopedStore(sessionStorage);
const storageFor=identity=>identity?.complete?memberStore:guestStore;
const message=text=>{status.textContent=text;};
const roomCode=()=>room?.roomId?.slice(0,8).toUpperCase()||'';
const canIssue=()=>Boolean(active&&view?.game?.phase==='battle'&&view.game.state.currentPlayer===view.side&&!lock&&client?.socket?.readyState===WebSocket.OPEN);
function refresh(){
 start.disabled=!(room&&view?.phase==='lobby'&&view.host===view.viewerId&&view.seats.length===2&&client?.socket?.readyState===WebSocket.OPEN);
 copyCode.disabled=!room;
 if(view?.phase==='lobby')message(view.seats.length===2?'Оба полководца в комнате · '+roomCode():'Код '+roomCode()+' · ожидается соперник');
 if(active&&view?.game){
   const connected=client?.socket?.readyState===WebSocket.OPEN;
   $('endTurnBtn').disabled=!canIssue();
   turn.textContent=!connected?'Связь потеряна':canIssue()?'Твой ход':view.game.state.currentPlayer!==view.side?'Ход соперника':lock?'Приказ обрабатывается':'Партия завершена';
 }
}
function installListeners(net){
 net.on('connected',()=>{
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
   if(!room||packet.roomId!==room.roomId)return;
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
 if(connectPromise)return connectPromise;
 connectPromise=(async()=>{
   // PocketNet tokens cannot be reused by another Pocket ID account.
   // Guests live in sessionStorage so two local testing tabs get separate seats.
   const identity=await getPocketIdentity({force:true});
   const identityKey=pocketIdentitySessionKey(identity);
   const storage=storageFor(identity);
   let nick='Полководец';
   try{nick=localStorage.getItem('fog-of-conquest:online-nick')||nick;}catch{}
   nick=preferredPocketName(identity,nick);
   if(client&&(client.identityKey!==identityKey||client.storage!==storage)){
     client.close();client=null;room=null;view=null;active=false;
   }
   if(!client){
     client=new PocketNet({serverUrl:location.origin+'/pocketnet',name:nick,identityKey,storage});
     installListeners(client);
   }
   message('Подключаемся к PocketNet…');
   try{await client.connect();return client;}
   catch(error){message('Не удалось подключиться: '+String(error?.message||error));throw error;}
 })();
 try{return await connectPromise;}
 finally{connectPromise=null;}
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
 window.FogLeaveOnline?.();
 $('victoryOverlay').style.display='none';
 $('waitOverlay').style.display='none';
 lobby.style.display='none';$('startPanel').style.display='flex';
 $('newGameOptions').style.display='flex';message('Комната закрыта на этом устройстве.');refresh();
}
start.addEventListener('click',()=>{if(start.disabled)return;try{client.sendGame({type:'start',size:selectedSize,beta:false});start.disabled=true;message('Создаём поле сражения…');}catch(e){message(String(e.message||e));}});
copyCode.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roomCode());message('Код '+roomCode()+' скопирован.');}catch{input.value=roomCode();input.select();message('Код выделен · скопируй его.');}});
window.FogPocketNet={create,join,issue,leave,canIssue,refresh};
// Visible lobby actions become usable only after the online bridge has loaded.
$('createRoomBtn').disabled=false;
$('joinRoomBtn').disabled=false;
for(const id of ['settingsMenuBtn','victoryMenuBtn','victoryOkBtn'])$(id)?.addEventListener('click',()=>{if(active)leave();},true);
// Restore a valid seat only for the same Pocket ID or the current guest tab.
void getPocketIdentity({force:true}).then(identity=>{
 const storage=storageFor(identity);
 try{
   const saved=JSON.parse(storage.getItem('pocket-net:'+location.origin+'/pocketnet')||'null');
   if(saved?.roomId&&saved?.identityKey===pocketIdentitySessionKey(identity))
     void ensure().catch(()=>{});
 }catch{}
}).catch(()=>{});
document.addEventListener('pocket-id:changed',event=>{
 if(!client||client.identityKey===pocketIdentitySessionKey(event.detail?.user))return;
 client.close();client=null;room=null;view=null;active=false;lock=false;
 window.FogLeaveOnline?.();lobby.style.display='none';
 $('startPanel').style.display='flex';$('newGameOptions').style.display='flex';
 message('Профиль изменён. Сетевая сессия завершена.');refresh();
});
