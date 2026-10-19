import {PocketNet} from '../../shared/capabilities/net.js';
import game,{createPractice} from './simulation.js';
export class PocketSocket extends EventTarget {
 static OPEN=1;
 constructor(){super();this.readyState=0;this.local=false;this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:localStorage.getItem('pocket-works:trace-mosaic:nickname')||'Мозаичист',storage:{getItem:k=>sessionStorage.getItem('pocket-works:trace-mosaic:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:trace-mosaic:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:trace-mosaic:'+k)}});
 this.net.on('connected',m=>{if(this.local)return;this.id=m.player.id;this.readyState=1;this.message('boot',{playerId:this.id,artCount:10});});
 this.net.on('room_joined',m=>{this.code=m.roomId.slice(0,8).toUpperCase();this.apply(m.state);});
 this.net.on('game_event',m=>{if(m.event.type==='state')this.apply(m.event.payload);else if(m.event.type==='legacy')this.message(m.event.payload.type,m.event.payload.payload);});
 this.net.on('error',m=>this.message('toast',{tone:'error',message:m.message||m.code||'Ошибка связи'}));this.net.on('disconnected',()=>{if(!this.local){this.readyState=0;this.message('toast',{tone:'error',message:'Связь потеряна. Переподключение…'});}});
 this.net.connect().then(()=>this.dispatchEvent(new Event('open'))).catch(()=>{if(!this.local)this.message('toast',{tone:'error',message:'Нет связи. Соло-тренировка работает без сети.'});});
 this.timer=setInterval(()=>{if(this.code&&!document.hidden)this.send(JSON.stringify({type:'pulse'}));},750);
 }
 message(type,payload){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type,payload})}));}
 apply(v){this.message('room_state',{...v,roomId:this.code});}
 practice(name){this.local=true;this.net.close();history.replaceState({},'',location.pathname);this.id='local';this.code='СОЛО';this.readyState=1;this.member={id:this.id,name};try{this.saved=JSON.parse(localStorage.getItem('pocket-works:trace-mosaic:practice')||'null');}catch{}if(!this.saved)this.saved=createPractice(this.member);this.message('boot',{playerId:this.id,artCount:10});this.apply(game.viewForPlayer({state:this.saved,player:this.member}));}
 send(text){const m=JSON.parse(text);if(this.local){if(m.type==='leave_room'){this.code=null;return;}const r=game.onMessage({state:this.saved,player:this.member,payload:m});this.saved=r.state;for(const e of r.events)if(e.type==='legacy')this.message(e.payload.type,e.payload.payload);this.apply(game.viewForPlayer({state:this.saved,player:this.member}));try{localStorage.setItem('pocket-works:trace-mosaic:practice',JSON.stringify(this.saved));}catch{}return;}
 if(this.readyState!==1)return;
 if(m.type==='create_room')this.net.createRoom('trace-mosaic',m.payload);else if(m.type==='join_room')this.net.joinRoom(m.payload.roomId.trim());else if(m.type==='leave_room'){this.net.leaveRoom();this.code=null;}else this.net.sendGame(m);
 }
 close(){clearInterval(this.timer);this.net.close();this.readyState=3;}
}
