import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {ServerClock} from '../server-clock.js';
import {mountExhibitFrames} from '../exhibition-ui.js';

const fast=new ServerClock();
assert.equal(fast.observeState(300000,308050),true);
assert.equal(fast.offset,-8050,'initial state removes a client clock that is eight seconds ahead');
assert.equal(fast.observeEcho(308000,300050,308100),true);
assert.equal(fast.offset,-8000,'half the round trip corrects the estimate of clock skew');
assert.equal(fast.observeEcho(308000,300050,307990),false,'negative round trips are invalid');
const slow=new ServerClock();
assert.equal(slow.observeEcho(293000,300050,293100),true);
assert.equal(slow.offset,7000,'slow guest also sees the same authoritative instant');
const exactDeadline=314000;
assert.equal(exactDeadline-(308500+fast.offset),exactDeadline-(293500+slow.offset),
 'host and guest with skewed device clocks see identical remaining milliseconds');

let t=100000;
class ServerDate extends Date{static now(){return t}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(compiled,{exports,Date:ServerDate,Math,Array,Number,JSON,Object,Set,Map,Error,console});
assert.equal(exports.RULESET_VERSION,21,'a new immutable module protects preexisting rooms');
const game=exports.default;
const host={id:'host',name:'Host'},guest={id:'guest',name:'Guest'},third={id:'third',name:'Third'};
const players=[host,guest,third];
const state=game.createRoom({player:host}).state;
game.onJoin({state,player:guest,players});
game.onJoin({state,player:third,players});
const send=(player,payload)=>game.onMessage({state,player,players,payload});
send(host,{type:'start',rounds:1,drawingSeconds:60});
t=state.deadline+1;send(guest,{type:'pulse'});
assert.equal(state.phase,'drawing');
const ping=send(guest,{type:'time_ping',stamp:293000}).events[0];
assert.equal(ping.type,'time_pong');
assert.equal(ping.payload.serverNow,t);
assert.equal(ping.payload.stamp,293000);
const timeState=send(guest,{type:'sync'}).events[0].payload;
assert.equal(timeState.serverNow,t,'individual game snapshots contain server time');

t=state.deadline+exports.FINAL_SUBMISSION_GRACE_MS+1;
send(host,{type:'pulse'});
assert.equal(state.phase,'voting');
assert.equal(state.turn,0);
assert.equal(send(host,{type:'vote_draft',chips:[1,0,0,0,0]}).events[0].type,'notice',
 'author cannot vote for own restored painting');
send(guest,{type:'vote_draft',chips:[1,0,0,0,0]});
send(third,{type:'vote_draft',chips:[0,2,0,0,0]});
assert.equal(state.voteDrafts.host.guest[0],1);
assert.equal(state.voteDrafts.host.third[1],2);
assert.equal(send(guest,{type:'sync'}).events[0].payload.draftVote[0],1,
 'voter sees own partial ballot after a reload');
assert.equal(send(third,{type:'sync'}).events[0].payload.draftVote[0],0,
 'a participant never receives another guest\'s private allocations');
assert.equal(send(host,{type:'sync'}).events[0].payload.draftVote,null,
 'author never receives opponents\' draft ballots');
assert.equal(send(guest,{type:'vote_draft',chips:[2,2,0,0,0]}).events[0].type,'notice',
 'overspending more than three coins is still forbidden');
assert.equal(state.voteDrafts.host.guest[0],1,'bad allocation cannot overwrite saved ballot');
t=state.deadline+1;send(host,{type:'pulse'});
assert.equal(state.phase,'reveal');
assert.equal(state.votes.host.guest[0],1,'one coin counts automatically at deadline');
assert.equal(state.votes.host.third[1],2,'two coins count automatically at deadline');

t=state.deadline+1;send(host,{type:'pulse'});
assert.equal(state.phase,'voting');
assert.equal(state.turn,1);
send(third,{type:'vote_draft',chips:[0,0,0,0,0]});
send(host,{type:'vote_draft',chips:[0,0,2,0,0]});
send(host,{type:'vote_draft',chips:[0,0,0,0,0]});
assert.equal(state.voteDrafts.guest.host,undefined,'canceling all coins removes pending ballot');
send(host,{type:'vote',chips:[3,0,0,0,0]});
assert.equal(state.votes.guest.host[0],3);
assert.equal(state.phase,'voting','unsubmitted player remains eligible until deadline');
t=state.deadline+1;send(guest,{type:'pulse'});
assert.equal(state.phase,'reveal');
assert.equal('third' in state.votes.guest,false,'no vote is fabricated when zero coins allocated');

const origRAF=globalThis.requestAnimationFrame,origCancel=globalThis.cancelAnimationFrame;
const queue=[];
globalThis.requestAnimationFrame=fn=>{queue.push(fn);return queue.length};
globalThis.cancelAnimationFrame=()=>{};
try{
 const style=()=>({height:'',width:'',setProperty(name,value){this[name]=value},getPropertyValue(name){return this[name]||''}});
 const rim={style:style(),querySelector:()=>art};
 const art={tagName:'IMG',naturalWidth:1200,naturalHeight:900,style:style(),addEventListener(){},removeEventListener(){}};
 const plaque={offsetHeight:22},locked={offsetHeight:24};
 const gallery={clientWidth:230,clientHeight:300};
 const stage={isConnected:true,clientWidth:215,
  get clientHeight(){return rim.style.height?Math.round(parseFloat(rim.style.height)+28):258},
  closest:()=>gallery,querySelector:query=>{
   if(query==='.zam-exhibit-rim')return rim;
   if(query==='.zam-exhibit-plaque')return plaque;
   if(query==='.stake-actions,.stake-locked')return locked;
   return null;
  }
 };
 const root={querySelectorAll:query=>query==='[data-exhibit-stage]'?[stage]:[]};
 const mounted=mountExhibitFrames(root);
 let first;
 for(let i=0;i<12;i++){
  const job=queue.shift();assert.equal(typeof job,'function');
  job();
  const height=parseFloat(rim.style.height);
  if(i===0)first=height;
  else assert(Math.abs(height-first)<2,'author\'s framed paintings must not shrink every layout frame');
  mounted.refresh();
 }
 assert(first>120,'original painted picture stays reasonably large');
 mounted.dispose();
}finally{
 if(origRAF===undefined)delete globalThis.requestAnimationFrame;
 else globalThis.requestAnimationFrame=origRAF;
 if(origCancel===undefined)delete globalThis.cancelAnimationFrame;
 else globalThis.cancelAnimationFrame=origCancel;
}
const ui=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(ui,/networkNow\(\)<view\.deadline/,'deadline submission uses server time, not the host clock');
assert.match(ui,/saveVoteDraft\(\);updateChips\(\)/,'every coin update persists server-side');
assert.match(ui,/submitVote\(true\)/,'client sends partial votes at zero as a backup');
console.log('ZAMAZKA: 8s skew, half-RTT clock sync, private ballot recovery, 1/2 coin deadline votes, author picture stable (12 layout passes) OK');
