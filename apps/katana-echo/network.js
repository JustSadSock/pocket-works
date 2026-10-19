import {PocketNet} from '../../shared/capabilities/net.js';
export class PocketSocket extends EventTarget {
 static OPEN=1;
 constructor(){super();this.readyState=0;this.creating=!!globalThis.katanaCreate;const storage={getItem:k=>sessionStorage.getItem('pocket-works:katana-echo:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:katana-echo:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:katana-echo:'+k)};this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:document.querySelector('#name').value||'Ронин',storage});
 this.net.on('connected',m=>{this.id=m.player.id;this.readyState=1;});
 this.net.on('room_joined',m=>{this.code=m.roomId.slice(0,8).toUpperCase();this.message({type:'room',data:{roomCode:this.code,playerId:this.id,map:m.state.map,mode:m.state.mode}});this.apply(m.state);});
 this.net.on('game_event',m=>{if(m.event.type==='state')this.apply(m.event.payload);});this.net.on('error',m=>{document.querySelector('#status').textContent=m.message||m.code||'Ошибка связи';});this.net.on('disconnected',()=>{this.readyState=0;});
 this.net.connect().then(()=>this.dispatchEvent(new Event('open'))).catch(e=>{document.querySelector('#status').textContent='Нет соединения: '+e.message;});}
 message(m){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(m)}));}apply(v){this.message({type:'state',data:v});}
 send(text){const p=JSON.parse(text);if(p.type==='join'){if(this.creating)this.net.createRoom('katana-echo',{mode:p.mode});else if(p.roomCode)this.net.joinRoom(p.roomCode.trim());else document.querySelector('#status').textContent='Введите код комнаты или создайте новую.';}else this.net.sendGame(p);}
 close(){this.net.close();this.readyState=3;}
}
