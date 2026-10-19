import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import WebSocket from 'ws';

const serverEntrypoint=fileURLToPath(new URL('../src/main.mjs',import.meta.url));
const gameEntrypoint=fileURLToPath(new URL('../../apps/blockies/server/module.ts',import.meta.url));

async function port(){
 const tcp=createServer();
 await new Promise(resolve=>tcp.listen(0,'127.0.0.1',resolve));
 const number=tcp.address().port;
 await new Promise(resolve=>tcp.close(resolve));
 return number;
}
async function online(base){
 for(let i=0;i<70;i++){
  try{if((await fetch(base+'/health')).ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw Error('Pocket Server not listening');
}
async function player(base,token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws');
 const pending=[];
 const arrivals=[];
 ws.on('message',buffer=>{
  const value=JSON.parse(String(buffer));
  const found=pending.find(item=>item.type===value.type&&item.when(value));
  if(found){
   pending.splice(pending.indexOf(found),1);
   clearTimeout(found.timeout);
   found.resolve(value);
  }else arrivals.push(value);
 });
 const next=(type,when=()=>true)=>{
  const index=arrivals.findIndex(item=>item.type===type&&when(item));
  if(index>=0)return Promise.resolve(arrivals.splice(index,1)[0]);
  return new Promise((resolve,reject)=>{
   const item={type,when,resolve,reject,timeout:null};
   item.timeout=setTimeout(()=>{
    pending.splice(pending.indexOf(item),1);
    reject(Error('Timed out waiting for '+type));
   },8000);
   pending.push(item);
  });
 };
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 const send=(type,data={})=>ws.send(JSON.stringify({wireVersion:1,type,...data}));
 send('auth',{token});
 const auth=await next('authenticated');
 return {ws,next,send,id:auth.player.id,close:()=>new Promise(resolve=>{
  if(ws.readyState===WebSocket.CLOSED)return resolve();
  ws.once('close',resolve);ws.close();
 })};
}
async function session(base,name){
 const res=await fetch(base+'/session',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({name})});
 assert.equal(res.status,200);
 return (await res.json()).token;
}
async function publishBlockies(base){
 const built=await build({entryPoints:[gameEntrypoint],bundle:true,
  platform:'node',target:'node22',format:'esm',write:false,minify:true,logLevel:'silent'});
 const bundle=built.outputFiles[0].text;
 const res=await fetch(base+'/admin/modules',{method:'POST',headers:{
  authorization:'Bearer blockies-test-deploy',
  'content-type':'application/json'
 },body:JSON.stringify({gameId:'blockies',protocolVersion:1,bundle,
  sha256:createHash('sha256').update(bundle).digest('hex')})});
 assert.equal(res.status,200,await res.text());
}

test('live WebSockets: two Blockies players, server-snapshot sync, dropout and reconnect',
 {timeout:45000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'blockies-ws-'));
 const base='http://127.0.0.1:'+await port();
 const child=spawn(process.execPath,[serverEntrypoint],{
  env:{...process.env,PORT:new URL(base).port,
   POCKET_DATA_DIR:directory,POCKET_AUTH_SECRET:'blockies-test-auth',
   POCKET_DEPLOY_TOKEN:'blockies-test-deploy'},
  stdio:['ignore','pipe','pipe']
 });
 const peers=[];
 const errors=[];
 child.stderr.on('data',buffer=>errors.push(String(buffer)));
 try{
  await online(base);
  await publishBlockies(base);
  const tokenA=await session(base,'A');
  const tokenB=await session(base,'B');
  const a=await player(base,tokenA);peers.push(a);
  const b=await player(base,tokenB);peers.push(b);
  a.send('create_room',{gameId:'blockies'});
  const created=await a.next('room_joined');
  assert.equal(created.state.phase,'lobby');
  b.send('join_room',{roomId:created.roomId});
  const joined=await b.next('room_joined');
  assert.equal(joined.roomId,created.roomId);
  const roomId=created.roomId;

  const readyA=a.next('game_event',m=>m.event?.payload?.players?.find(p=>p.id===a.id)?.ready);
  a.send('game_message',{payload:{type:'ready'}});
  await readyA;
  const startedB=b.next('game_event',m=>m.event?.payload?.phase==='playing');
  b.send('game_message',{payload:{type:'ready'}});
  const start=await startedB;
  assert.equal(start.event.payload.players.length,2);
  assert.equal(start.event.payload.engine.board.length,20);
  const round=start.event.payload.round;

  // Inputs mutate only their authenticated seats and propagate to the other socket.
  const updatedB=b.next('game_event',m=>m.event?.payload?.phase==='playing' &&
    m.event.payload.engine.players[0].holdUsed===true);
  a.send('game_message',{payload:{type:'input',round,input:{action:'hold'}}});
  const swap=await updatedB;
  assert.equal(swap.event.payload.engine.players[0].holdUsed,true);
  assert.equal(swap.event.payload.engine.players[1].holdUsed,false);
  assert.ok(swap.event.payload.revision>start.event.payload.revision);
  const droppedA=a.next('game_event',m=>m.event?.payload?.engine?.board?.flat().some(Boolean));
  b.send('game_message',{payload:{type:'input',round,input:{action:'hardDrop'}}});
  const hard=await droppedA;
  const locked=hard.event.payload.engine.board.flat().filter(Boolean).length;
  assert.equal(locked,4);

  await b.close();
  const away=a.next('game_event',m=>m.event?.payload?.players?.[1]?.away===true);
  const paused=await away;
  assert.equal(paused.event.payload.engine.board.flat().filter(Boolean).length,locked);

  const reconnected=await player(base,tokenB);peers.push(reconnected);
  assert.equal(reconnected.id,b.id,'session token reclaims same seat');
  reconnected.send('join_room',{roomId});
  const rejoined=await reconnected.next('room_joined');
  assert.equal(rejoined.state.phase,'playing');
  assert.equal(rejoined.state.engine.board.flat().filter(Boolean).length,locked);
  assert.equal(rejoined.state.players[1].id,b.id);
  const restored=a.next('game_event',m=>m.event?.payload?.players?.[1]?.away===false);
  await restored;

  const before=rejoined.state.revision;
  const invalid=a.next('game_event',m=>m.event?.payload?.revision>before);
  a.send('game_message',{payload:{type:'input',round:round-1,input:{action:'hold'}}});
  const ignored=await invalid;
  assert.equal(ignored.event.payload.engine.players[0].holdUsed,true);
 }finally{
  await Promise.all(peers.map(p=>p.close().catch(()=>{})));
  if(child.exitCode===null){
   child.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),
    new Promise(resolve=>setTimeout(resolve,3000))]);
   if(child.exitCode===null)child.kill('SIGKILL');
  }
  await rm(directory,{recursive:true,force:true});
  if(errors.length)console.error('Blockies WebSocket test server stderr:',errors.join('').slice(-2000));
 }
});
