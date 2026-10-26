import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clipMix,envelopeGain,scheduleEnvelope} from '../clip-mix.js';
import {snapshotClips,packTimeline,unpackTimeline,TimelineHistory} from '../timeline-model.js';
import {voicePlan} from '../premiere-export.js';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));

test('manual fades preserve deliberate soft and loud delivery',()=>{
 const c={start:0,end:3,volume:1.75,fadeIn:.5,fadeOut:.75};
 assert.equal(envelopeGain(c,0),0);
 assert.equal(envelopeGain(c,.25),.875);
 assert.equal(envelopeGain(c,1),1.75);
 assert(Math.abs(envelopeGain(c,2.625)-.875)<1e-9);
 assert.equal(envelopeGain(c,3),0);
 assert.equal(clipMix({volume:6,fadeIn:-1,fadeOut:NaN}).volume,2);
});
test('offline/export gain schedule uses the same envelope and offsets',()=>{
 const events=[],gain={
  cancelScheduledValues:(x)=>events.push(['cancel',x]),
  setValueAtTime:(v,t)=>events.push(['set',v,t]),
  linearRampToValueAtTime:(v,t)=>events.push(['ramp',v,t])
 };
 const clip={start:10,end:14,volume:.55,fadeIn:.5,fadeOut:.5};
 scheduleEnvelope(gain,clip,20,0,4);
 assert(events.some(([action,v,t])=>action==='ramp'&&Math.abs(v-.55)<1e-9&&t===20.5));
 assert(events.some(([action,v,t])=>action==='ramp'&&v===0&&t===24));
});
test('mixer and original audio metadata survive draft roundtrip',()=>{
 const blob=new Blob(['encoded'],{type:'audio/webm'});
 const originals=[{id:'clip',start:1,end:2,offset:0,owner:'me',blob,fx:'robot',volume:.35,fadeIn:.3,fadeOut:.7}];
 const packed=packTimeline(originals,new TimelineHistory(),originals[0].id);
 const restored=unpackTimeline(packed,20);
 assert.equal(restored.clips[0].volume,.35);
 assert.equal(restored.clips[0].fadeIn,.3);
 assert.equal(restored.clips[0].fadeOut,.7);
 assert.equal(restored.clips[0].fx,'robot');
 assert.equal(voicePlan(restored.clips,20)[0].volume,.35);
 assert.equal(snapshotClips(restored.clips)[0].volume,.35);
});
test('persistent room rejects starting before configuration and isolates rounds',()=>{
 const host={id:'h',name:'Host'},guest={id:'g',name:'Guest'};
 const state=game.createRoom({player:host}).state;
 game.onJoin({state,players:[host,guest],player:guest});
 game.onMessage({state,player:host,payload:{type:'start'}});
 assert.equal(state.phase,'lobby');
 assert.equal(state.configured,false);
 const sc={id:'scene',title:'Scene',start:0,duration:30,roles:['Actor'],custom:false};
 game.onMessage({state,player:host,payload:{type:'scene',scene:sc}});
 assert.equal(state.configured,true);
 game.onMessage({state,player:host,payload:{type:'start'}});
 assert.equal(state.phase,'recording');
 game.onMessage({state,player:host,payload:{type:'ready',count:1}});
 game.onMessage({state,player:guest,payload:{type:'ready',count:1}});
 game.onMessage({state,player:host,payload:{type:'reveal'}});
 const previous=state.round;
 game.onMessage({state,player:host,payload:{type:'again'}});
 assert.equal(state.phase,'lobby');
 assert.equal(state.round,previous+1);
 assert.equal(state.scene.id,'scene');
 assert.equal(state.configured,true);
});
