import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {paintPackets} from '../draft-transfer.js';

let now=100_000;
class Clock extends Date{static now(){return now}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const output={};
runInNewContext(js,{exports:output,Date:Clock,Math,Number,Array,Object,Map,Set,JSON,Error,console});
const game=output.default;
assert.equal(output.FINAL_SUBMISSION_GRACE_MS,25000);
const host={id:'host',name:'Host'},guest={id:'guest',name:'Guest'},players=[host,guest];
function room(){
 const state=game.createRoom({player:host}).state;
 game.onJoin({state,player:guest,players});
 const send=(person,payload)=>game.onMessage({state,player:person,players,payload});
 send(host,{type:'start',rounds:1,drawingSeconds:60});
 now=state.deadline+1;send(host,{type:'pulse'});
 assert.equal(state.phase,'drawing');
 return {state,send};
}
now=100_000;
const {state,send}=room();
const ending=state.deadline,ass=state.assignments.host;
const strokes=Array.from({length:96},(_,i)=>({c:'#123456',s:12,t:'brush',
 p:Array.from({length:50},(_,j)=>[i*4,j*4])}));
const fragments=paintPackets({type:'submit_chunk',round:state.round,art:ass.art,
 variation:ass.variation,strokes,revision:'rfinalstroke'});
assert.ok(fragments.length>1,'end-of-round art exercises multipart transfer');
now=ending-1800;
send(host,fragments[0]);
assert.equal(state.phase,'drawing','incomplete transfer cannot make a painting visible');
assert.equal(state.assignments.host.strokes,null);
now=ending-1;send(guest,{type:'submit',strokes:[]});
assert.equal(state.phase,'drawing','early finished players cannot stop an active timer');
now=ending+1;send(guest,{type:'pulse'});
assert.equal(state.phase,'drawing','0:00 is the start of final network grace, not voting');
for(const packet of fragments.slice(1))send(host,packet);
assert.equal(state.phase,'voting','fully confirmed final drawing can enter voting after 0:00');
assert.deepEqual(JSON.stringify(state.assignments.host.strokes),JSON.stringify(strokes),
 'all 96 final strokes, including the very last one, survive at the deadline');
assert.equal(Object.keys(state.draftAssemblies).length,0);

// A missing final packet never replaces an intact saved draft with a partial
// transfer. Old users or briefly disconnected clients keep their best backup.
now=200_000;
const {state:lost,send:sendLost}=room();
const deadline=lost.deadline,a=lost.assignments.host;
const previous=[{c:'#123456',s:9,t:'brush',p:[[23,30],[44,50]]}];
sendLost(host,{type:'draft',round:lost.round,art:a.art,variation:a.variation,strokes:previous});
const chunks=paintPackets({type:'submit_chunk',round:lost.round,art:a.art,
 variation:a.variation,strokes,revision:'rincomplete'});
now=deadline+1;sendLost(host,chunks[0]);
sendLost(guest,{type:'pulse'});
assert.equal(lost.phase,'drawing','unconfirmed final packets remain eligible during grace');
now=deadline+output.FINAL_SUBMISSION_GRACE_MS-1;sendLost(guest,{type:'pulse'});
assert.equal(lost.phase,'drawing','never process the artwork a moment before grace ends');
// A multipart submit is explicitly marked as pending; unlike a silent client,
// it has a bounded 120-second retry window beyond the normal 25-second grace.
now=deadline+output.FINAL_SUBMISSION_GRACE_MS;sendLost(guest,{type:'pulse'});
assert.equal(lost.phase,'drawing','declared final upload must remain recoverable after basic grace');
now=deadline+output.FINAL_TRANSFER_RECOVERY_MS-1;sendLost(guest,{type:'pulse'});
assert.equal(lost.phase,'drawing','recoverable upload stays private up to its hard expiry');
now=deadline+output.FINAL_TRANSFER_RECOVERY_MS;sendLost(guest,{type:'pulse'});
assert.equal(lost.phase,'voting','hard recovery limit closes incomplete final transfer');
assert.deepEqual(JSON.stringify(lost.assignments.host.strokes),JSON.stringify(previous),
 'incomplete transfers cannot erase an earlier complete backup');

// Existing untimed rooms keep their submit-to-finish behavior.
now=300_000;
const free=game.createRoom({player:host}).state;
game.onJoin({state:free,player:guest,players});
const sendFree=(who,payload)=>game.onMessage({state:free,player:who,players,payload});
sendFree(host,{type:'start',rounds:1,drawingSeconds:0});
now=free.deadline+1;sendFree(host,{type:'pulse'});
assert.equal(free.phase,'drawing');assert.equal(free.deadline,0);
sendFree(host,{type:'submit',strokes:[]});
assert.equal(free.phase,'drawing');
sendFree(guest,{type:'submit',strokes:[]});
assert.equal(free.phase,'voting');

// Client must seal the actual in-progress stroke at 0:00, never at -1.9s.
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const finish=app.slice(app.indexOf('function autoFinishOnDeadline(){'),app.indexOf('function finishVoteTransition(){'));
assert.match(finish,/networkNow\(\)<view\.deadline\)return/);
assert.doesNotMatch(finish,/deadline-1900/);
assert.match(app,/const strokes=editor\.getData\(\);editor\.saveSnapshot\(\)/);
assert.match(app,/pendingSubmit=\{token,room:roomId/);
assert.match(app,/const retryMs=view\.deadline&&networkNow\(\)>=view\.deadline\?3500:15000/);
const clock=app.slice(app.indexOf('let clockSoundState=null;'),app.indexOf('let museumSwipe=null;'));
assert.match(clock,/page==='preview'\|\|page==='drawing'/);
assert.match(clock,/stepClockSound\(clockSoundState,key,remaining,/);
assert.match(clock,/museumAudio\.syncCountdown\(key,v\.deadline,now\)/);
assert.match(clock,/if\(plan\.cue\)sound\(plan\.cue\)/);
assert.doesNotMatch(clock,/sound\('warning'\)/);
assert.match(clock,/autoFinishOnDeadline\(\)/);
assert.ok(clock.indexOf('if(plan.cue)sound(plan.cue)')<clock.indexOf('autoFinishOnDeadline()'),'Alarm fires before completing the phase');
const css=readFileSync(new URL('../experience.css',import.meta.url),'utf8');
assert.match(css,/\.screen>\.phase-page,\.screen>\.restore\{animation:none\}/,
 'a timer transition must not move the entire screen');
console.log('ZAMAZKA: 0:00 deadline, 96-stroke final transfer, 25s normal grace, 120s declared-upload recovery, backup preservation and Clockmaker signals OK');
