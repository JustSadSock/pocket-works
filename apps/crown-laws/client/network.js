import {PocketNet} from '../../../shared/capabilities/net.js';
export class PocketSocket extends EventTarget {
 static OPEN=1;static CLOSED=3;
 constructor(){super();this.readyState=0;this.code=null;this.creating=false;this.closed=false;
  const storage={getItem:k=>sessionStorage.getItem('pocket-works:crown-laws:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:crown-laws:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:crown-laws:'+k)};
  this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:'Законодатель',storage});
  this.net.on('connected',()=>{if(this.closed)return;if(this.readyState!==1){this.readyState=1;this.dispatchEvent(new Event('open'));}});
  this.net.on('room_joined',m=>{if(this.closed)return;this.code=m.roomId.slice(0,8).toUpperCase();this.message({type:this.creating?'room:created':'room:joined',code:this.code,you:m.state.you});this.creating=false;this.update(m.state);});
  this.net.on('game_event',m=>{if(!this.closed&&m.event?.type==='state')this.update(m.event.payload);});
  this.net.on('error',m=>{if(!this.closed)this.message({type:'room:error',message:m.message||m.code||'Ошибка соединения'});});
  this.net.on('disconnected',()=>{if(this.closed)return;this.readyState=3;this.dispatchEvent(new Event('close'));});
  this.net.connect().catch(e=>{if(this.closed)return;this.readyState=3;this.message({type:'room:error',message:e.message});this.dispatchEvent(new Event('error'));});
 }
 message(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
 update(v){this.message({type:'room:update',room:{...v,code:this.code}});}
 send(text){if(this.closed||this.readyState!==1)throw Error('PocketNet не подключён');const p=JSON.parse(text);if(p.type==='room:create'){this.creating=true;this.net.createRoom('crown-laws',{});}else if(p.type==='room:join'){this.creating=false;this.net.joinRoom(p.code.trim());}else if(p.type==='room:leave'){this.net.leaveRoom();}else this.net.sendGame(p);}
 close(){if(this.closed)return;this.closed=true;try{if(this.readyState===1)this.net.leaveRoom();}catch{}this.readyState=3;this.net.close();}
}
