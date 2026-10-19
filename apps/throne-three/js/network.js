import {PocketNet} from '../../../shared/capabilities/net.js';
class ThroneNetwork {
 constructor(handlers={}){this.handlers=handlers;this.connected=false;this.code=null;this.role=null;this.net=null;this.connecting=null;}
 emit(type,payload){const f=this.handlers[type]||this.handlers.any;if(f)f(payload);}
 handle(message){if(message.role)this.role=message.role;if(message.code)this.code=message.code;this.emit(message.type,message);if(message.message)this.emit('status',message.message);}
 connect(){
  if(this.connected)return Promise.resolve();if(this.connecting)return this.connecting;
  const storage={getItem:k=>sessionStorage.getItem('pocket-works:throne-three:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:throne-three:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:throne-three:'+k)};
  this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:this.name||'Претендент',storage});
  this.net.on('connected',()=>{this.connected=true;});
  this.net.on('room_joined',m=>{this.code=m.roomId.slice(0,8).toUpperCase();this.handle({type:this.creating?'room_created':'room_joined',code:this.code,role:m.state.role});this.apply(m.state);});
  this.net.on('game_event',m=>{if(m.event.type==='state')this.apply(m.event.payload);});
  this.net.on('error',m=>this.emit('error',{message:m.message||m.code||'Ошибка сети'}));
  this.net.on('disconnected',()=>{this.connected=false;this.emit('status','Связь потеряна. Переподключение…');});
  this.connecting=this.net.connect().catch(e=>{this.emit('error',{message:e.message});throw e;}).finally(()=>{this.connecting=null;});return this.connecting;
 }
 apply(v){this.handle({type:'state',...v,code:this.code});}
 createRoom(name){this.name=name;this.creating=true;return this.connect().then(()=>this.net.createRoom('throne-three',{name}));}
 joinRoom(code,name){this.name=name;this.creating=false;return this.connect().then(()=>this.net.joinRoom(code.trim()));}
 send(payload){try{this.net.sendGame(payload);}catch(e){this.emit('error',{message:e.message});}}
 submitStatement(statement){this.send({type:'submit_statement',statement});}
 submitAction(action){this.send({type:'submit_action',action});}
 resetRoom(){this.send({type:'reset_room'});}
 clearRoom(){this.net?.leaveRoom();this.handle({type:'room_cleared',message:'Вы вышли из комнаты.'});}
 debugSetFaction(){this.emit('error',{message:'Отладка доступна только в локальной партии.'});}
 debugSimulate(){this.emit('error',{message:'Отладка доступна только в локальной партии.'});}
}
globalThis.ThroneNetwork=ThroneNetwork;
