// ZAMAZKA PocketNet-compatible local host. Only listens on loopback.
// The public WebSocket/HTTPS endpoint is furnished separately by Cloudflare Tunnel.
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { build } from 'esbuild';

const here=dirname(fileURLToPath(import.meta.url));
const dataDir=resolve(here,'../local-data');
const PORT=Number(process.env.ZAMAZKA_PORT || 8788);
const MAX_BODY=128*1024;
const MAX_STATE=512*1024;
const ROOM_LIMIT=8;
const ROOMS_FILE=resolve(dataDir,'rooms.json');
const TOKENS_FILE=resolve(dataDir,'sessions.json');

if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error('Invalid port');
await mkdir(dataDir,{recursive:true});
const compiled=await build({entryPoints:[resolve(here,'../module.ts')],bundle:true,platform:'node',target:'node22',format:'esm',write:false,logLevel:'silent'});
const game=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'))).default;
if(game?.protocolVersion!==1)throw Error('Game module version mismatch');

async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'))}catch{return fallback}}
const sessions=new Map(Object.entries(await readJson(TOKENS_FILE,{})));
const savedRooms=await readJson(ROOMS_FILE,[]);
const rooms=new Map(Array.isArray(savedRooms)?savedRooms.filter(r=>r?.id&&r.state&&Array.isArray(r.players)).map(r=>[r.id,r]):[]);
const connections=new Map();
const sessionRates=new Map();
const roomLocks=new Map();
let saving=Promise.resolve();

async function atomicSave(file,value){
 const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(value));await rename(tmp,file);
}
function save(){
 // Serialize saves so the newest operation cannot be overwritten by a slower old write.
 saving=saving.catch(()=>{}).then(async()=>{
   await atomicSave(ROOMS_FILE,[...rooms.values()]);
   await atomicSave(TOKENS_FILE,Object.fromEntries(sessions));
 }).catch(e=>console.warn('Could not save game rooms:',e.message));
 return saving;
}
function locked(id,fn){
 const last=roomLocks.get(id)||Promise.resolve();
 const next=last.catch(()=>{}).then(fn);
 roomLocks.set(id,next);
 next.finally(()=>{if(roomLocks.get(id)===next)roomLocks.delete(id)}).catch(()=>{});
 return next;
}
const log=(event,details={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...details}));
function send(ws,type,fields={}){
 if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({wireVersion:1,type,...fields}));
}
function notice(ws,error){send(ws,'error',{code:String(error?.message||error).slice(0,100)})}
function body(req,max=1024){return new Promise((ok,bad)=>{let size=0,s='';req.on('data',buf=>{size+=buf.length;if(size>max){bad(Error('request_too_large'));req.destroy();return}s+=buf.toString('utf8')});req.on('end',()=>{try{ok(JSON.parse(s))}catch{bad(Error('invalid_json'))}});req.on('error',bad)})}
function respond(res,status,object){
 if(res.writableEnded)return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
 res.end(JSON.stringify(object));
}
function connectedPlayers(room){return room.players.filter(p=>connections.get(p.id)?.roomId===room.id).map(p=>p.id)}
function broadcast(room,type,data){
 for(const p of room.players){
  const c=connections.get(p.id);
  if(c?.roomId===room.id)send(c.ws,type,data);
 }
}
async function apply(room,action,player,payload={}){
 if(!rooms.has(room.id))return;
 const output=action==='join'?
  game.onJoin?.({state:room.state,players:room.players,player,payload}):
  action==='leave'?
  game.onLeave?.({state:room.state,players:room.players,player,payload}):
  game.onMessage({state:room.state,players:room.players,player,payload});
 if(!output?.state)throw Error('invalid_game_state');
 const bytes=Buffer.byteLength(JSON.stringify(output.state));
 if(bytes>MAX_STATE)throw Error('room_state_too_large');
 room.state=output.state;
 room.updatedAt=Date.now();
 await save();
 for(const event of output.events||[]){
  if(typeof event?.type!=='string')continue;
  if(event.to){
   const target=connections.get(event.to);
   if(target?.roomId===room.id)send(target.ws,'game_event',{roomId:room.id,event});
  }else broadcast(room,'game_event',{roomId:room.id,event});
 }
}
function roomOf(connection){
 if(!connection?.roomId)return null;
 return rooms.get(connection.roomId)||null;
}
function member(room,player){return room.players.some(p=>p.id===player.id)}
function presence(room,disconnected){
 broadcast(room,'presence',{roomId:room.id,players:room.players,...(disconnected?{disconnected}:{})});
}
async function leave(connection,player){
 const room=roomOf(connection);
 if(!room)return;
 await locked(room.id,async()=>{
  room.players=room.players.filter(p=>p.id!==player.id);
  connection.roomId=null;
  if(!room.players.length){rooms.delete(room.id);await save()}
  else {await apply(room,'leave',player);presence(room)}
 });
}
const web=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='OPTIONS')return respond(res,204,{});
  if(req.method==='GET'&&pathname==='/health')return respond(res,200,{ok:true,gameId:'zamazka',rooms:rooms.size,players:connections.size});
  if(req.method==='POST'&&pathname==='/session'){
   const ip=String(req.headers['cf-connecting-ip']||req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0];
   const rate=sessionRates.get(ip)||{at:0,count:0};
   if(Date.now()-rate.at>60_000){rate.at=Date.now();rate.count=0}
   if(++rate.count>30)return respond(res,429,{error:'rate_limited'});
   sessionRates.set(ip,rate);
   const data=await body(req,1024);
   const name=typeof data.name==='string'?data.name.trim().slice(0,32):'';
   if(!name)return respond(res,400,{error:'invalid_name'});
   const token=randomBytes(32).toString('base64url');
   sessions.set(token,{id:randomUUID(),name,expiry:Date.now()+7*86400_000});
   await save();
   return respond(res,200,{token});
  }
  respond(res,404,{error:'not_found'});
 }catch(e){console.error('HTTP error:',e);respond(res,400,{error:String(e.message||e)})}
});
const wss=new WebSocketServer({noServer:true,maxPayload:MAX_BODY,perMessageDeflate:false});
web.on('upgrade',(req,socket,head)=>{
 if(req.url!=='/ws'){socket.destroy();return}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
 let player=null,connection=null,sequence=Promise.resolve(),count=0,windowAt=Date.now();
 const authTimeout=setTimeout(()=>{if(!player)ws.close(1008,'auth_timeout')},10000);
 ws.on('message',bytes=>{
  sequence=sequence.catch(()=>{}).then(async()=>{
   try{
    if(bytes.length>MAX_BODY)throw Error('message_too_large');
    if(Date.now()-windowAt>1000){windowAt=Date.now();count=0}
    if(++count>40)throw Error('rate_limited');
    const msg=JSON.parse(String(bytes));
    if(!msg||msg.wireVersion!==1||typeof msg.type!=='string')throw Error('invalid_message');
    if(msg.type==='auth'){
     if(player)throw Error('already_authenticated');
     const user=sessions.get(msg.token);
     if(!user||user.expiry<Date.now())throw Error('invalid_token');
     player={id:user.id,name:user.name};clearTimeout(authTimeout);
     const old=connections.get(player.id);
     if(old)old.ws.close(4000,'reconnected');
     connection={ws,roomId:null};connections.set(player.id,connection);
     send(ws,'authenticated',{player});return;
    }
    if(!player)throw Error('authentication_required');
    if(msg.type==='create_room'){
     if(roomOf(connection))throw Error('already_in_room');
     if(msg.gameId!=='zamazka')throw Error('game_unavailable');
     const id=randomUUID();
     const players=[player];
     const initial=game.createRoom({player,players,payload:msg.payload||null});
     if(!initial?.state)throw Error('invalid_game_state');
     const room={id,players,state:initial.state,createdAt:Date.now(),updatedAt:Date.now()};
     rooms.set(id,room);connection.roomId=id;await save();
     send(ws,'room_joined',{roomId:id,gameId:'zamazka',players});
     log('room_created',{roomId:id});return;
    }
    if(msg.type==='join_room'){
     if(roomOf(connection))throw Error('already_in_room');
     const room=rooms.get(msg.roomId);
     if(!room)throw Error('room_not_found');
     await locked(room.id,async()=>{
      if(!member(room,player)){
       if(room.players.length>=ROOM_LIMIT)throw Error('room_full');
       if(room.state.phase!=='lobby')throw Error('game_in_progress');
       room.players.push(player);
      }
      connection.roomId=room.id;
      await apply(room,'join',player);
      send(ws,'room_joined',{roomId:room.id,gameId:'zamazka',players:room.players});
      presence(room);
     });return;
    }
    if(msg.type==='leave_room'){await leave(connection,player);return}
    if(msg.type==='game_message'){
     const room=roomOf(connection);
     if(!room||!member(room,player))throw Error('not_in_room');
     await locked(room.id,()=>apply(room,'message',player,msg.payload));
     return;
    }
    throw Error('unknown_message');
   }catch(e){notice(ws,e);log('client_error',{reason:String(e.message||e)})}
  });
 });
 ws.on('close',()=>{
  clearTimeout(authTimeout);
  if(player&&connections.get(player.id)===connection){
   connections.delete(player.id);
   const room=roomOf(connection);
   if(room)presence(room,player.id);
  }
 });
});
setInterval(()=>{
 for(const room of rooms.values()){
  if(room.state.deadline&&Date.now()>=room.state.deadline&&room.players.length){
   const speaker=room.players.find(p=>connections.get(p.id)?.roomId===room.id)||room.players[0];
   locked(room.id,()=>apply(room,'message',speaker,{type:'pulse'})).catch(e=>log('tick_error',{reason:String(e)}));
  }
  if(!connectedPlayers(room).length&&Date.now()-(room.updatedAt||room.createdAt)>45*60_000){
   locked(room.id,async()=>{rooms.delete(room.id);await save()}).catch(()=>{});
  }
 }
},1100).unref();
setInterval(()=>{
 const at=Date.now();let dirty=false;
 for(const [t,p] of sessions)if(p.expiry<at){sessions.delete(t);dirty=true}
 for(const [ip,rate] of sessionRates)if(at-rate.at>60000)sessionRates.delete(ip);
 if(dirty)save();
},60000).unref();
web.listen(PORT,'127.0.0.1',()=>log('server_listening',{url:'http://127.0.0.1:'+PORT,rooms:rooms.size}));
process.on('SIGINT',()=>{save().finally(()=>{web.close();process.exit(0)})});
