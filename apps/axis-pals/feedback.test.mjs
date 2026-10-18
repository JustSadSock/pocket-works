import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describeMove,bumpMotion} from './actors.js';
import {FX_BUDGET,FX_DURATION,axisOf,effectPhase,contactDescriptor,getFxPlan,drawAxisImpulse,drawContactEffects} from './feedback.js';
import {createSoundPlayer,SOUND_PROFILE,soundForMove} from './sound.js';
const start=[{x:4,y:4},{x:4,y:1}],end=[{x:4,y:4},{x:5,y:1}];
function canvas(){
 const state={arcs:0,lines:0};
 return {
  state,save(){},restore(){},beginPath(){},moveTo(){state.lines++},lineTo(){state.lines++},
  stroke(){},fill(){},arc(){state.arcs++}
 };
}
test('one command creates a limited axis pulse and independent blocked impact',()=>{
 const m=describeMove(start,end,1000,'right');
 assert.equal(axisOf(m),'x');
 const plan=getFxPlan(m,1150);
 assert.equal(plan.impulses.length,2);assert.equal(plan.contacts.length,2);
 assert.deepEqual(plan.contacts.map(x=>x.blocked),[true,false]);
 assert.ok(plan.phase.energy>0);
 assert.ok(plan.impulses.length<=FX_BUDGET.axisImpulses);
 assert.ok(plan.contacts.length<=FX_BUDGET.contactBursts);
 assert.equal(soundForMove(m),'collision');
 const a=canvas();
 drawAxisImpulse(a,m,50,1140);drawContactEffects(a,m,50,1140);
 assert.ok(a.state.lines>0);
 assert.ok(a.state.arcs>0);
 assert.deepEqual(start,[{x:4,y:4},{x:4,y:1}]);
});
test('full collision emits bounded short-lived markings',()=>{
 const m=bumpMotion(start,1000,'up');
 assert.equal(soundForMove(m),'blocked');
 assert.deepEqual(getFxPlan(m,1135).contacts.map(x=>x.moved),[false,false]);
 assert.equal(getFxPlan(m,1000+FX_DURATION).contacts.length,0);
 assert.equal(getFxPlan(m,1000+FX_DURATION).phase,null);
 const ctx=canvas();
 drawAxisImpulse(ctx,m,35,1150);drawContactEffects(ctx,m,35,1150);
 assert.ok(ctx.state.lines>0);
 assert.equal(ctx.state.arcs,0);
});
test('reduced motion removes all transient effects without changing game state',()=>{
 const m=describeMove(start,end,1000,'right');
 assert.equal(effectPhase(m,1050,true),null);
 assert.deepEqual(getFxPlan(m,1050,true).contacts,[]);
 const ctx=canvas();
 drawAxisImpulse(ctx,m,35,1050,true);drawContactEffects(ctx,m,35,1050,true);
 assert.deepEqual(ctx.state,{arcs:0,lines:0});
 assert.equal(contactDescriptor(m,0).x,start[0].x+.5);
 assert.equal(contactDescriptor(null,0),null);
 assert.equal(soundForMove(null),'press');
});
test('sound profiles have distinct timbres and bounded output duration',()=>{
 assert.ok(SOUND_PROFILE.press.duration<SOUND_PROFILE.move.duration);
 assert.ok(SOUND_PROFILE.blocked.hz<SOUND_PROFILE.move.hz);
 assert.notEqual(SOUND_PROFILE.win.type,SOUND_PROFILE.collision.type);
 for(const p of Object.values(SOUND_PROFILE)){
  assert.ok(p.duration<=.24&&p.duration>.02);
  assert.ok(p.gain<.04);
  assert.ok(p.noise<.04);
 }
 const move=describeMove([{x:1,y:1},{x:3,y:1}],[{x:2,y:1},{x:4,y:1}],1000,'right');
 assert.equal(soundForMove(move),'move');
});
test('sound stays fully inert when disabled or unsupported, and reuses one AudioContext',()=>{
 let created=0,oscillators=0,buffers=0,closed=0;
 const ramp=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node={connect(){return node}};
 class FakeAudio{
  constructor(){created++;this.currentTime=0;this.sampleRate=2000;this.destination={};this.state='running'}
  createOscillator(){oscillators++;return {type:'triangle',frequency:ramp(),connect(){return node},start(){},stop(){}}}
  createGain(){return {gain:ramp(),connect(){return node}}}
  createBiquadFilter(){return {frequency:{value:0},Q:{value:0},connect(){return node}}}
  createBuffer(_channels,length){buffers++;return {getChannelData(){return new Float32Array(length)}}}
  createBufferSource(){return {buffer:null,connect(){return node},start(){},stop(){}}}
  close(){closed++}
 }
 const player=createSoundPlayer(()=>FakeAudio);
 assert.equal(player.play('move',false),false);
 assert.equal(player.play('missing'),false);
 assert.equal(created,0);
 assert.equal(player.play('move'),true);
 assert.equal(player.play('blocked'),true);
 assert.equal(player.play('win'),true);
 assert.equal(created,1);assert.equal(buffers,1);assert.equal(oscillators,3);
 player.close();assert.equal(closed,1);
 const unavailable=createSoundPlayer(()=>null);
 assert.equal(unavailable.play('move'),false);
});
test('client integrates effects without changing authoritative rules or redrawing diorama per frame',async()=>{
 const src=await readFile(new URL('./app.js',import.meta.url),'utf8');
 assert.match(src,/soundForMove\(visual\)/);
 assert.match(src,/drawAxisImpulse\(ctx,visual,u,now,reduced\)/);
 assert.match(src,/drawContactEffects\(ctx,visual,u,now,reduced\)/);
 assert.match(src,/window.ResizeObserver/);
 assert.match(src,/function tick\(t\)\{if\(screen==='play'\)drawBoard\(t\)/);
 assert.doesNotMatch(src,/const osc=a\.createOscillator/);
});
