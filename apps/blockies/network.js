import {PocketNet} from '../../shared/capabilities/net.js';

class NetworkManager {
  constructor(){
    this.callbacks={};
    this.connected=false;
    this.stale=false;
    this.lastStateAt=0;
    this.currentRoom=null;
    this.socket={id:null};
    this.started=false;
    this.activeRound=0;
    this.code='';
    this.hostId=null;
    this.timer=null;
    this.net=null;
    this.connecting=null;
  }
  on(type,callback){this.callbacks[type]=callback;}
  trigger(type,payload){this.callbacks[type]?.(payload);}
  async connect(){
    if(this.connected)return;
    if(this.connecting)return this.connecting;
    if(!this.net){
      const storage={
        getItem:key=>{try{return sessionStorage.getItem('pocket-works:blockies:'+key);}catch{return null;}},
        setItem:(key,value)=>{try{sessionStorage.setItem('pocket-works:blockies:'+key,value);}catch{}},
        removeItem:key=>{try{sessionStorage.removeItem('pocket-works:blockies:'+key);}catch{}}
      };
      this.net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:document.querySelector('#nickname-input')?.value.trim()||'Игрок',storage});
      this.net.on('connected',message=>{
        this.socket.id=message.player.id;
        this.connected=true;
        if(this.started){
          this.stale=true;
          this.trigger('connectionHealth',{status:'recovering'});
        }
        this.trigger('connect');
      });
      this.net.on('room_joined',message=>{
        this.code=(message.roomId||'').slice(0,8).toUpperCase();
        this.apply(message.state,true);
      });
      this.net.on('game_event',message=>{
        if(message.event?.type==='state')this.apply(message.event.payload);
      });
      this.net.on('error',message=>{
        if(message.code==='room_not_found'){this.resetRoom();this.trigger('leftRoom');}
        this.trigger('error',String(message.message||message.code||message||'Ошибка сети'));
      });
      this.net.on('disconnected',()=>{
        this.connected=false;
        this.stale=true;
        this.stopClock();
        this.trigger('connectionHealth',{status:'offline'});
        this.trigger('disconnect');
      });
      for(const event of ['room_closed','room_kicked']){
        this.net.on(event,()=>{
          this.resetRoom();
          this.trigger('leftRoom');
          this.trigger('error','Комната закрыта или доступ к ней завершён');
        });
      }
    }
    this.connecting=this.net.connect().catch(error=>{
      this.trigger('error',error.message||String(error));
      throw error;
    }).finally(()=>{this.connecting=null;});
    return this.connecting;
  }
  stopClock(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
  startClock(){
    if(this.timer)return;
    this.timer=setInterval(()=>{
      if(!this.connected||!this.started||document.hidden)return;
      if(!this.stale && performance.now()-this.lastStateAt>5000){
        this.stale=true;
        this.trigger('connectionHealth',{status:'stalled'});
      }
      this.send({type:'pulse'},true);
    },220);
  }
  resetRoom(){
    this.stopClock();
    this.currentRoom=null;
    this.started=false;
    this.activeRound=0;
    this.hostId=null;
    this.code='';
    this.stale=false;
    this.lastStateAt=0;
  }
  apply(state,joined=false){
    if(!state||!Array.isArray(state.players))return;
    this.lastStateAt=performance.now();
    if(this.stale){
      this.stale=false;
      this.trigger('connectionHealth',{status:'online'});
    }
    const players=state.players.filter(player=>!player.left);
    const room={
      ...state,players,id:this.code,name:'Blockies · '+this.code,maxPlayers:4,
      gameStarted:!!state.started,
      availableColors:['#FF1493','#00D9FF','#FFDB58','#39FF14'].filter(color=>!players.some(p=>p.color===color))
    };
    this.currentRoom=room;
    this.hostId=state.hostId;
    const codeNode=document.querySelector('#pocket-room-code');
    if(codeNode)codeNode.textContent=this.code;
    if(joined)this.trigger(this.creating?'roomCreated':'roomJoined',room);
    else this.trigger('roomUpdate',room);

    if(state.started){
      const round=state.round||1;
      const newRound=!this.started||this.activeRound!==round;
      this.started=true;
      this.activeRound=round;
      if(newRound)this.trigger('gameStart',{players:state.players,seed:state.seed});
      if(state.engine)this.trigger('snapshot',state.engine);
      this.trigger('onlinePause',{paused:!!state.paused,isHost:state.hostId===this.socket.id});
      this.startClock();
    }else{
      this.stopClock();
      if(this.started){
        this.started=false;
        this.activeRound=0;
        this.trigger('backToLobby',room);
      }
    }
  }
  send(payload,quiet=false){
    try{
      if(!this.connected)throw Error('Соединение потеряно. Переподключение выполняется автоматически.');
      this.net.sendGame(payload);
      return true;
    }catch(error){
      if(!quiet)this.trigger('error',error.message||String(error));
      return false;
    }
  }
  async createRoom(){
    try{await this.connect();this.creating=true;this.net.createRoom('blockies',{});}
    catch(error){this.trigger('error',error.message||String(error));}
  }
  async joinRoom(raw){
    const code=String(raw||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!/^[A-Z0-9]{4,8}$/.test(code)){this.trigger('error','Введите действительный код комнаты');return;}
    try{await this.connect();this.creating=false;this.net.joinRoom(code);}
    catch(error){this.trigger('error',error.message||String(error));}
  }
  leaveRoom(){
    try{if(this.connected&&this.currentRoom)this.net.leaveRoom();}
    catch(error){this.trigger('error',error.message||String(error));}
    this.resetRoom();
    this.trigger('leftRoom');
  }
  changeColor(color){this.send({type:'color',color});}
  toggleReady(){this.send({type:'ready'});}
  setNickname(name){
    if(this.currentRoom&&!this.started)this.send({type:'nickname',name});
  }
  sendPlayerInput(input){
    if(this.started&&this.connected&&!this.stale)this.send({type:'input',input},true);
  }
  togglePause(){this.send({type:'pause'});}
  requestRematch(){this.send({type:'rematch'});}
  disconnect(){
    this.stopClock();
    this.net?.close();
    this.connected=false;
    this.resetRoom();
  }
}
globalThis.networkManager=new NetworkManager();
