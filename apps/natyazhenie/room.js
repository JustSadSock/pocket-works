import {PocketNet} from '../../shared/capabilities/net.js';
const memory=new Map();
const store={getItem(k){try{return sessionStorage.getItem('natyazhenie:'+k);}catch{return memory.get(k)||null;}},
 setItem(k,v){try{sessionStorage.setItem('natyazhenie:'+k,v);}catch{memory.set(k,v);}},
 removeItem(k){try{sessionStorage.removeItem('natyazhenie:'+k);}catch{memory.delete(k);}}};
export class GameRoom{
 constructor(callbacks){this.callbacks=callbacks;this.client=null;this.epoch=0;this.connected=false;this.roomId='';this.self=null;}
 dispatch(type,data){this.callbacks[type]?.(data);}
 async open({name,identityKey,action,code}){
  this.close();const id=++this.epoch;
  if(action!=='resume')store.removeItem('pocket-net:'+location.origin+'/pocketnet');
  const net=new PocketNet({serverUrl:location.origin+'/pocketnet',name,identityKey,storage:store});
  this.client=net;
  net.on('connected',data=>{if(id!==this.epoch)return;this.connected=true;this.self=data.player;this.dispatch('connected',data);});
  net.on('room_joined',data=>{if(id!==this.epoch)return;this.roomId=data.roomId;this.dispatch('joined',data);});
  net.on('game_event',data=>{if(id!==this.epoch)return;if(data.event?.type==='state')this.dispatch('state',data.event.payload);else if(data.event?.type==='notice')this.dispatch('notice',data.event.payload);});
  net.on('presence',data=>{if(id!==this.epoch)return;this.dispatch('presence',data);this.send({type:'sync'});});
  net.on('disconnected',()=>{if(id!==this.epoch)return;this.connected=false;this.dispatch('disconnected');});
  net.on('room_closed',()=>{if(id!==this.epoch)return;this.roomId='';this.dispatch('closed');});
  net.on('error',error=>{if(id!==this.epoch)return;this.dispatch('error',error);});
  try{
   await Promise.race([net.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Сервер не ответил')),12000))]);
   if(id!==this.epoch)return;
   if(action==='create')net.createRoom('natyazhenie');
   else if(action==='join')net.joinRoom(code);
   else if(!net.roomId)this.dispatch('error',Error('Нет сохранённой комнаты'));
  }catch(error){if(id===this.epoch){this.dispatch('error',error);this.close();}}
 }
 send(payload){if(!this.connected||!this.client)return false;
  try{this.client.sendGame(payload);return true;}catch{return false;}}
 close(){this.epoch++;const old=this.client;this.client=null;this.connected=false;this.roomId='';this.self=null;
  if(old){try{if(old.roomId)old.leaveRoom();}catch{}try{old.close();}catch{}}}
 code(){return this.roomId.slice(0,8).toUpperCase();}
 link(){const url=new URL(location.pathname,location.origin);url.searchParams.set('room',this.code());return url.href;}
}
export function cleanRoomCode(raw){
 let x=String(raw||'').trim();
 try{const u=new URL(x);if(u.searchParams.has('room'))x=u.searchParams.get('room')||'';}catch{}
 return /^(?:[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(x)?x.toUpperCase():null;
}
