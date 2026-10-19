import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Two independently named members exercise the real pinned PocketNet rules.
// Network delivery is intentionally shuffled; this is a deterministic transport
// simulation, not a substitute for testing Cloudflare WebSockets end-to-end.
const text=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const source=text
 .replace('../../../apps/blockies/engine-core-v1.js',new URL('../engine-core-v1.js',import.meta.url).href)
 .replace('../../../apps/blockies/player-core-v1.js',new URL('../player-core-v1.js',import.meta.url).href);
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const a={id:'peer-a',name:'A'},b={id:'peer-b',name:'B'};
function start(){
 let state=game.createRoom({player:a}).state;
 state=game.onJoin({state,player:b}).state;
 for(const player of [a,b])state=game.onMessage({state,player,payload:{type:'ready'}}).state;
 assert.equal(state.phase,'playing');
 return state;
}
test('two peers maintain one authoritative well with shuffled network deliveries',()=>{
 let state=start(),messages=[
  {player:b,payload:{type:'input',round:1,input:{action:'hold'}},order:10},
  {player:a,payload:{type:'input',round:1,input:{action:'hardDrop'}},order:30},
  {player:b,payload:{type:'input',round:1,input:{action:'move',direction:1}},order:50},
  {player:a,payload:{type:'input',round:1,input:{action:'hold'}},order:90}
 ];
 const views={a:{revision:-1,state:null},b:{revision:-1,state:null}},deliveries=[];
 for(const message of messages){
  state=game.onMessage({state,player:message.player,payload:message.payload}).state;
  assert.ok(state.engine.board.flat().every(cell=>Number.isInteger(cell)&&cell>=0&&cell<=2));
  const snapshot=structuredClone(state);
  deliveries.push({peer:'a',at:message.order+((message.order%3)*145),snapshot});
  deliveries.push({peer:'b',at:message.order+((message.order%2)*110),snapshot});
 }
 for(const event of deliveries.sort((x,y)=>x.at-y.at)){
  const peer=views[event.peer];
  if(event.snapshot.revision>peer.revision){
   peer.revision=event.snapshot.revision;
   peer.state=event.snapshot;
  }
 }
 assert.equal(views.a.revision,state.revision);
 assert.equal(views.b.revision,state.revision);
 assert.deepEqual(views.a.state.engine.board,views.b.state.engine.board);
 assert.deepEqual(views.a.state.engine.players,views.b.state.engine.players);
 assert.equal(state.engine.players[1].holdUsed,true);
 assert.equal(state.engine.board.flat().filter(Boolean).length,4);
 const tooLate=game.onMessage({state,player:b,payload:{type:'input',round:0,input:{action:'hold'}}}).state;
 assert.equal(tooLate.engine.players[1].holdUsed,true);
});
test('one disconnected peer freezes while the other continues to operate',()=>{
 let state=start(),now=Date.now();
 state.players[1].lastSeenAt=now-5000;
 state.lastTick=now-800;
 const previous=state.engine.players[1];
 const position=structuredClone(previous.position);
 state=game.onTick({state,onlineIds:[a.id],now}).state;
 assert.equal(state.players[1].away,true);
 assert.deepEqual(state.engine.players[1].position,position);
 assert.equal(state.engine.players[1].dropCounter,previous.dropCounter);
 state=game.onMessage({state,player:a,payload:{type:'input',round:1,input:{action:'hardDrop'}}}).state;
 assert.equal(state.engine.board.flat().filter(Boolean).length,4);
 assert.equal(state.engine.players[1].holdUsed,false);
});
