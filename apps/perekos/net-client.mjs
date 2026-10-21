import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,pocketIdentitySessionKey} from '../../shared/capabilities/identity.js';
const GAME='perekos',RULES=4;
const CODE=/^[0-9a-f]{8}$/i;
const FULL=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const scopedStorage={getItem:k=>{try{return localStorage.getItem('perekos-net:'+k)}catch{return null}},setItem:(k,v)=>{try{localStorage.setItem('perekos-net:'+k,v)}catch{}}};
export class OnlineDuel {
 constructor({onView,onStatus,onError,onRoom,onPresence}){
  this.onView=onView;this.onStatus=onStatus;this.onError=onError;this.onRoom=onRoom;this.onPresence=onPresence;
  this.client=null;this.room=null;this.view=null;this.seq=0;this.lastSent=0;this.connected=false;this.intent=null;
 }
 get active(){return !!this.room}
 get me(){return this.view?.me??0}
 async open(kind='create',code=''){
  if(!['create','join','resume'].includes(kind))throw Error('bad_intent');
  if(kind==='join'&&!CODE.test(code)&&!FULL.test(code))throw Error('Введите код из восьми символов.');
  if(this.client){this.client.close();this.client=null}
  this.room=null;this.view=null;this.connected=false;this.intent=kind;
  this.onStatus('Подключаемся к PocketNet…');
  const profile=await getPocketIdentity().catch(()=>null);
  const name=profile?.complete?profile.nickname||'Маг':'Гость · Маг';
  const client=new PocketNet({serverUrl:location.origin+'/pocketnet',name,identityKey:pocketIdentitySessionKey(profile),storage:scopedStorage});
  this.client=client;
  if(kind!=='resume'){client.roomId=null;client.persist()}
  client.on('connected',()=>{
   if(this.client!==client)return;
   this.connected=true;this.onStatus('Соединение установлено');
   if(this.intent==='create')client.createRoom(GAME,{});
   else if(this.intent==='join')client.joinRoom(code);
   else if(!client.roomId)this.onError('Нет сохранённой комнаты.');
   // PocketNet.connect() automatically rejoins the saved room after auth.
   // No sync message before room_joined: the server has not attached our seat yet.
   this.intent=null;
  });
  client.on('room_joined',packet=>{
   if(this.client!==client)return;
   if(packet.gameId!==GAME){this.onError('Это комната другой игры.');this.leave();return}
   if(packet.state?.rulesVersion!==RULES){this.onError('Комната использует другую версию правил.');this.leave();return}
   this.room=packet.roomId;this.seq=Math.max(0,(packet.state?.nextSeq||1)-1);this.view=packet.state;
   this.onRoom(packet.roomId);
   this.onPresence(packet.players||[]);
   if(this.connected)this.send({type:'sync'});
   this.onView(packet.state);
   this.onStatus('В комнате');
  });
  client.on('game_event',packet=>{
   if(packet.roomId!==this.room)return;
   if(packet.event?.type==='notice')this.onStatus(typeof packet.event.payload==='string'?packet.event.payload:'Действие не принято.');
   if(packet.event?.type==='state'){
    const view=packet.event.payload;
    if(view?.rulesVersion!==RULES){this.onError('Правила комнаты изменились. Войдите заново.');return}
    if((view.revision??-1)<(this.view?.revision??-1))return;
    const previousRound=this.view?.match?.round;
    if(view.phase==='fight'&&view.match?.round!==previousRound)this.seq=Math.max(0,(view.nextSeq||1)-1);
    else if(Number.isSafeInteger(view.nextSeq)&&view.nextSeq>this.seq+1)this.seq=view.nextSeq-1;
    this.view=view;this.onView(view);
   }
  });
  client.on('presence',packet=>{if(packet.roomId===this.room)this.onPresence(packet.players||[],packet.disconnected)});
  client.on('disconnected',()=>{this.connected=false;this.onStatus('Связь потеряна. Переподключаемся…')});
  client.on('error',msg=>this.onError(msg.code?'Ошибка сети: '+msg.code:String(msg)));
  client.on('room_closed',()=>{this.room=null;this.view=null;this.onError('Комната закрыта.');});
  client.on('room_kicked',()=>{this.room=null;this.view=null;this.onError('Вы вышли из комнаты.');});
  try{await client.connect();return true}catch(error){if(this.client===client){this.onError(error.message||'Не удалось подключиться');client.close();this.client=null}return false}
 }
 send(payload){
  if(!this.room||!this.connected)return false;
  try{this.client.sendGame(payload);return true}catch{this.onStatus('Связь прервана');return false}
 }
 sample(ctl,round,now){
  if(!this.active||!this.connected||this.view?.phase!=='fight'||now-this.lastSent<115)return false;
  this.lastSent=now;this.seq++;
  const control=typeof ctl==='function'?ctl():ctl;
  return this.send({type:'input',seq:this.seq,round,control});
 }
 start(){return this.send({type:this.view?.phase==='result'?'rematch':'start'})}
 chooseMage(mageId){return this.send({type:'mage',mageId})}
 pick(rune,replace){return this.send({type:'pick',rune,replace})}
 order(runes){return this.send({type:'order',runes})}
 ready(runes){return this.send({type:'ready',runes})}
 sync(){return this.send({type:'sync'})}
 leave(){
  if(this.client){try{if(this.connected&&this.room)this.client.leaveRoom()}catch{}this.client.close()}
  this.client=null;this.room=null;this.view=null;this.connected=false;this.intent=null;this.seq=0;this.onRoom(null);
 }
}
export function inviteCode(roomId){return typeof roomId==='string'?roomId.replaceAll('-','').slice(0,8).toUpperCase():''}
export function incomingCode(url=location.href){
 try{const code=new URL(url).searchParams.get('room')||'';return CODE.test(code)||FULL.test(code)?code:''}catch{return''}
}
