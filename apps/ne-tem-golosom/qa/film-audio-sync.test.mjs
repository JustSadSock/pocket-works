import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFilmBedSync} from '../film-audio-sync.js';
import {editClip} from '../timeline-model.js';
function fixture(){
 const sources=[];
 const parameter=()=>({
  value:1,setValueAtTime(v){this.value=v},linearRampToValueAtTime(v){this.value=v},
  cancelScheduledValues(){},setTargetAtTime(v){this.value=v}
 });
 const context={
  currentTime:15,
  createBufferSource(){
   const source={
    playbackRate:parameter(),buffer:null,
    connect(){},disconnect(){},stop(t){this.stoppedAt=t},
    start(t,offset){this.startedAt=t;this.offset=offset}
   };
   sources.push(source);return source;
  },
  createGain(){return {gain:parameter(),connect(){},disconnect(){}}}
 };
 const video={currentTime:33.4,paused:false,seeking:false};
 const sync=createFilmBedSync({
  context,buffer:{duration:12},video,destination:{},sceneStart:33
 });
 return {context,video,sync,sources};
}
test('cleaned audio follows the video media time, not a one-off play timestamp',()=>{
 const f=fixture();
 assert.equal(f.sync.sync(),true);
 assert.ok(Math.abs(f.sources[0].offset-.4)<1e-9);
 f.context.currentTime+=1;
 f.video.currentTime+=1;
 f.sync.sync();
 assert.equal(f.sync.diagnostics().restarts,1,'normal playback does not recreate audio sources');
 assert.ok(Math.abs(f.sync.diagnostics().driftSeconds)<.005);
 f.context.currentTime+=.25;
 f.video.currentTime+=.65; // decoder skipped 0.4s: Web Audio must realign.
 f.sync.sync();
 assert.equal(f.sync.diagnostics().restarts,2);
 assert.ok(Math.abs(f.sources[1].offset-2.05)<.001);
 f.video.paused=true;
 assert.equal(f.sync.sync(),false);
 assert.equal(f.sync.diagnostics().active,false);
 f.video.currentTime+=3.2;
 f.context.currentTime+=3.2;
 f.video.paused=false;
 assert.equal(f.sync.sync(true),true);
 assert.equal(f.sync.diagnostics().restarts,3);
 assert.ok(Math.abs(f.sources[2].offset-5.25)<.001,'resume at actual media position');
 f.video.currentTime=45.1;
 assert.equal(f.sync.sync(),false,'past scene end never restarts bed');
 f.sync.dispose();
});
test('small media-clock drift is corrected by playback rate, not global clip shift',()=>{
 const f=fixture();
 f.sync.sync();
 f.context.currentTime+=.5;f.video.currentTime+=.54;
 f.sync.sync();
 assert.equal(f.sync.diagnostics().restarts,1);
 assert(f.sources[0].playbackRate.value>1);
 assert(f.sources[0].playbackRate.value<=1.03);
});
test('moving or trimming a voice only changes its clip, not the film bed origin',()=>{
 const f=fixture();
 const blob=new Blob(['voice']);
 const original=[{id:'a',start:1,end:3,offset:0,blob}];
 const moved=editClip(original,'a','move',1,12);
 const trimmed=editClip(moved,'a','left',.3,12);
 assert.equal(trimmed[0].offset,.3);
 assert.equal(f.video.currentTime,33.4);
 f.sync.sync();
 assert.ok(Math.abs(f.sources[0].offset-.4)<.001);
});
test('neural export uses the synchronizer for initial play, frames and tab resume',()=>{
 const src=readFileSync(new URL('../media-lab.js',import.meta.url),'utf8');
 assert.match(src,/import \{createFilmBedSync\}/);
 assert.match(src,/filmBedSync=createFilmBedSync\(\{context:audioContext,buffer,destination,video,sceneStart:start\}\)/);
 assert.match(src,/await video\.play\(\)/);
 assert.match(src,/recorder\.start\(1000\);\s*started=true;\s*filmBedSync\?\.sync\(true\)/);
 assert.match(src,/filmBedSync\?\.sync\(\)/);
 assert.match(src,/filmBedSync\?\.pause\(\)/);
 assert.match(src,/\['pause','waiting','stalled','seeking'\]/);
 assert.doesNotMatch(src,/audioSource\?\.start\(\)/);
});
