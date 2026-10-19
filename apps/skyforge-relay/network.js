import {PocketNet} from '../../shared/capabilities/net.js';
import game from './simulation.js';
class Socket {
 constructor(){this.handlers=new Map();this.mode='online';this.id=null;this.code=null;this.pending=[];this.connect();}
 on(event,f){const list=this.handlers.get(event)||[];list.push(f);this.handlers.set(event,list);}
 trigger(event,p){for(const f of this.handlers.get(event)||[])f(p);}
 connect(){this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:document.querySelector('#nameInput').value||'Пилот',storage:{getItem:k=>sessionStorage.getItem('pocket-works:skyforge-relay:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:skyforge-relay:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:skyforge-relay:'+k)}});
 this.net.on('connected',m=>{if(this.mode==='local')return;this.id=m.player.id;this.trigger('hello',{id:this.id});this.ready=true;for(const [e,p] of this.pending.splice(0))this.emit(e,p);});
 this.net.on('room_joined',m=>{this.code=m.roomId.slice(0,8).toUpperCase();this.trigger(this.creating?'room_created':'joined_room',{code:this.code,playerId:this.id});this.apply(m.state);});
 this.net.on('game_event',m=>{if(m.event.type==='state')this.apply(m.event.payload);});
 this.net.on('error',m=>this.trigger('join_error',{message:m.message||m.code||'Ошибка соединения'}));
 this.net.on('disconnected',()=>{this.ready=false;});
 this.net.connect().catch(()=>this.trigger('join_error',{message:'Нет соединения. Одиночная практика доступна без сети.'}));}
 apply(v){this.trigger('state',{...v,code:this.code});}
 practice(name){this.mode='local';this.net.close();this.id='local';this.code='ПРАКТИКА';this.localPlayer={id:'local',name:name||'Пилот'};try{const s=JSON.parse(localStorage.getItem('pocket-works:skyforge-relay:practice')||'null');this.local=s?.room?s:null;}catch{}if(!this.local)this.local=game.createRoom({player:this.localPlayer,payload:{name}}).state;this.trigger('hello',{id:this.id});this.trigger('room_created',{code:this.code,playerId:this.id});this.apply(game.viewForPlayer({state:this.local,player:this.localPlayer}));}
 emit(event,payload){
 if(this.mode==='local'&&!['create_room','join_room'].includes(event)){try{this.local=game.onMessage({state:this.local,player:this.localPlayer,payload:{event,payload}}).state;this.apply(game.viewForPlayer({state:this.local,player:this.localPlayer}));if(Date.now()-(this.lastSave||0)>1000){this.lastSave=Date.now();try{localStorage.setItem('pocket-works:skyforge-relay:practice',JSON.stringify(this.local));}catch{}}}catch(e){this.trigger('join_error',{message:e.message});}return;}
 if(this.mode==='local'){this.mode='online';this.ready=false;this.connect();}
 if(!this.ready){this.pending.push([event,payload]);return;}
 if(event==='create_room'){this.creating=true;this.net.createRoom('skyforge-relay',payload);}else if(event==='join_room'){this.creating=false;this.net.joinRoom(payload.code.trim());}else this.net.sendGame({event,payload});
 }
}
globalThis.skySocket=new Socket();
