import {PocketNet} from '../../shared/capabilities/net.js';

class NetworkManager {
  constructor() {
    this.callbacks={};
    this.connected=false;
    this.currentRoom=null;
    this.socket={id:null};
    this.started=false;
    this.inGameUI=false;
    this.timer=null;
    this.phase='lobby';
    this.connecting=null;
  }
  on(type,fn){this.callbacks[type]=fn;}
  trigger(type,payload){this.callbacks[type]?.(payload);}
  async connect(){
    if(this.connected)return;
    if(this.connecting)return this.connecting;
    const storage={
      getItem:key=>sessionStorage.getItem('pocket-works:blockies:'+key),
      setItem:(key,value)=>sessionStorage.setItem('pocket-works:blockies:'+key,value),
      removeItem:key=>sessionStorage.removeItem('pocket-works:blockies:'+key)
    };
    this.net=new PocketNet({
      serverUrl:location.origin+'/pocketnet',
      name:document.querySelector('#nickname-input')?.value||'Игрок',
      storage
    });
    this.net.on('connected',msg=>{
      this.socket.id=msg.player.id;
      this.connected=true;
      this.trigger('connect');
    });
    this.net.on('room_joined',msg=>{
      this.code=msg.roomId.slice(0,8).toUpperCase();
      this.apply(msg.state,true);
    });
    this.net.on('game_event',msg=>{
      // Queued packets from a room we have just left must not reopen an old match.
      if(msg.roomId!==this.net.roomId)return;
      if(msg.event?.type==='state')this.apply(msg.event.payload);
    });
    this.net.on('error',msg=>this.trigger('error',msg.message||msg.code||'Ошибка сети'));
    this.net.on('disconnected',()=>{
      this.connected=false;
      this.stopPulse();
      this.trigger('disconnect');
    });
    this.connecting=this.net.connect().catch(error=>this.trigger('error',error.message))
      .finally(()=>this.connecting=null);
    return this.connecting;
  }
  stopPulse(){
    if(this.timer!=null)clearInterval(this.timer);
    this.timer=null;
  }
  startPulse(){
    if(this.timer!=null)return;
    this.timer=setInterval(()=>{
      if(!document.hidden&&this.connected&&this.started)this.send({type:'pulse'});
    },100);
  }
  apply(snapshot,joined=false){
    if(!snapshot||!Array.isArray(snapshot.players))return;
    const phase=snapshot.phase || (snapshot.started?'playing':'lobby');
    this.phase=phase;
    const room={...snapshot,id:this.code,name:'Blockies · '+this.code,maxPlayers:4,
      gameStarted:phase==='playing',
      availableColors:['#FF1493','#00D9FF','#FFDB58','#39FF14']
        .filter(color=>!snapshot.players.some(p=>!p.departed&&p.color===color))};
    this.currentRoom=room;
    const code=document.querySelector('#pocket-room-code');
    if(code)code.textContent=this.code||'';
    // Reconnecting into an active match must never move the player to the lobby.
    if(joined&&phase==='lobby')this.trigger(this.creating?'roomCreated':'roomJoined',room);
    else if(!joined)this.trigger('roomUpdate',room);

    if(phase==='playing'){
      if(!this.started||!this.inGameUI){
        this.inGameUI=true;
        this.started=true;
        this.trigger('gameStart',{players:room.players,seed:room.seed});
      }
      this.started=true;
      this.startPulse();
      if(room.engine)this.trigger('snapshot',room.engine);
      this.trigger('presence',room.players);
      return;
    }

    this.stopPulse();
    this.started=false;
    if(phase==='results'){
      // A reconnect after game over still needs a board under the results dialog.
      if(!this.inGameUI){
        this.inGameUI=true;
        this.trigger('gameStart',{players:room.players,seed:room.seed});
      }
      if(room.engine)this.trigger('snapshot',room.engine);
      this.trigger('presence',room.players);
      this.trigger('matchResults',room);
    }else if(this.inGameUI){
      this.inGameUI=false;
      const ui=window.uiManager;
      if(ui){
        ui.isOnlineMode=false;
        ui.hideModal('gameOver');
        ui.showScreen('onlineLobby');
      }
      this.trigger('roomJoined',room);
    }
  }
  send(payload){
    try{this.net?.sendGame(payload);}
    catch(error){this.trigger('error',error.message||'Нет соединения');}
  }
  createRoom(){this.creating=true;this.net?.createRoom('blockies',{});}
  joinRoom(code){
    this.creating=false;
    const normalized=String(code||'').trim();
    if(!normalized){this.trigger('error','Введите код комнаты');return;}
    this.net?.joinRoom(normalized);
  }
  leaveRoom(){
    this.stopPulse();
    this.started=false;
    this.inGameUI=false;
    this.phase='lobby';
    try{this.net?.leaveRoom();}catch(error){this.trigger('error',error.message);}
    this.currentRoom=null;
    this.trigger('leftRoom');
  }
  changeColor(color){this.send({type:'color',color});}
  toggleReady(){this.send({type:'ready'});}
  requestRematch(){if(this.phase==='results')this.send({type:'rematch'});}
  setNickname(name){if(this.currentRoom&&this.phase==='lobby')this.send({type:'nickname',name});}
  sendPlayerInput(input){if(this.phase==='playing')this.send({type:'input',input});}
  disconnect(){
    this.stopPulse();
    this.net?.close();
    this.connected=false;
    this.currentRoom=null;
    this.started=false;
    this.inGameUI=false;
  }
}
globalThis.networkManager=new NetworkManager();
