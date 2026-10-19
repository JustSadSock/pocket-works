import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./network.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\s*$/gm, '')
  .replace('export class PocketSocket', 'class PocketSocket');
function transport({ query = '', remembered = null } = {}) {
  class Bus {
    constructor(){this.handlers=new Map();}
    addEventListener(type,fn){const list=this.handlers.get(type)||[];list.push(fn);this.handlers.set(type,list);}
    dispatchEvent(event){for(const fn of this.handlers.get(event.type)||[])fn(event);return true;}
  }
  class Message { constructor(type,{data}={}){this.type=type;this.data=data;} }
  class BasicEvent {constructor(type){this.type=type;}}
  const data=new Map();
  if(remembered)data.set('pocket-works:trace-mosaic:pocket-net:https://example.test/pocketnet',
    JSON.stringify({identityKey:'guest',token:'saved',roomId:remembered}));
  const sessionStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const location={origin:'https://example.test',search:query,pathname:'/apps/trace-mosaic/',reload(){location.reloaded=true;}};
  const history={replaceState(_,__,path){location.pathname=path;location.search='';}};
  class FakeNet {
    constructor(options){
      this.handlers=new Map();this.storage=options.storage;this.storageKey='pocket-net:'+options.serverUrl;
      const v=JSON.parse(options.storage.getItem(this.storageKey)||'null');
      this.roomId=v?.roomId||null;this.token=v?.token||null;this.closed=false;this.joins=[];this.messages=[];
    }
    on(name,fn){this.handlers.set(name,fn);}
    emit(name,data){this.handlers.get(name)?.(data);}
    persist(){this.storage.setItem(this.storageKey,JSON.stringify({roomId:this.roomId,token:this.token,identityKey:'guest'}));}
    connect(){return Promise.resolve(this);}
    joinRoom(id){this.joins.push(id);}
    sendGame(message){this.messages.push(message);}
    leaveRoom(){this.roomId=null;this.persist();}
    createRoom(){}
    close(){this.closed=true;}
  }
  const App = new Function('PocketNet','game','createPractice','EventTarget','MessageEvent','Event',
    'location','localStorage','sessionStorage','history','setInterval','clearInterval',
    source+'\nreturn PocketSocket;'
  )(FakeNet,{viewForPlayer:()=>({phase:'lobby'}),onMessage:()=>({state:{},events:[]})},
    ()=>({room:{practice:true,players:[{id:'local'}],phase:'lobby'}}),
    Bus,Message,BasicEvent,location,localStorage,sessionStorage,history,()=>1,()=>{});
  const adapter = new App();
  const messages=[];
  adapter.addEventListener('message',e=>messages.push(JSON.parse(e.data)));
  return {adapter,messages,location,data};
}
const roomId='12345678-1234-4000-8000-123456789abc';

test('explicit invite replaces unrelated saved room and joins once',()=>{
  const {adapter}=transport({query:'?room=abcdef12',remembered:roomId});
  assert.equal(adapter.net.roomId,null);
  adapter.net.emit('connected',{player:{id:'owner'}});
  assert.deepEqual(adapter.net.joins,['abcdef12']);
});
test('reopening the same room never sends a duplicate join',()=>{
  const {adapter}=transport({query:'?room=12345678',remembered:roomId});
  adapter.net.emit('connected',{player:{id:'owner'}});
  assert.deepEqual(adapter.net.joins,[]);
  adapter.net.emit('room_joined',{roomId,gameId:'trace-mosaic',state:{phase:'lobby',players:[]}});
  assert.equal(adapter.code,'12345678');
});
test('disconnect preserves seat and blocks outgoing game events until reauthentication',()=>{
  const {adapter,messages}=transport();
  adapter.net.emit('connected',{player:{id:'owner'}});
  adapter.net.emit('room_joined',{roomId,gameId:'trace-mosaic',state:{phase:'playing',players:[]}});
  adapter.net.emit('disconnected',{});
  assert.equal(adapter.code,'12345678');
  assert.equal(adapter.readyState,0);
  assert.equal(adapter.send(JSON.stringify({type:'pulse'})),false);
  assert.equal(messages.at(-1).payload.status,'reconnecting');
  adapter.net.emit('connected',{player:{id:'owner'}});
  adapter.net.emit('room_joined',{roomId,gameId:'trace-mosaic',state:{phase:'playing',players:[]}});
  assert.equal(adapter.readyState,1);
  assert.equal(adapter.net.messages.some(m=>m.type==='pulse'),true);
});
test('wrong-game link is rejected and detached from its room',()=>{
  const {adapter,messages}=transport();
  adapter.net.emit('connected',{player:{id:'owner'}});
  adapter.net.roomId=roomId;
  adapter.net.emit('room_joined',{roomId,gameId:'another-game',state:{}});
  assert.equal(adapter.net.roomId,null);
  assert.equal(messages.some(m=>m.type==='room_lost'),true);
});
