import {PocketNet} from '../../shared/capabilities/net.js';
import game from './simulation.js';
import {PRACTICE_KEY, loadPractice, savePractice} from './practice-state.js';
class Socket {
 constructor(){this.handlers=new Map();this.pending=[];this.connected=false;this.local=false;this.connect();}
 on(e,f){const list=this.handlers.get(e)||[];list.push(f);this.handlers.set(e,list);}trigger(e,p){for(const f of this.handlers.get(e)||[])f(p);}
 connect(){this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:document.querySelector('#name-input').value||'Пилот',storage:{getItem:k=>sessionStorage.getItem('pocket-works:space-run:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:space-run:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:space-run:'+k)}});
 this.net.on('connected',m=>{if(this.local)return;this.id=m.player.id;this.connected=true;for(const item of this.pending.splice(0))this.emit(...item);});
 this.net.on('room_joined',m=>{if(this.local)return;this.code=m.roomId.slice(0,8).toUpperCase();this.trigger('joined',{playerId:this.id,roomCode:this.code,maxPlayers:8});this.apply(m.state);});
 this.net.on('game_event',m=>{if(m.event.type==='state')this.apply(m.event.payload);else if(m.event.type==='legacy')this.trigger(m.event.payload.event,m.event.payload.payload);});
 this.net.on('error',m=>{if(this.local)return;const message=m.message||m.code||'Ошибка связи';this.trigger('actionError',{message});this.trigger('joinError',{message});});
 this.net.on('disconnected',()=>{const wasConnected=this.connected;this.connected=false;if(wasConnected&&!this.local)this.trigger('connectionStatus',{message:'Связь потеряна. Проверьте подключение к PocketNet.'});});this.net.connect().catch(()=>this.trigger('joinError',{message:'Нет связи. Одиночная практика доступна без сети.'}));}
 apply(v){this.trigger('state',{...v,roomCode:this.code});}
 create(name){this.local=false;if(this.net.closed){this.connect();this.pending.push(['__create',{name}]);return;}if(!this.connected){this.pending.push(['__create',{name}]);return;}this.net.createRoom('space-run',{name});}
 practice(name){
  this.local=true;this.connected=false;this.pending.length=0;this.net.close();
  this.id='local';this.code='ПРАКТИКА';this.member={id:'local',name:name||'Пилот'};
  let previous=null;try{previous=localStorage.getItem(PRACTICE_KEY);}catch{}
  this.saved=loadPractice(localStorage);
  let recovered=Boolean(previous&&!this.saved);
  if(this.saved){
    try{game.viewForPlayer({state:this.saved});}
    catch{this.saved=null;recovered=true;}
  }
  if(!this.saved)this.saved=game.createRoom({player:this.member,payload:{name}}).state;
  this.savePractice(true);
  this.trigger('joined',{playerId:this.id,roomCode:this.code,maxPlayers:1});
  this.apply(game.viewForPlayer({state:this.saved}));
  if(recovered)this.trigger('actionError',{message:'Повреждённое сохранение практики заменено новым кораблём.'});
 }
 savePractice(force=false){
  if(!this.local||!this.saved)return false;
  if(!force&&Date.now()-(this.lastSave||0)<1250)return false;
  const result=savePractice(localStorage,this.saved);
  if(result)this.lastSave=Date.now();
  return result;
 }
 emit(event,payload){if(event==='__create'){this.create(payload.name);return;}
 if(this.local&&event!=='joinRoom'){try{const result=game.onMessage({state:this.saved,player:this.member,payload:{event,payload}});this.saved=result.state;for(const e of result.events)if(e.type==='legacy')this.trigger(e.payload.event,e.payload.payload);this.apply(game.viewForPlayer({state:this.saved}));this.savePractice();}catch(e){this.trigger('actionError',{message:e.message});}return;}
 if(this.local){this.savePractice(true);this.local=false;this.connected=false;this.connect();}
 if(!this.connected){this.pending.push([event,payload]);return;}
 if(event==='joinRoom'){if(!payload.roomCode?.trim()){this.trigger('joinError',{message:'Введите код или создайте комнату.'});return;}this.net.joinRoom(payload.roomCode.trim());}else this.net.sendGame({event,payload});
 }
}
globalThis.spaceSocket=new Socket();
window.addEventListener('pagehide',()=>globalThis.spaceSocket.savePractice(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)globalThis.spaceSocket.savePractice(true);});
