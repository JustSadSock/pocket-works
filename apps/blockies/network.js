import {PocketNet} from '../../shared/capabilities/net.js';

const ROOM_ID=/^(?:[0-9a-f]{8}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
export function normalizeRoomId(input){
  let value=String(input||'').trim();
  if(/^https?:\/\//i.test(value)){
    try{
      const url=new URL(value);
      if(url.origin!==globalThis.location?.origin||!/^\/apps\/blockies\/?$/.test(url.pathname))return null;
      value=url.searchParams.get('room')||'';
    }catch{return null;}
  }
  return ROOM_ID.test(value)?value.toLowerCase():null;
}
const sameRoom=(a,b)=>!!a&&!!b&&a.slice(0,8).toLowerCase()===b.slice(0,8).toLowerCase();

export class NetworkManager {
  constructor(){
    this.callbacks={};
    this.connected=false;
    this.stale=false;
    this.lastStateAt=0;
    this.currentRoom=null;
    this.socket={id:null};
    this.started=false;
    this.finished=false;
    this.activeRound=0;
    this.lastPulseAt=0;
    this.code='';
    this.roomId=null;
    this.hostId=null;
    this.timer=null;
    this.net=null;
    this.connecting=null;
  }
  on(type,callback){this.callbacks[type]=callback;}
  trigger(type,payload){this.callbacks[type]?.(payload);}
  async connect(preferredRoom=null){
    if(this.connected)return;
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
        if(message.gameId&&message.gameId!=='blockies'){
          this.net.leaveRoom();
          this.resetRoom();
          this.trigger('error','Это комната другой игры');
          return;
        }
        this.roomId=message.roomId;
        this.code=(message.roomId||'').slice(0,8).toUpperCase();
        this.apply(message.state,true);
        const button=document.getElementById('invite-friends-btn');
        if(button){button.hidden=!this.net.accountId;button.dataset.roomId=message.roomId;}
      });
      this.net.on('game_event',message=>{
        if(!this.roomId||message.roomId!==this.roomId)return;
        if(message.event?.type==='state')this.apply(message.event.payload);
        else if(message.event?.type==='achievement_awarded'&&message.event.to===this.socket.id){
          window.dispatchEvent(new CustomEvent('blockies:award',{detail:message.event.payload}));
        }
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
    // New invite takes precedence over saved session before authentication.
    if(preferredRoom&&this.net.roomId&&!sameRoom(this.net.roomId,preferredRoom)){
      this.net.roomId=null;
      this.net.persist();
    }
    if(this.connecting)return this.connecting;
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
      const now=performance.now();
      if(!this.stale&&now-this.lastStateAt>5000){
        this.stale=true;
        this.trigger('connectionHealth',{status:'stalled'});
      }
      // An active game advances continuously; a finished round still polls
      // occasionally so a disconnected host can be replaced before rematching.
      if(this.finished&&now-this.lastPulseAt<1600)return;
      this.lastPulseAt=now;
      this.send({type:'pulse'},true);
    },320);
  }
  resetRoom(){
    this.stopClock();
    this.currentRoom=null;
    this.started=false;
    this.finished=false;
    this.activeRound=0;
    this.lastPulseAt=0;
    this.hostId=null;
    this.code='';
    this.roomId=null;
    const button=globalThis.document?.getElementById('invite-friends-btn');
    if(button){button.hidden=true;delete button.dataset.roomId;}
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
    const previousHost=this.hostId;
    this.currentRoom=room;
    this.hostId=state.hostId;
    if(previousHost!==this.hostId)this.trigger('hostChanged',{hostId:this.hostId,isHost:this.hostId===this.socket.id});
    const codeNode=document.querySelector('#pocket-room-code');
    if(codeNode)codeNode.textContent=this.code;
    if(joined)this.trigger(this.creating?'roomCreated':'roomJoined',room);
    else this.trigger('roomUpdate',room);

    if(state.started){
      const round=state.round||1;
      const newRound=!this.started||this.activeRound!==round;
      this.started=true;
      this.finished=!!state.engine?.isGameOver;
      this.activeRound=round;
      if(newRound)this.trigger('gameStart',{players:state.players,seed:state.seed});
      if(state.engine)this.trigger('snapshot',state.engine);
      this.trigger('onlinePause',{paused:!!state.paused,isHost:state.hostId===this.socket.id});
      this.startClock();
    }else{
      this.stopClock();
      this.finished=false;
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
    try{
      await this.connect();
      if(this.net.roomId){this.net.leaveRoom();this.resetRoom();}
      this.creating=true;
      this.net.createRoom('blockies',{});
    }catch(error){this.trigger('error',error.message||String(error));}
  }
  async joinRoom(raw){
    const id=normalizeRoomId(raw);
    if(!id){this.trigger('error','Введите 8-значный код комнаты или откройте ссылку-приглашение');return;}
    try{
      this.creating=false;
      if(this.net?.roomId&&!sameRoom(this.net.roomId,id)){
        if(this.connected)this.net.leaveRoom();
        else{this.net.roomId=null;this.net.persist();}
        if(this.currentRoom){this.resetRoom();this.trigger('leftRoom');}
      }
      await this.connect(id);
      // A reconnect can already be joining this exact room.
      if(sameRoom(this.net.roomId,id))return;
      this.net.joinRoom(id);
    }catch(error){this.trigger('error',error.message||String(error));}
  }
  async inviteFriends(){
    if(!this.currentRoom||!this.net?.roomId){this.trigger('error','Сначала войдите в комнату');return;}
    if(!this.net.accountId){
      this.trigger('error','Для приглашения друзей нужен Pocket ID. Ссылкой можно поделиться без входа.');
      return;
    }
    try{
      if(!window.PocketSocial){
        for(const file of ['../../shared/capabilities/identity.css','../../shared/pocket-id.css','../../shared/pocket-social.css']){
          const href=new URL(file,import.meta.url).href;
          if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href)){
            const link=document.createElement('link');
            link.rel='stylesheet';link.href=href;document.head.append(link);
          }
        }
        await import('../../shared/pocket-social.js');
      }
      window.PocketSocial.open(this.net.roomId,'blockies');
    }catch(error){this.trigger('error','Не удалось открыть друзей: '+(error.message||String(error)));}
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
