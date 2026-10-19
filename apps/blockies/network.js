import {PocketNet} from '../../shared/capabilities/net.js';
class NetworkManager {
 constructor(){this.callbacks={};this.connected=false;this.currentRoom=null;this.socket={id:null};this.started=false;this.timer=null;}
 on(type,f){this.callbacks[type]=f;} trigger(type,p){this.callbacks[type]?.(p);}
 async connect(){if(this.connected)return;if(this.connecting)return this.connecting;const storage={getItem:k=>sessionStorage.getItem('pocket-works:blockies:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:blockies:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:blockies:'+k)};
 this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:document.querySelector('#nickname-input').value||'Игрок',storage});
 this.net.on('connected',m=>{this.socket.id=m.player.id;this.connected=true;this.trigger('connect');});
 this.net.on('room_joined',m=>{this.code=m.roomId.slice(0,8).toUpperCase();this.apply(m.state,true);});
 this.net.on('game_event',m=>{if(m.event.type==='state')this.apply(m.event.payload);});
 this.net.on('error',m=>this.trigger('error',m.message||m.code||'Ошибка сети'));
 this.net.on('disconnected',()=>{this.connected=false;this.trigger('disconnect');});
 this.connecting=this.net.connect().catch(e=>this.trigger('error',e.message)).finally(()=>this.connecting=null);return this.connecting;}
 apply(s,joined=false){const room={...s,id:this.code,name:'Blockies · '+this.code,maxPlayers:4,gameStarted:s.started,availableColors:['#FF1493','#00D9FF','#FFDB58','#39FF14'].filter(c=>!s.players.some(p=>p.color===c))};this.currentRoom=room;document.querySelector('#pocket-room-code').textContent=this.code;
 if(joined)this.trigger(this.creating?'roomCreated':'roomJoined',room);else this.trigger('roomUpdate',room);
 if(s.started&&!this.started){this.started=true;this.trigger('gameStart',{players:s.players,seed:s.seed});clearInterval(this.timer);this.timer=setInterval(()=>{if(!document.hidden&&this.connected)this.send({type:'pulse'});},100);}
 if(s.engine)this.trigger('snapshot',s.engine);
 if(!s.started&&this.started){this.started=false;clearInterval(this.timer);window.uiManager.isOnlineMode=false;window.uiManager.showScreen('onlineLobby');this.trigger('roomJoined',room);}
 }
 send(p){try{this.net.sendGame(p);}catch(e){this.trigger('error',e.message);}}
 createRoom(){this.creating=true;this.net.createRoom('blockies',{});}joinRoom(code){this.creating=false;this.net.joinRoom(code);}leaveRoom(){clearInterval(this.timer);this.started=false;this.net.leaveRoom();this.currentRoom=null;this.trigger('leftRoom');}
 changeColor(color){this.send({type:'color',color});}toggleReady(){this.send({type:'ready'});}setNickname(name){if(this.currentRoom)this.send({type:'nickname',name});}
 sendPlayerInput(input){this.send({type:'input',input});}sendGameState(){}disconnect(){clearInterval(this.timer);this.net?.close();this.connected=false;}
}
globalThis.networkManager=new NetworkManager();
