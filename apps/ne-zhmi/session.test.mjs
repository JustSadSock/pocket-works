import test from 'node:test';
import assert from 'node:assert/strict';
import {MODES,PARTY_STAGES,createSession,courseSeed,courseLength,nextTrack,startTrack,recordFinish,partyComplete,canContinue,summary,replayLast,restoreParty} from './session.js';
import module,{reset,message,ROBOT} from './server/module.ts';

const host={id:'H',name:'H'},guest={id:'G',name:'G'};
function room(){
 const state=module.createRoom({player:host}).state;
 module.onJoin({state,players:[host,guest]});
 return state;
}
function serverWin(state,step){
 const clock=Date.now()+step*3000;
 message(state,host,{type:'start'},clock);
 assert.equal(state.phase,'play');
 const level=state.robot.level;
 state.robot.x=level.goal+.02;state.robot.y=6.5-ROBOT.halfHeight;state.robot.ground=true;
 state.signals={H:clock+99,G:clock+99};state.lastClock=clock+89;
 const events=message(state,host,{type:'pulse'},clock+100);
 assert.equal(state.phase,'won');
 assert.equal(events.length,1);
 return events[0].payload;
}
test('three stable modes with repeatable course plans',()=>{
 assert.deepEqual(MODES.map(m=>m.id),['quick','party','lab']);
 const a=createSession({mode:'party',seed:1234});
 assert.equal(PARTY_STAGES,3);
 assert.deepEqual(nextTrack(a),nextTrack(a));
 assert.equal(nextTrack(a).sections,5);
 const lab=createSession({mode:'lab',seed:8453,length:6});
 assert.equal(nextTrack(lab,{crew:6}).seed,8453);
 assert.equal(nextTrack(lab,{crew:6}).sections,6);
 assert.equal(nextTrack(lab,{crew:6}).crew,6);
});
test('seed and length values are normalized and non-injectable',()=>{
 assert.equal(courseSeed(0),1);
 assert.equal(courseSeed(-1),1);
 assert.equal(courseSeed('2026'),2026);
 assert.equal(courseSeed('not a seed'),1);
 assert.equal(courseLength(10),5);
 assert.equal(courseLength(4),4);
 assert.equal(courseLength(6),6);
 assert.equal(createSession({mode:'evil'}).mode,'quick');
});
test('party tracks differ across all three completions and totals are cumulative',()=>{
 const session=createSession({mode:'party',seed:2026});
 const seeds=[];
 for(let step=0;step<3;step++){
  const track=startTrack(session,{crew:3});
  seeds.push(track.seed);assert.equal(track.stage,step+1);
  const result=recordFinish(session,{finished:true,wonAt:9.25+step,respawns:step,jumps:3,reverses:1,pushes:0});
  assert.equal(result.stage,step+1);
  assert.equal(recordFinish(session,{finished:true,wonAt:1}),null);
  assert.equal(session.finished,true);
 }
 assert.equal(new Set(seeds).size,3);
 assert.equal(partyComplete(session),true);
 assert.equal(canContinue(session),false);
 assert.equal(summary(session).count,3);
 assert.equal(summary(session).totalTime,30.75);
 assert.equal(summary(session).totalFalls,3);
});
test('interrupted party can safely resume at the correct stage',()=>{
 const session=createSession({mode:'party',seed:932});
 startTrack(session);recordFinish(session,{finished:true,t:11.6,respawns:1,jumps:1});
 const checkpoint=JSON.parse(JSON.stringify(session));
 const restored=restoreParty(checkpoint);
 assert.ok(restored);
 assert.equal(restored.entries.length,1);
 assert.equal(nextTrack(restored).stage,2);
 assert.equal(nextTrack(restored).seed,nextTrack(session).seed);
 assert.equal(restoreParty({...checkpoint,entries:Array(3).fill(checkpoint.entries[0])}),null);
 assert.equal(restoreParty({mode:'party',entries:[{stage:1,time:-5}]}),null);
});
test('retrying the last finished stage undoes its score, then preserves the route',()=>{
 const session=createSession({mode:'party',seed:995});
 const old=startTrack(session);
 recordFinish(session,{finished:true,t:21,jumps:2});
 const rewind=replayLast(session);
 assert.equal(rewind,old.seed);
 assert.equal(session.entries.length,0);
 assert.equal(startTrack(session).seed,old.seed);
});
test('guests cannot configure the authoritative room or spoof seed',()=>{
 const s=room(),before=s.session.seed;
 message(s,guest,{type:'config',mode:'lab',seed:123,length:6});
 assert.equal(s.session.mode,'quick');
 message(s,host,{type:'config',mode:'invalid',seed:123,length:6});
 assert.equal(s.session.mode,'quick');
 message(s,host,{type:'config',mode:'lab',seed:-7,length:6});
 assert.equal(s.session.seed,before);
 message(s,host,{type:'config',mode:'lab',seed:123,length:7});
 assert.equal(s.session.mode,'quick');
 message(s,host,{type:'config',mode:'lab',seed:123456,length:6});
 assert.equal(s.session.mode,'lab');
 const event=message(s,guest,{type:'sync'})[0];
 assert.equal(event.to,'G');
 assert.deepEqual(event.payload.config,{mode:'lab',seed:123456,length:6});
});
test('lab server sends selected course intact to each participant',()=>{
 const s=room();
 message(s,host,{type:'config',mode:'lab',seed:2507,length:4});
 message(s,host,{type:'start'});
 assert.equal(s.robot.level.seed,2507);
 assert.equal(s.robot.level.sections.length,4);
 assert.equal(message(s,guest,{type:'sync'})[0].payload.robot.level.seed,2507);
 message(s,host,{type:'restart'});
 assert.equal(s.robot.level.seed,2507);
});
test('authoritative party produces three confirmed server records and starts a fresh series',()=>{
 const s=room();
 message(s,host,{type:'config',mode:'party'});
 const snapshots=[];
 for(let i=0;i<3;i++)snapshots.push(serverWin(s,i));
 assert.deepEqual(snapshots.map(x=>x.session.count),[1,2,3]);
 assert.deepEqual(snapshots.map(x=>x.session.complete),[false,false,true]);
 assert.equal(snapshots[2].session.target,3);
 assert.ok(snapshots[2].session.totalTime>0);
 message(s,guest,{type:'start'});
 assert.equal(s.phase,'won');
 message(s,host,{type:'start'});
 assert.equal(s.phase,'play');
 assert.equal(s.session.entries.length,0);
 assert.equal(s.session.mode,'party');
});
test('quick mode backward compatibility retains a single result',()=>{
 const s=room();const win=serverWin(s,1);
 assert.equal(win.session.mode,'quick');
 assert.equal(win.session.count,1);
 assert.equal(win.session.complete,false);
 assert.equal(win.config.mode,'quick');
});
test('invalid client session messages never modify role assignments',()=>{
 const s=room(),initial=[...s.roles];
 for(const command of [
   {type:'config',mode:'party',seed:999,robot:{x:900}}, // guest only
   {type:'config',mode:'lab',seed:Infinity,length:5},
   {type:'config',mode:'lab',seed:10,length:999}
 ])message(s,guest,command);
 assert.deepEqual(s.roles,initial);
 assert.equal(s.session.mode,'quick');
});

test('guest departure preserves lab code and length, rather than silently rerolling',()=>{
 const s=room();
 message(s,host,{type:'config',mode:'lab',seed:314159,length:6});
 module.onLeave({state:s,players:[host]});
 assert.equal(s.phase,'lobby');
 assert.equal(s.session.mode,'lab');
 assert.equal(s.session.seed,314159);
 assert.equal(s.session.length,6);
 module.onJoin({state:s,players:[host,guest]});
 message(s,host,{type:'start'});
 assert.equal(s.robot.level.seed,314159);
 assert.equal(s.robot.level.sections.length,6);
});
test('party completion progress persists when an operator leaves mid-series',()=>{
 const s=room();
 message(s,host,{type:'config',mode:'party'});
 serverWin(s,1);
 assert.equal(s.session.entries.length,1);
 module.onLeave({state:s,players:[host]});
 assert.equal(s.session.entries.length,1);
 assert.equal(s.phase,'lobby');
 module.onJoin({state:s,players:[host,guest]});
 message(s,host,{type:'start'});
 assert.equal(s.phase,'play');
 assert.equal(s.session.entries.length,1);
 const snapshot=message(s,guest,{type:'sync'})[0].payload;
 assert.equal(snapshot.session.count,1);
});
