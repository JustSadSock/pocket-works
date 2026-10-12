// Run: node --experimental-strip-types apps/picto/qa/rules.mjs
// Exercises the same TypeScript module used in immutable PocketNet snapshots.
import assert from 'node:assert/strict';
import module, { SCENE_COUNT, TOTAL_TASKS } from '../server/module.ts';

const count=SCENE_COUNT;
assert.equal(count,127);
assert.equal(TOTAL_TASKS,508);

const testPlayer=i=>({id:'player-'+i,name:'Игрок '+i});
const players=Array.from({length:8},(_,i)=>testPlayer(i));
const kinds=new Set();
const generated=new Set();
for(let session=0;session<25;session++){
 let state=module.createRoom({player:players[0],players:[players[0]]}).state;
 for(let n=1;n<players.length;n++)state=module.onJoin({state,player:players[n],players:players.slice(0,n+1)}).state;
 state=module.onMessage({state,player:players[0],players,payload:{type:'start'}}).state;
 assert.equal(state.phase,'compose');
 const order=[];
 for(let round=0;round<8;round++){
  assert.equal(state.round,round+1);
  const author=players[round];
  assert.equal(state.author,author.id);
  assert.equal(state.options.length,4);
  assert.equal(new Set(state.options).size,4,'Choices within one pack must be different');
  assert.ok(state.correct>=0&&state.correct<4);
  const key=state.options.slice().sort().join('|');
  assert.ok(!generated.has(key)||session>0,'The same pack must not repeat within the first match');
  generated.add(key);
  kinds.add(state.kind);order.push(state.kind);
  const packets=module.onMessage({state,player:players[0],players,payload:{type:'sync'}}).events;
  assert.equal(packets.length,1);
  const bystander=module.onMessage({state,player:players[(round+1)%8],players,payload:{type:'sync'}}).events[0].payload;
  assert.equal(bystander.prompt,null);
  assert.deepEqual(bystander.authorOptions,[]);
  assert.equal(bystander.correct,null);
  assert.deepEqual(bystander.options,[]);
  const artist=module.onMessage({state,player:author,players,payload:{type:'sync'}}).events[0].payload;
  assert.equal(artist.prompt,state.options[state.correct]);
  assert.deepEqual(artist.authorOptions,state.options);
  const beforeBoard=JSON.stringify(state.board);
  const forbidden=module.onMessage({state,player:players[(round+1)%8],players,payload:{type:'edit',glyphs:[{id:'not',x:50,y:50,r:0,s:1}]}}).state;
  assert.equal(JSON.stringify(forbidden.board),beforeBoard,'Only the author edits');
  state=module.onMessage({state,player:author,players,payload:{type:'edit',glyphs:[{id:'bird',x:35,y:51,r:0,s:1},{id:'swap',x:62,y:51,r:0,s:1}]}}).state;
  assert.equal(state.board.length,2);
  state=module.onMessage({state,player:author,players,payload:{type:'publish'}}).state;
  assert.equal(state.phase,'guess');
  for(const player of players){
   if(player.id===author.id)continue;
   state=module.onMessage({state,player,players,payload:{type:'answer',choice:state.correct}}).state;
  }
  assert.equal(state.phase,'reveal');
  assert.equal(state.history.at(-1).correct,7);
  if(round<7)state=module.onMessage({state,player:players[0],players,payload:{type:'next'}}).state;
 }
 assert.equal(state.phase,'reveal');
 state=module.onMessage({state,player:players[0],players,payload:{type:'next'}}).state;
 assert.equal(state.phase,'results');
 assert.equal(state.score,56);
 assert.equal(state.attempts,56);
 assert.equal(state.history.length,8);
 assert.equal(new Set(state.usedScenes).size,8,'Scenes must not repeat during a game');
 assert.equal(new Set(order.slice(0,6)).size,6,'Six distinct grammars in first six rounds');
}
assert.equal(kinds.size,6);
console.log('PICTO semantic tests OK —',count,'packs,',TOTAL_TASKS,'phrases, 25 end-to-end 8-player matches.');
