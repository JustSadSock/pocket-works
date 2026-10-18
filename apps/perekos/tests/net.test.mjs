import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import module,{RULESET_VERSION} from '../server/module.ts';
const p={id:'first',name:'Маг 1',avatar:'clay',verified:false};
const q={id:'second',name:'Маг 2',avatar:'wave',verified:false};
const send=(s,who,type,extra={})=>module.onMessage({state:s,player:who,players:[p,q],payload:{type,...extra}});
const input=(seq,round,changes={})=>({type:'input',seq,round,control:{x:0,y:0,aim:{x:200,y:300},attack:false,shield:false,dash:false,...changes}});
function room(){const first=module.createRoom({player:p}).state;return module.onJoin({state:first,player:q,players:[p,q]}).state}
function match(){const s=room();send(s,p,'start');return s}
test('server module is importable and binary-exact immutable v1 snapshot',async()=>{
 const [main,snapshot]=await Promise.all([readFile(new URL('../server/module.ts',import.meta.url),'utf8'),readFile(new URL('../../../pocketnet/module-versions/perekos/v1.ts',import.meta.url),'utf8')]);
 assert.equal(main,snapshot);assert.equal(RULESET_VERSION,1);
 assert.equal(module.protocolVersion,1);
});
test('rooms have two durable authenticated seats and host must start',()=>{
 let s=module.createRoom({player:p}).state;assert.equal(s.phase,'lobby');
 const attempt=send(s,p,'start');assert.ok(attempt.events.some(e=>e.type==='notice'));assert.equal(s.match,null);
 s=module.onJoin({state:s,player:q,players:[p,q]}).state;
 assert.throws(()=>module.onJoin({state:s,player:{id:'intruder'},players:[p,q,{id:'intruder'}]}),/room_full/);
 send(s,q,'start');assert.equal(s.phase,'lobby');
 send(s,p,'start');assert.equal(s.phase,'fight');assert.equal(s.match.phase,'fight');
 assert.deepEqual(s.match.actors.map(a=>a.runes),[['on_cast','ball'],['on_cast','ball']]);
});
test('invalid and replayed packets never alter position, score, health or rune choices',()=>{
 const s=match(),initial=s.match.actors[0].x,round=s.match.round;
 const wrong=send(s,{id:'intruder'},'input',{...input(0,round),score:[4,0],hp:0});
 assert.equal(wrong.events.length,0);
 for(const [seq,control] of [[0,{x:4,y:0,aim:{x:200,y:300}}],[1,{x:NaN,y:0,aim:{x:200,y:300}}],[2,{x:0,y:0,aim:{x:999,y:300}}]]){
  send(s,p,'input',{seq,round,control,score:[4,0],hp:0});
 }
 assert.equal(s.match.actors[0].x,initial);assert.deepEqual(s.match.score,[0,0]);
 assert.equal(s.match.actors[0].hp,100);assert.deepEqual(s.match.actors[0].runes,['on_cast','ball']);
});
test('valid inputs move real server fighter; client cannot choose physics or winner',()=>{
 const old=Date.now;let time=1_000_000;Date.now=()=>time;
 try{
  const s=match(),firstX=s.match.actors[0].x,round=s.match.round;
  for(let i=0;i<18;i++){
   time+=70;send(s,p,'input',{...input(i,round,{x:1,y:0,aim:{x:300,y:400},attack:i===1}),winner:0});
   send(s,q,'input',input(i,round));
  }
  assert.ok(s.match.actors[0].x>firstX);
  assert.ok(s.match.actors[0].cast>=0);assert.deepEqual(s.match.score,[0,0]);
  assert.ok(s.match.ticks>20&&s.match.remaining<25);
 }finally{Date.now=old}
});
test('two server-side rune offers stay secret across room joined and state event',()=>{
 const old=Date.now;let time=2_000_000;Date.now=()=>time;
 try{
  const s=match();s.match.remaining=.01;s.match.overtime=1;s.match.actors[0].hp=50;time+=80;
  send(s,p,'input',input(0,1));
  assert.equal(s.phase,'draft');assert.equal(s.offers[0].length,3);assert.equal(s.offers[1].length,3);
  assert.deepEqual(s.match.pick,[]);
  const first=module.viewForPlayer({state:s,player:p,players:[p,q]});
  const second=module.viewForPlayer({state:s,player:q,players:[p,q]});
  assert.deepEqual(first.offers,s.offers[0]);assert.deepEqual(second.offers,s.offers[1]);
  assert.equal('offers' in first.match,false);
  assert.equal(JSON.stringify(first).includes(JSON.stringify(s.offers[1])),false);
  const bad=send(s,p,'pick',{rune:'on_cast'});assert.ok(bad.events.some(e=>e.type==='notice'));
  assert.equal(s.picked[0],false);
  assert.ok(send(s,p,'pick',{rune:s.offers[0][0]}).events.length);
  assert.ok(send(s,q,'pick',{rune:s.offers[1][0]}).events.length);
  assert.equal(s.picked.every(Boolean),true);
  assert.equal(send(s,p,'ready',{runes:['on_cast']}).events[0].type,'notice');
  assert.ok(send(s,p,'ready',{runes:[...s.match.actors[0].runes]}).events.length);
  assert.equal(s.phase,'draft');
  send(s,q,'ready',{runes:[...s.match.actors[1].runes]});
  assert.equal(s.phase,'fight');assert.equal(s.match.round,2);
  assert.equal(s.match.score.reduce((a,b)=>a+b,0),1);
 }finally{Date.now=old}
});
test('reconnect sync keeps the original side, score, runes, version and host',()=>{
 const s=match(),before=JSON.stringify(s.match),seat1=module.viewForPlayer({state:s,player:q,players:[p,q]});
 assert.equal(seat1.me,1);assert.equal(seat1.rulesVersion,1);
 s.seen[1]=0;const stale=module.viewForPlayer({state:s,player:p,players:[p,q]});assert.equal(stale.opponentConnected,false);
 const reply=send(s,q,'sync');assert.equal(reply.events[0].to,'second');
 assert.equal(JSON.stringify(s.match),before);assert.equal(module.viewForPlayer({state:s,player:q,players:[p,q]}).me,1);
 assert.equal(s.host,'first');
});
test('leaving during fight awards forfeit without shifting the remaining seat',()=>{
 const s=match();module.onLeave({state:s,player:p,players:[q]});
 assert.equal(s.phase,'result');assert.equal(s.match.champion,1);
 assert.deepEqual(s.seats,['','second']);
 assert.equal(module.viewForPlayer({state:s,player:q,players:[q]}).me,1);
 const third={id:'third',name:'Маг 3'};
 module.onJoin({state:s,player:third,players:[q,third]});
 assert.deepEqual(s.seats,['third','second']);
 assert.equal(module.viewForPlayer({state:s,player:q,players:[q,third]}).me,1);
});
