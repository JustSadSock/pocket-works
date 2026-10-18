import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const raw=readFileSync(resolve(root,'server/module.ts'),'utf8');
// Module source is plain ECMAScript (the .ts extension is used by PocketNet
// snapshots), so no transpiler or network dependency is necessary for tests.
const source=raw.replace(/\bexport (const|function)\b/g,'$1').replace('export default module;','return module;');
const mod=new Function(source)();
const p1={id:'north',name:'Север'},p2={id:'south',name:'Юг'};
function joined(){
  let s=mod.createRoom({player:p1}).state;
  s=mod.onJoin({state:s,player:p2,players:[p1,p2]}).state;
  return s;
}
function begun(){
 const s=joined();
 return mod.onMessage({state:s,player:p1,players:[p1,p2],payload:{type:'start',size:'compact'}}).state;
}
test('two players join and host starts a seeded battle',()=>{
 const s=begun();
 assert.equal(s.phase,'battle');assert.equal(s.seats.length,2);
 assert.equal(s.game.h,12);assert.equal(s.game.w,16);
});
test('guest cannot start and nonparticipant cannot order',()=>{
 const s=joined();
 const no=mod.onMessage({state:s,player:p2,players:[p1,p2],payload:{type:'start'}});
 assert.equal(no.events[0].type,'notice');assert.equal(no.state.phase,'lobby');
 const not=mod.onMessage({state:s,player:{id:'alien'},players:[p1,p2],payload:{type:'sync'}});
 assert.equal(not.events[0].type,'notice');
});
test('side-specific views hide seed, unseen terrain, opponent economy and troops',()=>{
 const s=begun(),v1=mod.viewForPlayer({state:s,player:p1}),v2=mod.viewForPlayer({state:s,player:p2});
 for(const [own,enemy,v] of [[1,2,v1],[2,1,v2]]){
  const base=s.game.buildings.find(b=>b.owner===enemy&&b.type==='base');
  assert.equal(v.game.map[base.r][base.c],null);assert.equal(v.game.seed,0);
  assert.equal(v.game.gold[enemy],undefined);
  assert.equal(v.game.units.filter(u=>u.owner===enemy).length,0);
  assert.equal(v.side,own);
 }
});
test('wrong turn, stale revision and out-of-bounds actions are rejected',()=>{
 const s=begun(),rev=s.game.revision;
 const wrong=mod.onMessage({state:s,player:p2,players:[p1,p2],payload:{type:'act',revision:rev,action:{type:'end'}}});
 assert.equal(wrong.events[0].type,'notice');assert.equal(s.game.current,1);
 const stale=mod.onMessage({state:s,player:p1,players:[p1,p2],payload:{type:'act',revision:rev-1,action:{type:'end'}}});
 assert.equal(stale.events[0].type,'notice');
 const invalid=mod.onMessage({state:s,player:p1,players:[p1,p2],payload:{type:'act',revision:rev,action:{type:'move',unit:s.game.units[0].id,r:-1,c:-1}}});
 assert.equal(invalid.events[0].type,'notice');
});
test('completed turn persists and disconnect is not a forfeit',()=>{
 let s=begun();const rev=s.game.revision;
 s=mod.onMessage({state:s,player:p1,players:[p1,p2],payload:{type:'act',revision:rev,action:{type:'end'}}}).state;
 assert.equal(s.game.current,2);
 const snapshot=JSON.parse(JSON.stringify(s));
 assert.equal(mod.viewForPlayer({state:snapshot,player:p2}).game.current,2);
});
