import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TimelineHistory,MAX_CLIPS,HISTORY_LIMIT,snapshotClips,spliceRecording,layerTimeline,editClip,packTimeline,unpackTimeline}
 from '../timeline-model.js';

const sound=(text='one')=>new Blob([text],{type:'audio/webm'});
const clip=(id,start,end,blob=sound(id),offset=0)=>({id,start,end,offset,owner:'solo',blob});

test('overlapping recordings coexist without trimming any neighbour or source offset',()=>{
 const a=clip('a',0,20),b=clip('b',30,60);
 let n=0;
 const next=spliceRecording([a,b],{id:'new',start:10,end:40,owner:'solo',blob:sound('new')},()=>String(++n));
 assert.deepEqual(next.map(c=>[c.id,c.start,c.end,c.offset]),[
  ['a',0,20,0],['new',10,40,0],['b',30,60,0]
 ]);
 assert.equal(next[0].blob,a.blob);
 assert.equal(next[2].blob,b.blob);
 assert.equal(layerTimeline(next).lanes,2);
 assert.notEqual(layerTimeline(next).assignments.get('a'),layerTimeline(next).assignments.get('new'));
});
test('parallel clips stay in distinct visible lanes and independent moves can overlap',()=>{
 const clips=[clip('first',0,10),clip('second',9,15),clip('third',15,25)];
 const layout=layerTimeline(clips);
 assert.equal(layout.lanes,2);
 assert.equal(layout.assignments.get('third'),layout.assignments.get('first'));
 const shifted=editClip(clips,'third','move',-9,30);
 assert(shifted.find(c=>c.id==='third').start<shifted.find(c=>c.id==='second').end);
 assert.equal(layerTimeline(shifted).lanes,3);
});
test('undo and redo are reversible and fresh edits invalidate redo',()=>{
 const h=new TimelineHistory(),a=[clip('a',0,5)],b=[clip('b',5,10)];
 h.remember(a);
 assert.deepEqual(h.undo(b).map(c=>c.id),['a']);
 assert.equal(h.canRedo,true);
 assert.deepEqual(h.redo(a).map(c=>c.id),['b']);
 assert.equal(h.canUndo,true);
 h.undo(b);
 h.remember(a);
 assert.equal(h.canRedo,false);
});
test('history is bounded and clips do not retain Audio/URL runtime objects',()=>{
 const h=new TimelineHistory(),a=clip('one',0,10);
 a.audio={pause(){}};a.url='blob:cached';
 for(let i=0;i<HISTORY_LIMIT+15;i++)h.remember([a]);
 assert.equal(h.past.length,HISTORY_LIMIT);
 assert.equal(h.past[0][0].audio,undefined);
 assert.equal(h.past[0][0].url,undefined);
});
test('full draft roundtrip persists selection, both history stacks, and deduplicates blobs',()=>{
 const a=clip('a',0,12),b=clip('b',14,23,a.blob),c=clip('c',24,30);
 const h=new TimelineHistory([[a],[a,b]],[[a,b,c]]);
 const packed=packTimeline([a,b],h,'b');
 assert.equal(packed.assets.length,2);
 const revived=unpackTimeline(structuredClone(packed),90);
 assert.deepEqual(revived.clips.map(x=>x.id),['a','b']);
 assert.equal(revived.selected,'b');
 assert.equal(revived.history.past.length,2);
 assert.equal(revived.history.future.length,1);
 assert.equal(revived.clips[0].blob,revived.clips[1].blob);
});
test('legacy drafts remain usable and no fabricated redo history is created',()=>{
 const old={clips:[clip('before',1,5)]};
 const revived=unpackTimeline(old,20);
 assert.equal(revived.clips.length,1);
 assert.equal(revived.history.canUndo,false);
 assert.equal(revived.history.canRedo,false);
});
test('invalid and duplicate IDs or missing audio assets do not enter live editor',()=>{
 const blob=sound(),valid=clip('ok',0,5,blob),invalid=clip('late',1,111,blob);
 const saved={version:2,assets:[blob],clips:[
  {...valid,asset:0},{...valid,asset:0},{...invalid,asset:0},
  {...clip('missing',6,8,blob),asset:99}
 ],past:[],future:[],selected:'missing'};
 const revived=unpackTimeline(saved,90);
 assert.deepEqual(revived.clips.map(c=>c.id),['ok']);
 assert.equal(revived.selected,null);
});
test('hard maximum prevents server-ready counts that exceed protocol limit',()=>{
 const many=Array.from({length:MAX_CLIPS},(_,i)=>clip('c'+i,i,i+.4));
 assert.throws(()=>spliceRecording(many,{id:'extra',start:90,end:91,blob:sound(),owner:'solo'},()=> 'split'));
});
test('editor consumes model and no longer reconstructs clip buttons on each tick',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(app,/function renderPlayhead\(/);
 assert.match(app,/if\(!record\)updateClipSound\(t,playing,false\);renderPlayhead\(\)/);
 assert.match(app,/packTimeline\(localClips,editHistory,selectedClip\)/);
 assert.match(app,/saveQueue=operation\.catch\(\(\)=>\{\}\)/);
 assert.match(app,/videoInMedia/);
 assert.match(html,/id="redo-btn"/);
 assert.match(html,/id="selected-clip-info"/);
 assert.match(html,/id="erase-btn"[^>]*disabled/);
});

test('undo snapshots and IndexedDB roundtrips retain selected non-destructive voice effect',()=>{
 const a={...clip('one',1,4),fx:'robot'};
 const h=new TimelineHistory([[a]]);
 const archive=packTimeline([a],h,'one'),restored=unpackTimeline(structuredClone(archive),10);
 assert.equal(restored.clips[0].fx,'robot');
 assert.equal(restored.history.past[0][0].fx,'robot');
 assert.equal(restored.selected,'one');
});
