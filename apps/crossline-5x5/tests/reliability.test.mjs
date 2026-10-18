import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import moduleV2,{initialMatch,validatePlan,aiPlan,simulateRound,viewForPlayer} from '../server/module.ts';
import moduleV1 from '../../../pocketnet/module-versions/crossline-5x5/v1.ts';

const player=id=>({id,name:id,verified:false});
const A=player('a'),B=player('b'),C=player('c');
const five=['up','down','left','right','shield'];
const begin=(mod=moduleV2)=>{
 let state=mod.createRoom({player:A}).state;
 state=mod.onJoin({state,player:B,players:[A,B]}).state;
 state=mod.onMessage({state,player:A,players:[A,B],payload:{type:'start'}}).state;
 return state;
};
const say=(mod,state,who,type,extra={})=>mod.onMessage({state,player:who,players:[A,B],payload:{type,...extra}}).state;

test('v2 voluntary surrender awards exactly one victory and freezes pending commands',()=>{
 let state=begin();
 state=say(moduleV2,state,A,'plan',{round:1,revision:0,actions:five});
 assert.equal(state.pending.A.length,5);
 state=say(moduleV2,state,A,'forfeit');
 assert.equal(state.phase,'finished');
 assert.equal(state.match.outcome,'B');
 assert.equal(state.score.B,1);
 assert.deepEqual(state.pending,{A:null,B:null});
 assert.deepEqual(state.match.termination,{type:'forfeit',by:'A',reason:'surrender',round:1});
 state=say(moduleV2,state,A,'forfeit');
 assert.equal(state.score.B,1,'double surrender may not double-score');
});
test('opponent plans remain secret when one player has submitted and socket reconnects',()=>{
 let state=begin();
 state=say(moduleV2,state,A,'plan',{round:1,revision:0,actions:five});
 assert.deepEqual(viewForPlayer({state,player:B}).ownPlan,[]);
 assert.deepEqual(viewForPlayer({state,player:A}).ownPlan,five);
 assert.equal(viewForPlayer({state,player:B}).ready.A,true);
 // A disconnected socket causes no onLeave; server state and seat persist.
 assert.equal(state.phase,'planning');
 assert.equal(viewForPlayer({state,player:A}).side,'A');
});
test('explicit exit retains completed match, score and remaining player identity',()=>{
 let state=begin();
 state=moduleV2.onLeave({state,player:B,players:[A]}).state;
 assert.equal(state.phase,'finished');
 assert.equal(state.match.outcome,'A');
 assert.equal(state.score.A,1);
 assert.equal(state.match.termination.reason,'left_room');
 assert.deepEqual(state.seats,['a','b']);
 assert.equal(state.players.length,1);
 state=moduleV2.onJoin({state,player:C,players:[A,C]}).state;
 assert.deepEqual(state.seats,['a','c']);
 state=moduleV2.onMessage({state,player:A,players:[A,C],payload:{type:'rematch'}}).state;
 assert.equal(state.phase,'planning');
 assert.equal(state.score.A,1,'series score must not reset on rematch');
 assert.equal(state.match.outcome,null);
});
test('host abandonment preserves guest as player B and transfers host to guest',()=>{
 let state=begin();
 state=moduleV2.onLeave({state,player:A,players:[B]}).state;
 assert.equal(state.host,B.id);
 assert.equal(state.phase,'finished');
 assert.equal(state.score.B,1);
 assert.equal(viewForPlayer({state,player:B}).side,'B');
 state=moduleV2.onJoin({state,player:C,players:[B,C]}).state;
 assert.deepEqual(state.seats,['c','b']);
 assert.equal(viewForPlayer({state,player:B}).side,'B');
 state=moduleV2.onMessage({state,player:B,players:[B,C],payload:{type:'rematch'}}).state;
 assert.equal(state.phase,'planning');
});
test('v1 pinned rooms remain v1; no retroactive surrender protocol mutation',()=>{
 const state=begin(moduleV1);
 assert.equal(state.phase,'planning');
 const ignored=say(moduleV1,state,A,'forfeit');
 assert.equal(ignored.phase,'planning');
 assert.equal(ignored.match.outcome,null);
});
test('AI produces legal commands on all five levels without reading secret player plan',()=>{
 const diff=['easy','normal','hard','expert','insane'];
 for(const level of diff){
  let seed=491;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const left=aiPlan(initialMatch(),Array(5).fill('left'),level,random);
  seed=491;
  const right=aiPlan(initialMatch(),Array(5).fill('right'),level,random);
  assert.deepEqual(left,right,level+' AI used hidden orders');
  assert.equal(validatePlan(left),null);
  assert.ok(simulateRound(initialMatch(),{A:five,B:left}).record.frames.length>0);
 }
});
test('server module source and immutable pinned v2 snapshot are identical',async()=>{
 const current=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
 const pinned=await readFile(new URL('../../../pocketnet/module-versions/crossline-5x5/v2.ts',import.meta.url),'utf8');
 assert.equal(pinned,current);
});
test('client persists local drafts and guards hiding A orders during hotseat handoff',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/sessionStorage\.getItem\(KEY\+k\)/);
 assert.match(app,/localStorage\.setItem\(KEY\+k,legacy\)/);
 assert.match(app,/draft:mode==='hotseat'&&offline\.pending\?\.A&&offline\.turn==='A'\?\[\]:plan/);
 assert.match(app,/if\(mode==='hotseat'&&offline\?\.pending\?\.A&&!offline\?\.pending\?\.B&&offline\.turn==='A'\)handoff\(\)/);
 assert.match(app,/offline\.pending\[who\]=JSON\.parse\(JSON\.stringify\(plan\)\);\s*plan=\[\];/);
 assert.match(app,/pendingForfeitLeave&&next\.phase==='finished'/);
 assert.match(app,/roomVersion!=='v2'/);
});
