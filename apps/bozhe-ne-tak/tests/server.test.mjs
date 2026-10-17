
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame,getRite,ITEMS,TREATMENTS,evaluateRite} from '../engine.js';

const src=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:server,MIN_PLAYERS,MAX_PLAYERS,RULESET_VERSION}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
const person=i=>({id:'p'+i,name:'Жрец '+i,verified:false});
function room(n=3){
 const players=Array.from({length:n},(_,i)=>person(i+1));
 const created=server.createRoom({player:players[0],players});
 let state=created.state;
 for(let i=1;i<players.length;i++)state=server.onJoin({state,players:players.slice(0,i+1),player:players[i]}).state;
 const send=(index,payload)=>{
  const r=server.onMessage({state,player:players[index],players,payload});
  assert.ok(r&&r.state&&Array.isArray(r.events));state=r.state;return r;
 };
 const current=()=>state;
 return {players,send,current,setState:x=>{state=x}};
}
function action(room,i,type,seq,extra={}){
 const s=room.current();
 return room.send(i,{type,phaseId:s.phaseId,seq,...extra});
}
test('v1 publishes PocketNet limits and public-only room state',()=>{
 assert.equal(MIN_PLAYERS,2);assert.equal(MAX_PLAYERS,5);assert.equal(RULESET_VERSION,1);
 const r=room(5);const s=r.current();assert.equal(s.players.length,5);assert.equal(s.phase,'lobby');
 assert.ok(!('secrets' in s));assert.ok(!('privateProphecies' in s));
});
test('host controls start, joining mid-match forbidden, 2-5 seats',()=>{
 const x=room(2);x.send(1,{type:'start'});assert.equal(x.current().phase,'lobby');
 x.send(0,{type:'start'});assert.equal(x.current().phase,'play');
 assert.throws(()=>server.onJoin({state:x.current(),players:[...x.players,person(3)]}),/match_in_progress/);
 const y=room(5);assert.equal(y.current().players.length,5);
});
test('each player has an independent offering and duplicate packets do not repeat work',()=>{
 const r=room(3);r.send(0,{type:'start'});
 const first=action(r,0,'choose',1,{patch:{itemId:'goose',treatment:'wash',bell:2,height:'high'}});
 const rev=r.current().revision;
 const dup=action(r,0,'choose',1,{patch:{itemId:'crown'}});
 assert.equal(r.current().revision,rev);
 assert.equal(r.current().choices.p1.itemId,'goose');
 assert.equal(dup.events[0].to,'p1');
 action(r,1,'choose',1,{patch:{itemId:'bread',treatment:'gild',bell:1,height:'low'}});
 action(r,2,'choose',1,{patch:{itemId:'crown',treatment:'wash',bell:3,height:'high'}});
 action(r,0,'lock',2);action(r,1,'lock',2);
 assert.equal(r.current().phase,'play');
 action(r,2,'lock',2);
 assert.equal(r.current().phase,'judgment');
 const result=r.current().match.judgment;
 assert.equal(result.contributions.length,3);
 assert.equal(result.score,Math.round(result.contributions.reduce((t,x)=>t+x.score,0)/3));
 assert.equal(r.current().match.history.length,1);
 // An action from a prior phase cannot alter the verdict.
 r.send(1,{type:'choose',phaseId:'0:play',seq:3,patch:{itemId:'key'}});
 assert.equal(r.current().match.history.length,1);
});
test('entire five-ritual campaign works for 2, 3 and 5 players',()=>{
 for(const seats of [2,3,5]){
  const r=room(seats);r.send(0,{type:'start'});
  for(let round=0;round<5;round++){
   const s=r.current();
   const rite=getRite(s.match);
   let best=null;
   for(const item of ITEMS)for(const treatment of TREATMENTS)for(const bell of [1,2,3])for(const height of ['low','high']){
    const a={itemId:item.id,treatment:treatment.id,bell,height};
    const score=evaluateRite(rite,a,s.match.doctrines).score;
    if(!best||score>best.score)best={...a,score};
   }
   for(let i=0;i<seats;i++){
    action(r,i,'choose',100+round*10,{patch:best});
    action(r,i,'lock',101+round*10);
   }
   assert.equal(r.current().phase,'judgment');
   assert.equal(r.current().match.history.length,round+1);
   for(let i=0;i<seats;i++)action(r,i,'ack',102+round*10);
   if(round===4)break;
   assert.equal(r.current().phase,'dogma');
   for(let i=0;i<seats;i++){
    const choice=r.current().match.offers[i%2];
    action(r,i,'vote',103+round*10,{id:choice});
   }
   assert.equal(r.current().phase,'play');
   assert.equal(r.current().match.round,round+1);
  }
  assert.equal(r.current().phase,'end');
  assert.equal(r.current().match.history.length,5);
  assert.ok(r.current().match.faith>0);
 }
});
test('deadlines, reconnect snapshots and host changes do not diverge',()=>{
 const r=room(3);
 r.send(0,{type:'start'});
 let s=r.current();
 s.deadlineAt=Date.now()-1000;r.setState(s);
 r.send(1,{type:'pulse'});
 assert.equal(r.current().phase,'judgment');
 assert.equal(r.current().match.judgment.contributions.length,3);
 s=r.current();s.deadlineAt=Date.now()-1000;r.setState(s);
 r.send(1,{type:'pulse'});assert.equal(r.current().phase,'dogma');
 s=r.current();s.deadlineAt=Date.now()-1000;r.setState(s);
 r.send(1,{type:'pulse'});assert.equal(r.current().phase,'play');
 const result=server.onLeave({state:r.current(),player:person(1),players:[person(2),person(3)]});
 assert.equal(result.state.host,'p2');
 assert.equal(result.state.players.length,2);
 assert.equal(result.state.phase,'play');
 const refresh=server.onMessage({state:result.state,player:person(2),payload:{type:'sync'}});
 assert.equal(refresh.events[0].to,'p2');
 assert.equal(refresh.events[0].payload.revision,result.state.revision);
});
test('no forged item, absent player, unauthorised actions or extra records',()=>{
 const r=room(2);r.send(0,{type:'start'});
 action(r,0,'choose',1,{patch:{itemId:'hacked',treatment:'radioactive',bell:100,height:'sky'}});
 assert.equal(r.current().choices.p1.itemId,null);
 action(r,0,'lock',2);assert.equal(r.current().phase,'play');
 const before=r.current().revision;
 r.send(0,{type:'vote',phaseId:r.current().phaseId,seq:3,id:'fake'});
 assert.equal(r.current().revision,before);
});
