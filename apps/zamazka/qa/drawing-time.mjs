import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

let current=10_000;
class ControlledDate extends Date{static now(){return current}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const transpiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(transpiled,{exports,Date:ControlledDate,Math,Array,Number,Object,Error,JSON,Set,Map,console});
assert.equal(exports.RULESET_VERSION,21);
const module=exports.default,host={id:'host',name:'Host'},guest={id:'guest',name:'Guest'},players=[host,guest];
function setup(){
 const state=module.createRoom({player:host}).state;
 module.onJoin({state,player:guest,players});
 const message=(player,payload)=>module.onMessage({state,player,players,payload});
 return {state,message};
}
for(const seconds of [120,180,240,300,600]){
 current=10_000;
 const {state,message}=setup();
 message(host,{type:'start',rounds:3,drawingSeconds:seconds});
 assert.equal(state.phase,'preview');
 assert.equal(state.drawingSeconds,seconds,'accepted room duration');
 current=state.deadline+1;message(host,{type:'pulse'});
 assert.equal(state.phase,'drawing');
 assert.equal(state.deadline-current,seconds*1000,'first drawing phase is '+seconds+' seconds');
 const ownerView=message(host,{type:'sync'}).events[0].payload;
 const guestView=message(guest,{type:'sync'}).events[0].payload;
 assert.equal(ownerView.drawingSeconds,seconds);
 assert.equal(guestView.drawingSeconds,seconds);
 if(seconds===600){
  current=state.deadline-1;message(host,{type:'pulse'});
  assert.equal(state.phase,'drawing','ten-minute round must stay open until deadline');
 }
 current=state.deadline+1;message(host,{type:'pulse'});
 assert.equal(state.phase,'drawing','do not process at 0:00 while the last upload is in flight');
 current=state.deadline+exports.FINAL_SUBMISSION_GRACE_MS+1;message(host,{type:'pulse'});
 assert.equal(state.phase,'voting');
 for(let i=0;i<players.length;i++){
  current=state.deadline+1;message(host,{type:'pulse'});
  assert.equal(state.phase,'verdict');
  current=state.deadline+1;message(host,{type:'pulse'});
  assert.equal(state.phase,'reveal');
  current=state.deadline+1;message(host,{type:'pulse'});
 }
 assert.equal(state.phase,'round-review');
 message(guest,{type:'continue'});
 assert.equal(state.phase,'round-review','only curator may advance');
 message(host,{type:'continue'});
 assert.equal(state.phase,'preview');
 assert.equal(state.round,2);
 current=state.deadline+1;message(host,{type:'pulse'});
 assert.equal(state.phase,'drawing');
 assert.equal(state.deadline-current,seconds*1000,'second round keeps same duration');
}
for(const invalid of [-1,45,60,90,160,360,601,NaN,'invalid',null]){
 const {state,message}=setup();message(host,{type:'start',rounds:1,drawingSeconds:invalid});
 assert.equal(state.drawingSeconds,300,'invalid duration falls back to 5:00');
}
const {state:defaultState,message:defaultMessage}=setup();
defaultMessage(guest,{type:'start',rounds:1,drawingSeconds:300});
assert.equal(defaultState.phase,'lobby','guest cannot change the rules or start');
defaultMessage(host,{type:'start',rounds:1});
assert.equal(defaultState.drawingSeconds,300,'legacy client falls back to 5:00');
// Zero is an intentional rule, not a missing setting or 5:00 fallback.
current=10_000;
const untimed=setup(),U=untimed.state,M=untimed.message;
M(host,{type:'start',rounds:3,drawingSeconds:0});
assert.equal(U.drawingSeconds,0,'curator chose unlimited');
current=U.deadline+1;M(host,{type:'pulse'});
assert.equal(U.phase,'drawing');assert.equal(U.deadline,0,'no drawing deadline is installed');
const uv=M(guest,{type:'sync'}).events[0].payload;
assert.equal(uv.drawingSeconds,0,'unlimited duration survives server view serialization');
current+=86_400_000;M(host,{type:'pulse'});
assert.equal(U.phase,'drawing','no timeout after an entire day');
M(host,{type:'submit',strokes:[]});
assert.equal(U.phase,'drawing','the first player cannot finish the round alone');
assert.deepEqual(JSON.stringify(M(host,{type:'sync'}).events[0].payload.done),JSON.stringify(['host']));
M(host,{type:'submit',strokes:[]});
assert.equal(U.phase,'drawing','duplicate confirmation does not advance');
M(guest,{type:'submit',strokes:[]});
assert.equal(U.phase,'voting','last confirmed submission advances immediately');
for(let i=0;i<players.length;i++){
 current=U.deadline+1;M(host,{type:'pulse'});
 current=U.deadline+1;M(host,{type:'pulse'});
  current=U.deadline+1;M(host,{type:'pulse'});
}
assert.equal(U.phase,'round-review');
M(host,{type:'continue'});
assert.equal(U.round,2);
current=U.deadline+1;M(host,{type:'pulse'});
assert.equal(U.phase,'drawing');assert.equal(U.deadline,0,'unlimited duration persists for all rounds');

const ui=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(ui,/id="drawingSeconds"/,'curator has a drawing duration control');
assert.match(ui,/id="soloDrawingSeconds"/,'solo duration setting exists');
assert.match(ui,/\[600,'10 минут'\]/,'ten minutes appears in shared online and solo duration choices');
assert.match(ui,/\[180,'3 минуты'\]/,'three-minute duration is offered');
assert.match(ui,/\[300,'5 минут · стандарт'\]/,'five minutes is visibly the default');
assert.match(ui,/const DURATION_VALUES=DRAWING_TIME_OPTIONS\.map/,'solo validation derives from displayed timer options');
assert.match(ui,/practice\.deadline>0/,'zero-deadline solo mode never advances from a timer');
assert.match(ui,/view\.phase!=='drawing'\|\|!view\.deadline/,'zero-deadline online mode cannot auto-submit');
assert.match(ui,/drawingSeconds:Number\(screen\.querySelector\('#drawingSeconds'\)/,'client sends selected duration');

// Execute the actual UI duration table and normalization expression, not a copied test list.
// Both room dropdown and solo modal build their options from the same table.
const displayed=ui.match(/^const DRAWING_TIME_OPTIONS=(\[[^\n]+\]);$/m)?.[1];
const normalizeExpression=ui.match(/^const normalizedDuration=(.+);$/m)?.[1];
assert.ok(displayed&&normalizeExpression,'client exposes the duration choices and normalizer');
const normalizeClient=runInNewContext('(()=>{const DRAWING_TIME_OPTIONS='+displayed+
 ';const DURATION_VALUES=DRAWING_TIME_OPTIONS.map(([seconds])=>seconds);return '+normalizeExpression+';})()');
assert.equal(normalizeClient(600),600,'solo selection keeps a 10-minute numeric choice');
assert.equal(normalizeClient('600'),600,'solo saved choice of 10 minutes survives storage reload');
assert.equal(normalizeClient(601),300,'unsupported time falls back to 5:00');
assert.equal(normalizeClient(160),300,'old 2:40 preference becomes new five-minute default');
assert.equal(normalizeClient(60),300,'unsupported one-minute preference falls back to five minutes');
assert.equal(normalizeClient(180),180,'three-minute setting is supported');
assert.equal(Number(ui.match(/^let drawingSecondsChoice=(\d+);$/m)?.[1]),300,'new online room defaults to five minutes');
assert.equal(Number(ui.match(/^let soloDrawingSecondsChoice=normalizedDuration\(localStorage\.getItem\(SOLO_DURATION_KEY\)\?\?(\d+)\);$/m)?.[1]),300,'solo game defaults to five minutes');
const legacyValues=ui.match(/^const LEGACY_DURATION_VALUES=(\[[^\n]+\]);$/m)?.[1];
const restoredExpression=ui.match(/^const restoredPracticeDuration=(.+);$/m)?.[1];
assert.ok(legacyValues&&restoredExpression,'legacy solo draft parser must exist');
const restore=runInNewContext('(()=>{const LEGACY_DURATION_VALUES='+legacyValues+';return '+restoredExpression+';})()');
assert.equal(restore(160),160,'unfinished legacy 2:40 draft keeps its setting');
assert.equal(restore(90),90,'unfinished 1:30 draft keeps its setting');
assert.equal(restore(0),0,'unfinished untimed draft remains untimed');
assert.equal(restore(999),300,'corrupt old draft data falls back to five minutes');

console.log('ZAMAZKA: five timed presets (2/3/4/5/10 min), 5-minute defaults, legacy drafts, untimed game and multi-round rules OK');

// Deadline and final transfer regressions are part of the main timer gate.
import './deadline-integrity.mjs';

// Complete multiplayer clock drift + partial coin deadline + author frame loop regression.
import './sync-and-partial-vote.mjs';
