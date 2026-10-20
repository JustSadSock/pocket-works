import sim from './game/sim.cjs';
const {GameRoom}=sim;

const copy=v=>structuredClone(v);
function packFrame(f){const i=f.input,s=f.state;return [f.timestamp,[i.keys?.w?1:0,i.keys?.a?1:0,i.keys?.s?1:0,i.keys?.d?1:0,i.mouseAngle||0,!!i.lmb,!!i.rmb,!!i.dash,!!i.ghostToggle],STATE_KEYS.map(k=>s[k])];}
const STATE_KEYS=['x','y','vx','vy','facing','speed','dashCooldown','attacking','attackTimer','attackPower','charge','shieldUp','shieldStrength','shieldCooldown','parryWindow','stagger'];
function unpackFrame(f){return {timestamp:f[0],input:{keys:{w:!!f[1][0],a:!!f[1][1],s:!!f[1][2],d:!!f[1][3]},mouseAngle:f[1][4],lmb:f[1][5],rmb:f[1][6],dash:f[1][7],ghostToggle:f[1][8]},state:Object.fromEntries(STATE_KEYS.map((k,i)=>[k,f[2][i]]))};}
function encode(room){return {id:room.id,mode:room.mode,map:room.map,clock:room.clock,roundResetAt:room.roundResetAt,lastTick:Date.now(),players:[...room.players.values()].map(p=>({...p,events:p.events.slice(-12),ws:null,ghost:{...p.ghost,buffer:p.ghost.buffer.map(packFrame),...(p.ghost.playback?{playback:p.ghost.playback.map(packFrame)}:{})}}))};}
function decode(s){const room=Object.create(GameRoom.prototype);Object.assign(room,s);room.broadcast=()=>{};room.players=new Map(s.players.map(p=>{p=copy(p);p.ghost.buffer=p.ghost.buffer.map(unpackFrame);if(p.ghost.playback)p.ghost.playback=p.ghost.playback.map(unpackFrame);return[p.id,p];}));return room;}
function add(room,member){if(room.players.has(member.id))return;if(room.players.size>=2)throw Error('Комната заполнена');const p=room.addPlayer(null,member.name);room.players.delete(p.id);p.id=member.id;p.ghostActor.id=member.id+'-g';p.ghostActor.ownerId=member.id;room.players.set(p.id,p);}
function output(room){return {state:encode(room),events:[{type:'state',payload:{}}]};}
export default {protocolVersion:1,
createRoom({player,payload}){const mode=['echo-trap','shadow-tail','channel-echo'].includes(payload?.mode)?payload.mode:'echo-trap';const room=new GameRoom(crypto.randomUUID(),mode,()=>{});add(room,player);return output(room);},
onJoin({state,player}){const room=decode(state);add(room,player);return output(room);},
onLeave({state,player}){const room=decode(state);room.removePlayer(player.id);return output(room);},
onMessage({state,player,payload:m}){const room=decode(state),p=room.players.get(player.id);if(!p)throw Error('Игрок не в комнате');
 let elapsed=Math.min(250,Math.max(0,Date.now()-state.lastTick));for(const v of room.players.values())if(Date.now()-(v.lastInputAt||0)>500)v.inputState={keys:{},lmb:false,rmb:false,mouseAngle:v.state.facing};
 while(elapsed>0){const step=Math.min(1000/60,elapsed);room.step(step);elapsed-=step;}
 if(m?.type==='input'){const i=m.payload||{};room.handleInput(player.id,{keys:Object.fromEntries(['w','a','s','d'].map(k=>[k,!!i.keys?.[k]])),mouseAngle:Number.isFinite(i.mouseAngle)?i.mouseAngle:0,seq:Number.isSafeInteger(i.seq)?i.seq:0,lmb:!!i.lmb,rmb:!!i.rmb,dash:!!i.dash,ghostToggle:!!i.ghostToggle});p.lastInputAt=Date.now();}
 else if(m?.type==='ready')room.markReady(player.id);else if(m?.type!=='sync')throw Error('Неизвестная команда');return output(room);
},viewForPlayer({state}){const room=decode(state);return {phase:room.players.size<2?'lobby':room.roundResetAt?'round-end':'playing',room:room.id,map:room.map,mode:room.mode,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,alive:p.alive,score:p.score||0,state:p.state,ghostMode:p.ghostMode,ghost:{cooldown:p.ghost.cooldown,energy:p.ghost.energy,active:p.ghost.active},ghostActor:p.ghostActor,events:p.events.slice(-8)}))};}};

