import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

function createAdapter(creating=false){
 const source=readFileSync(new URL('../network.js',import.meta.url),'utf8')
  .replace(/^import[^\n]+\n/,'').replace('export class PocketSocket','class PocketSocket');
 const instances=[];
 class FakePocketNet{
  constructor(){this.roomId='old-stale-id';this.closed=false;this.listeners=new Map();this.sent=[];instances.push(this);}
  on(type,handler){this.listeners.set(type,[...(this.listeners.get(type)||[]),handler]);}
  emit(type,message={}){for(const fn of this.listeners.get(type)||[])fn(message);}
  persist(){this.persisted=this.roomId;}
  connect(){
   queueMicrotask(()=>this.emit('connected',{player:{id:'fighter-one'}}));
   return Promise.resolve();
  }
  createRoom(id,payload){this.sent.push({type:'create',id,payload});}
  joinRoom(code){this.sent.push({type:'join',code});}
  sendGame(p){this.sent.push({type:'game',payload:p});}
  leaveRoom(){this.sent.push({type:'leave'});this.roomId=null;this.persist();}
  close(){this.closed=true;}
 }
 const store=new Map();
 const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const sandbox={PocketNet:FakePocketNet,location:{origin:'https://test.invalid'},
  document:{querySelector:()=>({value:'Ronin'})},sessionStorage:storage,
  globalThis:{katanaCreate:creating},queueMicrotask,
  EventTarget,Event,MessageEvent,CustomEvent};
 const Socket=runInNewContext(source+';PocketSocket',sandbox);
 return {Socket,instances};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('new rooms clear stale PocketNet room and reconnect receives a fresh event',async()=>{
 const {Socket,instances}=createAdapter(true);
 const socket=new Socket();
 const client=instances[0];let open=0,restored=0,closed=0,joined=0;
 socket.addEventListener('open',()=>open++);
 socket.addEventListener('reconnected',()=>restored++);
 socket.addEventListener('close',()=>closed++);
 socket.addEventListener('message',e=>{if(JSON.parse(e.data).type==='room')joined++;});
 await tick();
 assert.equal(open,1);assert.equal(client.roomId,null);
 assert.equal(client.persisted,null,'new room flow must not join saved room');
 socket.send(JSON.stringify({type:'join',mode:'echo-trap'}));
 assert.equal(client.sent.at(-1).type,'create');
 client.roomId='abcdef12-0000-4000-8000-000000000000';
 client.emit('room_joined',{roomId:client.roomId,state:{map:{walls:[]},players:[],phase:'lobby'}});
 assert.equal(socket.joined,true);assert.equal(joined,1);
 socket.send(JSON.stringify({type:'input',payload:{seq:10}}));
 assert.equal(client.sent.at(-1).type,'game');
 client.emit('disconnected');
 assert.equal(closed,1);assert.equal(socket.readyState,0);
 const count=client.sent.length;
 socket.send(JSON.stringify({type:'input',payload:{seq:11}}));
 assert.equal(client.sent.length,count,'input must not leak into a broken socket');
 client.emit('connected',{player:{id:'fighter-one'}});
 assert.equal(restored,1);
 assert.equal(socket.joined,false,'wait for authoritative room rejoin');
 client.emit('room_joined',{roomId:client.roomId,state:{map:{walls:[]},players:[],phase:'playing'}});
 assert.equal(socket.joined,true);assert.equal(joined,2);
 socket.send(JSON.stringify({type:'input',payload:{seq:12}}));
 assert.equal(client.sent.at(-1).payload.payload.seq,12);
 socket.close();assert.equal(client.closed,true);
 client.emit('connected',{player:{id:'fighter-one'}});
 assert.equal(restored,1,'closed adapter must ignore future reconnect');
});

test('transient gameplay error does not expel duelist, missing room is fatal',async()=>{
 const {Socket,instances}=createAdapter(false);
 const socket=new Socket(),client=instances[0],errors=[];
 socket.addEventListener('error',e=>errors.push(e.detail));
 await tick();
 client.emit('error',{code:'rate_limited'});
 assert.equal(errors.at(-1).fatal,true,'cannot recover a rate limit before room joined');
 client.emit('room_joined',{roomId:'abcdef12',state:{map:{},players:[],phase:'lobby'}});
 client.emit('error',{code:'rate_limited'});
 assert.equal(errors.at(-1).fatal,false,'combat rate limit can recover in place');
 client.emit('error',{code:'room_not_found'});
 assert.equal(errors.at(-1).fatal,true);
 assert.match(errors.at(-1).message,/Комната/);
 socket.close();
});
