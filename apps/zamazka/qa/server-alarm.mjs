import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {ZAMAZKA_ALARM_VERSION,nextZamazkaDeadlineAt,shouldAdvanceZamazkaDeadline} from '../../../pocketnet/zamazka-deadlines.mjs';

const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const pinned=readFileSync(new URL('../../../pocketnet/module-versions/zamazka/v46.ts',import.meta.url),'utf8');
const lock=JSON.parse(readFileSync(new URL('../../../pocketnet/modules.lock.json',import.meta.url),'utf8'));
assert.equal(ZAMAZKA_ALARM_VERSION,'v46');
assert.equal(lock.zamazka.current,ZAMAZKA_ALARM_VERSION);
assert.equal(pinned,source,'new-room immutable snapshot must equal current module');

let clock=10_000;
class Clock extends Date{static now(){return clock}}
const exports={};
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
runInNewContext(code,{exports,Date:Clock,Math,Number,Array,Object,Map,Set,JSON,Error,console});
const game=exports.default;
const host={id:'host',name:'Host'},guest={id:'guest',name:'Guest'},players=[host,guest];
const makeRoom=()=>{
 const state=game.createRoom({player:host}).state;
 game.onJoin({state,player:guest,players});
 const send=(person,payload)=>game.onMessage({state,player:person,players,payload});
 const alarm=()=>{
  const due=nextZamazkaDeadlineAt(state);
  assert.ok(due!==null,'expected server-owned wakeup');
  clock=due;
  assert.equal(shouldAdvanceZamazkaDeadline(state,clock),true);
  const before=state.phase;
  const response=send(host,{type:'pulse'});
  assert.notEqual(state.phase,before,'wake should advance exactly one timed phase');
  assert.ok(response.events.some(event=>event.type==='state'),'wake broadcasts private views');
 };
 return {state,send,alarm};
};

// The entire timed exhibition moves without any client heartbeat or vote.
let match=makeRoom();
match.send(host,{type:'start',rounds:1,preload:true,drawingSeconds:120});
assert.equal(match.state.phase,'preparing');
match.alarm();assert.equal(match.state.phase,'preview');
match.alarm();assert.equal(match.state.phase,'drawing');
assert.equal(nextZamazkaDeadlineAt(match.state),match.state.deadline+25_000,
 'ordinary unsent painting gets full 25s transfer grace');
assert.equal(shouldAdvanceZamazkaDeadline(match.state,match.state.deadline+24_999),false);
match.alarm();assert.equal(match.state.phase,'voting');
match.alarm();assert.equal(match.state.phase,'verdict');
match.alarm();assert.equal(match.state.phase,'reveal');
match.alarm();assert.equal(match.state.phase,'voting');
match.alarm();assert.equal(match.state.phase,'verdict');
match.alarm();assert.equal(match.state.phase,'reveal');
match.alarm();assert.equal(match.state.phase,'round-review');
assert.equal(nextZamazkaDeadlineAt(match.state),null,'host-controlled gallery never auto-advances');

// Upload recovery is inviolable: a declared final gets the entire 120s window.
clock+=10_000;
match=makeRoom();
match.send(host,{type:'start',rounds:1,drawingSeconds:120});
match.alarm();assert.equal(match.state.phase,'drawing');
const assigned=match.state.assignments.host;
clock=match.state.deadline-500;
match.send(host,{type:'submit_begin',round:match.state.round,art:assigned.art,variation:assigned.variation});
assert.equal(nextZamazkaDeadlineAt(match.state),match.state.deadline+120_000);
clock=match.state.deadline+25_000;
assert.equal(shouldAdvanceZamazkaDeadline(match.state,clock),false,
 'a delayed final cannot be mistaken for a generic missed submission');
match.send(host,{type:'pulse'});
assert.equal(match.state.phase,'drawing');
match.alarm();assert.equal(match.state.phase,'voting');
assert.ok(match.state.incompleteSubmissions.includes('host'),
 'timed out pending upload is marked incomplete, never ACKed as a final');

// Secure raster failure stays closed even on an unattended alarm.
clock+=10_000;
match=makeRoom();
match.send(host,{type:'start',rounds:1,rasterBallots:true,drawingSeconds:120});
match.alarm();assert.equal(match.state.phase,'drawing');
match.alarm();assert.equal(match.state.phase,'sealing');
match.alarm();assert.equal(match.state.phase,'round-review');
assert.equal(match.state.spriteFallback,false);
assert.equal(nextZamazkaDeadlineAt(match.state),null);

// Timers with no deadline (untimed drawing) or paused rooms must never wake.
clock+=10_000;
match=makeRoom();
match.send(host,{type:'start',rounds:1,drawingSeconds:0});
match.alarm();assert.equal(match.state.phase,'drawing');
assert.equal(nextZamazkaDeadlineAt(match.state),null);
match.state.paused=true;match.state.deadline=clock+1000;
assert.equal(nextZamazkaDeadlineAt(match.state),null);

// Assert the hub gates the new behavior to v46 and serializes alarm mutations.
const hub=readFileSync(new URL('../../../pocketnet/hub.mjs',import.meta.url),'utf8');
assert.match(hub,/room\.version!==ZAMAZKA_ALARM_VERSION/);
assert.match(hub,/this\.advanceZamazkaDeadline\(room,now\)/);
assert.match(hub,/this\.persist\(room\);\s*this\.recordZamazkaRewards\(room,previous,next/);
assert.match(hub,/\['v45','v46'\]\.includes\(room\.version\)/,
 'v46 audit reports must retain metadata-only persistence');
console.log('ZAMAZKA server alarms: complete no-pulse round, 25s/120s grace, fail-closed raster, untimed/paused and pinned versions OK');
