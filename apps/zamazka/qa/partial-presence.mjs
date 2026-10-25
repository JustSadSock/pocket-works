import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {reconcileZamazkaPresence} from '../../../pocketnet/zamazka-presence.mjs';

const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const snapshot=readFileSync(new URL('../../../pocketnet/module-versions/zamazka/v47.ts',import.meta.url),'utf8');
const lock=JSON.parse(readFileSync(new URL('../../../pocketnet/modules.lock.json',import.meta.url),'utf8'));
assert.equal(snapshot,source);
assert.equal(lock.zamazka.current,'v47');
assert.ok(lock.zamazka.versions.includes('v46'),'server alarm v46 remains immutable');
let clock=100_000;
class Clock extends Date{static now(){return clock}}
const exp={};
runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {exports:exp,Date:Clock,Math,Number,Array,Object,Map,Set,JSON,Error,console});
const game=exp.default;
const users=Array.from({length:8},(_,i)=>({id:'p'+i,name:'Реставратор '+i}));
function room(n){
 const participants=users.slice(0,n),state=game.createRoom({player:participants[0]}).state;
 for(const player of participants.slice(1))game.onJoin({state,player,players:participants});
 const send=(person,payload)=>game.onMessage({state,player:person,players:participants,payload});
 send(participants[0],{type:'start',rounds:1,drawingSeconds:300});
 assert.equal(state.phase,'preview');assert.equal(state.protectedPresence,true);
 return {state,send,participants};
}
for(const size of [2,3,4,8]){
 clock=100_000;
 const {state,send,participants}=room(size);
 clock+=2_000;
 const originalRemaining=state.deadline-clock;
 const active=participants.slice(0,-1).map(p=>p.id);
 const absent=participants.at(-1).id;
 let result=reconcileZamazkaPresence(state,active,clock);
 assert.equal(result.changed,true);
 assert.equal(state.paused,true);
 assert.equal(state.pauseRemainingMs,originalRemaining);
 assert.equal(send(participants[0],{type:'pulse'}).events.length,0,'pulses do not spend paused time');
 const before=JSON.stringify(state);
 assert.match(send(participants[1]||participants[0],{type:'resume_with_absent'}).events[0].payload,/куратор/i,
  'only curator can restore a reduced roster');
 assert.equal(JSON.stringify(state),before,'unauthorized action is inert');
 clock+=17_999;
 assert.match(send(participants[0],{type:'resume_with_absent'}).events[0].payload,/18 секунд/);
 assert.equal(state.paused,true);
 if(size===2){
  clock++;
  assert.match(send(participants[0],{type:'resume_with_absent'}).events[0].payload,/хотя бы два/);
  assert.equal(state.paused,true,'one online player cannot continue a two-seat match');
  reconcileZamazkaPresence(state,participants.map(p=>p.id),clock+1000);
  assert.equal(state.paused,false);
  assert.equal(state.deadline-(clock+1000),originalRemaining);
  continue;
 }
 clock++;
 const unauthorized=send(participants[1],{type:'resume_with_absent'});
 assert.match(unauthorized.events[0].payload,/куратор/i);
 result=send(participants[0],{type:'resume_with_absent'});
 assert.equal(state.paused,false);
 assert.deepEqual(Array.from(state.allowedAbsentIds),[absent]);
 assert.ok(result.events.some(e=>e.type==='state'&&e.to===participants[0].id));
 assert.equal(state.deadline-clock,originalRemaining);
 assert.deepEqual(Array.from(state.participants.map(p=>p.id)),participants.map(p=>p.id),
   'approval does not delete a player or their assignment');
 assert.ok(state.assignments[absent],'disconnected artist retains their stored painting');
 reconcileZamazkaPresence(state,active,clock+100);
 assert.equal(state.paused,false,'approved offline seat does not automatically re-pause');
 // A NEW absent artist must halt the game, even after one was explicitly waived.
 reconcileZamazkaPresence(state,active.slice(0,-1),clock+1_000);
 assert.equal(state.paused,true,'next interruption freezes the room');
 reconcileZamazkaPresence(state,active,clock+2_000);
 assert.equal(state.paused,false,'rejoining artist resumes, approved prior absence persists');
 reconcileZamazkaPresence(state,participants.map(p=>p.id),clock+3_000);
 assert.deepEqual(Array.from(state.allowedAbsentIds),[],'return clears the exemption');
}
clock=300_000;
{
 const {state,send,participants}=room(3);
 state.onlineIds=participants.map(p=>p.id);
 reconcileZamazkaPresence(state,['p0','p1'],clock+100);
 clock+=18_101;
 assert.match(send(participants[1],{type:'kick_player',targetId:'p2'}).events[0].payload,/куратор/i);
 const out=send(participants[0],{type:'kick_player',targetId:'p2'});
 assert.equal(out.events.filter(e=>e.type==='player_kicked').length,1);
 assert.ok(!state.assignments.p2,"kicked author\'s private painting removed");
 reconcileZamazkaPresence(state,['p0','p1'],clock);
 assert.equal(state.paused,false);
 assert.equal(state.participants.length,2);
 assert.equal(state.bannedIds.includes('p2'),true);
}
{
 clock=400_000;
 const {state,send,participants}=room(3);
 reconcileZamazkaPresence(state,['p1','p2'],clock+500);
 clock+=18_001;
 const wrong=send(participants[1],{type:'claim_host'});
 assert.match(wrong.events[0].payload,/минуту/);
 clock+=42_700;
 send(participants[1],{type:'claim_host'});
 assert.equal(state.host,'p1');
 send(participants[1],{type:'resume_with_absent'});
 assert.equal(state.paused,false,'new curator may continue without vanished host');
}
const hub=readFileSync(new URL('../../../pocketnet/hub.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const local=readFileSync(new URL('../../../pocket-server/src/main.mjs',import.meta.url),'utf8');
assert.match(local,/reconcileZamazkaPresence\(state,active\.map\(p=>p\.id\),Date\.now\(\)\)/,'local host shares the exact v47 pause rules');
assert.match(local,/changed&&state\.protectedPresence===true/,'local host broadcasts the same immediate pause snapshot');
assert.match(hub,/resume_with_absent/);
assert.match(hub,/changed&&room\.version==='v47'/,'live peers get immediate pause/resume snapshot');
assert.match(app,/data-action="pause-continue"/);
assert.match(app,/Восстановление связи/);
console.log('ZAMAZKA v47: 2–8 players, 18s grace, safe continuation, second disconnect, late host takeover and kick: OK');
