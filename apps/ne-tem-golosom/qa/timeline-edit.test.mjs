import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editClip,replaceSelectedRecording,MIN_CLIP_SECONDS,TimelineHistory,packTimeline,unpackTimeline} from '../timeline-model.js';

const audio=(name)=>new Blob([name],{type:'audio/webm'});
const clip=(id,start,end,offset=0,blob=audio(id))=>({id,start,end,offset,blob,owner:'solo'});
const lane=()=>[clip('a',2,8),clip('b',12,19),clip('c',28,36)];
const get=(xs,id)=>xs.find(x=>x.id===id);

test('moving voices preserves pitch, original sound offset and duration',()=>{
 const clips=lane(),edited=editClip(clips,'b','move',3,60);
 assert.equal(get(edited,'b').start,15);
 assert.equal(get(edited,'b').end,22);
 assert.equal(get(edited,'b').offset,0);
 assert.equal(get(edited,'b').blob,clips[1].blob);
 assert.equal(clips[1].start,12,'original not mutated');
});
test('clamps entire-clip drag at neighbors and film bounds',()=>{
 const clips=lane();
 assert.equal(get(editClip(clips,'b','move',-500,60),'b').start,8);
 assert.equal(get(editClip(clips,'b','move',500,60),'b').end,28);
 assert.equal(get(editClip(clips,'a','move',-500,60),'a').start,0);
 assert.equal(get(editClip(clips,'c','move',500,60),'c').end,60);
});
test('left trim grows audio offset and can later restore available audio',()=>{
 const clips=lane();
 const cut=editClip(clips,'b','left',2.4,60);
 assert.equal(get(cut,'b').start,14.4);
 assert.ok(Math.abs(get(cut,'b').offset-2.4)<1e-8);
 const revert=editClip(cut,'b','left',-3,60);
 assert.equal(get(revert,'b').start,12);
 assert.ok(Math.abs(get(revert,'b').offset)<1e-8);
});
test('left trim cannot overrun the current clip or previous recording',()=>{
 const clips=lane();
 const almost=editClip(clips,'b','left',100,60);
 assert.ok(Math.abs(get(almost,'b').end-get(almost,'b').start-MIN_CLIP_SECONDS)<1e-6);
 assert.equal(editClip(clips,'b','left',-2,60),null,'no undocumented source audio');
});
test('right trim never extends past source recording or the next voice',()=>{
 const clips=lane();
 const cut=editClip(clips,'b','right',-2,60);
 assert.equal(get(cut,'b').end,17);
 const regrow=editClip(cut,'b','right',2,60,7);
 assert.equal(get(regrow,'b').end,19);
 const expand=editClip(clips,'b','right',99,60,60);
 assert.equal(get(expand,'b').end,28);
 assert.equal(editClip(clips,'b','right',3,60),null,'unknown source duration cannot invent sound');
});
test('a targeted re-record replaces only its selected clip and leaves a gap if shorter',()=>{
 const clips=lane(),replacement=audio('take-two');
 const next=replaceSelectedRecording(clips,'b',replacement,3.6,'retake');
 assert.deepEqual(next.map(c=>[c.id,c.start,c.end]),[['a',2,8],['retake',12,15.6],['c',28,36]]);
 assert.equal(next[1].blob,replacement);
 assert.equal(next[0],clips[0]);
 assert.equal(next[2],clips[2]);
 assert.equal(replaceSelectedRecording(clips,'missing',replacement,3,'x'),null);
 assert.equal(replaceSelectedRecording(clips,'b',replacement,.01,'x'),null);
});
test('move/trim/retake are reversible and survive packed draft roundtrip',()=>{
 const clips=lane(),history=new TimelineHistory();
 const moved=editClip(clips,'b','move',1,60);history.remember(clips);
 const trimmed=editClip(moved,'b','left',1,60);history.remember(moved);
 const replaced=replaceSelectedRecording(trimmed,'b',audio('new'),2,'new');history.remember(trimmed);
 const packed=packTimeline(replaced,history,'new');
 const unpacked=unpackTimeline(structuredClone(packed),60);
 assert.equal(unpacked.selected,'new');
 assert.deepEqual(unpacked.history.undo(unpacked.clips).map(c=>c.id),['a','b','c']);
 assert.equal(unpacked.history.canRedo,true);
});
test('invalid input and zero-distance gestures create no history entry',()=>{
 const clips=lane();
 for(const kind of ['move','left','right']){
  assert.equal(editClip(clips,'b',kind,0,60),null);
 }
 assert.equal(editClip(clips,'unknown','move',1,60),null);
 assert.equal(editClip(clips,'b','bad',1,60),null);
 assert.equal(editClip(clips,'b','move',NaN,60),null);
});
