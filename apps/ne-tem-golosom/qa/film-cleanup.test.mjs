import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FILM_MODES,estimateFilmTimes,lowMemoryRecommended,estimatePreparationTimes,validateFilmMode} from '../film-cleanup.js';
test('three film models are genuine independent choices',()=>{
 assert.deepEqual(FILM_MODES.map(x=>x.id),['umx','hybrid','scnet']);
 for(const m of FILM_MODES)assert.equal(validateFilmMode(m.id),m.id);
 assert.throws(()=>validateFilmMode('mrx'));
});
test('time estimates use measured comparative runtime without promising fixed results',()=>{
 const t=estimateFilmTimes(90);
 assert.equal(t.umx,5);
 assert.equal(t.scnet,150);
 assert(t.hybrid>t.umx&&t.hybrid<t.scnet);
 assert.equal(estimateFilmTimes(0).umx,0);
});
test('cleaned PCM really replaces source audio in exported video',()=>{
 const code=readFileSync(new URL('../media-lab.js',import.meta.url),'utf8');
 assert.match(code,/audioPCM\s*=\s*null/);
 assert.match(code,/audioSource\.connect\(destination\)/);
 assert.match(code,/audioSource\?\.start\(\)/);
 assert.match(code,/else if \(keepAudio\)/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/await cleanFilmSound\(/);
 assert.match(app,/audioPCM:plan\.channels/);
 assert.match(app,/videoExportBlob=result;filmPreparedBlob=result/);
 assert.match(app,/cleaned:!!cleaned/);
});
test('regional hybrid passes only selected original PCM, full SCNet passes whole scene',()=>{
 const code=readFileSync(new URL('../film-cleanup.js',import.meta.url),'utf8');
 assert.match(code,/const sc=await model\(original,'scnet'\)/);
 assert.match(code,/selectProblemSegments\(original,vocals,buzzLayer/);
 assert.match(code,/const sc=await model\(packed\.packed,'scnet'\)/);
 assert.match(code,/mixSelectivePatches\(clean,patches,1\)/);
});
test('three UI models default to UMX and display three relative estimates',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/name="film-clean-mode" value="umx" checked/);
 assert.match(html,/name="film-clean-mode" value="hybrid"/);
 assert.match(html,/name="film-clean-mode" value="scnet"/);
 for(const id of ['film-time-umx','film-time-hybrid','film-time-scnet','film-clean-cancel','film-low-memory','trim-edit-range','trim-sound-summary'])assert(html.includes('id="'+id+'"'));
});
test('multiplayer server module and deployed v4 snapshot are identical',()=>{
 const live=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
 const pin=readFileSync(new URL('../../../pocketnet/module-versions/ne-tem-golosom/v4.ts',import.meta.url),'utf8');
 assert.equal(live,pin);
 assert.match(live,/cleaned:x\.custom===true&&x\.cleaned===true/);
});

test('low-memory plan is chosen by observable device limits, not old desktop benchmark',()=>{
 assert(lowMemoryRecommended(4,8));
 assert(lowMemoryRecommended(8,2));
 assert(!lowMemoryRecommended(16,12));
 assert(!lowMemoryRecommended(undefined,undefined));
 const slow=estimatePreparationTimes(90,'umx');
 assert.equal(slow.neural,5);
 assert.equal(slow.encoding,90);
 assert.equal(slow.totalSlow,185);
});
test('fast MP4 AAC extraction avoids full video ArrayBuffer and video capture',()=>{
 const mp4=readFileSync(new URL('../mp4-audio.js',import.meta.url),'utf8');
 const code=readFileSync(new URL('../film-cleanup.js',import.meta.url),'utf8');
 assert.match(mp4,/export async function extractMp4AAC/);
 assert.match(mp4,/blob\.slice\(/);
 assert.match(mp4,/new AudioDecoder/);
 assert.doesNotMatch(mp4,/blob\.arrayBuffer\(\)/);
 assert.match(code,/await extractMp4AAC\(blob,start,duration/);
 assert.match(code,/if\(blob\.size<=32\*1048576\)/);
 assert.match(code,/transferInputs:true/);
 assert.match(code,/if\(lowMemory\)/);
 assert.match(code,/const cut=original\.map\(ch=>ch\.slice\(begin,end\)\)/);
 const dsp=readFileSync(new URL('../film-buzz-worker.js',import.meta.url),'utf8');
 assert.match(dsp,/const channels=keepOriginal\?diff:base/);
});

test('trim is mandatory before audio, with distinct neural, mute and original outcomes',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const type of ['neural','mute','original'])
  assert(html.includes('name="film-sound-choice" value="'+type+'"'));
 assert.match(app,/if\(scenePrepareStep==='trim'\)/);
 assert.match(app,/setScenePrepStep\('sound'\);return/);
 assert.match(app,/selectedSound\(\)==='neural'\?await prepareFilmScene\(\):await processMedia\(\)/);
 assert.match(app,/keepAudio:selectedSound\(\)==='original'/);
 assert.match(app,/const cleaned=selectedSound\(\)==='neural'/);
 assert.match(html,/id="film-cleaner" class="film-cleaner hidden"/);
});
