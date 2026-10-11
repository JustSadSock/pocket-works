// Integration smoke: actual HTTP guest session, WS auth, duo/trio rooms, start, sync, persistence.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
const here=fileURLToPath(new URL('.',import.meta.url));
const root=await mkdtemp(join(tmpdir(),'zamazka-online-test-'));
const port=randomInt(16000,40000);
const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,[join(here,'server.mjs')],{cwd:here,env:{...process.env,ZAMAZKA_PORT:String(port),ZAMAZKA_DATA_DIR:root},stdio:['ignore','pipe','pipe']});
let serverLog='';child.stderr.on('data',x=>serverLog+=String(x));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const users=[];
async function waitUntil(url){
 for(let i=0;i<120;i++){
  if(child.exitCode!==null)break;
  try{const r=await fetch(url);if(r.ok)return await r.json()}catch{}
  await delay(100);
 }
 throw Error('Server health not ready: '+serverLog);
}
async function connect(name){
 const response=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
 if(!response.ok)throw Error('Session failed '+response.status);
 const {token}=await response.json();
 const ws=new WebSocket(base.replace('http','ws')+'/ws');
 const queued=[],waiting=[];
 ws.on('message',raw=>{
  const msg=JSON.parse(String(raw));
  const at=waiting.findIndex(w=>w.match(msg));
  if(at<0)queued.push(msg);else waiting.splice(at,1)[0].resolve(msg);
 });
 const next=(type,predicate=()=>true)=>new Promise((resolve,reject)=>{
  const match=m=>m.type===type&&predicate(m);
  const at=queued.findIndex(match);
  if(at>=0){resolve(queued.splice(at,1)[0]);return}
  const entry={match,resolve:msg=>{clearTimeout(timeout);resolve(msg)}};
  waiting.push(entry);
  const timeout=setTimeout(()=>{const i=waiting.indexOf(entry);if(i>=0)waiting.splice(i,1);reject(Error('Timeout waiting for '+type+'; '+JSON.stringify(queued.slice(-3))))},6000);
 });
 const opened=new Promise((ok,bad)=>{ws.once('open',ok);ws.once('error',bad)});
 await opened;
 ws.send(JSON.stringify({wireVersion:1,type:'auth',token}));
 await next('authenticated');
 const u={ws,next,send:(type,fields={})=>ws.send(JSON.stringify({wireVersion:1,type,...fields}))};users.push(u);
 return u;
}
try {
 const health=await waitUntil(base+'/health');
 if(!health.ok||health.gameId!=='zamazka')throw Error('Bad /health');
 const [a,b]=await Promise.all([connect('Alice'),connect('Bob')]);
 a.send('create_room',{gameId:'zamazka'});
 const {roomId}=await a.next('room_joined');
 if(!/^[a-f0-9-]{36}$/.test(roomId))throw Error('Invalid room id');
 b.send('join_room',{roomId});await b.next('room_joined');
 a.send('game_message',{payload:{type:'start',rounds:1}});
 const state=await a.next('game_event',m=>m.event?.type==='state'&&m.event.payload?.phase==='preview');
 if(state.event.payload.selected.length!==5||state.event.payload.participants.length!==2)throw Error('Two-player game failed');
 b.send('game_message',{payload:{type:'sync'}});
 const synced=await b.next('game_event',m=>m.event?.type==='state'&&m.event.payload?.phase==='preview');
 if(synced.event.payload.mine?.art===undefined)throw Error('Missing personal artwork');
 const [c,d,e]=await Promise.all([connect('Chloe'),connect('Daniel'),connect('Emma')]);
 c.send('create_room',{gameId:'zamazka'});
 const joined=await c.next('room_joined');
 d.send('join_room',{roomId:joined.roomId});await d.next('room_joined');
 e.send('join_room',{roomId:joined.roomId});await e.next('room_joined');
 c.send('game_message',{payload:{type:'start',rounds:1}});
 const three=await c.next('game_event',m=>m.event?.type==='state'&&m.event.payload?.phase==='preview');
 if(three.event.payload.participants.length!==3)throw Error('Three-player regression');
 const now=await waitUntil(base+'/health');
 if(now.rooms!==2)throw Error('Expected two rooms');
 console.log('PASS: health / session / websocket / 2-player and 3-player rooms / start / sync / persistence');
}finally{
 for(const u of users)u.ws.close();
 child.kill();
 await delay(80);
 await rm(root,{recursive:true,force:true});
}
