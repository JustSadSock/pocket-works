import {PocketNet} from '../../shared/capabilities/net.js';
const errors={room_not_found:'Комната не найдена или истекла.',room_full:'В комнате уже два бойца.',game_unavailable:'Серверные правила Katana Echo пока недоступны.',room_version_unavailable:'Версия комнаты больше недоступна.',account_already_in_room:'Аккаунт уже находится в комнате.',rate_limited:'Слишком частые команды. Попробуй снова.',invalid_token:'Сессия истекла. Переподключись.',server_at_capacity:'Сервер заполнен.'};
export class PocketSocket extends EventTarget{
 static OPEN=1;
 constructor(){
  super();this.readyState=0;this.creating=!!globalThis.katanaCreate;this.opened=false;
  const storage={getItem:k=>{try{return sessionStorage.getItem('pocket-works:katana-echo:'+k)}catch{return null}},
   setItem:(k,v)=>{try{sessionStorage.setItem('pocket-works:katana-echo:'+k,v)}catch{}},
   removeItem:k=>{try{sessionStorage.removeItem('pocket-works:katana-echo:'+k)}catch{}}};
  this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:document.querySelector('#name').value||'Ронин',storage});
  this.net.on('connected',m=>{this.id=m.player.id;this.readyState=1;
   if(!this.opened){this.opened=true;this.dispatchEvent(new Event('open'));}});
  this.net.on('room_joined',m=>{this.code=m.roomId.slice(0,8).toUpperCase();
   this.message({type:'room',data:{roomCode:this.code,playerId:this.id,map:m.state?.map,mode:m.state?.mode}});
   if(m.state)this.apply(m.state);});
  this.net.on('game_event',m=>{if(m.event?.type==='state'&&m.event.payload)this.apply(m.event.payload)});
  this.net.on('error',m=>this.fail(m));
  this.net.on('room_closed',()=>this.fail({code:'room_closed',message:'Комната закрыта'}));
  this.net.on('room_kicked',()=>this.fail({message:'Ты исключён из комнаты'}));
  this.net.on('disconnected',()=>{this.readyState=0;this.dispatchEvent(new Event('close'))});
  this.net.connect().catch(e=>this.fail(e));
 }
 fail(e){const message=errors[e?.code]||e?.message||e?.code||'Ошибка сети';
  this.dispatchEvent(new CustomEvent('error',{detail:{message}}));}
 message(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}))}
 apply(v){this.message({type:'state',data:v})}
 send(text){
  const packet=JSON.parse(text);
  if(packet.type==='join'){
   if(this.creating)this.net.createRoom('katana-echo',{mode:packet.mode});
   else if(packet.roomCode)this.net.joinRoom(packet.roomCode.trim());
   else this.fail({message:'Укажи код комнаты'});
  }else this.net.sendGame(packet);
 }
 leave(){
  try{if(this.readyState===1)this.net.leaveRoom();
  else{this.net.roomId=null;this.net.persist()}}catch{}
 }
 close(){this.net.close();this.readyState=3}
}
