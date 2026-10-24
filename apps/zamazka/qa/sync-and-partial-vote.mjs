import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {ServerClock} from '../server-clock.js';
import {mountExhibitFrames} from '../exhibition-ui.js';

// A host's laptop is +7 sec and a guest phone is -5 sec. RTT echoes must
// converge on the same 0:00 and not prematurely seal either drawing.
const realNow=Date.now;
try{
 const hostClock=new ServerClock(),guestClock=new ServerClock();
 Date.now=()=>1_007_200;
 assert(hostClock.observeEcho(1_007_000,1_000_100,1_007_200));
 assert.equal(hostClock.now(),1_000_200);
 Date.now=()=>995_200;
 assert(guestClock.observeEcho(995_000,1_000_100,995_200));
 assert.equal(guestClock.now(),1_000_200);
 assert.equal(hostClock.offset,-7000);
 assert.equal(guestClock.offset,5000);
 assert.equal(guestClock.observeEcho(995_400,1_000_500,995_100),false,'reject backwards local time');
 guestClock.reset();assert.equal(guestClock.calibrated,false);
 guestClock.observeState(1_000_000,995_000);assert.equal(guestClock.offset,5000);
 guestClock.observeEcho(995_000,1_000_050,995_100);
 guestClock.observeState(1_000_000,995_300);
 assert.equal(guestClock.offset,5000,'delayed state snapshot must not override RTT sample');
}finally{Date.now=realNow}

// An author without vote buttons used to shrink the wooden frame on every
// ResizeObserver callback, because the measurement contained its own rim.
let callbacks=[],nextId=0;
const previousRaf=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
const previousResize=globalThis.ResizeObserver;
globalThis.requestAnimationFrame=cb=>{callbacks.push(cb);return ++nextId};
globalThis.cancelAnimationFrame=()=>{};
globalThis.ResizeObserver=class{constructor(callback){this.callback=callback}observe(){}disconnect(){}};
try{
 const art={tagName:'IMG',naturalWidth:800,naturalHeight:600,
  style:{getPropertyValue:()=>'',aspectRatio:''},addEventListener(){},removeEventListener(){}};
 const values={};
 const rim={style:{setProperty:(k,v)=>values[k]=v,getPropertyValue:()=>'',set width(v){values.width=v},set height(v){values.height=v}},
  querySelector:()=>art};
 const gallery={clientWidth:850,clientHeight:420};
 const plaque={offsetHeight:51},locked={offsetHeight:21};
 let ballotCard=false;
 const stage={clientWidth:250,clientHeight:340,isConnected:true,
  closest:selector=>selector==='.finale-ballot-card'?(ballotCard?gallery:null):gallery,parentElement:gallery,
  querySelector:q=>q==='.zam-exhibit-rim'?rim:q==='.zam-exhibit-plaque'?plaque:
    q==='.stake-actions,.stake-locked'?locked:null};
 const root={querySelectorAll:()=>[stage]};
 const fit=mountExhibitFrames(root);
 callbacks.shift()();const full=Number.parseFloat(values.height);
 assert(full>100);
 for(const h of [280,225,170,115,75,42]){
  stage.clientHeight=h;fit.refresh();callbacks.shift()();
  assert.equal(Number.parseFloat(values.height),full,'no author shrink feedback at '+h);
 }
 gallery.clientHeight=290;stage.clientHeight=160;
 fit.refresh();callbacks.shift()();
 assert(Number.parseFloat(values.height)<full,'real parent resize must still resize frame');
 const afterParentResize=Number.parseFloat(values.height);
 ballotCard=true;stage.clientHeight=110;
 fit.refresh();callbacks.shift()();
 assert(Number.parseFloat(values.height)<afterParentResize,'finale ballot cards must respect real available height');
 fit.dispose();
}finally{
 if(previousRaf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRaf;
 if(previousCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previousCancel;
 if(previousResize===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=previousResize;
}

// Exercise real authoritative server module with a controlled wall clock.
let now=10_000;
class ControlledDate extends Date{static now(){return now}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api={};runInNewContext(js,{exports:api,Date:ControlledDate,Math,Array,Number,Object,JSON,Map,Set,Error,console});
assert.equal(api.RULESET_VERSION,21);
const game=api.default,people=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
const state=game.createRoom({player:people[0]}).state;
for(const p of people.slice(1))game.onJoin({state,player:p,players:people});
const send=(id,payload)=>game.onMessage({state,player:people.find(p=>p.id===id),players:people,payload:payload&&['vote','vote_draft'].includes(payload.type)?{...payload,round:state.round,turn:state.turn,targetId:state.participants[state.turn]?.id}:payload});
send('a',{type:'start',rounds:1,drawingSeconds:160});
now=state.deadline+1;send('a',{type:'pulse'});
assert.equal(state.phase,'drawing');
const hostView=send('a',{type:'sync'}).events[0].payload;
const guestView=send('b',{type:'sync'}).events[0].payload;
assert.equal(hostView.deadline,guestView.deadline,'identical server deadline for host and guests');
assert.equal(hostView.serverNow,guestView.serverNow,'identical authoritative clock');
const ping=send('b',{type:'time_ping',stamp:9500}).events[0];
assert.equal(ping.type,'time_pong');assert.equal(ping.payload.stamp,9500);
assert.equal(ping.payload.serverNow,now);
const drawingDeadline=state.deadline;
now=drawingDeadline-1;send('a',{type:'pulse'});assert.equal(state.phase,'drawing');
now=drawingDeadline+api.FINAL_SUBMISSION_GRACE_MS+1;
send('b',{type:'pulse'});assert.equal(state.phase,'voting');
assert.equal(state.turn,0);
const firstDeadline=state.deadline;
send('b',{type:'vote_draft',chips:[1,0,0,0,0]});
send('c',{type:'vote_draft',chips:[0,1,0,0,0]});
send('c',{type:'vote_draft',chips:[0,2,0,0,0]});
assert.equal(Object.keys(state.votes.a||{}).length,0,'drafts must not end the vote early');
now=firstDeadline+1;send('a',{type:'pulse'});
assert.equal(state.phase,'verdict');
now=state.deadline+1;send('a',{type:'pulse'});assert.equal(state.phase,'reveal');
assert.equal(JSON.stringify(state.votes.a.b),JSON.stringify([1,0,0,0,0]),'one coin counted');
assert.equal(JSON.stringify(state.votes.a.c),JSON.stringify([0,2,0,0,0]),'two coins counted');
now=state.deadline+1;send('a',{type:'pulse'});
assert.equal(state.phase,'voting');assert.equal(state.turn,1);
send('c',{type:'vote_draft',chips:[0,0,3,0,0]});
send('a',{type:'vote_draft',chips:[0,0,1,0,0]});
send('a',{type:'vote_draft',chips:[0,0,0,0,0]});
now=state.deadline+1;send('b',{type:'pulse'});
assert.equal(state.phase,'verdict','timeout must display stake dossier before revealing');
assert.equal(JSON.stringify(state.votes.b.c),JSON.stringify([0,0,3,0,0]),'three coins counted at timeout');
assert.equal(state.votes.b.a,undefined,'removed draft must not become a ballot');
now=state.deadline+1;send('b',{type:'pulse'});
assert.equal(state.phase,'reveal','stake dossier advances to the reveal, not a second verdict');
now=state.deadline+1;send('b',{type:'pulse'});
assert.equal(state.phase,'voting');
const accepted=send('a',{type:'vote',chips:[0,1,0,0,0]});
assert(accepted.events.some(e=>e.type==='vote_saved'),'a single coin may also be submitted explicitly');
const invalid=send('a',{type:'vote',chips:[3,1,0,0,0]});
assert.equal(invalid.events[0].type,'notice','more than three coins rejected');
const ui=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(ui,/const networkNow=\(\)=>serverClock\.now\(\)/);
assert.match(ui,/function saveVoteDraft\(\)/);
assert.match(ui,/networkNow\(\)>=view\.deadline&&chips\.some\(Boolean\)/);
console.log('ZAMAZKA: author images do not shrink, host/guest clock agrees, 1–3 coin ballots survive deadline OK');
