import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  voicePlan,voiceWindow,premiereMime,premiereFilename,
  supportsPremiereExport,MAX_PREMIERE_CLIPS
} from '../premiere-export.js';

const b=text=>new Blob([text],{type:'audio/webm'});
const clip=(id,start,end,offset=0,blob=b(id),owner='solo')=>({id,start,end,offset,blob,owner});

test('every actor contributes to one sorted timeline without losing overlaps',()=>{
 const xs=voicePlan([clip('host',4,6,.5),clip('guest',3,7,1.2),clip('host-2',0,1)],10);
 assert.deepEqual(xs.map(x=>[x.id,x.start,x.end,x.offset]),[
  ['host-2',0,1,0],['guest',3,7,1.2],['host',4,6,.5]
 ]);
 assert.equal(xs[1].owner,'solo');
});
test('trimming uses source offsets, never stretches a voice',()=>{
 const a=voiceWindow(clip('a',10,14,2),8);
 assert.deepEqual(a,{when:10,offset:2,length:4});
 const bWindow=voiceWindow(clip('b',10,14,2),5.9);
 assert.equal(bWindow.length,3.9);
 assert.throws(()=>voiceWindow(clip('c',10,14,2),4),/короче/);
});
test('invalid clips and unfinished scenes are rejected before recording',()=>{
 assert.throws(()=>voicePlan([],30),/голосовых/);
 assert.throws(()=>voicePlan([clip('a',0,1)],100),/длительность/);
 assert.throws(()=>voicePlan([clip('a',10,5)],30),/повреждена/);
 assert.throws(()=>voicePlan([clip('a',0,40)],30),/повреждена/);
 assert.throws(()=>voicePlan([clip('a',0,3,-1)],30),/повреждена/);
 assert.throws(()=>voicePlan(Array.from({length:MAX_PREMIERE_CLIPS+1},(_,i)=>clip('c'+i,0,1)),10),/Слишком много/);
});
test('container choice is based on actual browser support, not filename guesses',()=>{
 assert.equal(premiereMime(x=>x==='video/webm;codecs=vp8,opus'),'video/webm;codecs=vp8,opus');
 assert.equal(premiereMime(x=>x==='video/mp4'),'video/mp4');
 assert.equal(premiereMime(()=>false),'');
 assert.equal(premiereFilename('Мой дубль: сцена /01','video/mp4'),'Мой дубль сцена 01 — Не тем голосом.mp4');
 assert.equal(premiereFilename('','video/webm'),'Премьера — Не тем голосом.webm');
});
test('support detection does not crash outside a browser',()=>{
 assert.equal(supportsPremiereExport(),false);
});
test('export uses the same offsets as browser playback and never reads unfinished remote clips',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(app,/start:c\.start,end:c\.end,offset:c\.offset/);
 assert.match(app,/!hasAllPremiereTracks\(\)/);
 assert.match(app,/source:input,scene:sceneCopy,clips:audioClips/);
 assert.match(html,/id="premiere-export"/);
 assert.match(html,/id="premiere-export-download"/);
 assert.match(html,/id="premiere-film-audio" type="checkbox"/);
 assert.match(sw,/\.\/premiere-export\.js/);
});
