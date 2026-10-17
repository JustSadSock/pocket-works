import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey} from '../../shared/capabilities/identity.js';

const root='pocket-works:folio:shared:';
const storage={
 getItem:k=>{try{return sessionStorage.getItem(root+k)}catch{return null}},
 setItem:(k,v)=>{try{sessionStorage.setItem(root+k,v)}catch{}},
 removeItem:k=>{try{sessionStorage.removeItem(root+k)}catch{}}
};
const key='pocket-net:'+location.origin+'/pocketnet';
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const cleanRoom=value=>{
 let raw=String(value||'').trim();
 if(raw.includes('?')){try{raw=new URL(raw,location.href).searchParams.get('room')||''}catch{return ''}}
 return /^(?:[a-f0-9]{8}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(raw)?raw.toLowerCase():'';
};
const sizeOf=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const trimStroke=stroke=>{
 if(stroke.tool==='fill')return sizeOf(stroke)<7000&&(stroke.bands?.length<=650||stroke.runs?.length<=650)?stroke:null;
 if(!Array.isArray(stroke.points))return null;
 const old=stroke.points;
 // Keep the first and last points and a uniform sample; never split one undoable gesture.
 const count=Math.min(225,old.length);
 const points=count===old.length?old:Array.from({length:count},(_,i)=>old[Math.round(i*(old.length-1)/(count-1))]);
 const normalized={...stroke,points:points.map(p=>p.map(n=>Math.round(n*100)/100))};
 return sizeOf(normalized)<7000?normalized:null;
};

export function createFolioCollab({onSnapshot,onOperation,onRemove,onPreview,onStatus,onExit,notify}){
 let net=null,epoch=0,roomId='',revision=-1,ownId='',members=[],mode='',status='idle',error='',pending=new Map(),previews=new Map(),timer=0,lastPreview=0,invitation='',reconnecting=false,redoAllowed=false;
 try{pending=new Map(JSON.parse(storage.getItem('pending')||'[]'))}catch{}
 const persistPending=()=>{try{storage.setItem('pending',JSON.stringify([...pending]))}catch{}};
 const active=()=>Boolean(roomId)&&['ready','reconnecting','joining'].includes(status);
 const usable=()=>status==='ready'&&net?.socket?.readyState===WebSocket.OPEN;
 const notifyStatus=()=>onStatus({active:active(),ready:usable(),status,error,roomId,ownId,players:members,invitation});
 const send=packet=>{if(net?.socket?.readyState!==WebSocket.OPEN)return false;try{net.sendGame(packet);return true}catch{return false}};
 const flush=()=>{if(!usable())return;for(const s of pending.values())send({type:'commit',stroke:s})};
 function applySnapshot(s){
  if(!s?.doc?.layers||s.protocol!==1||!Number.isInteger(s.revision))return;
  revision=s.revision;members=s.players||members;redoAllowed=Boolean(s.redoBy?.[ownId]);
  for(const stroke of s.doc.layers[0].strokes||[])pending.delete(stroke.id);
  persistPending();
  status='ready';error='';reconnecting=false;
  onSnapshot(s.doc,[...pending.values()]);notifyStatus();flush();
 }
 function applyOp(data){
  if(!data||!Number.isInteger(data.revision))return;
  if(data.revision<=revision)return;
  if(data.revision!==revision+1){send({type:'sync'});return}
  revision=data.revision;
  pending.delete(data.stroke.id);persistPending();previews.delete(data.stroke.author);
  if(data.stroke.author===ownId)redoAllowed=false;
  onOperation(data.stroke);onPreview([...previews.values()]);notifyStatus();
 }
 function applyRemove(data){
  if(!data||!Number.isInteger(data.revision))return;
  if(data.revision<=revision)return;
  if(data.revision!==revision+1){send({type:'sync'});return}
  revision=data.revision;if(data.author===ownId)redoAllowed=Boolean(data.canRedo);onRemove(data.id);notifyStatus();
 }
 function teardown(sendLeave=true){
  const previous=net;
  if(previous){if(sendLeave&&previous.socket?.readyState===WebSocket.OPEN)try{previous.leaveRoom()}catch{}
   previous.close();}
  net=null;epoch++;roomId='';status='idle';error='';revision=-1;redoAllowed=false;previews.clear();
  onPreview([]);storage.removeItem('pending');pending.clear();persistPending();
  notifyStatus();
 }
 async function connect(action,rawCode='',title='Общий холст',format='square'){
  if(net)teardown(false);
  error='';status='connecting';mode=action;notifyStatus();
  const id=epoch;
  try{
   const identity=await getPocketIdentity().catch(()=>null);
   if(epoch!==id)return;
   // Namespace PocketNet storage to FOLIO and this tab: other games cannot steal the token.
   const name=preferredPocketName(identity,'Художник');
   const previous=JSON.parse(storage.getItem(key)||'null');
   if(previous&&action!=='resume'){delete previous.roomId;storage.setItem(key,JSON.stringify(previous))}
   const instance=new PocketNet({serverUrl:location.origin+'/pocketnet',name,storage,identityKey:pocketIdentitySessionKey(identity)});
   net=instance;
   instance.on('connected',message=>{
    if(epoch!==id)return;ownId=message.player.id;status='joining';notifyStatus();
    // PocketNet itself rejoins a remembered room on reconnect; do not create
    // a second room or send a conflicting join request.
    if(instance.roomId)return;
    if(action==='create')instance.createRoom('folio',{title,format});
    else if(action==='join')instance.joinRoom(cleanRoom(rawCode));
    else if(!instance.roomId){error='Комната уже закрыта';status='error';notifyStatus();}
   });
   instance.on('room_joined',message=>{
    if(epoch!==id)return;
    if(message.gameId!=='folio'||message.version!=='v1'){
     error='Эта комната использует несовместимый формат. Обновите FOLIO и создайте новую.';
     status='error';notifyStatus();return;
    }
    roomId=message.roomId;invitation=location.origin+'/apps/folio/?room='+roomId.slice(0,8);
    applySnapshot(message.state);
    const url=new URL(location.href);url.searchParams.set('room',roomId.slice(0,8));history.replaceState(null,'',url);
   });
   instance.on('game_event',message=>{
    if(epoch!==id)return;const event=message.event;
    if(event?.type==='state')applySnapshot(event.payload);
    else if(event?.type==='op')applyOp(event.payload);
    else if(event?.type==='remove')applyRemove(event.payload);
    else if(event?.type==='preview'&&event.payload?.author!==ownId){
     const author=event.payload.author;
     if(event.payload.stroke)previews.set(author,event.payload.stroke);else previews.delete(author);
     onPreview([...previews.values()]);
    }else if(event?.type==='roster'){members=event.payload||members;notifyStatus()}
    else if(event?.type==='reject'){
     const id=event.payload?.id||'';
     pending.delete(id);persistPending();
     error=String(event.payload?.message||'Мазок отклонён');
     notify(error);notifyStatus();send({type:'sync'});
    }else if(event?.type==='notice'){
     error=String(event.payload||'Команда отклонена');
     notify(error);notifyStatus();
    }
   });
   instance.on('presence',message=>{if(epoch!==id)return;members=message.players||members;notifyStatus()});
   instance.on('disconnected',()=>{if(epoch!==id)return;status='reconnecting';reconnecting=true;onPreview([]);notifyStatus()});
   instance.on('room_closed',()=>{if(epoch!==id)return;error='Комната закрылась. Копия осталась в альбоме.';onExit();teardown(false)});
   instance.on('error',message=>{
    if(epoch!==id)return;
    const kind=message?.code||message?.message||'network_error';
    const fatal=['room_not_found','room_version_unavailable','room_full','account_already_in_room','game_unavailable'];
    error=({room_not_found:'Комната не найдена или истекла.',room_full:'Комната заполнена (6 художников).',account_already_in_room:'Этот Pocket ID уже участвует в комнате.',rate_limited:'Слишком частые команды.'})[kind]||String(kind);
    if(fatal.includes(kind)){onExit();teardown(false);error=String(kind)}
    else status='reconnecting';
    notifyStatus();
   });
   await instance.connect();
  }catch(e){
   if(epoch!==id)return;error=String(e.message||e);status='error';notifyStatus();
  }
 }
 function commit(stroke){
  if(!active())return stroke;
  const prepared=trimStroke(stroke);
  if(!prepared){notify('Мазок слишком велик для совместного холста. Разбей его на несколько коротких.');return null;}
  prepared.author=ownId;
  pending.set(prepared.id,prepared);persistPending();
  if(usable())send({type:'commit',stroke:prepared});
  notifyStatus();return prepared;
 }
 function preview(stroke){
  if(!usable()||!stroke||stroke.tool==='fill')return;
  const now=performance.now();if(now-lastPreview<260)return;
  lastPreview=now;
  const all=stroke.points,count=Math.min(60,all.length);
  const visible=count===all.length?all:Array.from({length:count},(_,i)=>all[Math.round(i*(all.length-1)/(count-1))]);
  send({type:'preview',stroke:{...stroke,points:visible.map(p=>p.map(n=>Math.round(n*100)/100))}});
 }
 function endPreview(){if(usable())send({type:'preview',stroke:null})}
 function leave(){
  const previously=Boolean(roomId);teardown();
  const u=new URL(location.href);u.searchParams.delete('room');history.replaceState(null,'',u);
  if(previously)notify('Совместная сессия завершена. Рисунок сохранён в твоём альбоме.');
 }
 function open(){
  const el=document.getElementById('folio-collab-dialog');
  el.hidden=false;
  const fromUrl=cleanRoom(new URL(location.href).searchParams.get('room')||'');
  if(fromUrl)document.getElementById('folio-collab-code').value=fromUrl;
  notifyStatus();
 }
 function close(){document.getElementById('folio-collab-dialog').hidden=true}
 async function copy(){
  if(!invitation)return;
  try{await navigator.clipboard.writeText(invitation);notify('Ссылка на общий холст скопирована')}
  catch{notify('Код комнаты: '+roomId.slice(0,8).toUpperCase())}
 }
 document.getElementById('folio-collab-open').onclick=open;
 document.getElementById('folio-collab-studio').onclick=open;
 document.getElementById('folio-collab-close').onclick=close;
 document.getElementById('folio-collab-create').onclick=()=>void connect('create','',document.getElementById('folio-collab-title').value.trim(),document.getElementById('folio-collab-format').value);
 document.getElementById('folio-collab-join').onclick=()=>{
  const code=cleanRoom(document.getElementById('folio-collab-code').value);
  if(!code){notify('Введите код из восьми символов или ссылку');return}
  void connect('join',code);
 };
 document.getElementById('folio-collab-copy').onclick=()=>void copy();
 document.getElementById('folio-collab-leave').onclick=()=>{
  if(!confirm('Выйти из совместного холста? Рисунок останется в твоём альбоме.'))return;
  leave();close();
 };
 document.getElementById('folio-collab-dialog').addEventListener('click',e=>{if(e.target.id==='folio-collab-dialog')close()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&usable())send({type:'sync'})});
 // Invite links are opt-in; never silently open a room on a shared device.
 if(cleanRoom(new URL(location.href).searchParams.get('room')||''))queueMicrotask(open);
 return {active,ready:usable,commit,preview,endPreview,leave,open,close,
  undo:()=>usable()&&send({type:'undo'}),redo:()=>usable()&&send({type:'redo'}),
  isMine:stroke=>stroke?.author===ownId,canRedo:()=>redoAllowed,pending:()=>pending.size};
}
