import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:rules}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const p=[{id:'host',name:'Хозяин'},{id:'guest',name:'Гость'}];
function room(){
 let s=rules.createRoom({player:p[0]}).state;
 s=rules.onJoin({state:s,player:p[1],players:p}).state;
 const send=(side,payload)=>{const result=rules.onMessage({state:s,player:p[side],players:p,payload});s=result.state;return result;};
 return {send,get state(){return s},set state(next){s=next}};
}
test('v2 starts only with two original seats; invalid commands do not mutate',()=>{
 const r=room();assert.equal(r.state.phase,'lobby');
 r.send(1,{type:'start'});assert.equal(r.state.phase,'lobby');
 r.send(0,{type:'start'});assert.equal(r.state.phase,'playing');
 const v=structuredClone(r.state.game.vehicles[0]);
 r.send(1,{type:'route',vehicle:0,route:[1]});assert.deepEqual(r.state.game.vehicles[0],v);
 r.send(0,{type:'route',vehicle:0,route:[999]});assert.deepEqual(r.state.game.vehicles[0],v);
});
test('enemy personal destinations, stops and routes are hidden from both room snapshots',()=>{
 const r=room();r.send(0,{type:'start'});
 for(let side=0;side<2;side++)r.send(side,{type:'auto',vehicle:side*2});
 const s=r.state;
 assert.ok(s.game.vehicles[0].route.length>0&&s.game.vehicles[2].route.length>0);
 for(let side=0;side<2;side++){
  const view=rules.viewForPlayer({state:s,player:p[side],players:p});
  assert.ok(view.game.vehicles[side*2].route.length>0);
  assert.deepEqual(view.game.vehicles[(1-side)*2].route,[]);
  assert.equal(view.game.vehicles[(1-side)*2].goal,-1);
  assert.equal(view.game.vehicles[(1-side)*2].stop,null);
  assert.equal(view.game.vehicles[side*2].goal,s.game.vehicles[side*2].goal);
  assert.equal(view.game.offers.length,2);
 }
 assert.ok(r.send(0,{type:'sync'}).events.some(e=>e.type==='state'&&e.to==='host'));
});
test('one player ready does not advance; ready prevents route changes; two ready advance once',()=>{
 const r=room();r.send(0,{type:'start'});r.send(0,{type:'auto',vehicle:0});
 r.send(0,{type:'ready',ready:true});assert.equal(r.state.game.turn,0);
 const old=r.state.game.vehicles[0].route.slice();
 r.send(0,{type:'route',vehicle:0,route:[]});assert.deepEqual(r.state.game.vehicles[0].route,old);
 r.send(1,{type:'ready',ready:true});
 assert.equal(r.state.game.turn,1);assert.deepEqual(r.state.ready,[false,false]);
});
test('rejoin original durable seat without allowing third parties to steal it',()=>{
 const r=room();r.send(0,{type:'start'});
 r.state=rules.onLeave({state:r.state,player:p[1],players:[p[0]]}).state;
 assert.equal(r.state.phase,'playing');
 const foreign={id:'intruder',name:'Взломщик'};
 assert.throws(()=>rules.onJoin({state:r.state,player:foreign,players:[p[0],foreign]}),/match_in_progress/);
 r.state=rules.onJoin({state:r.state,player:p[1],players:p}).state;
 assert.equal(r.state.missing[1],0);assert.equal(r.state.players.length,2);
});
test('timeout forfeit only after 3 minutes of inactivity; winner is authoritative',()=>{
 const r=room();r.send(0,{type:'start'});
 r.send(0,{type:'forfeit'});assert.equal(r.state.phase,'playing');
 r.state.lastAction[1]=Date.now()-181000;
 r.send(0,{type:'forfeit'});assert.equal(r.state.phase,'finished');
 assert.equal(r.state.game.winnerOverride,0);
 r.send(0,{type:'ready',ready:true});assert.equal(r.state.game.phase,'finished');
});
test('new game after completed 30-turn match retains original seats',()=>{
 const r=room();r.send(0,{type:'start'});
 for(let i=0;i<30;i++){r.send(0,{type:'ready',ready:true});r.send(1,{type:'ready',ready:true});}
 assert.equal(r.state.phase,'finished');r.send(0,{type:'again'});
 assert.equal(r.state.phase,'playing');assert.equal(r.state.game.turn,0);
 assert.equal(r.state.game.rulesVersion,2);
});
